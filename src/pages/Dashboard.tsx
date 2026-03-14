// src/pages/Dashboard.tsx — Hermes Design System v2
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import {
  Building2, TrendingUp, Mail, Phone, DollarSign, BarChart3,
  MessageCircle, Globe, Linkedin, Target, ArrowRight,
  Zap, MapPin, CheckCircle2, AlertCircle, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DashboardData, getDashboardUltimaExecucao } from "@/lib/api";

function formatBRL(n: number) {
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function scoreColor(s: number) {
  if (s >= 75) return "text-emerald-600";
  if (s >= 50) return "text-blue-600";
  if (s >= 25) return "text-amber-600";
  return "text-red-600";
}
function scoreBg(s: number) {
  if (s >= 75) return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (s >= 50) return "bg-blue-50 border-blue-200 text-blue-700";
  if (s >= 25) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-red-50 border-red-200 text-red-700";
}
function scoreBarColor(s: number) {
  if (s >= 75) return "bg-emerald-500";
  if (s >= 50) return "bg-blue-500";
  if (s >= 25) return "bg-amber-500";
  return "bg-red-500";
}

const SEG_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(0 0% 100%)",
  border: "1px solid hsl(216 14% 90%)",
  borderRadius: "8px",
  fontSize: "12px",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.06)",
  color: "hsl(220 15% 12%)",
};

/* ── KPI Card ─────────────────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.FC<{ className?: string }>;
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="stat-card">
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-3", accent || "bg-primary/10")}>
        <Icon className={cn("h-4 w-4", accent ? "text-white" : "text-primary")} />
      </div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Canal bar ────────────────────────────────────────────────────────────── */
function CanalBar({ canal, total, pct, color, icon: Icon }: {
  canal: string; total: number; pct: number; color: string;
  icon: React.FC<{ className?: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5", color)} />
          <span className="text-foreground/80">{canal}</span>
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="text-muted-foreground">{total}</span>
          <span className={cn("font-semibold", color)}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color.replace("text-", "bg-"))}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

/* ── Score chip ───────────────────────────────────────────────────────────── */
function ScoreChip({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", scoreBarColor(score))} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className={cn("text-xs font-semibold tabular-nums", scoreColor(score))}>{score.toFixed(0)}</span>
    </div>
  );
}

/* ── Empty State ──────────────────────────────────────────────────────────── */
function EmptyDashboard() {
  const nav = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-5">
      <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
        <Target className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-lg font-display text-foreground">Nenhuma prospecção ainda</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Execute sua primeira busca para ver os analytics da sua base de leads.
        </p>
      </div>
      <Button onClick={() => nav("/app")} className="gap-2 text-white shadow-surface-sm" style={{ background: "var(--pinn-orange)" }}>
        <Zap className="h-4 w-4" /> Configurar prospecção
      </Button>
    </div>
  );
}

/* ── PRINCIPAL ────────────────────────────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardUltimaExecucao().then(d => setData(d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

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
      <div className="flex items-center justify-center py-32">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando dashboard...
        </div>
      </div>
    );
  }

  if (!data || data.total_empresas === 0) return <EmptyDashboard />;

  const canalIcons: Record<string, React.FC<{ className?: string }>> = {
    "E-mail": Mail, "Telefone": Phone, "WhatsApp": MessageCircle, "LinkedIn": Linkedin, "Site": Globe,
  };
  const canalColors: Record<string, string> = {
    "E-mail": "text-sky-500", "Telefone": "text-slate-500", "WhatsApp": "text-emerald-500",
    "LinkedIn": "text-blue-500", "Site": "text-violet-500",
  };

  return (
    <div className="space-y-6 animate-in-fade">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-foreground">Dashboard de Prospecção</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            {data.execucao_cidade && (
              <><MapPin className="h-3.5 w-3.5" />{data.execucao_cidade} / {data.execucao_uf} · </>
            )}
            {data.execucao_ts && new Date(data.execucao_ts).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shadow-surface-xs" onClick={() => navigate("/results")}>
          Ver resultados <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Building2}    label="Total de leads"   value={data.total_empresas.toLocaleString("pt-BR")} accent="gradient-primary" />
        <KpiCard icon={CheckCircle2} label="Enriquecidos"     value={data.empresas_enriquecidas.toLocaleString("pt-BR")} sub={`${((data.empresas_enriquecidas/data.total_empresas)*100).toFixed(0)}% do total`} />
        <KpiCard icon={BarChart3}    label="Score ICP médio"  value={data.score_medio.toFixed(1)} sub="de 100 pts" />
        <KpiCard icon={DollarSign}   label="Capital médio"    value={formatBRL(data.capital_medio)} sub="por empresa" />
        <KpiCard icon={DollarSign}   label="Capital total"    value={formatBRL(data.capital_total)} sub="pool total" />
        {data.pib_medio > 0
          ? <KpiCard icon={TrendingUp} label="PIB médio / mun." value={formatBRL(data.pib_medio)} sub="IBGE" />
          : <KpiCard icon={Users}      label="Com LinkedIn"     value={data.com_linkedin.toLocaleString("pt-BR")} sub={`${((data.com_linkedin/data.total_empresas)*100).toFixed(0)}% do total`} />
        }
      </div>

      {/* ── Canais + Radar + Score ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Canais */}
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-4">
            <Phone className="h-3.5 w-3.5" /> Canais de contato
          </p>
          <div className="space-y-3">
            {data.canais_contato.map(c => (
              <CanalBar key={c.canal} canal={c.canal} total={c.total} pct={c.pct}
                color={canalColors[c.canal] ?? "text-slate-500"} icon={canalIcons[c.canal] ?? Phone} />
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-[11px] text-muted-foreground">Com LinkedIn</p>
              <p className="text-sm font-semibold text-blue-600 tabular-nums">{data.com_linkedin}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-[11px] text-muted-foreground">Com site</p>
              <p className="text-sm font-semibold text-violet-600 tabular-nums">{data.com_site}</p>
            </div>
          </div>
        </div>

        {/* Radar ICP */}
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-2">
            <Target className="h-3.5 w-3.5" /> Radar ICP
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(216 14% 90%)" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "hsl(215 12% 52%)" }} />
              <Radar name="Cobertura %" dataKey="val"
                stroke="hsl(221 65% 36%)" fill="hsl(221 65% 36%)" fillOpacity={0.15} strokeWidth={2} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, "Cobertura"]} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Score distribution */}
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-4">
            <BarChart3 className="h-3.5 w-3.5" /> Distribuição de Score
          </p>
          <div className="space-y-3">
            {data.score_distribuicao.map(f => (
              <div key={f.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground/80">Score {f.label}</span>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground">{f.count}</span>
                    <span className="font-semibold" style={{ color: f.color }}>
                      {data.total_empresas > 0 ? ((f.count / data.total_empresas) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${data.total_empresas > 0 ? (f.count / data.total_empresas) * 100 : 0}%`, backgroundColor: f.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border rounded-xl bg-muted/40 p-3">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Score médio do lote</span>
              <span className={cn("font-bold", scoreColor(data.score_medio))}>{data.score_medio.toFixed(1)} pts</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full", scoreBarColor(data.score_medio))} style={{ width: `${Math.min(100, data.score_medio)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Segmentos */}
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Segmentos</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={data.empresas_por_segmento.map((s, i) => ({ name: s.segmento, value: s.total, fill: SEG_COLORS[i % SEG_COLORS.length] }))}
                  cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="value" strokeWidth={2} stroke="white">
                  {data.empresas_por_segmento.map((_, i) => (
                    <Cell key={i} fill={SEG_COLORS[i % SEG_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.empresas_por_segmento.slice(0, 6).map((s, i) => (
                <div key={s.segmento} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: SEG_COLORS[i % SEG_COLORS.length] }} />
                    <span className="text-foreground/80 truncate">{s.segmento}</span>
                  </div>
                  <span className="text-muted-foreground ml-2 tabular-nums shrink-0">
                    {s.total} ({((s.total / data.total_empresas) * 100).toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Porte */}
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Porte das empresas</p>
          <div className="space-y-3">
            {data.empresas_por_porte.map(p => {
              const pct = (p.total / data.total_empresas) * 100;
              const styles: Record<string, { bar: string; text: string }> = {
                ME: { bar: "bg-blue-500", text: "text-blue-600" },
                EPP: { bar: "bg-emerald-500", text: "text-emerald-600" },
                "Médio/Grande": { bar: "bg-amber-500", text: "text-amber-600" },
                Grande: { bar: "bg-violet-500", text: "text-violet-600" },
              };
              const style = styles[p.porte] ?? { bar: "bg-slate-400", text: "text-slate-500" };
              return (
                <div key={p.porte} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-medium", style.text)}>{p.porte}</span>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-muted-foreground">{p.total}</span>
                      <span className={cn("font-semibold", style.text)}>{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-700", style.bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* UF */}
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Estados (Top 8)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.empresas_por_uf.slice(0, 8)} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 14% 92%)" vertical={false} />
              <XAxis dataKey="uf" tick={{ fontSize: 11, fill: "hsl(215 12% 52%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215 12% 52%)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Empresas"]} />
              <Bar dataKey="total" fill="hsl(221 65% 36%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Capital */}
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Faixas de capital social</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.capital_faixas} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 14% 92%)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215 12% 52%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215 12% 52%)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Empresas"]} />
              <Bar dataKey="count" fill="hsl(235 55% 48%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Top leads ──────────────────────────────────────────────────────── */}
      <div className="card-surface p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Top leads por Score ICP
          </p>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-primary hover:text-primary/80" onClick={() => navigate("/results")}>
            Ver todos <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
        <div className="divide-y divide-border">
          {data.top_empresas.map((emp, i) => {
            const temContato = emp.telefone_padrao || emp.email || emp.whatsapp_publico || emp.whatsapp_enriquecido;
            return (
              <div key={emp.cnpj} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  i === 0 ? "bg-amber-100 text-amber-700" :
                  i === 1 ? "bg-slate-100 text-slate-600" :
                  i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                )}>{i + 1}</span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground">
                    {emp.nome_fantasia || emp.razao_social}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <MapPin className="h-2.5 w-2.5" />
                    {emp.cidade || "—"} / {emp.uf || "—"}
                    {emp.segmento && (
                      <Badge variant="outline" className="text-[10px] border-border/60 text-muted-foreground ml-1 py-0">
                        {emp.segmento}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="hidden sm:block w-24 shrink-0">
                  <ScoreChip score={emp.score_icp} />
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {emp.email && (
                    <div className="h-6 w-6 flex items-center justify-center rounded-md bg-sky-50 border border-sky-200">
                      <Mail className="h-3 w-3 text-sky-500" />
                    </div>
                  )}
                  {(emp.whatsapp_publico || emp.whatsapp_enriquecido) && (
                    <div className="h-6 w-6 flex items-center justify-center rounded-md bg-emerald-50 border border-emerald-200">
                      <MessageCircle className="h-3 w-3 text-emerald-500" />
                    </div>
                  )}
                  {emp.telefone_padrao && (
                    <div className="h-6 w-6 flex items-center justify-center rounded-md bg-muted border border-border">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  {!temContato && <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
