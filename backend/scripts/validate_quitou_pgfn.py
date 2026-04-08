#!/usr/bin/env python3
"""
Valida POST /prospeccao/run com X-Org-Id = org Quitou BR no Supabase (filtro PGFN se env configurado).

Uso (API no ar):
  set HERMES_API_URL=http://127.0.0.1:8000
  python scripts/validate_quitou_pgfn.py

Produção / VPS:
  export HERMES_API_URL=https://seu-dominio
  export HERMES_DEV_TOKEN=<jwt supabase>
  python scripts/validate_quitou_pgfn.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from api.pgfn_prospeccao_filter import QUITOU_BR_ORG_ID


def main() -> int:
    p = argparse.ArgumentParser(description="Valida prospecção com org Quitou BR (UUID Supabase).")
    p.add_argument("--api", default=os.environ.get("HERMES_API_URL", "http://127.0.0.1:8000"))
    p.add_argument("--token", default=os.environ.get("HERMES_DEV_TOKEN", "dev"))
    p.add_argument("--org", default=os.environ.get("QUITOU_BR_ORG_ID", QUITOU_BR_ORG_ID))
    p.add_argument("--termo", default="ltda")
    p.add_argument("--limite", type=int, default=5)
    args = p.parse_args()

    base = args.api.rstrip("/")
    payload = {
        "termo_base": args.termo,
        "cidade": "",
        "uf": "",
        "capital_minimo": 0,
        "limite_empresas": args.limite,
        "enriquecimento_web": False,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/prospeccao/run",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {args.token}",
            "X-Org-Id": args.org,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}", file=sys.stderr)
        return 1
    except Exception as e:
        print("Erro:", e, file=sys.stderr)
        return 1

    meta = data.get("metadata") or {}
    print(f"total_empresas={data.get('total_empresas')}")
    if meta:
        print("metadata:", json.dumps(meta, ensure_ascii=False, indent=2))
    empresas = data.get("empresas") or []
    if empresas:
        print("primeira empresa cnpj:", empresas[0].get("cnpj"), "|", empresas[0].get("razao_social", "")[:50])
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
