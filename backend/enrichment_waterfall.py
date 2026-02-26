"""
Módulo de Waterfall de Email — Cascata de Provedores
Estratégia: barato/grátis primeiro, pago apenas para leads HOT.

Camadas:
  1. OpenCNPJ (grátis) — email oficial da Receita
  2. Scraping HTML do site — já feito pelo core_scraper
  3. Hunter.io Domain Search (75 grátis/mês, depois ~$0.03/busca)
  4. Geração por padrão (nome + domínio) + verificação MX (grátis)
  5. Hunter.io Email Finder para cada sócio (nome + domínio)
  6. Snov.io Email Finder (pago, ~$0.02/email) — apenas leads HOT
"""
import os
import re
import asyncio
import logging
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ── Padrões de email corporativo mais comuns no Brasil ─────────────────────
_PADROES = [
    "{first}.{last}",
    "{first}",
    "{first}{last_initial}",
    "{first_initial}{last}",
    "{first_initial}.{last}",
    "{last}",
    "contato",
    "comercial",
    "vendas",
    "financeiro",
]

# Domínios que indicam email genérico/diretório (não vale usar)
_DOMINIOS_GENERICOS = {
    "gmail.com", "hotmail.com", "yahoo.com", "outlook.com",
    "uol.com.br", "terra.com.br", "bol.com.br", "ig.com.br",
    "live.com", "icloud.com",
}


def _extrair_dominio(site: str) -> Optional[str]:
    if not site:
        return None
    site = site.lower().strip()
    if not site.startswith("http"):
        site = "https://" + site
    try:
        from urllib.parse import urlparse
        parsed = urlparse(site)
        host = parsed.netloc.replace("www.", "").split(":")[0]
        return host if "." in host else None
    except Exception:
        return None


def _nome_para_partes(nome: str):
    """Retorna (primeiro, ultimo, inicial_primeiro, inicial_ultimo)."""
    nome_limpo = re.sub(r"\(.*?\)", "", nome).strip()
    nome_limpo = re.sub(
        r"\b(SOCIO|ADMINISTRADOR|DIRETOR|LTDA|ME|SA|EPP)\b",
        "",
        nome_limpo,
        flags=re.IGNORECASE,
    ).strip()
    partes = [p.lower() for p in nome_limpo.split() if len(p) > 1]
    if not partes:
        return None, None, None, None
    primeiro = partes[0]
    ultimo = partes[-1]
    return primeiro, ultimo, primeiro[0], ultimo[0]


def _gerar_emails_padrao(nome: str, dominio: str) -> List[str]:
    primeiro, ultimo, fi, li = _nome_para_partes(nome)
    if not primeiro or not dominio:
        return []
    mapa = {
        "{first}": primeiro,
        "{last}": ultimo,
        "{first_initial}": fi,
        "{last_initial}": li,
        "{first}.{last}": f"{primeiro}.{ultimo}",
        "{first_initial}{last}": f"{fi}{ultimo}",
        "{first_initial}.{last}": f"{fi}.{ultimo}",
        "{first}{last_initial}": f"{primeiro}{li}",
        "contato": "contato",
        "comercial": "comercial",
        "vendas": "vendas",
        "financeiro": "financeiro",
    }
    emails = []
    for padrao in _PADROES:
        parte_local = mapa.get(padrao, padrao)
        email = f"{parte_local}@{dominio}"
        if email not in emails:
            emails.append(email)
    return emails


async def verificar_mx(dominio: str) -> bool:
    """Verifica se o domínio tem registro MX válido (grátis, via DNS)."""
    try:
        import dns.resolver  # dnspython
        loop = asyncio.get_event_loop()
        registros = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(dominio, "MX")
        )
        return bool(registros)
    except Exception:
        return False


async def _hunter_domain_search(dominio: str) -> List[Dict]:
    """
    Hunter.io Domain Search — retorna emails encontrados para o domínio.
    75 buscas/mês grátis. Chave via HUNTER_API_KEY.
    """
    key = os.getenv("HUNTER_API_KEY", "")
    if not key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.hunter.io/v2/domain-search",
                params={"domain": dominio, "api_key": key, "limit": 5},
            )
            if resp.status_code == 200:
                return resp.json().get("data", {}).get("emails", [])
    except Exception:
        pass
    return []


async def _hunter_email_finder(
    primeiro_nome: str, sobrenome: str, dominio: str
) -> Optional[Dict]:
    """
    Hunter.io Email Finder — descobre email de uma pessoa específica.
    Custa 1 crédito (25 grátis/mês).
    """
    key = os.getenv("HUNTER_API_KEY", "")
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.hunter.io/v2/email-finder",
                params={
                    "domain": dominio,
                    "first_name": primeiro_nome,
                    "last_name": sobrenome,
                    "api_key": key,
                },
            )
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                if data.get("email") and (data.get("confidence") or 0) >= 40:
                    return {
                        "email": data["email"],
                        "confianca": data["confidence"],
                        "fonte": "Hunter Email Finder",
                    }
    except Exception:
        pass
    return None


async def _snovio_email_finder(
    primeiro_nome: str, sobrenome: str, dominio: str
) -> Optional[Dict]:
    """
    Snov.io Email Finder — alternativa ao Hunter para leads HOT.
    Requer SNOVIO_USER_ID e SNOVIO_SECRET para obter access_token.
    """
    user_id = os.getenv("SNOVIO_USER_ID", "")
    secret = os.getenv("SNOVIO_SECRET", "")
    if not user_id or not secret:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Obtem token
            token_resp = await client.post(
                "https://api.snov.io/v1/oauth/access_token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": user_id,
                    "client_secret": secret,
                },
            )
            if token_resp.status_code != 200:
                return None
            token = token_resp.json().get("access_token", "")

            # Busca email
            find_resp = await client.post(
                "https://api.snov.io/v1/get-emails-from-names",
                data={
                    "access_token": token,
                    "firstName": primeiro_nome,
                    "lastName": sobrenome,
                    "domain": dominio,
                },
            )
            if find_resp.status_code == 200:
                resultado = find_resp.json()
                emails = resultado.get("data", {}).get("emails", [])
                if emails:
                    return {
                        "email": emails[0].get("email"),
                        "confianca": emails[0].get("emailQuality", 50),
                        "fonte": "Snov.io",
                    }
    except Exception:
        pass
    return None


async def waterfall_email_empresa(
    site: str,
    email_html: Optional[str] = None,
    email_receita: Optional[str] = None,
) -> Dict:
    """
    Waterfall para email corporativo (não pessoal).
    Retorna o melhor email encontrado + fonte + confiança.
    """
    # ── Camada 1: Receita Federal (OpenCNPJ) ─────────────────────────────
    if email_receita and "@" in email_receita:
        dominio_rec = email_receita.split("@")[1]
        if dominio_rec not in _DOMINIOS_GENERICOS:
            return {"email": email_receita, "fonte": "Receita Federal", "confianca": 90}

    # ── Camada 2: Scraping HTML (já feito pelo caller) ───────────────────
    if email_html and "@" in email_html:
        dominio_html = email_html.split("@")[1]
        if dominio_html not in _DOMINIOS_GENERICOS:
            return {"email": email_html, "fonte": "Scraping HTML", "confianca": 80}

    # ── Camada 3: Hunter Domain Search ───────────────────────────────────
    dominio = _extrair_dominio(site)
    if dominio and dominio not in _DOMINIOS_GENERICOS:
        hunter_emails = await _hunter_domain_search(dominio)
        if hunter_emails:
            melhor = max(hunter_emails, key=lambda e: e.get("confidence", 0))
            if (melhor.get("confidence") or 0) >= 50:
                return {
                    "email": melhor["value"],
                    "fonte": "Hunter Domain Search",
                    "confianca": melhor["confidence"],
                }

    return {"email": None, "fonte": None, "confianca": 0}


async def waterfall_email_socio(
    nome_socio: str,
    site_empresa: Optional[str] = None,
    empresa_nome: Optional[str] = None,
    usar_snov: bool = False,
) -> Dict:
    """
    Waterfall para email do sócio/decisor específico.
    Retorna o melhor email encontrado + fonte.
    """
    dominio = _extrair_dominio(site_empresa)
    if not dominio or dominio in _DOMINIOS_GENERICOS:
        return {"email_socio": None, "fonte": None}

    primeiro, ultimo, _, _ = _nome_para_partes(nome_socio)
    if not primeiro:
        return {"email_socio": None, "fonte": None}

    # ── Camada 1: Hunter Email Finder ────────────────────────────────────
    hunter = await _hunter_email_finder(primeiro, ultimo, dominio)
    if hunter and hunter.get("email"):
        return {"email_socio": hunter["email"], "fonte": hunter["fonte"], "confianca": hunter["confianca"]}

    # ── Camada 2: Geração por padrão + verificação MX ────────────────────
    if await verificar_mx(dominio):
        emails = _gerar_emails_padrao(nome_socio, dominio)
        # Retorna o padrão mais provável com aviso de "inferido"
        if emails:
            return {
                "email_socio": emails[0],
                "fonte": "Padrão inferido (MX validado)",
                "confianca": 55,
                "emails_alternativos": emails[1:4],
            }

    # ── Camada 3: Snov.io (apenas se habilitado) ─────────────────────────
    if usar_snov:
        snov = await _snovio_email_finder(primeiro, ultimo, dominio)
        if snov and snov.get("email"):
            return {"email_socio": snov["email"], "fonte": snov["fonte"], "confianca": snov["confianca"]}

    # ── Camada 4: Google snippet mining ──────────────────────────────────
    if empresa_nome:
        try:
            from core_scraper import buscar_google
            query = f'"{nome_socio}" "{empresa_nome}" email'
            resultados = await buscar_google(query, num_results=3)
            for r in resultados:
                snippet = r.get("descricao", "")
                emails_snippet = re.findall(
                    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", snippet
                )
                for e in emails_snippet:
                    if dominio in e:
                        return {
                            "email_socio": e,
                            "fonte": "Google Snippet",
                            "confianca": 70,
                        }
        except Exception:
            pass

    return {"email_socio": None, "fonte": None, "confianca": 0}


async def enriquecer_emails_completo(
    cnpj: str,
    razao_social: str,
    site: Optional[str],
    socios: List[str],
    email_html: Optional[str] = None,
    email_receita: Optional[str] = None,
    score_icp: float = 0.0,
) -> Dict:
    """
    Ponto de entrada principal.
    Executa waterfall para empresa e para cada sócio em paralelo.
    Proxycurl só para leads HOT (score >= 70).
    """
    tarefas = {
        "empresa": waterfall_email_empresa(site, email_html, email_receita),
    }

    # Email dos sócios (top 2)
    for idx, socio in enumerate(socios[:2]):
        tarefas[f"socio_{idx}"] = waterfall_email_socio(
            socio, site, razao_social, usar_snov=(score_icp >= 80)
        )

    resultados = {}
    chaves = list(tarefas.keys())
    valores = await asyncio.gather(*tarefas.values(), return_exceptions=True)
    for k, v in zip(chaves, valores):
        if not isinstance(v, Exception):
            resultados[k] = v

    return resultados
