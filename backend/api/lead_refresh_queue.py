from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from config import settings

from api.lead_registry import lead_registry_service

try:
    from redis import Redis
    from rq import Queue
except ImportError:
    Redis = None  # type: ignore
    Queue = None  # type: ignore


logger = logging.getLogger(__name__)

LEAD_REFRESH_JOB = (
    os.getenv("HERMES_LEAD_REFRESH_JOB", "").strip()
    or "api.jobs_enhanced.run_lead_refresh_job"
)
LEAD_REFRESH_TIMEOUT = max(
    120,
    int(os.getenv("HERMES_LEAD_REFRESH_TIMEOUT", "1800") or 1800),
)


def queue_lead_refresh_job(org_id: str, job_id: str) -> Optional[Dict[str, Any]]:
    if Redis is None or Queue is None or not settings.REDIS_URL:
        logger.warning("Fila Redis/RQ indisponivel para lead refresh; executando inline")
        from api.jobs_enhanced import run_lead_refresh_job

        run_lead_refresh_job(org_id, job_id)
        return lead_registry_service.get_refresh_job(org_id, job_id)

    conn = Redis.from_url(settings.REDIS_URL)
    queue = Queue("hermes", connection=conn)
    job = queue.enqueue(
        LEAD_REFRESH_JOB,
        org_id,
        job_id,
        job_timeout=LEAD_REFRESH_TIMEOUT,
    )
    lead_registry_service.attach_refresh_job_queue(org_id, job_id, getattr(job, "id", None))
    return lead_registry_service.get_refresh_job(org_id, job_id)
