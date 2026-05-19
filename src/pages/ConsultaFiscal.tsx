import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  consultarFiscalPublicaPorCnpj,
  getFiscalPublicSnapshotMeta,
  importarBaseFiscalPublicaArquivo,
  importarBaseFiscalPublicaCaminhos,
  importarBaseFiscalPublicaTexto,
  normalizeCnpj,
  type FiscalPublicLookup,
  type FiscalPublicRecord,
  type FiscalPublicSnapshot,
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

function formatMoney(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "Nao informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null): string {
  if (!value) return "Nao informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
}

function statusTone(value?: string | null): string {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("irregular")) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }
  if (normalized.includes("susp")) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  if (normalized.includes("garant")) {
    return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  }
  return "border-border bg-muted/20 text-foreground/80";
}

function sourceUrl(record: FiscalPublicRecord): string | null {
  return record.source_url || null;
}

const ConsultaFiscal = () => {
  const navigate = useNavigate();
  const [cnpjInput, setCnpjInput] = useState("");
  const [lookup, setLookup] = useState<FiscalPublicLookup | null>(null);
  const [snapshot, setSnapshot] = useState<FiscalPublicSnapshot | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceLabel, setSourceLabel] = useState("PGFN Dados Abertos");
  const [notes, setNotes] = useState("");
  const [rawText, setRawText] = useState("");
  const [textFilename, setTextFilename] = useState("pgfn-manual.csv");
  const [serverPaths, setServerPaths] = useState("");
  const [serverFilename, setServerFilename] = useState("pgfn-oficial-zip");
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [isImportingText, setIsImportingText] = useState(false);
  const [isImportingPaths, setIsImportingPaths] = useState(false);

  const cnpjDigits = useMemo(() => normalizeCnpj(cnpjInput), [cnpjInput]);

  const loadSnapshotMeta = async () => {
    try {
      setIsLoadingMeta(true);
      const meta = await getFiscalPublicSnapshotMeta();
      setSnapshot(meta);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel carregar o status da base fiscal.");
    } finally {
      setIsLoadingMeta(false);
    }
  };

  useEffect(() => {
    void loadSnapshotMeta();
  }, []);

  const handleLookup = async () => {
    if (cnpjDigits.length !== 14) {
      toast.error("Informe um CNPJ valido com 14 digitos.");
      return;
    }

    try {
      setIsLookingUp(true);
      const result = await consultarFiscalPublicaPorCnpj(cnpjDigits);
      setLookup(result);
      setSnapshot(result.snapshot);

      if (!result.summary.has_snapshot) {
        toast.info("Nenhuma base fiscal foi importada ainda.");
        return;
      }

      if (!result.summary.has_records) {
        toast.info("Esse CNPJ não aparece na última base fiscal importada.");
        return;
      }

      toast.success("Consulta fiscal carregada.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel consultar a base fiscal.");
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleImportFile = async () => {
    if (!selectedFile) {
      toast.error("Selecione um arquivo CSV, TSV ou JSON.");
      return;
    }

    try {
      setIsImportingFile(true);
      const meta = await importarBaseFiscalPublicaArquivo(selectedFile, {
        sourceLabel,
        notes: notes || null,
      });
      setSnapshot(meta);
      toast.success("Base fiscal importada com sucesso.");
      if (cnpjDigits.length === 14) {
        await handleLookup();
      }
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel importar o arquivo.");
    } finally {
      setIsImportingFile(false);
    }
  };

  const handleImportText = async () => {
    if (!rawText.trim()) {
      toast.error("Cole um CSV/JSON para importar.");
      return;
    }

    try {
      setIsImportingText(true);
      const meta = await importarBaseFiscalPublicaTexto(rawText, {
        filename: textFilename || "pgfn-manual.csv",
        sourceLabel,
        notes: notes || null,
      });
      setSnapshot(meta);
      toast.success("Base fiscal textual importada com sucesso.");
      if (cnpjDigits.length === 14) {
        await handleLookup();
      }
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel importar o texto.");
    } finally {
      setIsImportingText(false);
    }
  };

  const handleImportPaths = async () => {
    const paths = serverPaths
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (paths.length === 0) {
      toast.error("Informe um ou mais caminhos do servidor.");
      return;
    }

    try {
      setIsImportingPaths(true);
      const meta = await importarBaseFiscalPublicaCaminhos(paths, {
        filename: serverFilename || "pgfn-oficial-zip",
        sourceLabel,
        notes: notes || null,
      });
      setSnapshot(meta);
      toast.success("Base fiscal do servidor importada com sucesso.");
      if (cnpjDigits.length === 14) {
        await handleLookup();
      }
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel importar os caminhos do servidor.");
    } finally {
      setIsImportingPaths(false);
    }
  };

  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <Scale className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <h1 className="text-2xl font-display tracking-tight">Consulta Fiscal</h1>
            <p className="text-sm text-muted-foreground">
              Consulta publica/manual por CNPJ para expor o maximo de informacao fiscal disponivel sem autorizacao.
            </p>
          </div>
        </div>
      </div>

      <Card className="border-border bg-card shadow-surface-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-4 w-4 text-amber-300" />
            Consulta por CNPJ
          </CardTitle>
          <CardDescription>
            O resultado depende da última base fiscal pública importada. Não consulta áreas restritas do contribuinte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <Input
              value={formatCnpj(cnpjInput)}
              onChange={(e) => setCnpjInput(normalizeCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              className="h-11 border-border bg-muted/20 text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleLookup();
                }
              }}
            />
            <Button
              type="button"
              className="h-11 bg-amber-400 text-muted-foreground hover:bg-amber-300"
              onClick={() => void handleLookup()}
              disabled={isLookingUp}
            >
              {isLookingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Consultar base publica
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 border-border bg-muted/20"
              onClick={() => navigate(`/cnpj?cnpj=${cnpjDigits}`)}
              disabled={cnpjDigits.length !== 14}
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Abrir no Enriquecer
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-border text-foreground/80">
              Sem autorizacao externa
            </Badge>
            <Badge variant="outline" className="border-border text-foreground/80">
              Snapshot público/manual
            </Badge>
            <Badge variant="outline" className="border-border text-foreground/80">
              Nao substitui Regularize ou e-CAC
            </Badge>
          </div>

          <div className="rounded-2xl border border-border bg-muted/20/70 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">Ultima base fiscal</p>
                {isLoadingMeta ? (
                  <p className="mt-2 text-sm text-muted-foreground">Carregando status...</p>
                ) : snapshot ? (
                  <>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {snapshot.source_label || "Base publica manual"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {snapshot.filename || "Arquivo sem nome"} · importado em {formatDate(snapshot.imported_at)}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nenhum snapshot fiscal importado ainda.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-border bg-card"
                onClick={() => void loadSnapshotMeta()}
                disabled={isLoadingMeta}
              >
                {isLoadingMeta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
            </div>

            {snapshot && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Registros</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{snapshot.record_count}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">CNPJs unicos</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{snapshot.unique_cnpjs}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Linhas puladas</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{snapshot.skipped_rows}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-surface-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-4 w-4 text-cyan-300" />
            Importação Manual da Base
          </CardTitle>
          <CardDescription>
            Suba um CSV/TSV/JSON/ZIP público, cole os dados manualmente ou importe arquivos grandes já copiados para a VPS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="space-y-2">
                <Label htmlFor="fiscal-source">Fonte exibida</Label>
                <Input
                  id="fiscal-source"
                  value={sourceLabel}
                  onChange={(e) => setSourceLabel(e.target.value)}
                  className="border-border bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal-notes">Notas</Label>
                <Input
                  id="fiscal-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: recorte público baixado manualmente"
                  className="border-border bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal-file">Arquivo</Label>
                <Input
                  id="fiscal-file"
                  type="file"
                  accept=".csv,.tsv,.txt,.json,.zip"
                  className="border-border bg-card file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:text-foreground"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button
                type="button"
                className="w-full bg-cyan-500 text-muted-foreground hover:bg-cyan-400"
                onClick={() => void handleImportFile()}
                disabled={isImportingFile}
              >
                {isImportingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Importar arquivo
              </Button>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="space-y-2">
                <Label htmlFor="fiscal-filename">Nome do arquivo textual</Label>
                <Input
                  id="fiscal-filename"
                  value={textFilename}
                  onChange={(e) => setTextFilename(e.target.value)}
                  className="border-border bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal-raw">CSV / JSON manual</Label>
                <Textarea
                  id="fiscal-raw"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Cole aqui um CSV com coluna de CNPJ e os campos fiscais públicos."
                  className="min-h-[160px] border-border bg-card"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-border bg-card"
                onClick={() => void handleImportText()}
                disabled={isImportingText}
              >
                {isImportingText ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Importar texto
              </Button>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="space-y-2">
                <Label htmlFor="fiscal-server-name">Nome do snapshot grande</Label>
                <Input
                  id="fiscal-server-name"
                  value={serverFilename}
                  onChange={(e) => setServerFilename(e.target.value)}
                  className="border-border bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal-server-paths">Caminhos no servidor</Label>
                <Textarea
                  id="fiscal-server-paths"
                  value={serverPaths}
                  onChange={(e) => setServerPaths(e.target.value)}
                  placeholder={"/opt/hermes/data/fiscal/pgfn-nao-2025Q4.zip\n/opt/hermes/data/fiscal/pgfn-previdenciario-2025Q4.zip"}
                  className="min-h-[160px] border-border bg-card"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-border bg-card"
                onClick={() => void handleImportPaths()}
                disabled={isImportingPaths}
              >
                {isImportingPaths ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Importar caminhos do servidor
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-muted/20/30 p-4 text-sm text-muted-foreground">
            O Hermes expõe apenas o que existir na base publica importada. Sem autenticacao do contribuinte, nao mostra o universo completo de pendencias do Regularize/e-CAC.
          </div>
        </CardContent>
      </Card>

      {lookup && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-4 w-4 text-amber-300" />
                  Leitura publica do CNPJ
                </CardTitle>
                <CardDescription>
                  Snapshot consultado para {formatCnpj(lookup.cnpj)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!lookup.summary.has_snapshot ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20/30 p-4 text-sm text-muted-foreground">
                    Nenhuma base fiscal foi importada ainda. Importe um snapshot público para liberar essa consulta.
                  </div>
                ) : !lookup.summary.has_records ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20/30 p-4 text-sm text-muted-foreground">
                    Esse CNPJ não apareceu na última base pública importada.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {(lookup.summary.situacoes ?? []).map((status) => (
                        <Badge key={status} variant="outline" className={cn("capitalize", statusTone(status))}>
                          {status}
                        </Badge>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Devedor</p>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {lookup.summary.nome_devedor || "Nao informado"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Inscricoes</p>
                        <p className="mt-2 text-sm font-medium text-foreground">{lookup.summary.total_records}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Valor consolidado</p>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {formatMoney(lookup.summary.total_valor_consolidado)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Ajuizadas</p>
                        <p className="mt-2 text-sm font-medium text-foreground">{lookup.summary.ajuizadas}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/20/50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">Contexto do snapshot</p>
                      <p className="mt-2 text-sm text-foreground/80">
                        Fonte: {lookup.snapshot?.source_label || "Base publica manual"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Arquivo: {lookup.snapshot?.filename || "Nao informado"} · importado em {formatDate(lookup.snapshot?.imported_at)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Ultima data de inscricao encontrada: {formatDate(lookup.summary.latest_data_inscricao)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {lookup.summary.ufs.map((item) => (
                          <Badge key={`uf-${item}`} variant="outline" className="border-border text-foreground/80">
                            UF {item}
                          </Badge>
                        ))}
                        {lookup.summary.tipos_credito.map((item) => (
                          <Badge key={`credito-${item}`} variant="outline" className="border-border text-foreground/80">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg">Totais</CardTitle>
                <CardDescription>
                  Consolidado do que a base publica expõe hoje para esse CNPJ.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Valor originario</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {formatMoney(lookup.summary.total_valor_originario)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Valor consolidado</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {formatMoney(lookup.summary.total_valor_consolidado)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Status expostos</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {lookup.summary.situacoes.length || 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Cobertura</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Publica / sem autorizacao
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Arquivos fonte</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {lookup.summary.fontes.length || 0}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {lookup.records.length > 0 && (
            <Card className="border-border bg-card shadow-surface-sm">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg">Inscricoes encontradas</CardTitle>
                <CardDescription>
                  Cada item abaixo corresponde ao que o snapshot público trouxe para o CNPJ consultado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {lookup.records.map((record) => (
                  <div key={record.id} className="rounded-2xl border border-border bg-muted/20/70 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {record.numero_inscricao || "Inscricao sem numero"}
                          </p>
                          {record.situacao && (
                            <Badge variant="outline" className={statusTone(record.situacao)}>
                              {record.situacao}
                            </Badge>
                          )}
                          {record.indicador_ajuizado != null && (
                            <Badge
                              variant="outline"
                              className={
                                record.indicador_ajuizado
                                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                                  : "border-border bg-muted/20 text-foreground/80"
                              }
                            >
                              {record.indicador_ajuizado ? "Ajuizada" : "Nao ajuizada"}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span>Data: {formatDate(record.data_inscricao)}</span>
                          <span>Originario: {formatMoney(record.valor_originario)}</span>
                          <span>Consolidado: {formatMoney(record.valor_consolidado)}</span>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground/70">
                          {record.tipo_pessoa && <span>Tipo pessoa: {record.tipo_pessoa}</span>}
                          {record.uf_devedor && <span>UF: {record.uf_devedor}</span>}
                          {record.tipo_situacao_inscricao && <span>Tipo situacao: {record.tipo_situacao_inscricao}</span>}
                          {record.tipo_credito && <span>Credito: {record.tipo_credito}</span>}
                          {record.receita_principal && <span>Receita: {record.receita_principal}</span>}
                          {record.tipo_devedor && <span>Devedor: {record.tipo_devedor}</span>}
                          {record.unidade_responsavel && <span>Unidade: {record.unidade_responsavel}</span>}
                          {record.entidade_responsavel && <span>Entidade: {record.entidade_responsavel}</span>}
                          {record.unidade_inscricao && <span>Unidade inscricao: {record.unidade_inscricao}</span>}
                          {record.processo_judicial && <span>Processo: {record.processo_judicial}</span>}
                          {record.source_member_name && <span>Arquivo: {record.source_member_name}</span>}
                        </div>
                      </div>

                      {sourceUrl(record) && (
                        <a
                          href={sourceUrl(record) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Abrir fonte
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default ConsultaFiscal;
