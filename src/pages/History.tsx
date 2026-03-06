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
import {
  getHistoricoLocal, renomearBusca, deletarBusca, type BuscaSalva,
} from "@/lib/api";

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
  if (Math.abs(diff) < 0.01) return <Minus className="h-3 w-3 text-zinc-600" />;
  return (
    <span className={cn("flex items-center gap-0.5 text-[10px] font-medium",
      up ? "text-emerald-400" : "text-rose-400")}>
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

  const m = busca.metricas;

  return (
    <div
      onClick={() => !editando && onSelecionar()}
      className={cn(
        "rounded-xl border p-3 cursor-pointer transition-all duration-150",
        selecionada
          ? "border-primary/60 bg-primary/5"
          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-800/40"
      )}>
      {/* Nome */}
      <div className="flex items-start justify-between gap-2 mb-2">
        {editando ? (
          <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") salvarNome(); if (e.key === "Escape") setEditando(false); }}
              className="h-6 text-xs border-zinc-700 bg-zinc-800"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={salvarNome}>
              <Check className="h-3 w-3 text-emerald-400" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditando(false)}>
              <X className="h-3 w-3 text-zinc-500" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {busca.nome || `#${busca.id.slice(-4)} · ${fmtData(busca.timestamp)}`}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-0.5">
                <Calendar className="h-2.5 w-2.5" />
                {fmtData(busca.timestamp)}
              </div>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditando(true)}>
                <Pencil className="h-2.5 w-2.5 text-zinc-500" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onDeletar}>
                <Trash2 className="h-2.5 w-2.5 text-rose-500" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Config resumida */}
      <div className="flex items-center gap-1 flex-wrap mb-2">
        <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-400 py-0 px-1.5">
          <MapPin className="h-2 w-2 mr-0.5 inline" />
          {busca.config.cidade}/{busca.config.uf}
        </Badge>
        {busca.config.segmentos?.slice(0, 2).map(s => (
          <Badge key={s} variant="outline" className="text-[9px] border-zinc-700 text-zinc-500 py-0 px-1.5">
            {s}
          </Badge>
        ))}
        {(busca.config.segmentos?.length ?? 0) > 2 && (
          <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-600 py-0 px-1.5">
            +{(busca.config.segmentos?.length ?? 0) - 2}
          </Badge>
        )}
      </div>

      {/* Métricas mini */}
      <div className="grid grid-cols-4 gap-1 text-center">
        {[
          { label: "Leads", value: fmt(busca.resultado.total_empresas) },
          { label: "Score",  value: m.score_medio.toFixed(1) },
          { label: "E-mail", value: `${m.taxa_email.toFixed(0)}%` },
          { label: "WA",     value: `${m.taxa_whatsapp.toFixed(0)}%` },
        ].map(x => (
          <div key={x.label} className="rounded bg-zinc-800/50 py-1">
            <p className="text-xs font-semibold">{x.value}</p>
            <p className="text-[9px] text-zinc-600">{x.label}</p>
          </div>
        ))}
      </div>
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
        <Zap className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-semibold">Comparação lado a lado</h2>
      </div>

      {/* Tabela de métricas */}
      <Card className="border-zinc-800 bg-zinc-950/60">
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-2.5 text-zinc-500">Métrica</th>
                <th className="text-right px-4 py-2.5 text-primary">{nomeA}</th>
                <th className="text-right px-4 py-2.5 text-sky-400">{nomeB}</th>
                <th className="text-right px-4 py-2.5 text-zinc-500">Δ</th>
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
                <tr key={row.label} className="border-b border-zinc-800/60 hover:bg-zinc-800/20">
                  <td className="px-4 py-2 text-zinc-400">{row.label}</td>
                  <td className="px-4 py-2 text-right text-white font-medium">{row.fmt(row.va)}</td>
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
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-zinc-500 uppercase tracking-widest">Barras comparativas</CardTitle>
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

        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-zinc-500 uppercase tracking-widest">Radar de qualidade</CardTitle>
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

  useEffect(() => { setBuscas(getHistoricoLocal()); }, []);

  const reload = () => setBuscas(getHistoricoLocal());

  const toggleSel = (id: string) => {
    setSelecionadas(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const handleRenomear = (id: string, nome: string) => {
    renomearBusca(id, nome);
    reload();
  };

  const handleDeletar = (id: string) => {
    deletarBusca(id);
    setSelecionadas(prev => prev.filter(x => x !== id));
    reload();
    setConfirmDel(null);
  };

  const buscaA = buscas.find(b => b.id === selecionadas[0]);
  const buscaB = buscas.find(b => b.id === selecionadas[1]);

  if (buscas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
          <HistoryIcon className="h-8 w-8 text-zinc-500" />
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
        <h1 className="text-2xl font-semibold">Histórico de Prospecções</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {buscas.length} busca{buscas.length !== 1 ? "s" : ""} salva{buscas.length !== 1 ? "s" : ""} ·{" "}
          Selecione 2 para comparar lado a lado
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Lista */}
        <div className="space-y-2">
          {selecionadas.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5" />
              {selecionadas.length === 1
                ? "Selecione outra busca para comparar"
                : "Comparando as 2 buscas →"}
            </div>
          )}
          {buscas.map(b => (
            <BuscaCard
              key={b.id}
              busca={b}
              selecionada={selecionadas.includes(b.id)}
              onSelecionar={() => toggleSel(b.id)}
              onRenomear={nome => handleRenomear(b.id, nome)}
              onDeletar={() => setConfirmDel(b.id)}
            />
          ))}
        </div>

        {/* Painel de detalhe / comparação */}
        <div>
          {buscaA && buscaB ? (
            <Comparacao a={buscaA} b={buscaB} />
          ) : buscaA ? (
            <DetalheSimples busca={buscaA} />
          ) : (
            <div className="flex items-center justify-center h-40 rounded-xl border border-dashed border-zinc-800 text-sm text-zinc-600">
              Selecione uma busca para ver detalhes
            </div>
          )}
        </div>
      </div>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDel} onOpenChange={v => !v && setConfirmDel(null)}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
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
              onClick={() => confirmDel && handleDeletar(confirmDel)}>
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─── Detalhe de busca única ───────────────────────────────────────────────────
function DetalheSimples({ busca }: { busca: BuscaSalva }) {
  const m = busca.metricas;
  const kpis = [
    { label: "Total de leads",   value: fmt(busca.resultado.total_empresas) },
    { label: "Score ICP médio",  value: `${m.score_medio.toFixed(1)} pts` },
    { label: "Com e-mail",       value: `${m.taxa_email.toFixed(1)}%` },
    { label: "Com WhatsApp",     value: `${m.taxa_whatsapp.toFixed(1)}%` },
    { label: "Enriquecidas",     value: fmt(m.enriquecidas) },
    { label: "Capital médio",    value: fmtBRL(m.capital_medio) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-semibold">
          {busca.nome || fmtData(busca.timestamp)}
        </h2>
      </div>

      {/* Filtros usados */}
      <Card className="border-zinc-800 bg-zinc-950/60">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs text-zinc-500 uppercase tracking-widest">Filtros da busca</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-1.5 text-xs">
          {[
            ["Cidade / UF", `${busca.config.cidade} / ${busca.config.uf}`],
            ["Termo", busca.config.termo_base || "—"],
            ["Segmentos", busca.config.segmentos?.join(", ") || "Todos"],
            ["Portes", busca.config.portes?.join(", ") || "Todos"],
            ["Capital mínimo", `R$ ${(busca.config.capital_minimo || 0).toLocaleString("pt-BR")}`],
            ["Enriquecimento", busca.config.enriquecimento_web ? "Ativo" : "Desativado"],
            ["Limite", busca.config.limite_empresas.toString()],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-zinc-500 min-w-[100px]">{k}</span>
              <span className="text-zinc-300">{v}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        {kpis.map(k => (
          <div key={k.label} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center">
            <p className="text-lg font-bold">{k.value}</p>
            <p className="text-[10px] text-zinc-500">{k.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default History;
