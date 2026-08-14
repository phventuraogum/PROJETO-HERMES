/**
 * Feature flags do front-end Hermes.
 *
 * Cada flag pode ser sobrescrita via variável de ambiente Vite
 * (`VITE_FEATURE_*`). Defaults conservadores ficam aqui.
 *
 * Por enquanto a Assertiva fica oculta da UI: o backend continua expondo
 * os endpoints `/assertiva/*` (eles são usados sob demanda em scripts/CSV
 * fora do app), mas a interface principal não dispara consultas
 * automaticamente — evita gastar créditos sem intenção explícita.
 */

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (raw === undefined || raw === null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

export const FEATURE_FLAGS = {
  /** Mostra ou não os elementos de Assertiva na UI (botão decisores, modal). */
  assertivaUi: readBooleanEnv("VITE_FEATURE_ASSERTIVA_UI", false),
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function featureEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag];
}
