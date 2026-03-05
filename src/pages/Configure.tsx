// src/pages/Configure.tsx
import { useState, KeyboardEvent, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input }     from "@/components/ui/input";
import { Button }    from "@/components/ui/button";
import { Label }     from "@/components/ui/label";
import { Switch }    from "@/components/ui/switch";
import { Badge }     from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown, ChevronUp, Loader2, Target, MapPin, Building2,
  Coins, Tag, Zap, Globe, Phone, ArrowRight, CheckCircle2,
  FlaskConical, Truck, Factory, ShoppingCart, Heart, Stethoscope,
  Pill, Wrench, RotateCcw, SlidersHorizontal, History, Play, Info,
  X, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { runProspeccao, runProspeccaoStream, salvarBuscaHistorico, getStorageKey, getPipeline, type ProspeccaoResultado, type Empresa, type ProspeccaoConfig, type ProgressEvent as HermesProgress } from "@/lib/api";

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
  { id: "Hospitais",     label: "Hospitais",    icon: Heart,        color: "border-rose-500/50 bg-rose-500/10 text-rose-300" },
  { id: "Clínicas",      label: "Clínicas",     icon: Stethoscope,  color: "border-pink-500/50 bg-pink-500/10 text-pink-300" },
  { id: "Laboratórios",  label: "Laboratórios", icon: FlaskConical, color: "border-violet-500/50 bg-violet-500/10 text-violet-300" },
  { id: "Farmácias",     label: "Farmácias",    icon: Pill,         color: "border-sky-500/50 bg-sky-500/10 text-sky-300" },
  { id: "Supermercados", label: "Supermercados",icon: ShoppingCart, color: "border-amber-500/50 bg-amber-500/10 text-amber-300" },
  { id: "Logística",     label: "Logística",    icon: Truck,        color: "border-orange-500/50 bg-orange-500/10 text-orange-300" },
  { id: "Indústria",     label: "Indústria",    icon: Factory,      color: "border-blue-500/50 bg-blue-500/10 text-blue-300" },
  { id: "Serviços",      label: "Serviços",     icon: Wrench,       color: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" },
] as const;

type BuscaRecente = {
  ts: string; cidade: string; uf: string;
  segmentos: string[]; total: number;
};

type Preset = {
  label: string;
  icon: React.FC<{ className?: string }>;
  config: {
    termo?: string; cidade: string; uf: string;
    capitalMin: number; capitalMax: number | null;
    portes: Porte[]; segmentos: string[]; limite: number;
  };
};

const PRESETS: Preset[] = [
  { label: "Saúde MG",    icon: Heart,        config: { cidade: "BELO HORIZONTE", uf: "MG", capitalMin: 100_000, capitalMax: 5_000_000, portes: ["EPP","Médio/Grande"], segmentos: ["Hospitais","Clínicas","Laboratórios"], limite: 30 } },
  { label: "Indústria SP", icon: Factory,      config: { cidade: "SAO PAULO",       uf: "SP", capitalMin: 500_000, capitalMax: null,      portes: ["Médio/Grande"],         segmentos: ["Indústria"],                             limite: 30 } },
  { label: "Varejo RJ",   icon: ShoppingCart, config: { cidade: "RIO DE JANEIRO",  uf: "RJ", capitalMin: 50_000,  capitalMax: 2_000_000, portes: ["ME","EPP","Médio/Grande"], segmentos: ["Supermercados","Farmácias"],           limite: 25 } },
  { label: "Logística PR", icon: Truck,        config: { cidade: "CURITIBA",         uf: "PR", capitalMin: 200_000, capitalMax: null,      portes: ["EPP","Médio/Grande"],   segmentos: ["Logística"],                             limite: 25 } },
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
  icon: React.FC<{ className?: string }>;
  title: string; hint?: string;
  open?: boolean; onToggle?: () => void;
  children: React.ReactNode;
}) {
  const collapsible = typeof open === "boolean";
  return (
    <Card className="border-zinc-800 bg-zinc-950/60">
      {collapsible ? (
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={onToggle}
        >
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</span>
            {hint && <span className="text-[10px] text-muted-foreground/50 normal-case tracking-normal">{hint}</span>}
          </div>
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      ) : (
        <CardHeader className="px-5 pt-4 pb-3">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Icon className="w-3.5 h-3.5" />
            {title}
            {hint && <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/50">{hint}</span>}
          </CardTitle>
        </CardHeader>
      )}
      {(!collapsible || open) && (
        <CardContent className={cn("px-5 pb-5", collapsible && "border-t border-zinc-800 pt-4")}>
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ─── componente principal ────────────────────────────────────────────────────
const Configure = () => {
  const navigate = useNavigate();

  // ── TODOS os estados declarados primeiro ──────────────────────────────────
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

  // ── Preview de qualidade a partir do último lote salvo ───────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey("resultado"));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const empresas: Empresa[] = parsed.resultado?.empresas ?? [];
      if (!empresas.length) return;

      // Filtra pelo recorte atual
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

  // ── Resumo das tags ────────────────────────────────────────────────────────
  const tags = useMemo(() => {
    const t: { label: string; cls: string }[] = [];
    if (cidades.length > 0) t.push({ label: cidades.join(", "), cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" });
    if (ufs.length > 0) t.push({ label: ufs.join(", "), cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" });
    portesSelecionados.forEach(p => t.push({ label: p, cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" }));
    segmentosSelecionados.forEach(s => t.push({ label: s, cls: "border-primary/40 bg-primary/10 text-primary" }));
    if (capitalMinimo > 0 || capitalMaximo) t.push({ label: `${formatBRL(capitalMinimo)} → ${capitalMaximo ? formatBRL(capitalMaximo) : "sem limite"}`, cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" });
    if (cnaes.length) t.push({ label: `${cnaes.length} CNAE(s)`, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" });
    if (exigirContatoAcionavel) t.push({ label: "só com contato", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" });
    if (priorizarComContato) t.push({ label: "prioriza contato", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" });
    if (enriquecimentoWeb) t.push({ label: "enriquecimento web", cls: "border-sky-400/40 bg-sky-400/10 text-sky-300" });
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
        db_query:           { base: 0,   span: 15 },
        building:           { base: 15,  span: 15 },
        enriching:          { base: 30,  span: 50 },
        enriching_socials:  { base: 80,  span: 10 },
        done:               { base: 100, span: 0  },
      };

      const onProgress = (evt: HermesProgress) => {
        const w = stageWeight[evt.stage] || { base: 0, span: 0 };
        const inner = evt.total > 0 ? (evt.current / evt.total) : 0;
        const pct = Math.min(100, Math.round(w.base + w.span * inner));
        setProgressPct(pct);
        setProgressDetail(evt.detail || "");

        if (evt.stage === "db_query") setLoadingStep(1);
        else if (evt.stage === "building") setLoadingStep(2);
        else if (evt.stage === "enriching") setLoadingStep(3);
        else if (evt.stage === "enriching_socials") setLoadingStep(4);
        else if (evt.stage === "done") { setLoadingStep(5); setProgressPct(100); }
      };

      let data: ProspeccaoResultado;
      try {
        data = await runProspeccaoStream(configPayload, onProgress);
      } catch {
        data = await runProspeccao(configPayload);
        setProgressPct(100);
      }

      setResultado(data);
      toast.success(`${data.total_empresas} empresas encontradas!`);

      salvarBuscaHistorico(
        configPayload,
        { total_empresas: data.total_empresas, empresas: data.empresas }
      );
    } catch (e: any) {
      const msg = e?.message || "Erro ao rodar prospecção. Verifique o console.";
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
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-5">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Configurar Prospecção
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Defina o ICP, aplique um preset ou configure os filtros manualmente.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetForm}
          className="gap-1.5 text-muted-foreground hover:text-foreground">
          <RotateCcw className="w-3.5 h-3.5" /> Limpar
        </Button>
      </div>

      {/* ── Última busca ───────────────────────────────────────────────────── */}
      {recentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <History className="w-3 h-3" /> Última busca
          </p>
          <div className="flex flex-wrap gap-2">
            {recentes.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-xs">
                <div className="space-y-0.5">
                  <p className="font-medium text-zinc-200">
                    {r.cidade} / {r.uf}
                    {r.segmentos.length > 0 && <span className="ml-2 text-zinc-400">· {r.segmentos.join(", ")}</span>}
                  </p>
                  <p className="text-zinc-500">
                    {r.total} empresas ·{" "}
                    {new Date(r.ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Button variant="ghost" size="sm"
                  className="h-7 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                  onClick={() => navigate("/results")}>
                  <Play className="w-3 h-3" /> Ver
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Presets ────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Zap className="w-3 h-3" /> Presets rápidos
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESETS.map(p => (
            <button key={p.label} type="button" onClick={() => applyPreset(p)}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-all hover:border-primary/60 hover:bg-primary/10 hover:text-primary">
              <p.icon className="w-4 h-4 flex-shrink-0" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. Localização ─────────────────────────────────────────────────── */}
      <Section icon={MapPin} title="Localização">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="termo" className="text-xs">Palavra-chave <span className="text-muted-foreground">(opcional)</span></Label>
            <Input id="termo" placeholder="HOSPITAL, ATACADISTA, FARMÁCIA..."
              value={termoBase} onChange={e => setTermoBase(e.target.value.toUpperCase())}
              className="h-9 bg-zinc-900 border-zinc-700" />
            <p className="text-[10px] text-muted-foreground">Filtro livre na razão social / nome fantasia.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cidade" className="text-xs">Cidades <span className="text-zinc-500">(vazio = estado inteiro · digite e Enter)</span></Label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input id="cidade" placeholder="BH, CONTAGEM, BETIM..."
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
                className="h-9 pl-8 bg-zinc-900 border-zinc-700" />
            </div>
            {cidades.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {cidades.map(c => (
                  <Badge key={c} variant="outline"
                    className="gap-1 text-[11px] border-sky-500/40 bg-sky-500/10 text-sky-300 cursor-pointer hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={() => setCidades(prev => prev.filter(x => x !== c))}>
                    {c} <X className="w-2.5 h-2.5" />
                  </Badge>
                ))}
                <button type="button" onClick={() => setCidades([])}
                  className="text-[10px] text-zinc-500 hover:text-rose-400 ml-1">limpar</button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Vazio = busca em todo(s) o(s) estado(s). Pode adicionar várias cidades.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estados (UF) <span className="text-rose-400">*</span> <span className="text-zinc-500">· clique para selecionar</span></Label>
            <div className="flex flex-wrap gap-1">
              {UFS.map(s => {
                const on = ufs.includes(s);
                return (
                  <button key={s} type="button"
                    onClick={() => setUfs(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                    className={cn(
                      "h-7 rounded px-2 text-xs font-medium transition-all border",
                      on ? "border-primary/60 bg-primary/15 text-primary" : "border-zinc-700 bg-zinc-800/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                    )}>
                    {s}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">Selecione 1 ou vários. Multi-estado traz muito mais leads.</p>
          </div>
        </div>
      </Section>

      {/* ── 2. Capital Social ──────────────────────────────────────────────── */}
      <Section icon={Coins} title="Capital Social" hint="— usado para ranquear e filtrar">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="capMin" className="text-xs">Mínimo (R$)</Label>
            <Input id="capMin" type="number" value={capitalMinimo}
              onChange={e => setCapitalMinimo(Number(e.target.value || 0))}
              className="h-9 bg-zinc-900 border-zinc-700" />
            <p className="text-[10px] text-muted-foreground font-medium text-amber-400/80">{formatBRL(capitalMinimo)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capMax" className="text-xs">Máximo (R$) <span className="text-muted-foreground">(opcional)</span></Label>
            <Input id="capMax" type="number" placeholder="Sem limite"
              value={capitalMaximo ?? ""}
              onChange={e => setCapitalMaximo(e.target.value === "" ? null : Number(e.target.value))}
              className="h-9 bg-zinc-900 border-zinc-700" />
            <p className="text-[10px] text-muted-foreground font-medium text-amber-400/80">
              {capitalMaximo ? formatBRL(capitalMaximo) : "Sem limite superior"}
            </p>
          </div>
        </div>
      </Section>

      {/* ── 3. Porte ───────────────────────────────────────────────────────── */}
      <Section icon={Building2} title="Porte da empresa" hint="— nenhum selecionado = todos">
        <div className="grid grid-cols-3 gap-2">
          {PORTES.map(p => {
            const on = portesSelecionados.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => togglePorte(p.id)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-3 transition-all text-left",
                  on ? "border-primary/60 bg-primary/10 text-primary" : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600"
                )}>
                <span className="text-sm font-semibold">{p.label}</span>
                <span className="text-[10px] opacity-70">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── 4. Segmentos ───────────────────────────────────────────────────── */}
      <Section icon={Tag} title="Segmentos alvo" hint="— nenhum selecionado = todos">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SEGMENTOS.map(seg => {
            const on = segmentosSelecionados.includes(seg.id);
            return (
              <button key={seg.id} type="button" onClick={() => toggleSegmento(seg.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                  on ? `border ${seg.color}` : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600"
                )}>
                <seg.icon className={cn("w-4 h-4 flex-shrink-0", !on && "opacity-40")} />
                {seg.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── 5. Avançado ────────────────────────────────────────────────────── */}
      <Section icon={SlidersHorizontal} title="Configurações avançadas"
        hint="— CNAEs, nicho, enriquecimento, limites"
        open={avancadoAberto} onToggle={() => setAvancadoAberto(p => !p)}>

        {/* CNAEs específicos */}
        <div className="space-y-2 mb-4">
          <Label className="text-xs flex items-center gap-1.5">
            <Tag className="w-3 h-3" />
            CNAEs específicos
            <span className="text-[10px] text-muted-foreground font-normal">— substitui os segmentos acima quando preenchido</span>
          </Label>
          <div className="flex gap-2">
            <Input placeholder="Ex.: 8610, 4711, 4772..." value={cnaeInput}
              onChange={e => setCnaeInput(e.target.value)}
              onKeyDown={handleCNAEKey}
              className="h-9 bg-zinc-900 border-zinc-700 flex-1 font-mono text-sm" />
            <Button size="sm" variant="outline" onClick={addCNAE} className="h-9 px-3 gap-1 border-zinc-700">
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </Button>
          </div>
          {cnaes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {cnaes.map(c => (
                <Badge key={c} variant="outline"
                  className="gap-1 font-mono text-[11px] border-zinc-700 bg-zinc-800 cursor-pointer hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-300"
                  onClick={() => setCnaes(prev => prev.filter(x => x !== c))}>
                  {c} <X className="w-2.5 h-2.5" />
                </Badge>
              ))}
              <button type="button" onClick={() => setCnaes([])}
                className="text-[10px] text-muted-foreground hover:text-rose-400 transition-colors">
                limpar todos
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Nenhum CNAE adicionado. Os segmentos acima serão usados.
            </p>
          )}
        </div>

        <Separator className="bg-zinc-800 my-4" />

        {/* Subsegmento / nicho */}
        <div className="space-y-1.5 mb-4">
          <Label htmlFor="subseg" className="text-xs flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            Subsegmento / nicho <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input id="subseg" placeholder="Ex.: oncologia, diagnóstico por imagem, construção civil pesada..."
            value={subsegmentoAlvo}
            onChange={e => setSubsegmentoAlvo(e.target.value)}
            className="h-9 bg-zinc-900 border-zinc-700" />
          <p className="text-[10px] text-muted-foreground">
            O Hermes filtra pelo nome, fantasia e descrição derivada do CNAE.
          </p>
        </div>

        <Separator className="bg-zinc-800 my-4" />

        {/* Opções booleanas + limite */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Enriquecimento web */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                Enriquecimento web
              </div>
              <p className="text-[10px] text-muted-foreground">
                Busca site, e-mail e WhatsApp via IA. Mais lento (~2 min).
              </p>
            </div>
            <Switch checked={enriquecimentoWeb} onCheckedChange={setEnriquecimentoWeb} />
          </div>

          {/* Só com contato */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                Só com contato
              </div>
              <p className="text-[10px] text-muted-foreground">
                Filtra no banco: só traz empresas com telefone, WhatsApp ou e-mail.
              </p>
            </div>
            <Switch checked={exigirContatoAcionavel} onCheckedChange={setExigirContatoAcionavel} />
          </div>

          {/* Priorizar com contato */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                Priorizar quem tem contato
              </div>
              <p className="text-[10px] text-muted-foreground">
                Ordena: WhatsApp primeiro, depois telefone, depois email. Maximiza leads acionáveis.
              </p>
            </div>
            <Switch checked={priorizarComContato} onCheckedChange={setPriorizarComContato} />
          </div>

          {/* Idade da empresa */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
            <Label className="text-xs">Idade da empresa (anos)</Label>
            <div className="flex gap-2 items-center">
              <Input type="number" placeholder="Mín" min={0}
                value={idadeMinima ?? ""}
                onChange={e => setIdadeMinima(e.target.value === "" ? null : Number(e.target.value))}
                className="h-7 w-20 bg-zinc-900 border-zinc-700 text-xs px-2" />
              <span className="text-zinc-500 text-xs">a</span>
              <Input type="number" placeholder="Máx" min={0}
                value={idadeMaxima ?? ""}
                onChange={e => setIdadeMaxima(e.target.value === "" ? null : Number(e.target.value))}
                className="h-7 w-20 bg-zinc-900 border-zinc-700 text-xs px-2" />
              <span className="text-zinc-500 text-xs">anos</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Ex.: 2 a 10 = empresas abertas entre 2 e 10 anos atrás.</p>
          </div>

          {/* Limite de empresas */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
            <Label htmlFor="limite" className="text-xs">
              Limite de empresas
            </Label>
            <div className="flex gap-1.5">
              {[20, 50, 100, 200, 500].map(n => (
                <button key={n} type="button" onClick={() => setLimiteEmpresas(n)}
                  className={cn(
                    "h-7 rounded px-2 text-xs font-medium transition-all border",
                    limiteEmpresas === n
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-600"
                  )}>
                  {n}
                </button>
              ))}
              <Input id="limite" type="number" min={1} max={2000}
                value={limiteEmpresas}
                onChange={e => setLimiteEmpresas(Math.max(1, Number(e.target.value || 1)))}
                className="h-7 w-20 bg-zinc-900 border-zinc-700 text-xs px-2"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Resultado final pode variar após deduplicação.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Preview de qualidade ──────────────────────────────────────────── */}
      {preview && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Preview do lote anterior com esses filtros
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Empresas",   value: preview.total.toString(),                                                    cls: "text-white" },
              { label: "Com e-mail", value: `${preview.comEmail} (${preview.total ? Math.round(preview.comEmail/preview.total*100) : 0}%)`, cls: "text-sky-400" },
              { label: "WhatsApp",   value: `${preview.comWA} (${preview.total ? Math.round(preview.comWA/preview.total*100) : 0}%)`,    cls: "text-emerald-400" },
              { label: "Score médio",value: `${preview.scoreM.toFixed(1)} pts`,                                          cls: preview.scoreM >= 60 ? "text-emerald-400" : preview.scoreM >= 40 ? "text-amber-400" : "text-rose-400" },
            ].map(m => (
              <div key={m.label} className="rounded-lg bg-zinc-800/50 px-3 py-2 space-y-0.5">
                <p className="text-[10px] text-zinc-500">{m.label}</p>
                <p className={cn("text-sm font-bold", m.cls)}>{m.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600">
            Baseado no último lote executado. Rode novamente para dados atualizados.
          </p>
        </div>
      )}

      {/* ── Resumo + CTA ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">

        {/* Tags do recorte */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <span key={i}
                className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium", t.cls)}>
                {t.label}
              </span>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {isLoading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
              <span className="text-primary font-medium">
                {loadingStep === 1 && "Consultando base de dados (56M+ empresas)..."}
                {loadingStep === 2 && "Montando e classificando empresas..."}
                {loadingStep === 3 && "Enriquecendo dados via web (Scrapling)..."}
                {loadingStep === 4 && "Buscando redes sociais dos sócios..."}
                {loadingStep === 5 && "Concluído!"}
              </span>
              <span className="ml-auto text-muted-foreground tabular-nums">{progressPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-emerald-400 transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {progressDetail && (
              <p className="text-[11px] text-muted-foreground truncate">{progressDetail}</p>
            )}
          </div>
        )}

        {/* Resultado */}
        {resultado && !isLoading && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-emerald-300 font-semibold">{resultado.total_empresas} empresas encontradas</span>
              {resultado.enriquecimento_web?.total_com_enriquecimento > 0 && (
                <span className="text-emerald-300/60 text-xs">
                  · {resultado.enriquecimento_web.total_com_enriquecimento} enriquecidas
                </span>
              )}
            </div>
            <Button size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border-0"
              onClick={() => navigate("/results")}>
              Ver resultados <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Botão principal */}
        <div className="flex items-center gap-3">
          <Button onClick={handleExecutar} disabled={isLoading}
            className="gap-2 px-6" size="default">
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Prospectando...</>
              : <><Target className="w-4 h-4" /> Rodar prospecção</>}
          </Button>
          {resultado && !isLoading && (
            <span className="text-xs text-muted-foreground">
              {cidade} / {uf} · {resultado.total_empresas} leads
            </span>
          )}
        </div>
      </div>

    </div>
  );
};

export default Configure;
