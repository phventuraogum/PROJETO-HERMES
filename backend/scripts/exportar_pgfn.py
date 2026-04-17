"""
Exporta empresas ativas com divida PGFN para CSV/Excel.

Uso rapido:
    # SP com divida ate R$10M (top 10000 por divida)
    python scripts/exportar_pgfn.py --uf SP --divida-max 10000000 --limite 10000

    # Brasil inteiro, EPP e ME, divida 100k-2M
    python scripts/exportar_pgfn.py --divida-min 100000 --divida-max 2000000 --portes ME EPP

    # Sector de saude em SP, com email obrigatorio
    python scripts/exportar_pgfn.py --uf SP --cnaes saude --com-contato

Requer que pgfn_dividas ja esteja importada no banco (rodar import_pgfn.py primeiro).
"""

import argparse
import os
import sys
import duckdb
import pandas as pd


SEGMENTO_CNAES = {
    "ti": ["6201","6202","6203","6204","6209","6311","6319","6399"],
    "saude": ["8610","8621","8622","8623","8630","8640","8650","8660","8690"],
    "juridico": ["6911","6912"],
    "contabil": ["6920"],
    "consultoria": ["7020","7490"],
    "logistica": ["4930","5210","5229","5250","5310","5320"],
    "industria": ["2800","2810","2821","2822","2823","2824","2825","2829","2830","2840"],
    "varejo": ["4711","4712","4713","4721","4722","4723","4724","4729","4731"],
    "alimentacao": ["5611","5612","5620"],
    "educacao": ["8511","8512","8513","8520","8531","8532","8541","8542","8550","8591","8599"],
}

PORTE_MAP = {"ME": "01", "EPP": "03", "Grande": "05", "Medio": "05"}
PORTE_LABEL = {"01": "ME", "03": "EPP", "05": "Medio/Grande"}


def exportar(args) -> None:
    db_path = args.db
    if not os.path.exists(db_path):
        print(f"ERRO: banco nao encontrado em {db_path}")
        sys.exit(1)

    con = duckdb.connect(db_path, read_only=True)

    # Verifica tabela
    try:
        con.execute("SELECT COUNT(*) FROM pgfn_dividas").fetchone()
    except Exception:
        print("ERRO: tabela pgfn_dividas nao encontrada.")
        print("Execute primeiro: python scripts/import_pgfn.py --db <db> --dir <pasta_csvs>")
        sys.exit(1)

    conditions = ["p.divida_total >= ?", "p.divida_total <= ?", "p.divida_total > 0"]
    params = [args.divida_min, args.divida_max]

    if args.uf:
        conditions.append("b.UF = ?")
        params.append(args.uf.upper())

    if args.municipio:
        conditions.append("UPPER(b.cidade_nome) LIKE ?")
        params.append(f"%{args.municipio.upper()}%")

    if args.portes:
        codigos = list({PORTE_MAP.get(p, p) for p in args.portes})
        phs = ", ".join("?" * len(codigos))
        conditions.append(f"b.PORTE_EMPRESA IN ({phs})")
        params.extend(codigos)

    if args.cnaes:
        cnae_codes = []
        for c in args.cnaes:
            expanded = SEGMENTO_CNAES.get(c.lower())
            if expanded:
                cnae_codes.extend(expanded)
                print(f"  Segmento '{c}' expandido para {len(expanded)} CNAEs")
            else:
                cnae_codes.append(c)
        if cnae_codes:
            phs = ", ".join("?" * len(cnae_codes))
            conditions.append(f"LEFT(b.CNAE_PRINCIPAL, 4) IN ({phs})")
            params.extend(cnae_codes)

    if args.com_contato:
        conditions.append("(b.email_final IS NOT NULL OR b.telefone_final IS NOT NULL OR b.telefone_receita IS NOT NULL)")

    where = " AND ".join(conditions)
    ordem_map = {
        "divida_desc": "p.divida_total DESC",
        "divida_asc":  "p.divida_total ASC",
        "capital_desc": "b.CAPITAL_SOCIAL_NUM DESC NULLS LAST",
        "recente": "b.DATA_INICIO_ATIVIDADE DESC NULLS LAST",
    }
    order_clause = ordem_map.get(args.ordem, "p.divida_total DESC")

    print(f"Consultando banco (limite={args.limite})...")
    df = con.execute(f"""
        SELECT
            b.cnpj,
            b.RAZAO_SOCIAL              AS razao_social,
            b.NOME_FANTASIA             AS nome_fantasia,
            b.CNAE_PRINCIPAL            AS cnae,
            b.cnae_descricao,
            b.PORTE_EMPRESA             AS porte_cod,
            b.CAPITAL_SOCIAL_NUM        AS capital_social,
            COALESCE(b.email_final, b.email_receita)       AS email,
            COALESCE(b.telefone_final, b.telefone_receita) AS telefone,
            b.whatsapp_final            AS whatsapp,
            b.site,
            b.cidade_nome               AS cidade,
            b.UF                        AS uf,
            b.LOGRADOURO                AS logradouro,
            b.NUMERO                    AS numero,
            b.CEP                       AS cep,
            b.DATA_INICIO_ATIVIDADE     AS data_abertura,
            p.divida_total              AS divida_pgfn,
            p.qtd_inscricoes            AS qtd_inscricoes_pgfn
        FROM vw_prospeccao_base AS b
        INNER JOIN pgfn_dividas AS p ON p.cnpj = b.cnpj
        WHERE {where}
        ORDER BY {order_clause}
        LIMIT {args.limite}
    """, params).fetchdf()

    con.close()
    print(f"Encontradas: {len(df)} empresas")

    # Formata
    df["porte"] = df["porte_cod"].map(lambda x: PORTE_LABEL.get(str(x).strip(), str(x)))
    df["divida_pgfn_fmt"] = df["divida_pgfn"].apply(lambda x: f"R$ {x:,.2f}")
    df = df.drop(columns=["porte_cod"])

    # Saida
    out = args.saida
    if not out:
        filtro_str = f"_UF-{args.uf}" if args.uf else ""
        filtro_str += f"_max{int(args.divida_max/1000)}k" if args.divida_max < 1e9 else ""
        out = f"pgfn_leads{filtro_str}.csv"

    if out.endswith(".xlsx"):
        df.to_excel(out, index=False)
    else:
        df.to_csv(out, index=False, encoding="utf-8-sig")  # utf-8-sig abre bem no Excel

    print(f"Exportado: {os.path.abspath(out)}")

    # Preview
    print("\n--- PREVIEW (primeiras 5 linhas) ---")
    preview_cols = ["cnpj","razao_social","divida_pgfn_fmt","porte","email","telefone","cidade"]
    print(df[preview_cols].head(5).to_string(index=False))

    print(f"\n--- RESUMO ---")
    print(f"Total:           {len(df):,}")
    print(f"Com email:       {df['email'].notna().sum():,}")
    print(f"Com telefone:    {df['telefone'].notna().sum():,}")
    print(f"ME:              {(df['porte']=='ME').sum():,}")
    print(f"EPP:             {(df['porte']=='EPP').sum():,}")
    print(f"Medio/Grande:    {(df['porte']=='Medio/Grande').sum():,}")
    print(f"Divida media:    R$ {df['divida_pgfn'].mean():,.2f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Exporta leads PGFN para CSV/Excel")
    parser.add_argument("--db", default="G:/icp_radar/dados_receita/cnpj.duckdb")
    parser.add_argument("--uf", default=None, help="UF (ex: SP)")
    parser.add_argument("--municipio", default=None)
    parser.add_argument("--divida-min", type=float, default=0)
    parser.add_argument("--divida-max", type=float, default=10_000_000)
    parser.add_argument("--portes", nargs="+", choices=["ME","EPP","Grande","Medio"], default=None)
    parser.add_argument("--cnaes", nargs="+", default=None,
                        help="CNAEs (4 digitos) ou aliases: ti, saude, juridico, contabil, logistica...")
    parser.add_argument("--com-contato", action="store_true",
                        help="Retornar somente empresas com email ou telefone")
    parser.add_argument("--limite", type=int, default=10000)
    parser.add_argument("--ordem", choices=["divida_desc","divida_asc","capital_desc","recente"],
                        default="divida_desc")
    parser.add_argument("--saida", default=None, help="Arquivo de saida (.csv ou .xlsx)")
    args = parser.parse_args()
    exportar(args)
