import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Stack, Typography, Button, IconButton, Chip,
  Card, CardContent, TextField, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions,
  CircularProgress,
} from "@mui/material";
import {
  ArchiveRounded,
  BookmarkAddRounded,
  AccessTimeRounded,
  CreateNewFolderRounded,
  MailRounded,
  SpeakerNotesOffRounded,
  PhoneRounded,
  TrackChangesRounded,
  RefreshRounded,
  BlockRounded,
  DeleteRounded,
} from "@mui/icons-material";
import { toast } from "sonner";
import {
  createLeadRefreshJob,
  createLeadList,
  createLeadSuppressions,
  deleteLeadList,
  deleteSavedSearch,
  getLeadRefreshJobTargets,
  getLeadRefreshJobs,
  getLeadRefreshStates,
  followCompany,
  getCompanySignals,
  getCompanyDataHealth,
  getCompanyWatchlist,
  getLeadListItems,
  getLeadLists,
  getLeadSuppressions,
  getSavedSearches,
  previewSavedSearch,
  refreshWatchedCompany,
  removeLeadListItem,
  removeLeadSuppression,
  salvarResultadoManual,
  unfollowCompany,
  type CompanySignal,
  type CompanyDataHealth,
  type LeadRefreshJob,
  type LeadRefreshJobTarget,
  type LeadRefreshState,
  type LeadListItem,
  type LeadListSummary,
  type LeadSuppression,
  type SavedSearchSummary,
  type WatchCompany,
} from "@/lib/api";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

// ── Shared style helpers ──────────────────────────────────────────────────────
const cardSx = {
  backgroundColor: "#141414",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "12px",
};

const rowSx = {
  backgroundColor: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "10px",
  p: 2,
};

const emptyBoxSx = {
  border: "1px dashed rgba(255,255,255,0.1)",
  borderRadius: "10px",
  p: 2.5,
  color: "#555",
  fontSize: "0.8125rem",
};

const sectionLabelSx = {
  fontSize: "0.625rem",
  fontWeight: 600,
  color: "#444",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
};

function StatusChip({ label, tone }: { label: string; tone: "success" | "warning" | "error" | "info" | "default" }) {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    success: { bg: "rgba(34,197,94,0.1)", color: "#22C55E", border: "rgba(34,197,94,0.2)" },
    warning: { bg: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "rgba(245,158,11,0.2)" },
    error:   { bg: "rgba(239,68,68,0.1)",  color: "#EF4444",  border: "rgba(239,68,68,0.2)"  },
    info:    { bg: "rgba(56,189,248,0.1)", color: "#38BDF8", border: "rgba(56,189,248,0.2)" },
    default: { bg: "rgba(255,255,255,0.05)", color: "#888", border: "rgba(255,255,255,0.1)" },
  };
  const c = colors[tone] ?? colors.default;
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        fontSize: "0.6875rem",
        fontWeight: 600,
        height: 22,
        backgroundColor: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
      }}
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
const LeadLists = () => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<LeadListSummary[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [suppressions, setSuppressions] = useState<LeadSuppression[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchSummary[]>([]);
  const [watchlist, setWatchlist] = useState<WatchCompany[]>([]);
  const [companyDataHealth, setCompanyDataHealth] = useState<CompanyDataHealth | null>(null);
  const [signals, setSignals] = useState<CompanySignal[]>([]);
  const [refreshJobs, setRefreshJobs] = useState<LeadRefreshJob[]>([]);
  const [selectedRefreshJobId, setSelectedRefreshJobId] = useState("");
  const [refreshJobTargets, setRefreshJobTargets] = useState<LeadRefreshJobTarget[]>([]);
  const [refreshStates, setRefreshStates] = useState<LeadRefreshState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingRefreshTargets, setLoadingRefreshTargets] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [manualCnpj, setManualCnpj] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualDomain, setManualDomain] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [savingSuppression, setSavingSuppression] = useState(false);
  const [manualWatchCnpj, setManualWatchCnpj] = useState("");
  const [manualWatchReason, setManualWatchReason] = useState("");
  const [savingWatch, setSavingWatch] = useState(false);
  const [runningSavedSearchId, setRunningSavedSearchId] = useState<string | null>(null);
  const [refreshingWatchCnpj, setRefreshingWatchCnpj] = useState<string | null>(null);
  const [queueingRefreshKey, setQueueingRefreshKey] = useState<string | null>(null);

  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId],
  );
  const selectedRefreshJob = useMemo(
    () => refreshJobs.find((job) => job.id === selectedRefreshJobId) ?? null,
    [refreshJobs, selectedRefreshJobId],
  );
  const activeRefreshJobs = useMemo(
    () => refreshJobs.filter((job) => job.status === "queued" || job.status === "running"),
    [refreshJobs],
  );

  const reloadLists = async () => {
    const next = await getLeadLists();
    setLists(next);
    if (!selectedListId && next.length > 0) setSelectedListId(next[0].id);
    if (selectedListId && !next.some((list) => list.id === selectedListId)) {
      setSelectedListId(next[0]?.id ?? "");
    }
  };

  const reloadSuppressions = async () => setSuppressions(await getLeadSuppressions());
  const reloadSavedSearches = async () => setSavedSearches(await getSavedSearches());
  const reloadWatchlist = async () => setWatchlist(await getCompanyWatchlist());
  const reloadCompanyDataHealth = async () => setCompanyDataHealth(await getCompanyDataHealth(8));
  const reloadSignals = async () => setSignals(await getCompanySignals({ limit: 30 }));
  const reloadRefreshJobs = async () => {
    const jobs = await getLeadRefreshJobs(20);
    setRefreshJobs(jobs);
    setSelectedRefreshJobId((current) => {
      if (!current) return jobs[0]?.id || "";
      return jobs.some((job) => job.id === current) ? current : jobs[0]?.id || "";
    });
  };
  const reloadRefreshStates = async () => setRefreshStates(await getLeadRefreshStates({ dueOnly: true, limit: 20 }));

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [
          nextLists,
          nextSuppressions,
          nextSavedSearches,
          nextWatchlist,
          nextCompanyDataHealth,
          nextSignals,
          nextRefreshJobs,
          nextRefreshStates,
        ] = await Promise.all([
          getLeadLists(),
          getLeadSuppressions(),
          getSavedSearches(),
          getCompanyWatchlist(),
          getCompanyDataHealth(8),
          getCompanySignals({ limit: 30 }),
          getLeadRefreshJobs(20),
          getLeadRefreshStates({ dueOnly: true, limit: 20 }),
        ]);
        setLists(nextLists);
        setSuppressions(nextSuppressions);
        setSavedSearches(nextSavedSearches);
        setWatchlist(nextWatchlist);
        setCompanyDataHealth(nextCompanyDataHealth);
        setSignals(nextSignals);
        setRefreshJobs(nextRefreshJobs);
        setRefreshStates(nextRefreshStates);
        if (nextRefreshJobs.length > 0) {
          setSelectedRefreshJobId((current) => current || nextRefreshJobs[0].id);
        }
        if (nextLists.length > 0) setSelectedListId((current) => current || nextLists[0].id);
      } catch (err: any) {
        toast.error(err?.message || "Nao foi possivel carregar o registry operacional.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!selectedListId) { setItems([]); return; }
    const loadItems = async () => {
      try {
        setLoadingItems(true);
        setItems(await getLeadListItems(selectedListId));
      } catch (err: any) {
        toast.error(err?.message || "Nao foi possivel carregar os leads da lista.");
      } finally {
        setLoadingItems(false);
      }
    };
    void loadItems();
  }, [selectedListId]);

  useEffect(() => {
    if (!selectedRefreshJobId) { setRefreshJobTargets([]); return; }
    const loadTargets = async () => {
      try {
        setLoadingRefreshTargets(true);
        setRefreshJobTargets(await getLeadRefreshJobTargets(selectedRefreshJobId, 80));
      } catch (err: any) {
        toast.error(err?.message || "Nao foi possivel carregar os alvos do refresh.");
      } finally {
        setLoadingRefreshTargets(false);
      }
    };
    void loadTargets();
  }, [selectedRefreshJobId]);

  useEffect(() => {
    if (activeRefreshJobs.length === 0) return undefined;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          await Promise.all([
            reloadRefreshJobs(),
            reloadRefreshStates(),
            reloadWatchlist(),
            reloadCompanyDataHealth(),
            reloadSignals(),
            selectedRefreshJobId
              ? getLeadRefreshJobTargets(selectedRefreshJobId, 80).then(setRefreshJobTargets)
              : Promise.resolve(),
          ]);
        } catch {
          // polling best-effort
        }
      })();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeRefreshJobs.length, selectedRefreshJobId]);

  const handleCreateList = async () => {
    const name = createName.trim();
    if (!name) { toast.info("Informe um nome para a lista."); return; }
    try {
      setCreating(true);
      const created = await createLeadList(name, createDescription.trim() || null);
      setCreateDialogOpen(false);
      setCreateName("");
      setCreateDescription("");
      await reloadLists();
      setSelectedListId(created.id);
      toast.success("Lista criada.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel criar a lista.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    try {
      await deleteLeadList(listId);
      await reloadLists();
      toast.success("Lista removida.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel remover a lista.");
    }
  };

  const handleRemoveItem = async (cnpj: string) => {
    if (!selectedListId) return;
    try {
      await removeLeadListItem(selectedListId, cnpj);
      setItems((prev) => prev.filter((item) => item.cnpj !== cnpj));
      await reloadLists();
      toast.success("Lead removido da lista.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel remover o lead.");
    }
  };

  const handleManualSuppression = async () => {
    const cnpjs = manualCnpj.split(/[\s,;]+/).map((v) => v.trim()).filter(Boolean);
    const emails = manualEmail.split(/[\s,;]+/).map((v) => v.trim()).filter(Boolean);
    const domains = manualDomain.split(/[\s,;]+/).map((v) => v.trim()).filter(Boolean);
    if (cnpjs.length === 0 && emails.length === 0 && domains.length === 0) {
      toast.info("Informe ao menos um CNPJ, e-mail ou dominio.");
      return;
    }
    try {
      setSavingSuppression(true);
      const result = await createLeadSuppressions({
        cnpjs, emails, domains,
        reason: manualReason.trim() || null,
        source: "lead_lists_page",
      });
      setManualCnpj(""); setManualEmail(""); setManualDomain(""); setManualReason("");
      await reloadSuppressions();
      toast.success(`${result.added} supressao(oes) adicionada(s).`);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel registrar a supressao.");
    } finally {
      setSavingSuppression(false);
    }
  };

  const handleRemoveSuppression = async (id: string) => {
    try {
      await removeLeadSuppression(id);
      setSuppressions((prev) => prev.filter((item) => item.id !== id));
      toast.success("Supressao removida.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel remover a supressao.");
    }
  };

  const handleRunSavedSearch = async (search: SavedSearchSummary) => {
    try {
      setRunningSavedSearchId(search.id);
      const resultado = await previewSavedSearch(search.id);
      await salvarResultadoManual(search.config, resultado);
      await reloadSavedSearches();
      toast.success(`${resultado.total_empresas} empresas retornadas pela busca salva.`);
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

  const handleFollowCompany = async () => {
    if (!manualWatchCnpj.trim()) { toast.info("Informe um CNPJ para acompanhar."); return; }
    try {
      setSavingWatch(true);
      const result = await followCompany({
        cnpj: manualWatchCnpj.trim(),
        reason: manualWatchReason.trim() || null,
        source: "lead_lists_page",
      });
      setManualWatchCnpj(""); setManualWatchReason("");
      await Promise.all([reloadWatchlist(), reloadCompanyDataHealth(), reloadSignals()]);
      toast.success(
        result.signals.length > 0
          ? `${result.signals.length} sinal(is) registrado(s).`
          : "Empresa adicionada a watchlist.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel acompanhar a empresa.");
    } finally {
      setSavingWatch(false);
    }
  };

  const handleRefreshWatch = async (cnpj: string) => {
    try {
      setRefreshingWatchCnpj(cnpj);
      const result = await refreshWatchedCompany(cnpj);
      await Promise.all([reloadWatchlist(), reloadCompanyDataHealth(), reloadSignals()]);
      toast.success(
        result.signals.length > 0
          ? `${result.signals.length} novo(s) sinal(is) capturado(s).`
          : "Watchlist atualizada sem novos sinais.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel atualizar a watchlist.");
    } finally {
      setRefreshingWatchCnpj(null);
    }
  };

  const handleUnfollowCompany = async (cnpj: string) => {
    try {
      await unfollowCompany(cnpj);
      await Promise.all([reloadWatchlist(), reloadCompanyDataHealth(), reloadSignals()]);
      toast.success("Empresa removida da watchlist.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel remover a empresa da watchlist.");
    }
  };

  const handleQueueRefreshJob = async (
    key: string,
    body: {
      source_kind: "manual" | "lead_list" | "watchlist" | "saved_search";
      source_ref?: string | null;
      cnpjs?: string[];
      name?: string | null;
      limit_targets?: number;
      probe_smtp?: boolean;
      refresh_external_signals?: boolean;
    },
    successMessage: string,
  ) => {
    try {
      setQueueingRefreshKey(key);
      const job = await createLeadRefreshJob(body);
      await Promise.all([reloadRefreshJobs(), reloadRefreshStates()]);
      setSelectedRefreshJobId(job.id);
      toast.success(successMessage);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel enfileirar o refresh em lote.");
    } finally {
      setQueueingRefreshKey(null);
    }
  };

  const handleQueueSelectedListRefresh = async () => {
    if (!selectedList) { toast.info("Selecione uma lista para reverificar."); return; }
    await handleQueueRefreshJob(
      `list:${selectedList.id}`,
      {
        source_kind: "lead_list",
        source_ref: selectedList.id,
        name: `Refresh ${selectedList.name}`,
        limit_targets: Math.max(1, Math.min(selectedList.item_count || 1, 120)),
        probe_smtp: true,
      },
      "Refresh da lista enfileirado.",
    );
  };

  const handleQueueWatchlistRefresh = async () => {
    if (watchlist.length === 0) { toast.info("Nenhuma empresa na watchlist para reverificar."); return; }
    await handleQueueRefreshJob(
      "watchlist",
      {
        source_kind: "watchlist",
        name: "Refresh da watchlist",
        limit_targets: Math.max(1, Math.min(watchlist.length, 120)),
        probe_smtp: true,
        refresh_external_signals: true,
      },
      "Refresh da watchlist enfileirado.",
    );
  };

  const handleQueueSavedSearchRefresh = async (search: SavedSearchSummary) => {
    await handleQueueRefreshJob(
      `search:${search.id}`,
      {
        source_kind: "saved_search",
        source_ref: search.id,
        name: `Refresh ${search.name}`,
        limit_targets: Math.max(1, Math.min(search.config.limite_empresas || 50, 120)),
        probe_smtp: true,
      },
      "Refresh da busca salva enfileirado.",
    );
  };

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

      {/* Header */}
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "1.375rem", letterSpacing: "-0.02em", color: "#F0F0F0" }}>
            Listas, buscas e signals
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "#666", mt: 0.5 }}>
            Organize listas estaticas, rode buscas salvas, acompanhe empresas e bloqueie contatos improdutivos.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<CreateNewFolderRounded sx={{ fontSize: 16 }} />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{ fontWeight: 600, fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px" }}
        >
          Criar lista
        </Button>
      </Stack>

      {/* ── Data Health Center ─────────────────────────────────────────────── */}
      <Card sx={cardSx} elevation={0}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} mb={2.5}>
            <Box>
              <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                <TrackChangesRounded sx={{ fontSize: 16, color: "#38BDF8" }} />
                <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0" }}>Data Health Center</Typography>
              </Stack>
              <Typography sx={{ fontSize: "0.8125rem", color: "#666" }}>
                Leitura Apollo-style da watchlist para detectar gaps de mobile e WhatsApp acionavel antes do outreach.
              </Typography>
            </Box>
            <Chip
              label={`Watchlist ${companyDataHealth?.summary.watchlist_total ?? 0}`}
              size="small"
              sx={{ fontSize: "0.75rem", backgroundColor: "rgba(255,255,255,0.05)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", xl: "repeat(5, 1fr)" }, gap: 1.5, mb: 2 }}>
            {[
              { label: "Sem mobile", value: companyDataHealth?.summary.without_mobile ?? 0, bg: "rgba(245,158,11,0.08)", color: "#F59E0B", border: "rgba(245,158,11,0.2)", Icon: PhoneRounded },
              { label: "Sem WhatsApp validado", value: companyDataHealth?.summary.without_verified_whatsapp ?? 0, bg: "rgba(239,68,68,0.08)", color: "#EF4444", border: "rgba(239,68,68,0.2)", Icon: SpeakerNotesOffRounded },
              { label: "Sem mobile decisor", value: companyDataHealth?.summary.without_decision_maker_mobile ?? 0, bg: "rgba(56,189,248,0.08)", color: "#38BDF8", border: "rgba(56,189,248,0.2)", Icon: BookmarkAddRounded },
              { label: "Snapshots stale", value: companyDataHealth?.summary.stale_records ?? 0, bg: "rgba(167,139,250,0.08)", color: "#A78BFA", border: "rgba(167,139,250,0.2)", Icon: AccessTimeRounded },
              {
                label: "Cobertura ativa",
                value: Math.max(0, (companyDataHealth?.summary.watchlist_total ?? 0) - (companyDataHealth?.summary.without_mobile ?? 0)),
                bg: "rgba(34,197,94,0.08)", color: "#22C55E", border: "rgba(34,197,94,0.2)", Icon: TrackChangesRounded,
              },
            ].map((item) => (
              <Box key={item.label} sx={{ backgroundColor: item.bg, border: `1px solid ${item.border}`, borderRadius: "10px", p: 2 }}>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography sx={sectionLabelSx}>{item.label}</Typography>
                    <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, color: item.color, mt: 1, lineHeight: 1 }}>{item.value}</Typography>
                  </Box>
                  <item.Icon sx={{ fontSize: 15, color: item.color, mt: 0.25, opacity: 0.8 }} />
                </Stack>
              </Box>
            ))}
          </Box>

          {!companyDataHealth || companyDataHealth.items.length === 0 ? (
            <Box sx={emptyBoxSx}>Nenhum gap relevante identificado na watchlist ainda.</Box>
          ) : (
            <Box>
              <Typography sx={{ ...sectionLabelSx, mb: 1.5 }}>Top gaps</Typography>
              <Stack gap={1}>
                {companyDataHealth.items.slice(0, 6).map((item) => (
                  <Box key={item.cnpj} sx={rowSx}>
                    <Stack direction={{ xs: "column", lg: "row" }} alignItems={{ lg: "flex-start" }} justifyContent="space-between" gap={1.5}>
                      <Box>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }}>
                          {item.nome_fantasia || item.razao_social || item.cnpj}
                        </Typography>
                        <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                          {item.cnpj} · {[item.cidade, item.uf].filter(Boolean).join(" / ") || "Sem localizacao"}
                        </Typography>
                      </Box>
                      <StatusChip
                        label={`Gap score ${item.gap_score}`}
                        tone={item.gap_score >= 4 ? "error" : item.gap_score >= 2 ? "warning" : "info"}
                      />
                    </Stack>
                    <Stack direction="row" flexWrap="wrap" gap={0.75} mt={1.5}>
                      <Chip label={`Mobiles ${item.mobile_candidates}`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                      <Chip label={`WhatsApps validados ${item.verified_whatsapp_candidates}`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                      <Chip label={`Mobiles decisor ${item.decision_maker_mobile_candidates}`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                      {item.stale && <StatusChip label="Snapshot stale" tone="warning" />}
                    </Stack>
                    <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 1.5 }}>
                      Ultimo snapshot: {formatDate(item.generated_at)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Bulk Center + Jobs Recentes ────────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "0.95fr 1.35fr" }, gap: 2 }}>

        {/* Bulk Center */}
        <Card sx={cardSx} elevation={0}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <RefreshRounded sx={{ fontSize: 16, color: "#38BDF8" }} />
              <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0" }}>Bulk center e reverificacao</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
              Reenriquece listas, watchlist e buscas salvas em background para manter contatos frescos.
            </Typography>

            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
              <Button
                variant="contained"
                startIcon={queueingRefreshKey === "watchlist" ? <CircularProgress size={14} color="inherit" /> : <RefreshRounded sx={{ fontSize: 16 }} />}
                onClick={() => void handleQueueWatchlistRefresh()}
                disabled={queueingRefreshKey === "watchlist" || watchlist.length === 0}
                sx={{ fontWeight: 600, fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px" }}
              >
                Reverificar watchlist
              </Button>
              <Button
                variant="outlined"
                startIcon={queueingRefreshKey === `list:${selectedList?.id || ""}` ? <CircularProgress size={14} color="inherit" /> : <ArchiveRounded sx={{ fontSize: 16 }} />}
                onClick={() => void handleQueueSelectedListRefresh()}
                disabled={queueingRefreshKey === `list:${selectedList?.id || ""}` || !selectedList}
                sx={{ fontWeight: 600, fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px", borderColor: "rgba(255,255,255,0.12)", color: "#A0A0A0", "&:hover": { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.04)" } }}
              >
                Reverificar lista ativa
              </Button>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, mb: 2 }}>
              {[
                { label: "Jobs ativos", value: String(activeRefreshJobs.length), sub: "Executando no worker" },
                { label: "Pendentes", value: String(refreshStates.length), sub: "CNPJs com refresh vencido" },
                { label: "Lista ativa", value: selectedList?.name || "Nenhuma", sub: `${selectedList?.item_count || 0} lead(s)`, small: true },
              ].map((stat) => (
                <Box key={stat.label} sx={rowSx}>
                  <Typography sx={sectionLabelSx}>{stat.label}</Typography>
                  <Typography sx={{ fontSize: stat.small ? "0.9375rem" : "1.375rem", fontWeight: 700, color: "#E0E0E0", mt: 1, lineHeight: 1.2 }}>
                    {stat.value}
                  </Typography>
                  <Typography sx={{ fontSize: "0.6875rem", color: "#555", mt: 0.75 }}>{stat.sub}</Typography>
                </Box>
              ))}
            </Box>

            {refreshStates.length > 0 && (
              <Box>
                <Typography sx={{ ...sectionLabelSx, mb: 1 }}>Fila natural de reverificacao</Typography>
                <Stack gap={1}>
                  {refreshStates.slice(0, 5).map((entry) => (
                    <Box key={entry.id} sx={rowSx}>
                      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
                        <Box>
                          <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }}>{entry.cnpj}</Typography>
                          <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                            Proximo refresh: {formatDate(entry.next_refresh_at)} · Ultimo: {formatDate(entry.last_refresh_at)}
                          </Typography>
                        </Box>
                        <StatusChip
                          label={entry.freshness_status || "pendente"}
                          tone={entry.freshness_status === "fresh" ? "success" : entry.freshness_status === "warming" ? "info" : "warning"}
                        />
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Jobs Recentes */}
        <Card sx={cardSx} elevation={0}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <AccessTimeRounded sx={{ fontSize: 16, color: "#22C55E" }} />
              <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0" }}>Jobs recentes</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
              Acompanhe refresh de listas, buscas salvas e watchlist sem travar o frontend.
            </Typography>

            {loading ? (
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ ...rowSx, color: "#666" }}>
                <CircularProgress size={14} color="inherit" />
                <Typography sx={{ fontSize: "0.8125rem" }}>Carregando jobs de refresh...</Typography>
              </Stack>
            ) : refreshJobs.length === 0 ? (
              <Box sx={emptyBoxSx}>Nenhum job de refresh em lote ainda.</Box>
            ) : (
              <>
                <Stack gap={1} mb={2}>
                  {refreshJobs.map((job) => {
                    const isSelected = selectedRefreshJobId === job.id;
                    return (
                      <Box
                        key={job.id}
                        onClick={() => setSelectedRefreshJobId(job.id)}
                        sx={{
                          ...rowSx,
                          cursor: "pointer",
                          border: isSelected ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(255,255,255,0.06)",
                          backgroundColor: isSelected ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.02)",
                          transition: "all 0.15s",
                        }}
                      >
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
                          <Box>
                            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }}>{job.name}</Typography>
                            <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                              {job.source_label || job.source_kind} · {job.processed_targets}/{job.total_targets} alvo(s)
                            </Typography>
                          </Box>
                          <StatusChip
                            label={job.status}
                            tone={
                              job.status === "completed" ? "success"
                              : job.status === "completed_with_errors" ? "warning"
                              : job.status === "failed" ? "error"
                              : "info"
                            }
                          />
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>

                {selectedRefreshJob && (
                  <Box sx={rowSx}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5} mb={1}>
                      <Box>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }}>{selectedRefreshJob.name}</Typography>
                        <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                          {selectedRefreshJob.source_label || selectedRefreshJob.source_kind} · Atualizado {formatDate(selectedRefreshJob.updated_at)}
                        </Typography>
                      </Box>
                      <Chip
                        label={`SMTP ${selectedRefreshJob.options.probe_smtp ? "on" : "off"}`}
                        size="small"
                        sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </Stack>
                    {selectedRefreshJob.error && (
                      <Typography sx={{ fontSize: "0.75rem", color: "#EF4444", mb: 1.5 }}>{selectedRefreshJob.error}</Typography>
                    )}
                    <Typography sx={{ ...sectionLabelSx, mb: 1.5 }}>Alvos recentes</Typography>
                    {loadingRefreshTargets ? (
                      <Stack direction="row" alignItems="center" gap={1.5} sx={{ ...rowSx, color: "#666" }}>
                        <CircularProgress size={14} color="inherit" />
                        <Typography sx={{ fontSize: "0.8125rem" }}>Carregando alvos...</Typography>
                      </Stack>
                    ) : refreshJobTargets.length === 0 ? (
                      <Box sx={emptyBoxSx}>Nenhum alvo carregado para este job.</Box>
                    ) : (
                      <Stack gap={1}>
                        {refreshJobTargets.slice(0, 8).map((target) => (
                          <Box key={target.id} sx={{ ...rowSx, py: 1.5 }}>
                            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
                              <Box>
                                <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }}>{target.cnpj}</Typography>
                                <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                                  {target.stage || "queued"} · {formatDate(target.updated_at)}
                                </Typography>
                              </Box>
                              <Chip label={target.status} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                            </Stack>
                            {target.error && <Typography sx={{ fontSize: "0.75rem", color: "#EF4444", mt: 1 }}>{target.error}</Typography>}
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Box>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* ── Listas Salvas + Itens da Lista ────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "0.95fr 1.35fr" }, gap: 2 }}>

        {/* Listas Salvas */}
        <Card sx={cardSx} elevation={0}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <ArchiveRounded sx={{ fontSize: 16, color: "#38BDF8" }} />
              <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0" }}>Listas salvas</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
              Use estas listas para separar segmentos, campanhas e lotes prontos para outreach.
            </Typography>

            {loading ? (
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ ...rowSx, color: "#666" }}>
                <CircularProgress size={14} color="inherit" />
                <Typography sx={{ fontSize: "0.8125rem" }}>Carregando listas...</Typography>
              </Stack>
            ) : lists.length === 0 ? (
              <Box sx={emptyBoxSx}>Nenhuma lista criada ainda. Salve leads de Results para comecar.</Box>
            ) : (
              <Stack gap={1}>
                {lists.map((list) => {
                  const isSelected = selectedListId === list.id;
                  return (
                    <Box
                      key={list.id}
                      onClick={() => setSelectedListId(list.id)}
                      sx={{
                        ...rowSx,
                        cursor: "pointer",
                        border: isSelected ? "1px solid rgba(56,189,248,0.35)" : "1px solid rgba(255,255,255,0.06)",
                        backgroundColor: isSelected ? "rgba(56,189,248,0.06)" : "rgba(255,255,255,0.02)",
                        transition: "all 0.15s",
                      }}
                    >
                      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }} noWrap>{list.name}</Typography>
                          <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }} noWrap>{list.description || "Sem descricao"}</Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); void handleDeleteList(list.id); }}
                          sx={{ color: "#444", "&:hover": { color: "#EF4444" } }}
                        >
                          <DeleteRounded sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Stack>
                      <Stack direction="row" alignItems="center" gap={1} mt={1.5}>
                        <Chip label={`${list.item_count} leads`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                        <Typography sx={{ fontSize: "0.75rem", color: "#555" }}>Atualizada em {formatDate(list.updated_at)}</Typography>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </CardContent>
        </Card>

        {/* Itens da Lista */}
        <Card sx={cardSx} elevation={0}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0", mb: 0.5 }}>
              {selectedList ? selectedList.name : "Itens da lista"}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
              Snapshot operacional dos leads salvos, pronto para reuso em campanhas e revisoes.
            </Typography>

            {!selectedListId ? (
              <Box sx={emptyBoxSx}>Selecione uma lista para visualizar os leads armazenados.</Box>
            ) : loadingItems ? (
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ ...rowSx, color: "#666" }}>
                <CircularProgress size={14} color="inherit" />
                <Typography sx={{ fontSize: "0.8125rem" }}>Carregando leads da lista...</Typography>
              </Stack>
            ) : items.length === 0 ? (
              <Box sx={emptyBoxSx}>Esta lista ainda esta vazia.</Box>
            ) : (
              <Stack gap={1}>
                {items.map((item) => {
                  const emp = item.empresa;
                  const whatsapp = emp.whatsapp_enriquecido || emp.whatsapp_publico;
                  const telefone = emp.telefone_final || emp.telefone_padrao || emp.telefone_enriquecido;
                  const email = emp.email_final || emp.email_enriquecido || emp.email;
                  return (
                    <Box key={`${item.id}-${item.cnpj}`} sx={rowSx}>
                      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }} noWrap>
                            {emp.nome_fantasia || emp.razao_social}
                          </Typography>
                          <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                            {emp.cnpj} · {emp.cidade || "-"} / {emp.uf || "-"}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => void handleRemoveItem(item.cnpj)}
                          sx={{ color: "#444", "&:hover": { color: "#EF4444" } }}
                        >
                          <DeleteRounded sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Stack>
                      <Stack direction="row" flexWrap="wrap" gap={0.75} mt={1.5}>
                        {email && (
                          <Chip
                            icon={<MailRounded sx={{ fontSize: 12 }} />}
                            label={email}
                            size="small"
                            sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(56,189,248,0.08)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.2)" }}
                          />
                        )}
                        {telefone && (
                          <Chip
                            icon={<PhoneRounded sx={{ fontSize: 12 }} />}
                            label={telefone}
                            size="small"
                            sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}
                          />
                        )}
                        {whatsapp && (
                          <Chip label={whatsapp} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(34,197,94,0.08)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.2)" }} />
                        )}
                        {emp.segmento && (
                          <Chip label={emp.segmento} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(56,189,248,0.08)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.2)" }} />
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* ── Buscas Salvas + Watchlist ──────────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.05fr 0.95fr" }, gap: 2 }}>

        {/* Buscas Salvas */}
        <Card sx={cardSx} elevation={0}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <BookmarkAddRounded sx={{ fontSize: 16, color: "#38BDF8" }} />
              <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0" }}>Buscas salvas e listas dinamicas</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
              Reexecute queries com 1 clique e abra o resultado direto no fluxo operacional do Hermes.
            </Typography>

            {loading ? (
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ ...rowSx, color: "#666" }}>
                <CircularProgress size={14} color="inherit" />
                <Typography sx={{ fontSize: "0.8125rem" }}>Carregando buscas salvas...</Typography>
              </Stack>
            ) : savedSearches.length === 0 ? (
              <Box sx={emptyBoxSx}>Nenhuma busca salva ainda. Use o Workbench para criar buscas e listas dinamicas.</Box>
            ) : (
              <Stack gap={1.5}>
                {savedSearches.map((search) => (
                  <Box key={search.id} sx={rowSx}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5} mb={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" gap={1} mb={0.5} flexWrap="wrap">
                          <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }}>{search.name}</Typography>
                          <StatusChip label={search.kind === "dynamic" ? "dinamica" : "salva"} tone={search.kind === "dynamic" ? "success" : "info"} />
                        </Stack>
                        <Typography sx={{ fontSize: "0.75rem", color: "#555" }}>
                          {search.description || "Sem descricao"} · Ultima execucao: {formatDate(search.last_run_at)}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => void handleDeleteSavedSearch(search.id)}
                        sx={{ color: "#444", "&:hover": { color: "#EF4444" } }}
                      >
                        <DeleteRounded sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Stack>
                    <Stack direction="row" flexWrap="wrap" gap={0.75} mb={2}>
                      <Chip label={`${(search.config.ufs ?? []).length || (search.config.uf ? 1 : 0)} UF(s)`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                      <Chip label={`${(search.config.cnaes ?? []).length} CNAE(s)`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                      <Chip label={`limite ${search.config.limite_empresas}`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                    </Stack>
                    <Stack gap={1}>
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={runningSavedSearchId === search.id ? <CircularProgress size={14} color="inherit" /> : undefined}
                        onClick={() => void handleRunSavedSearch(search)}
                        disabled={runningSavedSearchId === search.id}
                        sx={{ fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px", borderColor: "rgba(255,255,255,0.12)", color: "#A0A0A0", "&:hover": { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.04)" } }}
                      >
                        Abrir no Results
                      </Button>
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={queueingRefreshKey === `search:${search.id}` ? <CircularProgress size={14} color="inherit" /> : <RefreshRounded sx={{ fontSize: 16 }} />}
                        onClick={() => void handleQueueSavedSearchRefresh(search)}
                        disabled={queueingRefreshKey === `search:${search.id}`}
                        sx={{ fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px", borderColor: "rgba(255,255,255,0.08)", color: "#666", "&:hover": { borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.03)" } }}
                      >
                        Reverificar leads desta busca
                      </Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        {/* Watchlist */}
        <Card sx={cardSx} elevation={0}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <TrackChangesRounded sx={{ fontSize: 16, color: "#22C55E" }} />
              <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0" }}>Watchlist e refresh</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
              Acompanhe empresas, gere sinais internos e monitore WhatsApp acionavel.
            </Typography>

            <Stack gap={1.5} mb={2}>
              <TextField
                size="small"
                value={manualWatchCnpj}
                onChange={(e) => setManualWatchCnpj(e.target.value)}
                placeholder="CNPJ para acompanhar"
                fullWidth
                sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.8125rem" } }}
              />
              <TextField
                size="small"
                multiline
                rows={3}
                value={manualWatchReason}
                onChange={(e) => setManualWatchReason(e.target.value)}
                placeholder="Motivo do acompanhamento"
                fullWidth
                sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.8125rem" } }}
              />
              <Button
                fullWidth
                variant="contained"
                color="success"
                startIcon={savingWatch ? <CircularProgress size={14} color="inherit" /> : <TrackChangesRounded sx={{ fontSize: 16 }} />}
                onClick={() => void handleFollowCompany()}
                disabled={savingWatch}
                sx={{ fontWeight: 600, fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px", backgroundColor: "#22C55E", "&:hover": { backgroundColor: "#16A34A" } }}
              >
                Seguir empresa
              </Button>
            </Stack>

            {loading ? (
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ ...rowSx, color: "#666" }}>
                <CircularProgress size={14} color="inherit" />
                <Typography sx={{ fontSize: "0.8125rem" }}>Carregando watchlist...</Typography>
              </Stack>
            ) : watchlist.length === 0 ? (
              <Box sx={emptyBoxSx}>Nenhuma empresa acompanhada ainda.</Box>
            ) : (
              <Stack gap={1.5}>
                {watchlist.map((entry) => (
                  <Box key={entry.id} sx={rowSx}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5} mb={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }} noWrap>
                          {entry.nome_fantasia || entry.razao_social || entry.cnpj}
                        </Typography>
                        <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                          {entry.cnpj} · {entry.cidade || "-"} / {entry.uf || "-"}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => void handleUnfollowCompany(entry.cnpj)}
                        sx={{ color: "#444", "&:hover": { color: "#EF4444" } }}
                      >
                        <DeleteRounded sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Stack>
                    <Stack direction="row" flexWrap="wrap" gap={0.75} mb={1.5}>
                      <Chip label={`${entry.signal_count} signal(s)`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                      <Chip label={`${entry.snapshot.decision_makers ?? 0} decisor(es)`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(56,189,248,0.08)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.2)" }} />
                      <Chip label={`${entry.snapshot.deliverable_emails ?? 0} email(s)`} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(56,189,248,0.06)", color: "#60A5FA", border: "1px solid rgba(56,189,248,0.15)" }} />
                      <StatusChip
                        label={`WA valido: ${entry.snapshot.validated_whatsapp_candidates ?? 0}`}
                        tone={entry.snapshot.has_whatsapp_validated ? "success" : "default"}
                      />
                    </Stack>
                    <Typography sx={{ fontSize: "0.75rem", color: "#555", mb: 1.5 }}>
                      Padrao: {entry.snapshot.email_pattern || "nao resolvido"} · Ultimo refresh: {formatDate(entry.last_refresh_at)}
                    </Typography>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={refreshingWatchCnpj === entry.cnpj ? <CircularProgress size={14} color="inherit" /> : <RefreshRounded sx={{ fontSize: 16 }} />}
                      onClick={() => void handleRefreshWatch(entry.cnpj)}
                      disabled={refreshingWatchCnpj === entry.cnpj}
                      sx={{ fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px", borderColor: "rgba(255,255,255,0.08)", color: "#666", "&:hover": { borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.03)" } }}
                    >
                      Atualizar sinais
                    </Button>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* ── Supressao + Signals ────────────────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "0.9fr 1.4fr" }, gap: 2 }}>

        {/* Nova Supressao */}
        <Card sx={cardSx} elevation={0}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <BlockRounded sx={{ fontSize: 16, color: "#F59E0B" }} />
              <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0" }}>Nova supressao</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
              Bloqueie CNPJs, e-mails ou dominios para que nao retornem nas proximas prospeccoes.
            </Typography>
            <Stack gap={1.5}>
              <TextField size="small" value={manualCnpj} onChange={(e) => setManualCnpj(e.target.value)} placeholder="CNPJs separados por virgula" fullWidth sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.8125rem" } }} />
              <TextField size="small" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="E-mails separados por virgula" fullWidth sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.8125rem" } }} />
              <TextField size="small" value={manualDomain} onChange={(e) => setManualDomain(e.target.value)} placeholder="Dominios separados por virgula" fullWidth sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.8125rem" } }} />
              <TextField size="small" multiline rows={3} value={manualReason} onChange={(e) => setManualReason(e.target.value)} placeholder="Motivo da supressao" fullWidth sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.8125rem" } }} />
              <Button
                fullWidth
                variant="contained"
                startIcon={savingSuppression ? <CircularProgress size={14} color="inherit" /> : <SpeakerNotesOffRounded sx={{ fontSize: 16 }} />}
                onClick={() => void handleManualSuppression()}
                disabled={savingSuppression}
                sx={{ fontWeight: 600, fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px", backgroundColor: "#F59E0B", color: "#0F0F0F", "&:hover": { backgroundColor: "#D97706" } }}
              >
                Registrar supressao
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Signals Recentes */}
        <Card sx={cardSx} elevation={0}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0", mb: 0.5 }}>Signals recentes</Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
              Eventos internos do Hermes para timing de abordagem e cobertura de contato.
            </Typography>

            {loading ? (
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ ...rowSx, color: "#666" }}>
                <CircularProgress size={14} color="inherit" />
                <Typography sx={{ fontSize: "0.8125rem" }}>Carregando sinais...</Typography>
              </Stack>
            ) : signals.length === 0 ? (
              <Box sx={emptyBoxSx}>Nenhum sinal registrado ainda.</Box>
            ) : (
              <Stack gap={1}>
                {signals.map((signal) => (
                  <Box key={signal.id} sx={rowSx}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5} mb={0.5}>
                      <Box>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }}>{signal.title}</Typography>
                        <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                          {signal.cnpj} · {formatDate(signal.created_at)}
                        </Typography>
                      </Box>
                      <Chip label={signal.signal_type} size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />
                    </Stack>
                    {signal.payload && Object.keys(signal.payload).length > 0 && (
                      <Box
                        component="pre"
                        sx={{
                          mt: 1.5, p: 1.5, overflow: "auto", borderRadius: "8px",
                          backgroundColor: "#0D0D0D", border: "1px solid rgba(255,255,255,0.06)",
                          fontSize: "0.6875rem", lineHeight: 1.7, color: "#888", fontFamily: "monospace",
                        }}
                      >
                        {JSON.stringify(signal.payload, null, 2)}
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* ── Registro de Supressao ──────────────────────────────────────────── */}
      <Card sx={cardSx} elevation={0}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "#F0F0F0", mb: 0.5 }}>Registro de supressao</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
            Itens bloqueados da prospeccao automatica para evitar retrabalho e contato indevido.
          </Typography>

          {loading ? (
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ ...rowSx, color: "#666" }}>
              <CircularProgress size={14} color="inherit" />
              <Typography sx={{ fontSize: "0.8125rem" }}>Carregando supressoes...</Typography>
            </Stack>
          ) : suppressions.length === 0 ? (
            <Box sx={emptyBoxSx}>Nenhuma supressao cadastrada.</Box>
          ) : (
            <Stack gap={1}>
              {suppressions.map((entry) => (
                <Stack key={entry.id} direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5} sx={rowSx}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#E0E0E0" }}>
                      {entry.cnpj || entry.email || entry.domain || "Registro"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>
                      {entry.reason || "Sem motivo informado"} · {formatDate(entry.updated_at || entry.created_at)}
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.75} mt={1}>
                      {entry.cnpj && <Chip label="CNPJ" size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }} />}
                      {entry.email && <Chip label="E-mail" size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(56,189,248,0.08)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.2)" }} />}
                      {entry.domain && <Chip label="Dominio" size="small" sx={{ fontSize: "0.6875rem", backgroundColor: "rgba(56,189,248,0.06)", color: "#60A5FA", border: "1px solid rgba(56,189,248,0.15)" }} />}
                    </Stack>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => void handleRemoveSuppression(entry.id)}
                    sx={{ color: "#444", "&:hover": { color: "#EF4444" } }}
                  >
                    <DeleteRounded sx={{ fontSize: 15 }} />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog: Criar Lista ────────────────────────────────────────────── */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        PaperProps={{ sx: { backgroundColor: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", minWidth: 420 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: "1rem", color: "#F0F0F0", pb: 1 }}>
          Criar nova lista
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: "0.8125rem", color: "#666", mb: 2 }}>
            De um nome para a lista e use Results para alimentar os leads selecionados.
          </DialogContentText>
          <Stack gap={1.5}>
            <TextField
              size="small"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Ex.: Imobiliarias SP - rodada 1"
              fullWidth
              autoFocus
              sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.8125rem" } }}
            />
            <TextField
              size="small"
              multiline
              rows={3}
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Descricao opcional"
              fullWidth
              sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#181818", fontSize: "0.8125rem" } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setCreateDialogOpen(false)}
            sx={{ fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px", borderColor: "rgba(255,255,255,0.1)", color: "#888" }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateList()}
            disabled={creating}
            startIcon={creating ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ fontWeight: 600, fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px" }}
          >
            Criar lista
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LeadLists;
