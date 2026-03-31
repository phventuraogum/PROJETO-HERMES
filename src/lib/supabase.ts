import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const SUPABASE_STORAGE_KEY = "hermes_supabase_session";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Quando o Supabase não está configurado, o app roda em modo DEV (login local).
 * Nesses casos, `supabase` fica `null` e o AuthContext cai para o token do localStorage.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: SUPABASE_STORAGE_KEY,
      },
    })
  : null;

export default supabase;
