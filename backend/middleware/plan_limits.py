"""
Middleware de verificação de limites do plano Supabase.
Integrado com a função consume_usage() do Supabase.

Uso nos endpoints:
    @app.post("/prospeccao/run")
    async def run(
        config: ProspeccaoConfig,
        user: dict = Depends(require_auth),
        _: None = Depends(require_plan_limit("search")),
    ):
        ...
"""
import logging
from functools import lru_cache
from typing import Optional

from fastapi import Depends, HTTPException, status
from supabase import create_client, Client

from config import settings
from middleware.auth import require_auth

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_supabase() -> Client:
    """Retorna cliente Supabase com service role (acesso total)."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em produção."
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def get_user_org(user_id: str) -> Optional[dict]:
    """
    Busca a organização ativa do usuário.
    Retorna o primeiro org onde ele é membro.
    """
    try:
        sb = _get_supabase()
        result = (
            sb.table("org_members")
            .select("org_id, role, organizations(id, name, slug, plan_id, credits_balance, is_active, plans(*))")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error("Erro ao buscar org do usuário %s: %r", user_id, e)
    return None


def check_and_consume_usage(org_id: str, user_id: str, action: str, count: int = 1) -> dict:
    """
    Chama a função RPC consume_usage() no Supabase.
    Retorna {'allowed': bool, 'used': int, 'limit': int, 'reason': str?}
    """
    try:
        sb = _get_supabase()
        result = sb.rpc(
            "consume_usage",
            {
                "p_org_id": org_id,
                "p_user_id": user_id,
                "p_action": action,
                "p_count": count,
            }
        ).execute()
        return result.data or {"allowed": False, "reason": "rpc_error"}
    except Exception as e:
        logger.error("Erro ao consumir uso (org=%s, action=%s): %r", org_id, action, e)
        from config import settings as _s
        if _s.is_production:
            return {"allowed": False, "reason": "service_unavailable"}
        return {"allowed": True, "warn": "supabase_unavailable_dev"}


def require_plan_limit(action: str, count: int = 1):
    """
    Dependency do FastAPI que:
    1. Busca a org do usuário autenticado
    2. Chama consume_usage() no Supabase
    3. Levanta 402 se o limite do plano foi atingido

    Exemplo de actions: 'search', 'enrich', 'export_csv', 'export_crm'
    """
    async def _check(user: dict = Depends(require_auth)):
        user_id: str = user.get("sub") or user.get("id") or ""
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuário não identificado.",
            )

        # Busca org
        org_data = get_user_org(user_id)
        if not org_data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nenhuma organização encontrada. Crie uma org para continuar.",
            )

        org = org_data.get("organizations") or {}
        org_id: str = org.get("id") or org_data.get("org_id", "")

        if not org.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Sua organização está inativa. Verifique sua assinatura.",
            )

        # Verifica e consome o limite
        result = check_and_consume_usage(org_id, user_id, action, count)

        if not result.get("allowed", True):
            reason = result.get("reason", "limit_exceeded")
            used   = result.get("used", "?")
            limit  = result.get("limit", "?")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"Limite mensal atingido para '{action}' "
                    f"({used}/{limit}). Faça upgrade do plano ou compre créditos."
                ),
            )

    return _check
