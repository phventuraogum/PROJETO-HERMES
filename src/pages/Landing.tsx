import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Stack, Typography, Button, TextField, MenuItem,
  Checkbox, FormControlLabel, IconButton, Chip,
  CircularProgress,
} from "@mui/material";
import {
  ArrowForwardRounded, CheckRounded, CloseRounded,
  TuneRounded, AutoAwesomeRounded, SendRounded,
  StorageRounded, FilterListRounded, BarChartRounded,
  TableChartRounded, MessageRounded, AccountTreeRounded,
  MapRounded, TrackChangesRounded, MouseRounded,
  TrendingUpRounded, RocketLaunchRounded,
  ExpandMoreRounded, VisibilityRounded,
  VisibilityOffRounded, LockRounded, PersonRounded,
  BusinessRounded, HubRounded, EmailRounded,
} from "@mui/icons-material";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast, Toaster } from "sonner";

const API_BASE =
  (import.meta.env.VITE_HERMES_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (typeof window !== "undefined" ? window.location.origin + "/api" : "http://127.0.0.1:8000");

/* ── Hooks ─────────────────────────────────────────────────────────────────── */

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

function FadeIn({ children, delay = 0, sx = {} }: { children: React.ReactNode; delay?: number; sx?: object }) {
  const { ref, visible } = useFadeIn();
  return (
    <Box
      ref={ref}
      sx={{
        transition: `opacity 0.8s ease, transform 0.8s ease`,
        transitionDelay: `${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/* ── Typing animation ───────────────────────────────────────────────────────── */

function TypingWords({ words }: { words: string[] }) {
  const [idx, setIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const word = words[idx];
    const speed = deleting ? 40 : 80;
    const timer = setTimeout(() => {
      if (!deleting && chars < word.length) { setChars(c => c + 1); }
      else if (!deleting && chars === word.length) { setTimeout(() => setDeleting(true), 1800); }
      else if (deleting && chars > 0) { setChars(c => c - 1); }
      else if (deleting && chars === 0) { setDeleting(false); setIdx(i => (i + 1) % words.length); }
    }, speed);
    return () => clearTimeout(timer);
  }, [chars, deleting, idx, words]);
  return (
    <Box component="span" sx={{ color: "#F97316" }}>
      {words[idx].slice(0, chars)}
      <Box component="span" sx={{ animation: "blink 1s step-end infinite", color: "#F97316" }}>|</Box>
    </Box>
  );
}

/* ── Spotlight card ────────────────────────────────────────────────────────── */

function SpotlightCard({ children, sx = {} }: { children: React.ReactNode; sx?: object }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [inside, setInside] = useState(false);
  const onMove = useCallback((e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);
  return (
    <Box
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setInside(true)}
      onMouseLeave={() => setInside(false)}
      sx={{
        position: "relative", overflow: "hidden", borderRadius: "14px",
        border: "1px solid rgba(255,255,255,0.06)",
        backgroundColor: "#141414",
        transition: "border-color 0.2s",
        "&:hover": { borderColor: "rgba(249,115,22,0.15)" },
        ...sx,
      }}
    >
      <Box
        sx={{
          pointerEvents: "none", position: "absolute", inset: -1,
          transition: "opacity 0.5s",
          opacity: inside ? 1 : 0,
          background: `radial-gradient(600px circle at ${pos.x}px ${pos.y}px, rgba(249,115,22,0.07), transparent 40%)`,
        }}
      />
      <Box sx={{ position: "relative" }}>{children}</Box>
    </Box>
  );
}

/* ── Marquee ────────────────────────────────────────────────────────────────── */

function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <Box sx={{ overflow: "hidden", maskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)" }}>
      <Stack
        direction="row"
        gap={3}
        sx={{ animation: "marquee 30s linear infinite", width: "max-content" }}
      >
        {doubled.map((name, i) => (
          <Stack
            key={i}
            direction="row"
            alignItems="center"
            gap={1}
            sx={{
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.03)",
              px: 2.5, py: 1.25,
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            <HubRounded sx={{ fontSize: 14, color: "rgba(249,115,22,0.5)" }} />
            <Typography sx={{ fontSize: "0.8125rem", color: "#666" }}>{name}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

/* ── Product demo ───────────────────────────────────────────────────────────── */

function ProductDemo() {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = [
    { label: "Prospecção",  Icon: TuneRounded      },
    { label: "Dashboard",  Icon: BarChartRounded   },
    { label: "Pipeline",   Icon: AccountTreeRounded },
  ];
  return (
    <Box sx={{ position: "relative" }}>
      <Box sx={{ position: "absolute", inset: -16, borderRadius: "24px", background: "radial-gradient(ellipse at center, rgba(249,115,22,0.08) 0%, transparent 70%)", filter: "blur(20px)" }} />
      <Box sx={{
        position: "relative", borderRadius: "14px",
        border: "1px solid rgba(255,255,255,0.08)",
        backgroundColor: "rgba(20,20,20,0.9)",
        overflow: "hidden",
        boxShadow: "0 40px 100px -30px rgba(0,0,0,0.9)",
      }}>
        {/* Chrome */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.25, borderBottom: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#0F0F0F" }}>
          <Stack direction="row" gap={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#febc2e" }} />
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#28c840" }} />
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "6px", px: 1.5, py: 0.5 }}>
            <LockRounded sx={{ fontSize: 10, color: "rgba(34,197,94,0.5)" }} />
            <Typography sx={{ fontSize: "0.6rem", color: "#555", fontFamily: "monospace" }}>hermes.app</Typography>
          </Stack>
          <Box sx={{ width: 64 }} />
        </Stack>
        {/* Tabs */}
        <Stack direction="row" sx={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {tabs.map((t, i) => (
            <Box
              key={i}
              component="button"
              onClick={() => setActiveTab(i)}
              sx={{
                display: "flex", alignItems: "center", gap: 0.75,
                px: 2.5, py: 1.25,
                fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
                borderBottom: "2px solid",
                borderColor: activeTab === i ? "#F97316" : "transparent",
                color: activeTab === i ? "#F97316" : "#666",
                backgroundColor: activeTab === i ? "rgba(249,115,22,0.04)" : "transparent",
                transition: "all 0.15s",
                mb: "-1px",
              }}
            >
              <t.Icon sx={{ fontSize: 13 }} />
              {t.label}
            </Box>
          ))}
        </Stack>
        {/* Content */}
        <Box sx={{ p: { xs: 2.5, md: 3 }, minHeight: 320 }}>
          {activeTab === 0 && <DemoProspeccao />}
          {activeTab === 1 && <DemoDashboard />}
          {activeTab === 2 && <DemoPipeline />}
        </Box>
      </Box>
    </Box>
  );
}

function DemoProspeccao() {
  return (
    <Box sx={{ animation: "fadeIn 0.5s ease" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.5, mb: 2 }}>
        {[
          { l: "Empresas",    v: "2.847", c: "#F97316" },
          { l: "Com contato", v: "78%",   c: "#22C55E" },
          { l: "Score médio", v: "7.4",   c: "#F59E0B" },
          { l: "Enriquecidas", v: "2.219", c: "#38BDF8" },
        ].map((s, i) => (
          <Box key={i} sx={{ borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.02)", p: 1.5, textAlign: "center" }}>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 700, color: s.c }}>{s.v}</Typography>
            <Typography sx={{ fontSize: "0.6rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", mt: 0.5 }}>{s.l}</Typography>
          </Box>
        ))}
      </Box>
      <Stack gap={0.75}>
        {[
          { n: "EMPRESA ALFA LTDA",  s: 9.2, c: "São Paulo - SP",        seg: "Tecnologia", cap: "R$ 2,5M" },
          { n: "EMPRESA BETA S/A",   s: 8.7, c: "Belo Horizonte - MG",   seg: "Saúde",      cap: "R$ 4,1M" },
          { n: "EMPRESA GAMA LTDA",  s: 8.1, c: "Curitiba - PR",          seg: "Indústria",  cap: "R$ 1,8M" },
          { n: "EMPRESA DELTA LTDA", s: 7.6, c: "Florianópolis - SC",     seg: "Logística",  cap: "R$ 890K" },
        ].map((r, i) => (
          <Stack key={i} direction="row" alignItems="center" justifyContent="space-between" sx={{ borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", backgroundColor: "#0F0F0F", px: 2, py: 1.5, "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: "0.15s" }}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <Box sx={{ width: 32, height: 32, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6875rem", fontWeight: 700, backgroundColor: r.s >= 8.5 ? "rgba(34,197,94,0.1)" : "rgba(249,115,22,0.1)", color: r.s >= 8.5 ? "#22C55E" : "#F97316", flexShrink: 0 }}>{r.s}</Box>
              <Box>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "#E0E0E0" }}>{r.n}</Typography>
                <Typography sx={{ fontSize: "0.6rem", color: "#555" }}>{r.c} · {r.seg} · {r.cap}</Typography>
              </Box>
            </Stack>
            <Stack direction="row" gap={0.5} sx={{ color: "#444" }}>
              <EmailRounded sx={{ fontSize: 12 }} />
              <MessageRounded sx={{ fontSize: 12 }} />
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function DemoDashboard() {
  const bars = [72, 58, 91, 45, 83, 67, 38];
  return (
    <Box sx={{ animation: "fadeIn 0.5s ease" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, mb: 2 }}>
        {[
          { l: "Taxa email",    v: "64%", c: "#F97316" },
          { l: "Taxa WhatsApp", v: "41%", c: "#22C55E" },
          { l: "Com LinkedIn",  v: "28%", c: "#38BDF8" },
        ].map((s, i) => (
          <Box key={i} sx={{ borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.02)", p: 1.5, textAlign: "center" }}>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 700, color: s.c }}>{s.v}</Typography>
            <Typography sx={{ fontSize: "0.6rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", mt: 0.5 }}>{s.l}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.02)", p: 2 }}>
        <Typography sx={{ fontSize: "0.625rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", mb: 2 }}>Empresas por segmento</Typography>
        <Stack direction="row" alignItems="flex-end" gap={1.5} sx={{ height: 80 }}>
          {bars.map((h, i) => (
            <Box key={i} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, height: "100%" }}>
              <Box sx={{ width: "100%", borderRadius: "2px", background: "linear-gradient(to top, rgba(249,115,22,0.6), rgba(249,115,22,0.2))", height: `${h}%`, transition: "height 1s ease", mt: "auto" }} />
              <Typography sx={{ fontSize: "0.55rem", color: "#444" }}>{["Tec","Sau","Ind","Log","Srv","Var","Out"][i]}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

function DemoPipeline() {
  const cols = [
    { title: "Novo",        count: 12, color: "#60A5FA", bg: "rgba(96,165,250,0.1)"  },
    { title: "Contactado",  count: 8,  color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
    { title: "Qualificado", count: 5,  color: "#22C55E", bg: "rgba(34,197,94,0.1)"   },
  ];
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, animation: "fadeIn 0.5s ease" }}>
      {cols.map((col, i) => (
        <Box key={i}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#888" }}>{col.title}</Typography>
            <Chip label={col.count} size="small" sx={{ fontSize: "0.5625rem", height: 16, backgroundColor: col.bg, color: col.color, border: "none" }} />
          </Stack>
          <Stack gap={0.75}>
            {Array.from({ length: Math.min(col.count, 3) }).map((_, j) => (
              <Box key={j} sx={{ borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)", p: 1.5 }}>
                <Box sx={{ height: 8, width: "75%", borderRadius: 1, backgroundColor: "rgba(255,255,255,0.07)", mb: 1 }} />
                <Box sx={{ height: 6, width: "50%", borderRadius: 1, backgroundColor: "rgba(255,255,255,0.04)" }} />
              </Box>
            ))}
          </Stack>
        </Box>
      ))}
    </Box>
  );
}

/* ── FAQ item ───────────────────────────────────────────────────────────────── */

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#141414", overflow: "hidden" }}>
      <Stack
        component="button"
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        onClick={() => setOpen(!open)}
        sx={{ width: "100%", p: 2, cursor: "pointer", "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }, transition: "0.15s" }}
      >
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, color: "#D0D0D0", textAlign: "left" }}>{question}</Typography>
        <ExpandMoreRounded sx={{ fontSize: 18, color: "#555", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.3s", flexShrink: 0, ml: 2 }} />
      </Stack>
      <Box sx={{ maxHeight: open ? 200 : 0, opacity: open ? 1 : 0, overflow: "hidden", transition: "max-height 0.3s ease, opacity 0.3s ease" }}>
        <Typography sx={{ px: 2, pb: 2, fontSize: "0.8125rem", color: "#666", lineHeight: 1.7 }}>{answer}</Typography>
      </Box>
    </Box>
  );
}

/* ── Stat counter ───────────────────────────────────────────────────────────── */

function StatCounter({ end, suffix, label }: { end: number; suffix: string; label: string }) {
  const { count, ref } = useCountUp(end);
  return (
    <Box ref={ref} sx={{ textAlign: "center" }}>
      <Typography sx={{ fontSize: { xs: "1.75rem", md: "2.25rem" }, fontWeight: 800, color: "#F0F0F0", letterSpacing: "-0.02em" }}>
        {count}<Box component="span" sx={{ color: "#F97316" }}>{suffix}</Box>
      </Typography>
      <Typography sx={{ fontSize: "0.6875rem", color: "#555", mt: 0.5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</Typography>
    </Box>
  );
}

/* ── Data ───────────────────────────────────────────────────────────────────── */

const WORKFLOW_STEPS = [
  { Icon: FilterListRounded,    num: "01", title: "Configure sua busca",  desc: "Defina CNAE, cidade, porte, capital e segmento. Use mais de 30 filtros para refinar o ICP perfeito.",    gradient: "linear-gradient(135deg, #F97316, #38BDF8)" },
  { Icon: AutoAwesomeRounded,   num: "02", title: "IA enriquece tudo",    desc: "Nosso motor encontra sites, e-mails, telefones, WhatsApp e redes sociais automaticamente.",              gradient: "linear-gradient(135deg, #A78BFA, #F97316)"  },
  { Icon: SendRounded,          num: "03", title: "Aborde e converta",    desc: "Exporte para o CRM, gere mensagens com IA e gerencie tudo no pipeline integrado.",                       gradient: "linear-gradient(135deg, #F59E0B, #F97316)"  },
];

const FEATURES_GRID = [
  { Icon: StorageRounded,        title: "56M+ CNPJs",        desc: "Base completa da Receita Federal com sócios, capital e CNAE."              },
  { Icon: FilterListRounded,     title: "30+ filtros",       desc: "Cidade, UF, CNAE, porte, capital, segmento — combine como quiser."         },
  { Icon: AutoAwesomeRounded,    title: "IA generativa",     desc: "Resumos, scores e abordagens criadas por inteligência artificial."         },
  { Icon: BarChartRounded,       title: "Dashboard",         desc: "Métricas de ICP, mapa de calor e distribuição por segmento."              },
  { Icon: TableChartRounded,     title: "Exportar para CRM", desc: "Integre com os principais CRMs do mercado em 1 clique."                   },
  { Icon: MessageRounded,        title: "Mensagens com IA",  desc: "Abordagens personalizadas por WhatsApp, e-mail e LinkedIn."               },
  { Icon: AccountTreeRounded,    title: "Pipeline",          desc: "Gerencie leads com estágios, notas e status SDR."                         },
  { Icon: MapRounded,            title: "Mapa de calor",     desc: "Visualize a concentração de empresas por região e UF."                    },
  { Icon: TrackChangesRounded,   title: "Score ICP",         desc: "Cada lead recebe um score de 0 a 10 baseado no seu perfil ideal."         },
];

const PERSONAS = [
  { Icon: MouseRounded,        role: "SDR / Pré-vendedor",   desc: "Listas com leads qualificados dentro do ICP, com contato validado. Pare de perder tempo com dados ruins."          },
  { Icon: TrendingUpRounded,   role: "Gestor comercial",     desc: "Métricas de prospecção, pipeline e taxa de conversão. Decisões com dados, não com achismo."                        },
  { Icon: RocketLaunchRounded, role: "Fundador / CEO",       desc: "Da segmentação ao fechamento em uma plataforma. Escale o outbound sem contratar mais pessoas."                     },
];

const TESTIMONIALS = [
  { name: "M. R.", role: "Head de Vendas",  text: "Reduzimos o tempo de prospecção de 4 horas para 20 minutos. O enriquecimento com IA é incrível."                                                        },
  { name: "J. A.", role: "SDR Sênior",      text: "A qualidade dos leads melhorou muito. O score ICP me ajuda a priorizar quem abordar primeiro."                                                           },
  { name: "R. S.", role: "CEO",             text: "Testamos outras ferramentas do mercado. O Hermes entrega o mesmo resultado por uma fração do preço, com pipeline integrado."                             },
];

const COMPARISONS = [
  { name: "Plataforma A", price: "R$ 719",  crm: true,  ia: false, pipeline: false },
  { name: "Plataforma B", price: "R$ 799",  crm: true,  ia: false, pipeline: false },
  { name: "Plataforma C", price: "US$ 49",  crm: true,  ia: true,  pipeline: false },
  { name: "Hermes",       price: "R$ 597",  crm: true,  ia: true,  pipeline: true  },
];

const FAQS = [
  { q: "Preciso de cartão de crédito para começar?",           a: "Não. O plano Grátis não exige cartão. Você recebe 50 buscas por mês sem pagar nada."                                                                                      },
  { q: "De onde vêm os dados?",                                a: "Base pública da Receita Federal (56M+ CNPJs), combinada com enriquecimento web automático e IA para encontrar contatos."                                                   },
  { q: "Posso cancelar a qualquer momento?",                   a: "Sim. Sem fidelidade, sem multas. Cancele quando quiser."                                                                                                                    },
  { q: "O enriquecimento encontra dados reais?",               a: "Sim. Nosso motor busca sites oficiais, e-mails corporativos, telefones diretos e WhatsApp via scraping inteligente."                                                       },
  { q: "Qual a diferença em relação a outras plataformas?",    a: "Até 40% mais barato, com IA generativa, resumos automáticos, pipeline integrado e exportação direta para CRM — tudo em uma só plataforma."                               },
  { q: "Quanto tempo leva para começar?",                      a: "30 segundos. Crie a conta, configure os filtros e rode sua primeira prospecção. Sem onboarding, sem ligação de vendas."                                                    },
];

const CRM_LOGOS = ["CRM de Vendas", "Automação de Marketing", "Gestão de Pipeline", "Plataforma B2B", "Funil Comercial", "Controle de Leads"];

/* ── Signup Modal ───────────────────────────────────────────────────────────── */

function SignupModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (token: string | null) => void }) {
  const [name, setName]     = useState("");
  const [email, setEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName]   = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) { toast.error("Preencha todos os campos."); return; }
    if (password.length < 6) { toast.error("Senha: mínimo 6 caracteres."); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE.replace(/\/+$/, "")}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim(), name: name.trim(), org_name: orgName.trim() || undefined }),
      });
      if (!r.ok) { const err = await r.json().catch(() => ({ detail: "Erro." })); throw new Error(err.detail || "Erro."); }
      const data = await r.json();
      toast.success("Conta criada!");
      onSuccess(data.access_token || null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", px: 2 }}>
      <Box sx={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }} onClick={onClose} />
      <Box
        sx={{
          position: "relative", width: "100%", maxWidth: 420,
          borderRadius: "16px", border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "#0F0F0F", p: 3,
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.95)",
        }}
      >
        <IconButton onClick={onClose} size="small" sx={{ position: "absolute", top: 12, right: 12, color: "#555", "&:hover": { color: "#A0A0A0" } }}>
          <CloseRounded sx={{ fontSize: 16 }} />
        </IconButton>

        <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
          <Box sx={{ width: 36, height: 36, borderRadius: "10px", background: "linear-gradient(135deg, #F97316, #EA580C)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "0.875rem" }}>H</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", color: "#F0F0F0" }}>Criar conta grátis</Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "#666" }}>Sem cartão de crédito</Typography>
          </Box>
        </Stack>

        <Box component="form" onSubmit={submit}>
          <Stack gap={1.5}>
            <TextField
              size="small" label="Nome *" value={name} onChange={e => setName(e.target.value)}
              placeholder="Seu nome" required fullWidth
              InputProps={{ startAdornment: <PersonRounded sx={{ fontSize: 16, color: "#555", mr: 1 }} /> }}
              sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.875rem" } }}
            />
            <TextField
              size="small" type="email" label="E-mail *" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com" required fullWidth
              InputProps={{ startAdornment: <EmailRounded sx={{ fontSize: 16, color: "#555", mr: 1 }} /> }}
              sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.875rem" } }}
            />
            <TextField
              size="small" type={showPw ? "text" : "password"} label="Senha *" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 caracteres" required fullWidth
              InputProps={{
                startAdornment: <LockRounded sx={{ fontSize: 16, color: "#555", mr: 1 }} />,
                endAdornment: (
                  <IconButton size="small" onClick={() => setShowPw(!showPw)} sx={{ color: "#555", "&:hover": { color: "#A0A0A0" } }}>
                    {showPw ? <VisibilityOffRounded sx={{ fontSize: 16 }} /> : <VisibilityRounded sx={{ fontSize: 16 }} />}
                  </IconButton>
                ),
              }}
              sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.875rem" } }}
            />
            <TextField
              size="small" label="Empresa" value={orgName} onChange={e => setOrgName(e.target.value)}
              placeholder="Opcional" fullWidth
              InputProps={{ startAdornment: <BusinessRounded sx={{ fontSize: 16, color: "#555", mr: 1 }} /> }}
              sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.875rem" } }}
            />

            <Button
              type="submit" variant="contained" fullWidth disabled={loading}
              endIcon={loading ? <CircularProgress size={14} color="inherit" /> : <ArrowForwardRounded sx={{ fontSize: 16 }} />}
              sx={{ fontWeight: 700, fontSize: "0.875rem", textTransform: "none", borderRadius: "10px", py: 1.25, mt: 0.5 }}
            >
              {loading ? "Criando..." : "Criar conta grátis"}
            </Button>

            <Typography sx={{ textAlign: "center", fontSize: "0.6875rem", color: "#555" }}>
              Já tem conta?{" "}
              <Box component="button" type="button" onClick={() => { onClose(); window.location.href = "/login"; }}
                sx={{ color: "#F97316", fontWeight: 600, cursor: "pointer", background: "none", border: "none", p: 0, "&:hover": { textDecoration: "underline" } }}>
                Entrar
              </Box>
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

/* ── Landing page ───────────────────────────────────────────────────────────── */

/* ── Section header helper ── */
function SectionEyebrow({ label }: { label: string }) {
  return (
    <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
      <Box sx={{ width: 24, height: 1, backgroundColor: "#F97316", flexShrink: 0 }} />
      <Typography sx={{ fontSize: "0.5875rem", fontWeight: 700, color: "#F97316", textTransform: "uppercase", letterSpacing: "0.26em" }}>
        {label}
      </Typography>
    </Stack>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [showSignup, setShowSignup] = useState(false);

  const container = { maxWidth: 1200, mx: "auto", px: { xs: 3, md: 6 } };
  const divider    = { borderTop: "1px solid rgba(255,255,255,0.04)" };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#0A0A0A", color: "#F0F0F0", overflowX: "hidden" }}>
      <Toaster position="top-right" richColors />

      <style>{`
        @keyframes marquee   { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes glowPulse { 0%,100%{opacity:0.35} 50%{opacity:0.75} }
        @keyframes blink     { 50%{opacity:0} }
      `}</style>

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <Box component="nav" sx={{
        position: "sticky", top: 0, zIndex: 100,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        backgroundColor: "rgba(10,10,10,0.96)",
        backdropFilter: "blur(24px)",
      }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ ...container, height: 64 }}>
          {/* Logo */}
          <Stack direction="row" alignItems="center" gap={2}>
            <Box sx={{ width: 30, height: 30, borderRadius: "8px", background: "linear-gradient(135deg, #F97316, #EA580C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Typography sx={{ color: "#fff", fontWeight: 900, fontSize: "0.875rem", letterSpacing: "-0.02em" }}>H</Typography>
            </Box>
            <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", letterSpacing: "-0.05em", color: "#F0F0F0" }}>
              HERMES
            </Typography>
          </Stack>

          {/* Links */}
          <Stack direction="row" alignItems="center" gap={5} sx={{ display: { xs: "none", md: "flex" } }}>
            {[["#features", "RECURSOS"], ["#faq", "FAQ"]].map(([href, label]) => (
              <Box key={label} component="a" href={href}
                sx={{ fontSize: "0.6rem", fontWeight: 700, color: "#4A4A4A", textDecoration: "none", letterSpacing: "0.22em", "&:hover": { color: "#888" }, transition: "color 0.15s" }}>
                {label}
              </Box>
            ))}
          </Stack>

          {/* CTA */}
          <Button variant="outlined" size="small" onClick={() => navigate("/login")}
            sx={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "none", borderRadius: "7px", px: 2.5, py: 0.75,
              borderColor: "rgba(249,115,22,0.4)", color: "#F97316",
              "&:hover": { borderColor: "#F97316", backgroundColor: "rgba(249,115,22,0.06)" } }}>
            Entrar
          </Button>
        </Stack>
      </Box>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <Box component="section" sx={{ position: "relative", pt: { xs: 12, md: 20 }, pb: { xs: 10, md: 16 }, overflow: "hidden" }}>
        {/* BG */}
        <Box sx={{ pointerEvents: "none", position: "absolute", inset: 0 }}>
          <Box sx={{ position: "absolute", top: "-15%", right: "0%", width: 800, height: 800, borderRadius: "50%", backgroundColor: "rgba(249,115,22,0.045)", filter: "blur(160px)", animation: "glowPulse 5s ease-in-out infinite" }} />
          <Box sx={{ position: "absolute", inset: 0, opacity: 0.022, backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "52px 52px" }} />
          <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 55%, #0A0A0A)" }} />
        </Box>

        <Box sx={{ ...container, position: "relative" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "5fr 7fr" }, gap: { xs: 8, lg: 12 }, alignItems: "center" }}>

            {/* ── Left: copy ── */}
            <Box>
              <FadeIn>
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 5 }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#22C55E", animation: "glowPulse 2s ease-in-out infinite", flexShrink: 0 }} />
                  <Typography sx={{ fontSize: "0.5875rem", fontWeight: 700, color: "#3A3A3A", textTransform: "uppercase", letterSpacing: "0.24em", fontFamily: "monospace" }}>
                    Plataforma ativa · Inteligência B2B
                  </Typography>
                </Stack>
              </FadeIn>

              <FadeIn delay={80}>
                <Typography component="h1" sx={{
                  fontSize: { xs: "2.5rem", sm: "3.25rem", md: "3.75rem", lg: "4rem" },
                  fontWeight: 900, lineHeight: 1.03, letterSpacing: "-0.04em", color: "#F4F4F4", mb: 3,
                }}>
                  Inteligência<Box component="br" />
                  comercial B2B.<Box component="br" />
                  <Box component="span" sx={{ color: "#F97316" }}>
                    <TypingWords words={["Para times que fecham.", "Para founders que escalam.", "Para SDRs que convertem."]} />
                  </Box>
                </Typography>
              </FadeIn>

              <FadeIn delay={160}>
                <Typography sx={{ fontSize: { xs: "0.9375rem", md: "1rem" }, color: "#4A4A4A", lineHeight: 1.8, mb: 7, maxWidth: 420 }}>
                  56 milhões de CNPJs. Decisores identificados. Pipeline integrado.
                  Da segmentação ao fechamento — em uma só plataforma.
                </Typography>
              </FadeIn>

              <FadeIn delay={240}>
                <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "stretch", sm: "center" }} gap={2.5}>
                  <Button variant="contained" size="large"
                    endIcon={<ArrowForwardRounded sx={{ fontSize: 16 }} />}
                    onClick={() => navigate("/login")}
                    sx={{ fontWeight: 700, fontSize: "0.875rem", textTransform: "none", borderRadius: "8px", px: 4, py: 1.5,
                      boxShadow: "0 0 36px -8px rgba(249,115,22,0.65)",
                      "&:hover": { boxShadow: "0 0 48px -4px rgba(249,115,22,0.75)" } }}>
                    Acessar a plataforma
                  </Button>
                  <Typography sx={{ fontSize: "0.6875rem", color: "#333", fontFamily: "monospace" }}>
                    Sem cartão de crédito
                  </Typography>
                </Stack>
              </FadeIn>
            </Box>

            {/* ── Right: demo (desktop) ── */}
            <FadeIn delay={320} sx={{ display: { xs: "none", lg: "block" } }}>
              <ProductDemo />
            </FadeIn>
          </Box>

          {/* Demo on mobile */}
          <FadeIn delay={300} sx={{ display: { xs: "block", lg: "none" }, mt: 8 }}>
            <ProductDemo />
          </FadeIn>
        </Box>
      </Box>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <Box component="section" sx={{ ...divider, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <Box sx={container}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
            {[
              { end: 56, suffix: "M+", label: "CNPJs na base"      },
              { end: 30, suffix: "+",  label: "Filtros disponíveis" },
              { end: 78, suffix: "%",  label: "Taxa de contato"     },
              { end: 10, suffix: "×",  label: "Mais rápido"         },
            ].map((s, i) => (
              <Box key={i} sx={{
                py: { xs: 6, md: 8 }, px: { xs: 3, md: 5 }, textAlign: "center",
                borderRight: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none",
                borderBottom: { xs: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none", md: "none" },
              }}>
                <StatCounter end={s.end} suffix={s.suffix} label={s.label} />
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <Box component="section" sx={{ py: { xs: 12, md: 18 }, ...divider }}>
        <Box sx={container}>
          <FadeIn sx={{ mb: 10 }}>
            <SectionEyebrow label="Como funciona" />
            <Typography sx={{ fontSize: { xs: "1.875rem", md: "2.5rem" }, fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.1, maxWidth: 440 }}>
              Três etapas.<Box component="br" />
              <Box component="span" sx={{ color: "#3A3A3A" }}>Um pipeline completo.</Box>
            </Typography>
          </FadeIn>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
            {WORKFLOW_STEPS.map((s, i) => (
              <FadeIn key={i} delay={i * 100}>
                <SpotlightCard sx={{ p: 3.5, height: "100%" }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
                    <Box sx={{ width: 40, height: 40, borderRadius: "10px", background: s.gradient, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <s.Icon sx={{ fontSize: 19, color: "#fff" }} />
                    </Box>
                    <Typography sx={{ fontSize: "1.75rem", fontWeight: 900, color: "rgba(255,255,255,0.05)", letterSpacing: "-0.04em", lineHeight: 1, fontFamily: "monospace" }}>
                      {s.num}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", color: "#E0E0E0", mb: 1.5 }}>{s.title}</Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "#555", lineHeight: 1.75 }}>{s.desc}</Typography>
                </SpotlightCard>
              </FadeIn>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <Box id="features" component="section" sx={{ py: { xs: 12, md: 18 }, ...divider }}>
        <Box sx={container}>
          <FadeIn sx={{ mb: 10 }}>
            <SectionEyebrow label="Capacidades" />
            <Typography sx={{ fontSize: { xs: "1.875rem", md: "2.5rem" }, fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.1 }}>
              Uma plataforma.<Box component="br" />
              <Box component="span" sx={{ color: "#3A3A3A" }}>Cobertura total.</Box>
            </Typography>
          </FadeIn>

          {/* Hero features: first 2 full-width columns */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 2 }}>
            {FEATURES_GRID.slice(0, 2).map((f, i) => (
              <FadeIn key={i} delay={i * 60}>
                <SpotlightCard sx={{ p: 3.5, height: "100%" }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: "10px", backgroundColor: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center", mb: 2.5 }}>
                    <f.Icon sx={{ fontSize: 18, color: "#F97316" }} />
                  </Box>
                  <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: "#E8E8E8", mb: 1 }}>{f.title}</Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "#555", lineHeight: 1.75 }}>{f.desc}</Typography>
                </SpotlightCard>
              </FadeIn>
            ))}
          </Box>

          {/* Remaining features: 3 col */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
            {FEATURES_GRID.slice(2).map((f, i) => (
              <FadeIn key={i} delay={(i + 2) * 50}>
                <SpotlightCard sx={{ p: 2.5, height: "100%" }}>
                  <Stack direction="row" alignItems="flex-start" gap={2}>
                    <Box sx={{ width: 32, height: 32, borderRadius: "8px", backgroundColor: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.25 }}>
                      <f.Icon sx={{ fontSize: 15, color: "#F97316" }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "#D8D8D8", mb: 0.5 }}>{f.title}</Typography>
                      <Typography sx={{ fontSize: "0.75rem", color: "#555", lineHeight: 1.65 }}>{f.desc}</Typography>
                    </Box>
                  </Stack>
                </SpotlightCard>
              </FadeIn>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── PERSONAS ─────────────────────────────────────────────────────── */}
      <Box component="section" sx={{ py: { xs: 12, md: 18 }, ...divider }}>
        <Box sx={container}>
          <FadeIn sx={{ mb: 10 }}>
            <SectionEyebrow label="Para quem" />
            <Typography sx={{ fontSize: { xs: "1.875rem", md: "2.5rem" }, fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.1 }}>
              Construído para<Box component="br" />
              <Box component="span" sx={{ color: "#3A3A3A" }}>quem vive de vendas.</Box>
            </Typography>
          </FadeIn>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
            {PERSONAS.map((p, i) => (
              <FadeIn key={i} delay={i * 100}>
                <SpotlightCard sx={{ p: 3.5, height: "100%" }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: "12px", backgroundColor: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.1)", display: "flex", alignItems: "center", justifyContent: "center", mb: 2.5 }}>
                    <p.Icon sx={{ fontSize: 20, color: "#F97316" }} />
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", color: "#E0E0E0", mb: 1.5 }}>{p.role}</Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "#555", lineHeight: 1.75 }}>{p.desc}</Typography>
                </SpotlightCard>
              </FadeIn>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <Box component="section" sx={{ py: { xs: 12, md: 18 }, ...divider }}>
        <Box sx={container}>
          <FadeIn sx={{ mb: 10 }}>
            <SectionEyebrow label="Resultados reais" />
            <Typography sx={{ fontSize: { xs: "1.875rem", md: "2.5rem" }, fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.1 }}>
              Equipes que já<Box component="br" />
              <Box component="span" sx={{ color: "#3A3A3A" }}>operam com Hermes.</Box>
            </Typography>
          </FadeIn>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
            {TESTIMONIALS.map((t, i) => (
              <FadeIn key={i} delay={i * 100}>
                <SpotlightCard sx={{ p: 3.5, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <Box>
                    <Typography sx={{ fontSize: "2.5rem", fontWeight: 900, color: "rgba(249,115,22,0.15)", lineHeight: 0.8, mb: 2, fontFamily: "Georgia, serif" }}>"</Typography>
                    <Typography sx={{ fontSize: "0.875rem", color: "#777", lineHeight: 1.8, fontStyle: "italic" }}>{t.text}</Typography>
                  </Box>
                  <Stack direction="row" alignItems="center" gap={1.5} sx={{ borderTop: "1px solid rgba(255,255,255,0.05)", pt: 2.5, mt: 3 }}>
                    <Box sx={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, rgba(249,115,22,0.25), rgba(245,158,11,0.25))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6875rem", fontWeight: 700, color: "#F97316", flexShrink: 0 }}>
                      {t.name[0]}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "#C8C8C8" }}>{t.name}</Typography>
                      <Typography sx={{ fontSize: "0.625rem", color: "#444", letterSpacing: "0.04em" }}>{t.role}</Typography>
                    </Box>
                  </Stack>
                </SpotlightCard>
              </FadeIn>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── INTEGRATIONS ─────────────────────────────────────────────────── */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 }, ...divider }}>
        <Box sx={container}>
          <FadeIn sx={{ mb: 5 }}>
            <SectionEyebrow label="Integrações" />
          </FadeIn>
          <FadeIn>
            <Marquee items={CRM_LOGOS} />
          </FadeIn>
        </Box>
      </Box>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Box id="faq" component="section" sx={{ py: { xs: 12, md: 18 }, ...divider }}>
        <Box sx={container}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "5fr 7fr" }, gap: { xs: 8, md: 14 }, alignItems: "start" }}>
            {/* Left sticky label */}
            <FadeIn sx={{ position: { md: "sticky" }, top: { md: 96 } }}>
              <SectionEyebrow label="FAQ" />
              <Typography sx={{ fontSize: { xs: "1.875rem", md: "2.5rem" }, fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.1 }}>
                Perguntas<Box component="br" />
                <Box component="span" sx={{ color: "#3A3A3A" }}>frequentes.</Box>
              </Typography>
            </FadeIn>

            {/* Right: accordion */}
            <Stack gap={1}>
              {FAQS.map((f, i) => (
                <FadeIn key={i} delay={i * 40}>
                  <FaqItem question={f.q} answer={f.a} />
                </FadeIn>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>

      {/* ── CTA FINAL ────────────────────────────────────────────────────── */}
      <Box component="section" sx={{ py: { xs: 16, md: 22 }, ...divider, position: "relative", overflow: "hidden" }}>
        <Box sx={{ pointerEvents: "none", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, borderRadius: "50%", backgroundColor: "rgba(249,115,22,0.04)", filter: "blur(150px)", animation: "glowPulse 5s ease-in-out infinite" }} />
        <Box sx={{ ...container, position: "relative", maxWidth: 680, mx: "auto" }}>
          <FadeIn>
            <SectionEyebrow label="Comece agora" />
            <Typography sx={{ fontSize: { xs: "2rem", md: "3rem" }, fontWeight: 900, letterSpacing: "-0.04em", mb: 3, lineHeight: 1.06 }}>
              Seu próximo cliente<Box component="br" />
              está na base agora.
            </Typography>
            <Typography sx={{ color: "#444", mb: 6, fontSize: "0.9375rem", lineHeight: 1.7, maxWidth: 420 }}>
              Configure seu ICP, rode a busca e receba leads qualificados com contato validado — em minutos.
            </Typography>
            <Button variant="contained" size="large"
              endIcon={<ArrowForwardRounded />}
              onClick={() => navigate("/login")}
              sx={{ fontWeight: 700, fontSize: "0.9375rem", textTransform: "none", borderRadius: "8px", px: 5, py: 1.5,
                boxShadow: "0 0 48px -10px rgba(249,115,22,0.6)",
                "&:hover": { boxShadow: "0 0 60px -6px rgba(249,115,22,0.7)" } }}>
              Acessar a plataforma
            </Button>
          </FadeIn>
        </Box>
      </Box>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <Box component="footer" sx={{ borderTop: "1px solid rgba(255,255,255,0.04)", py: 5 }}>
        <Box sx={container}>
          <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between" gap={4}>
            {/* Brand */}
            <Stack gap={1}>
              <Stack direction="row" alignItems="center" gap={1.5}>
                <Box sx={{ width: 22, height: 22, borderRadius: "6px", background: "linear-gradient(135deg, #F97316, #EA580C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Typography sx={{ color: "#fff", fontWeight: 900, fontSize: "0.625rem" }}>H</Typography>
                </Box>
                <Typography sx={{ fontWeight: 900, fontSize: "0.75rem", letterSpacing: "-0.04em", color: "#555" }}>HERMES</Typography>
              </Stack>
              <Typography sx={{ fontSize: "0.625rem", color: "#333", letterSpacing: "0.04em" }}>© 2026 Projeto Hermes · Todos os direitos reservados</Typography>
            </Stack>

            {/* Links */}
            <Stack direction="row" gap={5}>
              {[["Termos", "#"], ["Privacidade", "#"], ["Contato", "#"]].map(([label, href]) => (
                <Box key={label} component="a" href={href} sx={{ fontSize: "0.6875rem", color: "#333", textDecoration: "none", "&:hover": { color: "#666" }, transition: "color 0.15s" }}>
                  {label}
                </Box>
              ))}
            </Stack>
          </Stack>
        </Box>
      </Box>

      {/* ── SIGNUP MODAL ─────────────────────────────────────────────────── */}
      {showSignup && (
        <SignupModal
          onClose={() => setShowSignup(false)}
          onSuccess={(token) => {
            if (isSupabaseConfigured && supabase && token) {
              supabase.auth.setSession({ access_token: token, refresh_token: "" }).then(() => navigate("/app", { replace: true }));
            } else {
              localStorage.setItem("hermes_token", token || "dev-session-token");
              navigate("/app", { replace: true });
            }
          }}
        />
      )}
    </Box>
  );
}
