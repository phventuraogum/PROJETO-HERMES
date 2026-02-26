import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthCtx = {
  accessToken: string | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
const DEV_TOKEN_KEY = "hermes_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // --- Supabase (produção) ---
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (!mounted) return;
        setAccessToken(data.session?.access_token ?? null);
        setLoading(false);
      });

      const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setAccessToken(newSession?.access_token ?? null);
      });

      return () => {
        mounted = false;
        data.subscription.unsubscribe();
      };
    }

    // --- DEV (sem Supabase) ---
    const token = localStorage.getItem(DEV_TOKEN_KEY);
    setAccessToken(token);
    setLoading(false);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== DEV_TOKEN_KEY) return;
      setAccessToken(e.newValue);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    accessToken,
    loading,
    signInWithPassword: async (email, password) => {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return;
      }

      // DEV: não valida credencial (o backend também usa fallback dev)
      localStorage.setItem(DEV_TOKEN_KEY, "dev-session-token");
      setAccessToken("dev-session-token");
    },
    signOut: async () => {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }

      localStorage.removeItem(DEV_TOKEN_KEY);
      setAccessToken(null);
    },
  }), [accessToken, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider />");
  return ctx;
}
