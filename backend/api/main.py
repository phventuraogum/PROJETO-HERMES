from typing import Any, Dict, List, Optional

# Alias para compatibilidade com código legado — usa as_opt_str que trata NaN
_as_opt_str = as_opt_str
import re
import math
import os
import json
from urllib.parse import urlparse

import duckdb  # type: ignore
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field, ConfigDict

from api.db_pool import get_connection, healthcheck as db_healthcheck
from api.cache_service import cache_service
from middleware.auth import require_auth
from api.utils import (
    digits,
    formatar_telefone,
    as_opt_str,
    montar_contexto_sidra,
    mapear_porte,
    classificar_segmento_por_cnae,
    classificar_subsegmento_por_cnae_e_nome,
    calcular_score_icp_legado as calcular_score_icp
)

try:
    from redis import Redis
    from rq import Queue
except ImportError:
    Redis = None  # type: ignore
    Queue = None  # type: ignore

# ===== IMPORTS PARA ENRIQUECIMENTO WEB ============================
import httpx
try:
    from bs4 import BeautifulSoup  # type: ignore
except ImportError:
    BeautifulSoup = None  # type: ignore

try:
    from ddgs import DDGS  # type: ignore
except ImportError:
    DDGS = None
# ==================================================================

from dotenv import load_dotenv

load_dotenv()

# ==========================================================
# CONFIGURAÇÃO BÁSICA
# ==========================================================

DB_PATH = os.getenv("HERMES_DUCKDB_PATH", "/data/cnpj.duckdb")

_is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
app = FastAPI(
    title="Projeto Hermes - API de Prospecção B2B",
    version="1.5.1",
    description="Backend do Projeto Hermes, consultando a base da Receita (DuckDB) + SIDRA + Sócios + Enriquecimento Web + IA.",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)

REDIS_URL = os.getenv("REDIS_URL", "").strip()

def _enqueue_enrichment(cnpjs: List[str]) -> None:
    """
    Enfileira enriquecimento no Redis (fire-and-forget).
    Se REDIS_URL não estiver configurado, não faz nada.
    """
    if not REDIS_URL or Redis is None or Queue is None:
        return

    try:
        conn = Redis.from_url(REDIS_URL)
        q = Queue("hermes", connection=conn)
        for cnpj in cnpjs:
            q.enqueue("api.jobs.enrich_company_by_cnpj", cnpj, job_timeout=120)
    except Exception as e:
        print("[ENRIQUECIMENTO] falha ao enfileirar no Redis:", repr(e))

_cors_env = os.getenv("CORS_ORIGINS", "")
_dev_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
origins: list[str] = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else _dev_origins
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Org-Id", "X-API-Key"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# ==========================================================
# MULTI-TENANT + CRÉDITOS (em memória; depois migrar para DB)
# ==========================================================

# org_id -> saldo de créditos (1 crédito ≈ 1 lead enriquecido)
_credits_store: Dict[str, int] = {}
CREDITS_DEFAULT = 100  # créditos iniciais por tenant

def _get_credits(org_id: str) -> int:
    if org_id not in _credits_store:
        _credits_store[org_id] = CREDITS_DEFAULT
    return _credits_store[org_id]

def _consume_credits(org_id: str, amount: int) -> bool:
    cur = _get_credits(org_id)
    if cur < amount:
        return False
    _credits_store[org_id] = cur - amount
    return True

def _add_credits(org_id: str, amount: int) -> int:
    _credits_store[org_id] = _get_credits(org_id) + amount
    return _credits_store[org_id]

def get_org_id(request: Request) -> str:
    return (request.headers.get("X-Org-Id") or "").strip() or "default"

# ==========================================================
# MODELS (Pydantic)
# ==========================================================


class ProspeccaoConfig(BaseModel):
    """
    Modelo que o FRONT envia.
    """

    model_config = ConfigDict(populate_by_name=True)

    termo: str = Field("", alias="termo_base")
    cidade: str = ""
    uf: str = ""
    cidades: Optional[List[str]] = None
    ufs: Optional[List[str]] = None
    capital_minima: int = Field(0, alias="capital_minimo")
    capital_maxima: Optional[int] = Field(None, alias="capital_maximo")
    limite_empresas: int = 50
    portes: Optional[List[str]] = None
    segmentos: Optional[List[str]] = None
    cnaes: Optional[List[str]] = None
    incluir_cnae_secundario: bool = False
    enriquecer_web: bool = Field(False, alias="enriquecimento_web")
    exigir_contato: bool = Field(False, alias="exigir_contato_acionavel")
    priorizar_com_contato: bool = True
    excluir_cnpjs: Optional[List[str]] = None
    idade_minima_anos: Optional[int] = None
    idade_maxima_anos: Optional[int] = None


class SocioRedeSocial(BaseModel):
    nome: str
    links: List[str]


class Empresa(BaseModel):
    # ── identificação ──────────────────────────────────────────────────────────
    cnpj: str
    razao_social: str
    nome_fantasia: Optional[str] = None
    natureza_juridica: Optional[str] = None
    data_abertura: Optional[str] = None
    situacao_cadastral: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    cnae_principal: Optional[str] = None
    cnae_descricao: Optional[str] = None
    cnaes_secundarios: Optional[List[Dict[str, str]]] = None
    capital_social: Optional[float] = None

    # ── ICP ────────────────────────────────────────────────────────────────────
    porte: Optional[str] = None
    segmento: Optional[str] = None
    subsegmento: Optional[str] = None

    # ── contatos base (Receita Federal) ───────────────────────────────────────
    telefone_padrao: Optional[str] = None
    telefone_receita: Optional[str] = None
    telefone_estab1: Optional[str] = None
    telefone_estab2: Optional[str] = None
    email: Optional[str] = None

    # ── enriquecimento web ────────────────────────────────────────────────────
    site: Optional[str] = None
    email_enriquecido: Optional[str] = None
    telefone_enriquecido: Optional[str] = None
    whatsapp_publico: Optional[str] = None
    whatsapp_enriquecido: Optional[str] = None
    outras_informacoes: Optional[str] = None

    # ── IA ─────────────────────────────────────────────────────────────────────
    resumo_ia_empresa: Optional[str] = None

    # ── redes sociais ─────────────────────────────────────────────────────────
    redes_sociais_empresa: Optional[List[str]] = None
    redes_sociais_socios: Optional[List[SocioRedeSocial]] = None

    # ── sócios ────────────────────────────────────────────────────────────────
    socios_resumo: Optional[str] = None          # texto legível (retrocompatibilidade)
    socios_estruturado: Optional[List[Dict[str, str]]] = None  # lista com nome, qualificacao, data_entrada, cpf_cnpj

    # ── contexto econômico (SIDRA / IBGE) ─────────────────────────────────────
    contexto_sidra: Optional[str] = None
    sidra_pib: Optional[float] = None
    sidra_populacao: Optional[float] = None
    sidra_pib_per_capita: Optional[float] = None

    # ── endereço completo ─────────────────────────────────────────────────────
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cep: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # ── score / metadados ─────────────────────────────────────────────────────
    score_icp: Optional[float] = None
    registro_dono: Optional[str] = None
    registro_email: Optional[str] = None
    fonte_dados_prioritaria: Optional[str] = None


class FiltrosICP(BaseModel):
    capital_social_minimo: Optional[float] = None
    portes: List[str] = Field(default_factory=list)
    segmentos: List[str] = Field(default_factory=list)
    cidade: Optional[str] = None
    uf: Optional[str] = None
    volume_por_regiao: Optional[dict[str, int]] = None
    alinhamento_ideal_compra: Optional[str] = None


class EnriquecimentoResumo(BaseModel):
    total_com_enriquecimento: int
    total_sem_enriquecimento: int
    porcentagem_enriquecida: float


class ProspeccaoResultado(BaseModel):
    total_empresas: int
    empresas: List[Empresa]
    filtros_icp: FiltrosICP
    enriquecimento_web: EnriquecimentoResumo


# ==========================================================
# MODELOS PARA MAPA DE CALOR
# ==========================================================


class MapaCalorRequest(BaseModel):
    uf: Optional[str] = None
    cidade: Optional[str] = None
    termo_base: Optional[str] = None
    capital_minimo: Optional[float] = None


class MapaCalorPonto(BaseModel):
    uf: str
    municipio: str
    latitude: float
    longitude: float
    total_empresas: int
    capital_social_total: float


class MapaCalorResponse(BaseModel):
    pontos: List[MapaCalorPonto]


# ==========================================================
# MAPAS DE APOIO (PORTE / SEGMENTO → CNAE)
# ==========================================================

PORTE_MAP = {
    "ME": ["01"],
    "EPP": ["03"],
    "Médio": ["05"],
    "Grande": ["05"],
    "Médio/Grande": ["05"],
    "Não informado": ["00", ""],
}

PORTE_LABEL_BY_CODE = {
    "01": "ME",
    "03": "EPP",
    "05": "Médio/Grande",
    "00": "Não informado",
    "": "Não informado",
}

# Qualificações de sócio (Receita Federal — tabela oficial)
QUALIFICACAO_SOCIO_MAP: Dict[str, str] = {
    "05": "Administrador",
    "08": "Conselheiro de Administração",
    "10": "Diretor",
    "16": "Presidente",
    "17": "Procurador",
    "20": "Sociedade Consorciada",
    "21": "Sociedade Filiada",
    "22": "Sócio",
    "23": "Sócio Capitalista",
    "24": "Sócio de Indústria",
    "28": "Sócio-Gerente",
    "29": "Sócio Ostensivo",
    "30": "Titular de Empresa Individual",
    "31": "Benficiário",
    "37": "Sócio Pessoa Jurídica Domiciliado no Exterior",
    "38": "Sócio Pessoa Física Residente no Exterior",
    "47": "Sócio Pessoa Física Residente no País",
    "49": "Sócio-Administrador",
    "50": "Sócio Ostensivo",
    "52": "Membro de Conselho de Administração",
    "53": "Membro de Conselho Fiscal",
    "54": "Fundador",
    "55": "Membro de Conselho Consultivo",
    "60": "Diretor Presidente",
    "63": "Co-Responsável",
    "65": "Titular",
    "66": "Representante Legal",
    "70": "Sócio (Regime Simples)",
    "78": "Titular Pessoa Física Residente ou Domiciliado no Brasil",
}

# Natureza Jurídica (Receita Federal — principais)
NATUREZA_JURIDICA_MAP: Dict[str, str] = {
    "1015": "Órgão Público Federal",
    "1023": "Órgão Público Estadual",
    "1031": "Órgão Público Municipal",
    "2011": "Empresa Pública",
    "2038": "Sociedade de Economia Mista",
    "2046": "Sociedade Anônima Aberta",
    "2054": "Sociedade Anônima Fechada",
    "2062": "Sociedade Empresária Limitada",
    "2070": "Sociedade Empresária em Nome Coletivo",
    "2089": "Sociedade Empresária em Comandita Simples",
    "2097": "Sociedade Empresária em Comandita por Ações",
    "2127": "Sociedade Simples Pura",
    "2135": "Empresário Individual",
    "2143": "Cooperativa",
    "2151": "Consórcio de Sociedades",
    "2160": "Grupo de Sociedades",
    "2178": "Estabelecimento, no Brasil, de Sociedade Estrangeira",
    "2240": "Empresa Domiciliada no Exterior",
    "2305": "Organização Religiosa",
    "2313": "Fundação Privada",
    "2321": "Serviço Notarial e Registral (Cartório)",
    "2330": "Organização Social (OS)",
    "2348": "OSCIP",
    "2356": "Organização Sindical",
    "2364": "Fundação ou Associação Domiciliada no Exterior",
    "2381": "Partido Político",
    "2399": "Outras Formas de Associativismo",
    "3069": "Fundação Pública de Direito Privado Estadual ou do Distrito Federal",
    "3999": "Outras Entidades Empresariais",
    "4014": "Empresa Individual de Responsabilidade Limitada (EIRELI)",
    "4030": "Empresa Simples de Responsabilidade Limitada",
    "4081": "MEI - Microempreendedor Individual",
}

# Segmentos macro (usados pra filtro / tag "grande")
SEGMENTO_CNAE_PREFIX = {
    # Saúde
    "Hospitais": ["8610"],
    "Clínicas": ["8640"],
    "Laboratórios": ["8640"],  # lab clínico, análises etc.
    "Farmácias": ["4771"],
    # Varejo alimentar
    "Supermercados": ["4711", "4712"],
    # Logística / transporte
    "Logística": ["4930", "49"],
    # Indústria (amplo)
    "Indústria": ["10", "11", "12", "20", "21", "22", "23"],
    # Serviços gerais (beleza, outros)
    "Serviços": ["96"],
}

UF_CENTER = {
    "AC": (-9.0, -70.0),
    "AL": (-9.6, -36.8),
    "AM": (-3.4, -65.0),
    "AP": (1.4, -51.8),
    "BA": (-12.8, -41.7),
    "CE": (-5.2, -39.5),
    "DF": (-15.8, -47.9),
    "ES": (-19.5, -40.6),
    "GO": (-15.9, -49.3),
    "MA": (-5.5, -45.5),
    "MG": (-18.5, -44.0),
    "MS": (-20.5, -54.5),
    "MT": (-13.0, -56.0),
    "PA": (-3.9, -52.5),
    "PB": (-7.1, -36.8),
    "PE": (-8.4, -37.9),
    "PI": (-7.3, -42.4),
    "PR": (-24.5, -51.9),
    "RJ": (-22.5, -43.5),
    "RN": (-5.8, -36.6),
    "RO": (-10.8, -63.0),
    "RR": (2.0, -61.0),
    "RS": (-30.0, -53.0),
    "SC": (-27.3, -50.4),
    "SE": (-10.6, -37.3),
    "SP": (-22.3, -48.5),
    "TO": (-10.2, -48.3),
}

# ==========================================================
# HELPERS
# ==========================================================


# Helper functions moved to api.utils


def calcular_alinhamento_ideal_compra(
    total_empresas: int,
    volume_por_regiao: dict[str, int],
    capital_minima: Optional[int],
) -> str:
    if total_empresas == 0:
        return "Desconhecido"

    num_regioes = max(len(volume_por_regiao), 1)
    media_por_regiao = total_empresas / num_regioes

    if capital_minima and capital_minima >= 100_000 and media_por_regiao <= 50:
        return "ALTO"
    if capital_minima and capital_minima >= 50_000:
        return "MÉDIO"
    return "BAIXO"


# ==========================================================
# ENRIQUECIMENTO WEB + IA
# ==========================================================

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9_.+\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-.]+")
PHONE_REGEX = re.compile(r"(\+?\d{2}\s*\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4})")
WHATS_LINK_REGEX = re.compile(
    r"(https?://(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)[^\s\"'>]+)"
)
WHATS_NUM_REGEX = re.compile(
    r"(?:\+?55\s?\(?\d{2}\)?\s?9\d{4}[-.\s]?\d{4})"
    r"|(?:\(?\d{2}\)?\s?9\d{4}[-.\s]?\d{4})"
)
SOCIAL_REGEX = re.compile(
    r"(https?://(www\.)?(instagram\.com|linkedin\.com|facebook\.com)[^\s\"'>]+)"
)

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico")
SOCIAL_DOMAINS = ("instagram.com", "facebook.com", "linkedin.com", "twitter.com", "youtube.com", "tiktok.com", "x.com")
BANNED_DOMAINS = (
    "merriam-webster.com", "facebook.com/tr", "facebook.com/help",
    "cnpj.biz", "cnpj.info", "cnpj.in", "cnpja.com", "cnpj.today",
    "consultascnpj.com", "consultasocio.com", "casadosdados.com.br",
    "informecadastral.com.br", "cadastroempresa.com.br",
    "econodata.com.br", "speedio.com.br", "infoinvest.com.br",
    "aboutcompany.info", "procuroacho.com", "guiapj.com.br",
    "solutudo.com.br", "todosnegocios.com", "br.todosnegocios.com",
    "empresascnpj.com", "cnpjconsultas.com", "empresaqui.com",
    "cnpjja.com.br", "receitaws.com.br", "cnpjreceita.com.br",
    "consultacnpj.com", "empresas.wiki", "cnpj.services",
    "findcnpj.com.br", "brasilcnpj.com", "portalcnpj.com.br",
    "buscacnpj.com.br", "dadosmarket.com.br",
    "academia.edu", "researchgate.net", "scielo.br",
    "glassdoor.com", "glassdoor.com.br", "indeed.com",
    "jusbrasil.com.br", "reclameaqui.com.br",
    "mestregeo.com.br", "wikipedia.org",
)


def _email_valido(email: str) -> bool:
    e = email.strip()
    if not e or "@" not in e:
        return False
    if e.lower().endswith(IMAGE_EXTENSIONS):
        return False
    dominio = e.split("@")[-1]
    if "." not in dominio:
        return False
    return True


def _telefone_valido(telefone: str) -> bool:
    digits = re.sub(r"\D", "", telefone)
    if len(digits) < 10 or len(digits) > 13:
        return False
    return True


def _extrair_contatos_html(html: str) -> dict:
    contatos: dict[str, List[str]] = {
        "emails": [],
        "phones": [],
        "whatsapps": [],
        "social": [],
    }

    for match in EMAIL_REGEX.findall(html):
        if _email_valido(match) and match not in contatos["emails"]:
            contatos["emails"].append(match)

    for match in PHONE_REGEX.findall(html):
        numero = match[0] if isinstance(match, tuple) else match
        num_limpo = numero.strip()
        if _telefone_valido(num_limpo) and num_limpo not in contatos["phones"]:
            contatos["phones"].append(num_limpo)

    for match in WHATS_LINK_REGEX.findall(html):
        url = match[0] if isinstance(match, tuple) else match
        if url not in contatos["whatsapps"]:
            contatos["whatsapps"].append(url)

    if not contatos["whatsapps"]:
        for match in WHATS_NUM_REGEX.findall(html):
            num_limpo = re.sub(r"[^\d]", "", match)
            if len(num_limpo) == 11 and num_limpo[2] == "9":
                num_limpo = "55" + num_limpo
            if len(num_limpo) >= 12 and num_limpo not in contatos["whatsapps"]:
                contatos["whatsapps"].append(num_limpo)

    for match in SOCIAL_REGEX.findall(html):
        url = match[0] if isinstance(match, tuple) else match
        if url not in contatos["social"]:
            contatos["social"].append(url)

    return contatos


def _buscar_resultados_busca(query: str, max_results: int = 3) -> List[dict]:
    """
    Busca web usando core_scraper.buscar_google (SearXNG → Google → Brave → Bing → DDGS).
    Fallback para DDGS direto se core_scraper não estiver disponível.
    """
    try:
        import asyncio
        import concurrent.futures
        from core_scraper import buscar_google as _buscar_google_async

        def _run():
            return asyncio.run(_buscar_google_async(query, num_results=max_results))

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            resultados = pool.submit(_run).result(timeout=60)
        if resultados:
            print(f"[BUSCA] core_scraper retornou {len(resultados)} resultados para: {query[:60]}")
            return resultados
    except Exception as e:
        print(f"[BUSCA] core_scraper falhou, tentando DDGS direto: {repr(e)}")

    if DDGS is not None:
        try:
            with DDGS() as ddgs:
                return list(ddgs.text(query, max_results=max_results))
        except Exception as e:
            print("[BUSCA] DDGS direto também falhou:", repr(e))

    return []


# ==========================================================
# IA - Configuração unificada (OpenAI ou OpenRouter)
# ==========================================================
try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None  # type: ignore

AI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
_is_openrouter = bool(os.getenv("OPENROUTER_API_KEY")) and not os.getenv("OPENAI_API_KEY")
AI_BASE_URL = "https://openrouter.ai/api/v1" if _is_openrouter else None
AI_CHAT_URL = (
    "https://openrouter.ai/api/v1/chat/completions" if _is_openrouter
    else "https://api.openai.com/v1/chat/completions"
)
AI_MODEL = "openai/gpt-4o-mini" if _is_openrouter else "gpt-4o-mini"

if not AI_API_KEY or AsyncOpenAI is None:
    if AsyncOpenAI is None:
        print("[IA] AVISO: pacote openai não instalado. IA desabilitada.")
    else:
        print("[IA] AVISO: nenhuma chave de IA configurada (OPENAI_API_KEY / OPENROUTER_API_KEY).")
    ai_client = None
else:
    provider = "OpenRouter" if _is_openrouter else "OpenAI"
    print(f"[IA] Chave carregada ({provider}), IA habilitada.")
    ai_client = AsyncOpenAI(api_key=AI_API_KEY, base_url=AI_BASE_URL)

async def resumir_site_com_ia(texto_site: str) -> Optional[str]:
    """
    Usa IA para resumir o texto do site em formato útil para prospecção B2B.
    Agora usa cliente assíncrono oficial da OpenAI.
    """
    if not ai_client:
        return None

    system_msg = (
        "Você é um analista de prospecção B2B. "
        "Resuma em até 3 frases curtas, em português, focando em: "
        "(1) o que a empresa faz, (2) perfil típico de cliente e (3) "
        "por que pode ser um bom alvo para soluções de dados, automação ou IA."
    )

    user_msg = f"Trechos do site da empresa:\n\n{texto_site[:7000]}"

    try:
        response = await ai_client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print("[IA] erro ao chamar modelo de resumo:", repr(e))
        return None


def _eh_dominio_banido(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return True

    for banned in BANNED_DOMAINS:
        if banned in host:
            return True
    return False


def _eh_dominio_social(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return any(dom in host for dom in SOCIAL_DOMAINS)


def _eh_bom_site_corporativo(url: str, razao_social: str) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path.lower()
    except Exception:
        return False

    if _eh_dominio_banido(url):
        return False

    if _eh_dominio_social(url):
        return False

    # Heurística: exige .br ou que o host tenha parte da razão social
    if not host.endswith(".br"):
        if "rededorsaoluiz" not in host and "dasa.com.br" not in host:
            slug = razao_social.lower().replace("'", " ").replace(".", " ")
            pedacos = [p for p in slug.split() if p]
            if not any(p in host for p in pedacos[:3]):
                return False

    # Evita páginas óbvias que não são institucionais
    if any(x in path for x in ("/dictionary/", "/help/", "/pixel", "/tr?id=")):
        return False

    return True


def _sanitize_url(val: object) -> Optional[str]:
    if not val:
        return None
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "null", "n/a", "-", ""):
        return None
    return s


_SUFIXOS_JURIDICOS = re.compile(
    r"\b(S/?A|S\.A\.?|LTDA\.?|ME|EPP|EIRELI|SOCIEDADE\s+AN[OÔ]NIMA|"
    r"LIMITADA|INDIVIDUAL|MICROEMPRESA|FIL)\b",
    re.IGNORECASE,
)


def _limpar_nome_empresa(nome: str) -> str:
    """Remove sufixos jurídicos e normaliza nome para busca web."""
    limpo = _SUFIXOS_JURIDICOS.sub("", nome).strip()
    limpo = re.sub(r"\s{2,}", " ", limpo).strip(" -.,")
    return limpo or nome


def _enriquecer_empresa_web(empresa: "Empresa") -> dict:
    nome_raw = empresa.nome_fantasia or empresa.razao_social or ""
    nome = _limpar_nome_empresa(nome_raw)
    cidade = empresa.cidade or ""
    uf = empresa.uf or ""
    if not nome.strip():
        return {}

    # Tenta Scrapling primeiro (stealth, adaptativo, mais dados)
    try:
        from scrapling_service import enriquecer_empresa_scrapling, SCRAPLING_AVAILABLE
        if SCRAPLING_AVAILABLE:
            socios = []
            if empresa.socios_resumo:
                socios = [l.split("(")[0].strip() for l in empresa.socios_resumo.split("\n") if l.strip()]

            scrapling_result = enriquecer_empresa_scrapling(
                nome=nome,
                site_url=_sanitize_url(empresa.site),
                cidade=cidade,
                uf=uf,
                cnpj=empresa.cnpj or "",
                socios=socios[:3],
            )
            if scrapling_result.get("site") or scrapling_result.get("email") or scrapling_result.get("whatsapp_publico") or scrapling_result.get("telefone") or scrapling_result.get("linkedin_empresa"):
                print(f"[ENRIQUECIMENTO] Scrapling OK para {nome}: site={scrapling_result.get('site')}, email={scrapling_result.get('email')}, whats={scrapling_result.get('whatsapp_publico')}, tel={scrapling_result.get('telefone')}")

                resumo_ia = None
                meta_desc = scrapling_result.get("meta_description") or ""
                if meta_desc and ai_client:
                    try:
                        import asyncio
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            import concurrent.futures
                            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                                resumo_ia = pool.submit(
                                    lambda: asyncio.run(resumir_site_com_ia(meta_desc))
                                ).result(timeout=30)
                        else:
                            resumo_ia = loop.run_until_complete(resumir_site_com_ia(meta_desc))
                    except Exception:
                        pass
                scrapling_result["resumo_ia_empresa"] = resumo_ia

                if resumo_ia and scrapling_result.get("outras_info"):
                    scrapling_result["outras_info"] += " | Resumo IA: " + str(resumo_ia)
                elif resumo_ia:
                    scrapling_result["outras_info"] = "Resumo IA: " + str(resumo_ia)

                return scrapling_result
    except Exception as e:
        print(f"[ENRIQUECIMENTO] Scrapling falhou para {nome}, usando fallback: {repr(e)}")

    # Fallback: httpx + BeautifulSoup (lógica original)
    if BeautifulSoup is None:
        print(f"[ENRIQUECIMENTO] bs4 não disponível, pulando fallback httpx para {nome}")
        return {}

    query = f'"{nome}" {cidade} {uf} contato telefone whatsapp'
    print(f"[ENRIQUECIMENTO] Fallback httpx para empresa: {query}")

    resultados = _buscar_resultados_busca(query, max_results=5)
    if not resultados:
        query2 = f'"{nome}" {empresa.cnpj or ""} site telefone'
        resultados = _buscar_resultados_busca(query2, max_results=3)
    if not resultados:
        return {}

    melhor_site: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    whatsapp_pub: Optional[str] = None
    sociais: List[str] = []
    texto_principal_site: Optional[str] = None

    client = httpx.Client(timeout=30.0, follow_redirects=True)

    _CONTACT_SUFFIXES = ["/contato", "/fale-conosco", "/contact", "/sobre", "/quem-somos"]

    try:
        for r in resultados:
            url = r.get("href") or r.get("url") or r.get("link")
            if not url:
                continue

            if _eh_dominio_banido(url):
                continue

            try:
                resp = client.get(url)
                if resp.status_code != 200 or not resp.text:
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")
                texto = soup.get_text(" ", strip=True)
                html = resp.text

                contatos = _extrair_contatos_html(texto + " " + html)

                if melhor_site is None and _eh_bom_site_corporativo(url, nome):
                    melhor_site = url
                    texto_principal_site = texto

                if not email and contatos["emails"]:
                    email = contatos["emails"][0]

                if not telefone and contatos["phones"]:
                    telefone = contatos["phones"][0]

                if not whatsapp_pub and contatos["whatsapps"]:
                    whatsapp_pub = contatos["whatsapps"][0]

                for s in contatos["social"]:
                    if s not in sociais:
                        sociais.append(s)

            except Exception as e:
                print(f"[ENRIQUECIMENTO] erro ao processar {url}:", repr(e))
                continue

        # Visita páginas de contato do site corporativo encontrado
        if melhor_site and (not whatsapp_pub or not email):
            base = melhor_site.rstrip("/")
            for suffix in _CONTACT_SUFFIXES:
                if whatsapp_pub and email:
                    break
                try:
                    resp = client.get(base + suffix)
                    if resp.status_code != 200 or not resp.text:
                        continue
                    soup = BeautifulSoup(resp.text, "html.parser")
                    txt = soup.get_text(" ", strip=True)
                    c2 = _extrair_contatos_html(txt + " " + resp.text)
                    if not whatsapp_pub and c2["whatsapps"]:
                        whatsapp_pub = c2["whatsapps"][0]
                        print(f"[ENRIQUECIMENTO] WhatsApp encontrado em {base}{suffix}")
                    if not email and c2["emails"]:
                        email = c2["emails"][0]
                    if not telefone and c2["phones"]:
                        telefone = c2["phones"][0]
                except Exception:
                    continue
    finally:
        client.close()

    resumo_ia: Optional[str] = None
    if texto_principal_site and ai_client:
        try:
            import asyncio
            import concurrent.futures
            loop = asyncio.get_running_loop()
            if loop.is_running():
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    resumo_ia = pool.submit(
                        lambda: asyncio.run(resumir_site_com_ia(texto_principal_site))
                    ).result(timeout=30)
            else:
                resumo_ia = loop.run_until_complete(resumir_site_com_ia(texto_principal_site))
        except Exception:
            pass

    partes_outros: List[str] = []
    if sociais:
        partes_outros.append("Redes sociais: " + ", ".join(sociais[:10]))
    if resumo_ia:
        partes_outros.append("Resumo IA: " + resumo_ia)

    outras_info: Optional[str] = None
    if partes_outros:
        outras_info = " | ".join(partes_outros)

    return {
        "site": melhor_site,
        "email": email,
        "telefone": telefone,
        "whatsapp_publico": whatsapp_pub,
        "outras_info": outras_info,
        "redes_sociais_empresa": sociais,
        "resumo_ia_empresa": resumo_ia,
    }


def _buscar_redes_para_socio(
    nome: str, cidade: Optional[str], uf: Optional[str], empresa: Optional[str] = None
) -> List[str]:
    links: List[str] = []

    # Busca focada em LinkedIn (prioridade para vendas B2B)
    ctx = empresa or ""
    query_li = f'site:linkedin.com/in "{nome}" {ctx} {cidade or ""}'.strip()
    print(f"[ENRIQUECIMENTO] Buscando LinkedIn para sócio: {query_li}")
    resultados_li = _buscar_resultados_busca(query_li, max_results=5)
    for r in resultados_li:
        url = r.get("href") or r.get("url") or r.get("link") or ""
        if "/in/" in url and "linkedin.com" in url:
            clean = url.split("?")[0].rstrip("/")
            if clean not in links:
                links.append(clean)
                break

    # Busca geral para demais redes
    query_all = f'"{nome}" {cidade or ""} {uf or ""} linkedin OR instagram OR facebook'
    resultados = _buscar_resultados_busca(query_all, max_results=4)
    for r in resultados:
        url = r.get("href") or r.get("url") or r.get("link") or ""
        if not url:
            continue
        if any(domain in url for domain in ("linkedin.com", "instagram.com", "facebook.com")):
            clean = url.split("?")[0].rstrip("/")
            if clean not in links:
                links.append(clean)
    return links


def enriquecer_redes_socios(empresas: List["Empresa"], on_progress=None) -> None:
    MAX_SOCIOS_POR_EMPRESA = 5
    total = len(empresas)

    for idx, emp in enumerate(empresas):
        if on_progress:
            on_progress(idx, total, emp.nome_fantasia or emp.razao_social or emp.cnpj)

        if not emp.socios_resumo:
            continue

        linhas = [l.strip() for l in emp.socios_resumo.split("\n") if l.strip()]
        existing = emp.redes_sociais_socios or []
        existing_names = {s.nome.lower() for s in existing}
        empresa_nome = emp.nome_fantasia or emp.razao_social or ""

        for linha in linhas[:MAX_SOCIOS_POR_EMPRESA]:
            nome = linha
            if "(" in linha:
                nome = linha.split("(", 1)[0].strip()

            if not nome or len(nome) < 4:
                continue
            if nome.lower() in existing_names:
                continue

            links = _buscar_redes_para_socio(nome, emp.cidade, emp.uf, empresa_nome)
            if not links:
                continue

            existing.append(SocioRedeSocial(nome=nome, links=links))
            existing_names.add(nome.lower())

        if existing:
            emp.redes_sociais_socios = existing


MAX_ENRICH_INLINE = 30

def enriquecer_empresas_online(empresas: List["Empresa"], on_progress=None) -> None:
    if not empresas:
        return

    alvos = sorted(empresas, key=lambda e: (e.score_icp or 0), reverse=True)[:MAX_ENRICH_INLINE]
    total = len(alvos)
    print(f"[ENRIQUECIMENTO] Enriquecendo {total} empresas inline (de {len(empresas)} total)")
    for idx, emp in enumerate(alvos):
        if on_progress:
            on_progress(idx, total, emp.nome_fantasia or emp.razao_social or emp.cnpj)
        dados = _enriquecer_empresa_web(emp)
        if not dados:
            continue

        if dados.get("site"):
            emp.site = dados["site"]
        if dados.get("email"):
            emp.email_enriquecido = dados["email"]
        if dados.get("telefone"):
            emp.telefone_enriquecido = dados["telefone"]
        if dados.get("whatsapp_publico"):
            emp.whatsapp_publico = dados["whatsapp_publico"]
        if dados.get("outras_info"):
            emp.outras_informacoes = dados["outras_info"]
        if dados.get("redes_sociais_empresa"):
            emp.redes_sociais_empresa = dados["redes_sociais_empresa"]
        if dados.get("resumo_ia_empresa"):
            emp.resumo_ia_empresa = dados["resumo_ia_empresa"]

        # Promoção imediata: se achou telefone celular mas não WhatsApp, promove
        if not emp.whatsapp_publico and not emp.whatsapp_enriquecido:
            tel_candidato = dados.get("telefone") or ""
            if _eh_celular_br(tel_candidato):
                num_norm = _normalizar_celular_br(tel_candidato)
                if num_norm:
                    emp.whatsapp_enriquecido = num_norm
                    print(f"[ENRIQUECIMENTO] Celular promovido a WhatsApp para {emp.nome_fantasia or emp.razao_social}: {num_norm}")

        # LinkedIn de socios encontrados pelo Scrapling
        socios_li = dados.get("socios_linkedin") or []
        if socios_li:
            existing = emp.redes_sociais_socios or []
            for sl in socios_li:
                nome_s = sl.get("nome", "")
                link_s = sl.get("linkedin", "")
                if not link_s:
                    continue
                already = any(s.nome == nome_s for s in existing)
                if not already:
                    existing.append(SocioRedeSocial(nome=nome_s, links=[link_s]))
            emp.redes_sociais_socios = existing

    print("[ENRIQUECIMENTO] Lote de enriquecimento concluído para todas as empresas.")


# ==========================================================
# FUNÇÃO PRINCIPAL DE PROSPECÇÃO
# ==========================================================


def _normalizar_segmento(s: str) -> str:
    """
    Remove acentos e caracteres não alfanuméricos pra comparar 'Clinicas', 'clínicas', 'CLINICAS' etc.
    """
    s = s.lower()
    s = s.replace("á", "a").replace("à", "a").replace("ã", "a").replace("â", "a")
    s = s.replace("é", "e").replace("ê", "e")
    s = s.replace("í", "i")
    s = s.replace("ó", "o").replace("ô", "o").replace("õ", "o")
    s = s.replace("ú", "u")
    s = s.replace("ç", "c")
    return re.sub(r"[^a-z0-9]", "", s)


SEGMENTO_PREFIX_NORMALIZADO = {
    _normalizar_segmento(k): v for k, v in SEGMENTO_CNAE_PREFIX.items()
}


MAX_WHATSAPP_ULTRA_EMPRESAS = 25

def _enriquecer_whatsapp_ultra_inline(empresas: List["Empresa"], on_progress=None) -> None:
    """
    WhatsApp Ultra Discovery inline — busca multi-camada (widget, redes sociais,
    busca direta, Google Maps, etc.) para empresas sem WhatsApp.
    Limitado aos top N por score para não estourar tempo.
    """
    try:
        from whatsapp_linkedin_ultra import descobrir_whatsapp_linkedin_completo
    except ImportError:
        print("[WHATSAPP ULTRA] módulo whatsapp_linkedin_ultra não disponível")
        return

    sem_whatsapp = [
        e for e in empresas
        if not e.whatsapp_publico and not e.whatsapp_enriquecido
    ]
    sem_whatsapp.sort(key=lambda e: (e.score_icp or 0), reverse=True)
    alvos = sem_whatsapp[:MAX_WHATSAPP_ULTRA_EMPRESAS]

    if not alvos:
        print("[WHATSAPP ULTRA] todas as empresas já possuem WhatsApp")
        return

    print(f"[WHATSAPP ULTRA] Iniciando descoberta para {len(alvos)} empresas sem WhatsApp")
    import asyncio
    import concurrent.futures

    for idx, emp in enumerate(alvos):
        nome = emp.nome_fantasia or emp.razao_social or ""
        if on_progress:
            on_progress(idx, len(alvos), nome)
        try:
            socios = []
            if emp.socios_resumo:
                socios = [l.split("(")[0].strip() for l in emp.socios_resumo.split("\n") if l.strip()]

            def _run_discovery(e=emp, n=nome, s=socios):
                return asyncio.run(descobrir_whatsapp_linkedin_completo(
                    empresa_nome=n,
                    site=e.site,
                    cidade=e.cidade or "",
                    socios=s[:3],
                    cnpj=e.cnpj or "",
                    score_icp=e.score_icp or 0,
                ))

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                resultado = pool.submit(_run_discovery).result(timeout=90)

            whatsapp_data = resultado.get("whatsapp") or {}
            whatsapp_numero = whatsapp_data.get("numero") if isinstance(whatsapp_data, dict) else None
            if whatsapp_numero:
                emp.whatsapp_enriquecido = str(whatsapp_numero)
                print(f"[WHATSAPP ULTRA] WhatsApp encontrado para {nome}: {whatsapp_numero} (fonte: {whatsapp_data.get('fonte', '?')})")

            linkinbio_data = resultado.get("linkinbio") or {}
            if not whatsapp_numero and isinstance(linkinbio_data, dict) and linkinbio_data.get("whatsapp"):
                emp.whatsapp_enriquecido = str(linkinbio_data["whatsapp"])
                print(f"[WHATSAPP ULTRA] WhatsApp via Linktree para {nome}: {linkinbio_data['whatsapp']}")

            linkedin_socios_data = resultado.get("linkedin_socios") or []
            if linkedin_socios_data:
                existing = emp.redes_sociais_socios or []
                for sl in linkedin_socios_data:
                    n_s = sl.get("nome", "")
                    l_s = sl.get("linkedin", "")
                    if l_s and not any(s.nome == n_s for s in existing):
                        existing.append(SocioRedeSocial(nome=n_s, links=[l_s]))
                emp.redes_sociais_socios = existing

        except Exception as e:
            print(f"[WHATSAPP ULTRA] erro para {nome}: {repr(e)}")
            continue

    total_encontrados = sum(1 for e in alvos if e.whatsapp_enriquecido)
    print(f"[WHATSAPP ULTRA] Concluído: {total_encontrados}/{len(alvos)} WhatsApps encontrados")


def _eh_celular_br(numero: str) -> bool:
    """Verifica se um número é celular brasileiro (DDD + 9XXXXXXXX)."""
    if not numero:
        return False
    num = re.sub(r"[^\d]", "", str(numero))
    if num.startswith("55"):
        num = num[2:]
    if num.startswith("0"):
        num = num[1:]
    return len(num) == 11 and num[2] == "9"


def _normalizar_celular_br(numero: str) -> Optional[str]:
    """Normaliza celular brasileiro para formato 55DXXXXXXXXX (13 dígitos)."""
    if not numero:
        return None
    num = re.sub(r"[^\d]", "", str(numero))
    if num.startswith("0"):
        num = num[1:]
    if len(num) == 11 and num[2] == "9":
        return "55" + num
    if len(num) == 13 and num.startswith("55") and num[4] == "9":
        return num
    return None


def _promover_telefone_para_whatsapp(empresas: List["Empresa"]) -> int:
    """
    Última camada: para empresas SEM WhatsApp, verifica se algum telefone
    disponível é celular brasileiro (DDD + 9XXXX-XXXX) e promove a
    whatsapp_enriquecido com tag de origem.

    No Brasil, ~95% dos celulares comerciais com 9° dígito são WhatsApp.
    Fontes verificadas (ordem de prioridade):
      1. telefone_enriquecido (veio do site da empresa)
      2. telefone_padrao (DDD1+TEL1 da Receita Federal)
      3. telefone_receita (campo direto da RF)
      4. telefone_estab1, telefone_estab2 (estabelecimento)
    """
    promovidos = 0
    for emp in empresas:
        if emp.whatsapp_publico or emp.whatsapp_enriquecido:
            continue

        fontes = [
            ("site", emp.telefone_enriquecido),
            ("receita_padrao", emp.telefone_padrao),
            ("receita_bruto", emp.telefone_receita),
            ("estabelecimento1", emp.telefone_estab1),
            ("estabelecimento2", emp.telefone_estab2),
        ]
        for fonte_tag, tel in fontes:
            if tel and _eh_celular_br(tel):
                numero_norm = _normalizar_celular_br(tel)
                if numero_norm:
                    emp.whatsapp_enriquecido = numero_norm
                    promovidos += 1
                    print(f"[WHATSAPP PROMO] {emp.nome_fantasia or emp.razao_social}: "
                          f"{numero_norm} (fonte: {fonte_tag})")
                    break

    print(f"[WHATSAPP PROMO] {promovidos} empresas promovidas de telefone → WhatsApp")
    return promovidos


def rodar_prospeccao_icp(config: ProspeccaoConfig, on_progress=None) -> ProspeccaoResultado:
    """
    on_progress: optional callback(stage: str, current: int, total: int, detail: str)
    Stages: 'db_query', 'building', 'enriching', 'enriching_socials', 'done'
    """
    # --- Cache Lookup ---
    cache_key = config.model_dump()
    cached = cache_service.get("prospeccao_icp", **cache_key)
    if cached:
        return ProspeccaoResultado(**cached)

    def _emit(stage, current=0, total=0, detail=""):
        if on_progress:
            on_progress(stage, current, total, detail)

    # Resolver listas de cidades/UFs (multi-cidade/multi-UF)
    cidades_norm: List[str] = []
    if config.cidades and any(c.strip() for c in config.cidades):
        cidades_norm = [c.strip().upper() for c in config.cidades if c.strip()]
    elif config.cidade and config.cidade.strip():
        cidades_norm = [config.cidade.strip().upper()]

    ufs_norm: List[str] = []
    if config.ufs and any(u.strip() for u in config.ufs):
        ufs_norm = [u.strip().upper() for u in config.ufs if u.strip() and u.strip().upper() != "TODAS"]
    elif config.uf and config.uf.strip() and config.uf.strip().upper() != "TODAS":
        ufs_norm = [config.uf.strip().upper()]

    # Retrocompat para score_icp
    cidade_norm = cidades_norm[0] if cidades_norm else None
    uf_norm = ufs_norm[0] if ufs_norm else None

    _emit("db_query", 0, 0, "Consultando base de dados")

    _valid_col = "(TRIM({col}) != '' AND LOWER(TRIM({col})) != 'nan')"

    with get_connection(read_only=True) as con:
        sql = """
            SELECT
                e.cnpj,
                e.RAZAO_SOCIAL                                      AS razao_social,
                e.NOME_FANTASIA                                     AS nome_fantasia,
                e.cidade_nome                                       AS cidade,
                e.UF                                                AS uf,
                e.CNAE_PRINCIPAL                                    AS cnae_principal,
                e.cnae_descricao                                    AS cnae_descricao,
                e.PORTE_EMPRESA                                     AS porte_codigo,
                e.CAPITAL_SOCIAL_NUM                                AS capital_num,
                e.telefone_receita                                  AS tel_receita_raw,
                e.email_receita                                     AS email,

                e.site,
                e.email_enriquecido                                 AS email_web,
                e.telefone_enriquecido                              AS telefone_web,
                e.whatsapp_publico                                  AS whatsapp_publico_web,
                e.whatsapp_enriquecido                              AS whatsapp_enriq,
                e.outras_informacoes                                AS outras_info_web,
                e.email_final,
                e.telefone_final,
                e.whatsapp_final,

                e.sidra_pib                                         AS sidra_pib_corrente,
                e.sidra_populacao                                   AS sidra_pop_residente,
                e.sidra_pib_per_capita                              AS sidra_pib_per_capita,

                e.LOGRADOURO                                        AS estab_logradouro,
                e.NUMERO                                            AS estab_numero,
                e.COMPLEMENTO                                       AS estab_complemento,
                e.BAIRRO                                            AS estab_bairro,
                e.CEP                                               AS estab_cep,
                e.DATA_INICIO_ATIVIDADE                             AS data_abertura,
                e.NATUREZA_JURIDICA                                 AS natureza_juridica_cod,
                e.SITUACAO_CADASTRAL                                AS situacao_cadastral_cod

            FROM vw_prospeccao_base e
            WHERE 1=1
        """

        params: List[object] = []

        # ----- filtro por termo (nome/razão) -----
        if config.termo:
            like = f"%{config.termo.strip().upper()}%"
            sql += " AND (UPPER(e.RAZAO_SOCIAL) LIKE ? OR UPPER(e.NOME_FANTASIA) LIKE ?)"
            params.extend([like, like])

        # ----- multi-cidade -----
        if cidades_norm:
            if len(cidades_norm) == 1:
                sql += " AND UPPER(e.cidade_nome) = ?"
                params.append(cidades_norm[0])
            else:
                ph = ", ".join(["?"] * len(cidades_norm))
                sql += f" AND UPPER(e.cidade_nome) IN ({ph})"
                params.extend(cidades_norm)

        # ----- multi-UF -----
        if ufs_norm:
            if len(ufs_norm) == 1:
                sql += " AND UPPER(e.UF) = ?"
                params.append(ufs_norm[0])
            else:
                ph = ", ".join(["?"] * len(ufs_norm))
                sql += f" AND UPPER(e.UF) IN ({ph})"
                params.extend(ufs_norm)

        # ----- capital social mínima / máxima -----
        if config.capital_minima and config.capital_minima > 0:
            sql += " AND e.CAPITAL_SOCIAL_NUM >= ?"
            params.append(float(config.capital_minima))

        if config.capital_maxima and config.capital_maxima > 0:
            sql += " AND e.CAPITAL_SOCIAL_NUM <= ?"
            params.append(float(config.capital_maxima))

        # ----- idade da empresa -----
        if config.idade_minima_anos and config.idade_minima_anos > 0:
            anos_min = int(config.idade_minima_anos)
            sql += f" AND TRY_CAST(e.DATA_INICIO_ATIVIDADE AS DATE) <= CURRENT_DATE - INTERVAL '{anos_min}' YEAR"
        if config.idade_maxima_anos and config.idade_maxima_anos > 0:
            anos_max = int(config.idade_maxima_anos)
            sql += f" AND TRY_CAST(e.DATA_INICIO_ATIVIDADE AS DATE) >= CURRENT_DATE - INTERVAL '{anos_max}' YEAR"

        # ----- exigir contato acionável (telefone, email ou whatsapp) -----
        if config.exigir_contato:
            contact_checks = [
                f"(e.{col} IS NOT NULL AND {_valid_col.format(col='e.' + col)})"
                for col in [
                    "telefone_receita", "email_receita",
                    "telefone_enriquecido", "whatsapp_publico",
                    "whatsapp_enriquecido", "email_enriquecido",
                ]
            ]
            sql += " AND (" + " OR ".join(contact_checks) + ")"

        # ----- excluir CNPJs já prospectados -----
        if config.excluir_cnpjs:
            cnpjs_limpos = [c.strip() for c in config.excluir_cnpjs if c.strip()]
            if cnpjs_limpos:
                ph = ", ".join(["?"] * len(cnpjs_limpos))
                sql += f" AND e.cnpj NOT IN ({ph})"
                params.extend(cnpjs_limpos)

        # ----- cnaes / segmentos -----
        cnae_col = "e.CNAE_PRINCIPAL"
        if config.cnaes:
            cnaes_limpos = [re.sub(r"\D", "", str(c)) for c in config.cnaes if str(c).strip() and str(c).lower() != "string"]
            if cnaes_limpos:
                sql += " AND (" + " OR ".join([f"{cnae_col} LIKE ?"] * len(cnaes_limpos)) + ")"
                params.extend([f"{c}%" for c in cnaes_limpos])
        elif config.segmentos:
            prefixes: List[str] = []
            for seg in config.segmentos:
                seg_norm = _normalizar_segmento(seg)
                prefixes.extend(SEGMENTO_PREFIX_NORMALIZADO.get(seg_norm, []))
            prefixes = list(set(prefixes))
            if prefixes:
                sql += " AND (" + " OR ".join([f"{cnae_col} LIKE ?"] * len(prefixes)) + ")"
                params.extend([f"{p}%" for p in prefixes])

        # ----- portes -----
        if config.portes:
            codigos_portes = []
            for p in config.portes:
                codigos_portes.extend(PORTE_MAP.get(p, []))
            codigos_portes = list(set(codigos_portes))
            if codigos_portes:
                placeholders = ", ".join(["?"] * len(codigos_portes))
                sql += f" AND e.PORTE_EMPRESA IN ({placeholders})"
                params.extend(codigos_portes)

        # ----- ordenação: priorizar empresas com contato -----
        if config.priorizar_com_contato:
            contact_score = """
                CASE WHEN (e.whatsapp_publico IS NOT NULL AND {wap}) THEN 3 ELSE 0 END
              + CASE WHEN (e.whatsapp_enriquecido IS NOT NULL AND {wae}) THEN 3 ELSE 0 END
              + CASE WHEN (e.telefone_enriquecido IS NOT NULL AND {te}) THEN 2 ELSE 0 END
              + CASE WHEN (e.email_enriquecido IS NOT NULL AND {ee}) THEN 1 ELSE 0 END
              + CASE WHEN (e.telefone_receita IS NOT NULL AND {tr}) THEN 1 ELSE 0 END
              + CASE WHEN (e.email_receita IS NOT NULL AND {er}) THEN 1 ELSE 0 END
            """.format(
                wap=_valid_col.format(col="e.whatsapp_publico"),
                wae=_valid_col.format(col="e.whatsapp_enriquecido"),
                te=_valid_col.format(col="e.telefone_enriquecido"),
                ee=_valid_col.format(col="e.email_enriquecido"),
                tr=_valid_col.format(col="e.telefone_receita"),
                er=_valid_col.format(col="e.email_receita"),
            )
            sql += f" ORDER BY ({contact_score}) DESC, capital_num DESC NULLS LAST"
        else:
            sql += " ORDER BY capital_num DESC NULLS LAST"

        limit = min(config.limite_empresas or 50, 2000)
        sql += " LIMIT ?"
        params.append(limit)

        df = con.execute(sql, params).fetchdf()

    if df.empty:
        filtros_icp = FiltrosICP(
            capital_social_minimo=config.capital_minima,
            portes=config.portes or [],
            segmentos=config.segmentos or [],
            cidade=cidade_norm,
            uf=uf_norm,
            volume_por_regiao={},
            alinhamento_ideal_compra="Desconhecido",
        )
        enriquecimento = EnriquecimentoResumo(
            total_com_enriquecimento=0,
            total_sem_enriquecimento=0,
            porcentagem_enriquecida=0.0,
        )
        return ProspeccaoResultado(
            total_empresas=0,
            empresas=[],
            filtros_icp=filtros_icp,
            enriquecimento_web=enriquecimento,
        )

    cnpj_bases = sorted({str(row["cnpj"])[:8] for _, row in df.iterrows()})
    socios_map: dict[str, List[str]] = {}

    # socios_map: base -> lista de textos (retrocompatibilidade)
    # socios_estruturado_map: base -> lista de dicts completos
    socios_estruturado_map: dict[str, List[Dict[str, str]]] = {}

    if cnpj_bases:
        placeholders = ", ".join(["?"] * len(cnpj_bases))
        socios_sql = f"""
            SELECT
                CNPJ_BASICO,
                NOME_SOCIO,
                QUALIFICACAO_SOCIO,
                DATA_ENTRADA_SOCIEDADE,
                CPF_CNPJ_SOCIO,
                REPRESENTANTE_LEGAL,
                NOME_REPRESENTANTE
            FROM socios
            WHERE CNPJ_BASICO IN ({placeholders})
              AND NOME_SOCIO IS NOT NULL
            ORDER BY CNPJ_BASICO, DATA_ENTRADA_SOCIEDADE DESC
        """
        with get_connection(read_only=True) as con_socios:
            socios_df = con_socios.execute(socios_sql, cnpj_bases).df()

        for _, row in socios_df.iterrows():
            base = str(row["CNPJ_BASICO"])
            nome = (str(row["NOME_SOCIO"]) or "").strip()
            qual_cod  = str(row.get("QUALIFICACAO_SOCIO") or "").strip()
            qual_desc = QUALIFICACAO_SOCIO_MAP.get(qual_cod, qual_cod) if qual_cod else ""
            data_ent  = str(row.get("DATA_ENTRADA_SOCIEDADE") or "").strip()
            cpf_cnpj  = str(row.get("CPF_CNPJ_SOCIO") or "").strip()

            if not nome or nome.lower() in ("nan", "none", ""):
                continue

            # Texto legível retrocompatível
            desc = nome
            if qual_desc:
                desc += f" ({qual_desc})"
            socios_map.setdefault(base, []).append(desc)

            # Estruturado completo
            socios_estruturado_map.setdefault(base, []).append({
                "nome":           nome,
                "qualificacao":   qual_desc or qual_cod,
                "data_entrada":   data_ent,
                "cpf_cnpj":       cpf_cnpj,
            })

    # ── Query secundária: estabele (telefone2 + CNAEs secundários) ──────────
    # Filtramos pelo CNPJ completo para evitar scan total na tabela de 56M linhas
    cnpj_completos = sorted({str(row["cnpj"]) for _, row in df.iterrows()})
    estab_map: dict[str, Dict[str, Any]] = {}
    if cnpj_completos:
        # Filtramos por CNPJ_BASICO (8 dígitos) para aproveitar partição
        # e depois refinamos pelo CNPJ completo (mais seletivo, mais rápido)
        basicos_estab = list({c[:8] for c in cnpj_completos})
        placeholders_estab_b = ", ".join(["?"] * len(basicos_estab))
        placeholders_estab   = ", ".join(["?"] * len(cnpj_completos))
        estab_sql = f"""
            SELECT
                CNPJ_BASICO || CNPJ_ORDEM || CNPJ_DIGITO  AS cnpj_full,
                DDD1  AS ddd1,
                TELEFONE1 AS tel1,
                DDD2  AS ddd2,
                TELEFONE2 AS tel2,
                CNAES_SECUNDARIOS AS cnaes_sec_raw
            FROM estabele
            WHERE CNPJ_BASICO IN ({placeholders_estab_b})
              AND CNPJ_BASICO || CNPJ_ORDEM || CNPJ_DIGITO IN ({placeholders_estab})
        """
        try:
            with get_connection(read_only=True) as con_est:
                estab_df = con_est.execute(estab_sql, basicos_estab + cnpj_completos).df()
            for _, row in estab_df.iterrows():
                estab_map[str(row["cnpj_full"])] = {
                    "ddd1": row.get("ddd1"), "tel1": row.get("tel1"),
                    "ddd2": row.get("ddd2"), "tel2": row.get("tel2"),
                    "cnaes_sec_raw": row.get("cnaes_sec_raw"),
                }
        except Exception as _e:
            print(f"[estabele] aviso: {_e}")

    volume_por_regiao: dict[str, int] = {}
    for _, row in df.iterrows():
        uf_val = (row.get("uf") or "").strip().upper()
        if uf_val:
            volume_por_regiao[uf_val] = volume_por_regiao.get(uf_val, 0) + 1

    empresas: List[Empresa] = []
    total_rows = len(df)
    _emit("building", 0, total_rows, "Montando lista de empresas")

    for row_idx, (_, row) in enumerate(df.iterrows()):
        if row_idx % 20 == 0:
            _emit("building", row_idx, total_rows, f"Processando empresa {row_idx+1}/{total_rows}")
        cnpj_str = str(row["cnpj"])
        base = cnpj_str[:8]

        estab_dados = estab_map.get(cnpj_str, {})
        tel_receita_fmt = formatar_telefone(None, row.get("tel_receita_raw"))
        tel_estab1_fmt = formatar_telefone(
            estab_dados.get("ddd1"), estab_dados.get("tel1")
        )
        tel_estab2_fmt = formatar_telefone(
            estab_dados.get("ddd2"), estab_dados.get("tel2")
        )

        telefone_padrao = (
            tel_estab1_fmt
            or tel_receita_fmt
            or tel_estab2_fmt
        )

        socios_list = socios_map.get(base)
        socios_resumo = "\n".join(socios_list) if socios_list else None
        socios_estruturado = socios_estruturado_map.get(base)

        contexto_sidra = montar_contexto_sidra(
            row.get("sidra_pib_corrente"),
            row.get("sidra_pop_residente"),
            row.get("sidra_pib_per_capita"),
        )

        # Traduz natureza jurídica
        nat_cod  = str(row.get("natureza_juridica_cod") or "").strip()
        natureza = NATUREZA_JURIDICA_MAP.get(nat_cod, nat_cod) if nat_cod else None

        # Traduz situação cadastral
        sit_cod = str(row.get("situacao_cadastral_cod") or "").strip()
        sit_map = {"01": "Nula", "02": "Ativa", "03": "Suspensa",
                   "04": "Inapta", "08": "Baixada"}
        situacao = sit_map.get(sit_cod, sit_cod) if sit_cod else None

        # Data de abertura formatada
        data_ab_raw = str(row.get("data_abertura") or "").strip()
        if len(data_ab_raw) == 8 and data_ab_raw.isdigit():
            data_ab = f"{data_ab_raw[6:8]}/{data_ab_raw[4:6]}/{data_ab_raw[:4]}"
        else:
            data_ab = data_ab_raw or None

        # CNAEs secundários (vem da query secundária de estabele)
        cnaes_sec_raw = str(estab_dados.get("cnaes_sec_raw") or "").strip()
        cnaes_sec = None
        if cnaes_sec_raw and cnaes_sec_raw.lower() not in ("nan", "none", ""):
            cnaes_sec = [{"cnae": c.strip()} for c in cnaes_sec_raw.split(",") if c.strip()]

        capital_val = (
            float(row["capital_num"]) if row.get("capital_num") is not None else None
        )

        segmento = classificar_segmento_por_cnae(row.get("cnae_principal"))
        subsegmento = classificar_subsegmento_por_cnae_e_nome(
            row.get("cnae_principal"),
            row.get("razao_social") or row["razao_social"],
            row.get("nome_fantasia"),
        )
        porte_rotulo = mapear_porte(row.get("porte_codigo"))

        score_icp = calcular_score_icp(
            capital_val,
            config.capital_minima,
            row.get("uf"),
            uf_norm,
            row.get("cidade"),
            cidade_norm,
        )

        empresas.append(
            Empresa(
                # identificação
                cnpj=cnpj_str,
                razao_social=row["razao_social"],
                nome_fantasia=_as_opt_str(row.get("nome_fantasia")),
                natureza_juridica=natureza,
                data_abertura=data_ab,
                situacao_cadastral=situacao,
                cidade=_as_opt_str(row.get("cidade")),
                uf=_as_opt_str(row.get("uf")),
                cnae_principal=_as_opt_str(row.get("cnae_principal")),
                cnae_descricao=_as_opt_str(row.get("cnae_descricao")),
                cnaes_secundarios=cnaes_sec,
                capital_social=capital_val,
                # ICP
                porte=porte_rotulo,
                segmento=segmento,
                subsegmento=subsegmento,
                # contatos
                telefone_padrao=telefone_padrao,
                telefone_receita=tel_receita_fmt,
                telefone_estab1=tel_estab1_fmt,
                telefone_estab2=tel_estab2_fmt,
                email=_as_opt_str(row.get("email")),
                site=_as_opt_str(row.get("site")),
                email_enriquecido=_as_opt_str(row.get("email_web")),
                telefone_enriquecido=_as_opt_str(row.get("telefone_web")),
                whatsapp_publico=_as_opt_str(row.get("whatsapp_publico_web")),
                whatsapp_enriquecido=_as_opt_str(row.get("whatsapp_enriq")),
                outras_informacoes=_as_opt_str(row.get("outras_info_web")),
                # sócios
                socios_resumo=socios_resumo,
                socios_estruturado=socios_estruturado,
                # SIDRA
                contexto_sidra=contexto_sidra,
                sidra_pib=float(row["sidra_pib_corrente"]) if row.get("sidra_pib_corrente") else None,
                sidra_populacao=float(row["sidra_pop_residente"]) if row.get("sidra_pop_residente") else None,
                sidra_pib_per_capita=float(row["sidra_pib_per_capita"]) if row.get("sidra_pib_per_capita") else None,
                # endereço
                logradouro=_as_opt_str(row.get("estab_logradouro")),
                numero=_as_opt_str(row.get("estab_numero")),
                complemento=_as_opt_str(row.get("estab_complemento")),
                bairro=_as_opt_str(row.get("estab_bairro")),
                cep=_as_opt_str(row.get("estab_cep")),
                latitude=None,
                longitude=None,
                # score
                score_icp=score_icp,
            )
        )

    if config.enriquecer_web:
        _emit("enriching", 0, len(empresas), "Iniciando enriquecimento web")
        try:
            def _enrich_progress(idx, total, name):
                _emit("enriching", idx, total, name)
            enriquecer_empresas_online(empresas, on_progress=_enrich_progress)
        except Exception as e:
            print("[ENRIQUECIMENTO] erro enriquecimento inline:", repr(e))

        try:
            _enqueue_enrichment([e.cnpj for e in empresas])
        except Exception:
            pass

        _emit("enriching_socials", 0, len(empresas), "Enriquecendo redes sociais")
        try:
            enriquecer_redes_socios(empresas, on_progress=lambda i, t, n: _emit("enriching_socials", i, t, n))
        except Exception as e:
            print("[ENRIQUECIMENTO] erro geral redes sócios:", repr(e))

        # WhatsApp Ultra Discovery — busca multi-camada para empresas sem WhatsApp
        _emit("enriching_whatsapp_ultra", 0, 0, "Descoberta avançada de WhatsApp")
        try:
            _enriquecer_whatsapp_ultra_inline(empresas, on_progress=lambda i, t, n: _emit("enriching_whatsapp_ultra", i, t, n))
        except Exception as e:
            print("[WHATSAPP ULTRA] erro geral:", repr(e))

        # Última camada: promover celulares conhecidos para WhatsApp
        _emit("enriching_whatsapp_ultra", 0, 0, "Promovendo celulares para WhatsApp")
        try:
            _promover_telefone_para_whatsapp(empresas)
        except Exception as e:
            print("[WHATSAPP PROMO] erro:", repr(e))

    total_empresas = len(empresas)

    def tem_contato_acionavel(emp: Empresa) -> bool:
        return bool(
            emp.telefone_padrao
            or emp.telefone_receita
            or emp.telefone_estab1
            or emp.telefone_estab2
            or emp.telefone_enriquecido
            or emp.whatsapp_publico
            or emp.whatsapp_enriquecido
            or emp.email
            or emp.email_enriquecido
        )

    total_com_enriquecimento = sum(1 for emp in empresas if tem_contato_acionavel(emp))
    total_sem_enriquecimento = total_empresas - total_com_enriquecimento
    porcentagem_enriquecida = (
        (total_com_enriquecimento / total_empresas) * 100.0
        if total_empresas > 0
        else 0.0
    )

    filtros_icp = FiltrosICP(
        capital_social_minimo=config.capital_minima,
        portes=config.portes or [],
        segmentos=config.segmentos or [],
        cidade=cidade_norm,
        uf=uf_norm,
        volume_por_regiao=volume_por_regiao,
        alinhamento_ideal_compra=calcular_alinhamento_ideal_compra(
            total_empresas, volume_por_regiao, config.capital_minima
        ),
    )

    enriquecimento = EnriquecimentoResumo(
        total_com_enriquecimento=total_com_enriquecimento,
        total_sem_enriquecimento=total_sem_enriquecimento,
        porcentagem_enriquecida=porcentagem_enriquecida,
    )

    result = ProspeccaoResultado(
        total_empresas=total_empresas,
        empresas=empresas,
        filtros_icp=filtros_icp,
        enriquecimento_web=enriquecimento,
    )

    _emit("done", total_empresas, total_empresas, f"{total_empresas} empresas encontradas")

    # --- Cache Save ---
    cache_service.set("prospeccao_icp", result.model_dump(), **cache_key)

    return result


# ==========================================================
# MAPA DE CALOR
# ==========================================================


def gerar_mapa_calor(config: MapaCalorRequest) -> MapaCalorResponse:
    sql = """
        SELECT
            e.UF                            AS uf,
            m.NOME_MUNICIPIO                AS municipio,
            COUNT(*)                        AS total_empresas,
            SUM(
                TRY_CAST(
                    REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE
                )
            )                               AS capital_social_total
        FROM cnpj_empresas e
        LEFT JOIN municipios m
               ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
        WHERE 1=1
    """

    params: List[object] = []

    if config.termo_base:
        like = f"%{config.termo_base.strip().upper()}%"
        sql += " AND (UPPER(e.RAZAO_SOCIAL) LIKE ? OR UPPER(e.NOME_FANTASIA) LIKE ?)"
        params.extend([like, like])

    if config.cidade:
        cidade_norm = config.cidade.strip().upper()
        sql += " AND UPPER(m.NOME_MUNICIPIO) = ?"
        params.append(cidade_norm)

    if config.uf and config.uf != "Todas":
        uf_norm = config.uf.strip().upper()
        sql += " AND UPPER(e.UF) = ?"
        params.append(uf_norm)

    if config.capital_minimo is not None and config.capital_minimo > 0:
        sql += """
            AND TRY_CAST(
                REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE
            ) >= ?
        """
        params.append(config.capital_minimo)

    sql += """
        GROUP BY e.UF, m.NOME_MUNICIPIO
        ORDER BY total_empresas DESC
    """

    with get_connection(read_only=True) as con:
        df = con.execute(sql, params).df()

    if df.empty:
        return MapaCalorResponse(pontos=[])

    def safe_int(value) -> int:
        try:
            if value is None:
                return 0
            v = int(value)
            if v != v:
                return 0
            return v
        except (TypeError, ValueError):
            return 0

    def safe_float(value) -> float:
        try:
            if value is None:
                return 0.0
            f = float(value)
            if f != f:
                return 0.0
            return f
        except (TypeError, ValueError):
            return 0.0

    pontos: List[MapaCalorPonto] = []

    for _, row in df.iterrows():
        uf = (row.get("uf") or "").strip().upper()
        municipio = (row.get("municipio") or "").strip()

        lat, lon = UF_CENTER.get(uf, (-14.235, -51.9253))

        total_empresas_val = safe_int(row.get("total_empresas"))
        capital_social_total_val = safe_float(row.get("capital_social_total"))

        pontos.append(
            MapaCalorPonto(
                uf=uf,
                municipio=municipio,
                latitude=float(lat),
                longitude=float(lon),
                total_empresas=total_empresas_val,
                capital_social_total=capital_social_total_val,
            )
        )

    return MapaCalorResponse(pontos=pontos)


# ==========================================================
# HELPERS DE IA PARA INSIGHTS DE PROSPECÇÃO
# ==========================================================


def gerar_insights_prospeccao_ia(contexto_empresa: dict) -> dict:
    """
    Chama OpenRouter para gerar insights de prospecção B2B.
    Retorna sempre um dict com as chaves esperadas, mesmo em caso de erro.
    """
    vazio = {
        "resumo_empresa": None,
        "angulo_mensagem": None,
        "canais_prioritarios": None,
        "pontos_atencao": None,
    }

    if not AI_API_KEY:
        return vazio

    prompt = f"""
Você é um especialista em prospecção B2B.

Com base nos dados abaixo de uma empresa, gere INSIGHTS PRÁTICOS para um SDR que vai abordar esse lead.

Responda APENAS em JSON válido, no seguinte formato:

{{
  "resumo_empresa": "frase curta explicando quem é a empresa e o que faz",
  "angulo_mensagem": "como você sugere que o SDR se apresente e conecte o problema com a solução (1 parágrafo curto)",
  "canais_prioritarios": ["lista de canais em ordem de prioridade (ex: 'WhatsApp', 'telefone', 'LinkedIn', 'e-mail')"],
  "pontos_atencao": ["2 a 4 pontos de atenção sobre timing, autoridade, porte, estrutura etc."]
}}

DADOS DA EMPRESA:
\"\"\"{json.dumps(contexto_empresa, ensure_ascii=False)}\"\"\""""

    try:
        resp = httpx.post(
            AI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {AI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": "Você responde apenas com JSON válido."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
            },
            timeout=40.0,
        )
        resp.raise_for_status()
        data = resp.json()
        texto_ia = data["choices"][0]["message"]["content"].strip()

        try:
            dados_ia = json.loads(texto_ia)
        except Exception:
            # se vier texto "solto", joga tudo em resumo_empresa
            dados_ia = vazio.copy()
            dados_ia["resumo_empresa"] = texto_ia

        # garante que todas as chaves existam
        for k in vazio.keys():
            dados_ia.setdefault(k, None)

        return dados_ia
    except Exception as e:
        print("[IA] erro ao gerar insights de prospecção (OpenRouter):", repr(e))
        return vazio


# ==========================================================
# ENDPOINTS
# ==========================================================


@app.get("/health")
async def health():
    return {
        "status": "online",
        "api": "Projeto Hermes",
        "version": "1.6.0",
        "database": db_healthcheck()
    }


@app.get("/admin/orgs")
async def list_orgs(request: Request, _user: dict = Depends(require_auth)):
    """
    Lista organizações do tenant (multi-tenant).
    Por enquanto retorna uma org default; depois integrar com DB/auth.
    """
    org_id = get_org_id(request)
    return [
        {"id": org_id, "name": "Minha Organização", "slug": org_id, "role": "admin"},
    ]


# ── Geração de mensagens de abordagem ──────────────────────────────────────────

class EmpresaResumoMensagem(BaseModel):
    razao_social: str
    nome_fantasia: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    segmento: Optional[str] = None
    porte: Optional[str] = None
    capital_social: Optional[float] = None
    cnae_descricao: Optional[str] = None
    socios_resumo: Optional[str] = None
    site: Optional[str] = None

class MensagemRequest(BaseModel):
    empresa: EmpresaResumoMensagem
    canal: str  # "whatsapp" | "email" | "linkedin"
    produto: Optional[str] = ""

class MensagemResponse(BaseModel):
    canal: str
    assunto: Optional[str] = None
    corpo: str
    ia: bool

@app.post("/prospeccao/gerar-mensagem", response_model=MensagemResponse)
async def gerar_mensagem_abordagem(body: MensagemRequest):
    """
    Gera uma mensagem de abordagem personalizada para o lead.
    Usa OpenRouter/IA se disponível, caso contrário retorna template.
    """
    emp = body.empresa
    canal = body.canal
    produto = body.produto or "nossa solução"

    # Template fallback (sem IA)
    nome = emp.nome_fantasia or emp.razao_social
    cidade_str = f" em {emp.cidade}" if emp.cidade else ""
    segmento_str = emp.segmento or "mercado"

    templates = {
        "whatsapp": {
            "corpo": f"Olá! Tudo bem?\n\nSou [Seu nome] da [Sua empresa]. Vi que a *{nome}* atua no segmento de {segmento_str}{cidade_str} e acredito que {produto} pode fazer muito sentido para vocês.\n\nPodemos conversar rapidinho? 😊",
            "assunto": None,
        },
        "email": {
            "assunto": f"{nome} × [Sua empresa]",
            "corpo": f"Olá,\n\nMeu nome é [Seu nome], da [Sua empresa].\n\nIdentificamos que a {nome} atua no segmento de {segmento_str}{cidade_str} — exatamente o perfil que mais se beneficia de {produto}.\n\nPodemos agendar 15 minutos esta semana?\n\nAtenciosamente,\n[Seu nome]",
        },
        "linkedin": {
            "corpo": f"Olá! Vi que vocês ({nome}) atuam em {segmento_str}{cidade_str}. Trabalho na [Sua empresa] e acredito que {produto} pode agregar valor à operação de vocês. Aceita trocar uma ideia? 😊",
            "assunto": None,
        },
    }

    if not AI_API_KEY:
        t = templates.get(canal, templates["whatsapp"])
        return MensagemResponse(canal=canal, assunto=t.get("assunto"), corpo=t["corpo"], ia=False)

    # Geração com IA
    instrucao_canal = {
        "whatsapp": "Mensagem curta e informal para WhatsApp (max 3 parágrafos curtos, use *negrito* para destacar). NÃO use markdown de email.",
        "email": "E-mail profissional com assunto e corpo. Retorne JSON: {\"assunto\": \"...\", \"corpo\": \"...\"}",
        "linkedin": "Mensagem de conexão no LinkedIn, objetiva e profissional (max 300 caracteres).",
    }.get(canal, "Mensagem de abordagem comercial.")

    contexto = {
        "empresa": emp.razao_social,
        "nome_fantasia": emp.nome_fantasia,
        "cidade": emp.cidade,
        "uf": emp.uf,
        "segmento": emp.segmento,
        "porte": emp.porte,
        "cnae": emp.cnae_descricao,
        "socios": emp.socios_resumo,
        "site": emp.site,
        "produto_servico": produto,
    }

    prompt = f"""Você é um SDR especialista em B2B. Crie UMA mensagem de abordagem personalizada para o lead abaixo.

Canal: {canal.upper()}
Instrução: {instrucao_canal}

Dados do lead:
{json.dumps(contexto, ensure_ascii=False, indent=2)}

Regras:
- Personalize com dados reais do lead (segmento, cidade, nome)
- Seja direto ao ponto, não genérico
- Máximo 150 palavras
- {'Responda apenas com JSON {"assunto": "...", "corpo": "..."}' if canal == "email" else 'Responda apenas com o texto da mensagem, sem explicações'}"""

    try:
        resp = httpx.post(
            AI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {AI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": "Você é um SDR B2B especialista. Responda apenas com o conteúdo solicitado."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        texto = resp.json()["choices"][0]["message"]["content"].strip()

        if canal == "email":
            try:
                parsed = json.loads(texto)
                return MensagemResponse(canal=canal, assunto=parsed.get("assunto"), corpo=parsed.get("corpo", texto), ia=True)
            except Exception:
                pass

        return MensagemResponse(canal=canal, assunto=None, corpo=texto, ia=True)

    except Exception as e:
        print(f"[MENSAGEM IA] erro: {repr(e)}")
        t = templates.get(canal, templates["whatsapp"])
        return MensagemResponse(canal=canal, assunto=t.get("assunto"), corpo=t["corpo"], ia=False)


@app.post("/mapa-calor", response_model=MapaCalorResponse)
async def mapa_calor_endpoint(config: MapaCalorRequest):
    try:
        resultado = gerar_mapa_calor(config)
        return resultado
    except Exception as e:
        print("ERRO AO GERAR MAPA DE CALOR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/prospeccao/run", response_model=ProspeccaoResultado)
async def run_prospeccao(request: Request, config: ProspeccaoConfig):
    org_id = get_org_id(request)
    if config.enriquecer_web:
        need = config.limite_empresas or 20
        if not _consume_credits(org_id, need):
            raise HTTPException(
                status_code=402,
                detail=f"Créditos insuficientes. Necessário: {need}, saldo: {_get_credits(org_id)}. Desative 'Enriquecimento web' ou adquira mais créditos.",
            )
    try:
        resultado = rodar_prospeccao_icp(config)
        return resultado
    except Exception as e:
        print("ERRO AO RODAR PROSPECÇÃO:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/test-ia")
async def test_ia():
    """Testa se a IA esta funcionando."""
    texto_fake = (
        "A Rede D'Or é um dos maiores grupos hospitalares do Brasil, com presença em vários estados, "
        "atuando com hospitais gerais, unidades de oncologia, cardiologia e diagnósticos."
    )
    resumo = await resumir_site_com_ia(texto_fake)
    return {
        "tem_chave_configurada": bool(AI_API_KEY),
        "resumo_ia_retorno": resumo,
    }


@app.post("/prospeccao/insights-ia")
async def run_prospeccao_insights_ia(config: ProspeccaoConfig):
    """
    Endpoint de teste que usa:
    - scraper + enriquecimento_web
    - IA para gerar resumo e ângulo de abordagem comercial
    """
    resultado_base = rodar_prospeccao_icp(config)

    if not AI_API_KEY:
        return {
            "ia_ativa": False,
            "mensagem": "IA não configurada. Retornando apenas dados crus.",
            "resultado": resultado_base,
        }

    empresas_com_insights: List[dict] = []

    # para não gastar demais, vamos só nas 3 primeiras empresas
    for emp in resultado_base.empresas[:3]:
        contexto_empresa = {
            "razao_social": emp.razao_social,
            "nome_fantasia": emp.nome_fantasia,
            "cidade": emp.cidade,
            "uf": emp.uf,
            "segmento": emp.segmento,
            "subsegmento": emp.subsegmento,
            "porte": emp.porte,
            "capital_social": emp.capital_social,
            "contexto_sidra": emp.contexto_sidra,
            "telefone_padrao": emp.telefone_padrao,
            "telefone_enriquecido": emp.telefone_enriquecido,
            "whatsapp_publico": emp.whatsapp_publico,
            "email": emp.email or emp.email_enriquecido,
            "outras_informacoes": emp.outras_informacoes,
            "socios_resumo": emp.socios_resumo,
            "resumo_ia_empresa": emp.resumo_ia_empresa,
        }

        dados_ia = gerar_insights_prospeccao_ia(contexto_empresa)

        empresas_com_insights.append(
            {
                "empresa": emp,
                "insights_ia": dados_ia,
            }
        )

    return {
        "ia_ativa": True,
        "total_empresas_base": resultado_base.total_empresas,
        "filtros_icp": resultado_base.filtros_icp,
        "enriquecimento_web": resultado_base.enriquecimento_web,
        "empresas_com_insights": empresas_com_insights,
    }



# ==========================================================
# FIM DOS ENDPOINTS LEGADOS
# Os endpoints de créditos, CRM e webhooks agora vivem
# nos routers modulares (api/routers/credits.py, crm.py, etc.)
# ==========================================================



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
