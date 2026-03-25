from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException

from config import settings
from middleware.auth import require_auth
from api.tenancy.rbac import get_org_access, require_min_role, OrgAccess


router = APIRouter(prefix="/orgs", tags=["Organizations"])


def _svc_headers() -> dict[str, str]:
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


@router.get("")
async def list_my_orgs(user: dict = Depends(require_auth)):
    """Lista organizações do usuário autenticado (com role)."""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Usuário inválido")

    async with httpx.AsyncClient(timeout=10) as c:
        mem_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            params={"select": "org_id,role", "user_id": f"eq.{user_id}"},
        )
        if mem_r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Falha ao listar organizações")
        memberships = mem_r.json() if mem_r.content else []

        if not memberships:
            return []

        org_ids = [m["org_id"] for m in memberships if m.get("org_id")]
        # Busca organizações
        org_r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/organizations",
            headers=_svc_headers(),
            params={"select": "id,name,slug", "id": f"in.({','.join(org_ids)})"},
        )
        if org_r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Falha ao listar organizações")
        orgs = org_r.json() if org_r.content else []

    role_by_org = {m["org_id"]: m.get("role") for m in memberships}
    out = []
    for o in orgs:
        oid = o.get("id")
        if not oid:
            continue
        out.append(
            {
                "id": oid,
                "name": o.get("name"),
                "slug": o.get("slug"),
                "role": role_by_org.get(oid, "member"),
            }
        )
    return out


@router.get("/{org_id}/integrations/kommo")
async def get_kommo_integration(
    org_id: str,
    access: OrgAccess = Depends(get_org_access),
):
    """Retorna configuração Kommo (via n8n webhook) da organização."""
    if access.org_id != org_id:
        raise HTTPException(status_code=403, detail="Org inválida")

    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_integrations",
            headers=_svc_headers(),
            params={"select": "kommo_webhook,kommo_pipeline_id,kommo_status_id", "org_id": f"eq.{org_id}"},
        )
        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Falha ao buscar integração")
        rows = r.json() if r.content else []
        return rows[0] if rows else {"kommo_webhook": None, "kommo_pipeline_id": None, "kommo_status_id": None}


@router.put("/{org_id}/integrations/kommo")
async def upsert_kommo_integration(
    org_id: str,
    body: Dict[str, Any] = Body(...),
    access: OrgAccess = Depends(require_min_role("member")),
):
    """
    Salva integração Kommo da org.
    Espera: { kommo_webhook, kommo_pipeline_id, kommo_status_id }
    """
    if access.org_id != org_id:
        raise HTTPException(status_code=403, detail="Org inválida")

    kommo_webhook = (body.get("kommo_webhook") or "").strip() or None
    pipeline_id = body.get("kommo_pipeline_id")
    status_id = body.get("kommo_status_id")

    payload: dict[str, Any] = {"org_id": org_id}
    if kommo_webhook is not None:
        payload["kommo_webhook"] = kommo_webhook
    if pipeline_id is not None:
        payload["kommo_pipeline_id"] = int(pipeline_id)
    if status_id is not None:
        payload["kommo_status_id"] = int(status_id)

    async with httpx.AsyncClient(timeout=10) as c:
        # upsert: tenta update, senão insert
        existing = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_integrations",
            headers=_svc_headers(),
            params={"select": "org_id", "org_id": f"eq.{org_id}"},
        )
        has = existing.status_code == 200 and bool(existing.json())

        if has:
            r = await c.patch(
                f"{settings.SUPABASE_URL}/rest/v1/org_integrations",
                headers=_svc_headers(),
                params={"org_id": f"eq.{org_id}"},
                json=payload,
            )
        else:
            r = await c.post(
                f"{settings.SUPABASE_URL}/rest/v1/org_integrations",
                headers=_svc_headers(),
                json=payload,
            )

        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail=f"Falha ao salvar integração: {r.text[:300]}")

        rows = r.json() if r.content else []
        return rows[0] if rows else {"success": True}

