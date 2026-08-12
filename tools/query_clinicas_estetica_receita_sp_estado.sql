-- Clínicas de estética (CNAE principal 9602-5/02) em todo o estado de São Paulo.
-- Ajuste LIMIT conforme necessário (ex.: 1000).

SELECT
    e.cnpj,
    e.RAZAO_SOCIAL AS razao_social,
    e.NOME_FANTASIA AS nome_fantasia,
    e.cidade_nome AS municipio,
    e.UF AS uf,
    e.CNAE_PRINCIPAL AS cnae_principal,
    e.cnae_descricao,
    e.SITUACAO_CADASTRAL AS situacao_cadastral,
    e.telefone_receita AS telefone,
    e.email_receita AS email
FROM vw_prospeccao_base e
WHERE UPPER(COALESCE(e.UF, '')) = 'SP'
  AND (
        REPLACE(REPLACE(COALESCE(e.CNAE_PRINCIPAL, ''), '-', ''), '/', '') LIKE '9602502%'
        OR COALESCE(e.CNAE_PRINCIPAL, '') LIKE '9602-5/02%'
      )
  AND (e.SITUACAO_CADASTRAL = '02' OR e.SITUACAO_CADASTRAL IS NULL)
ORDER BY e.RAZAO_SOCIAL
LIMIT 1000;
