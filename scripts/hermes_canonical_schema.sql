-- ============================================================================
-- HERMES — Schema canônico para Supabase novo (fresh install)
-- Data: 2026-05-19
-- Inclui:
--   - 11 tabelas core (multi-tenant org-based)
--   - RLS apertada via my_org_ids() (FIX MAI-11: substitui policies "USING true")
--   - pgcrypto pra criptografar credenciais externas (Assertiva, Ploomes, etc)
--   - exec_sql + REVOKE imediato (FIX MAI-04: P0 segurança)
--   - 4 planos pré-seed (free/starter/pro/enterprise)
--
-- Como rodar:
--   1. Cole TUDO no SQL Editor do projeto novo Supabase
--   2. Clique RUN
--   3. Depois rode: python scripts/supabase_admin.py check
-- ============================================================================

-- =====================================================================
-- 0. EXTENSIONS
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. HELPER FUNCTIONS (criadas cedo pq são usadas em policies)
-- =====================================================================

-- exec_sql: helper pra DDL via REST. CRIADO + REVOGADO no fim do arquivo
-- (estratégia: existir só durante a migration; revogar PUBLIC ao final).
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
  RETURN json_build_object('status', 'ok');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('status', 'error', 'message', SQLERRM, 'detail', SQLSTATE);
END;
$$;

-- set_updated_at: trigger genérico
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- NOTA: my_org_ids() é criada DEPOIS de public.org_members existir (seção 5).
-- LANGUAGE sql é parsed na criação — forward reference não permitida.

-- =====================================================================
-- 2. CRIPTOGRAFIA — wrapper pgcrypto pras credenciais externas
-- =====================================================================
-- Estratégia: chave-mestra passa como PARÂMETRO em cada chamada.
-- Backend Hermes lê HERMES_ENCRYPTION_KEY do env e passa pra função.
-- Razão: Supabase bloqueia ALTER DATABASE/ROLE pra GUCs custom (sem superuser),
-- então não dá pra usar current_setting('app.encryption_key').
-- service_role bypassa RLS; só quem chama com a chave certa decifra.

CREATE OR REPLACE FUNCTION public.encrypt_secret(plain text, key text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT encode(pgp_sym_encrypt(plain, key), 'base64');
$$;

CREATE OR REPLACE FUNCTION public.decrypt_secret(encrypted text, key text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT pgp_sym_decrypt(decode(encrypted, 'base64'), key)
  WHERE encrypted IS NOT NULL;
$$;

-- =====================================================================
-- 3. PLANS (planos de assinatura)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.plans (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    price_brl   NUMERIC(10,2) NOT NULL DEFAULT 0,
    searches_per_month    INTEGER NOT NULL DEFAULT 100,
    enrichments_per_month INTEGER NOT NULL DEFAULT 50,
    exports_per_month     INTEGER NOT NULL DEFAULT 10,
    can_export_crm       BOOLEAN NOT NULL DEFAULT false,
    can_use_pipeline     BOOLEAN NOT NULL DEFAULT false,
    can_multi_user       BOOLEAN NOT NULL DEFAULT false,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.plans (name, label, price_brl, searches_per_month, enrichments_per_month, exports_per_month, can_export_crm, can_use_pipeline, can_multi_user)
VALUES
    ('free',       'Gratis',        0,     50,    15,    5, false, false, false),
    ('starter',    'Starter',     597,    500,   150,   50,  true, false, false),
    ('pro',        'Pro',         947,   2000,   800,  200,  true,  true, false),
    ('enterprise', 'Enterprise', 1297,  10000,  5000, 1000,  true,  true,  true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- 4. ORGANIZATIONS (multi-tenant)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id      UUID REFERENCES public.plans(id),
    credits_balance INTEGER NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    trial_ends_at TIMESTAMPTZ,
    ploomes_api_key   TEXT,    -- mantido em texto puro (legado; migrar pra org_integrations_private)
    ploomes_funnel_id BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_default_plan()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.plan_id IS NULL THEN
        SELECT id INTO NEW.plan_id FROM public.plans WHERE name = 'free';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_default_plan ON public.organizations;
CREATE TRIGGER trg_org_default_plan BEFORE INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_default_plan();

DROP TRIGGER IF EXISTS trg_orgs_updated_at ON public.organizations;
CREATE TRIGGER trg_orgs_updated_at BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 5. ORG_MEMBERS (vínculo user ↔ org com role)
-- =====================================================================
DO $$ BEGIN
    CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.org_members (
    id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role     org_role NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES auth.users(id),
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id);

-- my_org_ids: retorna orgs do usuário logado (via JWT auth.uid())
-- Criada AQUI, depois de org_members existir.
CREATE OR REPLACE FUNCTION public.my_org_ids()
RETURNS UUID[]
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT COALESCE(ARRAY_AGG(org_id), ARRAY[]::UUID[])
    FROM public.org_members
    WHERE user_id = auth.uid();
$$;

-- =====================================================================
-- 6. SUBSCRIPTIONS (Asaas)
-- =====================================================================
DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'unpaid');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id        UUID NOT NULL REFERENCES public.plans(id),
    status         subscription_status NOT NULL DEFAULT 'active',
    asaas_customer_id    TEXT,
    asaas_subscription_id TEXT,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    canceled_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 7. PAYMENTS (Asaas)
-- =====================================================================
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'received', 'confirmed', 'overdue', 'refunded', 'canceled', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_type AS ENUM ('subscription', 'credits');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id),
    asaas_payment_id    TEXT NOT NULL UNIQUE,
    type                payment_type NOT NULL,
    status              payment_status NOT NULL DEFAULT 'pending',
    amount_brl          NUMERIC(10,2) NOT NULL,
    credits_granted     INTEGER NOT NULL DEFAULT 0,
    billing_type        TEXT,
    due_date            DATE,
    paid_at             TIMESTAMPTZ,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 8. USAGE_LOGS + view
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES auth.users(id),
    action       TEXT NOT NULL,
    count        INTEGER NOT NULL DEFAULT 1,
    period_year  SMALLINT NOT NULL,
    period_month SMALLINT NOT NULL,
    metadata     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_org_period
    ON public.usage_logs (org_id, period_year, period_month, action);

CREATE OR REPLACE VIEW public.monthly_usage_summary AS
SELECT org_id, period_year, period_month, action, SUM(count)::INTEGER AS total
FROM public.usage_logs
GROUP BY org_id, period_year, period_month, action;

-- =====================================================================
-- 9. PIPELINE_LEADS (core)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.pipeline_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cnpj          TEXT NOT NULL,
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  estagio       TEXT NOT NULL DEFAULT 'novo'
    CHECK (estagio IN ('novo','em_analise','contactado','qualificado','descartado')),
  score_icp     NUMERIC(5,1) DEFAULT 0,
  email         TEXT,
  telefone      TEXT,
  telefone_receita  TEXT,
  telefone_estab1   TEXT,
  telefone_estab2   TEXT,
  whatsapp      TEXT,
  site          TEXT,
  cidade        TEXT,
  uf            TEXT,
  segmento      TEXT,
  porte         TEXT,
  capital_social NUMERIC,
  cnae_principal TEXT,
  cnae_descricao TEXT,
  socios_resumo TEXT,
  email_enriquecido    TEXT,
  telefone_enriquecido TEXT,
  whatsapp_enriquecido TEXT,
  nota          TEXT DEFAULT '',
  sdr_status    TEXT,
  sdr_enviado_em TIMESTAMPTZ,
  ploomes_contact_id BIGINT,
  ploomes_deal_id    BIGINT,
  ploomes_synced     BOOLEAN DEFAULT FALSE,
  empresa_data  JSONB,
  -- MAI-09: breakdown ICP v2 (vai virar JSON estruturado)
  icp_tier         TEXT,
  icp_sinais       TEXT[],
  icp_penalidades  TEXT[],
  adicionado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, cnpj)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_org      ON public.pipeline_leads(org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_estagio  ON public.pipeline_leads(org_id, estagio);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_sdr      ON public.pipeline_leads(sdr_status) WHERE sdr_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_ploomes  ON public.pipeline_leads(ploomes_synced) WHERE ploomes_synced = FALSE;

CREATE OR REPLACE FUNCTION update_pipeline_leads_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipeline_leads_updated ON public.pipeline_leads;
CREATE TRIGGER trg_pipeline_leads_updated BEFORE UPDATE ON public.pipeline_leads
  FOR EACH ROW EXECUTE FUNCTION update_pipeline_leads_timestamp();

-- =====================================================================
-- 10. LEADS_OUTBOUND + SDR_ACTIVITIES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.leads_outbound (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name        TEXT,
    phone       TEXT,
    email       TEXT,
    company     TEXT,
    segment     TEXT,
    cnpj        TEXT,
    whatsapp    TEXT,
    porte       TEXT,
    cidade      TEXT,
    uf          TEXT,
    score_icp   NUMERIC(5,1) DEFAULT 0,
    ploomes_contact_id BIGINT,
    ploomes_deal_id    BIGINT,
    attempts    INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    channel     TEXT,
    source      TEXT DEFAULT 'hermes',
    status      TEXT DEFAULT 'pending',
    error_message TEXT,
    metadata    JSONB DEFAULT '{}',
    completed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_outbound_status   ON public.leads_outbound(status);
CREATE INDEX IF NOT EXISTS idx_leads_outbound_pending  ON public.leads_outbound(status, next_attempt_at) WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_leads_outbound_org      ON public.leads_outbound(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_outbound_ploomes  ON public.leads_outbound(ploomes_contact_id) WHERE ploomes_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_outbound_cnpj     ON public.leads_outbound(cnpj) WHERE cnpj IS NOT NULL;

CREATE OR REPLACE FUNCTION update_leads_outbound_timestamp()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_outbound_updated ON public.leads_outbound;
CREATE TRIGGER trg_leads_outbound_updated BEFORE UPDATE ON public.leads_outbound
    FOR EACH ROW EXECUTE FUNCTION update_leads_outbound_timestamp();

CREATE TABLE IF NOT EXISTS public.sdr_activities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id       UUID REFERENCES public.leads_outbound(id) ON DELETE CASCADE,
    org_id        UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    channel       TEXT,
    subject       TEXT,
    content       TEXT,
    result        TEXT,
    ploomes_synced BOOLEAN DEFAULT false,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sdr_activities_lead   ON public.sdr_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_sdr_activities_org    ON public.sdr_activities(org_id);
CREATE INDEX IF NOT EXISTS idx_sdr_activities_type   ON public.sdr_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_sdr_activities_unsent ON public.sdr_activities(ploomes_synced) WHERE ploomes_synced = false;

-- =====================================================================
-- 11. ORG_INTEGRATIONS (webhooks/integrações públicas) + ORG_INTEGRATIONS_PRIVATE (chaves criptografadas)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.org_integrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    kommo_webhook   TEXT,
    kommo_pipeline_id BIGINT,
    kommo_status_id   BIGINT,
    n8n_outbound_webhook TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id)
);
CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON public.org_integrations(org_id);

DROP TRIGGER IF EXISTS trg_org_integrations_updated ON public.org_integrations;
CREATE TRIGGER trg_org_integrations_updated BEFORE UPDATE ON public.org_integrations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NOVO: credenciais sensíveis (Assertiva, Ploomes, etc) criptografadas via pgcrypto.
-- Cada empresa (Pinn, OM MKT) tem sua row separada com chaves próprias.
CREATE TABLE IF NOT EXISTS public.org_integrations_private (
    org_id            UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Assertiva Localize (OAuth2 client credentials: id + secret cifrado)
    assertiva_client_id        TEXT,
    assertiva_client_secret_enc TEXT,        -- encrypt_secret(plain, key)
    assertiva_finalidade INT DEFAULT 5,
    -- Ploomes CRM
    ploomes_api_key_enc TEXT,
    ploomes_funnel_id BIGINT,
    -- Kommo CRM
    kommo_long_token_enc TEXT,
    -- HubSpot / Pipedrive / RD Station (JUN 1.3: migrar de localStorage pra cá)
    hubspot_token_enc TEXT,
    pipedrive_token_enc TEXT,
    rdstation_token_enc TEXT,
    -- metadata
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_org_integrations_private_updated ON public.org_integrations_private;
CREATE TRIGGER trg_org_integrations_private_updated BEFORE UPDATE ON public.org_integrations_private
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 12. FUNCTIONS DE NEGÓCIO (consume_usage, increment_credits)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.consume_usage(
    p_org_id UUID, p_user_id UUID, p_action TEXT, p_count INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_plan public.plans%ROWTYPE;
    v_used INTEGER;
    v_limit INTEGER;
    v_year SMALLINT := EXTRACT(YEAR FROM NOW())::SMALLINT;
    v_month SMALLINT := EXTRACT(MONTH FROM NOW())::SMALLINT;
BEGIN
    SELECT pl.* INTO v_plan
    FROM public.organizations o
    JOIN public.plans pl ON pl.id = o.plan_id
    WHERE o.id = p_org_id AND o.is_active = true;

    IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'reason', 'org_not_found'); END IF;

    v_limit := CASE p_action
        WHEN 'search' THEN v_plan.searches_per_month
        WHEN 'enrich' THEN v_plan.enrichments_per_month
        WHEN 'export_csv' THEN v_plan.exports_per_month
        WHEN 'export_crm' THEN v_plan.exports_per_month
        ELSE 99999
    END;

    SELECT COALESCE(SUM(count), 0)::INTEGER INTO v_used
    FROM public.usage_logs
    WHERE org_id = p_org_id AND period_year = v_year AND period_month = v_month AND action = p_action;

    IF (v_used + p_count) > v_limit THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'limit_exceeded', 'used', v_used, 'limit', v_limit);
    END IF;

    INSERT INTO public.usage_logs (org_id, user_id, action, count, period_year, period_month)
    VALUES (p_org_id, p_user_id, p_action, p_count, v_year, v_month);

    RETURN jsonb_build_object('allowed', true, 'used', v_used + p_count, 'limit', v_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_credits(p_org_id UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_balance INTEGER;
BEGIN
    UPDATE public.organizations
    SET credits_balance = credits_balance + p_amount, updated_at = NOW()
    WHERE id = p_org_id
    RETURNING credits_balance INTO new_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'Organization % not found', p_org_id; END IF;
    RETURN new_balance;
END;
$$;

-- =====================================================================
-- 13. RLS — POLICIES MULTI-TENANT (FIX MAI-11)
-- Substitui "USING (true)" da v1 por filtro real via my_org_ids()
-- =====================================================================
ALTER TABLE public.plans                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_outbound            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdr_activities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_integrations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_integrations_private  ENABLE ROW LEVEL SECURITY;

-- Plans: leitura pública
DROP POLICY IF EXISTS "plans_select_all" ON public.plans;
CREATE POLICY "plans_select_all" ON public.plans FOR SELECT USING (true);

-- Organizations
DROP POLICY IF EXISTS "orgs_select_member" ON public.organizations;
CREATE POLICY "orgs_select_member" ON public.organizations FOR SELECT
    USING (id = ANY(public.my_org_ids()));
DROP POLICY IF EXISTS "orgs_insert_auth" ON public.organizations;
CREATE POLICY "orgs_insert_auth" ON public.organizations FOR INSERT
    WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "orgs_update_admin" ON public.organizations;
CREATE POLICY "orgs_update_admin" ON public.organizations FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.org_members WHERE org_id = organizations.id AND user_id = auth.uid() AND role IN ('owner','admin')));
DROP POLICY IF EXISTS "orgs_delete_owner" ON public.organizations;
CREATE POLICY "orgs_delete_owner" ON public.organizations FOR DELETE
    USING (owner_id = auth.uid());

-- Org Members
DROP POLICY IF EXISTS "members_select_self" ON public.org_members;
CREATE POLICY "members_select_self" ON public.org_members FOR SELECT
    USING (org_id = ANY(public.my_org_ids()));
DROP POLICY IF EXISTS "members_insert_admin" ON public.org_members;
CREATE POLICY "members_insert_admin" ON public.org_members FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = org_members.org_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));
DROP POLICY IF EXISTS "members_delete_admin" ON public.org_members;
CREATE POLICY "members_delete_admin" ON public.org_members FOR DELETE
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = org_members.org_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

-- Subscriptions / Payments / Usage Logs
DROP POLICY IF EXISTS "subs_select_member" ON public.subscriptions;
CREATE POLICY "subs_select_member" ON public.subscriptions FOR SELECT USING (org_id = ANY(public.my_org_ids()));
DROP POLICY IF EXISTS "payments_select_member" ON public.payments;
CREATE POLICY "payments_select_member" ON public.payments FOR SELECT USING (org_id = ANY(public.my_org_ids()));
DROP POLICY IF EXISTS "usage_select_member" ON public.usage_logs;
CREATE POLICY "usage_select_member" ON public.usage_logs FOR SELECT USING (org_id = ANY(public.my_org_ids()));

-- Pipeline Leads (FIX MAI-11: era USING(true), agora apertado por org_id)
DROP POLICY IF EXISTS "pipeline_leads_select" ON public.pipeline_leads;
DROP POLICY IF EXISTS "pipeline_leads_insert" ON public.pipeline_leads;
DROP POLICY IF EXISTS "pipeline_leads_update" ON public.pipeline_leads;
DROP POLICY IF EXISTS "pipeline_leads_delete" ON public.pipeline_leads;
CREATE POLICY "pipeline_leads_select" ON public.pipeline_leads FOR SELECT USING (org_id = ANY(public.my_org_ids()));
CREATE POLICY "pipeline_leads_insert" ON public.pipeline_leads FOR INSERT WITH CHECK (org_id = ANY(public.my_org_ids()));
CREATE POLICY "pipeline_leads_update" ON public.pipeline_leads FOR UPDATE USING (org_id = ANY(public.my_org_ids()));
CREATE POLICY "pipeline_leads_delete" ON public.pipeline_leads FOR DELETE USING (org_id = ANY(public.my_org_ids()));

-- Leads Outbound (FIX MAI-11: idem)
DROP POLICY IF EXISTS "leads_outbound_select" ON public.leads_outbound;
DROP POLICY IF EXISTS "leads_outbound_insert" ON public.leads_outbound;
DROP POLICY IF EXISTS "leads_outbound_update" ON public.leads_outbound;
DROP POLICY IF EXISTS "leads_outbound_delete" ON public.leads_outbound;
CREATE POLICY "leads_outbound_select" ON public.leads_outbound FOR SELECT USING (org_id IS NULL OR org_id = ANY(public.my_org_ids()));
CREATE POLICY "leads_outbound_insert" ON public.leads_outbound FOR INSERT WITH CHECK (org_id IS NULL OR org_id = ANY(public.my_org_ids()));
CREATE POLICY "leads_outbound_update" ON public.leads_outbound FOR UPDATE USING (org_id IS NULL OR org_id = ANY(public.my_org_ids()));
CREATE POLICY "leads_outbound_delete" ON public.leads_outbound FOR DELETE USING (org_id IS NULL OR org_id = ANY(public.my_org_ids()));

-- SDR Activities (FIX MAI-11)
DROP POLICY IF EXISTS "sdr_activities_select" ON public.sdr_activities;
DROP POLICY IF EXISTS "sdr_activities_insert" ON public.sdr_activities;
DROP POLICY IF EXISTS "sdr_activities_update" ON public.sdr_activities;
CREATE POLICY "sdr_activities_select" ON public.sdr_activities FOR SELECT USING (org_id IS NULL OR org_id = ANY(public.my_org_ids()));
CREATE POLICY "sdr_activities_insert" ON public.sdr_activities FOR INSERT WITH CHECK (org_id IS NULL OR org_id = ANY(public.my_org_ids()));
CREATE POLICY "sdr_activities_update" ON public.sdr_activities FOR UPDATE USING (org_id IS NULL OR org_id = ANY(public.my_org_ids()));

-- Org Integrations (públicas: webhooks)
DROP POLICY IF EXISTS "org_integrations_select" ON public.org_integrations;
DROP POLICY IF EXISTS "org_integrations_upsert" ON public.org_integrations;
DROP POLICY IF EXISTS "org_integrations_update" ON public.org_integrations;
CREATE POLICY "org_integrations_select" ON public.org_integrations FOR SELECT USING (org_id = ANY(public.my_org_ids()));
CREATE POLICY "org_integrations_upsert" ON public.org_integrations FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = org_integrations.org_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','member')));
CREATE POLICY "org_integrations_update" ON public.org_integrations FOR UPDATE USING (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = org_integrations.org_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','member')));

-- Org Integrations Private (chaves Assertiva/Ploomes/CRM — isolamento APERTADO)
-- Cada org SÓ vê e edita as próprias credenciais. service_role bypassa.
DROP POLICY IF EXISTS "oip_select" ON public.org_integrations_private;
DROP POLICY IF EXISTS "oip_upsert" ON public.org_integrations_private;
DROP POLICY IF EXISTS "oip_update" ON public.org_integrations_private;
DROP POLICY IF EXISTS "oip_delete" ON public.org_integrations_private;
CREATE POLICY "oip_select" ON public.org_integrations_private FOR SELECT
    USING (org_id = ANY(public.my_org_ids()));
CREATE POLICY "oip_upsert" ON public.org_integrations_private FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = org_integrations_private.org_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));
CREATE POLICY "oip_update" ON public.org_integrations_private FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = org_integrations_private.org_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));
CREATE POLICY "oip_delete" ON public.org_integrations_private FOR DELETE
    USING (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = org_integrations_private.org_id AND m.user_id = auth.uid() AND m.role = 'owner'));

-- =====================================================================
-- 14. FIX MAI-04: REVOGAR exec_sql DE PUBLIC/anon/authenticated
-- Mantém apenas service_role com EXECUTE (backend confiável).
-- =====================================================================
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- Idem encrypt/decrypt: só service_role decifra; usuário comum não tem acesso
REVOKE ALL ON FUNCTION public.encrypt_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.encrypt_secret(text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.decrypt_secret(text, text) TO service_role;

-- =====================================================================
-- 15. AUDIT TRAIL
-- =====================================================================
DO $$
BEGIN
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'HERMES schema canônico aplicado em %', now();
  RAISE NOTICE '  - 11 tabelas core + RLS apertada (MAI-11)';
  RAISE NOTICE '  - exec_sql/encrypt/decrypt restritas a service_role (MAI-04)';
  RAISE NOTICE '  - pgcrypto pronto pra org_integrations_private';
  RAISE NOTICE '  - 4 planos pré-seed';
  RAISE NOTICE '';
  RAISE NOTICE 'Próximo passo:';
  RAISE NOTICE '  1. Defina app.encryption_key no projeto:';
  RAISE NOTICE '     ALTER DATABASE postgres SET app.encryption_key = ''sua-chave-mestra'';';
  RAISE NOTICE '  2. Rode python scripts/supabase_admin.py check';
  RAISE NOTICE '  3. Rode python scripts/migrate_supabase.py (migração de dados)';
  RAISE NOTICE '==========================================================';
END $$;
