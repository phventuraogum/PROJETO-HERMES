#!/usr/bin/env python3
"""
Monta lista de prospecção Quitou BR: PGFN, UF=SP, dívida total até R$ 9M,
exclui CNPJs já presentes no export do Kommo.

Modo A (recomendado na VPS, com DuckDB):
  - Filtra em fiscal_public_debts (app.duckdb) por inscrição “em aberto”,
    soma valor consolidado/originário por CNPJ <= teto,
    e exige ao menos uma data_inscricao recente (janela configurável).
  - Cruza com vw_prospeccao_base (cnpj.duckdb) para dados cadastrais.

Modo B (fallback sem DuckDB, só para teste):
  - Usa o CSV local `leads_pgfn_sp_250.csv` (já agregado), aplica teto 9M,
    UF SP, exclusão Kommo e ordena por qtd_inscricoes / divida_total.
  - Não garante o critério “inscrição recente” linha a linha da PGFN.

Variáveis úteis:
  HERMES_DUCKDB_PATH, HERMES_APP_DB_PATH — caminhos dos bancos (padrão /data/*.duckdb)
  HERMES_PG_PUBLIC_SNAPSHOT_ORG_ID — org onde está o snapshot PGFN importado (ou usa --pgfn-org)

Uso:
  python tools/build_quitou_pgfn_sp_leads.py \\
    --kommo-export ~/Downloads/kommo_export_leads_2026-04-27.csv \\
    --out exports/quitoubr/leads_quitou_pgfn_sp_50.csv
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# org padrão do snapshot PGFN (pode sobrescrever com --pgfn-org)
_DEFAULT_PG_ORG = "default"

# Padrão alinhado a HERMES_PG_PUBLIC_FISCAL_SITUACAO_FECHADA_SUBSTR
_FECHADAS = ("QUIT", "BAIX", "EXCLU", "PAGO", "CANCEL", "ANUL")


def _only_cnpj14(s: str) -> str:
    d = re.sub(r"\D", "", s or "")
    return d if len(d) == 14 else ""


def load_kommo_cnpjs(path: Path) -> set[str]:
    out: set[str] = set()
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        r = csv.DictReader(f)
        col = None
        if r.fieldnames:
            for h in r.fieldnames:
                if h and "CNPJ" in h.upper() and "CPF" in h.upper():
                    col = h
                    break
        if not col:
            for h in r.fieldnames or []:
                if h and "CNPJ" in h.upper():
                    col = h
                    break
        if not col:
            raise SystemExit("CSV Kommo: não achei coluna de CNPJ (ex.: 'CNPJ OU CPF').")
        for row in r:
            c = _only_cnpj14(row.get(col) or "")
            if c:
                out.add(c)
    return out


def _situacao_aberta_sql() -> str:
    parts = []
    for p in _FECHADAS:
        esc = p.replace("'", "''")
        parts.append(f"UPPER(COALESCE(situacao,'')) NOT LIKE '%{esc}%'")
    inner = " AND ".join(parts)
    return f"(TRIM(COALESCE(situacao,'')) = '' OR ({inner}))"


def run_duckdb(
    *,
    receita_path: str,
    app_path: str,
    pgfn_org: str,
    kommo_excl: set[str],
    max_divida: float,
    recent_months: int,
    limit: int,
) -> list[dict[str, str]]:
    import duckdb  # type: ignore

    def _esc_sql_path(path: str) -> str:
        return path.replace("'", "''")

    con = duckdb.connect(":memory:")
    con.execute(f"ATTACH '{_esc_sql_path(receita_path)}' AS r (READ_ONLY)")
    con.execute(f"ATTACH '{_esc_sql_path(app_path)}' AS a (READ_ONLY)")

    situ = _situacao_aberta_sql()
    excl = sorted(kommo_excl)
    excl_block = f"AND e.cnpj NOT IN ({', '.join(['?'] * len(excl))})" if excl else ""

    sql = f"""
    WITH latest AS (
        SELECT id
        FROM a.fiscal_public_imports
        WHERE org_id = ?
        ORDER BY imported_at DESC
        LIMIT 1
    ),
    base_debts AS (
        SELECT
            d.cnpj,
            d.data_inscricao,
            COALESCE(d.valor_consolidado, d.valor_originario, 0) AS v
        FROM a.fiscal_public_debts d
        WHERE d.org_id = ?
          AND d.import_id = (SELECT id FROM latest)
          AND ({situ})
    ),
    pg AS (
        SELECT
            cnpj,
            SUM(v) AS divida_total,
            MAX(data_inscricao) AS max_data_inscricao,
            MAX(CASE
                WHEN data_inscricao IS NOT NULL
                 AND data_inscricao >= (CURRENT_DATE - INTERVAL '{int(recent_months)}' MONTH)
                THEN 1 ELSE 0
            END) AS tem_inscricao_recente
        FROM base_debts
        GROUP BY cnpj
        HAVING SUM(v) > 0
           AND SUM(v) <= ?
           AND MAX(CASE
                WHEN data_inscricao IS NOT NULL
                 AND data_inscricao >= (CURRENT_DATE - INTERVAL '{int(recent_months)}' MONTH)
                THEN 1 ELSE 0
            END) = 1
    )
    SELECT
        e.cnpj,
        e.RAZAO_SOCIAL AS razao_social,
        e.NOME_FANTASIA AS nome_fantasia,
        e.UF AS uf,
        e.cidade_nome AS municipio,
        e.CNAE_PRINCIPAL AS cnae_principal,
        e.cnae_descricao,
        pg.divida_total,
        pg.max_data_inscricao,
        e.telefone_receita AS telefone,
        e.email_receita AS email
    FROM r.vw_prospeccao_base e
    INNER JOIN pg ON e.cnpj = pg.cnpj
    WHERE UPPER(COALESCE(e.UF, '')) = 'SP'
    {excl_block}
    ORDER BY pg.divida_total DESC, e.RAZAO_SOCIAL
    LIMIT ?
    """
    params: list = [pgfn_org, pgfn_org, max_divida] + excl + [limit]
    cur = con.execute(sql, params)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    con.close()
    out: list[dict[str, str]] = []
    for row in rows:
        d = dict(zip(cols, row))
        for k, v in list(d.items()):
            if v is None:
                d[k] = ""
            elif k in ("divida_total",) and isinstance(v, (float, int)):
                d[k] = f"{float(v):.2f}"
            else:
                d[k] = str(v)
        d["modo"] = "duckdb_pgfn"
        out.append(d)
    return out


def run_fallback_csv(
    *,
    source: Path,
    kommo_excl: set[str],
    max_divida: float,
    limit: int,
) -> list[dict[str, str]]:
    rows = list(csv.DictReader(source.open(encoding="utf-8", newline="")))
    out: list[tuple[float, int, dict]] = []
    for r in rows:
        cnpj = _only_cnpj14(r.get("cnpj") or "")
        if not cnpj or cnpj in kommo_excl:
            continue
        if (r.get("uf") or "").upper() != "SP":
            continue
        try:
            dtot = float(r.get("divida_total") or 0)
        except (TypeError, ValueError):
            continue
        if dtot <= 0 or dtot > max_divida:
            continue
        try:
            qtd = int(float(r.get("qtd_inscricoes") or 0))
        except (TypeError, ValueError):
            qtd = 0
        out.append((dtot, qtd, r))
    out.sort(key=lambda x: (-x[1], -x[0], x[2].get("razao_social", "")))
    selected: list[dict[str, str]] = []
    for dtot, qtd, r in out[:limit]:
        selected.append(
            {
                "cnpj": _only_cnpj14(r.get("cnpj") or ""),
                "razao_social": (r.get("razao_social") or "").strip(),
                "nome_fantasia": (r.get("nome_fantasia") or "").strip(),
                "uf": (r.get("uf") or "").strip(),
                "municipio": (r.get("municipio") or "").strip(),
                "cnae_principal": (r.get("cnae_principal") or "").strip(),
                "cnae_descricao": (r.get("cnae_descricao") or "").strip(),
                "divida_total": f"{dtot:.2f}",
                "qtd_inscricoes": str(qtd),
                "telefone": (r.get("telefone") or "").strip(),
                "email": (r.get("email") or "").strip(),
                "nota": "fallback_leads_pgfn_sp_250; ajustar com query DuckDB na VPS para inscrição recente",
            }
        )
    return selected


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--kommo-export",
        default=str(Path.home() / "Downloads" / "kommo_export_leads_2026-04-27.csv"),
        help="Export Kommo (coluna CNPJ OU CPF)",
    )
    p.add_argument(
        "--out",
        default=str(REPO / "exports" / "quitoubr" / "leads_quitou_pgfn_sp_50.csv"),
    )
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--max-divida", type=float, default=9_000_000.0)
    p.add_argument("--recent-months", type=int, default=18, help="Inscrição PGFN com data_inscricao nessa janela (modo DuckDB)")
    p.add_argument(
        "--pgfn-org",
        default=os.environ.get("HERMES_PG_PUBLIC_SNAPSHOT_ORG_ID", "").strip() or _DEFAULT_PG_ORG,
        help="org_id do snapshot PGFN em fiscal_public_imports (app.duckdb)",
    )
    p.add_argument(
        "--receita-db",
        default=os.environ.get("HERMES_DUCKDB_PATH", "/data/cnpj.duckdb"),
    )
    p.add_argument(
        "--app-db",
        default=os.environ.get("HERMES_APP_DB_PATH", "/data/app.duckdb"),
    )
    p.add_argument(
        "--fallback-csv",
        default=str(REPO / "leads_pgfn_sp_250.csv"),
        help="CSV agregado usado se os DuckDBs não existirem",
    )
    p.add_argument(
        "--excluded-out",
        default="",
        help="Opcional: gravar CNPJs excluídos (Kommo) em .txt",
    )
    args = p.parse_args()

    kommo_path = Path(args.kommo_export)
    if not kommo_path.is_file():
        print(f"Arquivo Kommo não encontrado: {kommo_path}", file=sys.stderr)
        return 2

    excl = load_kommo_cnpjs(kommo_path)
    if args.excluded_out:
        op = Path(args.excluded_out)
        op.parent.mkdir(parents=True, exist_ok=True)
        op.write_text("\n".join(sorted(excl)) + "\n", encoding="utf-8")

    rec = Path(args.receita_db)
    app = Path(args.app_db)
    rows: list[dict[str, str]]
    mode = "duckdb"
    if rec.is_file() and app.is_file():
        try:
            rows = run_duckdb(
                receita_path=str(rec),
                app_path=str(app),
                pgfn_org=args.pgfn_org,
                kommo_excl=excl,
                max_divida=args.max_divida,
                recent_months=args.recent_months,
                limit=args.limit,
            )
        except Exception as e:
            print(f"DuckDB falhou ({e}); usando fallback CSV.", file=sys.stderr)
            rows = run_fallback_csv(
                source=Path(args.fallback_csv),
                kommo_excl=excl,
                max_divida=args.max_divida,
                limit=args.limit,
            )
            mode = "fallback"
    else:
        print("DuckDB não encontrado; usando fallback CSV (leitura agregada).", file=sys.stderr)
        rows = run_fallback_csv(
            source=Path(args.fallback_csv),
            kommo_excl=excl,
            max_divida=args.max_divida,
            limit=args.limit,
        )
        mode = "fallback"

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        print("Nenhum lead após filtros.", file=sys.stderr)
        return 1

    fieldnames = list(rows[0].keys())
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    print(
        f"modo={mode} | excluidos_kommo={len(excl)} | escritos={len(rows)} -> {out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
