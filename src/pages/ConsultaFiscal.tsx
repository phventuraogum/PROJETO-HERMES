import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import ScaleIcon from "@mui/icons-material/Balance";
import SearchIcon from "@mui/icons-material/Search";
import RefreshCwIcon from "@mui/icons-material/Refresh";
import ShieldCheckIcon from "@mui/icons-material/VerifiedUser";
import UploadIcon from "@mui/icons-material/Upload";
import ExternalLinkIcon from "@mui/icons-material/OpenInNew";
import ArrowRightIcon from "@mui/icons-material/ArrowForward";
import CircularProgress from "@mui/material/CircularProgress";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";

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

function statusChipSx(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("irregular")) {
    return { bgcolor: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px" };
  }
  if (normalized.includes("susp")) {
    return { bgcolor: "rgba(245,158,11,0.1)", color: "#fcd34d", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px" };
  }
  if (normalized.includes("garant")) {
    return { bgcolor: "rgba(14,165,233,0.1)", color: "#7dd3fc", border: "1px solid rgba(14,165,233,0.3)", borderRadius: "8px" };
  }
  return { bgcolor: "rgba(255,255,255,0.05)", color: "rgba(240,240,240,0.8)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "8px" };
}

function sourceUrl(record: FiscalPublicRecord): string | null {
  return record.source_url || null;
}

const STAT_BOX_SX = {
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.07)",
  bgcolor: "rgba(255,255,255,0.03)",
  p: 1.5,
};

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
        toast.info("Esse CNPJ nao aparece na ultima base fiscal importada.");
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
          <ScaleIcon sx={{ fontSize: 20, color: "#fcd34d" }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} letterSpacing="-0.02em">
            Consulta Fiscal
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Consulta publica/manual por CNPJ para expor o maximo de informacao fiscal disponivel sem autorizacao.
          </Typography>
        </Box>
      </Stack>

      {/* Lookup Card */}
      <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
            <SearchIcon sx={{ fontSize: 16, color: "#fcd34d" }} />
            <Typography variant="subtitle1" fontWeight={600}>Consulta por CNPJ</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2}>
            O resultado depende da ultima base fiscal publica importada. Nao consulta areas restritas do contribuinte.
          </Typography>

          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} mb={2}>
            <TextField
              value={formatCnpj(cnpjInput)}
              onChange={(e) => setCnpjInput(normalizeCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleLookup();
                }
              }}
              sx={{ flex: 1 }}
              inputProps={{ style: { fontSize: 16 } }}
            />
            <Button
              variant="contained"
              onClick={() => void handleLookup()}
              disabled={isLookingUp}
              startIcon={isLookingUp ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
              sx={{
                bgcolor: "#eab308",
                color: "grey.900",
                fontWeight: 600,
                whiteSpace: "nowrap",
                minWidth: 180,
                "&:hover": { bgcolor: "#facc15" },
              }}
            >
              Consultar base publica
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate(`/cnpj?cnpj=${cnpjDigits}`)}
              disabled={cnpjDigits.length !== 14}
              startIcon={<ArrowRightIcon />}
              sx={{ whiteSpace: "nowrap" }}
            >
              Abrir no Enriquecer
            </Button>
          </Stack>

          <Stack direction="row" flexWrap="wrap" gap={1} mb={2.5}>
            {["Sem autorizacao externa", "Snapshot publico/manual", "Nao substitui Regularize ou e-CAC"].map((label) => (
              <Chip
                key={label}
                label={label}
                variant="outlined"
                size="small"
                sx={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(240,240,240,0.8)", borderRadius: "8px" }}
              />
            ))}
          </Stack>

          {/* Snapshot status banner */}
          <Box sx={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.07)", bgcolor: "rgba(255,255,255,0.03)", p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
              <Box>
                <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(240,240,240,0.35)", display: "block" }}>
                  Ultima base fiscal
                </Typography>
                {isLoadingMeta ? (
                  <Typography variant="body2" color="text.secondary" mt={1}>Carregando status...</Typography>
                ) : snapshot ? (
                  <>
                    <Typography variant="body2" fontWeight={500} mt={1}>{snapshot.source_label || "Base publica manual"}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {snapshot.filename || "Arquivo sem nome"} · importado em {formatDate(snapshot.imported_at)}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" mt={1}>Nenhum snapshot fiscal importado ainda.</Typography>
                )}
              </Box>
              <Button
                variant="outlined"
                size="small"
                onClick={() => void loadSnapshotMeta()}
                disabled={isLoadingMeta}
                startIcon={isLoadingMeta ? <CircularProgress size={14} color="inherit" /> : <RefreshCwIcon />}
                sx={{ whiteSpace: "nowrap" }}
              >
                Atualizar
              </Button>
            </Stack>

            {snapshot && (
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { sm: "repeat(3,1fr)" }, mt: 2 }}>
                {[
                  { label: "Registros", value: String(snapshot.record_count) },
                  { label: "CNPJs unicos", value: String(snapshot.unique_cnpjs) },
                  { label: "Linhas puladas", value: String(snapshot.skipped_rows) },
                ].map((item) => (
                  <Box key={item.label} sx={{ ...STAT_BOX_SX, bgcolor: "rgba(24,24,24,0.8)" }}>
                    <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(240,240,240,0.35)", display: "block" }}>
                      {item.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={500} mt={1}>{item.value}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Import Card */}
      <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
            <UploadIcon sx={{ fontSize: 16, color: "#67e8f9" }} />
            <Typography variant="subtitle1" fontWeight={600}>Importacao Manual da Base</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2.5}>
            Suba um CSV/TSV/JSON/ZIP publico, cole os dados manualmente ou importe arquivos grandes ja copiados para a VPS.
          </Typography>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xl: "repeat(3,1fr)" } }}>
            {/* File Import */}
            <Box sx={{ ...STAT_BOX_SX, display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Fonte exibida"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label="Notas"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: recorte publico baixado manualmente"
                fullWidth
                size="small"
              />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.75}>Arquivo</Typography>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.json,.zip"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  style={{
                    width: "100%",
                    fontSize: 13,
                    color: "rgba(240,240,240,0.8)",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 8,
                    padding: "6px 8px",
                    cursor: "pointer",
                  }}
                />
              </Box>
              <Button
                variant="contained"
                fullWidth
                onClick={() => void handleImportFile()}
                disabled={isImportingFile}
                startIcon={isImportingFile ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
                sx={{ bgcolor: "#06b6d4", color: "grey.900", fontWeight: 600, "&:hover": { bgcolor: "#22d3ee" } }}
              >
                Importar arquivo
              </Button>
            </Box>

            {/* Text Import */}
            <Box sx={{ ...STAT_BOX_SX, display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Nome do arquivo textual"
                value={textFilename}
                onChange={(e) => setTextFilename(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label="CSV / JSON manual"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Cole aqui um CSV com coluna de CNPJ e os campos fiscais publicos."
                multiline
                minRows={6}
                fullWidth
                size="small"
              />
              <Button
                variant="outlined"
                fullWidth
                onClick={() => void handleImportText()}
                disabled={isImportingText}
                startIcon={isImportingText ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
              >
                Importar texto
              </Button>
            </Box>

            {/* Server Paths Import */}
            <Box sx={{ ...STAT_BOX_SX, display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Nome do snapshot grande"
                value={serverFilename}
                onChange={(e) => setServerFilename(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label="Caminhos no servidor"
                value={serverPaths}
                onChange={(e) => setServerPaths(e.target.value)}
                placeholder={"/opt/hermes/data/fiscal/pgfn-nao-2025Q4.zip\n/opt/hermes/data/fiscal/pgfn-previdenciario-2025Q4.zip"}
                multiline
                minRows={6}
                fullWidth
                size="small"
              />
              <Button
                variant="outlined"
                fullWidth
                onClick={() => void handleImportPaths()}
                disabled={isImportingPaths}
                startIcon={isImportingPaths ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
              >
                Importar caminhos do servidor
              </Button>
            </Box>
          </Box>

          <Box
            sx={{
              mt: 2.5,
              borderRadius: "12px",
              border: "1px dashed rgba(255,255,255,0.14)",
              bgcolor: "rgba(255,255,255,0.02)",
              p: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              O Hermes expoe apenas o que existir na base publica importada. Sem autenticacao do contribuinte, nao mostra o universo completo de pendencias do Regularize/e-CAC.
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Lookup Results */}
      {lookup && (
        <>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xl: "1.3fr 1fr" } }}>
            {/* Public Reading */}
            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                  <ShieldCheckIcon sx={{ fontSize: 16, color: "#fcd34d" }} />
                  <Typography variant="subtitle1" fontWeight={600}>Leitura publica do CNPJ</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Snapshot consultado para {formatCnpj(lookup.cnpj)}.
                </Typography>

                {!lookup.summary.has_snapshot ? (
                  <Box sx={{ borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.14)", bgcolor: "rgba(255,255,255,0.02)", p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Nenhuma base fiscal foi importada ainda. Importe um snapshot publico para liberar essa consulta.
                    </Typography>
                  </Box>
                ) : !lookup.summary.has_records ? (
                  <Box sx={{ borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.14)", bgcolor: "rgba(255,255,255,0.02)", p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Esse CNPJ nao apareceu na ultima base publica importada.
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
                      {(lookup.summary.situacoes ?? []).map((status) => (
                        <Chip key={status} label={status} size="small" sx={{ ...statusChipSx(status), textTransform: "capitalize" }} />
                      ))}
                    </Stack>

                    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, mb: 2 }}>
                      {[
                        { label: "Devedor", value: lookup.summary.nome_devedor || "Nao informado" },
                        { label: "Inscricoes", value: String(lookup.summary.total_records) },
                        { label: "Valor consolidado", value: formatMoney(lookup.summary.total_valor_consolidado) },
                        { label: "Ajuizadas", value: String(lookup.summary.ajuizadas) },
                      ].map((item) => (
                        <Box key={item.label} sx={STAT_BOX_SX}>
                          <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(240,240,240,0.35)", display: "block" }}>
                            {item.label}
                          </Typography>
                          <Typography variant="body2" fontWeight={500} mt={1}>{item.value}</Typography>
                        </Box>
                      ))}
                    </Box>

                    <Box sx={{ ...STAT_BOX_SX, bgcolor: "rgba(255,255,255,0.02)" }}>
                      <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(240,240,240,0.35)", display: "block", mb: 1 }}>
                        Contexto do snapshot
                      </Typography>
                      <Typography variant="body2" sx={{ color: "rgba(240,240,240,0.8)" }}>
                        Fonte: {lookup.snapshot?.source_label || "Base publica manual"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Arquivo: {lookup.snapshot?.filename || "Nao informado"} · importado em {formatDate(lookup.snapshot?.imported_at)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Ultima data de inscricao encontrada: {formatDate(lookup.summary.latest_data_inscricao)}
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1} mt={1.5}>
                        {lookup.summary.ufs.map((item) => (
                          <Chip key={`uf-${item}`} label={`UF ${item}`} size="small" variant="outlined" sx={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(240,240,240,0.8)", borderRadius: "8px" }} />
                        ))}
                        {lookup.summary.tipos_credito.map((item) => (
                          <Chip key={`credito-${item}`} label={item} size="small" variant="outlined" sx={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(240,240,240,0.8)", borderRadius: "8px" }} />
                        ))}
                      </Stack>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Totals Card */}
            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" fontWeight={600} mb={0.5}>Totais</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Consolidado do que a base publica expoe hoje para esse CNPJ.
                </Typography>
                <Stack spacing={1.5}>
                  {[
                    { label: "Valor originario", value: formatMoney(lookup.summary.total_valor_originario) },
                    { label: "Valor consolidado", value: formatMoney(lookup.summary.total_valor_consolidado) },
                    { label: "Status expostos", value: String(lookup.summary.situacoes.length || 0) },
                    { label: "Cobertura", value: "Publica / sem autorizacao" },
                    { label: "Arquivos fonte", value: String(lookup.summary.fontes.length || 0) },
                  ].map((item) => (
                    <Box key={item.label} sx={STAT_BOX_SX}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                        <Typography variant="body2" fontWeight={500}>{item.value}</Typography>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Box>

          {/* Records */}
          {lookup.records.length > 0 && (
            <Card sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "12px" }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" fontWeight={600} mb={0.5}>Inscricoes encontradas</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Cada item abaixo corresponde ao que o snapshot publico trouxe para o CNPJ consultado.
                </Typography>
                <Stack spacing={2}>
                  {lookup.records.map((record) => (
                    <Box key={record.id} sx={{ ...STAT_BOX_SX, p: 2 }}>
                      <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "flex-start" }} gap={2}>
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1} mb={1}>
                            <Typography variant="body2" fontWeight={600}>
                              {record.numero_inscricao || "Inscricao sem numero"}
                            </Typography>
                            {record.situacao && (
                              <Chip label={record.situacao} size="small" sx={statusChipSx(record.situacao)} />
                            )}
                            {record.indicador_ajuizado != null && (
                              <Chip
                                label={record.indicador_ajuizado ? "Ajuizada" : "Nao ajuizada"}
                                size="small"
                                sx={
                                  record.indicador_ajuizado
                                    ? { bgcolor: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px" }
                                    : { bgcolor: "rgba(255,255,255,0.05)", color: "rgba(240,240,240,0.8)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "8px" }
                                }
                              />
                            )}
                          </Stack>

                          <Stack direction="row" flexWrap="wrap" gap={2} mb={1}>
                            <Typography variant="body2" color="text.secondary">Data: {formatDate(record.data_inscricao)}</Typography>
                            <Typography variant="body2" color="text.secondary">Originario: {formatMoney(record.valor_originario)}</Typography>
                            <Typography variant="body2" color="text.secondary">Consolidado: {formatMoney(record.valor_consolidado)}</Typography>
                          </Stack>

                          <Stack direction="row" flexWrap="wrap" gap={2}>
                            {record.tipo_pessoa && <Typography variant="caption" color="text.secondary">Tipo pessoa: {record.tipo_pessoa}</Typography>}
                            {record.uf_devedor && <Typography variant="caption" color="text.secondary">UF: {record.uf_devedor}</Typography>}
                            {record.tipo_situacao_inscricao && <Typography variant="caption" color="text.secondary">Tipo situacao: {record.tipo_situacao_inscricao}</Typography>}
                            {record.tipo_credito && <Typography variant="caption" color="text.secondary">Credito: {record.tipo_credito}</Typography>}
                            {record.receita_principal && <Typography variant="caption" color="text.secondary">Receita: {record.receita_principal}</Typography>}
                            {record.tipo_devedor && <Typography variant="caption" color="text.secondary">Devedor: {record.tipo_devedor}</Typography>}
                            {record.unidade_responsavel && <Typography variant="caption" color="text.secondary">Unidade: {record.unidade_responsavel}</Typography>}
                            {record.entidade_responsavel && <Typography variant="caption" color="text.secondary">Entidade: {record.entidade_responsavel}</Typography>}
                            {record.unidade_inscricao && <Typography variant="caption" color="text.secondary">Unidade inscricao: {record.unidade_inscricao}</Typography>}
                            {record.processo_judicial && <Typography variant="caption" color="text.secondary">Processo: {record.processo_judicial}</Typography>}
                            {record.source_member_name && <Typography variant="caption" color="text.secondary">Arquivo: {record.source_member_name}</Typography>}
                          </Stack>
                        </Box>

                        {sourceUrl(record) && (
                          <Box
                            component="a"
                            href={sourceUrl(record) ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, color: "#67e8f9", textDecoration: "none", fontSize: 14, whiteSpace: "nowrap", "&:hover": { color: "#a5f3fc" } }}
                          >
                            <ExternalLinkIcon sx={{ fontSize: 16 }} />
                            Abrir fonte
                          </Box>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
};

export default ConsultaFiscal;
