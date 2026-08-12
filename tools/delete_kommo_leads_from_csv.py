#!/usr/bin/env python3
"""
Remove leads no Kommo (API v4) a partir de um CSV com coluna `cnpj`.

Localiza o card pelo mesmo critério do Hermes: campo custom de CNPJ + funil.

Uso:
  export KOMMO_ACCESS_TOKEN="..."   # JWT long-lived
  python tools/delete_kommo_leads_from_csv.py \\
    --csv exports/quitoubr/leads_quitou_pgfn_sp_50_kommo_ready.csv \\
    --subdomain bfcompanypinn \\
    --pipeline-id 13230435

  # só simular:
  python tools/delete_kommo_leads_from_csv.py --csv ... --dry-run
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests


def _kommo_headers(token: str) -> dict[str, str]:
    t = token.strip()
    if t.lower().startswith("bearer "):
        t = t[7:].strip()
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _kommo_digits_cnpj(raw: str | None) -> Optional[str]:
    digits = re.sub(r"\D", "", (raw or "").strip())
    if len(digits) != 14:
        return None
    return digits


def _kommo_cnpj_search_values(cnpj_digits: str) -> list[str]:
    out: list[str] = [cnpj_digits]
    if len(cnpj_digits) == 14:
        d = cnpj_digits
        masked = f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:14]}"
        if masked not in out:
            out.append(masked)
    return out


def _kommo_best_name_match_field(fields: list[dict], needles: tuple[str, ...]) -> Optional[dict]:
    best: Optional[dict] = None
    best_len = 0
    for f in fields:
        nm = str(f.get("name") or "").upper()
        for needle in needles:
            n = needle.upper()
            if n in nm and len(n) >= best_len:
                best_len = len(n)
                best = f
    return best


def _kommo_cf_filter_params(field_id: int, value: str) -> dict[str, Any]:
    return {
        "limit": 10,
        "filter[custom_fields_values][0][custom_field_id]": field_id,
        "filter[custom_fields_values][0][values][0][value]": value,
    }


def _kommo_find_lead_id_by_cnpj(
    base: str,
    headers: dict[str, str],
    lead_fields: list[dict],
    cnpj_digits: str,
    pipeline_id: Optional[int],
) -> Optional[int]:
    f_cnpj = _kommo_best_name_match_field(lead_fields, ("CNPJ OU CPF", "CPF CNPJ", "CNPJ"))
    if not f_cnpj or f_cnpj.get("id") is None:
        return None
    fid = int(f_cnpj["id"])
    for val in _kommo_cnpj_search_values(cnpj_digits):
        try:
            params: dict[str, Any] = _kommo_cf_filter_params(fid, val)
            if pipeline_id is not None:
                params["filter[pipeline_id]"] = int(pipeline_id)
            r = requests.get(f"{base}/leads", headers=headers, params=params, timeout=25)
            if r.status_code >= 300:
                continue
            leads = ((r.json() or {}).get("_embedded") or {}).get("leads") or []
            for L in leads:
                if L.get("id") is not None:
                    return int(L["id"])
        except Exception:
            continue
    return None


def _kommo_delete_lead(base: str, headers: dict[str, str], lead_id: int) -> tuple[bool, str, int]:
    url = f"{base}/leads/{lead_id}"
    r = requests.delete(url, headers=headers, timeout=30)
    if r.status_code in (200, 204):
        return True, "deleted", r.status_code
    r2 = requests.patch(
        f"{base}/leads",
        headers=headers,
        json=[{"id": lead_id, "is_deleted": True}],
        timeout=30,
    )
    if r2.status_code in (200, 204):
        return True, "patch_is_deleted", r2.status_code
    return False, f"delete_http={r.status_code}; patch={r2.text[:350]}", r2.status_code


def main() -> int:
    p = argparse.ArgumentParser(description="Apaga leads no Kommo com base no CNPJ do CSV.")
    p.add_argument("--csv", required=True, help="CSV com coluna cnpj (ex.: leads_*_kommo_ready.csv)")
    p.add_argument("--subdomain", default="bfcompanypinn")
    p.add_argument("--pipeline-id", type=int, default=13230435, help="Restringe busca ao funil; use 0 para qualquer funil")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--sleep", type=float, default=0.35)
    args = p.parse_args()

    token = (os.getenv("KOMMO_ACCESS_TOKEN") or os.getenv("KOMMO_TOKEN") or "").strip()
    if not token:
        print("Defina KOMMO_ACCESS_TOKEN.", file=sys.stderr)
        return 2

    csv_path = Path(args.csv).expanduser()
    if not csv_path.is_file():
        print(f"CSV não encontrado: {csv_path}", file=sys.stderr)
        return 2

    base = f"https://{args.subdomain.strip()}.kommo.com/api/v4"
    headers = _kommo_headers(token)

    r = requests.get(f"{base}/leads/custom_fields", headers=headers, params={"limit": 250}, timeout=30)
    if r.status_code >= 300:
        print(f"Falha ao listar custom fields: HTTP {r.status_code} {r.text[:300]}", file=sys.stderr)
        return 1
    lead_fields = ((r.json() or {}).get("_embedded") or {}).get("custom_fields") or []

    rows = list(csv.DictReader(csv_path.open(encoding="utf-8", newline="")))
    pipe: Optional[int] = None if int(args.pipeline_id) == 0 else int(args.pipeline_id)

    results: list[dict[str, Any]] = []
    for rrow in rows:
        cnpj_raw = (rrow.get("cnpj") or "").strip()
        d = _kommo_digits_cnpj(cnpj_raw)
        if not d:
            results.append({"cnpj": cnpj_raw, "ok": False, "detail": "cnpj_invalido"})
            continue
        lid = _kommo_find_lead_id_by_cnpj(base, headers, lead_fields, d, pipe)
        if lid is None:
            results.append({"cnpj": d, "ok": True, "detail": "nao_encontrado"})
            continue
        if args.dry_run:
            results.append({"cnpj": d, "ok": True, "lead_id": lid, "detail": "dry_run"})
        else:
            ok, msg, code = _kommo_delete_lead(base, headers, lid)
            results.append(
                {"cnpj": d, "ok": ok, "lead_id": lid, "detail": msg, "http": code}
            )
        if args.sleep > 0:
            time.sleep(args.sleep)

    deleted = sum(1 for x in results if x.get("ok") and x.get("detail") == "deleted")
    patched = sum(1 for x in results if x.get("ok") and x.get("detail") == "patch_is_deleted")
    missing = sum(1 for x in results if x.get("detail") == "nao_encontrado")
    dry = sum(1 for x in results if x.get("detail") == "dry_run")
    failed = sum(1 for x in results if not x.get("ok"))

    print(
        json.dumps(
            {
                "total": len(rows),
                "deleted": deleted,
                "patch_is_deleted": patched,
                "nao_encontrado": missing,
                "dry_run": dry,
                "failed": failed,
            },
            ensure_ascii=False,
        )
    )
    for x in results:
        if not x.get("ok") or x.get("detail") not in ("nao_encontrado", "deleted", "patch_is_deleted", "dry_run"):
            print(json.dumps(x, ensure_ascii=False))

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
