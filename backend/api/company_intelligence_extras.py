from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from api.db_pool import get_connection

try:
    from core_scraper import buscar_google
except ImportError:
    buscar_google = None  # type: ignore


logger = logging.getLogger(__name__)

JOB_KEYWORDS = (
    "vagas",
    "trabalhe conosco",
    "careers",
    "jobs",
    "hiring",
    "recrutamento",
)
FUNDING_KEYWORDS = (
    "aporte",
    "captacao",
    "funding",
    "investimento",
    "rodada",
    "valuation",
    "series a",
    "series b",
    "seed",
)
GROWTH_KEYWORDS = (
    "expansao",
    "inaugura",
    "contratando",
    "crescimento",
    "parceria",
    "lanca",
    "nova unidade",
)
NEWS_PATH_HINTS = ("/blog", "/noticias", "/noticia", "/news", "/imprensa", "/artigo")


def _normalize_text(value: Any) -> str:
    text = str(value or "").lower().strip()
    return re.sub(r"\s+", " ", text)


def _extract_domain(url_or_domain: Any) -> str:
    raw = str(url_or_domain or "").strip().lower()
    if not raw:
        return ""
    try:
        parsed = urlparse(raw if "://" in raw else f"https://{raw}")
        host = (parsed.hostname or "").lower()
    except Exception:
        host = raw
    return host.replace("www.", "").strip(".")


def _has_any(text: str, keywords: tuple[str, ...]) -> bool:
    normalized = _normalize_text(text)
    return any(keyword in normalized for keyword in keywords)


def _site_hint_query(domain: str, company_name: str, keywords: tuple[str, ...]) -> Optional[str]:
    if not domain:
        return None
    clauses = " OR ".join(f'"{keyword}"' if " " in keyword else keyword for keyword in keywords)
    return f'site:{domain} ("{company_name}" OR "{domain}") ({clauses})'


def _generic_query(company_name: str, keywords: tuple[str, ...]) -> str:
    clauses = " OR ".join(f'"{keyword}"' if " " in keyword else keyword for keyword in keywords)
    return f'"{company_name}" ({clauses})'


def _classify_signal(result: Dict[str, Any], domain: str) -> Optional[Dict[str, Any]]:
    link = str(result.get("link") or "").strip()
    title = str(result.get("titulo") or result.get("title") or "").strip()
    snippet = str(result.get("descricao") or result.get("body") or "").strip()
    haystack = f"{title} {snippet} {link}"
    host = _extract_domain(link)

    signal_type = None
    title_prefix = None
    if _has_any(haystack, JOB_KEYWORDS):
        signal_type = "jobs_signal"
        title_prefix = "Sinal de vagas"
    elif _has_any(haystack, FUNDING_KEYWORDS):
        signal_type = "funding_signal"
        title_prefix = "Sinal de investimento"
    elif _has_any(haystack, GROWTH_KEYWORDS):
        signal_type = "growth_signal"
        title_prefix = "Sinal de expansao"
    elif any(hint in link.lower() for hint in NEWS_PATH_HINTS):
        signal_type = "news_signal"
        title_prefix = "Sinal de noticia"

    if not signal_type:
        return None

    if domain and host and domain not in host and signal_type == "news_signal":
        return None

    return {
        "signal_type": signal_type,
        "title": f"{title_prefix}: {title or host or 'resultado web'}",
        "payload": {
            "url": link or None,
            "title": title or None,
            "snippet": snippet or None,
            "domain": host or None,
        },
    }


def _fetch_company_context(cnpj: str) -> Optional[Dict[str, Any]]:
    with get_connection(read_only=True) as conn:
        row = conn.execute(
            """
            SELECT
                e.CNPJ_COMPLETO,
                e.RAZAO_SOCIAL,
                e.NOME_FANTASIA,
                m.NOME_MUNICIPIO,
                e.UF,
                e.CNAE_PRINCIPAL,
                e.PORTE_EMPRESA,
                TRY_CAST(
                    REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE
                ) AS capital_social,
                e.EMAIL,
                e.TELEFONE1,
                COALESCE(ew.site, NULL) AS site,
                COALESCE(ew.whatsapp_enriquecido, ew.whatsapp_publico, NULL) AS whatsapp
            FROM cnpj_empresas e
            LEFT JOIN municipios m
                ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
            LEFT JOIN empresas_enriquecidas ew
                ON ew.cnpj = e.CNPJ_COMPLETO
            WHERE e.CNPJ_COMPLETO = ?
            LIMIT 1
            """,
            [cnpj],
        ).fetchone()

    if not row:
        return None

    return {
        "cnpj": str(row[0]),
        "razao_social": str(row[1] or ""),
        "nome_fantasia": str(row[2]) if row[2] else None,
        "cidade": str(row[3]) if row[3] else None,
        "uf": str(row[4]) if row[4] else None,
        "cnae_principal": str(row[5]) if row[5] else None,
        "porte_empresa": str(row[6]) if row[6] else None,
        "capital_social": float(row[7]) if row[7] is not None else None,
        "email": str(row[8]) if row[8] else None,
        "telefone": str(row[9]) if row[9] else None,
        "site": str(row[10]) if row[10] else None,
        "whatsapp": str(row[11]) if row[11] else None,
    }


class CompanyIntelligenceExtrasService:
    def find_similar_companies(
        self,
        cnpj: str,
        limit: int = 12,
        *,
        company_context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        company = company_context or _fetch_company_context(cnpj)
        if not company:
            raise LookupError("Empresa nao encontrada.")

        limit = max(1, min(int(limit or 12), 25))
        with get_connection(read_only=True) as conn:
            rows = conn.execute(
                """
                WITH target AS (
                    SELECT
                        ? AS cnpj,
                        ? AS cnae_principal,
                        ? AS uf,
                        ? AS cidade,
                        ? AS porte_empresa,
                        ? AS capital_social
                )
                SELECT
                    e.CNPJ_COMPLETO AS cnpj,
                    e.RAZAO_SOCIAL AS razao_social,
                    e.NOME_FANTASIA AS nome_fantasia,
                    m.NOME_MUNICIPIO AS cidade,
                    e.UF AS uf,
                    e.CNAE_PRINCIPAL AS cnae_principal,
                    e.PORTE_EMPRESA AS porte_empresa,
                    TRY_CAST(REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE) AS capital_social,
                    e.EMAIL AS email_receita,
                    e.TELEFONE1 AS telefone_receita,
                    COALESCE(ew.site, NULL) AS site,
                    COALESCE(ew.whatsapp_enriquecido, ew.whatsapp_publico, NULL) AS whatsapp,
                    (
                        CASE
                            WHEN e.CNAE_PRINCIPAL = target.cnae_principal THEN 48
                            WHEN SUBSTR(e.CNAE_PRINCIPAL, 1, 4) = SUBSTR(target.cnae_principal, 1, 4) THEN 24
                            ELSE 0
                        END
                        + CASE WHEN e.UF = target.uf THEN 10 ELSE 0 END
                        + CASE WHEN m.NOME_MUNICIPIO = target.cidade THEN 8 ELSE 0 END
                        + CASE WHEN COALESCE(e.PORTE_EMPRESA, '') = COALESCE(target.porte_empresa, '') AND COALESCE(e.PORTE_EMPRESA, '') <> '' THEN 12 ELSE 0 END
                        + CASE
                            WHEN target.capital_social IS NULL OR target.capital_social <= 0 THEN 0
                            WHEN TRY_CAST(REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE) IS NULL THEN 0
                            WHEN ABS(TRY_CAST(REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE) - target.capital_social) / target.capital_social <= 0.25 THEN 12
                            WHEN ABS(TRY_CAST(REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE) - target.capital_social) / target.capital_social <= 0.5 THEN 7
                            ELSE 0
                        END
                        + CASE WHEN e.EMAIL IS NOT NULL AND e.EMAIL <> '' THEN 4 ELSE 0 END
                        + CASE WHEN e.TELEFONE1 IS NOT NULL AND e.TELEFONE1 <> '' THEN 3 ELSE 0 END
                        + CASE WHEN COALESCE(ew.whatsapp_enriquecido, ew.whatsapp_publico, '') <> '' THEN 5 ELSE 0 END
                    ) AS similarity_score
                FROM cnpj_empresas e
                CROSS JOIN target
                LEFT JOIN municipios m
                    ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
                LEFT JOIN empresas_enriquecidas ew
                    ON ew.cnpj = e.CNPJ_COMPLETO
                WHERE e.CNPJ_COMPLETO <> target.cnpj
                  AND (
                    e.CNAE_PRINCIPAL = target.cnae_principal
                    OR SUBSTR(e.CNAE_PRINCIPAL, 1, 4) = SUBSTR(target.cnae_principal, 1, 4)
                  )
                ORDER BY similarity_score DESC, capital_social DESC NULLS LAST
                LIMIT ?
                """,
                [
                    company["cnpj"],
                    company["cnae_principal"],
                    company["uf"],
                    company["cidade"],
                    company["porte_empresa"],
                    company["capital_social"],
                    limit,
                ],
            ).fetchall()

        return [
            {
                "cnpj": str(row[0]),
                "razao_social": str(row[1] or ""),
                "nome_fantasia": str(row[2]) if row[2] else None,
                "cidade": str(row[3]) if row[3] else None,
                "uf": str(row[4]) if row[4] else None,
                "cnae_principal": str(row[5]) if row[5] else None,
                "porte_empresa": str(row[6]) if row[6] else None,
                "capital_social": float(row[7]) if row[7] is not None else None,
                "email_receita": str(row[8]) if row[8] else None,
                "telefone_receita": str(row[9]) if row[9] else None,
                "site": str(row[10]) if row[10] else None,
                "whatsapp": str(row[11]) if row[11] else None,
                "similarity_score": float(row[12] or 0),
            }
            for row in rows
        ]

    async def fetch_external_signals(
        self,
        cnpj: str,
        company: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        company_data = company or _fetch_company_context(cnpj)
        if not company_data:
            raise LookupError("Empresa nao encontrada.")
        if buscar_google is None:
            return []

        company_name = company_data.get("nome_fantasia") or company_data.get("razao_social") or ""
        domain = _extract_domain(company_data.get("site"))
        queries = [
            _site_hint_query(domain, company_name, JOB_KEYWORDS),
            _generic_query(company_name, FUNDING_KEYWORDS),
            _generic_query(company_name, GROWTH_KEYWORDS),
        ]
        queries = [query for query in queries if query]

        tasks = [buscar_google(query, num_results=6) for query in queries]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        unique: Dict[str, Dict[str, Any]] = {}
        for batch in results:
            if isinstance(batch, Exception):
                logger.debug("Falha ao buscar sinais externos para %s: %s", cnpj, batch)
                continue
            for item in batch or []:
                signal = _classify_signal(item, domain)
                if not signal:
                    continue
                url = str((signal.get("payload") or {}).get("url") or "")
                dedupe_key = f"{signal['signal_type']}::{url or signal['title']}"
                if dedupe_key not in unique:
                    unique[dedupe_key] = signal

        return list(unique.values())


company_intelligence_extras_service = CompanyIntelligenceExtrasService()
