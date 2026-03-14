import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookmarkPlus,
  Copy,
  FileJson,
  Filter,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <TerminalSquare className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-2xl font-display tracking-tight">Workbench de Query</h2>
            <p className="text-sm text-muted-foreground">
              Monte a query do Hermes de forma tecnica, veja o payload exato e rode a prospeccao com progresso em tempo real.
            </p>
          </div>
        </div>
      </div>

      <Card className="border-border bg-card shadow-surface-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Tradutor de Query
          </CardTitle>
          <CardDescription>
            Escreva como pensaria a busca e o Hermes converte para os filtros reais da prospeccao.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Ex.: administradoras de condominios em MG com whatsapp valido, capital acima de 500 mil, 80 leads"
            className="min-h-[104px] border-border bg-muted/20"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-cyan-500 text-muted-foreground hover:bg-cyan-400"
              onClick={() => void handleTranslateQuery()}
              disabled={translatingPrompt}
            >
              {translatingPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Aplicar query IA
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-border bg-muted/20"
              onClick={() => setAiPrompt("administradoras de condominios em MG com whatsapp valido, capital acima de 500 mil, 80 leads")}
            >
              Exemplo B2B
            </Button>
          </div>

          {translationResult && (
            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                  {translationResult.source === "hybrid" ? "IA + heuristica" : "Heuristica"}
                </Badge>
                {translationResult.highlights.map((item) => (
                  <Badge key={item} variant="outline" className="border-border bg-muted/20 text-foreground/80">
                    {item}
                  </Badge>
                ))}
              </div>
              {translationResult.warnings.length > 0 && (
                <div className="space-y-1 text-xs text-amber-200">
                  {translationResult.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4 text-amber-300" />
              Montagem da Query
            </CardTitle>
            <CardDescription>
              Use virgula ou quebra de linha para listas. O preview ao lado mostra exatamente o que sera enviado para a API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  className="border-border bg-muted/20"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="termo">Termo base</Label>
                <Input
                  id="termo"
                  value={termoBase}
                  onChange={(e) => setTermoBase(e.target.value)}
                  className="border-border bg-muted/20"
                  placeholder="clinicas, hospitais, supermercados..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="limite">Limite de empresas</Label>
                <Input
                  id="limite"
                  value={limiteEmpresas}
                  onChange={(e) => setLimiteEmpresas(e.target.value.replace(/\D/g, ""))}
                  className="border-border bg-muted/20"
                  placeholder="50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cidades">Cidades</Label>
                <Textarea
                  id="cidades"
                  value={cidadesInput}
                  onChange={(e) => setCidadesInput(e.target.value)}
                  className="min-h-24 border-border bg-muted/20"
                  placeholder="Belo Horizonte, Contagem"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ufs">UFs</Label>
                <Textarea
                  id="ufs"
                  value={ufsInput}
                  onChange={(e) => setUfsInput(e.target.value)}
                  className="min-h-24 border-border bg-muted/20"
                  placeholder="MG, SP"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segmentos">Segmentos</Label>
                <Textarea
                  id="segmentos"
                  value={segmentosInput}
                  onChange={(e) => setSegmentosInput(e.target.value)}
                  className="min-h-24 border-border bg-muted/20"
                  placeholder="Clinicas, Hospitais, Industria"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portes">Portes</Label>
                <Textarea
                  id="portes"
                  value={portesInput}
                  onChange={(e) => setPortesInput(e.target.value)}
                  className="min-h-24 border-border bg-muted/20"
                  placeholder="ME, EPP, Medio/Grande"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnaes">CNAEs</Label>
                <Textarea
                  id="cnaes"
                  value={cnaesInput}
                  onChange={(e) => setCnaesInput(e.target.value)}
                  className="min-h-24 border-border bg-muted/20"
                  placeholder="8640201, 8610101"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="capitalMin">Capital minimo</Label>
                  <Input
                    id="capitalMin"
                    value={capitalMinimo}
                    onChange={(e) => setCapitalMinimo(e.target.value.replace(/[^\d]/g, ""))}
                    className="border-border bg-muted/20"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capitalMax">Capital maximo</Label>
                  <Input
                    id="capitalMax"
                    value={capitalMaximo}
                    onChange={(e) => setCapitalMaximo(e.target.value.replace(/[^\d]/g, ""))}
                    className="border-border bg-muted/20"
                    placeholder="2000000"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Enriquecimento web</p>
                  <p className="text-xs text-muted-foreground/70">Liga busca externa e enriquecimento.</p>
                </div>
                <Switch checked={enriquecimentoWeb} onCheckedChange={setEnriquecimentoWeb} />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Exigir contato</p>
                  <p className="text-xs text-muted-foreground/70">Filtra para leads acionaveis.</p>
                </div>
                <Switch checked={exigirContato} onCheckedChange={setExigirContato} />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Priorizar contato</p>
                  <p className="text-xs text-muted-foreground/70">Ordena quem ja tem canal acionavel.</p>
                </div>
                <Switch checked={priorizarContato} onCheckedChange={setPriorizarContato} />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileJson className="h-4 w-4 text-cyan-300" />
              Preview do Payload
            </CardTitle>
            <CardDescription>
              Esse JSON e o contrato real enviado para o Hermes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-border text-foreground/80">
                {payload.cidades?.length ?? 0} cidade(s)
              </Badge>
              <Badge variant="outline" className="border-border text-foreground/80">
                {payload.segmentos.length} segmento(s)
              </Badge>
              <Badge variant="outline" className="border-border text-foreground/80">
                {payload.cnaes?.length ?? 0} CNAE(s)
              </Badge>
            </div>

            <pre className="max-h-[28rem] overflow-auto rounded-2xl border border-border bg-muted/20/80 p-4 text-xs leading-6 text-foreground/80">
              {JSON.stringify(payload, null, 2)}
            </pre>

            <div className="grid gap-3 md:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="border-border bg-muted/20"
                onClick={() => void handleCopy()}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar JSON
              </Button>
              <div className="grid gap-3">
                <Button
                  type="button"
                  className="bg-amber-500 text-muted-foreground hover:bg-amber-400"
                  onClick={() => void handleRun()}
                  disabled={isRunning}
                >
                  {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Rodar query
                </Button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-border bg-muted/20"
                    onClick={() => openSaveDialog("search")}
                  >
                    <BookmarkPlus className="mr-2 h-4 w-4" />
                    Salvar busca
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                    onClick={() => openSaveDialog("dynamic")}
                  >
                    <BookmarkPlus className="mr-2 h-4 w-4" />
                    Lista dinamica
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Execucao</p>
                  <p className="text-xs text-muted-foreground/70">
                    {progress?.detail || "Pronto para disparar a prospeccao."}
                  </p>
                </div>
                <Sparkles className="h-4 w-4 text-amber-300" />
              </div>
              <Progress value={isRunning ? progressPct : ultimoResultado ? 100 : 0} />
              {ultimoResultado && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-card/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Empresas</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{ultimoResultado.total_empresas}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Enriquecidas</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {ultimoResultado.enriquecimento_web.total_com_enriquecimento}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Taxa</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {Math.round(ultimoResultado.enriquecimento_web.porcentagem_enriquecida)}%
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between border-border bg-card text-foreground shadow-surface-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() => navigate("/results")}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ArrowRight className="h-4 w-4" />
                      Abrir resultados
                    </span>
                    <span className="text-xs uppercase tracking-[0.18em]">latest run</span>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card shadow-surface-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookmarkPlus className="h-4 w-4 text-cyan-300" />
                Buscas salvas e listas dinamicas
              </CardTitle>
              <CardDescription>
                Reaproveite queries, rode previews de lista dinamica e carregue filtros prontos no Workbench.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-border bg-muted/20"
              onClick={() => void reloadSavedSearches()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingSavedSearches ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando buscas salvas...
            </div>
          ) : savedSearches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
              Nenhuma busca salva ainda. Monte uma query acima e salve como busca ou lista dinamica.
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {savedSearches.map((search) => (
                <div
                  key={search.id}
                  className="rounded-2xl border border-border bg-muted/20/50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{search.name}</p>
                        <Badge
                          variant="outline"
                          className={
                            search.kind === "dynamic"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                          }
                        >
                          {search.kind === "dynamic" ? "dinamica" : "salva"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground/70">
                        {search.description || "Sem descricao"} . Ultima execucao: {formatDate(search.last_run_at)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground/70 hover:text-rose-300"
                      onClick={() => void handleDeleteSavedSearch(search.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      {(search.config.ufs ?? []).length || (search.config.uf ? 1 : 0)} UF(s)
                    </Badge>
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      {(search.config.cnaes ?? []).length} CNAE(s)
                    </Badge>
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      limite {search.config.limite_empresas}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-border bg-muted/20"
                      onClick={() => {
                        hydrateForm(search.config);
                        toast.success("Busca carregada no Workbench.");
                      }}
                    >
                      Carregar filtros
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-border bg-card text-foreground shadow-surface-xs hover:bg-accent hover:text-accent-foreground"
                      onClick={() => void handleRunSavedSearch(search)}
                      disabled={runningSavedSearchId === search.id}
                    >
                      {runningSavedSearchId === search.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Abrir no Results
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>
              {saveKind === "dynamic" ? "Salvar lista dinamica" : "Salvar busca"}
            </DialogTitle>
            <DialogDescription>
              O payload atual sera persistido e podera ser reexecutado sem remontar a query.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="save-name">Nome</Label>
              <Input
                id="save-name"
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                className="border-border bg-muted/20"
                placeholder="Administradoras MG com contato"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="save-description">Descricao</Label>
              <Textarea
                id="save-description"
                value={saveDescription}
                onChange={(event) => setSaveDescription(event.target.value)}
                className="min-h-24 border-border bg-muted/20"
                placeholder="Filtro pronto para campanhas e reruns."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-border bg-muted/20"
              onClick={() => setSaveDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-amber-500 text-muted-foreground hover:bg-amber-400"
              onClick={() => void handleSaveSearch()}
              disabled={savingSearch}
            >
              {savingSearch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookmarkPlus className="mr-2 h-4 w-4" />}
              Salvar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QueryWorkbench;
