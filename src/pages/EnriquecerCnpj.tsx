import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import SearchIcon from "@mui/icons-material/Search";
import SparklesIcon from "@mui/icons-material/AutoAwesome";
import ArrowRightIcon from "@mui/icons-material/ArrowForward";
import RefreshCwIcon from "@mui/icons-material/Refresh";
import BrainIcon from "@mui/icons-material/Psychology";
import GlobeIcon from "@mui/icons-material/Language";
import MailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import Building2Icon from "@mui/icons-material/WhatsApp";
import FactoryIcon from "@mui/icons-material/Factory";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import Link2Icon from "@mui/icons-material/Link";
import ShieldCheckIcon from "@mui/icons-material/VerifiedUser";
import BadgeCheckIcon from "@mui/icons-material/CheckCircle";
import TargetIcon from "@mui/icons-material/TrackChanges";
import UsersIcon from "@mui/icons-material/People";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WalletCardsIcon from "@mui/icons-material/AccountBalanceWallet";
import CircularProgress from "@mui/material/CircularProgress";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import { alpha, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  dashedEmptyState,
  dashedPlaceholderCardSx,
  semanticAccent,
  semanticAccentHex,
  softInsetBox,
  type SemanticTone,
} from "@/theme/themeSx";

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

function statusChipSx(theme: Theme, status?: string | null) {
  switch (status) {
    case "verified":
      return semanticAccent(theme, "success");
    case "deliverable":
    case "mx_only":
      return semanticAccent(theme, "info");
    case "risky":
      return semanticAccent(theme, "warning");
    case "invalid":
      return semanticAccent(theme, "error");
    default:
      return {
        color: theme.palette.text.secondary,
        bgcolor: theme.palette.action.hover,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: "8px",
      };
  }
}

function formatPattern(pattern?: string | null): string {
  return pattern ? pattern.replaceAll("_", " / ").replaceAll(".", " . ") : "Nao inferido";
}

function signalChipSx(theme: Theme, signalType?: string | null) {
  switch (signalType) {
    case "jobs_signal":
      return semanticAccent(theme, "info");
    case "funding_signal":
      return semanticAccent(theme, "success");
    case "growth_signal":
      return semanticAccent(theme, "warning");
    case "news_signal":
      return semanticAccentHex("#9333EA");
    default:
      return {
        color: theme.palette.text.secondary,
        bgcolor: theme.palette.action.hover,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: "8px",
      };
  }
}

function signalLabel(signalType?: string | null): string {
  switch (signalType) {
    case "jobs_signal": return "Vagas";
    case "funding_signal": return "Investimento";
    case "growth_signal": return "Expansao";
    case "news_signal": return "Noticia";
    default: return "Signal";
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
    case "whatsapp_verified": return "WhatsApp validado";
    case "decision_maker_whatsapp_likely": return "WhatsApp do decisor";
    case "decision_maker_mobile": return "Mobile do decisor";
    case "company_whatsapp_likely": return "WhatsApp da empresa";
    case "company_mobile": return "Mobile da empresa";
    default: return "Telefone";
  }
}

function scoreCardRows(theme: Theme, empresa: Empresa) {
  const tones: SemanticTone[] = ["info", "success", "warning"];
  const rows = [
    { label: "Confiabilidade", value: empresa.confiabilidade?.score_total },
    { label: "Qualidade", value: empresa.qualidade?.score_total },
    { label: "Priorizacao", value: empresa.priorizacao?.score_total },
  ];
  return rows.map((row, i) => ({ ...row, accent: semanticAccent(theme, tones[i]) }));
}

const EnriquecerCnpj = () => {
  const navigate = useNavigate();
  const theme = useTheme();
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
      const hl = cnpjDigits.replace(/\D/g, "").slice(0, 14);
      navigate("/results", { state: { highlightCnpj: hl } });
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, p: 0.5 }}>
      {/* Page Header */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box
          sx={(t) => ({
            width: 44,
            height: 44,
            borderRadius: "16px",
            border: `1px solid ${alpha(t.palette.info.main, 0.35)}`,
            bgcolor: alpha(t.palette.info.main, 0.1),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          })}
        >
          <SearchIcon sx={{ fontSize: 20, color: "info.main" }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} letterSpacing="-0.02em">
            Enriquecer por CNPJ
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Consulte uma empresa especifica e rode o enriquecimento completo sem passar pelo fluxo de ICP.
          </Typography>
        </Box>
      </Stack>

      {/* Search Card */}
      <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
        <CardContent sx={{ p: 3 }}>
          <Stack spacing={0.5} mb={2.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <SparklesIcon sx={{ fontSize: 16, color: "info.main" }} />
              <Typography variant="subtitle1" fontWeight={600}>Fluxo Manual</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Digite um CNPJ, carregue os dados da base e, se quiser, rode o enriquecimento na hora.
            </Typography>
          </Stack>

          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} mb={2}>
            <TextField
              value={formatCnpj(cnpjInput)}
              onChange={(e) => setCnpjInput(normalizeCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleBuscar();
                }
              }}
              sx={{ flex: 1 }}
              inputProps={{ style: { fontSize: 16 } }}
            />
            <Button
              variant="outlined"
              onClick={() => void handleBuscar()}
              disabled={isFetching || isEnriching}
              startIcon={isFetching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
              sx={{ whiteSpace: "nowrap", minWidth: 160 }}
            >
              Buscar empresa
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleEnriquecer()}
              disabled={isFetching || isEnriching}
              startIcon={isEnriching ? <CircularProgress size={16} color="inherit" /> : <SparklesIcon />}
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontWeight: 600,
                whiteSpace: "nowrap",
                minWidth: 160,
                "&:hover": { bgcolor: "primary.dark" },
              }}
            >
              Enriquecer agora
            </Button>
          </Stack>

          <Stack direction="row" flexWrap="wrap" gap={1}>
            {["Busca direta por CNPJ", "Resultado unitario", "Compativel com Results e Pipeline"].map((label) => (
              <Chip
                key={label}
                label={label}
                variant="outlined"
                size="small"
                sx={{ borderColor: "divider", color: "text.secondary", borderRadius: "8px" }}
              />
            ))}
          </Stack>
        </CardContent>
      </Card>

      {empresa && (
        <>
          {/* Company Header + Actions */}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xl: "1.5fr 1fr" } }}>
            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={2.5}>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>{empresa.razao_social}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {empresa.nome_fantasia || "Sem nome fantasia"} · {formatCnpj(empresa.cnpj)}
                    </Typography>
                  </Box>
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    <Chip
                      label={`${empresa.uf || "UF"} · ${empresa.cidade || "Cidade"}`}
                      size="small"
                      sx={semanticAccent(theme, "success")}
                    />
                    {temEnriquecimento && (
                      <Chip
                        label="Dados enriquecidos"
                        size="small"
                        sx={semanticAccent(theme, "info")}
                      />
                    )}
                  </Stack>
                </Stack>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { sm: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" } }}>
                  {[
                    { label: "Situacao", value: empresa.situacao_cadastral || "Nao informada" },
                    { label: "Capital social", value: formatCapital(empresa.capital_social) },
                    { label: "CNAE principal", value: empresa.cnae_principal || "Nao informado" },
                    {
                      label: "Atualizacao",
                      value: empresa.enriquecimento_data
                        ? new Date(empresa.enriquecimento_data).toLocaleString("pt-BR")
                        : "Em tempo real",
                    },
                  ].map((item) => (
                    <Box key={item.label} sx={(t) => softInsetBox(t)}>
                      <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block" }}>
                        {item.label}
                      </Typography>
                      <Typography variant="body2" fontWeight={500} mt={1}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                  <TargetIcon sx={{ fontSize: 16, color: "warning.main" }} />
                  <Typography variant="subtitle1" fontWeight={600}>Acoes</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Salve esse enriquecimento como resultado navegavel ou empurre direto para pipeline.
                </Typography>
                <Stack spacing={1.5}>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => void handleAbrirResultados()}
                    disabled={isSavingResult}
                    startIcon={isSavingResult ? <CircularProgress size={16} color="inherit" /> : <ArrowRightIcon />}
                    endIcon={<Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>1 lead</Typography>}
                    sx={{ justifyContent: "space-between" }}
                  >
                    Abrir em Resultados
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => void handleAdicionarPipeline()}
                    disabled={isSendingPipeline}
                    startIcon={isSendingPipeline ? <CircularProgress size={16} color="inherit" /> : <WalletCardsIcon />}
                    endIcon={<Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>CRM ready</Typography>}
                    sx={{ justifyContent: "space-between" }}
                  >
                    Adicionar ao pipeline
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => void handleEnriquecer()}
                    disabled={isFetching || isEnriching}
                    startIcon={isEnriching ? <CircularProgress size={16} color="inherit" /> : <BadgeCheckIcon />}
                    endIcon={<Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>refresh</Typography>}
                    sx={{
                      justifyContent: "space-between",
                      ...semanticAccent(theme, "info"),
                      "&:hover": { bgcolor: alpha(theme.palette.info.main, 0.18) },
                    }}
                  >
                    Rodar enriquecimento novamente
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => void handleResolverContatos()}
                    disabled={isFetching || isEnriching || isResolvingContacts}
                    startIcon={isResolvingContacts ? <CircularProgress size={16} color="inherit" /> : <ShieldCheckIcon />}
                    endIcon={<Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>hunter core</Typography>}
                    sx={{
                      justifyContent: "space-between",
                      ...semanticAccentHex("#9333EA"),
                      "&:hover": { bgcolor: alpha("#9333EA", 0.18) },
                    }}
                  >
                    Resolver contatos e emails
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Box>

          {/* Contact Cards Row */}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { lg: "repeat(2,1fr)", xl: "repeat(4,1fr)" } }}>
            {[
              {
                label: "Site",
                value: empresa.site || "Nao encontrado",
                Icon: GlobeIcon,
                color: empresa.site ? "info.main" : "text.disabled",
              },
              {
                label: "Email final",
                value: empresa.email_final || empresa.email || "Nao encontrado",
                Icon: MailIcon,
                color: empresa.email_final || empresa.email ? "info.main" : "text.disabled",
              },
              {
                label: "Telefone final",
                value: empresa.telefone_final || empresa.telefone_padrao || "Nao encontrado",
                Icon: PhoneIcon,
                color: empresa.telefone_final || empresa.telefone_padrao ? "text.primary" : "text.disabled",
              },
              {
                label: "WhatsApp final",
                value: empresa.whatsapp_final || empresa.whatsapp_publico || "Nao encontrado",
                Icon: Building2Icon,
                color: empresa.whatsapp_final || empresa.whatsapp_publico ? "success.main" : "text.disabled",
              },
            ].map((item) => (
              <Card key={item.label} sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
                <CardContent sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, p: 2, "&:last-child": { pb: 2 } }}>
                  <Box
                    sx={{
                      mt: 0.25,
                      p: 1,
                      borderRadius: "10px",
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "action.hover",
                    }}
                  >
                    <item.Icon sx={{ fontSize: 16, color: item.color }} />
                  </Box>
                  <Box minWidth={0}>
                    <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block" }}>
                      {item.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={500} mt={1} sx={{ wordBreak: "break-all", color: item.color }}>
                      {item.value}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>

          {/* Quick Read + Scores */}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xl: "1.3fr 1fr" } }}>
            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                  <BrainIcon sx={{ fontSize: 16, color: "primary.main" }} />
                  <Typography variant="subtitle1" fontWeight={600}>Leitura Rapida</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Resumo do enriquecimento e sinais comerciais imediatamente acionaveis.
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
                  {empresa.email_enriquecido && (
                    <Chip label="Email enriquecido" size="small" sx={semanticAccent(theme, "info")} />
                  )}
                  {empresa.whatsapp_enriquecido && (
                    <Chip label="WhatsApp enriquecido" size="small" sx={semanticAccent(theme, "success")} />
                  )}
                  {empresa.site && (
                    <Chip label="Site encontrado" size="small" sx={semanticAccent(theme, "info")} />
                  )}
                  {empresa.resumo_ia_empresa && (
                    <Chip label="IA ativa" size="small" sx={semanticAccentHex("#9333EA")} />
                  )}
                </Stack>
                <Divider sx={{ borderColor: "divider", mb: 2 }} />
                <Typography variant="body2" sx={{ lineHeight: 1.75, color: "text.primary" }}>
                  {empresa.resumo_ia_empresa ||
                    "Sem resumo de IA ainda. Rode o enriquecimento para puxar o maximo de contexto comercial disponivel para esse CNPJ."}
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" fontWeight={600} mb={0.5}>Scores</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Indicadores que ajudam a decidir se esse lead merece follow-up imediato.
                </Typography>
                <Stack spacing={1.5}>
                  {scoreCardRows(theme, empresa).map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        ...item.accent,
                        borderRadius: "12px",
                        p: 1.5,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Typography variant="body2" fontWeight={500} sx={{ color: item.accent.color }}>{item.label}</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ color: item.accent.color }}>{formatScore(item.value)}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Box>

          {/* Similar Companies + External Signals */}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xl: "1.05fr 1fr" } }}>
            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} mb={2}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                      <FactoryIcon sx={{ fontSize: 16, color: "warning.main" }} />
                      <Typography variant="subtitle1" fontWeight={600}>Empresas parecidas</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Lookalikes por CNAE, porte, geografia e cobertura de contato para expandir o ICP.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => void loadSimilarCompanies(empresa.cnpj, true)}
                    disabled={isLoadingSimilar}
                    startIcon={isLoadingSimilar ? <CircularProgress size={14} color="inherit" /> : <RefreshCwIcon />}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Atualizar
                  </Button>
                </Stack>
                <Stack spacing={1.5}>
                  {isLoadingSimilar && similarCompanies.length === 0 ? (
                    <Box sx={(t) => softInsetBox(t, 2)}>
                      <Typography variant="body2" color="text.secondary">Carregando empresas parecidas...</Typography>
                    </Box>
                  ) : similarCompanies.length === 0 ? (
                    <Box sx={(t) => dashedEmptyState(t)}>
                      <Typography variant="body2" color="text.secondary">Nenhuma empresa parecida encontrada para este recorte ainda.</Typography>
                    </Box>
                  ) : (
                    similarCompanies.map((item) => (
                      <Box key={item.cnpj} sx={(t) => softInsetBox(t, 2)}>
                        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "flex-start" }} gap={2}>
                          <Box>
                            <Typography variant="body2" fontWeight={600}>{item.razao_social}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatCnpj(item.cnpj)} · {[item.cidade, item.uf].filter(Boolean).join(" / ") || "Localizacao nao informada"}
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" gap={0.75} mt={1}>
                              <Chip label={`Similaridade ${formatPercent(item.similarity_score)}`} size="small" sx={semanticAccent(theme, "warning")} />
                              {item.site && <Chip label="Site" size="small" sx={semanticAccent(theme, "info")} />}
                              {item.whatsapp && <Chip label="WhatsApp" size="small" sx={semanticAccent(theme, "success")} />}
                              {item.email_receita && <Chip label="Email" size="small" sx={semanticAccent(theme, "info")} />}
                            </Stack>
                          </Box>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => void handleCarregarSimilar(item.cnpj)}
                            disabled={isFetching || isEnriching}
                            startIcon={<ArrowRightIcon />}
                            sx={{ whiteSpace: "nowrap" }}
                          >
                            Abrir CNPJ
                          </Button>
                        </Stack>
                      </Box>
                    ))
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} mb={2}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                      <NewspaperIcon sx={{ fontSize: 16, color: "info.main" }} />
                      <Typography variant="subtitle1" fontWeight={600}>Sinais externos</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Vagas, investimento, expansao e noticias recentes rastreadas para este CNPJ.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => void loadExternalSignals(empresa.cnpj, true)}
                    disabled={isLoadingSignals}
                    startIcon={isLoadingSignals ? <CircularProgress size={14} color="inherit" /> : <RefreshCwIcon />}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Atualizar
                  </Button>
                </Stack>
                <Stack spacing={1.5}>
                  {isLoadingSignals && externalSignals.length === 0 ? (
                    <Box sx={(t) => softInsetBox(t, 2)}>
                      <Typography variant="body2" color="text.secondary">Capturando sinais externos...</Typography>
                    </Box>
                  ) : externalSignals.length === 0 ? (
                    <Box sx={(t) => dashedEmptyState(t)}>
                      <Typography variant="body2" color="text.secondary">Nenhum sinal externo relevante apareceu para este CNPJ ate agora.</Typography>
                    </Box>
                  ) : (
                    externalSignals.slice(0, 8).map((signal, index) => {
                      const sc = signalChipSx(theme, signal.signal_type);
                      return (
                        <Box key={`${signal.signal_type}-${signal.title}-${index}`} sx={(t) => softInsetBox(t, 2)}>
                          <Stack spacing={1}>
                            <Chip
                              icon={
                                signal.signal_type === "jobs_signal" ? <UsersIcon sx={{ fontSize: 12 }} /> :
                                signal.signal_type === "funding_signal" ? <TrendingUpIcon sx={{ fontSize: 12 }} /> :
                                signal.signal_type === "growth_signal" ? <FactoryIcon sx={{ fontSize: 12 }} /> :
                                <NewspaperIcon sx={{ fontSize: 12 }} />
                              }
                              label={signalLabel(signal.signal_type)}
                              size="small"
                              sx={{ ...sc, alignSelf: "flex-start" }}
                            />
                            <Typography variant="body2" fontWeight={500}>{signal.title}</Typography>
                            {signalSnippet(signal) && (
                              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                                {signalSnippet(signal)}
                              </Typography>
                            )}
                            <Stack direction="row" flexWrap="wrap" gap={0.5} alignItems="center">
                              {signalDomain(signal) && (
                                <Typography variant="caption" color="text.secondary">{signalDomain(signal)}</Typography>
                              )}
                              {signal.created_at && (
                                <>
                                  <Typography variant="caption" color="text.secondary">·</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {new Date(signal.created_at).toLocaleString("pt-BR")}
                                  </Typography>
                                </>
                              )}
                            </Stack>
                            {signalUrl(signal) && (
                              <Box
                                component="a"
                                href={signalUrl(signal) ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                sx={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  color: "info.main",
                                  textDecoration: "none",
                                  fontSize: 14,
                                  "&:hover": { color: "info.light" },
                                }}
                              >
                                <Link2Icon sx={{ fontSize: 16 }} />
                                Abrir fonte
                              </Box>
                            )}
                          </Stack>
                        </Box>
                      );
                    })
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Box>

          {/* Contact Intelligence */}
          {contactIntel ? (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xl: "1.15fr 1fr" } }}>
              <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                    <ShieldCheckIcon sx={{ fontSize: 16, color: "success.main" }} />
                    <Typography variant="subtitle1" fontWeight={600}>Contact Intelligence</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Dominio resolvido, padrao corporativo e evidencias de contato derivadas do CNPJ.
                  </Typography>
                  <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, mb: 2 }}>
                    {[
                      { label: "Dominio", value: contactIntel.domain_profile.domain || "Nao resolvido" },
                      {
                        label: "Padrao",
                        value: formatPattern(contactIntel.domain_profile.email_pattern),
                        sub: formatPercent(contactIntel.domain_profile.pattern_confidence),
                      },
                      {
                        label: "Emails acionaveis",
                        value: String(contactIntel.summary.deliverable ?? 0),
                        sub: `${contactIntel.summary.verified ?? 0} verificados`,
                      },
                      {
                        label: "Decisores",
                        value: String(contactIntel.summary.decision_makers ?? 0),
                        sub: `${contactIntel.summary.guessed ?? 0} guessed / ${contactIntel.summary.sourced ?? 0} sourced`,
                      },
                    ].map((item) => (
                      <Box key={item.label} sx={(t) => softInsetBox(t)}>
                        <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block" }}>
                          {item.label}
                        </Typography>
                        <Typography variant="body2" fontWeight={500} mt={1} sx={{ wordBreak: "break-all" }}>{item.value}</Typography>
                        {item.sub && <Typography variant="caption" color="text.secondary">{item.sub}</Typography>}
                      </Box>
                    ))}
                  </Box>
                  <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
                    {(contactIntel.domain_profile.company_profiles ?? []).map((profile) => (
                      <Chip
                        key={`${profile.type}-${profile.url}`}
                        icon={<Link2Icon sx={{ fontSize: 12 }} />}
                        label={`${profile.type}: ${profile.url.replace(/^https?:\/\//, "")}`}
                        size="small"
                        variant="outlined"
                        sx={{ borderColor: "divider", color: "text.secondary", borderRadius: "8px" }}
                      />
                    ))}
                    {(contactIntel.domain_profile.public_emails ?? []).slice(0, 4).map((item) => (
                      <Chip
                        key={item.email}
                        label={item.email}
                        size="small"
                        sx={semanticAccent(theme, "info")}
                      />
                    ))}
                  </Stack>
                  {(contactIntel.domain_profile.generic_inboxes ?? []).length > 0 && (
                    <>
                      <Divider sx={{ borderColor: "divider", mb: 2 }} />
                      <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block", mb: 1 }}>
                        Caixas gerais encontradas
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        {(contactIntel.domain_profile.generic_inboxes ?? []).map((item) => (
                          <Chip
                            key={item.email}
                            label={item.email}
                            size="small"
                            sx={semanticAccent(theme, "success")}
                          />
                        ))}
                      </Stack>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                    <UsersIcon sx={{ fontSize: 16, color: "info.main" }} />
                    <Typography variant="subtitle1" fontWeight={600}>Decisores Resolvidos</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Contatos deduzidos ou encontrados com score, status tecnico e evidencias.
                  </Typography>
                  <Stack spacing={1.5}>
                    {(contactIntel.contacts ?? []).length === 0 ? (
                      <Box sx={(t) => dashedEmptyState(t)}>
                        <Typography variant="body2" color="text.secondary">
                          Nenhum decisor foi resolvido ainda. Rode novamente apos enriquecer o site da empresa.
                        </Typography>
                      </Box>
                    ) : (
                      (contactIntel.contacts ?? []).slice(0, 6).map((contact) => {
                        const primary = contact.emails.find((item) => item.is_primary) || contact.emails[0];
                        const sc = statusChipSx(theme, primary?.verification_status);
                        return (
                          <Box key={contact.name} sx={(t) => softInsetBox(t, 2)}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} mb={primary ? 1.5 : 0}>
                              <Box>
                                <Typography variant="body2" fontWeight={600}>{contact.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {contact.role || "Socio / decisor potencial"}
                                </Typography>
                              </Box>
                              {primary?.verification_status && (
                                <Chip
                                  label={primary.verification_status}
                                  size="small"
                                  sx={{ ...sc, textTransform: "capitalize" }}
                                />
                              )}
                            </Stack>
                            {primary ? (
                              <Stack spacing={0.75}>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                  <MailIcon sx={{ fontSize: 16, color: "info.main" }} />
                                  <Typography variant="body2" fontWeight={500} sx={{ wordBreak: "break-all" }}>{primary.email}</Typography>
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" gap={0.5} alignItems="center">
                                  <Typography variant="caption" color="text.secondary">Score {formatPercent(primary.score_total)}</Typography>
                                  <Typography variant="caption" color="text.secondary">·</Typography>
                                  <Typography variant="caption" color="text.secondary">{primary.kind === "sourced" ? "Sourced" : "Guessed"}</Typography>
                                  {primary.pattern && (
                                    <>
                                      <Typography variant="caption" color="text.secondary">·</Typography>
                                      <Typography variant="caption" color="text.secondary">{primary.pattern}</Typography>
                                    </>
                                  )}
                                </Stack>
                                {contact.linkedin && (
                                  <Box
                                    component="a"
                                    href={contact.linkedin}
                                    target="_blank"
                                    rel="noreferrer"
                                    sx={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 0.5,
                                      color: "info.main",
                                      textDecoration: "none",
                                      fontSize: 12,
                                      "&:hover": { color: "info.light" },
                                    }}
                                  >
                                    <Link2Icon sx={{ fontSize: 14 }} />
                                    Abrir perfil
                                  </Box>
                                )}
                                {contact.emails.length > 1 && (
                                  <Stack direction="row" flexWrap="wrap" gap={0.75} pt={0.5}>
                                    {contact.emails.slice(1, 4).map((email) => (
                                      <Chip
                                        key={email.email}
                                        label={email.email}
                                        size="small"
                                        variant="outlined"
                                        sx={{ borderColor: "divider", color: "text.secondary", borderRadius: "8px" }}
                                      />
                                    ))}
                                  </Stack>
                                )}
                              </Stack>
                            ) : (
                              <Typography variant="body2" color="text.secondary">Sem email resolvido para esse contato.</Typography>
                            )}
                          </Box>
                        );
                      })
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Card sx={(t) => dashedPlaceholderCardSx(t)}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "center" }} gap={2}>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>Modulo Hunter-style ainda nao resolvido para este CNPJ.</Typography>
                    <Typography variant="body2" color="text.secondary" mt={0.5}>
                      O Hermes ja tem a empresa carregada. Falta resolver dominio, pattern corporativo e decisores por email.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={() => void handleResolverContatos()}
                    disabled={isResolvingContacts}
                    startIcon={isResolvingContacts ? <CircularProgress size={16} color="inherit" /> : <ShieldCheckIcon />}
                    sx={{
                      whiteSpace: "nowrap",
                      ...semanticAccentHex("#9333EA"),
                      "&:hover": { bgcolor: alpha("#9333EA", 0.18) },
                    }}
                  >
                    Resolver Contact Intelligence
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Mobile Waterfall */}
          {mobileWaterfall ? (
            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "center" }} gap={2} mb={2}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                      <PhoneIcon sx={{ fontSize: 16, color: "success.main" }} />
                      <Typography variant="subtitle1" fontWeight={600}>Mobile Waterfall</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Camada Apollo-style para priorizar mobiles e WhatsApps acionaveis por empresa.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={() => void handleResolverMobile(true)}
                    disabled={isResolvingMobile}
                    startIcon={isResolvingMobile ? <CircularProgress size={16} color="inherit" /> : <RefreshCwIcon />}
                    sx={{
                      whiteSpace: "nowrap",
                      ...semanticAccent(theme, "success"),
                      "&:hover": { bgcolor: alpha(theme.palette.success.main, 0.18) },
                    }}
                  >
                    Revalidar mobiles
                  </Button>
                </Stack>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, mb: 2 }}>
                  {[
                    { label: "Mobiles", value: String(mobileWaterfall.summary.mobile_candidates ?? 0) },
                    { label: "WhatsApps validados", value: String(mobileWaterfall.summary.verified_whatsapp_candidates ?? 0) },
                    { label: "Mobiles de decisor", value: String(mobileWaterfall.summary.decision_maker_mobile_candidates ?? 0) },
                    { label: "Primario", value: mobileWaterfall.summary.primary_phone || "Nao definido" },
                  ].map((item) => (
                    <Box key={item.label} sx={(t) => softInsetBox(t)}>
                      <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block" }}>
                        {item.label}
                      </Typography>
                      <Typography variant="body2" fontWeight={500} mt={1} sx={{ wordBreak: "break-all" }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
                {(mobileWaterfall.candidates ?? []).length === 0 ? (
                  <Box sx={(t) => dashedEmptyState(t)}>
                    <Typography variant="body2" color="text.secondary">Nenhum mobile foi priorizado ainda para este CNPJ.</Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { lg: "repeat(2,1fr)" } }}>
                    {mobileWaterfall.candidates.slice(0, 6).map((candidate) => (
                      <Box key={`${candidate.normalized_phone}-${candidate.contact_name || "company"}`} sx={(t) => softInsetBox(t, 2)}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} mb={1.5}>
                          <Box>
                            <Typography variant="body2" fontWeight={600}>{candidate.normalized_phone}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {candidate.contact_name || empresa?.razao_social || "Empresa"}
                              {candidate.contact_role ? ` · ${candidate.contact_role}` : ""}
                            </Typography>
                          </Box>
                          {candidate.is_primary && (
                            <Chip label="Primario" size="small" sx={semanticAccent(theme, "info")} />
                          )}
                        </Stack>
                        <Stack direction="row" flexWrap="wrap" gap={0.75}>
                          <Chip label={phoneTypeLabel(candidate.phone_type)} size="small" variant="outlined" sx={{ borderColor: "divider", color: "text.secondary", borderRadius: "8px" }} />
                          {candidate.verified_whatsapp && (
                            <Chip icon={<BadgeCheckIcon sx={{ fontSize: 12 }} />} label="WhatsApp validado" size="small" sx={semanticAccent(theme, "success")} />
                          )}
                          {!candidate.verified_whatsapp && candidate.likely_whatsapp && (
                            <Chip label="WhatsApp provavel" size="small" sx={semanticAccent(theme, "warning")} />
                          )}
                          {candidate.contact_level === "decision_maker" && (
                            <Chip label="Decisor" size="small" sx={semanticAccentHex("#9333EA")} />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" mt={1} display="block">
                          Fonte: {candidate.source_label || "Nao informada"}
                          {candidate.validation_source && ` · Validacao: ${candidate.validation_source}`}
                          {candidate.score_total != null && ` · Score ${formatPercent(candidate.score_total)}`}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          ) : (
            empresa && (
              <Card sx={(t) => dashedPlaceholderCardSx(t)}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "center" }} gap={2}>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Apollo-style mobile waterfall ainda nao resolvido para este CNPJ.</Typography>
                      <Typography variant="body2" color="text.secondary" mt={0.5}>
                        O Hermes ja tem telefones e socios. Falta priorizar mobile, validar WhatsApp e destacar o melhor canal.
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      onClick={() => void handleResolverMobile(true)}
                      disabled={isResolvingMobile}
                      startIcon={isResolvingMobile ? <CircularProgress size={16} color="inherit" /> : <PhoneIcon />}
                      sx={{
                        whiteSpace: "nowrap",
                        ...semanticAccent(theme, "success"),
                        "&:hover": { bgcolor: alpha(theme.palette.success.main, 0.18) },
                      }}
                    >
                      Resolver mobiles e WhatsApp
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )
          )}
        </>
      )}
    </Box>
  );
};

export default EnriquecerCnpj;
