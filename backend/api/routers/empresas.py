"""
Endpoints de Empresas Individuais
Para buscar, validar e enriquecer empresas específicas.
Todos os endpoints requerem autenticação.
"""
from fastapi import APIRouter, HTTPException, Path, Query, Depends, Body
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from api.db_pool import get_connection
from api.contact_intelligence import contact_intelligence_service
from api.contact_intelligence_queue import (
    get_contact_intelligence_status,
    queue_contact_intelligence,
)
from api.validation_service import validar_cnpj, verificar_cnpj_receita, calcular_score_confiabilidade
from api.quality_service import QualityService, calcular_score_priorizacao
from api.enrichment_service import enrichment_service
from middleware.auth import require_auth

router = APIRouter(prefix="/empresas", tags=["Empresas"])


class ContactIntelligenceRequest(BaseModel):
    probe_smtp: bool = False
    refresh: bool = False


class ContactIntelligenceBatchRequest(BaseModel):
    cnpjs: List[str]
    probe_smtp: bool = False
    refresh: bool = False


class ContactIntelligenceStatusBatchRequest(BaseModel):
    cnpjs: List[str]


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

    if intelligence and not (
        bool(status.get("refresh")) and status.get("status") in {"queued", "running"}
    ):
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
        "intelligence": intelligence,
    }


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
                raise HTTPException(status_code=404, detail="Empresa não encontrada")
            
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
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
        
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
