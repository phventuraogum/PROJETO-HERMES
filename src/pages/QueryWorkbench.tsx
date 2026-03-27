import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import TerminalSquareIcon from "@mui/icons-material/Terminal";
import SparklesIcon from "@mui/icons-material/AutoAwesome";
import FilterIcon from "@mui/icons-material/FilterAlt";
import FileJsonIcon from "@mui/icons-material/DataObject";
import BookmarkPlusIcon from "@mui/icons-material/BookmarkAdd";
import CopyIcon from "@mui/icons-material/ContentCopy";
import PlayIcon from "@mui/icons-material/PlayArrow";
import RefreshCwIcon from "@mui/icons-material/Refresh";
import ArrowRightIcon from "@mui/icons-material/ArrowForward";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Switch from "@mui/material/Switch";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";

import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  previewSavedSearch,
  runProspeccaoStream,
  salvarResultadoManual,
  traduzirQueryEmFiltros,
  type ProgressEvent,
  type ProspeccaoConfig,
  type ProspeccaoResultado,
  type QueryTranslationResult,
  type SavedSearchSummary,
} from "@/lib/api";

type QueryPreset = {
  label: string;
  termo_base: string;
  cidades: string[];
  ufs: string[];
  segmentos: string[];
  portes: string[];
  limite_empresas: number;
};

const PRESETS: QueryPreset[] = [
  {
    label: "Saude MG",
    termo_base: "clinicas medicas",
    cidades: ["Belo Horizonte"],
    ufs: ["MG"],
    segmentos: ["Clinicas", "Hospitais"],
    portes: ["EPP", "Medio/Grande"],
    limite_empresas: 30,
  },
  {
    label: "Industria SP",
    termo_base: "industria",
    cidades: ["Sao Paulo"],
    ufs: ["SP"],
    segmentos: ["Industria"],
    portes: ["Medio/Grande"],
    limite_empresas: 40,
  },
  {
    label: "Logistica Sul",
    termo_base: "transportadora",
    cidades: ["Curitiba", "Joinville"],
    ufs: ["PR", "SC"],
    segmentos: ["Logistica"],
    portes: ["EPP", "Medio/Grande"],
    limite_empresas: 35,
  },
];

function parseList(value: string): string[] {
  return value
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value?: string | null): string {
  if (!value) return "Nunca";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

const STAT_BOX_SX = {
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.07)",
  bgcolor: "rgba(24,24,24,0.7)",
  p: 1.5,
};

const QueryWorkbench = () => {
  const navigate = useNavigate();

  const [termoBase, setTermoBase] = useState("");
  const [cidadesInput, setCidadesInput] = useState("");
  const [ufsInput, setUfsInput] = useState("MG");
  const [portesInput, setPortesInput] = useState("ME,EPP,Medio/Grande");
  const [segmentosInput, setSegmentosInput] = useState("");
  const [cnaesInput, setCnaesInput] = useState("");
  const [capitalMinimo, setCapitalMinimo] = useState("0");
  const [capitalMaximo, setCapitalMaximo] = useState("");
  const [limiteEmpresas, setLimiteEmpresas] = useState("50");
  const [enriquecimentoWeb, setEnriquecimentoWeb] = useState(true);
  const [exigirContato, setExigirContato] = useState(false);
  const [priorizarContato, setPriorizarContato] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<ProspeccaoResultado | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearchSummary[]>([]);
  const [loadingSavedSearches, setLoadingSavedSearches] = useState(true);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveKind, setSaveKind] = useState<"search" | "dynamic">("search");
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);
  const [runningSavedSearchId, setRunningSavedSearchId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [translatingPrompt, setTranslatingPrompt] = useState(false);
  const [translationResult, setTranslationResult] = useState<QueryTranslationResult | null>(null);

  const payload = useMemo<ProspeccaoConfig>(() => {
    const cidades = parseList(cidadesInput);
    const ufs = parseList(ufsInput).map((item) => item.toUpperCase());
    const portes = parseList(portesInput);
    const segmentos = parseList(segmentosInput);
    const cnaes = parseList(cnaesInput).map((item) => item.replace(/\D/g, ""));

    return {
      termo_base: termoBase.trim(),
      cidade: cidades[0] ?? "",
      uf: ufs[0] ?? "",
      cidades,
      ufs,
      capital_minimo: Number(capitalMinimo || 0),
      capital_maximo: capitalMaximo ? Number(capitalMaximo) : null,
      limite_empresas: Number(limiteEmpresas || 50),
      portes,
      segmentos,
      cnaes,
      incluir_cnae_secundario: false,
      enriquecimento_web: enriquecimentoWeb,
      exigir_contato_acionavel: exigirContato,
      priorizar_com_contato: priorizarContato,
      excluir_cnpjs: [],
      idade_minima_anos: null,
      idade_maxima_anos: null,
    };
  }, [
    capitalMaximo,
    capitalMinimo,
    cidadesInput,
    cnaesInput,
    enriquecimentoWeb,
    exigirContato,
    limiteEmpresas,
    portesInput,
    priorizarContato,
    segmentosInput,
    termoBase,
    ufsInput,
  ]);

  const progressPct = useMemo(() => {
    if (!progress || !progress.total) return 12;
    return Math.min(100, Math.round((progress.current / progress.total) * 100));
  }, [progress]);

  const hydrateForm = (config: ProspeccaoConfig) => {
    setTermoBase(config.termo_base ?? "");
    setCidadesInput((config.cidades ?? (config.cidade ? [config.cidade] : [])).join(", "));
    setUfsInput((config.ufs ?? (config.uf ? [config.uf] : [])).join(", "));
    setPortesInput((config.portes ?? []).join(", "));
    setSegmentosInput((config.segmentos ?? []).join(", "));
    setCnaesInput((config.cnaes ?? []).join(", "));
    setCapitalMinimo(String(config.capital_minimo ?? 0));
    setCapitalMaximo(config.capital_maximo != null ? String(config.capital_maximo) : "");
    setLimiteEmpresas(String(config.limite_empresas ?? 50));
    setEnriquecimentoWeb(config.enriquecimento_web ?? true);
    setExigirContato(config.exigir_contato_acionavel ?? false);
    setPriorizarContato(config.priorizar_com_contato ?? true);
  };

  const reloadSavedSearches = async () => {
    try {
      setLoadingSavedSearches(true);
      setSavedSearches(await getSavedSearches());
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel carregar as buscas salvas.");
    } finally {
      setLoadingSavedSearches(false);
    }
  };

  useEffect(() => {
    void reloadSavedSearches();
  }, []);

  const applyPreset = (preset: QueryPreset) => {
    setTermoBase(preset.termo_base);
    setCidadesInput(preset.cidades.join(", "));
    setUfsInput(preset.ufs.join(", "));
    setSegmentosInput(preset.segmentos.join(", "));
    setPortesInput(preset.portes.join(", "));
    setLimiteEmpresas(String(preset.limite_empresas));
    toast.success(`Preset ${preset.label} aplicado.`);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success("Payload copiado.");
    } catch {
      toast.error("Nao foi possivel copiar o payload.");
    }
  };

  const handleTranslateQuery = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      toast.info("Descreva a prospeccao em texto livre.");
      return;
    }

    try {
      setTranslatingPrompt(true);
      const translated = await traduzirQueryEmFiltros(prompt, payload);
      hydrateForm(translated.config);
      setTranslationResult(translated);
      toast.success(
        translated.source === "hybrid"
          ? "Query traduzida com IA + heuristica."
          : "Query traduzida e aplicada ao payload.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel traduzir a query.");
    } finally {
      setTranslatingPrompt(false);
    }
  };

  const handleRun = async () => {
    try {
      setIsRunning(true);
      setProgress({ stage: "db_query", current: 0, total: 0, detail: "Inicializando query..." });
      const resultado = await runProspeccaoStream(payload, (evt) => setProgress(evt));
      setUltimoResultado(resultado);
      toast.success(`${resultado.total_empresas} empresas retornadas.`);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao executar a query.");
    } finally {
      setIsRunning(false);
    }
  };

  const openSaveDialog = (kind: "search" | "dynamic") => {
    setSaveKind(kind);
    setSaveName(payload.termo_base ? `${payload.termo_base} ${kind === "dynamic" ? "dinamica" : "salva"}` : "");
    setSaveDescription("");
    setSaveDialogOpen(true);
  };

  const handleSaveSearch = async () => {
    const name = saveName.trim();
    if (!name) {
      toast.info("Informe um nome para a busca salva.");
      return;
    }

    try {
      setSavingSearch(true);
      await createSavedSearch({
        name,
        description: saveDescription.trim() || null,
        config: payload,
        kind: saveKind,
        source: "query_workbench",
      });
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveDescription("");
      await reloadSavedSearches();
      toast.success(saveKind === "dynamic" ? "Lista dinamica salva." : "Busca salva criada.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel salvar a busca.");
    } finally {
      setSavingSearch(false);
    }
  };

  const handleRunSavedSearch = async (search: SavedSearchSummary) => {
    try {
      setRunningSavedSearchId(search.id);
      const resultado = await previewSavedSearch(search.id);
      await salvarResultadoManual(search.config, resultado);
      toast.success(`${resultado.total_empresas} empresas retornadas pela busca salva.`);
      await reloadSavedSearches();
      navigate("/results");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel rodar a busca salva.");
    } finally {
      setRunningSavedSearchId(null);
    }
  };

  const handleDeleteSavedSearch = async (searchId: string) => {
    try {
      await deleteSavedSearch(searchId);
      await reloadSavedSearches();
      toast.success("Busca salva removida.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel remover a busca salva.");
    }
  };

  const SECTION_CARD_SX = {
    border: "1px solid rgba(255,255,255,0.07)",
    bgcolor: "#181818",
    borderRadius: "12px",
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, p: 0.5 }}>
      {/* Page Header */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "16px",
            border: "1px solid rgba(245,158,11,0.3)",
            bgcolor: "rgba(245,158,11,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <TerminalSquareIcon sx={{ fontSize: 20, color: "#fcd34d" }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} letterSpacing="-0.02em">
            Workbench de Query
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Monte a query do Hermes de forma tecnica, veja o payload exato e rode a prospeccao com progresso em tempo real.
          </Typography>
        </Box>
      </Stack>

      {/* AI Translator */}
      <Card sx={SECTION_CARD_SX}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
            <SparklesIcon sx={{ fontSize: 16, color: "#67e8f9" }} />
            <Typography variant="subtitle1" fontWeight={600}>Tradutor de Query</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Escreva como pensaria a busca e o Hermes converte para os filtros reais da prospeccao.
          </Typography>

          <TextField
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Ex.: administradoras de condominios em MG com whatsapp valido, capital acima de 500 mil, 80 leads"
            multiline
            minRows={4}
            fullWidth
            sx={{ mb: 2 }}
          />

          <Stack direction="row" flexWrap="wrap" gap={1.5}>
            <Button
              variant="contained"
              onClick={() => void handleTranslateQuery()}
              disabled={translatingPrompt}
              startIcon={translatingPrompt ? <CircularProgress size={16} color="inherit" /> : <SparklesIcon />}
              sx={{ bgcolor: "#06b6d4", color: "#0F0F0F", fontWeight: 600, "&:hover": { bgcolor: "#22d3ee" } }}
            >
              Aplicar query IA
            </Button>
            <Button
              variant="outlined"
              onClick={() =>
                setAiPrompt(
                  "administradoras de condominios em MG com whatsapp valido, capital acima de 500 mil, 80 leads",
                )
              }
            >
              Exemplo B2B
            </Button>
          </Stack>

          {translationResult && (
            <Box sx={{ mt: 2, borderRadius: "12px", border: "1px solid rgba(255,255,255,0.07)", bgcolor: "rgba(255,255,255,0.03)", p: 2 }}>
              <Stack direction="row" flexWrap="wrap" gap={1} mb={translationResult.warnings.length > 0 ? 1.5 : 0}>
                <Chip
                  label={translationResult.source === "hybrid" ? "IA + heuristica" : "Heuristica"}
                  size="small"
                  sx={{ bgcolor: "rgba(6,182,212,0.1)", color: "#67e8f9", border: "1px solid rgba(6,182,212,0.3)", borderRadius: "8px" }}
                />
                {translationResult.highlights.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    size="small"
                    variant="outlined"
                    sx={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(240,240,240,0.8)", borderRadius: "8px" }}
                  />
                ))}
              </Stack>
              {translationResult.warnings.length > 0 && (
                <Stack spacing={0.25}>
                  {translationResult.warnings.map((warning) => (
                    <Typography key={warning} variant="caption" sx={{ color: "#fde68a" }}>{warning}</Typography>
                  ))}
                </Stack>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Query Builder + Payload Preview */}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xl: "1.2fr 0.8fr" } }}>
        {/* Query Builder */}
        <Card sx={SECTION_CARD_SX}>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
              <FilterIcon sx={{ fontSize: 16, color: "#fcd34d" }} />
              <Typography variant="subtitle1" fontWeight={600}>Montagem da Query</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Use virgula ou quebra de linha para listas. O preview ao lado mostra exatamente o que sera enviado para a API.
            </Typography>

            {/* Presets */}
            <Stack direction="row" flexWrap="wrap" gap={1} mb={2.5}>
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outlined"
                  size="small"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </Stack>

            {/* Form Grid */}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { md: "repeat(2,1fr)" } }}>
              <TextField
                label="Termo base"
                value={termoBase}
                onChange={(e) => setTermoBase(e.target.value)}
                placeholder="clinicas, hospitais, supermercados..."
                fullWidth
                size="small"
              />
              <TextField
                label="Limite de empresas"
                value={limiteEmpresas}
                onChange={(e) => setLimiteEmpresas(e.target.value.replace(/\D/g, ""))}
                placeholder="50"
                fullWidth
                size="small"
              />
              <TextField
                label="Cidades"
                value={cidadesInput}
                onChange={(e) => setCidadesInput(e.target.value)}
                placeholder="Belo Horizonte, Contagem"
                multiline
                minRows={3}
                fullWidth
                size="small"
              />
              <TextField
                label="UFs"
                value={ufsInput}
                onChange={(e) => setUfsInput(e.target.value)}
                placeholder="MG, SP"
                multiline
                minRows={3}
                fullWidth
                size="small"
              />
              <TextField
                label="Segmentos"
                value={segmentosInput}
                onChange={(e) => setSegmentosInput(e.target.value)}
                placeholder="Clinicas, Hospitais, Industria"
                multiline
                minRows={3}
                fullWidth
                size="small"
              />
              <TextField
                label="Portes"
                value={portesInput}
                onChange={(e) => setPortesInput(e.target.value)}
                placeholder="ME, EPP, Medio/Grande"
                multiline
                minRows={3}
                fullWidth
                size="small"
              />
              <TextField
                label="CNAEs"
                value={cnaesInput}
                onChange={(e) => setCnaesInput(e.target.value)}
                placeholder="8640201, 8610101"
                multiline
                minRows={3}
                fullWidth
                size="small"
              />
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                <TextField
                  label="Capital minimo"
                  value={capitalMinimo}
                  onChange={(e) => setCapitalMinimo(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Capital maximo"
                  value={capitalMaximo}
                  onChange={(e) => setCapitalMaximo(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="2000000"
                  fullWidth
                  size="small"
                />
              </Box>
            </Box>

            {/* Toggle switches */}
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { md: "repeat(3,1fr)" }, mt: 2.5 }}>
              {[
                {
                  label: "Enriquecimento web",
                  sub: "Liga busca externa e enriquecimento.",
                  checked: enriquecimentoWeb,
                  onChange: setEnriquecimentoWeb,
                },
                {
                  label: "Exigir contato",
                  sub: "Filtra para leads acionaveis.",
                  checked: exigirContato,
                  onChange: setExigirContato,
                },
                {
                  label: "Priorizar contato",
                  sub: "Ordena quem ja tem canal acionavel.",
                  checked: priorizarContato,
                  onChange: setPriorizarContato,
                },
              ].map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    bgcolor: "rgba(255,255,255,0.03)",
                    px: 2,
                    py: 1.5,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={500}>{item.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.sub}</Typography>
                  </Box>
                  <Switch
                    checked={item.checked}
                    onChange={(e) => item.onChange(e.target.checked)}
                    size="small"
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": { color: "#F97316" },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "#F97316" },
                    }}
                  />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>

        {/* Payload Preview */}
        <Card sx={SECTION_CARD_SX}>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
              <FileJsonIcon sx={{ fontSize: 16, color: "#67e8f9" }} />
              <Typography variant="subtitle1" fontWeight={600}>Preview do Payload</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Esse JSON e o contrato real enviado para o Hermes.
            </Typography>

            <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
              {[
                `${payload.cidades?.length ?? 0} cidade(s)`,
                `${payload.segmentos.length} segmento(s)`,
                `${payload.cnaes?.length ?? 0} CNAE(s)`,
              ].map((label) => (
                <Chip
                  key={label}
                  label={label}
                  variant="outlined"
                  size="small"
                  sx={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(240,240,240,0.8)", borderRadius: "8px" }}
                />
              ))}
            </Stack>

            <Box
              component="pre"
              sx={{
                maxHeight: "28rem",
                overflow: "auto",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.07)",
                bgcolor: "rgba(255,255,255,0.02)",
                p: 2,
                fontSize: 12,
                lineHeight: 1.6,
                color: "rgba(240,240,240,0.8)",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                mb: 2,
              }}
            >
              {JSON.stringify(payload, null, 2)}
            </Box>

            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { md: "1fr 1fr" } }}>
              <Button
                variant="outlined"
                onClick={() => void handleCopy()}
                startIcon={<CopyIcon />}
              >
                Copiar JSON
              </Button>
              <Stack spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={() => void handleRun()}
                  disabled={isRunning}
                  startIcon={isRunning ? <CircularProgress size={16} color="inherit" /> : <PlayIcon />}
                  sx={{ bgcolor: "#F97316", color: "#0F0F0F", fontWeight: 600, "&:hover": { bgcolor: "#fb923c" } }}
                >
                  Rodar query
                </Button>
                <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => openSaveDialog("search")}
                    startIcon={<BookmarkPlusIcon />}
                  >
                    Salvar busca
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => openSaveDialog("dynamic")}
                    startIcon={<BookmarkPlusIcon />}
                    sx={{
                      borderColor: "rgba(16,185,129,0.3)",
                      bgcolor: "rgba(16,185,129,0.1)",
                      color: "#bbf7d0",
                      "&:hover": { bgcolor: "rgba(16,185,129,0.15)" },
                    }}
                  >
                    Lista dinamica
                  </Button>
                </Box>
              </Stack>
            </Box>

            {/* Execution status */}
            <Box sx={{ mt: 2.5, borderRadius: "12px", border: "1px solid rgba(255,255,255,0.07)", bgcolor: "rgba(255,255,255,0.03)", p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} mb={1.5}>
                <Box>
                  <Typography variant="body2" fontWeight={500}>Execucao</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {progress?.detail || "Pronto para disparar a prospeccao."}
                  </Typography>
                </Box>
                <SparklesIcon sx={{ fontSize: 16, color: "#fcd34d" }} />
              </Stack>
              <LinearProgress
                variant="determinate"
                value={isRunning ? progressPct : ultimoResultado ? 100 : 0}
                sx={{
                  borderRadius: 4,
                  bgcolor: "rgba(255,255,255,0.07)",
                  "& .MuiLinearProgress-bar": { bgcolor: "#F97316" },
                  mb: ultimoResultado ? 2 : 0,
                }}
              />
              {ultimoResultado && (
                <Stack spacing={1.5} mt={2}>
                  <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(3,1fr)" }}>
                    {[
                      { label: "Empresas", value: ultimoResultado.total_empresas },
                      { label: "Enriquecidas", value: ultimoResultado.enriquecimento_web.total_com_enriquecimento },
                      { label: "Taxa", value: `${Math.round(ultimoResultado.enriquecimento_web.porcentagem_enriquecida)}%` },
                    ].map((item) => (
                      <Box key={item.label} sx={STAT_BOX_SX}>
                        <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(240,240,240,0.35)", display: "block" }}>
                          {item.label}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={700} mt={1}>{item.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => navigate("/results")}
                    startIcon={<ArrowRightIcon />}
                    endIcon={<Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>latest run</Typography>}
                    sx={{ justifyContent: "space-between" }}
                  >
                    Abrir resultados
                  </Button>
                </Stack>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Saved Searches */}
      <Card sx={SECTION_CARD_SX}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "center" }} gap={2} mb={2.5}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                <BookmarkPlusIcon sx={{ fontSize: 16, color: "#67e8f9" }} />
                <Typography variant="subtitle1" fontWeight={600}>Buscas salvas e listas dinamicas</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Reaproveite queries, rode previews de lista dinamica e carregue filtros prontos no Workbench.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              onClick={() => void reloadSavedSearches()}
              startIcon={<RefreshCwIcon />}
              sx={{ whiteSpace: "nowrap" }}
            >
              Atualizar
            </Button>
          </Stack>

          {loadingSavedSearches ? (
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.07)", bgcolor: "rgba(255,255,255,0.03)", p: 2 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">Carregando buscas salvas...</Typography>
            </Stack>
          ) : savedSearches.length === 0 ? (
            <Box sx={{ borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.14)", bgcolor: "rgba(255,255,255,0.02)", p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Nenhuma busca salva ainda. Monte uma query acima e salve como busca ou lista dinamica.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xl: "repeat(2,1fr)" } }}>
              {savedSearches.map((search) => (
                <Box
                  key={search.id}
                  sx={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.07)", bgcolor: "rgba(255,255,255,0.03)", p: 2 }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} mb={1}>
                    <Box>
                      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                        <Typography variant="body2" fontWeight={600}>{search.name}</Typography>
                        <Chip
                          label={search.kind === "dynamic" ? "dinamica" : "salva"}
                          size="small"
                          sx={
                            search.kind === "dynamic"
                              ? { bgcolor: "rgba(16,185,129,0.1)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px" }
                              : { bgcolor: "rgba(6,182,212,0.1)", color: "#67e8f9", border: "1px solid rgba(6,182,212,0.3)", borderRadius: "8px" }
                          }
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {search.description || "Sem descricao"} · Ultima execucao: {formatDate(search.last_run_at)}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      onClick={() => void handleDeleteSavedSearch(search.id)}
                      sx={{ color: "rgba(240,240,240,0.4)", minWidth: "auto", px: 1, "&:hover": { color: "#fca5a5", bgcolor: "rgba(239,68,68,0.1)" } }}
                    >
                      Excluir
                    </Button>
                  </Stack>

                  <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
                    {[
                      `${(search.config.ufs ?? []).length || (search.config.uf ? 1 : 0)} UF(s)`,
                      `${(search.config.cnaes ?? []).length} CNAE(s)`,
                      `limite ${search.config.limite_empresas}`,
                    ].map((label) => (
                      <Chip
                        key={label}
                        label={label}
                        variant="outlined"
                        size="small"
                        sx={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(240,240,240,0.8)", borderRadius: "8px" }}
                      />
                    ))}
                  </Stack>

                  <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { sm: "1fr 1fr" } }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        hydrateForm(search.config);
                        toast.success("Busca carregada no Workbench.");
                      }}
                    >
                      Carregar filtros
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => void handleRunSavedSearch(search)}
                      disabled={runningSavedSearchId === search.id}
                      startIcon={
                        runningSavedSearchId === search.id ? <CircularProgress size={14} color="inherit" /> : <PlayIcon />
                      }
                    >
                      Abrir no Results
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Save Dialog */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: "#181818",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "12px",
            minWidth: { sm: 480 },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {saveKind === "dynamic" ? "Salvar lista dinamica" : "Salvar busca"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={3}>
            O payload atual sera persistido e podera ser reexecutado sem remontar a query.
          </Typography>
          <Stack spacing={2.5}>
            <TextField
              label="Nome"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="Administradoras MG com contato"
              fullWidth
            />
            <TextField
              label="Descricao"
              value={saveDescription}
              onChange={(event) => setSaveDescription(event.target.value)}
              placeholder="Filtro pronto para campanhas e reruns."
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setSaveDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSaveSearch()}
            disabled={savingSearch}
            startIcon={savingSearch ? <CircularProgress size={16} color="inherit" /> : <BookmarkPlusIcon />}
            sx={{ bgcolor: "#F97316", color: "#0F0F0F", fontWeight: 600, "&:hover": { bgcolor: "#fb923c" } }}
          >
            Salvar agora
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QueryWorkbench;
