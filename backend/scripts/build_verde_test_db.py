"""
Cria uma DuckDB de validacao com empresas reais do recorte verde/green.

Objetivo:
- permitir prospeccao local sem depender da base Receita completa;
- manter schema compativel com o fluxo principal do Hermes;
- fornecer 5 empresas reais, com sites oficiais e contatos publicos.

Observacao:
- esta base e curada para testes funcionais;
- nomes, CNPJs, sites e contatos vieram de fontes publicas;
- campos complementares ausentes na fonte oficial foram normalizados para viabilizar o teste.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

import duckdb


DB_DEFAULT = Path(__file__).resolve().parents[1] / "devdata" / "hermes-verde-real.duckdb"


COMPANIES = [
    {
        "cnpj": "08000607000183",
        "razao_social": "VERDE FERTILIZANTES LTDA",
        "nome_fantasia": "VERDE AGRITECH",
        "cidade": "BELO HORIZONTE",
        "uf": "MG",
        "cnae": "2013402",
        "cnae_descricao": "Fabricacao de adubos e fertilizantes, exceto organo-minerais",
        "porte": "05",
        "capital": 57061135.34,
        "telefone": "3132450205",
        "email": "seja@verde.ag",
        "site": "https://verde.ag",
        "email_enriquecido": "seja@verde.ag",
        "telefone_enriquecido": "3132450205",
        "whatsapp_publico": "",
        "whatsapp_enriquecido": "",
        "outras_info": "LinkedIn: https://www.linkedin.com/company/verde-agritech",
        "email_final": "seja@verde.ag",
        "telefone_final": "3132450205",
        "whatsapp_final": "",
        "sidra_pib": 106000000000.0,
        "sidra_populacao": 2315560.0,
        "sidra_pib_per_capita": 45766.0,
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cep": "",
        "data_inicio": "2007-02-14",
        "natureza": "2062",
        "situacao": "02",
        "municipio": "3106200",
        "socios": [
            ("08000607", "CRISTIANO VELOSO", "16", "2007-02-14", "", "", ""),
            ("08000607", "MARCUS VINICIUS RIBEIRO", "49", "2007-02-14", "", "", ""),
        ],
        "estabele": ("08000607", "0001", "83", "31", "32450205", "", "", "2013402"),
    },
    {
        "cnpj": "07757005000102",
        "razao_social": "LATICINIOS VERDE CAMPO S.A.",
        "nome_fantasia": "VERDE CAMPO",
        "cidade": "LAVRAS",
        "uf": "MG",
        "cnae": "1051100",
        "cnae_descricao": "Preparacao do leite",
        "porte": "05",
        "capital": 494081569.00,
        "telefone": "3538293000",
        "email": "sac@verdecampo.com.br",
        "site": "https://www.verdecampo.com.br",
        "email_enriquecido": "sac@verdecampo.com.br",
        "telefone_enriquecido": "3538293000",
        "whatsapp_publico": "",
        "whatsapp_enriquecido": "",
        "outras_info": "Instagram: https://www.instagram.com/verdecampo",
        "email_final": "sac@verdecampo.com.br",
        "telefone_final": "3538293000",
        "whatsapp_final": "",
        "sidra_pib": 11100000000.0,
        "sidra_populacao": 106000.0,
        "sidra_pib_per_capita": 104717.0,
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cep": "",
        "data_inicio": "2005-12-20",
        "natureza": "2054",
        "situacao": "02",
        "municipio": "3138203",
        "socios": [
            ("07757005", "FABIO SOARES FERREIRA", "16", "2005-12-20", "", "", ""),
            ("07757005", "EWERTON ALMEIDA BRETZ", "49", "2005-12-20", "", "", ""),
        ],
        "estabele": ("07757005", "0001", "02", "35", "38293000", "", "", "1051100"),
    },
    {
        "cnpj": "03175428000163",
        "razao_social": "AMBIPAR GREEN TECH LTDA",
        "nome_fantasia": "VERDE GHAIA",
        "cidade": "BELO HORIZONTE",
        "uf": "MG",
        "cnae": "6202300",
        "cnae_descricao": "Desenvolvimento e licenciamento de programas de computador customizaveis",
        "porte": "03",
        "capital": 200000.00,
        "telefone": "3121279137",
        "email": "comercial@verdeghaia.com.br",
        "site": "https://www.verdeghaia.com.br",
        "email_enriquecido": "comercial@verdeghaia.com.br",
        "telefone_enriquecido": "3121279137",
        "whatsapp_publico": "",
        "whatsapp_enriquecido": "",
        "outras_info": "LinkedIn: https://www.linkedin.com/company/verde-ghaia",
        "email_final": "comercial@verdeghaia.com.br",
        "telefone_final": "3121279137",
        "whatsapp_final": "",
        "sidra_pib": 106000000000.0,
        "sidra_populacao": 2315560.0,
        "sidra_pib_per_capita": 45766.0,
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cep": "",
        "data_inicio": "1999-04-26",
        "natureza": "2062",
        "situacao": "02",
        "municipio": "3106200",
        "socios": [
            ("03175428", "VICTOR DAVI PATINI BORLENGHI", "49", "1999-04-26", "", "", ""),
            ("03175428", "CLAUDINEI ELIAS", "49", "1999-04-26", "", "", ""),
        ],
        "estabele": ("03175428", "0001", "63", "31", "21279137", "", "", "6202300"),
    },
    {
        "cnpj": "28069252000196",
        "razao_social": "TAMPEC SOLUCOES EM TECNOLOGIA E LOGISTICA LTDA",
        "nome_fantasia": "GREENMINING",
        "cidade": "SAO PAULO",
        "uf": "SP",
        "cnae": "3811400",
        "cnae_descricao": "Coleta de residuos nao-perigosos",
        "porte": "03",
        "capital": 675000.00,
        "telefone": "",
        "email": "contato@greenmining.com.br",
        "site": "https://greenmining.com.br",
        "email_enriquecido": "contato@greenmining.com.br",
        "telefone_enriquecido": "",
        "whatsapp_publico": "",
        "whatsapp_enriquecido": "",
        "outras_info": "LinkedIn: https://www.linkedin.com/company/greenmining",
        "email_final": "contato@greenmining.com.br",
        "telefone_final": "",
        "whatsapp_final": "",
        "sidra_pib": 828000000000.0,
        "sidra_populacao": 11451245.0,
        "sidra_pib_per_capita": 72308.0,
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cep": "",
        "data_inicio": "2017-07-11",
        "natureza": "2062",
        "situacao": "02",
        "municipio": "3550308",
        "socios": [
            ("28069252", "RODRIGO OLIVEIRA", "49", "2017-07-11", "", "", ""),
            ("28069252", "LEANDRO METROPOLO", "49", "2017-07-11", "", "", ""),
        ],
        "estabele": ("28069252", "0001", "96", "", "", "", "", "3811400"),
    },
    {
        "cnpj": "20993615000173",
        "razao_social": "GREENYELLOW DO BRASIL ENERGIA E SERVICOS LTDA",
        "nome_fantasia": "GREENYELLOW BRASIL",
        "cidade": "SAO PAULO",
        "uf": "SP",
        "cnae": "4669999",
        "cnae_descricao": "Comercio atacadista de outras maquinas e equipamentos nao especificados anteriormente",
        "porte": "05",
        "capital": 931778456.00,
        "telefone": "",
        "email": "contato@greenyellow.com.br",
        "site": "https://www.greenyellow.com/br",
        "email_enriquecido": "contato@greenyellow.com.br",
        "telefone_enriquecido": "",
        "whatsapp_publico": "",
        "whatsapp_enriquecido": "",
        "outras_info": "LinkedIn: https://www.linkedin.com/company/greenyellow",
        "email_final": "contato@greenyellow.com.br",
        "telefone_final": "",
        "whatsapp_final": "",
        "sidra_pib": 828000000000.0,
        "sidra_populacao": 11451245.0,
        "sidra_pib_per_capita": 72308.0,
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cep": "",
        "data_inicio": "2014-08-22",
        "natureza": "2062",
        "situacao": "02",
        "municipio": "3550308",
        "socios": [
            ("20993615", "MARCELO EDUARDO XAVIER", "16", "2022-01-01", "", "", ""),
            ("20993615", "FERNANDO DE OLIVEIRA SILVEIRA", "49", "2014-08-22", "", "", ""),
        ],
        "estabele": ("20993615", "0001", "73", "", "", "", "", "4669999"),
    },
]


def _create_schema(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cnpj_empresas (
            cnpj VARCHAR,
            RAZAO_SOCIAL VARCHAR,
            NOME_FANTASIA VARCHAR,
            cidade_nome VARCHAR,
            UF VARCHAR,
            CNAE_PRINCIPAL VARCHAR,
            cnae_descricao VARCHAR,
            PORTE_EMPRESA VARCHAR,
            CAPITAL_SOCIAL_NUM DOUBLE,
            CAPITAL_SOCIAL VARCHAR,
            telefone_receita VARCHAR,
            email_receita VARCHAR,
            site VARCHAR,
            email_enriquecido VARCHAR,
            telefone_enriquecido VARCHAR,
            whatsapp_publico VARCHAR,
            whatsapp_enriquecido VARCHAR,
            outras_informacoes VARCHAR,
            email_final VARCHAR,
            telefone_final VARCHAR,
            whatsapp_final VARCHAR,
            sidra_pib DOUBLE,
            sidra_populacao DOUBLE,
            sidra_pib_per_capita DOUBLE,
            LOGRADOURO VARCHAR,
            NUMERO VARCHAR,
            COMPLEMENTO VARCHAR,
            BAIRRO VARCHAR,
            CEP VARCHAR,
            DATA_INICIO_ATIVIDADE VARCHAR,
            NATUREZA_JURIDICA VARCHAR,
            SITUACAO_CADASTRAL VARCHAR,
            MUNICIPIO VARCHAR
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS socios (
            CNPJ_BASICO VARCHAR,
            NOME_SOCIO VARCHAR,
            QUALIFICACAO_SOCIO VARCHAR,
            DATA_ENTRADA_SOCIEDADE VARCHAR,
            CPF_CNPJ_SOCIO VARCHAR,
            REPRESENTANTE_LEGAL VARCHAR,
            NOME_REPRESENTANTE VARCHAR
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS estabele (
            CNPJ_BASICO VARCHAR,
            CNPJ_ORDEM VARCHAR,
            CNPJ_DIGITO VARCHAR,
            DDD1 VARCHAR,
            TELEFONE1 VARCHAR,
            DDD2 VARCHAR,
            TELEFONE2 VARCHAR,
            CNAES_SECUNDARIOS VARCHAR
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS municipios (
            COD_MUNICIPIO VARCHAR,
            NOME_MUNICIPIO VARCHAR
        )
        """
    )


def _reset_data(conn: duckdb.DuckDBPyConnection) -> None:
    for table in ("cnpj_empresas", "socios", "estabele", "municipios"):
        conn.execute(f"DELETE FROM {table}")


def _insert_companies(conn: duckdb.DuckDBPyConnection) -> None:
    conn.executemany(
        """
        INSERT INTO cnpj_empresas VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        """,
        [
            (
                c["cnpj"],
                c["razao_social"],
                c["nome_fantasia"],
                c["cidade"],
                c["uf"],
                c["cnae"],
                c["cnae_descricao"],
                c["porte"],
                c["capital"],
                str(c["capital"]),
                c["telefone"],
                c["email"],
                c["site"],
                c["email_enriquecido"],
                c["telefone_enriquecido"],
                c["whatsapp_publico"],
                c["whatsapp_enriquecido"],
                c["outras_info"],
                c["email_final"],
                c["telefone_final"],
                c["whatsapp_final"],
                c["sidra_pib"],
                c["sidra_populacao"],
                c["sidra_pib_per_capita"],
                c["logradouro"],
                c["numero"],
                c["complemento"],
                c["bairro"],
                c["cep"],
                c["data_inicio"],
                c["natureza"],
                c["situacao"],
                c["municipio"],
            )
            for c in COMPANIES
        ],
    )


def _insert_many(conn: duckdb.DuckDBPyConnection, sql: str, rows: Iterable[tuple]) -> None:
    rows = list(rows)
    if rows:
        conn.executemany(sql, rows)


def _rebuild_view(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("DROP VIEW IF EXISTS vw_prospeccao_base")
    conn.execute(
        """
        CREATE VIEW vw_prospeccao_base AS
        SELECT
            *,
            UPPER(
                COALESCE(RAZAO_SOCIAL, '') || ' ' ||
                COALESCE(NOME_FANTASIA, '') || ' ' ||
                COALESCE(cidade_nome, '')
            ) AS busca_texto
        FROM cnpj_empresas
        """
    )


def build_verde_database(db_path: str | Path = DB_DEFAULT) -> str:
    target = Path(db_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    conn = duckdb.connect(str(target))
    try:
        _create_schema(conn)
        _reset_data(conn)
        _insert_companies(conn)
        _insert_many(
            conn,
            "INSERT INTO socios VALUES (?, ?, ?, ?, ?, ?, ?)",
            [row for company in COMPANIES for row in company["socios"]],
        )
        _insert_many(
            conn,
            "INSERT INTO estabele VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [company["estabele"] for company in COMPANIES],
        )
        _insert_many(
            conn,
            "INSERT INTO municipios VALUES (?, ?)",
            [
                ("3106200", "BELO HORIZONTE"),
                ("3138203", "LAVRAS"),
                ("3550308", "SAO PAULO"),
            ],
        )
        _rebuild_view(conn)
    finally:
        conn.close()

    return str(target)


if __name__ == "__main__":
    path = build_verde_database()
    print(path)
