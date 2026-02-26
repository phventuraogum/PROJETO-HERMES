from typing import List, Optional, Dict, Any
from api.db_pool import get_connection

def buscar_empresas_agregadas(
    termo: Optional[str] = None,
    uf: Optional[str] = None,
    municipio: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    with get_connection(read_only=True) as con:
        query = """
        SELECT
            e.CNPJ_COMPLETO              AS cnpj,
            e.RAZAO_SOCIAL               AS razao_social,
            e.NOME_FANTASIA              AS nome_fantasia,
            e.CNAE_PRINCIPAL             AS cnae_principal,
            e.CAPITAL_SOCIAL             AS capital_social,
            e.PORTE_EMPRESA              AS porte_empresa,
            e.UF                         AS uf,
            e.MUNICIPIO                  AS municipio,
            e.BAIRRO                     AS bairro,
            e.LOGRADOURO                 AS logradouro,
            e.NUMERO                     AS numero,
            e.CEP                        AS cep,
            e.TELEFONE1                  AS telefone,
            e.EMAIL                      AS email,
            e.SITUACAO_CADASTRAL         AS situacao_cadastral,
            e.DATA_INICIO_ATIVIDADE      AS data_inicio_atividade,

            -- Sócios
            s.NOME_SOCIO                 AS socio_nome,
            s.CPF_CNPJ_SOCIO             AS socio_cpf_cnpj,
            s.QUALIFICACAO_SOCIO         AS socio_qualificacao,
            s.DATA_ENTRADA_SOCIEDADE     AS socio_data_entrada,

            -- Contexto SIDRA
            sc.ano                       AS sidra_ano,
            sc.pib_corrente              AS sidra_pib_corrente,
            sc.pib_per_capita            AS sidra_pib_per_capita,
            sc.populacao_residente       AS sidra_pop_residente

        FROM cnpj_empresas e
        LEFT JOIN cnpj_empresas_socios s
            ON s.CNPJ_COMPLETO = e.CNPJ_COMPLETO
        LEFT JOIN sidra_contexto_municipio_latest sc
            ON UPPER(sc.uf) = UPPER(e.UF)
           AND UPPER(sc.municipio) = UPPER(e.MUNICIPIO)
        WHERE 1=1
        """

        params: List = []

        if termo:
            query += """
            AND (
                e.RAZAO_SOCIAL ILIKE ?
                OR e.NOME_FANTASIA ILIKE ?
                OR e.CNAE_PRINCIPAL ILIKE ?
            )
            """
            like = f"%{termo}%"
            params.extend([like, like, like])

        if uf:
            query += " AND e.UF = ?"
            params.append(uf)

        if municipio:
            query += " AND e.MUNICIPIO ILIKE ?"
            params.append(f"%{municipio}%")

        query += " LIMIT ?"
        params.append(limit)

        rows = con.execute(query, params).fetchdf().to_dict(orient="records")

    # ---------- AGREGAÇÃO POR CNPJ ----------
    empresas: Dict[str, Dict[str, Any]] = {}

    for r in rows:
        cnpj = r["cnpj"]
        if cnpj not in empresas:
            # cria o "esqueleto" da empresa
            empresas[cnpj] = {
                "cnpj": cnpj,
                "razao_social": r["razao_social"],
                "nome_fantasia": r["nome_fantasia"],
                "cnae_principal": r["cnae_principal"],
                "capital_social": r["capital_social"],
                "porte_empresa": r["porte_empresa"],
                "uf": r["uf"],
                "municipio": r["municipio"],
                "bairro": r["bairro"],
                "logradouro": r["logradouro"],
                "numero": r["numero"],
                "cep": r["cep"],
                "telefone": r["telefone"],
                "email": r["email"],
                "situacao_cadastral": r["situacao_cadastral"],
                "data_inicio_atividade": r["data_inicio_atividade"],

                # contexto SIDRA (único por município/UF)
                "sidra": {
                    "ano": r["sidra_ano"],
                    "pib_corrente": r["sidra_pib_corrente"],
                    "pib_per_capita": r["sidra_pib_per_capita"],
                    "populacao_residente": r["sidra_pop_residente"],
                },

                # lista de sócios (vai sendo preenchida)
                "socios": [],
            }

        # agrega sócio se tiver nome
        if r.get("socio_nome"):
            empresas[cnpj]["socios"].append({
                "nome": r["socio_nome"],
                "cpf_cnpj": r["socio_cpf_cnpj"],
                "qualificacao": r["socio_qualificacao"],
                "data_entrada": r["socio_data_entrada"],
            })

    # converte o dict em lista
    return list(empresas.values())
