"""
RQ Job functions for enhanced background enrichment (hermes queue).
Used by prospeccao_service.py's modular endpoint.
"""
import os
import sys
import asyncio
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WHATSAPP_ULTRA_CACHE_TTL = max(300, int(os.getenv("HERMES_WHATSAPP_ULTRA_CACHE_TTL", "21600") or 21600))
WORKER_WHATSAPP_VERIFY_LIMIT = max(0, int(os.getenv("HERMES_WORKER_WHATSAPP_VERIFY_LIMIT", "12") or 12))


def _load_company_snapshot(cnpj: str) -> tuple[dict, dict] | tuple[None, None]:
    from api.db_pool import get_connection

    with get_connection(read_only=True) as con:
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
                telefone_receita,
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
        "telefone_padrao": str(row[7]) if row[7] else None,
        "telefone_receita": str(row[7]) if row[7] else None,
        "email": str(row[8]) if row[8] else None,
        "email_enriquecido": str(row[9]) if row[9] else None,
        "telefone_enriquecido": str(row[10]) if row[10] else None,
        "whatsapp_publico": str(row[11]) if row[11] else None,
        "whatsapp_enriquecido": str(row[12]) if row[12] else None,
        "outras_informacoes": str(row[13]) if row[13] else None,
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


def _reset_db_connections() -> None:
    try:
        from api.db_pool import close_all_connections

        close_all_connections()
    except Exception:
        pass


def _persist_merged_snapshot(cnpj: str, merged: dict) -> None:
    """
    Persiste dados enriquecidos DIRETAMENTE em cnpj.duckdb (onde estão as views).

    Anteriormente escrevia em app.duckdb, mas as views de prospecção ficam em
    cnpj.duckdb — então os dados nunca apareciam nas buscas. O worker RQ roda
    em processo separado, então abrir cnpj.duckdb em modo escrita aqui não
    conflita com as conexões read-only do servidor FastAPI.
    """
    import duckdb as _duckdb
    from api.db_pool import CNPJ_DB_PATH

    # Fecha conexoes read-only do pool neste thread antes de escrever
    _reset_db_connections()

    con_w = _duckdb.connect(CNPJ_DB_PATH, read_only=False)
    try:
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
            INSERT INTO empresas_enriquecidas (
                cnpj,
                site,
                email_enriquecido,
                telefone_enriquecido,
                whatsapp_publico,
                whatsapp_enriquecido,
                outras_informacoes
            ) VALUES (?,?,?,?,?,?,?)
            ON CONFLICT (cnpj) DO UPDATE SET
                site                 = COALESCE(excluded.site, site),
                email_enriquecido    = COALESCE(excluded.email_enriquecido, email_enriquecido),
                telefone_enriquecido = COALESCE(excluded.telefone_enriquecido, telefone_enriquecido),
                whatsapp_publico     = COALESCE(excluded.whatsapp_publico, whatsapp_publico),
                whatsapp_enriquecido = COALESCE(excluded.whatsapp_enriquecido, whatsapp_enriquecido),
                outras_informacoes   = COALESCE(excluded.outras_informacoes, outras_informacoes)
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
    finally:
        con_w.close()


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


def _score_whatsapp_candidate(origem: str, *, validado: bool = False, confianca: Optional[float] = None) -> float:
    origem_norm = str(origem or "").lower()
    score = 60.0
    if validado:
        score += 40
    if "widget" in origem_norm or "site" in origem_norm:
        score += 18
    if "maps" in origem_norm:
        score += 14
    if "instagram" in origem_norm or "link in bio" in origem_norm or "linktree" in origem_norm:
        score += 12
    if "socio" in origem_norm:
        score += 8
    if "telefone" in origem_norm or "receita" in origem_norm or "estabelecimento" in origem_norm:
        score -= 6
    if "promoc" in origem_norm:
        score -= 10
    if confianca is not None:
        try:
            score += min(15.0, max(0.0, float(confianca) * 12.0))
        except (TypeError, ValueError):
            pass
    return score


def _collect_whatsapp_candidates(merged: Dict[str, Any]) -> List[Dict[str, Any]]:
    from api.validation_service import normalizar_whatsapp_br

    best_by_number: Dict[str, Dict[str, Any]] = {}

    def add_candidate(
        valor: Optional[str],
        origem: str,
        *,
        validado: bool = False,
        confianca: Optional[float] = None,
        tipo: str = "whatsapp",
    ) -> None:
        numero = normalizar_whatsapp_br(str(valor or ""))
        if not numero:
            return
        candidato = {
            "valor": numero,
            "origem": origem,
            "validado": bool(validado),
            "tipo": tipo,
            "confianca": confianca,
            "score": _score_whatsapp_candidate(origem, validado=bool(validado), confianca=confianca),
        }
        atual = best_by_number.get(numero)
        if atual is None or candidato["score"] > atual["score"]:
            best_by_number[numero] = candidato

    add_candidate(merged.get("whatsapp_enriquecido"), "Atual enriquecido", validado=False)
    add_candidate(merged.get("whatsapp_publico"), "Atual publico", validado=False, tipo="publico")

    for item in merged.get("whatsapps_captados") or []:
        add_candidate(
            item.get("valor"),
            str(item.get("origem") or "WhatsApp captado"),
            validado=bool(item.get("validado")),
            confianca=item.get("confianca"),
            tipo=str(item.get("tipo") or "whatsapp"),
        )

    for item in merged.get("telefones_captados") or []:
        origem = str(item.get("origem") or "Telefone captado")
        add_candidate(
            item.get("valor"),
            f"{origem} -> WhatsApp",
            validado=False,
            confianca=item.get("confianca"),
            tipo="telefone_promovido",
        )

    for socio in merged.get("socios_estruturado") or []:
        nome = str(socio.get("nome") or "").strip() or "Socio"
        add_candidate(
            socio.get("whatsapp"),
            f"Socio {nome}",
            validado=False,
            tipo="socio",
        )
        add_candidate(
            socio.get("telefone"),
            f"Socio {nome} telefone -> WhatsApp",
            validado=False,
            tipo="socio_telefone",
        )

    candidatos = list(best_by_number.values())
    candidatos.sort(key=lambda item: item["score"], reverse=True)
    return candidatos[:WORKER_WHATSAPP_VERIFY_LIMIT] if WORKER_WHATSAPP_VERIFY_LIMIT else []


def _apply_whatsapp_validation(merged: Dict[str, Any], payload: Dict[str, Any]) -> None:
    if WORKER_WHATSAPP_VERIFY_LIMIT <= 0:
        return

    try:
        from api.validation_service import verificar_whatsapp_lote
    except Exception as exc:
        logger.debug("[JOB_ENHANCED] validation service unavailable: %s", exc)
        return

    candidatos = _collect_whatsapp_candidates(merged)
    if not candidatos:
        return

    numeros = [item["valor"] for item in candidatos]
    try:
        resultados = asyncio.run(verificar_whatsapp_lote(numeros, max_batch=min(50, len(numeros))))
    except Exception as exc:
        logger.warning("[JOB_ENHANCED] whatsapp validation failed for %s: %s", merged.get("cnpj"), exc)
        return

    captados = [dict(item) for item in (merged.get("whatsapps_captados") or [])]
    captados_by_number = {str(item.get("valor")): item for item in captados if item.get("valor")}

    confirmado: Optional[Dict[str, Any]] = None
    for candidato in candidatos:
        numero = candidato["valor"]
        info = resultados.get(numero) or {}
        item = captados_by_number.get(numero)
        if item is None:
            item = {
                "valor": numero,
                "origem": candidato["origem"],
                "tipo": candidato.get("tipo") or "whatsapp",
                "confianca": candidato.get("confianca"),
            }
            captados.append(item)
            captados_by_number[numero] = item
        item["validado"] = bool(info.get("valido"))
        item["metodo_validacao"] = info.get("metodo")
        item["score_validacao"] = info.get("score")
        if item["validado"] and confirmado is None:
            confirmado = {"candidato": candidato, "validacao": info}

    if captados:
        merged["whatsapps_captados"] = captados

    if not confirmado:
        return

    numero = confirmado["candidato"]["valor"]
    origem = confirmado["candidato"]["origem"]
    validacao = confirmado["validacao"]
    merged["whatsapp_enriquecido"] = numero
    merged["whatsapp_publico"] = numero

    whatsapp_payload = payload.get("whatsapp_ultra") or payload.get("whatsapp") or {}
    whatsapp_payload = dict(whatsapp_payload) if isinstance(whatsapp_payload, dict) else {}
    whatsapp_payload.update(
        {
            "numero": numero,
            "fonte": origem,
            "validado": True,
            "metodo_validacao": validacao.get("metodo"),
            "score_validacao": validacao.get("score"),
        }
    )
    payload["whatsapp_ultra"] = whatsapp_payload
    logger.info("[JOB_ENHANCED] whatsapp confirmado para %s via %s", merged.get("cnpj"), origem)


def enrich_company_by_cnpj_enhanced(cnpj: str) -> dict:
    """
    Enhanced background enrichment via EnrichmentService.
    Falls back to basic scraping if the full service is unavailable.
    """
    try:
        from api.enrichment_service import EnrichmentService
        from api.enrichment_merge import merge_enrichment_payload

        _reset_db_connections()
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
        _apply_whatsapp_validation(merged, resultado)
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
                _reset_db_connections()
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


def resolve_contact_intelligence_job(
    cnpj: str,
    probe_smtp: bool = False,
    refresh: bool = False,
) -> dict:
    from api.contact_intelligence import contact_intelligence_service
    from api.contact_intelligence_queue import (
        build_contact_intelligence_status,
        set_contact_intelligence_status,
    )

    started_at = None
    finished_at = None

    try:
        _reset_db_connections()
        started_at = build_contact_intelligence_status(
            cnpj,
            status="running",
            queued=False,
            probe_smtp=probe_smtp,
            refresh=refresh,
            started_at=None,
        )["updated_at"]
        set_contact_intelligence_status(
            cnpj,
            build_contact_intelligence_status(
                cnpj,
                status="running",
                queued=False,
                probe_smtp=probe_smtp,
                refresh=refresh,
                started_at=started_at,
            ),
        )

        if not refresh:
            cached = contact_intelligence_service.get_cached_company_intelligence(cnpj)
            if cached:
                finished_at = build_contact_intelligence_status(
                    cnpj,
                    status="completed",
                )["updated_at"]
                set_contact_intelligence_status(
                    cnpj,
                    build_contact_intelligence_status(
                        cnpj,
                        status="completed",
                        cached=True,
                        queued=False,
                        probe_smtp=probe_smtp,
                        refresh=refresh,
                        started_at=started_at,
                        finished_at=finished_at,
                    ),
                )
                return {
                    "cnpj": cnpj,
                    "status": "completed",
                    "cached": True,
                    "summary": cached.get("summary") or {},
                }

        intelligence = asyncio.run(
            contact_intelligence_service.resolve_company_intelligence(
                cnpj,
                probe_smtp=probe_smtp,
            )
        )
        finished_at = build_contact_intelligence_status(cnpj, status="completed")["updated_at"]
        set_contact_intelligence_status(
            cnpj,
            build_contact_intelligence_status(
                cnpj,
                status="completed",
                cached=False,
                queued=False,
                probe_smtp=probe_smtp,
                refresh=refresh,
                started_at=started_at,
                finished_at=finished_at,
            ),
        )
        return {
            "cnpj": cnpj,
            "status": "completed",
            "cached": False,
            "summary": intelligence.get("summary") or {},
        }
    except LookupError:
        finished_at = build_contact_intelligence_status(cnpj, status="error")["updated_at"]
        set_contact_intelligence_status(
            cnpj,
            build_contact_intelligence_status(
                cnpj,
                status="error",
                queued=False,
                error="Empresa nao encontrada",
                probe_smtp=probe_smtp,
                refresh=refresh,
                started_at=started_at,
                finished_at=finished_at,
            ),
        )
        return {"cnpj": cnpj, "status": "error", "error": "Empresa nao encontrada"}
    except Exception as exc:
        logger.error("[JOB_ENHANCED] contact intelligence failed for %s: %s", cnpj, exc)
        finished_at = build_contact_intelligence_status(cnpj, status="error")["updated_at"]
        set_contact_intelligence_status(
            cnpj,
            build_contact_intelligence_status(
                cnpj,
                status="error",
                queued=False,
                error=str(exc),
                probe_smtp=probe_smtp,
                refresh=refresh,
                started_at=started_at,
                finished_at=finished_at,
            ),
        )
        return {"cnpj": cnpj, "status": "error", "error": str(exc)}


def run_lead_refresh_job(org_id: str, job_id: str) -> dict:
    from api.contact_intelligence import contact_intelligence_service
    from api.company_intelligence_extras import company_intelligence_extras_service
    from api.lead_registry import build_watch_snapshot, lead_registry_service

    job = lead_registry_service.get_refresh_job(org_id, job_id)
    if not job:
        raise LookupError(f"Lead refresh job {job_id} nao encontrado")

    options = dict(job.get("options") or {})
    probe_smtp = bool(options.get("probe_smtp"))
    refresh_external_signals = bool(options.get("refresh_external_signals"))
    refresh_enrichment = bool(options.get("refresh_enrichment", True))
    refresh_contact_intelligence = bool(options.get("refresh_contact_intelligence", True))
    sync_watchlist = bool(options.get("sync_watchlist", True))

    lead_registry_service.mark_refresh_job_running(org_id, job_id)
    targets = lead_registry_service.list_refresh_job_targets(org_id, job_id, limit=500)

    for target in targets:
        cnpj = str(target.get("cnpj") or "").strip()
        if not cnpj:
            continue

        payload: Dict[str, Any] = {"cnpj": cnpj}
        try:
            _reset_db_connections()
            lead_registry_service.mark_refresh_target_running(org_id, job_id, cnpj, "enrichment")

            enrichment_result: Dict[str, Any] = {"status": "skipped"}
            if refresh_enrichment:
                enrichment_result = enrich_company_by_cnpj_enhanced(cnpj)
            payload["enrichment"] = enrichment_result

            lead_registry_service.mark_refresh_target_running(org_id, job_id, cnpj, "contact_intelligence")
            intelligence: Dict[str, Any] | None = None
            if refresh_contact_intelligence:
                intelligence = asyncio.run(
                    contact_intelligence_service.resolve_company_intelligence(
                        cnpj,
                        probe_smtp=probe_smtp,
                    )
                )
            else:
                intelligence = contact_intelligence_service.get_cached_company_intelligence(cnpj)

            snapshot, _context = _load_company_snapshot(cnpj)
            if not snapshot:
                raise LookupError("Empresa nao encontrada apos refresh")

            refresh_summary = build_watch_snapshot(snapshot, intelligence=intelligence)
            state = lead_registry_service.upsert_refresh_state(
                org_id,
                cnpj,
                source_kind=job.get("source_kind"),
                source_ref=job.get("source_ref"),
                job_id=job_id,
                summary=refresh_summary,
            )

            internal_signals: List[Dict[str, Any]] = []
            watch_company = lead_registry_service.get_watch_company(org_id, cnpj)
            if sync_watchlist and watch_company:
                sync_result = lead_registry_service.sync_watch_snapshot(
                    org_id,
                    cnpj,
                    refresh_summary,
                    company=snapshot,
                    source="lead_refresh_job",
                )
                internal_signals = list(sync_result.get("signals") or [])

            external_signals_recorded: List[Dict[str, Any]] = []
            if refresh_external_signals:
                external_signals = asyncio.run(
                    company_intelligence_extras_service.fetch_external_signals(cnpj, company=snapshot)
                )
                external_signals_recorded = lead_registry_service.record_company_signals(
                    org_id,
                    cnpj,
                    external_signals,
                )

            result = {
                "cnpj": cnpj,
                "status": "completed",
                "enrichment": enrichment_result,
                "contact_intelligence_summary": (intelligence or {}).get("summary") or {},
                "refresh_state": state,
                "signals_recorded": len(internal_signals) + len(external_signals_recorded),
            }
            lead_registry_service.complete_refresh_target(
                org_id,
                job_id,
                cnpj,
                stage="completed",
                payload=payload,
                result=result,
            )
        except Exception as exc:
            logger.error("[JOB_ENHANCED] lead refresh failed for %s in job %s: %s", cnpj, job_id, exc)
            lead_registry_service.upsert_refresh_state(
                org_id,
                cnpj,
                source_kind=job.get("source_kind"),
                source_ref=job.get("source_ref"),
                job_id=job_id,
                summary=payload.get("refresh_summary"),
                error=str(exc),
            )
            lead_registry_service.fail_refresh_target(
                org_id,
                job_id,
                cnpj,
                stage="error",
                error=str(exc),
                payload=payload,
            )

    finalized = lead_registry_service.finalize_refresh_job(org_id, job_id)
    return finalized or {"id": job_id, "status": "completed"}
