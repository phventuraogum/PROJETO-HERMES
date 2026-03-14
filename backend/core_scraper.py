import os
import re
import asyncio
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlparse, urlunparse
import httpx
from typing import List, Dict, Optional, Any
from bs4 import BeautifulSoup
from dotenv import load_dotenv

try:
    from api.validation_service import normalizar_whatsapp_br
except ImportError:
    def normalizar_whatsapp_br(n):
        d = re.sub(r"[^\d]", "", str(n or ""))
        if d.startswith("0"): d = d[1:]
        if d.startswith("55") and len(d) >= 12: d = d[2:]
        if len(d) == 11 and d[2] == "9": return "55" + d
        return None

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv()

# ==========================================================
# ⚙️ CONFIGURAÇÕES (Google e Async)
# ==========================================================
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_CX      = os.getenv("GOOGLE_SEARCH_CX")
BING_SEARCH_API_KEY   = os.getenv("BING_SEARCH_API_KEY", "")
BRAVE_SEARCH_API_KEY  = os.getenv("BRAVE_SEARCH_API_KEY", "")
TAVILY_API_KEY        = os.getenv("TAVILY_API_KEY", "")
SEARXNG_URL           = os.getenv("SEARXNG_URL", "")
FIRECRAWL_API_KEY     = os.getenv("FIRECRAWL_API_KEY", "")
FIRECRAWL_API_BASE    = os.getenv("FIRECRAWL_API_BASE", "https://api.firecrawl.dev")
FIRECRAWL_PROXY       = os.getenv("FIRECRAWL_PROXY", "basic")
DEFAULT_SEARCH_PROVIDER_ORDER = ["google", "searxng", "tavily", "brave", "bing", "ddgs"]
VALID_SEARCH_PROVIDERS = set(DEFAULT_SEARCH_PROVIDER_ORDER)


def _normalizar_ordem_provedores(raw: str) -> List[str]:
    ordem = []
    for provider in (raw or "").split(","):
        provider_limpo = provider.strip().lower()
        if provider_limpo and provider_limpo in VALID_SEARCH_PROVIDERS and provider_limpo not in ordem:
            ordem.append(provider_limpo)

    for provider in DEFAULT_SEARCH_PROVIDER_ORDER:
        if provider not in ordem:
            ordem.append(provider)

    return ordem


SEARCH_PROVIDER_ORDER = _normalizar_ordem_provedores(
    os.getenv("SEARCH_PROVIDER_ORDER", ",".join(DEFAULT_SEARCH_PROVIDER_ORDER))
)

MAX_CONCURRENT_REQUESTS = 5
REQUEST_TIMEOUT = 30.0

DOMINIOS_BANIDOS = [
    "guiapj.com", "cuiket.com", "descubraonline.com", "acheempresa.com",
    "telelistas.net", "solutudo.com.br", "cnpj.biz", "br.biz", "guiamais.com",
    "informecadastral.com.br", "cadastroempresa.com.br", "consultascnpj.com",
    "consultasocio.com", "casadosdados.com.br", "econodata.com.br",
    "speedio.com.br", "infoinvest.com.br", "aboutcompany.info",
    "procuroacho.com", "guiapj.com.br", "todosnegocios.com",
    "br.todosnegocios.com", "empresascnpj.com", "cnpjconsultas.com",
    "empresaqui.com", "cnpjja.com.br", "receitaws.com.br",
    "cnpjreceita.com.br", "consultacnpj.com", "empresas.wiki",
    "cnpj.services", "findcnpj.com.br", "brasilcnpj.com",
    "portalcnpj.com.br", "buscacnpj.com.br", "dadosmarket.com.br",
    "dnb.com", "yelp.com", "facebook.com", "linkedin.com", "instagram.com",
    "google.com", "google.com.br", "dicio.com.br", "wikipedia.org", "wiktionary.org",
    "jusbrasil.com.br", "econodata.com.br", "casa.dados.com.br",
    "zhihu.com", "baidu.com", "forum.cfx.re"
]
TERMOS_EMPRESA_IGNORADOS = {
    "de", "da", "do", "das", "dos", "e", "a", "o", "em", "com", "para",
    "ltda", "sa", "s", "me", "epp", "eireli", "grupo", "holding",
    "empresa", "companhia", "comercio", "industrial", "industria", "servicos"
}
SUBDOMINIOS_RUIDOSOS = {
    "forum", "devforum", "community", "blog", "support", "suporte", "ajuda",
    "help", "developers", "developer", "docs", "status", "wiki",
}
SUBDOMINIOS_SECUNDARIOS = {
    "lojas", "store", "shop", "m", "app", "conta", "web", "ri", "ir",
    "investor", "investors", "carreiras", "jobs",
}
CAMINHOS_RUIDOSOS = {
    "history", "users", "user", "profile", "profiles", "question",
    "questions", "forum", "forums", "tag", "tags", "topic", "topics",
    "search", "login",
}
CAMINHOS_SECUNDARIOS = {
    "filiais", "lojas", "busca", "produto", "produtos", "categoria",
    "categorias", "p",
}
CAMINHOS_PRIORITARIOS = {
    "contato", "contact", "fale-conosco", "sobre", "about", "quem-somos",
    "empresa", "institucional",
}
EMAILS_GENERICOS = {
    "contato", "contatos", "comercial", "vendas", "atendimento", "suporte",
    "sac", "hello", "oi",
}
EMAILS_INSTITUCIONAIS = {
    "imprensa", "press", "media", "ri", "ir", "investor", "investidores",
    "fiscal", "juridico", "juridica", "legal", "privacy", "privacidade",
    "dpo", "ouvidoria", "compliance", "financeiro", "cobranca",
}
SUFIXOS_ARQUIVOS_INVALIDOS_EMAIL = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
    ".css", ".js", ".woff", ".woff2",
}
SUFIXOS_DOMINIO_3_NIVEIS = {
    "com.br", "org.br", "net.br", "gov.br", "edu.br",
}

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

# Cache simples em memória com limite de tamanho
cache_contatos = {}
_MAX_CACHE_SIZE = 5000

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


def _normalizar_texto_busca(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", str(texto or ""))
    texto = "".join(ch for ch in texto if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", texto.lower()).strip()


def _tokens_empresa(empresa_nome: str) -> List[str]:
    tokens = []
    for token in _normalizar_texto_busca(empresa_nome).split():
        if len(token) <= 2 or token in TERMOS_EMPRESA_IGNORADOS:
            continue
        if token not in tokens:
            tokens.append(token)
    return tokens[:5]


def _extrair_host(link: str) -> str:
    try:
        return (urlparse(link).hostname or "").lower().replace("www.", "")
    except Exception:
        return ""


def _dominio_registravel(host: str) -> str:
    host_limpo = str(host or "").lower().strip(".")
    if not host_limpo:
        return ""

    partes = host_limpo.split(".")
    if len(partes) <= 2:
        return host_limpo

    if ".".join(partes[-2:]) in SUFIXOS_DOMINIO_3_NIVEIS and len(partes) >= 3:
        return ".".join(partes[-3:])

    return ".".join(partes[-2:])


def _host_contato_banido(host_or_url: str) -> bool:
    host = _extrair_host(host_or_url) or str(host_or_url or "").lower().replace("www.", "").strip(".")
    dominio = _dominio_registravel(host)
    if not dominio:
        return False
    return any(
        dominio == bloqueado
        or dominio.endswith("." + bloqueado)
        or bloqueado in dominio
        for bloqueado in DOMINIOS_BANIDOS
    )


def _source_with_site(source: str, site_url: str) -> str:
    fonte = str(source or "").strip()
    dominio = _dominio_registravel(_extrair_host(site_url))
    if fonte and dominio and dominio not in fonte.lower():
        return f"{fonte} | {dominio}"
    if fonte:
        return fonte
    return dominio


def _normalizar_url_linkedin(url: str) -> str:
    parsed = urlparse(str(url or "").strip())
    path = re.sub(r"/+", "/", parsed.path or "/").rstrip("/")
    if not path:
        path = "/"
    return urlunparse(("https", "www.linkedin.com", path, "", "", ""))


def _normalizar_url_publica(link: str) -> str:
    url = str(link or "").strip()
    if not url:
        return ""

    try:
        parsed = urlparse(url if "://" in url else f"https://{url}")
    except Exception:
        return url

    host = (parsed.hostname or "").lower().strip(".")
    if not host:
        return url

    if "linkedin.com/" in url:
        return _normalizar_url_linkedin(url)

    dominio = _dominio_registravel(host)
    prefixo = host.split(".")[0]
    caminho = [segmento for segmento in (parsed.path or "").split("/") if segmento]
    caminho_lower = [segmento.lower() for segmento in caminho]

    host_colapsado = host != dominio and prefixo in (SUBDOMINIOS_RUIDOSOS | SUBDOMINIOS_SECUNDARIOS)
    if host_colapsado:
        host = dominio

    manter_caminho = any(segmento in CAMINHOS_PRIORITARIOS for segmento in caminho_lower)
    if host_colapsado:
        caminho = []
    elif not manter_caminho and (
        len(caminho_lower) > 1
        or any(segmento in CAMINHOS_RUIDOSOS for segmento in caminho_lower)
        or any(segmento in CAMINHOS_SECUNDARIOS for segmento in caminho_lower)
    ):
        caminho = []

    caminho_normalizado = "/" + "/".join(caminho) if caminho else "/"
    return urlunparse(("https", host, caminho_normalizado, "", "", ""))


def _tokens_nome_pessoa(nome: str) -> List[str]:
    return [
        token
        for token in _normalizar_texto_busca(nome).split()
        if len(token) > 2 and token not in TERMOS_EMPRESA_IGNORADOS
    ]


def _slug_linkedin_confere_nome(link: str, nome: str) -> bool:
    match = re.search(r"linkedin\.com/in/([^/?#]+)", str(link or ""), re.IGNORECASE)
    if not match:
        return False

    slug = _normalizar_texto_busca(unquote(match.group(1)).replace("-", " "))
    if not slug:
        return False

    nome_tokens = _tokens_nome_pessoa(nome)
    if not nome_tokens:
        return False

    extremos = [nome_tokens[0], nome_tokens[-1]] if len(nome_tokens) > 1 else [nome_tokens[0]]
    if all(token in slug for token in extremos):
        return True

    return sum(1 for token in nome_tokens if token in slug) >= min(2, len(nome_tokens))


def _email_tokens(email: str) -> List[str]:
    local = str(email or "").split("@")[0].lower()
    return [token for token in re.split(r"[^a-z0-9]+", local) if token]


def _email_candidato_aceitavel(email: str) -> bool:
    email_limpo = str(email or "").strip().lower()
    if not email_limpo or not re.fullmatch(EMAIL_REGEX, email_limpo):
        return False
    if "%" in email_limpo:
        return False
    if any(email_limpo.endswith(sufixo) for sufixo in SUFIXOS_ARQUIVOS_INVALIDOS_EMAIL):
        return False
    return True


def _score_email_capturado(email: str, site_url: str = "") -> float:
    email_limpo = str(email or "").strip().lower()
    if not _email_candidato_aceitavel(email_limpo):
        return float("-inf")

    host_site = _dominio_registravel(_extrair_host(site_url))
    dominio_email = _dominio_registravel(email_limpo.split("@", 1)[1])
    tokens = _email_tokens(email_limpo)

    score = 0.0
    if dominio_email and host_site and dominio_email == host_site:
        score += 30
    elif dominio_email and host_site and dominio_email.endswith(host_site):
        score += 18
    elif dominio_email:
        score -= 10

    if any(token in EMAILS_GENERICOS for token in tokens):
        score += 12
    if any(token in EMAILS_INSTITUCIONAIS for token in tokens):
        score -= 18

    if len(tokens) == 1:
        score += 2

    return score


def _selecionar_melhor_email(emails: List[str], site_url: str = "") -> str:
    candidatos_unicos = []
    for email in emails or []:
        email_limpo = str(email or "").strip().lower()
        if _email_candidato_aceitavel(email_limpo) and email_limpo not in candidatos_unicos:
            candidatos_unicos.append(email_limpo)

    if not candidatos_unicos:
        return ""

    return max(candidatos_unicos, key=lambda item: _score_email_capturado(item, site_url))


def _pontuar_resultado_site_oficial(resultado: Dict[str, Any], empresa_nome: str) -> float:
    link_bruto = str(resultado.get("link", "") or "")
    if "://" not in link_bruto:
        link_bruto = f"https://{link_bruto}"
    host = _extrair_host(link_bruto)
    if not host:
        return -100.0
    if _host_contato_banido(host):
        return -100.0

    titulo = _normalizar_texto_busca(resultado.get("titulo", ""))
    descricao = _normalizar_texto_busca(resultado.get("descricao", ""))
    caminho = (urlparse(link_bruto).path or "").lower()
    tokens = _tokens_empresa(empresa_nome)
    dominio = _dominio_registravel(host)
    prefixo = host.split(".")[0]
    caminho_segmentos = [segmento for segmento in caminho.split("/") if segmento]

    score = 0.0
    if host.endswith(".com.br"):
        score += 3
    elif host.endswith(".com"):
        score += 2

    host_principal = dominio.split(".")[0]
    if prefixo in SUBDOMINIOS_RUIDOSOS:
        score -= 18
    elif prefixo in SUBDOMINIOS_SECUNDARIOS:
        score -= 4

    if any(parte in CAMINHOS_RUIDOSOS for parte in caminho_segmentos):
        score -= 12
    elif any(parte in CAMINHOS_SECUNDARIOS for parte in caminho_segmentos):
        score -= 5

    if len(caminho_segmentos) <= 1:
        score += 4
    elif any(parte in caminho for parte in ("/contato", "/contact", "/sobre", "/about")):
        score += 3
    else:
        score -= 1

    if not tokens:
        return score

    concatenado = "".join(tokens[:2])
    if concatenado and concatenado in host_principal:
        score += 12

    host_hits = sum(1 for token in tokens if token in host)
    title_hits = sum(1 for token in tokens if token in titulo)
    desc_hits = sum(1 for token in tokens if token in descricao)

    score += host_hits * 6
    score += title_hits * 3
    score += desc_hits * 1.5

    if host_hits == 0 and title_hits < 2:
        score -= 10

    if "site oficial" in titulo or "site oficial" in descricao:
        score += 3
    if "empresa" in titulo or "empresa" in descricao:
        score += 2

    return score


def _querys_site_oficial(empresa_nome: str, cidade: str = "") -> List[str]:
    base = f'"{empresa_nome}"'
    queries = [
        f"{base} {cidade} site oficial contato".strip(),
        f"{base} empresa",
        f"{base} site oficial brasil",
        f"{base} site oficial",
        f"{base} contato",
    ]

    resultado = []
    for query in queries:
        query_limpa = " ".join(query.split())
        if query_limpa and query_limpa not in resultado:
            resultado.append(query_limpa)
    return resultado


async def _buscar_melhor_site_oficial(empresa_nome: str, cidade: str = "") -> Dict[str, Any]:
    melhor_match = None
    emails_encontrados: List[str] = []
    whats_encontrados: List[str] = []

    for query in _querys_site_oficial(empresa_nome, cidade):
        raw_results = await buscar_google(query, num_results=8)
        for resultado in raw_results:
            emails_encontrados.extend(resultado.get("emails_snippet") or [])
            whats_encontrados.extend(resultado.get("whats_snippet") or [])

        candidatos = filtrar_resultados(raw_results, empresa_nome=empresa_nome)
        if candidatos:
            candidato = dict(candidatos[0])
            candidato["link"] = _normalizar_url_publica(candidato.get("link", ""))
            candidato["_query"] = query
            if not melhor_match or float(candidato.get("_score_site", 0.0) or 0.0) > float(melhor_match.get("_score_site", 0.0) or 0.0):
                melhor_match = candidato
            if float(candidato.get("_score_site", 0.0) or 0.0) >= 18.0:
                break

    return {
        "melhor_match": melhor_match,
        "emails_snippet": emails_encontrados,
        "whats_snippet": whats_encontrados,
    }


def get_search_provider_status() -> List[Dict[str, Any]]:
    return [
        {
            "provider": "google",
            "enabled": bool(GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX),
            "detail": "GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX",
        },
        {
            "provider": "searxng",
            "enabled": bool(SEARXNG_URL),
            "detail": SEARXNG_URL or "SEARXNG_URL nao configurado",
        },
        {
            "provider": "tavily",
            "enabled": bool(TAVILY_API_KEY),
            "detail": "TAVILY_API_KEY",
        },
        {
            "provider": "brave",
            "enabled": bool(BRAVE_SEARCH_API_KEY),
            "detail": "BRAVE_SEARCH_API_KEY",
        },
        {
            "provider": "bing",
            "enabled": bool(BING_SEARCH_API_KEY),
            "detail": "BING_SEARCH_API_KEY",
        },
        {
            "provider": "ddgs",
            "enabled": True,
            "detail": "fallback local",
        },
    ]


def get_effective_search_provider_order() -> List[str]:
    enabled_by_provider = {
        item["provider"]: item["enabled"]
        for item in get_search_provider_status()
    }
    return [
        provider
        for provider in SEARCH_PROVIDER_ORDER
        if enabled_by_provider.get(provider, False)
    ]


async def _buscar_google_custom_search(termo: str, num_results: int = 5) -> List[Dict]:
    if not (GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX):
        return []

    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": GOOGLE_SEARCH_API_KEY,
        "cx": GOOGLE_SEARCH_CX,
        "q": termo,
        "num": min(num_results, 10),
        "gl": "br",
        "hl": "pt",
    }

    async with httpx.AsyncClient(timeout=25.0) as client:
        try:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                return [
                    _montar_resultado(i.get("title", ""), i.get("link", ""), i.get("snippet", ""))
                    for i in items
                ]
        except Exception:
            pass

    return []


async def _buscar_bing(termo: str, num_results: int = 5) -> List[Dict]:
    """Bing Web Search API v7 (mantido como opção caso configurado)."""
    if not BING_SEARCH_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
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
        async with httpx.AsyncClient(timeout=25.0) as client:
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
                    "country": "BR",
                    "search_lang": "pt-br",
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


async def _buscar_tavily(termo: str, num_results: int = 5) -> List[Dict]:
    """
    Tavily Search API â€” alternativa gratuita para buscas iniciais.
    """
    if not TAVILY_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": termo,
                    "topic": "general",
                    "search_depth": "basic",
                    "max_results": min(num_results, 10),
                    "include_answer": False,
                    "include_raw_content": False,
                },
            )
            if resp.status_code == 200:
                items = resp.json().get("results", [])
                return [
                    _montar_resultado(
                        item.get("title", ""),
                        item.get("url", ""),
                        item.get("content", ""),
                    )
                    for item in items
                ]
            elif resp.status_code == 401:
                print("âš  [TAVILY] Chave invÃ¡lida.")
            elif resp.status_code == 429:
                print("âš  [TAVILY] Quota excedida.")
    except Exception as e:
        print(f"âš  [TAVILY] Erro: {e}")
    return []


async def _buscar_searxng(termo: str, num_results: int = 5) -> List[Dict]:
    """
    SearXNG self-hosted — sem rate-limit, sem API key.
    Agrega Google, Bing, DuckDuckGo, Brave e outros automaticamente.
    """
    if not SEARXNG_URL:
        return []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{SEARXNG_URL}/search",
                params={
                    "q": termo,
                    "format": "json",
                    "language": "pt-BR",
                    "categories": "general",
                    "pageno": 1,
                },
            )
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                return [
                    _montar_resultado(
                        r.get("title", ""),
                        r.get("url", ""),
                        r.get("content", ""),
                    )
                    for r in results[:num_results]
                ]
    except Exception as e:
        print(f"[SEARXNG] Erro: {e}")
    return []


async def _buscar_ddgs(termo: str, num_results: int = 5) -> List[Dict]:
    try:
        import concurrent.futures
        import asyncio as _aio
        from ddgs import DDGS

        def _ddgs_sync():
            with DDGS() as ddgs:
                gen = ddgs.text(
                    termo,
                    region="br-pt",
                    safesearch="off",
                    max_results=num_results,
                    timeout=25,
                )
                return [
                    _montar_resultado(r.get("title", ""), r.get("href", ""), r.get("body", ""))
                    for r in gen
                ]

        loop = _aio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            fut = loop.run_in_executor(pool, _ddgs_sync)
            resultados = await _aio.wait_for(fut, timeout=30.0)
        return resultados or []
    except Exception:
        return []


async def buscar_google(termo: str, num_results: int = 5) -> List[Dict[str, str]]:
    """
    Busca web com 5 motores em cascata:
      0. SearXNG self-hosted   (sem limites — PRIORITÁRIO)
      1. Google Custom Search  (100/dia grátis, melhor qualidade)
      2. Brave Search API      (1.000/mês grátis — PRINCIPAL para LinkedIn)
      3. Bing Web Search API   (se configurado)
      4. DuckDuckGo DDGS       (fallback — bloqueia em abuso)
    """
    # ── 0. SearXNG self-hosted (PRIORITÁRIO — sem limites) ────────────────────
    if SEARXNG_URL:
        res_searx = await _buscar_searxng(termo, num_results)
        if res_searx:
            return res_searx

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
                resp = await client.get(url, params=params, timeout=25.0)
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
    if TAVILY_API_KEY:
        res_tavily = await _buscar_tavily(termo, num_results)
        if res_tavily:
            return res_tavily

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
                                max_results=num_results, timeout=25)
                return [
                    _montar_resultado(r.get("title", ""), r.get("href", ""), r.get("body", ""))
                    for r in gen
                ]
        loop = _aio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            fut = loop.run_in_executor(pool, _ddgs_sync)
            resultados = await _aio.wait_for(fut, timeout=30.0)
        if resultados:
            return resultados
    except Exception:
        pass

    return []

def filtrar_resultados(resultados: List[Dict], empresa_nome: str = "") -> List[Dict]:
    """Remove sites genéricos, deduplica e prioriza candidatos com cara de site oficial."""
    vistos = set()
    filtrados = []
    
    for r in resultados:
        link = r.get("link", "")
        if not link:
            continue
            
        try:
            link_normalizado = _normalizar_url_publica(link)
            domain_match = re.search(r"://([^/]+)", link_normalizado)
            if not domain_match:
                continue
            dominio = domain_match.group(1).lower()
        except Exception:
            continue

        # Remove 'www.' para checagem mais ampla
        dominio_limpo = dominio.replace("www.", "")
        
        # Checa banidos
        if _host_contato_banido(dominio_limpo):
            continue
            
        if dominio_limpo in vistos:
            continue
            
        vistos.add(dominio_limpo)
        candidato = dict(r)
        candidato["link"] = link_normalizado
        candidato["_score_site"] = _pontuar_resultado_site_oficial(r, empresa_nome) if empresa_nome else 0.0
        if empresa_nome and float(candidato.get("_score_site", 0.0) or 0.0) < 1.0:
            continue
        filtrados.append(candidato)

    filtrados.sort(key=lambda item: item.get("_score_site", 0.0), reverse=True)
    return filtrados

async def buscar_linkedin_empresa(empresa_nome: str) -> Optional[str]:
    """
    Busca a Company Page da empresa no LinkedIn.
    Estratégia dupla: busca livre (DuckDuckGo) + site: (Google).
    """
    empresa_curta = " ".join(empresa_nome.split()[:4])

    # 1. site: linkedin/company — mais objetivo e menos ruidoso
    res_site = await buscar_google(f'site:linkedin.com/company "{empresa_curta}"', num_results=5)
    for r in res_site:
        if "linkedin.com/company/" in r.get("link", ""):
            return _normalizar_url_linkedin(r["link"])
        li = LINKEDIN_CO_RE.findall(r.get("descricao", ""))
        if li:
            return _normalizar_url_linkedin(li[0])

    # 2. Busca livre — funciona quando o indexador respeita o intent
    for q in [
        f'"{empresa_curta}" linkedin.com/company',
        f'"{empresa_curta}" site linkedin empresa',
    ]:
        res = await buscar_google(q, num_results=5)
        for r in res:
            if "linkedin.com/company/" in r.get("link", ""):
                return _normalizar_url_linkedin(r["link"])
            li = LINKEDIN_CO_RE.findall(r.get("descricao", ""))
            if li:
                return _normalizar_url_linkedin(li[0])

    return None


async def _buscar_google_direto(termo: str, num_results: int = 5) -> List[Dict]:
    """
    Chama APENAS o Google Custom Search — reservado para buscas de LinkedIn pessoal,
    onde Brave/DuckDuckGo não indexam perfis (LinkedIn bloqueia esses crawlers).
    """
    if not (GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX):
        return await buscar_google(termo, num_results)
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
            resp = await client.get(url, params=params, timeout=25.0)
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                return [
                    _montar_resultado(i.get("title", ""), i.get("link", ""), i.get("snippet", ""))
                    for i in items
                ]
        except Exception:
            pass
    return []


async def _buscar_google_legacy(termo: str, num_results: int = 5) -> List[Dict[str, str]]:
    """
    Busca web com ordem configuravel de provedores.
    Ordem padrao:
      1. Google Custom Search
      2. SearXNG self-hosted
      3. Tavily Search API
      4. Brave Search API
      5. Bing Web Search API
      6. DuckDuckGo DDGS
    """
    provider_handlers = {
        "google": _buscar_google_custom_search,
        "searxng": _buscar_searxng,
        "tavily": _buscar_tavily,
        "brave": _buscar_brave,
        "bing": _buscar_bing,
        "ddgs": _buscar_ddgs,
    }

    for provider in get_effective_search_provider_order():
        handler = provider_handlers.get(provider)
        if not handler:
            continue
        resultados = await handler(termo, num_results)
        if resultados:
            return resultados

    return []


async def _buscar_google_direto_legacy(termo: str, num_results: int = 5) -> List[Dict]:
    return await _buscar_google_custom_search(termo, num_results)


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
    nome_ok    = sum(1 for p in palavras_nome if p in texto) >= min(2, len(palavras_nome))

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
        if "linkedin.com/in/" in r.get("link", "") and _slug_linkedin_confere_nome(r.get("link", ""), nome):
            return {"link": _normalizar_url_linkedin(r["link"]), "confianca": "ALTA", "metodo": "Google site:li/in"}

    # ── 2. Google: nome + linkedin + empresa (consome 1 query) ─────────────────
    q2 = f'"{nome_curto}" linkedin "{empresa_curta}"'
    for r in await _buscar_google_direto(q2, num_results=5):
        if "linkedin.com/in/" in r.get("link", "") and _slug_linkedin_confere_nome(r.get("link", ""), nome):
            return {"link": _normalizar_url_linkedin(r["link"]), "confianca": "ALTA", "metodo": "Google Nome+Empresa"}
        for li in LINKEDIN_IN_RE.findall(r.get("descricao", "")):
            if _slug_linkedin_confere_nome(li, nome):
                return {"link": _normalizar_url_linkedin(li), "confianca": "MÉDIA", "metodo": "Google Snippet"}

    # ── 3. Brave/DDG: só aceita se snippet confirmar empresa + nome ────────────
    q3 = f"{nome_curto} linkedin {empresa_curta}"
    for r in await buscar_google(q3, num_results=8):
        link    = r.get("link", "")
        titulo  = r.get("titulo", "")
        snippet = r.get("descricao", "")

        if "linkedin.com/in/" in link:
            if _snippet_valida_pessoa(titulo, snippet, nome_curto, empresa_nome) and _slug_linkedin_confere_nome(link, nome):
                return {"link": _normalizar_url_linkedin(link), "confianca": "MÉDIA", "metodo": "Brave/DDG validado"}

        for li in LINKEDIN_IN_RE.findall(snippet):
            if _snippet_valida_pessoa(titulo, snippet, nome_curto, empresa_nome) and _slug_linkedin_confere_nome(li, nome):
                return {"link": _normalizar_url_linkedin(li), "confianca": "BAIXA", "metodo": "Brave/DDG Snippet validado"}

    return None

# ==========================================================
# 📞 EXTRAÇÃO DE CONTATOS (ASYNC)
# ==========================================================
def _extrair_wame_de_html(html: str, soup: "BeautifulSoup") -> Optional[str]:
    """
    Extrai número WhatsApp de links wa.me / api.whatsapp.com/send em HREF.
    Retorna no formato 55DXXXXXXXXX (13 dígitos) ou None se inválido.
    """
    candidatos = []
    for tag in soup.find_all("a", href=True):
        href = tag["href"]
        m = WAME_HREF_RE.search(href)
        if m:
            candidatos.append(re.sub(r"\D", "", m.group(0)))
    m2 = WAME_HREF_RE.search(html)
    if m2:
        candidatos.append(re.sub(r"\D", "", m2.group(0)))

    for digits in candidatos:
        norm = normalizar_whatsapp_br(digits)
        if norm:
            return norm
    return None


def _extrair_linkedin_de_html(html: str) -> Dict[str, Optional[str]]:
    """Extrai URLs de LinkedIn (empresa e perfis pessoais) do HTML."""
    empresas = list(dict.fromkeys(LINKEDIN_CO_RE.findall(html)))
    perfis   = list(dict.fromkeys(LINKEDIN_IN_RE.findall(html)))
    return {
        "linkedin_empresa": empresas[0] if empresas else None,
        "linkedin_perfis":  perfis[:3],
    }


def _extrair_whatsapp_textual(texto: str) -> Optional[str]:
    if not texto:
        return None

    patterns = [
        re.compile(r"(?:whats(?:app)?|zap)\D{0,24}((?:\+?55\D*)?(?:\(?\d{2}\)?\D*)?9\d{4}\D*\d{4})", re.IGNORECASE),
        re.compile(r"((?:\+?55\D*)?(?:\(?\d{2}\)?\D*)?9\d{4}\D*\d{4})\D{0,24}(?:whats(?:app)?|zap)", re.IGNORECASE),
    ]

    for pattern in patterns:
        match = pattern.search(texto)
        if not match:
            continue
        numero = normalizar_whatsapp_br(match.group(1))
        if numero:
            return numero

    return None


def _extrair_whatsapp_de_links(links: List[str], texto: str) -> Optional[str]:
    if not links or not re.search(r"\b(whats(?:app)?|zap)\b", texto or "", re.IGNORECASE):
        return None

    for link in links:
        match = WAME_HREF_RE.search(link)
        if not match:
            continue
        numero = normalizar_whatsapp_br(match.group(1))
        if numero:
            return numero

    return None


def _extrair_contatos_do_conteudo(
    site_url: str,
    html: str = "",
    texto: str = "",
    links: Optional[List[str]] = None,
    source: str = "",
) -> Dict[str, Any]:
    soup = BeautifulSoup(html or "", "html.parser")
    links_validos = [str(link).strip() for link in (links or []) if str(link).strip()]
    universo_html = html or ""
    universo_texto = " ".join(parte for parte in [texto, soup.get_text(" ")] if parte)
    universo_links = "\n".join(links_validos)

    contatos: Dict[str, Any] = {
        "site": site_url,
        "email": "",
        "telefone": "",
        "whatsapp": "",
        "linkedin_empresa": None,
        "linkedin_perfis": [],
        "source": _source_with_site(source, site_url),
    }
    emails_candidatos: List[str] = []

    for a in soup.find_all("a", href=True):
        href = str(a["href"])
        if href.startswith("mailto:"):
            emails_candidatos.append(href[7:].split("?")[0].strip())

    for link in links_validos:
        if link.startswith("mailto:"):
            emails_candidatos.append(link[7:].split("?")[0].strip())

    emails_candidatos.extend(re.findall(EMAIL_REGEX, universo_texto))
    contatos["email"] = _selecionar_melhor_email(emails_candidatos, site_url)

    wpp = _extrair_wame_de_html(universo_html, soup)
    if not wpp:
        wpp = _extrair_whatsapp_de_links(links_validos, universo_texto)
    if wpp:
        contatos["whatsapp"] = wpp
    else:
        contatos["whatsapp"] = _extrair_whatsapp_textual(universo_texto) or ""

    tels = re.findall(PHONE_REGEX, universo_texto)
    if tels:
        contatos["telefone"] = tels[0]

    li = _extrair_linkedin_de_html("\n".join(parte for parte in [universo_html, universo_links, universo_texto] if parte))
    if li["linkedin_empresa"]:
        contatos["linkedin_empresa"] = li["linkedin_empresa"]
    if li["linkedin_perfis"]:
        contatos["linkedin_perfis"] = li["linkedin_perfis"]

    return contatos


async def _extrair_contatos_firecrawl(url: str) -> Dict[str, Any]:
    if not FIRECRAWL_API_KEY:
        return {}

    payload = {
        "url": url,
        "formats": ["markdown", "html", "links"],
        "onlyMainContent": False,
        "maxAge": 0,
        "location": {
            "country": "BR",
            "languages": ["pt-BR"],
        },
        "proxy": FIRECRAWL_PROXY,
    }

    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{FIRECRAWL_API_BASE.rstrip('/')}/v2/scrape",
                headers=headers,
                json=payload,
            )
            if resp.status_code != 200:
                print(f"[FIRECRAWL] scrape falhou para {url}: HTTP {resp.status_code}")
                return {}

            body = resp.json()
            data = body.get("data") or {}
            html = str(data.get("html") or "")
            markdown = str(data.get("markdown") or "")
            links = [str(link) for link in (data.get("links") or []) if link]
            metadata = data.get("metadata") or {}

            contatos = _extrair_contatos_do_conteudo(
                site_url=str(metadata.get("sourceURL") or metadata.get("url") or url),
                html=html,
                texto=" ".join(
                    parte for parte in [
                        markdown,
                        str(metadata.get("title") or ""),
                        str(metadata.get("description") or ""),
                    ] if parte
                ),
                links=links,
                source="Firecrawl",
            )
            if any(
                contatos.get(chave)
                for chave in ("email", "telefone", "whatsapp", "linkedin_empresa")
            ):
                return contatos
    except Exception as e:
        print(f"[FIRECRAWL] erro para {url}: {repr(e)}")

    return {}


async def extrair_contatos_site(url: str, modo_rapido: bool = False) -> Dict[str, Any]:
    """
    Navega na home + páginas de contato. Extrai email, telefone, WhatsApp (via
    wa.me HREF), LinkedIn da empresa e links de perfil.

    Tenta Scrapling primeiro (stealth, adaptativo); se não disponível ou falhar,
    cai no fallback httpx + BeautifulSoup.
    """
    contatos: Dict[str, Any] = {
        "site": url, "email": "", "telefone": "", "whatsapp": "",
        "linkedin_empresa": None, "linkedin_perfis": [],
        "source": "",
    }

    try:
        dominio = re.search(r"://([^/]+)", url).group(1)  # type: ignore[union-attr]
    except Exception:
        return contatos

    if _host_contato_banido(dominio):
        contatos["source"] = _source_with_site("Diretorio descartado", url)
        return contatos

    if dominio in cache_contatos:
        return cache_contatos[dominio]

    if not modo_rapido:
        # Scrapling (stealth, adaptativo, extrai mais dados)
        try:
            from scrapling_service import extrair_contatos_scrapling_async, SCRAPLING_AVAILABLE
            if SCRAPLING_AVAILABLE:
                scrapling_data = await extrair_contatos_scrapling_async(url)
                scrapling_email = _selecionar_melhor_email(
                    [scrapling_data.get("email", "")],
                    scrapling_data.get("site", url),
                )
                if (
                    scrapling_email
                    or scrapling_data.get("whatsapp")
                    or scrapling_data.get("telefone")
                    or scrapling_data.get("linkedin_empresa")
                ):
                    contatos["site"] = _normalizar_url_publica(scrapling_data.get("site", url))
                    contatos["email"] = scrapling_email
                    contatos["telefone"] = scrapling_data.get("telefone", "")
                    contatos["whatsapp"] = scrapling_data.get("whatsapp", "")
                    contatos["linkedin_empresa"] = scrapling_data.get("linkedin_empresa")
                    contatos["linkedin_perfis"] = scrapling_data.get("linkedin_perfis", [])
                    contatos["source"] = _source_with_site(scrapling_data.get("source") or "Scrapling", contatos["site"])
                    if len(cache_contatos) >= _MAX_CACHE_SIZE:
                        cache_contatos.clear()
                    cache_contatos[dominio] = contatos
                    return contatos
        except Exception as e:
            print(f"[SCRAPER] Scrapling falhou para {url}, usando httpx fallback: {repr(e)}")

        # Firecrawl (dinâmico e melhor para sites JS-heavy) antes do fallback manual.
        firecrawl_data = await _extrair_contatos_firecrawl(url)
        firecrawl_email = _selecionar_melhor_email(
            [firecrawl_data.get("email", "")],
            firecrawl_data.get("site", url),
        )
        if (
            firecrawl_email
            or firecrawl_data.get("whatsapp")
            or firecrawl_data.get("telefone")
            or firecrawl_data.get("linkedin_empresa")
        ):
            contatos["site"] = _normalizar_url_publica(firecrawl_data.get("site", url))
            contatos["email"] = firecrawl_email
            contatos["telefone"] = firecrawl_data.get("telefone", "")
            contatos["whatsapp"] = firecrawl_data.get("whatsapp", "")
            contatos["linkedin_empresa"] = firecrawl_data.get("linkedin_empresa")
            contatos["linkedin_perfis"] = firecrawl_data.get("linkedin_perfis", [])
            contatos["source"] = _source_with_site(firecrawl_data.get("source") or "Firecrawl", contatos["site"])
            if len(cache_contatos) >= _MAX_CACHE_SIZE:
                cache_contatos.clear()
            cache_contatos[dominio] = contatos
            return contatos

    # Fallback: httpx + BeautifulSoup
    caminhos = ["", "/contato", "/contact"] if modo_rapido else [
        "",
        "/contato",
        "/fale-conosco",
        "/sobre",
        "/quem-somos",
        "/contact",
    ]
    headers  = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }

    timeout = 12.0 if modo_rapido else 30.0

    async with httpx.AsyncClient(verify=False, timeout=timeout, follow_redirects=True) as client:
        for caminho in caminhos:
            target = url.rstrip("/") + caminho
            try:
                resp = await client.get(target, headers=headers)
                if resp.status_code != 200:
                    continue

                extraidos = _extrair_contatos_do_conteudo(url, html=resp.text, source="HTTPX")
                if not contatos["email"] and extraidos.get("email"):
                    contatos["email"] = extraidos["email"]
                if not contatos["whatsapp"] and extraidos.get("whatsapp"):
                    contatos["whatsapp"] = extraidos["whatsapp"]
                if not contatos["telefone"] and extraidos.get("telefone"):
                    contatos["telefone"] = extraidos["telefone"]
                if not contatos["linkedin_empresa"] and extraidos.get("linkedin_empresa"):
                    contatos["linkedin_empresa"] = extraidos["linkedin_empresa"]
                if not contatos["linkedin_perfis"] and extraidos.get("linkedin_perfis"):
                    contatos["linkedin_perfis"] = extraidos["linkedin_perfis"]
                if not contatos["source"] and extraidos.get("source"):
                    contatos["source"] = _source_with_site(extraidos["source"], url)

                if contatos["email"] or contatos["whatsapp"]:
                    break
            except Exception:
                continue

    if len(cache_contatos) >= _MAX_CACHE_SIZE:
        cache_contatos.clear()
    cache_contatos[dominio] = contatos
    return contatos

async def processar_empresa_google(
    empresa_nome: str,
    cnpj: str = "",
    cidade: str = "",
    socios: List[str] = None,
    site_url: str = "",
    modo_rapido: bool = False,
) -> Optional[Dict]:
    """
    Logica de enriquecimento focada em site oficial e contatos acionaveis.
    """
    dados_extraidos = {"site": "", "email": "", "telefone": "", "whatsapp": ""}
    melhor_match = None

    site_conhecido = _normalizar_url_publica(str(site_url or "").strip())
    if site_conhecido and _host_contato_banido(site_conhecido):
        print(f"[SCRAPER] Site conhecido descartado por ser diretório/agregador: {site_conhecido}")
        site_conhecido = ""
    if site_conhecido:
        try:
            dados_extraidos = await extrair_contatos_site(site_conhecido, modo_rapido=modo_rapido)
            if not dados_extraidos.get("site"):
                dados_extraidos["site"] = site_conhecido
            else:
                dados_extraidos["site"] = _normalizar_url_publica(dados_extraidos["site"])
            melhor_match = {"link": site_conhecido, "_score_site": 999.0}
        except Exception:
            dados_extraidos = {"site": site_conhecido, "email": "", "telefone": "", "whatsapp": ""}

    busca_site = await _buscar_melhor_site_oficial(empresa_nome, cidade)
    emails_encontrados = list(busca_site.get("emails_snippet") or [])
    whats_encontrados = list(busca_site.get("whats_snippet") or [])

    if (not melhor_match or not dados_extraidos.get("email")) and busca_site.get("melhor_match"):
        candidato_top = busca_site["melhor_match"]
        score_top = float(candidato_top.get("_score_site", 0.0) or 0.0)
        if score_top >= 3 or not melhor_match:
            melhor_match = candidato_top
            dados_extraidos = await extrair_contatos_site(candidato_top["link"], modo_rapido=modo_rapido)
            if dados_extraidos.get("site"):
                dados_extraidos["site"] = _normalizar_url_publica(dados_extraidos["site"])

    if (not melhor_match or float(melhor_match.get("_score_site", 0.0) or 0.0) < 3) and TAVILY_API_KEY:
        for query_site in _querys_site_oficial(empresa_nome, cidade):
            resultados_tavily = await _buscar_tavily(query_site, num_results=5)
            candidatos_tavily = filtrar_resultados(resultados_tavily, empresa_nome=empresa_nome)
            if candidatos_tavily and float(candidatos_tavily[0].get("_score_site", 0.0) or 0.0) > float((melhor_match or {}).get("_score_site", 0.0) or 0.0):
                melhor_match = dict(candidatos_tavily[0])
                melhor_match["link"] = _normalizar_url_publica(melhor_match.get("link", ""))
                dados_extraidos = await extrair_contatos_site(melhor_match["link"], modo_rapido=modo_rapido)
                if dados_extraidos.get("site"):
                    dados_extraidos["site"] = _normalizar_url_publica(dados_extraidos["site"])
            if melhor_match and float(melhor_match.get("_score_site", 0.0) or 0.0) >= 18.0:
                break

    if not dados_extraidos["email"]:
        query_email = f'"{empresa_nome}" e-mail contato'
        res_profunda = await buscar_google(query_email, num_results=5)
        emails_profundo = []
        for r in res_profunda:
            emails_profundo.extend(r.get("emails_snippet") or [])
        melhor_email = _selecionar_melhor_email(
            emails_profundo,
            dados_extraidos.get("site") or (melhor_match or {}).get("link", ""),
        )
        if melhor_email:
            dados_extraidos["email"] = melhor_email

    if not dados_extraidos["email"] and emails_encontrados:
        dados_extraidos["email"] = _selecionar_melhor_email(
            emails_encontrados,
            dados_extraidos.get("site") or (melhor_match or {}).get("link", ""),
        )
    if not dados_extraidos["whatsapp"] and whats_encontrados:
        for whatsapp in whats_encontrados:
            normalizado = normalizar_whatsapp_br(whatsapp)
            if normalizado:
                dados_extraidos["whatsapp"] = normalizado
                break

    redes_socios = []
    linkedin_empresa = dados_extraidos.get("linkedin_empresa")
    if not linkedin_empresa and not modo_rapido:
        linkedin_empresa = await buscar_linkedin_empresa(empresa_nome)

    if socios and not modo_rapido:
        for socio in socios[:2]:
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
        "contatos_source": dados_extraidos.get("source") or None,
        "linkedin_empresa": linkedin_empresa,
        "redes_socios": redes_socios,
        **dados_extraidos,
    }

# ==========================================================
# 🚀 HELPER PARA RODAR DO WORKER (SYNC WRAPPER)
# ==========================================================
def run_enrichment_sync(empresa_nome: str, cidade: str):
    """Wrapper síncrono para ser chamado pelo RQ Worker se não for async"""
    return asyncio.run(processar_empresa_google(empresa_nome, cidade=cidade))


# Mantido no fim do modulo para prevalecer sobre definicoes legadas acima.
async def buscar_google(termo: str, num_results: int = 5) -> List[Dict[str, str]]:
    """
    Busca web com ordem configuravel de provedores.
    Ordem padrao:
      1. Google Custom Search
      2. SearXNG self-hosted
      3. Tavily Search API
      4. Brave Search API
      5. Bing Web Search API
      6. DuckDuckGo DDGS
    """
    provider_handlers = {
        "google": _buscar_google_custom_search,
        "searxng": _buscar_searxng,
        "tavily": _buscar_tavily,
        "brave": _buscar_brave,
        "bing": _buscar_bing,
        "ddgs": _buscar_ddgs,
    }

    for provider in get_effective_search_provider_order():
        handler = provider_handlers.get(provider)
        if not handler:
            continue
        resultados = await handler(termo, num_results)
        if resultados:
            return resultados

    return []


async def _buscar_google_direto(termo: str, num_results: int = 5) -> List[Dict]:
    if not (GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX):
        return await buscar_google(termo, num_results)
    return await _buscar_google_custom_search(termo, num_results)

