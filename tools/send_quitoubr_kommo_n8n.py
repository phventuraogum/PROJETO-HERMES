#!/usr/bin/env python3
"""
Envia leads para o n8n da QuitouBR no formato esperado pelo Hermes (`POST /pipeline/enviar-kommo`).

Inclui metadados explícitos do funil Kommo (subdomínio + URL) para o workflow n8n aplicar
pipeline/status corretos na conta bfcompanypinn.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import httpx

DEFAULT_WEBHOOK = "https://n8n.srv879715.hstgr.cloud/webhook/kommo-quitoubr"
DEFAULT_PIPELINE_ID = 13230435
DEFAULT_STATUS_ID = 60307615  # org_integrations (quitoubr) — ajuste via --status-id se necessário
DEFAULT_SUBDOMAIN = "bfcompanypinn"
DEFAULT_PIPELINE_URL = "https://bfcompanypinn.kommo.com/leads/pipeline/13230435/?skip_filter=Y"


def lead_row(r: dict[str, str]) -> dict:
    wa = (r.get("decisor_whatsapp_assertiva") or "").strip() == "1"
    tel = (r.get("decisor_telefone") or "").strip()
    return {
        "cnpj": (r.get("cnpj") or "").strip(),
        "razao_social": (r.get("razao_social") or "").strip(),
        "nome_fantasia": (r.get("nome_fantasia") or "").strip(),
        "email": (r.get("email_empresa") or "").strip() or None,
        "telefone": tel,
        "whatsapp": tel if wa else None,
        "site": (r.get("site") or "").strip() or None,
        "cidade": (r.get("municipio") or "").strip() or None,
        "uf": (r.get("uf") or "").strip() or None,
        "segmento": ((r.get("cnae_descricao") or "")[:200]) or None,
        "porte": None,
        "capital_social": None,
        "score_icp": 0,
        "socios_resumo": (
            (r.get("decisor_nome") or "").strip()
            + (
                " — " + (r.get("decisor_qualificacao") or "").strip()
                if (r.get("decisor_qualificacao") or "").strip()
                else ""
            )
        )
        or None,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--csv", default="exports/quitoubr/leads_quitoubr_kommo_ready.csv")
    p.add_argument("--webhook", default=DEFAULT_WEBHOOK)
    p.add_argument("--pipeline-id", type=int, default=DEFAULT_PIPELINE_ID)
    p.add_argument("--status-id", type=int, default=DEFAULT_STATUS_ID)
    p.add_argument("--subdomain", default=DEFAULT_SUBDOMAIN)
    p.add_argument("--pipeline-url", default=DEFAULT_PIPELINE_URL)
    p.add_argument("--org-id", default="quitoubr")
    p.add_argument("--batch-size", type=int, default=10)
    p.add_argument("--timeout", type=float, default=240.0)
    args = p.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"CSV não encontrado: {csv_path}", file=sys.stderr)
        return 2

    rows = list(csv.DictReader(csv_path.open(encoding="utf-8", newline="")))
    timeout = httpx.Timeout(args.timeout, connect=30.0)

    ok = 0
    with httpx.Client(timeout=timeout) as client:
        for i in range(0, len(rows), args.batch_size):
            chunk = rows[i : i + args.batch_size]
            body = {
                "source": "hermes",
                "org_id": args.org_id,
                "kommo": {
                    "subdomain": args.subdomain,
                    "pipeline_url": args.pipeline_url,
                    "pipeline_id": args.pipeline_id,
                    "status_id": args.status_id,
                },
                "leads": [lead_row(r) for r in chunk],
            }
            r = client.post(args.webhook, json=body)
            print("batch", i // args.batch_size + 1, "n", len(chunk), "http", r.status_code, r.text[:200].replace("\n", " "))
            if r.status_code < 300:
                ok += 1

    print(json.dumps({"batches_ok_http": ok, "total_rows": len(rows)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
