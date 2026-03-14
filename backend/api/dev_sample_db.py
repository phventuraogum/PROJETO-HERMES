"""
Bootstrap de DuckDB de amostra para desenvolvimento local.
"""
from __future__ import annotations

import os
from pathlib import Path

import duckdb


def bootstrap_sample_database(db_path: str) -> str:
    """
    Cria um DuckDB minimo com as tabelas usadas pelos fluxos principais.
    """
    target = Path(db_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    conn = duckdb.connect(str(target))
    try:
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

        existing = conn.execute("SELECT COUNT(*) FROM cnpj_empresas").fetchone()[0]
        if existing == 0:
            conn.executemany(
                """
                INSERT INTO cnpj_empresas VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                """,
                [
                    (
                        "12345678000190",
                        "CLINICA ALFA LTDA",
                        "CLINICA ALFA",
                        "BELO HORIZONTE",
                        "MG",
                        "8640",
                        "Clinicas medicas",
                        "03",
                        350000.0,
                        "350000",
                        "3132004000",
                        "contato@clinicaalfa.com.br",
                        "https://clinicaalfa.com.br",
                        "contato@clinicaalfa.com.br",
                        "3132004000",
                        "5531999001001",
                        "5531999001001",
                        "LinkedIn: https://linkedin.com/company/clinica-alfa",
                        "contato@clinicaalfa.com.br",
                        "3132004000",
                        "5531999001001",
                        9800000.0,
                        2300000.0,
                        4260.0,
                        "AV AFONSO PENA",
                        "1000",
                        "",
                        "CENTRO",
                        "30130000",
                        "2018-05-10",
                        "2062",
                        "02",
                        "0001",
                    ),
                    (
                        "22345678000190",
                        "HOSPITAL SERRA AZUL S A",
                        "HOSPITAL SERRA AZUL",
                        "SAO PAULO",
                        "SP",
                        "8610",
                        "Hospitais gerais",
                        "05",
                        2400000.0,
                        "2400000",
                        "1135006000",
                        "comercial@serraazul.com.br",
                        "https://serraazul.com.br",
                        "relacionamento@serraazul.com.br",
                        "1135006000",
                        "5511988002002",
                        "5511988002002",
                        "Instagram: https://instagram.com/serraazul",
                        "relacionamento@serraazul.com.br",
                        "1135006000",
                        "5511988002002",
                        12000000.0,
                        11400000.0,
                        1050.0,
                        "RUA VERGUEIRO",
                        "2500",
                        "",
                        "VILA MARIANA",
                        "04101000",
                        "2012-03-15",
                        "2054",
                        "02",
                        "0002",
                    ),
                    (
                        "32345678000190",
                        "SUPERMERCADO CENTRAL RIO LTDA",
                        "SUPERCENTRAL",
                        "RIO DE JANEIRO",
                        "RJ",
                        "4711",
                        "Supermercados",
                        "03",
                        780000.0,
                        "780000",
                        "2132007000",
                        "compras@supercentral.com.br",
                        "https://supercentral.com.br",
                        "",
                        "",
                        "5521999003003",
                        "",
                        "",
                        "compras@supercentral.com.br",
                        "2132007000",
                        "5521999003003",
                        8700000.0,
                        6700000.0,
                        1298.0,
                        "RUA DO OUVIDOR",
                        "300",
                        "",
                        "CENTRO",
                        "20040030",
                        "2016-11-01",
                        "2062",
                        "02",
                        "0003",
                    ),
                    (
                        "42345678000190",
                        "LOGISTICA VALE VERDE LTDA",
                        "VALE VERDE LOG",
                        "CURITIBA",
                        "PR",
                        "4930",
                        "Transporte rodoviario",
                        "05",
                        1600000.0,
                        "1600000",
                        "4136008000",
                        "operacao@valeverde.com.br",
                        "https://valeverde.com.br",
                        "vendas@valeverde.com.br",
                        "4136008000",
                        "",
                        "",
                        "LinkedIn: https://linkedin.com/company/vale-verde-log",
                        "vendas@valeverde.com.br",
                        "4136008000",
                        "",
                        4500000.0,
                        1960000.0,
                        2295.0,
                        "RUA CHILE",
                        "80",
                        "",
                        "REBOUCAS",
                        "80220181",
                        "2014-08-20",
                        "2062",
                        "02",
                        "0004",
                    ),
                ],
            )

            conn.executemany(
                "INSERT INTO socios VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    ("12345678", "MARIA ALVES", "49", "2018-05-10", "12345678901", "", ""),
                    ("22345678", "CARLOS PEREIRA", "16", "2012-03-15", "22345678901", "", ""),
                    ("32345678", "ANA COSTA", "49", "2016-11-01", "32345678901", "", ""),
                    ("42345678", "JOAO LIMA", "49", "2014-08-20", "42345678901", "", ""),
                ],
            )

            conn.executemany(
                "INSERT INTO estabele VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    ("12345678", "0001", "90", "31", "32004000", "31", "32004001", "8630503,8640204"),
                    ("22345678", "0001", "90", "11", "35006000", "11", "35006001", "8610101,8640202"),
                    ("32345678", "0001", "90", "21", "32007000", "", "", "4721102"),
                    ("42345678", "0001", "90", "41", "36008000", "", "", "5229099"),
                ],
            )

            conn.executemany(
                "INSERT INTO municipios VALUES (?, ?)",
                [
                    ("0001", "BELO HORIZONTE"),
                    ("0002", "SAO PAULO"),
                    ("0003", "RIO DE JANEIRO"),
                    ("0004", "CURITIBA"),
                ],
            )

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
    finally:
        conn.close()

    return str(target)
