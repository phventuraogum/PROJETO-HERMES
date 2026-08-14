import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { loadLatestResult, saveLatestResult } from "@/lib/latestResultStorage";

// URL base do Hermes (FastAPI)
// Em produção (mesmo domínio), usar origem atual + /api para evitar CSP/CORS e não depender de env no build.
const API_BASE_RAW =
  (import.meta.env.VITE_HERMES_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (typeof window !== "undefined" ? `${window.location.origin}/api` : "http://127.0.0.1:8000");

const API_BASE = API_BASE_RAW.replace(/\/+$/, "");

// ------------------------
// TIPOS USADOS NO FRONT
// ------------------------

export type ProspeccaoConfig = {
  termo_base: string;
  cidade: string;
  uf: string;
  cidades?: string[];
  ufs?: string[];
  capital_minimo: number;
  capital_maximo?: number | null;
  limite_empresas: number;
  portes: string[];
  segmentos: string[];
  cnaes?: string[];
  cnae_principal_estrito?: boolean;
  incluir_cnae_secundario?: boolean;
  enriquecimento_web: boolean;
  exigir_contato_acionavel?: boolean;
  priorizar_com_contato?: boolean;
  excluir_cnpjs?: string[];
  idade_minima_anos?: number | null;
  idade_maxima_anos?: number | null;
  subsegmento_alvo?: string;
};

export type FiltrosICP = {
  capital_social_minimo?: number | null;
  capital_social_maxima?: number | null;

  portes: string[];
  segmentos: string[];

  cidade?: string | null;
  uf?: string | null;

  cidades?: string[] | null;
  ufs?: string[] | null;

  volume_por_regiao?: Record<string, number> | null;
  alinhamento_ideal_compra?: string | null;

  exigir_contato_acionavel?: boolean;
};

export type EnriquecimentoResumo = {
  total_com_enriquecimento: number;
  total_sem_enriquecimento: number;
  porcentagem_enriquecida: number;
};

export type SocioEstruturado = {
  nome: string;
  qualificacao?: string | null;
  data_entrada?: string | null;
  cpf_cnpj?: string | null;
  email?: string | null;
  emails_alternativos?: string[] | null;
  linkedin?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  cargo_atual?: string | null;
  empresa_atual?: string | null;
  localizacao?: string | null;
  fonte_contato?: string | null;
};

export type CnaeSecundario = {
  cnae: string;
  descricao?: string | null;
};

export type ContatoCaptado = {
  valor: string;
  tipo?: string | null;
  origem?: string | null;
  confianca?: number | null;
  validado?: boolean | null;
  score_validacao?: number | null;
  metodo_validacao?: string | null;
  motivo_validacao?: string | null;
  mx_valido?: boolean | null;
  smtp_status?: string | null;
};

export type Empresa = {
  /** Payload bruto do backend, para inspecao na UI (RawDataView). */
  __raw?: Record<string, unknown>;
  // ── identificação ──────────────────────────────────────────────
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  natureza_juridica?: string | null;
  data_abertura?: string | null;
  situacao_cadastral?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cnae_principal?: string | null;
  cnae_descricao?: string | null;
  cnaes_secundarios?: CnaeSecundario[] | null;
  capital_social?: number | null;

  // ── ICP ────────────────────────────────────────────────────────
  porte?: string | null;
  segmento?: string | null;
  subsegmento?: string | null;
  score_icp?: number | null;

  // ── contatos base ──────────────────────────────────────────────
  telefone_padrao?: string | null;
  telefone_receita?: string | null;
  telefone_estab1?: string | null;
  telefone_estab2?: string | null;
  email?: string | null;
  email_final?: string | null;

  // ── enriquecimento web ─────────────────────────────────────────
  site?: string | null;
  /** rdap | rdap_email_receita | cnpj_na_pagina | email_receita | informado | informado_rdap_divergente | rdap_divergente | heuristica */
  site_confianca?: string | null;
  email_enriquecido?: string | null;
  email_validado?: boolean | null;
  email_status_validacao?: string | null;
  email_score_validacao?: number | null;
  telefone_enriquecido?: string | null;
  telefone_final?: string | null;
  whatsapp_publico?: string | null;
  whatsapp_enriquecido?: string | null;
  whatsapp_final?: string | null;
  linkedin_empresa?: string | null;
  instagram_empresa?: string | null;
  facebook_empresa?: string | null;
  outras_informacoes?: string | null;
  resumo_ia_empresa?: string | null;
  registro_dono?: string | null;
  registro_email?: string | null;
  fonte_dados_prioritaria?: string | null;
  emails_captados?: ContatoCaptado[] | null;
  telefones_captados?: ContatoCaptado[] | null;
  whatsapps_captados?: ContatoCaptado[] | null;

  // ── sócios ─────────────────────────────────────────────────────
  socios_resumo?: string | null;
  socios_estruturado?: SocioEstruturado[] | null;
  redes_sociais_empresa?: string[] | null;
  redes_sociais_socios?: { nome: string; links: string[] }[] | null;

  // ── contexto econômico (SIDRA/IBGE) ───────────────────────────
  contexto_sidra?: string | null;
  sidra_pib?: number | null;
  sidra_populacao?: number | null;
  sidra_pib_per_capita?: number | null;

  // ── endereço completo ──────────────────────────────────────────
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  enriquecimento_data?: string | null;
  validacao?: Record<string, unknown> | null;
  confiabilidade?: Record<string, unknown> | null;
  qualidade?: Record<string, unknown> | null;
  priorizacao?: Record<string, unknown> | null;
};

export type ProspeccaoResultado = {
  total_empresas: number;
  empresas: Empresa[];
  filtros_icp: FiltrosICP;
  enriquecimento_web: EnriquecimentoResumo;
};

export type ResultadoSalvo = {
  timestamp: string;
  config: ProspeccaoConfig;
  resultado: ProspeccaoResultado;
};

export type ExecucaoResumo = {
  id: number;
  timestamp: string;
  termo: string;
  cidade: string;
  uf: string;
  total_empresas: number;
  filtros_icp: FiltrosICP;
  enriquecimento_web: EnriquecimentoResumo;
};

export type UltimaExecucaoPayload = {
  execucao: ExecucaoResumo | null;
  resultados: Empresa[];
};

// ---------- tipos do dashboard ----------
export type DashboardUF = { uf: string; total: number };
export type DashboardSegmento = { segmento: string; total: number };
export type DashboardPorte = { porte: string; total: number };

export type DashboardTopEmpresa = {
  razao_social: string;
  nome_fantasia?: string | null;
  cidade?: string | null;
  uf?: string | null;
  segmento: string;
  score_icp: number;
  telefone_padrao?: string | null;
  email?: string | null;
  whatsapp_publico?: string | null;
  whatsapp_enriquecido?: string | null;
  site?: string | null;
  cnpj: string;
};

export type ScoreFaixa  = { label: string; min: number; max: number; count: number; color: string };
export type CapitalFaixa = { label: string; count: number };
export type CanalContato = { canal: string; total: number; pct: number };

export type DashboardData = {
  total_empresas: number;
  empresas_enriquecidas: number;
  taxa_email: number;
  taxa_whatsapp: number;
  com_linkedin: number;
  com_site: number;
  capital_medio: number;
  capital_total: number;
  score_medio: number;
  pib_medio: number;
  empresas_por_uf: DashboardUF[];
  empresas_por_segmento: DashboardSegmento[];
  empresas_por_porte: DashboardPorte[];
  score_distribuicao: ScoreFaixa[];
  capital_faixas: CapitalFaixa[];
  canais_contato: CanalContato[];
  top_empresas: DashboardTopEmpresa[];
  execucao_ts?: string;
  execucao_cidade?: string;
  execucao_uf?: string;
};

// ======================================================
// MAPA DE CALOR – TIPOS
// ======================================================

export type MapaCalorConfig = {
  uf?: string | null;
  cidade?: string | null;
  termo_base?: string | null;
  capital_minimo?: number | null;
};

export type MapaCalorPonto = {
  uf: string;
  municipio: string;
  latitude: number;
  longitude: number;
  total_empresas: number;
  capital_social_total: number;
};

export type MapaCalorResponse = {
  pontos: MapaCalorPonto[];
};

// ------------------------
// MULTI-TENANT (isolamento por organização)
// ------------------------

const ORG_ID_KEY = "hermes.org_id";

/** Identificador do tenant atual (org ou "default"). Usado em todas as chaves de storage. */
export function getTenantKey(): string {
  if (typeof window === "undefined") return "default";
  const id = localStorage.getItem(ORG_ID_KEY);
  return (id && id.trim()) || "default";
}

/** Chave de storage por tipo e tenant (para uso em pipeline, histórico, último resultado). */
export function getStorageKey(kind: "resultado" | "pipeline" | "buscas"): string {
  const tenant = getTenantKey();
  const base = { resultado: "hermes:last_resultado", pipeline: "hermes:pipeline", buscas: "hermes:buscas" }[kind];
  return tenant === "default" ? base : `${base}:${tenant}`;
}

// ------------------------
// STORAGE LOCAL (por tenant)
// ------------------------

async function salvarResultadoLocal(payload: ResultadoSalvo): Promise<void> {
  await saveLatestResult(getStorageKey("resultado"), payload);
}

async function lerResultadoLocal(): Promise<ResultadoSalvo | null> {
  return await loadLatestResult<ProspeccaoConfig, ProspeccaoResultado>(getStorageKey("resultado"));
}

// ------------------------
// FETCH (COM LOGIN SUPABASE)
// ------------------------

type HermesFetchOptions = RequestInit;

async function getAuthToken(): Promise<string | null> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (token) {
        try {
          localStorage.removeItem("hermes_token");
        } catch {
          // ignore
        }
        return token;
      }
    } catch {
      // ignore and continue to dev fallback
    }
  }

  // fluxo atual do app (login dev): token no localStorage
  try {
    const t = localStorage.getItem("hermes_token");
    if (t && t !== "null" && t !== "undefined") return t;
  } catch {
    // ignore
  }

  // fallback: se Supabase estiver configurado e houver sessão válida
  return null;
}

async function readApiError(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await res.json();
      if (typeof j?.detail === "string") return j.detail;
      if (j?.detail) return JSON.stringify(j.detail);
      return JSON.stringify(j);
    }
  } catch {
    // fall through to plain-text parsing
  }
  try {
    const t = await res.text();
    return t || `Erro HTTP ${res.status} - ${res.statusText}`;
  } catch {
    return `Erro HTTP ${res.status} - ${res.statusText}`;
  }
}

type ApiFetchOptions = HermesFetchOptions & { skipOrgHeader?: boolean };

async function hermesFetch<T>(path: string, opts: HermesFetchOptions = {}): Promise<T> {
  const token = await getAuthToken();

  const headers = new Headers(opts.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof window !== "undefined") headers.set("X-Org-Id", getTenantKey());

  const hasBody = !!opts.body;
  const isFormData =
    typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (!res.ok) throw new Error(await readApiError(res));
  if (res.status === 204) return null as unknown as T;

  return (await res.json()) as T;
}

/** Fetch com header X-Org-Id para multi-tenant (usado por OrgContext e chamadas que precisam de org). */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { skipOrgHeader, ...rest } = opts;
  const headers = new Headers(rest.headers || {});
  if (!skipOrgHeader && typeof window !== "undefined") {
    headers.set("X-Org-Id", getTenantKey());
  }
  return hermesFetch<T>(path, { ...rest, headers });
}

function normalizeCnpjValue(cnpj: string): string {
  return String(cnpj || "").replace(/\D/g, "").slice(0, 14);
}

function appendFreshQuery(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}_ts=${Date.now()}`;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function scoreFromRecord(
  record: Record<string, unknown> | null | undefined,
  key = "score_total",
): number | null {
  return asNullableNumber(record?.[key]);
}

function mapEmpresaApi(raw: Record<string, unknown>): Empresa {
  const emailReceita = asNullableString(raw.email_receita);
  const emailEnriquecido = asNullableString(raw.email_enriquecido);
  const emailFinal = asNullableString(raw.email_final) ?? emailEnriquecido ?? emailReceita;
  const telefoneReceita = asNullableString(raw.telefone_receita);
  const telefoneEnriquecido = asNullableString(raw.telefone_enriquecido);
  const telefoneFinal = asNullableString(raw.telefone_final) ?? telefoneEnriquecido ?? telefoneReceita;
  const whatsappPublico = asNullableString(raw.whatsapp_publico);
  const whatsappEnriquecido = asNullableString(raw.whatsapp_enriquecido);
  const whatsappFinal = asNullableString(raw.whatsapp_final) ?? whatsappEnriquecido ?? whatsappPublico;
  const confiabilidade = asRecord(raw.confiabilidade);
  const qualidade = asRecord(raw.qualidade);
  const priorizacao = asRecord(raw.priorizacao);

  return {
    __raw: raw,
    cnpj: asNullableString(raw.cnpj) ?? "",
    razao_social: asNullableString(raw.razao_social) ?? "",
    nome_fantasia: asNullableString(raw.nome_fantasia),
    situacao_cadastral: asNullableString(raw.situacao_cadastral),
    cidade: asNullableString(raw.cidade),
    uf: asNullableString(raw.uf),
    cnae_principal: asNullableString(raw.cnae_principal),
    capital_social: asNullableNumber(raw.capital_social),
    telefone_padrao: telefoneFinal,
    telefone_receita: telefoneReceita,
    email: emailReceita,
    email_final: emailFinal,
    site: asNullableString(raw.site),
    site_confianca: asNullableString(raw.site_confianca),
    email_enriquecido: emailEnriquecido,
    telefone_enriquecido: telefoneEnriquecido,
    telefone_final: telefoneFinal,
    whatsapp_publico: whatsappPublico,
    whatsapp_enriquecido: whatsappEnriquecido,
    whatsapp_final: whatsappFinal,
    resumo_ia_empresa: asNullableString(asRecord(raw.enriquecimento_ia)?.resumo_empresa),
    score_icp:
      scoreFromRecord(priorizacao) ??
      scoreFromRecord(qualidade) ??
      scoreFromRecord(confiabilidade),
    enriquecimento_data: asNullableString(raw.enriquecimento_data),
    validacao: asRecord(raw.validacao),
    confiabilidade,
    qualidade,
    priorizacao,
    fonte_dados_prioritaria:
      asNullableString(raw.fonte_dados_prioritaria) ?? asNullableString(raw.cadastro_fonte),
  };
}

function mergeEmpresaWithEnrichment(
  empresa: Empresa,
  enrichment: Record<string, unknown>,
): Empresa {
  const contatos = asRecord(enrichment.contatos_web) ?? {};
  const dadosReceita = asRecord(enrichment.dados_receita) ?? {};
  const whatsappUltra = asRecord(enrichment.whatsapp_ultra) ?? {};
  const enriquecimentoIa = asRecord(enrichment.enriquecimento_ia) ?? {};

  const emailReceita = asNullableString(dadosReceita.email_receita) ?? empresa.email;
  const emailEnriquecido =
    asNullableString(contatos.email_enriquecido) ?? empresa.email_enriquecido;
  const telefoneEnriquecido =
    asNullableString(contatos.telefone_enriquecido) ?? empresa.telefone_enriquecido;
  const whatsappEnriquecido =
    asNullableString(contatos.whatsapp_enriquecido) ??
    asNullableString(whatsappUltra.numero) ??
    empresa.whatsapp_enriquecido;

  return {
    ...empresa,
    site: asNullableString(enrichment.site) ?? empresa.site,
    email: emailReceita,
    email_final: emailEnriquecido ?? emailReceita ?? empresa.email_final,
    email_enriquecido: emailEnriquecido,
    telefone_padrao: telefoneEnriquecido ?? empresa.telefone_padrao,
    telefone_final: telefoneEnriquecido ?? empresa.telefone_final,
    telefone_enriquecido: telefoneEnriquecido,
    whatsapp_final:
      whatsappEnriquecido ?? empresa.whatsapp_publico ?? empresa.whatsapp_final,
    whatsapp_enriquecido: whatsappEnriquecido,
    resumo_ia_empresa:
      asNullableString(enriquecimentoIa.resumo_empresa) ?? empresa.resumo_ia_empresa,
  };
}

function mapContactIntelligence(raw: Record<string, unknown> | null | undefined): ContactIntelligenceResult | null {
  if (!raw) return null;

  const company = asRecord(raw.company) ?? {};
  const domainProfile = asRecord(raw.domain_profile) ?? {};
  const summary = asRecord(raw.summary) ?? {};

  const contacts = asArray<Record<string, unknown>>(raw.contacts).map((contact) => {
    const emails = asArray<Record<string, unknown>>(contact.emails).map((email) => ({
      email: asNullableString(email.email) ?? "",
      kind: (asNullableString(email.kind) as "sourced" | "guessed" | null) ?? "guessed",
      pattern: asNullableString(email.pattern),
      pattern_confidence: asNullableNumber(email.pattern_confidence),
      source_label: asNullableString(email.source_label),
      source_url: asNullableString(email.source_url),
      verification_status: asNullableString(email.verification_status),
      verification_score: asNullableNumber(email.verification_score),
      score_total: asNullableNumber(email.score_total),
      source_score: asNullableNumber(email.source_score),
      role_score: asNullableNumber(email.role_score),
      freshness_score: asNullableNumber(email.freshness_score),
      is_primary: typeof email.is_primary === "boolean" ? email.is_primary : null,
      verification: asRecord(email.verification),
      evidence: asArray<Record<string, unknown>>(email.evidence).map((item) => ({
        type: asNullableString(item.type),
        label: asNullableString(item.label),
        source_url: asNullableString(item.source_url),
        snippet: asNullableString(item.snippet),
      })),
    })).filter((email) => email.email);

    return {
      name: asNullableString(contact.name) ?? "",
      role: asNullableString(contact.role),
      linkedin: asNullableString(contact.linkedin),
      source: asNullableString(contact.source),
      emails,
    };
  }).filter((contact) => contact.name);

  return {
    company: {
      cnpj: asNullableString(company.cnpj) ?? "",
      razao_social: asNullableString(company.razao_social) ?? "",
      nome_fantasia: asNullableString(company.nome_fantasia),
      cidade: asNullableString(company.cidade),
      uf: asNullableString(company.uf),
      site: asNullableString(company.site),
    },
    domain_profile: {
      domain: asNullableString(domainProfile.domain),
      site_url: asNullableString(domainProfile.site_url),
      resolved_from: asNullableString(domainProfile.resolved_from),
      email_pattern: asNullableString(domainProfile.email_pattern),
      pattern_confidence: asNullableNumber(domainProfile.pattern_confidence),
      linkedin_company: asNullableString(domainProfile.linkedin_company),
      public_emails: asArray<Record<string, unknown>>(domainProfile.public_emails).map((item) => ({
        email: asNullableString(item.email) ?? "",
        kind: asNullableString(item.kind),
        source_label: asNullableString(item.source_label),
        source_url: asNullableString(item.source_url),
      })).filter((item) => item.email),
      generic_inboxes: asArray<Record<string, unknown>>(domainProfile.generic_inboxes).map((item) => ({
        email: asNullableString(item.email) ?? "",
        source_label: asNullableString(item.source_label),
        source_url: asNullableString(item.source_url),
      })).filter((item) => item.email),
      company_profiles: asArray<Record<string, unknown>>(domainProfile.company_profiles).map((item) => ({
        type: asNullableString(item.type) ?? "",
        url: asNullableString(item.url) ?? "",
      })).filter((item) => item.type && item.url),
    },
    contacts,
    summary: {
      decision_makers: asNullableNumber(summary.decision_makers),
      total_contact_emails: asNullableNumber(summary.total_contact_emails),
      verified: asNullableNumber(summary.verified),
      deliverable: asNullableNumber(summary.deliverable),
      risky: asNullableNumber(summary.risky),
      guessed: asNullableNumber(summary.guessed),
      sourced: asNullableNumber(summary.sourced),
      generic_inboxes: asNullableNumber(summary.generic_inboxes),
    },
    generated_at: asNullableString(raw.generated_at),
  };
}

function mapMobileWaterfall(raw: Record<string, unknown> | null | undefined): MobileWaterfallResult | null {
  if (!raw) return null;
  const company = asRecord(raw.company) ?? {};
  const summary = asRecord(raw.summary) ?? {};
  return {
    cnpj: asNullableString(raw.cnpj) ?? "",
    company: {
      cnpj: asNullableString(company.cnpj),
      razao_social: asNullableString(company.razao_social),
      nome_fantasia: asNullableString(company.nome_fantasia),
      cidade: asNullableString(company.cidade),
      uf: asNullableString(company.uf),
      site: asNullableString(company.site),
    },
    summary: {
      company_name: asNullableString(summary.company_name),
      mobile_candidates: asNullableNumber(summary.mobile_candidates),
      phone_candidates: asNullableNumber(summary.phone_candidates),
      verified_whatsapp_candidates: asNullableNumber(summary.verified_whatsapp_candidates),
      likely_whatsapp_candidates: asNullableNumber(summary.likely_whatsapp_candidates),
      decision_maker_mobile_candidates: asNullableNumber(summary.decision_maker_mobile_candidates),
      primary_phone: asNullableString(summary.primary_phone),
      primary_phone_type: asNullableString(summary.primary_phone_type),
      generated_at: asNullableString(summary.generated_at),
    },
    generated_at: asNullableString(raw.generated_at),
    candidates: asArray<Record<string, unknown>>(raw.candidates).map((candidate) => ({
      contact_name: asNullableString(candidate.contact_name),
      contact_role: asNullableString(candidate.contact_role),
      contact_level: asNullableString(candidate.contact_level) ?? "company",
      phone: asNullableString(candidate.phone) ?? "",
      normalized_phone: asNullableString(candidate.normalized_phone) ?? "",
      source_label: asNullableString(candidate.source_label),
      source_url: asNullableString(candidate.source_url),
      phone_type: asNullableString(candidate.phone_type),
      kind: asNullableString(candidate.kind),
      score_total: asNullableNumber(candidate.score_total),
      confidence: asNullableNumber(candidate.confidence),
      likely_whatsapp: typeof candidate.likely_whatsapp === "boolean" ? candidate.likely_whatsapp : Boolean(candidate.likely_whatsapp),
      verified_whatsapp: typeof candidate.verified_whatsapp === "boolean" ? candidate.verified_whatsapp : Boolean(candidate.verified_whatsapp),
      validation_status: asNullableString(candidate.validation_status),
      validation_source: asNullableString(candidate.validation_source),
      is_primary: typeof candidate.is_primary === "boolean" ? candidate.is_primary : Boolean(candidate.is_primary),
      generated_at: asNullableString(candidate.generated_at),
    })).filter((candidate) => candidate.phone && candidate.normalized_phone),
  };
}

export function normalizeCnpj(cnpj: string): string {
  return normalizeCnpjValue(cnpj);
}

export type EmpresaEnriquecimentoPayload = {
  site?: string | null;
  contatos_web?: Record<string, unknown> | null;
  whatsapp_ultra?: Record<string, unknown> | null;
  enriquecimento_ia?: Record<string, unknown> | null;
  dados_receita?: Record<string, unknown> | null;
};

export type ContactIntelligenceEvidence = {
  type?: string | null;
  label?: string | null;
  source_url?: string | null;
  snippet?: string | null;
};

export type ContactIntelligenceEmail = {
  email: string;
  kind: "sourced" | "guessed";
  pattern?: string | null;
  pattern_confidence?: number | null;
  source_label?: string | null;
  source_url?: string | null;
  verification_status?: string | null;
  verification_score?: number | null;
  score_total?: number | null;
  source_score?: number | null;
  role_score?: number | null;
  freshness_score?: number | null;
  is_primary?: boolean | null;
  verification?: Record<string, unknown> | null;
  evidence?: ContactIntelligenceEvidence[] | null;
};

export type ContactIntelligenceContact = {
  name: string;
  role?: string | null;
  linkedin?: string | null;
  source?: string | null;
  emails: ContactIntelligenceEmail[];
};

export type ContactIntelligenceDomainProfile = {
  domain?: string | null;
  site_url?: string | null;
  resolved_from?: string | null;
  email_pattern?: string | null;
  pattern_confidence?: number | null;
  linkedin_company?: string | null;
  public_emails?: Array<{
    email: string;
    kind?: string | null;
    source_label?: string | null;
    source_url?: string | null;
  }> | null;
  generic_inboxes?: Array<{
    email: string;
    source_label?: string | null;
    source_url?: string | null;
  }> | null;
  company_profiles?: Array<{
    type: string;
    url: string;
  }> | null;
};

export type ContactIntelligenceSummary = {
  decision_makers?: number | null;
  total_contact_emails?: number | null;
  verified?: number | null;
  deliverable?: number | null;
  risky?: number | null;
  guessed?: number | null;
  sourced?: number | null;
  generic_inboxes?: number | null;
};

export type ContactIntelligenceResult = {
  company: {
    cnpj: string;
    razao_social: string;
    nome_fantasia?: string | null;
    cidade?: string | null;
    uf?: string | null;
    site?: string | null;
  };
  domain_profile: ContactIntelligenceDomainProfile;
  contacts: ContactIntelligenceContact[];
  summary: ContactIntelligenceSummary;
  generated_at?: string | null;
};

export type MobileWaterfallCandidate = {
  contact_name?: string | null;
  contact_role?: string | null;
  contact_level: string;
  phone: string;
  normalized_phone: string;
  source_label?: string | null;
  source_url?: string | null;
  phone_type?: string | null;
  kind?: string | null;
  score_total?: number | null;
  confidence?: number | null;
  likely_whatsapp: boolean;
  verified_whatsapp: boolean;
  validation_status?: string | null;
  validation_source?: string | null;
  is_primary: boolean;
  generated_at?: string | null;
};

export type MobileWaterfallSummary = {
  company_name?: string | null;
  mobile_candidates?: number | null;
  phone_candidates?: number | null;
  verified_whatsapp_candidates?: number | null;
  likely_whatsapp_candidates?: number | null;
  decision_maker_mobile_candidates?: number | null;
  primary_phone?: string | null;
  primary_phone_type?: string | null;
  generated_at?: string | null;
};

export type MobileWaterfallResult = {
  cnpj: string;
  company?: {
    cnpj?: string | null;
    razao_social?: string | null;
    nome_fantasia?: string | null;
    cidade?: string | null;
    uf?: string | null;
    site?: string | null;
  } | null;
  summary: MobileWaterfallSummary;
  generated_at?: string | null;
  candidates: MobileWaterfallCandidate[];
};

export type CompanyDataHealthItem = {
  cnpj: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cidade?: string | null;
  uf?: string | null;
  mobile_candidates: number;
  verified_whatsapp_candidates: number;
  decision_maker_mobile_candidates: number;
  stale: boolean;
  generated_at?: string | null;
  gap_score: number;
};

export type CompanyDataHealth = {
  summary: {
    watchlist_total: number;
    without_mobile: number;
    without_verified_whatsapp: number;
    without_decision_maker_mobile: number;
    stale_records: number;
  };
  items: CompanyDataHealthItem[];
};

export type SimilarCompany = {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cnae_principal?: string | null;
  porte_empresa?: string | null;
  capital_social?: number | null;
  email_receita?: string | null;
  telefone_receita?: string | null;
  site?: string | null;
  whatsapp?: string | null;
  similarity_score: number;
};

export type ExternalSignal = {
  id?: string | null;
  watch_id?: string | null;
  cnpj: string;
  signal_type: string;
  title: string;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

type BuscarEmpresaResponse = {
  success: boolean;
  empresa: Record<string, unknown>;
};

type EnriquecerEmpresaResponse = {
  success: boolean;
  cnpj: string;
  enriquecimento: EmpresaEnriquecimentoPayload;
  message?: string;
};

type ContactIntelligenceResponse = {
  success: boolean;
  cached: boolean;
  intelligence?: Record<string, unknown> | null;
};

type MobileWaterfallResponse = {
  success: boolean;
  cached: boolean;
  mobile_waterfall?: Record<string, unknown> | null;
};

type ContactIntelligenceStatusResponse = {
  success: boolean;
  cnpj?: string | null;
  status?: string | null;
  cached?: boolean;
  queued?: boolean;
  error?: string | null;
  job_id?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  intelligence?: Record<string, unknown> | null;
};

type ContactIntelligenceBatchItemResponse = {
  cnpj?: string | null;
  status?: string | null;
  cached?: boolean;
  queued?: boolean;
  intelligence?: Record<string, unknown> | null;
  error?: string | null;
};

type ContactIntelligenceBatchResponse = {
  success: boolean;
  total?: number;
  items?: ContactIntelligenceBatchItemResponse[] | null;
};

type SimilarCompaniesResponse = {
  success: boolean;
  cnpj?: string | null;
  items?: Record<string, unknown>[] | null;
  total?: number;
};

type ExternalSignalsResponse = {
  success: boolean;
  cnpj?: string | null;
  signals?: Record<string, unknown>[] | null;
  total?: number;
};

type FiscalPublicSnapshotResponse = {
  success: boolean;
  snapshot?: Record<string, unknown> | null;
};

type FiscalPublicLookupResponse = {
  success: boolean;
  cnpj?: string | null;
  snapshot?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
  records?: Record<string, unknown>[] | null;
};

export type ContactIntelligenceBatchItem = {
  cnpj: string;
  status: string;
  cached: boolean;
  queued: boolean;
  intelligence: ContactIntelligenceResult | null;
  error?: string | null;
};

export type ContactIntelligenceStatus = {
  cnpj: string;
  status: string;
  cached: boolean;
  queued: boolean;
  error?: string | null;
  jobId?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  intelligence: ContactIntelligenceResult | null;
};

export type FiscalPublicSnapshot = {
  id: string;
  provider: string;
  source_label?: string | null;
  filename?: string | null;
  notes?: string | null;
  status?: string | null;
  record_count: number;
  unique_cnpjs: number;
  skipped_rows: number;
  imported_at?: string | null;
  column_map?: Record<string, string> | null;
};

export type FiscalPublicRecord = {
  id: string;
  cnpj: string;
  nome_devedor?: string | null;
  tipo_pessoa?: string | null;
  uf_devedor?: string | null;
  situacao?: string | null;
  tipo_situacao_inscricao?: string | null;
  numero_inscricao?: string | null;
  data_inscricao?: string | null;
  valor_originario?: number | null;
  valor_consolidado?: number | null;
  tipo_credito?: string | null;
  receita_principal?: string | null;
  tipo_devedor?: string | null;
  indicador_ajuizado?: boolean | null;
  unidade_responsavel?: string | null;
  entidade_responsavel?: string | null;
  unidade_inscricao?: string | null;
  processo_judicial?: string | null;
  source_url?: string | null;
  source_file_name?: string | null;
  source_member_name?: string | null;
  imported_at?: string | null;
};

export type FiscalPublicLookup = {
  cnpj: string;
  snapshot: FiscalPublicSnapshot | null;
  summary: {
    has_snapshot: boolean;
    has_records: boolean;
    total_records: number;
    total_valor_originario: number;
    total_valor_consolidado: number;
    ajuizadas: number;
    latest_data_inscricao?: string | null;
    nome_devedor?: string | null;
    situacoes: string[];
    ufs: string[];
    tipos_credito: string[];
    fontes: string[];
  };
  records: FiscalPublicRecord[];
};


export async function buscarEmpresaPorCnpj(cnpj: string): Promise<Empresa> {
  const data = await hermesFetch<BuscarEmpresaResponse>(
    appendFreshQuery(`/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}`),
    { cache: "no-store" },
  );
  return mapEmpresaApi(data.empresa ?? {});
}

export type DossieHermesSocio = {
  nome: string | null;
  tipo: string | null;
  cpf_cnpj: string | null;
  qualificacao: string | null;
  data_entrada: string | null;
  faixa_etaria: string | null;
  representante: string | null;
  cpf_representante: string | null;
  qualificacao_representante: string | null;
  pais: string | null;
};

export type DossieHermesFilial = {
  cnpj: string;
  tipo: string | null;
  situacao: string | null;
  data_inicio: string | null;
  data_situacao: string | null;
  uf: string | null;
  cidade: string | null;
  logradouro: string | null;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  atividade_principal: string | null;
  is_self: boolean;
};

export type DossieHermesCnae = {
  subclasse: string | null;
  id: string | null;
  descricao: string | null;
  secao: string | null;
  divisao: string | null;
  grupo: string | null;
  classe: string | null;
};

export type DossieHermesIE = {
  uf: string | null;
  ie: string | null;
  ativa: boolean;
  atualizado_em: string | null;
};

export type DossieHermesContatosSite = {
  emails: string[];
  telefones: string[];
  whatsapps: string[];
  redes_sociais: Record<string, string>;
};

export type DossieHermesSiteOficial = {
  url: string | null;
  confianca?: string | null;
  contatos_extraidos: DossieHermesContatosSite | null;
};

export type DossieHermes = {
  encontrado: boolean;
  fonte: string;
  cnpj: string;
  cnpj_raiz: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  tipo: string | null;
  capital_social: number | null;
  porte: string | null;
  natureza_juridica: string | null;
  qualificacao_responsavel: string | null;
  situacao_cadastral: string | null;
  data_situacao_cadastral: string | null;
  data_inicio_atividade: string | null;
  atualizado_em: string | null;
  endereco: {
    tipo_logradouro: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cep: string | null;
    cidade: string | null;
    uf: string | null;
    ibge: number | string | null;
  };
  contatos_receita: {
    telefone1: string | null;
    telefone2: string | null;
    fax: string | null;
    email: string | null;
  };
  cnae_principal: DossieHermesCnae;
  cnaes_secundarias: DossieHermesCnae[];
  inscricoes_estaduais: DossieHermesIE[];
  socios: DossieHermesSocio[];
  filiais: DossieHermesFilial[];
  site_oficial: DossieHermesSiteOficial | null;
  fontes_consultadas: Record<string, boolean>;
};

type DossieResponse = {
  success: boolean;
  dossie: DossieHermes;
};

export async function buscarDossieEmpresa(
  cnpj: string,
  opts: { descobrirFiliais?: boolean; refresh?: boolean } = {},
): Promise<DossieHermes> {
  const params = new URLSearchParams();
  if (opts.descobrirFiliais === false) params.set("descobrir_filiais", "false");
  if (opts.refresh) params.set("refresh", "true");
  const qs = params.toString() ? `?${params.toString()}` : "";
  const data = await hermesFetch<DossieResponse>(
    appendFreshQuery(
      `/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}/dossie${qs}`,
    ),
    { cache: "no-store" },
  );
  return data.dossie;
}

export async function enriquecerEmpresaPorCnpj(
  cnpj: string,
  empresaBase?: Empresa | null,
): Promise<{ empresa: Empresa; enrichment: EmpresaEnriquecimentoPayload; message?: string }> {
  const normalized = normalizeCnpjValue(cnpj);
  const sameCompany =
    empresaBase && normalizeCnpjValue(empresaBase.cnpj) === normalized;
  const base = sameCompany ? empresaBase : await buscarEmpresaPorCnpj(normalized);
  const data = await hermesFetch<EnriquecerEmpresaResponse>(
    `/empresas/${encodeURIComponent(normalized)}/enriquecer`,
    { method: "POST" },
  );
  const enrichment = (data.enriquecimento ?? {}) as Record<string, unknown>;
  return {
    empresa: mergeEmpresaWithEnrichment(base, enrichment),
    enrichment: data.enriquecimento ?? {},
    message: data.message,
  };
}

export async function buscarContactIntelligencePorCnpj(
  cnpj: string,
): Promise<{ cached: boolean; intelligence: ContactIntelligenceResult | null }> {
  const data = await hermesFetch<ContactIntelligenceResponse>(
    appendFreshQuery(`/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}/contact-intelligence`),
    { cache: "no-store" },
  );
  return {
    cached: !!data.cached,
    intelligence: mapContactIntelligence(asRecord(data.intelligence)),
  };
}

export async function resolverContactIntelligencePorCnpj(
  cnpj: string,
  opts?: { probeSmtp?: boolean },
): Promise<ContactIntelligenceResult> {
  const data = await hermesFetch<ContactIntelligenceResponse>(
    `/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}/contact-intelligence`,
    {
      method: "POST",
      body: JSON.stringify({
        probe_smtp: opts?.probeSmtp ?? false,
      }),
    },
  );
  const intelligence = mapContactIntelligence(asRecord(data.intelligence));
  if (!intelligence) {
    throw new Error("Nao foi possivel resolver a inteligencia de contatos.");
  }
  return intelligence;
}

function mapContactIntelligenceStatus(
  raw: ContactIntelligenceStatusResponse,
): ContactIntelligenceStatus {
  return {
    cnpj: asNullableString(raw.cnpj) ?? "",
    status: asNullableString(raw.status) ?? "idle",
    cached: !!raw.cached,
    queued: !!raw.queued,
    error: asNullableString(raw.error),
    jobId: asNullableString(raw.job_id),
    updatedAt: asNullableString(raw.updated_at),
    startedAt: asNullableString(raw.started_at),
    finishedAt: asNullableString(raw.finished_at),
    intelligence: mapContactIntelligence(asRecord(raw.intelligence)),
  };
}

export async function buscarStatusContactIntelligencePorCnpj(
  cnpj: string,
): Promise<ContactIntelligenceStatus> {
  const data = await hermesFetch<ContactIntelligenceStatusResponse>(
    appendFreshQuery(`/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}/contact-intelligence/status`),
    { cache: "no-store" },
  );
  return mapContactIntelligenceStatus(data);
}

export async function enfileirarContactIntelligencePorCnpj(
  cnpj: string,
  opts?: { probeSmtp?: boolean; refresh?: boolean },
): Promise<ContactIntelligenceStatus> {
  const data = await hermesFetch<ContactIntelligenceStatusResponse>(
    `/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}/contact-intelligence/queue`,
    {
      method: "POST",
      body: JSON.stringify({
        probe_smtp: opts?.probeSmtp ?? false,
        refresh: opts?.refresh ?? false,
      }),
    },
  );
  return mapContactIntelligenceStatus(data);
}

export async function buscarMobileWaterfallPorCnpj(
  cnpj: string,
): Promise<{ cached: boolean; mobileWaterfall: MobileWaterfallResult | null }> {
  const data = await hermesFetch<MobileWaterfallResponse>(
    appendFreshQuery(`/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}/mobile-waterfall`),
    { cache: "no-store" },
  );
  return {
    cached: !!data.cached,
    mobileWaterfall: mapMobileWaterfall(asRecord(data.mobile_waterfall)),
  };
}

export async function resolverMobileWaterfallPorCnpj(
  cnpj: string,
  opts?: { refresh?: boolean; verifyWhatsapp?: boolean },
): Promise<MobileWaterfallResult> {
  const data = await hermesFetch<MobileWaterfallResponse>(
    `/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}/mobile-waterfall`,
    {
      method: "POST",
      body: JSON.stringify({
        refresh: opts?.refresh ?? false,
        verify_whatsapp: opts?.verifyWhatsapp ?? true,
      }),
    },
  );
  const mobileWaterfall = mapMobileWaterfall(asRecord(data.mobile_waterfall));
  if (!mobileWaterfall) {
    throw new Error("Nao foi possivel resolver o mobile waterfall.");
  }
  return mobileWaterfall;
}

export async function resolverContactIntelligenceBatchPorCnpj(
  cnpjs: string[],
  opts?: { probeSmtp?: boolean; refresh?: boolean },
): Promise<ContactIntelligenceBatchItem[]> {
  const normalized = Array.from(
    new Set(
      cnpjs
        .map((cnpj) => normalizeCnpjValue(cnpj))
        .filter((cnpj) => cnpj.length > 0),
    ),
  );

  if (normalized.length === 0) return [];

  const data = await hermesFetch<ContactIntelligenceBatchResponse>(
    "/empresas/contact-intelligence/batch",
    {
      method: "POST",
      body: JSON.stringify({
        cnpjs: normalized,
        probe_smtp: opts?.probeSmtp ?? false,
        refresh: opts?.refresh ?? false,
      }),
    },
  );

  return asArray<ContactIntelligenceBatchItemResponse>(data.items).map((item) => ({
    cnpj: asNullableString(item.cnpj) ?? "",
    status: asNullableString(item.status) ?? "completed",
    cached: !!item.cached,
    queued: !!item.queued,
    intelligence: mapContactIntelligence(asRecord(item.intelligence)),
    error: asNullableString(item.error),
  })).filter((item) => item.cnpj);
}

export async function enfileirarContactIntelligenceBatchPorCnpj(
  cnpjs: string[],
  opts?: { probeSmtp?: boolean; refresh?: boolean },
): Promise<ContactIntelligenceBatchItem[]> {
  const normalized = Array.from(
    new Set(
      cnpjs
        .map((cnpj) => normalizeCnpjValue(cnpj))
        .filter((cnpj) => cnpj.length > 0),
    ),
  );

  if (normalized.length === 0) return [];

  const data = await hermesFetch<ContactIntelligenceBatchResponse>(
    "/empresas/contact-intelligence/batch/queue",
    {
      method: "POST",
      body: JSON.stringify({
        cnpjs: normalized,
        probe_smtp: opts?.probeSmtp ?? false,
        refresh: opts?.refresh ?? false,
      }),
    },
  );

  return asArray<ContactIntelligenceBatchItemResponse>(data.items).map((item) => ({
    cnpj: asNullableString(item.cnpj) ?? "",
    status: asNullableString(item.status) ?? "idle",
    cached: !!item.cached,
    queued: !!item.queued,
    intelligence: mapContactIntelligence(asRecord(item.intelligence)),
    error: asNullableString(item.error),
  })).filter((item) => item.cnpj);
}

function mapSimilarCompany(raw: Record<string, unknown>): SimilarCompany {
  return {
    cnpj: asNullableString(raw.cnpj) ?? "",
    razao_social: asNullableString(raw.razao_social) ?? "",
    nome_fantasia: asNullableString(raw.nome_fantasia),
    cidade: asNullableString(raw.cidade),
    uf: asNullableString(raw.uf),
    cnae_principal: asNullableString(raw.cnae_principal),
    porte_empresa: asNullableString(raw.porte_empresa),
    capital_social: asNullableNumber(raw.capital_social),
    email_receita: asNullableString(raw.email_receita),
    telefone_receita: asNullableString(raw.telefone_receita),
    site: asNullableString(raw.site),
    whatsapp: asNullableString(raw.whatsapp),
    similarity_score: asNullableNumber(raw.similarity_score) ?? 0,
  };
}

function mapExternalSignal(raw: Record<string, unknown>, fallbackCnpj?: string): ExternalSignal {
  return {
    id: asNullableString(raw.id),
    watch_id: asNullableString(raw.watch_id),
    cnpj: asNullableString(raw.cnpj) ?? fallbackCnpj ?? "",
    signal_type: asNullableString(raw.signal_type) ?? "",
    title: asNullableString(raw.title) ?? "",
    payload: asRecord(raw.payload),
    created_at: asNullableString(raw.created_at),
  };
}

function mapFiscalPublicSnapshot(raw: Record<string, unknown> | null | undefined): FiscalPublicSnapshot | null {
  if (!raw) return null;
  return {
    id: asNullableString(raw.id) ?? "",
    provider: asNullableString(raw.provider) ?? "",
    source_label: asNullableString(raw.source_label),
    filename: asNullableString(raw.filename),
    notes: asNullableString(raw.notes),
    status: asNullableString(raw.status),
    record_count: asNullableNumber(raw.record_count) ?? 0,
    unique_cnpjs: asNullableNumber(raw.unique_cnpjs) ?? 0,
    skipped_rows: asNullableNumber(raw.skipped_rows) ?? 0,
    imported_at: asNullableString(raw.imported_at),
    column_map: (asRecord(raw.column_map) as Record<string, string> | null) ?? null,
  };
}

function mapFiscalPublicRecord(raw: Record<string, unknown>): FiscalPublicRecord {
  return {
    id: asNullableString(raw.id) ?? "",
    cnpj: asNullableString(raw.cnpj) ?? "",
    nome_devedor: asNullableString(raw.nome_devedor),
    tipo_pessoa: asNullableString(raw.tipo_pessoa),
    uf_devedor: asNullableString(raw.uf_devedor),
    situacao: asNullableString(raw.situacao),
    tipo_situacao_inscricao: asNullableString(raw.tipo_situacao_inscricao),
    numero_inscricao: asNullableString(raw.numero_inscricao),
    data_inscricao: asNullableString(raw.data_inscricao),
    valor_originario: asNullableNumber(raw.valor_originario),
    valor_consolidado: asNullableNumber(raw.valor_consolidado),
    tipo_credito: asNullableString(raw.tipo_credito),
    receita_principal: asNullableString(raw.receita_principal),
    tipo_devedor: asNullableString(raw.tipo_devedor),
    indicador_ajuizado:
      raw.indicador_ajuizado == null ? null : Boolean(raw.indicador_ajuizado),
    unidade_responsavel: asNullableString(raw.unidade_responsavel),
    entidade_responsavel: asNullableString(raw.entidade_responsavel),
    unidade_inscricao: asNullableString(raw.unidade_inscricao),
    processo_judicial: asNullableString(raw.processo_judicial),
    source_url: asNullableString(raw.source_url),
    source_file_name: asNullableString(raw.source_file_name),
    source_member_name: asNullableString(raw.source_member_name),
    imported_at: asNullableString(raw.imported_at),
  };
}

function mapFiscalPublicLookup(raw: FiscalPublicLookupResponse): FiscalPublicLookup {
  const summary = asRecord(raw.summary) ?? {};
  return {
    cnpj: asNullableString(raw.cnpj) ?? "",
    snapshot: mapFiscalPublicSnapshot(asRecord(raw.snapshot)),
    summary: {
      has_snapshot: !!summary.has_snapshot,
      has_records: !!summary.has_records,
      total_records: asNullableNumber(summary.total_records) ?? 0,
      total_valor_originario: asNullableNumber(summary.total_valor_originario) ?? 0,
      total_valor_consolidado: asNullableNumber(summary.total_valor_consolidado) ?? 0,
      ajuizadas: asNullableNumber(summary.ajuizadas) ?? 0,
      latest_data_inscricao: asNullableString(summary.latest_data_inscricao),
      nome_devedor: asNullableString(summary.nome_devedor),
      situacoes: asArray<string>(summary.situacoes).map((item) => String(item)),
      ufs: asArray<string>(summary.ufs).map((item) => String(item)),
      tipos_credito: asArray<string>(summary.tipos_credito).map((item) => String(item)),
      fontes: asArray<string>(summary.fontes).map((item) => String(item)),
    },
    records: asArray<Record<string, unknown>>(raw.records).map(mapFiscalPublicRecord),
  };
}

export async function buscarEmpresasParecidasPorCnpj(
  cnpj: string,
  limit = 12,
): Promise<SimilarCompany[]> {
  const data = await hermesFetch<SimilarCompaniesResponse>(
    appendFreshQuery(
      `/empresas/${encodeURIComponent(normalizeCnpjValue(cnpj))}/similar-companies?limit=${Math.max(1, Math.min(limit, 25))}`,
    ),
    { cache: "no-store" },
  );
  return asArray<Record<string, unknown>>(data.items)
    .map(mapSimilarCompany)
    .filter((item) => item.cnpj);
}

export async function buscarSinaisExternosPorCnpj(cnpj: string): Promise<ExternalSignal[]> {
  const normalized = normalizeCnpjValue(cnpj);
  const data = await hermesFetch<ExternalSignalsResponse>(
    appendFreshQuery(`/empresas/${encodeURIComponent(normalized)}/external-signals`),
    {
      method: "POST",
      cache: "no-store",
    },
  );
  return asArray<Record<string, unknown>>(data.signals).map((item) =>
    mapExternalSignal(item, normalized),
  );
}

export async function getFiscalPublicSnapshotMeta(): Promise<FiscalPublicSnapshot | null> {
  const data = await hermesFetch<FiscalPublicSnapshotResponse>(
    appendFreshQuery("/fiscal-public/meta"),
    { cache: "no-store" },
  );
  return mapFiscalPublicSnapshot(asRecord(data.snapshot));
}

export async function consultarFiscalPublicaPorCnpj(cnpj: string): Promise<FiscalPublicLookup> {
  const data = await hermesFetch<FiscalPublicLookupResponse>(
    appendFreshQuery(`/fiscal-public/${encodeURIComponent(normalizeCnpjValue(cnpj))}`),
    { cache: "no-store" },
  );
  return mapFiscalPublicLookup(data);
}

export async function importarBaseFiscalPublicaArquivo(
  file: File,
  opts?: {
    provider?: string;
    sourceLabel?: string;
    notes?: string | null;
  },
): Promise<FiscalPublicSnapshot> {
  const form = new FormData();
  form.append("file", file);
  form.append("provider", opts?.provider ?? "pgfn_open_data_manual");
  form.append("source_label", opts?.sourceLabel ?? "PGFN Dados Abertos");
  if (opts?.notes) {
    form.append("notes", opts.notes);
  }

  const data = await hermesFetch<FiscalPublicSnapshotResponse>("/fiscal-public/import", {
    method: "POST",
    body: form,
  });

  const snapshot = mapFiscalPublicSnapshot(asRecord(data.snapshot));
  if (!snapshot) {
    throw new Error("Nao foi possivel importar a base fiscal.");
  }
  return snapshot;
}

export async function importarBaseFiscalPublicaTexto(
  content: string,
  opts?: {
    filename?: string | null;
    provider?: string;
    sourceLabel?: string;
    notes?: string | null;
  },
): Promise<FiscalPublicSnapshot> {
  const data = await hermesFetch<FiscalPublicSnapshotResponse>("/fiscal-public/import-text", {
    method: "POST",
    body: JSON.stringify({
      content,
      filename: opts?.filename ?? null,
      provider: opts?.provider ?? "pgfn_open_data_manual",
      source_label: opts?.sourceLabel ?? "PGFN Dados Abertos",
      notes: opts?.notes ?? null,
    }),
  });

  const snapshot = mapFiscalPublicSnapshot(asRecord(data.snapshot));
  if (!snapshot) {
    throw new Error("Nao foi possivel importar a base fiscal.");
  }
  return snapshot;
}

export async function importarBaseFiscalPublicaCaminhos(
  paths: string[],
  opts?: {
    filename?: string | null;
    provider?: string;
    sourceLabel?: string;
    notes?: string | null;
  },
): Promise<FiscalPublicSnapshot> {
  const data = await hermesFetch<FiscalPublicSnapshotResponse>("/fiscal-public/import-paths", {
    method: "POST",
    body: JSON.stringify({
      paths,
      filename: opts?.filename ?? null,
      provider: opts?.provider ?? "pgfn_open_data_manual",
      source_label: opts?.sourceLabel ?? "PGFN Dados Abertos",
      notes: opts?.notes ?? null,
    }),
  });

  const snapshot = mapFiscalPublicSnapshot(asRecord(data.snapshot));
  if (!snapshot) {
    throw new Error("Nao foi possivel importar a base fiscal.");
  }
  return snapshot;
}

export async function buscarStatusBatchContactIntelligencePorCnpj(
  cnpjs: string[],
): Promise<ContactIntelligenceStatus[]> {
  const normalized = Array.from(
    new Set(
      cnpjs
        .map((cnpj) => normalizeCnpjValue(cnpj))
        .filter((cnpj) => cnpj.length > 0),
    ),
  );

  if (normalized.length === 0) return [];

  const data = await hermesFetch<ContactIntelligenceBatchResponse>(
    "/empresas/contact-intelligence/batch/status",
    {
      method: "POST",
      body: JSON.stringify({
        cnpjs: normalized,
      }),
    },
  );

  return asArray<ContactIntelligenceStatusResponse>(data.items).map((item) =>
    mapContactIntelligenceStatus({
      success: true,
      ...item,
    }),
  ).filter((item) => item.cnpj);
}

export async function salvarResultadoEnriquecimentoCnpj(
  empresa: Empresa,
  cnpjConsultado?: string,
): Promise<void> {
  const enriquecida = Boolean(
    empresa.site ||
    empresa.email_enriquecido ||
    empresa.telefone_enriquecido ||
    empresa.whatsapp_enriquecido,
  );

  await salvarResultadoLocal({
    timestamp: new Date().toISOString(),
    config: {
      termo_base: cnpjConsultado ? `CNPJ ${cnpjConsultado}` : `CNPJ ${empresa.cnpj}`,
      cidade: empresa.cidade ?? "",
      uf: empresa.uf ?? "",
      cidades: empresa.cidade ? [empresa.cidade] : [],
      ufs: empresa.uf ? [empresa.uf] : [],
      capital_minimo: 0,
      capital_maximo: null,
      limite_empresas: 1,
      portes: empresa.porte ? [empresa.porte] : [],
      segmentos: empresa.segmento ? [empresa.segmento] : [],
      cnaes: empresa.cnae_principal ? [empresa.cnae_principal] : [],
      incluir_cnae_secundario: false,
      enriquecimento_web: enriquecida,
      exigir_contato_acionavel: false,
      priorizar_com_contato: true,
      excluir_cnpjs: [],
      idade_minima_anos: null,
      idade_maxima_anos: null,
    },
    resultado: {
      total_empresas: 1,
      empresas: [empresa],
      filtros_icp: {
        portes: empresa.porte ? [empresa.porte] : [],
        segmentos: empresa.segmento ? [empresa.segmento] : [],
        cidade: empresa.cidade ?? null,
        uf: empresa.uf ?? null,
        cidades: empresa.cidade ? [empresa.cidade] : null,
        ufs: empresa.uf ? [empresa.uf] : null,
        exigir_contato_acionavel: false,
      },
      enriquecimento_web: {
        total_com_enriquecimento: enriquecida ? 1 : 0,
        total_sem_enriquecimento: enriquecida ? 0 : 1,
        porcentagem_enriquecida: enriquecida ? 100 : 0,
      },
    },
  });
}

export async function salvarResultadoManual(
  config: ProspeccaoConfig,
  resultado: ProspeccaoResultado,
): Promise<void> {
  await salvarResultadoLocal({
    timestamp: new Date().toISOString(),
    config,
    resultado,
  });
}

// ------------------------
// CRÉDITOS
// ------------------------

export type CreditsSaldo = { org_id: string; saldo: number };

export async function getCredits(): Promise<CreditsSaldo> {
  return hermesFetch<CreditsSaldo>("/credits");
}

export async function addCredits(amount: number): Promise<CreditsSaldo & { consumido?: number }> {
  return hermesFetch("/credits/add", { method: "POST", body: JSON.stringify({ amount }) });
}

export async function consumeCredits(amount: number): Promise<CreditsSaldo & { consumido: number }> {
  return hermesFetch("/credits/consume", { method: "POST", body: JSON.stringify({ amount }) });
}

// ------------------------
// COMPRA DE CRÉDITOS (ASAAS)
// ------------------------

export type CreditPackage = {
  id: string;
  credits: number;
  price: number;
  label: string;
  badge?: string;
};

export async function getCreditPackages(): Promise<{ packages: CreditPackage[] }> {
  return hermesFetch("/credits/packages");
}

export type CheckoutCustomer = { name: string; email: string; cpf_cnpj: string };

export type CheckoutResult = {
  payment_id: string;
  credits: number;
  value: number;
  due_date: string;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
};

export async function checkoutCredits(
  packageId: string,
  billingType: "PIX" | "BOLETO",
  customer: CheckoutCustomer
): Promise<CheckoutResult> {
  return hermesFetch("/credits/checkout", {
    method: "POST",
    body: JSON.stringify({ package_id: packageId, billing_type: billingType, customer }),
  });
}

// ------------------------
// CRM EXPORT
// ------------------------

const CRM_KEYS_KEY = "hermes:crm_keys";

/**
 * @deprecated JUN 1.3 — chaves agora ficam cifradas em org_integrations_private.
 * Mantido só pra retrocompat (export pra Pipedrive/HubSpot/RD ainda passa api_key).
 * Use getCrmKeysStatus() pra saber se está configurado e saveCrmKey() pra atualizar.
 */
export function getCrmKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${CRM_KEYS_KEY}:${getTenantKey()}`);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

/**
 * @deprecated use saveCrmKey() (async, vai pro backend cifrado).
 */
export function setCrmKey(provider: string, value: string) {
  const keys = getCrmKeys();
  if (value.trim()) keys[provider] = value.trim();
  else delete keys[provider];
  localStorage.setItem(`${CRM_KEYS_KEY}:${getTenantKey()}`, JSON.stringify(keys));
}

/**
 * TAM Calculator · conta empresas ativas no BR que batem o ICP.
 * Usa endpoint /prospeccao/tam (DuckDB cnpj_empresas, situação 02).
 */
export type TamResponse = {
  total_estimado: number;
  por_uf: Record<string, number>;
  criterios: Record<string, unknown>;
  fonte: string;
};

export async function calcularTAM(params: {
  ufs?: string[];
  capital_minimo?: number;
  capital_maximo?: number;
  cnae_prefixes?: string[];
  portes?: string[];
  incluir_breakdown_uf?: boolean;
}): Promise<TamResponse> {
  return apiFetch<TamResponse>("/prospeccao/tam", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * JUN 1.3 · status das chaves CRM cifradas no backend (org_integrations_private).
 * Retorna boolean por provider — NUNCA expõe o valor da chave ao client.
 */
export async function getCrmKeysStatus(): Promise<Record<string, boolean>> {
  try {
    return await apiFetch<Record<string, boolean>>("/integrations/crm-keys/status");
  } catch {
    return { pipedrive: false, hubspot: false, rdstation: false };
  }
}

/**
 * JUN 1.3 · grava chave CRM cifrada no backend.
 * String vazia = limpa a chave do provider.
 */
export async function saveCrmKey(provider: "pipedrive" | "hubspot" | "rdstation", value: string): Promise<void> {
  await apiFetch("/integrations/crm-keys", {
    method: "PUT",
    body: JSON.stringify({ [provider]: value }),
  });
}

export type LeadExportPayload = {
  cnpj?: string;
  razao_social: string;
  nome_fantasia?: string;
  email?: string;
  telefone?: string;
  whatsapp?: string;
  site?: string;
  cidade?: string;
  uf?: string;
  segmento?: string;
  porte?: string;
  capital_social?: number;
  observacoes?: string;
};

export async function exportToCrm(
  provider: "pipedrive" | "hubspot" | "rdstation" | "ploomes",
  apiKey: string,
  lead: LeadExportPayload,
  opts?: { funnel_id?: number; create_deal?: boolean }
): Promise<{ success: boolean; provider: string; message?: string; contact_id?: number; deal_id?: number; updated?: boolean }> {
  // Ploomes usa chave fixa no server (.env PLOOMES_API_KEY) — frontend não envia chave
  return hermesFetch("/crm/export", {
    method: "POST",
    body: JSON.stringify({
      provider,
      api_key: provider === "ploomes" ? null : apiKey,
      lead,
      funnel_id: opts?.funnel_id ?? null,
      create_deal: opts?.create_deal ?? true,
    }),
  });
}

export async function exportBatchToCrm(
  provider: "pipedrive" | "hubspot" | "rdstation" | "ploomes",
  apiKey: string,
  leads: LeadExportPayload[],
  opts?: { funnel_id?: number; create_deal?: boolean }
): Promise<{ total: number; success: number; results: Array<Record<string, unknown>> }> {
  return hermesFetch("/crm/export/batch", {
    method: "POST",
    body: JSON.stringify({
      provider,
      api_key: provider === "ploomes" ? null : apiKey,
      leads,
      funnel_id: opts?.funnel_id ?? null,
      create_deal: opts?.create_deal ?? true,
    }),
  });
}

// ------------------------
// PROSPECÇÃO
// ------------------------

export async function runProspeccao(configFront: ProspeccaoConfig): Promise<ProspeccaoResultado> {
  const payload = {
    ...configFront,
    cidades: configFront.cidades ?? (configFront.cidade ? [configFront.cidade] : []),
    ufs: configFront.ufs ?? (configFront.uf ? [configFront.uf] : []),
    cnaes: configFront.cnaes ?? [],
    exigir_contato_acionavel: configFront.exigir_contato_acionavel ?? false,
    priorizar_com_contato: configFront.priorizar_com_contato ?? true,
  };

  const data = await hermesFetch<ProspeccaoResultado>("/prospeccao/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  await salvarResultadoLocal({
    timestamp: new Date().toISOString(),
    config: configFront,
    resultado: data,
  });

  return data;
}

export type ProgressEvent = {
  stage: "db_query" | "building" | "enriching" | "enriching_socials" | "enriching_whatsapp_ultra" | "processing" | "done";
  current: number;
  total: number;
  detail: string;
};

export type QueryTranslationResult = {
  query: string;
  source: "heuristic" | "hybrid" | "openai";
  config: ProspeccaoConfig;
  highlights: string[];
  warnings: string[];
};

export type AssertivaTelefone = {
  numero?: string | null;
  tipo?: string | null;
  whatsapp?: boolean | null;
};

export type AssertivaEmail = {
  email?: string | null;
  tipo?: string | null;
};

export type AssertivaSocio = {
  nome?: string | null;
  cargo?: string | null;
  data_entrada?: string | null;
  cpf_cnpj?: string | null;
};

export type AssertivaCnaeSecundario = {
  codigo?: string | null;
  descricao?: string | null;
};

export type AssertivaCnpjData = {
  encontrado?: boolean;
  fonte?: string | null;
  cnpj?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  situacao?: string | null;
  data_abertura?: string | null;
  porte?: string | null;
  natureza_juridica?: string | null;
  site?: string | null;
  cnae_principal?: {
    codigo?: string | null;
    descricao?: string | null;
  } | null;
  cnaes_secundarios?: AssertivaCnaeSecundario[] | null;
  endereco?: {
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
  } | null;
  telefones?: AssertivaTelefone[] | null;
  emails?: AssertivaEmail[] | null;
  socios?: AssertivaSocio[] | null;
  redes_sociais?: unknown[] | null;
  raw?: Record<string, unknown> | null;
};

export type AssertivaDecisor = {
  nome?: string | null;
  cargo?: string | null;
  cpf_cnpj?: string | null;
  whatsapp?: string[] | null;
  telefones?: string[] | null;
  emails?: string[] | null;
  whatsapp_fonte?: string | null;
};

export type AssertivaDecisoresData = {
  cnpj?: string | null;
  encontrado?: boolean;
  decisores?: AssertivaDecisor[] | null;
};

export async function runProspeccaoStream(
  configFront: ProspeccaoConfig,
  onProgress: (evt: ProgressEvent) => void,
): Promise<ProspeccaoResultado> {
  const payload = {
    ...configFront,
    cidades: configFront.cidades ?? (configFront.cidade ? [configFront.cidade] : []),
    ufs: configFront.ufs ?? (configFront.uf ? [configFront.uf] : []),
    cnaes: configFront.cnaes ?? [],
    exigir_contato_acionavel: configFront.exigir_contato_acionavel ?? false,
    priorizar_com_contato: configFront.priorizar_com_contato ?? true,
  };

  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (typeof window !== "undefined") headers["X-Org-Id"] = getTenantKey();

  const res = await fetch(`${API_BASE}/prospeccao/run-stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(errText);
  }

  try {
    return await new Promise<ProspeccaoResultado>((resolve, reject) => {
      const reader = res.body?.getReader();
      if (!reader) { reject(new Error("Sem body na resposta SSE")); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let resolved = false;

      function processLines(lines: string[]): boolean {
        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.stage) {
                onProgress(parsed as ProgressEvent);
              } else if (parsed.detail && !parsed.empresas) {
                reject(new Error(parsed.detail));
                return true;
              } else if (parsed.empresas !== undefined) {
                resolved = true;
                const data = parsed as ProspeccaoResultado;
                void salvarResultadoLocal({
                  timestamp: new Date().toISOString(),
                  config: configFront,
                  resultado: data,
                }).catch((err) => {
                  console.error("[Hermes] Falha ao persistir resultado da prospecção:", err);
                });
                resolve(data);
                return true;
              }
            } catch {
              // ignore malformed SSE lines and keep streaming
            }
          }
        }
        return false;
      }

      function pump(): void {
        reader!.read().then(({ done, value }) => {
          if (value) {
            buffer += decoder.decode(value, { stream: !done });
          }
          const lines = buffer.split("\n");
          buffer = done ? "" : (lines.pop() || "");

          if (processLines(lines)) return;

          if (done) {
            if (buffer) processLines([buffer]);
            if (!resolved) reject(new Error("Stream encerrado sem resultado"));
            return;
          }
          pump();
        }).catch((err) => {
          if (!resolved) reject(err);
        });
      }
      pump();
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (msg === "Stream encerrado sem resultado" || msg === "Sem body na resposta SSE") {
      onProgress({ stage: "processing", current: 0, total: 0, detail: "Reconectando via modo compatível..." });
      console.warn("[Hermes] SSE indisponível, executando fallback em /prospeccao/run");
      return runProspeccao(configFront);
    }
    throw err;
  }
}

export async function consultarAssertivaCnpj(
  cnpj: string,
  idFinalidade = 5,
): Promise<AssertivaCnpjData> {
  const resp = await hermesFetch<{ success?: boolean; data?: AssertivaCnpjData; detail?: string }>(
    "/prospeccao/assertiva/cnpj",
    {
      method: "POST",
      body: JSON.stringify({ cnpj, id_finalidade: idFinalidade }),
    },
  );
  if (!resp?.data) {
    throw new Error(resp?.detail || "Resposta inválida da Assertiva.");
  }
  return resp.data;
}

export async function consultarAssertivaDecisoresCnpj(
  cnpj: string,
  idFinalidade = 5,
  maxDecisores?: number,
): Promise<AssertivaDecisoresData> {
  const payload: Record<string, unknown> = { cnpj, id_finalidade: idFinalidade };
  if (typeof maxDecisores === "number") payload.max_decisores = maxDecisores;
  const resp = await hermesFetch<{ success?: boolean; data?: AssertivaDecisoresData; detail?: string }>(
    "/prospeccao/assertiva/decisores/cnpj",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  if (!resp?.data) {
    throw new Error(resp?.detail || "Resposta inválida da Assertiva (decisores).");
  }
  return resp.data;
}

export async function getResultados(): Promise<ResultadoSalvo | null> {
  try {
    const remoto = await hermesFetch<(ResultadoSalvo & { execucao?: ExecucaoResumo | null }) | null>("/prospeccao/resultado-atual");
    if (remoto?.resultado) {
      await salvarResultadoLocal({
        timestamp: remoto.timestamp,
        config: remoto.config,
        resultado: remoto.resultado,
      });
      return remoto;
    }
  } catch {
    // fallback local
  }

  return await lerResultadoLocal();
}

function buildExecucaoResumo(ultimo: ResultadoSalvo, id = 1): ExecucaoResumo {
  return {
    id,
    timestamp: ultimo.timestamp,
    termo: ultimo.config.termo_base,
    cidade: ultimo.config.cidade,
    uf: ultimo.config.uf,
    total_empresas: ultimo.resultado.total_empresas,
    filtros_icp: ultimo.resultado.filtros_icp,
    enriquecimento_web: ultimo.resultado.enriquecimento_web,
  };
}

export async function getExecucoes(): Promise<ExecucaoResumo[]> {
  try {
    const execucoes = await hermesFetch<ExecucaoResumo[]>("/prospeccao/execucoes");
    if (Array.isArray(execucoes) && execucoes.length > 0) return execucoes;
  } catch {
    // fallback local
  }

  const ultimo = await lerResultadoLocal();
  return ultimo ? [buildExecucaoResumo(ultimo)] : [];
}

export async function getHistoricoExecucoes(): Promise<ExecucaoResumo[]> {
  return getExecucoes();
}

export async function getResultadosUltimaExecucao(): Promise<UltimaExecucaoPayload> {
  try {
    const payload = await hermesFetch<UltimaExecucaoPayload>("/prospeccao/ultima-execucao");
    if (payload?.execucao || (payload?.resultados?.length ?? 0) > 0) {
      const remoto = await getResultados();
      if (remoto?.resultado) {
        return {
          execucao: payload.execucao ?? buildExecucaoResumo(remoto),
          resultados: payload.resultados,
        };
      }
      return payload;
    }
  } catch {
    // fallback local
  }

  const ultimo = await lerResultadoLocal();

  if (!ultimo) return { execucao: null, resultados: [] };

  const execucao = buildExecucaoResumo(ultimo);

  return { execucao, resultados: ultimo.resultado.empresas };
}

// ------------------------
// DASHBOARD (LOCAL) – KPIs
// ------------------------

function classificarSegmento(emp: Empresa): string {
  const cnae = (emp.cnae_principal || "").trim();
  const nome = ((emp.razao_social || "") + " " + (emp.nome_fantasia || "")).toUpperCase();

  if (cnae.startsWith("8610")) return "Hospitais";
  if (cnae.startsWith("8640")) {
    if (nome.includes("LABORATÓRIO") || nome.includes("LABORATORIO")) return "Laboratórios";
    return "Clínicas";
  }
  if (cnae.startsWith("4711") || cnae.startsWith("4712")) return "Supermercados";
  if (cnae.startsWith("4771")) return "Farmácias";
  if (cnae.startsWith("49")) return "Logística";
  if (cnae.startsWith("10") || cnae.startsWith("11") || cnae.startsWith("12")) return "Indústria";
  return "Serviços";
}

function classificarPortePeloCapital(emp: Empresa): "ME" | "EPP" | "Médio" | "Grande" {
  const capital = emp.capital_social ?? 0;
  if (capital <= 100_000) return "ME";
  if (capital <= 400_000) return "EPP";
  if (capital <= 2_000_000) return "Médio";
  return "Grande";
}

function obterPorteParaDashboard(emp: Empresa): string {
  if (emp.porte && emp.porte.trim() !== "") return emp.porte;
  return classificarPortePeloCapital(emp);
}

function calcularScoreICP(emp: Empresa): number {
  if (typeof emp.score_icp === "number") return Number(emp.score_icp.toFixed(1));

  let score = 10;

  const capital = emp.capital_social ?? 0;
  if (capital > 2_000_000) score += 50;
  else if (capital > 800_000) score += 30;
  else if (capital > 200_000) score += 10;

  if (emp.email || emp.email_enriquecido) score += 15;

  const temContato =
    emp.telefone_padrao ||
    emp.telefone_receita ||
    emp.telefone_estab1 ||
    emp.telefone_estab2 ||
    emp.telefone_enriquecido ||
    emp.whatsapp_enriquecido ||
    emp.whatsapp_publico;

  if (temContato) score += 15;

  score = Math.max(0, Math.min(100, score));
  return Number(score.toFixed(1));
}

export async function getDashboardUltimaExecucao(): Promise<DashboardData | null> {
  const ultimo = await getResultados();
  if (!ultimo) return null;

  const empresas = ultimo.resultado.empresas;
  const total = empresas.length;

  const empty: DashboardData = {
    total_empresas: 0, empresas_enriquecidas: 0,
    taxa_email: 0, taxa_whatsapp: 0, com_linkedin: 0, com_site: 0,
    capital_medio: 0, capital_total: 0, score_medio: 0, pib_medio: 0,
    empresas_por_uf: [], empresas_por_segmento: [], empresas_por_porte: [],
    score_distribuicao: [], capital_faixas: [], canais_contato: [], top_empresas: [],
  };
  if (!total) return empty;

  let comEmail = 0, comContato = 0, comLinkedin = 0, comSite = 0;
  let somaCapital = 0, countCapital = 0, somaScore = 0, somaPib = 0, countPib = 0;
  const scoreSlots = [0, 0, 0, 0]; // 0-25, 25-50, 50-75, 75-100
  const capSlots   = [0, 0, 0, 0, 0]; // <50k, 50-200k, 200k-1M, 1-5M, >5M

  const porUF: Record<string, number> = {};
  const porSegmento: Record<string, number> = {};
  const porPorte: Record<string, number> = {};
  const topEmpresas: DashboardTopEmpresa[] = [];

  for (const emp of empresas) {
    if (emp.email || emp.email_enriquecido) comEmail++;

    const temTel = emp.telefone_padrao || emp.telefone_receita ||
      emp.telefone_estab1 || emp.telefone_estab2 || emp.telefone_enriquecido;
    const temWA  = emp.whatsapp_enriquecido || emp.whatsapp_publico;
    if (temTel || temWA) comContato++;
    if (emp.site) comSite++;

    // LinkedIn — procura em redes e outras_informacoes
    const redesLinks = [
      ...(emp.redes_sociais_empresa ?? []),
      ...(emp.redes_sociais_socios?.flatMap(s => s.links) ?? []),
    ];
    const infoLinks = (emp.outras_informacoes ?? "").match(/(https?:\/\/[^\s,]+)/g) ?? [];
    if ([...redesLinks, ...infoLinks].some(l => /linkedin/i.test(l))) comLinkedin++;

    if (emp.capital_social != null) {
      somaCapital += emp.capital_social; countCapital++;
      const c = emp.capital_social;
      if      (c < 50_000)       capSlots[0]++;
      else if (c < 200_000)      capSlots[1]++;
      else if (c < 1_000_000)    capSlots[2]++;
      else if (c < 5_000_000)    capSlots[3]++;
      else                        capSlots[4]++;
    }

    if (emp.sidra_pib != null) { somaPib += emp.sidra_pib; countPib++; }

    const uf      = emp.uf || "N/I";
    const segmento = emp.segmento || classificarSegmento(emp);
    const porte   = obterPorteParaDashboard(emp);
    porUF[uf]           = (porUF[uf] || 0) + 1;
    porSegmento[segmento] = (porSegmento[segmento] || 0) + 1;
    porPorte[porte]     = (porPorte[porte] || 0) + 1;

    const score = calcularScoreICP(emp);
    somaScore += score;
    const si = Math.min(3, Math.floor(score / 25));
    scoreSlots[si]++;

    topEmpresas.push({
      cnpj: emp.cnpj,
      razao_social: emp.razao_social,
      nome_fantasia: emp.nome_fantasia,
      cidade: emp.cidade, uf: emp.uf,
      segmento, score_icp: score,
      telefone_padrao: emp.telefone_padrao,
      email: emp.email || emp.email_enriquecido,
      whatsapp_publico: emp.whatsapp_publico,
      whatsapp_enriquecido: emp.whatsapp_enriquecido,
      site: emp.site,
    });
  }

  const empresas_enriquecidas = empresas.filter(
    e => e.email_enriquecido || e.telefone_enriquecido || e.whatsapp_enriquecido || e.site
  ).length;

  const pct = (n: number) => Number(((n / total) * 100).toFixed(1));

  topEmpresas.sort((a, b) => b.score_icp - a.score_icp);

  return {
    total_empresas: total,
    empresas_enriquecidas,
    taxa_email:    pct(comEmail),
    taxa_whatsapp: pct(comContato),
    com_linkedin:  comLinkedin,
    com_site:      comSite,
    capital_medio: countCapital > 0 ? somaCapital / countCapital : 0,
    capital_total: somaCapital,
    score_medio:   Number((somaScore / total).toFixed(1)),
    pib_medio:     countPib > 0 ? somaPib / countPib : 0,

    empresas_por_uf: Object.entries(porUF)
      .map(([uf, t]) => ({ uf, total: t })).sort((a, b) => b.total - a.total),
    empresas_por_segmento: Object.entries(porSegmento)
      .map(([segmento, t]) => ({ segmento, total: t })).sort((a, b) => b.total - a.total),
    empresas_por_porte: Object.entries(porPorte)
      .map(([porte, t]) => ({ porte, total: t })).sort((a, b) => b.total - a.total),

    score_distribuicao: [
      { label: "0–25",  min:  0, max: 25,  count: scoreSlots[0], color: "#ef4444" },
      { label: "25–50", min: 25, max: 50,  count: scoreSlots[1], color: "#f59e0b" },
      { label: "50–75", min: 50, max: 75,  count: scoreSlots[2], color: "#3b82f6" },
      { label: "75–100",min: 75, max: 100, count: scoreSlots[3], color: "#10b981" },
    ],

    capital_faixas: [
      { label: "< 50K",     count: capSlots[0] },
      { label: "50K–200K",  count: capSlots[1] },
      { label: "200K–1M",   count: capSlots[2] },
      { label: "1M–5M",     count: capSlots[3] },
      { label: "> 5M",      count: capSlots[4] },
    ],

    canais_contato: [
      { canal: "E-mail",    total: comEmail,    pct: pct(comEmail)    },
      { canal: "Telefone",  total: comContato,  pct: pct(comContato)  },
      { canal: "WhatsApp",  total: empresas.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido).length, pct: pct(empresas.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido).length) },
      { canal: "LinkedIn",  total: comLinkedin, pct: pct(comLinkedin) },
      { canal: "Site",      total: comSite,     pct: pct(comSite)     },
    ],

    top_empresas: topEmpresas.slice(0, 8),

    execucao_ts:     ultimo.timestamp,
    execucao_cidade: ultimo.config?.cidade,
    execucao_uf:     ultimo.config?.uf,
  };
}

// ------------------------
// MAPA DE CALOR
// ------------------------

export async function gerarMapaCalor(filtros: MapaCalorConfig): Promise<MapaCalorResponse> {
  return await hermesFetch<MapaCalorResponse>("/mapa-calor", {
    method: "POST",
    body: JSON.stringify(filtros),
  });
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE  (Supabase via FastAPI)
// ═══════════════════════════════════════════════════════════════

export type EstagioLead =
  | "novo"
  | "em_analise"
  | "contactado"
  | "qualificado"
  | "descartado";

export type PipelineLeadRow = {
  id: string;
  org_id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  estagio: EstagioLead;
  score_icp: number;
  email: string | null;
  telefone: string | null;
  telefone_receita: string | null;
  telefone_estab1: string | null;
  telefone_estab2: string | null;
  whatsapp: string | null;
  whatsapp_enriquecido: string | null;
  site: string | null;
  cidade: string | null;
  uf: string | null;
  segmento: string | null;
  porte: string | null;
  capital_social: number | null;
  cnae_principal: string | null;
  cnae_descricao: string | null;
  socios_resumo: string | null;
  email_enriquecido: string | null;
  telefone_enriquecido: string | null;
  nota: string;
  sdr_status: string | null;
  sdr_enviado_em: string | null;
  ploomes_contact_id: number | null;
  ploomes_synced: boolean;
  empresa_data: Record<string, unknown> | null;
  adicionado_em: string;
  atualizado_em: string;
};

export type LeadPipeline = {
  id: string;
  empresa: Empresa;
  estagio: EstagioLead;
  adicionadoEm: string;
  atualizadoEm: string;
  nota: string;
  score_icp: number;
  sdr_status?: string | null;
  sdr_enviado_em?: string | null;
  ploomes_synced?: boolean;
};

function rowToLeadPipeline(row: PipelineLeadRow): LeadPipeline {
  const empresa: Empresa = {
    cnpj: row.cnpj,
    razao_social: row.razao_social,
    nome_fantasia: row.nome_fantasia,
    email: row.email,
    telefone_padrao: row.telefone,
    telefone_receita: row.telefone_receita,
    telefone_estab1: row.telefone_estab1,
    telefone_estab2: row.telefone_estab2,
    whatsapp_publico: row.whatsapp,
    whatsapp_enriquecido: row.whatsapp_enriquecido,
    site: row.site,
    cidade: row.cidade,
    uf: row.uf,
    segmento: row.segmento,
    porte: row.porte,
    capital_social: row.capital_social,
    cnae_principal: row.cnae_principal,
    cnae_descricao: row.cnae_descricao,
    socios_resumo: row.socios_resumo,
    email_enriquecido: row.email_enriquecido,
    telefone_enriquecido: row.telefone_enriquecido,
    score_icp: row.score_icp,
    ...(row.empresa_data as Record<string, unknown> ?? {}),
  };
  return {
    id: row.cnpj,
    empresa,
    estagio: row.estagio,
    adicionadoEm: row.adicionado_em,
    atualizadoEm: row.atualizado_em,
    nota: row.nota || "",
    score_icp: row.score_icp ?? 0,
    sdr_status: row.sdr_status,
    sdr_enviado_em: row.sdr_enviado_em,
    ploomes_synced: row.ploomes_synced,
  };
}

export async function getPipeline(estagio?: EstagioLead): Promise<LeadPipeline[]> {
  const qs = estagio ? `?estagio=${estagio}` : "";
  const rows = await hermesFetch<PipelineLeadRow[]>(`/pipeline${qs}`);
  return rows.map(rowToLeadPipeline);
}

function empresaToPipelinePayload(empresa: Empresa, scoreIcp: number) {
  return {
    cnpj: empresa.cnpj,
    razao_social: empresa.razao_social,
    nome_fantasia: empresa.nome_fantasia,
    email: empresa.email,
    telefone: empresa.telefone_padrao,
    telefone_receita: empresa.telefone_receita,
    telefone_estab1: empresa.telefone_estab1,
    telefone_estab2: empresa.telefone_estab2,
    whatsapp: empresa.whatsapp_publico,
    whatsapp_enriquecido: empresa.whatsapp_enriquecido,
    site: empresa.site,
    cidade: empresa.cidade,
    uf: empresa.uf,
    segmento: empresa.segmento,
    porte: empresa.porte,
    capital_social: empresa.capital_social,
    cnae_principal: empresa.cnae_principal,
    cnae_descricao: empresa.cnae_descricao,
    socios_resumo: empresa.socios_resumo,
    email_enriquecido: empresa.email_enriquecido,
    telefone_enriquecido: empresa.telefone_enriquecido,
    score_icp: scoreIcp,
  };
}

export async function addToPipeline(
  empresa: Empresa,
  scoreIcp = 0,
  opts?: {
    autoEnviarSdr?: boolean;
    createPloomesDeal?: boolean;
  }
): Promise<{ status: "added" | "exists"; sdr_auto_enviado?: boolean; sdr_result?: { enviados: number; descartados_sem_contato?: number; descartados_ja_enviados?: number } }> {
  const res = await hermesFetch<{
    status: "added" | "exists";
    sdr_auto_enviado?: boolean;
    sdr_result?: { enviados: number; descartados_sem_contato?: number; descartados_ja_enviados?: number };
  }>("/pipeline", {
    method: "POST",
    body: JSON.stringify({
      empresa: empresaToPipelinePayload(empresa, scoreIcp),
      estagio: "novo",
      nota: "",
      auto_enviar_sdr: opts?.autoEnviarSdr ?? false,
      create_ploomes_deal: opts?.createPloomesDeal ?? true,
    }),
  });
  return res;
}

export async function addBatchToPipeline(
  empresas: { empresa: Empresa; scoreIcp: number }[],
  opts?: {
    autoEnviarSdr?: boolean;
    createPloomesDeal?: boolean;
  }
): Promise<{
  total: number;
  added: number;
  sdr_auto_enviados?: number;
  results?: Array<{
    cnpj: string;
    status: "added" | "exists" | "error";
    sdr_auto_enviado?: boolean;
    sdr_result?: {
      enviados: number;
      descartados_sem_contato?: number;
      descartados_ja_enviados?: number;
    };
    detail?: string;
  }>;
}> {
  const payload = empresas.map(({ empresa, scoreIcp }) => ({
    empresa: empresaToPipelinePayload(empresa, scoreIcp),
    estagio: "novo",
    nota: "",
    auto_enviar_sdr: opts?.autoEnviarSdr ?? false,
    create_ploomes_deal: opts?.createPloomesDeal ?? true,
  }));
  return hermesFetch("/pipeline/batch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function moveLeadPipeline(cnpj: string, estagio: EstagioLead): Promise<void> {
  await hermesFetch(`/pipeline/${encodeURIComponent(cnpj)}/estagio`, {
    method: "PATCH",
    body: JSON.stringify({ estagio }),
  });
}

export async function updateLeadNota(cnpj: string, nota: string): Promise<void> {
  await hermesFetch(`/pipeline/${encodeURIComponent(cnpj)}/nota`, {
    method: "PATCH",
    body: JSON.stringify({ nota }),
  });
}

export async function removeFromPipeline(cnpj: string): Promise<void> {
  await hermesFetch(`/pipeline/${encodeURIComponent(cnpj)}`, {
    method: "DELETE",
  });
}

export async function enviarParaSDR(
  cnpjs: string[]
): Promise<{ enviados: number; total_solicitados: number }> {
  return hermesFetch("/pipeline/enviar-sdr", {
    method: "POST",
    body: JSON.stringify({ cnpjs }),
  });
}

export async function traduzirQueryEmFiltros(
  query: string,
  defaults?: Partial<ProspeccaoConfig>,
): Promise<QueryTranslationResult> {
  const raw = await hermesFetch<Record<string, unknown>>("/prospeccao/translate-query", {
    method: "POST",
    body: JSON.stringify({
      query,
      defaults: defaults ?? null,
    }),
  });

  return {
    query: asNullableString(raw.query) ?? query,
    source: ((asNullableString(raw.source) as QueryTranslationResult["source"] | null) ?? "heuristic"),
    config: ((asRecord(raw.config) ?? {}) as unknown) as ProspeccaoConfig,
    highlights: asArray<string>(raw.highlights).map((item) => String(item)),
    warnings: asArray<string>(raw.warnings).map((item) => String(item)),
  };
}

// ═══════════════════════════════════════════════════════════════
// LEAD REGISTRY (listas salvas + supressão)
// ═══════════════════════════════════════════════════════════════

export type LeadListSummary = {
  id: string;
  name: string;
  description?: string | null;
  item_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  last_item_added_at?: string | null;
};

export type LeadListItem = {
  id: string;
  cnpj: string;
  score_icp?: number | null;
  source?: string | null;
  added_at?: string | null;
  empresa: Empresa;
};

export type LeadSuppression = {
  id: string;
  cnpj?: string | null;
  email?: string | null;
  domain?: string | null;
  reason?: string | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SavedSearchSummary = {
  id: string;
  kind: "search" | "dynamic";
  name: string;
  description?: string | null;
  config: ProspeccaoConfig;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_run_at?: string | null;
};

export type WatchCompanySnapshot = {
  has_site?: boolean;
  has_email?: boolean;
  has_phone?: boolean;
  has_whatsapp?: boolean;
  has_whatsapp_validated?: boolean;
  has_linkedin_company?: boolean;
  decision_makers?: number;
  total_contact_emails?: number;
  deliverable_emails?: number;
  public_email_count?: number;
  generic_inbox_count?: number;
  whatsapp_candidates?: number;
  validated_whatsapp_candidates?: number;
  email_pattern?: string | null;
};

export type WatchCompany = {
  id: string;
  cnpj: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cidade?: string | null;
  uf?: string | null;
  reason?: string | null;
  source?: string | null;
  snapshot: WatchCompanySnapshot;
  created_at?: string | null;
  updated_at?: string | null;
  last_signal_at?: string | null;
  last_refresh_at?: string | null;
  signal_count: number;
  last_signal_event_at?: string | null;
};

export type CompanySignal = {
  id: string;
  watch_id?: string | null;
  cnpj: string;
  signal_type: string;
  title: string;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type LeadRefreshJobOptions = {
  probe_smtp?: boolean;
  refresh_external_signals?: boolean;
  refresh_enrichment?: boolean;
  refresh_contact_intelligence?: boolean;
  sync_watchlist?: boolean;
};

export type LeadRefreshJob = {
  id: string;
  name: string;
  source_kind: string;
  source_ref?: string | null;
  source_label?: string | null;
  status: string;
  options: LeadRefreshJobOptions;
  total_targets: number;
  processed_targets: number;
  success_targets: number;
  failed_targets: number;
  queued_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
  error?: string | null;
  rq_job_id?: string | null;
};

export type LeadRefreshJobTarget = {
  id: string;
  cnpj: string;
  source_kind: string;
  status: string;
  stage?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
};

export type LeadRefreshState = {
  id: string;
  cnpj: string;
  source_kind?: string | null;
  source_ref?: string | null;
  last_job_id?: string | null;
  freshness_status?: string | null;
  summary?: WatchCompanySnapshot | null;
  last_error?: string | null;
  last_refresh_at?: string | null;
  last_enriched_at?: string | null;
  last_contact_refresh_at?: string | null;
  last_verified_at?: string | null;
  next_refresh_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function mapLeadListItem(raw: Record<string, unknown>): LeadListItem {
  return {
    id: asNullableString(raw.id) ?? "",
    cnpj: asNullableString(raw.cnpj) ?? "",
    score_icp: asNullableNumber(raw.score_icp),
    source: asNullableString(raw.source),
    added_at: asNullableString(raw.added_at),
    empresa: mapEmpresaApi(asRecord(raw.empresa) ?? {}),
  };
}

function mapSavedSearch(raw: Record<string, unknown>): SavedSearchSummary {
  const kind = asNullableString(raw.kind) === "dynamic" ? "dynamic" : "search";
  return {
    id: asNullableString(raw.id) ?? "",
    kind,
    name: asNullableString(raw.name) ?? "",
    description: asNullableString(raw.description),
    config: ((asRecord(raw.config) ?? {}) as unknown) as ProspeccaoConfig,
    source: asNullableString(raw.source),
    created_at: asNullableString(raw.created_at),
    updated_at: asNullableString(raw.updated_at),
    last_run_at: asNullableString(raw.last_run_at),
  };
}

function mapWatchCompany(raw: Record<string, unknown>): WatchCompany {
  const snapshot = asRecord(raw.snapshot) ?? {};
  return {
    id: asNullableString(raw.id) ?? "",
    cnpj: asNullableString(raw.cnpj) ?? "",
    razao_social: asNullableString(raw.razao_social),
    nome_fantasia: asNullableString(raw.nome_fantasia),
    cidade: asNullableString(raw.cidade),
    uf: asNullableString(raw.uf),
    reason: asNullableString(raw.reason),
    source: asNullableString(raw.source),
    snapshot: {
      has_site: !!snapshot.has_site,
      has_email: !!snapshot.has_email,
      has_phone: !!snapshot.has_phone,
      has_whatsapp: !!snapshot.has_whatsapp,
      has_whatsapp_validated: !!snapshot.has_whatsapp_validated,
      has_linkedin_company: !!snapshot.has_linkedin_company,
      decision_makers: asNullableNumber(snapshot.decision_makers) ?? 0,
      total_contact_emails: asNullableNumber(snapshot.total_contact_emails) ?? 0,
      deliverable_emails: asNullableNumber(snapshot.deliverable_emails) ?? 0,
      public_email_count: asNullableNumber(snapshot.public_email_count) ?? 0,
      generic_inbox_count: asNullableNumber(snapshot.generic_inbox_count) ?? 0,
      whatsapp_candidates: asNullableNumber(snapshot.whatsapp_candidates) ?? 0,
      validated_whatsapp_candidates: asNullableNumber(snapshot.validated_whatsapp_candidates) ?? 0,
      email_pattern: asNullableString(snapshot.email_pattern),
    },
    created_at: asNullableString(raw.created_at),
    updated_at: asNullableString(raw.updated_at),
    last_signal_at: asNullableString(raw.last_signal_at),
    last_refresh_at: asNullableString(raw.last_refresh_at),
    signal_count: asNullableNumber(raw.signal_count) ?? 0,
    last_signal_event_at: asNullableString(raw.last_signal_event_at),
  };
}

function mapCompanySignal(raw: Record<string, unknown>): CompanySignal {
  return {
    id: asNullableString(raw.id) ?? "",
    watch_id: asNullableString(raw.watch_id),
    cnpj: asNullableString(raw.cnpj) ?? "",
    signal_type: asNullableString(raw.signal_type) ?? "",
    title: asNullableString(raw.title) ?? "",
    payload: asRecord(raw.payload),
    created_at: asNullableString(raw.created_at),
  };
}

function mapLeadRefreshJob(raw: Record<string, unknown>): LeadRefreshJob {
  return {
    id: asNullableString(raw.id) ?? "",
    name: asNullableString(raw.name) ?? "",
    source_kind: asNullableString(raw.source_kind) ?? "manual",
    source_ref: asNullableString(raw.source_ref),
    source_label: asNullableString(raw.source_label),
    status: asNullableString(raw.status) ?? "queued",
    options: (asRecord(raw.options) as LeadRefreshJobOptions | null) ?? {},
    total_targets: asNullableNumber(raw.total_targets) ?? 0,
    processed_targets: asNullableNumber(raw.processed_targets) ?? 0,
    success_targets: asNullableNumber(raw.success_targets) ?? 0,
    failed_targets: asNullableNumber(raw.failed_targets) ?? 0,
    queued_at: asNullableString(raw.queued_at),
    started_at: asNullableString(raw.started_at),
    finished_at: asNullableString(raw.finished_at),
    updated_at: asNullableString(raw.updated_at),
    error: asNullableString(raw.error),
    rq_job_id: asNullableString(raw.rq_job_id),
  };
}

function mapLeadRefreshJobTarget(raw: Record<string, unknown>): LeadRefreshJobTarget {
  return {
    id: asNullableString(raw.id) ?? "",
    cnpj: asNullableString(raw.cnpj) ?? "",
    source_kind: asNullableString(raw.source_kind) ?? "manual",
    status: asNullableString(raw.status) ?? "queued",
    stage: asNullableString(raw.stage),
    payload: asRecord(raw.payload),
    result: asRecord(raw.result),
    error: asNullableString(raw.error),
    created_at: asNullableString(raw.created_at),
    started_at: asNullableString(raw.started_at),
    finished_at: asNullableString(raw.finished_at),
    updated_at: asNullableString(raw.updated_at),
  };
}

function mapLeadRefreshState(raw: Record<string, unknown>): LeadRefreshState {
  const summary = asRecord(raw.summary) ?? {};
  return {
    id: asNullableString(raw.id) ?? "",
    cnpj: asNullableString(raw.cnpj) ?? "",
    source_kind: asNullableString(raw.source_kind),
    source_ref: asNullableString(raw.source_ref),
    last_job_id: asNullableString(raw.last_job_id),
    freshness_status: asNullableString(raw.freshness_status),
    summary: {
      has_site: !!summary.has_site,
      has_email: !!summary.has_email,
      has_phone: !!summary.has_phone,
      has_whatsapp: !!summary.has_whatsapp,
      has_whatsapp_validated: !!summary.has_whatsapp_validated,
      has_linkedin_company: !!summary.has_linkedin_company,
      decision_makers: asNullableNumber(summary.decision_makers) ?? 0,
      total_contact_emails: asNullableNumber(summary.total_contact_emails) ?? 0,
      deliverable_emails: asNullableNumber(summary.deliverable_emails) ?? 0,
      public_email_count: asNullableNumber(summary.public_email_count) ?? 0,
      generic_inbox_count: asNullableNumber(summary.generic_inbox_count) ?? 0,
      whatsapp_candidates: asNullableNumber(summary.whatsapp_candidates) ?? 0,
      validated_whatsapp_candidates: asNullableNumber(summary.validated_whatsapp_candidates) ?? 0,
      email_pattern: asNullableString(summary.email_pattern),
    },
    last_error: asNullableString(raw.last_error),
    last_refresh_at: asNullableString(raw.last_refresh_at),
    last_enriched_at: asNullableString(raw.last_enriched_at),
    last_contact_refresh_at: asNullableString(raw.last_contact_refresh_at),
    last_verified_at: asNullableString(raw.last_verified_at),
    next_refresh_at: asNullableString(raw.next_refresh_at),
    created_at: asNullableString(raw.created_at),
    updated_at: asNullableString(raw.updated_at),
  };
}

export async function getLeadLists(): Promise<LeadListSummary[]> {
  return hermesFetch<LeadListSummary[]>("/lead-lists");
}

export async function createLeadList(
  name: string,
  description?: string | null,
): Promise<LeadListSummary> {
  return hermesFetch<LeadListSummary>("/lead-lists", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function updateLeadList(
  listId: string,
  body: { name?: string; description?: string | null },
): Promise<void> {
  await hermesFetch(`/lead-lists/${encodeURIComponent(listId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteLeadList(listId: string): Promise<void> {
  await hermesFetch(`/lead-lists/${encodeURIComponent(listId)}`, {
    method: "DELETE",
  });
}

export async function getLeadListItems(listId: string): Promise<LeadListItem[]> {
  const rows = await hermesFetch<Record<string, unknown>[]>(
    `/lead-lists/${encodeURIComponent(listId)}/items`,
  );
  return rows.map(mapLeadListItem);
}

export async function addLeadListItems(
  listId: string,
  empresas: { empresa: Empresa; scoreIcp?: number; source?: string }[],
): Promise<{ ok: boolean; added: number; total: number }> {
  return hermesFetch(`/lead-lists/${encodeURIComponent(listId)}/items`, {
    method: "POST",
    body: JSON.stringify({
      items: empresas.map(({ empresa, scoreIcp, source }) => ({
        empresa,
        score_icp: scoreIcp ?? empresa.score_icp ?? 0,
        source: source ?? "results_selection",
      })),
    }),
  });
}

export async function removeLeadListItem(listId: string, cnpj: string): Promise<void> {
  await hermesFetch(
    `/lead-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(normalizeCnpjValue(cnpj))}`,
    {
      method: "DELETE",
    },
  );
}

export async function getLeadSuppressions(): Promise<LeadSuppression[]> {
  return hermesFetch<LeadSuppression[]>("/lead-suppressions");
}

export async function createLeadSuppressions(body: {
  cnpjs?: string[];
  emails?: string[];
  domains?: string[];
  reason?: string | null;
  source?: string | null;
}): Promise<{ ok: boolean; added: number; total: number }> {
  return hermesFetch("/lead-suppressions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function removeLeadSuppression(suppressionId: string): Promise<void> {
  await hermesFetch(`/lead-suppressions/${encodeURIComponent(suppressionId)}`, {
    method: "DELETE",
  });
}

export async function getSavedSearches(kind?: "search" | "dynamic"): Promise<SavedSearchSummary[]> {
  const suffix = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const rows = await hermesFetch<Record<string, unknown>[]>(`/saved-searches${suffix}`);
  return rows.map(mapSavedSearch);
}

export async function createSavedSearch(body: {
  name: string;
  description?: string | null;
  config: ProspeccaoConfig;
  kind?: "search" | "dynamic";
  source?: string | null;
}): Promise<SavedSearchSummary> {
  const raw = await hermesFetch<Record<string, unknown>>("/saved-searches", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapSavedSearch(raw);
}

export async function updateSavedSearch(
  searchId: string,
  body: {
    name?: string;
    description?: string | null;
    config?: ProspeccaoConfig;
    kind?: "search" | "dynamic";
    source?: string | null;
  },
): Promise<void> {
  await hermesFetch(`/saved-searches/${encodeURIComponent(searchId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteSavedSearch(searchId: string): Promise<void> {
  await hermesFetch(`/saved-searches/${encodeURIComponent(searchId)}`, {
    method: "DELETE",
  });
}

export async function previewSavedSearch(searchId: string): Promise<ProspeccaoResultado> {
  return hermesFetch<ProspeccaoResultado>(`/saved-searches/${encodeURIComponent(searchId)}/preview`, {
    method: "POST",
  });
}

export async function getCompanyWatchlist(): Promise<WatchCompany[]> {
  const rows = await hermesFetch<Record<string, unknown>[]>("/company-watchlist");
  return rows.map(mapWatchCompany);
}

export async function followCompany(body: {
  cnpj?: string;
  empresa?: Empresa | null;
  reason?: string | null;
  source?: string | null;
}): Promise<{ watch: WatchCompany; signals: CompanySignal[] }> {
  const raw = await hermesFetch<Record<string, unknown>>("/company-watchlist", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    watch: mapWatchCompany(asRecord(raw.watch) ?? {}),
    signals: asArray<Record<string, unknown>>(raw.signals).map(mapCompanySignal),
  };
}

export async function refreshWatchedCompany(cnpj: string): Promise<{ watch: WatchCompany; signals: CompanySignal[] }> {
  const raw = await hermesFetch<Record<string, unknown>>(
    `/company-watchlist/${encodeURIComponent(normalizeCnpjValue(cnpj))}/refresh`,
    {
      method: "POST",
    },
  );
  return {
    watch: mapWatchCompany(asRecord(raw.watch) ?? {}),
    signals: asArray<Record<string, unknown>>(raw.signals).map(mapCompanySignal),
  };
}

export async function unfollowCompany(cnpj: string): Promise<void> {
  await hermesFetch(`/company-watchlist/${encodeURIComponent(normalizeCnpjValue(cnpj))}`, {
    method: "DELETE",
  });
}

export async function getCompanySignals(opts?: {
  cnpj?: string | null;
  limit?: number;
}): Promise<CompanySignal[]> {
  const params = new URLSearchParams();
  if (opts?.cnpj) params.set("cnpj", normalizeCnpjValue(opts.cnpj));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const rows = await hermesFetch<Record<string, unknown>[]>(`/company-signals${suffix}`);
  return rows.map(mapCompanySignal);
}

export async function getLeadRefreshJobs(limit = 20): Promise<LeadRefreshJob[]> {
  const rows = await hermesFetch<Record<string, unknown>[]>(
    `/lead-refresh-jobs?limit=${Math.max(1, Math.min(limit, 100))}`,
  );
  return rows.map(mapLeadRefreshJob);
}

export async function getLeadRefreshJob(jobId: string): Promise<LeadRefreshJob> {
  const raw = await hermesFetch<Record<string, unknown>>(
    `/lead-refresh-jobs/${encodeURIComponent(jobId)}`,
  );
  return mapLeadRefreshJob(raw);
}

export async function getLeadRefreshJobTargets(
  jobId: string,
  limit = 200,
): Promise<LeadRefreshJobTarget[]> {
  const rows = await hermesFetch<Record<string, unknown>[]>(
    `/lead-refresh-jobs/${encodeURIComponent(jobId)}/targets?limit=${Math.max(1, Math.min(limit, 500))}`,
  );
  return rows.map(mapLeadRefreshJobTarget);
}

export async function getLeadRefreshStates(opts?: {
  dueOnly?: boolean;
  limit?: number;
}): Promise<LeadRefreshState[]> {
  const params = new URLSearchParams();
  if (opts?.dueOnly) params.set("due_only", "true");
  if (opts?.limit) params.set("limit", String(opts.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const rows = await hermesFetch<Record<string, unknown>[]>(`/lead-refresh-states${suffix}`);
  return rows.map(mapLeadRefreshState);
}

export async function getCompanyDataHealth(limit = 20): Promise<CompanyDataHealth> {
  const raw = await hermesFetch<Record<string, unknown>>(
    `/company-data-health?limit=${Math.max(1, Math.min(limit, 50))}`,
  );
  const summary = asRecord(raw.summary) ?? {};
  return {
    summary: {
      watchlist_total: asNullableNumber(summary.watchlist_total) ?? 0,
      without_mobile: asNullableNumber(summary.without_mobile) ?? 0,
      without_verified_whatsapp: asNullableNumber(summary.without_verified_whatsapp) ?? 0,
      without_decision_maker_mobile: asNullableNumber(summary.without_decision_maker_mobile) ?? 0,
      stale_records: asNullableNumber(summary.stale_records) ?? 0,
    },
    items: asArray<Record<string, unknown>>(raw.items).map((item) => ({
      cnpj: asNullableString(item.cnpj) ?? "",
      razao_social: asNullableString(item.razao_social),
      nome_fantasia: asNullableString(item.nome_fantasia),
      cidade: asNullableString(item.cidade),
      uf: asNullableString(item.uf),
      mobile_candidates: asNullableNumber(item.mobile_candidates) ?? 0,
      verified_whatsapp_candidates: asNullableNumber(item.verified_whatsapp_candidates) ?? 0,
      decision_maker_mobile_candidates: asNullableNumber(item.decision_maker_mobile_candidates) ?? 0,
      stale: typeof item.stale === "boolean" ? item.stale : Boolean(item.stale),
      generated_at: asNullableString(item.generated_at),
      gap_score: asNullableNumber(item.gap_score) ?? 0,
    })).filter((item) => item.cnpj),
  };
}

export async function createLeadRefreshJob(body: {
  source_kind: "manual" | "lead_list" | "watchlist" | "saved_search";
  source_ref?: string | null;
  cnpjs?: string[];
  name?: string | null;
  limit_targets?: number;
  probe_smtp?: boolean;
  refresh_external_signals?: boolean;
}): Promise<LeadRefreshJob> {
  const raw = await hermesFetch<Record<string, unknown>>("/lead-refresh-jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapLeadRefreshJob(raw);
}

// ═══════════════════════════════════════════════════════════════
// HISTÓRICO LOCAL (múltiplas buscas salvas)
// ═══════════════════════════════════════════════════════════════

const HIST_LIMIT = 20;

export type BuscaSalva = {
  id: string;
  nome?: string;
  timestamp: string;
  config: ProspeccaoConfig;
  resultado: {
    total_empresas: number;
    empresas?: Empresa[];
  };
  metricas: {
    score_medio: number;
    taxa_email: number;
    taxa_whatsapp: number;
    capital_medio: number;
    enriquecidas: number;
  };
};

export function getHistoricoLocal(): BuscaSalva[] {
  try {
    const raw = localStorage.getItem(getStorageKey("buscas"));
    return raw ? (JSON.parse(raw) as BuscaSalva[]) : [];
  } catch { return []; }
}

export function salvarBuscaHistorico(config: ProspeccaoConfig, resultado: { total_empresas: number; empresas: Empresa[] }) {
  const existentes = getHistoricoLocal();
  const empresas = resultado.empresas ?? [];
  const t = empresas.length || 1;

  const novaEntrada: BuscaSalva = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    config,
    // Histórico usa apenas métricas e resumo; não persiste a lista inteira para evitar estouro de quota.
    resultado: { total_empresas: resultado.total_empresas },
    metricas: {
      score_medio: Number((empresas.reduce((s, e) => s + (e.score_icp ?? 0), 0) / t).toFixed(1)),
      taxa_email: Number(((empresas.filter(e => e.email || e.email_enriquecido).length / t) * 100).toFixed(1)),
      taxa_whatsapp: Number(((empresas.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido).length / t) * 100).toFixed(1)),
      capital_medio: empresas.reduce((s, e) => s + (e.capital_social ?? 0), 0) / t,
      enriquecidas: empresas.filter(e => e.site || e.email_enriquecido || e.whatsapp_enriquecido).length,
    },
  };

  const atualizado = [novaEntrada, ...existentes].slice(0, HIST_LIMIT);
  localStorage.setItem(getStorageKey("buscas"), JSON.stringify(atualizado));
  return novaEntrada;
}

export function renomearBusca(id: string, nome: string) {
  const hist = getHistoricoLocal().map(b => b.id === id ? { ...b, nome } : b);
  localStorage.setItem(getStorageKey("buscas"), JSON.stringify(hist));
}

export function deletarBusca(id: string) {
  localStorage.setItem(getStorageKey("buscas"), JSON.stringify(getHistoricoLocal().filter(b => b.id !== id)));
}

export async function getHistoricoBuscas(): Promise<BuscaSalva[]> {
  try {
    const remoto = await hermesFetch<BuscaSalva[]>("/prospeccao/historico");
    if (Array.isArray(remoto) && remoto.length > 0 && typeof window !== "undefined") {
      localStorage.setItem(getStorageKey("buscas"), JSON.stringify(remoto));
    }
    if (Array.isArray(remoto) && remoto.length > 0) return remoto;
  } catch {
    // fallback local
  }
  return getHistoricoLocal();
}

export async function renomearBuscaHistorico(id: string, nome: string): Promise<void> {
  try {
    await hermesFetch("/prospeccao/historico/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify({ nome }),
    });
  } catch {
    renomearBusca(id, nome);
    return;
  }
  renomearBusca(id, nome);
}

export async function deletarBuscaHistorico(id: string): Promise<void> {
  try {
    await hermesFetch("/prospeccao/historico/" + encodeURIComponent(id), {
      method: "DELETE",
    });
  } catch {
    deletarBusca(id);
    return;
  }
  deletarBusca(id);
}

// ═══════════════════════════════════════════════════════════════
// GERAÇÃO DE MENSAGENS (backend ou template)
// ═══════════════════════════════════════════════════════════════

export type CanalMensagem = "whatsapp" | "email" | "linkedin";

export type MensagemAbordagem = {
  canal: CanalMensagem;
  assunto?: string;
  corpo: string;
  ia: boolean;
};

export async function gerarMensagemAbordagem(
  empresa: Empresa,
  canal: CanalMensagem,
  produto?: string
): Promise<MensagemAbordagem> {
  try {
    const resp = await hermesFetch<MensagemAbordagem>("/prospeccao/gerar-mensagem", {
      method: "POST",
      body: JSON.stringify({
        empresa: {
          razao_social: empresa.razao_social,
          nome_fantasia: empresa.nome_fantasia,
          cidade: empresa.cidade,
          uf: empresa.uf,
          segmento: empresa.segmento,
          porte: empresa.porte,
          capital_social: empresa.capital_social,
          cnae_descricao: empresa.cnae_descricao,
          socios_resumo: empresa.socios_resumo,
          site: empresa.site,
        },
        canal,
        produto: produto || "",
      }),
    });
    return resp;
  } catch {
    return gerarMensagemTemplate(empresa, canal, produto);
  }
}

// ------------------------
// ORG INTEGRATIONS (Kommo via n8n webhook)
// ------------------------

export type KommoIntegration = {
  kommo_webhook: string | null;
  kommo_pipeline_id: number | null;
  kommo_status_id: number | null;
};

export async function getKommoIntegration(orgId: string): Promise<KommoIntegration> {
  return apiFetch<KommoIntegration>(`/orgs/${encodeURIComponent(orgId)}/integrations/kommo`, {
    skipOrgHeader: true,
  });
}

export async function setKommoIntegration(orgId: string, data: KommoIntegration): Promise<KommoIntegration> {
  return apiFetch<KommoIntegration>(`/orgs/${encodeURIComponent(orgId)}/integrations/kommo`, {
    method: "PUT",
    skipOrgHeader: true,
    body: JSON.stringify(data),
  });
}

function gerarMensagemTemplate(
  empresa: Empresa,
  canal: CanalMensagem,
  produto?: string
): MensagemAbordagem {
  const nome = empresa.nome_fantasia || empresa.razao_social;
  const cidade = empresa.cidade ? ` em ${empresa.cidade}` : "";
  const prod = produto || "nossa solução";

  if (canal === "whatsapp") {
    return {
      canal,
      corpo: `Olá! Tudo bem?\n\nSou [Seu nome] da [Sua empresa]. Vi que vocês atuam no segmento de ${empresa.segmento ?? "mercado"}${cidade} e acredito que ${prod} pode fazer sentido para a ${nome}.\n\nPodemos conversar rapidinho? 🙂`,
      ia: false,
    };
  }

  if (canal === "email") {
    return {
      canal,
      assunto: `${nome} × [Sua empresa] — proposta rápida`,
      corpo: `Olá,\n\nMeu nome é [Seu nome] e trabalho na [Sua empresa].\n\nIdentificamos que a ${nome} atua no segmento de ${empresa.segmento ?? "mercado"}${cidade} — exatamente o perfil de empresas que se beneficia de ${prod}.\n\nPodemos agendar 15 minutos esta semana para eu mostrar como isso funciona na prática?\n\nAtenciosamente,\n[Seu nome]\n[Contato]`,
      ia: false,
    };
  }

  return {
    canal,
    corpo: `Olá! Trabalho na [Sua empresa] e vi que vocês (${nome}) atuam no setor de ${empresa.segmento ?? "mercado"}${cidade}. Gostaria de conectar e trocar ideias sobre como ${prod} pode agregar valor. Aceita o convite? 😊`,
    ia: false,
  };
}
