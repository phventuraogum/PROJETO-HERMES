"""
Endpoints Específicos para Integrações
n8n, Kommo, Supabase, Dashboard.
Todos os endpoints requerem autenticação.
"""
from fastapi import APIRouter, HTTPException, Query, Body, Depends
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from middleware.auth import require_auth

router = APIRouter(prefix="/integrations", tags=["Integrações"])


# ============================================================
# N8N Integration
# ============================================================

@router.post("/n8n/prospeccao")
async def n8n_prospeccao(
    request: Dict[str, Any] = Body(...),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Endpoint otimizado para n8n.
    
    Formato simplificado e resposta padronizada.
    
    **Exemplo:**
    ```json
    {
        "termo": "hospital",
        "uf": "SP",
        "limite": 50
    }
    ```
    """
    from api.routers.prospeccao import prospeccao
    from api.routers.prospeccao import ProspeccaoRequest
    
    # Converte para formato interno
    prospeccao_request = ProspeccaoRequest(
        termo=request.get("termo"),
        uf=request.get("uf"),
        municipio=request.get("municipio"),
        capital_minima=request.get("capital_minima"),
        limite=request.get("limite", 50),
        formato="n8n",
        incluir_score=True
    )
    
    resultado = await prospeccao(prospeccao_request)
    
    # Formato específico para n8n
    return {
        "items": resultado.empresas,
        "total": resultado.total,
        "success": resultado.success
    }


# ============================================================
# Kommo (AmoCRM) Integration
# ============================================================

@router.post("/kommo/leads")
async def kommo_leads(
    request: Dict[str, Any] = Body(...),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Endpoint otimizado para Kommo CRM.
    
    Retorna leads no formato esperado pelo Kommo.
    
    **Exemplo:**
    ```json
    {
        "termo": "hospital",
        "uf": "SP",
        "limite": 100
    }
    ```
    """
    from api.routers.prospeccao import prospeccao
    from api.routers.prospeccao import ProspeccaoRequest
    
    prospeccao_request = ProspeccaoRequest(
        termo=request.get("termo"),
        uf=request.get("uf"),
        municipio=request.get("municipio"),
        capital_minima=request.get("capital_minima"),
        limite=request.get("limite", 100),
        formato="kommo",
        incluir_score=True
    )
    
    resultado = await prospeccao(prospeccao_request)
    
    # Formato Kommo
    return {
        "leads": resultado.empresas,
        "total": resultado.total,
        "success": resultado.success
    }


# ============================================================
# Supabase Integration
# ============================================================

@router.post("/supabase/sync")
async def supabase_sync(
    table_name: str = Query(..., description="Nome da tabela no Supabase"),
    empresas: List[Dict[str, Any]] = Body(..., description="Lista de empresas para sincronizar"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Sincroniza empresas com Supabase.
    
    **Exemplo:**
    ```json
    {
        "table_name": "prospects",
        "empresas": [
            {
                "cnpj": "12345678000190",
                "nome": "Empresa LTDA",
                ...
            }
        ]
    }
    ```
    """
    # TODO: Implementar sincronização com Supabase
    return {
        "success": True,
        "message": "Sincronização com Supabase (implementação pendente)",
        "total": len(empresas)
    }


# ============================================================
# Dashboard Integration
# ============================================================

@router.get("/dashboard/stats")
async def dashboard_stats(_user: dict = Depends(require_auth)) -> Dict[str, Any]:
    """
    Estatísticas para dashboard.
    
    Retorna métricas agregadas úteis para visualização.
    """
    from api.db_pool import get_connection
    
    try:
        with get_connection(read_only=True) as conn:
            # Total de empresas
            total_empresas = conn.execute(
                "SELECT COUNT(*) FROM cnpj_empresas WHERE SITUACAO_CADASTRAL = '02'"
            ).fetchone()[0]
            
            # Empresas enriquecidas
            total_enriquecidas = conn.execute(
                "SELECT COUNT(*) FROM empresas_enriquecidas"
            ).fetchone()[0]
            
            # Por UF (top 5)
            top_ufs = conn.execute("""
                SELECT UF, COUNT(*) as total
                FROM cnpj_empresas
                WHERE SITUACAO_CADASTRAL = '02'
                GROUP BY UF
                ORDER BY total DESC
                LIMIT 5
            """).fetchdf().to_dict(orient="records")
            
            return {
                "success": True,
                "stats": {
                    "total_empresas": int(total_empresas),
                    "total_enriquecidas": int(total_enriquecidas),
                    "taxa_enriquecimento": round((total_enriquecidas / total_empresas * 100) if total_empresas > 0 else 0, 2),
                    "top_ufs": top_ufs
                }
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
