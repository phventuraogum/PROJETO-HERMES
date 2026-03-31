import React from "react";
import { Navigate } from "react-router-dom";
import { useOrg } from "@/tenancy/OrgContext";

export function RequirePowerUser({ children }: { children: React.ReactNode }) {
  const { isMaster, currentOrg, loadingOrgs } = useOrg();
  if (loadingOrgs) return null;

  const role = currentOrg?.role ?? "member";
  const isOwner = role === "owner";

  if (!isMaster && !isOwner) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
