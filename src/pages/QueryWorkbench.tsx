import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Copy,
  FileJson,
  Filter,
  Loader2,
  Play,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  runProspeccaoStream,
  type ProgressEvent,
  type ProspeccaoConfig,
  type ProspeccaoResultado,
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

  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <TerminalSquare className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Workbench de Query</h2>
            <p className="text-sm text-muted-foreground">
              Monte a query do Hermes de forma tecnica, veja o payload exato e rode a prospeccao com progresso em tempo real.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-zinc-800 bg-zinc-950/60">
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
                  className="border-zinc-700 bg-zinc-900"
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
                  className="border-zinc-700 bg-zinc-900"
                  placeholder="clinicas, hospitais, supermercados..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="limite">Limite de empresas</Label>
                <Input
                  id="limite"
                  value={limiteEmpresas}
                  onChange={(e) => setLimiteEmpresas(e.target.value.replace(/\D/g, ""))}
                  className="border-zinc-700 bg-zinc-900"
                  placeholder="50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cidades">Cidades</Label>
                <Textarea
                  id="cidades"
                  value={cidadesInput}
                  onChange={(e) => setCidadesInput(e.target.value)}
                  className="min-h-24 border-zinc-700 bg-zinc-900"
                  placeholder="Belo Horizonte, Contagem"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ufs">UFs</Label>
                <Textarea
                  id="ufs"
                  value={ufsInput}
                  onChange={(e) => setUfsInput(e.target.value)}
                  className="min-h-24 border-zinc-700 bg-zinc-900"
                  placeholder="MG, SP"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segmentos">Segmentos</Label>
                <Textarea
                  id="segmentos"
                  value={segmentosInput}
                  onChange={(e) => setSegmentosInput(e.target.value)}
                  className="min-h-24 border-zinc-700 bg-zinc-900"
                  placeholder="Clinicas, Hospitais, Industria"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portes">Portes</Label>
                <Textarea
                  id="portes"
                  value={portesInput}
                  onChange={(e) => setPortesInput(e.target.value)}
                  className="min-h-24 border-zinc-700 bg-zinc-900"
                  placeholder="ME, EPP, Medio/Grande"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnaes">CNAEs</Label>
                <Textarea
                  id="cnaes"
                  value={cnaesInput}
                  onChange={(e) => setCnaesInput(e.target.value)}
                  className="min-h-24 border-zinc-700 bg-zinc-900"
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
                    className="border-zinc-700 bg-zinc-900"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capitalMax">Capital maximo</Label>
                  <Input
                    id="capitalMax"
                    value={capitalMaximo}
                    onChange={(e) => setCapitalMaximo(e.target.value.replace(/[^\d]/g, ""))}
                    className="border-zinc-700 bg-zinc-900"
                    placeholder="2000000"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Enriquecimento web</p>
                  <p className="text-xs text-zinc-500">Liga busca externa e enriquecimento.</p>
                </div>
                <Switch checked={enriquecimentoWeb} onCheckedChange={setEnriquecimentoWeb} />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Exigir contato</p>
                  <p className="text-xs text-zinc-500">Filtra para leads acionaveis.</p>
                </div>
                <Switch checked={exigirContato} onCheckedChange={setExigirContato} />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Priorizar contato</p>
                  <p className="text-xs text-zinc-500">Ordena quem ja tem canal acionavel.</p>
                </div>
                <Switch checked={priorizarContato} onCheckedChange={setPriorizarContato} />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/60">
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
              <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                {payload.cidades?.length ?? 0} cidade(s)
              </Badge>
              <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                {payload.segmentos.length} segmento(s)
              </Badge>
              <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                {payload.cnaes?.length ?? 0} CNAE(s)
              </Badge>
            </div>

            <pre className="max-h-[28rem] overflow-auto rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 text-xs leading-6 text-zinc-300">
              {JSON.stringify(payload, null, 2)}
            </pre>

            <div className="grid gap-3 md:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="border-zinc-700 bg-zinc-900"
                onClick={() => void handleCopy()}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar JSON
              </Button>
              <Button
                type="button"
                className="bg-amber-500 text-zinc-950 hover:bg-amber-400"
                onClick={() => void handleRun()}
                disabled={isRunning}
              >
                {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Rodar query
              </Button>
            </div>

            <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Execucao</p>
                  <p className="text-xs text-zinc-500">
                    {progress?.detail || "Pronto para disparar a prospeccao."}
                  </p>
                </div>
                <Sparkles className="h-4 w-4 text-amber-300" />
              </div>
              <Progress value={isRunning ? progressPct : ultimoResultado ? 100 : 0} />
              {ultimoResultado && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Empresas</p>
                      <p className="mt-2 text-lg font-semibold text-zinc-100">{ultimoResultado.total_empresas}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Enriquecidas</p>
                      <p className="mt-2 text-lg font-semibold text-zinc-100">
                        {ultimoResultado.enriquecimento_web.total_com_enriquecimento}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Taxa</p>
                      <p className="mt-2 text-lg font-semibold text-zinc-100">
                        {Math.round(ultimoResultado.enriquecimento_web.porcentagem_enriquecida)}%
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="w-full justify-between bg-white text-zinc-950 hover:bg-zinc-200"
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
    </div>
  );
};

export default QueryWorkbench;
