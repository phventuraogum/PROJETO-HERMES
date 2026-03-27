// src/pages/Configure.tsx
import { useState, KeyboardEvent, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  Switch,
  Chip,
  Grid,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  LinearProgress,
  Collapse,
  IconButton,
} from "@mui/material";
import TargetIcon from "@mui/icons-material/GpsFixed";
import MapPinIcon from "@mui/icons-material/LocationOn";
import Building2Icon from "@mui/icons-material/CorporateFare";
import CoinsIcon from "@mui/icons-material/Toll";
import TagIcon from "@mui/icons-material/LocalOffer";
import ZapIcon from "@mui/icons-material/BoltOutlined";
import GlobeIcon from "@mui/icons-material/Language";
import PhoneIcon from "@mui/icons-material/Phone";
import ArrowRightIcon from "@mui/icons-material/ArrowForward";
import CheckCircle2Icon from "@mui/icons-material/CheckCircle";
import FlaskIcon from "@mui/icons-material/Science";
import TruckIcon from "@mui/icons-material/LocalShipping";
import FactoryIcon from "@mui/icons-material/Factory";
import CartIcon from "@mui/icons-material/ShoppingCart";
import HeartIcon from "@mui/icons-material/Favorite";
import StethoscopeIcon from "@mui/icons-material/MedicalServices";
import PillIcon from "@mui/icons-material/Medication";
import WrenchIcon from "@mui/icons-material/Build";
import ResetIcon from "@mui/icons-material/RotateLeft";
import SlidersIcon from "@mui/icons-material/Tune";
import HistoryIcon from "@mui/icons-material/History";
import PlayIcon from "@mui/icons-material/PlayArrow";
import InfoIcon from "@mui/icons-material/InfoOutlined";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import ChevronDownIcon from "@mui/icons-material/ExpandMore";
import ChevronUpIcon from "@mui/icons-material/ExpandLess";
import { toast } from "sonner";
import {
  runProspeccaoStream,
  salvarBuscaHistorico,
  getStorageKey,
  getPipeline,
  getKommoIntegration,
  setKommoIntegration,
  type KommoIntegration,
  type ProspeccaoResultado,
  type Empresa,
  type ProspeccaoConfig,
  type ProgressEvent as HermesProgress,
} from "@/lib/api";
import { useOrg } from "@/tenancy/OrgContext";

// ─── constantes ───────────────────────────────────────────────────────────────

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

type Porte = "ME" | "EPP" | "Médio/Grande";

const PORTES: { id: Porte; label: string; desc: string }[] = [
  { id: "ME",           label: "ME",           desc: "Microempresa" },
  { id: "EPP",          label: "EPP",          desc: "Pequeno porte" },
  { id: "Médio/Grande", label: "Médio/Grande",  desc: "Médio e grande" },
];

const SEGMENTOS = [
  { id: "Hospitais",     label: "Hospitais",    Icon: HeartIcon,       color: "#f43f5e" },
  { id: "Clínicas",      label: "Clínicas",     Icon: StethoscopeIcon, color: "#ec4899" },
  { id: "Laboratórios",  label: "Laboratórios", Icon: FlaskIcon,       color: "#a855f7" },
  { id: "Farmácias",     label: "Farmácias",    Icon: PillIcon,        color: "#0ea5e9" },
  { id: "Supermercados", label: "Supermercados",Icon: CartIcon,        color: "#f59e0b" },
  { id: "Logística",     label: "Logística",    Icon: TruckIcon,       color: "#f97316" },
  { id: "Indústria",     label: "Indústria",    Icon: FactoryIcon,     color: "#3b82f6" },
  { id: "Serviços",      label: "Serviços",     Icon: WrenchIcon,      color: "#10b981" },
] as const;

type BuscaRecente = {
  ts: string; cidade: string; uf: string;
  segmentos: string[]; total: number;
};

type Preset = {
  label: string;
  Icon: React.ElementType;
  config: {
    termo?: string; cidade: string; uf: string;
    capitalMin: number; capitalMax: number | null;
    portes: Porte[]; segmentos: string[]; limite: number;
  };
};

const PRESETS: Preset[] = [
  { label: "Saúde MG",    Icon: HeartIcon,   config: { cidade: "BELO HORIZONTE", uf: "MG", capitalMin: 100_000, capitalMax: 5_000_000, portes: ["EPP","Médio/Grande"], segmentos: ["Hospitais","Clínicas","Laboratórios"], limite: 30 } },
  { label: "Indústria SP", Icon: FactoryIcon, config: { cidade: "SAO PAULO",       uf: "SP", capitalMin: 500_000, capitalMax: null,      portes: ["Médio/Grande"],         segmentos: ["Indústria"],                             limite: 30 } },
  { label: "Varejo RJ",   Icon: CartIcon,    config: { cidade: "RIO DE JANEIRO",  uf: "RJ", capitalMin: 50_000,  capitalMax: 2_000_000, portes: ["ME","EPP","Médio/Grande"], segmentos: ["Supermercados","Farmácias"],           limite: 25 } },
  { label: "Logística PR", Icon: TruckIcon,  config: { cidade: "CURITIBA",         uf: "PR", capitalMin: 200_000, capitalMax: null,      portes: ["EPP","Médio/Grande"],   segmentos: ["Logística"],                             limite: 25 } },
];

function formatBRL(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

// ─── Seção colapsável reutilizável ───────────────────────────────────────────
function Section({
  icon: Icon, title, hint, open, onToggle, children,
}: {
  icon: React.ElementType;
  title: string; hint?: string;
  open?: boolean; onToggle?: () => void;
  children: React.ReactNode;
}) {
  const collapsible = typeof open === "boolean";
  return (
    <Card
      sx={{
        border: "1px solid rgba(255,255,255,0.07)",
        bgcolor: "background.paper",
        borderRadius: "12px",
      }}
    >
      {collapsible ? (
        <Box
          component="button"
          type="button"
          onClick={onToggle}
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2.5,
            py: 2,
            bgcolor: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            "&:hover": { bgcolor: "rgba(255,255,255,0.03)" },
            transition: "background-color 0.15s",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Icon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography variant="overline" color="text.secondary" sx={{ fontSize: "0.62rem", letterSpacing: 2, fontWeight: 700 }}>
              {title}
            </Typography>
            {hint && (
              <Typography variant="caption" color="text.disabled" sx={{ textTransform: "none", letterSpacing: 0 }}>
                {hint}
              </Typography>
            )}
          </Stack>
          {open
            ? <ChevronUpIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            : <ChevronDownIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
        </Box>
      ) : (
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Icon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography variant="overline" color="text.secondary" sx={{ fontSize: "0.62rem", letterSpacing: 2, fontWeight: 700 }}>
              {title}
            </Typography>
            {hint && (
              <Typography variant="caption" color="text.disabled" sx={{ textTransform: "none", letterSpacing: 0 }}>
                {hint}
              </Typography>
            )}
          </Stack>
        </Box>
      )}
      {(!collapsible || open) && (
        <CardContent
          sx={{
            px: 2.5,
            pb: 2.5,
            pt: collapsible ? 2 : 2,
            borderTop: collapsible ? "1px solid rgba(255,255,255,0.07)" : "none",
            "&:last-child": { pb: 2.5 },
          }}
        >
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ─── componente principal ────────────────────────────────────────────────────
const Configure = () => {
  const { orgId, currentOrg } = useOrg();
  const navigate = useNavigate();

  // ── TODOS os estados declarados primeiro ──────────────────────────────────
  const [kommoOpen, setKommoOpen] = useState(true);
  const [kommoLoading, setKommoLoading] = useState(false);
  const [kommoSaving, setKommoSaving] = useState(false);
  const [kommo, setKommo] = useState<KommoIntegration>({
    kommo_webhook: null,
    kommo_pipeline_id: null,
    kommo_status_id: null,
  });
  const [termoBase,              setTermoBase]              = useState("");
  const [cidade,                 setCidade]                 = useState("");
  const [cidadeInput,            setCidadeInput]            = useState("");
  const [cidades,                setCidades]                = useState<string[]>([]);
  const [uf,                     setUf]                     = useState("MG");
  const [ufs,                    setUfs]                    = useState<string[]>(["MG"]);
  const [capitalMinimo,          setCapitalMinimo]          = useState<number>(0);
  const [capitalMaximo,          setCapitalMaximo]          = useState<number | null>(null);
  const [limiteEmpresas,         setLimiteEmpresas]         = useState<number>(50);
  const [portesSelecionados,     setPortesSelecionados]     = useState<string[]>(["ME", "EPP", "Médio/Grande"]);
  const [segmentosSelecionados,  setSegmentosSelecionados]  = useState<string[]>([]);
  const [enriquecimentoWeb,      setEnriquecimentoWeb]      = useState(false);
  const [exigirContatoAcionavel, setExigirContatoAcionavel] = useState(false);
  const [priorizarComContato,    setPriorizarComContato]    = useState(true);
  const [excluirJaProspectados,  setExcluirJaProspectados]  = useState(true);
  const [idadeMinima,            setIdadeMinima]            = useState<number | null>(null);
  const [idadeMaxima,            setIdadeMaxima]            = useState<number | null>(null);
  const [subsegmentoAlvo,        setSubsegmentoAlvo]        = useState("");
  const [cnaeInput,              setCnaeInput]              = useState("");
  const [cnaes,                  setCnaes]                  = useState<string[]>([]);
  const [avancadoAberto,         setAvancadoAberto]         = useState(false);
  const [isLoading,              setIsLoading]              = useState(false);
  const [loadingStep,            setLoadingStep]            = useState(0);
  const [progressPct,            setProgressPct]            = useState(0);
  const [progressDetail,         setProgressDetail]         = useState("");
  const [resultado,              setResultado]              = useState<ProspeccaoResultado | null>(null);
  const [recentes,               setRecentes]               = useState<BuscaRecente[]>([]);
  const [preview,                setPreview]                = useState<{
    total: number; comEmail: number; comWA: number; scoreM: number;
  } | null>(null);

  // ── Carrega última busca do localStorage (após resultado mudar) ───────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey("resultado"));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setRecentes([{
        ts:        parsed.timestamp,
        cidade:    parsed.config?.cidade    ?? "—",
        uf:        parsed.config?.uf        ?? "",
        segmentos: parsed.config?.segmentos ?? [],
        total:     parsed.resultado?.total_empresas ?? 0,
      }]);
    } catch { /* ignore */ }
  }, [resultado]);

  // ── Carrega integração Kommo da org ───────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    setKommoLoading(true);
    getKommoIntegration(orgId)
      .then(setKommo)
      .catch(() => null)
      .finally(() => setKommoLoading(false));
  }, [orgId]);

  // ── Preview de qualidade a partir do último lote salvo ───────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey("resultado"));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const empresas: Empresa[] = parsed.resultado?.empresas ?? [];
      if (!empresas.length) return;

      let lista = empresas;
      if (portesSelecionados.length)
        lista = lista.filter(e => !e.porte || portesSelecionados.some(p => e.porte?.includes(p)));
      if (segmentosSelecionados.length)
        lista = lista.filter(e => !e.segmento || segmentosSelecionados.includes(e.segmento));
      if (capitalMinimo)
        lista = lista.filter(e => (e.capital_social ?? 0) >= capitalMinimo);
      if (capitalMaximo)
        lista = lista.filter(e => (e.capital_social ?? 0) <= capitalMaximo);

      const t = lista.length;
      if (!t) { setPreview(null); return; }

      const comEmail = lista.filter(e => e.email || e.email_enriquecido).length;
      const comWA    = lista.filter(e => e.whatsapp_publico || e.whatsapp_enriquecido).length;
      const scores   = lista.map(e => e.score_icp ?? 0);
      const scoreM   = scores.reduce((a, b) => a + b, 0) / t;

      setPreview({ total: t, comEmail, comWA, scoreM });
    } catch { setPreview(null); }
  }, [portesSelecionados, segmentosSelecionados, capitalMinimo, capitalMaximo]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const togglePorte = (p: string) =>
    setPortesSelecionados(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const toggleSegmento = (s: string) =>
    setSegmentosSelecionados(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const addCNAE = () => {
    const raw = cnaeInput.trim().replace(/\D/g, "");
    if (!raw || cnaes.includes(raw)) { setCnaeInput(""); return; }
    setCnaes(prev => [...prev, raw]);
    setCnaeInput("");
  };

  const handleCNAEKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); addCNAE(); }
  };

  const applyPreset = (p: Preset) => {
    const c = p.config;
    if (c.termo !== undefined) setTermoBase(c.termo);
    setCidade(c.cidade); setCidades([c.cidade]);
    setUf(c.uf); setUfs([c.uf]);
    setCapitalMinimo(c.capitalMin); setCapitalMaximo(c.capitalMax);
    setPortesSelecionados(c.portes); setSegmentosSelecionados(c.segmentos);
    setLimiteEmpresas(c.limite);
    toast.success(`Preset "${p.label}" aplicado`);
  };

  const resetForm = () => {
    setTermoBase(""); setCidade(""); setCidadeInput(""); setCidades([]);
    setUf("MG"); setUfs(["MG"]);
    setCapitalMinimo(0); setCapitalMaximo(null); setLimiteEmpresas(50);
    setPortesSelecionados(["ME", "EPP", "Médio/Grande"]); setSegmentosSelecionados([]);
    setEnriquecimentoWeb(false); setExigirContatoAcionavel(false);
    setPriorizarComContato(true); setExcluirJaProspectados(true);
    setIdadeMinima(null); setIdadeMaxima(null);
    setSubsegmentoAlvo(""); setCnaes([]); setResultado(null);
  };

  const saveKommo = async () => {
    if (!orgId) return;
    setKommoSaving(true);
    try {
      const saved = await setKommoIntegration(orgId, kommo);
      setKommo(saved);
      toast.success("Integração Kommo salva.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar integração Kommo.";
      toast.error(msg);
    } finally {
      setKommoSaving(false);
    }
  };

  // ── Resumo das tags ────────────────────────────────────────────────────────
  const tags = useMemo(() => {
    const t: { label: string; color: string; bgcolor: string }[] = [];
    if (cidades.length > 0) t.push({ label: cidades.join(", "), color: "#0369a1", bgcolor: "rgba(14,165,233,0.1)" });
    if (ufs.length > 0) t.push({ label: ufs.join(", "), color: "#0369a1", bgcolor: "rgba(14,165,233,0.1)" });
    portesSelecionados.forEach(p => t.push({ label: p, color: "#7c3aed", bgcolor: "rgba(139,92,246,0.1)" }));
    segmentosSelecionados.forEach(s => t.push({ label: s, color: "#f97316", bgcolor: "rgba(249,115,22,0.1)" }));
    if (capitalMinimo > 0 || capitalMaximo) t.push({ label: `${formatBRL(capitalMinimo)} → ${capitalMaximo ? formatBRL(capitalMaximo) : "sem limite"}`, color: "#b45309", bgcolor: "rgba(245,158,11,0.1)" });
    if (cnaes.length) t.push({ label: `${cnaes.length} CNAE(s)`, color: "#059669", bgcolor: "rgba(16,185,129,0.1)" });
    if (exigirContatoAcionavel) t.push({ label: "só com contato", color: "#059669", bgcolor: "rgba(16,185,129,0.1)" });
    if (priorizarComContato) t.push({ label: "prioriza contato", color: "#059669", bgcolor: "rgba(16,185,129,0.1)" });
    if (enriquecimentoWeb) t.push({ label: "enriquecimento web", color: "#0369a1", bgcolor: "rgba(14,165,233,0.1)" });
    return t;
  }, [cidades, ufs, portesSelecionados, segmentosSelecionados, capitalMinimo, capitalMaximo, cnaes, exigirContatoAcionavel, priorizarComContato, enriquecimentoWeb]);

  // ── Execução ───────────────────────────────────────────────────────────────
  const handleExecutar = async () => {
    if (ufs.length === 0 && !uf) { toast.error("Selecione pelo menos um estado (UF)."); return; }

    const cidadesFinais = cidades.length > 0 ? cidades : (cidade ? [cidade] : []);
    const ufsFinais = ufs.length > 0 ? ufs : (uf ? [uf] : []);

    let cnpjsExcluir: string[] | undefined;
    if (excluirJaProspectados) {
      try {
        const pipeline = await getPipeline();
        cnpjsExcluir = pipeline.map(l => l.empresa.cnpj).filter(Boolean);
        if (cnpjsExcluir.length > 0) {
          toast.info(`Excluindo ${cnpjsExcluir.length} CNPJs já no pipeline`);
        }
      } catch { /* ignora se falhar */ }
    }

    const configPayload: ProspeccaoConfig = {
      termo_base:               termoBase,
      cidade:                   cidadesFinais[0] ?? "",
      uf:                       ufsFinais[0] ?? "",
      cidades:                  cidadesFinais,
      ufs:                      ufsFinais,
      capital_minimo:           capitalMinimo,
      capital_maximo:           capitalMaximo,
      limite_empresas:          limiteEmpresas,
      portes:                   portesSelecionados,
      segmentos:                segmentosSelecionados,
      cnaes,
      enriquecimento_web:       enriquecimentoWeb,
      exigir_contato_acionavel: exigirContatoAcionavel,
      priorizar_com_contato:    priorizarComContato,
      excluir_cnpjs:            cnpjsExcluir,
      idade_minima_anos:        idadeMinima,
      idade_maxima_anos:        idadeMaxima,
    };

    try {
      setIsLoading(true);
      setResultado(null);
      setProgressPct(0);
      setProgressDetail("");
      setLoadingStep(1);

      const stageWeight: Record<string, { base: number; span: number }> = {
        db_query:                    { base: 0,   span: 10 },
        building:                    { base: 10,  span: 10 },
        enriching:                   { base: 20,  span: 30 },
        enriching_socials:           { base: 50,  span: 20 },
        enriching_whatsapp_ultra:    { base: 70,  span: 20 },
        processing:                  { base: 0,   span: 0  },
        done:                        { base: 100, span: 0  },
      };

      const onProgress = (evt: HermesProgress) => {
        const w = stageWeight[evt.stage];
        if (w && w.base > 0) {
          const inner = evt.total > 0 ? (evt.current / evt.total) : 0;
          const pct = Math.min(99, Math.round(w.base + w.span * inner));
          setProgressPct(pct);
        }
        if (evt.detail) setProgressDetail(evt.detail);

        if (evt.stage === "db_query") setLoadingStep(1);
        else if (evt.stage === "building") setLoadingStep(2);
        else if (evt.stage === "enriching") setLoadingStep(3);
        else if (evt.stage === "enriching_socials") setLoadingStep(4);
        else if (evt.stage === "enriching_whatsapp_ultra") setLoadingStep(4);
        else if (evt.stage === "done") { setLoadingStep(5); setProgressPct(100); }
      };

      const data = await runProspeccaoStream(configPayload, onProgress);

      setResultado(data);
      toast.success(`${data.total_empresas} empresas encontradas!`);

      salvarBuscaHistorico(
        configPayload,
        { total_empresas: data.total_empresas, empresas: data.empresas }
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao rodar prospecção. Verifique o console.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
      setTimeout(() => { setLoadingStep(0); setProgressPct(0); setProgressDetail(""); }, 800);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ maxWidth: 960, mx: "auto", py: 4, px: 2 }}>
      <Stack spacing={2.5}>

        {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <TargetIcon sx={{ fontSize: 22, color: "primary.main" }} />
              <Typography variant="h5" fontWeight={700}>Configurar Prospecção</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Defina o ICP, aplique um preset ou configure os filtros manualmente.
            </Typography>
          </Box>
          <Button
            variant="text"
            size="small"
            startIcon={<ResetIcon sx={{ fontSize: 14 }} />}
            onClick={resetForm}
            sx={{ color: "text.secondary", "&:hover": { color: "text.primary" }, flexShrink: 0 }}
          >
            Limpar
          </Button>
        </Stack>

        {/* ── Integração Kommo ──────────────────────────────────────────── */}
        <Section
          icon={SlidersIcon}
          title="Integração Kommo (por empresa)"
          hint={currentOrg?.name ? `Org: ${currentOrg.name}` : undefined}
          open={kommoOpen}
          onToggle={() => setKommoOpen(v => !v)}
        >
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField
                label="Webhook n8n do Kommo"
                placeholder="https://n8n.seu-dominio/webhook/kommo"
                fullWidth
                size="small"
                value={kommo.kommo_webhook ?? ""}
                onChange={(e) => setKommo(k => ({ ...k, kommo_webhook: e.target.value }))}
                disabled={kommoLoading}
                helperText="Cada empresa deve usar o seu próprio workflow no n8n (com as credenciais Kommo dela)."
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Pipeline ID"
                placeholder="13230435"
                fullWidth
                size="small"
                value={kommo.kommo_pipeline_id ?? ""}
                onChange={(e) => setKommo(k => ({ ...k, kommo_pipeline_id: e.target.value ? Number(e.target.value) : null }))}
                disabled={kommoLoading}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Status ID"
                placeholder="60307615"
                fullWidth
                size="small"
                value={kommo.kommo_status_id ?? ""}
                onChange={(e) => setKommo(k => ({ ...k, kommo_status_id: e.target.value ? Number(e.target.value) : null }))}
                disabled={kommoLoading}
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={saveKommo}
                  disabled={kommoLoading || kommoSaving}
                  startIcon={kommoSaving ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                  Salvar integração
                </Button>
                <Chip
                  label="Usado em: Pipeline → Enviar pro Kommo"
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: "rgba(255,255,255,0.14)", color: "text.secondary", fontSize: "0.7rem" }}
                />
              </Stack>
            </Grid>
          </Grid>
        </Section>

        {/* ── Última busca ──────────────────────────────────────────────── */}
        {recentes.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
              <HistoryIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography variant="overline" color="text.secondary" sx={{ fontSize: "0.62rem", letterSpacing: 2, fontWeight: 700 }}>
                Última busca
              </Typography>
            </Stack>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {recentes.map((r, i) => (
                <Box
                  key={i}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    bgcolor: "rgba(255,255,255,0.03)",
                    px: 1.5,
                    py: 1.25,
                  }}
                >
                  <Box>
                    <Typography variant="caption" fontWeight={600} sx={{ display: "block" }}>
                      {r.cidade} / {r.uf}
                      {r.segmentos.length > 0 && (
                        <Typography component="span" variant="caption" color="text.secondary"> · {r.segmentos.join(", ")}</Typography>
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {r.total} empresas · {new Date(r.ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </Typography>
                  </Box>
                  <Button
                    variant="text"
                    size="small"
                    startIcon={<PlayIcon sx={{ fontSize: 12 }} />}
                    onClick={() => navigate("/results")}
                    sx={{ color: "primary.main", minWidth: 0, fontSize: "0.72rem", px: 1 }}
                  >
                    Ver
                  </Button>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* ── Presets rápidos ────────────────────────────────────────────── */}
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
            <ZapIcon sx={{ fontSize: 13, color: "text.secondary" }} />
            <Typography variant="overline" color="text.secondary" sx={{ fontSize: "0.62rem", letterSpacing: 2, fontWeight: 700 }}>
              Presets rápidos
            </Typography>
          </Stack>
          <Grid container spacing={1}>
            {PRESETS.map(p => (
              <Grid item xs={6} sm={3} key={p.label}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => applyPreset(p)}
                  sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    bgcolor: "rgba(255,255,255,0.03)",
                    px: 1.5,
                    py: 1.25,
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    color: "rgba(240,240,240,0.7)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    "&:hover": {
                      borderColor: "rgba(249,115,22,0.5)",
                      bgcolor: "rgba(249,115,22,0.07)",
                      color: "#f97316",
                    },
                  }}
                >
                  <p.Icon sx={{ fontSize: 16, flexShrink: 0 }} />
                  {p.label}
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* ── 1. Localização ─────────────────────────────────────────────── */}
        <Section icon={MapPinIcon} title="Localização">
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                id="termo"
                label={<>Palavra-chave <Typography component="span" variant="caption" color="text.secondary">(opcional)</Typography></>}
                placeholder="HOSPITAL, ATACADISTA, FARMÁCIA..."
                fullWidth
                size="small"
                value={termoBase}
                onChange={e => setTermoBase(e.target.value.toUpperCase())}
                helperText="Filtro livre na razão social / nome fantasia."
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                id="cidade"
                label={<>Cidades <Typography component="span" variant="caption" color="text.secondary">(vazio = estado inteiro · digite e Enter)</Typography></>}
                placeholder="BH, CONTAGEM, BETIM..."
                fullWidth
                size="small"
                value={cidadeInput}
                onChange={e => setCidadeInput(e.target.value.toUpperCase())}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter" && cidadeInput.trim()) {
                    e.preventDefault();
                    const nova = cidadeInput.trim().toUpperCase();
                    if (!cidades.includes(nova)) setCidades(prev => [...prev, nova]);
                    setCidadeInput("");
                  }
                }}
                InputProps={{
                  startAdornment: <MapPinIcon sx={{ fontSize: 15, color: "text.secondary", mr: 0.75 }} />,
                }}
                helperText="Vazio = busca em todo(s) o(s) estado(s). Pode adicionar várias cidades."
              />
              {cidades.length > 0 && (
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.75 }}>
                  {cidades.map(c => (
                    <Chip
                      key={c}
                      label={c}
                      size="small"
                      onDelete={() => setCidades(prev => prev.filter(x => x !== c))}
                      sx={{
                        fontSize: "0.68rem",
                        bgcolor: "rgba(14,165,233,0.1)",
                        color: "#38bdf8",
                        border: "1px solid rgba(14,165,233,0.25)",
                        "& .MuiChip-deleteIcon": { fontSize: 12, color: "#38bdf8" },
                      }}
                    />
                  ))}
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setCidades([])}
                    sx={{ fontSize: "0.65rem", color: "text.disabled", bgcolor: "transparent", border: "none", cursor: "pointer", "&:hover": { color: "#ef4444" } }}
                  >
                    limpar
                  </Box>
                </Stack>
              )}
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                Estados (UF) <Typography component="span" variant="caption" sx={{ color: "#ef4444" }}>*</Typography>
                <Typography component="span" variant="caption" color="text.disabled"> · clique para selecionar</Typography>
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {UFS.map(s => {
                  const on = ufs.includes(s);
                  return (
                    <Box
                      key={s}
                      component="button"
                      type="button"
                      onClick={() => setUfs(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                      sx={{
                        height: 28,
                        borderRadius: "6px",
                        px: 1,
                        fontSize: "0.72rem",
                        fontWeight: 500,
                        border: "1px solid",
                        cursor: "pointer",
                        transition: "all 0.12s",
                        borderColor: on ? "primary.main" : "rgba(255,255,255,0.14)",
                        bgcolor: on ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.03)",
                        color: on ? "primary.main" : "text.secondary",
                        "&:hover": {
                          borderColor: on ? "primary.main" : "rgba(255,255,255,0.3)",
                          color: on ? "primary.main" : "text.primary",
                        },
                      }}
                    >
                      {s}
                    </Box>
                  );
                })}
              </Box>
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
                Selecione 1 ou vários. Multi-estado traz muito mais leads.
              </Typography>
            </Grid>
          </Grid>
        </Section>

        {/* ── 2. Capital Social ─────────────────────────────────────────── */}
        <Section icon={CoinsIcon} title="Capital Social" hint="— usado para ranquear e filtrar">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                id="capMin"
                label="Mínimo (R$)"
                type="number"
                fullWidth
                size="small"
                value={capitalMinimo}
                onChange={e => setCapitalMinimo(Number(e.target.value || 0))}
                helperText={<Typography variant="caption" sx={{ color: "#f59e0b", fontWeight: 500 }}>{formatBRL(capitalMinimo)}</Typography>}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                id="capMax"
                label={<>Máximo (R$) <Typography component="span" variant="caption" color="text.secondary">(opcional)</Typography></>}
                type="number"
                placeholder="Sem limite"
                fullWidth
                size="small"
                value={capitalMaximo ?? ""}
                onChange={e => setCapitalMaximo(e.target.value === "" ? null : Number(e.target.value))}
                helperText={
                  <Typography variant="caption" sx={{ color: "#f59e0b", fontWeight: 500 }}>
                    {capitalMaximo ? formatBRL(capitalMaximo) : "Sem limite superior"}
                  </Typography>
                }
              />
            </Grid>
          </Grid>
        </Section>

        {/* ── 3. Porte ──────────────────────────────────────────────────── */}
        <Section icon={Building2Icon} title="Porte da empresa" hint="— nenhum selecionado = todos">
          <Grid container spacing={1.5}>
            {PORTES.map(p => {
              const on = portesSelecionados.includes(p.id);
              return (
                <Grid item xs={12} sm={4} key={p.id}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => togglePorte(p.id)}
                    sx={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 0.25,
                      borderRadius: "8px",
                      border: "1px solid",
                      px: 1.5,
                      py: 1.5,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.12s",
                      borderColor: on ? "primary.main" : "rgba(255,255,255,0.07)",
                      bgcolor: on ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.02)",
                      color: on ? "primary.main" : "text.secondary",
                      "&:hover": { borderColor: on ? "primary.main" : "rgba(255,255,255,0.2)" },
                    }}
                  >
                    <Typography variant="body2" fontWeight={600} sx={{ color: "inherit" }}>{p.label}</Typography>
                    <Typography variant="caption" sx={{ color: "inherit", opacity: 0.7 }}>{p.desc}</Typography>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Section>

        {/* ── 4. Segmentos ─────────────────────────────────────────────── */}
        <Section icon={TagIcon} title="Segmentos alvo" hint="— nenhum selecionado = todos">
          <Grid container spacing={1.5}>
            {SEGMENTOS.map(seg => {
              const on = segmentosSelecionados.includes(seg.id);
              return (
                <Grid item xs={6} sm={3} key={seg.id}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => toggleSegmento(seg.id)}
                    sx={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      borderRadius: "8px",
                      border: "1px solid",
                      px: 1.5,
                      py: 1.25,
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      transition: "all 0.12s",
                      borderColor: on ? seg.color : "rgba(255,255,255,0.07)",
                      bgcolor: on ? `${seg.color}18` : "rgba(255,255,255,0.02)",
                      color: on ? seg.color : "rgba(240,240,240,0.55)",
                      "&:hover": { borderColor: on ? seg.color : "rgba(255,255,255,0.2)" },
                    }}
                  >
                    <seg.Icon sx={{ fontSize: 16, flexShrink: 0, opacity: on ? 1 : 0.4 }} />
                    {seg.label}
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Section>

        {/* ── 5. Configurações avançadas ───────────────────────────────── */}
        <Section
          icon={SlidersIcon}
          title="Configurações avançadas"
          hint="— CNAEs, nicho, enriquecimento, limites"
          open={avancadoAberto}
          onToggle={() => setAvancadoAberto(p => !p)}
        >
          {/* CNAEs específicos */}
          <Box sx={{ mb: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
              <TagIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography variant="caption" fontWeight={600}>CNAEs específicos</Typography>
              <Typography variant="caption" color="text.disabled">— substitui os segmentos acima quando preenchido</Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                placeholder="Ex.: 8610, 4711, 4772..."
                size="small"
                value={cnaeInput}
                onChange={e => setCnaeInput(e.target.value)}
                onKeyDown={handleCNAEKey}
                sx={{ flex: 1, "& input": { fontFamily: "monospace", fontSize: 13 } }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                onClick={addCNAE}
                sx={{ px: 1.5 }}
              >
                Adicionar
              </Button>
            </Stack>
            {cnaes.length > 0 ? (
              <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1 }}>
                {cnaes.map(c => (
                  <Chip
                    key={c}
                    label={c}
                    size="small"
                    onDelete={() => setCnaes(prev => prev.filter(x => x !== c))}
                    sx={{
                      fontFamily: "monospace",
                      fontSize: "0.68rem",
                      bgcolor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      color: "text.secondary",
                    }}
                  />
                ))}
                <Box
                  component="button"
                  type="button"
                  onClick={() => setCnaes([])}
                  sx={{ fontSize: "0.65rem", color: "text.disabled", bgcolor: "transparent", border: "none", cursor: "pointer", "&:hover": { color: "#ef4444" } }}
                >
                  limpar todos
                </Box>
              </Stack>
            ) : (
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.75 }}>
                Nenhum CNAE adicionado. Os segmentos acima serão usados.
              </Typography>
            )}
          </Box>

          <Divider sx={{ borderColor: "rgba(255,255,255,0.07)", my: 2 }} />

          {/* Subsegmento / nicho */}
          <Box sx={{ mb: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
              <InfoIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography variant="caption" fontWeight={600}>Subsegmento / nicho</Typography>
              <Typography variant="caption" color="text.disabled">(opcional)</Typography>
            </Stack>
            <TextField
              id="subseg"
              placeholder="Ex.: oncologia, diagnóstico por imagem, construção civil pesada..."
              fullWidth
              size="small"
              value={subsegmentoAlvo}
              onChange={e => setSubsegmentoAlvo(e.target.value)}
              helperText="O Hermes filtra pelo nome, fantasia e descrição derivada do CNAE."
            />
          </Box>

          <Divider sx={{ borderColor: "rgba(255,255,255,0.07)", my: 2 }} />

          {/* Opções booleanas + limite */}
          <Grid container spacing={1.5}>
            {/* Enriquecimento web */}
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  bgcolor: "rgba(255,255,255,0.02)",
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1.5,
                }}
              >
                <Box>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.25 }}>
                    <GlobeIcon sx={{ fontSize: 14, color: "#0ea5e9" }} />
                    <Typography variant="caption" fontWeight={600}>Enriquecimento web</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.disabled">
                    Busca site, e-mail e WhatsApp via IA. Mais lento (~2 min).
                  </Typography>
                </Box>
                <Switch
                  checked={enriquecimentoWeb}
                  onChange={e => setEnriquecimentoWeb(e.target.checked)}
                  size="small"
                  color="primary"
                />
              </Box>
            </Grid>

            {/* Só com contato */}
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  bgcolor: "rgba(255,255,255,0.02)",
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1.5,
                }}
              >
                <Box>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.25 }}>
                    <PhoneIcon sx={{ fontSize: 14, color: "#10b981" }} />
                    <Typography variant="caption" fontWeight={600}>Só com contato</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.disabled">
                    Filtra no banco: só traz empresas com telefone, WhatsApp ou e-mail.
                  </Typography>
                </Box>
                <Switch
                  checked={exigirContatoAcionavel}
                  onChange={e => setExigirContatoAcionavel(e.target.checked)}
                  size="small"
                  color="primary"
                />
              </Box>
            </Grid>

            {/* Priorizar com contato */}
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  bgcolor: "rgba(255,255,255,0.02)",
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1.5,
                }}
              >
                <Box>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.25 }}>
                    <TargetIcon sx={{ fontSize: 14, color: "#10b981" }} />
                    <Typography variant="caption" fontWeight={600}>Priorizar quem tem contato</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.disabled">
                    Ordena: WhatsApp primeiro, depois telefone, depois email.
                  </Typography>
                </Box>
                <Switch
                  checked={priorizarComContato}
                  onChange={e => setPriorizarComContato(e.target.checked)}
                  size="small"
                  color="primary"
                />
              </Box>
            </Grid>

            {/* Idade da empresa */}
            <Grid item xs={12} md={6}>
              <Box
                sx={{
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  bgcolor: "rgba(255,255,255,0.02)",
                  p: 1.5,
                }}
              >
                <Typography variant="caption" fontWeight={600} sx={{ display: "block", mb: 1 }}>
                  Idade da empresa (anos)
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TextField
                    type="number"
                    placeholder="Mín"
                    size="small"
                    inputProps={{ min: 0, style: { fontSize: 12, padding: "4px 8px" } }}
                    sx={{ width: 72 }}
                    value={idadeMinima ?? ""}
                    onChange={e => setIdadeMinima(e.target.value === "" ? null : Number(e.target.value))}
                  />
                  <Typography variant="caption" color="text.disabled">a</Typography>
                  <TextField
                    type="number"
                    placeholder="Máx"
                    size="small"
                    inputProps={{ min: 0, style: { fontSize: 12, padding: "4px 8px" } }}
                    sx={{ width: 72 }}
                    value={idadeMaxima ?? ""}
                    onChange={e => setIdadeMaxima(e.target.value === "" ? null : Number(e.target.value))}
                  />
                  <Typography variant="caption" color="text.disabled">anos</Typography>
                </Stack>
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.75 }}>
                  Ex.: 2 a 10 = empresas abertas entre 2 e 10 anos atrás.
                </Typography>
              </Box>
            </Grid>

            {/* Limite de empresas */}
            <Grid item xs={12} md={6}>
              <Box
                sx={{
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  bgcolor: "rgba(255,255,255,0.02)",
                  p: 1.5,
                }}
              >
                <Typography variant="caption" fontWeight={600} sx={{ display: "block", mb: 1 }}>
                  Limite de empresas
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" gap={0.5}>
                  {[20, 50, 100, 200, 500].map(n => (
                    <Box
                      key={n}
                      component="button"
                      type="button"
                      onClick={() => setLimiteEmpresas(n)}
                      sx={{
                        height: 28,
                        borderRadius: "6px",
                        px: 1,
                        fontSize: "0.72rem",
                        fontWeight: 500,
                        border: "1px solid",
                        cursor: "pointer",
                        transition: "all 0.12s",
                        borderColor: limiteEmpresas === n ? "primary.main" : "rgba(255,255,255,0.14)",
                        bgcolor: limiteEmpresas === n ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.03)",
                        color: limiteEmpresas === n ? "primary.main" : "text.secondary",
                      }}
                    >
                      {n}
                    </Box>
                  ))}
                  <TextField
                    id="limite"
                    type="number"
                    size="small"
                    inputProps={{ min: 1, max: 2000, style: { fontSize: 12, padding: "4px 8px" } }}
                    sx={{ width: 80 }}
                    value={limiteEmpresas}
                    onChange={e => setLimiteEmpresas(Math.max(1, Number(e.target.value || 1)))}
                  />
                </Stack>
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.75 }}>
                  Resultado final pode variar após deduplicação.
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Section>

        {/* ── Preview de qualidade ─────────────────────────────────────── */}
        {preview && (
          <Box
            sx={{
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.07)",
              bgcolor: "rgba(255,255,255,0.02)",
              p: 2,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
              <InfoIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography variant="overline" color="text.secondary" sx={{ fontSize: "0.62rem", letterSpacing: 2, fontWeight: 700 }}>
                Preview do lote anterior com esses filtros
              </Typography>
            </Stack>
            <Grid container spacing={1.5}>
              {[
                { label: "Empresas",    value: preview.total.toString(),                                                                          color: "text.primary" },
                { label: "Com e-mail",  value: `${preview.comEmail} (${preview.total ? Math.round(preview.comEmail/preview.total*100) : 0}%)`,    color: "#0ea5e9" },
                { label: "WhatsApp",    value: `${preview.comWA} (${preview.total ? Math.round(preview.comWA/preview.total*100) : 0}%)`,          color: "#10b981" },
                { label: "Score médio", value: `${preview.scoreM.toFixed(1)} pts`,                                                                color: preview.scoreM >= 60 ? "#10b981" : preview.scoreM >= 40 ? "#f59e0b" : "#ef4444" },
              ].map(m => (
                <Grid item xs={6} sm={3} key={m.label}>
                  <Box
                    sx={{
                      borderRadius: "8px",
                      bgcolor: "rgba(255,255,255,0.04)",
                      px: 1.5,
                      py: 1.25,
                    }}
                  >
                    <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>{m.label}</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ color: m.color }}>{m.value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
              Baseado no último lote executado. Rode novamente para dados atualizados.
            </Typography>
          </Box>
        )}

        {/* ── Resumo + CTA ─────────────────────────────────────────────── */}
        <Box
          sx={{
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.07)",
            bgcolor: "rgba(255,255,255,0.02)",
            p: 2.5,
          }}
        >
          <Stack spacing={2}>
            {/* Tags do recorte */}
            {tags.length > 0 && (
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                {tags.map((t, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: "999px",
                      border: "1px solid",
                      borderColor: `${t.color}40`,
                      bgcolor: t.bgcolor,
                      px: 1.25,
                      py: 0.25,
                      fontSize: "0.68rem",
                      fontWeight: 500,
                      color: t.color,
                    }}
                  >
                    {t.label}
                  </Box>
                ))}
              </Stack>
            )}

            {/* Progress bar */}
            {isLoading && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <CircularProgress size={14} sx={{ color: "primary.main", flexShrink: 0 }} />
                  <Typography variant="caption" color="primary.main" fontWeight={600}>
                    {loadingStep === 1 && "Consultando base de dados (56M+ empresas)..."}
                    {loadingStep === 2 && "Montando e classificando empresas..."}
                    {loadingStep === 3 && "Enriquecendo dados via web (Scrapling)..."}
                    {loadingStep === 4 && "Buscando redes sociais dos sócios..."}
                    {loadingStep === 5 && "Concluído!"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: "auto !important", fontVariantNumeric: "tabular-nums" }}>
                    {progressPct}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={progressPct}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.08)",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 3,
                      background: "linear-gradient(90deg, #f97316, #10b981)",
                      transition: "transform 0.5s ease-out",
                    },
                  }}
                />
                {progressDetail && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {progressDetail}
                  </Typography>
                )}
              </Box>
            )}

            {/* Resultado */}
            {resultado && !isLoading && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  borderRadius: "8px",
                  border: "1px solid rgba(34,197,94,0.3)",
                  bgcolor: "rgba(34,197,94,0.08)",
                  px: 2,
                  py: 1.5,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CheckCircle2Icon sx={{ fontSize: 16, color: "#22c55e", flexShrink: 0 }} />
                  <Typography variant="body2" fontWeight={600} sx={{ color: "#4ade80" }}>
                    {resultado.total_empresas} empresas encontradas
                  </Typography>
                  {resultado.enriquecimento_web?.total_com_enriquecimento > 0 && (
                    <Typography variant="caption" sx={{ color: "rgba(74,222,128,0.7)" }}>
                      · {resultado.enriquecimento_web.total_com_enriquecimento} enriquecidas
                    </Typography>
                  )}
                </Stack>
                <Button
                  variant="contained"
                  size="small"
                  endIcon={<ArrowRightIcon sx={{ fontSize: 14 }} />}
                  onClick={() => navigate("/results", { state: { resultados: resultado.empresas } })}
                  sx={{
                    bgcolor: "#16a34a",
                    "&:hover": { bgcolor: "#15803d" },
                    flexShrink: 0,
                  }}
                >
                  Ver resultados
                </Button>
              </Box>
            )}

            {/* Botão principal */}
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleExecutar}
                disabled={isLoading}
                startIcon={isLoading
                  ? <CircularProgress size={16} color="inherit" />
                  : <TargetIcon sx={{ fontSize: 16 }} />}
                sx={{ px: 3 }}
              >
                {isLoading ? "Prospectando..." : "Rodar prospecção"}
              </Button>
              {resultado && !isLoading && (
                <Typography variant="caption" color="text.secondary">
                  {cidades.length > 0 ? cidades.join(", ") : cidade} / {uf} · {resultado.total_empresas} leads
                </Typography>
              )}
            </Stack>
          </Stack>
        </Box>

      </Stack>
    </Box>
  );
};

export default Configure;
