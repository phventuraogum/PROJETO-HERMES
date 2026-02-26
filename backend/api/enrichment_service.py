"""
Serviço de Enriquecimento v2.0
Combina OpenAI, web scraping, OpenCNPJ, waterfall de email,
Instagram mining e inteligência de abordagem SDR.
"""
import os
import json
import asyncio
import logging
from typing import Optional, Dict, List, Any

import httpx
from openai import AsyncOpenAI, OpenAI

from config import settings

logger = logging.getLogger(__name__)


class EnrichmentService:
    """Serviço de enriquecimento com OpenAI + múltiplas fontes."""

    def __init__(self):
        self.openai_key = settings.OPENROUTER_API_KEY or os.getenv("OPENAI_API_KEY")
        self.openai_enabled = bool(self.openai_key)

        if self.openai_enabled:
            try:
                self.ai_client = AsyncOpenAI(api_key=self.openai_key)
                self.openai_client_sync = OpenAI(api_key=self.openai_key)
                self.use_openrouter = False
                logger.info("✅ OpenAI habilitado (API direta assíncrona)")
            except Exception:
                self.ai_client = None
                self.openai_client_sync = None
                self.use_openrouter = True
                logger.info("✅ OpenAI habilitado (via OpenRouter)")
        else:
            self.ai_client = None
            self.openai_client_sync = None
            self.use_openrouter = False
            logger.warning("⚠ OpenAI não configurado — insights IA desativados")

    # =========================================================================
    # ANÁLISE IA — resumo estratégico B2B
    # =========================================================================
    async def enrich_with_openai(
        self,
        razao_social: str,
        nome_fantasia: Optional[str],
        cidade: Optional[str],
        uf: Optional[str],
        cnae: Optional[str],
        site: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Análise estratégica da empresa para SDRs."""
        if not self.openai_enabled:
            return {}

        contexto = (
            f"Empresa: {razao_social}\n"
            f"Nome Fantasia: {nome_fantasia or 'N/A'}\n"
            f"Localização: {cidade or 'N/A'}, {uf or 'N/A'}\n"
            f"CNAE: {cnae or 'N/A'}\n"
            f"Site: {site or 'N/A'}"
        )

        prompt = f"""Analise a empresa brasileira abaixo para prospecção B2B de alta qualidade:

{contexto}

Retorne JSON com:
1. resumo_empresa: O que fazem e qual dor resolvem (2 frases)
2. segmento_detalhado: Nicho específico
3. tamanho_estimado: Pequena | Média | Grande
4. perfil_cliente: Quem são os clientes deles
5. leads_recomendados: Cargos ideais para vender IA/Automação (lista)
6. insights: 3 insights estratégicos para SDRs (lista)
7. tags: Até 8 tags técnicas/mercado (lista)

APENAS JSON válido, sem markdown."""

        try:
            if self.use_openrouter:
                resp = httpx.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.openai_key}", "Content-Type": "application/json"},
                    json={
                        "model": "openai/gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": "Você é um analista SDR B2B experiente. Retorne sempre JSON válido."},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 1000,
                    },
                    timeout=30,
                )
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"]
                    content = content.replace("```json", "").replace("```", "").strip()
                    return json.loads(content)
            else:
                resp = await self.ai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "Você é um analista SDR B2B experiente. Retorne sempre JSON válido."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=1000,
                    response_format={"type": "json_object"},
                )
                return json.loads(resp.choices[0].message.content)
        except Exception as e:
            logger.error(f"Erro OpenAI (análise): {e}")
        return {}

    # =========================================================================
    # INTELIGÊNCIA DE ABORDAGEM — pitch personalizado por empresa
    # =========================================================================
    async def gerar_inteligencia_abordagem(
        self,
        empresa: Dict[str, Any],
        produto_vendedor: str = "IA/Automação",
    ) -> Dict[str, Any]:
        """
        Gera briefing completo de vendas para o SDR:
        - Score de intenção de compra
        - Cargo do decisor ideal
        - Dor principal mapeada
        - Mensagem WhatsApp personalizada (160 chars)
        - Email de prospecção (assunto + corpo)
        - Pergunta poderosa de descoberta
        - Sinal de compra e objeção provável
        """
        if not self.openai_enabled:
            return {}

        contexto = (
            f"Empresa: {empresa.get('razao_social', '')}\n"
            f"Setor CNAE: {empresa.get('cnae_descricao', empresa.get('cnae_principal', 'N/A'))}\n"
            f"Cidade/UF: {empresa.get('cidade', 'N/A')}/{empresa.get('uf', 'N/A')}\n"
            f"Capital Social: R$ {empresa.get('capital_social', 0):,.0f}\n"
            f"Porte: {empresa.get('porte', 'N/A')}\n"
            f"Sócios: {', '.join((empresa.get('socios') or [])[:3]) or 'N/A'}\n"
            f"Site: {empresa.get('site', 'N/A')}\n"
            f"Resumo do site: {empresa.get('resumo_ia', 'N/A')}"
        )

        prompt = f"""Você é um especialista em vendas B2B consultivas. Analise esta empresa brasileira:

{contexto}

Produto/Serviço que estamos vendendo: {produto_vendedor}

Gere um briefing de vendas completo em JSON:
{{
  "score_intencao": <0-100, probabilidade de compra>,
  "cargo_decisor_ideal": "<ex: CEO, Diretor de TI, Gerente de Operações>",
  "dor_principal": "<problema que nosso produto resolve para eles — específico>",
  "primeiro_contato_whatsapp": "<mensagem casual e personalizada, máx 160 chars, sem 'Olá' genérico>",
  "email_assunto": "<linha de assunto do email, máx 8 palavras, que gera curiosidade>",
  "email_corpo": "<email de prospecção: 3 parágrafos curtos, sem clichês, focado na dor>",
  "pergunta_descoberta": "<1 pergunta poderosa para abrir a conversa>",
  "sinal_compra": "<o que indica que estão prontos para comprar>",
  "objecao_provavel": "<principal objeção esperada>",
  "como_contornar_objecao": "<resposta assertiva à objeção>"
}}

APENAS JSON válido."""

        try:
            if self.use_openrouter:
                resp = httpx.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.openai_key}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.4,
                        "max_tokens": 1200,
                    },
                    timeout=35,
                )
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"]
                    content = content.replace("```json", "").replace("```", "").strip()
                    return json.loads(content)
            else:
                resp = await self.ai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.4,
                    max_tokens=1200,
                    response_format={"type": "json_object"},
                )
                return json.loads(resp.choices[0].message.content)
        except Exception as e:
            logger.error(f"Erro OpenAI (abordagem): {e}")
        return {}

    # =========================================================================
    # ENRIQUECIMENTO COMPLETO — orquestra todos os módulos
    # =========================================================================
    async def enrich_company_complete(
        self,
        cnpj: str,
        razao_social: str,
        nome_fantasia: Optional[str],
        cidade: Optional[str],
        uf: Optional[str],
        cnae: Optional[str],
        site: Optional[str] = None,
        socios: Optional[List[str]] = None,
        score_icp: float = 0.0,
        gerar_pitch: bool = False,
    ) -> Dict[str, Any]:
        """
        Enriquecimento ULTRA v2.0 — orquestra todos os módulos em paralelo.

        Camadas:
          1. OpenCNPJ (Receita Federal) — grátis
          2. Google Search + Scraping   — core_scraper
          3. WhatsApp/LinkedIn Ultra    — whatsapp_linkedin_ultra
          4. Instagram + Linktree       — enrichment_instagram
          5. Waterfall de Email         — enrichment_waterfall
          6. Email de Sócios            — enrichment_waterfall
          7. Registro.br WHOIS          — ultra_enrichment
          8. IA Estratégica             — OpenAI
          9. Pitch de Abordagem         — OpenAI (só se gerar_pitch=True)
        """
        import sys
        import os as _os
        sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

        resultado: Dict[str, Any] = {
            "cnpj": cnpj,
            "site": site,
            "enriquecimento_ia": {},
            "inteligencia_abordagem": {},
            "contatos_web": {},
            "email_waterfall": {},
            "emails_socios": [],
            "redes_socios": [],
            "dados_registro": {},
            "linkedin_empresa": None,
            "whatsapp_ultra": {},
            "linkedin_ultra": [],
            "instagram": {},
            "linkinbio": {},
            "dados_receita": {},
        }

        socios = socios or []
        empresa_nome = nome_fantasia or razao_social

        # ── FASE 1: OpenCNPJ (grátis, sem espera) ────────────────────────
        try:
            from enrichment_opencnpj import consultar_opencnpj
            dados_receita = await consultar_opencnpj(cnpj)
            resultado["dados_receita"] = dados_receita

            # Enriquece lista de sócios com dados QSA
            if dados_receita.get("socios_qsa"):
                nomes_qsa = [s["nome"] for s in dados_receita["socios_qsa"] if s.get("nome")]
                if nomes_qsa:
                    socios = nomes_qsa  # QSA é mais completo que socios_resumo

            email_receita = dados_receita.get("email_receita")
            data_abertura = dados_receita.get("data_abertura")
        except Exception as e:
            logger.warning(f"OpenCNPJ falhou para {cnpj}: {e}")
            email_receita = None
            data_abertura = None

        # ── FASE 2: Busca principal (Google + Scraping) ───────────────────
        try:
            from core_scraper import processar_empresa_google
            dados_google = await processar_empresa_google(
                empresa_nome=empresa_nome,
                cnpj=cnpj,
                cidade=cidade,
                socios=socios,
            )
            if dados_google:
                resultado["site"] = resultado["site"] or dados_google.get("site")
                resultado["linkedin_empresa"] = dados_google.get("linkedin_empresa")
                resultado["contatos_web"] = {
                    "email_enriquecido": dados_google.get("email"),
                    "telefone_enriquecido": dados_google.get("telefone"),
                    "whatsapp_enriquecido": dados_google.get("whatsapp"),
                }
                resultado["redes_socios"] = dados_google.get("redes_socios", [])
        except Exception as e:
            logger.warning(f"Google scraping falhou: {e}")

        site_atual = resultado["site"] or site

        # ── FASE 3-7: Enriquecimentos paralelos ──────────────────────────
        tarefas_paralelas = {}

        # WhatsApp/LinkedIn Ultra
        try:
            from whatsapp_linkedin_ultra import descobrir_whatsapp_linkedin_completo
            tarefas_paralelas["ultra_wl"] = descobrir_whatsapp_linkedin_completo(
                empresa_nome=empresa_nome,
                site=site_atual,
                cidade=cidade or "",
                socios=socios,
                cnpj=cnpj,
                score_icp=score_icp,
            )
        except ImportError:
            pass

        # Waterfall de email da empresa
        try:
            from enrichment_waterfall import waterfall_email_empresa
            tarefas_paralelas["email_empresa"] = waterfall_email_empresa(
                site=site_atual,
                email_html=resultado["contatos_web"].get("email_enriquecido"),
                email_receita=email_receita,
            )
        except ImportError:
            pass

        # Emails dos sócios
        try:
            from ultra_enrichment import enriquecer_socios_waterfall
            tarefas_paralelas["emails_socios"] = enriquecer_socios_waterfall(
                socios=socios,
                site_empresa=site_atual,
                empresa_nome=empresa_nome,
                score_icp=score_icp,
            )
        except ImportError:
            pass

        # Registro.br WHOIS
        if site_atual and ".br" in site_atual:
            try:
                from ultra_enrichment import consultar_registrobr_whois
                tarefas_paralelas["registro_br"] = consultar_registrobr_whois(site_atual)
            except ImportError:
                pass

        # IA estratégica
        if self.openai_enabled:
            tarefas_paralelas["ia"] = self.enrich_with_openai(
                razao_social=razao_social,
                nome_fantasia=nome_fantasia,
                cidade=cidade,
                uf=uf,
                cnae=cnae,
                site=site_atual,
            )

        # Executa tudo em paralelo
        if tarefas_paralelas:
            chaves = list(tarefas_paralelas.keys())
            valores = await asyncio.gather(*tarefas_paralelas.values(), return_exceptions=True)
            resultados_paralelos = {k: v for k, v in zip(chaves, valores) if not isinstance(v, Exception)}
        else:
            resultados_paralelos = {}

        # ── Consolida resultados ──────────────────────────────────────────
        if "ultra_wl" in resultados_paralelos:
            ultra = resultados_paralelos["ultra_wl"]
            resultado["whatsapp_ultra"] = ultra.get("whatsapp", {})
            resultado["linkedin_ultra"] = ultra.get("linkedin_socios", [])
            resultado["instagram"] = ultra.get("instagram", {})
            resultado["linkinbio"] = ultra.get("linkinbio", {})

            if ultra.get("whatsapp", {}).get("validado"):
                resultado["contatos_web"]["whatsapp_enriquecido"] = ultra["whatsapp"]["numero"]

            if resultado["linkedin_ultra"]:
                resultado["redes_socios"] = resultado["linkedin_ultra"]

        if "email_empresa" in resultados_paralelos:
            resultado["email_waterfall"] = resultados_paralelos["email_empresa"]
            # Promove para campo principal se melhor que o atual
            wf_email = resultado["email_waterfall"].get("email")
            if wf_email and not resultado["contatos_web"].get("email_enriquecido"):
                resultado["contatos_web"]["email_enriquecido"] = wf_email

        if "emails_socios" in resultados_paralelos:
            resultado["emails_socios"] = resultados_paralelos["emails_socios"] or []

        if "registro_br" in resultados_paralelos:
            resultado["dados_registro"] = resultados_paralelos["registro_br"]

        if "ia" in resultados_paralelos:
            resultado["enriquecimento_ia"] = resultados_paralelos["ia"]

        # ── FASE 8: Pitch de abordagem (opcional, só para HOT) ────────────
        if gerar_pitch and score_icp >= 50 and self.openai_enabled:
            empresa_contexto = {
                "razao_social": razao_social,
                "cnae_principal": cnae,
                "cnae_descricao": resultado["dados_receita"].get("cnae_descricao", ""),
                "cidade": cidade,
                "uf": uf,
                "capital_social": 0,
                "porte": resultado["dados_receita"].get("porte_receita", ""),
                "socios": socios,
                "site": site_atual,
                "resumo_ia": resultado["enriquecimento_ia"].get("resumo_empresa", ""),
            }
            try:
                resultado["inteligencia_abordagem"] = await self.gerar_inteligencia_abordagem(
                    empresa_contexto
                )
            except Exception as e:
                logger.warning(f"Pitch IA falhou: {e}")

        return resultado

    # =========================================================================
    # ENRIQUECIMENTO EM LOTE ASSÍNCRONO
    # =========================================================================
    async def enrich_batch_async(
        self,
        empresas: List[Dict[str, Any]],
        max_concurrent: int = 5,
        gerar_pitch: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Enriquece múltiplas empresas em paralelo com semáforo de concorrência.
        Substitui o loop síncrono legado: 10 empresas em ~15s vs ~90s antes.
        """
        sem = asyncio.Semaphore(max_concurrent)

        async def _uma(emp: Dict) -> Dict:
            async with sem:
                try:
                    return await self.enrich_company_complete(
                        cnpj=emp.get("cnpj", ""),
                        razao_social=emp.get("razao_social", ""),
                        nome_fantasia=emp.get("nome_fantasia"),
                        cidade=emp.get("cidade"),
                        uf=emp.get("uf"),
                        cnae=emp.get("cnae_principal"),
                        site=emp.get("site"),
                        socios=emp.get("socios", []),
                        score_icp=emp.get("score_icp", 0.0),
                        gerar_pitch=gerar_pitch,
                    )
                except Exception as e:
                    logger.error(f"Erro no enriquecimento de {emp.get('cnpj')}: {e}")
                    return {"cnpj": emp.get("cnpj"), "erro": str(e)}

        resultados = await asyncio.gather(*[_uma(e) for e in empresas])
        return list(resultados)


# Instância global
enrichment_service = EnrichmentService()
