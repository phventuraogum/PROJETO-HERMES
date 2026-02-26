-- ============================================================
--  Hermes Insight Engine - SQL COMPLETO para Supabase
--  Projeto: yvbgscukwnslkeyfjpqg
--  Executar no: Supabase Dashboard -> SQL Editor -> New Query
--  Cole TUDO e clique em RUN
-- ============================================================

-- ============================================================
-- PARTE 0: Helper exec_sql (permite rodar SQL via API depois)
-- ============================================================
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

-- ============================================================
-- PARTE 1: Extensoes
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PARTE 2: Tabela pipeline_leads (frontend)
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL DEFAULT 'default',
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
  adicionado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, cnpj)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_org
  ON pipeline_leads(org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_estagio
  ON pipeline_leads(org_id, estagio);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_sdr
  ON pipeline_leads(sdr_status) WHERE sdr_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_ploomes_sync
  ON pipeline_leads(ploomes_synced) WHERE ploomes_synced = FALSE;

CREATE OR REPLACE FUNCTION update_pipeline_leads_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipeline_leads_updated ON pipeline_leads;
CREATE TRIGGER trg_pipeline_leads_updated
  BEFORE UPDATE ON pipeline_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_pipeline_leads_timestamp();

ALTER TABLE pipeline_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_leads_select"
  ON pipeline_leads FOR SELECT USING (true);
CREATE POLICY "pipeline_leads_insert"
  ON pipeline_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "pipeline_leads_update"
  ON pipeline_leads FOR UPDATE USING (true);
CREATE POLICY "pipeline_leads_delete"
  ON pipeline_leads FOR DELETE USING (true);

-- ============================================================
-- PARTE 3: Tabela plans (planos de assinatura)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plans (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    price_brl   NUMERIC(10,2) NOT NULL DEFAULT 0,
    searches_per_month   INTEGER NOT NULL DEFAULT 100,
    enrichments_per_month INTEGER NOT NULL DEFAULT 50,
    exports_per_month    INTEGER NOT NULL DEFAULT 10,
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

-- ============================================================
-- PARTE 4: Tabela organizations (multi-tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id      UUID REFERENCES public.plans(id),
    credits_balance INTEGER NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    trial_ends_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: setar plan_id = free automaticamente ao criar org sem plano
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
CREATE TRIGGER trg_org_default_plan
    BEFORE INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_default_plan();

-- ============================================================
-- PARTE 5: Tabela org_members (membros da org)
-- ============================================================
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

-- ============================================================
-- PARTE 6: Tabela subscriptions (assinaturas Asaas)
-- ============================================================
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

-- ============================================================
-- PARTE 7: Tabela payments (pagamentos Asaas)
-- ============================================================
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

-- ============================================================
-- PARTE 8: Tabela usage_logs (controle de uso mensal)
-- ============================================================
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

-- ============================================================
-- PARTE 9: View monthly_usage_summary
-- ============================================================
CREATE OR REPLACE VIEW public.monthly_usage_summary AS
SELECT
    org_id,
    period_year,
    period_month,
    action,
    SUM(count)::INTEGER AS total
FROM public.usage_logs
GROUP BY org_id, period_year, period_month, action;

-- ============================================================
-- PARTE 10: Funcao consume_usage (controle de limites)
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_usage(
    p_org_id    UUID,
    p_user_id   UUID,
    p_action    TEXT,
    p_count     INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_plan       public.plans%ROWTYPE;
    v_used       INTEGER;
    v_limit      INTEGER;
    v_year       SMALLINT := EXTRACT(YEAR  FROM NOW())::SMALLINT;
    v_month      SMALLINT := EXTRACT(MONTH FROM NOW())::SMALLINT;
BEGIN
    SELECT pl.* INTO v_plan
    FROM public.organizations o
    JOIN public.plans pl ON pl.id = o.plan_id
    WHERE o.id = p_org_id AND o.is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'org_not_found');
    END IF;

    v_limit := CASE p_action
        WHEN 'search'     THEN v_plan.searches_per_month
        WHEN 'enrich'     THEN v_plan.enrichments_per_month
        WHEN 'export_csv' THEN v_plan.exports_per_month
        WHEN 'export_crm' THEN v_plan.exports_per_month
        ELSE 99999
    END;

    SELECT COALESCE(SUM(count), 0)::INTEGER INTO v_used
    FROM public.usage_logs
    WHERE org_id = p_org_id
      AND period_year = v_year
      AND period_month = v_month
      AND action = p_action;

    IF (v_used + p_count) > v_limit THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason',  'limit_exceeded',
            'used',    v_used,
            'limit',   v_limit
        );
    END IF;

    INSERT INTO public.usage_logs (org_id, user_id, action, count, period_year, period_month)
    VALUES (p_org_id, p_user_id, p_action, p_count, v_year, v_month);

    RETURN jsonb_build_object(
        'allowed', true,
        'used',    v_used + p_count,
        'limit',   v_limit
    );
END;
$$;

-- ============================================================
-- PARTE 11: Triggers de updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_orgs_updated_at ON public.organizations;
CREATE TRIGGER trg_orgs_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PARTE 12: Tabelas auxiliares
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leads_outbound (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name     TEXT,
    phone    TEXT,
    email    TEXT,
    company  TEXT,
    segment  TEXT,
    source   TEXT DEFAULT 'hermes',
    status   TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.memberships (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id   UUID NOT NULL,
    user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role     TEXT NOT NULL DEFAULT 'member',
    UNIQUE(org_id, user_id)
);

-- ============================================================
-- PARTE 13: RLS - Row Level Security
-- ============================================================
ALTER TABLE public.organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans          ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_org_ids()
RETURNS UUID[]
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT ARRAY_AGG(org_id)
    FROM public.org_members
    WHERE user_id = auth.uid();
$$;

-- Plans: leitura publica
DROP POLICY IF EXISTS "plans_select_all" ON public.plans;
CREATE POLICY "plans_select_all"
    ON public.plans FOR SELECT USING (true);

-- Organizations
DROP POLICY IF EXISTS "orgs_select_member" ON public.organizations;
CREATE POLICY "orgs_select_member"
    ON public.organizations FOR SELECT
    USING (id = ANY(public.my_org_ids()));

DROP POLICY IF EXISTS "orgs_update_admin" ON public.organizations;
CREATE POLICY "orgs_update_admin"
    ON public.organizations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.org_members
            WHERE org_id = organizations.id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "orgs_insert_auth" ON public.organizations;
CREATE POLICY "orgs_insert_auth"
    ON public.organizations FOR INSERT
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "orgs_delete_owner" ON public.organizations;
CREATE POLICY "orgs_delete_owner"
    ON public.organizations FOR DELETE
    USING (owner_id = auth.uid());

-- Org Members
DROP POLICY IF EXISTS "members_select_self" ON public.org_members;
CREATE POLICY "members_select_self"
    ON public.org_members FOR SELECT
    USING (org_id = ANY(public.my_org_ids()));

DROP POLICY IF EXISTS "members_insert_admin" ON public.org_members;
CREATE POLICY "members_insert_admin"
    ON public.org_members FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.org_members m
            WHERE m.org_id = org_members.org_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "members_delete_admin" ON public.org_members;
CREATE POLICY "members_delete_admin"
    ON public.org_members FOR DELETE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.org_members m
            WHERE m.org_id = org_members.org_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

-- Subscriptions
DROP POLICY IF EXISTS "subs_select_member" ON public.subscriptions;
CREATE POLICY "subs_select_member"
    ON public.subscriptions FOR SELECT
    USING (org_id = ANY(public.my_org_ids()));

-- Payments
DROP POLICY IF EXISTS "payments_select_member" ON public.payments;
CREATE POLICY "payments_select_member"
    ON public.payments FOR SELECT
    USING (org_id = ANY(public.my_org_ids()));

-- Usage Logs
DROP POLICY IF EXISTS "usage_select_member" ON public.usage_logs;
CREATE POLICY "usage_select_member"
    ON public.usage_logs FOR SELECT
    USING (org_id = ANY(public.my_org_ids()));

-- ============================================================
-- FUNCAO: increment_credits (atomica, usada pelo webhook)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_credits(p_org_id UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    UPDATE public.organizations
    SET credits_balance = credits_balance + p_amount,
        updated_at = NOW()
    WHERE id = p_org_id
    RETURNING credits_balance INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organization % not found', p_org_id;
    END IF;

    RETURN new_balance;
END;
$$;

-- ============================================================
-- FIM - Todas as tabelas, funcoes, triggers e policies criadas
-- ============================================================
