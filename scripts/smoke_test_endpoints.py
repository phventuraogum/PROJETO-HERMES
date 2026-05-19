#!/usr/bin/env python3
"""
JUN 1.5 · Smoke test dos endpoints do Hermes em produção.

Categorias:
  public  — sem auth, espera 200 (ex: /health, /plans)
  auth    — requer auth, sem token espera 401/403
  webhook — externo, geralmente espera 422/400 sem body válido

Uso:
  python scripts/smoke_test_endpoints.py [--base URL]
  python scripts/smoke_test_endpoints.py --base https://hermescraper.com/api
  python scripts/smoke_test_endpoints.py --token <jwt> --base https://hermescraper.com/api

Sem --base, default = https://hermescraper.com/api.
Sem --token, roda só checks sem auth (verifica que /auth/* funciona, etc).
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from typing import Optional

import httpx

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


@dataclass
class Endpoint:
    method: str
    path: str
    category: str  # public | auth | webhook | admin
    expect: list[int]  # status codes esperados
    body: Optional[dict] = None
    skip_if_no_token: bool = False


ENDPOINTS: list[Endpoint] = [
    # ── PÚBLICOS (sem auth) ─────────────────────────────────────────────
    Endpoint("GET",  "/health",                category="public", expect=[200]),
    Endpoint("GET",  "/health/detailed",       category="auth",   expect=[200, 401, 403]),  # configurável: pode exigir auth
    Endpoint("GET",  "/plans",                 category="public", expect=[200]),

    # ── AUTH (sem token → 401/403; com token → 200/422/404) ────────────
    Endpoint("GET",  "/credits",               category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/credits/packages",      category="auth",   expect=[401, 403]),
    Endpoint("POST", "/credits/checkout",      category="auth",   expect=[401, 403, 422]),
    Endpoint("GET",  "/orgs",                  category="auth",   expect=[401, 403]),
    Endpoint("POST", "/prospeccao",            category="auth",   expect=[401, 403, 422]),
    Endpoint("POST", "/prospeccao/run",        category="auth",   expect=[401, 403, 422]),
    Endpoint("POST", "/prospeccao/translate-query", category="auth", expect=[401, 403, 422]),
    Endpoint("POST", "/prospeccao/pgfn",       category="auth",   expect=[401, 403, 422]),
    Endpoint("POST", "/prospeccao/assertiva/decisores/cnpj", category="auth", expect=[401, 403, 422]),
    Endpoint("GET",  "/pipeline",              category="auth",   expect=[401, 403]),
    Endpoint("POST", "/pipeline",              category="auth",   expect=[401, 403, 422]),
    Endpoint("POST", "/pipeline/batch",        category="auth",   expect=[401, 403, 422]),
    Endpoint("POST", "/pipeline/enviar-sdr",   category="auth",   expect=[401, 403, 422]),
    Endpoint("POST", "/pipeline/enviar-kommo", category="auth",   expect=[401, 403, 422]),
    Endpoint("POST", "/crm/export",            category="auth",   expect=[401, 403, 422]),
    Endpoint("POST", "/crm/export/batch",      category="auth",   expect=[401, 403, 422]),
    Endpoint("GET",  "/integrations/crm-keys/status", category="auth", expect=[401, 403, 404]),  # JUN 1.3 — 404 antes do deploy
    Endpoint("PUT",  "/integrations/crm-keys", category="auth",   expect=[401, 403, 404, 422]),  # idem
    Endpoint("POST", "/integrations/n8n/prospeccao", category="auth", expect=[401, 403, 422]),
    Endpoint("POST", "/integrations/kommo/leads",    category="auth", expect=[401, 403, 422]),
    Endpoint("GET",  "/integrations/dashboard/stats", category="auth", expect=[401, 403]),
    Endpoint("GET",  "/lead-lists",            category="auth",   expect=[401, 403]),
    Endpoint("POST", "/lead-lists",            category="auth",   expect=[401, 403, 422]),
    Endpoint("GET",  "/lead-suppressions",     category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/saved-searches",        category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/company-watchlist",     category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/company-signals",       category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/company-data-health",   category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/lead-refresh-jobs",     category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/lead-refresh-states",   category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/sdr/leads",             category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/sdr/stats",             category="auth",   expect=[401, 403]),
    Endpoint("GET",  "/fiscal-public/meta",    category="auth",   expect=[401, 403, 404]),  # opcional (env-dependent)
    Endpoint("POST", "/fiscal-public/import",  category="auth",   expect=[401, 403, 404, 422]),
    Endpoint("POST", "/empresas/12345678000190/enriquecer", category="auth", expect=[401, 403, 404, 422]),
    Endpoint("GET",  "/empresas/12345678000190",            category="auth", expect=[401, 403, 404]),

    # ── AUTH endpoints próprios (signup/login) ───────────────────────
    Endpoint("POST", "/auth/signup",           category="public", expect=[400, 422]),  # body inválido = 422
    Endpoint("POST", "/auth/signup-with-plan", category="public", expect=[400, 422]),

    # ── WEBHOOKS (não autenticados, body validado) ──────────────────
    Endpoint("POST", "/webhooks/asaas",         category="webhook", expect=[400, 401, 403, 422, 503]),  # 503 quando ASAAS_WEBHOOK_TOKEN vazio (env-dependent)
    Endpoint("GET",  "/webhooks/list",          category="auth",    expect=[401, 403]),
    Endpoint("POST", "/webhooks/register",      category="auth",    expect=[401, 403, 422]),
]


def main():
    parser = argparse.ArgumentParser(description="Smoke test endpoints Hermes")
    parser.add_argument("--base", default="https://hermescraper.com/api", help="URL base da API")
    parser.add_argument("--token", default=None, help="JWT pra testes autenticados (opcional)")
    parser.add_argument("--timeout", type=float, default=15.0)
    args = parser.parse_args()

    base = args.base.rstrip("/")
    token = args.token

    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    print(f"Base: {base}")
    print(f"Auth: {'sim' if token else 'nao (so testes sem token)'}")
    print(f"Total endpoints: {len(ENDPOINTS)}")
    print()

    ok = 0
    fail = 0
    skip = 0
    failures: list[tuple[Endpoint, int, str]] = []

    with httpx.Client(timeout=args.timeout, follow_redirects=False) as client:
        for ep in ENDPOINTS:
            try:
                r = client.request(
                    ep.method,
                    f"{base}{ep.path}",
                    headers=headers,
                    json=ep.body or {} if ep.method != "GET" else None,
                )
                actual = r.status_code
                passed = actual in ep.expect
                status_tag = "[ok]  " if passed else "[fail]"
                print(f"  {status_tag} {ep.method:<5} {ep.path:<55} -> {actual} (esperado: {ep.expect}) [{ep.category}]")
                if passed:
                    ok += 1
                else:
                    fail += 1
                    failures.append((ep, actual, r.text[:200]))
            except httpx.RequestError as e:
                fail += 1
                print(f"  [err] {ep.method:<5} {ep.path:<55} -> exception: {e}")
                failures.append((ep, -1, str(e)))

    print()
    print(f"Resultado: {ok}/{len(ENDPOINTS)} ok, {fail} falhas, {skip} skip")
    if failures:
        print()
        print("=== Falhas ===")
        for ep, code, msg in failures:
            print(f"  {ep.method} {ep.path}: HTTP {code}")
            print(f"    {msg[:200]}")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
