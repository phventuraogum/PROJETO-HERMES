-- 50 empresas com CNAE principal de estética (9602-5/02) no município de São Paulo (capital).
-- Executar com DuckDB apontando para cnpj.duckdb, ex.:
--   duckdb "$HERMES_DUCKDB_PATH" -c ".read tools/query_clinicas_estetica_receita_sp.sql"
-- Ajuste o filtro de município se sua view usar outro nome de coluna ou código IBGE.

SELECT
    e.cnpj,
    e.RAZAO_SOCIAL AS razao_social,
    e.NOME_FANTASIA AS nome_fantasia,
    e.UF AS uf,
    e.cidade_nome AS municipio,
    e.CNAE_PRINCIPAL AS cnae_principal,
    e.cnae_descricao,
    e.telefone_receita AS telefone,
    e.email_receita AS email
FROM vw_prospeccao_base e
WHERE UPPER(COALESCE(e.UF, '')) = 'SP'
  AND (
        UPPER(REGEXP_REPLACE(COALESCE(e.cidade_nome, ''), '[[:space:]]+', ' ', 'g')) LIKE '%SAO PAULO%'
        OR UPPER(COALESCE(e.cidade_nome, '')) LIKE '%SÃO PAULO%'
    )
  AND (
        REPLACE(REPLACE(COALESCE(e.CNAE_PRINCIPAL, ''), '-', ''), '/', '') LIKE '9602502%'
        OR COALESCE(e.CNAE_PRINCIPAL, '') LIKE '9602-5/02%'
    )
ORDER BY e.RAZAO_SOCIAL
LIMIT 50;
