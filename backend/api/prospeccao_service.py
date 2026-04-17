"""
Serviço de Prospecção Melhorado
Usa cache Redis, views otimizadas e normalização correta de capital social
"""
import logging
import os
from typing import List, Optional, Dict, Any
from redis import Redis
from rq import Queue

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
    calcular_score_icp_legado
)
from api.quality_service import QualityService, calcular_score_priorizacao
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


def _needs_background_enrichment(empresa: Dict[str, Any]) -> bool:
    return not (
        empresa.get("site")
        and (
            empresa.get("email_final")
            or empresa.get("telefone_final")
            or empresa.get("whatsapp_final")
        )
    )


def rodar_prospeccao_otimizada(
    termo: Optional[str] = None,
    uf: Optional[str] = None,
    municipio: Optional[str] = None,
    capital_minima: Optional[float] = None,
    cnaes: Optional[List[str]] = None,
    segmentos: Optional[List[str]] = None,
    portes: Optional[List[str]] = None,
    limite: int = 200,
    enriquecer_background: bool = True
) -> Dict[str, Any]:
    """
    Executa prospecção otimizada com cache e views.
    
    Args:
        termo: Termo de busca (nome/razão social)
        uf: UF filtro
        municipio: Município filtro
        capital_minima: Capital social mínimo
        cnaes: Lista de CNAEs
        segmentos: Lista de segmentos
        portes: Lista de portes
        limite: Limite de resultados
        enriquecer_background: Se True, enfileira enriquecimento em background
    
    Returns:
        Dict com resultados da prospecção
    """
    # 1. Verifica cache primeiro
    cache_key_params = {
        "termo": termo,
        "uf": uf,
        "municipio": municipio,
        "capital_minima": capital_minima,
        "cnaes": tuple(cnaes) if cnaes else None,
        "segmentos": tuple(segmentos) if segmentos else None,
        "portes": tuple(portes) if portes else None,
        "limite": limite
    }
    
    cached = cache_service.get("prospeccao", **cache_key_params)
    if cached:
        logger.info("Prospecção em cache")
        return cached
    
    # 2. Monta query usando view otimizada
    sql = """
        SELECT
            e.cnpj,
            e.RAZAO_SOCIAL AS razao_social,
            e.NOME_FANTASIA AS nome_fantasia,
            e.cidade_nome AS cidade,
            e.UF AS uf,
            e.CNAE_PRINCIPAL AS cnae_principal,
            COALESCE(e.cnae_descricao, e.CNAE_PRINCIPAL) AS cnae_descricao,
            e.PORTE_EMPRESA AS porte_codigo,
            e.CAPITAL_SOCIAL_NUM AS capital_num,
            e.telefone_receita,
            e.email_receita,
            e.site AS site_web,
            e.email_final,
            e.telefone_final,
            e.whatsapp_final,
            e.sidra_pib,
            e.sidra_populacao,
            e.sidra_pib_per_capita,
            e.DATA_INICIO_ATIVIDADE AS data_inicio_atividade,
            e.NATUREZA_JURIDICA AS natureza_juridica
        FROM vw_prospeccao_base e
        WHERE 1=1
    """

    params: List[Any] = []

    # Filtro por termo — busca em razão social, fantasia E descrição do CNAE
    if termo:
        termo_upper = termo.strip().upper()
        sql += " AND (e.busca_texto LIKE ? OR UPPER(COALESCE(e.cnae_descricao,'')) LIKE ?)"
        params.extend([f"%{termo_upper}%", f"%{termo_upper}%"])
    
    # Filtro por UF
    if uf and uf.upper() != "TODAS":
        sql += " AND UPPER(e.UF) = ?"
        params.append(uf.upper())
    
    # Filtro por município
    if municipio:
        sql += " AND UPPER(e.cidade_nome) LIKE ?"
        params.append(f"%{municipio.upper()}%")
    
    # Filtro por capital social (usando coluna normalizada)
    if capital_minima and capital_minima > 0:
        sql += " AND e.CAPITAL_SOCIAL_NUM >= ?"
        params.append(float(capital_minima))
    
    # Filtro por portes
    # Receita usa: 01=ME, 03=EPP, 05=Demais (cobre Médio e Grande)
    if portes:
        PORTE_MAP = {
            "ME": ["01"],
            "EPP": ["03"],
            "Médio": ["05"],
            "Grande": ["05"],
            "Demais": ["05"],
        }
        codigos = list({c for p in portes for c in PORTE_MAP.get(p, [])})
        if codigos:
            placeholders = ", ".join(["?"] * len(codigos))
            sql += f" AND e.PORTE_EMPRESA IN ({placeholders})"
            params.extend(codigos)

        # Se filtrou só "Grande", adiciona corte de capital para distinguir de Médio
        if portes == ["Grande"] and capital_minima is None:
            sql += " AND e.CAPITAL_SOCIAL_NUM >= ?"
            params.append(1_000_000.0)
    
    # Filtro por CNAEs
    if cnaes:
        import re
        cnaes_limpos = [re.sub(r"\D", "", str(c)) for c in cnaes if str(c).strip() and str(c).lower() != "string"]
        cnaes_limpos = list(set(cnaes_limpos))
        if cnaes_limpos:
            sql += " AND (" + " OR ".join(["e.CNAE_PRINCIPAL LIKE ?"] * len(cnaes_limpos)) + ")"
            params.extend([c + "%" for c in cnaes_limpos])
    
    # Ordena e limita
    sql += " ORDER BY e.CAPITAL_SOCIAL_NUM DESC NULLS LAST LIMIT ?"
    params.append(limite)
    
    # 3. Executa query
    with get_connection(read_only=True) as conn:
        df = conn.execute(sql, params).fetchdf()
    
    
    # 5. Busca Sócios se houver resultados
    socios_map = {}
    if not df.empty:
        cnpj_bases = sorted({str(row["cnpj"])[:8] for _, row in df.iterrows()})
        if cnpj_bases:
            placeholders = ", ".join(["?"] * len(cnpj_bases))
            socios_sql = f"""
                SELECT CNPJ_BASICO, NOME_SOCIO, QUALIFICACAO_SOCIO
                FROM socios
                WHERE CNPJ_BASICO IN ({placeholders})
            """
            with get_connection(read_only=True) as con_socios:
                socios_df = con_socios.execute(socios_sql, cnpj_bases).df()
                for _, s_row in socios_df.iterrows():
                    base = str(s_row["CNPJ_BASICO"])
                    nome = (s_row["NOME_SOCIO"] or "").strip()
                    qual = (s_row["QUALIFICACAO_SOCIO"] or "").strip()
                    if nome:
                        desc = nome + (f" ({qual})" if qual else "")
                        socios_map.setdefault(base, []).append(desc)

    # 6. Processa resultados com Scores e Classificações
    empresas = []
    cnpjs_para_enriquecer = []
    
    for _, row in df.iterrows():
        cnpj_str = str(row["cnpj"])
        base = cnpj_str[:8]
        razao = str(row["razao_social"])
        fantasia = as_opt_str(row.get("nome_fantasia"))
        cnae = as_opt_str(row.get("cnae_principal"))
        uf_val = as_opt_str(row.get("uf"))
        cidade_val = as_opt_str(row.get("cidade"))
        
        capital_val = safe_float(row.get("capital_num"))
        
        # Classificações
        segmento = classificar_segmento_por_cnae(cnae)
        subsegmento = classificar_subsegmento_por_cnae_e_nome(cnae, razao, fantasia)
        porte_rotulo = mapear_porte(row.get("porte_codigo"))
        
        # Sócios
        socios_list = socios_map.get(base)
        socios_resumo = "\n".join(socios_list) if socios_list else None

        # Contexto SIDRA
        contexto_sidra = montar_contexto_sidra(
            row.get("sidra_pib"),
            row.get("sidra_populacao"),
            row.get("sidra_pib_per_capita")
        )

        # Telefones formatados
        tel_receita = formatar_telefone(None, row.get("telefone_receita"))
        tel_final = row.get("telefone_final") or tel_receita

        empresa = {
            "cnpj": cnpj_str,
            "razao_social": razao,
            "nome_fantasia": fantasia,
            "cidade": cidade_val,
            "uf": uf_val,
            "cnae_principal": cnae,
            "cnae_descricao": as_opt_str(row.get("cnae_descricao")),
            "porte": porte_rotulo,
            "capital_social": capital_val,
            "segmento": segmento,
            "subsegmento": subsegmento,
            "data_inicio_atividade": as_opt_str(row.get("data_inicio_atividade")),
            "natureza_juridica": as_opt_str(row.get("natureza_juridica")),
            "telefone_receita": tel_receita,
            "email_receita": as_opt_str(row.get("email_receita")),
            "site": as_opt_str(row.get("site_web")),
            "email_final": as_opt_str(row.get("email_final")),
            "telefone_final": as_opt_str(tel_final),
            "whatsapp_final": as_opt_str(row.get("whatsapp_final")),
            "socios_resumo": socios_resumo,
            "contexto_sidra": contexto_sidra,
            "score_icp": calcular_score_icp_legado(
                capital_val, capital_minima, uf_val, uf, cidade_val, municipio
            )
        }
        
        # 7. Adiciona scores avançados
        # Priorização
        empresa["scores"] = calcular_score_priorizacao(empresa)
        
        # Confiabilidade
        empresa["confiabilidade"] = calcular_score_confiabilidade(
            email=empresa.get("email_final"),
            telefone=empresa.get("telefone_final"),
            whatsapp=empresa.get("whatsapp_final"),
            cnpj=empresa.get("cnpj"),
            fonte_dados="enriquecido" if empresa.get("site") else "receita"
        )

        # 8. Assertividade Extra: Para os top 10 leads, busca dados em tempo real via BrasilAPI
        # Garante sócios e contatos mais recentes da Receita Federal
        if len(empresas) < 10:
            from api.validation_service import verificar_cnpj_receita
            dados_realtime = verificar_cnpj_receita(cnpj_str)
            if dados_realtime.get("valido"):
                # Atualiza contatos se encontrar algo novo/melhor
                if dados_realtime.get("telefones"):
                    empresa["telefone_final"] = dados_realtime["telefones"][0]
                if dados_realtime.get("email"):
                    empresa["email_final"] = dados_realtime["email"]
                
                # Atualiza Sócios (dados em tempo real são mais confiáveis)
                if dados_realtime.get("socios"):
                    novos_socios = []
                    for s in dados_realtime["socios"]:
                        nome = s.get("nome_socio", "")
                        qual = s.get("qualificacao_socio", "")
                        if nome:
                            novos_socios.append(f"{nome} ({qual})")
                    if novos_socios:
                        empresa["socios_resumo"] = "\n".join(novos_socios)
                
                # Assertividade Extra: Dados de Registro (Whois) via BrasilAPI
                # Tentamos descobrir quem registrou o domínio se ele for .br
                if empresa.get("site") and ".br" in empresa["site"]:
                    from api.validation_service import verificar_dominio_registrobr
                    dados_whois = verificar_dominio_registrobr(empresa["site"])
                    if dados_whois.get("valido"):
                        empresa["registro_dono"] = dados_whois.get("owner")
                        empresa["registro_email"] = dados_whois.get("owner_email")
                
                # Guarda CNAEs secundários para a IA usar no detalhamento
                if dados_realtime.get("cnaes_secundarios"):
                    empresa["cnaes_secundarios"] = dados_realtime["cnaes_secundarios"]

                empresa["fonte_dados_prioritaria"] = "BrasilAPI_Realtime_v2"

        empresas.append(empresa)
        
        # Coleta CNPJs para enriquecimento em background
        if enriquecer_background and _needs_background_enrichment(empresa):
            cnpjs_para_enriquecer.append(empresa["cnpj"])
    
    # 8. Enfileira enriquecimento em background
    if enriquecer_background and cnpjs_para_enriquecer:
        try:
            redis_conn = Redis.from_url(settings.REDIS_URL)
            queue = Queue("hermes", connection=redis_conn)
            
            # Enfileira jobs de enriquecimento
            for cnpj in cnpjs_para_enriquecer[:50]:  # Limita a 50 por vez
                queue.enqueue(
                    BACKGROUND_ENRICH_JOB,
                    cnpj,
                    job_timeout=BACKGROUND_ENRICH_TIMEOUT
                )
            
            logger.info(f"Enfileirados {len(cnpjs_para_enriquecer[:50])} jobs de enriquecimento")
        except Exception as e:
            logger.error(f"Erro ao enfileirar enriquecimento: {e}")
    
    # 6. Monta resultado
    resultado = {
        "total": len(empresas),
        "empresas": empresas,
        "filtros_aplicados": {
            "termo": termo,
            "uf": uf,
            "municipio": municipio,
            "capital_minima": capital_minima
        }
    }
    
    # 7. Cacheia resultado (TTL de 5 minutos)
    cache_service.set("prospeccao", resultado, ttl=300, **cache_key_params)
    
    return resultado
