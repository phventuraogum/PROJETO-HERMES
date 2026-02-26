"""
Módulo de Ultra-Enriquecimento de Contatos
Estratégias avançadas para captura de dados acionáveis

v2.0 — Melhorias:
  - Email de sócio via waterfall (Hunter → Padrão+MX → Google)
  - Proxycurl para leads HOT (score >= 70)
  - Instagram Business e Linktree delegados ao enrichment_instagram
"""
import re
import asyncio
import httpx
from typing import Dict, Optional, List
from bs4 import BeautifulSoup

# =================================================================
# 1. GOOGLE MY BUSINESS SCRAPER
# =================================================================
async def buscar_google_my_business(empresa_nome: str, cidade: str = "") -> Dict[str, str]:
    """
    Busca dados do Google My Business (telefone, WhatsApp, site).
    """
    from core_scraper import buscar_google
    
    query = f'"{empresa_nome}" {cidade} google maps'
    resultados = await buscar_google(query, num_results=3)
    
    dados_gmb = {"telefone_gmb": "", "whatsapp_gmb": "", "site_gmb": ""}
    
    for r in resultados:
        if "google.com/maps" in r.get("link", ""):
            snippet = r.get("descricao", "")
            # Regex para telefone
            tel_match = re.search(r'\(?\d{2}\)?\s?\d{4,5}-?\d{4}', snippet)
            if tel_match:
                dados_gmb["telefone_gmb"] = tel_match.group()
            # Link do GMB
            dados_gmb["site_gmb"] = r["link"]
            break
    
    return dados_gmb


# =================================================================
# 2. INSTAGRAM BIO PARSER
# =================================================================
async def buscar_instagram_contato(empresa_nome: str) -> Dict[str, str]:
    """
    Busca perfil do Instagram e extrai contato da bio.
    """
    from core_scraper import buscar_google
    
    query = f'site:instagram.com "{empresa_nome}"'
    resultados = await buscar_google(query, num_results=2)
    
    dados_ig = {"instagram_perfil": "", "instagram_email": "", "instagram_whats": ""}
    
    for r in resultados:
        link = r.get("link", "")
        if "instagram.com/" in link and "/p/" not in link:  # Perfil, não post
            dados_ig["instagram_perfil"] = link
            snippet = r.get("descricao", "")
            
            # E-mail na bio
            email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', snippet)
            if email_match:
                dados_ig["instagram_email"] = email_match.group()
            
            # WhatsApp na bio (link wa.me)
            whats_match = re.search(r'wa\.me/(\d+)', snippet)
            if whats_match:
                dados_ig["instagram_whats"] = whats_match.group(1)
            
            break
    
    return dados_ig


# =================================================================
# 3. EMAIL PATTERN GENERATOR (mantido para compatibilidade)
# =================================================================
def gerar_emails_provaveis(socios: List[str], dominio: str) -> List[Dict[str, str]]:
    """
    Gera e-mails prováveis para sócios baseado em padrões comuns.
    Retorna lista de e-mails com probabilidade estimada.
    Use enrichment_waterfall.waterfall_email_socio() para versão com
    verificação MX + Hunter.io.
    """
    if not dominio or not socios:
        return []

    dominio_limpo = dominio.replace("www.", "").replace("http://", "").replace("https://", "").split("/")[0]
    emails_gerados = []

    for socio in socios[:2]:
        nome_limpo = re.sub(r"\(.*?\)", "", socio).strip()
        nome_limpo = re.sub(
            r"\b(SOCIO|ADMINISTRADOR|DIRETOR)\b", "", nome_limpo, flags=re.IGNORECASE
        ).strip()

        partes = nome_limpo.lower().split()
        if len(partes) < 2:
            continue

        primeiro_nome = partes[0]
        ultimo_nome = partes[-1]

        padroes = [
            f"{primeiro_nome}.{ultimo_nome}@{dominio_limpo}",
            f"{primeiro_nome}@{dominio_limpo}",
            f"{primeiro_nome[0]}{ultimo_nome}@{dominio_limpo}",
            f"{primeiro_nome}{ultimo_nome[0]}@{dominio_limpo}",
        ]
        for email in padroes:
            emails_gerados.append({
                "email": email,
                "socio": socio,
                "probabilidade": "MEDIA",
            })

    return emails_gerados


# =================================================================
# 4. WAYBACK MACHINE - E-MAILS HISTÓRICOS
# =================================================================
async def buscar_emails_wayback(dominio: str) -> List[str]:
    """Busca e-mails em versões antigas do site via Wayback Machine."""
    if not dominio:
        return []

    dominio_limpo = dominio.replace("www.", "").replace("http://", "").replace("https://", "").split("/")[0]
    wayback_url = f"https://web.archive.org/web/2024*/https://{dominio_limpo}/contato"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(wayback_url, follow_redirects=True)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                texto = soup.get_text()
                emails = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", texto)
                return list(set(emails))[:3]
    except Exception:
        pass

    return []


# =================================================================
# 5. ENRIQUECIMENTO DE SÓCIOS VIA WATERFALL  (NOVO)
# =================================================================
async def enriquecer_socios_waterfall(
    socios: List[str],
    site_empresa: Optional[str],
    empresa_nome: str,
    score_icp: float = 0.0,
) -> List[Dict]:
    """
    Para cada sócio, executa waterfall de email (Hunter → Padrão+MX → Google)
    e Proxycurl para leads HOT.
    Retorna lista com dados enriquecidos de cada sócio.
    """
    try:
        from enrichment_waterfall import waterfall_email_socio
    except ImportError:
        return []

    resultados = []
    for socio in (socios or [])[:3]:
        dados = {"nome": socio}
        email_data = await waterfall_email_socio(
            nome_socio=socio,
            site_empresa=site_empresa,
            empresa_nome=empresa_nome,
            usar_snov=(score_icp >= 80),
        )
        dados.update(email_data)
        resultados.append(dados)

    return resultados


# =================================================================
# 6. REGISTRO.BR WHOIS  (NOVO — para todos os .com.br)
# =================================================================
async def consultar_registrobr_whois(dominio: str) -> Dict:
    """
    Consulta WHOIS do Registro.br para domínios .com.br.
    Retorna proprietário, email do proprietário e responsável técnico.
    """
    dominio_limpo = dominio.replace("www.", "").split("/")[0].lower()
    if not dominio_limpo.endswith(".br"):
        return {}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://rdap.registro.br/domain/{dominio_limpo}",
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                entidades = data.get("entities", [])
                resultado: Dict = {}
                for ent in entidades:
                    roles = ent.get("roles", [])
                    vcards = (ent.get("vcardArray") or [None, []])[1]
                    email_ent = next(
                        (v[3] for v in vcards if isinstance(v, list) and v[0] == "email"),
                        None,
                    )
                    nome_ent = next(
                        (v[3] for v in vcards if isinstance(v, list) and v[0] == "fn"),
                        None,
                    )
                    if "registrant" in roles:
                        resultado["proprietario"] = nome_ent
                        resultado["email_proprietario"] = email_ent
                    elif "technical" in roles:
                        resultado["responsavel_tecnico"] = nome_ent
                return resultado
    except Exception:
        pass
    return {}
