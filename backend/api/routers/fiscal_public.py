"""
Consulta fiscal publica/manual.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Path, Request, UploadFile
from pydantic import BaseModel

from api.public_fiscal_data import (
    DEFAULT_PROVIDER,
    DEFAULT_SOURCE_LABEL,
    public_fiscal_data_service,
)
from api.validation_service import validar_cnpj
from middleware.auth import require_auth

router = APIRouter(prefix="/fiscal-public", tags=["Consulta Fiscal"])


def _org_id(request: Request) -> str:
    return (request.headers.get("X-Org-Id") or "").strip() or "default"


class FiscalImportTextBody(BaseModel):
    content: str
    filename: Optional[str] = None
    provider: str = DEFAULT_PROVIDER
    source_label: str = DEFAULT_SOURCE_LABEL
    notes: Optional[str] = None


@router.get("/meta")
async def get_fiscal_snapshot_meta(
    request: Request,
    _user: dict = Depends(require_auth),
) -> dict[str, Any]:
    try:
        snapshot = public_fiscal_data_service.get_latest_snapshot_meta(_org_id(request))
        return {
            "success": True,
            "snapshot": snapshot,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/import")
async def import_fiscal_snapshot_file(
    request: Request,
    file: UploadFile = File(...),
    provider: str = Form(DEFAULT_PROVIDER),
    source_label: str = Form(DEFAULT_SOURCE_LABEL),
    notes: Optional[str] = Form(None),
    _user: dict = Depends(require_auth),
) -> dict[str, Any]:
    try:
        content = await file.read()
        snapshot = public_fiscal_data_service.import_snapshot(
            _org_id(request),
            content,
            filename=file.filename,
            provider=provider or DEFAULT_PROVIDER,
            source_label=source_label or DEFAULT_SOURCE_LABEL,
            notes=notes,
        )
        return {
            "success": True,
            "snapshot": snapshot,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/import-text")
async def import_fiscal_snapshot_text(
    request: Request,
    body: FiscalImportTextBody = Body(...),
    _user: dict = Depends(require_auth),
) -> dict[str, Any]:
    try:
        snapshot = public_fiscal_data_service.import_snapshot(
            _org_id(request),
            body.content.encode("utf-8"),
            filename=body.filename,
            provider=body.provider or DEFAULT_PROVIDER,
            source_label=body.source_label or DEFAULT_SOURCE_LABEL,
            notes=body.notes,
        )
        return {
            "success": True,
            "snapshot": snapshot,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{cnpj}")
async def lookup_fiscal_snapshot_by_cnpj(
    request: Request,
    cnpj: str = Path(..., description="CNPJ a consultar na base fiscal publica"),
    _user: dict = Depends(require_auth),
) -> dict[str, Any]:
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    cnpj_lookup = cnpj_limpo or "".join(ch for ch in str(cnpj or "") if ch.isdigit())[:14]
    if not cnpj_lookup:
        raise HTTPException(status_code=400, detail="CNPJ invalido")

    try:
        payload = public_fiscal_data_service.lookup_cnpj(_org_id(request), cnpj_lookup)
        return {
            "success": True,
            **payload,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
