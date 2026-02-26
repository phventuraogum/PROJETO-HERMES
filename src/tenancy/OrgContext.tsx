import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { apiFetch } from "@/lib/api";

type Org = { id: string; name: string; slug: string; role: string };

type OrgCtx = {
  orgs: Org[];
  orgId: string | null;
  setOrgId: (id: string) => void;
  loadingOrgs: boolean;
};

const Ctx = createContext<OrgCtx | null>(null);
const LS_KEY = "hermes.org_id";

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgIdState] = useState<string | null>(localStorage.getItem(LS_KEY));
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  const setOrgId = (id: string) => {
    localStorage.setItem(LS_KEY, id);
    setOrgIdState(id);
  };

  const defaultOrg: Org = { id: "default", name: "Minha Organização", slug: "default", role: "admin" };

  useEffect(() => {
    if (!accessToken) {
      setOrgs([defaultOrg]);
      const current = localStorage.getItem(LS_KEY);
      if (!current || !current.trim()) {
        localStorage.setItem(LS_KEY, "default");
        setOrgIdState("default");
      } else setOrgIdState(current);
      return;
    }

    (async () => {
      setLoadingOrgs(true);
      try {
        const data = await apiFetch<Org[]>("/admin/orgs", { skipOrgHeader: true });
        const list = Array.isArray(data) && data.length > 0 ? data : [defaultOrg];
        setOrgs(list);

        const saved = localStorage.getItem(LS_KEY);
        const pick = (saved && list.find(o => o.id === saved)?.id) || list[0]?.id || "default";
        setOrgId(pick);
      } catch {
        setOrgs([defaultOrg]);
        const fallback = localStorage.getItem(LS_KEY) || "default";
        localStorage.setItem(LS_KEY, fallback);
        setOrgIdState(fallback);
      } finally {
        setLoadingOrgs(false);
      }
    })();
  }, [accessToken]);

  const value = useMemo(() => ({ orgs, orgId, setOrgId, loadingOrgs }), [orgs, orgId, loadingOrgs]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrg precisa estar dentro de <OrgProvider />");
  return ctx;
}
