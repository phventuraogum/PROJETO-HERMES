"""
Endpoints de Prospecção
Otimizados para integração com n8n, Kommo, etc.
Todos os endpoints requerem autenticação.
"""
from fastapi import APIRouter, HTTPException, Query, Body, Depends
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from middleware.auth import require_auth

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


class ProspeccaoRequest(BaseModel):
    """Request padronizado para prospecção"""
    termo: Optional[str] = Field(None, description="Termo de busca (nome/razão social)")
    uf: Optional[str] = Field(None, description="UF (ex: SP, RJ)")
    municipio: Optional[str] = Field(None, description="Município")
    capital_minima: Optional[float] = Field(None, ge=0, description="Capital social mínimo")
    cnaes: Optional[List[str]] = Field(None, description="Lista de CNAEs")
    segmentos: Optional[List[str]] = Field(None, description="Lista de segmentos")
    portes: Optional[List[str]] = Field(None, description="Lista de portes (ME, EPP, Médio, Grande)")
    limite: int = Field(200, ge=1, le=1000, description="Limite de resultados")
    enriquecer_background: bool = Field(True, description="Enriquecer em background")
    incluir_score: bool = Field(True, description="Incluir scores de qualidade e priorização")
    formato: str = Field("padrao", description="Formato de resposta: padrao, kommo, n8n")


class ProspeccaoResponse(BaseModel):
    """Response padronizado"""
    success: bool
    total: int
    empresas: List[Dict[str, Any]]
    metadata: Dict[str, Any]


@router.post("", response_model=ProspeccaoResponse)
async def prospeccao(
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
        # Executa prospecção
        if USE_OTIMIZADA:
            resultado = rodar_prospeccao_otimizada(
                termo=request.termo,
                uf=request.uf,
                municipio=request.municipio,
                capital_minima=request.capital_minima,
                cnaes=request.cnaes,
                segmentos=request.segmentos,
                portes=request.portes,
                limite=request.limite,
                enriquecer_background=request.enriquecer_background
            )
            empresas = resultado.get("empresas", [])
        else:
            # Usa função legada
            from api.main import ProspeccaoConfig
            config = ProspeccaoConfig(
                termo_base=request.termo or "",
                uf=request.uf,
                cidade=request.municipio,
                capital_minima=request.capital_minima,
                cnaes=request.cnaes or [],
                segmentos=request.segmentos or [],
                portes=request.portes or [],
                limite_empresas=request.limite,
                enriquecer_web=request.enriquecer_background
            )
            resultado_legado = rodar_prospeccao_icp(config)
            # Converte para formato novo
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
                    "cep": emp.cep
                })
        
        # 7. Formata resposta conforme solicitado
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
                "timestamp": resultado.get("filtros_aplicados", {})
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def prospeccao_get(
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
        formato=formato
    )
    return await prospeccao(request)


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
