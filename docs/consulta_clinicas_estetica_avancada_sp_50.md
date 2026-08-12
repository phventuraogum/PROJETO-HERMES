# Consulta: 50 estabelecimentos de estética / clínica / spa em São Paulo (município)

## Fonte

- **OpenStreetMap** via Overpass API.
- **Área geográfica**: polígono administrativo do **município de São Paulo** (Wikidata `Q174`).
- **Tipos OSM considerados**: `shop=beauty`, `amenity=spa`, `healthcare=clinic`, `amenity=clinic`.
- **Filtro textual**: nome precisa conter ao menos uma palavra-chave relacionada a estética avançada (harmonização, laser, dermatologia, injetáveis, peeling, medicina estética, etc.).

## Limitações importantes

- **Não é o Cadastro Nacional da Receita**: normalmente **não há CNPJ** nesta lista.
- Cobertura depende do que voluntários mapearam no OSM; pode faltar clínica relevante ou haver desatualização.
- Telefone e site vêm de tags OSM quando existem.

## Arquivo

- `exports/quitoubr/clinicas_estetica_avancada_sp_osm_50.csv`

## Lista oficial por CNAE (Receita / DuckDB)

Para 50 empresas com **CNAE 9602-5/02** (e opcionalmente consultórios de dermatologia) no município de São Paulo, use o banco `cnpj.duckdb` e o script SQL em `tools/query_clinicas_estetica_receita_sp.sql` na VPS (variável `HERMES_DUCKDB_PATH`).
