// src/pages/Dashboard.tsx — Hermes Design System v2 (MUI)
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import {
  Box, Stack, Typography, Button, Card, CardContent,
  CircularProgress, Chip, Divider,
} from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import BarChartIcon from "@mui/icons-material/BarChart";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import LanguageIcon from "@mui/icons-material/Language";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import BoltIcon from "@mui/icons-material/Bolt";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PeopleIcon from "@mui/icons-material/People";
import { DashboardData, getDashboardUltimaExecucao } from "@/lib/api";

function formatBRL(n: number) {
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function scoreColor(s: number): string {
  if (s >= 75) return "#10b981";
  if (s >= 50) return "#3b82f6";
  if (s >= 25) return "#f59e0b";
  return "#ef4444";
}

const SEG_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

const TOOLTIP_STYLE = {
  backgroundColor: "#1e1e1e",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  fontSize: "12px",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.4)",
  color: "#F0F0F0",
};

const CARD_SX = {
  borderRadius: 2,
  border: "1px solid rgba(255,255,255,0.07)",
  backgroundColor: "#181818",
};

const SECTION_LABEL_SX = {
  fontSize: "0.625rem",
  fontWeight: 600,
  color: "#444",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

/* ── KPI Card ─────────────────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType;
  label: string; value: string; sub?: string;
}) {
  return (
    <Card sx={CARD_SX}>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box sx={{
          height: 32, width: 32, borderRadius: 1.5,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(249,115,22,0.12)", mb: 1.5,
        }}>
          <Icon sx={{ fontSize: 16, color: "#F97316" }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums", color: "#F0F0F0" }}>
          {value}
        </Typography>
        <Typography sx={{ fontSize: "0.72rem", color: "#9A9A9A", mt: 0.25 }}>{label}</Typography>
        {sub && (
          <Typography sx={{ fontSize: "0.66rem", color: "rgba(154,154,154,0.6)", mt: 0.25 }}>{sub}</Typography>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Canal bar ────────────────────────────────────────────────────────────── */
function CanalBar({ canal, total, pct, color, icon: Icon }: {
  canal: string; total: number; pct: number; color: string;
  icon: React.ElementType;
}) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Stack direction="row" alignItems="center" gap={0.75}>
          <Icon sx={{ fontSize: 14, color }} />
          <Typography sx={{ fontSize: "0.72rem", color: "rgba(240,240,240,0.8)" }}>{canal}</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography sx={{ fontSize: "0.72rem", color: "#9A9A9A", fontVariantNumeric: "tabular-nums" }}>{total}</Typography>
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(0)}%</Typography>
        </Stack>
      </Stack>
      <Box sx={{ height: 6, width: "100%", borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <Box sx={{ height: "100%", borderRadius: 1, backgroundColor: color, width: `${Math.min(100, pct)}%`, transition: "width 0.7s ease" }} />
      </Box>
    </Box>
  );
}

/* ── Score chip ───────────────────────────────────────────────────────────── */
function ScoreChip({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Box sx={{ height: 6, width: 56, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <Box sx={{ height: "100%", borderRadius: 1, backgroundColor: color, width: `${Math.min(100, score)}%` }} />
      </Box>
      <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{score.toFixed(0)}</Typography>
    </Stack>
  );
}

/* ── Empty State ──────────────────────────────────────────────────────────── */
function EmptyDashboard() {
  const nav = useNavigate();
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 16, gap: 2.5 }}>
      <Box sx={{
        height: 64, width: 64, borderRadius: 3,
        border: "1px solid rgba(255,255,255,0.07)",
        backgroundColor: "rgba(255,255,255,0.04)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <TrackChangesIcon sx={{ fontSize: 32, color: "#9A9A9A" }} />
      </Box>
      <Box sx={{ textAlign: "center" }}>
        <Typography sx={{ fontSize: "1.1rem", fontWeight: 600, color: "#F0F0F0", mb: 0.5 }}>
          Nenhuma prospecção ainda
        </Typography>
        <Typography sx={{ fontSize: "0.85rem", color: "#9A9A9A", maxWidth: 280 }}>
          Execute sua primeira busca para ver os analytics da sua base de leads.
        </Typography>
      </Box>
      <Button
        variant="contained"
        startIcon={<BoltIcon />}
        onClick={() => nav("/app")}
        sx={{ backgroundColor: "#F97316", "&:hover": { backgroundColor: "#ea6a0a" }, color: "#fff", fontWeight: 600 }}
      >
        Configurar prospecção
      </Button>
    </Stack>
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
      <Stack alignItems="center" justifyContent="center" sx={{ py: 16 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <CircularProgress size={16} sx={{ color: "#F97316" }} />
          <Typography sx={{ fontSize: "0.85rem", color: "#9A9A9A" }}>Carregando dashboard...</Typography>
        </Stack>
      </Stack>
    );
  }

  if (!data || data.total_empresas === 0) return <EmptyDashboard />;

  const canalIcons: Record<string, React.ElementType> = {
    "E-mail": EmailIcon,
    "Telefone": PhoneIcon,
    "WhatsApp": ChatBubbleOutlineIcon,
    "LinkedIn": LinkedInIcon,
    "Site": LanguageIcon,
  };
  const canalColors: Record<string, string> = {
    "E-mail": "#0ea5e9",
    "Telefone": "#64748b",
    "WhatsApp": "#10b981",
    "LinkedIn": "#3b82f6",
    "Site": "#8b5cf6",
  };

  const porteColors: Record<string, { bar: string; text: string }> = {
    ME: { bar: "#3b82f6", text: "#3b82f6" },
    EPP: { bar: "#10b981", text: "#10b981" },
    "Médio/Grande": { bar: "#f59e0b", text: "#f59e0b" },
    Grande: { bar: "#8b5cf6", text: "#8b5cf6" },
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ color: "#F0F0F0", letterSpacing: "-0.02em" }}>
            Dashboard de Prospecção
          </Typography>
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
            {data.execucao_cidade && (
              <>
                <LocationOnIcon sx={{ fontSize: 14, color: "#9A9A9A" }} />
                <Typography sx={{ fontSize: "0.8rem", color: "#9A9A9A" }}>
                  {data.execucao_cidade} / {data.execucao_uf} ·{" "}
                </Typography>
              </>
            )}
            {data.execucao_ts && (
              <Typography sx={{ fontSize: "0.8rem", color: "#9A9A9A" }}>
                {new Date(data.execucao_ts).toLocaleString("pt-BR", {
                  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </Typography>
            )}
          </Stack>
        </Box>
        <Button
          size="small"
          variant="outlined"
          endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
          onClick={() => navigate("/results")}
          sx={{
            borderColor: "rgba(255,255,255,0.14)",
            color: "#F0F0F0",
            fontSize: "0.78rem",
            "&:hover": { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.04)" },
          }}
        >
          Ver resultados
        </Button>
      </Stack>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr", lg: "repeat(6, 1fr)" }, gap: 1.5 }}>
        <KpiCard icon={BusinessIcon}     label="Total de leads"   value={data.total_empresas.toLocaleString("pt-BR")} />
        <KpiCard icon={CheckCircleIcon}  label="Enriquecidos"     value={data.empresas_enriquecidas.toLocaleString("pt-BR")} sub={`${((data.empresas_enriquecidas/data.total_empresas)*100).toFixed(0)}% do total`} />
        <KpiCard icon={BarChartIcon}     label="Score ICP médio"  value={data.score_medio.toFixed(1)} sub="de 100 pts" />
        <KpiCard icon={AttachMoneyIcon}  label="Capital médio"    value={formatBRL(data.capital_medio)} sub="por empresa" />
        <KpiCard icon={AttachMoneyIcon}  label="Capital total"    value={formatBRL(data.capital_total)} sub="pool total" />
        {data.pib_medio > 0
          ? <KpiCard icon={TrendingUpIcon} label="PIB médio / mun." value={formatBRL(data.pib_medio)} sub="IBGE" />
          : <KpiCard icon={PeopleIcon}     label="Com LinkedIn"     value={data.com_linkedin.toLocaleString("pt-BR")} sub={`${((data.com_linkedin/data.total_empresas)*100).toFixed(0)}% do total`} />
        }
      </Box>

      {/* ── Canais + Radar + Score ─────────────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr 1fr" }, gap: 2 }}>

        {/* Canais */}
        <Card sx={CARD_SX}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
              <PhoneIcon sx={{ fontSize: 14, color: "#444" }} />
              <Typography sx={SECTION_LABEL_SX}>Canais de contato</Typography>
            </Stack>
            {data.canais_contato.map(c => (
              <CanalBar
                key={c.canal}
                canal={c.canal}
                total={c.total}
                pct={c.pct}
                color={canalColors[c.canal] ?? "#64748b"}
                icon={canalIcons[c.canal] ?? PhoneIcon}
              />
            ))}
            <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.07)" }} />
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <Box sx={{ borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.04)", p: 1.25 }}>
                <Typography sx={{ fontSize: "0.66rem", color: "#9A9A9A" }}>Com LinkedIn</Typography>
                <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, color: "#3b82f6", fontVariantNumeric: "tabular-nums" }}>{data.com_linkedin}</Typography>
              </Box>
              <Box sx={{ borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.04)", p: 1.25 }}>
                <Typography sx={{ fontSize: "0.66rem", color: "#9A9A9A" }}>Com site</Typography>
                <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, color: "#8b5cf6", fontVariantNumeric: "tabular-nums" }}>{data.com_site}</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Radar ICP */}
        <Card sx={CARD_SX}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
              <TrackChangesIcon sx={{ fontSize: 14, color: "#444" }} />
              <Typography sx={SECTION_LABEL_SX}>Radar ICP</Typography>
            </Stack>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "#9A9A9A" }} />
                <Radar name="Cobertura %" dataKey="val"
                  stroke="#F97316" fill="#F97316" fillOpacity={0.15} strokeWidth={2} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, "Cobertura"]} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Score distribution */}
        <Card sx={CARD_SX}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
              <BarChartIcon sx={{ fontSize: 14, color: "#444" }} />
              <Typography sx={SECTION_LABEL_SX}>Distribuição de Score</Typography>
            </Stack>
            {data.score_distribuicao.map(f => (
              <Box key={f.label} sx={{ mb: 1.5 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontSize: "0.72rem", color: "rgba(154,154,154,0.8)" }}>Score {f.label}</Typography>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Typography sx={{ fontSize: "0.72rem", color: "#9A9A9A", fontVariantNumeric: "tabular-nums" }}>{f.count}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: f.color, fontVariantNumeric: "tabular-nums" }}>
                      {data.total_empresas > 0 ? ((f.count / data.total_empresas) * 100).toFixed(0) : 0}%
                    </Typography>
                  </Stack>
                </Stack>
                <Box sx={{ height: 6, width: "100%", borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <Box sx={{
                    height: "100%", borderRadius: 1,
                    width: `${data.total_empresas > 0 ? (f.count / data.total_empresas) * 100 : 0}%`,
                    backgroundColor: f.color, transition: "width 0.7s ease",
                  }} />
                </Box>
              </Box>
            ))}
            <Box sx={{ mt: 2, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.04)", p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                <Typography sx={{ fontSize: "0.72rem", color: "#9A9A9A" }}>Score médio do lote</Typography>
                <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: scoreColor(data.score_medio) }}>
                  {data.score_medio.toFixed(1)} pts
                </Typography>
              </Stack>
              <Box sx={{ height: 6, width: "100%", borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <Box sx={{ height: "100%", borderRadius: 1, backgroundColor: scoreColor(data.score_medio), width: `${Math.min(100, data.score_medio)}%` }} />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>

        {/* Segmentos */}
        <Card sx={CARD_SX}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Typography sx={{ ...SECTION_LABEL_SX, mb: 2 }}>Segmentos</Typography>
            <Stack direction="row" alignItems="center" gap={2}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={data.empresas_por_segmento.map((s, i) => ({ name: s.segmento, value: s.total, fill: SEG_COLORS[i % SEG_COLORS.length] }))}
                    cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="value" strokeWidth={2} stroke="#181818"
                  >
                    {data.empresas_por_segmento.map((_, i) => (
                      <Cell key={i} fill={SEG_COLORS[i % SEG_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <Box sx={{ flex: 1 }}>
                {data.empresas_por_segmento.slice(0, 6).map((s, i) => (
                  <Stack key={s.segmento} direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Stack direction="row" alignItems="center" gap={0.75}>
                      <Box sx={{ height: 8, width: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: SEG_COLORS[i % SEG_COLORS.length] }} />
                      <Typography sx={{ fontSize: "0.72rem", color: "rgba(240,240,240,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                        {s.segmento}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: "0.72rem", color: "#9A9A9A", ml: 1, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {s.total} ({((s.total / data.total_empresas) * 100).toFixed(0)}%)
                    </Typography>
                  </Stack>
                ))}
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Porte */}
        <Card sx={CARD_SX}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Typography sx={{ ...SECTION_LABEL_SX, mb: 2 }}>Porte das empresas</Typography>
            {data.empresas_por_porte.map(p => {
              const pct = (p.total / data.total_empresas) * 100;
              const style = porteColors[p.porte] ?? { bar: "#64748b", text: "#64748b" };
              return (
                <Box key={p.porte} sx={{ mb: 1.5 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontSize: "0.72rem", fontWeight: 500, color: style.text }}>{p.porte}</Typography>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Typography sx={{ fontSize: "0.72rem", color: "#9A9A9A", fontVariantNumeric: "tabular-nums" }}>{p.total}</Typography>
                      <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: style.text, fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(0)}%</Typography>
                    </Stack>
                  </Stack>
                  <Box sx={{ height: 6, width: "100%", borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <Box sx={{ height: "100%", borderRadius: 1, backgroundColor: style.bar, width: `${pct}%`, transition: "width 0.7s ease" }} />
                  </Box>
                </Box>
              );
            })}
          </CardContent>
        </Card>

        {/* UF */}
        <Card sx={CARD_SX}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Typography sx={{ ...SECTION_LABEL_SX, mb: 1.5 }}>Estados (Top 8)</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.empresas_por_uf.slice(0, 8)} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="uf" tick={{ fontSize: 11, fill: "#9A9A9A" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9A9A9A" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Empresas"]} />
                <Bar dataKey="total" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Capital */}
        <Card sx={CARD_SX}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Typography sx={{ ...SECTION_LABEL_SX, mb: 1.5 }}>Faixas de capital social</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.capital_faixas} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9A9A9A" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9A9A9A" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Empresas"]} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Box>

      {/* ── Top leads ──────────────────────────────────────────────────────── */}
      <Card sx={{ ...CARD_SX, overflow: "hidden", p: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between"
          sx={{ px: 2.5, py: 2, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <BoltIcon sx={{ fontSize: 14, color: "#f59e0b" }} />
            <Typography sx={SECTION_LABEL_SX}>Top leads por Score ICP</Typography>
          </Stack>
          <Button
            size="small"
            variant="text"
            endIcon={<ArrowForwardIcon sx={{ fontSize: 12 }} />}
            onClick={() => navigate("/results")}
            sx={{ fontSize: "0.72rem", color: "#F97316", minWidth: 0, px: 1, py: 0.5, height: 28 }}
          >
            Ver todos
          </Button>
        </Stack>

        {data.top_empresas.map((emp, i) => {
          const temContato = emp.telefone_padrao || emp.email || emp.whatsapp_publico || emp.whatsapp_enriquecido;
          const rankBg = i === 0 ? "rgba(245,158,11,0.15)" : i === 1 ? "rgba(100,116,139,0.15)" : i === 2 ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.04)";
          const rankColor = i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#f97316" : "#9A9A9A";

          return (
            <Stack
              key={emp.cnpj}
              direction="row"
              alignItems="center"
              gap={1.5}
              sx={{
                px: 2.5, py: 1.5,
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                "&:last-child": { borderBottom: "none" },
                "&:hover": { backgroundColor: "rgba(255,255,255,0.03)" },
                transition: "background-color 0.15s",
              }}
            >
              <Box sx={{
                height: 24, width: 24, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "50%", backgroundColor: rankBg,
              }}>
                <Typography sx={{ fontSize: "0.65rem", fontWeight: 700, color: rankColor }}>{i + 1}</Typography>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.85rem", fontWeight: 500, color: "#F0F0F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {emp.nome_fantasia || emp.razao_social}
                </Typography>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <LocationOnIcon sx={{ fontSize: 10, color: "#9A9A9A" }} />
                  <Typography sx={{ fontSize: "0.66rem", color: "#9A9A9A" }}>
                    {emp.cidade || "—"} / {emp.uf || "—"}
                  </Typography>
                  {emp.segmento && (
                    <Chip
                      label={emp.segmento}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 16, fontSize: "0.6rem",
                        borderColor: "rgba(255,255,255,0.12)",
                        color: "#9A9A9A",
                        "& .MuiChip-label": { px: 0.75 },
                      }}
                    />
                  )}
                </Stack>
              </Box>

              <Box sx={{ display: { xs: "none", sm: "block" }, width: 96, flexShrink: 0 }}>
                <ScoreChip score={emp.score_icp} />
              </Box>

              <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0 }}>
                {emp.email && (
                  <Box sx={{ height: 24, width: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 1, backgroundColor: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.25)" }}>
                    <EmailIcon sx={{ fontSize: 12, color: "#0ea5e9" }} />
                  </Box>
                )}
                {(emp.whatsapp_publico || emp.whatsapp_enriquecido) && (
                  <Box sx={{ height: 24, width: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 1, backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}>
                    <ChatBubbleOutlineIcon sx={{ fontSize: 12, color: "#10b981" }} />
                  </Box>
                )}
                {emp.telefone_padrao && (
                  <Box sx={{ height: 24, width: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 1, backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <PhoneIcon sx={{ fontSize: 12, color: "#9A9A9A" }} />
                  </Box>
                )}
                {!temContato && <ErrorOutlineIcon sx={{ fontSize: 14, color: "rgba(154,154,154,0.4)" }} />}
              </Stack>
            </Stack>
          );
        })}
      </Card>

    </Box>
  );
};

export default Dashboard;
