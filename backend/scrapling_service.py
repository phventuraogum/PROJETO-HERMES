"""
Scrapling Service - Scraping adaptativo para enriquecimento de empresas.

Usa o framework Scrapling (Fetcher leve, sem Playwright) para:
  - Bypass de bloqueios anti-bot / Cloudflare
  - Parser adaptativo (sobrevive a mudanças de layout)
  - Extração de contatos e dados corporativos
"""
from __future__ import annotations

import re
import asyncio
import concurrent.futures
from typing import Dict, List, Optional, Any
from functools import lru_cache

try:
    from scrapling.fetchers import Fetcher
    SCRAPLING_AVAILABLE = True
except ImportError:
    SCRAPLING_AVAILABLE = False

# Regex reutilizados (mesmo padrão do core_scraper)
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
WHATS_RE = re.compile(
    r"(?:\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4})"
    r"|(?:\+55\s?\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4})"
)
PHONE_RE = re.compile(r"\(?\d{2}\)?\s?[2-8]\d{3}-?\d{4}")
WAME_RE = re.compile(
    r"(?:https?://)?(?:wa\.me|api\.whatsapp\.com/send\?phone=|web\.whatsapp\.com/send\?phone=)"
    r"[^\s\"'&?#>]*(\d{10,13})",
    re.IGNORECASE,
)
LINKEDIN_CO_RE = re.compile(r"https?://(?:www\.)?linkedin\.com/company/[a-zA-Z0-9_-]+/?")
LINKEDIN_IN_RE = re.compile(r"https?://(?:www\.)?linkedin\.com/in/[a-zA-Z0-9_%-]+/?")
INSTAGRAM_RE = re.compile(r"https?://(?:www\.)?instagram\.com/[a-zA-Z0-9_.]+/?")
FACEBOOK_RE = re.compile(r"https?://(?:www\.)?facebook\.com/[a-zA-Z0-9_.]+/?")
CNPJ_RE = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")

EMAILS_IGNORAR = {
    "wixpress.com", "sentry.io", "w3.org", "schema.org",
    "example.com", "googleapis.com", "gstatic.com",
    "cloudflare.com", "jquery.com",
    "informecadastral.com.br", "cadastroempresa.com.br",
    "cnpj.biz", "cnpj.info", "cnpja.com", "econodata.com.br",
    "speedio.com.br", "consultasocio.com", "solutudo.com.br",
    "aboutcompany.info", "procuroacho.com", "guiapj.com.br",
    "infoinvest.com.br", "todosnegocios.com",
}

CAMINHOS_CONTATO = [
    "", "/contato", "/fale-conosco", "/sobre",
    "/quem-somos", "/contact", "/about",
    "/empresa", "/institucional",
    "/equipe", "/time", "/team", "/nosso-time",
]


def _email_valido(email: str) -> bool:
    """Filtra emails de frameworks/libs/genéricos."""
    dominio = email.split("@")[-1].lower()
    if dominio in EMAILS_IGNORAR:
        return False
    if any(p in dominio for p in ["wix", "sentry", "w3.org", "schema"]):
        return False
    if any(p in email.lower() for p in ["noreply", "no-reply", "mailer-daemon"]):
        return False
    return True


def _extrair_wame(html: str, page) -> Optional[str]:
    """Extrai WhatsApp de links wa.me no HTML (mais confiável que regex em texto)."""
    try:
        for a in page.css("a[href*='wa.me'], a[href*='whatsapp.com']"):
            href = a.attrib.get("href", "")
            m = WAME_RE.search(href)
            if m:
                digits = re.sub(r"\D", "", m.group(0))
                if len(digits) >= 10:
                    return digits[-11:] if len(digits) > 11 else digits
    except Exception:
        pass
    m2 = WAME_RE.search(html)
    if m2:
        digits = re.sub(r"\D", "", m2.group(0))
        if len(digits) >= 10:
            return digits[-11:] if len(digits) > 11 else digits
    return None


def _extrair_redes_sociais(html: str) -> Dict[str, Optional[str]]:
    """Extrai links de redes sociais do HTML."""
    return {
        "linkedin_empresa": next(iter(LINKEDIN_CO_RE.findall(html)), None),
        "linkedin_perfis": list(dict.fromkeys(LINKEDIN_IN_RE.findall(html)))[:5],
        "instagram": next(iter(INSTAGRAM_RE.findall(html)), None),
        "facebook": next(iter(FACEBOOK_RE.findall(html)), None),
    }


def _scrapling_fetch(url: str) -> Optional[Any]:
    """Fetch síncrono via Scrapling com tratamento de erro."""
    if not SCRAPLING_AVAILABLE:
        return None
    try:
        page = Fetcher.get(url, timeout=30, stealthy_headers=True, follow_redirects=True)
        if page and page.status and page.status == 200:
            return page
    except Exception:
        pass
    return None


def _extrair_meta_tags(page) -> Dict[str, Optional[str]]:
    """Extrai dados de meta tags OG/Schema/description."""
    meta = {}
    try:
        og_desc = page.css('meta[property="og:description"]')
        if og_desc:
            meta["og_description"] = og_desc[0].attrib.get("content", "")

        og_title = page.css('meta[property="og:title"]')
        if og_title:
            meta["og_title"] = og_title[0].attrib.get("content", "")

        desc = page.css('meta[name="description"]')
        if desc:
            meta["meta_description"] = desc[0].attrib.get("content", "")

        keywords = page.css('meta[name="keywords"]')
        if keywords:
            meta["keywords"] = keywords[0].attrib.get("content", "")
    except Exception:
        pass
    return meta


def extrair_contatos_scrapling(url: str) -> Dict[str, Any]:
    """
    Navega na home + páginas de contato via Scrapling.
    Extrai email, telefone, WhatsApp, LinkedIn, Instagram, Facebook,
    meta tags e dados extras.

    Drop-in replacement para core_scraper.extrair_contatos_site().
    """
    contatos: Dict[str, Any] = {
        "site": url,
        "email": "",
        "telefone": "",
        "whatsapp": "",
        "linkedin_empresa": None,
        "linkedin_perfis": [],
        "instagram": None,
        "facebook": None,
        "meta_description": None,
        "og_description": None,
        "keywords": None,
        "cnpj_site": None,
    }

    if not SCRAPLING_AVAILABLE:
        return contatos

    base_url = url.rstrip("/")
    all_html = ""

    for caminho in CAMINHOS_CONTATO:
        target = base_url + caminho
        page = _scrapling_fetch(target)
        if not page:
            continue

        try:
            html = page.html_content if hasattr(page, "html_content") else str(page)
            texto = page.get_text() if hasattr(page, "get_text") else ""
            all_html += " " + html
        except Exception:
            continue

        # Email: mailto links primeiro, depois regex no HTML, depois no texto
        if not contatos["email"]:
            try:
                for a in page.css("a[href^='mailto:']"):
                    href = a.attrib.get("href", "")
                    email = href.replace("mailto:", "").split("?")[0].strip()
                    if _email_valido(email):
                        contatos["email"] = email
                        break
            except Exception:
                pass
        if not contatos["email"]:
            emails_html = [e for e in EMAIL_RE.findall(html) if _email_valido(e)]
            if emails_html:
                contatos["email"] = emails_html[0]
        if not contatos["email"]:
            emails_txt = [e for e in EMAIL_RE.findall(texto) if _email_valido(e)]
            if emails_txt:
                contatos["email"] = emails_txt[0]

        # WhatsApp via wa.me HREF
        if not contatos["whatsapp"]:
            wpp = _extrair_wame(html, page)
            if wpp:
                contatos["whatsapp"] = wpp

        # WhatsApp via regex no texto
        if not contatos["whatsapp"]:
            whats = WHATS_RE.findall(texto)
            if whats:
                contatos["whatsapp"] = re.sub(r"\D", "", whats[0])

        # Telefone fixo
        if not contatos["telefone"]:
            tels = PHONE_RE.findall(texto)
            if tels:
                contatos["telefone"] = tels[0]

        # Redes sociais (cumulativo: coleta de todas as paginas)
        redes = _extrair_redes_sociais(html)
        if redes["linkedin_empresa"] and not contatos["linkedin_empresa"]:
            contatos["linkedin_empresa"] = redes["linkedin_empresa"]
        for p in redes.get("linkedin_perfis", []):
            if p not in contatos["linkedin_perfis"]:
                contatos["linkedin_perfis"].append(p)
        if redes["instagram"] and not contatos["instagram"]:
            contatos["instagram"] = redes["instagram"]
        if redes["facebook"] and not contatos["facebook"]:
            contatos["facebook"] = redes["facebook"]

        # Links <a> com href para linkedin (captura links que regex perde)
        try:
            for a in page.css("a[href*='linkedin.com']"):
                href = a.attrib.get("href", "").split("?")[0].rstrip("/")
                if not href:
                    continue
                if "/company/" in href and not contatos["linkedin_empresa"]:
                    contatos["linkedin_empresa"] = href
                elif "/in/" in href and href not in contatos["linkedin_perfis"]:
                    contatos["linkedin_perfis"].append(href)
        except Exception:
            pass

        # Meta tags (só da home)
        if caminho == "" and not contatos.get("meta_description"):
            meta = _extrair_meta_tags(page)
            contatos.update({k: v for k, v in meta.items() if v})

        # CNPJ no site
        if not contatos["cnpj_site"]:
            cnpjs = CNPJ_RE.findall(texto)
            if cnpjs:
                contatos["cnpj_site"] = cnpjs[0]

        if contatos["email"] and contatos["whatsapp"] and contatos["linkedin_empresa"]:
            break

    return contatos


def enriquecer_empresa_scrapling(
    nome: str,
    site_url: Optional[str] = None,
    cidade: str = "",
    uf: str = "",
    cnpj: str = "",
    socios: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Enriquecimento completo de uma empresa via Scrapling.

    Se site_url vier preenchido, extrai contatos diretamente.
    Se não, tenta encontrar o site via busca (Google/Brave/DuckDuckGo)
    e depois extrai.

    Retorno compatível com _enriquecer_empresa_web() de main.py.
    """
    resultado: Dict[str, Any] = {
        "site": None,
        "email": None,
        "telefone": None,
        "whatsapp_publico": None,
        "outras_info": None,
        "redes_sociais_empresa": [],
        "resumo_ia_empresa": None,
        "linkedin_empresa": None,
        "instagram": None,
        "facebook": None,
        "meta_description": None,
        "cnpj_site": None,
    }

    if not SCRAPLING_AVAILABLE:
        return resultado

    url = site_url
    if url and str(url).strip().lower() in ("nan", "none", "null", "n/a", "-", ""):
        url = None
    if not url:
        url = _descobrir_site(nome, cidade, uf, cnpj)

    if not url:
        return resultado

    if not url.startswith("http"):
        url = "https://" + url

    contatos = extrair_contatos_scrapling(url)

    resultado["site"] = contatos.get("site") or url
    resultado["email"] = contatos.get("email") or None
    resultado["telefone"] = contatos.get("telefone") or None
    resultado["whatsapp_publico"] = contatos.get("whatsapp") or None
    resultado["linkedin_empresa"] = contatos.get("linkedin_empresa")
    resultado["instagram"] = contatos.get("instagram")
    resultado["facebook"] = contatos.get("facebook")
    resultado["meta_description"] = contatos.get("meta_description")
    resultado["cnpj_site"] = contatos.get("cnpj_site")

    # ── Busca ativa de LinkedIn da empresa via DuckDuckGo ──
    if not resultado["linkedin_empresa"]:
        try:
            li_co = _buscar_linkedin_empresa_ddgs(nome, cidade, uf)
            if li_co:
                resultado["linkedin_empresa"] = li_co
                print(f"[SCRAPLING] LinkedIn empresa encontrado via DDG: {li_co}")
        except Exception:
            pass

    # ── Busca ativa de LinkedIn dos socios via DuckDuckGo ──
    linkedin_perfis = list(contatos.get("linkedin_perfis", []))
    socios_linkedin: List[Dict[str, str]] = []
    if socios:
        for socio_nome in socios[:5]:
            if not socio_nome or len(socio_nome) < 4:
                continue
            already = any(
                socio_nome.lower().split()[0] in p.lower()
                for p in linkedin_perfis
            ) if linkedin_perfis else False
            if already:
                continue
            try:
                li_in = _buscar_linkedin_socio_ddgs(socio_nome, nome, cidade)
                if li_in and li_in not in linkedin_perfis:
                    linkedin_perfis.append(li_in)
                    socios_linkedin.append({"nome": socio_nome, "linkedin": li_in})
                    print(f"[SCRAPLING] LinkedIn sócio '{socio_nome}' encontrado: {li_in}")
            except Exception:
                pass
    resultado["linkedin_perfis"] = linkedin_perfis
    resultado["socios_linkedin"] = socios_linkedin

    # ── Busca ativa de email via DuckDuckGo quando nao encontrou no site ──
    if not resultado["email"]:
        try:
            from urllib.parse import urlparse
            dominio = urlparse(url).netloc.lower().replace("www.", "") if url else ""
            email_ddg = _buscar_email_via_ddgs(nome, dominio, cidade)
            if email_ddg:
                resultado["email"] = email_ddg
                print(f"[SCRAPLING] Email encontrado via DDG: {email_ddg}")
        except Exception:
            pass

    redes = []
    if resultado.get("linkedin_empresa"):
        redes.append(resultado["linkedin_empresa"])
    if contatos.get("instagram"):
        redes.append(contatos["instagram"])
    if contatos.get("facebook"):
        redes.append(contatos["facebook"])
    for p in linkedin_perfis:
        if p not in redes:
            redes.append(p)
    resultado["redes_sociais_empresa"] = redes

    partes_info: List[str] = []
    if redes:
        partes_info.append("Redes sociais: " + ", ".join(redes[:10]))
    if contatos.get("meta_description"):
        partes_info.append("Descrição: " + contatos["meta_description"][:300])
    if contatos.get("keywords"):
        partes_info.append("Keywords: " + contatos["keywords"][:200])
    if contatos.get("cnpj_site"):
        partes_info.append("CNPJ no site: " + contatos["cnpj_site"])

    if partes_info:
        resultado["outras_info"] = " | ".join(partes_info)

    return resultado


_DOMINIOS_DIRETORIO = {
    "cnpj.biz", "cnpj.info", "cnpj.in", "cnpja.com", "cnpj.today",
    "consultascnpj.com", "consultasocio.com", "casadosdados.com.br",
    "informecadastral.com.br", "cadastroempresa.com.br",
    "econodata.com.br", "speedio.com.br", "infoinvest.com.br",
    "aboutcompany.info", "procuroacho.com", "guiapj.com.br",
    "solutudo.com.br", "todosnegocios.com", "br.todosnegocios.com",
    "empresascnpj.com", "cnpjconsultas.com", "emfrente.com.br",
    "empresaqui.com", "dadosmarket.com.br", "cnpjja.com.br",
    "receitaws.com.br", "cnpjreceita.com.br", "consultacnpj.com",
    "empresas.wiki", "cnpj.services", "situacaocadastral.com.br",
    "findcnpj.com.br", "consultafacil.com.br", "brasilcnpj.com",
    "portalcnpj.com.br", "buscacnpj.com.br",
}

_DOMINIOS_SOCIAIS_E_GENERICOS = {
    "facebook.com", "instagram.com", "linkedin.com", "twitter.com",
    "youtube.com", "tiktok.com", "pinterest.com", "wikipedia.org",
    "x.com", "threads.net",
}

_DOMINIOS_IRRELEVANTES = {
    "gov.br", "jusbrasil.com.br", "reclameaqui.com.br",
    "academia.edu", "researchgate.net", "scielo.br",
    "merriam-webster.com", "glassdoor.com", "glassdoor.com.br",
    "indeed.com", "indeed.com.br", "catho.com.br", "vagas.com.br",
    "infojobs.com.br", "gupy.io", "trampos.co",
    "arquivosdeneuropsiquiatria.org", "abccardiol.org",
    "mestregeo.com.br",
}

_DOMINIOS_BANIDOS = _DOMINIOS_DIRETORIO | _DOMINIOS_SOCIAIS_E_GENERICOS | _DOMINIOS_IRRELEVANTES


def _eh_url_pdf_ou_doc(url: str) -> bool:
    path = url.lower().split("?")[0]
    return any(path.endswith(ext) for ext in (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip"))


def _pontuar_candidato(url: str, nome_empresa: str) -> int:
    """
    Pontua um URL candidato para priorizar sites oficiais.
    Maior pontuacao = melhor candidato.
    """
    from urllib.parse import urlparse
    parsed = urlparse(url)
    domain = parsed.netloc.lower().replace("www.", "")
    path = parsed.path.lower()
    score = 0

    if any(b in domain for b in _DOMINIOS_BANIDOS):
        return -100

    if _eh_url_pdf_ou_doc(url):
        return -50

    slug = nome_empresa.lower()
    slug = re.sub(r"\b(ltda|me|epp|eireli|s/?a|ss|slu|de|da|do|e|em)\b", "", slug)
    slug = re.sub(r"[^a-z0-9 ]", "", slug).strip()
    palavras = [p for p in slug.split() if len(p) >= 3]

    domain_parts = domain.replace("-", "").replace(".", " ")
    matches = sum(1 for p in palavras if p in domain_parts)
    score += matches * 30

    if domain.endswith(".com.br") or domain.endswith(".com"):
        score += 15

    parts_count = len(domain.split("."))
    if parts_count <= 3:
        score += 10

    if path in ("", "/", "/index.html", "/index.php"):
        score += 5
    if any(x in path for x in ("/contato", "/contact", "/sobre", "/about", "/fale-conosco")):
        score += 5

    if any(x in path for x in ("/cnpj/", "/consulta-cnpj/", "/consulta-empresa/", "/fornecedor/")):
        score -= 40

    return score


def _descobrir_site(nome: str, cidade: str, uf: str, cnpj: str) -> Optional[str]:
    """
    Busca o site oficial de uma empresa usando DuckDuckGo (sincrono).
    Faz 2 tentativas com queries diferentes e pontua os candidatos.
    """
    try:
        from ddgs import DDGS
    except ImportError:
        return None

    from urllib.parse import urlparse

    queries = [
        f'"{nome}" site oficial',
        f'"{nome}" {cidade} {uf} contato site',
    ]

    candidatos: List[tuple] = []

    for query in queries:
        try:
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=8):
                    url = r.get("href") or r.get("url") or r.get("link") or ""
                    if not url:
                        continue
                    domain = urlparse(url).netloc.lower().replace("www.", "")
                    if any(b in domain for b in _DOMINIOS_BANIDOS):
                        continue
                    if _eh_url_pdf_ou_doc(url):
                        continue
                    score = _pontuar_candidato(url, nome)
                    if score > -10:
                        candidatos.append((score, url))
        except Exception:
            continue

    if not candidatos:
        return None

    candidatos.sort(key=lambda x: x[0], reverse=True)
    melhor_score, melhor_url = candidatos[0]

    if melhor_score < 0:
        return None

    return melhor_url


def _buscar_linkedin_empresa_ddgs(nome: str, cidade: str = "", uf: str = "") -> Optional[str]:
    """Busca a Company Page do LinkedIn via DuckDuckGo."""
    try:
        from ddgs import DDGS
    except ImportError:
        return None

    queries = [
        f'site:linkedin.com/company "{nome}"',
        f'linkedin.com/company {nome} {cidade} {uf}'.strip(),
    ]
    for q in queries:
        try:
            with DDGS() as ddgs:
                for r in ddgs.text(q, max_results=5):
                    url = r.get("href") or r.get("url") or r.get("link") or ""
                    if "/company/" in url and "linkedin.com" in url:
                        return url.split("?")[0].rstrip("/")
        except Exception:
            continue
    return None


def _buscar_linkedin_socio_ddgs(nome_socio: str, nome_empresa: str = "", cidade: str = "") -> Optional[str]:
    """Busca o perfil LinkedIn pessoal de um socio via DuckDuckGo."""
    try:
        from ddgs import DDGS
    except ImportError:
        return None

    ctx = nome_empresa or cidade or ""
    queries = [
        f'site:linkedin.com/in "{nome_socio}" {ctx}'.strip(),
        f'linkedin.com/in {nome_socio} {ctx}'.strip(),
    ]
    for q in queries:
        try:
            with DDGS() as ddgs:
                for r in ddgs.text(q, max_results=5):
                    url = r.get("href") or r.get("url") or r.get("link") or ""
                    if "/in/" in url and "linkedin.com" in url:
                        clean = url.split("?")[0].rstrip("/")
                        if "/in/" in clean:
                            return clean
        except Exception:
            continue
    return None


def _buscar_email_via_ddgs(nome_empresa: str, dominio: str = "", cidade: str = "") -> Optional[str]:
    """Tenta descobrir email via DuckDuckGo quando nao encontrou no site."""
    try:
        from ddgs import DDGS
    except ImportError:
        return None

    queries = []
    if dominio:
        queries.append(f'"@{dominio}" contato email')
    queries.append(f'"{nome_empresa}" email contato {cidade}'.strip())

    for q in queries:
        try:
            with DDGS() as ddgs:
                for r in ddgs.text(q, max_results=5):
                    body = r.get("body") or r.get("snippet") or ""
                    title = r.get("title") or ""
                    text = body + " " + title
                    emails = [e for e in EMAIL_RE.findall(text) if _email_valido(e)]
                    if emails:
                        return emails[0]
        except Exception:
            continue
    return None


async def extrair_contatos_scrapling_async(url: str) -> Dict[str, Any]:
    """Wrapper async para extrair_contatos_scrapling (roda em thread pool)."""
    loop = asyncio.get_running_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return await loop.run_in_executor(pool, extrair_contatos_scrapling, url)


async def enriquecer_empresa_scrapling_async(
    nome: str,
    site_url: Optional[str] = None,
    cidade: str = "",
    uf: str = "",
    cnpj: str = "",
    socios: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Wrapper async para enriquecer_empresa_scrapling."""
    loop = asyncio.get_running_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return await loop.run_in_executor(
            pool,
            lambda: enriquecer_empresa_scrapling(nome, site_url, cidade, uf, cnpj, socios),
        )
