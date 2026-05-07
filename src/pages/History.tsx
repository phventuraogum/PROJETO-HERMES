// src/pages/History.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { Input }  from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  Radar, Legend,
} from "recharts";
import {
  History as HistoryIcon, Trash2, Pencil, Check, X,
  TrendingUp, TrendingDown, Minus, BarChart3, Target, Zap,
  MapPin, Building2, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getHistoricoBuscas, renomearBuscaHistorico, deletarBuscaHistorico,
  type BuscaSalva, type ProspeccaoConfig,
} from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString("pt-BR"); }
function fmtBRL(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}K`;
  return `R$ ${n.toFixed(0)}`;
}
function fmtData(ts: string) {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Faixa de métricas com altura uniforme para alinhar colunas entre cards na mesma linha da grade. */
function MetricStrip({ busca }: { busca: BuscaSalva }) {
  const m = busca.metricas;
  const cells = [
    { label: "Leads", value: fmt(busca.resultado.total_empresas) },
    { label: "Score", value: m.score_medio.toFixed(1) },
    { label: "E-mail", value: `${m.taxa_email.toFixed(0)}%` },
    { label: "WA", value: `${m.taxa_whatsapp.toFixed(0)}%` },
  ];
  return (
    <div className="mt-auto grid grid-cols-4 gap-1 pt-2 border-t border-border/50">
      {cells.map(x => (
        <div
          key={x.label}
          className="rounded-md bg-muted/50 px-0.5 py-1 flex flex-col justify-center gap-0.5 min-h-[44px] text-center">
          <p className="text-xs font-semibold tabular-nums leading-none">{x.value}</p>
          <p className="text-[9px] text-muted-foreground/55 leading-none">{x.label}</p>
        </div>
      ))}
    </div>
  );
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(240 10% 8%)",
  border: "1px solid hsl(240 5% 20%)",
  borderRadius: "8px",
  fontSize: "12px",
};

// ─── Delta badge ──────────────────────────────────────────────────────────────
function Delta({ a, b, suffix = "", higher = "up" }: {
  a: number; b: number; suffix?: string; higher?: "up" | "down";
}) {
  const diff = a - b;
  const up   = higher === "up" ? diff >= 0 : diff <= 0;
  if (Math.abs(diff) < 0.01) return <Minus className="h-3 w-3 text-muted-foreground/50" />;
  return (
    <span className={cn("flex items-center gap-0.5 text-[10px] font-medium",
      up ? "text-emerald-600" : "text-red-600")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {diff > 0 ? "+" : ""}{diff.toFixed(1)}{suffix}
    </span>
  );
}

// ─── Card de busca ────────────────────────────────────────────────────────────
function BuscaCard({ busca, selecionada, onSelecionar, onRenomear, onDeletar }: {
  busca: BuscaSalva;
  selecionada: boolean;
  onSelecionar: () => void;
  onRenomear: (nome: string) => void;
  onDeletar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome]         = useState(busca.nome ?? "");

  const salvarNome = () => {
    onRenomear(nome || fmtData(busca.timestamp));
    setEditando(false);
  };

  return (
    <div
      onClick={() => !editando && onSelecionar()}
      className={cn(
        "rounded-xl border p-3 cursor-pointer transition-all duration-150 h-full min-h-[168px] flex flex-col",
        selecionada
          ? "border-primary/60 bg-primary/5"
          : "border-border bg-muted/20 hover:border-border hover:bg-muted/30"
      )}>
      {/* Nome */}
      <div className="flex items-start justify-between gap-2 mb-2 shrink-0">
        {editando ? (
          <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") salvarNome(); if (e.key === "Escape") setEditando(false); }}
              className="h-6 text-xs border-border bg-muted"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={salvarNome}>
              <Check className="h-3 w-3 text-emerald-600" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditando(false)}>
              <X className="h-3 w-3 text-muted-foreground/70" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {busca.nome || `#${busca.id.slice(-4)} · ${fmtData(busca.timestamp)}`}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 mt-0.5">
                <Calendar className="h-2.5 w-2.5" />
                {fmtData(busca.timestamp)}
              </div>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditando(true)}>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground/70" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onDeletar}>
                <Trash2 className="h-2.5 w-2.5 text-rose-500" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Config resumida — altura mínima para alinhar faixa de métricas entre cards da mesma linha */}
      <div className="flex items-start gap-1 flex-wrap mb-1 min-h-[2.75rem] content-start shrink-0">
        <Badge variant="outline" className="text-[9px] border-border text-muted-foreground py-0 px-1.5">
          <MapPin className="h-2 w-2 mr-0.5 inline" />
          {busca.config.cidade}/{busca.config.uf}
        </Badge>
        {busca.config.segmentos?.slice(0, 2).map(s => (
          <Badge key={s} variant="outline" className="text-[9px] border-border text-muted-foreground/70 py-0 px-1.5 max-w-[7rem] truncate">
            {s}
          </Badge>
        ))}
        {(busca.config.segmentos?.length ?? 0) > 2 && (
          <Badge variant="outline" className="text-[9px] border-border text-muted-foreground/50 py-0 px-1.5">
            +{(busca.config.segmentos?.length ?? 0) - 2}
          </Badge>
        )}
      </div>

      <MetricStrip busca={busca} />
    </div>
  );
}

// ─── Painel de comparação ─────────────────────────────────────────────────────
function Comparacao({ a, b }: { a: BuscaSalva; b: BuscaSalva }) {
  const radarA = [
    { axis: "E-mail",    A: a.metricas.taxa_email,    B: b.metricas.taxa_email    },
    { axis: "WhatsApp",  A: a.metricas.taxa_whatsapp, B: b.metricas.taxa_whatsapp },
    { axis: "Score",     A: a.metricas.score_medio,   B: b.metricas.score_medio   },
    { axis: "Enriq.",    A: a.resultado.total_empresas > 0 ? (a.metricas.enriquecidas / a.resultado.total_empresas) * 100 : 0,
                         B: b.resultado.total_empresas > 0 ? (b.metricas.enriquecidas / b.resultado.total_empresas) * 100 : 0 },
  ];

  const barData = [
    { metrica: "Leads",    A: a.resultado.total_empresas, B: b.resultado.total_empresas },
    { metrica: "E-mail%",  A: a.metricas.taxa_email,      B: b.metricas.taxa_email      },
    { metrica: "WA%",      A: a.metricas.taxa_whatsapp,   B: b.metricas.taxa_whatsapp   },
    { metrica: "Score",    A: a.metricas.score_medio,     B: b.metricas.score_medio     },
  ];

  const nomeA = a.nome ?? `#${a.id.slice(-4)}`;
  const nomeB = b.nome ?? `#${b.id.slice(-4)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-semibold">Comparação lado a lado</h2>
      </div>

      {/* Tabela de métricas */}
      <Card className="border-border bg-card shadow-surface-sm">
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-muted-foreground/70">Métrica</th>
                <th className="text-right px-4 py-2.5 text-primary">{nomeA}</th>
                <th className="text-right px-4 py-2.5 text-sky-600">{nomeB}</th>
                <th className="text-right px-4 py-2.5 text-muted-foreground/70">Δ</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Total de leads",    va: a.resultado.total_empresas, vb: b.resultado.total_empresas, fmt: (v: number) => fmt(v), suffix: "" },
                { label: "Score ICP médio",   va: a.metricas.score_medio,     vb: b.metricas.score_medio,     fmt: (v: number) => v.toFixed(1), suffix: " pts" },
                { label: "Taxa e-mail",        va: a.metricas.taxa_email,      vb: b.metricas.taxa_email,      fmt: (v: number) => `${v.toFixed(1)}%`, suffix: "%" },
                { label: "Taxa WhatsApp",      va: a.metricas.taxa_whatsapp,   vb: b.metricas.taxa_whatsapp,   fmt: (v: number) => `${v.toFixed(1)}%`, suffix: "%" },
                { label: "Capital médio",      va: a.metricas.capital_medio,   vb: b.metricas.capital_medio,   fmt: (v: number) => fmtBRL(v), suffix: "" },
                { label: "Enriquecidas",       va: a.metricas.enriquecidas,    vb: b.metricas.enriquecidas,    fmt: (v: number) => fmt(v), suffix: "" },
              ].map(row => (
                <tr key={row.label} className="border-b border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-2 text-muted-foreground">{row.label}</td>
                  <td className="px-4 py-2 text-right text-foreground font-medium">{row.fmt(row.va)}</td>
                  <td className="px-4 py-2 text-right text-sky-300 font-medium">{row.fmt(row.vb)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end">
                      <Delta a={row.va} b={row.vb} suffix={row.suffix} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground/70 uppercase tracking-widest">Barras comparativas</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 15%)" vertical={false} />
                <XAxis dataKey="metrica" tick={{ fontSize: 10, fill: "hsl(240 5% 55%)" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(240 5% 55%)" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend formatter={v => v === "A" ? nomeA : nomeB} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="A" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="B" fill="#38bdf8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground/70 uppercase tracking-widest">Radar de qualidade</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarA}>
                <PolarGrid stroke="hsl(240 5% 18%)" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "hsl(240 5% 55%)" }} />
                <Radar name={nomeA} dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                <Radar name={nomeB} dataKey="B" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15} strokeWidth={2} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}`, ""]} />
                <Legend formatter={v => v === nomeA ? nomeA : nomeB} wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
const History = () => {
  const navigate = useNavigate();
  const [buscas, setBuscas]         = useState<BuscaSalva[]>([]);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const reload = async () => {
    setBuscas(await getHistoricoBuscas());
  };

  useEffect(() => {
    let cancelled = false;
    void getHistoricoBuscas().then((data) => {
      if (!cancelled) setBuscas(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSel = (id: string) => {
    setSelecionadas(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const handleRenomear = async (id: string, nome: string) => {
    await renomearBuscaHistorico(id, nome);
    await reload();
  };

  const handleDeletar = async (id: string) => {
    await deletarBuscaHistorico(id);
    setSelecionadas(prev => prev.filter(x => x !== id));
    await reload();
    setConfirmDel(null);
  };

  const buscaA = buscas.find(b => b.id === selecionadas[0]);
  const buscaB = buscas.find(b => b.id === selecionadas[1]);
  const comparing = !!(buscaA && buscaB);

  if (buscas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/20">
          <HistoryIcon className="h-8 w-8 text-muted-foreground/70" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold">Histórico vazio</p>
          <p className="text-sm text-muted-foreground">
            Suas prospecções aparecem aqui automaticamente após cada busca.
          </p>
        </div>
        <Button onClick={() => navigate("/app")} className="gap-2">
          <Zap className="h-4 w-4" /> Fazer primeira prospecção
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display">Histórico de Prospecções</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {buscas.length} busca{buscas.length !== 1 ? "s" : ""} salva{buscas.length !== 1 ? "s" : ""} ·{" "}
          Selecione 2 para comparar lado a lado
        </p>
      </div>

      <div
        className={cn(
          "flex gap-5",
          comparing ? "flex-col" : "flex-col xl:flex-row xl:items-start"
        )}>
        {/* Grade de cards (até 4 colunas em telas grandes) */}
        <div className={cn("min-w-0 space-y-2", !comparing && "xl:flex-1")}>
          {selecionadas.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 shrink-0" />
              {selecionadas.length === 1
                ? "Detalhes à direita · Selecione outra busca para comparar lado a lado"
                : "Comparando as duas buscas — painel expandido abaixo"}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-stretch">
            {buscas.map(b => (
              <BuscaCard
                key={b.id}
                busca={b}
                selecionada={selecionadas.includes(b.id)}
                onSelecionar={() => toggleSel(b.id)}
                onRenomear={nome => { void handleRenomear(b.id, nome); }}
                onDeletar={() => setConfirmDel(b.id)}
              />
            ))}
          </div>
        </div>

        {/* Painel de detalhe / comparação */}
        <div
          className={cn(
            "rounded-xl border border-border/60 bg-muted/5",
            comparing
              ? "w-full"
              : "w-full xl:w-[min(100%,440px)] xl:shrink-0 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-6rem)] xl:overflow-hidden"
          )}>
          <div className={cn("p-4", comparing ? "" : "min-h-[12rem] max-xl:min-h-[10rem]")}>
            {comparing ? (
              <Comparacao a={buscaA} b={buscaB} />
            ) : buscaA ? (
              <DetalheSimples busca={buscaA} />
            ) : (
              <div className="flex items-center justify-center min-h-[10rem] rounded-lg border border-dashed border-border text-sm text-muted-foreground/60 text-center px-4">
                Selecione uma busca na grade para ver o histórico completo (filtros, métricas e lista, quando disponível).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDel} onOpenChange={v => !v && setConfirmDel(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar busca?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove o registro do histórico. As empresas continuam no pipeline se foram adicionadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => { if (confirmDel) void handleDeletar(confirmDel); }}>
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function formatCnpjDigits(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function buildConfigRows(config: ProspeccaoConfig): [string, string][] {
  const rows: [string, string][] = [
    ["Cidade / UF", `${config.cidade} / ${config.uf}`],
    ["Termo base", config.termo_base?.trim() || "—"],
    ["Segmentos", config.segmentos?.length ? config.segmentos.join(", ") : "Todos"],
    ["Portes", config.portes?.length ? config.portes.join(", ") : "Todos"],
    ["Capital mínimo", `R$ ${(config.capital_minimo ?? 0).toLocaleString("pt-BR")}`],
    ["Capital máximo", config.capital_maximo != null ? `R$ ${Number(config.capital_maximo).toLocaleString("pt-BR")}` : "—"],
    ["Limite de empresas", String(config.limite_empresas)],
    ["Enriquecimento web", config.enriquecimento_web ? "Ativo" : "Desativado"],
    ["Exigir contato acionável", config.exigir_contato_acionavel ? "Sim" : "Não"],
    ["Priorizar com contato", config.priorizar_com_contato ? "Sim" : "Não"],
    ["CNAE principal estrito", config.cnae_principal_estrito ? "Sim" : "Não"],
    ["Incluir CNAE secundário", config.incluir_cnae_secundario ? "Sim" : "Não"],
  ];
  if (config.cidades?.length) rows.push(["Cidades (lista)", config.cidades.join(", ")]);
  if (config.ufs?.length) rows.push(["UFs (lista)", config.ufs.join(", ")]);
  if (config.cnaes?.length) rows.push(["CNAEs", config.cnaes.join(", ")]);
  if (config.excluir_cnpjs?.length) rows.push(["CNPJs excluídos", config.excluir_cnpjs.map(formatCnpjDigits).join(", ")]);
  if (config.idade_minima_anos != null) rows.push(["Idade mínima (anos)", String(config.idade_minima_anos)]);
  if (config.idade_maxima_anos != null) rows.push(["Idade máxima (anos)", String(config.idade_maxima_anos)]);
  if (config.subsegmento_alvo?.trim()) rows.push(["Subsegmento alvo", config.subsegmento_alvo.trim()]);
  return rows;
}

// ─── Detalhe de busca única ───────────────────────────────────────────────────
function DetalheSimples({ busca }: { busca: BuscaSalva }) {
  const navigate = useNavigate();
  const m = busca.metricas;
  const empresas = busca.resultado.empresas ?? [];
  const kpis = [
    { label: "Total de leads",   value: fmt(busca.resultado.total_empresas) },
    { label: "Score ICP médio",  value: `${m.score_medio.toFixed(1)} pts` },
    { label: "Com e-mail",       value: `${m.taxa_email.toFixed(1)}%` },
    { label: "Com WhatsApp",     value: `${m.taxa_whatsapp.toFixed(1)}%` },
    { label: "Enriquecidas",     value: fmt(m.enriquecidas) },
    { label: "Capital médio",    value: fmtBRL(m.capital_medio) },
  ];

  return (
    <div className="max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain pr-2">
      <div className="space-y-4 pb-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">
                {busca.nome || `Prospecção ${fmtData(busca.timestamp)}`}
              </h2>
              <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                <Calendar className="h-3 w-3 shrink-0" />
                {fmtData(busca.timestamp)}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={() => navigate("/results")}>
            Abrir resultados
          </Button>
        </div>

        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground/70 uppercase tracking-widest">
              Parâmetros da prospecção
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5 text-xs">
            {buildConfigRows(busca.config).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-muted-foreground/70 min-w-[140px] shrink-0">{k}</span>
                <span className="text-foreground/85 break-words">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div>
          <p className="text-xs text-muted-foreground/70 uppercase tracking-widest mb-2">Métricas do resultado</p>
          <div className="grid grid-cols-2 gap-2">
            {kpis.map(k => (
              <div key={k.label} className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                <p className="text-base font-bold tabular-nums">{k.value}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground/70 uppercase tracking-widest">
              Empresas capturadas ({empresas.length ? fmt(empresas.length) : "0"})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {empresas.length > 0 ? (
              <div className="rounded-md border border-border overflow-hidden">
                <ScrollArea className="h-[min(360px,50vh)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] h-8">CNPJ</TableHead>
                        <TableHead className="text-[10px] h-8">Razão social</TableHead>
                        <TableHead className="text-[10px] h-8 w-14 text-right">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {empresas.map(e => (
                        <TableRow key={e.cnpj}>
                          <TableCell className="text-[10px] tabular-nums py-1.5">{formatCnpjDigits(e.cnpj)}</TableCell>
                          <TableCell className="text-[10px] py-1.5 max-w-[180px] truncate" title={e.razao_social}>
                            {e.razao_social}
                          </TableCell>
                          <TableCell className="text-[10px] py-1.5 text-right tabular-nums">
                            {e.score_icp != null ? e.score_icp.toFixed(1) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                O histórico guarda só o resumo e as métricas para não estourar o armazenamento do navegador.
                A lista completa de empresas da última execução costuma estar em{" "}
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => navigate("/results")}>
                  Resultados
                </button>
                {" "}logo após a prospecção.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default History;
