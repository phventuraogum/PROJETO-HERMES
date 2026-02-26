#!/bin/bash
# ============================================================
#  Hermes — Rodar sistema em produção na VPS
#
#  Uso na VPS:
#    cd /opt/hermes && sudo bash scripts/run_production.sh
#
#  Na primeira vez: roda setup (Docker, firewall, swap, volume)
#  e em seguida o deploy. Nas próximas: só deploy.
# ============================================================
set -euo pipefail

HERMES_DIR="/opt/hermes"
cd "$HERMES_DIR"

echo "=========================================="
echo "  Hermes — Rodar em produção (VPS)"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# ── .env obrigatório ────────────────────────────────────────
if [[ ! -f "$HERMES_DIR/.env" ]]; then
    echo ""
    echo "ERRO: .env nao encontrado em $HERMES_DIR/"
    echo ""
    echo "  Crie o arquivo com as variaveis de producao:"
    echo "  - No PC: scp .env.production usuario@IP_DA_VPS:/opt/hermes/.env"
    echo "  - Ou na VPS: nano /opt/hermes/.env (copie do .env.production)"
    echo ""
    exit 1
fi

# ── Primeira vez: setup ─────────────────────────────────────
if ! command -v docker &>/dev/null || ! docker compose version &>/dev/null 2>&1; then
    echo ""
    echo "[Primeira vez] Executando setup (Docker, firewall, swap, volume)..."
    bash "$HERMES_DIR/scripts/setup_and_deploy.sh"
fi

# ── Deploy (build + up + health check) ──────────────────────
echo ""
echo "Executando deploy..."
bash "$HERMES_DIR/scripts/deploy.sh"

echo ""
echo "Sistema rodando na VPS. Acesse via HTTP no IP ou hostname do servidor."
echo ""
