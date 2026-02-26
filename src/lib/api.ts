import { supabase } from "@/lib/supabase";

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

  enriquecimento_web: boolean;

  exigir_contato_acionavel?: boolean;

  subsegmento_alvo?: string | null;
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
};

export type CnaeSecundario = {
  cnae: string;
  descricao?: string | null;
};

export type Empresa = {
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

  // ── enriquecimento web ─────────────────────────────────────────
  site?: string | null;
  email_enriquecido?: string | null;
  telefone_enriquecido?: string | null;
  whatsapp_publico?: string | null;
  whatsapp_enriquecido?: string | null;
  outras_informacoes?: string | null;

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

function salvarResultadoLocal(payload: ResultadoSalvo) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey("resultado"), JSON.stringify(payload));
  } catch {
    // ignora
  }
}

function lerResultadoLocal(): ResultadoSalvo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getStorageKey("resultado"));
    if (!raw) return null;
    return JSON.parse(raw) as ResultadoSalvo;
  } catch {
    return null;
  }
}

// ------------------------
// FETCH (COM LOGIN SUPABASE)
// ------------------------

type HermesFetchOptions = RequestInit;

async function getAuthToken(): Promise<string | null> {
  // fluxo atual do app (login dev): token no localStorage
  try {
    const t = localStorage.getItem("hermes_token");
    if (t && t !== "null" && t !== "undefined") return t;
  } catch {
    // ignore
  }

  // fallback: se Supabase estiver configurado e houver sessão válida
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

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
  } catch {}
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
  if (hasBody && !headers.has("Content-Type")) {
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

export function getCrmKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${CRM_KEYS_KEY}:${getTenantKey()}`);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

export function setCrmKey(provider: string, value: string) {
  const keys = getCrmKeys();
  if (value.trim()) keys[provider] = value.trim();
  else delete keys[provider];
  localStorage.setItem(`${CRM_KEYS_KEY}:${getTenantKey()}`, JSON.stringify(keys));
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
): Promise<{ success: boolean; provider: string; message?: string }> {
  return hermesFetch("/crm/export", {
    method: "POST",
    body: JSON.stringify({
      provider,
      api_key: apiKey,
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
): Promise<{ total: number; success: number; results: any[] }> {
  return hermesFetch("/crm/export/batch", {
    method: "POST",
    body: JSON.stringify({
      provider,
      api_key: apiKey,
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
    termo_base: configFront.termo_base,

    cidade: configFront.cidade,
    uf: configFront.uf,

    cidades:
      configFront.cidades && configFront.cidades.length > 0
        ? configFront.cidades
        : [configFront.cidade],
    ufs:
      configFront.ufs && configFront.ufs.length > 0
        ? configFront.ufs
        : [configFront.uf],

    capital_minimo: configFront.capital_minimo,
    capital_maximo: configFront.capital_maximo ?? null,

    limite_empresas: configFront.limite_empresas,
    portes: configFront.portes,
    segmentos: configFront.segmentos,

    cnaes: configFront.cnaes ?? [],

    enriquecimento_web: configFront.enriquecimento_web,

    exigir_contato_acionavel: configFront.exigir_contato_acionavel ?? false,

    subsegmento_alvo: configFront.subsegmento_alvo ?? null,
  };

  const data = await hermesFetch<ProspeccaoResultado>("/prospeccao/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  salvarResultadoLocal({
    timestamp: new Date().toISOString(),
    config: configFront,
    resultado: data,
  });

  return data;
}

export type ProgressEvent = {
  stage: "db_query" | "building" | "enriching" | "enriching_socials" | "done";
  current: number;
  total: number;
  detail: string;
};

export async function runProspeccaoStream(
  configFront: ProspeccaoConfig,
  onProgress: (evt: ProgressEvent) => void,
): Promise<ProspeccaoResultado> {
  const payload = {
    termo_base: configFront.termo_base,
    cidade: configFront.cidade,
    uf: configFront.uf,
    cidades:
      configFront.cidades && configFront.cidades.length > 0
        ? configFront.cidades
        : [configFront.cidade],
    ufs:
      configFront.ufs && configFront.ufs.length > 0
        ? configFront.ufs
        : [configFront.uf],
    capital_minimo: configFront.capital_minimo,
    capital_maximo: configFront.capital_maximo ?? null,
    limite_empresas: configFront.limite_empresas,
    portes: configFront.portes,
    segmentos: configFront.segmentos,
    cnaes: configFront.cnaes ?? [],
    enriquecimento_web: configFront.enriquecimento_web,
    exigir_contato_acionavel: configFront.exigir_contato_acionavel ?? false,
    subsegmento_alvo: configFront.subsegmento_alvo ?? null,
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

  return new Promise<ProspeccaoResultado>((resolve, reject) => {
    const reader = res.body?.getReader();
    if (!reader) { reject(new Error("Sem body na resposta SSE")); return; }

    const decoder = new TextDecoder();
    let buffer = "";

    function pump(): void {
      reader!.read().then(({ done, value }) => {
        if (done) {
          reject(new Error("Stream encerrado sem resultado"));
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: progress")) continue;
          if (line.startsWith("event: result")) continue;
          if (line.startsWith("event: error")) continue;
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.stage) {
                onProgress(parsed as ProgressEvent);
              } else if (parsed.detail && !parsed.empresas) {
                reject(new Error(parsed.detail));
                return;
              } else if (parsed.empresas !== undefined) {
                const data = parsed as ProspeccaoResultado;
                salvarResultadoLocal({
                  timestamp: new Date().toISOString(),
                  config: configFront,
                  resultado: data,
                });
                resolve(data);
                return;
              }
            } catch {}
          }
        }
        pump();
      }).catch(reject);
    }
    pump();
  });
}

export async function getResultados(): Promise<ResultadoSalvo | null> {
  return lerResultadoLocal();
}

export async function getExecucoes(): Promise<ExecucaoResumo[]> {
  const ultimo = lerResultadoLocal();
  if (!ultimo) return [];

  return [
    {
      id: 1,
      timestamp: ultimo.timestamp,
      termo: ultimo.config.termo_base,
      cidade: ultimo.config.cidade,
      uf: ultimo.config.uf,
      total_empresas: ultimo.resultado.total_empresas,
      filtros_icp: ultimo.resultado.filtros_icp,
      enriquecimento_web: ultimo.resultado.enriquecimento_web,
    },
  ];
}

export async function getHistoricoExecucoes(): Promise<ExecucaoResumo[]> {
  return getExecucoes();
}

export async function getResultadosUltimaExecucao(): Promise<UltimaExecucaoPayload> {
  const ultimo = lerResultadoLocal();

  if (!ultimo) return { execucao: null, resultados: [] };

  const execucao: ExecucaoResumo = {
    id: 1,
    timestamp: ultimo.timestamp,
    termo: ultimo.config.termo_base,
    cidade: ultimo.config.cidade,
    uf: ultimo.config.uf,
    total_empresas: ultimo.resultado.total_empresas,
    filtros_icp: ultimo.resultado.filtros_icp,
    enriquecimento_web: ultimo.resultado.enriquecimento_web,
  };

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

  let score = 5;

  const capital = emp.capital_social ?? 0;
  if (capital > 2_000_000) score += 3;
  else if (capital > 800_000) score += 2;
  else if (capital > 200_000) score += 1;

  if (emp.email || emp.email_enriquecido) score += 1.5;

  const temContato =
    emp.telefone_padrao ||
    emp.telefone_receita ||
    emp.telefone_estab1 ||
    emp.telefone_estab2 ||
    emp.telefone_enriquecido ||
    emp.whatsapp_enriquecido ||
    emp.whatsapp_publico;

  if (temContato) score += 1.5;

  score = Math.max(0, Math.min(10, score));
  return Number(score.toFixed(1));
}

export async function getDashboardUltimaExecucao(): Promise<DashboardData | null> {
  const ultimo = lerResultadoLocal();
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
      { canal: "WhatsApp",  total: Math.round(pct(empresas.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido).length)), pct: pct(empresas.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido).length) },
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
  empresa: Empresa, scoreIcp = 0
): Promise<"added" | "exists"> {
  const res = await hermesFetch<{ status: string }>("/pipeline", {
    method: "POST",
    body: JSON.stringify({
      empresa: empresaToPipelinePayload(empresa, scoreIcp),
      estagio: "novo",
      nota: "",
    }),
  });
  return res.status as "added" | "exists";
}

export async function addBatchToPipeline(
  empresas: { empresa: Empresa; scoreIcp: number }[]
): Promise<{ total: number; added: number }> {
  const payload = empresas.map(({ empresa, scoreIcp }) => ({
    empresa: empresaToPipelinePayload(empresa, scoreIcp),
    estagio: "novo",
    nota: "",
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
    empresas: Empresa[];
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
    resultado: { total_empresas: resultado.total_empresas, empresas },
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
