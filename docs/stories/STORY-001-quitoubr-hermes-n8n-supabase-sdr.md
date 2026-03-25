# STORY-001 - Fluxo QuitouBR (Hermes → n8n → Supabase → SDR)

## Status
Done

## Contexto
O projeto Hermes já possui um fluxo de SDR integrado ao n8n, onde:

- `POST /pipeline/enviar-sdr` insere leads na tabela `leads_outbound` no Supabase (status `pending`) e opcionalmente dispara um webhook (`N8N_OUTBOUND_WEBHOOK`).
- O n8n consome a fila via `GET /sdr/leads?status=pending` e atualiza o status via `PATCH /sdr/leads/{id}`, registrando atividades em `sdr_activities`.

Precisamos construir o **mesmo fluxo para a QuitouBR**, mas **sem obrigar um segundo deploy completo do Hermes**.

O requisito agora é: o Hermes deve suportar **roteamento multi-tenant do destino Supabase** (por `X-Org-Id`),
permitindo que tenants diferentes escrevam/leiam a fila SDR em **projetos Supabase diferentes**.

## Objetivo
Receber leads originados no Hermes (QuitouBR), persistir no Supabase QuitouBR e permitir que o n8n (QuitouBR) e/ou um agente de IA façam o consumo dessa fila de forma independente da PINN.

## Acceptance Criteria
- [x] Existe uma configuração de tenants (por env) que mapeia `org_id -> SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ webhook n8n opcional)`.
- [x] Para `X-Org-Id=quitoubr` (ou o `org_id` definido), o endpoint `POST /pipeline/enviar-sdr` grava em `leads_outbound` **no Supabase QuitouBR**.
- [x] Para `X-Org-Id=pinn` (ou default), o mesmo endpoint mantém o comportamento e grava no Supabase padrão.
- [x] O n8n QuitouBR consegue consumir a fila via `GET /sdr/leads?status=pending` e atualizar via `PATCH /sdr/leads/{id}` usando o mesmo `X-Org-Id` (ou config equivalente) e operando no Supabase QuitouBR.
- [x] O webhook outbound (`N8N_OUTBOUND_WEBHOOK`) pode ser definido por tenant (ou cai no default), de forma que PINN e QuitouBR usem workflows n8n separados.
- [x] Cada empresa consegue configurar **seu próprio Kommo** (via webhook n8n) atrelado à organização/log-in (sem misturar com outras empresas). *(requer rodar `scripts/migration_org_integrations.sql` no Supabase principal)*
- [x] Existe `GET /orgs` retornando as orgs do usuário com `role`, e o frontend usa isso para selecionar `X-Org-Id`.
- [x] Telas/menus não permitidos ficam **ocultos** para usuários `member` (empresa), e rotas admin-only bloqueiam acesso direto.
- [x] Documentação curta no repositório explicando as variáveis `.env` e um exemplo de `SUPABASE_TENANTS_JSON`.

## Detalhes de Implementação
### Estratégia de isolamento (aplicada aqui)
Isolamento por **destino Supabase** (roteamento por `X-Org-Id`):

- **PINN** e **QuitouBR** podem compartilhar o mesmo backend Hermes, mas:
  - gravam/leem a fila SDR em **Supabases diferentes**
  - disparam **webhooks n8n diferentes** (por tenant)

### Variáveis de ambiente (backend)
Configurar:

- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (default)
- `SUPABASE_TENANTS_JSON` (mapeamento por tenant, incluindo QuitouBR)
- `N8N_OUTBOUND_WEBHOOK` (default) e/ou webhook por tenant no JSON

Observação: auth do Hermes (JWT) continua usando as configs globais (`SUPABASE_JWT_SECRET`, etc.). O roteamento aqui é para **persistência/consumo da fila SDR**.

### Variáveis de ambiente (frontend)
No build do frontend do Hermes QuitouBR:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

E garantir que a sessão não conflite entre ambientes. Hoje a chave é `storageKey: "hermes_supabase_session"`. Para isolamento por domínio, isso costuma ser suficiente; se rodar no mesmo domínio, trocar para uma chave específica por app.

### Supabase (QuitouBR)
Criar as tabelas equivalentes:

- `leads_outbound`
- `sdr_activities`
- (se aplicável) `pipeline_leads`

Mantendo o mesmo schema do fluxo existente.

### n8n (QuitouBR)
Workflow separado que:

- Consome `GET /sdr/leads?status=pending` (periodicamente)
- Atualiza `PATCH /sdr/leads/{id}` com status/canal/erro
- Registra `POST /sdr/leads/{id}/activity` conforme ações

## Arquivos Tocados
- [x] `docs/stories/STORY-001-quitoubr-hermes-n8n-supabase-sdr.md`
- [x] `backend/api/tenancy/supabase.py` (roteamento de destino Supabase por tenant)
- [x] `backend/api/routers/pipeline.py`
- [x] `backend/api/routers/sdr.py`
- [x] `backend/api/routers/orgs.py`
- [x] `backend/api/tenancy/rbac.py`
- [x] `backend/api/main_integrado.py`
- [x] `backend/config.py`
- [x] `backend/.env.example`
- [x] `scripts/migration_org_integrations.sql`
- [x] `src/tenancy/OrgContext.tsx`
- [x] `src/components/layout/Sidebar.tsx`
- [x] `src/auth/RequireRole.tsx`
- [x] `src/App.tsx`
- [x] `src/lib/api.ts`
- [x] `src/pages/Configure.tsx`
- [ ] (se necessário) documentação/guia em `DEPLOY.md` ou `docs/`

