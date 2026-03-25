import React from "react";
import { Navigate } from "react-router-dom";
import { useOrg } from "@/tenancy/OrgContext";

const ROLE_ORDER: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function RequireRole({ minRole, children }: { minRole: string; children: React.ReactNode }) {
  const { currentOrg, loadingOrgs } = useOrg();
  if (loadingOrgs) return null;

  const role = currentOrg?.role ?? "viewer";
  const cur = ROLE_ORDER[role] ?? 0;
  const need = ROLE_ORDER[minRole] ?? 0;
  if (cur < need) return <Navigate to="/app" replace />;

  return <>{children}</>;
}

