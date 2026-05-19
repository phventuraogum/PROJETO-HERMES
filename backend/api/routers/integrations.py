"""
Endpoints Específicos para Integrações
n8n, Kommo, Supabase, Dashboard.
Todos os endpoints requerem autenticação.
"""
from fastapi import APIRouter, HTTPException, Header, Query, Body, Depends
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import logging
import requests

from middleware.auth import require_auth
from api.tenancy.supabase import resolve_tenant, rest_base_url, service_headers
from config import settings

logger = logging.getLogger("hermes.integrations")

router = APIRouter(prefix="/integrations", tags=["Integrações"])


# ============================================================
# JUN 1.3 · CRM Keys — credenciais cifradas em org_integrations_private
# ============================================================
# Schema (criado em scripts/hermes_canonical_schema.sql §11):
#   org_integrations_private (
#     org_id UUID PK,
#     pipedrive_token_enc TEXT,    -- encrypt_secret(plain, key)
#     hubspot_token_enc   TEXT,
#     rdstation_token_enc TEXT,
#     ...
#   )
# Funções pgcrypto: encrypt_secret(plain, key) + decrypt_secret(encrypted, key)
# Chave-mestra: settings.HERMES_ENCRYPTION_KEY (env var)

CRM_PROVIDERS_SUPPORTED = ("pipedrive", "hubspot", "rdstation")


def _crm_col(provider: str) -> str:
    """Mapeia provider name → coluna no schema org_integrations_private."""
    return {
        "pipedrive": "pipedrive_token_enc",
        "hubspot": "hubspot_token_enc",
        "rdstation": "rdstation_token_enc",
    }[provider]


def _supabase_ctx(org_id: str) -> tuple[str, dict[str, str]]:
    tenant = resolve_tenant(org_id)
    if not tenant.url or not tenant.service_role_key:
        raise HTTPException(status_code=503, detail="Supabase não configurado pra esta org.")
    return rest_base_url(tenant), service_headers(tenant)


def _require_enc_key() -> str:
    key = settings.HERMES_ENCRYPTION_KEY
    if not key:
        raise HTTPException(
            status_code=503,
            detail="HERMES_ENCRYPTION_KEY não configurada no backend — chaves CRM cifradas indisponíveis.",
        )
    return key


def _normalize_org(x_org_id: str | None) -> str:
    return (x_org_id or "").strip() or "default"


class CrmKeysUpdateRequest(BaseModel):
    """PUT body — qualquer subset dos 3 providers."""
    pipedrive: Optional[str] = None
    hubspot: Optional[str] = None
    rdstation: Optional[str] = None


@router.get("/crm-keys/status")
def crm_keys_status(
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
) -> dict:
    """Retorna {provider: bool} indicando se a chave está configurada (sem revelar valor)."""
    org = _normalize_org(x_org_id)
    sb_url, headers = _supabase_ctx(org)

    r = requests.get(
        f"{sb_url}/rest/v1/org_integrations_private",
        headers=headers,
        params={
            "org_id": f"eq.{org}",
            "select": "pipedrive_token_enc,hubspot_token_enc,rdstation_token_enc",
            "limit": "1",
        },
        timeout=10,
    )
    if r.status_code >= 300:
        # Tabela pode não existir em projetos legados — retornar tudo False
        return {p: False for p in CRM_PROVIDERS_SUPPORTED}

    rows = r.json()
    if not rows:
        return {p: False for p in CRM_PROVIDERS_SUPPORTED}

    row = rows[0]
    return {
        "pipedrive": bool(row.get("pipedrive_token_enc")),
        "hubspot":   bool(row.get("hubspot_token_enc")),
        "rdstation": bool(row.get("rdstation_token_enc")),
    }


@router.put("/crm-keys")
def crm_keys_update(
    payload: CrmKeysUpdateRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
) -> dict:
    """Atualiza chaves CRM cifradas. Campos ausentes/null = mantém valor atual.
    Campo presente com string vazia = remove a chave (clear)."""
    org = _normalize_org(x_org_id)
    sb_url, headers = _supabase_ctx(org)
    enc_key = _require_enc_key()

    updates: dict[str, str | None] = {}
    for provider in CRM_PROVIDERS_SUPPORTED:
        value = getattr(payload, provider, None)
        if value is None:
            continue  # não tocar
        value = value.strip()
        if not value:
            # User pediu pra limpar
            updates[_crm_col(provider)] = None
            continue
        # Cifra via RPC encrypt_secret(plain, key)
        rpc = requests.post(
            f"{sb_url}/rest/v1/rpc/encrypt_secret",
            headers={**headers, "Content-Type": "application/json"},
            json={"plain": value, "key": enc_key},
            timeout=10,
        )
        if rpc.status_code != 200:
            logger.error(f"encrypt_secret RPC falhou: {rpc.status_code} {rpc.text[:200]}")
            raise HTTPException(status_code=502, detail="Falha ao cifrar chave (encrypt_secret RPC).")
        updates[_crm_col(provider)] = rpc.json()

    if not updates:
        return {"updated": 0, "message": "Nenhum campo enviado."}

    # Upsert (org_id é PK na tabela)
    row = {"org_id": org, **updates}
    r = requests.post(
        f"{sb_url}/rest/v1/org_integrations_private",
        headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=row,
        timeout=15,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=f"Supabase: {r.text[:400]}")

    return {"updated": len(updates), "providers": list(updates.keys())}


def get_crm_key_decrypted(org_id: str, provider: str) -> Optional[str]:
    """Helper interno: retorna chave plain pra uso no backend (export CRM, etc).
    NÃO expor via endpoint HTTP — o ponto de cifragem é justamente nunca devolver plain pro client."""
    if provider not in CRM_PROVIDERS_SUPPORTED:
        return None
    sb_url, headers = _supabase_ctx(org_id)
    enc_key = settings.HERMES_ENCRYPTION_KEY
    if not enc_key:
        return None

    r = requests.get(
        f"{sb_url}/rest/v1/org_integrations_private",
        headers=headers,
        params={"org_id": f"eq.{org_id}", "select": _crm_col(provider), "limit": "1"},
        timeout=10,
    )
    if r.status_code >= 300 or not r.json():
        return None
    enc_value = r.json()[0].get(_crm_col(provider))
    if not enc_value:
        return None

    rpc = requests.post(
        f"{sb_url}/rest/v1/rpc/decrypt_secret",
        headers={**headers, "Content-Type": "application/json"},
        json={"encrypted": enc_value, "key": enc_key},
        timeout=10,
    )
    if rpc.status_code != 200:
        return None
    return rpc.json()


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
