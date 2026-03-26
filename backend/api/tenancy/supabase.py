import json
import os
import time
import urllib.request as _urllib_req
from dataclasses import dataclass


@dataclass(frozen=True)
class SupabaseTenant:
    org_id: str
    url: str
    service_role_key: str
    n8n_outbound_webhook: str | None = None
    n8n_kommo_webhook: str | None = None


_TENANTS_CACHE: dict[str, SupabaseTenant] | None = None
_TENANTS_CACHE_TIME: float = 0.0
_TENANTS_TTL: float = 60.0  # segundos


def invalidate_tenant_cache() -> None:
    """Força recarregamento na próxima resolução de tenant."""
    global _TENANTS_CACHE, _TENANTS_CACHE_TIME
    _TENANTS_CACHE = None
    _TENANTS_CACHE_TIME = 0.0


def _parse_tenants_json(raw: str) -> dict[str, SupabaseTenant]:
    """
    SUPABASE_TENANTS_JSON esperado:
    {
      "default": {
        "url": "https://xxx.supabase.co",
        "service_role_key": "....",
        "n8n_outbound_webhook": "https://n8n.../webhook/...",
        "n8n_kommo_webhook": "https://n8n.../webhook/...",
      },
      "quitoubr": { ... }
    }
    """
    data = json.loads(raw or "{}")
    if not isinstance(data, dict):
        return {}

    out: dict[str, SupabaseTenant] = {}
    for k, v in data.items():
        if not isinstance(k, str) or not isinstance(v, dict):
            continue
        url = str(v.get("url") or "").strip()
        key = str(v.get("service_role_key") or "").strip()
        if not url or not key:
            continue
        out[k.strip() or "default"] = SupabaseTenant(
            org_id=k.strip() or "default",
            url=url.rstrip("/"),
            service_role_key=key,
            n8n_outbound_webhook=(str(v.get("n8n_outbound_webhook")).strip() if v.get("n8n_outbound_webhook") else None),
            n8n_kommo_webhook=(str(v.get("n8n_kommo_webhook")).strip() if v.get("n8n_kommo_webhook") else None),
        )
    return out


def _load_tenants_from_db() -> dict[str, SupabaseTenant]:
    """Carrega tenants da tabela org_tenants no Supabase Pinn (com timeout curto)."""
    base_url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    service_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not base_url or not service_key:
        return {}
    try:
        url = (
            f"{base_url}/rest/v1/org_tenants"
            "?select=org_id,supabase_url,supabase_service_key,n8n_outbound_webhook,n8n_kommo_webhook"
        )
        req = _urllib_req.Request(url, headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        })
        with _urllib_req.urlopen(req, timeout=5) as r:
            rows = json.loads(r.read())
        out: dict[str, SupabaseTenant] = {}
        for row in rows:
            org_id = str(row.get("org_id") or "").strip()
            url_val = str(row.get("supabase_url") or "").strip().rstrip("/")
            key_val = str(row.get("supabase_service_key") or "").strip()
            if not org_id or not url_val or not key_val:
                continue
            out[org_id] = SupabaseTenant(
                org_id=org_id,
                url=url_val,
                service_role_key=key_val,
                n8n_outbound_webhook=(row.get("n8n_outbound_webhook") or None),
                n8n_kommo_webhook=(row.get("n8n_kommo_webhook") or None),
            )
        return out
    except Exception:
        return {}


def _load_tenants() -> dict[str, SupabaseTenant]:
    global _TENANTS_CACHE, _TENANTS_CACHE_TIME

    now = time.monotonic()
    if _TENANTS_CACHE is not None and (now - _TENANTS_CACHE_TIME) < _TENANTS_TTL:
        return _TENANTS_CACHE

    tenants: dict[str, SupabaseTenant] = {}

    # Default via env (compatibilidade legada)
    default_url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    default_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    default_webhook = (os.getenv("N8N_OUTBOUND_WEBHOOK") or "").strip()
    if default_url and default_key:
        tenants["default"] = SupabaseTenant(
            org_id="default",
            url=default_url,
            service_role_key=default_key,
            n8n_outbound_webhook=default_webhook or None,
        )

    # Tenants adicionais via JSON (env)
    raw = os.getenv("SUPABASE_TENANTS_JSON") or ""
    if raw.strip():
        try:
            tenants.update(_parse_tenants_json(raw))
        except Exception:
            pass

    # Tenants do banco (prioridade sobre env JSON — permite gestão via UI)
    db_tenants = _load_tenants_from_db()
    tenants.update(db_tenants)

    _TENANTS_CACHE = tenants
    _TENANTS_CACHE_TIME = now
    return tenants


def resolve_tenant(org_id: str | None) -> SupabaseTenant:
    """
    Resolve o tenant Supabase a partir do org_id (header X-Org-Id).
    - Prioriza match exato do org_id
    - Fallback para "default"
    - Se nem default existir, retorna configuração vazia
    """
    org = (org_id or "").strip() or "default"
    tenants = _load_tenants()
    if org in tenants:
        return tenants[org]
    if "default" in tenants:
        return tenants["default"]
    return SupabaseTenant(org_id=org, url="", service_role_key="", n8n_outbound_webhook=None)


def rest_base_url(tenant: SupabaseTenant) -> str:
    return tenant.url.rstrip("/")


def service_headers(tenant: SupabaseTenant) -> dict[str, str]:
    return {
        "apikey": tenant.service_role_key,
        "Authorization": f"Bearer {tenant.service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def require_configured(tenant: SupabaseTenant) -> None:
    if not tenant.url or not tenant.service_role_key:
        raise RuntimeError("Supabase tenant não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
