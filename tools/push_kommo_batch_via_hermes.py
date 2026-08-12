#!/usr/bin/env python3
"""
Envia lote para o Kommo via backend Hermes: POST /api/crm/export/batch

Requer:
  HERMES_API_BASE   ex.: https://hermescraper.com/api
  HERMES_JWT        Bearer token (sessão Supabase / Hermes)
  KOMMO_API_KEY     long-lived token Kommo
  KOMMO_SUBDOMAIN   ex.: bfcompanypinn (sem .kommo.com)

Uso:
  python tools/push_kommo_batch_via_hermes.py --payload exports/quitoubr/kommo_batch_payload.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--payload", required=True, help="JSON com provider, api_key, kommo_subdomain, leads")
    args = p.parse_args()

    base = (os.getenv("HERMES_API_BASE") or "").strip().rstrip("/")
    jwt = (os.getenv("HERMES_JWT") or "").strip()
    if not base or not jwt:
        print("Defina HERMES_API_BASE e HERMES_JWT", file=sys.stderr)
        return 2

    key = (os.getenv("KOMMO_API_KEY") or "").strip()
    sub = (os.getenv("KOMMO_SUBDOMAIN") or "").strip()
    body = json.loads(Path(args.payload).read_text(encoding="utf-8"))
    if key:
        body["api_key"] = key
    if sub:
        body["kommo_subdomain"] = sub
    if not (body.get("api_key") or "").strip():
        print("api_key ausente (env KOMMO_API_KEY ou campo no JSON)", file=sys.stderr)
        return 2
    if not (body.get("kommo_subdomain") or "").strip():
        print("kommo_subdomain ausente (env KOMMO_SUBDOMAIN ou campo no JSON)", file=sys.stderr)
        return 2

    url = f"{base}/crm/export/batch"
    headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json", "X-Org-Id": "quitoubr"}
    r = httpx.post(url, headers=headers, json=body, timeout=120.0)
    print(r.status_code, r.text[:2000])
    return 0 if r.status_code < 400 else 1


if __name__ == "__main__":
    raise SystemExit(main())
