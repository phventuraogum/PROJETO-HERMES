-- ============================================================================
-- HERMES — PATCH: funções de criptografia aceitam chave como parâmetro
-- Razão: Supabase bloqueia ALTER DATABASE/ROLE pra GUCs custom (sem superuser),
--        então não dá pra usar current_setting('app.encryption_key').
-- Solução: backend passa a chave em cada chamada de encrypt_secret/decrypt_secret.
--
-- Rodar no SQL Editor do projeto gibmowjjcvbnaynfqyfw — DEPOIS de aplicar
-- hermes_canonical_schema.sql (que cria a versão antiga sem param).
-- ============================================================================

-- PASSO 1 · Apagar versões antigas (sem parâmetro key)
DROP FUNCTION IF EXISTS public.encrypt_secret(text);
DROP FUNCTION IF EXISTS public.decrypt_secret(text);

-- PASSO 2 · Recriar com chave como parâmetro
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

-- PASSO 3 · Permissions: só service_role chama
REVOKE ALL ON FUNCTION public.encrypt_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.encrypt_secret(text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.decrypt_secret(text, text) TO service_role;

-- PASSO 4 · Smoke test end-to-end
-- Esperado: decrypted_back = 'senha-teste-123'
SELECT
    public.encrypt_secret('senha-teste-123', '7NjvU4W0g4epvuk3xKUpoFlF937c6BNBkWE4b_SqbOo')                                                                AS encrypted,
    public.decrypt_secret(
        public.encrypt_secret('senha-teste-123', '7NjvU4W0g4epvuk3xKUpoFlF937c6BNBkWE4b_SqbOo'),
        '7NjvU4W0g4epvuk3xKUpoFlF937c6BNBkWE4b_SqbOo'
    ) AS decrypted_back;
