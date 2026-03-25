-- ============================================================
--  Hermes - Migration: org_integrations (Kommo via n8n)
--
--  Objetivo:
--   - Vincular integrações por organização (org_id)
--   - Permitir que cada empresa tenha seu webhook n8n/CRM atrelado ao login
--
--  Executar no: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_integrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Kommo (via n8n webhook; tokens OAuth ficam no n8n)
    kommo_webhook   TEXT,
    kommo_pipeline_id BIGINT,
    kommo_status_id   BIGINT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_org
    ON public.org_integrations(org_id);

CREATE OR REPLACE FUNCTION public.update_org_integrations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_integrations_updated ON public.org_integrations;
CREATE TRIGGER trg_org_integrations_updated
    BEFORE UPDATE ON public.org_integrations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_org_integrations_timestamp();

ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "org_integrations_select_member" ON public.org_integrations FOR SELECT
    USING (org_id = ANY(public.my_org_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "org_integrations_upsert_admin" ON public.org_integrations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.org_members m
            WHERE m.org_id = org_integrations.org_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin', 'member')
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "org_integrations_update_admin" ON public.org_integrations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.org_members m
            WHERE m.org_id = org_integrations.org_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin', 'member')
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

