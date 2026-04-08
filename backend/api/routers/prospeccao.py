"""
Endpoints de Prospecção
Otimizados para integração com n8n, Kommo, etc.
Todos os endpoints requerem autenticação.
"""
from fastapi import APIRouter, HTTPException, Query, Body, Depends, Request
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from middleware.auth import require_auth
from api.query_translator import query_translator_service

try:
    from api.prospeccao_service import rodar_prospeccao_otimizada
    USE_OTIMIZADA = True
except ImportError:
    from api.main import rodar_prospeccao_icp
    USE_OTIMIZADA = False

try:
    from api.quality_service import calcular_score_priorizacao
except ImportError:
    def calcular_score_priorizacao(empresa):
        return {"score_total": 0.5}

try:
    from api.validation_service import calcular_score_confiabilidade
except ImportError:
    def calcular_score_confiabilidade(**kwargs):
        return {"score_total": 0.5}

router = APIRouter(prefix="/prospeccao", tags=["Prospecção"])


def _org_id(request: Request) -> str:
    return (request.headers.get("X-Org-Id") or "").strip() or "default"


class ProspeccaoRequest(BaseModel):
    """Request padronizado para prospecção"""
    termo: Optional[str] = Field(None, description="Termo de busca (nome/razão social)")
    uf: Optional[str] = Field(None, description="UF (ex: SP, RJ)")
    municipio: Optional[str] = Field(None, description="Município único (compat)")
    municipios: Optional[List[str]] = Field(None, description="Lista de municípios (multi-cidade)")
    capital_minima: Optional[float] = Field(None, ge=0, description="Capital social mínimo")
    capital_maxima: Optional[float] = Field(None, ge=0, description="Capital social máximo")
    cnaes: Optional[List[str]] = Field(None, description="Lista de CNAEs")
    segmentos: Optional[List[str]] = Field(None, description="Lista de segmentos")
    portes: Optional[List[str]] = Field(None, description="Lista de portes (ME, EPP, Médio, Grande)")
    limite: int = Field(500, ge=1, le=2000, description="Limite de resultados (máx 2000)")
    enriquecer_background: bool = Field(True, description="Enriquecer em background")
    priorizar_contato: bool = Field(True, description="Priorizar empresas com contato disponível")
    incluir_score: bool = Field(True, description="Incluir scores de qualidade e priorização")
    formato: str = Field("padrao", description="Formato de resposta: padrao, kommo, n8n")


class ProspeccaoResponse(BaseModel):
    """Response padronizado"""
    success: bool
    total: int
    empresas: List[Dict[str, Any]]
    metadata: Dict[str, Any]


class QueryTranslateRequest(BaseModel):
    query: str = Field(..., min_length=3, description="Texto livre da prospeccao")
    defaults: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Config atual para preservar campos nao mencionados",
    )


@router.post("", response_model=ProspeccaoResponse)
async def prospeccao(
    http_request: Request,
    request: ProspeccaoRequest = Body(...),
    _user: dict = Depends(require_auth),
) -> ProspeccaoResponse:
    """
    Endpoint principal de prospecção.
    
    Otimizado para integrações:
    - n8n: Use formato "n8n" para resposta simplificada
    - Kommo: Use formato "kommo" para formato compatível com CRM
    - Dashboard: Use formato "padrao" para dados completos
    
    **Exemplo para n8n:**
    ```json
    {
        "termo": "hospital",
        "uf": "SP",
        "limite": 50,
        "formato": "n8n"
    }
    ```
    """
    try:
        filtros_aplicados: Dict[str, Any] = {}
        org_id = (http_request.headers.get("X-Org-Id") or "").strip() or None

        if USE_OTIMIZADA:
            # Anti-repetição: exclui CNPJs já retornados para esta org
            seen_cnpjs: List[str] = []
            if org_id:
                try:
                    from redis import Redis
                    from config import settings as _cfg
                    _r = Redis.from_url(_cfg.REDIS_URL, socket_connect_timeout=2)
                    _members = _r.smembers(f"hermes:seen_cnpjs:{org_id}")
                    seen_cnpjs = [m.decode() if isinstance(m, bytes) else m for m in _members]
                except Exception:
                    pass

            resultado = rodar_prospeccao_otimizada(
                termo=request.termo,
                uf=request.uf,
                municipio=request.municipio,
                municipios=request.municipios,
                capital_minima=request.capital_minima,
                capital_maxima=request.capital_maxima,
                cnaes=request.cnaes,
                segmentos=request.segmentos,
                portes=request.portes,
                limite=request.limite,
                                enriquecer_background=request.enriquecer_background,
                priorizar_contato=request.priorizar_contato,
                excluir_cnpjs=seen_cnpjs or None,
                org_id=_org_id(http_request),
            )

            # Persiste CNPJs retornados para próximas buscas
            if org_id:
                try:
                    from redis import Redis
                    from config import settings as _cfg
                    _r = Redis.from_url(_cfg.REDIS_URL, socket_connect_timeout=2)
                    _novos = [e.get("cnpj") for e in resultado.get("empresas", []) if e.get("cnpj")]
                    if _novos:
                        _key = f"hermes:seen_cnpjs:{org_id}"
                        _pipe = _r.pipeline()
                        _pipe.sadd(_key, *_novos)
                        _pipe.expire(_key, 7 * 24 * 3600)
                        _pipe.execute()
                except Exception:
                    pass
            empresas = resultado.get("empresas", [])
            filtros_aplicados = resultado.get("filtros_aplicados", {})
        else:
            from api.main import ProspeccaoConfig, rodar_prospeccao_icp
            config = ProspeccaoConfig(
                termo_base=request.termo or "",
                uf=request.uf,
                cidade=request.municipio,
                capital_minima=request.capital_minima,
                cnaes=request.cnaes or [],
                segmentos=request.segmentos or [],
                portes=request.portes or [],
                limite_empresas=request.limite,
                enriquecer_web=request.enriquecer_background,
            )
            resultado_legado = rodar_prospeccao_icp(config)
            empresas = []
            for emp in resultado_legado.empresas:
                empresas.append({
                    "cnpj": emp.cnpj,
                    "razao_social": emp.razao_social,
                    "nome_fantasia": emp.nome_fantasia,
                    "cidade": emp.cidade,
                    "uf": emp.uf,
                    "cnae_principal": emp.cnae_principal,
                    "capital_social": emp.capital_social,
                    "porte": emp.porte,
                    "segmento": emp.segmento,
                    "telefone_receita": emp.telefone_receita,
                    "email_receita": emp.email,
                    "telefone_final": emp.telefone_padrao or emp.telefone_enriquecido,
                    "email_final": emp.email_enriquecido or emp.email,
                    "whatsapp_final": emp.whatsapp_enriquecido or emp.whatsapp_publico,
                    "site": emp.site,
                    "logradouro": emp.logradouro,
                    "numero": emp.numero,
                    "cep": emp.cep,
                })

        if request.formato == "kommo":
            empresas = _formatar_kommo(empresas)
        elif request.formato == "n8n":
            empresas = _formatar_n8n(empresas)

        return ProspeccaoResponse(
            success=True,
            total=len(empresas),
            empresas=empresas,
            metadata={
                "filtros": request.model_dump(exclude={"formato", "incluir_score", "enriquecer_background"}),
                "filtros_aplicados": filtros_aplicados,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate-query")
async def translate_query_prompt(
    body: QueryTranslateRequest = Body(...),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    try:
        translated = await query_translator_service.translate_query(
            body.query,
            defaults=body.defaults,
        )
        return {"success": True, **translated}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("")
async def prospeccao_get(
    http_request: Request,
    _user: dict = Depends(require_auth),
    termo: Optional[str] = Query(None, description="Termo de busca"),
    uf: Optional[str] = Query(None, description="UF"),
    municipio: Optional[str] = Query(None, description="Município"),
    capital_minima: Optional[float] = Query(None, ge=0, description="Capital mínimo"),
    limite: int = Query(200, ge=1, le=1000, description="Limite de resultados"),
    formato: str = Query("padrao", description="Formato: padrao, kommo, n8n"),
):
    """
    Versão GET da prospecção (para n8n e webhooks).

    **Exemplo:**
    ```
    GET /prospeccao?termo=hospital&uf=SP&limite=50&formato=n8n
    ```
    """
    request = ProspeccaoRequest(
        termo=termo,
        uf=uf,
        municipio=municipio,
        capital_minima=capital_minima,
        limite=limite,
        formato=formato,
    )
    # Passa _user explicitamente para reutilizar o endpoint POST sem duplicar auth

    return await prospeccao(http_request, request, _user)


def _formatar_kommo(empresas: List[Dict]) -> List[Dict]:
    """Formata empresas para formato Kommo CRM"""
    formatted = []
    for emp in empresas:
        formatted.append({
            "name": emp.get("razao_social") or emp.get("nome_fantasia", "Sem nome"),
            "company_name": emp.get("razao_social"),
            "phone": emp.get("telefone_final") or emp.get("telefone_receita"),
            "email": emp.get("email_final") or emp.get("email_receita"),
            "website": emp.get("site"),
            "address": f"{emp.get('logradouro', '')} {emp.get('numero', '')}".strip(),
            "city": emp.get("cidade"),
            "state": emp.get("uf"),
            "zip": emp.get("cep"),
            "custom_fields": {
                "cnpj": emp.get("cnpj"),
                "cnae": emp.get("cnae_principal"),
                "capital_social": emp.get("capital_social"),
                "porte": emp.get("porte"),
                "segmento": emp.get("segmento"),
                "score_priorizacao": emp.get("scores", {}).get("score_total", 0),
                "score_confiabilidade": emp.get("confiabilidade", {}).get("score_total", 0)
            }
        })
    return formatted


def _formatar_n8n(empresas: List[Dict]) -> List[Dict]:
    """Formata empresas para formato n8n (simplificado)"""
    formatted = []
    for emp in empresas:
        formatted.append({
            "cnpj": emp.get("cnpj"),
            "nome": emp.get("razao_social") or emp.get("nome_fantasia"),
            "email": emp.get("email_final") or emp.get("email_receita"),
            "telefone": emp.get("telefone_final") or emp.get("telefone_receita"),
            "whatsapp": emp.get("whatsapp_final"),
            "site": emp.get("site"),
            "cidade": emp.get("cidade"),
            "uf": emp.get("uf"),
            "capital_social": emp.get("capital_social"),
            "score": emp.get("scores", {}).get("score_total", 0),
            "confiabilidade": emp.get("confiabilidade", {}).get("score_total", 0)
        })
    return formatted


# ============================================================
# ASSERTIVA — consulta de lead por CNPJ
# ============================================================

class AssertivaCNPJRequest(BaseModel):
    cnpj: str = Field(..., description="CNPJ do lead (com ou sem formatação)")
    id_finalidade: int = Field(
        5,
        description="Finalidade LGPD: 1=Confirmação identidade, 2=Ciclo crédito, 4=Execução contrato, 5=Legítimo interesse",
    )


@router.post(
    "/assertiva/cnpj",
    summary="Consultar lead por CNPJ na Assertiva",
    tags=["Prospecção", "Assertiva"],
)
async def prospeccao_assertiva_cnpj(
    body: AssertivaCNPJRequest,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Recebe um CNPJ e consulta os dados cadastrais na **Assertiva Localize PJ**.

    Retorna razão social, endereço, contatos, CNAEs, sócios e demais informações
    disponíveis na base da Assertiva para uso em prospecção.

    **Exemplo de uso (n8n / curl):**
    ```json
    POST /prospeccao/assertiva/cnpj
    { "cnpj": "12.345.678/0001-99" }
    ```
    """
    from api.assertiva_service import get_assertiva_service

    try:
        service = get_assertiva_service()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        )

    try:
        resultado = await service.consultar_cnpj(body.cnpj, id_finalidade=body.id_finalidade)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"success": True, "data": resultado}


@router.get(
    "/assertiva/cnpj/{cnpj}",
    summary="Consultar lead por CNPJ na Assertiva (GET)",
    tags=["Prospecção", "Assertiva"],
)
async def prospeccao_assertiva_cnpj_get(
    cnpj: str,
    id_finalidade: int = Query(5, description="Finalidade LGPD (1-5)"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Versão GET para facilitar testes rápidos e integração com n8n via URL.

    **Exemplo:**
    ```
    GET /prospeccao/assertiva/cnpj/12345678000199
    GET /prospeccao/assertiva/cnpj/12345678000199?id_finalidade=2
    ```
    """
    from api.assertiva_service import get_assertiva_service

    try:
        service = get_assertiva_service()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    try:
        resultado = await service.consultar_cnpj(cnpj, id_finalidade=id_finalidade)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"success": True, "data": resultado}
