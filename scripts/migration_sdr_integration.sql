-- ============================================================
--  Hermes - Migration INCREMENTAL: SDR + Ploomes Integration
--  
--  Tabelas existentes: leads_outbound, sdr_dedupe, sdr_messages, sdr_sessions
--  Esta migration ADICIONA colunas na leads_outbound e cria sdr_activities.
--  Seguro para rodar multiplas vezes (usa IF NOT EXISTS / IF EXISTS).
--
--  Executar no: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================


-- ============================================================
-- PARTE 1: Adicionar colunas na leads_outbound existente
-- (colunas para Ploomes, org, enriquecimento, controle de tentativas)
-- ============================================================

-- Organizacao / tenant
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'default';

-- Dados extras do lead
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS porte TEXT;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS uf TEXT;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS score_icp NUMERIC(5,1) DEFAULT 0;

-- IDs do Ploomes (vinculo direto com contato e deal)
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS ploomes_contact_id BIGINT;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS ploomes_deal_id BIGINT;

-- Controle de tentativas do SDR
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 3;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Canal e erros
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Timestamps extras
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.leads_outbound ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;


-- ============================================================
-- PARTE 2: Indices na leads_outbound
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_leads_outbound_status
    ON public.leads_outbound(status);
CREATE INDEX IF NOT EXISTS idx_leads_outbound_pending
    ON public.leads_outbound(status, next_attempt_at)
    WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_leads_outbound_org
    ON public.leads_outbound(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_outbound_ploomes
    ON public.leads_outbound(ploomes_contact_id)
    WHERE ploomes_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_outbound_cnpj
    ON public.leads_outbound(cnpj)
    WHERE cnpj IS NOT NULL;


-- ============================================================
-- PARTE 3: Trigger de updated_at na leads_outbound
-- ============================================================

CREATE OR REPLACE FUNCTION update_leads_outbound_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_outbound_updated ON public.leads_outbound;
CREATE TRIGGER trg_leads_outbound_updated
    BEFORE UPDATE ON public.leads_outbound
    FOR EACH ROW
    EXECUTE FUNCTION update_leads_outbound_timestamp();


-- ============================================================
-- PARTE 4: RLS na leads_outbound (se ainda nao tiver)
-- ============================================================

ALTER TABLE public.leads_outbound ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "leads_outbound_select" ON public.leads_outbound FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "leads_outbound_insert" ON public.leads_outbound FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "leads_outbound_update" ON public.leads_outbound FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "leads_outbound_delete" ON public.leads_outbound FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- PARTE 5: Tabela sdr_activities (historico de acoes do SDR)
-- NAO toca em sdr_messages, sdr_sessions, sdr_dedupe
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sdr_activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id         UUID REFERENCES public.leads_outbound(id) ON DELETE CASCADE,
    org_id          TEXT NOT NULL DEFAULT 'default',

    activity_type   TEXT NOT NULL,
    channel         TEXT,
    subject         TEXT,
    content         TEXT,
    result          TEXT,

    ploomes_synced  BOOLEAN DEFAULT false,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sdr_activities_lead
    ON public.sdr_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_sdr_activities_org
    ON public.sdr_activities(org_id);
CREATE INDEX IF NOT EXISTS idx_sdr_activities_type
    ON public.sdr_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_sdr_activities_unsent
    ON public.sdr_activities(ploomes_synced)
    WHERE ploomes_synced = false;

ALTER TABLE public.sdr_activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "sdr_activities_select" ON public.sdr_activities FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "sdr_activities_insert" ON public.sdr_activities FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "sdr_activities_update" ON public.sdr_activities FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- PARTE 6: Colunas extras na organizations (chave Ploomes)
-- ============================================================

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS ploomes_api_key TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS ploomes_funnel_id BIGINT;


-- ============================================================
-- PARTE 7: Colunas extras na pipeline_leads (se nao existirem)
-- Garante que o pipeline tem os campos de sync com Ploomes
-- ============================================================

ALTER TABLE public.pipeline_leads ADD COLUMN IF NOT EXISTS ploomes_contact_id BIGINT;
ALTER TABLE public.pipeline_leads ADD COLUMN IF NOT EXISTS ploomes_deal_id BIGINT;
ALTER TABLE public.pipeline_leads ADD COLUMN IF NOT EXISTS ploomes_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE public.pipeline_leads ADD COLUMN IF NOT EXISTS sdr_status TEXT;
ALTER TABLE public.pipeline_leads ADD COLUMN IF NOT EXISTS sdr_enviado_em TIMESTAMPTZ;


-- ============================================================
-- FIM - Pronto para usar com o router /sdr e integracao n8n
-- ============================================================
