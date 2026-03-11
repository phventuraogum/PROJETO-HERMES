import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  Building2,
  Globe,
  Loader2,
  Mail,
  Phone,
  Search,
  Sparkles,
  Target,
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
  buscarEmpresaPorCnpj,
  enriquecerEmpresaPorCnpj,
  normalizeCnpj,
  salvarResultadoEnriquecimentoCnpj,
  type Empresa,
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
  const [cnpjInput, setCnpjInput] = useState("");
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [isSendingPipeline, setIsSendingPipeline] = useState(false);

  const cnpjDigits = useMemo(() => normalizeCnpj(cnpjInput), [cnpjInput]);
  const temEnriquecimento = Boolean(
    empresa?.site ||
    empresa?.email_enriquecido ||
    empresa?.telefone_enriquecido ||
    empresa?.whatsapp_enriquecido,
  );

  const handleBuscar = async () => {
    if (cnpjDigits.length !== 14) {
      toast.error("Informe um CNPJ valido com 14 digitos.");
      return;
    }

    try {
      setIsFetching(true);
      const encontrada = await buscarEmpresaPorCnpj(cnpjDigits);
      setEmpresa(encontrada);
      toast.success("Empresa localizada.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel buscar a empresa.");
    } finally {
      setIsFetching(false);
    }
  };

  const handleEnriquecer = async () => {
    if (cnpjDigits.length !== 14) {
      toast.error("Informe um CNPJ valido com 14 digitos.");
      return;
    }

    try {
      setIsEnriching(true);
      const { empresa: enriquecida } = await enriquecerEmpresaPorCnpj(cnpjDigits, empresa);
      setEmpresa(enriquecida);
      toast.success("Enriquecimento concluido.");
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

  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
            <Search className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Enriquecer por CNPJ</h2>
            <p className="text-sm text-muted-foreground">
              Consulte uma empresa especifica e rode o enriquecimento completo sem passar pelo fluxo de ICP.
            </p>
          </div>
        </div>
      </div>

      <Card className="border-zinc-800 bg-zinc-950/60">
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
                className="h-11 border-zinc-700 bg-zinc-900 text-base"
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
              className="h-11 border-zinc-700 bg-zinc-900"
              onClick={() => void handleBuscar()}
              disabled={isFetching || isEnriching}
            >
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar empresa
            </Button>
            <Button
              type="button"
              className="h-11 bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
              onClick={() => void handleEnriquecer()}
              disabled={isFetching || isEnriching}
            >
              {isEnriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Enriquecer agora
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              Busca direta por CNPJ
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              Resultado unitario
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              Compatível com Results e Pipeline
            </Badge>
          </div>
        </CardContent>
      </Card>

      {empresa && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card className="border-zinc-800 bg-zinc-950/60">
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
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Situacao</p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">{empresa.situacao_cadastral || "Nao informada"}</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Capital social</p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">{formatCapital(empresa.capital_social)}</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">CNAE principal</p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">{empresa.cnae_principal || "Nao informado"}</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Atualizacao</p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">
                      {empresa.enriquecimento_data ? new Date(empresa.enriquecimento_data).toLocaleString("pt-BR") : "Em tempo real"}
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card className="border-zinc-800 bg-zinc-950/60">
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
                  className="w-full justify-between bg-white text-zinc-950 hover:bg-zinc-200"
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
                  className="w-full justify-between border-zinc-700 bg-zinc-900"
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
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Site",
                value: empresa.site || "Nao encontrado",
                icon: Globe,
                tone: empresa.site ? "text-cyan-300" : "text-zinc-500",
              },
              {
                label: "Email final",
                value: empresa.email_final || empresa.email || "Nao encontrado",
                icon: Mail,
                tone: empresa.email_final || empresa.email ? "text-sky-300" : "text-zinc-500",
              },
              {
                label: "Telefone final",
                value: empresa.telefone_final || empresa.telefone_padrao || "Nao encontrado",
                icon: Phone,
                tone: empresa.telefone_final || empresa.telefone_padrao ? "text-zinc-100" : "text-zinc-500",
              },
              {
                label: "WhatsApp final",
                value: empresa.whatsapp_final || empresa.whatsapp_publico || "Nao encontrado",
                icon: Building2,
                tone: empresa.whatsapp_final || empresa.whatsapp_publico ? "text-emerald-300" : "text-zinc-500",
              },
            ].map((item) => (
              <Card key={item.label} className="border-zinc-800 bg-zinc-950/60">
                <CardContent className="flex h-full items-start gap-3 p-4">
                  <div className="mt-0.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2">
                    <item.icon className={cn("h-4 w-4", item.tone)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{item.label}</p>
                    <p className={cn("mt-2 break-words text-sm font-medium", item.tone)}>{item.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Card className="border-zinc-800 bg-zinc-950/60">
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
                <Separator className="bg-zinc-800" />
                <p className="text-sm leading-7 text-zinc-300">
                  {empresa.resumo_ia_empresa ||
                    "Sem resumo de IA ainda. Rode o enriquecimento para puxar o maximo de contexto comercial disponivel para esse CNPJ."}
                </p>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-950/60">
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
        </>
      )}
    </div>
  );
};

export default EnriquecerCnpj;
