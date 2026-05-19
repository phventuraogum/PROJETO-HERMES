import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  BookmarkPlus,
  Clock3,
  FolderPlus,
  Loader2,
  Mail,
  MessageCircle,
  MessageCircleOff,
  Phone,
  Radar,
  RefreshCw,
  ShieldBan,
  Trash2,
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
import { Textarea } from "@/components/ui/textarea";
import {
  createLeadRefreshJob,
  createLeadList,
  createLeadSuppressions,
  deleteLeadList,
  deleteSavedSearch,
  getResultados,
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
  type ResultadoSalvo,
  type SavedSearchSummary,
  type WatchCompany,
  type Empresa,
} from "@/lib/api";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

function normalizeCnpjDigits(value: string | undefined | null): string {
  return String(value || "").replace(/\D/g, "").slice(0, 14);
}

function empresaTemWhatsappAcionavel(e: Empresa): boolean {
  if (Array.isArray(e.whatsapps_captados) && e.whatsapps_captados.length > 0) return true;
  for (const f of [e.whatsapp_final, e.whatsapp_enriquecido, e.whatsapp_publico]) {
    const s = String(f || "").trim().toLowerCase();
    if (s && s !== "nan" && s !== "null" && s !== "none") return true;
  }
  return false;
}

function buildProspectionKpis(saved: ResultadoSalvo | null): {
  total: number;
  comWhatsapp: number;
  semWhatsapp: number;
  duplicadosCnpj: number;
  timestamp?: string | null;
  termo?: string | null;
} | null {
  const empresas = saved?.resultado?.empresas;
  if (!saved || !Array.isArray(empresas) || empresas.length === 0) return null;
  const total = empresas.length;
  const comWhatsapp = empresas.filter((e) => empresaTemWhatsappAcionavel(e)).length;
  const semWhatsapp = Math.max(0, total - comWhatsapp);
  const seen = new Set<string>();
  let dup = 0;
  for (const e of empresas) {
    const c = normalizeCnpjDigits(e.cnpj);
    if (!c) continue;
    if (seen.has(c)) dup += 1;
    else seen.add(c);
  }
  return {
    total,
    comWhatsapp,
    semWhatsapp,
    duplicadosCnpj: dup,
    timestamp: saved.timestamp,
    termo: saved.config?.termo_base ?? null,
  };
}

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
  const [reloadingSignals, setReloadingSignals] = useState(false);
  const [ultimaProspeccao, setUltimaProspeccao] = useState<ResultadoSalvo | null>(null);

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
  const reloadSignals = async () => setSignals(await getCompanySignals({ limit: 200 }));
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
          nextUltima,
        ] = await Promise.all([
          getLeadLists(),
          getLeadSuppressions(),
          getSavedSearches(),
          getCompanyWatchlist(),
          getCompanyDataHealth(8),
          getCompanySignals({ limit: 200 }),
          getLeadRefreshJobs(20),
          getLeadRefreshStates({ dueOnly: true, limit: 20 }),
          getResultados(),
        ]);
        setLists(nextLists);
        setSuppressions(nextSuppressions);
        setSavedSearches(nextSavedSearches);
        setWatchlist(nextWatchlist);
        setCompanyDataHealth(nextCompanyDataHealth);
        setSignals(nextSignals);
        setRefreshJobs(nextRefreshJobs);
        setRefreshStates(nextRefreshStates);
        setUltimaProspeccao(nextUltima);
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
    if (!selectedListId) {
      setItems([]);
      return;
    }
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
    if (!selectedRefreshJobId) {
      setRefreshJobTargets([]);
      return;
    }
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
          // polling best-effort; explicit handlers already report on direct actions
        }
      })();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeRefreshJobs.length, selectedRefreshJobId]);

  const handleCreateList = async () => {
    const name = createName.trim();
    if (!name) {
      toast.info("Informe um nome para a lista.");
      return;
    }
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

  const handleReloadSignals = async () => {
    try {
      setReloadingSignals(true);
      await Promise.all([reloadSignals(), reloadWatchlist()]);
      toast.success("Sinais atualizados.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel atualizar os sinais.");
    } finally {
      setReloadingSignals(false);
    }
  };

  const watchByCnpj = useMemo(
    () =>
      watchlist.reduce<Record<string, WatchCompany>>((acc, entry) => {
        if (entry.cnpj) acc[entry.cnpj] = entry;
        return acc;
      }, {}),
    [watchlist],
  );

  const prospectKpis = useMemo(() => buildProspectionKpis(ultimaProspeccao), [ultimaProspeccao]);

  const registryVazio =
    lists.length === 0 &&
    watchlist.length === 0 &&
    refreshJobs.length === 0 &&
    savedSearches.length === 0 &&
    signals.length === 0;

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
    const cnpjs = manualCnpj.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
    const emails = manualEmail.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
    const domains = manualDomain.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
    if (cnpjs.length === 0 && emails.length === 0 && domains.length === 0) {
      toast.info("Informe ao menos um CNPJ, e-mail ou dominio.");
      return;
    }
    try {
      setSavingSuppression(true);
      const result = await createLeadSuppressions({
        cnpjs,
        emails,
        domains,
        reason: manualReason.trim() || null,
        source: "lead_lists_page",
      });
      setManualCnpj("");
      setManualEmail("");
      setManualDomain("");
      setManualReason("");
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
    if (!manualWatchCnpj.trim()) {
      toast.info("Informe um CNPJ para acompanhar.");
      return;
    }
    try {
      setSavingWatch(true);
      const result = await followCompany({
        cnpj: manualWatchCnpj.trim(),
        reason: manualWatchReason.trim() || null,
        source: "lead_lists_page",
      });
      setManualWatchCnpj("");
      setManualWatchReason("");
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
    if (!selectedList) {
      toast.info("Selecione uma lista para reverificar.");
      return;
    }
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
    if (watchlist.length === 0) {
      toast.info("Nenhuma empresa na watchlist para reverificar.");
      return;
    }
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

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-display tracking-tight">Listas, buscas e signals</h1>
          <p className="text-sm text-muted-foreground">
            Organize listas estaticas, rode buscas salvas, acompanhe empresas e bloqueie contatos improdutivos.
          </p>
        </div>
        <Button
          type="button"
          className="h-10 gap-2 bg-cyan-500 text-muted-foreground hover:bg-cyan-400"
          onClick={() => setCreateDialogOpen(true)}
        >
          <FolderPlus className="h-4 w-4" />
          Criar lista
        </Button>
      </div>

      {registryVazio && (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Por que está tudo em zero?</p>
          <p className="mt-2">
            Esta página usa o <strong className="text-foreground">registry operacional</strong> (listas salvas,
            watchlist, jobs de reverificação e sinais). Ela <strong className="text-foreground">não importa
            automaticamente</strong> os leads da última prospecção.
          </p>
          <p className="mt-2">
            Depois de prospectar em <strong className="text-foreground">Resultados</strong>, use{" "}
            <strong className="text-foreground">adicionar à lista</strong> ou crie uma lista e envie os selecionados —
            ou acrescente CNPJs na <strong className="text-foreground">watchlist</strong> abaixo para gerar sinais e
            métricas de saúde.
          </p>
        </div>
      )}

      {prospectKpis && (
        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Última prospecção (Resultados)</CardTitle>
              <CardDescription>
                Resumo do último lote disponível no app (local ou servidor).{" "}
                {prospectKpis.termo ? (
                  <>
                    Busca: <span className="text-foreground/90">{prospectKpis.termo}</span>
                  </>
                ) : null}
                {prospectKpis.timestamp ? (
                  <>
                    {" "}
                    · {formatDate(prospectKpis.timestamp)}
                  </>
                ) : null}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border bg-muted/20"
              onClick={() => navigate("/results")}
            >
              Abrir Resultados
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Total de leads",
                  value: prospectKpis.total,
                  tone: "border-slate-500/30 bg-slate-500/10 text-slate-200",
                  icon: Radar,
                },
                {
                  label: "Leads com WhatsApp",
                  value: prospectKpis.comWhatsapp,
                  tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                  icon: MessageCircle,
                },
                {
                  label: "Leads sem WhatsApp",
                  value: prospectKpis.semWhatsapp,
                  tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",
                  icon: MessageCircleOff,
                },
                {
                  label: "CNPJ duplicado no lote",
                  value: prospectKpis.duplicadosCnpj,
                  tone: "border-violet-500/30 bg-violet-500/10 text-violet-300",
                  icon: Archive,
                },
              ].map((tile) => (
                <div key={tile.label} className={`rounded-xl border p-4 ${tile.tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] opacity-90">{tile.label}</p>
                      <p className="mt-2 text-2xl font-display">{tile.value}</p>
                    </div>
                    <tile.icon className="mt-0.5 h-4 w-4 opacity-90" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card shadow-surface-sm">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radar className="h-4 w-4 text-cyan-300" />
              Data Health Center
            </CardTitle>
            <CardDescription>
              Leitura Apollo-style da watchlist para detectar gaps de mobile e WhatsApp acionavel antes do outreach.
              {(companyDataHealth?.summary.watchlist_total ?? 0) === 0
                ? " Com watchlist vazia, os cartões abaixo ficam em zero — use o resumo da prospecção acima ou adicione empresas à watchlist."
                : ""}
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
            Watchlist {companyDataHealth?.summary.watchlist_total ?? 0}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: "Sem mobile",
                value: companyDataHealth?.summary.without_mobile ?? 0,
                tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",
                icon: Phone,
              },
              {
                label: "Sem WhatsApp validado",
                value: companyDataHealth?.summary.without_verified_whatsapp ?? 0,
                tone: "border-rose-500/30 bg-rose-500/10 text-rose-300",
                icon: MessageCircleOff,
              },
              {
                label: "Sem mobile decisor",
                value: companyDataHealth?.summary.without_decision_maker_mobile ?? 0,
                tone: "border-sky-500/30 bg-sky-500/10 text-sky-300",
                icon: BookmarkPlus,
              },
              {
                label: "Snapshots stale",
                value: companyDataHealth?.summary.stale_records ?? 0,
                tone: "border-violet-500/30 bg-violet-500/10 text-violet-300",
                icon: Clock3,
              },
              {
                label: "Cobertura ativa",
                value: Math.max(
                  0,
                  (companyDataHealth?.summary.watchlist_total ?? 0) -
                    (companyDataHealth?.summary.without_mobile ?? 0),
                ),
                tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                icon: Radar,
              },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em]">{item.label}</p>
                    <p className="mt-2 text-2xl font-display">{item.value}</p>
                  </div>
                  <item.icon className="mt-0.5 h-4 w-4" />
                </div>
              </div>
            ))}
          </div>

          {!companyDataHealth || companyDataHealth.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
              Nenhum gap relevante identificado na watchlist ainda.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">Top gaps</p>
              {companyDataHealth.items.slice(0, 6).map((item) => (
                <div key={item.cnpj} className="rounded-xl border border-border bg-muted/20/50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {item.nome_fantasia || item.razao_social || item.cnpj}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {item.cnpj} . {[item.cidade, item.uf].filter(Boolean).join(" / ") || "Sem localizacao"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        item.gap_score >= 4
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                          : item.gap_score >= 2
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                            : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                      }
                    >
                      Gap score {item.gap_score}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      Mobiles {item.mobile_candidates}
                    </Badge>
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      WhatsApps validados {item.verified_whatsapp_candidates}
                    </Badge>
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      Mobiles decisor {item.decision_maker_mobile_candidates}
                    </Badge>
                    {item.stale && (
                      <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-300">
                        Snapshot stale
                      </Badge>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground/70">
                    Ultimo snapshot: {formatDate(item.generated_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RefreshCw className="h-4 w-4 text-cyan-300" />
              Bulk center e reverificacao
            </CardTitle>
            <CardDescription>
              Reenriquece listas, watchlist e buscas salvas em background para manter contatos frescos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Button
                type="button"
                className="justify-start gap-2 bg-cyan-500 text-muted-foreground hover:bg-cyan-400"
                onClick={() => void handleQueueWatchlistRefresh()}
                disabled={queueingRefreshKey === "watchlist" || watchlist.length === 0}
              >
                {queueingRefreshKey === "watchlist" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Reverificar watchlist
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start gap-2 border-border bg-muted/20"
                onClick={() => void handleQueueSelectedListRefresh()}
                disabled={queueingRefreshKey === `list:${selectedList?.id || ""}` || !selectedList}
              >
                {queueingRefreshKey === `list:${selectedList?.id || ""}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                Reverificar lista ativa
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted/20/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">Jobs ativos</p>
                <p className="mt-2 text-2xl font-display text-foreground">{activeRefreshJobs.length}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">Executando no worker</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">Pendentes</p>
                <p className="mt-2 text-2xl font-display text-foreground">{refreshStates.length}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">CNPJs com refresh vencido</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">Lista ativa</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{selectedList?.name || "Nenhuma"}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">{selectedList?.item_count || 0} lead(s)</p>
              </div>
            </div>

            {refreshStates.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">Fila natural de reverificacao</p>
                {refreshStates.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-border bg-muted/20/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{entry.cnpj}</p>
                        <p className="text-xs text-muted-foreground/70">
                          Proximo refresh: {formatDate(entry.next_refresh_at)} . Ultimo refresh: {formatDate(entry.last_refresh_at)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          entry.freshness_status === "fresh"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : entry.freshness_status === "warming"
                              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        }
                      >
                        {entry.freshness_status || "pendente"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock3 className="h-4 w-4 text-emerald-300" />
              Jobs recentes
            </CardTitle>
            <CardDescription>
              Acompanhe refresh de listas, buscas salvas e watchlist sem travar o frontend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando jobs de refresh...
              </div>
            ) : refreshJobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                Nenhum job de refresh em lote ainda.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {refreshJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedRefreshJobId(job.id)}
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        selectedRefreshJobId === job.id
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-border bg-muted/20/50 hover:border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{job.name}</p>
                          <p className="text-xs text-muted-foreground/70">
                            {job.source_label || job.source_kind} . {job.processed_targets}/{job.total_targets} alvo(s)
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            job.status === "completed"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : job.status === "completed_with_errors"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                : job.status === "failed"
                                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                                  : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                          }
                        >
                          {job.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedRefreshJob && (
                  <div className="rounded-xl border border-border bg-muted/20/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{selectedRefreshJob.name}</p>
                        <p className="text-xs text-muted-foreground/70">
                          {selectedRefreshJob.source_label || selectedRefreshJob.source_kind} . Atualizado {formatDate(selectedRefreshJob.updated_at)}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                        SMTP {selectedRefreshJob.options.probe_smtp ? "on" : "off"}
                      </Badge>
                    </div>
                    {selectedRefreshJob.error && (
                      <p className="mt-3 text-xs text-rose-300">{selectedRefreshJob.error}</p>
                    )}
                    <div className="mt-4 space-y-2">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">Alvos recentes</p>
                      {loadingRefreshTargets ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-card/70 p-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Carregando alvos...
                        </div>
                      ) : refreshJobTargets.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-card p-3 text-sm text-muted-foreground/70">
                          Nenhum alvo carregado para este job.
                        </div>
                      ) : (
                        refreshJobTargets.slice(0, 8).map((target) => (
                          <div key={target.id} className="rounded-xl border border-border bg-card/70 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">{target.cnpj}</p>
                                <p className="text-xs text-muted-foreground/70">
                                  {target.stage || "queued"} . {formatDate(target.updated_at)}
                                </p>
                              </div>
                              <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                                {target.status}
                              </Badge>
                            </div>
                            {target.error && <p className="mt-2 text-xs text-rose-300">{target.error}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Archive className="h-4 w-4 text-cyan-300" />
              Listas salvas
            </CardTitle>
            <CardDescription>
              Use estas listas para separar segmentos, campanhas e lotes prontos para outreach.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando listas...
              </div>
            ) : lists.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                Nenhuma lista criada ainda. Salve leads de Results para comecar.
              </div>
            ) : (
              lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedListId(list.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    selectedListId === list.id
                      ? "border-cyan-500/40 bg-cyan-500/10"
                      : "border-border bg-muted/20/50 hover:border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{list.name}</p>
                      <p className="text-xs text-muted-foreground/70">{list.description || "Sem descricao"}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground/70 hover:text-rose-300"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteList(list.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/70">
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      {list.item_count} leads
                    </Badge>
                    <span>Atualizada em {formatDate(list.updated_at)}</span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="text-lg">{selectedList ? selectedList.name : "Itens da lista"}</CardTitle>
            <CardDescription>
              Snapshot operacional dos leads salvos, pronto para reuso em campanhas e revisoes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedListId ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                Selecione uma lista para visualizar os leads armazenados.
              </div>
            ) : loadingItems ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando leads da lista...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                Esta lista ainda esta vazia.
              </div>
            ) : (
              items.map((item) => {
                const emp = item.empresa;
                const whatsapp = emp.whatsapp_enriquecido || emp.whatsapp_publico;
                const telefone = emp.telefone_final || emp.telefone_padrao || emp.telefone_enriquecido;
                const email = emp.email_final || emp.email_enriquecido || emp.email;
                return (
                  <div key={`${item.id}-${item.cnpj}`} className="rounded-xl border border-border bg-muted/20/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{emp.nome_fantasia || emp.razao_social}</p>
                        <p className="text-xs text-muted-foreground/70">
                          {emp.cnpj} . {emp.cidade || "-"} / {emp.uf || "-"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground/70 hover:text-rose-300"
                        onClick={() => void handleRemoveItem(item.cnpj)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {email && (
                        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                          <Mail className="mr-1 h-3 w-3" />
                          {email}
                        </Badge>
                      )}
                      {telefone && (
                        <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                          <Phone className="mr-1 h-3 w-3" />
                          {telefone}
                        </Badge>
                      )}
                      {whatsapp && (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          {whatsapp}
                        </Badge>
                      )}
                      {emp.segmento && (
                        <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                          {emp.segmento}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookmarkPlus className="h-4 w-4 text-cyan-300" />
              Buscas salvas e listas dinamicas
            </CardTitle>
            <CardDescription>
              Reexecute queries com 1 clique e abra o resultado direto no fluxo operacional do Hermes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando buscas salvas...
              </div>
            ) : savedSearches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                Nenhuma busca salva ainda. Use o Workbench para criar buscas e listas dinamicas.
              </div>
            ) : (
              savedSearches.map((search) => (
                <div key={search.id} className="rounded-xl border border-border bg-muted/20/50 p-4">
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
                      size="icon"
                      className="h-7 w-7 text-muted-foreground/70 hover:text-rose-300"
                      onClick={() => void handleDeleteSavedSearch(search.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full border-border bg-card text-foreground shadow-surface-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() => void handleRunSavedSearch(search)}
                    disabled={runningSavedSearchId === search.id}
                  >
                    {runningSavedSearchId === search.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Abrir no Results
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 w-full border-border bg-muted/20"
                    onClick={() => void handleQueueSavedSearchRefresh(search)}
                    disabled={queueingRefreshKey === `search:${search.id}`}
                  >
                    {queueingRefreshKey === `search:${search.id}` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Reverificar leads desta busca
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radar className="h-4 w-4 text-emerald-300" />
              Watchlist e refresh
            </CardTitle>
            <CardDescription>
              Acompanhe empresas, gere sinais internos e monitore WhatsApp acionavel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={manualWatchCnpj}
              onChange={(event) => setManualWatchCnpj(event.target.value)}
              placeholder="CNPJ para acompanhar"
              className="border-border bg-muted/20"
            />
            <Textarea
              value={manualWatchReason}
              onChange={(event) => setManualWatchReason(event.target.value)}
              placeholder="Motivo do acompanhamento"
              className="min-h-[84px] border-border bg-muted/20"
            />
            <Button
              type="button"
              className="w-full gap-2 bg-emerald-500 text-muted-foreground hover:bg-emerald-400"
              onClick={() => void handleFollowCompany()}
              disabled={savingWatch}
            >
              {savingWatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              Seguir empresa
            </Button>
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando watchlist...
              </div>
            ) : watchlist.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                Nenhuma empresa acompanhada ainda.
              </div>
            ) : (
              watchlist.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-border bg-muted/20/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {entry.nome_fantasia || entry.razao_social || entry.cnpj}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {entry.cnpj} . {entry.cidade || "-"} / {entry.uf || "-"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground/70 hover:text-rose-300"
                      onClick={() => void handleUnfollowCompany(entry.cnpj)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      {entry.signal_count} signal(s)
                    </Badge>
                    <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                      {entry.snapshot.decision_makers ?? 0} decisor(es)
                    </Badge>
                    <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                      {entry.snapshot.deliverable_emails ?? 0} email(s) deliverable
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        entry.snapshot.has_whatsapp_validated
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-border bg-muted/20 text-foreground/80"
                      }
                    >
                      WA valido: {entry.snapshot.validated_whatsapp_candidates ?? 0}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground/70">
                    Padrao: {entry.snapshot.email_pattern || "nao resolvido"} . Ultimo refresh: {formatDate(entry.last_refresh_at)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full border-border bg-muted/20"
                    onClick={() => void handleRefreshWatch(entry.cnpj)}
                    disabled={refreshingWatchCnpj === entry.cnpj}
                  >
                    {refreshingWatchCnpj === entry.cnpj ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Atualizar sinais
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldBan className="h-4 w-4 text-amber-300" />
              Nova supressao
            </CardTitle>
            <CardDescription>
              Bloqueie CNPJs, e-mails ou dominios para que nao retornem nas proximas prospeccoes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={manualCnpj}
              onChange={(event) => setManualCnpj(event.target.value)}
              placeholder="CNPJs separados por virgula"
              className="border-border bg-muted/20"
            />
            <Input
              value={manualEmail}
              onChange={(event) => setManualEmail(event.target.value)}
              placeholder="E-mails separados por virgula"
              className="border-border bg-muted/20"
            />
            <Input
              value={manualDomain}
              onChange={(event) => setManualDomain(event.target.value)}
              placeholder="Dominios separados por virgula"
              className="border-border bg-muted/20"
            />
            <Textarea
              value={manualReason}
              onChange={(event) => setManualReason(event.target.value)}
              placeholder="Motivo da supressao"
              className="min-h-[96px] border-border bg-muted/20"
            />
            <Button
              type="button"
              className="w-full gap-2 bg-amber-500 text-muted-foreground hover:bg-amber-400"
              onClick={() => void handleManualSuppression()}
              disabled={savingSuppression}
            >
              {savingSuppression ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleOff className="h-4 w-4" />}
              Registrar supressao
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-surface-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Signals recentes</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 border-border bg-muted/20"
                onClick={() => void handleReloadSignals()}
                disabled={reloadingSignals}
              >
                {reloadingSignals ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar sinais
              </Button>
            </div>
            <CardDescription>
              Eventos internos do Hermes para timing de abordagem e cobertura de contato (ultimos 200 sinais).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando sinais...
              </div>
            ) : signals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
                Nenhum sinal registrado ainda.
              </div>
            ) : (
              signals.map((signal) => {
                const watch = watchByCnpj[signal.cnpj];
                const nomeEmpresa = watch?.nome_fantasia || watch?.razao_social || null;
                return (
                <div key={signal.id} className="rounded-xl border border-border bg-muted/20/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{signal.title}</p>
                      {nomeEmpresa && (
                        <p className="text-xs text-muted-foreground/80">
                          {nomeEmpresa}
                          {(watch?.cidade || watch?.uf) ? ` . ${watch?.cidade || "-"}${watch?.uf ? `/${watch.uf}` : ""}` : ""}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground/70">
                        {signal.cnpj} . {formatDate(signal.created_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">
                      {signal.signal_type}
                    </Badge>
                  </div>
                  {signal.payload && Object.keys(signal.payload).length > 0 && (
                    <pre className="mt-3 overflow-auto rounded-xl border border-border bg-card/70 p-3 text-[11px] leading-5 text-muted-foreground">
                      {JSON.stringify(signal.payload, null, 2)}
                    </pre>
                  )}
                </div>
              );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card shadow-surface-sm">
        <CardHeader>
          <CardTitle className="text-lg">Registro de supressao</CardTitle>
          <CardDescription>
            Itens bloqueados da prospeccao automatica para evitar retrabalho e contato indevido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando supressoes...
            </div>
          ) : suppressions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground/70">
              Nenhuma supressao cadastrada.
            </div>
          ) : (
            suppressions.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/20/50 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {entry.cnpj || entry.email || entry.domain || "Registro"}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {entry.reason || "Sem motivo informado"} . {formatDate(entry.updated_at || entry.created_at)}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {entry.cnpj && <Badge variant="outline" className="border-border bg-muted/20 text-foreground/80">CNPJ</Badge>}
                    {entry.email && <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">E-mail</Badge>}
                    {entry.domain && <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">Dominio</Badge>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/70 hover:text-rose-300"
                  onClick={() => void handleRemoveSuppression(entry.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Criar nova lista</DialogTitle>
            <DialogDescription>
              De um nome para a lista e use Results para alimentar os leads selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Ex.: Imobiliarias SP - rodada 1"
              className="border-border bg-muted/20"
            />
            <Textarea
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              placeholder="Descricao opcional"
              className="min-h-[96px] border-border bg-muted/20"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-border bg-muted/20"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-cyan-500 text-muted-foreground hover:bg-cyan-400"
              onClick={() => void handleCreateList()}
              disabled={creating}
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Criar lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadLists;
