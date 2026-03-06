// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, Radar, Legend,
} from "recharts";
import {
  Building2, TrendingUp, Mail, Phone, DollarSign, BarChart3,
  MessageCircle, Globe, Linkedin, Target, ArrowRight,
  Zap, MapPin, CheckCircle2, AlertCircle, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DashboardData, getDashboardUltimaExecucao,
} from "@/lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBRL(n: number) {
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `R$ ${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function scoreColor(s: number) {
  if (s >= 75) return "text-emerald-400";
  if (s >= 50) return "text-blue-400";
  if (s >= 25) return "text-amber-400";
  return "text-rose-400";
}

function scoreBarColor(s: number) {
  if (s >= 75) return "bg-emerald-500";
  if (s >= 50) return "bg-blue-500";
  if (s >= 25) return "bg-amber-500";
  return "bg-rose-500";
}

const SEG_COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e",
  "#06b6d4","#3b82f6","#8b5cf6","#ec4899",
];

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(240 10% 8%)",
  border: "1px solid hsl(240 5% 20%)",
  borderRadius: "8px",
  fontSize: "12px",
};

// ─── mini KPI card ────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, iconColor, trend,
}: {
  icon: React.FC<{ className?: string }>;
  label: string; value: string; sub?: string;
  iconColor: string; trend?: { value: number; label: string };
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-950/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/80")}>
            <Icon className={cn("h-4 w-4", iconColor)} />
          </div>
          {trend && (
            <span className={cn("text-[10px] font-medium", trend.value >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {trend.value >= 0 ? "+" : ""}{trend.value.toFixed(0)}%
            </span>
          )}
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── barra de canal de contato ────────────────────────────────────────────────
function CanalBar({ canal, total, pct, color, icon: Icon }: {
  canal: string; total: number; pct: number; color: string;
  icon: React.FC<{ className?: string }>;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3 w-3", color)} />
          <span className="text-zinc-300">{canal}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">{total}</span>
          <span className={cn("font-semibold", color)}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color.replace("text-", "bg-"))}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ─── score badge ──────────────────────────────────────────────────────────────
function ScoreChip({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full", scoreBarColor(score))}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <span className={cn("text-xs font-semibold", scoreColor(score))}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────
function EmptyDashboard() {
  const nav = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
        <Target className="h-8 w-8 text-zinc-500" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-lg font-semibold">Nenhuma prospecção ainda</p>
        <p className="text-sm text-muted-foreground">
          Rode uma busca para ver os analytics da sua base de leads.
        </p>
      </div>
      <Button onClick={() => nav("/app")} className="gap-2">
        <Zap className="h-4 w-4" /> Configurar prospecção
      </Button>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate  = useNavigate();
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardUltimaExecucao()
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // ── radar ICP ──────────────────────────────────────────────────────────────
  const radarData = useMemo(() => {
    if (!data) return [];
    const t = data.total_empresas || 1;
    return [
      { axis: "E-mail",   val: data.taxa_email },
      { axis: "Telefone", val: data.taxa_whatsapp },
      { axis: "WhatsApp", val: data.canais_contato.find(c => c.canal === "WhatsApp")?.pct ?? 0 },
      { axis: "LinkedIn", val: (data.com_linkedin / t) * 100 },
      { axis: "Site",     val: (data.com_site / t) * 100 },
      { axis: "Enriq.",   val: (data.empresas_enriquecidas / t) * 100 },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando dashboard...
        </div>
      </div>
    );
  }

  if (!data || data.total_empresas === 0) return <EmptyDashboard />;

  const canalIcons: Record<string, React.FC<{ className?: string }>> = {
    "E-mail":   Mail,
    "Telefone": Phone,
    "WhatsApp": MessageCircle,
    "LinkedIn": Linkedin,
    "Site":     Globe,
  };
  const canalColors: Record<string, string> = {
    "E-mail":   "text-sky-400",
    "Telefone": "text-zinc-400",
    "WhatsApp": "text-emerald-400",
    "LinkedIn": "text-blue-400",
    "Site":     "text-violet-400",
  };

  return (
    <div className="space-y-6 p-1">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard de Prospecção</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.execucao_cidade && (
              <><MapPin className="inline h-3 w-3 mr-0.5" />{data.execucao_cidade} / {data.execucao_uf} · </>
            )}
            {data.execucao_ts && new Date(data.execucao_ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700"
          onClick={() => navigate("/results")}>
          Ver resultados <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── KPIs linha 1 ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Building2}   label="Total de leads"    value={data.total_empresas.toString()}               iconColor="text-white" />
        <KpiCard icon={CheckCircle2} label="Enriquecidos"     value={data.empresas_enriquecidas.toString()}        sub={`${((data.empresas_enriquecidas/data.total_empresas)*100).toFixed(0)}% do total`} iconColor="text-emerald-400" />
        <KpiCard icon={BarChart3}   label="Score ICP médio"   value={data.score_medio.toFixed(1)}                  sub="de 100 pts"       iconColor="text-amber-400" />
        <KpiCard icon={DollarSign}  label="Capital médio"     value={formatBRL(data.capital_medio)}               sub="por empresa"      iconColor="text-violet-400" />
        <KpiCard icon={DollarSign}  label="Capital total"     value={formatBRL(data.capital_total)}               sub="pool de mercado"  iconColor="text-sky-400" />
        {data.pib_medio > 0
          ? <KpiCard icon={TrendingUp} label="PIB médio / mun."  value={formatBRL(data.pib_medio)}                sub="IBGE" iconColor="text-orange-400" />
          : <KpiCard icon={Users}      label="Com LinkedIn"       value={data.com_linkedin.toString()}             sub={`${((data.com_linkedin/data.total_empresas)*100).toFixed(0)}% do total`} iconColor="text-blue-400" />
        }
      </div>

      {/* ── Canais + Radar + Score dist ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Canais de contato */}
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" /> Canais de contato
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {data.canais_contato.map(c => (
              <CanalBar
                key={c.canal}
                canal={c.canal} total={c.total} pct={c.pct}
                color={canalColors[c.canal] ?? "text-zinc-400"}
                icon={canalIcons[c.canal] ?? Phone}
              />
            ))}
            <div className="mt-2 pt-2 border-t border-zinc-800 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-zinc-900/60 p-2">
                <p className="text-zinc-500">Com LinkedIn</p>
                <p className="font-semibold text-blue-400">{data.com_linkedin}</p>
              </div>
              <div className="rounded-lg bg-zinc-900/60 p-2">
                <p className="text-zinc-500">Com site</p>
                <p className="font-semibold text-violet-400">{data.com_site}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Radar ICP */}
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Target className="h-3.5 w-3.5" /> Qualidade do lote (Radar ICP)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(240 5% 20%)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 11, fill: "hsl(240 5% 60%)" }}
                />
                <Radar
                  name="Cobertura %"
                  dataKey="val"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Cobertura"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Score distribution */}
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5" /> Distribuição de Score ICP
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {data.score_distribuicao.map(f => (
              <div key={f.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Score {f.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">{f.count}</span>
                    <span className="font-semibold" style={{ color: f.color }}>
                      {data.total_empresas > 0 ? ((f.count / data.total_empresas) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${data.total_empresas > 0 ? (f.count / data.total_empresas) * 100 : 0}%`,
                      backgroundColor: f.color,
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Medidor geral do score médio */}
            <div className="mt-3 pt-3 border-t border-zinc-800 rounded-lg bg-zinc-900/40 p-3">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-zinc-500">Score médio do lote</span>
                <span className={cn("font-bold text-sm", scoreColor(data.score_medio))}>
                  {data.score_medio.toFixed(1)} pts
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", scoreBarColor(data.score_medio))}
                  style={{ width: `${Math.min(100, data.score_medio)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts: Segmentos + Portes + UF + Capital ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Segmentos — Donut */}
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Segmentos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={data.empresas_por_segmento.map((s, i) => ({
                      name: s.segmento, value: s.total,
                      fill: SEG_COLORS[i % SEG_COLORS.length],
                    }))}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    dataKey="value" strokeWidth={0}>
                    {data.empresas_por_segmento.map((_, i) => (
                      <Cell key={i} fill={SEG_COLORS[i % SEG_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, n: string) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {data.empresas_por_segmento.slice(0, 6).map((s, i) => (
                  <div key={s.segmento} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: SEG_COLORS[i % SEG_COLORS.length] }} />
                      <span className="text-zinc-300 truncate">{s.segmento}</span>
                    </div>
                    <span className="text-zinc-500 ml-2 flex-shrink-0">
                      {s.total} ({((s.total / data.total_empresas) * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Porte — barras horizontais */}
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Porte das empresas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {data.empresas_por_porte.map(p => {
              const pct = (p.total / data.total_empresas) * 100;
              const colors: Record<string, string> = {
                ME: "bg-blue-500", EPP: "bg-emerald-500",
                "Médio/Grande": "bg-amber-500", Grande: "bg-purple-500",
              };
              const textColors: Record<string, string> = {
                ME: "text-blue-400", EPP: "text-emerald-400",
                "Médio/Grande": "text-amber-400", Grande: "text-purple-400",
              };
              const bg = colors[p.porte] ?? "bg-zinc-600";
              const tc = textColors[p.porte] ?? "text-zinc-400";
              return (
                <div key={p.porte} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-medium", tc)}>{p.porte}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">{p.total}</span>
                      <span className={cn("font-semibold", tc)}>{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div className={cn("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* UF — barras */}
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Estados (Top 8)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.empresas_por_uf.slice(0, 8)}
                margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 15%)" vertical={false} />
                <XAxis dataKey="uf" tick={{ fontSize: 11, fill: "hsl(240 5% 55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(240 5% 55%)" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => [v.toLocaleString("pt-BR"), "Empresas"]} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Capital — faixas */}
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Faixas de capital social
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.capital_faixas}
                margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 15%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(240 5% 55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(240 5% 55%)" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => [v.toLocaleString("pt-BR"), "Empresas"]} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Top leads por score ─────────────────────────────────────────────── */}
      <Card className="border-zinc-800 bg-zinc-950/60">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" /> Top leads por Score ICP
            </CardTitle>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-primary"
              onClick={() => navigate("/results")}>
              Ver todos <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="space-y-2">
            {data.top_empresas.map((emp, i) => {
              const temContato = emp.telefone_padrao || emp.email || emp.whatsapp_publico || emp.whatsapp_enriquecido;
              return (
                <div key={emp.cnpj}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5 hover:border-zinc-700 hover:bg-zinc-800/40 transition-colors">
                  {/* Rank */}
                  <span className={cn("flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    i === 0 ? "bg-amber-500/20 text-amber-300" :
                    i === 1 ? "bg-zinc-500/20 text-zinc-300" :
                    i === 2 ? "bg-orange-700/20 text-orange-400" : "bg-zinc-800 text-zinc-500")}>
                    {i + 1}
                  </span>

                  {/* Nome */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {emp.nome_fantasia || emp.razao_social}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <MapPin className="h-2.5 w-2.5" />
                      {emp.cidade || "—"} / {emp.uf || "—"}
                      {emp.segmento && (
                        <Badge variant="outline" className="border-zinc-700 bg-zinc-800/60 text-[9px] text-zinc-400 ml-1">
                          {emp.segmento}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex-shrink-0 w-24 hidden sm:block">
                    <ScoreChip score={emp.score_icp} />
                  </div>

                  {/* Contato icons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {emp.email && (
                      <div className="h-6 w-6 flex items-center justify-center rounded-md bg-sky-500/10 border border-sky-500/30">
                        <Mail className="h-3 w-3 text-sky-400" />
                      </div>
                    )}
                    {(emp.whatsapp_publico || emp.whatsapp_enriquecido) && (
                      <div className="h-6 w-6 flex items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/30">
                        <MessageCircle className="h-3 w-3 text-emerald-400" />
                      </div>
                    )}
                    {emp.telefone_padrao && (
                      <div className="h-6 w-6 flex items-center justify-center rounded-md bg-zinc-800 border border-zinc-700">
                        <Phone className="h-3 w-3 text-zinc-400" />
                      </div>
                    )}
                    {!temContato && (
                      <AlertCircle className="h-3.5 w-3.5 text-zinc-600" title="Sem contato" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

export default Dashboard;
