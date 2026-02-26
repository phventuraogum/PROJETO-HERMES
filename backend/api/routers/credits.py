"""
Router de creditos, assinaturas e webhooks Asaas.
Integrado com Supabase para persistencia real.

Seguranca:
  - Webhook validado por HMAC timing-safe
  - Idempotencia: pagamentos ja confirmados nao sao processados novamente
  - Creditos atomicos: usa increment em vez de GET+SET (previne race condition)

Endpoints:
  GET  /credits              - Saldo da org
  GET  /credits/packages     - Pacotes de creditos avulsos
  POST /credits/checkout     - Gerar cobranca (PIX/BOLETO)
  GET  /plans                - Listar planos disponiveis
  POST /subscribe/checkout   - Gerar assinatura recorrente
  POST /webhooks/asaas       - Webhook do Asaas (publico, validado por token)
"""
import re
import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, Field
from config import settings
from middleware.auth import require_auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Credits & Billing"])

# ── Supabase helper ─────────────────────────────────────────────────────────

def _supabase_headers() -> dict:
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _supabase_url(path: str) -> str:
    return f"{settings.SUPABASE_URL}/rest/v1{path}"


async def _supabase_get(path: str, params: dict = None) -> list:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(_supabase_url(path), headers=_supabase_headers(), params=params or {})
        if r.status_code >= 400:
            logger.error("Supabase GET %s: %d %s", path, r.status_code, r.text[:200])
            return []
        return r.json()


async def _supabase_post(path: str, data: dict) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(_supabase_url(path), headers=_supabase_headers(), json=data)
        if r.status_code >= 400:
            logger.error("Supabase POST %s: %d %s", path, r.status_code, r.text[:200])
            return None
        result = r.json()
        return result[0] if isinstance(result, list) and result else result


async def _supabase_patch(path: str, data: dict) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.patch(_supabase_url(path), headers=_supabase_headers(), json=data)
        if r.status_code >= 400:
            logger.error("Supabase PATCH %s: %d %s", path, r.status_code, r.text[:200])
            return None
        result = r.json()
        return result[0] if isinstance(result, list) and result else result


async def _supabase_rpc(fn: str, params: dict) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            f"{settings.SUPABASE_URL}/rest/v1/rpc/{fn}",
            headers=_supabase_headers(),
            json=params,
        )
        if r.status_code >= 400:
            logger.error("Supabase RPC %s: %d %s", fn, r.status_code, r.text[:200])
            return None
        return r.json()


async def _atomic_increment_credits(org_id: str, credits: int) -> bool:
    """
    Incrementa creditos de forma atomica via SQL RPC.
    Fallback para GET+PATCH se RPC nao existir.
    """
    rpc_result = await _supabase_rpc("increment_credits", {"p_org_id": org_id, "p_amount": credits})
    if rpc_result is not None:
        return True

    # Fallback: GET + PATCH (menos seguro, mas funcional)
    orgs = await _supabase_get(f"/organizations?id=eq.{org_id}&select=credits_balance")
    if not orgs:
        return False
    new_balance = orgs[0].get("credits_balance", 0) + credits
    result = await _supabase_patch(f"/organizations?id=eq.{org_id}", {"credits_balance": new_balance})
    return result is not None


# ── Asaas helper ────────────────────────────────────────────────────────────

ASAAS_SANDBOX = (settings.ASAAS_SANDBOX if hasattr(settings, "ASAAS_SANDBOX") else True)
ASAAS_BASE = "https://api-sandbox.asaas.com" if ASAAS_SANDBOX else "https://api.asaas.com"


def _asaas_api_key() -> str:
    key = getattr(settings, "ASAAS_API_KEY", "") or ""
    if not key:
        raise HTTPException(status_code=503, detail="Asaas nao configurado (ASAAS_API_KEY).")
    return key


async def _asaas_request(method: str, path: str, json_data: Optional[dict] = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(
            method,
            f"{ASAAS_BASE}/v3{path}",
            headers={"Content-Type": "application/json", "access_token": _asaas_api_key()},
            json=json_data,
        )
        if r.status_code >= 400:
            logger.error("Asaas %s %s: %d %s", method, path, r.status_code, r.text[:300])
            raise HTTPException(status_code=502, detail=f"Asaas: {r.text[:200]}")
        return r.json() if r.content else {}


def _get_org_id(request: Request) -> str:
    return (request.headers.get("X-Org-Id") or "").strip() or "default"


# ── Modelos ─────────────────────────────────────────────────────────────────

class CheckoutCustomer(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=254)
    cpf_cnpj: str = Field(..., min_length=11, max_length=18)


class CreditCheckoutRequest(BaseModel):
    package_id: str
    billing_type: str = Field(..., pattern="^(PIX|BOLETO)$")
    customer: CheckoutCustomer


class SubscribeRequest(BaseModel):
    plan_name: str = Field(..., pattern="^(starter|pro|enterprise)$")
    billing_type: str = Field(..., pattern="^(PIX|BOLETO|CREDIT_CARD)$")
    customer: CheckoutCustomer


CREDIT_PACKAGES = [
    {"id": "100",  "credits": 100,  "price": 59.0,   "label": "100 creditos"},
    {"id": "500",  "credits": 500,  "price": 247.0,  "label": "500 creditos",   "badge": "Popular"},
    {"id": "1000", "credits": 1000, "price": 447.0,  "label": "1.000 creditos", "badge": "Melhor valor"},
    {"id": "5000", "credits": 5000, "price": 1897.0, "label": "5.000 creditos"},
]


# ── Endpoints: Planos ───────────────────────────────────────────────────────

@router.get("/plans")
async def list_plans():
    plans = await _supabase_get("/plans?is_active=eq.true&order=price_brl.asc")
    return {"plans": plans}


# ── Endpoints: Creditos ─────────────────────────────────────────────────────

@router.get("/credits")
async def get_credits(request: Request, _user: dict = Depends(require_auth)):
    org_id = _get_org_id(request)
    orgs = await _supabase_get(f"/organizations?id=eq.{org_id}&select=credits_balance")
    if not orgs:
        return {"org_id": org_id, "saldo": 0}
    return {"org_id": org_id, "saldo": orgs[0].get("credits_balance", 0)}


@router.get("/credits/packages")
async def list_credit_packages(_user: dict = Depends(require_auth)):
    return {"packages": CREDIT_PACKAGES}


@router.post("/credits/checkout")
async def credits_checkout(request: Request, body: CreditCheckoutRequest, _user: dict = Depends(require_auth)):
    org_id = _get_org_id(request)
    pkg = next((p for p in CREDIT_PACKAGES if p["id"] == body.package_id), None)
    if not pkg:
        raise HTTPException(status_code=400, detail="Pacote invalido.")

    cpf_cnpj = re.sub(r"\D", "", body.customer.cpf_cnpj)
    if len(cpf_cnpj) not in (11, 14):
        raise HTTPException(status_code=400, detail="CPF ou CNPJ invalido.")

    customer_resp = await _asaas_request("POST", "/customers", {
        "name": body.customer.name.strip(),
        "cpfCnpj": cpf_cnpj,
        "email": body.customer.email.strip(),
        "externalReference": org_id,
    })
    customer_id = customer_resp.get("id")
    if not customer_id:
        raise HTTPException(status_code=502, detail="Asaas: falha ao criar cliente.")

    due = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
    external_ref = f"hermes_credits:{org_id}:{pkg['credits']}"

    payment_resp = await _asaas_request("POST", "/payments", {
        "customer": customer_id,
        "billingType": body.billing_type,
        "value": round(pkg["price"], 2),
        "dueDate": due,
        "description": f"Hermes - {pkg['credits']} creditos de prospeccao",
        "externalReference": external_ref,
    })
    payment_id = payment_resp.get("id")
    if not payment_id:
        raise HTTPException(status_code=502, detail="Asaas: falha ao criar cobranca.")

    await _supabase_post("/payments", {
        "org_id": org_id,
        "asaas_payment_id": payment_id,
        "type": "credits",
        "status": "pending",
        "amount_brl": pkg["price"],
        "credits_granted": pkg["credits"],
        "billing_type": body.billing_type,
        "due_date": due,
        "metadata": {"package_id": body.package_id, "customer_id": customer_id},
    })

    result = {
        "payment_id": payment_id,
        "credits": pkg["credits"],
        "value": pkg["price"],
        "due_date": due,
        "invoice_url": payment_resp.get("invoiceUrl"),
        "bank_slip_url": payment_resp.get("bankSlipUrl"),
        "pix_qr_code": None,
        "pix_copy_paste": None,
    }

    if body.billing_type == "PIX":
        try:
            pix = await _asaas_request("GET", f"/payments/{payment_id}/pixQrCode")
            result["pix_qr_code"] = pix.get("encodedImage")
            result["pix_copy_paste"] = pix.get("payload")
        except Exception:
            logger.warning("Falha ao obter PIX QR para payment %s", payment_id)

    return result


# ── Endpoints: Assinatura recorrente ────────────────────────────────────────

@router.post("/subscribe/checkout")
async def subscribe_checkout(request: Request, body: SubscribeRequest, _user: dict = Depends(require_auth)):
    org_id = _get_org_id(request)

    plans = await _supabase_get(f"/plans?name=eq.{body.plan_name}&select=id,name,price_brl")
    if not plans:
        raise HTTPException(status_code=400, detail="Plano nao encontrado.")
    plan = plans[0]

    if plan["price_brl"] <= 0:
        raise HTTPException(status_code=400, detail="Plano gratuito nao requer assinatura.")

    cpf_cnpj = re.sub(r"\D", "", body.customer.cpf_cnpj)
    if len(cpf_cnpj) not in (11, 14):
        raise HTTPException(status_code=400, detail="CPF ou CNPJ invalido.")

    customer_resp = await _asaas_request("POST", "/customers", {
        "name": body.customer.name.strip(),
        "cpfCnpj": cpf_cnpj,
        "email": body.customer.email.strip(),
        "externalReference": org_id,
    })
    customer_id = customer_resp.get("id")
    if not customer_id:
        raise HTTPException(status_code=502, detail="Asaas: falha ao criar cliente.")

    next_due = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    external_ref = f"hermes_sub:{org_id}:{body.plan_name}"

    sub_resp = await _asaas_request("POST", "/subscriptions", {
        "customer": customer_id,
        "billingType": body.billing_type,
        "value": round(float(plan["price_brl"]), 2),
        "nextDueDate": next_due,
        "cycle": "MONTHLY",
        "description": f"Hermes - Plano {plan['name'].capitalize()}",
        "externalReference": external_ref,
    })
    sub_id = sub_resp.get("id")
    if not sub_id:
        raise HTTPException(status_code=502, detail="Asaas: falha ao criar assinatura.")

    now = datetime.now(timezone.utc).isoformat()
    period_end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    await _supabase_post("/subscriptions", {
        "org_id": org_id,
        "plan_id": plan["id"],
        "status": "active",
        "asaas_customer_id": customer_id,
        "asaas_subscription_id": sub_id,
        "current_period_start": now,
        "current_period_end": period_end,
    })

    await _supabase_patch(f"/organizations?id=eq.{org_id}", {"plan_id": plan["id"]})

    return {
        "subscription_id": sub_id,
        "plan": plan["name"],
        "value": float(plan["price_brl"]),
        "cycle": "MONTHLY",
        "next_due_date": next_due,
        "invoice_url": sub_resp.get("invoiceUrl"),
    }


# ── Webhook Asaas (publico - validado por token) ───────────────────────────

@router.post("/webhooks/asaas")
async def webhook_asaas(request: Request):
    """
    Recebe eventos do Asaas e atualiza Supabase.

    Seguranca:
      - Token HMAC timing-safe
      - Idempotencia: skip se pagamento ja confirmado
      - Creditos atomicos via increment

    Eventos tratados:
      PAYMENT_RECEIVED / PAYMENT_CONFIRMED  -> credita creditos ou ativa plano
      PAYMENT_OVERDUE                       -> marca pagamento overdue
      PAYMENT_REFUNDED                      -> marca refund
      SUBSCRIPTION_DELETED / SUBSCRIPTION_EXPIRED -> cancela assinatura
    """
    asaas_token = request.headers.get("asaas-access-token", "")
    expected_token = getattr(settings, "ASAAS_WEBHOOK_TOKEN", "") or ""

    if expected_token:
        if not hmac.compare_digest(asaas_token, expected_token):
            logger.warning("[ASAAS] Webhook token invalido de IP %s", request.headers.get("X-Real-IP", "?"))
            raise HTTPException(status_code=401, detail="Token invalido.")
    elif getattr(settings, "is_production", False):
        raise HTTPException(status_code=503, detail="Webhook token nao configurado.")

    try:
        raw = await request.json()
    except Exception:
        return {"ok": False, "error": "invalid_json"}

    event = raw.get("event", "")
    payment = raw.get("payment") or {}
    asaas_payment_id = payment.get("id", "")
    ext_ref = (payment.get("externalReference") or "").strip()

    logger.info("[ASAAS] Evento: %s | Payment: %s | Ref: %s", event, asaas_payment_id, ext_ref)

    # ── PAGAMENTO CONFIRMADO ──────────────────────────────────────────────
    if event in ("PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"):
        # Idempotencia: verifica se ja foi processado
        if asaas_payment_id:
            existing = await _supabase_get(
                f"/payments?asaas_payment_id=eq.{asaas_payment_id}&select=status"
            )
            if existing and existing[0].get("status") == "confirmed":
                logger.info("[ASAAS] Payment %s ja confirmado — skip (idempotente)", asaas_payment_id)
                return {"ok": True, "skipped": True}

            await _supabase_patch(
                f"/payments?asaas_payment_id=eq.{asaas_payment_id}",
                {"status": "confirmed", "paid_at": datetime.now(timezone.utc).isoformat()},
            )

        if ext_ref.startswith("hermes_credits:"):
            try:
                parts = ext_ref.split(":")
                org_id, credits = parts[1], int(parts[2])
                ok = await _atomic_increment_credits(org_id, credits)
                if ok:
                    logger.info("[ASAAS] +%d creditos para org %s (atomico)", credits, org_id)
                else:
                    logger.error("[ASAAS] Falha ao incrementar creditos para org %s", org_id)
            except Exception as e:
                logger.error("[ASAAS] Erro ao creditar: %r", e)

        elif ext_ref.startswith("hermes_sub:"):
            try:
                parts = ext_ref.split(":")
                org_id, plan_name = parts[1], parts[2]
                plans = await _supabase_get(f"/plans?name=eq.{plan_name}&select=id")
                if plans:
                    await _supabase_patch(
                        f"/organizations?id=eq.{org_id}",
                        {"plan_id": plans[0]["id"]},
                    )
                    logger.info("[ASAAS] Plano %s ativado para org %s", plan_name, org_id)
            except Exception as e:
                logger.error("[ASAAS] Erro ao ativar plano: %r", e)

    # ── PAGAMENTO VENCIDO ────────────────────────────────────────────────
    elif event == "PAYMENT_OVERDUE":
        if asaas_payment_id:
            await _supabase_patch(
                f"/payments?asaas_payment_id=eq.{asaas_payment_id}",
                {"status": "overdue"},
            )
            logger.warning("[ASAAS] Pagamento overdue: %s", asaas_payment_id)

    # ── PAGAMENTO ESTORNADO ──────────────────────────────────────────────
    elif event in ("PAYMENT_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS"):
        if asaas_payment_id:
            await _supabase_patch(
                f"/payments?asaas_payment_id=eq.{asaas_payment_id}",
                {"status": "refunded"},
            )
            logger.info("[ASAAS] Pagamento estornado: %s", asaas_payment_id)

    # ── ASSINATURA CANCELADA/EXPIRADA ────────────────────────────────────
    elif event in ("SUBSCRIPTION_DELETED", "SUBSCRIPTION_EXPIRED", "SUBSCRIPTION_INACTIVE"):
        sub_data = raw.get("subscription") or raw.get("payment") or {}
        asaas_sub_id = sub_data.get("id", "") or sub_data.get("subscription", "")

        if asaas_sub_id:
            await _supabase_patch(
                f"/subscriptions?asaas_subscription_id=eq.{asaas_sub_id}",
                {"status": "canceled", "canceled_at": datetime.now(timezone.utc).isoformat()},
            )

            subs = await _supabase_get(
                f"/subscriptions?asaas_subscription_id=eq.{asaas_sub_id}&select=org_id"
            )
            if subs:
                org_id = subs[0]["org_id"]
                free_plans = await _supabase_get("/plans?name=eq.free&select=id")
                if free_plans:
                    await _supabase_patch(
                        f"/organizations?id=eq.{org_id}",
                        {"plan_id": free_plans[0]["id"]},
                    )
                    logger.info("[ASAAS] Org %s rebaixada para plano free", org_id)

    return {"ok": True}
