from __future__ import annotations

"""
Filtro de prospecção por dívidas em aberto na base PGFN importada (fiscal_public_debts / app.duckdb).

Clientes internos (ex.: Quitou BR) podem ser listados em HERMES_PROSPECCAO_PGFN_ORG_IDS;
a importação nacional da PGFN na VPS pode ficar em HERMES_PG_PUBLIC_SNAPSHOT_ORG_ID.
"""

import logging
import os
from typing import Any, Dict, List, Optional, TypeVar

logger = logging.getLogger(__name__)

# ID da organização Quitou BR no Supabase (public.organizations.id) — header X-Org-Id / hermes.org_id.
QUITOU_BR_ORG_ID = "451d43bd-da3f-4709-9473-71721e7a55bf"

T = TypeVar("T")


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(minimum, int(raw))
    except ValueError:
        return default


def org_requires_pgfn_prospeccao_filter(org_id: Optional[str]) -> bool:
    """
    Quando True, a prospecção só devolve empresas com ao menos uma inscrição PGFN
    considerada em aberto (ver batch_cnpjs_divida_aberta).
    """
    if not org_id or not str(org_id).strip():
        return False
    raw = os.getenv("HERMES_PROSPECCAO_PGFN_ORG_IDS", "").strip()
    if not raw:
        return False
    allowed = {x.strip() for x in raw.split(",") if x.strip()}
    return str(org_id).strip() in allowed


def resolve_pgfn_snapshot_org_id(request_org_id: Optional[str]) -> str:
    """
    Org onde está o snapshot PGFN mais recente (importação em lote na VPS).
    Se vazio, usa o mesmo X-Org-Id da requisição.
    """
    override = os.getenv("HERMES_PG_PUBLIC_SNAPSHOT_ORG_ID", "").strip()
    if override:
        return override
    return (request_org_id or "").strip() or "default"


def prefetch_limit_for_pgfn(limite_desejado: int, *, max_cap: int = 2000) -> int:
    """Busca mais linhas na Receita antes de filtrar pela PGFN."""
    mult = _env_int("HERMES_PROSPECCAO_PGFN_PREFETCH_MULTIPLIER", 25, minimum=2)
    return min(max_cap, max(limite_desejado, limite_desejado * mult))


def aplicar_filtro_pgfn_empresas_dict(
    org_id_request: Optional[str],
    empresas: List[Dict[str, Any]],
    limite_desejado: int,
) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Filtra lista de dicts (API /prospeccao otimizada)."""
    if not org_requires_pgfn_prospeccao_filter(org_id_request):
        return empresas, {}
    from api.public_fiscal_data import public_fiscal_data_service

    pgfn_org = resolve_pgfn_snapshot_org_id(org_id_request)
    cnpjs = [str(e.get("cnpj") or "") for e in empresas]
    permitidos = public_fiscal_data_service.batch_cnpjs_divida_aberta(pgfn_org, cnpjs)
    filtradas = [e for e in empresas if str(e.get("cnpj") or "") in permitidos][:limite_desejado]
    meta = _meta_pgfn(len(empresas), len(filtradas), pgfn_org)
    if not filtradas and empresas:
        logger.warning(
            "PGFN prospecção: nenhum candidato com dívida em aberto | request_org=%s pgfn_org=%s candidatos=%s",
            org_id_request,
            pgfn_org,
            len(empresas),
        )
    return filtradas, meta


def aplicar_filtro_pgfn_empresas_pydantic(
    org_id_request: Optional[str],
    empresas: List[T],
    limite_desejado: int,
) -> tuple[List[T], Dict[str, Any]]:
    """Filtra lista de modelos Empresa (rodar_prospeccao_icp)."""
    if not org_requires_pgfn_prospeccao_filter(org_id_request):
        return empresas, {}
    from api.public_fiscal_data import public_fiscal_data_service

    pgfn_org = resolve_pgfn_snapshot_org_id(org_id_request)
    cnpjs = [getattr(e, "cnpj", "") or "" for e in empresas]
    permitidos = public_fiscal_data_service.batch_cnpjs_divida_aberta(pgfn_org, cnpjs)
    filtradas = [e for e in empresas if (getattr(e, "cnpj", "") or "") in permitidos][:limite_desejado]
    meta = _meta_pgfn(len(empresas), len(filtradas), pgfn_org)
    if not filtradas and empresas:
        logger.warning(
            "PGFN prospecção: nenhum candidato com dívida em aberto | request_org=%s pgfn_org=%s candidatos=%s",
            org_id_request,
            pgfn_org,
            len(empresas),
        )
    return filtradas, meta


def _meta_pgfn(candidatos: int, retidos: int, pgfn_org: str) -> Dict[str, Any]:
    return {
        "pgfn_filtrado": True,
        "pgfn_snapshot_org": pgfn_org,
        "candidatos_antes_pgfn": candidatos,
        "retidos_com_divida_aberta_pgfn": retidos,
    }
