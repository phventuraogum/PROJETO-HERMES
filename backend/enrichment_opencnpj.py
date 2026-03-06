"""
Módulo de Enriquecimento via OpenCNPJ API
Gratuito, sem autenticação, 50 req/s — dados diretos da Receita Federal.
Retorna: email, telefones, sócios completos (QSA), nome fantasia.
"""
import re
import asyncio
import httpx
from typing import Dict, List, Optional

# Endpoints (com fallback)
_OPENCNPJ_URL  = "https://api.opencnpj.org"
_BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1"
_CNPJWS_URL    = "https://publica.cnpj.ws/cnpj"

_TIMEOUT = 8.0


def _limpar_cnpj(cnpj: str) -> str:
    return re.sub(r"[^\d]", "", cnpj or "")


def _formatar_telefone(ddd: str, numero: str) -> str:
    d = (ddd or "").strip()
    n = (numero or "").strip()
    if d and n:
        return f"({d}) {n}"
    return n or d


async def _fetch_cnpj_raw(cnpj_limpo: str) -> Optional[Dict]:
    """
    Tenta 3 APIs públicas em cascata:
      1. api.opencnpj.org
      2. brasilapi.com.br
      3. publica.cnpj.ws
    """
    urls = [
        f"{_OPENCNPJ_URL}/{cnpj_limpo}",
        f"{_BRASILAPI_URL}/{cnpj_limpo}",
        f"{_CNPJWS_URL}/{cnpj_limpo}",
    ]
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        for url in urls:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    if data and isinstance(data, dict) and not data.get("message"):
                        return data
            except Exception:
                continue
    return None


async def consultar_opencnpj(cnpj: str) -> Dict:
    """
    Consulta dados da Receita Federal com 3 APIs em fallback.
    Nunca lança exceção — retorna {} em caso de falha total.
    """
    cnpj_limpo = _limpar_cnpj(cnpj)
    if len(cnpj_limpo) != 14:
        return {}

    data = await _fetch_cnpj_raw(cnpj_limpo)
    if not data:
        return {}

    # ── Email ──────────────────────────────────────────────────────────────
    email_receita = (data.get("email") or "").strip().lower()

    # ── Telefones ──────────────────────────────────────────────────────────
    telefones: List[str] = []
    for tel in data.get("telefones") or []:
        numero = _formatar_telefone(tel.get("ddd"), tel.get("numero"))
        if numero and numero not in telefones:
            telefones.append(numero)

    # ── QSA (sócios) ────────────────────────────────────────────────────────
    socios: List[Dict] = []
    for s in data.get("qsa") or []:
        socios.append(
            {
                "nome": (s.get("nome_socio") or "").strip().title(),
                "cpf_cnpj": _limpar_cnpj(s.get("cnpj_cpf_do_socio") or ""),
                "qualificacao": (s.get("qualificacao_socio") or {}).get("descricao", ""),
                "faixa_etaria": s.get("faixa_etaria"),
            }
        )

    # ── Outros dados úteis ─────────────────────────────────────────────────
    nome_fantasia = (data.get("nome_fantasia") or "").strip().title() or None
    situacao = (data.get("descricao_situacao_cadastral") or "").strip()
    data_abertura = data.get("data_inicio_atividade")
    porte = (data.get("porte") or {}).get("descricao", "")
    cnae_descricao = (data.get("cnae_fiscal_descricao") or "").strip()

    logradouro    = (data.get("logradouro") or "").strip()
    numero        = (data.get("numero") or "").strip()
    complemento   = (data.get("complemento") or "").strip()
    bairro        = (data.get("bairro") or "").strip()
    municipio     = (data.get("municipio") or "").strip().upper()
    uf            = (data.get("uf") or "").strip().upper()
    cep           = re.sub(r"[^\d]", "", data.get("cep") or "")
    razao_social  = (data.get("razao_social") or "").strip().upper()
    capital_social = data.get("capital_social") or 0

    return {
        "email":               email_receita or None,   # alias amigável
        "email_receita":       email_receita or None,
        "telefone":            telefones[0] if telefones else None,
        "telefones_receita":   telefones,
        "socios_qsa":          socios,
        "nome_fantasia":       nome_fantasia,
        "nome_fantasia_receita": nome_fantasia,
        "razao_social":        razao_social or None,
        "situacao_cadastral":  situacao,
        "data_abertura":       data_abertura,
        "porte":               porte,
        "porte_receita":       porte,
        "cnae_descricao":      cnae_descricao,
        "logradouro":          logradouro or None,
        "numero":              numero or None,
        "complemento":         complemento or None,
        "bairro":              bairro or None,
        "municipio":           municipio or None,
        "uf":                  uf or None,
        "cep":                 cep or None,
        "capital_social":      capital_social,
    }


async def enriquecer_lote_opencnpj(
    cnpjs: List[str],
    max_concurrent: int = 10,
) -> Dict[str, Dict]:
    """
    Enriquece múltiplos CNPJs em paralelo (respeita limite de concorrência).
    Retorna mapa cnpj → dados.
    """
    sem = asyncio.Semaphore(max_concurrent)

    async def _uma(cnpj: str):
        async with sem:
            return cnpj, await consultar_opencnpj(cnpj)

    pares = await asyncio.gather(*[_uma(c) for c in cnpjs], return_exceptions=True)
    resultado = {}
    for item in pares:
        if isinstance(item, BaseException):
            continue
        cnpj, dados = item
        if isinstance(dados, dict):
            resultado[cnpj] = dados
    return resultado
