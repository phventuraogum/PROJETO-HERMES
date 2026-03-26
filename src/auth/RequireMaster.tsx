import React from "react";
import { Navigate } from "react-router-dom";
import { useOrg } from "@/tenancy/OrgContext";

export function RequireMaster({ children }: { children: React.ReactNode }) {
  const { isMaster, loadingOrgs } = useOrg();
  if (loadingOrgs) return null;
  if (!isMaster) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
