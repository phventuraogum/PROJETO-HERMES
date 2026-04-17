"""
Importa dados PGFN (Divida Ativa da Uniao - Nao Previdenciario) para cnpj.duckdb.

Os CSVs sao os arquivos 'arquivo_lai_SIDA_*.csv' disponiveis em dados.pgfn.gov.br.
Encoding: latin-1 | Delimitador: semicolon

Uso:
    python scripts/import_pgfn.py \\
        --db "G:/icp_radar/dados_receita/cnpj.duckdb" \\
        --dir "C:/Users/ventu/Desktop/Dados_abertos_Nao_Previdenciario"

Cria tabela 'pgfn_dividas' com:
    cnpj            VARCHAR   (14 digitos, sem formatacao)
    uf_devedor      VARCHAR
    divida_total    DOUBLE    (soma de todos os debitos do CNPJ)
    qtd_inscricoes  INTEGER
"""

import argparse
import os
import glob
import duckdb


def import_pgfn(db_path: str, csv_dir: str) -> None:
    print(f"Banco:    {db_path}")
    print(f"CSV dir:  {csv_dir}")

    csv_pattern = os.path.join(csv_dir, "*.csv").replace("\\", "/")
    arquivos = glob.glob(csv_pattern)
    if not arquivos:
        print(f"ERRO: nenhum CSV encontrado em {csv_dir}")
        return
    print(f"Arquivos encontrados: {len(arquivos)}")
    for f in sorted(arquivos):
        print(f"  {os.path.basename(f)}")

    con = duckdb.connect(db_path, read_only=False)
    try:
        print("\nImportando (pode levar 3-5 min para 40M linhas)...")

        # Cria/substitui tabela pgfn_dividas
        con.execute("DROP TABLE IF EXISTS pgfn_dividas")
        con.execute(f"""
            CREATE TABLE pgfn_dividas AS
            SELECT
                REGEXP_REPLACE(CPF_CNPJ, '[^0-9]', '', 'g')   AS cnpj,
                UF_DEVEDOR                                      AS uf_devedor,
                SUM(
                    CAST(REPLACE(VALOR_CONSOLIDADO::VARCHAR, ',', '.') AS DOUBLE)
                )                                               AS divida_total,
                COUNT(*)                                        AS qtd_inscricoes
            FROM read_csv(
                '{csv_pattern}',
                delim=';',
                header=true,
                encoding='latin-1',
                ignore_errors=true
            )
            WHERE TIPO_PESSOA ILIKE '%jur%'
              AND LEN(REGEXP_REPLACE(CPF_CNPJ, '[^0-9]', '', 'g')) = 14
            GROUP BY cnpj, UF_DEVEDOR
        """)

        # Indice no CNPJ para join rapido
        print("Criando indice em pgfn_dividas(cnpj)...")
        con.execute("CREATE INDEX IF NOT EXISTS idx_pgfn_cnpj ON pgfn_dividas (cnpj)")

        total = con.execute("SELECT COUNT(*) FROM pgfn_dividas").fetchone()[0]
        ufs   = con.execute("SELECT COUNT(DISTINCT uf_devedor) FROM pgfn_dividas").fetchone()[0]
        print(f"\nOK! pgfn_dividas importada:")
        print(f"  Linhas (CNPJ x UF):   {total:,}")
        print(f"  UFs distintas:         {ufs}")

        # Amostra SP
        sp = con.execute("""
            SELECT COUNT(*) FROM pgfn_dividas
            WHERE uf_devedor = 'SP' AND divida_total <= 10000000
        """).fetchone()[0]
        print(f"  SP com divida <= 10M: {sp:,}")

        con.commit()
        print("\nImportacao concluida.")

    finally:
        con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importa CSVs PGFN para cnpj.duckdb")
    parser.add_argument("--db",  default="/data/cnpj.duckdb",
                        help="Caminho para cnpj.duckdb")
    parser.add_argument("--dir", default="/data/pgfn",
                        help="Pasta com os CSVs PGFN (arquivo_lai_SIDA_*.csv)")
    args = parser.parse_args()
    import_pgfn(args.db, args.dir)
