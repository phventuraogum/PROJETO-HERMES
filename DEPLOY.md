# Hermes — Rodar em produção na VPS

Guia para colocar o sistema no ar em um servidor (VPS) e mantê-lo em produção.

---

## Forma mais simples: um comando na VPS

Depois de **clonar o repo** em `/opt/hermes` e **criar o arquivo `.env`** (ver passos abaixo), na VPS rode:

```bash
cd /opt/hermes && sudo bash scripts/run_production.sh
```

- **Primeira vez:** o script detecta que Docker não está instalado, roda o setup (Docker, firewall, swap, volume) e em seguida o deploy.
- **Próximas vezes:** só roda o deploy (build + sobe os containers + health check).

O sistema fica acessível em **http://IP_DA_VPS** ou **http://hostname.da.vps** (ex.: `http://31.97.241.171`).

---

## Visão geral (passo a passo)

| Etapa | O que faz |
|-------|-----------|
| 1. Conectar na VPS | SSH no servidor |
| 2. Clonar o repositório | Código em `/opt/hermes` |
| 3. Configurar `.env` | Variáveis de produção |
| 4. (Opcional) Subir o DuckDB | Base de CNPJs para prospecção |
| 5. Rodar em produção | `sudo bash scripts/run_production.sh` |
| 6. Acessar | URL do servidor (HTTP ou HTTPS com domínio) |

---

## 1. Conectar na VPS

No seu PC (PowerShell ou terminal):

```bash
ssh root@31.97.241.171
# ou, se tiver hostname:
# ssh root@srv887957.hstgr.cloud
```

Use o usuário que tiver acesso (ex.: `root` ou usuário do painel).

---

## 2. Clonar o repositório

O projeto fica em **/opt/hermes**. Repo privado = use um **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens, escopo `repo`).

Na VPS:

```bash
sudo mkdir -p /opt
sudo git clone https://phventuraogum:SEU_TOKEN@github.com/phventuraogum/PROJETO-HERMES.git /opt/hermes
cd /opt/hermes
sudo git remote set-url origin https://github.com/phventuraogum/PROJETO-HERMES.git
```

Substitua `SEU_TOKEN` pelo PAT. O segundo comando remove o token da URL do remote.

---

## 3. Configurar o `.env`

O `.env` **não** vai no Git. Você precisa criar **/opt/hermes/.env** na VPS com todas as variáveis de produção.

**Opção A — Copiar do seu PC (recomendado)**  
No **PowerShell do seu PC** (onde já existe `.env.production`):

```powershell
scp G:\hermes-insight-engine-main\.env.production root@31.97.241.171:/opt/hermes/.env
```

**Opção B — Criar na mão na VPS**

```bash
sudo nano /opt/hermes/.env
```

Cole o mesmo conteúdo do seu `.env.production` e salve (Ctrl+O, Enter, Ctrl+X).

**Variáveis obrigatórias para produção:**

- `ENVIRONMENT=production`
- `HERMES_AUTH_REQUIRED=true`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `REDIS_PASSWORD` (ex.: `openssl rand -hex 32`)
- `CORS_ORIGINS` = URL do sistema (ex.: `http://srv887957.hstgr.cloud,http://31.97.241.171`)
- `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` (para pagamentos)

Sem o `.env` correto, o `deploy.sh` falha na checagem.

---

## 4. (Opcional) Base DuckDB para prospecção

A prospecção usa um banco **cnpj.duckdb** (milhões de CNPJs). Sem ele, a API sobe, mas a funcionalidade de prospecção não funciona.

**Se você já tem o arquivo `cnpj.duckdb` no seu PC:**

1. Envie para a VPS:

   ```powershell
   scp "G:\caminho\para\cnpj.duckdb" root@31.97.241.171:/opt/hermes/backend/dados_receita/
   ```

2. Na VPS, crie a pasta se não existir:

   ```bash
   sudo mkdir -p /opt/hermes/backend/dados_receita
   # depois envie o arquivo para aí (como acima)
   ```

O script de setup (próximo passo) copia esse arquivo para o volume Docker. Se não tiver o DuckDB agora, pode rodar o setup e o deploy mesmo assim; depois você coloca o arquivo em `backend/dados_receita/` e recria o volume ou copia manualmente para o volume.

---

## 5. Setup (primeira vez na VPS)

Roda **uma vez** para: atualizar o sistema, instalar Docker (se precisar), configurar firewall (UFW), Fail2ban, swap 4GB, criar diretórios e volume DuckDB (e copiar `cnpj.duckdb` se existir em `backend/dados_receita/`).

Na VPS:

```bash
cd /opt/hermes
sudo bash scripts/setup_and_deploy.sh
```

Se não existir `/opt/hermes/.env`, o script tenta criar a partir de `.env.production` (se existir). Como normalmente o `.env.production` não sobe no Git, o mais seguro é já ter criado o `.env` no passo 3.

---

## 6. Deploy (subir o sistema)

Sempre que for “por em produção” ou atualizar o código:

```bash
cd /opt/hermes
sudo bash scripts/deploy.sh
```

O script:

1. Valida o `.env` (variáveis obrigatórias).
2. Faz build das imagens (`docker compose build --no-cache`).
3. Sobe os serviços (`docker compose up -d`).
4. Espera e testa o health check (`/health`).
5. Verifica alguns endpoints de segurança.
6. Mostra o status dos containers.

Se algo falhar, a mensagem indica o que corrigir (geralmente `.env` ou logs do container `api`).

---

## 7. Acessar o sistema

- **Sem domínio (só IP/hostname da VPS):**  
  - Frontend: `http://srv887957.hstgr.cloud` ou `http://31.97.241.171`
- **Com domínio depois:**  
  - Aponte o DNS do domínio para o IP da VPS.
  - No `nginx.prod.conf` troque `server_name` para o domínio.
  - Instale SSL (ex.: `certbot --nginx -d seudominio.com.br`) e descomente as partes HTTPS no `nginx.prod.conf` e no `docker-compose.prod.yml`.

O `CORS_ORIGINS` no `.env` deve incluir a URL que os usuários usam (ex.: `http://srv887957.hstgr.cloud,http://31.97.241.171`).

---

## Comandos úteis em produção

| Comando | Uso |
|--------|-----|
| `cd /opt/hermes && sudo docker compose -f docker-compose.prod.yml ps` | Ver containers |
| `cd /opt/hermes && sudo docker compose -f docker-compose.prod.yml logs -f` | Logs de todos os serviços |
| `cd /opt/hermes && sudo docker compose -f docker-compose.prod.yml logs -f api` | Só logs da API |
| `curl -s http://localhost/health` | Testar health na própria VPS |
| `cd /opt/hermes && git pull && sudo bash scripts/deploy.sh` | Atualizar código e redeploy |

---

## Resumo rápido (já com repo clonado e .env pronto)

```bash
ssh root@31.97.241.171
cd /opt/hermes
sudo bash scripts/run_production.sh
# Acesse http://31.97.241.171 ou http://srv887957.hstgr.cloud
```

O `run_production.sh` faz o setup na primeira vez (se precisar) e sempre o deploy. Depois disso o sistema está rodando na VPS.
