import json
import os
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SupabaseTenant:
    org_id: str
    url: str
    service_role_key: str
    n8n_outbound_webhook: str | None = None
    n8n_kommo_webhook: str | None = None


_TENANTS_CACHE: dict[str, SupabaseTenant] | None = None


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
      "quitoubr": { "url": "...", "service_role_key": "...", "n8n_outbound_webhook": "...", "n8n_kommo_webhook": "..." }
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


def _load_tenants() -> dict[str, SupabaseTenant]:
    global _TENANTS_CACHE
    if _TENANTS_CACHE is not None:
        return _TENANTS_CACHE

    tenants: dict[str, SupabaseTenant] = {}

    # Default via env “legado” (mantém compatibilidade)
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

    # Tenants adicionais via JSON
    raw = os.getenv("SUPABASE_TENANTS_JSON") or ""
    if raw.strip():
        try:
            parsed = _parse_tenants_json(raw)
            tenants.update(parsed)
        except Exception:
            # fail-open: mantém apenas o default se JSON estiver inválido
            pass

    _TENANTS_CACHE = tenants
    return tenants


def resolve_tenant(org_id: str | None) -> SupabaseTenant:
    """
    Resolve o tenant Supabase a partir do org_id (header X-Org-Id).
    - Prioriza match exato do org_id
    - Fallback para "default"
    - Se nem default existir, retorna uma configuração vazia (e o caller deve tratar)
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

