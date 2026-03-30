"""
Hermes API - Ponto de entrada principal.

Monta todos os routers modulares e importa endpoints legados
que ainda nao foram migrados para routers proprios.
"""
import os
import asyncio
import logging
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from dotenv import load_dotenv

warnings.filterwarnings(
    "ignore",
    message=".*asyncio.iscoroutinefunction.*",
    category=DeprecationWarning,
)
warnings.filterwarnings(
    "ignore",
    message="Please use `import python_multipart` instead.",
    category=PendingDeprecationWarning,
)

load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from pydantic.warnings import UnsupportedFieldAttributeWarning

from config import settings
from api.result_store import result_store

warnings.simplefilter("ignore", UnsupportedFieldAttributeWarning)

# ============================================================
# LOGGING ESTRUTURADO
# ============================================================
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("hermes.main")

# ============================================================
# APP PRINCIPAL
# ============================================================

# Swagger/Docs disabled in production to avoid exposing the API schema.
_docs_url = None if settings.is_production else "/docs"
_redoc_url = None if settings.is_production else "/redoc"
_openapi_url = None if settings.is_production else "/openapi.json"


async def _run_startup_checks() -> None:
    logger.info("=" * 60)
    logger.info("HERMES API v2.1 iniciando")
    logger.info(f"Ambiente:       {settings.ENVIRONMENT}")
    logger.info(f"Auth obrigatoria: {settings.HERMES_AUTH_REQUIRED}")
    logger.info(f"Rate limiting:  {settings.RATE_LIMIT_ENABLED}")
    logger.info(f"Swagger/Docs:   {'DESABILITADO (producao)' if settings.is_production else '/docs'}")
    logger.info(f"CORS origens:   {settings.CORS_ORIGINS}")
    logger.info("=" * 60)

    if settings.is_production:
        from config import validate_production_settings

        try:
            validate_production_settings()
            logger.info("Validacao de producao: OK")
        except ValueError as e:
            logger.critical(f"CONFIGURACAO INVALIDA PARA PRODUCAO: {e}")
            raise SystemExit(1)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await _run_startup_checks()
    yield

app = FastAPI(
    title="Hermes API - Prospecção B2B",
    version="2.1.0",
    description=(
        "API de Prospecção B2B inteligente.\n\n"
        "## Funcionalidades\n"
        "- Prospecção por DuckDB (Receita Federal)\n"
        "- Enriquecimento web (Scrapling + DuckDuckGo)\n"
        "- Resumo por IA (OpenAI / OpenRouter)\n"
        "- CRM Export (Ploomes, Pipedrive, HubSpot, RD Station)\n"
        "- Pipeline de leads (Supabase)\n"
        "- Créditos e cobrança (Asaas)\n\n"
        "## Documentação\n"
        "- Swagger: /docs (apenas em desenvolvimento)\n"
        "- ReDoc: /redoc (apenas em desenvolvimento)"
    ),
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
    lifespan=lifespan,
)

# ============================================================
# MIDDLEWARES
# ============================================================

# Compressão Gzip (reduz tamanho das respostas ~60-80%)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS — configurável via env, restrito em produção
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    # Headers específicos em vez de "*" — previne vazamento de headers sensíveis
    allow_headers=["Authorization", "Content-Type", "X-Org-Id", "X-Api-Key"],
)

# Rate Limiting via Redis (protege contra DDoS e abuso)
try:
    from middleware.rate_limit import setup_rate_limiting
    setup_rate_limiting(app)
    logger.info("Rate limiting ativado")
except Exception as e:
    logger.warning(f"Rate limiting não disponível: {e}")

# ============================================================
# ROUTERS MODULARES
# ============================================================

try:
    from api.routers.health import router as health_router
    app.include_router(health_router)
    logger.info("[OK] Health router carregado")
except Exception as e:
    logger.warning(f"[WARN] Health router nao disponivel: {e}")

try:
    from api.routers.prospeccao import router as prospeccao_router
    app.include_router(prospeccao_router)
    logger.info("[OK] Prospeccao router carregado")
except Exception as e:
    logger.warning(f"[WARN] Prospeccao router nao disponivel: {e}")

try:
    from api.routers.empresas import router as empresas_router
    app.include_router(empresas_router)
    logger.info("[OK] Empresas router carregado")
except Exception as e:
    logger.warning(f"[WARN] Empresas router nao disponivel: {e}")

try:
    from api.routers.integrations import router as integrations_router
    app.include_router(integrations_router)
    logger.info("[OK] Integrations router carregado")
except Exception as e:
    logger.warning(f"[WARN] Integrations router nao disponivel: {e}")

try:
    from api.routers.orgs import router as orgs_router
    app.include_router(orgs_router)
    logger.info("[OK] Orgs router carregado")
except Exception as e:
    logger.warning(f"[WARN] Orgs router nao disponivel: {e}")

try:
    from api.routers.webhooks import router as webhooks_router
    app.include_router(webhooks_router)
    logger.info("[OK] Webhooks router carregado")
except Exception as e:
    logger.warning(f"[WARN] Webhooks router nao disponivel: {e}")

try:
    from api.routers.credits import router as credits_router
    app.include_router(credits_router)
    logger.info("[OK] Credits router carregado")
except Exception as e:
    logger.warning(f"[WARN] Credits router nao disponivel: {e}")

try:
    from api.routers.pipeline import router as pipeline_router, ingest_empresas_to_pipeline
    app.include_router(pipeline_router, prefix="/pipeline", tags=["Pipeline"])
    logger.info("[OK] Pipeline router carregado")
except Exception as e:
    ingest_empresas_to_pipeline = None
    logger.warning(f"[WARN] Pipeline router nao disponivel: {e}")

try:
    from api.routers.crm import router as crm_router
    app.include_router(crm_router, prefix="/crm", tags=["CRM"])
    logger.info("[OK] CRM router carregado")
except Exception as e:
    logger.warning(f"[WARN] CRM router nao disponivel: {e}")

try:
    from api.routers.auth import router as auth_router
    app.include_router(auth_router)
    logger.info("[OK] Auth router carregado")
except Exception as e:
    logger.warning(f"[WARN] Auth router nao disponivel: {e}")

try:
    from api.routers.sdr import router as sdr_router
    app.include_router(sdr_router)
    logger.info("[OK] SDR router carregado")
except Exception as e:
    logger.warning(f"[WARN] SDR router nao disponivel: {e}")

try:
    from api.routers.lead_registry import router as lead_registry_router
    app.include_router(lead_registry_router)
    logger.info("[OK] Lead Registry router carregado")
except Exception as e:
    logger.warning(f"[WARN] Lead Registry router nao disponivel: {e}")

try:
    from api.routers.fiscal_public import router as fiscal_public_router
    app.include_router(fiscal_public_router)
    logger.info("[OK] Fiscal Public router carregado")
except Exception as e:
    logger.warning(f"[WARN] Fiscal Public router nao disponivel: {e}")

try:
    from api.routers.assertiva import router as assertiva_router
    app.include_router(assertiva_router)
    logger.info("[OK] Assertiva router carregado")
except Exception as e:
    logger.warning(f"[WARN] Assertiva router nao disponivel: {e}")

# ============================================================
# ENDPOINTS LEGADOS
# Protegidos com require_auth quando HERMES_AUTH_REQUIRED=true
# ============================================================

try:
    from api.lead_registry import lead_registry_service
    from api.main import (
        rodar_prospeccao_icp,
        gerar_mapa_calor,
        gerar_mensagem_abordagem,
        gerar_insights_prospeccao_ia,
        ProspeccaoConfig,
        ProspeccaoResultado,
        MapaCalorRequest,
        MapaCalorResponse,
        MensagemRequest,
        MensagemResponse,
        get_org_id,
        _consume_credits,
        _get_credits,
    )
    from fastapi import HTTPException, Request
    from fastapi.responses import StreamingResponse
    from middleware.auth import require_auth
    import json as _json
    import queue as _queue
    import threading as _threading

    def _auto_pipeline_and_sdr_after_prospeccao_enabled() -> bool:
        return os.getenv("AUTO_PIPELINE_AND_SDR_AFTER_PROSPECCAO", "").strip().lower() in {"1", "true", "yes", "on"}

    def _extract_result_empresas(resultado: ProspeccaoResultado | dict) -> list[dict]:
        if isinstance(resultado, dict):
            empresas = resultado.get("empresas") or []
        else:
            empresas = getattr(resultado, "empresas", []) or []

        payload = []
        for empresa in empresas:
            if hasattr(empresa, "model_dump"):
                payload.append(empresa.model_dump())
            elif isinstance(empresa, dict):
                payload.append(empresa)
        return payload

    def _maybe_auto_pipeline_and_sdr(org_id: str, resultado: ProspeccaoResultado | dict) -> None:
        if not _auto_pipeline_and_sdr_after_prospeccao_enabled():
            return
        if ingest_empresas_to_pipeline is None:
            logger.warning("AUTO_PIPELINE_AND_SDR_AFTER_PROSPECCAO ativo, mas pipeline router nao esta disponivel")
            return

        empresas = _extract_result_empresas(resultado)
        if not empresas:
            logger.info("Auto Pipeline+SDR ignorado: nenhuma empresa no resultado")
            return

        def _run_background() -> None:
            try:
                auto_result = ingest_empresas_to_pipeline(org_id, empresas, auto_send_sdr=True)
                logger.info(
                    "Auto Pipeline+SDR pos-prospeccao | org=%s total=%s added=%s sdr=%s",
                    org_id,
                    auto_result.get("total", 0),
                    auto_result.get("added", 0),
                    auto_result.get("sdr_auto_enviados", 0),
                )
            except Exception as exc:
                logger.warning("Falha no auto Pipeline+SDR pos-prospeccao: %s", exc)

        _threading.Thread(target=_run_background, daemon=True).start()

    def _apply_suppression_registry(config: ProspeccaoConfig, org_id: str) -> ProspeccaoConfig:
        suppressed_cnpjs = lead_registry_service.get_suppressed_cnpjs(org_id)
        if not suppressed_cnpjs:
            return config

        current = list(config.excluir_cnpjs or [])
        merged = sorted({str(cnpj).strip() for cnpj in current + suppressed_cnpjs if str(cnpj).strip()})
        next_config = config.model_copy(deep=True)
        next_config.excluir_cnpjs = merged
        return next_config

    @app.post("/prospeccao/run", response_model=ProspeccaoResultado, tags=["Prospecção Legado"])
    async def prospeccao_run_legacy(
        request: Request,
        config: ProspeccaoConfig,
        user: dict = Depends(require_auth),
    ):
        """Executa prospecção com enriquecimento web (endpoint principal do frontend)."""
        org_id = get_org_id(request)
        logger.info(f"Prospecção iniciada | user={user.get('email')} | termo={getattr(config, 'termo', '')} | org={org_id}")
        try:
            effective_config = _apply_suppression_registry(config, org_id)
            resultado = await asyncio.to_thread(rodar_prospeccao_icp, effective_config)
            result_store.save_result(
                org_id,
                config.model_dump(by_alias=True),
                resultado.model_dump(),
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
            _maybe_auto_pipeline_and_sdr(org_id, resultado)
            return resultado
        except Exception as e:
            logger.error(f"Erro na prospecção: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/prospeccao/run-stream", tags=["Prospecção Legado"])
    async def prospeccao_run_stream(
        request: Request,
        config: ProspeccaoConfig,
        user: dict = Depends(require_auth),
    ):
        """Executa prospecção com progresso via Server-Sent Events."""
        org_id = get_org_id(request)
        effective_config = _apply_suppression_registry(config, org_id)

        progress_queue: _queue.Queue = _queue.Queue()

        def on_progress(stage: str, current: int, total: int, detail: str):
            progress_queue.put({"stage": stage, "current": current, "total": total, "detail": detail})

        result_holder: list = []
        error_holder: list = []

        def run_in_thread():
            try:
                result = rodar_prospeccao_icp(effective_config, on_progress=on_progress)
                result_holder.append(result)
            except Exception as exc:
                error_holder.append(str(exc))
            finally:
                progress_queue.put(None)

        worker = _threading.Thread(target=run_in_thread, daemon=True)
        worker.start()

        def event_stream():
            while True:
                try:
                    msg = progress_queue.get(timeout=30)
                except _queue.Empty:
                    if not worker.is_alive():
                        break
                    yield f"event: heartbeat\ndata: {_json.dumps({'stage': 'processing', 'detail': 'Aguarde...'})}\n\n"
                    continue
                if msg is None:
                    break
                yield f"event: progress\ndata: {_json.dumps(msg)}\n\n"

            if error_holder:
                yield f"event: error\ndata: {_json.dumps({'detail': error_holder[0]})}\n\n"
            elif result_holder:
                payload = result_holder[0].model_dump()
                result_store.save_result(
                    org_id,
                    config.model_dump(by_alias=True),
                    payload,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )
                _maybe_auto_pipeline_and_sdr(org_id, payload)
                yield f"event: result\ndata: {_json.dumps(payload, default=str)}\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/prospeccao/resultado-atual", tags=["ProspecÃ§Ã£o Legado"])
    async def prospeccao_resultado_atual(
        request: Request,
        user: dict = Depends(require_auth),
    ):
        """Retorna o último resultado persistido para a organização atual."""
        org_id = get_org_id(request)
        return result_store.get_latest_result(org_id)

    @app.get("/prospeccao/ultima-execucao", tags=["ProspecÃ§Ã£o Legado"])
    async def prospeccao_ultima_execucao(
        request: Request,
        user: dict = Depends(require_auth),
    ):
        """Retorna a última execução persistida com a lista de empresas."""
        org_id = get_org_id(request)
        return result_store.get_latest_execution_payload(org_id)

    @app.get("/prospeccao/execucoes", tags=["ProspecÃ§Ã£o Legado"])
    async def prospeccao_execucoes(
        request: Request,
        user: dict = Depends(require_auth),
    ):
        """Lista execuções persistidas da organização atual."""
        org_id = get_org_id(request)
        return result_store.get_execucoes(org_id)

    @app.get("/prospeccao/historico", tags=["ProspecÃ§Ã£o Legado"])
    async def prospeccao_historico(
        request: Request,
        user: dict = Depends(require_auth),
    ):
        """Lista o histórico persistido de prospecções."""
        org_id = get_org_id(request)
        return result_store.get_history(org_id)

    class HistoricoRenameBody(BaseModel):
        nome: str

    @app.patch("/prospeccao/historico/{entry_id}", tags=["ProspecÃ§Ã£o Legado"])
    async def prospeccao_historico_renomear(
        entry_id: str,
        body: HistoricoRenameBody,
        request: Request,
        user: dict = Depends(require_auth),
    ):
        """Renomeia uma entrada do histórico."""
        org_id = get_org_id(request)
        updated = result_store.rename_history_entry(org_id, entry_id, body.nome.strip())
        if not updated:
            raise HTTPException(status_code=404, detail="Busca não encontrada")
        return {"ok": True}

    @app.delete("/prospeccao/historico/{entry_id}", status_code=204, tags=["ProspecÃ§Ã£o Legado"])
    async def prospeccao_historico_deletar(
        entry_id: str,
        request: Request,
        user: dict = Depends(require_auth),
    ):
        """Remove uma entrada do histórico."""
        org_id = get_org_id(request)
        deleted = result_store.delete_history_entry(org_id, entry_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Busca não encontrada")

    @app.post("/mapa-calor", response_model=MapaCalorResponse, tags=["Mapa de Calor"])
    async def mapa_calor_legacy(
        config: MapaCalorRequest,
        user: dict = Depends(require_auth),
    ):
        """Gera mapa de calor de empresas por região."""
        try:
            return await asyncio.to_thread(gerar_mapa_calor, config)
        except Exception as e:
            logger.error(f"Erro no mapa de calor: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/prospeccao/gerar-mensagem", response_model=MensagemResponse, tags=["Prospecção Legado"])
    async def gerar_mensagem_legacy(
        body: MensagemRequest,
        user: dict = Depends(require_auth),
    ):
        """Gera mensagem de abordagem personalizada via IA."""
        return await gerar_mensagem_abordagem(body)

    @app.post("/prospeccao/insights-ia", tags=["Prospecção Legado"])
    async def insights_ia_legacy(
        request: Request,
        config: ProspeccaoConfig,
        user: dict = Depends(require_auth),
    ):
        """Gera insights de IA sobre os leads prospectados."""
        from api.main import AI_API_KEY
        org_id = get_org_id(request)
        effective_config = _apply_suppression_registry(config, org_id)
        resultado_base = await asyncio.to_thread(rodar_prospeccao_icp, effective_config)
        if not AI_API_KEY:
            return {
                "ia_ativa": False,
                "mensagem": "IA não configurada. Retornando apenas dados crus.",
                "resultado": resultado_base,
            }
        empresas_com_insights = []
        for emp in resultado_base.empresas[:3]:
            contexto = {
                "razao_social": emp.razao_social,
                "nome_fantasia": emp.nome_fantasia,
                "cidade": emp.cidade,
                "uf": emp.uf,
                "segmento": emp.segmento,
                "porte": emp.porte,
                "capital_social": emp.capital_social,
                "socios_resumo": emp.socios_resumo,
                "resumo_ia_empresa": emp.resumo_ia_empresa,
            }
            dados_ia = await asyncio.to_thread(gerar_insights_prospeccao_ia, contexto)
            empresas_com_insights.append({"empresa": emp, "insights_ia": dados_ia})
        return {
            "ia_ativa": True,
            "total_empresas_base": resultado_base.total_empresas,
            "filtros_icp": resultado_base.filtros_icp,
            "enriquecimento_web": resultado_base.enriquecimento_web,
            "empresas_com_insights": empresas_com_insights,
        }

    @app.get("/admin/orgs", tags=["Admin"])
    async def list_orgs_legacy(
        request: Request,
        user: dict = Depends(require_auth),
    ):
        """Lista organizações do tenant. Requer autenticação."""
        org_id = get_org_id(request)
        return [{"id": org_id, "name": "Minha Organização", "slug": org_id, "role": "admin"}]

    logger.info("[OK] Endpoints legados carregados com autenticação")

except Exception as e:
    logger.warning(f"[WARN] Endpoints legados nao disponiveis: {e}")

# Health check público (sem auth — necessário para Docker healthcheck)
@app.get("/health", tags=["Health"])
def health_check():
    """Health check básico (público — usado pelo Docker/load balancer)."""
    return {"status": "ok", "version": "2.1.0", "environment": settings.ENVIRONMENT}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main_integrado:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.is_development,
    )
