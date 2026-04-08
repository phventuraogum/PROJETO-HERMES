/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UUID em public.organizations — alinha X-Org-Id com HERMES_PROSPECCAO_PGFN_ORG_IDS no backend */
  readonly VITE_DEFAULT_ORG_ID?: string;
}
