"""
Hermes API - Ponto de entrada principal.

Monta todos os routers modulares e importa endpoints legados
que ainda nao foram migrados para routers proprios.
"""
import os
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from dotenv import load_dotenv

from config import settings

load_dotenv()

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

# Swagger/Docs desabilitados em produção (não expor schema da API)
_docs_url   = None if settings.is_production else "/docs"
_redoc_url  = None if settings.is_production else "/redoc"
_openapi_url = None if settings.is_production else "/openapi.json"

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
    from api.routers.pipeline import router as pipeline_router
    app.include_router(pipeline_router, prefix="/pipeline", tags=["Pipeline"])
    logger.info("[OK] Pipeline router carregado")
except Exception as e:
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

# ============================================================
# ENDPOINTS LEGADOS
# Protegidos com require_auth quando HERMES_AUTH_REQUIRED=true
# ============================================================

try:
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

    @app.post("/prospeccao/run", response_model=ProspeccaoResultado, tags=["Prospecção Legado"])
    async def prospeccao_run_legacy(
        request: Request,
        config: ProspeccaoConfig,
        user: dict = Depends(require_auth),
    ):
        """Executa prospecção com enriquecimento web (endpoint principal do frontend)."""
        org_id = get_org_id(request)
        logger.info(f"Prospecção iniciada | user={user.get('email')} | termo={getattr(config, 'termo', '')} | org={org_id}")
        if getattr(config, "enriquecimento_web", False):
            need = getattr(config, "limite_empresas", 20) or 20
            if not _consume_credits(org_id, need):
                raise HTTPException(
                    status_code=402,
                    detail=f"Créditos insuficientes. Necessário: {need}, saldo: {_get_credits(org_id)}.",
                )
        try:
            return rodar_prospeccao_icp(config)
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
        if getattr(config, "enriquecimento_web", False):
            need = getattr(config, "limite_empresas", 20) or 20
            if not _consume_credits(org_id, need):
                raise HTTPException(
                    status_code=402,
                    detail=f"Créditos insuficientes. Necessário: {need}, saldo: {_get_credits(org_id)}.",
                )

        progress_queue: _queue.Queue = _queue.Queue()

        def on_progress(stage: str, current: int, total: int, detail: str):
            progress_queue.put({"stage": stage, "current": current, "total": total, "detail": detail})

        result_holder: list = []
        error_holder: list = []

        def run_in_thread():
            try:
                result = rodar_prospeccao_icp(config, on_progress=on_progress)
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
                    msg = progress_queue.get(timeout=120)
                except _queue.Empty:
                    yield f"event: error\ndata: {_json.dumps({'detail': 'Timeout'})}\n\n"
                    return
                if msg is None:
                    break
                yield f"event: progress\ndata: {_json.dumps(msg)}\n\n"

            if error_holder:
                yield f"event: error\ndata: {_json.dumps({'detail': error_holder[0]})}\n\n"
            elif result_holder:
                payload = result_holder[0].model_dump()
                yield f"event: result\ndata: {_json.dumps(payload, default=str)}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.post("/mapa-calor", response_model=MapaCalorResponse, tags=["Mapa de Calor"])
    async def mapa_calor_legacy(
        config: MapaCalorRequest,
        user: dict = Depends(require_auth),
    ):
        """Gera mapa de calor de empresas por região."""
        try:
            return gerar_mapa_calor(config)
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
        config: ProspeccaoConfig,
        user: dict = Depends(require_auth),
    ):
        """Gera insights de IA sobre os leads prospectados."""
        from api.main import AI_API_KEY
        resultado_base = rodar_prospeccao_icp(config)
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
            dados_ia = gerar_insights_prospeccao_ia(contexto)
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

# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
async def startup():
    logger.info("=" * 60)
    logger.info("HERMES API v2.1 iniciando")
    logger.info(f"Ambiente:       {settings.ENVIRONMENT}")
    logger.info(f"Auth obrigatória: {settings.HERMES_AUTH_REQUIRED}")
    logger.info(f"Rate limiting:  {settings.RATE_LIMIT_ENABLED}")
    logger.info(f"Swagger/Docs:   {'DESABILITADO (produção)' if settings.is_production else '/docs'}")
    logger.info(f"CORS origens:   {settings.CORS_ORIGINS}")
    logger.info("=" * 60)

    # Valida configurações críticas em produção
    if settings.is_production:
        from config import validate_production_settings
        try:
            validate_production_settings()
            logger.info("Validação de produção: OK")
        except ValueError as e:
            logger.critical(f"CONFIGURAÇÃO INVÁLIDA PARA PRODUÇÃO: {e}")
            raise SystemExit(1)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main_integrado:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.is_development,
    )
