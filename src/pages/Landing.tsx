import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Target, Zap, Search, BarChart3, Shield, Globe, Users, ArrowRight, Check, Mail,
  Lock, Eye, EyeOff, User, Building2, Loader2, QrCode, CreditCard, ChevronRight,
  ChevronDown, Sparkles, Database, Brain, FileSpreadsheet, TrendingUp,
  MousePointerClick, MessageSquare, X, Star, Rocket, Filter, Linkedin, Phone,
  MapPin, PlayCircle, ArrowDown, Layers, Send, Activity, Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast, Toaster } from "sonner";

const API_BASE =
  (import.meta.env.VITE_HERMES_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://127.0.0.1:8000";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  HOOKS                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

function useCountUp(end: number, duration = 2200) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStarted(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!started) return;
    let raf: number;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 4)) * end));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [started, end, duration]);
  return { count, ref };
}

function useFadeIn(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible: v };
}

function FadeIn({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useFadeIn();
  return (
    <div ref={ref} className={cn("transition-all ease-out" + " " + "[transition-duration:800ms]", visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function useSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [inside, setInside] = useState(false);
  const onMove = useCallback((e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);
  return { ref, pos, inside, onMove, onEnter: () => setInside(true), onLeave: () => setInside(false) };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  DATA                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

type Plan = { name: string; label: string; price: number; priceAnnual: number; searches: number; enrichments: number; exports: number; crm: boolean; pipeline: boolean; multiUser: boolean; highlight?: boolean };

const PLANS: Plan[] = [
  { name: "free", label: "Grátis", price: 0, priceAnnual: 0, searches: 50, enrichments: 15, exports: 5, crm: false, pipeline: false, multiUser: false },
  { name: "starter", label: "Starter", price: 597, priceAnnual: 477, searches: 500, enrichments: 150, exports: 50, crm: true, pipeline: false, multiUser: false },
  { name: "pro", label: "Pro", price: 947, priceAnnual: 757, searches: 2000, enrichments: 800, exports: 200, crm: true, pipeline: true, multiUser: false, highlight: true },
  { name: "enterprise", label: "Enterprise", price: 1297, priceAnnual: 1037, searches: 10000, enrichments: 5000, exports: 1000, crm: true, pipeline: true, multiUser: true },
];

const WORKFLOW_STEPS = [
  { icon: Filter, num: "01", title: "Configure sua busca", desc: "Defina CNAE, cidade, porte, capital e segmento. Use mais de 30 filtros para refinar o ICP perfeito.", color: "from-primary to-cyan-400" },
  { icon: Brain, num: "02", title: "IA enriquece tudo", desc: "Nosso motor encontra sites, e-mails, telefones, WhatsApp e redes sociais automaticamente.", color: "from-violet-500 to-secondary" },
  { icon: Send, num: "03", title: "Aborde e converta", desc: "Exporte para o CRM, gere mensagens com IA e gerencie tudo no pipeline integrado.", color: "from-amber-500 to-orange-400" },
];

const FEATURES_GRID = [
  { icon: Database, title: "56M+ CNPJs", desc: "Base completa da Receita Federal com sócios, capital e CNAE." },
  { icon: Filter, title: "30+ filtros", desc: "Cidade, UF, CNAE, porte, capital, segmento — combine como quiser." },
  { icon: Brain, title: "IA generativa", desc: "Resumos, scores e abordagens criadas por inteligência artificial." },
  { icon: BarChart3, title: "Dashboard", desc: "Métricas de ICP, mapa de calor e distribuição por segmento." },
  { icon: FileSpreadsheet, title: "Exportar para CRM", desc: "Integre com os principais CRMs do mercado em 1 clique." },
  { icon: MessageSquare, title: "Mensagens com IA", desc: "Abordagens personalizadas por WhatsApp, e-mail e LinkedIn." },
  { icon: Layers, title: "Pipeline", desc: "Gerencie leads com estágios, notas e status SDR." },
  { icon: MapPin, title: "Mapa de calor", desc: "Visualize a concentração de empresas por região e UF." },
  { icon: Activity, title: "Score ICP", desc: "Cada lead recebe um score de 0 a 10 baseado no seu perfil ideal." },
];

const PERSONAS = [
  { icon: MousePointerClick, role: "SDR / Pré-vendedor", desc: "Listas com leads qualificados dentro do ICP, com contato validado. Pare de perder tempo com dados ruins." },
  { icon: TrendingUp, role: "Gestor comercial", desc: "Métricas de prospecção, pipeline e taxa de conversão. Decisões com dados, não com achismo." },
  { icon: Rocket, role: "Fundador / CEO", desc: "Da segmentação ao fechamento em uma plataforma. Escale o outbound sem contratar mais pessoas." },
];

const TESTIMONIALS = [
  { name: "M. R.", role: "Head de Vendas", text: "Reduzimos o tempo de prospecção de 4 horas para 20 minutos. O enriquecimento com IA é incrível." },
  { name: "J. A.", role: "SDR Sênior", text: "A qualidade dos leads melhorou muito. O score ICP me ajuda a priorizar quem abordar primeiro." },
  { name: "R. S.", role: "CEO", text: "Testamos outras ferramentas do mercado. O Hermes entrega o mesmo resultado por uma fração do preço, com pipeline integrado." },
];

const COMPARISONS = [
  { name: "Plataforma A", price: "R$ 719", searches: "300/mês", crm: true, ia: false, pipeline: false },
  { name: "Plataforma B", price: "R$ 799", searches: "Variável", crm: true, ia: false, pipeline: false },
  { name: "Plataforma C", price: "US$ 49", searches: "Ilimitado", crm: true, ia: true, pipeline: false },
  { name: "Hermes", price: "R$ 597", searches: "500/mês", crm: true, ia: true, pipeline: true },
];

const FAQS = [
  { q: "Preciso de cartão de crédito para começar?", a: "Não. O plano Grátis não exige cartão. Você recebe 50 buscas por mês sem pagar nada." },
  { q: "De onde vêm os dados?", a: "Base pública da Receita Federal (56M+ CNPJs), combinada com enriquecimento web automático e IA para encontrar contatos." },
  { q: "Posso cancelar a qualquer momento?", a: "Sim. Sem fidelidade, sem multas. Cancele quando quiser." },
  { q: "O enriquecimento encontra dados reais?", a: "Sim. Nosso motor busca sites oficiais, e-mails corporativos, telefones diretos e WhatsApp via scraping inteligente." },
  { q: "Qual a diferença em relação a outras plataformas?", a: "Até 40% mais barato, com IA generativa, resumos automáticos, pipeline integrado e exportação direta para CRM — tudo em uma só plataforma." },
  { q: "Quanto tempo leva para começar?", a: "30 segundos. Crie a conta, configure os filtros e rode sua primeira prospecção. Sem onboarding, sem ligação de vendas." },
];

const CRM_LOGOS = ["CRM de Vendas", "Automação de Marketing", "Gestão de Pipeline", "Plataforma B2B", "Funil Comercial", "Controle de Leads"];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TYPING ANIMATION                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

function TypingWords({ words, className }: { words: string[]; className?: string }) {
  const [idx, setIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[idx];
    const speed = deleting ? 40 : 80;
    const timer = setTimeout(() => {
      if (!deleting && chars < word.length) {
        setChars(c => c + 1);
      } else if (!deleting && chars === word.length) {
        setTimeout(() => setDeleting(true), 1800);
      } else if (deleting && chars > 0) {
        setChars(c => c - 1);
      } else if (deleting && chars === 0) {
        setDeleting(false);
        setIdx(i => (i + 1) % words.length);
      }
    }, speed);
    return () => clearTimeout(timer);
  }, [chars, deleting, idx, words]);

  return (
    <span className={className}>
      {words[idx].slice(0, chars)}
      <span className="animate-pulse text-primary">|</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SPOTLIGHT CARD                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SpotlightCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const { ref, pos, inside, onMove, onEnter, onLeave } = useSpotlight();
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn("relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] transition-all duration-300", className)}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-500"
        style={{
          opacity: inside ? 1 : 0,
          background: `radial-gradient(600px circle at ${pos.x}px ${pos.y}px, hsl(189 94% 55% / 0.07), transparent 40%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MARQUEE                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]">
      <div className="flex gap-8 animate-[marquee_30s_linear_infinite] w-max">
        {doubled.map((name, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-5 py-2.5 text-sm text-muted-foreground/70 shrink-0 whitespace-nowrap">
            <Network className="h-4 w-4 text-primary/50" />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PRODUCT DEMO PREVIEW                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ProductDemo() {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = [
    { label: "Prospecção", icon: Search },
    { label: "Dashboard", icon: BarChart3 },
    { label: "Pipeline", icon: Layers },
  ];

  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-primary/15 via-secondary/8 to-transparent blur-2xl opacity-60" />
      <div className="relative rounded-2xl border border-white/[0.08] bg-[hsl(220,18%,7%)] overflow-hidden shadow-[0_40px_100px_-30px_rgba(0,0,0,.9)]">
        {/* Window chrome */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.01]">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex items-center gap-1 rounded-md bg-white/[0.04] px-3 py-1">
            <Lock className="h-2.5 w-2.5 text-emerald-400/60" />
            <span className="text-[10px] text-muted-foreground/40 font-mono">hermes.app</span>
          </div>
          <div className="w-16" />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.04]">
          {tabs.map((t, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px",
                activeTab === i
                  ? "border-primary text-primary bg-primary/[0.04]"
                  : "border-transparent text-muted-foreground/50 hover:text-muted-foreground/80"
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 md:p-6 min-h-[320px]">
          {activeTab === 0 && <DemoProspeccao />}
          {activeTab === 1 && <DemoDashboard />}
          {activeTab === 2 && <DemoPipeline />}
        </div>
      </div>
    </div>
  );
}

function DemoProspeccao() {
  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { l: "Empresas", v: "2.847", c: "text-primary" },
          { l: "Com contato", v: "78%", c: "text-emerald-400" },
          { l: "Score médio", v: "7.4", c: "text-amber-400" },
          { l: "Enriquecidas", v: "2.219", c: "text-secondary" },
        ].map((s, i) => (
          <div key={i} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 text-center">
            <p className={cn("text-lg md:text-xl font-bold", s.c)}>{s.v}</p>
            <p className="text-[9px] text-muted-foreground/50 mt-0.5 uppercase tracking-wider">{s.l}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {[
          { n: "EMPRESA ALFA LTDA", s: 9.2, c: "São Paulo - SP", seg: "Tecnologia", cap: "R$ 2,5M" },
          { n: "EMPRESA BETA S/A", s: 8.7, c: "Belo Horizonte - MG", seg: "Saúde", cap: "R$ 4,1M" },
          { n: "EMPRESA GAMA LTDA", s: 8.1, c: "Curitiba - PR", seg: "Indústria", cap: "R$ 1,8M" },
          { n: "EMPRESA DELTA LTDA", s: 7.6, c: "Florianópolis - SC", seg: "Logística", cap: "R$ 890K" },
        ].map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.01] px-4 py-2.5 text-sm hover:bg-white/[0.03] transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("h-8 w-8 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0", r.s >= 8.5 ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/10 text-primary")}>{r.s}</div>
              <div className="min-w-0">
                <p className="font-medium text-foreground/90 text-[13px] truncate">{r.n}</p>
                <p className="text-[10px] text-muted-foreground/40">{r.c} · {r.seg} · {r.cap}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground/30 shrink-0 ml-3">
              <Mail className="h-3 w-3" /><Phone className="h-3 w-3" /><Linkedin className="h-3 w-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoDashboard() {
  const bars = [72, 58, 91, 45, 83, 67, 38];
  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { l: "Taxa email", v: "64%", c: "text-primary" },
          { l: "Taxa WhatsApp", v: "41%", c: "text-emerald-400" },
          { l: "Com LinkedIn", v: "28%", c: "text-secondary" },
        ].map((s, i) => (
          <div key={i} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 text-center">
            <p className={cn("text-lg font-bold", s.c)}>{s.v}</p>
            <p className="text-[9px] text-muted-foreground/50 mt-0.5 uppercase tracking-wider">{s.l}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-3">Empresas por segmento</p>
        <div className="flex items-end gap-2 h-24">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-sm bg-gradient-to-t from-primary/60 to-primary/20 transition-all duration-1000" style={{ height: `${h}%` }} />
              <span className="text-[8px] text-muted-foreground/30">{["Tec", "Sau", "Ind", "Log", "Srv", "Var", "Out"][i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoPipeline() {
  const cols = [
    { title: "Novo", count: 12, color: "bg-blue-500/20 text-blue-400" },
    { title: "Contactado", count: 8, color: "bg-amber-500/20 text-amber-400" },
    { title: "Qualificado", count: 5, color: "bg-emerald-500/20 text-emerald-400" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 animate-in fade-in duration-500">
      {cols.map((col, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground/70">{col.title}</span>
            <Badge className={cn("text-[9px] px-1.5 py-0 border-0", col.color)}>{col.count}</Badge>
          </div>
          {Array.from({ length: Math.min(col.count, 3) }).map((_, j) => (
            <div key={j} className="rounded-md border border-white/[0.04] bg-white/[0.02] p-2.5">
              <div className="h-2 w-3/4 rounded bg-white/[0.06] mb-1.5" />
              <div className="h-1.5 w-1/2 rounded bg-white/[0.03]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN LANDING                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function Landing() {
  const navigate = useNavigate();
  const pricingRef = useRef<HTMLDivElement>(null);
  const [showSignup, setShowSignup] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [annual, setAnnual] = useState(false);

  const scrollToPricing = () => pricingRef.current?.scrollIntoView({ behavior: "smooth" });
  const handleSelectPlan = (p: string) => { setSelectedPlan(p); setShowSignup(true); };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Toaster position="top-right" richColors />

      <style>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes glow-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-glow-pulse { animation: glow-pulse 3s ease-in-out infinite; }
      `}</style>

      {/* ── NAV ────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.05] bg-background/60 backdrop-blur-2xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6 max-w-7xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 ring-1 ring-white/[0.08]">
              <Target className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">HERMES</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-muted-foreground/70">
            <a href="#features" className="hover:text-foreground transition-colors">Recursos</a>
            <button onClick={scrollToPricing} className="hover:text-foreground transition-colors">Preços</button>
            <a href="#compare" className="hover:text-foreground transition-colors">Comparativo</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="text-muted-foreground/70 hover:text-foreground text-[13px] h-8">Entrar</Button>
            <Button size="sm" onClick={() => handleSelectPlan("free")} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1 text-[13px] h-8 px-3.5 shadow-[0_0_15px_-3px_hsl(189_94%_55%/0.3)]">
              Começar grátis <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-8 md:pt-24 md:pb-12 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-80 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-primary/[0.08] blur-[160px] animate-glow-pulse" />
          <div className="absolute top-60 -right-60 h-[400px] w-[400px] rounded-full bg-secondary/[0.05] blur-[120px]" />
          <div className="absolute -bottom-40 -left-40 h-[300px] w-[300px] rounded-full bg-accent/[0.04] blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:40px_40px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        </div>

        <div className="container relative mx-auto px-6 max-w-5xl text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-1.5 mb-8">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-muted-foreground/70">Plataforma de inteligência B2B</span>
            </div>
          </FadeIn>

          <FadeIn delay={100}>
            <h1 className="text-4xl sm:text-5xl md:text-[3.4rem] lg:text-[3.8rem] font-bold leading-[1.08] tracking-tight">
              Encontre leads.
              <br />
              <span className="bg-gradient-to-r from-primary via-[hsl(210,90%,65%)] to-secondary bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient-shift_8s_ease-in-out_infinite]">
                <TypingWords words={["Enriqueça com IA.", "Feche negócios.", "Escale vendas."]} />
              </span>
            </h1>
          </FadeIn>

          <FadeIn delay={200}>
            <p className="mt-6 text-[15px] md:text-base text-muted-foreground/80 max-w-xl mx-auto leading-relaxed">
              56 milhões de CNPJs. Enriquecimento automático. Score ICP inteligente.
              Exportação para CRM em 1 clique. Tudo a partir de R$ 0.
            </p>
          </FadeIn>

          <FadeIn delay={300}>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" onClick={() => handleSelectPlan("free")} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-7 text-sm font-medium shadow-[0_0_30px_-6px_hsl(189_94%_55%/0.5)] hover:shadow-[0_0_40px_-4px_hsl(189_94%_55%/0.6)] transition-all">
                Começar grátis <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="lg" variant="ghost" onClick={scrollToPricing} className="gap-2 text-muted-foreground/70 hover:text-foreground h-11 px-7 text-sm">
                Ver planos <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground/40">Sem cartão. Setup em 30 segundos.</p>
          </FadeIn>
        </div>

        {/* Product Demo */}
        <div className="container mx-auto px-6 max-w-4xl mt-16">
          <FadeIn delay={400}>
            <ProductDemo />
          </FadeIn>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────────────────────────────── */}
      <section className="py-16 border-t border-white/[0.03]">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <StatCounter end={56} suffix="M+" label="CNPJs na base" />
            <StatCounter end={30} suffix="+" label="Filtros" />
            <StatCounter end={78} suffix="%" label="Taxa de contato" />
            <StatCounter end={10} suffix="x" label="Mais rápido" />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS (workflow) ────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.03]">
        <div className="container mx-auto px-6 max-w-5xl">
          <FadeIn className="text-center mb-16">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em] mb-3">Como funciona</p>
            <h2 className="text-3xl md:text-4xl font-bold">
              3 passos para leads qualificados
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {WORKFLOW_STEPS.map((s, i) => (
              <FadeIn key={i} delay={i * 120}>
                <SpotlightCard className="p-6 h-full hover:border-primary/15">
                  <div className={cn("inline-flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br mb-4", s.color)}>
                    <s.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest mb-2">{s.num}</div>
                  <h3 className="text-base font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground/70 leading-relaxed">{s.desc}</p>
                </SpotlightCard>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ──────────────────────────────────────────────── */}
      <section id="features" className="py-24 border-t border-white/[0.03]">
        <div className="container mx-auto px-6 max-w-6xl">
          <FadeIn className="text-center mb-16">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em] mb-3">Recursos</p>
            <h2 className="text-3xl md:text-4xl font-bold">
              Tudo em uma{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">plataforma</span>
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES_GRID.map((f, i) => (
              <FadeIn key={i} delay={i * 60}>
                <SpotlightCard className="p-5 h-full group hover:border-primary/15">
                  <div className="flex items-start gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/[0.08] ring-1 ring-primary/10 shrink-0 group-hover:ring-primary/25 transition-all">
                      <f.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold mb-1">{f.title}</h3>
                      <p className="text-[12px] text-muted-foreground/60 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                </SpotlightCard>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PERSONAS ───────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.03]">
        <div className="container mx-auto px-6 max-w-4xl">
          <FadeIn className="text-center mb-16">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em] mb-3">Para quem</p>
            <h2 className="text-3xl md:text-4xl font-bold">Feito para quem vive de vendas</h2>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PERSONAS.map((p, i) => (
              <FadeIn key={i} delay={i * 100}>
                <SpotlightCard className="p-6 text-center h-full hover:border-primary/15">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/[0.08] ring-1 ring-primary/10 mb-4">
                    <p.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-[15px] font-semibold mb-2">{p.role}</h3>
                  <p className="text-[13px] text-muted-foreground/60 leading-relaxed">{p.desc}</p>
                </SpotlightCard>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.03]">
        <div className="container mx-auto px-6 max-w-5xl">
          <FadeIn className="text-center mb-16">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em] mb-3">Depoimentos</p>
            <h2 className="text-3xl md:text-4xl font-bold">O que nossos usuários dizem</h2>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <FadeIn key={i} delay={i * 100}>
                <SpotlightCard className="p-6 h-full hover:border-primary/15">
                  <div className="flex gap-1 mb-3">
                    {Array.from({ length: 5 }).map((_, j) => <Star key={j} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />)}
                  </div>
                  <p className="text-[13px] text-muted-foreground/70 leading-relaxed mb-4 italic">"{t.text}"</p>
                  <div className="flex items-center gap-3 pt-3 border-t border-white/[0.04]">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center text-[11px] font-bold text-primary">{t.name[0]}</div>
                    <div>
                      <p className="text-xs font-medium">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground/40">{t.role}</p>
                    </div>
                  </div>
                </SpotlightCard>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────── */}
      <section ref={pricingRef} className="py-24 border-t border-white/[0.03] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/[0.04] blur-[150px]" />
        </div>
        <div className="container relative mx-auto px-6 max-w-6xl">
          <FadeIn className="text-center mb-10">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em] mb-3">Preços</p>
            <h2 className="text-3xl md:text-4xl font-bold">
              Simples. Transparente.{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Melhor custo-benefício.</span>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground/60">Sem fidelidade. Cancele quando quiser.</p>

            <div className="mt-6 inline-flex items-center gap-0 rounded-full border border-white/[0.06] bg-white/[0.02] p-0.5">
              <button onClick={() => setAnnual(false)} className={cn("rounded-full px-5 py-1.5 text-sm font-medium transition-all", !annual ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground/60")}>Mensal</button>
              <button onClick={() => setAnnual(true)} className={cn("rounded-full px-5 py-1.5 text-sm font-medium transition-all flex items-center gap-1.5", annual ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground/60")}>
                Anual <span className="text-[10px] text-emerald-400 font-bold">-20%</span>
              </button>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan, i) => {
              const price = annual ? plan.priceAnnual : plan.price;
              return (
                <FadeIn key={plan.name} delay={i * 80}>
                  <div className={cn(
                    "relative rounded-2xl border p-5 flex flex-col h-full transition-all",
                    plan.highlight
                      ? "border-primary/30 bg-primary/[0.03] ring-1 ring-primary/10 shadow-[0_0_60px_-15px_hsl(189_94%_55%/0.2)]"
                      : "border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1]"
                  )}>
                    {plan.highlight && <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-0 shadow-lg text-[10px] px-2.5 py-0.5">Popular</Badge>}
                    <div className="mb-5">
                      <h3 className="text-sm font-semibold text-muted-foreground/80">{plan.label}</h3>
                      <div className="mt-2 flex items-baseline gap-0.5">
                        <span className="text-3xl font-bold tracking-tight">R$ {price}</span>
                        {price > 0 && <span className="text-xs text-muted-foreground/40">/mês</span>}
                      </div>
                      {annual && plan.price > 0 && <p className="text-[11px] text-muted-foreground/30 mt-0.5 line-through">R$ {plan.price}/mês</p>}
                    </div>
                    <ul className="space-y-2 text-[13px] flex-1 mb-5">
                      <PlanRow ok label={`${plan.searches.toLocaleString("pt-BR")} buscas/mês`} />
                      <PlanRow ok label={`${plan.enrichments.toLocaleString("pt-BR")} enriquecimentos`} />
                      <PlanRow ok label={`${plan.exports.toLocaleString("pt-BR")} exportações`} />
                      <PlanRow ok={plan.crm} label="Integração com CRM" />
                      <PlanRow ok={plan.pipeline} label="Pipeline de leads" />
                      <PlanRow ok={plan.multiUser} label="Multiusuários" />
                    </ul>
                    <Button onClick={() => handleSelectPlan(plan.name)} className={cn(
                      "w-full gap-1.5 h-9 text-[13px]",
                      plan.highlight ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_-3px_hsl(189_94%_55%/0.35)]" : "bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06]"
                    )}>
                      {price > 0 ? "Assinar" : "Começar grátis"} <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── COMPARISON ─────────────────────────────────────────────────── */}
      <section id="compare" className="py-24 border-t border-white/[0.03]">
        <div className="container mx-auto px-6 max-w-3xl">
          <FadeIn className="text-center mb-12">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em] mb-3">Comparativo</p>
            <h2 className="text-3xl font-bold">Por que escolher o Hermes?</h2>
          </FadeIn>
          <FadeIn>
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground/60 text-xs">Plataforma</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground/60 text-xs">Preço</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground/60 text-xs">CRM</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground/60 text-xs">IA</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground/60 text-xs">Pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISONS.map((c, i) => {
                    const isH = c.name === "Hermes";
                    return (
                      <tr key={i} className={cn("border-b border-white/[0.03]", isH && "bg-primary/[0.04]")}>
                        <td className="py-2.5 px-4 font-medium">{isH && <Star className="h-3 w-3 text-primary inline mr-1 -mt-0.5" />}<span className={isH ? "text-primary font-semibold" : ""}>{c.name}</span></td>
                        <td className="py-2.5 px-2 text-center"><span className={isH ? "text-primary font-semibold" : "text-muted-foreground/60"}>{c.price}</span></td>
                        <td className="py-2.5 px-2 text-center">{c.crm ? <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" /> : <X className="h-3.5 w-3.5 text-muted-foreground/20 mx-auto" />}</td>
                        <td className="py-2.5 px-2 text-center">{c.ia ? <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" /> : <X className="h-3.5 w-3.5 text-muted-foreground/20 mx-auto" />}</td>
                        <td className="py-2.5 px-2 text-center">{c.pipeline ? <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" /> : <X className="h-3.5 w-3.5 text-muted-foreground/20 mx-auto" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── INTEGRATIONS MARQUEE ───────────────────────────────────────── */}
      <section className="py-16 border-t border-white/[0.03]">
        <div className="container mx-auto px-6 max-w-5xl text-center">
          <FadeIn>
            <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em] mb-6">Integrações</p>
            <Marquee items={CRM_LOGOS} />
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 border-t border-white/[0.03]">
        <div className="container mx-auto px-6 max-w-2xl">
          <FadeIn className="text-center mb-12">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.2em] mb-3">FAQ</p>
            <h2 className="text-3xl font-bold">Perguntas frequentes</h2>
          </FadeIn>
          <div className="space-y-2">
            {FAQS.map((f, i) => (
              <FadeIn key={i} delay={i * 50}>
                <FaqItem question={f.q} answer={f.a} />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────── */}
      <section className="py-28 border-t border-white/[0.03] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-primary/[0.06] blur-[140px] animate-glow-pulse" />
        </div>
        <div className="container relative mx-auto px-6 text-center max-w-xl">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">Pronto para prospectar de verdade?</h2>
            <p className="text-muted-foreground/70 mb-8 text-[15px]">Sua próxima venda começa com o lead certo.</p>
            <Button size="lg" onClick={() => handleSelectPlan("free")} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 text-sm font-medium shadow-[0_0_40px_-8px_hsl(189_94%_55%/0.5)]">
              Criar conta grátis <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="mt-3 text-[11px] text-muted-foreground/35">Setup em 30s. Sem cartão. Sem compromisso.</p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.03] py-6">
        <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 max-w-6xl">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground/40">
            <Target className="h-3.5 w-3.5 text-primary/30" />&copy; 2025 Projeto Hermes
          </div>
          <div className="flex gap-6 text-[11px] text-muted-foreground/30">
            <span className="hover:text-muted-foreground/60 cursor-pointer transition-colors">Termos</span>
            <span className="hover:text-muted-foreground/60 cursor-pointer transition-colors">Privacidade</span>
            <span className="hover:text-muted-foreground/60 cursor-pointer transition-colors">Contato</span>
          </div>
        </div>
      </footer>

      {/* ── SIGNUP MODAL ───────────────────────────────────────────────── */}
      {showSignup && (
        <SignupModal planName={selectedPlan} onClose={() => setShowSignup(false)} onSuccess={(token) => {
          if (isSupabaseConfigured && supabase && token) { supabase.auth.setSession({ access_token: token, refresh_token: "" }).then(() => navigate("/app", { replace: true })); }
          else { localStorage.setItem("hermes_token", token || "dev-session-token"); navigate("/app", { replace: true }); }
        }} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SUB-COMPONENTS                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function StatCounter({ end, suffix, label }: { end: number; suffix: string; label: string }) {
  const { count, ref } = useCountUp(end);
  return (
    <div ref={ref}>
      <p className="text-3xl md:text-4xl font-bold">{count}<span className="text-primary">{suffix}</span></p>
      <p className="text-[11px] text-muted-foreground/40 mt-0.5">{label}</p>
    </div>
  );
}

function PlanRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <Check className="h-3.5 w-3.5 text-primary shrink-0" /> : <X className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />}
      <span className={ok ? "text-muted-foreground/70" : "text-muted-foreground/25 line-through"}>{label}</span>
    </li>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between p-4 text-left text-[13px] font-medium hover:bg-white/[0.02] transition-colors">
        <span>{question}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground/40 transition-transform shrink-0 ml-4", open && "rotate-180")} />
      </button>
      <div className={cn("overflow-hidden transition-all duration-300", open ? "max-h-40 opacity-100" : "max-h-0 opacity-0")}>
        <p className="px-4 pb-4 text-[13px] text-muted-foreground/60 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SIGNUP MODAL                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SignupModal({ planName, onClose, onSuccess }: { planName: string; onClose: () => void; onSuccess: (token: string | null) => void }) {
  const plan = PLANS.find(p => p.name === planName) || PLANS[0];
  const isPaid = plan.price > 0;
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState(""); const [cpfCnpj, setCpfCnpj] = useState(""); const [billingType, setBillingType] = useState<"PIX" | "BOLETO">("PIX");
  const [showPw, setShowPw] = useState(false); const [loading, setLoading] = useState(false);

  const handleCpf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, "");
    let f = "";
    if (d.length <= 11) f = d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_: string, a: string, b: string, c: string, dd: string) => dd ? `${a}.${b}.${c}-${dd}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a || "");
    else f = d.slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_: string, a: string, b: string, c: string, dd: string, ee: string) => ee ? `${a}.${b}.${c}/${dd}-${ee}` : dd ? `${a}.${b}.${c}/${dd}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a || "");
    setCpfCnpj(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) { toast.error("Preencha todos os campos."); return; }
    if (password.length < 6) { toast.error("Senha: mínimo 6 caracteres."); return; }
    if (isPaid) { const d = cpfCnpj.replace(/\D/g, ""); if (d.length !== 11 && d.length !== 14) { toast.error("CPF/CNPJ inválido."); return; } }
    setLoading(true);
    try {
      const ep = isPaid ? "/auth/signup-with-plan" : "/auth/signup";
      const body: Record<string, unknown> = { email: email.trim(), password: password.trim(), name: name.trim(), org_name: orgName.trim() || undefined };
      if (isPaid) { body.plan_name = planName; body.billing_type = billingType; body.cpf_cnpj = cpfCnpj.replace(/\D/g, ""); }
      const r = await fetch(`${API_BASE.replace(/\/+$/, "")}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { const err = await r.json().catch(() => ({ detail: "Erro." })); throw new Error(err.detail || "Erro."); }
      const data = await r.json();
      toast.success("Conta criada!");
      onSuccess(data.access_token || null);
    } catch (err: any) { toast.error(err.message || "Erro ao criar conta."); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-2xl border border-white/[0.08] bg-[hsl(220,18%,8%)]/95 backdrop-blur-xl p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,.95)]">
          <button onClick={onClose} className="absolute top-3.5 right-3.5 text-muted-foreground/40 hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 ring-1 ring-white/[0.08]"><Zap className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-sm font-semibold">{isPaid ? `Assinar ${plan.label}` : "Criar conta grátis"}</p>
              {isPaid && <p className="text-[11px] text-muted-foreground/50">R$ {plan.price}/mês</p>}
            </div>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <FormField label="Nome *" icon={User} value={name} onChange={setName} placeholder="Seu nome" required />
            <FormField label="E-mail *" icon={Mail} value={email} onChange={setEmail} placeholder="seu@email.com" type="email" required />
            <div className="space-y-1.5">
              <Label className="text-foreground/70 text-[11px]">Senha *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 caracteres" className="pl-9 pr-9 h-9 bg-white/[0.03] border-white/[0.07] text-sm" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors">{showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
              </div>
            </div>
            <FormField label="Empresa" icon={Building2} value={orgName} onChange={setOrgName} placeholder="Opcional" />
            {isPaid && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-foreground/70 text-[11px]">CPF ou CNPJ *</Label>
                  <Input value={cpfCnpj} onChange={handleCpf} placeholder="000.000.000-00" className="h-9 bg-white/[0.03] border-white/[0.07] font-mono text-sm" maxLength={18} required />
                </div>
                <div className="flex gap-2">
                  {(["PIX", "BOLETO"] as const).map(bt => (
                    <Button key={bt} type="button" size="sm" onClick={() => setBillingType(bt)} className={cn("gap-1 flex-1 h-8 text-xs", billingType === bt ? (bt === "PIX" ? "bg-emerald-600 text-white" : "bg-amber-600 text-white") : "bg-white/[0.03] text-muted-foreground/60 border border-white/[0.06]")}>
                      {bt === "PIX" ? <QrCode className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />} {bt}
                    </Button>
                  ))}
                </div>
              </>
            )}
            <Button type="submit" disabled={loading} className="w-full h-10 mt-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_-3px_hsl(189_94%_55%/0.35)] text-sm">
              {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Criando...</> : <>{isPaid ? "Criar conta e assinar" : "Criar conta grátis"}<ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground/40">Já tem conta? <button type="button" onClick={() => { onClose(); window.location.href = "/login"; }} className="text-primary hover:underline">Entrar</button></p>
          </form>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, icon: Icon, value, onChange, placeholder, type = "text", required = false }: { label: string; icon: any; value: string; onChange: (v: string) => void; placeholder: string; type?: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-foreground/70 text-[11px]">{label}</Label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
        <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="pl-9 h-9 bg-white/[0.03] border-white/[0.07] text-sm" required={required} />
      </div>
    </div>
  );
}
