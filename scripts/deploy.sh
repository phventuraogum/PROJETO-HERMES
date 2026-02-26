#!/bin/bash
# ============================================================
#  Hermes Insight Engine — Deploy Script
#  Rodar na VPS a cada deploy: bash scripts/deploy.sh
# ============================================================
set -euo pipefail

HERMES_DIR="/opt/hermes"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=========================================="
echo "  Hermes Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# ── 1. Verificar .env ─────────────────────────────────────────
if [[ ! -f "$HERMES_DIR/.env" ]]; then
    echo "ERRO: .env nao encontrado em $HERMES_DIR/"
    echo "  Copie .env.production para $HERMES_DIR/.env e preencha as variaveis."
    exit 1
fi

source "$HERMES_DIR/.env"

echo "[Pre-flight] Verificando configuracoes criticas..."

ERRORS=0

if [[ "${HERMES_AUTH_REQUIRED:-}" != "true" ]]; then
    echo "  ERRO: HERMES_AUTH_REQUIRED deve ser 'true'"
    ERRORS=$((ERRORS + 1))
fi
if [[ -z "${REDIS_PASSWORD:-}" ]]; then
    echo "  ERRO: REDIS_PASSWORD vazio"
    ERRORS=$((ERRORS + 1))
fi
if [[ -z "${SUPABASE_JWT_SECRET:-}" ]]; then
    echo "  ERRO: SUPABASE_JWT_SECRET vazio"
    ERRORS=$((ERRORS + 1))
fi
if [[ -z "${SUPABASE_URL:-}" ]]; then
    echo "  ERRO: SUPABASE_URL vazio"
    ERRORS=$((ERRORS + 1))
fi
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "  ERRO: SUPABASE_SERVICE_ROLE_KEY vazio"
    ERRORS=$((ERRORS + 1))
fi
if [[ -z "${ASAAS_API_KEY:-}" ]]; then
    echo "  AVISO: ASAAS_API_KEY vazio — pagamentos nao funcionarao"
fi
if [[ -z "${ASAAS_WEBHOOK_TOKEN:-}" ]]; then
    echo "  AVISO: ASAAS_WEBHOOK_TOKEN vazio — webhooks nao serao validados"
fi
if [[ "${CORS_ORIGINS:-}" == *"localhost"* ]]; then
    echo "  AVISO: CORS_ORIGINS contem localhost — ajuste para producao!"
fi
if echo "${CORS_ORIGINS:-}" | grep -q "SEU_DOMINIO"; then
    echo "  ERRO: CORS_ORIGINS ainda contem placeholder SEU_DOMINIO"
    ERRORS=$((ERRORS + 1))
fi

if [[ $ERRORS -gt 0 ]]; then
    echo ""
    echo "  $ERRORS erros criticos encontrados. Corrija o .env e tente novamente."
    exit 1
fi

echo "  Todas as verificacoes passaram."

cd "$HERMES_DIR"

# ── 2. Build containers ───────────────────────────────────────
echo ""
echo "[1/5] Building containers..."
docker compose -f "$COMPOSE_FILE" build --no-cache

# ── 3. Restart graceful ──────────────────────────────────────
echo "[2/5] Reiniciando servicos..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" up -d

# ── 4. Health check ──────────────────────────────────────────
echo "[3/5] Aguardando servicos iniciarem..."
sleep 20

MAX_RETRIES=10
RETRY=0
until curl -sf http://localhost/health > /dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [[ $RETRY -ge $MAX_RETRIES ]]; then
        echo "  ERRO: API nao respondeu apos $MAX_RETRIES tentativas"
        echo "  Logs do container:"
        docker compose -f "$COMPOSE_FILE" logs --tail=30 api
        exit 1
    fi
    echo "  Tentativa $RETRY/$MAX_RETRIES..."
    sleep 5
done
echo "  Health check: OK"

# ── 5. Verificar seguranca ────────────────────────────────────
echo "[4/5] Verificando seguranca..."

DOCS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/docs 2>/dev/null || echo "000")
if [[ "$DOCS_STATUS" == "404" ]]; then
    echo "  /docs bloqueado: OK"
else
    echo "  AVISO: /docs retornou $DOCS_STATUS (deveria ser 404)"
fi

NOAUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/prospeccao/run 2>/dev/null || echo "000")
if [[ "$NOAUTH_STATUS" == "401" || "$NOAUTH_STATUS" == "405" || "$NOAUTH_STATUS" == "422" ]]; then
    echo "  Auth obrigatoria: OK"
else
    echo "  AVISO: /prospeccao/run sem auth retornou $NOAUTH_STATUS"
fi

AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/auth/signup 2>/dev/null || echo "000")
if [[ "$AUTH_STATUS" == "405" || "$AUTH_STATUS" == "422" ]]; then
    echo "  /auth/signup acessivel: OK"
else
    echo "  AVISO: /auth/signup retornou $AUTH_STATUS"
fi

PLANS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/plans 2>/dev/null || echo "000")
if [[ "$PLANS_STATUS" == "200" ]]; then
    echo "  /plans acessivel: OK"
else
    echo "  AVISO: /plans retornou $PLANS_STATUS"
fi

# ── 6. Status final ──────────────────────────────────────────
echo ""
echo "[5/5] Status dos containers:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "=========================================="
echo "  Deploy concluido com sucesso!"
echo "=========================================="
echo ""
echo "  URL:   https://${CORS_ORIGINS##*://}"
echo "  Docs:  DESABILITADO (producao)"
echo "  Logs:  docker compose -f $COMPOSE_FILE logs -f"
echo ""
