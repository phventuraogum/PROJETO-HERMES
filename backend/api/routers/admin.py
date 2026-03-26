"""
Admin router — gerenciamento de orgs, tenants e provisionamento.
Acessível apenas pelo HERMES_MASTER_EMAIL.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import settings
from middleware.auth import require_auth
from api.tenancy.supabase import invalidate_tenant_cache

router = APIRouter(prefix="/admin", tags=["Admin"])

# ─── SQL padrão de provisionamento ──────────────────────────
PROVISION_SQL = """
-- ① Tabela principal de leads do Hermes (pipeline)
CREATE TABLE IF NOT EXISTS public.pipeline_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT NOT NULL DEFAULT 'default',
  cnpj                 TEXT NOT NULL,
  razao_social         TEXT NOT NULL,
  nome_fantasia        TEXT,
  email                TEXT,
  email_enriquecido    TEXT,
  telefone             TEXT,
  whatsapp             TEXT,
  telefone_enriquecido TEXT,
  site                 TEXT,
  cidade               TEXT,
  uf                   TEXT,
  segmento             TEXT,
  porte                TEXT,
  capital_social       NUMERIC,
  estagio              TEXT DEFAULT 'novo',
  kommo_synced         BOOLEAN DEFAULT FALSE,
  kommo_lead_id        BIGINT,
  kommo_contact_id     BIGINT,
  adicionado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, cnpj)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_kommo_synced
  ON public.pipeline_leads (kommo_synced, adicionado_em);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_org_id
  ON public.pipeline_leads (org_id);

-- ② Colunas Kommo na tabela leads (formulário do site)
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS kommo_synced  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kommo_lead_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_leads_kommo_synced
  ON public.leads (kommo_synced, created_at);
""".strip()


# ─── Helpers ────────────────────────────────────────────────

def _master_email() -> str:
    return (getattr(settings, "HERMES_MASTER_EMAIL", "") or "").strip().lower()


def _svc_headers() -> dict[str, str]:
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def require_master(user: dict = Depends(require_auth)) -> dict:
    email = (user.get("email") or "").strip().lower()
    master = _master_email()
    if not master or email != master:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador master")
    return user


# ─── Schemas ────────────────────────────────────────────────

class CreateOrgBody(BaseModel):
    name: str
    slug: str
    user_email: str
    user_password: str
    supabase_url: Optional[str] = None
    supabase_service_key: Optional[str] = None
    n8n_outbound_webhook: Optional[str] = None
    n8n_kommo_webhook: Optional[str] = None


class TenantBody(BaseModel):
    supabase_url: str
    supabase_service_key: str
    n8n_outbound_webhook: Optional[str] = None
    n8n_kommo_webhook: Optional[str] = None


# ─── Endpoints ──────────────────────────────────────────────

@router.get("/orgs")
async def admin_list_orgs(_user: dict = Depends(require_master)):
    """Lista todas as orgs com status de tenant configurado."""
    async with httpx.AsyncClient(timeout=10) as c:
        orgs_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/organizations",
            headers=_svc_headers(),
            params={"select": "id,name,slug,created_at", "order": "created_at.asc"},
        )
        if orgs_r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Falha ao listar orgs")
        orgs = orgs_r.json() if orgs_r.content else []

        tenants_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_tenants",
            headers=_svc_headers(),
            params={"select": "org_id,supabase_url,n8n_outbound_webhook,n8n_kommo_webhook"},
        )
        tenants_map: dict[str, Any] = {}
        if tenants_r.status_code == 200 and tenants_r.content:
            for t in tenants_r.json():
                tenants_map[t["org_id"]] = t

        members_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            params={"select": "org_id,user_id,role"},
        )
        members_map: dict[str, list] = {}
        if members_r.status_code == 200 and members_r.content:
            for m in members_r.json():
                members_map.setdefault(m["org_id"], []).append(m)

    result = []
    for org in orgs:
        oid = org["id"]
        tenant = tenants_map.get(oid, {})
        result.append({
            "id": oid,
            "name": org.get("name"),
            "slug": org.get("slug"),
            "created_at": org.get("created_at"),
            "tenant_configured": bool(tenant.get("supabase_url")),
            "supabase_url": tenant.get("supabase_url"),
            "n8n_outbound_webhook": tenant.get("n8n_outbound_webhook"),
            "n8n_kommo_webhook": tenant.get("n8n_kommo_webhook"),
            "members_count": len(members_map.get(oid, [])),
        })
    return result


@router.post("/orgs", status_code=201)
async def admin_create_org(body: CreateOrgBody, _user: dict = Depends(require_master)):
    """Cria org, usuário no Supabase Auth e opcionalmente configura o tenant."""
    slug = body.slug.strip().lower()
    if not slug:
        raise HTTPException(status_code=400, detail="slug é obrigatório")

    async with httpx.AsyncClient(timeout=15) as c:
        # 1. Cria o usuário via Supabase Admin API
        user_r = await c.post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "email": body.user_email,
                "password": body.user_password,
                "email_confirm": True,
            },
        )
        if user_r.status_code >= 300:
            raise HTTPException(status_code=user_r.status_code, detail=f"Falha ao criar usuário: {user_r.text[:300]}")
        new_user_id = user_r.json().get("id")

        # 2. Cria a organização
        org_r = await c.post(
            f"{settings.SUPABASE_URL}/rest/v1/organizations",
            headers=_svc_headers(),
            json={"name": body.name, "slug": slug, "owner_id": new_user_id},
        )
        if org_r.status_code >= 300:
            raise HTTPException(status_code=org_r.status_code, detail=f"Falha ao criar org: {org_r.text[:300]}")
        org_data = org_r.json()
        org_id = (org_data[0] if isinstance(org_data, list) else org_data).get("id")

        # 3. Adiciona usuário como owner
        mem_r = await c.post(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            json={"org_id": org_id, "user_id": new_user_id, "role": "owner"},
        )
        if mem_r.status_code >= 300:
            raise HTTPException(status_code=mem_r.status_code, detail=f"Falha ao adicionar membro: {mem_r.text[:300]}")

        # 4. Configura tenant se credenciais fornecidas
        if body.supabase_url and body.supabase_service_key:
            tenant_payload: dict[str, Any] = {
                "org_id": slug,
                "supabase_url": body.supabase_url.strip().rstrip("/"),
                "supabase_service_key": body.supabase_service_key.strip(),
            }
            if body.n8n_outbound_webhook:
                tenant_payload["n8n_outbound_webhook"] = body.n8n_outbound_webhook.strip()
            if body.n8n_kommo_webhook:
                tenant_payload["n8n_kommo_webhook"] = body.n8n_kommo_webhook.strip()

            await c.post(
                f"{settings.SUPABASE_URL}/rest/v1/org_tenants",
                headers=_svc_headers(),
                json=tenant_payload,
            )
            invalidate_tenant_cache()

    return {
        "success": True,
        "org_id": org_id,
        "slug": slug,
        "user_id": new_user_id,
        "tenant_configured": bool(body.supabase_url),
    }


@router.put("/orgs/{org_id}/tenant")
async def admin_set_tenant(org_id: str, body: TenantBody, _user: dict = Depends(require_master)):
    """Upsert das credenciais Supabase do tenant."""
    payload: dict[str, Any] = {
        "org_id": org_id,
        "supabase_url": body.supabase_url.strip().rstrip("/"),
        "supabase_service_key": body.supabase_service_key.strip(),
    }
    if body.n8n_outbound_webhook is not None:
        payload["n8n_outbound_webhook"] = body.n8n_outbound_webhook.strip() or None
    if body.n8n_kommo_webhook is not None:
        payload["n8n_kommo_webhook"] = body.n8n_kommo_webhook.strip() or None

    async with httpx.AsyncClient(timeout=10) as c:
        # Verifica se já existe
        check = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_tenants",
            headers=_svc_headers(),
            params={"select": "org_id", "org_id": f"eq.{org_id}"},
        )
        exists = check.status_code == 200 and bool(check.json())

        if exists:
            r = await c.patch(
                f"{settings.SUPABASE_URL}/rest/v1/org_tenants",
                headers=_svc_headers(),
                params={"org_id": f"eq.{org_id}"},
                json=payload,
            )
        else:
            r = await c.post(
                f"{settings.SUPABASE_URL}/rest/v1/org_tenants",
                headers=_svc_headers(),
                json=payload,
            )

        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail=f"Falha ao salvar tenant: {r.text[:300]}")

    invalidate_tenant_cache()
    return {"success": True, "org_id": org_id, "action": "updated" if exists else "created"}


@router.post("/orgs/{org_id}/provision")
async def admin_provision_org(org_id: str, _user: dict = Depends(require_master)):
    """
    Verifica quais tabelas precisam ser criadas no Supabase do cliente
    e retorna o SQL de provisionamento.
    """
    from api.tenancy.supabase import resolve_tenant

    tenant = resolve_tenant(org_id)
    if not tenant.url or not tenant.service_role_key:
        raise HTTPException(status_code=400, detail=f"Tenant '{org_id}' não possui credenciais configuradas")

    tables_status: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=10) as c:
        for table in ("pipeline_leads", "leads"):
            try:
                r = await c.get(
                    f"{tenant.url}/rest/v1/{table}",
                    headers={
                        "apikey": tenant.service_role_key,
                        "Authorization": f"Bearer {tenant.service_role_key}",
                    },
                    params={"limit": "1"},
                )
                if r.status_code == 200:
                    tables_status[table] = "exists"
                elif r.status_code == 404:
                    tables_status[table] = "missing"
                else:
                    tables_status[table] = f"unknown ({r.status_code})"
            except Exception as e:
                tables_status[table] = f"error: {e}"

    needs_provision = any(v == "missing" for v in tables_status.values())
    return {
        "org_id": org_id,
        "supabase_url": tenant.url,
        "tables": tables_status,
        "needs_provision": needs_provision,
        "sql": PROVISION_SQL,
        "instructions": (
            "Execute o SQL acima no SQL Editor do Supabase do cliente para provisionar as tabelas necessárias."
            if needs_provision else
            "Todas as tabelas já existem. Nenhuma ação necessária."
        ),
    }


@router.delete("/orgs/{org_id}", status_code=200)
async def admin_delete_org(org_id: str, _user: dict = Depends(require_master)):
    """Remove uma organização (não apaga dados do tenant)."""
    async with httpx.AsyncClient(timeout=10) as c:
        # Remove membros
        await c.delete(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            params={"org_id": f"eq.{org_id}"},
        )
        # Remove org
        r = await c.delete(
            f"{settings.SUPABASE_URL}/rest/v1/organizations",
            headers=_svc_headers(),
            params={"id": f"eq.{org_id}"},
        )
        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail=f"Falha ao remover org: {r.text[:200]}")

    return {"success": True, "org_id": org_id}
