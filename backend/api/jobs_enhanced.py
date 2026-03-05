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


def enrich_company_by_cnpj_enhanced(cnpj: str) -> dict:
    """
    Enhanced background enrichment via EnrichmentService.
    Falls back to basic scraping if the full service is unavailable.
    """
    try:
        from api.enrichment_service import EnrichmentService
        from api.db_pool import get_connection

        with get_connection(read_only=True) as con:
            row = con.execute(
                "SELECT RAZAO_SOCIAL, NOME_FANTASIA, cidade_nome, UF "
                "FROM vw_prospeccao_base WHERE cnpj = ? LIMIT 1",
                [cnpj],
            ).fetchone()

        if not row:
            logger.warning(f"[JOB_ENHANCED] CNPJ {cnpj} not found")
            return {"cnpj": cnpj, "status": "not_found"}

        razao, fantasia, cidade, uf = row
        empresa_nome = fantasia or razao or ""

        svc = EnrichmentService()
        resultado = asyncio.run(
            svc.enrich_ultra(
                cnpj=cnpj,
                razao_social=razao or "",
                nome_fantasia=fantasia,
                cidade=cidade,
                uf=uf,
                site=None,
                socios=None,
                score_icp=5,
            )
        )

        site = resultado.get("site")
        contatos = resultado.get("contatos_web") or {}
        email = contatos.get("email_enriquecido")
        telefone = contatos.get("telefone_enriquecido")
        whatsapp = contatos.get("whatsapp_enriquecido")

        wa_ultra = resultado.get("whatsapp_ultra") or {}
        if not whatsapp and isinstance(wa_ultra, dict):
            whatsapp = wa_ultra.get("numero")

        if any([site, email, telefone, whatsapp]):
            try:
                with get_connection(read_only=False) as con_w:
                    con_w.execute("""
                        CREATE TABLE IF NOT EXISTS empresas_enriquecidas (
                            cnpj VARCHAR PRIMARY KEY,
                            site VARCHAR, email_web VARCHAR,
                            telefone_web VARCHAR, whatsapp_web VARCHAR
                        )
                    """)
                    con_w.execute(
                        "INSERT OR REPLACE INTO empresas_enriquecidas VALUES (?,?,?,?,?)",
                        [cnpj, site, email, telefone, whatsapp],
                    )
            except Exception as e:
                logger.warning(f"[JOB_ENHANCED] persist failed for {cnpj}: {e}")

        return {
            "cnpj": cnpj,
            "site": site,
            "email": email,
            "telefone": telefone,
            "whatsapp": whatsapp,
            "status": "enriched",
        }

    except Exception as e:
        logger.error(f"[JOB_ENHANCED] failed for {cnpj}: {e}")
        from api.jobs import enrich_company_by_cnpj
        return enrich_company_by_cnpj(cnpj)
