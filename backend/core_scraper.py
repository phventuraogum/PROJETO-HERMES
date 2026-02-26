import os
import re
import asyncio
import httpx
from typing import List, Dict, Optional, Any
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# ==========================================================
# ⚙️ CONFIGURAÇÕES (Google e Async)
# ==========================================================
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_CX      = os.getenv("GOOGLE_SEARCH_CX")
BING_SEARCH_API_KEY   = os.getenv("BING_SEARCH_API_KEY", "")
BRAVE_SEARCH_API_KEY  = os.getenv("BRAVE_SEARCH_API_KEY", "")

MAX_CONCURRENT_REQUESTS = 5  # Limita concorrência para não estourar rate limit
REQUEST_TIMEOUT = 15.0

DOMINIOS_BANIDOS = [
    "guiapj.com", "cuiket.com", "descubraonline.com", "acheempresa.com",
    "telelistas.net", "solutudo.com.br", "cnpj.biz", "br.biz", "guiamais.com",
    "dnb.com", "yelp.com", "facebook.com", "linkedin.com", "instagram.com",
    "jusbrasil.com.br", "econodata.com.br", "casa.dados.com.br"
]

EMAIL_REGEX  = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
WHATS_REGEX  = r"(?:\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4})|(?:\+55\s?\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4})"
PHONE_REGEX  = r"\(?\d{2}\)?\s?[2-8]\d{3}-?\d{4}"
# wa.me e api.whatsapp.com/send URLs
WAME_HREF_RE = re.compile(
    r"(?:https?://)?(?:wa\.me|api\.whatsapp\.com/send\?phone=|web\.whatsapp\.com/send\?phone=)"
    r"[^\s\"'&?#>]*(\d{10,13})",
    re.IGNORECASE,
)
# LinkedIn URLs no HTML
LINKEDIN_CO_RE  = re.compile(r"https?://(?:www\.)?linkedin\.com/company/[a-zA-Z0-9_-]+/?")
LINKEDIN_IN_RE  = re.compile(r"https?://(?:www\.)?linkedin\.com/in/[a-zA-Z0-9_%-]+/?")
# Número celular BR limpo (11 dígitos locais ou 13 com DDI)
_CELL_RE = re.compile(r"(?:55)?([1-9]\d)(9\d{8})")

# Cache simples em memória (global para o worker)
cache_contatos = {}

# ==========================================================
# 🔍 CLIENTE GOOGLE SEARCH
# ==========================================================
def _montar_resultado(titulo: str, link: str, snippet: str) -> Dict:
    return {
        "titulo":         titulo,
        "link":           link,
        "descricao":      snippet,
        "emails_snippet": re.findall(EMAIL_REGEX, snippet),
        "whats_snippet":  re.findall(WHATS_REGEX, snippet),
    }


async def _buscar_bing(termo: str, num_results: int = 5) -> List[Dict]:
    """Bing Web Search API v7 (mantido como opção caso configurado)."""
    if not BING_SEARCH_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.bing.microsoft.com/v7.0/search",
                headers={"Ocp-Apim-Subscription-Key": BING_SEARCH_API_KEY},
                params={
                    "q":              termo,
                    "count":          min(num_results, 10),
                    "mkt":            "pt-BR",
                    "responseFilter": "Webpages",
                    "setLang":        "pt",
                },
            )
            if resp.status_code == 200:
                items = resp.json().get("webPages", {}).get("value", [])
                return [
                    _montar_resultado(i.get("name", ""), i.get("url", ""), i.get("snippet", ""))
                    for i in items
                ]
    except Exception:
        pass
    return []


async def _buscar_brave(termo: str, num_results: int = 5) -> List[Dict]:
    """
    Brave Search API — 1.000 buscas/mês grátis ($5 crédito mensal).
    Excelente para LinkedIn: não tem rate limit agressivo como DuckDuckGo.
    Cadastro: https://api.search.brave.com
    """
    if not BRAVE_SEARCH_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={
                    "Accept":               "application/json",
                    "Accept-Encoding":      "gzip",
                    "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
                },
                params={
                    "q":      termo,
                    "count":  min(num_results, 20),
                    "lang":   "pt",
                    "market": "pt-BR",
                    "search_lang": "pt",
                },
            )
            if resp.status_code == 200:
                items = resp.json().get("web", {}).get("results", [])
                return [
                    _montar_resultado(
                        i.get("title", ""),
                        i.get("url", ""),
                        i.get("description", ""),
                    )
                    for i in items
                ]
            elif resp.status_code == 401:
                print("⚠ [BRAVE] Chave inválida.")
            elif resp.status_code == 429:
                print("⚠ [BRAVE] Quota excedida.")
    except Exception as e:
        print(f"⚠ [BRAVE] Erro: {e}")
    return []


async def buscar_google(termo: str, num_results: int = 5) -> List[Dict[str, str]]:
    """
    Busca web com 4 motores em cascata:
      1. Google Custom Search  (100/dia grátis, melhor qualidade)
      2. Brave Search API      (1.000/mês grátis — PRINCIPAL para LinkedIn)
      3. Bing Web Search API   (se configurado)
      4. DuckDuckGo DDGS       (fallback — bloqueia em abuso)
    """
    # ── 1. Google Custom Search ───────────────────────────────────────────────
    if GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX:
        url    = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": GOOGLE_SEARCH_API_KEY,
            "cx":  GOOGLE_SEARCH_CX,
            "q":   termo,
            "num": min(num_results, 10),
            "gl":  "br",
            "hl":  "pt",
        }
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, params=params, timeout=10.0)
                if resp.status_code == 200:
                    items = resp.json().get("items", [])
                    resultados = [
                        _montar_resultado(i.get("title", ""), i.get("link", ""), i.get("snippet", ""))
                        for i in items
                    ]
                    if resultados:
                        return resultados
            except Exception:
                pass

    # ── 2. Brave Search API (PRINCIPAL — 1.000/mês grátis) ───────────────────
    if BRAVE_SEARCH_API_KEY:
        res_brave = await _buscar_brave(termo, num_results)
        if res_brave:
            return res_brave

    # ── 3. Bing Web Search API (se configurado) ───────────────────────────────
    if BING_SEARCH_API_KEY:
        res_bing = await _buscar_bing(termo, num_results)
        if res_bing:
            return res_bing

    # ── 4. DuckDuckGo (fallback — pode bloquear em rate-limit, timeout 15s) ─
    try:
        import concurrent.futures, asyncio as _aio
        from ddgs import DDGS
        def _ddgs_sync():
            with DDGS() as ddgs:
                gen = ddgs.text(termo, region="br-pt", safesearch="off",
                                max_results=num_results, timeout=12)
                return [
                    _montar_resultado(r.get("title", ""), r.get("href", ""), r.get("body", ""))
                    for r in gen
                ]
        loop = _aio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            fut = loop.run_in_executor(pool, _ddgs_sync)
            resultados = await _aio.wait_for(fut, timeout=15.0)
        if resultados:
            return resultados
    except Exception:
        pass

    return []

def filtrar_resultados(resultados: List[Dict]) -> List[Dict]:
    """Remove sites genéricos e duplicados."""
    vistos = set()
    filtrados = []
    
    for r in resultados:
        link = r.get("link", "")
        if not link:
            continue
            
        try:
            domain_match = re.search(r"://([^/]+)", link)
            if not domain_match:
                continue
            dominio = domain_match.group(1).lower()
        except Exception:
            continue

        # Remove 'www.' para checagem mais ampla
        dominio_limpo = dominio.replace("www.", "")
        
        # Checa banidos
        if any(b in dominio_limpo for b in DOMINIOS_BANIDOS):
            continue
            
        if dominio_limpo in vistos:
            continue
            
        vistos.add(dominio_limpo)
        filtrados.append(r)
        
    return filtrados

async def buscar_linkedin_empresa(empresa_nome: str) -> Optional[str]:
    """
    Busca a Company Page da empresa no LinkedIn.
    Estratégia dupla: busca livre (DuckDuckGo) + site: (Google).
    """
    empresa_curta = " ".join(empresa_nome.split()[:4])

    # 1. Busca livre — funciona bem no DuckDuckGo
    for q in [
        f'"{empresa_curta}" linkedin.com/company',
        f'"{empresa_curta}" site linkedin empresa',
    ]:
        res = await buscar_google(q, num_results=5)
        for r in res:
            if "linkedin.com/company/" in r.get("link", ""):
                return r["link"]
            # Verifica no snippet
            li = LINKEDIN_CO_RE.findall(r.get("descricao", ""))
            if li:
                return li[0]

    # 2. site: — funciona quando Google responde
    res2 = await buscar_google(f'site:linkedin.com/company "{empresa_curta}"', num_results=3)
    for r in res2:
        if "linkedin.com/company/" in r.get("link", ""):
            return r["link"]

    return None


async def _buscar_google_direto(termo: str, num_results: int = 5) -> List[Dict]:
    """
    Chama APENAS o Google Custom Search — reservado para buscas de LinkedIn pessoal,
    onde Brave/DuckDuckGo não indexam perfis (LinkedIn bloqueia esses crawlers).
    """
    if not (GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX):
        return []
    url    = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": GOOGLE_SEARCH_API_KEY,
        "cx":  GOOGLE_SEARCH_CX,
        "q":   termo,
        "num": min(num_results, 10),
        "gl":  "br",
        "hl":  "pt",
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, params=params, timeout=10.0)
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                return [
                    _montar_resultado(i.get("title", ""), i.get("link", ""), i.get("snippet", ""))
                    for i in items
                ]
        except Exception:
            pass
    return []


def _snippet_valida_pessoa(titulo: str, descricao: str, nome_curto: str, empresa_nome: str) -> bool:
    """
    Verifica se o resultado realmente pertence à pessoa buscada.
    Exige que o snippet/título mencione ao menos uma palavra significativa
    da empresa E uma parte do nome do sócio — evita falsos positivos.
    """
    texto = (titulo + " " + descricao).lower()

    # Palavras ignoradas na validação de empresa
    stop = {"de", "da", "do", "das", "dos", "e", "a", "o", "em", "com", "para",
            "ltda", "sa", "s.a", "me", "epp", "eireli", "industria", "comercio"}

    palavras_empresa = [
        p for p in empresa_nome.lower().split()
        if p not in stop and len(p) > 2
    ]
    palavras_nome = [
        p for p in nome_curto.lower().split()
        if p not in stop and len(p) > 2
    ]

    empresa_ok = any(p in texto for p in palavras_empresa)
    nome_ok    = any(p in texto for p in palavras_nome)

    return empresa_ok and nome_ok


async def buscar_linkedin_socio_ultra(
    nome_socio: str, empresa_nome: str, cidade: str = ""
) -> Optional[Dict[str, str]]:
    """
    Busca LinkedIn pessoal de um sócio/decisor com validação de relevância.

    Ordem de confiança:
      1. Google site:linkedin.com/in — mais preciso, reserva quota
      2. Google nome + empresa — bom, consome quota
      3. Brave/DDG — apenas aceita se snippet mencionar empresa + nome
    """
    if not nome_socio:
        return None

    # Limpa o nome (RF usa ALL CAPS e palavras jurídicas)
    nome = re.sub(r"\(.*?\)", "", nome_socio).strip()
    nome = re.sub(
        r"\b(SOCIO|SÓCIO|ADMINISTRADOR|DIRETOR|GERENTE|RESPONSAVEL|ME|EPP|LTDA|S\.?A\.?)\b",
        "", nome, flags=re.IGNORECASE,
    ).strip()
    nome = " ".join(nome.split())

    nome_tc       = nome.title()
    ignorar       = {"de", "da", "do", "das", "dos", "e", "van", "von", "del"}
    partes        = [p for p in nome_tc.split() if p.lower() not in ignorar and len(p) > 1]
    nome_curto    = f"{partes[0]} {partes[-1]}" if len(partes) >= 2 else nome_tc
    empresa_curta = " ".join(empresa_nome.split()[:3])

    # ── 1. Google: site:linkedin.com/in (consome 1 query — o mais preciso) ────
    q1 = f'site:linkedin.com/in "{nome_tc}" "{empresa_curta}"'
    for r in await _buscar_google_direto(q1, num_results=3):
        if "linkedin.com/in/" in r.get("link", ""):
            return {"link": r["link"], "confianca": "ALTA", "metodo": "Google site:li/in"}

    # ── 2. Google: nome + linkedin + empresa (consome 1 query) ─────────────────
    q2 = f'"{nome_curto}" linkedin "{empresa_curta}"'
    for r in await _buscar_google_direto(q2, num_results=5):
        if "linkedin.com/in/" in r.get("link", ""):
            return {"link": r["link"], "confianca": "ALTA", "metodo": "Google Nome+Empresa"}
        for li in LINKEDIN_IN_RE.findall(r.get("descricao", "")):
            return {"link": li, "confianca": "MÉDIA", "metodo": "Google Snippet"}

    # ── 3. Brave/DDG: só aceita se snippet confirmar empresa + nome ────────────
    q3 = f"{nome_curto} linkedin {empresa_curta}"
    for r in await buscar_google(q3, num_results=8):
        link    = r.get("link", "")
        titulo  = r.get("titulo", "")
        snippet = r.get("descricao", "")

        if "linkedin.com/in/" in link:
            if _snippet_valida_pessoa(titulo, snippet, nome_curto, empresa_nome):
                return {"link": link, "confianca": "MÉDIA", "metodo": "Brave/DDG validado"}

        for li in LINKEDIN_IN_RE.findall(snippet):
            if _snippet_valida_pessoa(titulo, snippet, nome_curto, empresa_nome):
                return {"link": li, "confianca": "BAIXA", "metodo": "Brave/DDG Snippet validado"}

    return None

# ==========================================================
# 📞 EXTRAÇÃO DE CONTATOS (ASYNC)
# ==========================================================
def _extrair_wame_de_html(html: str, soup: "BeautifulSoup") -> Optional[str]:
    """
    Extrai número WhatsApp de links wa.me / api.whatsapp.com/send em HREF.
    Muito mais confiável do que regex no texto: é o link real posto pelo dono.
    """
    # 1. Percorre todos os <a href="...wa.me/...">
    for tag in soup.find_all("a", href=True):
        href = tag["href"]
        m = WAME_HREF_RE.search(href)
        if m:
            digits = re.sub(r"\D", "", m.group(0))
            # Garante que termina com DDD+9+8 dígitos
            if len(digits) >= 10:
                return digits[-11:] if len(digits) > 11 else digits
    # 2. Regex geral no HTML bruto (captura widgets JS como wa.me/5511...)
    m2 = WAME_HREF_RE.search(html)
    if m2:
        digits = re.sub(r"\D", "", m2.group(0))
        if len(digits) >= 10:
            return digits[-11:] if len(digits) > 11 else digits
    return None


def _extrair_linkedin_de_html(html: str) -> Dict[str, Optional[str]]:
    """Extrai URLs de LinkedIn (empresa e perfis pessoais) do HTML."""
    empresas = list(dict.fromkeys(LINKEDIN_CO_RE.findall(html)))
    perfis   = list(dict.fromkeys(LINKEDIN_IN_RE.findall(html)))
    return {
        "linkedin_empresa": empresas[0] if empresas else None,
        "linkedin_perfis":  perfis[:3],
    }


async def extrair_contatos_site(url: str) -> Dict[str, Any]:
    """
    Navega na home + páginas de contato. Extrai email, telefone, WhatsApp (via
    wa.me HREF), LinkedIn da empresa e links de perfil.

    Tenta Scrapling primeiro (stealth, adaptativo); se não disponível ou falhar,
    cai no fallback httpx + BeautifulSoup.
    """
    contatos: Dict[str, Any] = {
        "site": url, "email": "", "telefone": "", "whatsapp": "",
        "linkedin_empresa": None, "linkedin_perfis": [],
    }

    try:
        dominio = re.search(r"://([^/]+)", url).group(1)  # type: ignore[union-attr]
    except Exception:
        return contatos

    if dominio in cache_contatos:
        return cache_contatos[dominio]

    # Scrapling (stealth, adaptativo, extrai mais dados)
    try:
        from scrapling_service import extrair_contatos_scrapling_async, SCRAPLING_AVAILABLE
        if SCRAPLING_AVAILABLE:
            scrapling_data = await extrair_contatos_scrapling_async(url)
            if scrapling_data.get("email") or scrapling_data.get("whatsapp"):
                contatos["site"] = scrapling_data.get("site", url)
                contatos["email"] = scrapling_data.get("email", "")
                contatos["telefone"] = scrapling_data.get("telefone", "")
                contatos["whatsapp"] = scrapling_data.get("whatsapp", "")
                contatos["linkedin_empresa"] = scrapling_data.get("linkedin_empresa")
                contatos["linkedin_perfis"] = scrapling_data.get("linkedin_perfis", [])
                cache_contatos[dominio] = contatos
                return contatos
    except Exception as e:
        print(f"[SCRAPER] Scrapling falhou para {url}, usando httpx fallback: {repr(e)}")

    # Fallback: httpx + BeautifulSoup
    caminhos = ["", "/contato", "/fale-conosco", "/sobre", "/quem-somos", "/contact"]
    headers  = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }

    async with httpx.AsyncClient(verify=False, timeout=15.0, follow_redirects=True) as client:
        for caminho in caminhos:
            target = url.rstrip("/") + caminho
            try:
                resp = await client.get(target, headers=headers)
                if resp.status_code != 200:
                    continue

                html  = resp.text
                soup  = BeautifulSoup(html, "html.parser")
                texto = soup.get_text(" ")

                if not contatos["email"]:
                    for a in soup.find_all("a", href=True):
                        if a["href"].startswith("mailto:"):
                            contatos["email"] = a["href"][7:].split("?")[0].strip()
                            break
                    if not contatos["email"]:
                        emails = re.findall(EMAIL_REGEX, texto)
                        if emails:
                            contatos["email"] = emails[0]

                if not contatos["whatsapp"]:
                    wpp = _extrair_wame_de_html(html, soup)
                    if wpp:
                        contatos["whatsapp"] = wpp

                if not contatos["whatsapp"]:
                    whats = re.findall(WHATS_REGEX, texto)
                    if whats:
                        contatos["whatsapp"] = re.sub(r"\D", "", whats[0])

                if not contatos["telefone"]:
                    tels = re.findall(PHONE_REGEX, texto)
                    if tels:
                        contatos["telefone"] = tels[0]

                if not contatos["linkedin_empresa"]:
                    li = _extrair_linkedin_de_html(html)
                    if li["linkedin_empresa"]:
                        contatos["linkedin_empresa"] = li["linkedin_empresa"]
                    if li["linkedin_perfis"]:
                        contatos["linkedin_perfis"] = li["linkedin_perfis"]

                if contatos["email"] or contatos["whatsapp"]:
                    break
            except Exception:
                continue

    cache_contatos[dominio] = contatos
    return contatos

async def processar_empresa_google(empresa_nome: str, cnpj: str = "", cidade: str = "", socios: List[str] = None) -> Optional[Dict]:
    """
    Lógica de Enriquecimento Híbrido AGRESSIVO v2.0.

    FIX: CNPJ removido da query principal — incluir o CNPJ traz sites de
    diretório (GuiaPJ, Econodata, CNPJ.biz) em vez do site real da empresa.
    """
    # 1. Busca Principal — usa nome + cidade (sem CNPJ)
    query_site = f'"{empresa_nome}" {cidade} site oficial contato'
    raw_results = await buscar_google(query_site, num_results=8)
    
    dados_extraidos = {"site": "", "email": "", "telefone": "", "whatsapp": ""}
    
    # [ASSERTIVIDADE AGRESSIVA] Coleta e-mails de todos os snippets encontrados
    emails_encontrados = []
    whats_encontrados = []
    
    for r in raw_results:
        if r.get("emails_snippet"): emails_encontrados.extend(r["emails_snippet"])
        if r.get("whats_snippet"): whats_encontrados.extend(r["whats_snippet"])
    
    # 2. Identifica Site Oficial
    candidatos = filtrar_resultados(raw_results)
    melhor_match = None
    
    if candidatos:
        melhor_match = candidatos[0]
        dados_extraidos = await extrair_contatos_site(melhor_match["link"])
    
    # [ASSERTIVIDADE EXTRA] Se o site nao retornou email, faz busca profunda focada
    if not dados_extraidos["email"]:
        query_email = f'"{empresa_nome}" e-mail contato'
        res_profunda = await buscar_google(query_email, num_results=5)
        for r in res_profunda:
            if r.get("emails_snippet"):
                dados_extraidos["email"] = r["emails_snippet"][0]
                break

    # Preenche com dados dos snippets se o site ainda estiver mudos
    if not dados_extraidos["email"] and emails_encontrados:
        dados_extraidos["email"] = emails_encontrados[0]
    if not dados_extraidos["whatsapp"] and whats_encontrados:
        dados_extraidos["whatsapp"] = whats_encontrados[0]

    # 3. Busca Redes Sociais
    redes_socios = []
    linkedin_empresa = await buscar_linkedin_empresa(empresa_nome)
    
    if socios:
        for socio in socios[:2]:  # Foca nos 2 principais sócios
            resultado_linkedin = await buscar_linkedin_socio_ultra(socio, empresa_nome, cidade)
            if resultado_linkedin:
                redes_socios.append({
                    "nome": socio,
                    "linkedin": resultado_linkedin["link"],
                    "confianca": resultado_linkedin["confianca"],
                    "metodo_descoberta": resultado_linkedin["metodo"]
                })
    
    return {
        "origem": "google_search_aggressive_v3",
        "match_site": melhor_match["link"] if melhor_match else None,
        "linkedin_empresa": linkedin_empresa,
        "redes_socios": redes_socios,
        **dados_extraidos 
    }

# ==========================================================
# 🚀 HELPER PARA RODAR DO WORKER (SYNC WRAPPER)
# ==========================================================
def run_enrichment_sync(empresa_nome: str, cidade: str):
    """Wrapper síncrono para ser chamado pelo RQ Worker se não for async"""
    return asyncio.run(processar_empresa_google(empresa_nome, cidade=cidade))

