// src/pages/Pipeline.tsx — Hermes Design System v2
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  enviarParaSDR, type LeadPipeline, type EstagioLead,
} from "@/lib/api";
import { MensagemModal } from "@/components/MensagemModal";
import { CrmExportModal } from "@/components/CrmExportModal";
import { toast } from "sonner";

/* ── Colunas ─────────────────────────────────────────────────────────────── */
type Coluna = {
  id: EstagioLead; label: string;
  headerColor: string; badgeColor: string; dotColor: string; descricao: string;
};

/** Mesma grade para os boxes de contagem e as colunas do Kanban (alinhamento pixel-consistency). */
const PIPELINE_GRID_CLASS = "grid w-full min-w-0 grid-cols-5 gap-2";

const COLUNAS: Coluna[] = [
  { id: "novo",        label: "Novos",       headerColor: "bg-slate-50 border-slate-200",    badgeColor: "bg-slate-100 text-slate-600 border-slate-200",      dotColor: "bg-slate-400",    descricao: "Recém-adicionados" },
  { id: "em_analise",  label: "Em análise",  headerColor: "bg-blue-50 border-blue-200",      badgeColor: "bg-blue-100 text-blue-700 border-blue-200",         dotColor: "bg-blue-500",     descricao: "Pesquisando mais" },
  { id: "contactado",  label: "Contactado",  headerColor: "bg-amber-50 border-amber-200",    badgeColor: "bg-amber-100 text-amber-700 border-amber-200",      dotColor: "bg-amber-500",    descricao: "Primeiro contato feito" },
  { id: "qualificado", label: "Qualificado", headerColor: "bg-emerald-50 border-emerald-200", badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200", dotColor: "bg-emerald-500",  descricao: "Lead confirmado" },
  { id: "descartado",  label: "Descartado",  headerColor: "bg-red-50 border-red-200",        badgeColor: "bg-red-100 text-red-700 border-red-200",            dotColor: "bg-red-400",      descricao: "Fora do perfil" },
];

function scoreLabel(s: number) {
  if (s >= 75) return "score-badge-high";
  if (s >= 50) return "score-badge-mid";
  if (s >= 25) return "score-badge-low";
  return "score-badge-danger";
}

/* ── Lead Card ────────────────────────────────────────────────────────────── */
function LeadCard({ lead, onMove, onRemove, onDetail, isDragging, onDragStart, onDragEnd }: {
  lead: LeadPipeline; onMove: (id: string, e: EstagioLead) => void;
  onRemove: (id: string) => void; onDetail: (l: LeadPipeline) => void;
  isDragging: boolean; onDragStart: (id: string) => void; onDragEnd: () => void;
}) {
  const emp = lead.empresa;
  const temContato = emp.email || emp.email_enriquecido || emp.telefone_padrao ||
    emp.telefone_receita || emp.whatsapp_publico || emp.whatsapp_enriquecido;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => onDetail(lead)}
      className={cn(
        "group pipeline-card",
        isDragging && "opacity-40 rotate-1 scale-95"
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-tight text-foreground">
            {emp.nome_fantasia || emp.razao_social}
          </p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            {emp.cidade || "—"} / {emp.uf || "—"}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={cn("score-badge-high text-[11px] px-1.5 py-0 border rounded font-semibold tabular-nums", scoreLabel(lead.score_icp))}>
            {lead.score_icp.toFixed(0)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 shadow-surface-lg">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onDetail(lead); }}>Ver detalhes</DropdownMenuItem>
              {COLUNAS.filter(c => c.id !== lead.estagio).map(c => (
                <DropdownMenuItem key={c.id} onClick={e => { e.stopPropagation(); onMove(lead.id, c.id); }}>
                  Mover: {c.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={e => { e.stopPropagation(); onRemove(lead.id); }}>
                <Trash2 className="h-3 w-3 mr-1.5" /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(emp.segmento || emp.porte) && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {emp.segmento && (
            <Badge variant="outline" className="text-[10px] border-border/60 text-muted-foreground py-0 px-1.5 h-4">
              {emp.segmento}
            </Badge>
          )}
          {emp.porte && (
            <Badge variant="outline" className="text-[10px] border-border/60 text-muted-foreground py-0 px-1.5 h-4">
              {emp.porte}
            </Badge>
          )}
        </div>
      )}

      {temContato && (
        <div className="flex items-center gap-1 mt-2">
          {(emp.email || emp.email_enriquecido) && (
            <div className="h-5 w-5 flex items-center justify-center rounded bg-sky-50 border border-sky-200">
              <Mail className="h-2.5 w-2.5 text-sky-500" />
            </div>
          )}
          {(emp.whatsapp_publico || emp.whatsapp_enriquecido) && (
            <div className="h-5 w-5 flex items-center justify-center rounded bg-emerald-50 border border-emerald-200">
              <MessageCircle className="h-2.5 w-2.5 text-emerald-500" />
            </div>
          )}
          {(emp.telefone_padrao || emp.telefone_receita) && (
            <div className="h-5 w-5 flex items-center justify-center rounded bg-muted border border-border">
              <Phone className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
          )}
          {emp.site && (
            <div className="h-5 w-5 flex items-center justify-center rounded bg-violet-50 border border-violet-200">
              <Globe className="h-2.5 w-2.5 text-violet-500" />
            </div>
          )}
        </div>
      )}

      {lead.sdr_status && (
        <div className="mt-2">
          <Badge className={cn("text-[10px] py-0 px-1.5 border font-normal",
            lead.sdr_status === "enviado"    && "bg-amber-50 text-amber-700 border-amber-200",
            lead.sdr_status === "respondeu"  && "bg-sky-50 text-sky-700 border-sky-200",
            lead.sdr_status === "qualificado"&& "bg-emerald-50 text-emerald-700 border-emerald-200",
          )}>
            <Radio className="h-2 w-2 mr-1" /> SDR: {lead.sdr_status}
          </Badge>
        </div>
      )}

      {lead.nota && (
        <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 italic border-t border-border/50 pt-2">
          {lead.nota}
        </p>
      )}
    </div>
  );
}

/* ── Painel de detalhe ────────────────────────────────────────────────────── */
function DetalheSheet({ lead, onClose, onMove, onNotaChange, onEnviarSDR, sdrLoading }: {
  lead: LeadPipeline | null; onClose: () => void;
  onMove: (id: string, e: EstagioLead) => void;
  onNotaChange: (id: string, nota: string) => void;
  onEnviarSDR: (id: string) => void; sdrLoading: boolean;
}) {
  const [nota, setNota] = useState(lead?.nota ?? "");
  const [mensagemOpen, setMensagemOpen] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);
  useEffect(() => { setNota(lead?.nota ?? ""); }, [lead]);
  if (!lead) return null;
  const emp = lead.empresa;
  const temContatoSDR = emp.email || emp.email_enriquecido || emp.telefone_padrao ||
    emp.telefone_receita || emp.whatsapp_publico || emp.whatsapp_enriquecido;

  return (
    <>
      <Sheet open={!!lead} onOpenChange={v => !v && onClose()}>
        <SheetContent className="w-full max-w-md overflow-y-auto bg-background border-border shadow-surface-xl">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-base font-display leading-tight text-foreground">
              {emp.nome_fantasia || emp.razao_social}
            </SheetTitle>
            <p className="text-xs text-muted-foreground font-mono">{emp.cnpj}</p>
          </SheetHeader>

          <div className="space-y-5 pt-4">
            {/* Estágios */}
            <div className="flex flex-wrap gap-1.5">
              {COLUNAS.map(c => (
                <button key={c.id}
                  onClick={() => onMove(lead.id, c.id)}
                  className={cn(
                    "text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all",
                    lead.estagio === c.id
                      ? c.badgeColor
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* SDR status */}
            {lead.sdr_status && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                <Radio className="h-3.5 w-3.5 text-amber-500" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">SDR: {lead.sdr_status}</p>
                  {lead.sdr_enviado_em && (
                    <p className="text-[11px] text-amber-600">
                      Enviado em {new Date(lead.sdr_enviado_em).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Dados */}
            <div className="card-surface p-4 space-y-2">
              {[
                ["Cidade / UF", `${emp.cidade || "—"} / ${emp.uf || "—"}`],
                ["Segmento", emp.segmento],
                ["Porte", emp.porte],
                ["CNAE", emp.cnae_descricao],
                ["Capital social", emp.capital_social ? `R$ ${emp.capital_social.toLocaleString("pt-BR")}` : null],
                ["Score ICP", `${lead.score_icp.toFixed(1)} pts`],
                ["Site", emp.site],
                ["Sócios", emp.socios_resumo],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string} className="flex gap-3 text-sm">
                  <span className="text-muted-foreground min-w-[90px] shrink-0 text-xs">{k}</span>
                  <span className="text-foreground break-all text-xs">{v as string}</span>
                </div>
              ))}
            </div>

            {/* Contatos */}
            <div className="card-surface p-4">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-3">
                <Send className="h-3.5 w-3.5 text-violet-500" /> Contatos disponíveis
              </p>
              <div className="space-y-2">
                {[
                  { icon: Mail,          label: "E-mail",               value: emp.email,                color: "text-sky-500" },
                  { icon: Mail,          label: "E-mail enriquecido",   value: emp.email_enriquecido,    color: "text-sky-400" },
                  { icon: MessageCircle, label: "WhatsApp público",     value: emp.whatsapp_publico,     color: "text-emerald-500" },
                  { icon: MessageCircle, label: "WhatsApp enriquecido", value: emp.whatsapp_enriquecido, color: "text-emerald-400" },
                  { icon: Phone,         label: "Telefone principal",   value: emp.telefone_padrao,      color: "text-slate-500" },
                  { icon: Phone,         label: "Telefone Receita",     value: emp.telefone_receita,     color: "text-slate-400" },
                ].filter(c => c.value).map(c => (
                  <div key={c.label} className="flex items-center gap-2.5 text-xs">
                    <c.icon className={cn("h-3.5 w-3.5 shrink-0", c.color)} />
                    <span className="text-muted-foreground min-w-[120px] shrink-0">{c.label}</span>
                    <span className="text-foreground break-all">{c.value}</span>
                  </div>
                ))}
                {!temContatoSDR && (
                  <p className="text-muted-foreground/60 text-xs italic">Nenhum contato disponível</p>
                )}
              </div>
            </div>

            {/* Nota */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Notas internas</label>
              <textarea
                value={nota}
                onChange={e => setNota(e.target.value)}
                onBlur={() => onNotaChange(lead.id, nota)}
                rows={3}
                placeholder="Observações sobre o lead..."
                className="w-full resize-none rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Ações */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Ações</p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setMensagemOpen(true)}>
                  <MessageCircle className="h-3.5 w-3.5" /> Mensagem
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setCrmOpen(true)}>
                  <Building2 className="h-3.5 w-3.5" /> Enviar CRM
                </Button>
                {temContatoSDR && !lead.sdr_status && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
                    disabled={sdrLoading} onClick={() => onEnviarSDR(lead.id)}>
                    {sdrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    Enviar SDR
                  </Button>
                )}
                {lead.sdr_status && (
                  <Badge variant="outline" className="text-[11px] border-emerald-200 text-emerald-700 bg-emerald-50 py-1 px-2.5">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Enviado ao SDR
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {mensagemOpen && <MensagemModal empresa={emp} open={mensagemOpen} onClose={() => setMensagemOpen(false)} />}
      <CrmExportModal open={crmOpen} onClose={() => setCrmOpen(false)} empresa={emp} />
    </>
  );
}

/* ── PRINCIPAL ────────────────────────────────────────────────────────────── */
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
    try { const data = await getPipeline(); setLeads(data); }
    catch (e: any) { toast.error("Erro ao carregar pipeline: " + (e?.message || "")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleMove = async (id: string, estagio: EstagioLead) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, estagio } : l));
    if (detalhe?.id === id) setDetalhe(prev => prev ? { ...prev, estagio } : null);
    try { await moveLeadPipeline(id, estagio); }
    catch { toast.error("Erro ao mover lead"); reload(); }
  };

  const handleRemove = async (id: string) => {
    setConfirmRemove(null);
    setLeads(prev => prev.filter(l => l.id !== id));
    if (detalhe?.id === id) setDetalhe(null);
    try { await removeFromPipeline(id); }
    catch { toast.error("Erro ao remover lead"); reload(); }
  };

  const handleNota = async (id: string, nota: string) => {
    try { await updateLeadNota(id, nota); }
    catch { toast.error("Erro ao salvar nota"); }
  };

  const handleEnviarSDR = async (id: string) => {
    setSdrLoading(true);
    try {
      const res = await enviarParaSDR([id]);
      toast.success(`${res.enviados} lead(s) enviado(s) para o SDR`);
      reload();
    } catch (e: any) { toast.error("Erro ao enviar para SDR: " + (e?.message || "")); }
    finally { setSdrLoading(false); }
  };

  const handleEnviarTodosSDR = async () => {
    const novos = leads.filter(l => (l.estagio === "novo" || l.estagio === "em_analise") && !l.sdr_status);
    if (!novos.length) { toast.info("Nenhum lead novo sem SDR ativo"); return; }
    setSdrLoading(true);
    try {
      const res = await enviarParaSDR(novos.map(l => l.id));
      toast.success(`${res.enviados} lead(s) enviado(s) para o SDR`);
      reload();
    } catch (e: any) { toast.error("Erro: " + (e?.message || "")); }
    finally { setSdrLoading(false); }
  };

  const onDragStart = (id: string) => { dragRef.current = id; setDraggingId(id); };
  const onDragEnd = () => { setDraggingId(null); setOverCol(null); dragRef.current = null; };
  const onDragOver = (e: React.DragEvent, colId: EstagioLead) => { e.preventDefault(); setOverCol(colId); };
  const onDrop = (e: React.DragEvent, colId: EstagioLead) => {
    e.preventDefault();
    if (dragRef.current) handleMove(dragRef.current, colId);
    setOverCol(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Carregando pipeline...
      </div>
    </div>
  );

  if (leads.length === 0) return (
    <div className="flex flex-col items-center justify-center py-32 gap-5">
      <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
        <Target className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-lg font-display text-foreground">Pipeline vazio</p>
        <p className="text-sm text-muted-foreground max-w-xs">Adicione empresas da tela de Resultados para começar.</p>
      </div>
      <Button onClick={() => navigate("/results")} className="gap-2 text-white shadow-surface-sm" style={{ background: "var(--pinn-orange)" }}>
        <Plus className="h-4 w-4" /> Ir para Resultados
      </Button>
    </div>
  );

  const leadsParaSDR = leads.filter(l => (l.estagio === "novo" || l.estagio === "em_analise") && !l.sdr_status).length;

  return (
    <div className="space-y-5 animate-in-fade">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-foreground">Pipeline de Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} lead{leads.length !== 1 ? "s" : ""} · Arraste para mover entre estágios
          </p>
        </div>
        <div className="flex gap-2">
          {leadsParaSDR > 0 && (
            <Button size="sm" className="gap-1.5 shadow-surface-sm"
              disabled={sdrLoading} onClick={handleEnviarTodosSDR}>
              {sdrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Enviar {leadsParaSDR} ao SDR
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 shadow-surface-xs" onClick={() => navigate("/results")}>
            <Plus className="h-3.5 w-3.5" /> Adicionar leads
          </Button>
        </div>
      </div>

      {/*
        Um único grid 5×2: mesmas trilhas de coluna para contadores e Kanban (alinhamento garantido).
      */}
      <div className={cn(PIPELINE_GRID_CLASS, "min-h-[60vh] grid-rows-[auto_1fr] pb-4")}>
        {COLUNAS.map(c => {
          const count = leads.filter(l => l.estagio === c.id).length;
          return (
            <div key={`stat-${c.id}`} className={cn("min-w-0 rounded-xl border px-3 py-2.5 text-center", c.headerColor)}>
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <div className={cn("h-2 w-2 shrink-0 rounded-full", c.dotColor)} />
                <p className="text-[11px] text-muted-foreground font-medium truncate">{c.label}</p>
              </div>
              <p className="text-xl font-semibold tabular-nums text-foreground">{count}</p>
            </div>
          );
        })}
        {COLUNAS.map(col => {
          const colLeads = leads.filter(l => l.estagio === col.id).sort((a, b) => b.score_icp - a.score_icp);
          const isOver = overCol === col.id;
          return (
            <div key={col.id}
              onDragOver={e => onDragOver(e, col.id)}
              onDrop={e => onDrop(e, col.id)}
              className={cn(
                "flex min-h-0 min-w-0 flex-col gap-2 rounded-xl border p-2.5 transition-all duration-150",
                isOver
                  ? "bg-primary/5 border-primary/30 shadow-surface-sm"
                  : "bg-muted/30 border-border/60"
              )}
            >
              {/* Col header */}
              <div className="flex items-center justify-between gap-1 px-1 pb-1.5 border-b border-border/40">
                <div className="flex min-w-0 items-center gap-2">
                  <div className={cn("h-2 w-2 shrink-0 rounded-full", col.dotColor)} />
                  <span className="truncate text-xs font-semibold text-foreground">{col.label}</span>
                </div>
                <span className={cn("shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border", col.badgeColor)}>
                  {colLeads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto">
                {colLeads.map(lead => (
                  <LeadCard key={lead.id} lead={lead}
                    onMove={handleMove} onRemove={id => setConfirmRemove(id)}
                    onDetail={setDetalhe} isDragging={draggingId === lead.id}
                    onDragStart={onDragStart} onDragEnd={onDragEnd} />
                ))}
                {colLeads.length === 0 && (
                  <div className={cn(
                    "flex h-20 items-center justify-center rounded-xl border-2 border-dashed text-xs text-muted-foreground/50 transition-all",
                    isOver ? "border-primary/30 bg-primary/5 text-primary" : "border-border/40"
                  )}>
                    Arraste aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DetalheSheet lead={detalhe} onClose={() => setDetalhe(null)}
        onMove={handleMove} onNotaChange={handleNota}
        onEnviarSDR={handleEnviarSDR} sdrLoading={sdrLoading} />

      <AlertDialog open={!!confirmRemove} onOpenChange={v => !v && setConfirmRemove(null)}>
        <AlertDialogContent className="shadow-surface-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remover do pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o lead do board. Ele continuará disponível nos Resultados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white"
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
