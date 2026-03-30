"""
Router Assertiva — busca decisores/sócios por CNPJ via Assertiva Localize.
Suporte multi-tenant: cada org usa suas próprias credenciais OAuth2.
Cache de 7 dias no tenant Supabase + auditoria de consumo no master.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from config import settings
from middleware.auth import require_auth
from api.assertiva_service import AssertivaCNPJService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assertiva", tags=["Assertiva"])

# ── Cache de instâncias por org_id ─────────────────────────────────────────
_clients: dict[str, AssertivaCNPJService] = {}


def _get_client(org_id: str, client_id: str, client_secret: str) -> AssertivaCNPJService:
    """Retorna instância cacheada do serviço Assertiva para a org."""
    key = f"{org_id}:{client_id}"
    if key not in _clients:
        _clients[key] = AssertivaCNPJService(client_id=client_id, client_secret=client_secret)
    return _clients[key]


# ── Headers ────────────────────────────────────────────────────────────────

def _master_headers() -> dict[str, str]:
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _tenant_headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


# ── Helpers de tenant ──────────────────────────────────────────────────────

async def _get_org_assertiva_creds(org_id: str) -> tuple[str, str, str, str]:
    """
    Retorna (assertiva_client_id, assertiva_client_secret, supabase_url, supabase_service_key).
    Lança HTTPException se credenciais não estiverem configuradas.
    """
    async with httpx.AsyncClient(timeout=8) as c:
        r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_tenants",
            headers=_master_headers(),
            params={
                "select": "assertiva_client_id,assertiva_client_secret,supabase_url,supabase_service_key",
                "org_id": f"eq.{org_id}",
                "limit": "1",
            },
        )

    rows = r.json() if r.status_code == 200 and r.content else []
    if not rows:
        raise HTTPException(status_code=404, detail="Tenant não encontrado para esta organização")

    t = rows[0]
    client_id     = (t.get("assertiva_client_id") or "").strip()
    client_secret = (t.get("assertiva_client_secret") or "").strip()
    supa_url      = (t.get("supabase_url") or "").strip().rstrip("/")
    supa_key      = (t.get("supabase_service_key") or "").strip()

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=402,
            detail="Credenciais Assertiva não configuradas para esta organização. "
                   "Acesse o Painel Admin → Clientes e preencha os campos Assertiva.",
        )

    return client_id, client_secret, supa_url, supa_key


# ── Cache no tenant ────────────────────────────────────────────────────────

async def _check_cache(
    supa_url: str, supa_key: str, cnpj: str, max_age_days: int = 7
) -> Optional[dict]:
    """Retorna dados cacheados se dentro do TTL, senão None."""
    if not supa_url or not supa_key:
        return None

    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).isoformat()

    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                f"{supa_url}/rest/v1/decisores",
                headers=_tenant_headers(supa_key),
                params={
                    "select": "dados,buscado_em",
                    "cnpj": f"eq.{cnpj}",
                    "buscado_em": f"gte.{cutoff}",
                    "limit": "1",
                },
            )
        if r.status_code == 200 and r.content:
            rows = r.json()
            if rows:
                raw = rows[0].get("dados")
                return raw if isinstance(raw, dict) else json.loads(raw)
    except Exception as e:
        logger.warning("Erro ao checar cache decisores: %s", e)

    return None


async def _save_cache(supa_url: str, supa_key: str, cnpj: str, dados: dict) -> None:
    """Upsert dos dados no cache do tenant."""
    if not supa_url or not supa_key:
        return

    try:
        async with httpx.AsyncClient(timeout=8) as c:
            await c.post(
                f"{supa_url}/rest/v1/decisores",
                headers={
                    **_tenant_headers(supa_key),
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                json={
                    "cnpj": cnpj,
                    "dados": dados,
                    "buscado_em": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception as e:
        logger.warning("Erro ao salvar cache decisores: %s", e)


# ── Auditoria de consumo ───────────────────────────────────────────────────

async def _log_consulta(
    org_id: str, cnpj: str, cache_hit: bool, resultado: str = "success"
) -> None:
    """Registra consulta no master para monitoramento de consumo por org."""
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(
                f"{settings.SUPABASE_URL}/rest/v1/assertiva_consultas",
                headers={**_master_headers(), "Prefer": "return=minimal"},
                json={
                    "org_id": org_id,
                    "cnpj": cnpj,
                    "cache_hit": cache_hit,
                    "resultado": resultado,
                },
            )
    except Exception:
        pass  # auditoria nunca interrompe o fluxo principal


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/decisores/{cnpj}")
async def get_decisores(
    cnpj: str,
    refresh: bool = False,
    user: dict = Depends(require_auth),
) -> dict[str, Any]:
    """
    Busca decisores/sócios + telefones/WhatsApp de um CNPJ via Assertiva Localize.

    - Cache de 7 dias no Supabase do tenant.
    - Use ?refresh=true para forçar nova consulta (gasta cota).
    - Retorna { fonte: "cache"|"assertiva", dados: {...} }
    """
    cnpj_clean = "".join(filter(str.isdigit, cnpj))
    if len(cnpj_clean) != 14:
        raise HTTPException(status_code=400, detail="CNPJ inválido — informe 14 dígitos")

    org_id = user.get("org_id") or user.get("sub") or ""
    if not org_id:
        raise HTTPException(status_code=401, detail="Organização não identificada no token")

    # Credenciais do tenant
    client_id, client_secret, supa_url, supa_key = await _get_org_assertiva_creds(org_id)

    # Cache (se não forçar refresh)
    if not refresh:
        cached = await _check_cache(supa_url, supa_key, cnpj_clean)
        if cached:
            await _log_consulta(org_id, cnpj_clean, cache_hit=True)
            return {"fonte": "cache", "dados": cached}

    # Consulta na Assertiva
    client = _get_client(org_id, client_id, client_secret)

    try:
        dados = await client.consultar_cnpj(cnpj_clean)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        await _log_consulta(org_id, cnpj_clean, cache_hit=False, resultado="error")
        raise HTTPException(status_code=502, detail=str(e))

    resultado = "not_found" if not dados.get("encontrado") else "success"
    await _log_consulta(org_id, cnpj_clean, cache_hit=False, resultado=resultado)

    if dados.get("encontrado"):
        await _save_cache(supa_url, supa_key, cnpj_clean, dados)

    return {"fonte": "assertiva", "dados": dados}


# ── Cache pessoa_fisica no tenant ─────────────────────────────────────────

async def _check_cache_pf(
    supa_url: str, supa_key: str, cpf: str, max_age_days: int = 7
) -> Optional[dict]:
    if not supa_url or not supa_key:
        return None
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).isoformat()
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                f"{supa_url}/rest/v1/pessoa_fisica",
                headers=_tenant_headers(supa_key),
                params={
                    "select": "dados,buscado_em",
                    "cpf": f"eq.{cpf}",
                    "buscado_em": f"gte.{cutoff}",
                    "limit": "1",
                },
            )
        if r.status_code == 200 and r.content:
            rows = r.json()
            if rows:
                raw = rows[0].get("dados")
                return raw if isinstance(raw, dict) else json.loads(raw)
    except Exception as e:
        logger.warning("Erro ao checar cache pessoa_fisica: %s", e)
    return None


async def _save_cache_pf(supa_url: str, supa_key: str, cpf: str, dados: dict) -> None:
    if not supa_url or not supa_key:
        return
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            await c.post(
                f"{supa_url}/rest/v1/pessoa_fisica",
                headers={
                    **_tenant_headers(supa_key),
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                json={
                    "cpf": cpf,
                    "dados": dados,
                    "buscado_em": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception as e:
        logger.warning("Erro ao salvar cache pessoa_fisica: %s", e)


# ── Endpoint CPF ───────────────────────────────────────────────────────────

@router.get("/pessoa/{cpf}")
async def get_pessoa(
    cpf: str,
    refresh: bool = False,
    user: dict = Depends(require_auth),
) -> dict[str, Any]:
    """
    Busca dados pessoais (telefones/WhatsApp, e-mails, empresas) de uma
    Pessoa Física por CPF via Assertiva Localize.

    - Cache de 7 dias no Supabase do tenant.
    - Use ?refresh=true para forçar nova consulta (gasta cota).
    - Retorna { fonte: "cache"|"assertiva", dados: {...} }
    """
    cpf_clean = "".join(filter(str.isdigit, cpf))
    if len(cpf_clean) != 11:
        raise HTTPException(status_code=400, detail="CPF inválido — informe 11 dígitos")

    org_id = user.get("org_id") or user.get("sub") or ""
    if not org_id:
        raise HTTPException(status_code=401, detail="Organização não identificada no token")

    client_id, client_secret, supa_url, supa_key = await _get_org_assertiva_creds(org_id)

    if not refresh:
        cached = await _check_cache_pf(supa_url, supa_key, cpf_clean)
        if cached:
            await _log_consulta(org_id, cpf_clean, cache_hit=True)
            return {"fonte": "cache", "dados": cached}

    client = _get_client(org_id, client_id, client_secret)

    try:
        dados = await client.consultar_cpf(cpf_clean)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        await _log_consulta(org_id, cpf_clean, cache_hit=False, resultado="error")
        raise HTTPException(status_code=502, detail=str(e))

    resultado = "not_found" if not dados.get("encontrado") else "success"
    await _log_consulta(org_id, cpf_clean, cache_hit=False, resultado=resultado)

    if dados.get("encontrado"):
        await _save_cache_pf(supa_url, supa_key, cpf_clean, dados)

    return {"fonte": "assertiva", "dados": dados}


@router.get("/consumo")
async def get_consumo(user: dict = Depends(require_auth)) -> dict[str, Any]:
    """
    Retorna resumo de consumo Assertiva da organização no mês corrente.
    """
    org_id = user.get("org_id") or user.get("sub") or ""
    if not org_id:
        raise HTTPException(status_code=401, detail="Organização não identificada")

    inicio_mes = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0).isoformat()

    async with httpx.AsyncClient(timeout=8) as c:
        r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/assertiva_consultas",
            headers=_master_headers(),
            params={
                "select": "cache_hit,resultado",
                "org_id": f"eq.{org_id}",
                "consultado_em": f"gte.{inicio_mes}",
            },
        )

    rows = r.json() if r.status_code == 200 and r.content else []

    total       = len(rows)
    cache_hits  = sum(1 for r in rows if r.get("cache_hit"))
    api_calls   = total - cache_hits
    erros       = sum(1 for r in rows if r.get("resultado") == "error")
    nao_encontrados = sum(1 for r in rows if r.get("resultado") == "not_found")

    return {
        "mes": datetime.now(timezone.utc).strftime("%Y-%m"),
        "total_consultas": total,
        "api_calls": api_calls,
        "cache_hits": cache_hits,
        "erros": erros,
        "nao_encontrados": nao_encontrados,
    }
