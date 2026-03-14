import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  Building2,
  Factory,
  Globe,
  Link2,
  Loader2,
  Mail,
  Newspaper,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  addToPipeline,
  buscarEmpresasParecidasPorCnpj,
  buscarMobileWaterfallPorCnpj,
  buscarStatusContactIntelligencePorCnpj,
  buscarSinaisExternosPorCnpj,
  buscarEmpresaPorCnpj,
  enfileirarContactIntelligencePorCnpj,
  enriquecerEmpresaPorCnpj,
  normalizeCnpj,
  resolverMobileWaterfallPorCnpj,
  salvarResultadoEnriquecimentoCnpj,
  type ContactIntelligenceResult,
  type Empresa,
  type ExternalSignal,
  type MobileWaterfallResult,
  type SimilarCompany,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function formatCnpj(value: string): string {
  const digits = normalizeCnpj(value);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatCapital(value?: number | null): string {
  if (value == null) return "Nao informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatScore(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  const pct = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(Math.max(0, Math.min(100, pct)))}%`;
}

function getEmpresaScore(empresa: Empresa): number {
  const maybeScore =
    empresa.score_icp ??
    Number(empresa.priorizacao?.score_total ?? empresa.qualidade?.score_total ?? 0);
  return Number.isFinite(maybeScore) ? maybeScore : 0;
}

function formatPercent(value?: number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  const pct = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(pct)}%`;
}

function statusTone(status?: string | null): string {
  switch (status) {
    case "verified":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "deliverable":
    case "mx_only":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    case "risky":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "invalid":
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    default:
      return "border-border bg-muted/20 text-foreground/80";
  }
}

function formatPattern(pattern?: string | null): string {
  return pattern ? pattern.replaceAll("_", " / ").replaceAll(".", " . ") : "Nao inferido";
}

function signalTone(signalType?: string | null): string {
  switch (signalType) {
    case "jobs_signal":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    case "funding_signal":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "growth_signal":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "news_signal":
      return "border-violet-500/30 bg-violet-500/10 text-violet-300";
    default:
      return "border-border bg-muted/20 text-foreground/80";
  }
}

function signalLabel(signalType?: string | null): string {
  switch (signalType) {
    case "jobs_signal":
      return "Vagas";
    case "funding_signal":
      return "Investimento";
    case "growth_signal":
      return "Expansao";
    case "news_signal":
      return "Noticia";
    default:
      return "Signal";
  }
}

function signalUrl(signal: ExternalSignal): string | null {
  const url = signal.payload?.url;
  return typeof url === "string" && url ? url : null;
}

function signalSnippet(signal: ExternalSignal): string | null {
  const snippet = signal.payload?.snippet;
  return typeof snippet === "string" && snippet ? snippet : null;
}

function signalDomain(signal: ExternalSignal): string | null {
  const domain = signal.payload?.domain;
  return typeof domain === "string" && domain ? domain : null;
}

function phoneTypeLabel(value?: string | null): string {
  switch (value) {
    case "whatsapp_verified":
      return "WhatsApp validado";
    case "decision_maker_whatsapp_likely":
      return "WhatsApp do decisor";
    case "decision_maker_mobile":
      return "Mobile do decisor";
    case "company_whatsapp_likely":
      return "WhatsApp da empresa";
    case "company_mobile":
      return "Mobile da empresa";
    default:
      return "Telefone";
  }
}

const scoreCards = (empresa: Empresa) => [
  {
    label: "Confiabilidade",
    value: empresa.confiabilidade?.score_total,
    tone: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  },
  {
    label: "Qualidade",
    value: empresa.qualidade?.score_total,
    tone: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  },
  {
    label: "Priorizacao",
    value: empresa.priorizacao?.score_total,
    tone: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  },
];

const EnriquecerCnpj = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [cnpjInput, setCnpjInput] = useState("");
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [contactIntel, setContactIntel] = useState<ContactIntelligenceResult | null>(null);
  const [mobileWaterfall, setMobileWaterfall] = useState<MobileWaterfallResult | null>(null);
  const [similarCompanies, setSimilarCompanies] = useState<SimilarCompany[]>([]);
  const [externalSignals, setExternalSignals] = useState<ExternalSignal[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isResolvingContacts, setIsResolvingContacts] = useState(false);
  const [isResolvingMobile, setIsResolvingMobile] = useState(false);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [isLoadingSignals, setIsLoadingSignals] = useState(false);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [isSendingPipeline, setIsSendingPipeline] = useState(false);
  const searchRequestRef = useRef(0);
  const similarRequestRef = useRef(0);
  const signalRequestRef = useRef(0);

  const cnpjDigits = useMemo(() => normalizeCnpj(cnpjInput), [cnpjInput]);
  const empresaCnpj = useMemo(() => normalizeCnpj(empresa?.cnpj || ""), [empresa?.cnpj]);
  const temEnriquecimento = Boolean(
    empresa?.site ||
    empresa?.email_enriquecido ||
    empresa?.telefone_enriquecido ||
    empresa?.whatsapp_enriquecido,
  );

  useEffect(() => {
    if (!empresa) return;
    if (cnpjDigits === empresaCnpj) return;
    setEmpresa(null);
    setContactIntel(null);
    setMobileWaterfall(null);
    setSimilarCompanies([]);
    setExternalSignals([]);
    setIsResolvingContacts(false);
    setIsResolvingMobile(false);
  }, [cnpjDigits, empresa, empresaCnpj]);

  useEffect(() => {
    const incoming = normalizeCnpj(searchParams.get("cnpj") || "");
    if (incoming.length !== 14) return;
    if (incoming === cnpjDigits) return;
    setCnpjInput(incoming);
  }, [cnpjDigits, searchParams]);

  const loadSimilarCompanies = async (targetCnpj: string, showErrors = false) => {
    const normalized = normalizeCnpj(targetCnpj);
    if (normalized.length !== 14) return;
    const requestId = ++similarRequestRef.current;
    try {
      setIsLoadingSimilar(true);
      const items = await buscarEmpresasParecidasPorCnpj(normalized, 8);
      if (requestId !== similarRequestRef.current) return;
      setSimilarCompanies(items);
    } catch (err: any) {
      if (requestId !== similarRequestRef.current) return;
      setSimilarCompanies([]);
      if (showErrors) {
        toast.error(err?.message || "Nao foi possivel carregar empresas parecidas.");
      }
    } finally {
      if (requestId === similarRequestRef.current) {
        setIsLoadingSimilar(false);
      }
    }
  };

  const loadExternalSignals = async (targetCnpj: string, showErrors = false) => {
    const normalized = normalizeCnpj(targetCnpj);
    if (normalized.length !== 14) return;
    const requestId = ++signalRequestRef.current;
    try {
      setIsLoadingSignals(true);
      const items = await buscarSinaisExternosPorCnpj(normalized);
      if (requestId !== signalRequestRef.current) return;
      setExternalSignals(items);
    } catch (err: any) {
      if (requestId !== signalRequestRef.current) return;
      setExternalSignals([]);
      if (showErrors) {
        toast.error(err?.message || "Nao foi possivel carregar sinais externos.");
      }
    } finally {
      if (requestId === signalRequestRef.current) {
        setIsLoadingSignals(false);
      }
    }
  };

  const pesquisarCnpj = async (targetCnpj: string) => {
    const normalized = normalizeCnpj(targetCnpj);
    if (normalized.length !== 14) {
      toast.error("Informe um CNPJ valido com 14 digitos.");
      return;
    }
    const requestId = ++searchRequestRef.current;

    try {
      setIsFetching(true);
      setIsResolvingContacts(false);
      setIsResolvingMobile(false);
      setContactIntel(null);
      setMobileWaterfall(null);
      setSimilarCompanies([]);
      setExternalSignals([]);
      const encontrada = await buscarEmpresaPorCnpj(normalized);
      if (requestId !== searchRequestRef.current) return;
      setEmpresa(encontrada);
      toast.success("Empresa localizada.");
      try {
        const status = await enfileirarContactIntelligencePorCnpj(normalized, { refresh: true });
        if (requestId !== searchRequestRef.current) return;
        if (status.status === "error") {
          throw new Error(status.error || "Nao foi possivel pesquisar os contatos deste CNPJ.");
        }
        setIsResolvingContacts(true);
        toast.info("Pesquisa nova de contatos disparada para este CNPJ.");
      } catch (queueErr: any) {
        if (requestId !== searchRequestRef.current) return;
        toast.error(queueErr?.message || "Nao foi possivel atualizar os contatos deste CNPJ.");
      }
    } catch (err: any) {
      if (requestId !== searchRequestRef.current) return;
      setIsResolvingContacts(false);
      setEmpresa(null);
      setContactIntel(null);
      setMobileWaterfall(null);
      setSimilarCompanies([]);
      setExternalSignals([]);
      toast.error(err?.message || "Nao foi possivel buscar a empresa.");
    } finally {
      if (requestId === searchRequestRef.current) {
        setIsFetching(false);
      }
    }
  };

  useEffect(() => {
    if (!isResolvingContacts || cnpjDigits.length !== 14 || !empresa || cnpjDigits !== empresaCnpj) return;

    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const status = await buscarStatusContactIntelligencePorCnpj(cnpjDigits);
        if (cancelled) return;

        if (status.status === "completed" && status.intelligence) {
          setContactIntel(status.intelligence);
          setIsResolvingContacts(false);
          toast.success("Inteligencia de contatos concluida em background.");
          return;
        }

        if (status.status === "error") {
          setIsResolvingContacts(false);
          toast.error(status.error || "Nao foi possivel resolver os contatos.");
          return;
        }
      } catch (err: any) {
        if (!cancelled) {
          setIsResolvingContacts(false);
          toast.error(err?.message || "Nao foi possivel acompanhar a fila de contatos.");
        }
        return;
      }

      if (!cancelled) {
        timer = window.setTimeout(poll, 3000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [cnpjDigits, empresa, empresaCnpj, isResolvingContacts]);

  useEffect(() => {
    if (!empresa || empresaCnpj.length !== 14 || empresaCnpj !== cnpjDigits) return;
    void loadSimilarCompanies(empresaCnpj);
    void loadExternalSignals(empresaCnpj);
  }, [cnpjDigits, empresa, empresaCnpj]);

  useEffect(() => {
    if (!empresa || empresaCnpj.length !== 14 || empresaCnpj !== cnpjDigits) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await buscarMobileWaterfallPorCnpj(empresaCnpj);
        if (!cancelled) {
          setMobileWaterfall(response.mobileWaterfall);
        }
      } catch {
        if (!cancelled) {
          setMobileWaterfall(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cnpjDigits, empresa, empresaCnpj]);

  const handleBuscar = async () => {
    await pesquisarCnpj(cnpjDigits);
  };

  const handleEnriquecer = async () => {
    if (cnpjDigits.length !== 14) {
      toast.error("Informe um CNPJ valido com 14 digitos.");
      return;
    }

    try {
      setIsEnriching(true);
      setIsResolvingContacts(false);
      const { empresa: enriquecida } = await enriquecerEmpresaPorCnpj(cnpjDigits, empresa);
      setEmpresa(enriquecida);
      setContactIntel(null);
      setMobileWaterfall(null);
      void loadSimilarCompanies(cnpjDigits);
      void loadExternalSignals(cnpjDigits);
      toast.success("Enriquecimento concluido.");
      try {
        const status = await enfileirarContactIntelligencePorCnpj(cnpjDigits, { refresh: true });
        if (status.status === "error") {
          throw new Error(status.error || "Nao foi possivel atualizar os contatos.");
        }
        setIsResolvingContacts(true);
        toast.info("Contact Intelligence atualizado em background para este CNPJ.");
      } catch (queueErr: any) {
        toast.error(queueErr?.message || "Nao foi possivel atualizar os contatos deste CNPJ.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel enriquecer este CNPJ.");
    } finally {
      setIsEnriching(false);
    }
  };

  const handleAbrirResultados = async () => {
    if (!empresa) return;
    try {
      setIsSavingResult(true);
      await salvarResultadoEnriquecimentoCnpj(empresa, cnpjDigits);
      navigate("/results");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel abrir o resultado.");
    } finally {
      setIsSavingResult(false);
    }
  };

  const handleAdicionarPipeline = async () => {
    if (!empresa) return;
    try {
      setIsSendingPipeline(true);
      const res = await addToPipeline(empresa, getEmpresaScore(empresa));
      toast.success(
        res.status === "exists"
          ? "Esse lead ja estava no pipeline."
          : "Lead adicionado ao pipeline.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel enviar para o pipeline.");
    } finally {
      setIsSendingPipeline(false);
    }
  };

  const handleResolverMobile = async (refresh = true) => {
    if (cnpjDigits.length !== 14) {
      toast.error("Informe um CNPJ valido com 14 digitos.");
      return;
    }
    try {
      setIsResolvingMobile(true);
      const payload = await resolverMobileWaterfallPorCnpj(cnpjDigits, {
        refresh,
        verifyWhatsapp: true,
      });
      setMobileWaterfall(payload);
      toast.success("Mobile waterfall atualizado com verificacao de WhatsApp.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel resolver os mobiles e WhatsApps.");
    } finally {
      setIsResolvingMobile(false);
    }
  };

  const handleResolverContatos = async () => {
    if (cnpjDigits.length !== 14) {
      toast.error("Informe um CNPJ valido com 14 digitos.");
      return;
    }

    try {
      setIsResolvingContacts(true);
      setContactIntel(null);
      const status = await enfileirarContactIntelligencePorCnpj(cnpjDigits, { refresh: true });

      if (status.status === "error") {
        throw new Error(status.error || "Nao foi possivel enfileirar os contatos.");
      }

      toast.info("Contact Intelligence enviado para pesquisa nova em background.");
    } catch (err: any) {
      setIsResolvingContacts(false);
      toast.error(err?.message || "Nao foi possivel resolver os contatos.");
    }
  };

  const handleCarregarSimilar = async (targetCnpj: string) => {
    const normalized = normalizeCnpj(targetCnpj);
    setCnpjInput(normalized);
    await pesquisarCnpj(normalized);
  };

  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
            <Search className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-2xl font-display tracking-tight">Enriquecer por CNPJ</h2>
            <p className="text-sm text-muted-foreground">
              Consulte uma empresa especifica e rode o enriquecimento completo sem passar pelo fluxo de ICP.
            </p>
          </div>
        </div>
      </div>

      <Card className="border-border bg-card shadow-surface-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Fluxo Manual
          </CardTitle>
          <CardDescription>
            Digite um CNPJ, carregue os dados da base e, se quiser, rode o enriquecimento na hora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="flex-1">
              <Input
                value={formatCnpj(cnpjInput)}
                onChange={(e) => setCnpjInput(normalizeCnpj(e.target.value))}
                placeholder="00.000.000/0000-00"
                className="h-11 border-border bg-muted/20 text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleBuscar();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 border-border bg-muted/20"
              onClick={() => void handleBuscar()}
              disabled={isFetching || isEnriching}
            >
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar empresa
            </Button>
            <Button
              type="button"
              className="h-11 bg-cyan-500 text-muted-foreground hover:bg-cyan-400"
              onClick={() => void handleEnriquecer()}
              disabled={isFetching || isEnriching}
            >
              {isEnriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Enriquecer agora
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-border text-foreground/80">
              Busca direta por CNPJ
            </Badge>
            <Badge variant="outline" className="border-border text-foreground/80">
              Resultado unitario
            </Badge>
            <Badge variant="outline" className="border-border text-foreground/80">
              Compatível com Results e Pipeline
            </Badge>
          </div>
        </CardContent>
      </Card>

      {empresa && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{empresa.razao_social}</CardTitle>
                    <CardDescription>
                      {empresa.nome_fantasia || "Sem nome fantasia"} · {formatCnpj(empresa.cnpj)}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                      {empresa.uf || "UF"} · {empresa.cidade || "Cidade"}
                    </Badge>
                    {temEnriquecimento && (
                      <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                        Dados enriquecidos
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Situacao</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{empresa.situacao_cadastral || "Nao informada"}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Capital social</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{formatCapital(empresa.capital_social)}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">CNAE principal</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{empresa.cnae_principal || "Nao informado"}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Atualizacao</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {empresa.enriquecimento_data ? new Date(empresa.enriquecimento_data).toLocaleString("pt-BR") : "Em tempo real"}
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-4 w-4 text-amber-300" />
                  Acoes
                </CardTitle>
                <CardDescription>
                  Salve esse enriquecimento como resultado navegavel ou empurre direto para pipeline.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-between bg-white text-muted-foreground hover:bg-muted"
                  onClick={() => void handleAbrirResultados()}
                  disabled={isSavingResult}
                >
                  <span className="inline-flex items-center gap-2">
                    {isSavingResult ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Abrir em Resultados
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em]">1 lead</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between border-border bg-muted/20"
                  onClick={() => void handleAdicionarPipeline()}
                  disabled={isSendingPipeline}
                >
                  <span className="inline-flex items-center gap-2">
                    {isSendingPipeline ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                    Adicionar ao pipeline
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em]">CRM ready</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/15"
                  onClick={() => void handleEnriquecer()}
                  disabled={isFetching || isEnriching}
                >
                  <span className="inline-flex items-center gap-2">
                    {isEnriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    Rodar enriquecimento novamente
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em]">refresh</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
                  onClick={() => void handleResolverContatos()}
                  disabled={isFetching || isEnriching || isResolvingContacts}
                >
                  <span className="inline-flex items-center gap-2">
                    {isResolvingContacts ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Resolver contatos e emails
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em]">hunter core</span>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Site",
                value: empresa.site || "Nao encontrado",
                icon: Globe,
                tone: empresa.site ? "text-cyan-300" : "text-muted-foreground/70",
              },
              {
                label: "Email final",
                value: empresa.email_final || empresa.email || "Nao encontrado",
                icon: Mail,
                tone: empresa.email_final || empresa.email ? "text-sky-300" : "text-muted-foreground/70",
              },
              {
                label: "Telefone final",
                value: empresa.telefone_final || empresa.telefone_padrao || "Nao encontrado",
                icon: Phone,
                tone: empresa.telefone_final || empresa.telefone_padrao ? "text-foreground" : "text-muted-foreground/70",
              },
              {
                label: "WhatsApp final",
                value: empresa.whatsapp_final || empresa.whatsapp_publico || "Nao encontrado",
                icon: Building2,
                tone: empresa.whatsapp_final || empresa.whatsapp_publico ? "text-emerald-300" : "text-muted-foreground/70",
              },
            ].map((item) => (
              <Card key={item.label} className="border-border bg-card shadow-surface-sm">
                <CardContent className="flex h-full items-start gap-3 p-4">
                  <div className="mt-0.5 rounded-xl border border-border bg-muted/20/80 p-2">
                    <item.icon className={cn("h-4 w-4", item.tone)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">{item.label}</p>
                    <p className={cn("mt-2 break-words text-sm font-medium", item.tone)}>{item.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Brain className="h-4 w-4 text-violet-300" />
                  Leitura Rapida
                </CardTitle>
                <CardDescription>
                  Resumo do enriquecimento e sinais comerciais imediatamente acionaveis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {empresa.email_enriquecido && (
                    <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                      Email enriquecido
                    </Badge>
                  )}
                  {empresa.whatsapp_enriquecido && (
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                      WhatsApp enriquecido
                    </Badge>
                  )}
                  {empresa.site && (
                    <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                      Site encontrado
                    </Badge>
                  )}
                  {empresa.resumo_ia_empresa && (
                    <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-300">
                      IA ativa
                    </Badge>
                  )}
                </div>
                <Separator className="bg-muted" />
                <p className="text-sm leading-7 text-foreground/80">
                  {empresa.resumo_ia_empresa ||
                    "Sem resumo de IA ainda. Rode o enriquecimento para puxar o maximo de contexto comercial disponivel para esse CNPJ."}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader>
                <CardTitle className="text-lg">Scores</CardTitle>
                <CardDescription>
                  Indicadores que ajudam a decidir se esse lead merece follow-up imediato.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {scoreCards(empresa).map((item) => (
                  <div key={item.label} className={cn("rounded-2xl border p-3", item.tone)}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-sm font-semibold">{formatScore(item.value)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Factory className="h-4 w-4 text-amber-300" />
                    Empresas parecidas
                  </CardTitle>
                  <CardDescription>
                    Lookalikes por CNAE, porte, geografia e cobertura de contato para expandir o ICP.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-border bg-muted/20"
                  onClick={() => void loadSimilarCompanies(empresa.cnpj, true)}
                  disabled={isLoadingSimilar}
                >
                  {isLoadingSimilar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoadingSimilar && similarCompanies.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Carregando empresas parecidas...
                  </div>
                ) : similarCompanies.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                    Nenhuma empresa parecida encontrada para este recorte ainda.
                  </div>
                ) : (
                  similarCompanies.map((item) => (
                    <div key={item.cnpj} className="rounded-2xl border border-border bg-muted/20/70 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.razao_social}</p>
                            <p className="mt-1 text-xs text-muted-foreground/70">
                              {formatCnpj(item.cnpj)}
                              {" · "}
                              {[item.cidade, item.uf].filter(Boolean).join(" / ") || "Localizacao nao informada"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                              Similaridade {formatPercent(item.similarity_score)}
                            </Badge>
                            {item.site && (
                              <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                                Site
                              </Badge>
                            )}
                            {item.whatsapp && (
                              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                                WhatsApp
                              </Badge>
                            )}
                            {item.email_receita && (
                              <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                                Email
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border bg-card"
                          onClick={() => void handleCarregarSimilar(item.cnpj)}
                          disabled={isFetching || isEnriching}
                        >
                          <ArrowRight className="mr-2 h-4 w-4" />
                          Abrir CNPJ
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Newspaper className="h-4 w-4 text-violet-300" />
                    Sinais externos
                  </CardTitle>
                  <CardDescription>
                    Vagas, investimento, expansao e noticias recentes rastreadas para este CNPJ.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-border bg-muted/20"
                  onClick={() => void loadExternalSignals(empresa.cnpj, true)}
                  disabled={isLoadingSignals}
                >
                  {isLoadingSignals ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoadingSignals && externalSignals.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Capturando sinais externos...
                  </div>
                ) : externalSignals.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                    Nenhum sinal externo relevante apareceu para este CNPJ ate agora.
                  </div>
                ) : (
                  externalSignals.slice(0, 8).map((signal, index) => (
                    <div key={`${signal.signal_type}-${signal.title}-${index}`} className="rounded-2xl border border-border bg-muted/20/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <Badge variant="outline" className={signalTone(signal.signal_type)}>
                            {signal.signal_type === "jobs_signal" && <Users className="mr-1 h-3 w-3" />}
                            {signal.signal_type === "funding_signal" && <TrendingUp className="mr-1 h-3 w-3" />}
                            {signal.signal_type === "growth_signal" && <Factory className="mr-1 h-3 w-3" />}
                            {signal.signal_type === "news_signal" && <Newspaper className="mr-1 h-3 w-3" />}
                            {signalLabel(signal.signal_type)}
                          </Badge>
                          <p className="text-sm font-medium text-foreground">{signal.title}</p>
                          {signalSnippet(signal) && (
                            <p className="text-sm leading-6 text-muted-foreground">{signalSnippet(signal)}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70">
                        {signalDomain(signal) && <span>{signalDomain(signal)}</span>}
                        {signal.created_at && (
                          <>
                            <span>·</span>
                            <span>{new Date(signal.created_at).toLocaleString("pt-BR")}</span>
                          </>
                        )}
                      </div>
                      {signalUrl(signal) && (
                        <a
                          href={signalUrl(signal) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"
                        >
                          <Link2 className="h-4 w-4" />
                          Abrir fonte
                        </a>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {contactIntel ? (
            <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
              <Card className="border-border bg-card shadow-surface-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldCheck className="h-4 w-4 text-violet-300" />
                    Contact Intelligence
                  </CardTitle>
                  <CardDescription>
                    Dominio resolvido, padrao corporativo e evidencias de contato derivadas do CNPJ.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Dominio</p>
                      <p className="mt-2 break-all text-sm font-medium text-foreground">
                        {contactIntel.domain_profile.domain || "Nao resolvido"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Padrao</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {formatPattern(contactIntel.domain_profile.email_pattern)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {formatPercent(contactIntel.domain_profile.pattern_confidence)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Emails acionaveis</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {contactIntel.summary.deliverable ?? 0}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {contactIntel.summary.verified ?? 0} verificados
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Decisores</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {contactIntel.summary.decision_makers ?? 0}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {contactIntel.summary.guessed ?? 0} guessed / {contactIntel.summary.sourced ?? 0} sourced
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(contactIntel.domain_profile.company_profiles ?? []).map((profile) => (
                      <Badge key={`${profile.type}-${profile.url}`} variant="outline" className="border-border bg-muted/20 text-foreground/80">
                        <Link2 className="mr-1 h-3 w-3" />
                        {profile.type}: {profile.url.replace(/^https?:\/\//, "")}
                      </Badge>
                    ))}
                    {(contactIntel.domain_profile.public_emails ?? []).slice(0, 4).map((item) => (
                      <Badge key={item.email} variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                        {item.email}
                      </Badge>
                    ))}
                  </div>

                  {(contactIntel.domain_profile.generic_inboxes ?? []).length > 0 && (
                    <>
                      <Separator className="bg-muted" />
                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Caixas gerais encontradas</p>
                        <div className="flex flex-wrap gap-2">
                          {(contactIntel.domain_profile.generic_inboxes ?? []).map((item) => (
                            <Badge key={item.email} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                              {item.email}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-surface-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-4 w-4 text-cyan-300" />
                    Decisores Resolvidos
                  </CardTitle>
                  <CardDescription>
                    Contatos deduzidos ou encontrados com score, status tecnico e evidencias.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(contactIntel.contacts ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                      Nenhum decisor foi resolvido ainda. Rode novamente apos enriquecer o site da empresa.
                    </div>
                  ) : (
                    (contactIntel.contacts ?? []).slice(0, 6).map((contact) => {
                      const primary = contact.emails.find((item) => item.is_primary) || contact.emails[0];
                      return (
                        <div key={contact.name} className="rounded-2xl border border-border bg-muted/20/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{contact.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground/70">
                                {contact.role || "Socio / decisor potencial"}
                              </p>
                            </div>
                            {primary?.verification_status && (
                              <Badge variant="outline" className={cn("capitalize", statusTone(primary.verification_status))}>
                                {primary.verification_status}
                              </Badge>
                            )}
                          </div>

                          {primary ? (
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4 text-sky-300" />
                                <span className="break-all font-medium text-foreground">{primary.email}</span>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span>Score {formatPercent(primary.score_total)}</span>
                                <span>·</span>
                                <span>{primary.kind === "sourced" ? "Sourced" : "Guessed"}</span>
                                {primary.pattern && (
                                  <>
                                    <span>·</span>
                                    <span>{primary.pattern}</span>
                                  </>
                                )}
                              </div>
                              {contact.linkedin && (
                                <a
                                  href={contact.linkedin}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 text-xs text-cyan-300 hover:text-cyan-200"
                                >
                                  <Link2 className="h-3 w-3" />
                                  Abrir perfil
                                </a>
                              )}
                              {contact.emails.length > 1 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {contact.emails.slice(1, 4).map((email) => (
                                    <Badge key={email.email} variant="outline" className="border-border bg-muted/20 text-foreground/80">
                                      {email.email}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-muted-foreground">Sem email resolvido para esse contato.</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-dashed border-border bg-card/40">
              <CardContent className="flex flex-col gap-3 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Modulo Hunter-style ainda nao resolvido para este CNPJ.</p>
                  <p className="mt-1 text-sm text-muted-foreground/70">
                    O Hermes ja tem a empresa carregada. Falta resolver dominio, pattern corporativo e decisores por email.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
                  onClick={() => void handleResolverContatos()}
                  disabled={isResolvingContacts}
                >
                  {isResolvingContacts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Resolver Contact Intelligence
                </Button>
              </CardContent>
            </Card>
          )}

          {mobileWaterfall ? (
            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Phone className="h-4 w-4 text-emerald-300" />
                      Mobile Waterfall
                    </CardTitle>
                    <CardDescription>
                      Camada Apollo-style para priorizar mobiles e WhatsApps acionaveis por empresa.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                    onClick={() => void handleResolverMobile(true)}
                    disabled={isResolvingMobile}
                  >
                    {isResolvingMobile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Revalidar mobiles
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Mobiles</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{mobileWaterfall.summary.mobile_candidates ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">WhatsApps validados</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {mobileWaterfall.summary.verified_whatsapp_candidates ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Mobiles de decisor</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {mobileWaterfall.summary.decision_maker_mobile_candidates ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Primario</p>
                    <p className="mt-2 break-all text-sm font-medium text-foreground">
                      {mobileWaterfall.summary.primary_phone || "Nao definido"}
                    </p>
                  </div>
                </div>

                {(mobileWaterfall.candidates ?? []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Nenhum mobile foi priorizado ainda para este CNPJ.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {mobileWaterfall.candidates.slice(0, 6).map((candidate) => (
                      <div key={`${candidate.normalized_phone}-${candidate.contact_name || "company"}`} className="rounded-2xl border border-border bg-muted/20/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{candidate.normalized_phone}</p>
                            <p className="mt-1 text-xs text-muted-foreground/70">
                              {candidate.contact_name || empresa?.razao_social || "Empresa"}
                              {candidate.contact_role ? ` · ${candidate.contact_role}` : ""}
                            </p>
                          </div>
                          {candidate.is_primary && (
                            <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                              Primario
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                            {phoneTypeLabel(candidate.phone_type)}
                          </Badge>
                          {candidate.verified_whatsapp && (
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                              <BadgeCheck className="mr-1 h-3 w-3" />
                              WhatsApp validado
                            </Badge>
                          )}
                          {!candidate.verified_whatsapp && candidate.likely_whatsapp && (
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                              WhatsApp provavel
                            </Badge>
                          )}
                          {candidate.contact_level === "decision_maker" && (
                            <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-300">
                              Decisor
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          <span>Fonte: {candidate.source_label || "Nao informada"}</span>
                          {candidate.validation_source && <span> · Validacao: {candidate.validation_source}</span>}
                          {candidate.score_total != null && <span> · Score {formatPercent(candidate.score_total)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            empresa && (
              <Card className="border-dashed border-border bg-card/40">
                <CardContent className="flex flex-col gap-3 p-6 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Apollo-style mobile waterfall ainda nao resolvido para este CNPJ.</p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      O Hermes ja tem telefones e socios. Falta priorizar mobile, validar WhatsApp e destacar o melhor canal.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                    onClick={() => void handleResolverMobile(true)}
                    disabled={isResolvingMobile}
                  >
                    {isResolvingMobile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                    Resolver mobiles e WhatsApp
                  </Button>
                </CardContent>
              </Card>
            )
          )}
        </>
      )}
    </div>
  );
};

export default EnriquecerCnpj;
