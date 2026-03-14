#!/bin/bash
# ============================================================
#  Hermes Insight Engine — Setup + Deploy (VPS srv887957)
#  
#  Rodar como root:
#    bash setup_and_deploy.sh
# ============================================================
set -euo pipefail

HERMES_DIR="/opt/hermes"

echo "=========================================="
echo "  Hermes — Setup VPS + Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# ── 1. Atualizar sistema ─────────────────────────────────────
echo ""
echo "[1/8] Atualizando sistema..."
apt-get update -q && apt-get upgrade -y -q

# ── 2. Instalar Docker (se nao tiver) ────────────────────────
echo "[2/8] Verificando Docker..."
if ! command -v docker &>/dev/null; then
    echo "  Instalando Docker..."
    curl -fsSL https://get.docker.com | bash
    systemctl enable docker
    systemctl start docker
else
    echo "  Docker ja instalado: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
    echo "  Docker Compose nao encontrado, instalando..."
    apt-get install -y docker-compose-plugin
fi
echo "  Docker Compose: $(docker compose version)"

# ── 3. Firewall ──────────────────────────────────────────────
echo "[3/8] Configurando firewall..."
apt-get install -y -q ufw fail2ban 2>/dev/null || true

ufw --force reset >/dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "  UFW ativo: SSH, 80, 443"

# ── 4. Fail2ban ──────────────────────────────────────────────
echo "[4/8] Configurando Fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200
EOF

systemctl enable fail2ban
systemctl restart fail2ban
echo "  Fail2ban ativo"

# ── 5. Swap (rede de seguranca) ──────────────────────────────
echo "[5/8] Verificando swap..."
if [[ ! -f /swapfile ]]; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
    sysctl vm.swappiness=10
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    echo "  Swap 4GB criado"
else
    echo "  Swap ja existe"
fi

# ── 6. Preparar diretorios ───────────────────────────────────
echo "[6/8] Preparando diretorios..."
mkdir -p "$HERMES_DIR" /var/www/certbot

# ── 7. Copiar .env ───────────────────────────────────────────
echo "[7/8] Configurando .env..."
if [[ -f "$HERMES_DIR/.env.production" && ! -f "$HERMES_DIR/.env" ]]; then
    cp "$HERMES_DIR/.env.production" "$HERMES_DIR/.env"
    echo "  .env criado a partir de .env.production"
elif [[ -f "$HERMES_DIR/.env" ]]; then
    echo "  .env ja existe"
else
    echo "  AVISO: .env.production nao encontrado — copie manualmente"
fi

# ── 8. Volume DuckDB ─────────────────────────────────────────
echo "[8/8] Verificando volume DuckDB..."
if ! docker volume inspect hermes_duckdb_data >/dev/null 2>&1; then
    docker volume create hermes_duckdb_data
    echo "  Volume hermes_duckdb_data criado"

    if [[ -f "$HERMES_DIR/backend/dados_receita/cnpj.duckdb" ]]; then
        echo "  Copiando cnpj.duckdb para o volume..."
        docker run --rm \
            -v hermes_duckdb_data:/data \
            -v "$HERMES_DIR/backend/dados_receita":/src:ro \
            alpine cp /src/cnpj.duckdb /data/cnpj.duckdb
        echo "  cnpj.duckdb copiado para volume"
    else
        echo "  AVISO: cnpj.duckdb nao encontrado em $HERMES_DIR/backend/dados_receita/"
        echo "         Copie manualmente antes do deploy."
    fi
else
    echo "  Volume hermes_duckdb_data ja existe"
fi

echo ""
echo "=========================================="
echo "  Setup concluido!"
echo "=========================================="
echo ""
echo "  Proximo passo — deploy:"
echo "    cd $HERMES_DIR && bash scripts/deploy.sh"
echo ""
