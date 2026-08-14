"""
Endpoints de Empresas Individuais
Para buscar, validar e enriquecer empresas específicas.
Todos os endpoints requerem autenticação.
"""
import re
from fastapi import APIRouter, HTTPException, Path, Query, Depends, Body, Request
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from api.company_intelligence_extras import (
    company_intelligence_extras_service,
    _fetch_company_context,
)
from api.db_pool import get_connection
from api.contact_intelligence import contact_intelligence_service
from api.contact_intelligence_queue import (
    get_contact_intelligence_status,
    queue_contact_intelligence,
)
from api.lead_registry import lead_registry_service
from api.mobile_intelligence import mobile_intelligence_service
from api.validation_service import (
    validar_cnpj,
    verificar_cnpj_receita,
    calcular_score_confiabilidade,
    consultar_brasilapi_cnpj_v2_async,
    empresa_api_payload_from_brasilapi_v2,
    company_context_from_brasilapi_v2,
    receita_resumo_from_brasilapi_payload,
)
from api.quality_service import QualityService, calcular_score_priorizacao
from api.enrichment_service import enrichment_service
from middleware.auth import require_auth

router = APIRouter(prefix="/empresas", tags=["Empresas"])


def _org_id(request: Request) -> str:
    return (request.headers.get("X-Org-Id") or "").strip() or "default"


class ContactIntelligenceRequest(BaseModel):
    probe_smtp: bool = False
    refresh: bool = False


class ContactIntelligenceBatchRequest(BaseModel):
    cnpjs: List[str]
    probe_smtp: bool = False
    refresh: bool = False


class ContactIntelligenceStatusBatchRequest(BaseModel):
    cnpjs: List[str]


class MobileWaterfallRequest(BaseModel):
    refresh: bool = False
    verify_whatsapp: bool = True


def _get_table_columns(conn: Any, table_name: str) -> set[str]:
    try:
        rows = conn.execute(f"PRAGMA table_info('{table_name}')").fetchall()
    except Exception:
        return set()

    columns: set[str] = set()
    for row in rows:
        if not row:
            continue
        if len(row) > 1 and row[1]:
            columns.add(str(row[1]).lower())
        elif row[0]:
            columns.add(str(row[0]).lower())
    return columns


def _build_enrichment_selects(conn: Any) -> tuple[str, str]:
    available_columns = _get_table_columns(conn, "empresas_enriquecidas")
    if not available_columns:
        join_clause = ""
    else:
        join_clause = """
                LEFT JOIN empresas_enriquecidas ew
                    ON ew.cnpj = e.CNPJ_COMPLETO
        """

    optional_fields = [
        ("site", "site"),
        ("email_enriquecido", "email_enriquecido"),
        ("telefone_enriquecido", "telefone_enriquecido"),
        ("whatsapp_publico", "whatsapp_publico"),
        ("whatsapp_enriquecido", "whatsapp_enriquecido"),
        ("enriquecimento_ia", "enriquecimento_ia"),
        ("updated_at", "enriquecimento_data"),
    ]
    selects = []
    for column_name, alias in optional_fields:
        if column_name in available_columns:
            selects.append(f"ew.{column_name} as {alias}")
        else:
            selects.append(f"NULL as {alias}")
    return ",\n                    ".join(selects), join_clause


def _contact_intelligence_status_payload(cnpj: str) -> Dict[str, Any]:
    intelligence = contact_intelligence_service.get_cached_company_intelligence(cnpj)
    status = get_contact_intelligence_status(cnpj) or {
        "cnpj": cnpj,
        "status": "idle",
        "cached": False,
        "queued": False,
        "error": None,
        "updated_at": None,
    }
    refresh_in_progress = bool(status.get("refresh")) and status.get("status") in {"queued", "running"}

    if intelligence and not refresh_in_progress:
        status = {
            **status,
            "status": "completed",
            "cached": True,
            "queued": False,
        }

    return {
        "cnpj": cnpj,
        "status": status.get("status") or "idle",
        "cached": bool(status.get("cached")),
        "queued": bool(status.get("queued")),
        "error": status.get("error"),
        "job_id": status.get("job_id"),
        "updated_at": status.get("updated_at"),
        "started_at": status.get("started_at"),
        "finished_at": status.get("finished_at"),
        "intelligence": None if refresh_in_progress else intelligence,
    }


@router.get("/{cnpj}/mobile-waterfall")
async def buscar_mobile_waterfall(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido or not cnpj_limpo:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    payload = mobile_intelligence_service.get_cached_mobile_waterfall(cnpj_limpo)
    return {
        "success": True,
        "cached": bool(payload),
        "mobile_waterfall": payload,
    }


@router.post("/{cnpj}/mobile-waterfall")
async def resolver_mobile_waterfall(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    body: MobileWaterfallRequest = Body(default_factory=MobileWaterfallRequest),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido or not cnpj_limpo:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    try:
        payload = await mobile_intelligence_service.resolve_company_mobile_waterfall(
            cnpj_limpo,
            refresh=body.refresh,
            verify_whatsapp=body.verify_whatsapp,
        )
        return {
            "success": True,
            "cached": False,
            "mobile_waterfall": payload,
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{cnpj}")
async def buscar_empresa(
    cnpj: str = Path(..., description="CNPJ da empresa (com ou sem formatação)"),
    incluir_enriquecimento: bool = Query(True, description="Incluir dados enriquecidos"),
    incluir_scores: bool = Query(True, description="Incluir scores de qualidade"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Busca empresa por CNPJ.
    
    **Exemplo:**
    ```
    GET /empresas/12345678000190
    ```
    
    Retorna dados completos da empresa incluindo:
    - Dados da Receita
    - Dados enriquecidos (se disponível)
    - Validações
    - Scores de qualidade
    """
    # Valida CNPJ
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ inválido")
    
    try:
        with get_connection(read_only=True) as conn:
            enrichment_selects, enrichment_join = _build_enrichment_selects(conn)
            # Busca empresa
            query = f"""
                SELECT
                    e.CNPJ_COMPLETO as cnpj,
                    e.RAZAO_SOCIAL as razao_social,
                    e.NOME_FANTASIA as nome_fantasia,
                    m.NOME_MUNICIPIO as cidade,
                    e.UF as uf,
                    e.CNAE_PRINCIPAL as cnae_principal,
                    e.SITUACAO_CADASTRAL as situacao_cadastral,
                    e.CAPITAL_SOCIAL as capital_social_str,
                    TRY_CAST(
                        REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE
                    ) as capital_social,
                    e.TELEFONE1 as telefone_receita,
                    e.EMAIL as email_receita,
                    {enrichment_selects}
                FROM cnpj_empresas e
                LEFT JOIN municipios m
                    ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
                {enrichment_join}
                WHERE e.CNPJ_COMPLETO = ?
                LIMIT 1
            """
            
            row = conn.execute(query, [cnpj_limpo]).fetchone()

            if not row:
                ba = await consultar_brasilapi_cnpj_v2_async(cnpj_limpo)
                if not ba:
                    raise HTTPException(
                        status_code=404,
                        detail="Empresa não encontrada na base local nem na BrasilAPI.",
                    )
                empresa = empresa_api_payload_from_brasilapi_v2(ba, cnpj_limpo)
                empresa["validacao"] = {
                    "cnpj_valido": cnpj_valido,
                    "cnpj_limpo": cnpj_limpo,
                    "receita": receita_resumo_from_brasilapi_payload(ba),
                }
                if incluir_scores:
                    confiabilidade = calcular_score_confiabilidade(
                        email=empresa.get("email_final"),
                        telefone=empresa.get("telefone_final"),
                        whatsapp=empresa.get("whatsapp_final"),
                        cnpj=cnpj_limpo,
                        fonte_dados="receita",
                    )
                    empresa["confiabilidade"] = confiabilidade
                    qualidade = QualityService.calcular_qualidade_completa(empresa)
                    empresa["qualidade"] = {
                        "completude": qualidade.completude,
                        "precisao": qualidade.precisao,
                        "atualidade": qualidade.atualidade,
                        "consistencia": qualidade.consistencia,
                        "score_total": qualidade.score_total,
                    }
                    priorizacao = calcular_score_priorizacao(empresa)
                    empresa["priorizacao"] = priorizacao
                return {"success": True, "empresa": empresa}

            # Monta resposta
            empresa = {
                "cnpj": str(row[0]),
                "razao_social": str(row[1]) if row[1] else None,
                "nome_fantasia": str(row[2]) if row[2] else None,
                "cidade": str(row[3]) if row[3] else None,
                "uf": str(row[4]) if row[4] else None,
                "cnae_principal": str(row[5]) if row[5] else None,
                "situacao_cadastral": str(row[6]) if row[6] else None,
                "capital_social": float(row[8]) if row[8] else None,
                "telefone_receita": str(row[9]) if row[9] else None,
                "email_receita": str(row[10]) if row[10] else None,
                "site": str(row[11]) if row[11] else None,
                "email_enriquecido": str(row[12]) if row[12] else None,
                "telefone_enriquecido": str(row[13]) if row[13] else None,
                "whatsapp_publico": str(row[14]) if row[14] else None,
                "whatsapp_enriquecido": str(row[15]) if row[15] else None,
                "enriquecimento_ia": row[16] if row[16] else None,
                "enriquecimento_data": str(row[17]) if row[17] else None
            }
            
            # Contatos finais (fallback)
            empresa["email_final"] = empresa.get("email_enriquecido") or empresa.get("email_receita")
            empresa["telefone_final"] = empresa.get("telefone_enriquecido") or empresa.get("telefone_receita")
            empresa["whatsapp_final"] = empresa.get("whatsapp_enriquecido") or empresa.get("whatsapp_publico")
            
            # Validações
            empresa["validacao"] = {
                "cnpj_valido": cnpj_valido,
                "cnpj_limpo": cnpj_limpo
            }
            
            # Verifica na Receita se solicitado
            if incluir_enriquecimento:
                receita_info = verificar_cnpj_receita(cnpj_limpo)
                empresa["validacao"]["receita"] = receita_info
            
            # Scores se solicitado
            if incluir_scores:
                confiabilidade = calcular_score_confiabilidade(
                    email=empresa.get("email_final"),
                    telefone=empresa.get("telefone_final"),
                    whatsapp=empresa.get("whatsapp_final"),
                    cnpj=cnpj_limpo,
                    fonte_dados="enriquecido" if empresa.get("site") else "receita"
                )
                empresa["confiabilidade"] = confiabilidade
                
                qualidade = QualityService.calcular_qualidade_completa(empresa)
                empresa["qualidade"] = {
                    "completude": qualidade.completude,
                    "precisao": qualidade.precisao,
                    "atualidade": qualidade.atualidade,
                    "consistencia": qualidade.consistencia,
                    "score_total": qualidade.score_total
                }
                
                priorizacao = calcular_score_priorizacao(empresa)
                empresa["priorizacao"] = priorizacao
            
            return {
                "success": True,
                "empresa": empresa
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cnpj}/similar-companies")
async def buscar_empresas_parecidas(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    limit: int = Query(12, ge=1, le=25, description="Quantidade maxima de empresas parecidas"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    try:
        ctx = _fetch_company_context(cnpj_limpo)
        if not ctx:
            ba = await consultar_brasilapi_cnpj_v2_async(cnpj_limpo)
            if ba:
                ctx = company_context_from_brasilapi_v2(ba, cnpj_limpo)
        if not ctx:
            return {
                "success": True,
                "cnpj": cnpj_limpo,
                "items": [],
                "total": 0,
                "note": "Sem cadastro local nem BrasilAPI; nao foi possivel buscar similares por CNAE.",
            }
        similares = company_intelligence_extras_service.find_similar_companies(
            cnpj_limpo, limit=limit, company_context=ctx
        )
        return {
            "success": True,
            "cnpj": cnpj_limpo,
            "items": similares,
            "total": len(similares),
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{cnpj}/external-signals")
async def buscar_sinais_externos_empresa(
    request: Request,
    cnpj: str = Path(..., description="CNPJ da empresa"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    try:
        ctx = _fetch_company_context(cnpj_limpo)
        if not ctx:
            ba = await consultar_brasilapi_cnpj_v2_async(cnpj_limpo)
            if ba:
                ctx = company_context_from_brasilapi_v2(ba, cnpj_limpo)
        if not ctx:
            return {
                "success": True,
                "cnpj": cnpj_limpo,
                "signals": [],
                "total": 0,
            }
        signals = await company_intelligence_extras_service.fetch_external_signals(
            cnpj_limpo, company=ctx
        )
        persisted = lead_registry_service.record_company_signals(_org_id(request), cnpj_limpo, signals)
        return {
            "success": True,
            "cnpj": cnpj_limpo,
            "signals": persisted if persisted else signals,
            "total": len(persisted if persisted else signals),
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{cnpj}/enriquecer")
async def enriquecer_empresa(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Força enriquecimento de uma empresa específica.
    
    Útil para webhooks e automações (n8n, Kommo).
    
    **Exemplo:**
    ```
    POST /empresas/12345678000190/enriquecer
    ```
    """
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ inválido")
    
    try:
        # Busca dados básicos
        with get_connection(read_only=True) as conn:
            row = conn.execute(
                """
                SELECT
                    e.CNPJ_COMPLETO,
                    e.RAZAO_SOCIAL,
                    e.NOME_FANTASIA,
                    m.NOME_MUNICIPIO,
                    e.UF,
                    e.CNAE_PRINCIPAL
                FROM cnpj_empresas e
                LEFT JOIN municipios m
                    ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
                WHERE e.CNPJ_COMPLETO = ?
                LIMIT 1
                """,
                [cnpj_limpo]
            ).fetchone()
        
        if not row:
            ba = await consultar_brasilapi_cnpj_v2_async(cnpj_limpo)
            if not ba:
                raise HTTPException(
                    status_code=404,
                    detail="Empresa não encontrada na base local nem na BrasilAPI.",
                )
            ctx = company_context_from_brasilapi_v2(ba, cnpj_limpo)
            resultado = await enrichment_service.enrich_company_complete(
                cnpj=cnpj_limpo,
                razao_social=str(ctx.get("razao_social") or ""),
                nome_fantasia=ctx.get("nome_fantasia"),
                cidade=ctx.get("cidade"),
                uf=ctx.get("uf"),
                cnae=str(ctx.get("cnae_principal") or "") or None,
            )
            return {
                "success": True,
                "cnpj": cnpj_limpo,
                "enriquecimento": resultado,
                "message": "Enriquecimento via cadastro BrasilAPI + pipelines Hermes (empresa fora da base local).",
                "cadastro_fonte": "brasilapi_v2",
            }

        # Enriquece
        resultado = await enrichment_service.enrich_company_complete(
            cnpj=str(row[0]),
            razao_social=str(row[1] or ""),
            nome_fantasia=str(row[2]) if row[2] else None,
            cidade=str(row[3]) if row[3] else None,
            uf=str(row[4]) if row[4] else None,
            cnae=str(row[5]) if row[5] else None
        )
        
        return {
            "success": True,
            "cnpj": cnpj_limpo,
            "enriquecimento": resultado,
            "message": "Enriquecimento iniciado. Dados serão salvos em background."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/contact-intelligence/batch")
async def resolver_contact_intelligence_batch(
    payload: ContactIntelligenceBatchRequest = Body(...),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    requested = payload.cnpjs or []
    if not requested:
        raise HTTPException(status_code=400, detail="Informe ao menos um CNPJ")
    if len(requested) > 50:
        raise HTTPException(status_code=400, detail="Lote maximo de 50 CNPJs por vez")

    items: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for raw_cnpj in requested:
        cnpj_valido, cnpj_limpo = validar_cnpj(raw_cnpj)
        cnpj_retorno = cnpj_limpo or str(raw_cnpj or "")

        if not cnpj_valido or not cnpj_limpo:
            items.append(
                {
                    "cnpj": cnpj_retorno,
                    "cached": False,
                    "intelligence": None,
                    "error": "CNPJ invalido",
                }
            )
            continue

        if cnpj_limpo in seen:
            continue
        seen.add(cnpj_limpo)

        try:
            if not payload.refresh:
                cached = contact_intelligence_service.get_cached_company_intelligence(cnpj_limpo)
                if cached:
                    items.append(
                        {
                            "cnpj": cnpj_limpo,
                            "cached": True,
                            "intelligence": cached,
                            "error": None,
                        }
                    )
                    continue

            intelligence = await contact_intelligence_service.resolve_company_intelligence(
                cnpj_limpo,
                probe_smtp=payload.probe_smtp,
            )
            items.append(
                {
                    "cnpj": cnpj_limpo,
                    "cached": False,
                    "intelligence": intelligence,
                    "error": None,
                }
            )
        except LookupError:
            items.append(
                {
                    "cnpj": cnpj_limpo,
                    "cached": False,
                    "intelligence": None,
                    "error": "Empresa nao encontrada",
                }
            )
        except Exception as exc:
            items.append(
                {
                    "cnpj": cnpj_limpo,
                    "cached": False,
                    "intelligence": None,
                    "error": str(exc),
                }
            )

    return {
        "success": True,
        "total": len(items),
        "items": items,
    }


@router.post("/contact-intelligence/batch/queue")
async def enfileirar_contact_intelligence_batch(
    payload: ContactIntelligenceBatchRequest = Body(...),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    requested = payload.cnpjs or []
    if not requested:
        raise HTTPException(status_code=400, detail="Informe ao menos um CNPJ")
    if len(requested) > 50:
        raise HTTPException(status_code=400, detail="Lote maximo de 50 CNPJs por vez")

    items: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for raw_cnpj in requested:
        cnpj_valido, cnpj_limpo = validar_cnpj(raw_cnpj)
        cnpj_retorno = cnpj_limpo or str(raw_cnpj or "")

        if not cnpj_valido or not cnpj_limpo:
            items.append(
                {
                    "cnpj": cnpj_retorno,
                    "cached": False,
                    "queued": False,
                    "status": "error",
                    "intelligence": None,
                    "error": "CNPJ invalido",
                }
            )
            continue

        if cnpj_limpo in seen:
            continue
        seen.add(cnpj_limpo)

        try:
            status = queue_contact_intelligence(
                cnpj_limpo,
                probe_smtp=payload.probe_smtp,
                refresh=payload.refresh,
            )
            items.append(
                {
                    "cnpj": cnpj_limpo,
                    "cached": bool(status.get("cached")),
                    "queued": bool(status.get("queued")),
                    "status": status.get("status") or "idle",
                    "intelligence": status.get("intelligence"),
                    "error": status.get("error"),
                }
            )
        except Exception as exc:
            items.append(
                {
                    "cnpj": cnpj_limpo,
                    "cached": False,
                    "queued": False,
                    "status": "error",
                    "intelligence": None,
                    "error": str(exc),
                }
            )

    return {
        "success": True,
        "total": len(items),
        "items": items,
    }


@router.post("/contact-intelligence/batch/status")
async def buscar_contact_intelligence_batch_status(
    payload: ContactIntelligenceStatusBatchRequest = Body(...),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    requested = payload.cnpjs or []
    if not requested:
        raise HTTPException(status_code=400, detail="Informe ao menos um CNPJ")
    if len(requested) > 50:
        raise HTTPException(status_code=400, detail="Lote maximo de 50 CNPJs por vez")

    items: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for raw_cnpj in requested:
        cnpj_valido, cnpj_limpo = validar_cnpj(raw_cnpj)
        cnpj_retorno = cnpj_limpo or str(raw_cnpj or "")

        if not cnpj_valido or not cnpj_limpo:
            items.append(
                {
                    "cnpj": cnpj_retorno,
                    "cached": False,
                    "queued": False,
                    "status": "error",
                    "intelligence": None,
                    "error": "CNPJ invalido",
                }
            )
            continue

        if cnpj_limpo in seen:
            continue
        seen.add(cnpj_limpo)
        items.append(_contact_intelligence_status_payload(cnpj_limpo))

    return {
        "success": True,
        "total": len(items),
        "items": items,
    }


@router.get("/{cnpj}/contact-intelligence")
async def buscar_contact_intelligence(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    try:
        intelligence = contact_intelligence_service.get_cached_company_intelligence(cnpj_limpo)
        return {
            "success": True,
            "cached": bool(intelligence),
            "intelligence": intelligence,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cnpj}/contact-intelligence/status")
async def buscar_contact_intelligence_status(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    try:
        status = _contact_intelligence_status_payload(cnpj_limpo)
        return {
            "success": True,
            **status,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cnpj}/contact-intelligence/queue")
async def enfileirar_contact_intelligence(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    payload: ContactIntelligenceRequest = Body(default=ContactIntelligenceRequest()),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    try:
        status = queue_contact_intelligence(
            cnpj_limpo,
            probe_smtp=payload.probe_smtp,
            refresh=payload.refresh,
        )
        return {
            "success": True,
            **status,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cnpj}/contact-intelligence")
async def resolver_contact_intelligence(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    payload: ContactIntelligenceRequest = Body(default=ContactIntelligenceRequest()),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    try:
        intelligence = await contact_intelligence_service.resolve_company_intelligence(
            cnpj_limpo,
            probe_smtp=payload.probe_smtp,
        )
        return {
            "success": True,
            "cached": False,
            "intelligence": intelligence,
        }
    except LookupError:
        raise HTTPException(status_code=404, detail="Empresa nao encontrada")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════
#  DOSSIE HERMES — /empresas/{cnpj}/dossie
#  Agrega Receita (waterfall OpenCNPJ/BrasilAPI/cnpj.ws), filiais da
#  base local (mesma raiz de CNPJ) e site oficial assertivo
#  (RDAP/CNPJ) com contatos extraidos. Recriacao do endpoint perdido
#  no commit 8c6811e2 (abr/2026), contrato do front preservado.
# ══════════════════════════════════════════════════════════════════

_dossie_cache: Dict[str, Dict[str, Any]] = {}
_DOSSIE_CACHE_TTL = 30 * 60  # 30 min
_DOSSIE_CACHE_MAX = 500


def _dossie_cnae(codigo: Any, descricao: Any) -> Dict[str, Any]:
    sub = str(codigo or "").strip() or None
    return {
        "subclasse": sub,
        "id": sub,
        "descricao": (str(descricao or "").strip() or None),
        "secao": None,
        "divisao": None,
        "grupo": None,
        "classe": None,
    }


def _dossie_filiais_from_db(cnpj_raiz: str, cnpj_self: str) -> List[Dict[str, Any]]:
    try:
        with get_connection(read_only=True) as conn:
            rows = conn.execute(
                """
                SELECT e.CNPJ_COMPLETO, e.SITUACAO_CADASTRAL, e.UF,
                       m.NOME_MUNICIPIO, e.TELEFONE1, e.EMAIL, e.CNAE_PRINCIPAL
                FROM cnpj_empresas e
                LEFT JOIN municipios m ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
                WHERE SUBSTR(e.CNPJ_COMPLETO, 1, 8) = ?
                ORDER BY e.CNPJ_COMPLETO
                LIMIT 100
                """,
                [cnpj_raiz],
            ).fetchall()
    except Exception:
        return []

    filiais: List[Dict[str, Any]] = []
    for row in rows:
        cnpj_filial = str(row[0] or "")
        filiais.append(
            {
                "cnpj": cnpj_filial,
                "tipo": "matriz" if cnpj_filial[8:12] == "0001" else "filial",
                "situacao": str(row[1] or "") or None,
                "data_inicio": None,
                "data_situacao": None,
                "uf": str(row[2] or "") or None,
                "cidade": str(row[3] or "") or None,
                "logradouro": None,
                "bairro": None,
                "cep": None,
                "telefone": str(row[4] or "") or None,
                "email": str(row[5] or "") or None,
                "atividade_principal": str(row[6] or "") or None,
                "is_self": cnpj_filial == cnpj_self,
            }
        )
    return filiais


@router.get("/{cnpj}/dossie")
async def dossie_empresa(
    cnpj: str = Path(..., description="CNPJ da empresa (com ou sem formatação)"),
    descobrir_filiais: bool = Query(True, description="Consultar filiais da mesma raiz na base local"),
    refresh: bool = Query(False, description="Ignora cache e reconsulta as fontes"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """Dossiê consolidado da empresa: Receita, QSA, filiais e site oficial assertivo."""
    import time as _time

    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ inválido")

    cache_key = f"{cnpj_limpo}:{descobrir_filiais}"
    if not refresh:
        em_cache = _dossie_cache.get(cache_key)
        if em_cache and (_time.time() - em_cache["ts"]) < _DOSSIE_CACHE_TTL:
            return {"success": True, "dossie": em_cache["dossie"]}

    from enrichment_opencnpj import _fetch_cnpj_raw
    from core_scraper import (
        _buscar_melhor_site_oficial,
        extrair_contatos_site,
    )

    raw = await _fetch_cnpj_raw(cnpj_limpo) or {}
    encontrado = bool(raw)

    razao_social = (raw.get("razao_social") or "").strip() or None
    nome_fantasia = (raw.get("nome_fantasia") or "").strip() or None
    email_receita = (raw.get("email") or "").strip().lower() or None
    municipio = (raw.get("municipio") or "").strip() or None
    uf = (raw.get("uf") or "").strip() or None

    telefone1 = None
    telefone2 = None
    telefones_raw = raw.get("telefones") or []
    if telefones_raw:
        def _fmt_tel(t: Dict[str, Any]) -> Optional[str]:
            ddd = str(t.get("ddd") or "").strip()
            num = str(t.get("numero") or "").strip()
            return f"({ddd}) {num}" if ddd and num else (num or None)
        telefone1 = _fmt_tel(telefones_raw[0])
        if len(telefones_raw) > 1:
            telefone2 = _fmt_tel(telefones_raw[1])
    else:
        ddd1 = str(raw.get("ddd_telefone_1") or "").strip()
        if ddd1:
            telefone1 = ddd1

    socios = [
        {
            "nome": ((s.get("nome_socio") or "").strip().title() or None),
            "tipo": ((s.get("identificador_de_socio") and str(s.get("identificador_de_socio"))) or None),
            "cpf_cnpj": ((s.get("cnpj_cpf_do_socio") or "").strip() or None),
            "qualificacao": ((s.get("qualificacao_socio") or {}).get("descricao") if isinstance(s.get("qualificacao_socio"), dict) else (s.get("qualificacao_socio") or None)),
            "data_entrada": s.get("data_entrada_sociedade"),
            "faixa_etaria": s.get("faixa_etaria"),
            "representante": ((s.get("nome_representante_legal") or "").strip() or None),
            "cpf_representante": ((s.get("cpf_representante_legal") or "").strip() or None),
            "qualificacao_representante": s.get("qualificacao_representante_legal"),
            "pais": s.get("pais"),
        }
        for s in (raw.get("qsa") or [])
    ]

    cnaes_secundarias = [
        _dossie_cnae(c.get("codigo"), c.get("descricao"))
        for c in (raw.get("cnaes_secundarios") or [])
        if c.get("codigo")
    ]

    filiais: List[Dict[str, Any]] = []
    if descobrir_filiais:
        filiais = _dossie_filiais_from_db(cnpj_limpo[:8], cnpj_limpo)

    # ── Site oficial assertivo (email Receita → RDAP → CNPJ na pagina) ──
    site_oficial: Optional[Dict[str, Any]] = None
    try:
        busca = await _buscar_melhor_site_oficial(
            nome_fantasia or razao_social or "",
            municipio or "",
            cnpj=cnpj_limpo,
            email_receita=email_receita or "",
        )
        match = busca.get("melhor_match")
        if match and match.get("link"):
            contatos_site = None
            try:
                extraidos = await extrair_contatos_site(match["link"], modo_rapido=True)
                contatos_site = {
                    "emails": [e for e in [extraidos.get("email")] if e],
                    "telefones": [t for t in [extraidos.get("telefone")] if t],
                    "whatsapps": [w for w in [extraidos.get("whatsapp")] if w],
                    "redes_sociais": {
                        k: v
                        for k, v in {
                            "linkedin": extraidos.get("linkedin_empresa"),
                        }.items()
                        if v
                    },
                }
            except Exception:
                pass
            site_oficial = {
                "url": match["link"],
                "confianca": match.get("_confianca_site"),
                "contatos_extraidos": contatos_site,
            }
    except Exception:
        site_oficial = None

    dossie: Dict[str, Any] = {
        "encontrado": encontrado,
        "fonte": "brasilapi/opencnpj",
        "cnpj": cnpj_limpo,
        "cnpj_raiz": cnpj_limpo[:8],
        "razao_social": razao_social,
        "nome_fantasia": nome_fantasia,
        "tipo": ((raw.get("descricao_identificador_matriz_filial") or "").strip().lower() or None),
        "capital_social": raw.get("capital_social"),
        "porte": ((raw.get("porte") or {}).get("descricao") if isinstance(raw.get("porte"), dict) else (raw.get("porte") or None)),
        "natureza_juridica": ((raw.get("natureza_juridica") or "").strip() or None),
        "qualificacao_responsavel": ((raw.get("qualificacao_do_responsavel") and str(raw.get("qualificacao_do_responsavel"))) or None),
        "situacao_cadastral": ((raw.get("descricao_situacao_cadastral") or "").strip() or None),
        "data_situacao_cadastral": raw.get("data_situacao_cadastral"),
        "data_inicio_atividade": raw.get("data_inicio_atividade"),
        "atualizado_em": raw.get("data_situacao_cadastral") or raw.get("data_inicio_atividade"),
        "endereco": {
            "tipo_logradouro": ((raw.get("descricao_tipo_de_logradouro") or "").strip() or None),
            "logradouro": ((raw.get("logradouro") or "").strip() or None),
            "numero": ((raw.get("numero") or "").strip() or None),
            "complemento": ((raw.get("complemento") or "").strip() or None),
            "bairro": ((raw.get("bairro") or "").strip() or None),
            "cep": (re.sub(r"[^\d]", "", str(raw.get("cep") or "")) or None),
            "cidade": municipio,
            "uf": uf,
            "ibge": raw.get("codigo_municipio_ibge"),
        },
        "contatos_receita": {
            "telefone1": telefone1,
            "telefone2": telefone2,
            "fax": ((raw.get("ddd_fax") or "").strip() or None),
            "email": email_receita,
        },
        "cnae_principal": _dossie_cnae(raw.get("cnae_fiscal"), raw.get("cnae_fiscal_descricao")),
        "cnaes_secundarias": cnaes_secundarias,
        "inscricoes_estaduais": [
            {
                "uf": (ie.get("uf") if isinstance(ie, dict) else None),
                "ie": (ie.get("inscricao_estadual") if isinstance(ie, dict) else None),
                "ativa": bool(ie.get("ativo", True)) if isinstance(ie, dict) else True,
                "atualizado_em": (ie.get("data_atualizacao") if isinstance(ie, dict) else None),
            }
            for ie in (raw.get("inscricoes_estaduais") or [])
        ],
        "socios": socios,
        "filiais": filiais,
        "site_oficial": site_oficial,
        "fontes_consultadas": {
            "receita_waterfall": encontrado,
            "base_local_filiais": bool(filiais),
            "site_oficial_assertivo": bool(site_oficial),
        },
    }

    if len(_dossie_cache) >= _DOSSIE_CACHE_MAX:
        _dossie_cache.clear()
    _dossie_cache[cache_key] = {"ts": _time.time(), "dossie": dossie}

    return {"success": True, "dossie": dossie}
