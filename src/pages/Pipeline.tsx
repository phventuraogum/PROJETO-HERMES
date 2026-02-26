// src/pages/Pipeline.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2, MapPin, Mail, Phone, MessageCircle, Globe,
  Trash2, MoreHorizontal, Zap, Target, ArrowRight, Plus,
  Loader2, Send, CheckCircle2, Radio,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  getPipeline, moveLeadPipeline, removeFromPipeline, updateLeadNota,
  enviarParaSDR,
  type LeadPipeline, type EstagioLead,
} from "@/lib/api";
import { MensagemModal } from "@/components/MensagemModal";
import { CrmExportModal } from "@/components/CrmExportModal";
import { toast } from "sonner";

// ─── constantes ──────────────────────────────────────────────────────────────

type Coluna = {
  id: EstagioLead;
  label: string;
  cor: string;
  bgBadge: string;
  descricao: string;
};

const COLUNAS: Coluna[] = [
  { id: "novo",        label: "Novos",       cor: "border-zinc-600",   bgBadge: "bg-zinc-700/60 text-zinc-300",   descricao: "Recém-adicionados" },
  { id: "em_analise",  label: "Em análise",  cor: "border-sky-600",    bgBadge: "bg-sky-900/60 text-sky-300",     descricao: "Pesquisando mais" },
  { id: "contactado",  label: "Contactado",  cor: "border-amber-600",  bgBadge: "bg-amber-900/60 text-amber-300", descricao: "Primeiro contato feito" },
  { id: "qualificado", label: "Qualificado", cor: "border-emerald-600",bgBadge: "bg-emerald-900/60 text-emerald-300", descricao: "Lead confirmado" },
  { id: "descartado",  label: "Descartado",  cor: "border-rose-700",   bgBadge: "bg-rose-900/60 text-rose-300",   descricao: "Fora do perfil" },
];

function scoreColor(s: number) {
  if (s >= 75) return "text-emerald-400";
  if (s >= 50) return "text-blue-400";
  if (s >= 25) return "text-amber-400";
  return "text-rose-400";
}

// ─── Card de lead ─────────────────────────────────────────────────────────────
function LeadCard({
  lead, onMove, onRemove, onDetail, isDragging,
  onDragStart, onDragEnd,
}: {
  lead: LeadPipeline;
  onMove: (cnpj: string, e: EstagioLead) => void;
  onRemove: (cnpj: string) => void;
  onDetail: (l: LeadPipeline) => void;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const emp = lead.empresa;
  const temContato = emp.email || emp.email_enriquecido || emp.telefone_padrao ||
    emp.telefone_receita || emp.telefone_estab1 || emp.telefone_estab2 ||
    emp.telefone_enriquecido || emp.whatsapp_publico || emp.whatsapp_enriquecido;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 cursor-grab active:cursor-grabbing",
        "hover:border-zinc-700 hover:bg-zinc-800/60 transition-all duration-150",
        isDragging && "opacity-40 scale-95 rotate-1"
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-tight">
            {emp.nome_fantasia || emp.razao_social}
          </p>
          <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-0.5">
            <MapPin className="h-2.5 w-2.5" />
            {emp.cidade || "—"} / {emp.uf || "—"}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={cn("text-[11px] font-bold", scoreColor(lead.score_icp))}>
            {lead.score_icp.toFixed(0)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onDetail(lead)}>Ver detalhes</DropdownMenuItem>
              {COLUNAS.filter(c => c.id !== lead.estagio).map(c => (
                <DropdownMenuItem key={c.id} onClick={() => onMove(lead.id, c.id)}>
                  Mover: {c.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                className="text-rose-400 focus:text-rose-300"
                onClick={() => onRemove(lead.id)}>
                <Trash2 className="h-3 w-3 mr-1.5" /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(emp.segmento || emp.porte) && (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {emp.segmento && (
            <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-400 py-0 px-1.5">
              {emp.segmento}
            </Badge>
          )}
          {emp.porte && (
            <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-500 py-0 px-1.5">
              {emp.porte}
            </Badge>
          )}
        </div>
      )}

      {temContato && (
        <div className="flex items-center gap-1 mt-2">
          {(emp.email || emp.email_enriquecido) && (
            <div className="h-5 w-5 flex items-center justify-center rounded bg-sky-500/10 border border-sky-500/20">
              <Mail className="h-2.5 w-2.5 text-sky-400" />
            </div>
          )}
          {(emp.whatsapp_publico || emp.whatsapp_enriquecido) && (
            <div className="h-5 w-5 flex items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/20">
              <MessageCircle className="h-2.5 w-2.5 text-emerald-400" />
            </div>
          )}
          {(emp.telefone_padrao || emp.telefone_receita || emp.telefone_estab1 || emp.telefone_estab2 || emp.telefone_enriquecido) && (
            <div className="h-5 w-5 flex items-center justify-center rounded bg-zinc-800 border border-zinc-700">
              <Phone className="h-2.5 w-2.5 text-zinc-400" />
            </div>
          )}
          {emp.site && (
            <div className="h-5 w-5 flex items-center justify-center rounded bg-violet-500/10 border border-violet-500/20">
              <Globe className="h-2.5 w-2.5 text-violet-400" />
            </div>
          )}
        </div>
      )}

      {/* SDR status badge */}
      {lead.sdr_status && (
        <div className="mt-2">
          <Badge className={cn("text-[9px] py-0 px-1.5",
            lead.sdr_status === "enviado" && "bg-amber-900/60 text-amber-300 border-amber-700",
            lead.sdr_status === "respondeu" && "bg-sky-900/60 text-sky-300 border-sky-700",
            lead.sdr_status === "qualificado" && "bg-emerald-900/60 text-emerald-300 border-emerald-700",
          )}>
            <Radio className="h-2 w-2 mr-1" />
            SDR: {lead.sdr_status}
          </Badge>
        </div>
      )}

      {lead.nota && (
        <p className="text-[10px] text-zinc-500 mt-2 line-clamp-2 italic">
          "{lead.nota}"
        </p>
      )}
    </div>
  );
}

// ─── PAINEL DE DETALHE ────────────────────────────────────────────────────────
function DetalheSheet({ lead, onClose, onMove, onNotaChange, onEnviarSDR, sdrLoading }: {
  lead: LeadPipeline | null;
  onClose: () => void;
  onMove: (cnpj: string, e: EstagioLead) => void;
  onNotaChange: (cnpj: string, nota: string) => void;
  onEnviarSDR: (cnpj: string) => void;
  sdrLoading: boolean;
}) {
  const [nota, setNota] = useState(lead?.nota ?? "");
  const [mensagemOpen, setMensagemOpen] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);

  useEffect(() => { setNota(lead?.nota ?? ""); }, [lead]);

  if (!lead) return null;
  const emp = lead.empresa;
  const temContatoSDR = emp.email || emp.email_enriquecido || emp.telefone_padrao ||
    emp.telefone_receita || emp.telefone_estab1 || emp.telefone_estab2 ||
    emp.telefone_enriquecido || emp.whatsapp_publico || emp.whatsapp_enriquecido;

  return (
    <>
      <Sheet open={!!lead} onOpenChange={v => !v && onClose()}>
        <SheetContent className="w-full max-w-md overflow-y-auto space-y-5 bg-zinc-950 border-zinc-800">
          <SheetHeader>
            <SheetTitle className="text-base leading-tight">
              {emp.nome_fantasia || emp.razao_social}
            </SheetTitle>
            <p className="text-xs text-zinc-500">{emp.cnpj}</p>
          </SheetHeader>

          <div className="flex items-center gap-2 flex-wrap">
            {COLUNAS.map(c => (
              <button
                key={c.id}
                onClick={() => onMove(lead.id, c.id)}
                className={cn(
                  "text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all",
                  lead.estagio === c.id
                    ? c.bgBadge + " " + c.cor
                    : "border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400"
                )}>
                {c.label}
              </button>
            ))}
          </div>

          {/* SDR Status */}
          {lead.sdr_status && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-800/30">
              <Radio className="h-3.5 w-3.5 text-amber-400" />
              <div>
                <p className="text-xs font-medium text-amber-300">SDR: {lead.sdr_status}</p>
                {lead.sdr_enviado_em && (
                  <p className="text-[10px] text-zinc-500">
                    Enviado em {new Date(lead.sdr_enviado_em).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Dados da empresa */}
          <div className="space-y-1.5 text-xs">
            {[
              ["Cidade / UF", `${emp.cidade || "—"} / ${emp.uf || "—"}`],
              ["Segmento", emp.segmento],
              ["Porte", emp.porte],
              ["CNAE", emp.cnae_descricao],
              ["Capital social", emp.capital_social ? `R$ ${emp.capital_social.toLocaleString("pt-BR")}` : null],
              ["Score ICP", `${lead.score_icp.toFixed(1)} pts`],
              ["Site", emp.site],
              ["Sócios", emp.socios_resumo],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k as string} className="flex gap-2">
                  <span className="text-zinc-500 min-w-[90px] flex-shrink-0">{k}</span>
                  <span className="text-zinc-200 break-all">{v as string}</span>
                </div>
              ))}
          </div>

          {/* Contatos para SDR */}
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Send className="h-3 w-3 text-violet-400" /> Contatos (SDR usará o melhor disponível)
            </p>
            <div className="space-y-1 text-xs">
              {[
                { icon: Mail,           label: "E-mail",              value: emp.email,                color: "text-sky-400" },
                { icon: Mail,           label: "E-mail enriquecido",  value: emp.email_enriquecido,    color: "text-sky-300" },
                { icon: MessageCircle,  label: "WhatsApp público",    value: emp.whatsapp_publico,     color: "text-emerald-400" },
                { icon: MessageCircle,  label: "WhatsApp enriquecido",value: emp.whatsapp_enriquecido, color: "text-emerald-300" },
                { icon: Phone,          label: "Telefone principal",  value: emp.telefone_padrao,      color: "text-zinc-300" },
                { icon: Phone,          label: "Telefone Receita",    value: emp.telefone_receita,     color: "text-zinc-400" },
                { icon: Phone,          label: "Telefone estab. 1",   value: emp.telefone_estab1,      color: "text-zinc-400" },
                { icon: Phone,          label: "Telefone estab. 2",   value: emp.telefone_estab2,      color: "text-zinc-400" },
                { icon: Phone,          label: "Telefone enriquecido",value: emp.telefone_enriquecido, color: "text-zinc-300" },
              ]
                .filter(c => c.value)
                .map(c => (
                  <div key={c.label} className="flex items-center gap-2">
                    <c.icon className={cn("h-3 w-3 flex-shrink-0", c.color)} />
                    <span className="text-zinc-500 min-w-[120px] flex-shrink-0">{c.label}</span>
                    <span className="text-zinc-200 break-all">{c.value}</span>
                  </div>
                ))}
              {!emp.email && !emp.email_enriquecido && !emp.whatsapp_publico && !emp.whatsapp_enriquecido
                && !emp.telefone_padrao && !emp.telefone_receita && !emp.telefone_estab1
                && !emp.telefone_estab2 && !emp.telefone_enriquecido && (
                <p className="text-zinc-600 italic">Nenhum contato disponível</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Notas internas</label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              onBlur={() => onNotaChange(lead.id, nota)}
              rows={3}
              placeholder="Observações sobre o lead..."
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-zinc-400 font-medium">Ações</p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline"
                className="h-7 text-[11px] gap-1 border-emerald-800 text-emerald-400 hover:bg-emerald-900/20"
                onClick={() => setMensagemOpen(true)}>
                <MessageCircle className="h-3 w-3" /> Mensagem
              </Button>
              <Button size="sm" variant="outline"
                className="h-7 text-[11px] gap-1 border-sky-800 text-sky-400 hover:bg-sky-900/20"
                onClick={() => setCrmOpen(true)}>
                <Building2 className="h-3 w-3" /> Enviar para CRM
              </Button>
              {temContatoSDR && !lead.sdr_status && (
                <Button size="sm" variant="outline"
                  className="h-7 text-[11px] gap-1 border-violet-800 text-violet-400 hover:bg-violet-900/20"
                  disabled={sdrLoading}
                  onClick={() => onEnviarSDR(lead.id)}>
                  {sdrLoading
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Zap className="h-3 w-3" />}
                  Enviar para SDR
                </Button>
              )}
              {lead.sdr_status && (
                <Badge variant="outline" className="text-[10px] border-emerald-800 text-emerald-400 py-0.5 px-2">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Já enviado ao SDR
                </Badge>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {mensagemOpen && (
        <MensagemModal
          empresa={emp}
          open={mensagemOpen}
          onClose={() => setMensagemOpen(false)}
        />
      )}
      <CrmExportModal open={crmOpen} onClose={() => setCrmOpen(false)} empresa={emp} />
    </>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
const Pipeline = () => {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<EstagioLead | null>(null);
  const [detalhe, setDetalhe] = useState<LeadPipeline | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [sdrLoading, setSdrLoading] = useState(false);
  const dragRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await getPipeline();
      setLeads(data);
    } catch (e: any) {
      toast.error("Erro ao carregar pipeline: " + (e?.message || ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleMove = async (cnpj: string, estagio: EstagioLead) => {
    setLeads(prev => prev.map(l => l.id === cnpj ? { ...l, estagio } : l));
    if (detalhe?.id === cnpj) setDetalhe(prev => prev ? { ...prev, estagio } : null);
    try {
      await moveLeadPipeline(cnpj, estagio);
    } catch {
      toast.error("Erro ao mover lead");
      reload();
    }
  };

  const handleRemove = async (cnpj: string) => {
    setConfirmRemove(null);
    setLeads(prev => prev.filter(l => l.id !== cnpj));
    if (detalhe?.id === cnpj) setDetalhe(null);
    try {
      await removeFromPipeline(cnpj);
    } catch {
      toast.error("Erro ao remover lead");
      reload();
    }
  };

  const handleNota = async (cnpj: string, nota: string) => {
    try {
      await updateLeadNota(cnpj, nota);
    } catch {
      toast.error("Erro ao salvar nota");
    }
  };

  const handleEnviarSDR = async (cnpj: string) => {
    setSdrLoading(true);
    try {
      const res = await enviarParaSDR([cnpj]);
      toast.success(`${res.enviados} lead(s) enviado(s) para o SDR`);
      reload();
    } catch (e: any) {
      toast.error("Erro ao enviar para SDR: " + (e?.message || ""));
    } finally {
      setSdrLoading(false);
    }
  };

  const handleEnviarTodosSDR = async () => {
    const novos = leads.filter(l =>
      (l.estagio === "novo" || l.estagio === "em_analise") && !l.sdr_status
    );
    const cnpjs = novos.map(l => l.id);
    if (!cnpjs.length) {
      toast.info("Nenhum lead novo sem SDR ativo");
      return;
    }
    setSdrLoading(true);
    try {
      const res = await enviarParaSDR(cnpjs);
      toast.success(`${res.enviados} lead(s) enviado(s) para o SDR`);
      reload();
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || ""));
    } finally {
      setSdrLoading(false);
    }
  };

  // ── Drag & Drop ──────────────────────────────────────────────
  const onDragStart = (id: string) => { dragRef.current = id; setDraggingId(id); };
  const onDragEnd = () => { setDraggingId(null); setOverCol(null); dragRef.current = null; };
  const onDragOver = (e: React.DragEvent, colId: EstagioLead) => { e.preventDefault(); setOverCol(colId); };
  const onDrop = (e: React.DragEvent, colId: EstagioLead) => {
    e.preventDefault();
    if (dragRef.current) handleMove(dragRef.current, colId);
    setOverCol(null);
  };

  const stats = COLUNAS.map(c => ({
    ...c, count: leads.filter(l => l.estagio === c.id).length,
  }));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        <p className="text-sm text-zinc-500">Carregando pipeline...</p>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
          <Target className="h-8 w-8 text-zinc-500" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold">Pipeline vazio</p>
          <p className="text-sm text-muted-foreground">
            Adicione empresas da tela de Resultados para começar.
          </p>
        </div>
        <Button onClick={() => navigate("/results")} className="gap-2">
          <Plus className="h-4 w-4" /> Ir para Resultados
        </Button>
      </div>
    );
  }

  const leadsParaSDR = leads.filter(l =>
    (l.estagio === "novo" || l.estagio === "em_analise") && !l.sdr_status
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline de Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {leads.length} lead{leads.length !== 1 ? "s" : ""} · Drag &amp; drop para mover entre estágios
          </p>
        </div>
        <div className="flex gap-2">
          {leadsParaSDR > 0 && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-violet-700 text-violet-400 hover:bg-violet-900/20"
              disabled={sdrLoading}
              onClick={handleEnviarTodosSDR}>
              {sdrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Enviar {leadsParaSDR} para SDR
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700"
            onClick={() => navigate("/results")}>
            <Plus className="h-3.5 w-3.5" /> Adicionar leads
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {stats.map(s => (
          <div key={s.id}
            className={cn("rounded-lg border px-3 py-2 text-center", s.cor, "bg-zinc-900/40")}>
            <p className="text-xl font-bold">{s.count}</p>
            <p className="text-[10px] text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
        {COLUNAS.map(col => {
          const colLeads = leads.filter(l => l.estagio === col.id)
            .sort((a, b) => b.score_icp - a.score_icp);
          const isOver = overCol === col.id;

          return (
            <div
              key={col.id}
              onDragOver={e => onDragOver(e, col.id)}
              onDrop={e => onDrop(e, col.id)}
              className={cn(
                "flex flex-col gap-2 min-w-[240px] w-[240px] flex-shrink-0 rounded-xl border p-2 transition-all duration-150",
                col.cor,
                isOver ? "bg-zinc-800/60 border-opacity-100" : "bg-zinc-900/30 border-opacity-40"
              )}
            >
              <div className="flex items-center justify-between px-1 pb-1">
                <div>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", col.bgBadge)}>
                    {col.label}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">{colLeads.length}</span>
              </div>

              <div className="flex-1 space-y-2 min-h-[120px]">
                {colLeads.map(lead => (
                  <div key={lead.id} onClick={() => setDetalhe(lead)}>
                    <LeadCard
                      lead={lead}
                      onMove={handleMove}
                      onRemove={id => setConfirmRemove(id)}
                      onDetail={setDetalhe}
                      isDragging={draggingId === lead.id}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                    />
                  </div>
                ))}
                {colLeads.length === 0 && (
                  <div className={cn(
                    "flex items-center justify-center h-20 rounded-lg border border-dashed text-xs text-zinc-600",
                    isOver ? "border-zinc-500 bg-zinc-800/20" : "border-zinc-800"
                  )}>
                    Arraste aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DetalheSheet
        lead={detalhe}
        onClose={() => setDetalhe(null)}
        onMove={handleMove}
        onNotaChange={handleNota}
        onEnviarSDR={handleEnviarSDR}
        sdrLoading={sdrLoading}
      />

      <AlertDialog open={!!confirmRemove} onOpenChange={v => !v && setConfirmRemove(null)}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover do pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o lead do board. Ele continuará nos Resultados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => confirmRemove && handleRemove(confirmRemove)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pipeline;
