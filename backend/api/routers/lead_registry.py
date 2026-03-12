from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from api.company_intelligence_extras import company_intelligence_extras_service
from api.db_pool import get_connection
from api.lead_refresh_queue import queue_lead_refresh_job
from api.lead_registry import build_watch_snapshot, lead_registry_service
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


class SavedSearchCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=400)
    config: Dict[str, Any]
    kind: Optional[str] = Field(default="search", max_length=40)
    source: Optional[str] = Field(default=None, max_length=120)


class SavedSearchUpdateBody(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=400)
    config: Optional[Dict[str, Any]] = None
    kind: Optional[str] = Field(default=None, max_length=40)
    source: Optional[str] = Field(default=None, max_length=120)


class WatchCompanyCreateBody(BaseModel):
    cnpj: Optional[str] = None
    empresa: Optional[Dict[str, Any]] = None
    reason: Optional[str] = Field(default=None, max_length=300)
    source: Optional[str] = Field(default=None, max_length=120)


class LeadRefreshJobCreateBody(BaseModel):
    source_kind: str = Field(..., min_length=1, max_length=40)
    source_ref: Optional[str] = Field(default=None, max_length=120)
    cnpjs: Optional[List[str]] = None
    name: Optional[str] = Field(default=None, max_length=160)
    limit_targets: int = Field(default=50, ge=1, le=250)
    probe_smtp: bool = False
    refresh_external_signals: bool = False


def _normalize_cnpj(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())[:14]


def _fetch_watch_company(cnpj: str) -> Optional[Dict[str, Any]]:
    cnpj_clean = _normalize_cnpj(cnpj)
    if not cnpj_clean:
        return None

    with get_connection(read_only=True) as conn:
        row = conn.execute(
            """
            SELECT
                cnpj,
                RAZAO_SOCIAL,
                NOME_FANTASIA,
                cidade_nome,
                UF,
                site,
                COALESCE(email_enriquecido, email_receita) AS email_final,
                COALESCE(telefone_enriquecido, telefone_receita) AS telefone_final,
                whatsapp_publico,
                whatsapp_enriquecido
            FROM vw_prospeccao_base
            WHERE cnpj = ?
            LIMIT 1
            """,
            [cnpj_clean],
        ).fetchone()

    if not row:
        return None

    return {
        "cnpj": str(row[0]),
        "razao_social": str(row[1]) if row[1] else None,
        "nome_fantasia": str(row[2]) if row[2] else None,
        "cidade": str(row[3]) if row[3] else None,
        "uf": str(row[4]) if row[4] else None,
        "site": str(row[5]) if row[5] else None,
        "email_final": str(row[6]) if row[6] else None,
        "telefone_final": str(row[7]) if row[7] else None,
        "whatsapp_publico": str(row[8]) if row[8] else None,
        "whatsapp_enriquecido": str(row[9]) if row[9] else None,
    }


def _normalize_refresh_source_kind(value: Any) -> str:
    raw = str(value or "").strip().lower()
    aliases = {
        "lista": "lead_list",
        "lead-list": "lead_list",
        "lead_list": "lead_list",
        "search": "saved_search",
        "saved-search": "saved_search",
        "saved_search": "saved_search",
        "watch": "watchlist",
        "watch-list": "watchlist",
        "watchlist": "watchlist",
        "manual": "manual",
    }
    return aliases.get(raw, raw or "manual")


def _resolve_refresh_targets(
    org_id: str,
    body: LeadRefreshJobCreateBody,
) -> tuple[str, str | None, str | None, List[str]]:
    source_kind = _normalize_refresh_source_kind(body.source_kind)
    limit_targets = max(1, min(int(body.limit_targets or 50), 250))

    if source_kind == "manual":
        cnpjs = [_normalize_cnpj(value) for value in (body.cnpjs or [])]
        resolved = [cnpj for cnpj in cnpjs if cnpj]
        return source_kind, None, "CNPJs manuais", resolved[:limit_targets]

    if source_kind == "lead_list":
        if not body.source_ref:
            raise HTTPException(status_code=400, detail="Informe a lista para o refresh.")
        items = lead_registry_service.get_list_items(org_id, body.source_ref)
        resolved = [item["cnpj"] for item in items if item.get("cnpj")]
        selected = next((item for item in lead_registry_service.list_lists(org_id) if item["id"] == body.source_ref), None)
        if selected is None:
            raise HTTPException(status_code=404, detail="Lista nao encontrada para refresh.")
        return source_kind, body.source_ref, selected.get("name"), resolved[:limit_targets]

    if source_kind == "watchlist":
        if body.source_ref:
            cnpj = _normalize_cnpj(body.source_ref)
            if not cnpj:
                raise HTTPException(status_code=400, detail="CNPJ invalido para refresh da watchlist.")
            watch = lead_registry_service.get_watch_company(org_id, cnpj)
            if not watch:
                raise HTTPException(status_code=404, detail="Empresa nao encontrada na watchlist.")
            return source_kind, cnpj, watch.get("nome_fantasia") or watch.get("razao_social") or cnpj, [cnpj]
        watchlist = lead_registry_service.list_watchlist(org_id)
        resolved = [item["cnpj"] for item in watchlist if item.get("cnpj")]
        return source_kind, None, "Watchlist", resolved[:limit_targets]

    if source_kind == "saved_search":
        if not body.source_ref:
            raise HTTPException(status_code=400, detail="Informe a busca salva para o refresh.")
        saved_search = lead_registry_service.get_saved_search(org_id, body.source_ref)
        if not saved_search:
            raise HTTPException(status_code=404, detail="Busca salva nao encontrada para refresh.")
        try:
            from api.main import ProspeccaoConfig, rodar_prospeccao_icp

            config = ProspeccaoConfig.model_validate(saved_search.get("config") or {})
            config = _apply_suppression_registry(config, org_id)
            result = rodar_prospeccao_icp(config)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Falha ao resolver a busca salva: {exc}")

        resolved = [
            _normalize_cnpj(item.get("cnpj"))
            for item in (result.get("empresas") or [])
            if isinstance(item, dict)
        ]
        return source_kind, body.source_ref, saved_search.get("name"), [cnpj for cnpj in resolved if cnpj][:limit_targets]

    raise HTTPException(status_code=400, detail="Tipo de refresh em lote nao suportado.")


def _apply_suppression_registry(config: Any, org_id: str) -> Any:
    suppressed_cnpjs = lead_registry_service.get_suppressed_cnpjs(org_id)
    if not suppressed_cnpjs:
        return config

    current = list(getattr(config, "excluir_cnpjs", None) or [])
    merged = sorted({str(cnpj).strip() for cnpj in current + suppressed_cnpjs if str(cnpj).strip()})
    next_config = config.model_copy(deep=True)
    next_config.excluir_cnpjs = merged
    return next_config


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


@router.get("/saved-searches")
async def list_saved_searches(
    request: Request,
    kind: Optional[str] = None,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    return lead_registry_service.list_saved_searches(_org_id(request), kind=kind)


@router.post("/saved-searches")
async def create_saved_search(
    body: SavedSearchCreateBody,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    try:
        return lead_registry_service.create_saved_search(
            _org_id(request),
            name=body.name,
            description=body.description,
            config=body.config,
            kind=body.kind or "search",
            source=body.source,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/saved-searches/{search_id}")
async def update_saved_search(
    search_id: str,
    body: SavedSearchUpdateBody,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    try:
        updated = lead_registry_service.update_saved_search(
            _org_id(request),
            search_id,
            name=body.name,
            description=body.description,
            config=body.config,
            kind=body.kind,
            source=body.source,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not updated:
        raise HTTPException(status_code=404, detail="Busca salva nao encontrada.")
    return {"ok": True}


@router.delete("/saved-searches/{search_id}")
async def delete_saved_search(
    search_id: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    deleted = lead_registry_service.delete_saved_search(_org_id(request), search_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Busca salva nao encontrada.")
    return {"ok": True}


@router.post("/saved-searches/{search_id}/preview")
async def preview_saved_search(
    search_id: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Any:
    saved_search = lead_registry_service.get_saved_search(_org_id(request), search_id)
    if not saved_search:
        raise HTTPException(status_code=404, detail="Busca salva nao encontrada.")

    try:
        from api.main import ProspeccaoConfig, rodar_prospeccao_icp

        config = ProspeccaoConfig.model_validate(saved_search.get("config") or {})
        config = _apply_suppression_registry(config, _org_id(request))
        result = rodar_prospeccao_icp(config)
        lead_registry_service.touch_saved_search_run(_org_id(request), search_id)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Falha ao rodar busca salva: {exc}")


@router.get("/company-watchlist")
async def list_company_watchlist(
    request: Request,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    return lead_registry_service.list_watchlist(_org_id(request))


@router.post("/company-watchlist")
async def create_company_watchlist(
    body: WatchCompanyCreateBody,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    company = dict(body.empresa or {})
    cnpj = _normalize_cnpj(company.get("cnpj") or body.cnpj)
    if not cnpj:
        raise HTTPException(status_code=400, detail="Informe um CNPJ valido para seguir a empresa.")

    if not company:
        company = _fetch_watch_company(cnpj) or {}
    else:
        company["cnpj"] = cnpj

    if not company:
        raise HTTPException(status_code=404, detail="Empresa nao encontrada para acompanhar.")

    try:
        lead_registry_service.upsert_watch_company(
            _org_id(request),
            company,
            reason=body.reason,
            source=body.source,
        )
        sync = lead_registry_service.sync_watch_snapshot(
            _org_id(request),
            cnpj,
            build_watch_snapshot(company),
            company=company,
            source=body.source,
        )
        return {"ok": True, **sync}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/company-watchlist/{cnpj}/refresh")
async def refresh_company_watchlist(
    cnpj: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    company = _fetch_watch_company(cnpj)
    if not company:
        raise HTTPException(status_code=404, detail="Empresa nao encontrada para refresh da watchlist.")

    try:
        sync_result = lead_registry_service.sync_watch_snapshot(
            _org_id(request),
            cnpj,
            build_watch_snapshot(company),
            company=company,
            source="watch_refresh",
        )
        external_signals = await company_intelligence_extras_service.fetch_external_signals(cnpj, company=company)
        recorded = lead_registry_service.record_company_signals(_org_id(request), cnpj, external_signals)
        merged_signals = list(sync_result.get("signals") or []) + recorded
        return {
            "ok": True,
            "watch": sync_result.get("watch"),
            "signals": merged_signals,
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/company-watchlist/{cnpj}")
async def delete_company_watchlist(
    cnpj: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    deleted = lead_registry_service.delete_watch_company(_org_id(request), cnpj)
    if not deleted:
        raise HTTPException(status_code=404, detail="Empresa nao encontrada na watchlist.")
    return {"ok": True}


@router.get("/company-signals")
async def list_company_signals(
    request: Request,
    cnpj: Optional[str] = None,
    limit: int = 100,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    return lead_registry_service.list_company_signals(_org_id(request), cnpj=cnpj, limit=limit)


@router.get("/lead-refresh-jobs")
async def list_lead_refresh_jobs(
    request: Request,
    limit: int = 20,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    return lead_registry_service.list_refresh_jobs(_org_id(request), limit=limit)


@router.get("/lead-refresh-jobs/{job_id}")
async def get_lead_refresh_job(
    job_id: str,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    job = lead_registry_service.get_refresh_job(_org_id(request), job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job de refresh nao encontrado.")
    return job


@router.get("/lead-refresh-jobs/{job_id}/targets")
async def list_lead_refresh_job_targets(
    job_id: str,
    request: Request,
    limit: int = 200,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    job = lead_registry_service.get_refresh_job(_org_id(request), job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job de refresh nao encontrado.")
    return lead_registry_service.list_refresh_job_targets(_org_id(request), job_id, limit=limit)


@router.get("/lead-refresh-states")
async def list_lead_refresh_states(
    request: Request,
    due_only: bool = False,
    limit: int = 100,
    _user: dict = Depends(require_auth),
) -> List[Dict[str, Any]]:
    return lead_registry_service.list_refresh_states(_org_id(request), due_only=due_only, limit=limit)


@router.post("/lead-refresh-jobs")
async def create_lead_refresh_job(
    body: LeadRefreshJobCreateBody,
    request: Request,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    org_id = _org_id(request)
    source_kind, source_ref, source_label, cnpjs = _resolve_refresh_targets(org_id, body)
    if not cnpjs:
        raise HTTPException(status_code=400, detail="Nenhum CNPJ disponivel para o refresh em lote.")

    options = {
        "probe_smtp": body.probe_smtp,
        "refresh_external_signals": body.refresh_external_signals or source_kind == "watchlist",
        "refresh_enrichment": True,
        "refresh_contact_intelligence": True,
        "sync_watchlist": True,
    }

    try:
        job = lead_registry_service.create_refresh_job(
            org_id,
            name=body.name or f"Refresh {source_label or source_kind}",
            source_kind=source_kind,
            source_ref=source_ref,
            source_label=source_label,
            cnpjs=cnpjs,
            options=options,
        )
        queued = queue_lead_refresh_job(org_id, job["id"])
        return queued or job
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
