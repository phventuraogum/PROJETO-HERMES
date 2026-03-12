from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from api.lead_registry import lead_registry_service
from middleware.auth import require_auth

router = APIRouter(tags=["Lead Registry"])


def _org_id(request: Request) -> str:
    return (request.headers.get("X-Org-Id") or "").strip() or "default"


class LeadListCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=400)


class LeadListUpdateBody(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=400)


class LeadListBatchItem(BaseModel):
    empresa: Dict[str, Any]
    score_icp: Optional[float] = None
    source: Optional[str] = None


class LeadListAddItemsBody(BaseModel):
    items: List[LeadListBatchItem]


class LeadSuppressionCreateBody(BaseModel):
    cnpjs: Optional[List[str]] = None
    emails: Optional[List[str]] = None
    domains: Optional[List[str]] = None
    reason: Optional[str] = Field(default=None, max_length=300)
    source: Optional[str] = Field(default=None, max_length=120)


@router.get("/lead-lists")
async def list_lead_lists(
    request: Request,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    return lead_registry_service.list_lists(_org_id(request))


@router.post("/lead-lists")
async def create_lead_list(
    body: LeadListCreateBody,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    try:
        return lead_registry_service.create_list(_org_id(request), body.name, body.description)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/lead-lists/{list_id}")
async def update_lead_list(
    list_id: str,
    body: LeadListUpdateBody,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    try:
        updated = lead_registry_service.update_list(
            _org_id(request),
            list_id,
            name=body.name,
            description=body.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not updated:
        raise HTTPException(status_code=404, detail="Lista nao encontrada.")
    return {"ok": True}


@router.delete("/lead-lists/{list_id}")
async def delete_lead_list(
    list_id: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    deleted = lead_registry_service.delete_list(_org_id(request), list_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Lista nao encontrada.")
    return {"ok": True}


@router.get("/lead-lists/{list_id}/items")
async def get_lead_list_items(
    list_id: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    return lead_registry_service.get_list_items(_org_id(request), list_id)


@router.post("/lead-lists/{list_id}/items")
async def add_lead_list_items(
    list_id: str,
    body: LeadListAddItemsBody,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    try:
        added = lead_registry_service.add_items(
            _org_id(request),
            list_id,
            [item.model_dump() for item in body.items],
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return {"ok": True, "added": added, "total": len(body.items)}


@router.delete("/lead-lists/{list_id}/items/{cnpj}")
async def remove_lead_list_item(
    list_id: str,
    cnpj: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    removed = lead_registry_service.remove_list_item(_org_id(request), list_id, cnpj)
    if not removed:
        raise HTTPException(status_code=404, detail="Lead nao encontrado na lista.")
    return {"ok": True}


@router.get("/lead-suppressions")
async def list_lead_suppressions(
    request: Request,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    return lead_registry_service.list_suppressions(_org_id(request))


@router.post("/lead-suppressions")
async def create_lead_suppressions(
    body: LeadSuppressionCreateBody,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    added = lead_registry_service.add_suppressions(
        _org_id(request),
        cnpjs=body.cnpjs,
        emails=body.emails,
        domains=body.domains,
        reason=body.reason,
        source=body.source,
    )
    total = len(body.cnpjs or []) + len(body.emails or []) + len(body.domains or [])
    return {"ok": True, "added": added, "total": total}


@router.delete("/lead-suppressions/{suppression_id}")
async def remove_lead_suppression(
    suppression_id: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    removed = lead_registry_service.remove_suppression(_org_id(request), suppression_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Supressao nao encontrada.")
    return {"ok": True}
