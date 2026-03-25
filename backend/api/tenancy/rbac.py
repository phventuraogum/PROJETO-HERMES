from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import httpx
from fastapi import Depends, Header, HTTPException

from config import settings
from middleware.auth import require_auth


ROLE_ORDER = {
    "viewer": 0,
    "member": 1,
    "admin": 2,
    "owner": 3,
}


def _org_id(x_org_id: str | None) -> str:
    return (x_org_id or "").strip() or "default"


def _master_email() -> str:
    return (getattr(settings, "HERMES_MASTER_EMAIL", "") or "").strip().lower()


def _svc_headers() -> dict[str, str]:
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


@dataclass(frozen=True)
class OrgAccess:
    org_id: str
    role: str


async def get_org_access(
    user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
) -> OrgAccess:
    org_id = _org_id(x_org_id)
    email = (user.get("email") or "").strip().lower()

    # Master admin bypass (acesso total, sem depender de org_members)
    if _master_email() and email == _master_email():
        return OrgAccess(org_id=org_id, role="owner")

    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Usuário inválido")

    # Confere membership
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_svc_headers(),
            params={"select": "role", "org_id": f"eq.{org_id}", "user_id": f"eq.{user_id}"},
        )
        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Falha ao validar permissões da organização")
        rows = r.json() if r.content else []
        if not rows:
            raise HTTPException(status_code=403, detail="Acesso negado para esta organização")
        role = str(rows[0].get("role") or "member")
        return OrgAccess(org_id=org_id, role=role)


def require_min_role(min_role: str):
    async def _dep(access: OrgAccess = Depends(get_org_access)) -> OrgAccess:
        cur = ROLE_ORDER.get(access.role, 0)
        need = ROLE_ORDER.get(min_role, 0)
        if cur < need:
            raise HTTPException(status_code=403, detail="Permissão insuficiente")
        return access

    return _dep

