"""
Módulo ULTRA-FOCADO em WhatsApp e LinkedIn
Estratégias de última geração para captura 100% assertiva

v2.0 — Melhorias:
  - Bug fix: validar_whatsapp_brasileiro() corrigido para 11 dígitos locais
  - Google Maps / Knowledge Panel mining
  - Linktree / link-in-bio delegado ao enrichment_instagram
  - Proxycurl integrado para leads HOT (score >= 70)
"""
import os
import re
import asyncio
import httpx
from typing import Any, Dict, Optional, List
from bs4 import BeautifulSoup

# =================================================================
# WHATSAPP ULTRA-DISCOVERY (6 CAMADAS)
# =================================================================

async def extrair_whatsapp_widget(url: str) -> Optional[str]:
    """
    Camada 1: Escaneia o código-fonte do site procurando por widgets de WhatsApp.
    Detecta: wa.me, api.whatsapp.com, click-to-chat, floating buttons.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, verify=False) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return None
            
            html = resp.text
            
            # Padrão 1: wa.me/5511999999999
            wa_me = re.search(r'wa\.me/(\d{12,13})', html)
            if wa_me:
                return wa_me.group(1)
            
            # Padrão 2: api.whatsapp.com/send?phone=5511999999999
            api_whats = re.search(r'api\.whatsapp\.com/send\?phone=(\d{12,13})', html)
            if api_whats:
                return api_whats.group(1)
            
            # Padrão 3: whatsapp://send?phone=5511999999999
            whats_protocol = re.search(r'whatsapp://send\?phone=(\d{12,13})', html)
            if whats_protocol:
                return whats_protocol.group(1)
            
            # Padrão 4: Número com 55 + DDD + 9 (formato completo)
            numero_completo = re.search(r'55\s?\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}', html)
            if numero_completo:
                # Limpa formatação
                num_limpo = re.sub(r'[^\d]', '', numero_completo.group())
                if len(num_limpo) >= 12:
                    return num_limpo
            
    except Exception:
        pass
    
    return None


async def buscar_whatsapp_redes_sociais(empresa_nome: str) -> Dict[str, str]:
    """
    Camada 2: Busca WhatsApp Business nas redes sociais (Instagram, Facebook).
    """
    from core_scraper import buscar_google
    
    dados = {"whats_instagram": "", "whats_facebook": ""}
    
    # Instagram
    query_ig = f'site:instagram.com "{empresa_nome}" whatsapp'
    res_ig = await buscar_google(query_ig, num_results=2)
    for r in res_ig:
        snippet = r.get("descricao", "")
        # wa.me
        wa_match = re.search(r'wa\.me/(\d{12,13})', snippet)
        if wa_match:
            dados["whats_instagram"] = wa_match.group(1)
            break
        # Número com 55
        num_match = re.search(r'55\s?\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}', snippet)
        if num_match:
            dados["whats_instagram"] = re.sub(r'[^\d]', '', num_match.group())
            break
    
    # Facebook
    query_fb = f'site:facebook.com "{empresa_nome}" whatsapp'
    res_fb = await buscar_google(query_fb, num_results=2)
    for r in res_fb:
        snippet = r.get("descricao", "")
        wa_match = re.search(r'wa\.me/(\d{12,13})', snippet)
        if wa_match:
            dados["whats_facebook"] = wa_match.group(1)
            break
    
    return dados


async def buscar_whatsapp_direto(empresa_nome: str, cidade: str = "") -> Optional[str]:
    """
    Camada 3: Busca direta específica por "empresa + whatsapp + número".
    """
    from core_scraper import buscar_google
    
    query = f'"{empresa_nome}" {cidade} whatsapp contato'
    resultados = await buscar_google(query, num_results=5)
    
    for r in resultados:
        snippet = r.get("descricao", "")
        
        # wa.me
        wa_match = re.search(r'wa\.me/(\d{12,13})', snippet)
        if wa_match:
            return wa_match.group(1)
        
        # Número completo com 55
        num_match = re.search(r'55\s?\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}', snippet)
        if num_match:
            return re.sub(r'[^\d]', '', num_match.group())
    
    return None


def validar_whatsapp_brasileiro(numero: str) -> bool:
    """
    Valida se um número é um celular brasileiro válido (9º dígito obrigatório).

    Formatos aceitos:
      - 13 dígitos: 55 + DDD (2) + 9 + 8 dígitos  → +55 11 98765-4321
      - 11 dígitos: DDD (2) + 9 + 8 dígitos        → 11 98765-4321
    Números fixos (8 dígitos) são REJEITADOS propositalmente.
    """
    if not numero:
        return False

    num_limpo = re.sub(r"[^\d]", "", str(numero))

    # 13 dígitos: 55 + DDD + 9XXXXXXXX
    if (
        len(num_limpo) == 13
        and num_limpo.startswith("55")
        and num_limpo[4] == "9"
    ):
        return True

    # 11 dígitos: DDD + 9XXXXXXXX  (sem prefixo 55)
    if len(num_limpo) == 11 and num_limpo[2] == "9":
        return True

    # 12 dígitos: 55 + DDD + 8 dígitos (fixo com DDI) — REJEITADO
    return False


# =================================================================
# GOOGLE MAPS / KNOWLEDGE PANEL MINING
# =================================================================

async def buscar_google_maps(empresa_nome: str, cidade: str = "", cnpj: str = "") -> Dict:
    """
    Estratégia NOVA: extrai telefone/WhatsApp do Knowledge Panel do Google Maps.
    Empresas com presença local têm telefone/WhatsApp no snippet do Maps.
    """
    from core_scraper import buscar_google

    dados: Dict = {"telefone_maps": None, "whatsapp_maps": None}

    # Query 1: Maps direto
    query1 = f'"{empresa_nome}" {cidade} site:maps.google.com OR "maps.google.com"'
    res1 = await buscar_google(query1, num_results=3)

    for r in res1:
        snippet = r.get("descricao", "")

        # WhatsApp
        wa = re.search(r"wa\.me/(\d{12,13})", snippet)
        if wa:
            dados["whatsapp_maps"] = wa.group(1)

        # Telefone
        tel = re.search(r"\(?\d{2}\)?\s?\d{4,5}-?\d{4}", snippet)
        if tel:
            dados["telefone_maps"] = tel.group()

        if dados["whatsapp_maps"]:
            break

    # Query 2: Knowledge Panel com CNPJ (retorna painel de conhecimento)
    if not dados["whatsapp_maps"] and cnpj:
        cnpj8 = re.sub(r"[^\d]", "", cnpj)[:8]
        query2 = f'"{empresa_nome}" {cnpj8} telefone whatsapp celular'
        res2 = await buscar_google(query2, num_results=5)
        for r in res2:
            snippet = r.get("descricao", "")
            wa2 = re.search(r"55\s?\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}", snippet)
            if wa2:
                num = re.sub(r"[^\d]", "", wa2.group())
                if validar_whatsapp_brasileiro(num):
                    dados["whatsapp_maps"] = num
                    break
            # Também captura número local sem 55
            wa3 = re.search(r"\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}", snippet)
            if wa3:
                num = re.sub(r"[^\d]", "", wa3.group())
                if len(num) == 11 and num[2] == "9":
                    dados["whatsapp_maps"] = "55" + num
                    break

    return dados


# =================================================================
# LINKEDIN ULTRA-DISCOVERY (5 CAMADAS)
# =================================================================

async def buscar_linkedin_multiplas_fontes(nome_socio: str, empresa_nome: str, cidade: str = "") -> Dict[str, Any]:
    """
    Camada EXTRA: Busca LinkedIn em múltiplas fontes além do Google.
    Retorna link + confiança + fonte de descoberta.
    """
    from core_scraper import buscar_google
    
    # Limpa nome
    nome_limpo = re.sub(r'\(.*?\)', '', nome_socio).strip()
    nome_limpo = re.sub(r'\b(SOCIO|ADMINISTRADOR|DIRETOR)\b', '', nome_limpo, flags=re.IGNORECASE).strip()
    
    candidatos = []
    
    # === FONTE 1: LinkedIn Direto (site:linkedin.com) ===
    query1 = f'site:linkedin.com/in "{nome_limpo}" "{empresa_nome}"'
    res1 = await buscar_google(query1, num_results=3)
    for r in res1:
        if "linkedin.com/in/" in r["link"]:
            candidatos.append({
                "link": r["link"],
                "confianca": "MUITO_ALTA",
                "fonte": "LinkedIn Direto",
                "metodo": "Nome+Empresa"
            })
            return candidatos[0]  # Retorna imediatamente se acha no LinkedIn direto
    
    # === FONTE 2: Apollo.io / RocketReach (snippets mencionam LinkedIn) ===
    query2 = f'"{nome_limpo}" "{empresa_nome}" linkedin profile'
    res2 = await buscar_google(query2, num_results=5)
    for r in res2:
        snippet = r.get("descricao", "").lower()
        # Extrai link do LinkedIn do snippet
        linkedin_match = re.search(r'linkedin\.com/in/[\w-]+', snippet)
        if linkedin_match:
            candidatos.append({
                "link": f"https://{linkedin_match.group()}",
                "confianca": "ALTA",
                "fonte": "Apollo/RocketReach",
                "metodo": "Profile Indexer"
            })
            return candidatos[0]
    
    # === FONTE 3: Google Scholar / Patents (executivos tech) ===
    if not candidatos:
        query3 = f'site:scholar.google.com OR site:patents.google.com "{nome_limpo}" linkedin'
        res3 = await buscar_google(query3, num_results=2)
        for r in res3:
            snippet = r.get("descricao", "")
            linkedin_match = re.search(r'linkedin\.com/in/([\w-]+)', snippet)
            if linkedin_match:
                candidatos.append({
                    "link": f"https://linkedin.com/in/{linkedin_match.group(1)}",
                    "confianca": "MEDIA",
                    "fonte": "Google Scholar/Patents",
                    "metodo": "Academic/IP"
                })
    
    # === FONTE 4: Crunchbase (startups e investidores) ===
    if not candidatos:
        query4 = f'site:crunchbase.com "{nome_limpo}" linkedin'
        res4 = await buscar_google(query4, num_results=2)
        for r in res4:
            snippet = r.get("descricao", "")
            linkedin_match = re.search(r'linkedin\.com/in/([\w-]+)', snippet)
            if linkedin_match:
                candidatos.append({
                    "link": f"https://linkedin.com/in/{linkedin_match.group(1)}",
                    "confianca": "MEDIA",
                    "fonte": "Crunchbase",
                    "metodo": "Startup Database"
                })
    
    # === FONTE 5: Nome + Cidade (fallback geográfico) ===
    if not candidatos and cidade:
        query5 = f'site:linkedin.com/in "{nome_limpo}" {cidade}'
        res5 = await buscar_google(query5, num_results=3)
        for r in res5:
            if "linkedin.com/in/" in r["link"]:
                candidatos.append({
                    "link": r["link"],
                    "confianca": "BAIXA",
                    "fonte": "LinkedIn Geo",
                    "metodo": "Nome+Cidade"
                })
    
    return candidatos[0] if candidatos else None


async def enriquecer_linkedin_proxycurl(linkedin_url: str) -> Dict:
    """
    Proxycurl: extrai email pessoal/profissional e telefone do perfil LinkedIn.
    Custo: ~$0.01/perfil. Usar APENAS para leads HOT (score >= 70).
    Chave: PROXYCURL_API_KEY no .env
    """
    key = os.getenv("PROXYCURL_API_KEY", "")
    if not key or not linkedin_url:
        return {}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://nubela.co/proxycurl/api/v2/linkedin",
                params={
                    "url": linkedin_url,
                    "personal_email": "include",
                    "personal_contact_number": "include",
                    "twitter_profile_id": "include",
                },
                headers={"Authorization": f"Bearer {key}"},
            )
            if resp.status_code == 200:
                d = resp.json()
                return {
                    "nome_completo": d.get("full_name"),
                    "cargo_atual": d.get("occupation"),
                    "email_linkedin": (d.get("personal_emails") or [None])[0],
                    "telefone_linkedin": (d.get("personal_numbers") or [None])[0],
                    "localizacao_linkedin": d.get("city"),
                    "seguidores_linkedin": d.get("follower_count"),
                    "twitter": d.get("twitter_profile_id"),
                    "empresa_atual": ((d.get("experiences") or [{}])[0]).get("company"),
                }
    except Exception:
        pass
    return {}


async def descobrir_whatsapp_linkedin_completo(
    empresa_nome: str,
    site: Optional[str],
    cidade: str,
    socios: List[str],
    cnpj: str = "",
    score_icp: float = 0.0,
) -> Dict:
    """
    Coordenador MASTER v2.0 de descoberta de WhatsApp e LinkedIn.
    Executa todas as camadas em paralelo para máxima assertividade.

    Novidades v2.0:
      - Google Maps / Knowledge Panel mining
      - Instagram / Linktree mining (via enrichment_instagram)
      - Proxycurl para leads HOT (score_icp >= 70)
    """

    # === WHATSAPP: 5 buscas simultâneas ===
    tasks_whats_coros = []

    if site:
        tasks_whats_coros.append(("widget_site", extrair_whatsapp_widget(site)))

    tasks_whats_coros.append(("redes_sociais", buscar_whatsapp_redes_sociais(empresa_nome)))
    tasks_whats_coros.append(("busca_direta", buscar_whatsapp_direto(empresa_nome, cidade)))
    tasks_whats_coros.append(("google_maps", buscar_google_maps(empresa_nome, cidade, cnpj)))

    # Instagram / Linktree (módulo dedicado)
    try:
        from enrichment_instagram import mining_instagram_linkinbio
        tasks_whats_coros.append(("instagram_lb", mining_instagram_linkinbio(empresa_nome, site)))
    except ImportError:
        pass

    nomes_tasks = [t[0] for t in tasks_whats_coros]
    coros = [t[1] for t in tasks_whats_coros]
    whats_results = await asyncio.gather(*coros, return_exceptions=True)

    # Consolida WhatsApp — prioriza fontes mais confiáveis
    whatsapp_final = None
    whatsapp_fonte = ""
    instagram_url = None
    email_instagram = None
    whatsapp_linkinbio = None
    email_linkinbio = None
    telegram = None

    for nome, result in zip(nomes_tasks, whats_results):
        if isinstance(result, Exception):
            continue

        if nome == "redes_sociais" and isinstance(result, dict):
            if result.get("whats_instagram") and not whatsapp_final:
                whatsapp_final = result["whats_instagram"]
                whatsapp_fonte = "Instagram Bio"
            if result.get("whats_facebook") and not whatsapp_final:
                whatsapp_final = result["whats_facebook"]
                whatsapp_fonte = "Facebook Page"

        elif nome == "google_maps" and isinstance(result, dict):
            if result.get("whatsapp_maps") and not whatsapp_final:
                num = result["whatsapp_maps"]
                if validar_whatsapp_brasileiro(num):
                    whatsapp_final = num
                    whatsapp_fonte = "Google Maps"

        elif nome == "instagram_lb" and isinstance(result, dict):
            instagram_url = instagram_url or result.get("instagram_url")
            email_instagram = email_instagram or result.get("email_instagram")
            whatsapp_linkinbio = result.get("whatsapp_linkinbio")
            email_linkinbio = email_linkinbio or result.get("email_linkinbio")
            telegram = telegram or result.get("telegram")
            if not whatsapp_final:
                wa_ig = result.get("whatsapp_instagram")
                wa_lb = result.get("whatsapp_linkinbio")
                wa_use = wa_ig or wa_lb
                if wa_use and validar_whatsapp_brasileiro(wa_use):
                    whatsapp_final = wa_use
                    whatsapp_fonte = "Instagram" if wa_ig else "Linktree"

        elif isinstance(result, str) and validar_whatsapp_brasileiro(result) and not whatsapp_final:
            whatsapp_final = result
            whatsapp_fonte = "Widget Site" if nome == "widget_site" else "Busca Direta"

    # === LINKEDIN: Busca multi-fonte para cada sócio ===
    linkedin_socios = []

    for socio in (socios or [])[:2]:
        linkedin_data = await buscar_linkedin_multiplas_fontes(socio, empresa_nome, cidade)
        if linkedin_data:
            entrada = {
                "nome": socio,
                "linkedin": linkedin_data["link"],
                "confianca": linkedin_data["confianca"],
                "fonte": linkedin_data["fonte"],
                "metodo": linkedin_data["metodo"],
            }

            # Proxycurl para leads HOT
            if score_icp >= 70:
                proxycurl = await enriquecer_linkedin_proxycurl(linkedin_data["link"])
                if proxycurl:
                    entrada.update(proxycurl)

            linkedin_socios.append(entrada)

    return {
        "whatsapp": {
            "numero": whatsapp_final,
            "fonte": whatsapp_fonte,
            "validado": validar_whatsapp_brasileiro(whatsapp_final) if whatsapp_final else False,
        },
        "linkedin_socios": linkedin_socios,
        "instagram": {
            "url": instagram_url,
            "email": email_instagram,
        },
        "linkinbio": {
            "whatsapp": whatsapp_linkinbio,
            "email": email_linkinbio,
            "telegram": telegram,
        },
    }
