#!/usr/bin/env python3
"""
Gera CSV limpo para CRM a partir do export Assertiva (Hermes).

Regra: mantém apenas linhas com telefone do decisor (Assertiva PF).
Remove colunas técnicas e renomeia contatos da empresa para clareza.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path


def _money_br(value: str) -> str:
    try:
        v = float(value)
        return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(value or "")


def _observacoes(r: dict[str, str]) -> str:
    parts = [
        f"PGFN SP | Dívida: R$ {_money_br(r.get('divida_total', ''))} | Inscrições: {r.get('qtd_inscricoes', '')}",
        f"CNAE: {r.get('cnae_codigo', '')} — {(r.get('cnae_descricao') or '')[:120]}",
    ]
    dn = (r.get("decisor_nome") or "").strip()
    dq = (r.get("decisor_qualificacao") or "").strip()
    dcpf = (r.get("decisor_cpf") or "").strip()
    if dn:
        parts.append("Decisor (Assertiva): " + dn + (f" | {dq}" if dq else "") + (f" | CPF {dcpf}" if dcpf else ""))
    proto = (r.get("assertiva_protocolo_cnpj") or "").strip()
    if proto:
        parts.append(f"Protocolo Assertiva (CNPJ): {proto}")
    pp = (r.get("assertiva_protocolo_pf") or "").strip()
    if pp:
        parts.append(f"Protocolo Assertiva (PF): {pp}")
    return " \n".join(parts)


def _kommo_leads(rows_kept: list[dict[str, str]]) -> list[dict]:
    out = []
    for r in rows_kept:
        tel = (r.get("decisor_telefone") or "").strip()
        wa_flag = (r.get("decisor_whatsapp_assertiva") or "").strip() == "1"
        out.append(
            {
                "cnpj": re.sub(r"\D", "", r.get("cnpj", "")),
                "razao_social": (r.get("razao_social") or "").strip(),
                "nome_fantasia": (r.get("nome_fantasia") or "").strip(),
                "email": (r.get("email") or "").strip() or None,
                "telefone": tel,
                "whatsapp": tel if wa_flag else None,
                "site": (r.get("site") or "").strip() or None,
                "cidade": (r.get("municipio") or "").strip() or None,
                "uf": (r.get("uf") or "").strip() or None,
                "segmento": ((r.get("cnae_descricao") or "")[:200]) or None,
                "porte": (r.get("porte_empresa") or "").strip() or None,
                "capital_social": None,
                "observacoes": _observacoes(r),
            }
        )
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, help="CSV enriquecido (Assertiva)")
    p.add_argument("--output", required=True, help="CSV limpo para CRM")
    p.add_argument(
        "--kommo-payload",
        default="",
        help="Opcional: JSON exemplo para POST /api/crm/export/batch (Kommo)",
    )
    args = p.parse_args()

    src = Path(args.input)
    if not src.exists():
        print(f"Não encontrado: {src}", file=sys.stderr)
        return 2

    rows = list(csv.DictReader(src.open(encoding="utf-8")))
    kept = [r for r in rows if (r.get("decisor_telefone") or "").strip()]

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    fields = [
        "cnpj",
        "razao_social",
        "nome_fantasia",
        "uf",
        "municipio",
        "cnae_principal",
        "cnae_descricao",
        "divida_total",
        "qtd_inscricoes",
        "decisor_nome",
        "decisor_qualificacao",
        "decisor_cpf",
        "decisor_telefone",
        "decisor_telefone_tipo",
        "decisor_whatsapp_assertiva",
        "telefone_empresa",
        "email_empresa",
        "whatsapp_empresa",
        "site",
        "observacoes_crm",
    ]

    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in kept:
            wa = "1" if (r.get("decisor_whatsapp_assertiva") or "").strip() == "1" else ""
            w.writerow(
                {
                    "cnpj": re.sub(r"\D", "", r.get("cnpj", "")),
                    "razao_social": (r.get("razao_social") or "").strip(),
                    "nome_fantasia": (r.get("nome_fantasia") or "").strip(),
                    "uf": (r.get("uf") or "").strip(),
                    "municipio": (r.get("municipio") or "").strip(),
                    "cnae_principal": (r.get("cnae_principal") or "").strip(),
                    "cnae_descricao": (r.get("cnae_descricao") or "").strip(),
                    "divida_total": (r.get("divida_total") or "").strip(),
                    "qtd_inscricoes": (r.get("qtd_inscricoes") or "").strip(),
                    "decisor_nome": (r.get("decisor_nome") or "").strip(),
                    "decisor_qualificacao": (r.get("decisor_qualificacao") or "").strip(),
                    "decisor_cpf": (r.get("decisor_cpf") or "").strip(),
                    "decisor_telefone": (r.get("decisor_telefone") or "").strip(),
                    "decisor_telefone_tipo": (r.get("decisor_telefone_tipo") or "").strip(),
                    "decisor_whatsapp_assertiva": wa,
                    "telefone_empresa": (r.get("telefone") or "").strip(),
                    "email_empresa": (r.get("email") or "").strip(),
                    "whatsapp_empresa": (r.get("whatsapp") or "").strip(),
                    "site": (r.get("site") or "").strip(),
                    "observacoes_crm": _observacoes(r),
                }
            )

    if args.kommo_payload:
        example = {
            "provider": "kommo",
            "api_key": "COLE_AQUI_LONG_LIVED_TOKEN_KOMMO",
            "kommo_subdomain": "subdominio_sem_kommo_com",
            "leads": _kommo_leads(kept),
        }
        Path(args.kommo_payload).write_text(json.dumps(example, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {"total_input": len(rows), "kept": len(kept), "removed": len(rows) - len(kept), "output": str(out_path)},
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
