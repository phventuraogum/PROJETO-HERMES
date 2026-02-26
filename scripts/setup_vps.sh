#!/bin/bash
# ============================================================
#  Hermes Insight Engine — Setup VPS
#  Rodar como root na VPS: bash setup_vps.sh SEU_DOMINIO seu@email.com
#  Testado em: Ubuntu 22.04 / 24.04 LTS
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
HERMES_DIR="/opt/hermes"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    echo "Uso: bash setup_vps.sh <dominio> <email>"
    echo "Exemplo: bash setup_vps.sh hermes.meudominio.com.br admin@meudominio.com.br"
    exit 1
fi

echo "=========================================="
echo "  Hermes Insight Engine — Setup VPS"
echo "=========================================="
echo "Dominio:    $DOMAIN"
echo "E-mail:     $EMAIL"
echo "Diretorio:  $HERMES_DIR"
echo ""

# ── 1. Atualizar sistema ─────────────────────────────────────
echo "[1/8] Atualizando sistema..."
apt-get update -q && apt-get upgrade -y -q

# ── 2. Instalar dependências ─────────────────────────────────
echo "[2/8] Instalando Docker, Certbot, Fail2ban..."
apt-get install -y -q \
    curl git certbot python3-certbot-nginx \
    ufw fail2ban htop unattended-upgrades

if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | bash
    usermod -aG docker "$USER" || true
fi

if ! docker compose version &>/dev/null; then
    COMPOSE_VERSION="2.27.0"
    curl -SL "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# ── 3. Firewall (UFW) ────────────────────────────────────────
echo "[3/8] Configurando firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# NÃO abrir 6379 (Redis) ou 8000 (API) — só acessíveis via Docker interno
ufw --force enable

# ── 4. Fail2ban ──────────────────────────────────────────────
echo "[4/8] Configurando Fail2Ban..."
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

# ── 5. Hardening SSH ──────────────────────────────────────────
echo "[5/8] Hardening SSH..."
if ! grep -q "^PermitRootLogin no" /etc/ssh/sshd_config 2>/dev/null; then
    sed -i 's/^#*PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
    sed -i 's/^#*PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
    systemctl restart sshd || true
    echo "  SSH: root login via senha desabilitado"
fi

# ── 6. Criar diretório do projeto ───────────────────────────
echo "[6/8] Preparando diretório $HERMES_DIR..."
mkdir -p "$HERMES_DIR"/{dados,logs,backups,scripts}
chmod 750 "$HERMES_DIR"

# ── 7. SSL com Certbot ───────────────────────────────────────
echo "[7/8] Obtendo certificado SSL para $DOMAIN..."
# Nginx temporário para o challenge (certbot --standalone)
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domains "$DOMAIN" \
    || echo "Certbot falhou — configure SSL manualmente depois."

# Renovação automática
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'docker exec hermes-nginx nginx -s reload'") | sort -u | crontab -

# ── 8. Swap (rede de seguranca para 8GB RAM) ────────────────
echo "[8/10] Configurando swap de 4GB..."
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

# ── 9. Backup e cron ─────────────────────────────────────────
echo "[9/10] Configurando backup automatico do DuckDB..."
cp /dev/stdin /etc/cron.daily/hermes-backup << 'CRONSCRIPT'
#!/bin/bash
/opt/hermes/scripts/backup_duckdb.sh
CRONSCRIPT
chmod +x /etc/cron.daily/hermes-backup

# ── 10. Atualizacoes de seguranca automaticas ────────────────
echo "[10/10] Habilitando atualizacoes automaticas..."
dpkg-reconfigure -plow unattended-upgrades || true

echo ""
echo "=========================================="
echo "  VPS configurada com sucesso!"
echo "  IP: $(curl -s ifconfig.me || echo 'N/A')"
echo "=========================================="
echo ""
echo "Proximos passos:"
echo ""
echo "  1. Envie os repos para a VPS:"
echo "     scp -r hermes-insight-engine-main root@IP:/opt/hermes/"
echo "     scp -r icp_radar root@IP:/opt/icp_radar/"
echo ""
echo "  2. Copie .env.production para .env e preencha:"
echo "     cp /opt/hermes/.env.production /opt/hermes/.env"
echo "     nano /opt/hermes/.env"
echo ""
echo "  3. Gere a senha do Redis:"
echo "     openssl rand -hex 32"
echo ""
echo "  4. Copie o cnpj.duckdb para o volume Docker:"
echo "     docker volume create hermes_duckdb_data"
echo "     docker run --rm -v hermes_duckdb_data:/data -v /caminho/local:/src alpine cp /src/cnpj.duckdb /data/cnpj.duckdb"
echo ""
echo "  5. Aponte o DNS A record do dominio para este IP:"
echo "     $(curl -s ifconfig.me || echo 'SEU_IP')"
echo ""
echo "  6. Substitua 'SEU_DOMINIO' no nginx.prod.conf e .env:"
echo "     sed -i 's/SEU_DOMINIO/$DOMAIN/g' /opt/hermes/nginx.prod.conf"
echo "     sed -i \"s|CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN|\" /opt/hermes/.env"
echo ""
echo "  7. Deploy:"
echo "     cd /opt/hermes && bash scripts/deploy.sh"
echo ""
