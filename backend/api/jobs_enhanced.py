"""
RQ Job functions for enhanced background enrichment (hermes queue).
Used by prospeccao_service.py's modular endpoint.
"""
import os
import sys
import asyncio
import logging

logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WHATSAPP_ULTRA_CACHE_TTL = max(300, int(os.getenv("HERMES_WHATSAPP_ULTRA_CACHE_TTL", "21600") or 21600))


def _load_company_snapshot(cnpj: str) -> tuple[dict, dict] | tuple[None, None]:
    from api.db_pool import get_connection

    with get_connection(read_only=False) as con:
        row = con.execute(
            """
            SELECT
                cnpj,
                RAZAO_SOCIAL,
                NOME_FANTASIA,
                cidade_nome,
                UF,
                CNAE_PRINCIPAL,
                site,
                email_receita,
                email_enriquecido,
                telefone_enriquecido,
                whatsapp_publico,
                whatsapp_enriquecido,
                outras_informacoes
            FROM vw_prospeccao_base
            WHERE cnpj = ?
            LIMIT 1
            """,
            [cnpj],
        ).fetchone()

        if not row:
            return None, None

        socios_rows = con.execute(
            """
            SELECT NOME_SOCIO
            FROM socios
            WHERE CNPJ_BASICO = ?
            LIMIT 3
            """,
            [str(cnpj)[:8]],
        ).fetchall()

    snapshot = {
        "cnpj": str(row[0]),
        "razao_social": str(row[1] or ""),
        "nome_fantasia": str(row[2]) if row[2] else None,
        "cidade": str(row[3]) if row[3] else None,
        "uf": str(row[4]) if row[4] else None,
        "cnae_principal": str(row[5]) if row[5] else None,
        "site": str(row[6]) if row[6] else None,
        "email": str(row[7]) if row[7] else None,
        "email_enriquecido": str(row[8]) if row[8] else None,
        "telefone_enriquecido": str(row[9]) if row[9] else None,
        "whatsapp_publico": str(row[10]) if row[10] else None,
        "whatsapp_enriquecido": str(row[11]) if row[11] else None,
        "outras_informacoes": str(row[12]) if row[12] else None,
    }
    context = {
        "razao_social": snapshot["razao_social"],
        "nome_fantasia": snapshot["nome_fantasia"],
        "cidade": snapshot["cidade"],
        "uf": snapshot["uf"],
        "cnae_principal": snapshot["cnae_principal"],
        "site": snapshot["site"],
        "socios": [str(item[0]).strip() for item in socios_rows if item and item[0]],
    }
    return snapshot, context


def _persist_merged_snapshot(cnpj: str, merged: dict) -> None:
    from api.db_pool import get_connection

    with get_connection(read_only=False) as con_w:
        con_w.execute("""
            CREATE TABLE IF NOT EXISTS empresas_enriquecidas (
                cnpj VARCHAR PRIMARY KEY,
                site VARCHAR,
                email_enriquecido VARCHAR,
                telefone_enriquecido VARCHAR,
                whatsapp_publico VARCHAR,
                whatsapp_enriquecido VARCHAR,
                outras_informacoes VARCHAR
            )
        """)
        con_w.execute(
            """
            INSERT OR REPLACE INTO empresas_enriquecidas (
                cnpj,
                site,
                email_enriquecido,
                telefone_enriquecido,
                whatsapp_publico,
                whatsapp_enriquecido,
                outras_informacoes
            ) VALUES (?,?,?,?,?,?,?)
            """,
            [
                cnpj,
                merged.get("site"),
                merged.get("email_enriquecido"),
                merged.get("telefone_enriquecido"),
                merged.get("whatsapp_publico"),
                merged.get("whatsapp_enriquecido"),
                merged.get("outras_informacoes"),
            ],
        )


def _cache_whatsapp_ultra_payload(cnpj: str, payload: dict) -> None:
    try:
        from api.cache_service import cache_service

        cache_payload = {
            "whatsapp": payload.get("whatsapp_ultra") or payload.get("whatsapp") or {},
            "instagram": payload.get("instagram") or {},
            "linkinbio": payload.get("linkinbio") or {},
            "linkedin_ultra": payload.get("linkedin_ultra") or payload.get("linkedin_socios") or [],
        }
        if any(cache_payload.values()):
            cache_service.set(
                "whatsapp_ultra_company",
                cache_payload,
                ttl=WHATSAPP_ULTRA_CACHE_TTL,
                cnpj=cnpj,
            )
    except Exception as exc:
        logger.debug("[JOB_ENHANCED] cache skip for %s: %s", cnpj, exc)


def enrich_company_by_cnpj_enhanced(cnpj: str) -> dict:
    """
    Enhanced background enrichment via EnrichmentService.
    Falls back to basic scraping if the full service is unavailable.
    """
    try:
        from api.enrichment_service import EnrichmentService
        from api.enrichment_merge import merge_enrichment_payload

        snapshot, context = _load_company_snapshot(cnpj)
        if not snapshot or not context:
            logger.warning(f"[JOB_ENHANCED] CNPJ {cnpj} not found")
            return {"cnpj": cnpj, "status": "not_found"}

        svc = EnrichmentService()
        resultado = asyncio.run(
            svc.enrich_company_complete(
                cnpj=cnpj,
                razao_social=context["razao_social"] or "",
                nome_fantasia=context["nome_fantasia"],
                cidade=context["cidade"],
                uf=context["uf"],
                cnae=context["cnae_principal"],
                site=context["site"],
                socios=context["socios"],
                score_icp=5,
                gerar_pitch=False,
            )
        )

        merged = merge_enrichment_payload(snapshot, resultado)
        _cache_whatsapp_ultra_payload(cnpj, resultado)

        if any(
            [
                merged.get("site"),
                merged.get("email_enriquecido"),
                merged.get("telefone_enriquecido"),
                merged.get("whatsapp_publico"),
                merged.get("whatsapp_enriquecido"),
            ]
        ):
            try:
                _persist_merged_snapshot(cnpj, merged)
            except Exception as e:
                logger.warning(f"[JOB_ENHANCED] persist failed for {cnpj}: {e}")

        return {
            "cnpj": cnpj,
            "site": merged.get("site"),
            "email": merged.get("email_enriquecido"),
            "telefone": merged.get("telefone_enriquecido"),
            "whatsapp": merged.get("whatsapp_enriquecido") or merged.get("whatsapp_publico"),
            "status": "enriched",
        }

    except Exception as e:
        logger.error(f"[JOB_ENHANCED] failed for {cnpj}: {e}")
        from api.jobs import enrich_company_by_cnpj
        return enrich_company_by_cnpj(cnpj)
