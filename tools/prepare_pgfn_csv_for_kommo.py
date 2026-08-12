#!/usr/bin/env python3
"""
Converte CSV de prospecção PGFN (ex.: leads_quitou_pgfn_sp_50_excl_kommo.csv) para o
layout usado por push_kommo_direct_leads.py / run_kommo_batch_container.py.

- decisor_telefone = telefone Receita (placeholder até Assertiva trazer o decisor).
- email_empresa = email da coluna `email`.
- observacoes_crm = resumo PGFN + CNAE (sem blocos Assertiva).
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
        v = float(str(value).replace(",", "."))
        return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(value or "")


def _row_enriquecido_assertiva(r: dict[str, str]) -> bool:
    if "assertiva_cnpj_encontrado" in r:
        return True
    if (r.get("decisor_nome") or "").strip() or (r.get("decisor_telefone") or "").strip():
        return True
    return False


def _obs(r: dict[str, str], *, assertiva: bool) -> str:
    parts = [
        f"PGFN SP | Dívida: R$ {_money_br(r.get('divida_total', ''))} | Inscrições: {r.get('qtd_inscricoes', '')}",
        f"CNAE: {r.get('cnae_principal', '')} — {(r.get('cnae_descricao') or '')[:200]}",
    ]
    if assertiva:
        dn = (r.get("decisor_nome") or "").strip()
        if dn:
            parts.append(f"Decisor (Assertiva): {dn} — {(r.get('decisor_qualificacao') or '').strip()}")
        else:
            parts.append("Assertiva: CNPJ consultado; decisor/telefone PF não retornados neste caso.")
    else:
        parts.append("Contato: telefone/e-mail da Receita (pré-Assertiva).")
    n = (r.get("nota") or "").strip()
    if n:
        parts.append(n)
    return " \n".join(parts)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()

    src = Path(args.input)
    if not src.is_file():
        print(f"Não encontrado: {src}", file=sys.stderr)
        return 2

    rows = list(csv.DictReader(src.open(encoding="utf-8", newline="")))
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

    kept = 0
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            tel = (r.get("telefone") or r.get("telefone_receita") or "").strip()
            em = (r.get("email") or r.get("email_receita") or "").strip()
            assertiva = _row_enriquecido_assertiva(r)
            dn = (r.get("decisor_nome") or "").strip()
            dq = (r.get("decisor_qualificacao") or "").strip()
            dcpf = re.sub(r"\D", "", r.get("decisor_cpf", "") or "")
            dtel = (r.get("decisor_telefone") or "").strip()
            dtipo = (r.get("decisor_telefone_tipo") or "").strip()
            decisor_telefone = dtel or tel
            decisor_tipo = dtipo or ("assertiva" if dtel else "receita")
            decisor_wa = (r.get("decisor_whatsapp_assertiva") or "").strip()
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
                    "decisor_nome": dn,
                    "decisor_qualificacao": dq,
                    "decisor_cpf": dcpf,
                    "decisor_telefone": decisor_telefone,
                    "decisor_telefone_tipo": decisor_tipo,
                    "decisor_whatsapp_assertiva": decisor_wa,
                    "telefone_empresa": tel,
                    "email_empresa": em,
                    "whatsapp_empresa": "",
                    "site": (r.get("site") or "").strip(),
                    "observacoes_crm": _obs(r, assertiva=assertiva),
                }
            )
            kept += 1

    print(json.dumps({"input": str(src), "rows": kept, "output": str(out_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
