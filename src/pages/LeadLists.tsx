import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  BookmarkPlus,
  FolderPlus,
  Loader2,
  Mail,
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
  createLeadList,
  createLeadSuppressions,
  deleteLeadList,
  deleteSavedSearch,
  followCompany,
  getCompanySignals,
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

const LeadLists = () => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<LeadListSummary[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [suppressions, setSuppressions] = useState<LeadSuppression[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchSummary[]>([]);
  const [watchlist, setWatchlist] = useState<WatchCompany[]>([]);
  const [signals, setSignals] = useState<CompanySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
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

  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId],
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
  const reloadSignals = async () => setSignals(await getCompanySignals({ limit: 30 }));

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [nextLists, nextSuppressions, nextSavedSearches, nextWatchlist, nextSignals] = await Promise.all([
          getLeadLists(),
          getLeadSuppressions(),
          getSavedSearches(),
          getCompanyWatchlist(),
          getCompanySignals({ limit: 30 }),
        ]);
        setLists(nextLists);
        setSuppressions(nextSuppressions);
        setSavedSearches(nextSavedSearches);
        setWatchlist(nextWatchlist);
        setSignals(nextSignals);
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
      await Promise.all([reloadWatchlist(), reloadSignals()]);
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
      await Promise.all([reloadWatchlist(), reloadSignals()]);
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
      await Promise.all([reloadWatchlist(), reloadSignals()]);
      toast.success("Empresa removida da watchlist.");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel remover a empresa da watchlist.");
    }
  };

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Listas, buscas e signals</h2>
          <p className="text-sm text-muted-foreground">
            Organize listas estaticas, rode buscas salvas, acompanhe empresas e bloqueie contatos improdutivos.
          </p>
        </div>
        <Button
          type="button"
          className="h-10 gap-2 bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
          onClick={() => setCreateDialogOpen(true)}
        >
          <FolderPlus className="h-4 w-4" />
          Criar lista
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
        <Card className="border-zinc-800 bg-zinc-950/60">
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
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando listas...
              </div>
            ) : lists.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-500">
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
                      : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-100">{list.name}</p>
                      <p className="text-xs text-zinc-500">{list.description || "Sem descricao"}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-zinc-500 hover:text-rose-300"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteList(list.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                    <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                      {list.item_count} leads
                    </Badge>
                    <span>Atualizada em {formatDate(list.updated_at)}</span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader>
            <CardTitle className="text-lg">{selectedList ? selectedList.name : "Itens da lista"}</CardTitle>
            <CardDescription>
              Snapshot operacional dos leads salvos, pronto para reuso em campanhas e revisoes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedListId ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                Selecione uma lista para visualizar os leads armazenados.
              </div>
            ) : loadingItems ? (
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando leads da lista...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                Esta lista ainda esta vazia.
              </div>
            ) : (
              items.map((item) => {
                const emp = item.empresa;
                const whatsapp = emp.whatsapp_enriquecido || emp.whatsapp_publico;
                const telefone = emp.telefone_final || emp.telefone_padrao || emp.telefone_enriquecido;
                const email = emp.email_final || emp.email_enriquecido || emp.email;
                return (
                  <div key={`${item.id}-${item.cnpj}`} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-zinc-100">{emp.nome_fantasia || emp.razao_social}</p>
                        <p className="text-xs text-zinc-500">
                          {emp.cnpj} . {emp.cidade || "-"} / {emp.uf || "-"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-500 hover:text-rose-300"
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
                        <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
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
        <Card className="border-zinc-800 bg-zinc-950/60">
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
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando buscas salvas...
              </div>
            ) : savedSearches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                Nenhuma busca salva ainda. Use o Workbench para criar buscas e listas dinamicas.
              </div>
            ) : (
              savedSearches.map((search) => (
                <div key={search.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-100">{search.name}</p>
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
                      <p className="text-xs text-zinc-500">
                        {search.description || "Sem descricao"} . Ultima execucao: {formatDate(search.last_run_at)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-zinc-500 hover:text-rose-300"
                      onClick={() => void handleDeleteSavedSearch(search.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                      {(search.config.ufs ?? []).length || (search.config.uf ? 1 : 0)} UF(s)
                    </Badge>
                    <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                      {(search.config.cnaes ?? []).length} CNAE(s)
                    </Badge>
                    <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                      limite {search.config.limite_empresas}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    className="mt-4 w-full bg-white text-zinc-950 hover:bg-zinc-200"
                    onClick={() => void handleRunSavedSearch(search)}
                    disabled={runningSavedSearchId === search.id}
                  >
                    {runningSavedSearchId === search.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Abrir no Results
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/60">
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
              className="border-zinc-700 bg-zinc-900"
            />
            <Textarea
              value={manualWatchReason}
              onChange={(event) => setManualWatchReason(event.target.value)}
              placeholder="Motivo do acompanhamento"
              className="min-h-[84px] border-zinc-700 bg-zinc-900"
            />
            <Button
              type="button"
              className="w-full gap-2 bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              onClick={() => void handleFollowCompany()}
              disabled={savingWatch}
            >
              {savingWatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              Seguir empresa
            </Button>
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando watchlist...
              </div>
            ) : watchlist.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                Nenhuma empresa acompanhada ainda.
              </div>
            ) : (
              watchlist.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-100">
                        {entry.nome_fantasia || entry.razao_social || entry.cnpj}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {entry.cnpj} . {entry.cidade || "-"} / {entry.uf || "-"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-zinc-500 hover:text-rose-300"
                      onClick={() => void handleUnfollowCompany(entry.cnpj)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
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
                          : "border-zinc-700 bg-zinc-900 text-zinc-300"
                      }
                    >
                      WA valido: {entry.snapshot.validated_whatsapp_candidates ?? 0}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    Padrao: {entry.snapshot.email_pattern || "nao resolvido"} . Ultimo refresh: {formatDate(entry.last_refresh_at)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full border-zinc-700 bg-zinc-900"
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
        <Card className="border-zinc-800 bg-zinc-950/60">
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
              className="border-zinc-700 bg-zinc-900"
            />
            <Input
              value={manualEmail}
              onChange={(event) => setManualEmail(event.target.value)}
              placeholder="E-mails separados por virgula"
              className="border-zinc-700 bg-zinc-900"
            />
            <Input
              value={manualDomain}
              onChange={(event) => setManualDomain(event.target.value)}
              placeholder="Dominios separados por virgula"
              className="border-zinc-700 bg-zinc-900"
            />
            <Textarea
              value={manualReason}
              onChange={(event) => setManualReason(event.target.value)}
              placeholder="Motivo da supressao"
              className="min-h-[96px] border-zinc-700 bg-zinc-900"
            />
            <Button
              type="button"
              className="w-full gap-2 bg-amber-500 text-zinc-950 hover:bg-amber-400"
              onClick={() => void handleManualSuppression()}
              disabled={savingSuppression}
            >
              {savingSuppression ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleOff className="h-4 w-4" />}
              Registrar supressao
            </Button>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader>
            <CardTitle className="text-lg">Signals recentes</CardTitle>
            <CardDescription>
              Eventos internos do Hermes para timing de abordagem e cobertura de contato.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando sinais...
              </div>
            ) : signals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                Nenhum sinal registrado ainda.
              </div>
            ) : (
              signals.map((signal) => (
                <div key={signal.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-100">{signal.title}</p>
                      <p className="text-xs text-zinc-500">
                        {signal.cnpj} . {formatDate(signal.created_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                      {signal.signal_type}
                    </Badge>
                  </div>
                  {signal.payload && Object.keys(signal.payload).length > 0 && (
                    <pre className="mt-3 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-[11px] leading-5 text-zinc-400">
                      {JSON.stringify(signal.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-950/60">
        <CardHeader>
          <CardTitle className="text-lg">Registro de supressao</CardTitle>
          <CardDescription>
            Itens bloqueados da prospeccao automatica para evitar retrabalho e contato indevido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando supressoes...
            </div>
          ) : suppressions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-500">
              Nenhuma supressao cadastrada.
            </div>
          ) : (
            suppressions.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-100">
                    {entry.cnpj || entry.email || entry.domain || "Registro"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {entry.reason || "Sem motivo informado"} . {formatDate(entry.updated_at || entry.created_at)}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {entry.cnpj && <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">CNPJ</Badge>}
                    {entry.email && <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">E-mail</Badge>}
                    {entry.domain && <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">Dominio</Badge>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-500 hover:text-rose-300"
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
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
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
              className="border-zinc-700 bg-zinc-900"
            />
            <Textarea
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              placeholder="Descricao opcional"
              className="min-h-[96px] border-zinc-700 bg-zinc-900"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-zinc-700 bg-zinc-900"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
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
