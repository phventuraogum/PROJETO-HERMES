import React from "react";
import { Navigate } from "react-router-dom";
import { useOrg } from "@/tenancy/OrgContext";

export function RequireOrg({ children }: { children: React.ReactNode }) {
  const { orgId, loadingOrgs } = useOrg();
  if (loadingOrgs) return null;
  if (!orgId) return <Navigate to="/select-org" replace />;
  return <>{children}</>;
}
