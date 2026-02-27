import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Target, Mail, Lock, ArrowRight, Eye, EyeOff, Loader2,
  Search, BarChart3, Layers, Brain, Shield, Database, Filter,
  Zap, Users, Globe, Activity, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { Toaster } from "sonner";

type LocationState = { from?: { pathname?: string } };

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  STAT CARDS (credibility)                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

const STATS = [
  { value: "56M+", label: "CNPJs", sub: "Receita Federal", icon: Database, color: "text-primary" },
  { value: "30+", label: "Filtros", sub: "CNAE, UF, porte...", icon: Filter, color: "text-violet-400" },
  { value: "78%", label: "Taxa de contato", sub: "Email + WhatsApp", icon: Zap, color: "text-emerald-400" },
  { value: "10x", label: "Mais rapido", sub: "vs. prospeccao manual", icon: Activity, color: "text-amber-400" },
];

const CAPABILITIES = [
  { icon: Brain, text: "IA generativa para score ICP e abordagens personalizadas" },
  { icon: Search, text: "Busca avancada com CNAE, capital, segmento e localizacao" },
  { icon: BarChart3, text: "Dashboard com mapa de calor e metricas de prospeccao" },
  { icon: Layers, text: "Pipeline Kanban integrado com status e notas" },
  { icon: Globe, text: "Enriquecimento: site, email, telefone, WhatsApp, LinkedIn" },
  { icon: Users, text: "Export direto para Pipedrive, HubSpot, RD Station" },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  LEFT PANEL                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function LeftPanel() {
  return (
    <div className="flex flex-col h-full p-8 lg:p-10 xl:p-12 overflow-y-auto">
      {/* Logo */}
      <Link to="/" className="inline-flex items-center gap-2.5 mb-10 group shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08] group-hover:ring-primary/30 transition-all">
          <Target className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">HERMES</span>
      </Link>

      {/* Headline */}
      <div className="mb-8 shrink-0">
        <h2 className="text-xl lg:text-2xl font-bold leading-tight mb-2">
          A plataforma de{" "}
          <span className="bg-gradient-to-r from-primary via-[hsl(210,90%,65%)] to-secondary bg-clip-text text-transparent">
            inteligencia B2B
          </span>{" "}
          mais completa do Brasil.
        </h2>
        <p className="text-[13px] text-muted-foreground/50 leading-relaxed">
          Encontre leads qualificados, enriqueca com IA e feche negocios — tudo em um lugar.
        </p>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-8 shrink-0">
        {STATS.map((s, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 hover:border-white/[0.1] transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={cn("h-3.5 w-3.5", s.color, "opacity-70 group-hover:opacity-100 transition-opacity")} />
              <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40 font-medium">{s.label}</span>
            </div>
            <p className={cn("text-2xl font-bold tracking-tight", s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground/30 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Capabilities */}
      <div className="space-y-2.5 flex-1">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/35 font-semibold mb-3">O que voce pode fazer</p>
        {CAPABILITIES.map((c, i) => (
          <div key={i} className="flex items-start gap-2.5 group">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/[0.05] ring-1 ring-primary/[0.08] shrink-0 mt-0.5 group-hover:ring-primary/20 transition-all">
              <c.icon className="h-3 w-3 text-primary/60 group-hover:text-primary transition-colors" />
            </div>
            <span className="text-[12px] text-muted-foreground/50 leading-relaxed group-hover:text-muted-foreground/80 transition-colors">{c.text}</span>
          </div>
        ))}
      </div>

      {/* Social proof */}
      <div className="mt-8 pt-6 border-t border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {["M", "J", "R", "A"].map((l, i) => (
              <div key={i} className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 ring-2 ring-background flex items-center justify-center text-[10px] font-bold text-primary/70">{l}</div>
            ))}
          </div>
          <div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <CheckCircle2 key={i} className="h-3 w-3 text-emerald-400/70" />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/35 mt-0.5">Usado por times de vendas em todo o Brasil</p>
          </div>
        </div>
      </div>
    </div>
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
    <div className={cn(
      "min-h-screen flex transition-all duration-300 bg-background",
      isExiting ? "opacity-0 scale-[1.01]" : "opacity-100"
    )}>
      <Toaster position="top-right" richColors />

      {/* ── LEFT: Credibility panel ────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[50%] xl:w-[55%] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/3 h-[600px] w-[600px] rounded-full bg-primary/[0.06] blur-[140px]" />
          <div className="absolute bottom-20 right-0 h-[350px] w-[350px] rounded-full bg-secondary/[0.04] blur-[120px]" />
          <div className="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:48px_48px]" />
        </div>
        <div className="relative w-full border-r border-white/[0.04]">
          <LeftPanel />
        </div>
      </div>

      {/* ── RIGHT: Centered login ──────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 relative">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-primary/[0.03] blur-[140px]" />
        </div>

        <div className={cn(
          "relative w-full max-w-[360px] animate-in fade-in slide-in-from-bottom-4 duration-500",
          shake && "animate-[shake_0.5s_ease-in-out]"
        )}>
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-10">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.1] ring-1 ring-primary/20">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">HERMES</span>
            </Link>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="hidden lg:flex items-center justify-center mb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-secondary/10 ring-1 ring-white/[0.06]">
                <Target className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Bem-vindo de volta</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground/50">Entre para acessar sua prospeccao.</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3.5 py-2.5 text-[13px] text-red-400 animate-in fade-in slide-in-from-top-2 duration-200">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-foreground/70 text-[12px] font-medium">Email</Label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/25 group-focus-within:text-primary/60 transition-colors" />
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(null); }}
                  className={cn(
                    "pl-11 h-11 bg-white/[0.02] border-white/[0.07] text-sm transition-all",
                    "focus:border-primary/40 focus:ring-2 focus:ring-primary/10 focus:bg-white/[0.03]",
                    error && "border-red-500/30"
                  )}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground/70 text-[12px] font-medium">Senha</Label>
                <button type="button" className="text-[11px] text-primary/60 hover:text-primary transition-colors">Esqueceu?</button>
              </div>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/25 group-focus-within:text-primary/60 transition-colors" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null); }}
                  className={cn(
                    "pl-11 pr-11 h-11 bg-white/[0.02] border-white/[0.07] text-sm transition-all",
                    "focus:border-primary/40 focus:ring-2 focus:ring-primary/10 focus:bg-white/[0.03]",
                    error && "border-red-500/30"
                  )}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/25 hover:text-foreground/60 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                id="remember"
                defaultChecked
                className="h-3.5 w-3.5 rounded border-white/[0.1] bg-white/[0.03] accent-[hsl(var(--primary))] cursor-pointer"
              />
              <label htmlFor="remember" className="text-[11px] text-muted-foreground/40 cursor-pointer">Manter conectado</label>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium shadow-[0_0_20px_-5px_hsl(189_94%_55%/0.3)] hover:shadow-[0_0_30px_-4px_hsl(189_94%_55%/0.4)] transition-all mt-1"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Entrando...</>
              ) : (
                <>Entrar <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.04]" /></div>
            <div className="relative flex justify-center"><span className="bg-background px-3 text-[11px] text-muted-foreground/25">ou</span></div>
          </div>

          {/* Sign up */}
          <p className="text-center text-[13px] text-muted-foreground/45">
            Nao tem conta?{" "}
            <Link to="/" className="text-primary hover:text-primary/80 font-medium transition-colors">Crie gratis</Link>
          </p>

          {/* Footer */}
          <div className="mt-10 flex items-center justify-between text-[10px] text-muted-foreground/20">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              <span>Conexao segura</span>
            </div>
            <span>&copy; 2025 Hermes</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};

export default Login;
