// src/pages/History.tsx (MUI)
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Stack, Typography, Button, Card, CardContent,
  TextField, Chip, IconButton, Divider, Dialog,
  DialogTitle, DialogContent, DialogContentText, DialogActions,
} from "@mui/material";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  Radar, Legend,
} from "recharts";
import HistoryIcon from "@mui/icons-material/History";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RemoveIcon from "@mui/icons-material/Remove";
import BarChartIcon from "@mui/icons-material/BarChart";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import BoltIcon from "@mui/icons-material/Bolt";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import BusinessIcon from "@mui/icons-material/Business";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

import {
  getHistoricoBuscas, renomearBuscaHistorico, deletarBuscaHistorico, type BuscaSalva,
} from "@/lib/api";
import { alpha, useTheme } from "@mui/material/styles";

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

// ─── Delta badge ──────────────────────────────────────────────────────────────
function Delta({ a, b, suffix = "", higher = "up" }: {
  a: number; b: number; suffix?: string; higher?: "up" | "down";
}) {
  const diff = a - b;
  const up = higher === "up" ? diff >= 0 : diff <= 0;
  if (Math.abs(diff) < 0.01) return <RemoveIcon sx={{ fontSize: 12, color: "rgba(154,154,154,0.5)" }} />;
  return (
    <Stack direction="row" alignItems="center" gap={0.25} sx={{ fontSize: 10, fontWeight: 500, color: up ? "#34d399" : "#f87171" }}>
      {up
        ? <TrendingUpIcon sx={{ fontSize: 12 }} />
        : <TrendingDownIcon sx={{ fontSize: 12 }} />
      }
      <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 500, color: "inherit" }}>
        {diff > 0 ? "+" : ""}{diff.toFixed(1)}{suffix}
      </Typography>
    </Stack>
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
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(busca.nome ?? "");

  const salvarNome = () => {
    onRenomear(nome || fmtData(busca.timestamp));
    setEditando(false);
  };

  const m = busca.metricas;

  return (
    <Card
      onClick={() => !editando && onSelecionar()}
      sx={{
        borderRadius: 2,
        border: "1px solid",
        borderColor: selecionada ? "rgba(249,115,22,0.5)" : "divider",
        backgroundColor: selecionada ? "rgba(249,115,22,0.05)" : "background.paper",
        cursor: "pointer",
        transition: "all 0.15s",
        "&:hover": { borderColor: selecionada ? "rgba(249,115,22,0.5)" : "divider", backgroundColor: selecionada ? "rgba(249,115,22,0.05)" : "action.hover" },
      }}
    >
      <CardContent sx={{ p: "12px !important" }}>
        {/* Nome / edição */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1} sx={{ mb: 1 }}>
          {editando ? (
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ flex: 1 }} onClick={e => e.stopPropagation()}>
              <TextField
                value={nome}
                onChange={e => setNome(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") salvarNome(); if (e.key === "Escape") setEditando(false); }}
                size="small"
                autoFocus
                sx={{
                  flex: 1,
                  "& .MuiOutlinedInput-root": {
                    fontSize: 12, height: 28,
                    backgroundColor: isDark ? alpha(theme.palette.common.white, 0.04) : alpha(theme.palette.common.black, 0.04),
                    "& fieldset": { borderColor: isDark ? alpha(theme.palette.common.white, 0.14) : alpha(theme.palette.common.black, 0.14) },
                    "&.Mui-focused fieldset": { borderColor: alpha(theme.palette.primary.main, 0.45) },
                  },
                  "& .MuiInputBase-input": { color: "text.primary", py: 0.5 },
                }}
              />
              <IconButton size="small" onClick={salvarNome} sx={{ width: 24, height: 24 }}>
                <CheckIcon sx={{ fontSize: 12, color: "#34d399" }} />
              </IconButton>
              <IconButton size="small" onClick={() => setEditando(false)} sx={{ width: 24, height: 24 }}>
                <CloseIcon sx={{ fontSize: 12, color: "text.secondary" }} />
              </IconButton>
            </Stack>
          ) : (
            <>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={500} sx={{
                  color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13,
                }}>
                  {busca.nome || `#${busca.id.slice(-4)} · ${fmtData(busca.timestamp)}`}
                </Typography>
                <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.25 }}>
                  <CalendarTodayIcon sx={{ fontSize: 10, color: "rgba(154,154,154,0.7)" }} />
                  <Typography variant="caption" sx={{ color: "rgba(154,154,154,0.7)", fontSize: 10 }}>
                    {fmtData(busca.timestamp)}
                  </Typography>
                </Stack>
              </Box>
              <Stack direction="row" alignItems="center" gap={0.25} sx={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <IconButton size="small" onClick={() => setEditando(true)} sx={{ width: 20, height: 20 }}>
                  <EditIcon sx={{ fontSize: 10, color: "rgba(154,154,154,0.7)" }} />
                </IconButton>
                <IconButton size="small" onClick={onDeletar} sx={{ width: 20, height: 20 }}>
                  <DeleteIcon sx={{ fontSize: 10, color: "#f87171" }} />
                </IconButton>
              </Stack>
            </>
          )}
        </Stack>

        {/* Config resumida */}
        <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
          <Chip
            icon={<LocationOnIcon sx={{ fontSize: "10px !important", "&&": { color: "text.secondary" } }} />}
            label={`${busca.config.cidade}/${busca.config.uf}`}
            size="small"
            variant="outlined"
            sx={{ fontSize: 9, height: 18, borderColor: "divider", color: "text.secondary", "& .MuiChip-label": { px: 0.75 } }}
          />
          {busca.config.segmentos?.slice(0, 2).map(s => (
            <Chip key={s} label={s} size="small" variant="outlined" sx={{
              fontSize: 9, height: 18, borderColor: "divider", color: "text.secondary", "& .MuiChip-label": { px: 0.75 },
            }} />
          ))}
          {(busca.config.segmentos?.length ?? 0) > 2 && (
            <Chip
              label={`+${(busca.config.segmentos?.length ?? 0) - 2}`}
              size="small"
              variant="outlined"
              sx={{ fontSize: 9, height: 18, borderColor: "divider", color: "text.disabled", "& .MuiChip-label": { px: 0.75 } }}
            />
          )}
        </Stack>

        {/* Métricas mini */}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5 }}>
          {[
            { label: "Leads", value: fmt(busca.resultado.total_empresas) },
            { label: "Score", value: m.score_medio.toFixed(1) },
            { label: "E-mail", value: `${m.taxa_email.toFixed(0)}%` },
            { label: "WA", value: `${m.taxa_whatsapp.toFixed(0)}%` },
          ].map(x => (
            <Box key={x.label} sx={{ borderRadius: 1, backgroundColor: "action.hover", py: 0.75, textAlign: "center" }}>
              <Typography variant="caption" fontWeight={700} sx={{ display: "block", color: "text.primary", fontSize: 11 }}>{x.value}</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 9 }}>{x.label}</Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Painel de comparação ─────────────────────────────────────────────────────
function Comparacao({ a, b }: { a: BuscaSalva; b: BuscaSalva }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const tooltipStyle = useMemo(() => ({
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    borderRadius: "8px",
    fontSize: "12px",
    color: theme.palette.text.primary,
  }), [theme, isDark]);
  const gridStroke = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const polarStroke = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  const tickFill = theme.palette.text.secondary;

  const radarA = [
    { axis: "E-mail",   A: a.metricas.taxa_email,    B: b.metricas.taxa_email    },
    { axis: "WhatsApp", A: a.metricas.taxa_whatsapp, B: b.metricas.taxa_whatsapp },
    { axis: "Score",    A: a.metricas.score_medio,   B: b.metricas.score_medio   },
    {
      axis: "Enriq.",
      A: a.resultado.total_empresas > 0 ? (a.metricas.enriquecidas / a.resultado.total_empresas) * 100 : 0,
      B: b.resultado.total_empresas > 0 ? (b.metricas.enriquecidas / b.resultado.total_empresas) * 100 : 0,
    },
  ];

  const barData = [
    { metrica: "Leads",   A: a.resultado.total_empresas, B: b.resultado.total_empresas },
    { metrica: "E-mail%", A: a.metricas.taxa_email,      B: b.metricas.taxa_email      },
    { metrica: "WA%",     A: a.metricas.taxa_whatsapp,   B: b.metricas.taxa_whatsapp   },
    { metrica: "Score",   A: a.metricas.score_medio,     B: b.metricas.score_medio     },
  ];

  const nomeA = a.nome ?? `#${a.id.slice(-4)}`;
  const nomeB = b.nome ?? `#${b.id.slice(-4)}`;

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" alignItems="center" gap={1}>
        <BoltIcon sx={{ fontSize: 16, color: "#f59e0b" }} />
        <Typography variant="body2" fontWeight={700} sx={{ color: "text.primary" }}>Comparação lado a lado</Typography>
      </Stack>

      {/* Tabela de métricas */}
      <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}>
        <CardContent sx={{ p: "0 !important" }}>
          <Box component="table" sx={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <Box component="thead">
              <Box component="tr" sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
                <Box component="th" sx={{ textAlign: "left", px: 2, py: 1.5, color: "text.secondary", fontWeight: 500 }}>Métrica</Box>
                <Box component="th" sx={{ textAlign: "right", px: 2, py: 1.5, color: "#F97316", fontWeight: 600 }}>{nomeA}</Box>
                <Box component="th" sx={{ textAlign: "right", px: 2, py: 1.5, color: "#38bdf8", fontWeight: 600 }}>{nomeB}</Box>
                <Box component="th" sx={{ textAlign: "right", px: 2, py: 1.5, color: "text.secondary", fontWeight: 500 }}>Δ</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {[
                { label: "Total de leads",  va: a.resultado.total_empresas, vb: b.resultado.total_empresas, fmt: (v: number) => fmt(v), suffix: "" },
                { label: "Score ICP médio", va: a.metricas.score_medio,     vb: b.metricas.score_medio,     fmt: (v: number) => v.toFixed(1), suffix: " pts" },
                { label: "Taxa e-mail",     va: a.metricas.taxa_email,      vb: b.metricas.taxa_email,      fmt: (v: number) => `${v.toFixed(1)}%`, suffix: "%" },
                { label: "Taxa WhatsApp",   va: a.metricas.taxa_whatsapp,   vb: b.metricas.taxa_whatsapp,   fmt: (v: number) => `${v.toFixed(1)}%`, suffix: "%" },
                { label: "Capital médio",   va: a.metricas.capital_medio,   vb: b.metricas.capital_medio,   fmt: (v: number) => fmtBRL(v), suffix: "" },
                { label: "Enriquecidas",    va: a.metricas.enriquecidas,    vb: b.metricas.enriquecidas,    fmt: (v: number) => fmt(v), suffix: "" },
              ].map(row => (
                <Box
                  key={row.label}
                  component="tr"
                  sx={{ borderBottom: "1px solid", borderColor: "divider", "&:hover": { backgroundColor: "action.hover" } }}
                >
                  <Box component="td" sx={{ px: 2, py: 1.25, color: "text.secondary", fontSize: 12 }}>{row.label}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.25, textAlign: "right", color: "text.primary", fontWeight: 500, fontSize: 12 }}>{row.fmt(row.va)}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.25, textAlign: "right", color: "#7dd3fc", fontWeight: 500, fontSize: 12 }}>{row.fmt(row.vb)}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.25, textAlign: "right" }}>
                    <Stack direction="row" justifyContent="flex-end">
                      <Delta a={row.va} b={row.vb} suffix={row.suffix} />
                    </Stack>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
        <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}>
          <CardContent sx={{ pt: "12px !important", px: "8px !important", pb: "12px !important" }}>
            <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: 1, fontSize: 10, display: "block", mb: 1.5, px: 1 }}>
              Barras comparativas
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="metrica" tick={{ fontSize: 10, fill: tickFill }} />
                <YAxis tick={{ fontSize: 9, fill: tickFill }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend formatter={v => v === "A" ? nomeA : nomeB} wrapperStyle={{ fontSize: 11, color: tickFill }} />
                <Bar dataKey="A" fill="#F97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="B" fill="#38bdf8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}>
          <CardContent sx={{ pt: "12px !important", px: "8px !important", pb: "12px !important" }}>
            <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: 1, fontSize: 10, display: "block", mb: 1.5, px: 1 }}>
              Radar de qualidade
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarA}>
                <PolarGrid stroke={polarStroke} />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: tickFill }} />
                <Radar name={nomeA} dataKey="A" stroke="#F97316" fill="#F97316" fillOpacity={0.2} strokeWidth={2} />
                <Radar name={nomeB} dataKey="B" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15} strokeWidth={2} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}`, ""]} />
                <Legend formatter={v => v === nomeA ? nomeA : nomeB} wrapperStyle={{ fontSize: 11, color: tickFill }} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
const History = () => {
  const navigate = useNavigate();
  const [buscas, setBuscas] = useState<BuscaSalva[]>([]);
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

  if (buscas.length === 0) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 14, gap: 2.5 }}>
        <Box sx={{
          width: 64, height: 64, borderRadius: 3,
          border: "1px solid", borderColor: "divider", backgroundColor: "action.hover",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <HistoryIcon sx={{ fontSize: 32, color: "text.secondary" }} />
        </Box>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h6" fontWeight={600} sx={{ color: "text.primary" }}>Histórico vazio</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            Suas prospecções aparecem aqui automaticamente após cada busca.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<BoltIcon />}
          onClick={() => navigate("/app")}
          sx={{ backgroundColor: "#F97316", color: "#fff", fontWeight: 600, "&:hover": { backgroundColor: "#ea6c10" } }}
        >
          Fazer primeira prospecção
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Header */}
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ color: "text.primary" }}>Histórico de Prospecções</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          {buscas.length} busca{buscas.length !== 1 ? "s" : ""} salva{buscas.length !== 1 ? "s" : ""} · Selecione 2 para comparar lado a lado
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "320px 1fr" }, gap: 2.5 }}>
        {/* Lista */}
        <Stack spacing={1}>
          {selecionadas.length > 0 && (
            <Stack direction="row" alignItems="center" gap={1} sx={{
              borderRadius: 1.5, border: "1px solid rgba(249,115,22,0.25)",
              backgroundColor: "rgba(249,115,22,0.05)", px: 1.5, py: 1,
            }}>
              <BarChartIcon sx={{ fontSize: 14, color: "#F97316" }} />
              <Typography variant="caption" sx={{ color: "#F97316", fontSize: 11 }}>
                {selecionadas.length === 1 ? "Selecione outra busca para comparar" : "Comparando as 2 buscas →"}
              </Typography>
            </Stack>
          )}
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
        </Stack>

        {/* Painel de detalhe / comparação */}
        <Box>
          {buscaA && buscaB ? (
            <Comparacao a={buscaA} b={buscaB} />
          ) : buscaA ? (
            <DetalheSimples busca={buscaA} />
          ) : (
            <Box sx={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 160, borderRadius: 2, border: "1px dashed", borderColor: "divider",
            }}>
              <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 13 }}>
                Selecione uma busca para ver detalhes
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Confirm delete */}
      <Dialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        PaperProps={{ sx: { backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2 } }}
      >
        <DialogTitle sx={{ color: "text.primary", fontWeight: 700, fontSize: 16 }}>Apagar busca?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "text.secondary", fontSize: 14 }}>
            Isso remove o registro do histórico. As empresas continuam no pipeline se foram adicionadas.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setConfirmDel(null)}
            variant="outlined"
            size="small"
            sx={{ borderColor: "divider", color: "text.primary", fontSize: 12 }}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => { if (confirmDel) void handleDeletar(confirmDel); }}
            variant="contained"
            size="small"
            sx={{ backgroundColor: "#e11d48", color: "#fff", fontSize: 12, "&:hover": { backgroundColor: "#be123c" } }}
          >
            Apagar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ─── Detalhe de busca única ───────────────────────────────────────────────────
function DetalheSimples({ busca }: { busca: BuscaSalva }) {
  const m = busca.metricas;
  const kpis = [
    { label: "Total de leads",  value: fmt(busca.resultado.total_empresas) },
    { label: "Score ICP médio", value: `${m.score_medio.toFixed(1)} pts` },
    { label: "Com e-mail",      value: `${m.taxa_email.toFixed(1)}%` },
    { label: "Com WhatsApp",    value: `${m.taxa_whatsapp.toFixed(1)}%` },
    { label: "Enriquecidas",    value: fmt(m.enriquecidas) },
    { label: "Capital médio",   value: fmtBRL(m.capital_medio) },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" gap={1}>
        <BusinessIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        <Typography variant="body2" fontWeight={700} sx={{ color: "text.primary" }}>
          {busca.nome || fmtData(busca.timestamp)}
        </Typography>
      </Stack>

      {/* Filtros usados */}
      <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}>
        <CardContent sx={{ pt: "12px !important", px: "16px !important", pb: "12px !important" }}>
          <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: 1, fontSize: 10, display: "block", mb: 1.5 }}>
            Filtros da busca
          </Typography>
          <Stack spacing={0.75}>
            {[
              ["Cidade / UF", `${busca.config.cidade} / ${busca.config.uf}`],
              ["Termo", busca.config.termo_base || "—"],
              ["Segmentos", busca.config.segmentos?.join(", ") || "Todos"],
              ["Portes", busca.config.portes?.join(", ") || "Todos"],
              ["Capital mínimo", `R$ ${(busca.config.capital_minimo || 0).toLocaleString("pt-BR")}`],
              ["Enriquecimento", busca.config.enriquecimento_web ? "Ativo" : "Desativado"],
              ["Limite", busca.config.limite_empresas.toString()],
            ].map(([k, v]) => (
              <Stack key={k} direction="row" gap={1}>
                <Typography variant="caption" sx={{ color: "rgba(154,154,154,0.7)", minWidth: 100, flexShrink: 0, fontSize: 12 }}>{k}</Typography>
                <Typography variant="caption" sx={{ color: "rgba(240,240,240,0.8)", fontSize: 12 }}>{v}</Typography>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {/* KPIs */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
        {kpis.map(k => (
          <Card key={k.label} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper", textAlign: "center" }}>
            <CardContent sx={{ py: "12px !important", px: "8px !important" }}>
              <Typography variant="h6" fontWeight={700} sx={{ color: "text.primary", fontSize: 18 }}>{k.value}</Typography>
              <Typography variant="caption" sx={{ color: "rgba(154,154,154,0.7)", fontSize: 10 }}>{k.label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}

export default History;
