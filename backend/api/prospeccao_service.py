"""
Serviço de Prospecção Melhorado
Usa cache Redis, views otimizadas e normalização correta de capital social
"""
import logging
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
            e.sidra_pib_per_capita
        FROM vw_prospeccao_base e
        WHERE 1=1
    """
    
    params: List[Any] = []
    
    # Filtro por termo
    if termo:
        termo_upper = termo.strip().upper()
        sql += " AND e.busca_texto LIKE ?"
        params.append(f"%{termo_upper}%")
    
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
    if portes:
        # Mapeia portes para códigos
        PORTE_MAP = {
            "ME": ["01"],
            "EPP": ["03"],
            "Médio": ["05"],
            "Grande": ["05"],
        }
        codigos = []
        for porte in portes:
            codigos.extend(PORTE_MAP.get(porte, []))
        if codigos:
            placeholders = ", ".join(["?"] * len(codigos))
            sql += f" AND e.PORTE_EMPRESA IN ({placeholders})"
            params.extend(codigos)
    
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
            "porte": porte_rotulo,
            "capital_social": capital_val,
            "segmento": segmento,
            "subsegmento": subsegmento,
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

        # 8. Assertividade Extra: Para os top 3 leads, busca dados em tempo real via BrasilAPI
        # Isso garante que temos os sócios e contatos mais recentes da Receita Federal
        if len(empresas) < 3:
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
        if enriquecer_background and not empresa.get("site"):
            cnpjs_para_enriquecer.append(empresa["cnpj"])
    
    # 8. Enriquecimento inline via WhatsApp Ultra Discovery
    if enriquecer_background:
        try:
            from whatsapp_linkedin_ultra import descobrir_whatsapp_linkedin_completo
            import asyncio
            import concurrent.futures

            sem_whats = [
                e for e in empresas
                if not e.get("whatsapp_final")
            ]
            sem_whats.sort(key=lambda e: e.get("score_icp", 0), reverse=True)
            sem_whats = sem_whats[:10]

            async def _ultra_batch():
                for emp in sem_whats:
                    nome = emp.get("nome_fantasia") or emp.get("razao_social") or ""
                    socios = []
                    if emp.get("socios_resumo"):
                        socios = [
                            l.split("(")[0].strip()
                            for l in emp["socios_resumo"].split("\n")
                            if l.strip()
                        ]
                    try:
                        res = await descobrir_whatsapp_linkedin_completo(
                            empresa_nome=nome,
                            site=emp.get("site"),
                            cidade=emp.get("cidade") or "",
                            socios=socios[:3],
                            cnpj=emp.get("cnpj") or "",
                            score_icp=emp.get("score_icp", 0),
                        )
                        whats = res.get("whatsapp", {})
                        if whats.get("numero") and whats.get("validado"):
                            num = whats["numero"]
                            if not num.startswith("55") and len(num) == 11:
                                num = "55" + num
                            emp["whatsapp_final"] = f"https://wa.me/{num}"
                            logger.info(f"[WHATSAPP ULTRA] {nome}: {num} via {whats.get('fonte')}")
                    except Exception as e:
                        logger.debug(f"[WHATSAPP ULTRA] erro {nome}: {e}")

            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                        pool.submit(lambda: asyncio.run(_ultra_batch())).result(timeout=180)
                else:
                    loop.run_until_complete(_ultra_batch())
            except Exception as e:
                logger.error(f"[WHATSAPP ULTRA] batch error: {e}")

        except ImportError:
            logger.warning("whatsapp_linkedin_ultra não disponível para enriquecimento inline")

        # Enfileira restante em background
        if cnpjs_para_enriquecer:
            try:
                redis_conn = Redis.from_url(settings.REDIS_URL)
                queue = Queue("hermes", connection=redis_conn)
                for cnpj in cnpjs_para_enriquecer[:50]:
                    queue.enqueue(
                        "api.jobs_enhanced.enrich_company_by_cnpj_enhanced",
                        cnpj,
                        job_timeout=120
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
