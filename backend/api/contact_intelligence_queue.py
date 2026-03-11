from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from api.cache_service import cache_service
from config import settings

try:
    from redis import Redis
    from rq import Queue
except ImportError:
    Redis = None  # type: ignore
    Queue = None  # type: ignore


logger = logging.getLogger(__name__)

CONTACT_INTELLIGENCE_JOB = (
    os.getenv("HERMES_CONTACT_INTELLIGENCE_JOB", "").strip()
    or "api.jobs_enhanced.resolve_contact_intelligence_job"
)
CONTACT_INTELLIGENCE_TIMEOUT = max(
    120,
    int(os.getenv("HERMES_CONTACT_INTELLIGENCE_JOB_TIMEOUT", "900") or 900),
)
CONTACT_INTELLIGENCE_STATUS_TTL = max(
    300,
    int(os.getenv("HERMES_CONTACT_INTELLIGENCE_STATUS_TTL", "21600") or 21600),
)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_contact_intelligence_status(
    cnpj: str,
    *,
    status: str,
    cached: bool = False,
    queued: bool = False,
    error: Optional[str] = None,
    job_id: Optional[str] = None,
    probe_smtp: bool = False,
    refresh: bool = False,
    started_at: Optional[str] = None,
    finished_at: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "cnpj": cnpj,
        "status": status,
        "cached": cached,
        "queued": queued,
        "error": error,
        "job_id": job_id,
        "probe_smtp": probe_smtp,
        "refresh": refresh,
        "started_at": started_at,
        "finished_at": finished_at,
        "updated_at": _utcnow_iso(),
    }


def set_contact_intelligence_status(cnpj: str, payload: Dict[str, Any]) -> bool:
    return cache_service.set(
        "contact_intelligence_status",
        payload,
        ttl=CONTACT_INTELLIGENCE_STATUS_TTL,
        cnpj=cnpj,
    )


def get_contact_intelligence_status(cnpj: str) -> Optional[Dict[str, Any]]:
    status = cache_service.get("contact_intelligence_status", cnpj=cnpj)
    if isinstance(status, dict):
        return status
    return None


def clear_contact_intelligence_status(cnpj: str) -> bool:
    return cache_service.delete("contact_intelligence_status", cnpj=cnpj)


def queue_contact_intelligence(
    cnpj: str,
    *,
    probe_smtp: bool = False,
    refresh: bool = False,
) -> Dict[str, Any]:
    from api.contact_intelligence import contact_intelligence_service

    if not refresh:
        cached = contact_intelligence_service.get_cached_company_intelligence(cnpj)
        if cached:
            completed = build_contact_intelligence_status(
                cnpj,
                status="completed",
                cached=True,
                queued=False,
                probe_smtp=probe_smtp,
                refresh=refresh,
                finished_at=_utcnow_iso(),
            )
            set_contact_intelligence_status(cnpj, completed)
            completed["intelligence"] = cached
            return completed

    existing = get_contact_intelligence_status(cnpj)
    if existing and existing.get("status") in {"queued", "running"} and not refresh:
        return existing

    if Redis is None or Queue is None:
        raise RuntimeError("Fila Redis/RQ indisponivel para Contact Intelligence")

    if not settings.REDIS_URL:
        raise RuntimeError("REDIS_URL nao configurado para Contact Intelligence")

    conn = Redis.from_url(settings.REDIS_URL)
    queue = Queue("hermes", connection=conn)
    job = queue.enqueue(
        CONTACT_INTELLIGENCE_JOB,
        cnpj,
        probe_smtp,
        refresh,
        job_timeout=CONTACT_INTELLIGENCE_TIMEOUT,
    )

    payload = build_contact_intelligence_status(
        cnpj,
        status="queued",
        queued=True,
        job_id=getattr(job, "id", None),
        probe_smtp=probe_smtp,
        refresh=refresh,
    )
    set_contact_intelligence_status(cnpj, payload)
    logger.info("Contact Intelligence enfileirado para %s", cnpj)
    return payload

