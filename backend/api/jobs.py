"""
RQ Job functions for background enrichment (hermes queue).
"""
import os
import re
import sys
import asyncio
import logging

logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from api.validation_service import normalizar_whatsapp_br
except ImportError:
    def normalizar_whatsapp_br(n):
        d = re.sub(r"[^\d]", "", str(n or ""))
        if d.startswith("0"): d = d[1:]
        if d.startswith("55") and len(d) >= 12: d = d[2:]
        if len(d) == 11 and d[2] == "9": return "55" + d
        return None


def enrich_company_by_cnpj(cnpj: str) -> dict:
    """
    Background job: enrich a single company by CNPJ.
    Called by RQ worker from the 'hermes' queue.
    """
    try:
        from api.db_pool import get_connection

        with get_connection(read_only=True) as con:
            row = con.execute(
                "SELECT RAZAO_SOCIAL, NOME_FANTASIA, cidade_nome, UF "
                "FROM vw_prospeccao_base WHERE cnpj = ? LIMIT 1",
                [cnpj],
            ).fetchone()

        if not row:
            logger.warning(f"[JOB] CNPJ {cnpj} not found in DB")
            return {"cnpj": cnpj, "status": "not_found"}

        razao, fantasia, cidade, uf = row
        empresa_nome = fantasia or razao or ""

        from core_scraper import buscar_google

        query = f'"{empresa_nome}" {cidade or ""} {uf or ""} CNPJ {cnpj}'
        resultados = asyncio.run(buscar_google(query, num_results=3))

        site = None
        email = None
        whatsapp = None
        telefone = None

        import httpx
        from bs4 import BeautifulSoup
        import re

        for r in resultados[:3]:
            url = r.get("href") or r.get("url") or r.get("link") or ""
            if not url:
                continue
            try:
                resp = httpx.get(url, timeout=30, follow_redirects=True)
                if resp.status_code != 200:
                    continue
                soup = BeautifulSoup(resp.text, "html.parser")
                text = soup.get_text(" ", strip=True)

                emails = re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text)
                if emails and not email:
                    email = emails[0]

                phones = re.findall(r"\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4}", text)
                if phones and not telefone:
                    telefone = phones[0]

                wa_match = re.findall(r"(?:wa\.me|api\.whatsapp\.com/send\?phone=)/?\+?(\d{10,13})", resp.text)
                if wa_match and not whatsapp:
                    for wm in wa_match:
                        norm = normalizar_whatsapp_br(wm)
                        if norm:
                            whatsapp = norm
                            break

                if not whatsapp and telefone:
                    norm_tel = normalizar_whatsapp_br(telefone)
                    if norm_tel:
                        whatsapp = norm_tel

                if not site:
                    site = str(resp.url)

            except Exception:
                continue

        enriched = {
            "cnpj": cnpj,
            "site": site,
            "email": email,
            "telefone": telefone,
            "whatsapp": whatsapp,
            "status": "enriched",
        }

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
                logger.warning(f"[JOB] persist failed for {cnpj}: {e}")

        return enriched

    except Exception as e:
        logger.error(f"[JOB] enrich_company_by_cnpj failed for {cnpj}: {e}")
        return {"cnpj": cnpj, "status": "error", "error": str(e)}
