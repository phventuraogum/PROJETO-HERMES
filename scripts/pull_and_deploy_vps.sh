#!/bin/bash
# ============================================================
#  Rodar NA VPS: resolve conflitos locais, puxa main e faz deploy.
#  Uso: cd /opt/hermes && sudo bash scripts/pull_and_deploy_vps.sh
# ============================================================
set -euo pipefail

HERMES_DIR="${HERMES_DIR:-/opt/hermes}"
cd "$HERMES_DIR"

echo "=========================================="
echo "  Hermes - Atualizando codigo e deploy"
echo "=========================================="

# 1. Descartar alteracoes locais (a versao que queremos esta no GitHub)
echo "[1/4] Descartando alteracoes locais..."
git checkout -- . 2>/dev/null || true
git clean -fd backend/tests/test_core_scraper.py 2>/dev/null || true
rm -f backend/tests/test_core_scraper.py 2>/dev/null || true

# 2. Garantir que estamos na main e puxar
echo "[2/4] git fetch e pull origin main..."
git fetch origin
git checkout main
git pull origin main

# 3. Deploy
echo "[3/4] Executando deploy..."
bash scripts/deploy.sh

echo "[4/4] Concluido. Front e sistema atualizados."
