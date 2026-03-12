import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  FolderPlus,
  Loader2,
  Mail,
  MessageCircleOff,
  Phone,
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
  getLeadListItems,
  getLeadLists,
  getLeadSuppressions,
  removeLeadListItem,
  removeLeadSuppression,
  type LeadListItem,
  type LeadListSummary,
  type LeadSuppression,
} from "@/lib/api";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

const LeadLists = () => {
  const [lists, setLists] = useState<LeadListSummary[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [suppressions, setSuppressions] = useState<LeadSuppression[]>([]);
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

  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId],
  );

  const reloadLists = async () => {
    const next = await getLeadLists();
    setLists(next);
    if (!selectedListId && next.length > 0) {
      setSelectedListId(next[0].id);
    }
    if (selectedListId && !next.some((list) => list.id === selectedListId)) {
      setSelectedListId(next[0]?.id ?? "");
    }
  };

  const reloadSuppressions = async () => {
    setSuppressions(await getLeadSuppressions());
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [nextLists, nextSuppressions] = await Promise.all([
          getLeadLists(),
          getLeadSuppressions(),
        ]);
        setLists(nextLists);
        setSuppressions(nextSuppressions);
        if (nextLists.length > 0) {
          setSelectedListId((current) => current || nextLists[0].id);
        }
      } catch (err: any) {
        toast.error(err?.message || "Não foi possível carregar listas e supressões.");
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
        toast.error(err?.message || "Não foi possível carregar os leads da lista.");
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
      toast.error(err?.message || "Não foi possível criar a lista.");
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
      toast.error(err?.message || "Não foi possível remover a lista.");
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
      toast.error(err?.message || "Não foi possível remover o lead.");
    }
  };

  const handleManualSuppression = async () => {
    const cnpjs = manualCnpj
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const emails = manualEmail
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const domains = manualDomain
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (cnpjs.length === 0 && emails.length === 0 && domains.length === 0) {
      toast.info("Informe ao menos um CNPJ, e-mail ou domínio.");
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
      toast.success(`${result.added} supressão(ões) adicionada(s).`);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível registrar a supressão.");
    } finally {
      setSavingSuppression(false);
    }
  };

  const handleRemoveSuppression = async (id: string) => {
    try {
      await removeLeadSuppression(id);
      setSuppressions((prev) => prev.filter((item) => item.id !== id));
      toast.success("Supressão removida.");
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível remover a supressão.");
    }
  };

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Listas e Supressão</h2>
          <p className="text-sm text-muted-foreground">
            Organize leads em listas reutilizáveis e bloqueie CNPJs, e-mails ou domínios da prospecção futura.
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
                Nenhuma lista criada ainda. Salve leads de Results para começar.
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
                      <p className="text-xs text-zinc-500">
                        {list.description || "Sem descrição"}
                      </p>
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
            <CardTitle className="text-lg">
              {selectedList ? selectedList.name : "Itens da lista"}
            </CardTitle>
            <CardDescription>
              Snapshot operacional dos leads salvos, pronto para reuso em campanhas e revisões.
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
                Esta lista ainda está vazia.
              </div>
            ) : (
              items.map((item) => {
                const emp = item.empresa;
                const whatsapp = emp.whatsapp_enriquecido || emp.whatsapp_publico;
                const telefone = emp.telefone_final || emp.telefone_padrao || emp.telefone_enriquecido;
                const email = emp.email_final || emp.email_enriquecido || emp.email;
                return (
                  <div
                    key={`${item.id}-${item.cnpj}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-zinc-100">
                          {emp.nome_fantasia || emp.razao_social}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {emp.cnpj} · {emp.cidade || "—"} / {emp.uf || "—"}
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

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldBan className="h-4 w-4 text-amber-300" />
              Nova supressão
            </CardTitle>
            <CardDescription>
              Bloqueie CNPJs, e-mails ou domínios para que não retornem nas próximas prospecções.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={manualCnpj}
              onChange={(event) => setManualCnpj(event.target.value)}
              placeholder="CNPJs separados por vírgula"
              className="border-zinc-700 bg-zinc-900"
            />
            <Input
              value={manualEmail}
              onChange={(event) => setManualEmail(event.target.value)}
              placeholder="E-mails separados por vírgula"
              className="border-zinc-700 bg-zinc-900"
            />
            <Input
              value={manualDomain}
              onChange={(event) => setManualDomain(event.target.value)}
              placeholder="Domínios separados por vírgula"
              className="border-zinc-700 bg-zinc-900"
            />
            <Textarea
              value={manualReason}
              onChange={(event) => setManualReason(event.target.value)}
              placeholder="Motivo da supressão"
              className="min-h-[96px] border-zinc-700 bg-zinc-900"
            />
            <Button
              type="button"
              className="w-full gap-2 bg-amber-500 text-zinc-950 hover:bg-amber-400"
              onClick={() => void handleManualSuppression()}
              disabled={savingSuppression}
            >
              {savingSuppression ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleOff className="h-4 w-4" />}
              Registrar supressão
            </Button>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader>
            <CardTitle className="text-lg">Registro de supressão</CardTitle>
            <CardDescription>
              Itens bloqueados da prospecção automática para evitar retrabalho e contato indevido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando supressões...
              </div>
            ) : suppressions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                Nenhuma supressão cadastrada.
              </div>
            ) : (
              suppressions.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-zinc-100">
                      {entry.cnpj || entry.email || entry.domain || "Registro"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {entry.reason || "Sem motivo informado"} · {formatDate(entry.updated_at || entry.created_at)}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {entry.cnpj && (
                        <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                          CNPJ
                        </Badge>
                      )}
                      {entry.email && (
                        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                          E-mail
                        </Badge>
                      )}
                      {entry.domain && (
                        <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                          Domínio
                        </Badge>
                      )}
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
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Criar nova lista</DialogTitle>
            <DialogDescription>
              Dê um nome para a lista e use Results para alimentar os leads selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Ex.: Imobiliárias SP - rodada 1"
              className="border-zinc-700 bg-zinc-900"
            />
            <Textarea
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              placeholder="Descrição opcional"
              className="min-h-[96px] border-zinc-700 bg-zinc-900"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="border-zinc-700 bg-zinc-900" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400" onClick={() => void handleCreateList()} disabled={creating}>
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
