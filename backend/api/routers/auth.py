"""
Router de autenticacao e registro.
Permite signup com criacao automatica de org + plano free.
Permite signup com plano pago (redireciona para checkout Asaas).

Seguranca:
  - Rate limiting por IP (5 tentativas/minuto para signup)
  - Validacao de email por regex
  - Sanitizacao de inputs

Endpoints:
  POST /auth/signup          - Criar conta + org (plano free)
  POST /auth/signup-with-plan - Criar conta + org + checkout Asaas
"""
import re
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from collections import defaultdict

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

# ── Rate limiting in-memory (por IP) ──────────────────────────────────────────
_signup_attempts: dict[str, list[float]] = defaultdict(list)
SIGNUP_RATE_LIMIT = 5
SIGNUP_RATE_WINDOW = 60


def _check_signup_rate(ip: str):
    now = time.time()
    _signup_attempts[ip] = [t for t in _signup_attempts[ip] if now - t < SIGNUP_RATE_WINDOW]
    if len(_signup_attempts[ip]) >= SIGNUP_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Muitas tentativas de cadastro. Tente novamente em {SIGNUP_RATE_WINDOW}s.",
            headers={"Retry-After": str(SIGNUP_RATE_WINDOW)},
        )
    _signup_attempts[ip].append(now)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real = request.headers.get("X-Real-IP")
    if real:
        return real
    return request.client.host if request.client else "unknown"


# ── Email regex (RFC 5322 simplificado) ──────────────────────────────────────
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


# ── Supabase helpers ─────────────────────────────────────────────────────────

def _supabase_admin_headers() -> dict:
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def _supabase_rest_headers() -> dict:
    return {
        **_supabase_admin_headers(),
        "Prefer": "return=representation",
    }


# ── Models ───────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(..., min_length=2, max_length=100)
    org_name: Optional[str] = Field(None, max_length=100)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Email invalido.")
        return v

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return re.sub(r"[<>&\"']", "", v.strip())


class SignupWithPlanRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(..., min_length=2, max_length=100)
    org_name: Optional[str] = Field(None, max_length=100)
    plan_name: str = Field(..., pattern="^(starter|pro|enterprise)$")
    billing_type: str = Field(..., pattern="^(PIX|BOLETO|CREDIT_CARD)$")
    cpf_cnpj: str = Field(..., min_length=11, max_length=18)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Email invalido.")
        return v

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return re.sub(r"[<>&\"']", "", v.strip())

    @field_validator("cpf_cnpj")
    @classmethod
    def validate_cpf_cnpj(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) not in (11, 14):
            raise ValueError("CPF ou CNPJ invalido.")
        return digits


# ── Supabase operations ──────────────────────────────────────────────────────

async def _create_supabase_user(email: str, password: str, name: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers=_supabase_admin_headers(),
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"name": name},
            },
        )
        if r.status_code >= 400:
            body = r.json() if r.content else {}
            msg = body.get("msg") or body.get("message") or body.get("error", "Erro ao criar usuario")
            if "already been registered" in str(msg).lower() or "already exists" in str(msg).lower():
                raise HTTPException(status_code=409, detail="Este email ja esta cadastrado.")
            logger.error("Supabase create user: %d %s", r.status_code, r.text[:300])
            raise HTTPException(status_code=502, detail=str(msg))
        return r.json()


async def _create_org(user_id: str, org_name: str, plan_id: Optional[str] = None) -> dict:
    slug = re.sub(r"[^a-z0-9]+", "-", org_name.lower()).strip("-")
    slug = f"{slug}-{user_id[:8]}"

    data: dict = {"name": org_name, "slug": slug, "owner_id": user_id}
    if plan_id:
        data["plan_id"] = plan_id

    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            f"{settings.SUPABASE_URL}/rest/v1/organizations",
            headers=_supabase_rest_headers(),
            json=data,
        )
        if r.status_code >= 400:
            logger.error("Create org: %d %s", r.status_code, r.text[:300])
            raise HTTPException(status_code=502, detail="Erro ao criar organizacao.")
        result = r.json()
        return result[0] if isinstance(result, list) else result


async def _add_org_member(org_id: str, user_id: str, role: str = "owner"):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            f"{settings.SUPABASE_URL}/rest/v1/org_members",
            headers=_supabase_rest_headers(),
            json={"org_id": org_id, "user_id": user_id, "role": role},
        )
        if r.status_code >= 400:
            logger.warning("Add member: %d %s", r.status_code, r.text[:200])


async def _sign_in_user(email: str, password: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": settings.SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"email": email, "password": password},
        )
        if r.status_code >= 400:
            return {}
        return r.json()


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/signup")
async def signup(body: SignupRequest, request: Request):
    _check_signup_rate(_get_client_ip(request))

    user = await _create_supabase_user(body.email, body.password, body.name)
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=502, detail="Erro ao obter ID do usuario.")

    org_name = body.org_name or f"Org de {body.name}"
    org = await _create_org(user_id, org_name)
    org_id = org.get("id")

    if org_id:
        await _add_org_member(org_id, user_id, "owner")

    session = await _sign_in_user(body.email, body.password)

    return {
        "user_id": user_id,
        "org_id": org_id,
        "plan": "free",
        "access_token": session.get("access_token"),
        "refresh_token": session.get("refresh_token"),
        "expires_in": session.get("expires_in"),
    }


@router.post("/signup-with-plan")
async def signup_with_plan(body: SignupWithPlanRequest, request: Request):
    _check_signup_rate(_get_client_ip(request))

    user = await _create_supabase_user(body.email, body.password, body.name)
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=502, detail="Erro ao obter ID do usuario.")

    org_name = body.org_name or f"Org de {body.name}"
    org = await _create_org(user_id, org_name)
    org_id = org.get("id")

    if org_id:
        await _add_org_member(org_id, user_id, "owner")

    session = await _sign_in_user(body.email, body.password)

    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(
            f"{settings.SUPABASE_URL}/rest/v1/plans?name=eq.{body.plan_name}&select=id,name,price_brl",
            headers=_supabase_rest_headers(),
        )
        plans = r.json() if r.status_code < 300 else []

    if not plans:
        raise HTTPException(status_code=400, detail="Plano nao encontrado.")
    plan = plans[0]

    if float(plan["price_brl"]) <= 0:
        return {
            "user_id": user_id,
            "org_id": org_id,
            "plan": "free",
            "access_token": session.get("access_token"),
            "refresh_token": session.get("refresh_token"),
            "checkout": None,
        }

    asaas_key = getattr(settings, "ASAAS_API_KEY", "") or ""
    asaas_sandbox = getattr(settings, "ASAAS_SANDBOX", True)
    asaas_base = "https://api-sandbox.asaas.com" if asaas_sandbox else "https://api.asaas.com"

    if not asaas_key:
        return {
            "user_id": user_id,
            "org_id": org_id,
            "plan": body.plan_name,
            "access_token": session.get("access_token"),
            "refresh_token": session.get("refresh_token"),
            "checkout": None,
            "note": "Asaas nao configurado. Plano sera ativado manualmente.",
        }

    cpf_cnpj = body.cpf_cnpj
    asaas_headers = {"Content-Type": "application/json", "access_token": asaas_key}

    async with httpx.AsyncClient(timeout=30) as c:
        cust = await c.post(f"{asaas_base}/v3/customers", headers=asaas_headers, json={
            "name": body.name,
            "cpfCnpj": cpf_cnpj,
            "email": body.email,
            "externalReference": org_id,
        })
        customer_id = cust.json().get("id") if cust.status_code < 300 else None

    if not customer_id:
        logger.error("Asaas customer creation failed: %s", cust.text[:300] if cust else "no response")
        return {
            "user_id": user_id,
            "org_id": org_id,
            "plan": body.plan_name,
            "access_token": session.get("access_token"),
            "checkout": None,
            "note": "Erro ao criar cliente no Asaas.",
        }

    next_due = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    ext_ref = f"hermes_sub:{org_id}:{body.plan_name}"

    async with httpx.AsyncClient(timeout=30) as c:
        sub = await c.post(f"{asaas_base}/v3/subscriptions", headers=asaas_headers, json={
            "customer": customer_id,
            "billingType": body.billing_type,
            "value": round(float(plan["price_brl"]), 2),
            "nextDueDate": next_due,
            "cycle": "MONTHLY",
            "description": f"Hermes - Plano {plan['name'].capitalize()}",
            "externalReference": ext_ref,
        })
        sub_data = sub.json() if sub.status_code < 300 else {}

    sub_id = sub_data.get("id")
    if sub_id and org_id:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(
                f"{settings.SUPABASE_URL}/rest/v1/subscriptions",
                headers=_supabase_rest_headers(),
                json={
                    "org_id": org_id,
                    "plan_id": plan["id"],
                    "status": "active",
                    "asaas_customer_id": customer_id,
                    "asaas_subscription_id": sub_id,
                    "current_period_start": datetime.now(timezone.utc).isoformat(),
                    "current_period_end": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                },
            )

    return {
        "user_id": user_id,
        "org_id": org_id,
        "plan": body.plan_name,
        "access_token": session.get("access_token"),
        "refresh_token": session.get("refresh_token"),
        "expires_in": session.get("expires_in"),
        "checkout": {
            "subscription_id": sub_id,
            "value": float(plan["price_brl"]),
            "next_due_date": next_due,
            "invoice_url": sub_data.get("invoiceUrl"),
        },
    }
