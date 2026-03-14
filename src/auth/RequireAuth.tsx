import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken, loading } = useAuth();
  const loc = useLocation();

  if (loading) return null; // aqui você pode colocar um loader
  if (!accessToken) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  return <>{children}</>;
}
