#!/bin/bash
# ============================================================
#  Copia cnpj.duckdb de backend/dados_receita/ para o volume Docker
#  Rode na VPS depois de enviar o arquivo para /opt/hermes/backend/dados_receita/
#
#  Uso: cd /opt/hermes && sudo bash scripts/copiar_duckdb_para_volume.sh
# ============================================================
set -euo pipefail

HERMES_DIR="/opt/hermes"
SOURCE="$HERMES_DIR/backend/dados_receita/cnpj.duckdb"

if [[ ! -f "$SOURCE" ]]; then
    echo "ERRO: Arquivo nao encontrado: $SOURCE"
    echo ""
    echo "  Envie o cnpj.duckdb do seu PC para a VPS:"
    echo "  scp \"C:\\caminho\\para\\cnpj.duckdb\" root@IP_DA_VPS:/opt/hermes/backend/dados_receita/"
    echo ""
    echo "  Na VPS, crie a pasta antes (se precisar):"
    echo "  sudo mkdir -p /opt/hermes/backend/dados_receita"
    exit 1
fi

echo "Copiando cnpj.duckdb para o volume Docker..."
docker run --rm \
    -v hermes_duckdb_data:/data \
    -v "$HERMES_DIR/backend/dados_receita":/src:ro \
    alpine cp /src/cnpj.duckdb /data/cnpj.duckdb

echo "OK. cnpj.duckdb esta no volume. Reinicie os containers para garantir:"
echo "  cd /opt/hermes && sudo docker compose -f docker-compose.prod.yml restart api worker"
echo ""
