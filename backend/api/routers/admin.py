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

-- ③ Cache de decisores Assertiva por CNPJ
CREATE TABLE IF NOT EXISTS public.decisores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj       TEXT NOT NULL,
  dados      JSONB NOT NULL DEFAULT '{}',
  buscado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cnpj)
);

CREATE INDEX IF NOT EXISTS idx_decisores_cnpj ON public.decisores (cnpj);
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
    assertiva_client_id: Optional[str] = None
    assertiva_client_secret: Optional[str] = None


# ─── Endpoints ──────────────────────────────────────────────

@router.get("/orgs")
async def admin_list_orgs(_user: dict = Depends(require_master)):
    """
    Lista todas as orgs com status de tenant configurado.
    Faz merge entre a tabela organizations e org_tenants para garantir
    que orgs adicionadas diretamente via org_tenants também apareçam.
    """
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

    # Orgs registradas na tabela organizations (por UUID)
    result = []
    orgs_slugs_seen: set[str] = set()

    for org in orgs:
        oid = org["id"]
        slug = org.get("slug") or oid
        orgs_slugs_seen.add(slug)
        # Tenta match por UUID e por slug
        tenant = tenants_map.get(oid) or tenants_map.get(slug) or {}
        result.append({
            "id": oid,
            "name": org.get("name") or slug,
            "slug": slug,
            "created_at": org.get("created_at"),
            "tenant_configured": bool(tenant.get("supabase_url")),
            "supabase_url": tenant.get("supabase_url"),
            "n8n_outbound_webhook": tenant.get("n8n_outbound_webhook"),
            "n8n_kommo_webhook": tenant.get("n8n_kommo_webhook"),
            "members_count": len(members_map.get(oid, []) + members_map.get(slug, [])),
        })

    # Tenants em org_tenants que NÃO têm entrada em organizations
    # (adicionados manualmente ou via env — ex: Quitou)
    for tenant_slug, tenant in tenants_map.items():
        if tenant_slug in orgs_slugs_seen:
            continue
        # Verifica também se é um UUID que já apareceu
        already = any(o["id"] == tenant_slug for o in orgs)
        if already:
            continue
        result.append({
            "id": tenant_slug,          # usa o slug como id simbólico
            "name": tenant_slug,        # sem nome formal — só o slug disponível
            "slug": tenant_slug,
            "created_at": None,
            "tenant_configured": bool(tenant.get("supabase_url")),
            "supabase_url": tenant.get("supabase_url"),
            "n8n_outbound_webhook": tenant.get("n8n_outbound_webhook"),
            "n8n_kommo_webhook": tenant.get("n8n_kommo_webhook"),
            "members_count": len(members_map.get(tenant_slug, [])),
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
    if body.assertiva_client_id is not None:
        payload["assertiva_client_id"] = body.assertiva_client_id.strip() or None
    if body.assertiva_client_secret is not None:
        payload["assertiva_client_secret"] = body.assertiva_client_secret.strip() or None

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


# ─── Stats ──────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(_user: dict = Depends(require_master)):
    """KPIs gerais do sistema."""
    async with httpx.AsyncClient(timeout=10) as c:
        orgs_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/organizations",
            headers=_svc_headers(),
            params={"select": "id", "order": "created_at.asc"},
        )
        tenants_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_tenants",
            headers=_svc_headers(),
            params={"select": "org_id,supabase_url"},
        )
        members_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            params={"select": "user_id"},
        )

    orgs = orgs_r.json() if orgs_r.status_code == 200 and orgs_r.content else []
    tenants = tenants_r.json() if tenants_r.status_code == 200 and tenants_r.content else []
    members = members_r.json() if members_r.status_code == 200 and members_r.content else []

    configured = sum(1 for t in tenants if t.get("supabase_url"))
    unique_users = len({m["user_id"] for m in members if m.get("user_id")})

    return {
        "total_orgs": len(orgs),
        "configured_tenants": configured,
        "unconfigured_tenants": len(orgs) - configured,
        "total_members": len(members),
        "unique_users": unique_users,
    }


# ─── Members ────────────────────────────────────────────────

class AddMemberBody(BaseModel):
    user_email: str
    role: str = "member"


class UpdateMemberBody(BaseModel):
    role: str


@router.get("/orgs/{org_id}/members")
async def admin_list_members(org_id: str, _user: dict = Depends(require_master)):
    """Lista membros de uma org com info básica do usuário."""
    async with httpx.AsyncClient(timeout=10) as c:
        members_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            params={"select": "user_id,role,created_at", "org_id": f"eq.{org_id}"},
        )
        if members_r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Falha ao listar membros")
        members = members_r.json() if members_r.content else []

        # Busca info dos usuários via Admin API
        users_r = await c.get(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            },
            params={"per_page": 1000},
        )
        users_map: dict[str, Any] = {}
        if users_r.status_code == 200 and users_r.content:
            data = users_r.json()
            users_list = data.get("users", data) if isinstance(data, dict) else data
            for u in (users_list if isinstance(users_list, list) else []):
                users_map[u["id"]] = u

    result = []
    for m in members:
        uid = m["user_id"]
        user_info = users_map.get(uid, {})
        result.append({
            "user_id": uid,
            "email": user_info.get("email", ""),
            "role": m["role"],
            "created_at": m.get("created_at"),
            "last_sign_in": user_info.get("last_sign_in_at"),
        })
    return result


@router.post("/orgs/{org_id}/members", status_code=201)
async def admin_add_member(org_id: str, body: AddMemberBody, _user: dict = Depends(require_master)):
    """Adiciona um usuário existente como membro da org."""
    async with httpx.AsyncClient(timeout=10) as c:
        # Busca user por email
        users_r = await c.get(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            },
            params={"per_page": 1000},
        )
        if users_r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Falha ao buscar usuários")

        data = users_r.json()
        users_list = data.get("users", data) if isinstance(data, dict) else data
        target_user = next(
            (u for u in (users_list if isinstance(users_list, list) else [])
             if u.get("email", "").lower() == body.user_email.lower()),
            None,
        )
        if not target_user:
            raise HTTPException(status_code=404, detail=f"Usuário '{body.user_email}' não encontrado")

        user_id = target_user["id"]
        r = await c.post(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            json={"org_id": org_id, "user_id": user_id, "role": body.role},
        )
        if r.status_code >= 300:
            raise HTTPException(status_code=r.status_code, detail=f"Falha ao adicionar membro: {r.text[:200]}")

    return {"success": True, "user_id": user_id, "role": body.role}


@router.patch("/orgs/{org_id}/members/{user_id}")
async def admin_update_member(
    org_id: str, user_id: str, body: UpdateMemberBody, _user: dict = Depends(require_master)
):
    """Atualiza o papel de um membro."""
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.patch(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            params={"org_id": f"eq.{org_id}", "user_id": f"eq.{user_id}"},
            json={"role": body.role},
        )
        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail=f"Falha ao atualizar membro: {r.text[:200]}")
    return {"success": True}


@router.delete("/orgs/{org_id}/members/{user_id}")
async def admin_remove_member(org_id: str, user_id: str, _user: dict = Depends(require_master)):
    """Remove um membro da org."""
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.delete(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            params={"org_id": f"eq.{org_id}", "user_id": f"eq.{user_id}"},
        )
        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail=f"Falha ao remover membro: {r.text[:200]}")
    return {"success": True}


# ─── Health ─────────────────────────────────────────────────

@router.get("/orgs/{org_id}/health")
async def admin_org_health(org_id: str, _user: dict = Depends(require_master)):
    """Verifica conectividade e contagens do tenant."""
    from api.tenancy.supabase import resolve_tenant

    tenant = resolve_tenant(org_id)
    if not tenant.url or not tenant.service_role_key:
        return {
            "org_id": org_id,
            "reachable": False,
            "error": "Tenant não configurado",
            "tables": {},
            "counts": {},
        }

    tables_status: dict[str, str] = {}
    counts: dict[str, int] = {}
    reachable = False

    async with httpx.AsyncClient(timeout=8) as c:
        for table in ("pipeline_leads", "leads"):
            try:
                r = await c.get(
                    f"{tenant.url}/rest/v1/{table}",
                    headers={
                        "apikey": tenant.service_role_key,
                        "Authorization": f"Bearer {tenant.service_role_key}",
                        "Prefer": "count=exact",
                    },
                    params={"limit": "0"},
                )
                if r.status_code == 200:
                    tables_status[table] = "ok"
                    reachable = True
                    content_range = r.headers.get("content-range", "")
                    if "/" in content_range:
                        try:
                            counts[table] = int(content_range.split("/")[-1])
                        except ValueError:
                            counts[table] = 0
                elif r.status_code == 404:
                    tables_status[table] = "missing"
                    reachable = True
                else:
                    tables_status[table] = f"error_{r.status_code}"
            except Exception as exc:
                tables_status[table] = f"unreachable"
                counts[table] = 0

    return {
        "org_id": org_id,
        "supabase_url": tenant.url,
        "reachable": reachable,
        "tables": tables_status,
        "counts": counts,
    }
