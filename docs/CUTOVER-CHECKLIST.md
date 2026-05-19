# Cutover Checklist · Migração Supabase Hermes

**Data:** 2026-05-19
**De:** `yxlntagncgpevztveapn.supabase.co` (projeto antigo)
**Para:** `gibmowjjcvbnaynfqyfw.supabase.co` (projeto novo dedicado Hermes)

---

## Pré-requisitos confirmados (já feitos)

- [x] Schema canônico aplicado no novo (`scripts/hermes_canonical_schema.sql`)
- [x] Funções `encrypt_secret(text, text)` + `decrypt_secret(text, text)` funcionando
- [x] Admin users criados: `admin@pinn.com` + `admin@om.com`
- [x] Orgs criadas: Pinn + OM MKT
- [x] Chaves Assertiva criptografadas em `org_integrations_private` (1 row por org)
- [x] `HERMES_ENCRYPTION_KEY` gerada e salva localmente em `.env.local`

---

## Passos de cutover (em ordem)

### 1 · Conectar na VPS

```bash
ssh root@31.97.241.171
cd /opt/hermes
```

### 2 · Backup do `.env` atual

```bash
cp .env .env.backup-$(date +%Y%m%d-%H%M%S)
```

### 3 · Editar `.env` — trocar Supabase + adicionar HERMES_ENCRYPTION_KEY

Atualize estas vars no `/opt/hermes/.env`:

```bash
# === NOVAS / ATUALIZADAS ===
SUPABASE_URL=https://gibmowjjcvbnaynfqyfw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpYm1vd2pqY3ZibmF5bmZxeWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTE5OTE2MywiZXhwIjoyMDk0Nzc1MTYzfQ.FUdvThQX8NbZJzli2iehwN40vPsRn3Pu3sATFDSH6t4

# Pegar no Dashboard novo → Settings → API
SUPABASE_ANON_KEY=<NOVA_ANON_KEY>
SUPABASE_JWT_SECRET=<NOVO_JWT_SECRET>

# Pra backend decifrar chaves em org_integrations_private
HERMES_ENCRYPTION_KEY=7NjvU4W0g4epvuk3xKUpoFlF937c6BNBkWE4b_SqbOo

# Frontend (build args)
VITE_SUPABASE_URL=https://gibmowjjcvbnaynfqyfw.supabase.co
VITE_SUPABASE_ANON_KEY=<NOVA_ANON_KEY>
```

⚠️ **NÃO REMOVA** vars existentes que não estão listadas acima (Redis, ASAAS, EVOLUTION, CORS_ORIGINS, etc).

### 4 · Onde pegar SUPABASE_ANON_KEY e SUPABASE_JWT_SECRET

Browser: https://supabase.com/dashboard/project/gibmowjjcvbnaynfqyfw/settings/api
- **anon** (public) → `SUPABASE_ANON_KEY` + `VITE_SUPABASE_ANON_KEY`
- **JWT Secret** → `SUPABASE_JWT_SECRET`

### 5 · Deploy

```bash
cd /opt/hermes
git fetch origin
git checkout feat/pgfn-enrichment-pipeline
git pull origin feat/pgfn-enrichment-pipeline
bash scripts/deploy.sh
```

O `deploy.sh` valida automaticamente:
- ✅ SUPABASE_URL não vazio
- ✅ SUPABASE_SERVICE_ROLE_KEY não vazio
- ✅ SUPABASE_JWT_SECRET não vazio
- ⚠️ HERMES_ENCRYPTION_KEY (warning se vazio — não bloqueia)

### 6 · Smoke test pós-deploy

```bash
# Containers OK
docker compose -f docker-compose.prod.yml ps
# Esperado: 5 containers Up — redis, api, worker, searxng, web

# Health API
curl http://localhost:8082/api/health
# Esperado: {"status": "ok"}

# Auth obrigatória
curl -o /dev/null -w "%{http_code}\n" http://localhost:8082/api/prospeccao/run
# Esperado: 401 (sem token)
```

No browser:
1. Abre URL pública do Hermes
2. Login com `admin@pinn.com` / `_tSn5UyLZivNpcEgb_0_TA` (ou senha já rotacionada)
3. Cria 1 lead manual no Pipeline
4. Verifica que aparece — confirma backend lendo do Supabase novo

### 7 · Observação por 24h

- Monitorar logs: `docker compose logs -f api`
- Watch erros 5xx em qualquer endpoint
- Confirmar que Assertiva responde (vai tentar usar chaves criptografadas — se backend não estiver lendo de `org_integrations_private`, vai usar env legacy `ASSERTIVA_CLIENT_ID`)

### 8 · Rollback (se necessário em 24h)

```bash
cd /opt/hermes
mv .env .env.broken
cp .env.backup-YYYYMMDD-HHMMSS .env
bash scripts/deploy.sh
```

Volta pro Supabase antigo. Nada se perde porque o novo só tem 2 users de teste — dados reais ainda não migraram.

### 9 · Decomissionar antigo (quando confirmar 48h sem incidente)

1. Pausar projeto antigo no Dashboard: https://supabase.com/dashboard/project/yxlntagncgpevztveapn/settings/general
2. Deletar `.env.backup-*` da VPS
3. Rotacionar **TODAS** as 4 service_role keys + 2 Assertiva keys que passaram pelo chat:
   - service_role do antigo (yxln...)
   - service_role do novo (gibmow...)
   - Assertiva Pinn (id + secret)
   - Assertiva OM (id + secret)

---

## Credenciais consolidadas (verificar `.env.local`)

| Var | Valor / Onde pegar |
|---|---|
| SUPABASE_URL | `https://gibmowjjcvbnaynfqyfw.supabase.co` |
| SUPABASE_SERVICE_ROLE_KEY | Em `.env.local` |
| SUPABASE_ANON_KEY | Dashboard Settings → API (não está em `.env.local` ainda) |
| SUPABASE_JWT_SECRET | Dashboard Settings → API |
| HERMES_ENCRYPTION_KEY | `7NjvU4W0g4epvuk3xKUpoFlF937c6BNBkWE4b_SqbOo` |
| VITE_SUPABASE_URL | mesmo que SUPABASE_URL |
| VITE_SUPABASE_ANON_KEY | mesmo que SUPABASE_ANON_KEY |

## Senhas iniciais admin (TROCAR APÓS 1º LOGIN)

| Login | Senha temporária |
|---|---|
| admin@pinn.com | `_tSn5UyLZivNpcEgb_0_TA` |
| admin@om.com | `1sAGsaLppL29A_h-QKdKPg` |
