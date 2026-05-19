-- ============================================================================
-- MAI-04 · Revoke EXECUTE on exec_sql for anon/authenticated (P0 security)
-- ============================================================================
-- Contexto:
--   scripts/all_migrations.sql PARTE 0 cria public.exec_sql(text) com
--   SECURITY DEFINER. Sem REVOKE explícito, Postgres concede EXECUTE para
--   PUBLIC por default, o que no Supabase significa que QUALQUER request
--   anon ou authenticated pode chamar rpc('exec_sql', { query: 'DROP TABLE ...' })
--   e rodar SQL arbitrário como o owner da função.
--
-- Fix:
--   Revogar EXECUTE de PUBLIC, anon e authenticated. Manter apenas
--   service_role (backend confiável) com EXECUTE.
--
-- Reversibilidade:
--   100% reversível — basta GRANT EXECUTE ... TO authenticated se algum
--   endpoint legítimo precisar (não deveria).
--
-- Verificação pós-aplicação:
--   SELECT proname, proacl
--   FROM   pg_proc
--   WHERE  proname = 'exec_sql' AND pronamespace = 'public'::regnamespace;
--   -> proacl deve listar apenas postgres= e service_role=X/postgres
-- ============================================================================

REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;

-- service_role mantém EXECUTE para o backend continuar rodando migrations
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- Audit trail (vai pro log do Supabase)
DO $$
BEGIN
  RAISE NOTICE 'MAI-04: exec_sql access revoked from anon/authenticated/PUBLIC. Only service_role retains EXECUTE.';
END $$;
