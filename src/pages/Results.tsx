// src/pages/Results.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Box,
  Stack,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  CircularProgress,
  Tooltip,
  Paper,
  Checkbox,
  Drawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Menu,
  InputAdornment,
  Divider,
  FormControl,
  InputLabel,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LanguageIcon from "@mui/icons-material/Language";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import BusinessIcon from "@mui/icons-material/Business";
import GroupsIcon from "@mui/icons-material/Groups";
import InstagramIcon from "@mui/icons-material/Instagram";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import FacebookIcon from "@mui/icons-material/Facebook";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import LinkIcon from "@mui/icons-material/Link";
import ChatIcon from "@mui/icons-material/Chat";
import ShareIcon from "@mui/icons-material/Share";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MailIcon from "@mui/icons-material/Mail";
import PhoneIcon from "@mui/icons-material/Phone";
import GridViewIcon from "@mui/icons-material/GridView";
import ListIcon from "@mui/icons-material/List";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WalletIcon from "@mui/icons-material/AccountBalanceWallet";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import GppBadIcon from "@mui/icons-material/GppBad";
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
  Hospitais:      "#f43f5e",
  "Clínicas":     "#ec4899",
  "Laboratórios": "#8b5cf6",
  "Farmácias":    "#0ea5e9",
  Supermercados:  "#f59e0b",
  "Logística":    "#f97316",
  "Indústria":    "#3b82f6",
  "Serviços":     "#10b981",
};

function avatarBg(seg?: string | null) {
  return SEG_COLORS[seg ?? ""] ?? "#4b5563";
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function scoreColor(s?: number | null): "success" | "warning" | "error" | "default" {
  if (!s) return "default";
  if (s >= 80) return "success";
  if (s >= 50) return "warning";
  return "error";
}

function scoreHex(s?: number | null) {
  if (!s) return "#6b7280";
  if (s >= 80) return "#10b981";
  if (s >= 50) return "#f59e0b";
  return "#f43f5e";
}

function getPorteColor(p?: string | null): "info" | "success" | "warning" | "secondary" | "default" {
  const map: Record<string, "info" | "success" | "warning" | "secondary"> = {
    ME: "info",
    EPP: "success",
    "Médio/Grande": "warning",
    Grande: "secondary",
  };
  return map[p ?? ""] ?? "default";
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

function intelStatusColor(status?: string | null): "success" | "info" | "warning" | "error" | "default" {
  switch (status) {
    case "verified": return "success";
    case "deliverable":
    case "mx_only": return "info";
    case "risky": return "warning";
    case "invalid": return "error";
    default: return "default";
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
    <Tooltip title={`Copiar: ${text}`}>
      <IconButton
        size="small"
        onClick={e => {
          e.stopPropagation();
          navigator.clipboard.writeText(text).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        sx={{ p: 0.25, color: "text.secondary" }}
      >
        {copied
          ? <CheckIcon sx={{ fontSize: 12, color: "#10b981" }} />
          : <ContentCopyIcon sx={{ fontSize: 12 }} />}
      </IconButton>
    </Tooltip>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score?: number | null }) {
  const s = score ?? 0;
  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Box sx={{ width: 64, height: 6, borderRadius: 3, bgcolor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <Box sx={{
          height: "100%",
          borderRadius: 3,
          width: `${Math.min(100, s)}%`,
          bgcolor: scoreHex(s),
          transition: "width 0.3s",
        }} />
      </Box>
      <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600, color: scoreHex(s), fontVariantNumeric: "tabular-nums" }}>
        {s.toFixed(0)}
      </Typography>
    </Stack>
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
    <Stack direction="row" spacing={0.5} alignItems="center">
      {wa && (
        <Tooltip title={`WhatsApp: ${wa}`}>
          <IconButton
            size="small"
            component="a"
            href={wa.startsWith("http") ? wa : `https://wa.me/${wa.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            sx={{
              width: 28, height: 28, border: "1px solid rgba(16,185,129,0.4)",
              bgcolor: "rgba(16,185,129,0.1)", color: "#10b981",
              "&:hover": { bgcolor: "rgba(16,185,129,0.2)" },
            }}
          >
            <ChatIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
      {email && (
        <Tooltip title={`E-mail: ${email}`}>
          <IconButton
            size="small"
            component="a"
            href={`mailto:${email}`}
            onClick={e => e.stopPropagation()}
            sx={{
              width: 28, height: 28, border: "1px solid rgba(14,165,233,0.4)",
              bgcolor: "rgba(14,165,233,0.1)", color: "#0ea5e9",
              "&:hover": { bgcolor: "rgba(14,165,233,0.2)" },
            }}
          >
            <MailIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
      {tel && (
        <Tooltip title={`Telefone: ${tel}`}>
          <IconButton
            size="small"
            component="a"
            href={`tel:${tel}`}
            onClick={e => e.stopPropagation()}
            sx={{
              width: 28, height: 28, border: "1px solid rgba(255,255,255,0.07)",
              bgcolor: "rgba(255,255,255,0.04)", color: "text.secondary",
              "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
            }}
          >
            <PhoneIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
      {linkedin && (
        <Tooltip title="LinkedIn">
          <IconButton
            size="small"
            component="a"
            href={linkedin}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            sx={{
              width: 28, height: 28, border: "1px solid rgba(59,130,246,0.4)",
              bgcolor: "rgba(59,130,246,0.1)", color: "#60a5fa",
              "&:hover": { bgcolor: "rgba(59,130,246,0.2)" },
            }}
          >
            <LinkedInIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
      {emp.site && (
        <Tooltip title={emp.site}>
          <IconButton
            size="small"
            component="a"
            href={emp.site.startsWith("http") ? emp.site : `https://${emp.site}`}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            sx={{
              width: 28, height: 28, border: "1px solid rgba(255,255,255,0.07)",
              bgcolor: "rgba(255,255,255,0.04)", color: "text.secondary",
              "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
            }}
          >
            <LanguageIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

// ─── Detalhe lateral (Drawer) ─────────────────────────────────────────────────
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

  const sectionSx = {
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.07)",
    bgcolor: "rgba(255,255,255,0.02)",
    p: 2,
  };

  return (
    <Stack spacing={2.5} sx={{ pb: 4, fontSize: 14 }}>

      {/* Identificação */}
      <Box sx={sectionSx}>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5, mb: 1.5 }}>
          <BusinessIcon sx={{ fontSize: 12 }} /> Identificação
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box sx={{
            width: 40, height: 40, flexShrink: 0, borderRadius: "10px",
            bgcolor: avatarBg(company.segmento), display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}>
            {initials(company.nome_fantasia || company.razao_social)}
          </Box>
          <Box>
            <Typography variant="body2" fontWeight={600}>{company.nome_fantasia || company.razao_social}</Typography>
            <Typography variant="caption" color="text.secondary">{company.razao_social}</Typography>
            <Typography variant="caption" sx={{ display: "block", fontFamily: "monospace", fontSize: 11, color: "text.disabled", mt: 0.25 }}>{company.cnpj}</Typography>
          </Box>
        </Stack>
        <Stack direction="row" flexWrap="wrap" spacing={0.75} sx={{ mt: 1.5 }}>
          {company.porte && <Chip label={company.porte} size="small" color={getPorteColor(company.porte)} variant="outlined" sx={{ fontSize: 10 }} />}
          {company.score_icp != null && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, borderRadius: "999px", border: "1px solid rgba(255,255,255,0.07)", bgcolor: "rgba(255,255,255,0.03)", px: 1, py: 0.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Score ICP</Typography>
              <ScoreBar score={company.score_icp} />
            </Box>
          )}
          {company.situacao_cadastral && <Chip label={company.situacao_cadastral} size="small" color="success" variant="outlined" sx={{ fontSize: 10 }} />}
        </Stack>
      </Box>

      {/* Dados cadastrais */}
      <Box sx={sectionSx}>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5, mb: 1.5 }}>
          <LocalOfferIcon sx={{ fontSize: 12 }} /> Dados cadastrais
        </Typography>
        <Stack spacing={1}>
          {company.cnae_principal && (
            <Stack direction="row" spacing={1.5}>
              <Typography variant="caption" color="text.disabled" sx={{ minWidth: 80 }}>CNAE</Typography>
              <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{company.cnae_principal}{company.cnae_descricao && <span style={{ fontFamily: "inherit", color: "rgba(240,240,240,0.7)", marginLeft: 4 }}>— {company.cnae_descricao}</span>}</Typography>
            </Stack>
          )}
          {company.cnaes_secundarios && company.cnaes_secundarios.length > 0 && (
            <Stack direction="row" spacing={1.5}>
              <Typography variant="caption" color="text.disabled" sx={{ minWidth: 80 }}>CNAEs sec.</Typography>
              <Typography variant="caption" color="text.secondary">
                {company.cnaes_secundarios.slice(0, 4).map(c => c.descricao || c.cnae).join(" · ")}
                {company.cnaes_secundarios.length > 4 && ` +${company.cnaes_secundarios.length - 4}`}
              </Typography>
            </Stack>
          )}
          {company.capital_social != null && (
            <Stack direction="row" spacing={1.5}>
              <Typography variant="caption" color="text.disabled" sx={{ minWidth: 80 }}>Capital</Typography>
              <Typography variant="caption" fontWeight={500}>
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(company.capital_social)}
              </Typography>
            </Stack>
          )}
          {company.natureza_juridica && (
            <Stack direction="row" spacing={1.5}>
              <Typography variant="caption" color="text.disabled" sx={{ minWidth: 80 }}>Natureza Jur.</Typography>
              <Typography variant="caption">{company.natureza_juridica}</Typography>
            </Stack>
          )}
          {company.data_abertura && (
            <Stack direction="row" spacing={1.5}>
              <Typography variant="caption" color="text.disabled" sx={{ minWidth: 80 }}>Fundação</Typography>
              <Typography variant="caption">{company.data_abertura}</Typography>
            </Stack>
          )}
          {company.segmento && (
            <Stack direction="row" spacing={1.5}>
              <Typography variant="caption" color="text.disabled" sx={{ minWidth: 80 }}>Segmento</Typography>
              <Typography variant="caption">{company.segmento}{company.subsegmento && <span style={{ color: "rgba(240,240,240,0.5)", marginLeft: 4 }}>· {company.subsegmento}</span>}</Typography>
            </Stack>
          )}
        </Stack>
        {company.sidra_pib && (
          <Box sx={{ mt: 1.5, borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", bgcolor: "rgba(255,255,255,0.02)", px: 1.5, py: 1 }}>
            <Typography variant="caption" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.disabled", display: "block", mb: 0.25 }}>PIB do município (IBGE)</Typography>
            <Typography variant="caption">
              R$ {(company.sidra_pib / 1_000_000).toFixed(1)} milhões
              {company.sidra_populacao && ` · ${Math.round(company.sidra_populacao).toLocaleString("pt-BR")} hab.`}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Localização */}
      <Box sx={sectionSx}>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
          <LocationOnIcon sx={{ fontSize: 12 }} /> Localização
        </Typography>
        <Typography variant="body2" fontWeight={500}>{company.cidade || "—"}{company.uf && ` / ${company.uf}`}</Typography>
        {(company.logradouro || company.bairro) && (
          <Typography variant="caption" color="text.secondary">
            {[company.logradouro, company.numero, company.complemento].filter(Boolean).join(", ")}
            {company.bairro && ` · ${company.bairro}`}
            {company.cep && ` · CEP ${company.cep}`}
          </Typography>
        )}
      </Box>

      {/* Contatos */}
      <Box sx={sectionSx}>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5, mb: 1.5 }}>
          <LanguageIcon sx={{ fontSize: 12 }} /> Contatos e presença digital
        </Typography>
        <Stack spacing={1}>
          {company.site && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <LinkIcon sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />
              <Typography component="a" href={company.site.startsWith("http") ? company.site : `https://${company.site}`} target="_blank" rel="noreferrer" variant="caption" sx={{ color: "primary.main", wordBreak: "break-all", "&:hover": { textDecoration: "underline" } }}>
                {company.site}
              </Typography>
            </Stack>
          )}
          {[
            { label: "WhatsApp", Icon: ChatIcon, value: whatsCaptados[0]?.valor, href: (v: string) => v.startsWith("http") ? v : `https://wa.me/${v.replace(/\D/g, "")}`, color: "#10b981" },
            { label: "E-mail", Icon: MailIcon, value: emailsCaptados[0]?.valor, href: (v: string) => `mailto:${v}`, color: "#0ea5e9" },
            { label: "Telefone", Icon: PhoneIcon, value: telefonesCaptados[0]?.valor, href: (v: string) => `tel:${v}`, color: "rgba(240,240,240,0.8)" },
            { label: "LinkedIn", Icon: LinkedInIcon, value: primaryLinkedin(company), href: (v: string) => v, color: "#60a5fa" },
          ].filter(c => c.value).map(c => (
            <Stack key={c.label} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <c.Icon sx={{ fontSize: 14, color: c.color }} />
                <Typography variant="caption" color="text.secondary">{c.label}</Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography component="a" href={c.href(c.value!)} target="_blank" rel="noreferrer" variant="caption" fontWeight={500} sx={{ color: "text.primary", wordBreak: "break-all", "&:hover": { color: "primary.main", textDecoration: "underline" } }}>
                  {c.value}
                </Typography>
                <CopyBtn text={c.value!} />
              </Stack>
            </Stack>
          ))}

          {emailsCaptados.length > 1 && (
            <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", pt: 1.5 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, display: "block", mb: 1 }}>E-mails captados</Typography>
              <Stack spacing={1}>
                {emailsCaptados.slice(1).map(item => (
                  <Stack key={item.valor} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <MailIcon sx={{ fontSize: 14, color: "#0ea5e9" }} />
                      <Typography component="a" href={`mailto:${item.valor}`} variant="caption" fontWeight={500} sx={{ color: "text.primary", wordBreak: "break-all", "&:hover": { textDecoration: "underline" } }}>{item.valor}</Typography>
                    </Stack>
                    <Chip label={contactSource(item)} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {whatsCaptados.length > 1 && (
            <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", pt: 1.5 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, display: "block", mb: 1 }}>WhatsApps captados</Typography>
              <Stack spacing={1}>
                {whatsCaptados.slice(1).map(item => (
                  <Stack key={item.valor} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <ChatIcon sx={{ fontSize: 14, color: "#10b981" }} />
                      <Typography component="a" href={`https://wa.me/${item.valor.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" variant="caption" fontWeight={500} sx={{ color: "text.primary", "&:hover": { textDecoration: "underline" } }}>{item.valor}</Typography>
                    </Stack>
                    <Chip label={contactSource(item)} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {telefonesCaptados.length > 1 && (
            <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", pt: 1.5 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, display: "block", mb: 1 }}>Telefones captados</Typography>
              <Stack spacing={1}>
                {telefonesCaptados.slice(1).map(item => (
                  <Stack key={item.valor} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <PhoneIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                      <Typography component="a" href={`tel:${item.valor}`} variant="caption" fontWeight={500} sx={{ color: "text.primary", "&:hover": { textDecoration: "underline" } }}>{item.valor}</Typography>
                    </Stack>
                    <Chip label={contactSource(item)} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {(company.registro_dono || company.registro_email || company.fonte_dados_prioritaria) && (
            <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", pt: 1.5 }}>
              {company.registro_dono && <Typography variant="caption" display="block"><span style={{ color: "rgba(240,240,240,0.5)" }}>Registro.br:</span> {company.registro_dono}</Typography>}
              {company.registro_email && <Typography variant="caption" display="block"><span style={{ color: "rgba(240,240,240,0.5)" }}>E-mail do registro:</span> {company.registro_email}</Typography>}
              {company.fonte_dados_prioritaria && <Typography variant="caption" display="block"><span style={{ color: "rgba(240,240,240,0.5)" }}>Fonte principal:</span> {company.fonte_dados_prioritaria}</Typography>}
            </Box>
          )}

          {redesRaw.length > 0 && (
            <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", pt: 1.5 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
                <ShareIcon sx={{ fontSize: 12 }} /> Redes sociais
              </Typography>
              <Stack spacing={0.75}>
                {redesRaw.map(link => {
                  const t = detectSocial(link);
                  return (
                    <Typography key={link} component="a" href={link} target="_blank" rel="noreferrer" variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "primary.main", wordBreak: "break-all", "&:hover": { textDecoration: "underline" } }}>
                      {t === "instagram" && <InstagramIcon sx={{ fontSize: 12, color: "#f472b6", flexShrink: 0 }} />}
                      {t === "linkedin" && <LinkedInIcon sx={{ fontSize: 12, color: "#0ea5e9", flexShrink: 0 }} />}
                      {t === "facebook" && <FacebookIcon sx={{ fontSize: 12, color: "#60a5fa", flexShrink: 0 }} />}
                      {t === "other" && <OpenInNewIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />}
                      {link}
                    </Typography>
                  );
                })}
              </Stack>
            </Box>
          )}

          {resumoIA && (
            <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", pt: 1.5 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, display: "flex", alignItems: "center", gap: 0.5, mb: 0.75 }}>
                <AutoAwesomeIcon sx={{ fontSize: 12 }} /> Resumo IA
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>{resumoIA}</Typography>
            </Box>
          )}
        </Stack>
      </Box>

      {/* Sócios */}
      {(company.socios_estruturado?.length || company.socios_resumo || company.redes_sociais_socios?.length) ? (
        <Box sx={sectionSx}>
          <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5, mb: 1.5 }}>
            <GroupsIcon sx={{ fontSize: 12 }} /> Sócios / Decisores
          </Typography>
          {company.socios_estruturado && company.socios_estruturado.length > 0 ? (
            <Stack spacing={1.5}>
              {company.socios_estruturado.map((s: SocioEstruturado, i: number) => {
                const linkedin = s.linkedin || company.redes_sociais_socios
                  ?.find(r => r.nome.toLowerCase().slice(0,8) === s.nome.toLowerCase().slice(0,8))
                  ?.links?.find(l => /linkedin/i.test(l));
                const whatsapp = s.whatsapp;
                const email = s.email;
                const telefone = s.telefone;
                return (
                  <Box key={i} sx={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", bgcolor: "rgba(255,255,255,0.02)", p: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" fontWeight={500}>{s.nome}</Typography>
                        <Stack direction="row" flexWrap="wrap" spacing={0.5} sx={{ mt: 0.5 }}>
                          {s.qualificacao && <Chip label={s.qualificacao} size="small" color="secondary" variant="outlined" sx={{ fontSize: 10, height: 18 }} />}
                          {s.data_entrada && <Typography variant="caption" color="text.disabled">desde {s.data_entrada}</Typography>}
                          {s.cargo_atual && <Typography variant="caption" color="text.disabled">{s.cargo_atual}</Typography>}
                        </Stack>
                        <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                          {email && <Typography variant="caption" color="text.secondary">E-mail: <a href={`mailto:${email}`} style={{ color: "inherit" }}>{email}</a></Typography>}
                          {whatsapp && <Typography variant="caption" color="text.secondary">WhatsApp: <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{whatsapp}</a></Typography>}
                          {telefone && <Typography variant="caption" color="text.secondary">Telefone: <a href={`tel:${telefone}`} style={{ color: "inherit" }}>{telefone}</a></Typography>}
                          {s.emails_alternativos && s.emails_alternativos.length > 0 && (
                            <Typography variant="caption" color="text.disabled">Alternativos: {s.emails_alternativos.join(" · ")}</Typography>
                          )}
                          {s.fonte_contato && <Typography variant="caption" color="text.disabled">Fonte: {s.fonte_contato}</Typography>}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        {email && (
                          <IconButton size="small" component="a" href={`mailto:${email}`} sx={{ width: 28, height: 28, border: "1px solid rgba(14,165,233,0.4)", bgcolor: "rgba(14,165,233,0.1)", color: "#0ea5e9", "&:hover": { bgcolor: "rgba(14,165,233,0.2)" } }}>
                            <MailIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                        {whatsapp && (
                          <IconButton size="small" component="a" href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" sx={{ width: 28, height: 28, border: "1px solid rgba(16,185,129,0.4)", bgcolor: "rgba(16,185,129,0.1)", color: "#10b981", "&:hover": { bgcolor: "rgba(16,185,129,0.2)" } }}>
                            <ChatIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                        {linkedin && (
                          <IconButton size="small" component="a" href={linkedin} target="_blank" rel="noreferrer" sx={{ width: 28, height: 28, border: "1px solid rgba(59,130,246,0.4)", bgcolor: "rgba(59,130,246,0.1)", color: "#60a5fa", "&:hover": { bgcolor: "rgba(59,130,246,0.2)" } }}>
                            <LinkedInIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          ) : company.socios_resumo ? (
            <Stack spacing={0.5}>
              {company.socios_resumo.split("\n").map((s, i) => <Typography key={i} variant="caption" color="text.secondary">{s}</Typography>)}
            </Stack>
          ) : null}
        </Box>
      ) : null}

      {/* Contact Intelligence */}
      <Box sx={sectionSx}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5 }}>
              <VerifiedUserIcon sx={{ fontSize: 12 }} /> Contact Intelligence
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
              Domínio validado, padrão corporativo, caixas gerais e decisores resolvidos.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={isResolvingContactIntel ? <CircularProgress size={14} /> : <VerifiedUserIcon />}
            onClick={onResolveContactIntel}
            disabled={isResolvingContactIntel || !onResolveContactIntel}
            sx={{ border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd", bgcolor: "rgba(139,92,246,0.1)", whiteSpace: "nowrap", "&:hover": { bgcolor: "rgba(139,92,246,0.15)" } }}
          >
            {contactIntel ? "Atualizar" : "Resolver"}
          </Button>
        </Stack>

        {contactIntel ? (
          <Stack spacing={2}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              {[
                { label: "Domínio", value: contactIntel.domain_profile.domain || "Não resolvido", sub: contactIntel.domain_profile.site_url?.replace(/^https?:\/\//, "") },
                { label: "Padrão", value: formatIntelPattern(contactIntel.domain_profile.email_pattern), sub: `Confiança ${formatIntelPercent(contactIntel.domain_profile.pattern_confidence)}` },
                { label: "Emails acionáveis", value: String(contactIntel.summary.deliverable ?? 0), sub: `${contactIntel.summary.verified ?? 0} verificados` },
                { label: "Decisores", value: String(contactIntel.summary.decision_makers ?? 0), sub: `${contactIntel.summary.sourced ?? 0} sourced · ${contactIntel.summary.guessed ?? 0} guessed` },
              ].map(item => (
                <Box key={item.label} sx={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", bgcolor: "rgba(255,255,255,0.02)", p: 1.5 }}>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>{item.label}</Typography>
                  <Typography variant="body2" fontWeight={500} sx={{ mt: 0.5, wordBreak: "break-all" }}>{item.value}</Typography>
                  {item.sub && <Typography variant="caption" color="text.disabled">{item.sub}</Typography>}
                </Box>
              ))}
            </Box>

            {(contactIntel.domain_profile.generic_inboxes?.length ?? 0) > 0 && (
              <Box>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", mb: 1 }}>Caixas gerais</Typography>
                <Stack direction="row" flexWrap="wrap" spacing={0.75}>
                  {(contactIntel.domain_profile.generic_inboxes ?? []).slice(0, 6).map(item => (
                    <Chip key={item.email} label={item.email} size="small" color="success" variant="outlined" sx={{ fontSize: 10 }} />
                  ))}
                </Stack>
              </Box>
            )}

            {(contactIntel.contacts?.length ?? 0) > 0 ? (
              <Box>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", mb: 1 }}>Decisores resolvidos</Typography>
                <Stack spacing={1.5}>
                  {(contactIntel.contacts ?? []).slice(0, 4).map(contact => {
                    const primary = contact.emails.find(item => item.is_primary) || contact.emails[0];
                    return (
                      <Box key={`${company.cnpj}-${contact.name}`} sx={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", bgcolor: "rgba(255,255,255,0.02)", p: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                          <Box>
                            <Typography variant="caption" fontWeight={500}>{contact.name}</Typography>
                            <Typography variant="caption" color="text.disabled" display="block">{contact.role || "Decisor potencial"}</Typography>
                          </Box>
                          {primary?.verification_status && (
                            <Chip label={primary.verification_status} size="small" color={intelStatusColor(primary.verification_status)} variant="outlined" sx={{ fontSize: 10, height: 18, textTransform: "capitalize" }} />
                          )}
                        </Stack>
                        {primary ? (
                          <Box sx={{ mt: 1.5 }}>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                              <MailIcon sx={{ fontSize: 14, color: "#0ea5e9" }} />
                              <Typography component="a" href={`mailto:${primary.email}`} variant="caption" fontWeight={500} sx={{ color: "text.primary", wordBreak: "break-all", "&:hover": { textDecoration: "underline" } }}>{primary.email}</Typography>
                            </Stack>
                            <Stack direction="row" flexWrap="wrap" spacing={0.5}>
                              <Typography variant="caption" color="text.disabled">Score {formatIntelPercent(primary.score_total)}</Typography>
                              <Typography variant="caption" color="text.disabled">·</Typography>
                              <Typography variant="caption" color="text.disabled">{primary.kind === "sourced" ? "Sourced" : "Guessed"}</Typography>
                              {primary.source_label && <>
                                <Typography variant="caption" color="text.disabled">·</Typography>
                                <Typography variant="caption" color="text.disabled">{primary.source_label}</Typography>
                              </>}
                            </Stack>
                            {contact.linkedin && (
                              <Typography component="a" href={contact.linkedin} target="_blank" rel="noreferrer" variant="caption" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "#67e8f9", "&:hover": { textDecoration: "underline" }, mt: 0.75 }}>
                                <LinkedInIcon sx={{ fontSize: 12 }} /> Abrir LinkedIn
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>Sem email resolvido para este contato.</Typography>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            ) : (
              <Box sx={{ border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "8px", p: 1.5 }}>
                <Typography variant="caption" color="text.disabled">
                  Nenhum decisor resolvido ainda. Rode a resolução para inferir padrão de email e validar contatos.
                </Typography>
              </Box>
            )}
          </Stack>
        ) : (
          <Box sx={{ border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "8px", p: 1.5 }}>
            <Typography variant="caption" color="text.disabled">
              Este lead ainda não passou pelo módulo Hunter-style. Use o botão acima para carregar do cache ou resolver agora.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Integração */}
      <Box sx={sectionSx}>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "text.secondary", display: "block", mb: 1.5 }}>Integração</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<BusinessIcon />}
          onClick={() => setCrmOpen(true)}
          sx={{ border: "1px solid rgba(14,165,233,0.4)", color: "#0ea5e9", "&:hover": { bgcolor: "rgba(14,165,233,0.08)" } }}
        >
          Enviar para CRM
        </Button>
      </Box>

      <CrmExportModal open={crmOpen} onClose={() => setCrmOpen(false)} empresa={company} />
    </Stack>
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
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    <Card sx={{
      border: selected ? "1px solid rgba(249,115,22,0.6)" : "1px solid rgba(255,255,255,0.07)",
      bgcolor: selected ? "rgba(249,115,22,0.05)" : "#181818",
      borderRadius: "12px",
      position: "relative",
      transition: "border-color 0.15s, box-shadow 0.15s",
      "&:hover": { borderColor: "rgba(249,115,22,0.3)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
      "&:hover .card-checkbox": { opacity: 1 },
      "&:hover .card-detail-btn": { opacity: 1 },
    }}>
      <CardContent sx={{ p: 2 }}>
        {/* Checkbox */}
        <Box
          className="card-checkbox"
          sx={{ position: "absolute", left: 12, top: 12, opacity: selected ? 1 : 0, transition: "opacity 0.15s", zIndex: 1 }}
          onClick={e => e.stopPropagation()}
        >
          <Checkbox size="small" checked={selected} onChange={e => onSelect(e.target.checked)} sx={{ p: 0 }} />
        </Box>

        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, flexShrink: 0, borderRadius: "10px",
            bgcolor: avatarBg(emp.segmento), display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}>
            {initials(emp.nome_fantasia || emp.razao_social)}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>{emp.nome_fantasia || emp.razao_social}</Typography>
            <Typography variant="caption" color="text.disabled" noWrap>{emp.razao_social}</Typography>
          </Box>
          <Tooltip title="Ver detalhes">
            <IconButton
              className="card-detail-btn"
              size="small"
              onClick={() => setDrawerOpen(true)}
              sx={{ opacity: 0, transition: "opacity 0.15s", width: 28, height: 28 }}
            >
              <OpenInNewIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Badges */}
        <Stack direction="row" flexWrap="wrap" spacing={0.5} sx={{ mb: 1.5 }}>
          {emp.segmento && <Chip label={emp.segmento} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
          {emp.porte && <Chip label={emp.porte} size="small" color={getPorteColor(emp.porte)} variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
          <Chip
            icon={<LocationOnIcon sx={{ fontSize: 10 }} />}
            label={emp.cidade || "—"}
            size="small"
            variant="outlined"
            sx={{ fontSize: 10, height: 20 }}
          />
        </Stack>

        {/* Métricas */}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 1.5 }}>
          <Box sx={{ borderRadius: "8px", bgcolor: "rgba(255,255,255,0.03)", px: 1.25, py: 1 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>Capital</Typography>
            <Typography variant="caption" fontWeight={500} display="block">{formatBRL(emp.capital_social)}</Typography>
          </Box>
          <Box sx={{ borderRadius: "8px", bgcolor: "rgba(255,255,255,0.03)", px: 1.25, py: 1 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>Score ICP</Typography>
            <ScoreBar score={emp.score_icp} />
          </Box>
        </Box>

        {/* Ações de contato */}
        <ContactRow emp={emp} />

        {/* Ações rápidas */}
        <Stack direction="row" spacing={0.5} sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Button
            size="small"
            variant="text"
            startIcon={<TrackChangesIcon sx={{ fontSize: 12 }} />}
            onClick={handlePipeline}
            sx={{ flex: 1, fontSize: 10, color: "text.disabled", "&:hover": { color: "primary.main", bgcolor: "rgba(249,115,22,0.08)" } }}
          >
            Pipeline + SDR
          </Button>
          <Button
            size="small"
            variant="text"
            startIcon={<AutoFixHighIcon sx={{ fontSize: 12 }} />}
            onClick={e => { e.stopPropagation(); setMensagemOpen(true); }}
            sx={{ flex: 1, fontSize: 10, color: "text.disabled", "&:hover": { color: "#f59e0b", bgcolor: "rgba(245,158,11,0.08)" } }}
          >
            Abordar
          </Button>
        </Stack>
      </CardContent>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 440, maxWidth: "100vw", bgcolor: "#0F0F0F", borderLeft: "1px solid rgba(255,255,255,0.07)", overflowY: "auto" } }}
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", mb: 0.5 }}>Visão detalhada</Typography>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 3 }}>{emp.nome_fantasia || emp.razao_social}</Typography>
          <DetalheEmpresa
            company={emp}
            contactIntel={contactIntel ?? null}
            isResolvingContactIntel={isResolvingContactIntel}
            onResolveContactIntel={onResolveContactIntel}
          />
        </Box>
      </Drawer>

      {mensagemOpen && (
        <MensagemModal empresa={emp} open={mensagemOpen} onClose={() => setMensagemOpen(false)} />
      )}
    </Card>
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
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const [detailDrawerEmp, setDetailDrawerEmp] = useState<Empresa | null>(null);

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
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(cnpj);
      } else {
        next.delete(cnpj);
      }
      return next;
    });

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
    <Stack spacing={3} sx={{ p: 0.5 }}>

      {/* Cabeçalho */}
      <Box>
        <Typography variant="h5" fontWeight={600} letterSpacing="-0.02em">Resultados da Prospecção</Typography>
        {execucao && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            <strong>{execucao.termo || "Sem termo"}</strong>
            {" · "}{execucao.cidade} / {execucao.uf}
            {" · "}<strong style={{ color: "#F0F0F0" }}>{execucao.total_empresas}</strong> empresas
          </Typography>
        )}
      </Box>

      {/* Stats cards */}
      {stats && (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 1.5 }}>
          {[
            { Icon: BusinessIcon, label: "Total", value: stats.t, fmt: (v: number) => String(v), color: "#F0F0F0" },
            { Icon: MailIcon, label: "Com e-mail", value: stats.comEmail, fmt: (v: number) => `${v} (${Math.round(v/stats.t*100)}%)`, color: "#0ea5e9" },
            { Icon: ChatIcon, label: "WhatsApp", value: stats.comWa, fmt: (v: number) => `${v} (${Math.round(v/stats.t*100)}%)`, color: "#10b981" },
            { Icon: TrendingUpIcon, label: "Score médio", value: stats.scoreAvg, fmt: (v: number) => v.toFixed(1), color: "#f59e0b" },
          ].map(s => (
            <Card key={s.label} sx={{ border: "1px solid rgba(255,255,255,0.07)", bgcolor: "#181818", borderRadius: "12px" }}>
              <CardContent sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5, "&:last-child": { pb: 2 } }}>
                <Box sx={{ width: 36, height: 36, borderRadius: "8px", bgcolor: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <s.Icon sx={{ fontSize: 18, color: s.color }} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  <Typography variant="h6" sx={{ fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.fmt(s.value)}</Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Toolbar */}
      <Stack spacing={1.5}>
        <Stack direction="row" flexWrap="wrap" spacing={1} alignItems="center">
          {/* Search */}
          <TextField
            size="small"
            placeholder="Buscar empresa, CNPJ, cidade, segmento..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            sx={{ flex: "1 1 280px", minWidth: 200 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: "text.disabled" }} /></InputAdornment>,
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm("")} sx={{ p: 0.25 }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {/* Sort */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<SwapVertIcon />}
            endIcon={<KeyboardArrowDownIcon />}
            onClick={e => setSortMenuAnchor(e.currentTarget)}
            sx={{ height: 36, border: "1px solid rgba(255,255,255,0.14)", bgcolor: "rgba(255,255,255,0.03)" }}
          >
            Ordenar
          </Button>
          <Menu anchorEl={sortMenuAnchor} open={Boolean(sortMenuAnchor)} onClose={() => setSortMenuAnchor(null)}>
            {([
              { key: "score_icp", label: "Score ICP" },
              { key: "capital_social", label: "Capital Social" },
              { key: "razao_social", label: "Nome (A–Z)" },
            ] as { key: SortKey; label: string }[]).map(o => (
              <MenuItem
                key={o.key}
                selected={sortKey === o.key}
                onClick={() => {
                  if (sortKey === o.key) setSortAsc(p => !p);
                  else { setSortKey(o.key); setSortAsc(false); }
                  setSortMenuAnchor(null);
                }}
              >
                {o.label} {sortKey === o.key && (sortAsc ? "↑" : "↓")}
              </MenuItem>
            ))}
          </Menu>

          {/* View toggle */}
          <Box sx={{ display: "flex", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "8px", overflow: "hidden" }}>
            <IconButton
              size="small"
              onClick={() => setViewMode("cards")}
              sx={{ width: 36, height: 36, borderRadius: 0, bgcolor: viewMode === "cards" ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.03)", color: viewMode === "cards" ? "primary.main" : "text.disabled" }}
            >
              <GridViewIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setViewMode("table")}
              sx={{ width: 36, height: 36, borderRadius: 0, bgcolor: viewMode === "table" ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.03)", color: viewMode === "table" ? "primary.main" : "text.disabled" }}
            >
              <ListIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {/* Export */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            endIcon={<KeyboardArrowDownIcon />}
            onClick={e => setExportMenuAnchor(e.currentTarget)}
            sx={{ height: 36, border: "1px solid rgba(255,255,255,0.14)", bgcolor: "rgba(255,255,255,0.03)" }}
          >
            Exportar
          </Button>
          <Menu anchorEl={exportMenuAnchor} open={Boolean(exportMenuAnchor)} onClose={() => setExportMenuAnchor(null)}>
            <MenuItem onClick={() => { downloadCsv(filtered, "hermes-filtrados"); setExportMenuAnchor(null); }}>
              CSV — resultados filtrados ({filtered.length})
            </MenuItem>
            {selected.size > 0 && [
              <Divider key="div1" />,
              <MenuItem key="sel" onClick={() => { exportSelected(); setExportMenuAnchor(null); }}>
                CSV — selecionados ({selected.size})
              </MenuItem>,
            ]}
            <Divider />
            <MenuItem onClick={() => { downloadCsv(visibleEmpresas, "hermes-todos"); setExportMenuAnchor(null); }}>
              CSV — todos ({visibleEmpresas.length})
            </MenuItem>
          </Menu>

          {/* Selection actions */}
          {selected.size > 0 && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CreateNewFolderIcon />}
                onClick={() => setSaveListOpen(true)}
                sx={{ height: 36, border: "1px solid rgba(14,165,233,0.3)", color: "#67e8f9", bgcolor: "rgba(14,165,233,0.08)", "&:hover": { bgcolor: "rgba(14,165,233,0.14)" } }}
              >
                Salvar em lista ({selected.size})
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<GppBadIcon />}
                onClick={() => setSuppressSelectionOpen(true)}
                sx={{ height: 36, border: "1px solid rgba(245,158,11,0.3)", color: "#fcd34d", bgcolor: "rgba(245,158,11,0.08)", "&:hover": { bgcolor: "rgba(245,158,11,0.14)" } }}
              >
                Suprimir ({selected.size})
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={resolvingIntelBatch ? <CircularProgress size={14} /> : <VerifiedUserIcon />}
                onClick={resolverSelecionadasContactIntel}
                disabled={resolvingIntelBatch}
                sx={{ height: 36, border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd", bgcolor: "rgba(139,92,246,0.08)", "&:hover": { bgcolor: "rgba(139,92,246,0.14)" } }}
              >
                Hunter Core ({selected.size})
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={expandingSimilar ? <CircularProgress size={14} /> : <AutoFixHighIcon />}
                onClick={expandirSelecionadasParecidas}
                disabled={expandingSimilar}
                sx={{ height: 36, border: "1px solid rgba(245,158,11,0.3)", color: "#fcd34d", bgcolor: "rgba(245,158,11,0.08)", "&:hover": { bgcolor: "rgba(245,158,11,0.14)" } }}
              >
                Parecidas ({Math.min(selected.size, 5)})
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<TrackChangesIcon />}
                onClick={enviarSelecionadasParaPipelineESDR}
                sx={{ height: 36, border: "1px solid rgba(249,115,22,0.4)", color: "#f97316", bgcolor: "rgba(249,115,22,0.08)", "&:hover": { bgcolor: "rgba(249,115,22,0.14)" } }}
              >
                Pipeline + SDR ({selected.size})
              </Button>
            </>
          )}
        </Stack>

        {/* Filter chips */}
        <Stack direction="row" flexWrap="wrap" alignItems="center" spacing={1}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>Filtrar:</Typography>
          {([
            { id: "com_email" as FilterChip, label: "Com e-mail", Icon: MailIcon },
            { id: "com_whatsapp" as FilterChip, label: "Com WhatsApp", Icon: ChatIcon },
            { id: "com_linkedin" as FilterChip, label: "Com LinkedIn", Icon: LinkedInIcon },
            { id: "com_site" as FilterChip, label: "Com site", Icon: LanguageIcon },
          ]).map(chip => {
            const on = activeChips.includes(chip.id);
            return (
              <Chip
                key={chip.id}
                label={chip.label}
                icon={<chip.Icon sx={{ fontSize: 12 }} />}
                size="small"
                onClick={() => toggleChip(chip.id)}
                variant={on ? "filled" : "outlined"}
                color={on ? "primary" : "default"}
                sx={{ fontSize: 11, height: 24, cursor: "pointer" }}
              />
            );
          })}

          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1.5 }}>
            {selected.size > 0 && (
              <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 500, display: "flex", alignItems: "center", gap: 0.5 }}>
                <CheckBoxIcon sx={{ fontSize: 14 }} />
                {selected.size} selecionadas
              </Typography>
            )}
            {suppressedCount > 0 && (
              <Typography variant="caption" color="text.disabled">{suppressedCount} suprimidas</Typography>
            )}
            <Typography variant="caption" color="text.disabled">{filtered.length} de {visibleEmpresas.length}</Typography>
          </Box>
        </Stack>
      </Stack>

      {/* Conteúdo */}
      {loading ? (
        <Box sx={{ py: 10, textAlign: "center" }}>
          <CircularProgress size={32} sx={{ color: "primary.main", mb: 2 }} />
          <Typography variant="body2" color="text.secondary">Carregando resultados...</Typography>
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ py: 10, textAlign: "center" }}>
          <SearchIcon sx={{ fontSize: 40, color: "text.disabled", mb: 2 }} />
          <Typography variant="body2" color="text.secondary">Nenhuma empresa encontrada com os filtros atuais.</Typography>
          {(searchTerm || activeChips.length > 0) && (
            <Button variant="text" size="small" onClick={() => { setSearchTerm(""); setActiveChips([]); }} sx={{ mt: 1.5 }}>
              Limpar filtros
            </Button>
          )}
        </Box>
      ) : viewMode === "cards" ? (

        /* ─── CARDS ─────────────────────────────────────────────────────── */
        <>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Checkbox
              size="small"
              checked={selected.size === filtered.length && filtered.length > 0}
              indeterminate={selected.size > 0 && selected.size < filtered.length}
              onChange={toggleSelectAll}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: "pointer" }}
              onClick={toggleSelectAll}
            >
              {selected.size === filtered.length && filtered.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
            </Typography>
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 1.5 }}>
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
          </Box>
        </>

      ) : (

        /* ─── TABLE ─────────────────────────────────────────────────────── */
        <Paper sx={{ border: "1px solid rgba(255,255,255,0.07)", bgcolor: "#181818", borderRadius: "12px", overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 1.5 }}>
            <Checkbox
              size="small"
              checked={selected.size === filtered.length && filtered.length > 0}
              indeterminate={selected.size > 0 && selected.size < filtered.length}
              onChange={toggleSelectAll}
            />
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {filtered.length} empresas
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 32, bgcolor: "#202020", pl: 2 }} />
                  <TableCell sx={{ bgcolor: "#202020" }}>Empresa</TableCell>
                  <TableCell sx={{ bgcolor: "#202020" }}>Segmento</TableCell>
                  <TableCell sx={{ bgcolor: "#202020" }}>Localização</TableCell>
                  <TableCell sx={{ bgcolor: "#202020" }}>Capital</TableCell>
                  <TableCell sx={{ bgcolor: "#202020" }}>Score ICP</TableCell>
                  <TableCell sx={{ bgcolor: "#202020" }}>Contatos</TableCell>
                  <TableCell sx={{ width: 40, bgcolor: "#202020" }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(emp => (
                  <TableRow
                    key={emp.cnpj}
                    sx={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      bgcolor: selected.has(emp.cnpj) ? "rgba(249,115,22,0.06)" : "transparent",
                      "&:hover": { bgcolor: selected.has(emp.cnpj) ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.02)" },
                    }}
                  >
                    <TableCell sx={{ pl: 2, py: 1 }}>
                      <Checkbox
                        size="small"
                        checked={selected.has(emp.cnpj)}
                        onChange={e => toggleSelect(emp.cnpj, e.target.checked)}
                        sx={{ p: 0 }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={1.25}>
                        <Box sx={{
                          width: 32, height: 32, flexShrink: 0, borderRadius: "8px",
                          bgcolor: avatarBg(emp.segmento), display: "flex",
                          alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700, color: "#fff",
                        }}>
                          {initials(emp.nome_fantasia || emp.razao_social)}
                        </Box>
                        <Box>
                          <Typography variant="body2" fontWeight={500} sx={{ lineHeight: 1.3 }}>{emp.nome_fantasia || emp.razao_social}</Typography>
                          <Typography variant="caption" sx={{ fontFamily: "monospace", fontSize: 10, color: "text.disabled" }}>{emp.cnpj}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      {emp.segmento && <Chip label={emp.segmento} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <Typography variant="body2">{emp.cidade || "—"}</Typography>
                      {emp.uf && <Typography variant="caption" color="text.secondary">/ {emp.uf}</Typography>}
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <Typography variant="body2" fontWeight={500}>{formatBRL(emp.capital_social)}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <ScoreBar score={emp.score_icp} />
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <ContactRow emp={emp} />
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <Tooltip title="Ver detalhes">
                        <IconButton size="small" onClick={() => setDetailDrawerEmp(emp)} sx={{ width: 32, height: 32 }}>
                          <OpenInNewIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Table detail drawer */}
      <Drawer
        anchor="right"
        open={Boolean(detailDrawerEmp)}
        onClose={() => setDetailDrawerEmp(null)}
        PaperProps={{ sx: { width: 440, maxWidth: "100vw", bgcolor: "#0F0F0F", borderLeft: "1px solid rgba(255,255,255,0.07)", overflowY: "auto" } }}
      >
        {detailDrawerEmp && (
          <Box sx={{ p: 3 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", mb: 0.5 }}>Visão detalhada</Typography>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 3 }}>{detailDrawerEmp.nome_fantasia || detailDrawerEmp.razao_social}</Typography>
            <DetalheEmpresa
              company={detailDrawerEmp}
              contactIntel={contactIntelByCnpj[detailDrawerEmp.cnpj] ?? null}
              isResolvingContactIntel={resolvingIntelCnpjs.has(detailDrawerEmp.cnpj)}
              onResolveContactIntel={() => void resolveOneContactIntel(detailDrawerEmp.cnpj)}
            />
          </Box>
        )}
      </Drawer>

      {/* Dialog: Salvar em lista */}
      <Dialog open={saveListOpen} onClose={() => setSaveListOpen(false)} PaperProps={{ sx: { bgcolor: "#181818", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", minWidth: 420 } }}>
        <DialogTitle>Salvar selecao em lista</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Guarde esse lote para outreach, revisao ou nova rodada operacional.
          </DialogContentText>
          <Stack spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Destino</InputLabel>
              <Select value={saveListTarget} onChange={e => setSaveListTarget(e.target.value)} label="Destino">
                {leadLists.map(list => (
                  <MenuItem key={list.id} value={list.id}>{list.name} ({list.item_count})</MenuItem>
                ))}
                <MenuItem value="__new__">Criar nova lista</MenuItem>
              </Select>
            </FormControl>

            {saveListTarget === "__new__" && (
              <>
                <TextField
                  size="small"
                  fullWidth
                  label="Nome da nova lista"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  placeholder="Ex.: Imobiliarias SP - rodada 1"
                />
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  rows={3}
                  label="Descrição opcional"
                  value={newListDescription}
                  onChange={e => setNewListDescription(e.target.value)}
                />
              </>
            )}

            <Box sx={{ borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", bgcolor: "rgba(255,255,255,0.02)", p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {selected.size} lead(s) selecionados serao salvos.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setSaveListOpen(false)} sx={{ border: "1px solid rgba(255,255,255,0.14)" }}>Cancelar</Button>
          <Button
            variant="contained"
            startIcon={savingListSelection ? <CircularProgress size={16} /> : <CreateNewFolderIcon />}
            onClick={() => void salvarSelecionadasEmLista()}
            disabled={savingListSelection}
            sx={{ bgcolor: "#0ea5e9", color: "#fff", "&:hover": { bgcolor: "#0284c7" } }}
          >
            Salvar lista
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Suprimir */}
      <Dialog open={suppressSelectionOpen} onClose={() => setSuppressSelectionOpen(false)} PaperProps={{ sx: { bgcolor: "#181818", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", minWidth: 420 } }}>
        <DialogTitle>Suprimir selecao</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Esses CNPJs saem do fluxo operacional e deixam de aparecer nas proximas rodadas.
          </DialogContentText>
          <Stack spacing={2}>
            <TextField
              size="small"
              fullWidth
              multiline
              rows={3}
              label="Motivo da supressao"
              value={suppressionReason}
              onChange={e => setSuppressionReason(e.target.value)}
            />
            <Box sx={{ borderRadius: "8px", border: "1px solid rgba(245,158,11,0.2)", bgcolor: "rgba(245,158,11,0.08)", p: 1.5 }}>
              <Typography variant="caption" sx={{ color: "#fef3c7" }}>
                {selected.size} lead(s) selecionados serao removidos da tela e bloqueados nas proximas prospeccoes.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setSuppressSelectionOpen(false)} sx={{ border: "1px solid rgba(255,255,255,0.14)" }}>Cancelar</Button>
          <Button
            variant="contained"
            startIcon={savingSuppressionSelection ? <CircularProgress size={16} /> : <GppBadIcon />}
            onClick={() => void suprimirSelecionadas()}
            disabled={savingSuppressionSelection}
            sx={{ bgcolor: "#f59e0b", color: "#000", "&:hover": { bgcolor: "#d97706" } }}
          >
            Suprimir lote
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default ResultsPage;
