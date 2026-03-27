import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  Box, Stack, Typography, Button, TextField, IconButton,
  InputAdornment, Checkbox, FormControlLabel, Divider, Alert,
} from "@mui/material";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import CircularProgress from "@mui/material/CircularProgress";
import SearchIcon from "@mui/icons-material/Search";
import BarChartIcon from "@mui/icons-material/BarChart";
import LayersIcon from "@mui/icons-material/Layers";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StorageIcon from "@mui/icons-material/Storage";
import FilterListIcon from "@mui/icons-material/FilterList";
import BoltIcon from "@mui/icons-material/Bolt";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import LanguageIcon from "@mui/icons-material/Language";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useAuth } from "@/auth/AuthContext";
import { Toaster } from "sonner";

type LocationState = { from?: { pathname?: string } };

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  STAT CARDS (credibility)                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

const STATS = [
  { value: "56M+", label: "CNPJs", sub: "Receita Federal", icon: StorageIcon, color: "#F97316" },
  { value: "30+", label: "Filtros", sub: "CNAE, UF, porte...", icon: FilterListIcon, color: "#a78bfa" },
  { value: "78%", label: "Taxa de contato", sub: "Email + WhatsApp", icon: BoltIcon, color: "#34d399" },
  { value: "10x", label: "Mais rapido", sub: "vs. prospeccao manual", icon: ShowChartIcon, color: "#fbbf24" },
];

const CAPABILITIES = [
  { icon: PsychologyIcon, text: "IA generativa para score ICP e abordagens personalizadas" },
  { icon: SearchIcon, text: "Busca avancada com CNAE, capital, segmento e localizacao" },
  { icon: BarChartIcon, text: "Dashboard com mapa de calor e metricas de prospeccao" },
  { icon: LayersIcon, text: "Pipeline Kanban integrado com status e notas" },
  { icon: LanguageIcon, text: "Enriquecimento: site, email, telefone, WhatsApp, LinkedIn" },
  { icon: PeopleOutlineIcon, text: "Export direto para Pipedrive, HubSpot, RD Station" },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  LEFT PANEL                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function LeftPanel() {
  return (
    <Stack sx={{ height: "100%", p: { lg: 5, xl: 6 }, overflowY: "auto" }}>
      {/* Logo */}
      <Box component={Link} to="/" sx={{
        display: "inline-flex", alignItems: "center", gap: 1.25, mb: 5,
        textDecoration: "none", flexShrink: 0,
      }}>
        <Box sx={{
          height: 32, width: 32, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <TrackChangesIcon sx={{ fontSize: 16, color: "#F97316" }} />
        </Box>
        <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#F97316" }}>
          HERMES
        </Typography>
      </Box>

      {/* Headline */}
      <Box sx={{ mb: 4, flexShrink: 0 }}>
        <Typography sx={{ fontSize: { lg: "1.25rem", xl: "1.4rem" }, fontWeight: 700, lineHeight: 1.3, mb: 1, color: "#F0F0F0" }}>
          A plataforma de{" "}
          <Box component="span" sx={{ color: "#F97316" }}>inteligencia B2B</Box>{" "}
          mais completa do Brasil.
        </Typography>
        <Typography sx={{ fontSize: "0.8rem", color: "#9A9A9A", lineHeight: 1.6 }}>
          Encontre leads qualificados, enriqueca com IA e feche negocios — tudo em um lugar.
        </Typography>
      </Box>

      {/* Stat cards grid */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mb: 4, flexShrink: 0 }}>
        {STATS.map((s, i) => (
          <Box key={i} sx={{
            borderRadius: 2.5,
            border: "1px solid rgba(255,255,255,0.07)",
            backgroundColor: "rgba(255,255,255,0.03)",
            p: 1.75,
            transition: "border-color 0.2s",
            "&:hover": { borderColor: "rgba(255,255,255,0.14)" },
          }}>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
              <s.icon sx={{ fontSize: 14, color: s.color, opacity: 0.7 }} />
              <Typography sx={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(154,154,154,0.7)", fontWeight: 500 }}>
                {s.label}
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.03em", color: s.color }}>
              {s.value}
            </Typography>
            <Typography sx={{ fontSize: "0.62rem", color: "rgba(154,154,154,0.55)", mt: 0.25 }}>{s.sub}</Typography>
          </Box>
        ))}
      </Box>

      {/* Capabilities */}
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(154,154,154,0.6)", fontWeight: 600, mb: 1.5 }}>
          O que voce pode fazer
        </Typography>
        {CAPABILITIES.map((c, i) => (
          <Stack key={i} direction="row" alignItems="flex-start" gap={1.25} sx={{ mb: 1.5,
            "&:hover .cap-icon": { color: "#F97316" },
          }}>
            <Box sx={{
              height: 24, width: 24, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 1, backgroundColor: "rgba(249,115,22,0.05)",
              border: "1px solid rgba(249,115,22,0.08)", mt: 0.25,
            }}>
              <c.icon className="cap-icon" sx={{ fontSize: 12, color: "rgba(249,115,22,0.6)", transition: "color 0.2s" }} />
            </Box>
            <Typography sx={{ fontSize: "0.75rem", color: "#9A9A9A", lineHeight: 1.55 }}>{c.text}</Typography>
          </Stack>
        ))}
      </Box>

      {/* Social proof */}
      <Divider sx={{ my: 3, borderColor: "rgba(255,255,255,0.06)" }} />
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ flexShrink: 0 }}>
        <Stack direction="row" sx={{ "& > *:not(:first-of-type)": { ml: -1 } }}>
          {["M", "J", "R", "A"].map((l, i) => (
            <Box key={i} sx={{
              height: 28, width: 28, borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.08))",
              border: "2px solid #0F0F0F",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Typography sx={{ fontSize: "0.6rem", fontWeight: 700, color: "rgba(249,115,22,0.7)" }}>{l}</Typography>
            </Box>
          ))}
        </Stack>
        <Box>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {Array.from({ length: 5 }).map((_, i) => (
              <CheckCircleIcon key={i} sx={{ fontSize: 12, color: "rgba(52,211,153,0.7)" }} />
            ))}
          </Stack>
          <Typography sx={{ fontSize: "0.62rem", color: "rgba(154,154,154,0.6)", mt: 0.25 }}>
            Usado por times de vendas em todo o Brasil
          </Typography>
        </Box>
      </Stack>
    </Stack>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  LOGIN PAGE                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithPassword } = useAuth();

  const state = (location.state as LocationState | null) ?? null;
  const redirectTo = state?.from?.pathname && state.from.pathname !== "/login" ? state.from.pathname : "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    setIsLoading(true);

    try {
      await signInWithPassword(email, password);
      setIsExiting(true);
      setTimeout(() => navigate(redirectTo, { replace: true }), 200);
    } catch (err: any) {
      const msg = err?.message?.toLowerCase() || "";
      if (msg.includes("invalid") || msg.includes("credentials")) {
        setError("Email ou senha incorretos.");
      } else if (msg.includes("email not confirmed")) {
        setError("Confirme seu email antes de entrar.");
      } else {
        setError(err?.message || "Erro ao fazer login.");
      }
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: "100vh", display: "flex",
      backgroundColor: "#0F0F0F",
      transition: "opacity 0.3s, transform 0.3s",
      opacity: isExiting ? 0 : 1,
      transform: isExiting ? "scale(1.01)" : "scale(1)",
    }}>
      <Toaster position="top-right" richColors />

      {/* ── LEFT: Credibility panel ────────────────────────────────────── */}
      <Box sx={{
        display: { xs: "none", lg: "flex" },
        width: { lg: "48%", xl: "52%" },
        position: "relative",
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.015)",
      }}>
        {/* Ambient glows */}
        <Box sx={{ pointerEvents: "none", position: "absolute", inset: 0 }}>
          <Box sx={{ position: "absolute", top: -160, left: "33%", height: 600, width: 600, borderRadius: "50%", background: "rgba(249,115,22,0.06)", filter: "blur(140px)" }} />
          <Box sx={{ position: "absolute", bottom: 80, right: 0, height: 350, width: 350, borderRadius: "50%", background: "rgba(249,115,22,0.04)", filter: "blur(120px)" }} />
        </Box>
        <Box sx={{ position: "relative", width: "100%", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <LeftPanel />
        </Box>
      </Box>

      {/* ── RIGHT: Centered login ──────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", px: 3, position: "relative" }}>
        {/* Ambient glow */}
        <Box sx={{ pointerEvents: "none", position: "absolute", inset: 0 }}>
          <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", height: 400, width: 400, borderRadius: "50%", background: "rgba(249,115,22,0.03)", filter: "blur(140px)" }} />
        </Box>

        <Box sx={{
          position: "relative", width: "100%", maxWidth: 360,
          animation: "fadeSlideIn 0.5s ease",
          "@keyframes fadeSlideIn": {
            from: { opacity: 0, transform: "translateY(16px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
          ...(shake && {
            animation: "shake 0.5s ease-in-out",
            "@keyframes shake": {
              "0%, 100%": { transform: "translateX(0)" },
              "20%": { transform: "translateX(-6px)" },
              "40%": { transform: "translateX(6px)" },
              "60%": { transform: "translateX(-4px)" },
              "80%": { transform: "translateX(4px)" },
            },
          }),
        }}>
          {/* Mobile logo */}
          <Stack alignItems="center" justifyContent="center" direction="row" gap={1.25} sx={{ display: { lg: "none" }, mb: 5 }}>
            <Box component={Link} to="/" sx={{ display: "inline-flex", alignItems: "center", gap: 1.25, textDecoration: "none" }}>
              <Box sx={{ height: 32, width: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 1.5, backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <TrackChangesIcon sx={{ fontSize: 16, color: "#F97316" }} />
              </Box>
              <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#F97316" }}>HERMES</Typography>
            </Box>
          </Stack>

          {/* Header */}
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Stack alignItems="center" justifyContent="center" sx={{ display: { xs: "none", lg: "flex" }, mb: 2.5 }}>
              <Box sx={{
                height: 44, width: 44, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 2.5,
                background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.08))",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <TrackChangesIcon sx={{ fontSize: 20, color: "#F97316" }} />
              </Box>
            </Stack>
            <Typography sx={{ fontSize: "1.2rem", fontWeight: 600, letterSpacing: "-0.02em", color: "#F0F0F0" }}>
              Bem-vindo de volta
            </Typography>
            <Typography sx={{ mt: 0.75, fontSize: "0.8rem", color: "#9A9A9A" }}>
              Entre para acessar sua prospeccao.
            </Typography>
          </Box>

          {/* Error */}
          {error && (
            <Alert
              severity="error"
              icon={<ShieldOutlinedIcon sx={{ fontSize: 14 }} />}
              sx={{
                mb: 2.5, fontSize: "0.8rem",
                backgroundColor: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#f87171",
                "& .MuiAlert-icon": { color: "#f87171", alignItems: "center" },
                animation: "fadeSlideIn 0.2s ease",
              }}
            >
              {error}
            </Alert>
          )}

          {/* Form */}
          <Box component="form" onSubmit={handleLogin} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: "0.72rem", fontWeight: 500, color: "rgba(240,240,240,0.8)", mb: 0.75 }}>
                Email
              </Typography>
              <TextField
                inputRef={emailRef}
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                required
                autoComplete="email"
                fullWidth
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <MailOutlineIcon sx={{ fontSize: 16, color: error ? "rgba(239,68,68,0.5)" : "rgba(154,154,154,0.5)" }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 44,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 1.5,
                    fontSize: "0.85rem",
                    "& fieldset": { borderColor: error ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)" },
                    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
                    "&.Mui-focused fieldset": { borderColor: "rgba(249,115,22,0.4)", borderWidth: 1 },
                    "& input": { color: "#F0F0F0" },
                    "& input::placeholder": { color: "#9A9A9A", opacity: 1 },
                  },
                }}
              />
            </Box>

            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                <Typography sx={{ fontSize: "0.72rem", fontWeight: 500, color: "rgba(240,240,240,0.8)" }}>Senha</Typography>
                <Box component="button" type="button" sx={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "0.68rem", color: "rgba(249,115,22,0.6)",
                  "&:hover": { color: "#F97316" }, transition: "color 0.2s", p: 0,
                }}>
                  Esqueceu?
                </Box>
              </Stack>
              <TextField
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                required
                autoComplete="current-password"
                fullWidth
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon sx={{ fontSize: 16, color: error ? "rgba(239,68,68,0.5)" : "rgba(154,154,154,0.5)" }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                        sx={{ color: "rgba(154,154,154,0.5)", "&:hover": { color: "rgba(240,240,240,0.6)" } }}
                      >
                        {showPassword ? <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 44,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 1.5,
                    fontSize: "0.85rem",
                    "& fieldset": { borderColor: error ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)" },
                    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
                    "&.Mui-focused fieldset": { borderColor: "rgba(249,115,22,0.4)", borderWidth: 1 },
                    "& input": { color: "#F0F0F0" },
                    "& input::placeholder": { color: "#9A9A9A", opacity: 1 },
                  },
                }}
              />
            </Box>

            <FormControlLabel
              control={
                <Checkbox
                  defaultChecked
                  size="small"
                  sx={{
                    p: 0.5,
                    color: "rgba(255,255,255,0.2)",
                    "&.Mui-checked": { color: "#F97316" },
                  }}
                />
              }
              label={
                <Typography sx={{ fontSize: "0.68rem", color: "rgba(154,154,154,0.7)", userSelect: "none" }}>
                  Manter conectado
                </Typography>
              }
              sx={{ m: 0, userSelect: "none" }}
            />

            <Button
              type="submit"
              variant="contained"
              disabled={isLoading}
              endIcon={isLoading ? undefined : <ArrowForwardIcon sx={{ fontSize: 16 }} />}
              fullWidth
              sx={{
                height: 44, mt: 0.5,
                backgroundColor: "#F97316",
                "&:hover": { backgroundColor: "#ea6a0a" },
                "&:disabled": { backgroundColor: "rgba(249,115,22,0.4)", color: "rgba(255,255,255,0.5)" },
                color: "#fff", fontWeight: 500, fontSize: "0.85rem",
                boxShadow: "0 0 20px -5px rgba(249,115,22,0.3)",
                "&:hover:not(:disabled)": { boxShadow: "0 0 30px -4px rgba(249,115,22,0.4)" },
                borderRadius: 1.5,
              }}
            >
              {isLoading ? (
                <Stack direction="row" alignItems="center" gap={1}>
                  <CircularProgress size={16} sx={{ color: "rgba(255,255,255,0.6)" }} />
                  <span>Entrando...</span>
                </Stack>
              ) : "Entrar"}
            </Button>
          </Box>

          {/* Divider */}
          <Box sx={{ position: "relative", my: 3 }}>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
            <Box sx={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              backgroundColor: "#0F0F0F", px: 1.5,
            }}>
              <Typography sx={{ fontSize: "0.68rem", color: "rgba(154,154,154,0.5)" }}>ou</Typography>
            </Box>
          </Box>

          {/* Sign up */}
          <Typography sx={{ textAlign: "center", fontSize: "0.8rem", color: "rgba(154,154,154,0.45)" }}>
            Nao tem conta?{" "}
            <Box component={Link} to="/" sx={{ color: "#F97316", fontWeight: 500, textDecoration: "none", "&:hover": { color: "rgba(249,115,22,0.8)" }, transition: "color 0.2s" }}>
              Crie gratis
            </Box>
          </Typography>

          {/* Footer */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 5 }}>
            <Stack direction="row" alignItems="center" gap={0.75}>
              <ShieldOutlinedIcon sx={{ fontSize: 12, color: "rgba(154,154,154,0.4)" }} />
              <Typography sx={{ fontSize: "0.62rem", color: "rgba(154,154,154,0.4)" }}>Conexao segura</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.62rem", color: "rgba(154,154,154,0.4)" }}>© 2025 Hermes</Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

export default Login;
