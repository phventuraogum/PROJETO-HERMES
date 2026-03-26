-- ═══════════════════════════════════════════════════════════════════════
-- HERMES — Setup da Org Admin (Pinn)
-- Execute no SQL Editor do Supabase Pinn (dashboard.supabase.com)
--
-- Antes de rodar, edite as 3 variáveis no bloco DO $$ abaixo:
--   v_admin_email  → e-mail do seu admin (HERMES_MASTER_EMAIL)
--   v_supa_url     → URL do seu projeto Pinn (Settings > API > Project URL)
--   v_svc_key      → service_role key do Pinn (Settings > API > service_role)
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin_email text := 'admin@hermes.com';           -- ← edite aqui
  v_supa_url    text := 'https://SEU_PROJETO.supabase.co'; -- ← edite aqui
  v_svc_key     text := 'eyJ...';                         -- ← edite aqui (service_role key)

  v_admin_id    uuid;
  v_org_id      uuid;
BEGIN
  -- 1. Busca o admin pelo e-mail
  SELECT id INTO v_admin_id FROM auth.users WHERE email = v_admin_email;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Usuário % não encontrado em auth.users — verifique o e-mail', v_admin_email;
  END IF;

  -- 2. Cria a org "Pinn Admin" (idempotente via ON CONFLICT)
  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES ('Pinn Admin', 'admin', v_admin_id)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_org_id;

  -- Se já existia, busca o ID existente
  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'admin';
  END IF;

  -- 3. Adiciona o admin como owner da org
  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (v_org_id::text, v_admin_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- 4. Configura tenant apontando para o próprio Supabase Pinn
  INSERT INTO public.org_tenants (org_id, supabase_url, supabase_service_key)
  VALUES (v_org_id::text, v_supa_url, v_svc_key)
  ON CONFLICT (org_id) DO UPDATE
    SET supabase_url          = EXCLUDED.supabase_url,
        supabase_service_key  = EXCLUDED.supabase_service_key;

  RAISE NOTICE '✓ Org admin criada com sucesso — org_id: %, admin_id: %', v_org_id, v_admin_id;
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 5. Provisiona as tabelas do Hermes no Supabase Pinn (se não existirem)
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pipeline_leads (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL DEFAULT 'default',
  cnpj                 TEXT        NOT NULL,
  razao_social         TEXT        NOT NULL,
  nome_fantasia        TEXT,
  email                TEXT,
  email_enriquecido    TEXT,
  telefone             TEXT,
  whatsapp             TEXT,
  telefone_enriquecido TEXT,
  site                 TEXT,
  cidade               TEXT,
  uf                   TEXT,
  segmento             TEXT,
  porte                TEXT,
  capital_social       NUMERIC,
  estagio              TEXT        DEFAULT 'novo',
  kommo_synced         BOOLEAN     DEFAULT FALSE,
  kommo_lead_id        BIGINT,
  kommo_contact_id     BIGINT,
  adicionado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, cnpj)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_kommo_synced
  ON public.pipeline_leads (kommo_synced, adicionado_em);

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_org_id
  ON public.pipeline_leads (org_id);

-- Colunas Kommo na tabela de leads (formulário do site), se existir
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS kommo_synced  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kommo_lead_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_leads_kommo_synced
  ON public.leads (kommo_synced, created_at);
