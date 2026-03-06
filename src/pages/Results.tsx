// src/pages/Results.tsx
import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Download, ExternalLink, Globe,
  MapPin, Building2, Users, Instagram, Linkedin, Facebook,
  Tag, Link2, MessageCircle, Share2, Sparkles,
  Mail, Phone, LayoutGrid, List, ChevronDown,
  ArrowUpDown, CheckSquare2, X, Copy, Check,
  TrendingUp, Percent, Wallet, Target, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Empresa, SocioEstruturado,
  ExecucaoResumo, getResultadosUltimaExecucao,
  addToPipeline,
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
  const linkedin = redesRaw.find(l => /linkedin/i.test(l))
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
function DetalheEmpresa({ company }: { company: Empresa }) {
  const [crmOpen, setCrmOpen] = useState(false);
  const raw  = company.outras_informacoes || "";
  const redesRaw = (company.redes_sociais_empresa ?? []).length
    ? company.redes_sociais_empresa!
    : filterSocialLinks(extractLinks(raw));
  const resumoIA =
    (company.resumo_ia_empresa as string | undefined) ||
    raw.match(/Resumo IA:\s*(.+)$/i)?.[1]?.trim() || null;

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
          { label: "WhatsApp",  icon: MessageCircle, value: company.whatsapp_enriquecido || company.whatsapp_publico, href: (v: string) => v.startsWith("http") ? v : `https://wa.me/${v.replace(/\D/g, "")}`, color: "text-emerald-400" },
          { label: "E-mail",    icon: Mail,          value: company.email_enriquecido || company.email,               href: (v: string) => `mailto:${v}`,                                                              color: "text-sky-400" },
          { label: "Telefone",  icon: Phone,         value: company.telefone_padrao || company.telefone_receita,       href: (v: string) => `tel:${v}`,                                                                 color: "text-zinc-300" },
          { label: "Telefone 2",icon: Phone,         value: company.telefone_estab2,                                  href: (v: string) => `tel:${v}`,                                                                 color: "text-zinc-300" },
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
                const linkedin = company.redes_sociais_socios
                  ?.find(r => r.nome.toLowerCase().slice(0,8) === s.nome.toLowerCase().slice(0,8))
                  ?.links?.find(l => /linkedin/i.test(l));
                return (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-2.5">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-zinc-100">{s.nome}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {s.qualificacao && (
                          <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-[10px] text-violet-300">
                            {s.qualificacao}
                          </Badge>
                        )}
                        {s.data_entrada && <span className="text-[10px] text-zinc-500">desde {s.data_entrada}</span>}
                      </div>
                    </div>
                    {linkedin && (
                      <a href={linkedin} target="_blank" rel="noreferrer"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                        <Linkedin className="h-3.5 w-3.5" />
                      </a>
                    )}
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
function EmpresaCard({ emp, selected, onSelect }: {
  emp: Empresa;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const [mensagemOpen, setMensagemOpen] = useState(false);

  const handlePipeline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const r = await addToPipeline(emp, emp.score_icp ?? 0);
      if (r === "added") toast.success(`${emp.nome_fantasia || emp.razao_social} adicionado ao pipeline`);
      else toast.info("Empresa já está no pipeline");
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
            <DetalheEmpresa company={emp} />
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
          <Target className="h-3 w-3" /> Pipeline
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
  const [empresas, setEmpresas]     = useState<Empresa[]>([]);
  const [execucao, setExecucao]     = useState<ExecucaoResumo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode]     = useState<"cards" | "table">("cards");
  const [sortKey, setSortKey]       = useState<SortKey>("score_icp");
  const [sortAsc, setSortAsc]       = useState(false);
  const [activeChips, setActiveChips] = useState<FilterChip[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const p = await getResultadosUltimaExecucao();
        setEmpresas(p.resultados || []);
        setExecucao(p.execucao);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const t = empresas.length;
    if (!t) return null;
    const comEmail = empresas.filter(e => e.email || e.email_enriquecido).length;
    const comWa    = empresas.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido).length;
    const comLinkedin = empresas.filter(e => {
      const links = [
        ...(e.redes_sociais_empresa ?? []),
        ...(e.redes_sociais_socios?.flatMap(s => s.links) ?? []),
        ...extractLinks(e.outras_informacoes),
      ];
      return links.some(l => /linkedin/i.test(l));
    }).length;
    const scoreList = empresas.map(e => e.score_icp ?? 0);
    const scoreAvg  = scoreList.reduce((a, b) => a + b, 0) / t;
    return { t, comEmail, comWa, comLinkedin, scoreAvg };
  }, [empresas]);

  // ── filtros + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...empresas];

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
  }, [empresas, searchTerm, activeChips, sortKey, sortAsc]);

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
              <DropdownMenuItem onClick={() => downloadCsv(empresas, "hermes-todos")}>
                CSV — todos ({empresas.length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <span>{filtered.length} de {empresas.length}</span>
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
                            <DetalheEmpresa company={emp} />
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
    </div>
  );
};

export default ResultsPage;
