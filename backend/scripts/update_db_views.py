"""
Script para atualizar as views da cnpj.duckdb.

Melhorias aplicadas:
1. busca_texto inclui descrição do CNAE → buscas por setor passam a funcionar
2. vw_prospeccao_base remove o filtro obrigatório de contato → mais empresas
   retornadas (todos com ATIVO+MATRIZ, não só os que têm email/telefone na Receita)
3. Mantém os demais filtros: SITUACAO_CADASTRAL=02, MATRIZ_FILIAL=1

Como usar:
    python scripts/update_db_views.py --db /data/cnpj.duckdb

Ou apontando para o banco local:
    python scripts/update_db_views.py --db "G:/icp_radar/dados_receita/cnpj.duckdb"
"""

import argparse
import duckdb


def update_views(db_path: str) -> None:
    print(f"Abrindo banco: {db_path}")
    conn = duckdb.connect(db_path, read_only=False)

    try:
        # ── 1. vw_busca_empresas: inclui cnae_descricao no busca_texto ────────
        print("Atualizando vw_busca_empresas …")
        conn.execute("DROP VIEW IF EXISTS vw_busca_empresas")
        conn.execute("""
            CREATE VIEW vw_busca_empresas AS
            SELECT
                e.*,
                UPPER(e.RAZAO_SOCIAL)  AS razao_upper,
                UPPER(e.NOME_FANTASIA) AS fantasia_upper,
                UPPER(
                    COALESCE(e.RAZAO_SOCIAL, '')     || ' ' ||
                    COALESCE(e.NOME_FANTASIA, '')    || ' ' ||
                    COALESCE(e.cnae_descricao, '')
                ) AS busca_texto
            FROM vw_empresas_enriquecidas AS e
        """)
        print("  OK vw_busca_empresas atualizada")

        # ── 2. vw_prospeccao_base: remove filtro obrigatório de contato ───────
        #    Mantém: ATIVA (02) + MATRIZ (1)
        #    Remove: exigência de email_final/telefone_final/whatsapp_final
        print("Atualizando vw_prospeccao_base …")
        conn.execute("DROP VIEW IF EXISTS vw_prospeccao_base")
        conn.execute("""
            CREATE VIEW vw_prospeccao_base AS
            SELECT
                e.*,
                m.NOME_MUNICIPIO            AS cidade_nome,
                sc.pib_corrente             AS sidra_pib,
                sc.populacao_residente      AS sidra_populacao,
                sc.pib_per_capita           AS sidra_pib_per_capita
            FROM vw_busca_empresas AS e
            LEFT JOIN municipios AS m
                ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
            LEFT JOIN sidra_contexto_municipio_latest AS sc
                ON  UPPER(sc.municipio) = UPPER(m.NOME_MUNICIPIO)
                AND UPPER(sc.uf)        = UPPER(e.UF)
            WHERE e.SITUACAO_CADASTRAL = '02'
              AND e.MATRIZ_FILIAL      = '1'
        """)
        print("  OK vw_prospeccao_base atualizada")

        # ── 3. Verifica resultado ────────────────────────────────────────────
        total = conn.execute("SELECT COUNT(*) FROM vw_prospeccao_base").fetchone()[0]
        print(f"\nTotal de empresas na vw_prospeccao_base: {total:,}")

        com_contato = conn.execute("""
            SELECT COUNT(*) FROM vw_prospeccao_base
            WHERE email_final IS NOT NULL
               OR telefone_final IS NOT NULL
               OR whatsapp_final IS NOT NULL
        """).fetchone()[0]
        print(f"  Com algum contato: {com_contato:,}")
        print(f"  Sem contato (novos): {total - com_contato:,}")

        conn.commit()
        print("\nViews atualizadas com sucesso!")

    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Atualiza views do cnpj.duckdb")
    parser.add_argument(
        "--db",
        default="/data/cnpj.duckdb",
        help="Caminho para o cnpj.duckdb (padrão: /data/cnpj.duckdb)",
    )
    args = parser.parse_args()
    update_views(args.db)
