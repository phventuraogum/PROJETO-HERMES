"""
Módulo de Mining de Instagram Business e Link-in-Bio
Extrai WhatsApp, email e telefone de perfis Instagram e páginas Linktree.

Fontes suportadas:
  - Instagram Business (via Google snippet + HTML da página)
  - Linktree (linktr.ee)
  - Bio.link
  - Beacons.ai
  - Solo.to
  - Milksha.ke
  - Taplink.cc
"""
import re
import asyncio
import logging
from typing import Dict, List, Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── Domínios de link-in-bio ───────────────────────────────────────────────
_LINKINBIO_DOMAINS = [
    "linktr.ee",
    "bio.link",
    "beacons.ai",
    "solo.to",
    "milksha.ke",
    "taplink.cc",
    "linkin.bio",
    "campsite.bio",
]

_WA_PATTERNS = [
    re.compile(r"wa\.me/(\d{10,15})"),
    re.compile(r"api\.whatsapp\.com/send\?phone=(\d{10,15})"),
    re.compile(r"whatsapp://send\?phone=(\d{10,15})"),
    re.compile(r"55\s?\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}"),
]
_EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_TELEFONE_PATTERN = re.compile(r"\(?\d{2}\)?\s?\d{4,5}-?\d{4}")

# User-Agent mobile para simular app Instagram
_HEADERS_MOBILE = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


try:
    from api.validation_service import normalizar_whatsapp_br as _norm_wpp
except ImportError:
    def _norm_wpp(n):
        d = re.sub(r"[^\d]", "", str(n or ""))
        if d.startswith("0"): d = d[1:]
        if d.startswith("55") and len(d) >= 12: d = d[2:]
        if len(d) == 11 and d[2] == "9": return "55" + d
        return None


def _extrair_whatsapp(texto: str) -> Optional[str]:
    for p in _WA_PATTERNS:
        m = p.search(texto)
        if m:
            numero = re.sub(r"[^\d]", "", m.group(0))
            norm = _norm_wpp(numero)
            if norm:
                return norm
    return None


def _limpar_url(url: str) -> str:
    """Garante que a URL tem scheme."""
    if url and not url.startswith("http"):
        return "https://" + url
    return url


async def _scrape_url(url: str, timeout: float = 10.0) -> Optional[str]:
    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            verify=False,
        ) as client:
            resp = await client.get(_limpar_url(url), headers=_HEADERS_MOBILE)
            if resp.status_code == 200:
                return resp.text
    except Exception:
        pass
    return None


# =============================================================================
# INSTAGRAM MINING
# =============================================================================

async def buscar_perfil_instagram(empresa_nome: str) -> Optional[str]:
    """
    Usa Google para encontrar o perfil Instagram da empresa.
    Retorna a URL do perfil ou None.
    """
    try:
        from core_scraper import buscar_google
        query = f'site:instagram.com "{empresa_nome}" -"/p/" -"/reel/" -"/explore/"'
        resultados = await buscar_google(query, num_results=4)
        for r in resultados:
            url = r.get("link", "")
            if (
                "instagram.com/" in url
                and "/p/" not in url
                and "/reel/" not in url
                and "/explore/" not in url
            ):
                return url
    except Exception:
        pass
    return None


async def extrair_dados_instagram(url_perfil: str) -> Dict:
    """
    Extrai WhatsApp, email e telefone da página de perfil Instagram.
    Tenta múltiplos métodos de extração.
    """
    dados: Dict = {
        "instagram_url": url_perfil,
        "whatsapp_instagram": None,
        "email_instagram": None,
        "telefone_instagram": None,
        "instagram_seguidores": None,
    }

    html = await _scrape_url(url_perfil)
    if not html:
        return dados

    # ── Método 1: JSON embutido no <script> ──────────────────────────────
    # Instagram injeta dados estruturados como window.__additionalDataLoaded
    m_email = re.search(r'"email"\s*:\s*"([^"@]+@[^"]+)"', html)
    if m_email:
        dados["email_instagram"] = m_email.group(1)

    m_phone = re.search(r'"public_phone_number"\s*:\s*"([^"]+)"', html)
    if m_phone:
        dados["telefone_instagram"] = m_phone.group(1)

    m_followers = re.search(
        r'"edge_followed_by"\s*:\s*\{"count"\s*:\s*(\d+)\}', html
    )
    if m_followers:
        dados["instagram_seguidores"] = int(m_followers.group(1))

    # ── Método 2: wa.me em qualquer lugar do HTML ────────────────────────
    wa = _extrair_whatsapp(html)
    if wa:
        dados["whatsapp_instagram"] = wa

    # ── Método 3: BeautifulSoup para links externos na bio ───────────────
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "wa.me" in href or "api.whatsapp.com" in href:
            wa2 = _extrair_whatsapp(href)
            if wa2:
                dados["whatsapp_instagram"] = wa2
                break
        if any(d in href for d in _LINKINBIO_DOMAINS):
            # Acha link-in-bio dentro do Instagram e scrapa também
            linkinbio = await extrair_dados_linkinbio(href)
            if linkinbio.get("whatsapp_linkinbio"):
                dados["whatsapp_instagram"] = dados["whatsapp_instagram"] or linkinbio["whatsapp_linkinbio"]
            if linkinbio.get("email_linkinbio"):
                dados["email_instagram"] = dados["email_instagram"] or linkinbio["email_linkinbio"]

    return dados


# =============================================================================
# LINK-IN-BIO MINING
# =============================================================================

async def encontrar_linkinbio(empresa_nome: str) -> Optional[str]:
    """
    Busca páginas Linktree/Bio.link da empresa via Google.
    """
    try:
        from core_scraper import buscar_google
        query_parts = " OR ".join([f'site:{d}' for d in _LINKINBIO_DOMAINS])
        query = f'({query_parts}) "{empresa_nome}"'
        resultados = await buscar_google(query, num_results=4)
        for r in resultados:
            url = r.get("link", "")
            if any(d in url for d in _LINKINBIO_DOMAINS):
                return url
    except Exception:
        pass
    return None


async def extrair_dados_linkinbio(url: str) -> Dict:
    """
    Extrai contatos de página de link-in-bio.
    Estas páginas concentram WhatsApp, email e Telegram em um só lugar.
    """
    dados: Dict = {
        "linkinbio_url": url,
        "whatsapp_linkinbio": None,
        "email_linkinbio": None,
        "telefone_linkinbio": None,
        "telegram_linkinbio": None,
    }

    html = await _scrape_url(url, timeout=25.0)
    if not html:
        return dados

    # WhatsApp
    wa = _extrair_whatsapp(html)
    if wa:
        dados["whatsapp_linkinbio"] = wa

    # Email
    emails = _EMAIL_PATTERN.findall(html)
    emails_validos = [
        e for e in emails
        if not any(
            skip in e.lower()
            for skip in ["@sentry", "@example", "noreply", "no-reply",
                         "@linktree", "@beacons", "@bio.link"]
        )
    ]
    if emails_validos:
        dados["email_linkinbio"] = emails_validos[0]

    # Telegram
    tg = re.search(r"t\.me/([\w]+)", html)
    if tg:
        dados["telegram_linkinbio"] = f"https://t.me/{tg.group(1)}"

    # Telefone
    tels = _TELEFONE_PATTERN.findall(html)
    if tels:
        dados["telefone_linkinbio"] = tels[0]

    return dados


# =============================================================================
# PONTO DE ENTRADA PRINCIPAL
# =============================================================================

async def mining_instagram_linkinbio(
    empresa_nome: str,
    site: Optional[str] = None,
) -> Dict:
    """
    Executa mining completo de Instagram + Link-in-bio em paralelo.
    Retorna dicionário consolidado com todos os contatos encontrados.
    """
    resultado: Dict = {
        "instagram_url": None,
        "whatsapp_instagram": None,
        "email_instagram": None,
        "telefone_instagram": None,
        "instagram_seguidores": None,
        "linkinbio_url": None,
        "whatsapp_linkinbio": None,
        "email_linkinbio": None,
        "telegram": None,
    }

    # Busca Instagram e Linktree em paralelo
    tarefas = await asyncio.gather(
        buscar_perfil_instagram(empresa_nome),
        encontrar_linkinbio(empresa_nome),
        return_exceptions=True,
    )

    ig_url = tarefas[0] if not isinstance(tarefas[0], Exception) else None
    lb_url = tarefas[1] if not isinstance(tarefas[1], Exception) else None

    # Scraping em paralelo
    scraping = []
    if ig_url:
        scraping.append(extrair_dados_instagram(ig_url))
    if lb_url:
        scraping.append(extrair_dados_linkinbio(lb_url))

    if scraping:
        resultados_scraping = await asyncio.gather(*scraping, return_exceptions=True)

        for r in resultados_scraping:
            if isinstance(r, Exception) or not isinstance(r, dict):
                continue
            if r.get("instagram_url"):
                resultado["instagram_url"] = r.get("instagram_url")
                resultado["instagram_seguidores"] = r.get("instagram_seguidores")
                resultado["whatsapp_instagram"] = resultado["whatsapp_instagram"] or r.get("whatsapp_instagram")
                resultado["email_instagram"] = resultado["email_instagram"] or r.get("email_instagram")
                resultado["telefone_instagram"] = resultado["telefone_instagram"] or r.get("telefone_instagram")
            if r.get("linkinbio_url"):
                resultado["linkinbio_url"] = r.get("linkinbio_url")
                resultado["whatsapp_linkinbio"] = resultado["whatsapp_linkinbio"] or r.get("whatsapp_linkinbio")
                resultado["email_linkinbio"] = resultado["email_linkinbio"] or r.get("email_linkinbio")
                resultado["telegram"] = resultado["telegram"] or r.get("telegram_linkinbio")

    return resultado
