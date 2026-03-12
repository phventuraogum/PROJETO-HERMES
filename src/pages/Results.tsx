// src/pages/Results.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input }  from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Download, ExternalLink, Globe,
  MapPin, Building2, Users, Instagram, Linkedin, Facebook,
  Tag, Link2, MessageCircle, Share2, Sparkles,
  Mail, Phone, LayoutGrid, List, ChevronDown,
  ArrowUpDown, CheckSquare2, X, Copy, Check,
  TrendingUp, Percent, Wallet, Target, Wand2,
  Loader2, ShieldCheck, FolderPlus, ShieldBan,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContatoCaptado, Empresa, SocioEstruturado,
  ExecucaoResumo, getResultados, getResultadosUltimaExecucao,
  addBatchToPipeline, addToPipeline,
  addLeadListItems,
  buscarEmpresasParecidasPorCnpj,
  buscarContactIntelligencePorCnpj,
  buscarStatusBatchContactIntelligencePorCnpj,
  createLeadList,
  createLeadSuppressions,
  enfileirarContactIntelligenceBatchPorCnpj,
  enfileirarContactIntelligencePorCnpj,
  getLeadLists,
  getLeadSuppressions,
  salvarResultadoManual,
  type LeadListSummary,
  type LeadSuppression,
  type ContactIntelligenceResult,
  type ProspeccaoConfig,
  type ProspeccaoResultado,
  type SimilarCompany,
} from "@/lib/api";
import { MensagemModal } from "@/components/MensagemModal";
import { CrmExportModal } from "@/components/CrmExportModal";
import { toast } from "sonner";

// ─── CSV ──────────────────────────────────────────────────────────────────────

function escapeCsv(v: string) {
  const s = v.replace(/"/g, '""');
  return /[;"\r\n]/.test(s) ? `"${s}"` : s;
}

function gerarCsv(empresas: Empresa[]): string {
  const H = [
    "CNPJ","Razão Social","Nome Fantasia","Natureza Jurídica",
    "Data Abertura","Situação","Cidade","UF",
    "CNAE","Descrição CNAE","Segmento","Porte","Capital Social","Score ICP",
    "Telefone","E-mail","WhatsApp","Site","E-mail Enriquecido",
    "Sócios","Endereço","Bairro","CEP",
    "PIB Município (R$ mi)",
  ];
  const linhas = empresas.map(e => {
    const socios = (e.socios_estruturado ?? [])
      .map(s => `${s.nome}${s.qualificacao ? ` (${s.qualificacao})` : ""}`)
      .join(" | ");
    const end = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", ");
    const pib = e.sidra_pib ? (e.sidra_pib / 1_000_000).toFixed(1).replace(".", ",") : "";
    return [
      e.cnpj ?? "", e.razao_social ?? "", e.nome_fantasia ?? "",
      e.natureza_juridica ?? "", e.data_abertura ?? "", e.situacao_cadastral ?? "",
      e.cidade ?? "", e.uf ?? "",
      e.cnae_principal ?? "", e.cnae_descricao ?? "",
      e.segmento ?? "", e.porte ?? "",
      e.capital_social != null ? e.capital_social.toString().replace(".", ",") : "",
      e.score_icp != null ? e.score_icp.toFixed(1).replace(".", ",") : "",
      e.telefone_padrao ?? "", e.email ?? "",
      e.whatsapp_publico ?? e.whatsapp_enriquecido ?? "",
      e.site ?? "", e.email_enriquecido ?? "",
      socios, end, e.bairro ?? "", e.cep ?? "", pib,
    ].map(String).map(escapeCsv).join(";");
  });
  return `\ufeff${[H.map(escapeCsv).join(";"), ...linhas].join("\r\n")}`;
}

function downloadCsv(empresas: Empresa[], nome = "hermes-leads") {
  const blob = new Blob([gerarCsv(empresas)], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${nome}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── helpers visuais ──────────────────────────────────────────────────────────

function formatBRL(n?: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

const SEG_COLORS: Record<string, string> = {
  Hospitais:     "bg-rose-500",
  "Clínicas":    "bg-pink-500",
  "Laboratórios":"bg-violet-500",
  "Farmácias":   "bg-sky-500",
  Supermercados: "bg-amber-500",
  "Logística":   "bg-orange-500",
  "Indústria":   "bg-blue-500",
  "Serviços":    "bg-emerald-500",
};

function avatarColor(seg?: string | null) {
  return SEG_COLORS[seg ?? ""] ?? "bg-zinc-600";
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function scoreColor(s?: number | null) {
  if (!s) return "bg-zinc-700";
  if (s >= 80) return "bg-emerald-500";
  if (s >= 50) return "bg-amber-500";
  return "bg-rose-500";
}
function scoreTextColor(s?: number | null) {
  if (!s) return "text-zinc-400";
  if (s >= 80) return "text-emerald-400";
  if (s >= 50) return "text-amber-400";
  return "text-rose-400";
}

function getPorteBadge(p?: string | null) {
  const base = "border text-[10px] font-medium";
  const map: Record<string, string> = {
    ME:          "border-blue-500/40 bg-blue-500/10 text-blue-300",
    EPP:         "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    "Médio/Grande":"border-amber-500/40 bg-amber-500/10 text-amber-300",
    Grande:      "border-purple-500/40 bg-purple-500/10 text-purple-300",
  };
  return `${base} ${map[p ?? ""] ?? "border-zinc-600 text-zinc-400"}`;
}

function extractLinks(raw?: string | null): string[] {
  if (!raw) return [];
  return Array.from(new Set((raw.match(/(https?:\/\/[^\s,]+)/g) ?? [])));
}
function filterSocialLinks(links: string[]) {
  return links.filter(u => /instagram|linkedin|facebook|fb\.com/i.test(u));
}
function detectSocial(url: string): "instagram"|"linkedin"|"facebook"|"other" {
  if (/instagram/i.test(url)) return "instagram";
  if (/linkedin/i.test(url))  return "linkedin";
  if (/facebook|fb\.com/i.test(url)) return "facebook";
  return "other";
}

function dedupeContactItems(items?: ContatoCaptado[] | null, extras: string[] = []) {
  const merged: ContatoCaptado[] = [...(items ?? [])];
  extras.filter(Boolean).forEach(valor => merged.push({ valor }));
  const seen = new Set<string>();
  return merged.filter(item => {
    const key = item.valor.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contactSource(item?: ContatoCaptado | null) {
  return item?.origem?.trim() || "Captado";
}

function normalizeCnpj(cnpj?: string | null) {
  return String(cnpj || "").replace(/\D/g, "").slice(0, 14);
}

function primaryLinkedin(emp: Empresa) {
  return emp.linkedin_empresa
    ?? emp.redes_sociais_empresa?.find(link => /linkedin/i.test(link))
    ?? emp.redes_sociais_socios?.flatMap(s => s.links).find(link => /linkedin/i.test(link))
    ?? null;
}

function notifyPipelineSdrResult(
  label: string,
  result: {
    status: "added" | "exists";
    sdr_auto_enviado?: boolean;
    sdr_result?: {
      enviados: number;
      descartados_sem_contato?: number;
      descartados_ja_enviados?: number;
    };
  },
) {
  if (result.sdr_auto_enviado) {
    if (result.status === "exists") {
      toast.success(`${label} já estava no pipeline e foi enviado ao SDR`);
      return;
    }
    toast.success(`${label} entrou no pipeline e foi enviado ao SDR`);
    return;
  }

  if ((result.sdr_result?.descartados_ja_enviados ?? 0) > 0) {
    toast.info(`${label} já estava no pipeline e no fluxo SDR`);
    return;
  }

  if ((result.sdr_result?.descartados_sem_contato ?? 0) > 0) {
    toast.info(`${label} entrou no pipeline, mas não foi enviado ao SDR por falta de contato`);
    return;
  }

  if (result.status === "added") {
    toast.success(`${label} adicionado ao pipeline`);
    return;
  }

  toast.info("Empresa já está no pipeline");
}

function formatIntelPercent(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  const pct = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(pct)}%`;
}

function formatIntelPattern(pattern?: string | null) {
  return pattern ? pattern.replaceAll("_", " / ").replaceAll(".", " . ") : "Não inferido";
}

function intelStatusTone(status?: string | null) {
  switch (status) {
    case "verified":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "deliverable":
    case "mx_only":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    case "risky":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "invalid":
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    default:
      return "border-zinc-700 bg-zinc-900 text-zinc-300";
  }
}

function similarCompanyToEmpresa(item: SimilarCompany): Empresa {
  return {
    cnpj: item.cnpj,
    razao_social: item.razao_social,
    nome_fantasia: item.nome_fantasia ?? null,
    cidade: item.cidade ?? null,
    uf: item.uf ?? null,
    cnae_principal: item.cnae_principal ?? null,
    capital_social: item.capital_social ?? null,
    porte: item.porte_empresa ?? null,
    telefone_receita: item.telefone_receita ?? null,
    telefone_padrao: item.telefone_receita ?? null,
    email: item.email_receita ?? null,
    email_final: item.email_receita ?? null,
    site: item.site ?? null,
    whatsapp_publico: item.whatsapp ?? null,
    whatsapp_final: item.whatsapp ?? null,
    score_icp: Number.isFinite(item.similarity_score) ? item.similarity_score : null,
    fonte_dados_prioritaria: "similar_companies",
  };
}

function buildResultadoSnapshot(config: ProspeccaoConfig | null, empresas: Empresa[]): ProspeccaoResultado {
  const enriquecidas = empresas.filter((empresa) =>
    Boolean(empresa.site || empresa.email_enriquecido || empresa.telefone_enriquecido || empresa.whatsapp_enriquecido),
  ).length;

  return {
    total_empresas: empresas.length,
    empresas,
    filtros_icp: {
      capital_social_minimo: config?.capital_minimo ?? 0,
      portes: config?.portes ?? [],
      segmentos: config?.segmentos ?? [],
      cidade: config?.cidade ?? null,
      uf: config?.uf ?? null,
      cidades: config?.cidades ?? null,
      ufs: config?.ufs ?? null,
      volume_por_regiao: null,
      alinhamento_ideal_compra: null,
      exigir_contato_acionavel: config?.exigir_contato_acionavel ?? false,
    },
    enriquecimento_web: {
      total_com_enriquecimento: enriquecidas,
      total_sem_enriquecimento: Math.max(0, empresas.length - enriquecidas),
      porcentagem_enriquecida: empresas.length > 0 ? (enriquecidas / empresas.length) * 100 : 0,
    },
  };
}

// ─── mini copy button ──────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-zinc-500 hover:text-zinc-200 transition-colors"
      title={`Copiar: ${text}`}
      onClick={e => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score?: number | null }) {
  const s = score ?? 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", scoreColor(s))}
          style={{ width: `${Math.min(100, s)}%` }}
        />
      </div>
      <span className={cn("text-[11px] font-semibold tabular-nums", scoreTextColor(s))}>
        {s.toFixed(0)}
      </span>
    </div>
  );
}

// ─── Contact action row ──────────────────────────────────────────────────────
function ContactRow({ emp }: { emp: Empresa }) {
  const wa = emp.whatsapp_enriquecido || emp.whatsapp_publico;
  const email = emp.email_enriquecido || emp.email;
  const tel = emp.telefone_padrao || emp.telefone_receita;

  const raw = emp.outras_informacoes || "";
  const redesRaw = (emp.redes_sociais_empresa ?? []).length
    ? emp.redes_sociais_empresa!
    : extractLinks(raw);
  const linkedin = primaryLinkedin(emp)
    ?? redesRaw.find(l => /linkedin/i.test(l))
    ?? emp.redes_sociais_socios?.flatMap(s => s.links).find(l => /linkedin/i.test(l));

  return (
    <div className="flex items-center gap-1">
      {wa && (
        <a href={wa.startsWith("http") ? wa : `https://wa.me/${wa.replace(/\D/g, "")}`}
          target="_blank" rel="noreferrer" title={`WhatsApp: ${wa}`}
          onClick={e => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} title={`E-mail: ${email}`}
          onClick={e => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors">
          <Mail className="h-3.5 w-3.5" />
        </a>
      )}
      {tel && (
        <a href={`tel:${tel}`} title={`Telefone: ${tel}`}
          onClick={e => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 transition-colors">
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {linkedin && (
        <a href={linkedin} target="_blank" rel="noreferrer" title="LinkedIn"
          onClick={e => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
          <Linkedin className="h-3.5 w-3.5" />
        </a>
      )}
      {emp.site && (
        <a href={emp.site.startsWith("http") ? emp.site : `https://${emp.site}`}
          target="_blank" rel="noreferrer" title={emp.site}
          onClick={e => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 transition-colors">
          <Globe className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

// ─── Detalhe lateral (Sheet) ──────────────────────────────────────────────────
function DetalheEmpresa({
  company,
  contactIntel,
  isResolvingContactIntel,
  onResolveContactIntel,
}: {
  company: Empresa;
  contactIntel?: ContactIntelligenceResult | null;
  isResolvingContactIntel?: boolean;
  onResolveContactIntel?: () => void;
}) {
  const [crmOpen, setCrmOpen] = useState(false);
  const raw  = company.outras_informacoes || "";
  const redesRawBase = (company.redes_sociais_empresa ?? []).length
    ? company.redes_sociais_empresa!
    : filterSocialLinks(extractLinks(raw));
  const resumoIA =
    (company.resumo_ia_empresa as string | undefined) ||
    raw.match(/Resumo IA:\s*(.+)$/i)?.[1]?.trim() || null;
  const redesRaw = Array.from(new Set([
    ...redesRawBase,
    company.linkedin_empresa ?? "",
    company.instagram_empresa ?? "",
    company.facebook_empresa ?? "",
  ].filter(Boolean)));
  const emailsCaptados = dedupeContactItems(company.emails_captados, [company.email_enriquecido ?? "", company.email ?? ""]);
  const whatsCaptados = dedupeContactItems(company.whatsapps_captados, [company.whatsapp_enriquecido ?? "", company.whatsapp_publico ?? ""]);
  const telefonesCaptados = dedupeContactItems(company.telefones_captados, [
    company.telefone_enriquecido ?? "",
    company.telefone_padrao ?? "",
    company.telefone_receita ?? "",
    company.telefone_estab1 ?? "",
    company.telefone_estab2 ?? "",
  ]);

  return (
    <div className="space-y-5 text-sm pb-8">

      {/* ── Resumo ── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <Building2 className="h-3 w-3" /> Identificação
        </p>
        <div className="flex items-start gap-3">
          <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white", avatarColor(company.segmento))}>
            {initials(company.nome_fantasia || company.razao_social)}
          </div>
          <div>
            <p className="font-semibold text-white leading-tight">{company.nome_fantasia || company.razao_social}</p>
            <p className="text-xs text-zinc-400">{company.razao_social}</p>
            <p className="font-mono text-[11px] text-zinc-500 mt-0.5">{company.cnpj}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {company.porte && <Badge variant="outline" className={getPorteBadge(company.porte)}>{company.porte}</Badge>}
          {company.score_icp != null && (
            <div className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5">
              <span className="text-[10px] text-zinc-400">Score ICP</span>
              <ScoreBar score={company.score_icp} />
            </div>
          )}
          {company.situacao_cadastral && (
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300">
              {company.situacao_cadastral}
            </Badge>
          )}
        </div>
      </section>

      {/* ── Dados cadastrais ── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Dados cadastrais
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {company.cnae_principal && <>
            <dt className="text-zinc-500">CNAE</dt>
            <dd className="font-mono">{company.cnae_principal}{company.cnae_descricao && <span className="ml-1 font-sans text-zinc-300">— {company.cnae_descricao}</span>}</dd>
          </>}
          {company.cnaes_secundarios && company.cnaes_secundarios.length > 0 && <>
            <dt className="text-zinc-500">CNAEs sec.</dt>
            <dd className="text-zinc-300 leading-relaxed">
              {company.cnaes_secundarios.slice(0, 4).map(c => c.descricao || c.cnae).join(" · ")}
              {company.cnaes_secundarios.length > 4 && ` +${company.cnaes_secundarios.length - 4}`}
            </dd>
          </>}
          {company.capital_social != null && <>
            <dt className="text-zinc-500">Capital</dt>
            <dd className="font-medium">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(company.capital_social)}
            </dd>
          </>}
          {company.natureza_juridica && <>
            <dt className="text-zinc-500">Natureza Jur.</dt>
            <dd>{company.natureza_juridica}</dd>
          </>}
          {company.data_abertura && <>
            <dt className="text-zinc-500">Fundação</dt>
            <dd>{company.data_abertura}</dd>
          </>}
          {company.segmento && <>
            <dt className="text-zinc-500">Segmento</dt>
            <dd>{company.segmento}{company.subsegmento && <span className="ml-1 text-zinc-400">· {company.subsegmento}</span>}</dd>
          </>}
        </dl>

        {company.sidra_pib && (
          <div className="mt-2 rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-2 text-xs">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">PIB do município (IBGE)</p>
            <p className="text-zinc-200">
              R$ {(company.sidra_pib / 1_000_000).toFixed(1)} milhões
              {company.sidra_populacao && ` · ${Math.round(company.sidra_populacao).toLocaleString("pt-BR")} hab.`}
            </p>
          </div>
        )}
      </section>

      {/* ── Localização ── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <MapPin className="h-3 w-3" /> Localização
        </p>
        <p className="font-medium">{company.cidade || "—"}{company.uf && ` / ${company.uf}`}</p>
        {(company.logradouro || company.bairro) && (
          <p className="text-xs text-zinc-300">
            {[company.logradouro, company.numero, company.complemento].filter(Boolean).join(", ")}
            {company.bairro && ` · ${company.bairro}`}
            {company.cep && ` · CEP ${company.cep}`}
          </p>
        )}
      </section>

      {/* ── Contatos ── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <Globe className="h-3 w-3" /> Contatos e presença digital
        </p>
        {company.site && (
          <div className="flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
            <a href={company.site.startsWith("http") ? company.site : `https://${company.site}`}
              target="_blank" rel="noreferrer"
              className="text-xs text-primary hover:underline break-all">
              {company.site}
            </a>
          </div>
        )}
        {[
          { label: "WhatsApp",  icon: MessageCircle, value: whatsCaptados[0]?.valor,                                  href: (v: string) => v.startsWith("http") ? v : `https://wa.me/${v.replace(/\D/g, "")}`, color: "text-emerald-400" },
          { label: "E-mail",    icon: Mail,          value: emailsCaptados[0]?.valor,                                  href: (v: string) => `mailto:${v}`,                                             color: "text-sky-400" },
          { label: "Telefone",  icon: Phone,         value: telefonesCaptados[0]?.valor,                               href: (v: string) => `tel:${v}`,                                                color: "text-zinc-300" },
          { label: "LinkedIn",  icon: Linkedin,      value: primaryLinkedin(company),                                  href: (v: string) => v,                                                          color: "text-blue-400" },
        ].filter(c => c.value).map(c => (
          <div key={c.label} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <c.icon className={cn("h-3.5 w-3.5", c.color)} />
              <span className="text-zinc-400">{c.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <a href={c.href(c.value!)} target="_blank" rel="noreferrer"
                className="font-medium text-zinc-200 hover:text-white hover:underline break-all">
                {c.value}
              </a>
              <CopyBtn text={c.value!} />
            </div>
          </div>
        ))}

        {emailsCaptados.length > 1 && (
          <div className="border-t border-zinc-800 pt-2 space-y-1.5">
            <p className="text-[10px] text-zinc-500">E-mails captados</p>
            {emailsCaptados.slice(1).map(item => (
              <div key={item.valor} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-sky-400" />
                  <a href={`mailto:${item.valor}`} className="font-medium text-zinc-200 hover:text-white hover:underline break-all">
                    {item.valor}
                  </a>
                </div>
                <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
                  {contactSource(item)}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {whatsCaptados.length > 1 && (
          <div className="border-t border-zinc-800 pt-2 space-y-1.5">
            <p className="text-[10px] text-zinc-500">WhatsApps captados</p>
            {whatsCaptados.slice(1).map(item => (
              <div key={item.valor} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
                  <a href={`https://wa.me/${item.valor.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                    className="font-medium text-zinc-200 hover:text-white hover:underline break-all">
                    {item.valor}
                  </a>
                </div>
                <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
                  {contactSource(item)}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {telefonesCaptados.length > 1 && (
          <div className="border-t border-zinc-800 pt-2 space-y-1.5">
            <p className="text-[10px] text-zinc-500">Telefones captados</p>
            {telefonesCaptados.slice(1).map(item => (
              <div key={item.valor} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-zinc-300" />
                  <a href={`tel:${item.valor}`} className="font-medium text-zinc-200 hover:text-white hover:underline break-all">
                    {item.valor}
                  </a>
                </div>
                <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
                  {contactSource(item)}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {(company.registro_dono || company.registro_email || company.fonte_dados_prioritaria) && (
          <div className="border-t border-zinc-800 pt-2 space-y-1 text-xs text-zinc-300">
            {company.registro_dono && <p><span className="text-zinc-500">Registro.br:</span> {company.registro_dono}</p>}
            {company.registro_email && <p><span className="text-zinc-500">E-mail do registro:</span> {company.registro_email}</p>}
            {company.fonte_dados_prioritaria && <p><span className="text-zinc-500">Fonte principal:</span> {company.fonte_dados_prioritaria}</p>}
          </div>
        )}

        {redesRaw.length > 0 && (
          <div className="border-t border-zinc-800 pt-2 space-y-1.5">
            <p className="text-[10px] text-zinc-500 flex items-center gap-1"><Share2 className="h-3 w-3" /> Redes sociais</p>
            {redesRaw.map(link => {
              const t = detectSocial(link);
              return (
                <a key={link} href={link} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline break-all">
                  {t === "instagram" && <Instagram className="h-3 w-3 text-pink-400 flex-shrink-0" />}
                  {t === "linkedin"  && <Linkedin  className="h-3 w-3 text-sky-400 flex-shrink-0" />}
                  {t === "facebook"  && <Facebook  className="h-3 w-3 text-blue-400 flex-shrink-0" />}
                  {t === "other"     && <ExternalLink className="h-3 w-3 text-zinc-500 flex-shrink-0" />}
                  {link}
                </a>
              );
            })}
          </div>
        )}

        {resumoIA && (
          <div className="border-t border-zinc-800 pt-2 space-y-1">
            <p className="text-[10px] text-zinc-500 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Resumo IA</p>
            <p className="text-xs leading-relaxed text-zinc-300">{resumoIA}</p>
          </div>
        )}
      </section>

      {/* ── Sócios ── */}
      {(company.socios_estruturado?.length || company.socios_resumo || company.redes_sociais_socios?.length) && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
            <Users className="h-3 w-3" /> Sócios / Decisores
          </p>
          {company.socios_estruturado && company.socios_estruturado.length > 0 ? (
            <div className="space-y-2">
              {company.socios_estruturado.map((s: SocioEstruturado, i: number) => {
                const linkedin = s.linkedin || company.redes_sociais_socios
                  ?.find(r => r.nome.toLowerCase().slice(0,8) === s.nome.toLowerCase().slice(0,8))
                  ?.links?.find(l => /linkedin/i.test(l));
                const whatsapp = s.whatsapp;
                const email = s.email;
                const telefone = s.telefone;
                return (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-2.5">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-zinc-100">{s.nome}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {s.qualificacao && (
                          <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-[10px] text-violet-300">
                            {s.qualificacao}
                          </Badge>
                        )}
                        {s.data_entrada && <span className="text-[10px] text-zinc-500">desde {s.data_entrada}</span>}
                        {s.cargo_atual && <span className="text-[10px] text-zinc-500">{s.cargo_atual}</span>}
                        {s.empresa_atual && <span className="text-[10px] text-zinc-500">{s.empresa_atual}</span>}
                      </div>
                      <div className="space-y-1 text-[11px] text-zinc-300">
                        {email && <p>E-mail: <a href={`mailto:${email}`} className="hover:underline">{email}</a></p>}
                        {whatsapp && <p>WhatsApp: <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="hover:underline">{whatsapp}</a></p>}
                        {telefone && <p>Telefone: <a href={`tel:${telefone}`} className="hover:underline">{telefone}</a></p>}
                        {s.emails_alternativos && s.emails_alternativos.length > 0 && (
                          <p className="text-zinc-500">Alternativos: {s.emails_alternativos.join(" · ")}</p>
                        )}
                        {s.fonte_contato && <p className="text-zinc-500">Fonte: {s.fonte_contato}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {email && (
                        <a href={`mailto:${email}`}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20">
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {whatsapp && (
                        <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {linkedin && (
                        <a href={linkedin} target="_blank" rel="noreferrer"
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : company.socios_resumo ? (
            <div className="text-xs text-zinc-300 space-y-1">
              {company.socios_resumo.split("\n").map((s, i) => <p key={i}>{s}</p>)}
            </div>
          ) : null}
        </section>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" /> Contact Intelligence
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Domínio validado, padrão corporativo, caixas gerais e decisores resolvidos.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
            onClick={onResolveContactIntel}
            disabled={isResolvingContactIntel || !onResolveContactIntel}
          >
            {isResolvingContactIntel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {contactIntel ? "Atualizar" : "Resolver"}
          </Button>
        </div>

        {contactIntel ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Domínio</p>
                <p className="mt-1 break-all text-xs font-medium text-zinc-100">
                  {contactIntel.domain_profile.domain || "Não resolvido"}
                </p>
                {contactIntel.domain_profile.site_url && (
                  <a
                    href={contactIntel.domain_profile.site_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex text-[11px] text-primary hover:underline"
                  >
                    {contactIntel.domain_profile.site_url.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Padrão</p>
                <p className="mt-1 text-xs font-medium text-zinc-100">
                  {formatIntelPattern(contactIntel.domain_profile.email_pattern)}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Confiança {formatIntelPercent(contactIntel.domain_profile.pattern_confidence)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Emails acionáveis</p>
                <p className="mt-1 text-xs font-medium text-zinc-100">
                  {contactIntel.summary.deliverable ?? 0}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {contactIntel.summary.verified ?? 0} verificados
                </p>
              </div>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Decisores</p>
                <p className="mt-1 text-xs font-medium text-zinc-100">
                  {contactIntel.summary.decision_makers ?? 0}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {contactIntel.summary.sourced ?? 0} sourced · {contactIntel.summary.guessed ?? 0} guessed
                </p>
              </div>
            </div>

            {(contactIntel.domain_profile.generic_inboxes?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Caixas gerais</p>
                <div className="flex flex-wrap gap-1.5">
                  {(contactIntel.domain_profile.generic_inboxes ?? []).slice(0, 6).map((item) => (
                    <Badge key={item.email} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                      {item.email}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(contactIntel.contacts?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Decisores resolvidos</p>
                {(contactIntel.contacts ?? []).slice(0, 4).map((contact) => {
                  const primary = contact.emails.find((item) => item.is_primary) || contact.emails[0];
                  return (
                    <div key={`${company.cnpj}-${contact.name}`} className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium text-zinc-100">{contact.name}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">{contact.role || "Decisor potencial"}</p>
                        </div>
                        {primary?.verification_status && (
                          <Badge variant="outline" className={cn("capitalize text-[10px]", intelStatusTone(primary.verification_status))}>
                            {primary.verification_status}
                          </Badge>
                        )}
                      </div>

                      {primary ? (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-sky-400" />
                            <a href={`mailto:${primary.email}`} className="break-all text-xs font-medium text-zinc-100 hover:underline">
                              {primary.email}
                            </a>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px] text-zinc-500">
                            <span>Score {formatIntelPercent(primary.score_total)}</span>
                            <span>·</span>
                            <span>{primary.kind === "sourced" ? "Sourced" : "Guessed"}</span>
                            {primary.source_label && (
                              <>
                                <span>·</span>
                                <span>{primary.source_label}</span>
                              </>
                            )}
                          </div>
                          {contact.linkedin && (
                            <a
                              href={contact.linkedin}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-[11px] text-cyan-300 hover:underline"
                            >
                              <Linkedin className="h-3 w-3" />
                              Abrir LinkedIn
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-zinc-500">Sem email resolvido para este contato.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-3 text-xs text-zinc-400">
                Nenhum decisor resolvido ainda. Rode a resolução para inferir padrão de email e validar contatos.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-3 text-xs text-zinc-400">
            Este lead ainda não passou pelo módulo Hunter-style. Use o botão acima para carregar do cache ou resolver agora.
          </div>
        )}
      </section>

      {/* Enviar para CRM */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Integração</p>
        <Button size="sm" variant="outline" className="gap-1.5 border-sky-700 text-sky-400 hover:bg-sky-900/20"
          onClick={() => setCrmOpen(true)}>
          <Building2 className="h-3.5 w-3.5" /> Enviar para CRM
        </Button>
      </section>

      <CrmExportModal open={crmOpen} onClose={() => setCrmOpen(false)} empresa={company} />
    </div>
  );
}

// ─── Card de empresa (grid view) ─────────────────────────────────────────────
function EmpresaCard({
  emp,
  selected,
  onSelect,
  contactIntel,
  isResolvingContactIntel,
  onResolveContactIntel,
}: {
  emp: Empresa;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  contactIntel?: ContactIntelligenceResult | null;
  isResolvingContactIntel?: boolean;
  onResolveContactIntel?: () => void;
}) {
  const [mensagemOpen, setMensagemOpen] = useState(false);

  const handlePipeline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const r = await addToPipeline(emp, emp.score_icp ?? 0, { autoEnviarSdr: true });
      notifyPipelineSdrResult(emp.nome_fantasia || emp.razao_social, r);
    } catch (err: any) {
      toast.error("Erro ao adicionar: " + (err?.message || ""));
    }
  };

  return (
    <div className={cn(
      "group relative rounded-xl border bg-zinc-950/80 p-4 transition-all hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30",
      selected ? "border-primary/60 bg-primary/5" : "border-zinc-800"
    )}>
      {/* Checkbox */}
      <div className="absolute left-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onSelect} className="border-zinc-600" />
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white", avatarColor(emp.segmento))}>
          {initials(emp.nome_fantasia || emp.razao_social)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white leading-tight truncate">
            {emp.nome_fantasia || emp.razao_social}
          </p>
          <p className="text-[11px] text-zinc-500 truncate">{emp.razao_social}</p>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-950">
            <SheetHeader className="mb-6">
              <SheetTitle className="flex flex-col gap-1">
                <span className="text-[10px] font-normal uppercase tracking-widest text-zinc-400">Visão detalhada</span>
                <span className="text-base font-semibold">{emp.nome_fantasia || emp.razao_social}</span>
              </SheetTitle>
            </SheetHeader>
            <DetalheEmpresa
              company={emp}
              contactIntel={contactIntel ?? null}
              isResolvingContactIntel={isResolvingContactIntel}
              onResolveContactIntel={onResolveContactIntel}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mb-3">
        {emp.segmento && (
          <Badge variant="outline" className="border-zinc-700 bg-zinc-800/60 text-[10px] text-zinc-300">
            {emp.segmento}
          </Badge>
        )}
        {emp.porte && (
          <Badge variant="outline" className={cn("text-[10px]", getPorteBadge(emp.porte))}>
            {emp.porte}
          </Badge>
        )}
        <Badge variant="outline" className="border-zinc-700 bg-zinc-800/60 text-[10px] text-zinc-400">
          <MapPin className="mr-1 h-2.5 w-2.5" />{emp.cidade || "—"}
        </Badge>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-zinc-900/60 px-2.5 py-1.5">
          <p className="text-[10px] text-zinc-500">Capital</p>
          <p className="text-xs font-medium text-zinc-200">{formatBRL(emp.capital_social)}</p>
        </div>
        <div className="rounded-lg bg-zinc-900/60 px-2.5 py-1.5">
          <p className="text-[10px] text-zinc-500">Score ICP</p>
          <ScoreBar score={emp.score_icp} />
        </div>
      </div>

      {/* Ações de contato */}
      <ContactRow emp={emp} />

      {/* Ações rápidas */}
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-800/60">
        <Button
          size="sm" variant="ghost"
          className="flex-1 h-6 gap-1 text-[10px] text-zinc-500 hover:text-primary hover:bg-primary/10"
          onClick={handlePipeline}>
          <Target className="h-3 w-3" /> Pipeline + SDR
        </Button>
        <Button
          size="sm" variant="ghost"
          className="flex-1 h-6 gap-1 text-[10px] text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10"
          onClick={e => { e.stopPropagation(); setMensagemOpen(true); }}>
          <Wand2 className="h-3 w-3" /> Abordar
        </Button>
      </div>

      {mensagemOpen && (
        <MensagemModal empresa={emp} open={mensagemOpen} onClose={() => setMensagemOpen(false)} />
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

type SortKey = "score_icp" | "capital_social" | "razao_social";
type FilterChip = "com_email" | "com_whatsapp" | "com_linkedin" | "com_site";

const ResultsPage = () => {
  const location = useLocation();
  const [empresas, setEmpresas]     = useState<Empresa[]>([]);
  const [execucao, setExecucao]     = useState<ExecucaoResumo | null>(null);
  const [currentConfig, setCurrentConfig] = useState<ProspeccaoConfig | null>(null);
  const [loading, setLoading]       = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode]     = useState<"cards" | "table">("cards");
  const [sortKey, setSortKey]       = useState<SortKey>("score_icp");
  const [sortAsc, setSortAsc]       = useState(false);
  const [activeChips, setActiveChips] = useState<FilterChip[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [contactIntelByCnpj, setContactIntelByCnpj] = useState<Record<string, ContactIntelligenceResult>>({});
  const [resolvingIntelBatch, setResolvingIntelBatch] = useState(false);
  const [resolvingIntelCnpjs, setResolvingIntelCnpjs] = useState<Set<string>>(new Set());
  const [leadLists, setLeadLists] = useState<LeadListSummary[]>([]);
  const [suppressionEntries, setSuppressionEntries] = useState<LeadSuppression[]>([]);
  const [saveListOpen, setSaveListOpen] = useState(false);
  const [saveListTarget, setSaveListTarget] = useState<string>("__new__");
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [savingListSelection, setSavingListSelection] = useState(false);
  const [suppressSelectionOpen, setSuppressSelectionOpen] = useState(false);
  const [suppressionReason, setSuppressionReason] = useState("");
  const [savingSuppressionSelection, setSavingSuppressionSelection] = useState(false);
  const [expandingSimilar, setExpandingSimilar] = useState(false);

  const refreshLeadRegistryMeta = async () => {
    const [lists, suppressions] = await Promise.all([
      getLeadLists(),
      getLeadSuppressions(),
    ]);
    setLeadLists(lists);
    setSuppressionEntries(suppressions);
  };

  useEffect(() => {
    const stateResultados = Array.isArray((location.state as { resultados?: Empresa[] } | null)?.resultados)
      ? (location.state as { resultados?: Empresa[] }).resultados ?? []
      : [];

    (async () => {
      try {
        const [resultadosResult, registryResult] = await Promise.allSettled([
          getResultadosUltimaExecucao(),
          refreshLeadRegistryMeta(),
        ]);
        const fullResult = await getResultados().catch(() => null);

        if (resultadosResult.status === "fulfilled") {
          const p = resultadosResult.value;
          setEmpresas((p.resultados && p.resultados.length > 0) ? p.resultados : stateResultados);
          setExecucao(p.execucao);
        } else {
          setEmpresas(stateResultados);
          toast.error("Nao foi possivel carregar a ultima execucao.");
        }

        if (registryResult.status === "rejected") {
          toast.error("Nao foi possivel carregar listas e supressoes.");
        }

        if (fullResult?.config) {
          setCurrentConfig(fullResult.config);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [location.state]);

  useEffect(() => {
    if (leadLists.length === 0) {
      setSaveListTarget("__new__");
      return;
    }

    setSaveListTarget((current) => (
      current !== "__new__" && leadLists.some((list) => list.id === current)
        ? current
        : leadLists[0].id
    ));
  }, [leadLists]);

  const suppressedCnpjs = useMemo(
    () => new Set(
      suppressionEntries
        .map((entry) => normalizeCnpj(entry.cnpj))
        .filter(Boolean),
    ),
    [suppressionEntries],
  );

  const visibleEmpresas = useMemo(
    () => empresas.filter((empresa) => !suppressedCnpjs.has(normalizeCnpj(empresa.cnpj))),
    [empresas, suppressedCnpjs],
  );

  const suppressedCount = Math.max(0, empresas.length - visibleEmpresas.length);

  useEffect(() => {
    const allowed = new Set(visibleEmpresas.map((empresa) => empresa.cnpj));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((cnpj) => {
        if (allowed.has(cnpj)) {
          next.add(cnpj);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [visibleEmpresas]);

  useEffect(() => {
    if (resolvingIntelCnpjs.size === 0) return;

    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const statuses = await buscarStatusBatchContactIntelligencePorCnpj(Array.from(resolvingIntelCnpjs));
        if (cancelled) return;

        const resolved: Record<string, ContactIntelligenceResult> = {};
        const done = new Set<string>();
        let completed = 0;
        let failed = 0;

        for (const item of statuses) {
          if (item.intelligence) {
            resolved[item.cnpj] = item.intelligence;
            done.add(item.cnpj);
            completed += 1;
            continue;
          }

          if (item.status === "error") {
            done.add(item.cnpj);
            failed += 1;
          }
        }

        if (Object.keys(resolved).length > 0) {
          setContactIntelByCnpj((prev) => ({ ...prev, ...resolved }));
        }

        if (done.size > 0) {
          setResolvingIntelCnpjs((prev) => {
            const next = new Set(prev);
            done.forEach((cnpj) => next.delete(cnpj));
            return next;
          });

          if (completed > 0) {
            toast.success(`${completed} Contact Intelligence concluido(s) em background.`);
          }
          if (failed > 0) {
            toast.error(`${failed} Contact Intelligence falharam no background.`);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error("Erro ao acompanhar Contact Intelligence: " + (err?.message || ""));
        }
      }

      if (!cancelled) {
        timer = window.setTimeout(poll, 3000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [resolvingIntelCnpjs]);

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const t = visibleEmpresas.length;
    if (!t) return null;
    const comEmail = visibleEmpresas.filter(e => e.email || e.email_enriquecido).length;
    const comWa    = visibleEmpresas.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido).length;
    const comLinkedin = visibleEmpresas.filter(e => {
      const links = [
        ...(e.redes_sociais_empresa ?? []),
        ...(e.redes_sociais_socios?.flatMap(s => s.links) ?? []),
        ...extractLinks(e.outras_informacoes),
      ];
      return links.some(l => /linkedin/i.test(l));
    }).length;
    const scoreList = visibleEmpresas.map(e => e.score_icp ?? 0);
    const scoreAvg  = scoreList.reduce((a, b) => a + b, 0) / t;
    return { t, comEmail, comWa, comLinkedin, scoreAvg };
  }, [visibleEmpresas]);

  // ── filtros + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...visibleEmpresas];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(e =>
        e.razao_social.toLowerCase().includes(q) ||
        (e.nome_fantasia ?? "").toLowerCase().includes(q) ||
        e.cnpj.includes(q) ||
        (e.cidade ?? "").toLowerCase().includes(q) ||
        (e.segmento ?? "").toLowerCase().includes(q)
      );
    }

    if (activeChips.includes("com_email"))
      list = list.filter(e => e.email || e.email_enriquecido);
    if (activeChips.includes("com_whatsapp"))
      list = list.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido);
    if (activeChips.includes("com_linkedin"))
      list = list.filter(e => {
        const links = [
          ...(e.redes_sociais_empresa ?? []),
          ...(e.redes_sociais_socios?.flatMap(s => s.links) ?? []),
          ...extractLinks(e.outras_informacoes),
        ];
        return links.some(l => /linkedin/i.test(l));
      });
    if (activeChips.includes("com_site"))
      list = list.filter(e => e.site);

    list.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortKey === "score_icp")       { va = a.score_icp ?? 0;       vb = b.score_icp ?? 0; }
      if (sortKey === "capital_social")  { va = a.capital_social ?? 0;  vb = b.capital_social ?? 0; }
      if (sortKey === "razao_social")    { va = a.razao_social;          vb = b.razao_social; }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return list;
  }, [visibleEmpresas, searchTerm, activeChips, sortKey, sortAsc]);

  // ── seleção ────────────────────────────────────────────────────────────────
  const toggleChip = (c: FilterChip) =>
    setActiveChips(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const toggleSelect = (cnpj: string, checked: boolean) =>
    setSelected(prev => { const n = new Set(prev); checked ? n.add(cnpj) : n.delete(cnpj); return n; });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(e => e.cnpj)));
  };

  const exportSelected = () => {
    const list = filtered.filter(e => selected.has(e.cnpj));
    downloadCsv(list, "hermes-selecionadas");
  };

  const getSelectedCompanies = () => filtered.filter((empresa) => selected.has(empresa.cnpj));

  const salvarSelecionadasEmLista = async () => {
    const selecionadas = getSelectedCompanies();
    if (selecionadas.length === 0) {
      toast.info("Selecione pelo menos uma empresa");
      return;
    }

    try {
      setSavingListSelection(true);
      let targetListId = saveListTarget;

      if (targetListId === "__new__") {
        const name = newListName.trim();
        if (!name) {
          toast.info("Informe o nome da nova lista.");
          return;
        }
        const created = await createLeadList(name, newListDescription.trim() || null);
        targetListId = created.id;
      }

      const result = await addLeadListItems(
        targetListId,
        selecionadas.map((empresa) => ({
          empresa,
          scoreIcp: empresa.score_icp ?? 0,
          source: "results_selection",
        })),
      );

      await refreshLeadRegistryMeta();
      setSaveListOpen(false);
      setNewListName("");
      setNewListDescription("");
      setSelected(new Set());
      toast.success(`${result.added} lead(s) salvos na lista.`);
    } catch (err: any) {
      toast.error("Erro ao salvar selecao em lista: " + (err?.message || ""));
    } finally {
      setSavingListSelection(false);
    }
  };

  const suprimirSelecionadas = async () => {
    const selecionadas = getSelectedCompanies();
    if (selecionadas.length === 0) {
      toast.info("Selecione pelo menos uma empresa");
      return;
    }

    try {
      setSavingSuppressionSelection(true);
      const result = await createLeadSuppressions({
        cnpjs: selecionadas.map((empresa) => normalizeCnpj(empresa.cnpj)).filter(Boolean),
        reason: suppressionReason.trim() || null,
        source: "results_selection",
      });
      await refreshLeadRegistryMeta();
      setSuppressSelectionOpen(false);
      setSuppressionReason("");
      setSelected(new Set());
      toast.success(`${result.added} lead(s) suprimidos do fluxo operacional.`);
    } catch (err: any) {
      toast.error("Erro ao suprimir selecao: " + (err?.message || ""));
    } finally {
      setSavingSuppressionSelection(false);
    }
  };

  const resolveOneContactIntel = async (cnpj: string) => {
    setResolvingIntelCnpjs(prev => {
      const next = new Set(prev);
      next.add(cnpj);
      return next;
    });

    const clearResolving = () => {
      setResolvingIntelCnpjs(prev => {
        const next = new Set(prev);
        next.delete(cnpj);
        return next;
      });
    };

    try {
      const cached = await buscarContactIntelligencePorCnpj(cnpj);
      if (cached.intelligence) {
        setContactIntelByCnpj(prev => ({ ...prev, [cnpj]: cached.intelligence! }));
        clearResolving();
        toast.success("Contact Intelligence carregado do cache.");
        return;
      }

      const status = await enfileirarContactIntelligencePorCnpj(cnpj);
      if (status.intelligence) {
        setContactIntelByCnpj(prev => ({ ...prev, [cnpj]: status.intelligence! }));
        clearResolving();
        toast.success("Contact Intelligence carregado do cache.");
        return;
      }

      if (status.status === "error") {
        throw new Error(status.error || "Falha ao enfileirar Contact Intelligence.");
      }

      toast.info("Contact Intelligence enviado para processamento em background.");
    } catch (err: any) {
      toast.error("Erro ao resolver Contact Intelligence: " + (err?.message || ""));
      clearResolving();
    }
  };

  const expandirSelecionadasParecidas = async () => {
    const selecionadas = getSelectedCompanies();
    if (selecionadas.length === 0) {
      toast.info("Selecione pelo menos uma empresa");
      return;
    }

    const seeds = selecionadas.slice(0, 5);
    if (selecionadas.length > seeds.length) {
      toast.info(`Expandindo as ${seeds.length} primeiras empresas selecionadas para manter a busca fluida.`);
    }

    try {
      setExpandingSimilar(true);
      const batches = await Promise.allSettled(
        seeds.map((empresa) => buscarEmpresasParecidasPorCnpj(empresa.cnpj, 6)),
      );

      const known = new Set(empresas.map((empresa) => normalizeCnpj(empresa.cnpj)));
      const additions: Empresa[] = [];

      for (const batch of batches) {
        if (batch.status !== "fulfilled") {
          continue;
        }
        for (const item of batch.value) {
          const normalized = normalizeCnpj(item.cnpj);
          if (!normalized || known.has(normalized)) {
            continue;
          }
          known.add(normalized);
          additions.push(similarCompanyToEmpresa(item));
        }
      }

      if (additions.length === 0) {
        toast.info("Nenhuma empresa parecida nova foi encontrada para este lote.");
        return;
      }

      const merged = [...empresas, ...additions];
      setEmpresas(merged);
      setExecucao((prev) => (prev ? { ...prev, total_empresas: merged.length } : prev));
      await salvarResultadoManual(currentConfig ?? {
        termo_base: "",
        cidade: "",
        uf: "",
        cidades: [],
        ufs: [],
        capital_minimo: 0,
        capital_maximo: null,
        limite_empresas: merged.length,
        portes: [],
        segmentos: [],
        cnaes: [],
        incluir_cnae_secundario: false,
        enriquecimento_web: true,
        exigir_contato_acionavel: false,
        priorizar_com_contato: true,
        excluir_cnpjs: [],
        idade_minima_anos: null,
        idade_maxima_anos: null,
      }, buildResultadoSnapshot(currentConfig, merged));

      toast.success(`${additions.length} empresa(s) parecida(s) adicionada(s) aos resultados.`);
    } catch (err: any) {
      toast.error("Erro ao expandir empresas parecidas: " + (err?.message || ""));
    } finally {
      setExpandingSimilar(false);
    }
  };

  const resolverSelecionadasContactIntel = async () => {
    const selecionadas = getSelectedCompanies();
    if (selecionadas.length === 0) {
      toast.info("Selecione pelo menos uma empresa");
      return;
    }

    try {
      setResolvingIntelBatch(true);
      const items = await enfileirarContactIntelligenceBatchPorCnpj(
        selecionadas.map((empresa) => empresa.cnpj),
      );

      const nextIntel: Record<string, ContactIntelligenceResult> = {};
      const pending = new Set<string>();
      let resolved = 0;
      let cached = 0;
      let queued = 0;
      let failed = 0;

      for (const item of items) {
        if (item.intelligence) {
          nextIntel[item.cnpj] = item.intelligence;
          resolved += 1;
          if (item.cached) cached += 1;
        } else if (item.status === "queued" || item.status === "running") {
          pending.add(item.cnpj);
          queued += 1;
        } else if (item.error) {
          failed += 1;
        }
      }

      if (Object.keys(nextIntel).length > 0) {
        setContactIntelByCnpj(prev => ({ ...prev, ...nextIntel }));
      }

      if (pending.size > 0) {
        setResolvingIntelCnpjs(prev => {
          const next = new Set(prev);
          pending.forEach((cnpj) => next.add(cnpj));
          return next;
        });
      }

      if (resolved > 0) {
        const label = cached > 0 ? `${resolved} lead(s) processados, ${cached} vindo(s) do cache` : `${resolved} lead(s) processados`;
        if (queued > 0 || failed > 0) {
          toast.info(`${label}. ${queued} em background, ${failed} falharam.`);
        } else {
          toast.success(label);
        }
      } else if (queued > 0) {
        toast.info(`${queued} Contact Intelligence enviados para processamento em background.`);
      } else {
        toast.error("Nenhum lead pôde ser resolvido neste lote.");
      }
    } catch (err: any) {
      toast.error("Erro ao resolver Contact Intelligence em lote: " + (err?.message || ""));
    } finally {
      setResolvingIntelBatch(false);
    }
  };

  const enviarSelecionadasParaPipelineESDR = async () => {
    const selecionadas = getSelectedCompanies();
    if (selecionadas.length === 0) {
      toast.info("Selecione pelo menos uma empresa");
      return;
    }

    try {
      const res = await addBatchToPipeline(
        selecionadas.map(empresa => ({
          empresa,
          scoreIcp: empresa.score_icp ?? 0,
        })),
        { autoEnviarSdr: true },
      );

      const semContato = (res.results ?? []).reduce(
        (total, item) => total + (item.sdr_result?.descartados_sem_contato ?? 0),
        0,
      );
      const jaEnviados = (res.results ?? []).reduce(
        (total, item) => total + (item.sdr_result?.descartados_ja_enviados ?? 0),
        0,
      );

      if ((res.sdr_auto_enviados ?? 0) > 0) {
        toast.success(`${res.added} lead(s) no pipeline e ${res.sdr_auto_enviados ?? 0} enviado(s) ao SDR`);
      } else if (semContato > 0) {
        toast.info(`${res.added} lead(s) no pipeline. ${semContato} sem contato válido para envio ao SDR`);
      } else if (jaEnviados > 0) {
        toast.info(`${jaEnviados} lead(s) já estavam no fluxo SDR/outbound`);
      } else {
        toast.success(`${res.added} lead(s) adicionados ao pipeline`);
      }

      setSelected(new Set());
    } catch (err: any) {
      toast.error("Erro ao enviar seleção: " + (err?.message || ""));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-1">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Resultados da Prospecção</h2>
        {execucao && (
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium">{execucao.termo || "Sem termo"}</span>
            {" · "}{execucao.cidade} / {execucao.uf}
            {" · "}<span className="font-semibold text-foreground">{execucao.total_empresas}</span> empresas
          </p>
        )}
      </div>

      {/* ── Stats cards ───────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Building2,  label: "Total",       value: stats.t,                         fmt: (v: number) => v.toString(),              color: "text-white" },
            { icon: Mail,       label: "Com e-mail",  value: stats.comEmail,                   fmt: (v: number) => `${v} (${Math.round(v/stats.t*100)}%)`, color: "text-sky-400" },
            { icon: MessageCircle, label: "WhatsApp", value: stats.comWa,                      fmt: (v: number) => `${v} (${Math.round(v/stats.t*100)}%)`, color: "text-emerald-400" },
            { icon: TrendingUp, label: "Score médio", value: stats.scoreAvg,                   fmt: (v: number) => v.toFixed(1),              color: "text-amber-400" },
          ].map(s => (
            <Card key={s.label} className="border-zinc-800 bg-zinc-950/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/80">
                  <s.icon className={cn("h-4 w-4", s.color)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("text-lg font-bold leading-tight", s.color)}>{s.fmt(s.value)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa, CNPJ, cidade, segmento..."
              className="pl-9 h-9 bg-zinc-900 border-zinc-700"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5">
                <X className="h-4 w-4 text-zinc-500 hover:text-zinc-200" />
              </button>
            )}
          </div>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-9 border-zinc-700 bg-zinc-900">
                <ArrowUpDown className="h-3.5 w-3.5" />
                Ordenar
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {([
                { key: "score_icp",      label: "Score ICP" },
                { key: "capital_social", label: "Capital Social" },
                { key: "razao_social",   label: "Nome (A–Z)" },
              ] as { key: SortKey; label: string }[]).map(o => (
                <DropdownMenuItem key={o.key}
                  className={cn(sortKey === o.key && "text-primary")}
                  onClick={() => { if (sortKey === o.key) setSortAsc(p => !p); else { setSortKey(o.key); setSortAsc(false); } }}>
                  {o.label} {sortKey === o.key && (sortAsc ? "↑" : "↓")}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View toggle */}
          <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
            <button
              onClick={() => setViewMode("cards")}
              className={cn("flex h-9 w-9 items-center justify-center transition-colors",
                viewMode === "cards" ? "bg-primary/20 text-primary" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn("flex h-9 w-9 items-center justify-center transition-colors",
                viewMode === "table" ? "bg-primary/20 text-primary" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-9 border-zinc-700 bg-zinc-900">
                <Download className="h-3.5 w-3.5" />
                Exportar
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadCsv(filtered, "hermes-filtrados")}>
                CSV — resultados filtrados ({filtered.length})
              </DropdownMenuItem>
              {selected.size > 0 && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportSelected}>
                  CSV — selecionados ({selected.size})
                </DropdownMenuItem>
              </>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => downloadCsv(visibleEmpresas, "hermes-todos")}>
                CSV — todos ({visibleEmpresas.length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {selected.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/15"
                onClick={() => setSaveListOpen(true)}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Salvar em lista ({selected.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
                onClick={() => setSuppressSelectionOpen(true)}
              >
                <ShieldBan className="h-3.5 w-3.5" />
                Suprimir ({selected.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
                onClick={resolverSelecionadasContactIntel}
                disabled={resolvingIntelBatch}
              >
                {resolvingIntelBatch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Hunter Core ({selected.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
                onClick={expandirSelecionadasParecidas}
                disabled={expandingSimilar}
              >
                {expandingSimilar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Parecidas ({Math.min(selected.size, 5)})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                onClick={enviarSelecionadasParaPipelineESDR}
              >
                <Target className="h-3.5 w-3.5" />
                Pipeline + SDR ({selected.size})
              </Button>
            </>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">Filtrar:</span>
          {([
            { id: "com_email",    label: "Com e-mail",  icon: Mail },
            { id: "com_whatsapp", label: "Com WhatsApp",icon: MessageCircle },
            { id: "com_linkedin", label: "Com LinkedIn",icon: Linkedin },
            { id: "com_site",     label: "Com site",    icon: Globe },
          ] as { id: FilterChip; label: string; icon: React.FC<{className?: string}> }[]).map(chip => {
            const on = activeChips.includes(chip.id);
            return (
              <button key={chip.id} onClick={() => toggleChip(chip.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all",
                  on ? "border-primary/60 bg-primary/15 text-primary" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                )}>
                <chip.icon className="h-2.5 w-2.5" />
                {chip.label}
              </button>
            );
          })}

          {/* Contadores direita */}
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
            {selected.size > 0 && (
              <span className="flex items-center gap-1 text-primary font-medium">
                <CheckSquare2 className="h-3.5 w-3.5" />
                {selected.size} selecionadas
              </span>
            )}
            {suppressedCount > 0 && (
              <span>{suppressedCount} suprimidas</span>
            )}
            <span>{filtered.length} de {visibleEmpresas.length}</span>
          </div>
        </div>
      </div>

      {/* ── Conteúdo ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Carregando resultados...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <Search className="h-8 w-8 text-zinc-700 mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada com os filtros atuais.</p>
          {(searchTerm || activeChips.length > 0) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(""); setActiveChips([]); }}>
              Limpar filtros
            </Button>
          )}
        </div>
      ) : viewMode === "cards" ? (

        /* ─── CARDS ─────────────────────────────────────────────────────── */
        <>
          {/* Selecionar todos */}
          <div className="flex items-center gap-2 pb-1">
            <button onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
              <Checkbox checked={selected.size === filtered.length && filtered.length > 0}
                onCheckedChange={toggleSelectAll} className="h-3.5 w-3.5 border-zinc-600" />
              {selected.size === filtered.length && filtered.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(emp => (
              <EmpresaCard
                key={emp.cnpj}
                emp={emp}
                selected={selected.has(emp.cnpj)}
                onSelect={checked => toggleSelect(emp.cnpj, !!checked)}
                contactIntel={contactIntelByCnpj[emp.cnpj] ?? null}
                isResolvingContactIntel={resolvingIntelCnpjs.has(emp.cnpj)}
                onResolveContactIntel={() => void resolveOneContactIntel(emp.cnpj)}
              />
            ))}
          </div>
        </>

      ) : (

        /* ─── TABLE ─────────────────────────────────────────────────────── */
        <Card className="border-zinc-800">
          <CardHeader className="py-3 px-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selected.size === filtered.length && filtered.length > 0}
                onCheckedChange={toggleSelectAll}
                className="border-zinc-600"
              />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {filtered.length} empresas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 bg-zinc-900/40">
                    <TableHead className="w-8 pl-4" />
                    <TableHead>Empresa</TableHead>
                    <TableHead>Segmento</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Capital</TableHead>
                    <TableHead>Score ICP</TableHead>
                    <TableHead>Contatos</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(emp => (
                    <TableRow key={emp.cnpj} className={cn("border-zinc-800 transition-colors hover:bg-zinc-900/60", selected.has(emp.cnpj) && "bg-primary/5")}>
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={selected.has(emp.cnpj)}
                          onCheckedChange={checked => toggleSelect(emp.cnpj, !!checked)}
                          className="border-zinc-600"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", avatarColor(emp.segmento))}>
                            {initials(emp.nome_fantasia || emp.razao_social)}
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">{emp.nome_fantasia || emp.razao_social}</p>
                            <p className="font-mono text-[10px] text-zinc-500">{emp.cnpj}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {emp.segmento && <Badge variant="outline" className="border-zinc-700 bg-zinc-800/60 text-[10px]">{emp.segmento}</Badge>}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{emp.cidade || "—"}</span>
                        {emp.uf && <span className="ml-1 text-xs text-zinc-500">/ {emp.uf}</span>}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{formatBRL(emp.capital_social)}</span>
                      </TableCell>
                      <TableCell>
                        <ScoreBar score={emp.score_icp} />
                      </TableCell>
                      <TableCell>
                        <ContactRow emp={emp} />
                      </TableCell>
                      <TableCell>
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </SheetTrigger>
                          <SheetContent className="w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-950">
                            <SheetHeader className="mb-6">
                              <SheetTitle className="flex flex-col gap-1">
                                <span className="text-[10px] font-normal uppercase tracking-widest text-zinc-400">Visão detalhada</span>
                                <span className="text-base font-semibold">{emp.nome_fantasia || emp.razao_social}</span>
                              </SheetTitle>
                            </SheetHeader>
                            <DetalheEmpresa
                              company={emp}
                              contactIntel={contactIntelByCnpj[emp.cnpj] ?? null}
                              isResolvingContactIntel={resolvingIntelCnpjs.has(emp.cnpj)}
                              onResolveContactIntel={() => void resolveOneContactIntel(emp.cnpj)}
                            />
                          </SheetContent>
                        </Sheet>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={saveListOpen} onOpenChange={setSaveListOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Salvar selecao em lista</DialogTitle>
            <DialogDescription>
              Guarde esse lote para outreach, revisao ou nova rodada operacional.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">Destino</p>
              <Select value={saveListTarget} onValueChange={setSaveListTarget}>
                <SelectTrigger className="border-zinc-700 bg-zinc-900">
                  <SelectValue placeholder="Escolha uma lista" />
                </SelectTrigger>
                <SelectContent>
                  {leadLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list.item_count})
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">Criar nova lista</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {saveListTarget === "__new__" && (
              <>
                <Input
                  value={newListName}
                  onChange={(event) => setNewListName(event.target.value)}
                  placeholder="Nome da nova lista"
                  className="border-zinc-700 bg-zinc-900"
                />
                <Textarea
                  value={newListDescription}
                  onChange={(event) => setNewListDescription(event.target.value)}
                  placeholder="Descricao opcional"
                  className="min-h-[88px] border-zinc-700 bg-zinc-900"
                />
              </>
            )}

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
              {selected.size} lead(s) selecionados serao salvos.
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-zinc-700 bg-zinc-900"
              onClick={() => setSaveListOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
              onClick={() => void salvarSelecionadasEmLista()}
              disabled={savingListSelection}
            >
              {savingListSelection ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
              Salvar lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suppressSelectionOpen} onOpenChange={setSuppressSelectionOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Suprimir selecao</DialogTitle>
            <DialogDescription>
              Esses CNPJs saem do fluxo operacional e deixam de aparecer nas proximas rodadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={suppressionReason}
              onChange={(event) => setSuppressionReason(event.target.value)}
              placeholder="Motivo da supressao"
              className="min-h-[96px] border-zinc-700 bg-zinc-900"
            />
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
              {selected.size} lead(s) selecionados serao removidos da tela e bloqueados nas proximas prospeccoes.
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-zinc-700 bg-zinc-900"
              onClick={() => setSuppressSelectionOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-amber-500 text-zinc-950 hover:bg-amber-400"
              onClick={() => void suprimirSelecionadas()}
              disabled={savingSuppressionSelection}
            >
              {savingSuppressionSelection ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldBan className="mr-2 h-4 w-4" />}
              Suprimir lote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResultsPage;
