#!/bin/bash
# ============================================================
#  Hermes - Sincronizar codigo exato da ref desejada e fazer deploy
#
#  Uso:
#    bash scripts/sync_and_deploy.sh              # usa origin/main
#    bash scripts/sync_and_deploy.sh origin/main  # idem
#    bash scripts/sync_and_deploy.sh <commit-sha> # fixa em commit exato
# ============================================================
set -euo pipefail

HERMES_DIR="/opt/hermes"
TARGET_REF="${1:-origin/main}"

cd "$HERMES_DIR"

echo "=========================================="
echo "  Hermes - Sync + Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Ref alvo: $TARGET_REF"
echo "=========================================="

if [[ ! -d "$HERMES_DIR/.git" ]]; then
    echo "ERRO: $HERMES_DIR nao parece ser um clone git."
    exit 1
fi

if [[ ! -f "$HERMES_DIR/.env" ]]; then
    echo "ERRO: .env nao encontrado em $HERMES_DIR/.env"
    exit 1
fi

echo "[1/4] Baixando refs do GitHub..."
git fetch --all --tags --prune

echo "[2/4] Sincronizando working tree exatamente com $TARGET_REF..."
git reset --hard "$TARGET_REF"
git clean -fd \
  -e .env \
  -e backend/dados_receita/ \
  -e backend/dados_sidra/ \
  -e backend/outputs/ \
  -e backend/db/

CURRENT_COMMIT="$(git rev-parse --short HEAD)"
echo "  Commit ativo: $CURRENT_COMMIT"

echo "[3/4] Executando deploy dos containers..."
bash "$HERMES_DIR/scripts/deploy.sh"

echo "[4/4] Concluido."
echo "  VPS sincronizada no commit $CURRENT_COMMIT"
