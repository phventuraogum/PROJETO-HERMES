#!/usr/bin/env bash
# Verificação rápida PGFN / app.duckdb na VPS (Linux).
# Uso na VPS: cd /opt/hermes && sudo bash scripts/verify_pgfn_prod.sh
#
# Confere: ficheiros em /data no container api, variáveis HERMES_* relevantes,
# contagens nas tabelas fiscal_public_* e org_id dos imports.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
API_CONTAINER="${API_CONTAINER:-hermes-api}"

cd "$(dirname "$0")/.." || exit 1

if ! docker compose -f "$COMPOSE_FILE" ps --status running -q api 2>/dev/null | grep -q .; then
  echo "ERRO: container '$API_CONTAINER' não está em execução. Suba o stack: docker compose -f $COMPOSE_FILE up -d"
  exit 1
fi

echo "=== 1) Ficheiros DuckDB no container ($API_CONTAINER) ==="
docker compose -f "$COMPOSE_FILE" exec -T api sh -c 'ls -la /data/ 2>/dev/null || echo "(sem /data?)"'

echo ""
echo "=== 2) Variáveis PGFN / app (sem segredos) ==="
docker compose -f "$COMPOSE_FILE" exec -T api sh -c '
  echo "HERMES_APP_DB_PATH=${HERMES_APP_DB_PATH:-}"
  echo "HERMES_DUCKDB_PATH=${HERMES_DUCKDB_PATH:-}"
  echo "HERMES_PG_PUBLIC_SNAPSHOT_ORG_ID=${HERMES_PG_PUBLIC_SNAPSHOT_ORG_ID:-}"
  echo "HERMES_PROSPECCAO_PGFN_ORG_IDS=${HERMES_PROSPECCAO_PGFN_ORG_IDS:-}"
'

echo ""
echo "=== 3) Tabelas fiscais (app.duckdb) ==="
docker compose -f "$COMPOSE_FILE" exec -T api python - <<'PY'
import os
import sys

import duckdb

path = os.environ.get("HERMES_APP_DB_PATH", "/data/app.duckdb")
if not os.path.isfile(path):
    print(f"ERRO: ficheiro inexistente: {path}", file=sys.stderr)
    sys.exit(1)

con = duckdb.connect(path, read_only=True)
for table in ("fiscal_public_imports", "fiscal_public_debts"):
    try:
        n = con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        print(f"{table}: {n} linhas")
    except Exception as e:
        print(f"{table}: ERRO — {e}")

print("\nImports por org_id:")
try:
    rows = con.execute(
        """
        SELECT org_id, count(*) AS n,
               max(imported_at) AS ultimo
        FROM fiscal_public_imports
        GROUP BY org_id
        ORDER BY n DESC
        """
    ).fetchall()
    for r in rows:
        print(f"  org_id={r[0]!r}  imports={r[1]}  ultimo={r[2]}")
except Exception as e:
    print(f"  ERRO: {e}")

con.close()
PY

echo ""
echo "=== Próximo passo ==="
echo "Confirme que HERMES_PG_PUBLIC_SNAPSHOT_ORG_ID no .env coincide com um org_id acima (ex.: default)."
echo "No PC (com JWT): HERMES_API_URL=https://SEU_HOST HERMES_DEV_TOKEN=... python backend/scripts/validate_quitou_pgfn.py"
