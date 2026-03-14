#!/bin/bash
# ============================================================
#  Hermes Insight Engine — Backup DuckDB
#  Executado diariamente via cron
# ============================================================
set -euo pipefail

DUCKDB_PATH="/opt/hermes/dados/cnpj.duckdb"
BACKUP_DIR="/opt/hermes/backups"
DATE=$(date +%Y%m%d_%H%M)
BACKUP_FILE="$BACKUP_DIR/cnpj_${DATE}.duckdb"
MAX_LOCAL_BACKUPS=7  # Manter 7 dias localmente

echo "[$(date)] Iniciando backup do DuckDB..."

# Backup local
if [[ -f "$DUCKDB_PATH" ]]; then
    cp "$DUCKDB_PATH" "$BACKUP_FILE"
    gzip "$BACKUP_FILE"
    echo "[$(date)] Backup criado: ${BACKUP_FILE}.gz"
else
    echo "[$(date)] ⚠️  DuckDB não encontrado em $DUCKDB_PATH"
    exit 1
fi

# Remover backups antigos (manter últimos N)
ls -t "$BACKUP_DIR"/*.duckdb.gz 2>/dev/null | tail -n +$((MAX_LOCAL_BACKUPS + 1)) | xargs -r rm -f
echo "[$(date)] Backups locais antigos removidos (mantendo $MAX_LOCAL_BACKUPS)."

# Upload para armazenamento remoto (opcional — configure rclone)
# rclone copy "$BACKUP_DIR" remote:hermes-backups/ --include "*.duckdb.gz"

echo "[$(date)] ✅ Backup concluído: ${BACKUP_FILE}.gz"
