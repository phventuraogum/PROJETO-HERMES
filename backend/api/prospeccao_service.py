"""
Serviço de Prospecção — v3
Melhorias:
- Mais colunas (endereço completo, CNAE descrição, data abertura, situação cadastral)
- Filtro padrão: apenas empresas ATIVAS (SITUACAO_CADASTRAL = '02')
- CPF_CNPJ_SOCIO incluso → DecisorModal pode enriquecer via Assertiva PF sem busca extra
- Diversidade geográfica: sem filtro de cidade, cap de 25% por município
- excluir_cnpjs: suporte a NOT IN (anti-repetição entre buscas)
- Cache Redis (5 min TTL)
"""
import logging
import os
from collections import defaultdict
from typing import List, Optional, Dict, Any

from api.db_pool import get_connection
from api.cache_service import cache_service
from api.utils import (
    normalize_capital_social,
    safe_float,
    as_opt_str,
    formatar_telefone,
    montar_contexto_sidra,
    mapear_porte,
    classificar_segmento_por_cnae,
    classificar_subsegmento_por_cnae_e_nome,
    calcular_score_icp_legado,
    SEGMENTO_CNAE_PREFIX,
)
from api.quality_service import calcular_score_priorizacao
from api.validation_service import calcular_score_confiabilidade
from config import settings

logger = logging.getLogger(__name__)

BACKGROUND_ENRICH_JOB = (
    os.getenv("HERMES_ENRICHMENT_JOB", "").strip()
    or "api.jobs_enhanced.enrich_company_by_cnpj_enhanced"
)


def _env_int(name: str, default: int, *, minimum: int = 0) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, value)


BACKGROUND_ENRICH_TIMEOUT = _env_int("HERMES_ENRICHMENT_JOB_TIMEOUT", 420, minimum=60)


def _resolver_cnaes_efetivos(
    segmentos: Optional[List[str]],
    cnaes_manuais: Optional[List[str]],
) -> List[str]:
    """
    Converte segmentos selecionados em prefixos CNAE e mescla com os CNAEs manuais.
    Garante que filtros de segmento sejam realmente aplicados no SQL.
    """
    import re
    resultado: list[str] = []

    for c in (cnaes_manuais or []):
        limpo = re.sub(r"\D", "", str(c)).strip()
        if limpo and limpo.lower() != "string":
            resultado.append(limpo)

    for seg in (segmentos or []):
        for prefixo in SEGMENTO_CNAE_PREFIX.get(seg, []):
            limpo = re.sub(r"\D", "", str(prefixo)).strip()
            if limpo and limpo not in resultado:
                resultado.append(limpo)

    return resultado


def _needs_background_enrichment(empresa: Dict[str, Any]) -> bool:
    return not (
        empresa.get("site")
        and (
            empresa.get("email_final")
            or empresa.get("telefone_final")
            or empresa.get("whatsapp_final")
        )
    )


def _diversificar_geograficamente(
    empresas: List[Dict],
    limite: int,
    max_pct_cidade: float = 0.25,
) -> List[Dict]:
    """
    Garante que nenhuma cidade ocupe mais de max_pct_cidade do resultado final.
    Só aplica quando resultado é grande e não há filtro de cidade (chamado externamente).
    """
    if len(empresas) <= 100:
        return empresas[:limite]

    max_por_cidade = max(15, int(len(empresas) * max_pct_cidade))

    contagem: dict = defaultdict(int)
    selecionados: List[Dict] = []
    overflow: List[Dict] = []

    for emp in empresas:
        cidade = (emp.get("cidade") or "").upper().strip()
        if contagem[cidade] < max_por_cidade:
            contagem[cidade] += 1
            selecionados.append(emp)
        else:
            overflow.append(emp)

    # Completa até o limite com overflow (empresas das cidades dominantes)
    for emp in overflow:
        if len(selecionados) >= limite:
            break
        selecionados.append(emp)

    return selecionados[:limite]


def rodar_prospeccao_otimizada(
    termo: Optional[str] = None,
    uf: Optional[str] = None,
    municipio: Optional[str] = None,
    municipios: Optional[List[str]] = None,
    capital_minima: Optional[float] = None,
    capital_maxima: Optional[float] = None,
    cnaes: Optional[List[str]] = None,
    segmentos: Optional[List[str]] = None,
    portes: Optional[List[str]] = None,
    limite: int = 500,
    enriquecer_background: bool = True,
    priorizar_contato: bool = True,
    excluir_cnpjs: Optional[List[str]] = None,
    apenas_ativas: bool = True,
) -> Dict[str, Any]:
    """
    Executa prospecção otimizada com cache e views.

    v3 — melhorias:
    - Mais colunas (endereço, CNAE descrição, data abertura, situação cadastral)
    - apenas_ativas=True: filtra SITUACAO_CADASTRAL = '02' por padrão
    - excluir_cnpjs: NOT IN — usado para anti-repetição entre buscas
    - CPF_CNPJ_SOCIO incluído nos sócios estruturados
    - Diversidade geográfica automática quando sem filtro de cidade
    - Ordenação: contato > LOG(capital) + RANDOM()
    """
    # Normaliza cidades
    cidades_efetivas: List[str] = []
    if municipio:
        cidades_efetivas.append(municipio.strip().upper())
    for c in (municipios or []):
        nome = c.strip().upper()
        if nome and nome not in cidades_efetivas:
            cidades_efetivas.append(nome)

    # Resolve CNAEs efetivos
    cnaes_efetivos = _resolver_cnaes_efetivos(segmentos, cnaes)

    # Normaliza lista de exclusão
    cnpjs_excluidos = [str(c).strip() for c in (excluir_cnpjs or []) if str(c).strip()]

    # Cache key (exclui cnpjs_excluidos para não explodir o cache)
    cache_key_params = {
        "termo": termo,
        "uf": uf,
        "cidades": tuple(sorted(cidades_efetivas)) if cidades_efetivas else None,
        "capital_minima": capital_minima,
        "capital_maxima": capital_maxima,
        "cnaes": tuple(sorted(cnaes_efetivos)) if cnaes_efetivos else None,
        "portes": tuple(sorted(portes)) if portes else None,
        "limite": limite,
        "priorizar_contato": priorizar_contato,
        "apenas_ativas": apenas_ativas,
    }

    # Só usa cache se não houver exclusões ativas (anti-repetição pede resultado fresco)
    if not cnpjs_excluidos:
        cached = cache_service.get("prospeccao_v3", **cache_key_params)
        if cached:
            logger.info("Prospecção v3 em cache")
            return cached

    # ── Query principal ──────────────────────────────────────────────────────
    # Solicita LIMIT maior para depois aplicar diversidade geográfica
    limite_sql = min(limite * 3, 6000) if not cidades_efetivas else min(limite, 2000)

    sql = """
        SELECT
            e.cnpj,
            e.RAZAO_SOCIAL          AS razao_social,
            e.NOME_FANTASIA         AS nome_fantasia,
            e.cidade_nome           AS cidade,
            e.UF                    AS uf,
            e.CNAE_PRINCIPAL        AS cnae_principal,
            e.cnae_descricao        AS cnae_descricao,
            e.PORTE_EMPRESA         AS porte_codigo,
            e.CAPITAL_SOCIAL_NUM    AS capital_num,
            e.NATUREZA_JURIDICA     AS natureza_juridica,
            e.SITUACAO_CADASTRAL    AS situacao_cadastral,
            e.DATA_INICIO_ATIVIDADE AS data_abertura,
            e.LOGRADOURO            AS logradouro,
            e.NUMERO                AS numero,
            e.COMPLEMENTO           AS complemento,
            e.BAIRRO                AS bairro,
            e.CEP                   AS cep,
            e.telefone_receita,
            e.email_receita,
            e.site                  AS site_web,
            e.email_final,
            e.telefone_final,
            e.whatsapp_final,
            e.sidra_pib,
            e.sidra_populacao,
            e.sidra_pib_per_capita
        FROM vw_prospeccao_base e
        WHERE 1=1
    """

    params: List[Any] = []

    # Apenas empresas ativas (SITUACAO_CADASTRAL = '02' na Receita Federal)
    if apenas_ativas:
        sql += " AND (e.SITUACAO_CADASTRAL = '02' OR e.SITUACAO_CADASTRAL IS NULL)"

    # Filtro por termo livre
    if termo:
        sql += " AND e.busca_texto LIKE ?"
        params.append(f"%{termo.strip().upper()}%")

    # Filtro por UF
    if uf and uf.upper() not in ("TODAS", ""):
        sql += " AND UPPER(e.UF) = ?"
        params.append(uf.upper())

    # Filtro por cidades
    if cidades_efetivas:
        if len(cidades_efetivas) == 1:
            sql += " AND UPPER(e.cidade_nome) LIKE ?"
            params.append(f"%{cidades_efetivas[0]}%")
        else:
            cond = " OR ".join(["UPPER(e.cidade_nome) LIKE ?"] * len(cidades_efetivas))
            sql += f" AND ({cond})"
            params.extend(f"%{c}%" for c in cidades_efetivas)

    # Capital mínimo
    if capital_minima and capital_minima > 0:
        sql += " AND e.CAPITAL_SOCIAL_NUM >= ?"
        params.append(float(capital_minima))

    # Capital máximo
    if capital_maxima and capital_maxima > 0:
        sql += " AND (e.CAPITAL_SOCIAL_NUM <= ? OR e.CAPITAL_SOCIAL_NUM IS NULL)"
        params.append(float(capital_maxima))

    # Filtro por portes
    if portes:
        PORTE_MAP = {
            "ME":     ["01"],
            "EPP":    ["03"],
            "Médio":  ["05"],
            "Grande": ["05"],
            "Demais": ["05"],
        }
        codigos = list({c for p in portes for c in PORTE_MAP.get(p, [])})
        if codigos:
            placeholders = ", ".join(["?"] * len(codigos))
            sql += f" AND e.PORTE_EMPRESA IN ({placeholders})"
            params.extend(codigos)

    # Filtro por CNAEs
    if cnaes_efetivos:
        cond = " OR ".join(["e.CNAE_PRINCIPAL LIKE ?"] * len(cnaes_efetivos))
        sql += f" AND ({cond})"
        params.extend(f"{c}%" for c in cnaes_efetivos)

    # Exclusão de CNPJs (anti-repetição + suppression registry)
    if cnpjs_excluidos:
        # DuckDB lida bem com listas até ~5000 itens
        placeholders = ", ".join(["?"] * len(cnpjs_excluidos))
        sql += f" AND e.cnpj NOT IN ({placeholders})"
        params.extend(cnpjs_excluidos)

    # Ordenação inteligente
    if priorizar_contato:
        sql += """
            ORDER BY
              (CASE
                WHEN e.whatsapp_final  IS NOT NULL THEN 3
                WHEN e.telefone_final  IS NOT NULL THEN 2
                WHEN e.email_final     IS NOT NULL
                  OR e.email_receita   IS NOT NULL THEN 1
                ELSE 0
              END) DESC,
              (CASE WHEN e.CAPITAL_SOCIAL_NUM > 0
                    THEN LOG(e.CAPITAL_SOCIAL_NUM + 1) * 0.35
                    ELSE 0 END
               + RANDOM() * 0.65) DESC
        """
    else:
        sql += " ORDER BY e.CAPITAL_SOCIAL_NUM DESC NULLS LAST, RANDOM()"

    sql += " LIMIT ?"
    params.append(limite_sql)

    # ── Executa ──────────────────────────────────────────────────────────────
    with get_connection(read_only=True) as conn:
        df = conn.execute(sql, params).fetchdf()

    # ── Sócios (com CPF) ──────────────────────────────────────────────────────
    socios_map: Dict[str, List[Dict]] = {}
    if not df.empty:
        cnpj_bases = sorted({str(row["cnpj"])[:8] for _, row in df.iterrows()})
        if cnpj_bases:
            placeholders = ", ".join(["?"] * len(cnpj_bases))
            socios_sql = f"""
                SELECT
                    CNPJ_BASICO,
                    NOME_SOCIO,
                    QUALIFICACAO_SOCIO,
                    DATA_ENTRADA_SOCIEDADE,
                    CPF_CNPJ_SOCIO
                FROM socios
                WHERE CNPJ_BASICO IN ({placeholders})
            """
            try:
                with get_connection(read_only=True) as con_socios:
                    socios_df = con_socios.execute(socios_sql, cnpj_bases).df()
                    for _, s_row in socios_df.iterrows():
                        base = str(s_row["CNPJ_BASICO"])
                        nome = as_opt_str(s_row.get("NOME_SOCIO")) or ""
                        qual = as_opt_str(s_row.get("QUALIFICACAO_SOCIO")) or ""
                        data_ent = as_opt_str(s_row.get("DATA_ENTRADA_SOCIEDADE"))
                        cpf_cnpj = as_opt_str(s_row.get("CPF_CNPJ_SOCIO"))
                        if nome:
                            socios_map.setdefault(base, []).append({
                                "nome": nome,
                                "qualificacao": qual,
                                "data_entrada": data_ent,
                                "cpf_cnpj": cpf_cnpj,
                            })
            except Exception as e:
                logger.warning(f"Erro ao buscar sócios: {e}")

    # ── Processa linhas ───────────────────────────────────────────────────────
    empresas_raw: List[Dict] = []
    cnpjs_para_enriquecer: List[str] = []

    for _, row in df.iterrows():
        cnpj_str = str(row["cnpj"])
        base = cnpj_str[:8]
        razao    = as_opt_str(row.get("razao_social"))  or as_opt_str(row.get("nome_fantasia")) or cnpj_str
        fantasia = as_opt_str(row.get("nome_fantasia"))
        cnae     = as_opt_str(row.get("cnae_principal"))
        uf_val   = as_opt_str(row.get("uf"))
        cidade_val = as_opt_str(row.get("cidade"))
        capital_val = safe_float(row.get("capital_num"))

        segmento    = classificar_segmento_por_cnae(cnae)
        subsegmento = classificar_subsegmento_por_cnae_e_nome(cnae, razao, fantasia)
        porte_rotulo = mapear_porte(row.get("porte_codigo"))

        socios_lista = socios_map.get(base, [])
        socios_resumo = "\n".join(
            s["nome"] + (f" ({s['qualificacao']})" if s.get("qualificacao") else "")
            for s in socios_lista
        ) if socios_lista else None

        contexto_sidra = montar_contexto_sidra(
            row.get("sidra_pib"),
            row.get("sidra_populacao"),
            row.get("sidra_pib_per_capita"),
        )

        tel_receita = formatar_telefone(None, row.get("telefone_receita"))
        tel_final   = as_opt_str(row.get("telefone_final")) or tel_receita

        empresa: Dict[str, Any] = {
            # Identificação
            "cnpj":              cnpj_str,
            "razao_social":      razao,
            "nome_fantasia":     fantasia,
            "cidade":            cidade_val,
            "uf":                uf_val,

            # Classificação
            "cnae_principal":    cnae,
            "cnae_descricao":    as_opt_str(row.get("cnae_descricao")),
            "porte":             porte_rotulo,
            "capital_social":    capital_val,
            "segmento":          segmento,
            "subsegmento":       subsegmento,
            "natureza_juridica": as_opt_str(row.get("natureza_juridica")),
            "situacao_cadastral": as_opt_str(row.get("situacao_cadastral")),
            "data_abertura":     as_opt_str(row.get("data_abertura")),

            # Endereço
            "logradouro":  as_opt_str(row.get("logradouro")),
            "numero":      as_opt_str(row.get("numero")),
            "complemento": as_opt_str(row.get("complemento")),
            "bairro":      as_opt_str(row.get("bairro")),
            "cep":         as_opt_str(row.get("cep")),

            # Contatos
            "telefone_receita": tel_receita,
            "email_receita":    as_opt_str(row.get("email_receita")),
            "site":             as_opt_str(row.get("site_web")),
            "email_final":      as_opt_str(row.get("email_final")),
            "telefone_final":   as_opt_str(tel_final),
            "whatsapp_final":   as_opt_str(row.get("whatsapp_final")),

            # Sócios
            "socios_resumo":     socios_resumo,
            "socios_estruturado": socios_lista if socios_lista else None,

            # Contexto econômico
            "contexto_sidra": contexto_sidra,

            # Score base
            "score_icp": calcular_score_icp_legado(
                capital_val, capital_minima, uf_val, uf, cidade_val, municipio
            ),
        }

        # Scores avançados
        empresa["scores"]         = calcular_score_priorizacao(empresa)
        empresa["confiabilidade"] = calcular_score_confiabilidade(
            email=empresa.get("email_final"),
            telefone=empresa.get("telefone_final"),
            whatsapp=empresa.get("whatsapp_final"),
            cnpj=empresa.get("cnpj"),
            fonte_dados="enriquecido" if empresa.get("site") else "receita",
        )

        # Top 3 — enriquecimento em tempo real via BrasilAPI
        if len(empresas_raw) < 3:
            try:
                from api.validation_service import verificar_cnpj_receita
                dados_rt = verificar_cnpj_receita(cnpj_str)
                if dados_rt.get("valido"):
                    if dados_rt.get("telefones"):
                        empresa["telefone_final"] = dados_rt["telefones"][0]
                    if dados_rt.get("email"):
                        empresa["email_final"] = dados_rt["email"]
                    if dados_rt.get("socios"):
                        socios_rt = []
                        for s in dados_rt["socios"]:
                            nome_s = s.get("nome_socio", "")
                            qual_s = s.get("qualificacao_socio", "")
                            cpf_s  = s.get("cpf_cnpj_socio", "")
                            if nome_s:
                                socios_rt.append({
                                    "nome": nome_s,
                                    "qualificacao": qual_s,
                                    "cpf_cnpj": cpf_s,
                                })
                        if socios_rt:
                            empresa["socios_estruturado"] = socios_rt
                            empresa["socios_resumo"] = "\n".join(
                                s["nome"] + (f" ({s['qualificacao']})" if s.get("qualificacao") else "")
                                for s in socios_rt
                            )
                    if dados_rt.get("cnaes_secundarios"):
                        empresa["cnaes_secundarios"] = dados_rt["cnaes_secundarios"]
                    if empresa.get("site") and ".br" in empresa["site"]:
                        from api.validation_service import verificar_dominio_registrobr
                        whois = verificar_dominio_registrobr(empresa["site"])
                        if whois.get("valido"):
                            empresa["registro_dono"]  = whois.get("owner")
                            empresa["registro_email"] = whois.get("owner_email")
                    empresa["fonte_dados_prioritaria"] = "BrasilAPI_Realtime_v2"
            except Exception as e:
                logger.debug(f"BrasilAPI skip ({cnpj_str}): {e}")

        empresas_raw.append(empresa)

        if enriquecer_background and _needs_background_enrichment(empresa):
            cnpjs_para_enriquecer.append(cnpj_str)

    # ── Diversidade geográfica ────────────────────────────────────────────────
    # Só aplica quando não há filtro de cidade (resultado amplo por UF ou nacional)
    if not cidades_efetivas and len(empresas_raw) > limite:
        empresas = _diversificar_geograficamente(empresas_raw, limite)
    else:
        empresas = empresas_raw[:limite]

    # ── Enriquecimento em background ─────────────────────────────────────────
    if enriquecer_background and cnpjs_para_enriquecer:
        try:
            from redis import Redis
            from rq import Queue
            redis_conn = Redis.from_url(settings.REDIS_URL)
            queue = Queue("hermes", connection=redis_conn)
            for cnpj in cnpjs_para_enriquecer[:50]:
                queue.enqueue(
                    BACKGROUND_ENRICH_JOB,
                    cnpj,
                    job_timeout=BACKGROUND_ENRICH_TIMEOUT,
                )
            logger.info(f"Enfileirados {len(cnpjs_para_enriquecer[:50])} jobs de enriquecimento")
        except Exception as e:
            logger.error(f"Erro ao enfileirar enriquecimento: {e}")

    # ── Monta resultado ───────────────────────────────────────────────────────
    resultado = {
        "total": len(empresas),
        "empresas": empresas,
        "filtros_aplicados": {
            "termo":          termo,
            "uf":             uf,
            "cidades":        cidades_efetivas or None,
            "capital_minima": capital_minima,
            "capital_maxima": capital_maxima,
            "cnaes_efetivos": cnaes_efetivos or None,
            "segmentos":      segmentos or None,
            "portes":         portes or None,
            "apenas_ativas":  apenas_ativas,
            "excluidos_count": len(cnpjs_excluidos),
        },
    }

    # Cache apenas quando sem exclusões ativas
    if not cnpjs_excluidos:
        cache_service.set("prospeccao_v3", resultado, ttl=300, **cache_key_params)

    return resultado
