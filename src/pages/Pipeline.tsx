// src/pages/Pipeline.tsx — Hermes Design System v2 (MUI)
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Stack, Typography, Button, Card, CardContent,
  IconButton, Chip, Tooltip, TextField, Drawer,
  Menu, MenuItem, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, CircularProgress, Divider,
} from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import ChatIcon from "@mui/icons-material/Chat";
import LanguageIcon from "@mui/icons-material/Language";
import DeleteIcon from "@mui/icons-material/Delete";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import BoltIcon from "@mui/icons-material/Bolt";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import AddIcon from "@mui/icons-material/Add";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioIcon from "@mui/icons-material/Radio";

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
  dotColor: string; badgeBg: string; badgeColor: string; descricao: string;
};

const COLUNAS: Coluna[] = [
  { id: "novo",        label: "Novos",       dotColor: "#94a3b8", badgeBg: "#1e2a3a", badgeColor: "#94a3b8", descricao: "Recém-adicionados" },
  { id: "em_analise",  label: "Em análise",  dotColor: "#3b82f6", badgeBg: "#1e2d4a", badgeColor: "#60a5fa", descricao: "Pesquisando mais" },
  { id: "contactado",  label: "Contactado",  dotColor: "#f59e0b", badgeBg: "#2d2010", badgeColor: "#fbbf24", descricao: "Primeiro contato feito" },
  { id: "qualificado", label: "Qualificado", dotColor: "#10b981", badgeBg: "#0d2d20", badgeColor: "#34d399", descricao: "Lead confirmado" },
  { id: "descartado",  label: "Descartado",  dotColor: "#f87171", badgeBg: "#2d1010", badgeColor: "#f87171", descricao: "Fora do perfil" },
];

function scoreColor(s: number) {
  if (s >= 75) return { bg: "#0d2d20", color: "#34d399", border: "#10b981" };
  if (s >= 50) return { bg: "#1e2d10", color: "#a3e635", border: "#84cc16" };
  if (s >= 25) return { bg: "#2d2010", color: "#fbbf24", border: "#f59e0b" };
  return { bg: "#2d1010", color: "#f87171", border: "#ef4444" };
}

/* ── Lead Card ────────────────────────────────────────────────────────────── */
function LeadCard({ lead, onMove, onRemove, onDetail, isDragging, onDragStart, onDragEnd }: {
  lead: LeadPipeline; onMove: (id: string, e: EstagioLead) => void;
  onRemove: (id: string) => void; onDetail: (l: LeadPipeline) => void;
  isDragging: boolean; onDragStart: (id: string) => void; onDragEnd: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const emp = lead.empresa;
  const temContato = emp.email || emp.email_enriquecido || emp.telefone_padrao ||
    emp.telefone_receita || emp.whatsapp_publico || emp.whatsapp_enriquecido;
  const sc = scoreColor(lead.score_icp);

  return (
    <Card
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => onDetail(lead)}
      sx={{
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.07)",
        backgroundColor: "#202020",
        cursor: "pointer",
        opacity: isDragging ? 0.4 : 1,
        transform: isDragging ? "rotate(1deg) scale(0.95)" : "none",
        transition: "all 0.15s",
        "&:hover": { borderColor: "rgba(255,255,255,0.14)", backgroundColor: "#242424" },
        mb: 0,
      }}
    >
      <CardContent sx={{ p: "10px !important" }}>
        {/* Top row */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={0.5}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={500}
              sx={{
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: "#F0F0F0", lineHeight: 1.3, fontSize: 13,
              }}
            >
              {emp.nome_fantasia || emp.razao_social}
            </Typography>
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.25 }}>
              <LocationOnIcon sx={{ fontSize: 10, color: "#9A9A9A", flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: "#9A9A9A", fontSize: 10 }}>
                {emp.cidade || "—"} / {emp.uf || "—"}
              </Typography>
            </Stack>
          </Box>
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0 }}>
            <Box sx={{
              fontSize: 10, fontWeight: 700, px: 1, py: 0.25, borderRadius: 0.75,
              border: `1px solid ${sc.border}`, backgroundColor: sc.bg, color: sc.color,
              fontVariantNumeric: "tabular-nums",
            }}>
              {lead.score_icp.toFixed(0)}
            </Box>
            <IconButton
              size="small"
              onClick={e => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
              sx={{ width: 20, height: 20, borderRadius: 0.75, opacity: 0.6, "&:hover": { opacity: 1, backgroundColor: "rgba(255,255,255,0.08)" } }}
            >
              <MoreHorizIcon sx={{ fontSize: 12 }} />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              onClick={e => e.stopPropagation()}
              PaperProps={{ sx: { backgroundColor: "#282828", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 1.5, minWidth: 160 } }}
            >
              <MenuItem onClick={() => { setMenuAnchor(null); onDetail(lead); }} sx={{ fontSize: 12 }}>Ver detalhes</MenuItem>
              {COLUNAS.filter(c => c.id !== lead.estagio).map(c => (
                <MenuItem key={c.id} onClick={() => { setMenuAnchor(null); onMove(lead.id, c.id); }} sx={{ fontSize: 12 }}>
                  Mover: {c.label}
                </MenuItem>
              ))}
              <Divider sx={{ borderColor: "rgba(255,255,255,0.07)", my: 0.5 }} />
              <MenuItem
                onClick={() => { setMenuAnchor(null); onRemove(lead.id); }}
                sx={{ fontSize: 12, color: "#f87171" }}
              >
                <DeleteIcon sx={{ fontSize: 12, mr: 1 }} /> Remover
              </MenuItem>
            </Menu>
          </Stack>
        </Stack>

        {/* Badges: segmento / porte */}
        {(emp.segmento || emp.porte) && (
          <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
            {emp.segmento && (
              <Chip label={emp.segmento} size="small" variant="outlined" sx={{
                fontSize: 9, height: 16, borderColor: "rgba(255,255,255,0.10)",
                color: "#9A9A9A", "& .MuiChip-label": { px: 0.75 },
              }} />
            )}
            {emp.porte && (
              <Chip label={emp.porte} size="small" variant="outlined" sx={{
                fontSize: 9, height: 16, borderColor: "rgba(255,255,255,0.10)",
                color: "#9A9A9A", "& .MuiChip-label": { px: 0.75 },
              }} />
            )}
          </Stack>
        )}

        {/* Contact icons */}
        {temContato && (
          <Stack direction="row" gap={0.5} sx={{ mt: 1 }}>
            {(emp.email || emp.email_enriquecido) && (
              <Box sx={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 0.75, backgroundColor: "#0c1f2e", border: "1px solid #1e4060" }}>
                <EmailIcon sx={{ fontSize: 10, color: "#38bdf8" }} />
              </Box>
            )}
            {(emp.whatsapp_publico || emp.whatsapp_enriquecido) && (
              <Box sx={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 0.75, backgroundColor: "#0d2d20", border: "1px solid #1a5c3a" }}>
                <ChatIcon sx={{ fontSize: 10, color: "#34d399" }} />
              </Box>
            )}
            {(emp.telefone_padrao || emp.telefone_receita) && (
              <Box sx={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 0.75, backgroundColor: "#202020", border: "1px solid rgba(255,255,255,0.10)" }}>
                <PhoneIcon sx={{ fontSize: 10, color: "#9A9A9A" }} />
              </Box>
            )}
            {emp.site && (
              <Box sx={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 0.75, backgroundColor: "#1a1028", border: "1px solid #3b1f5c" }}>
                <LanguageIcon sx={{ fontSize: 10, color: "#a78bfa" }} />
              </Box>
            )}
          </Stack>
        )}

        {/* SDR status */}
        {lead.sdr_status && (
          <Box sx={{ mt: 1 }}>
            <Chip
              icon={<RadioIcon sx={{ fontSize: 10, "&&": { color: "inherit" } }} />}
              label={`SDR: ${lead.sdr_status}`}
              size="small"
              sx={{
                fontSize: 9, height: 16, fontWeight: 400,
                backgroundColor: "#2d2010", color: "#fbbf24",
                border: "1px solid #78450a",
                "& .MuiChip-label": { px: 0.75 },
                "& .MuiChip-icon": { ml: 0.5, fontSize: 10 },
              }}
            />
          </Box>
        )}

        {/* Nota */}
        {lead.nota && (
          <Typography variant="caption" sx={{
            display: "-webkit-box", color: "#9A9A9A", mt: 1, fontStyle: "italic",
            overflow: "hidden", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", fontSize: 10,
            borderTop: "1px solid rgba(255,255,255,0.07)", pt: 1,
          }}>
            {lead.nota}
          </Typography>
        )}
      </CardContent>
    </Card>
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
      <Drawer
        anchor="right"
        open={!!lead}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 420 }, backgroundColor: "#181818",
            border: "1px solid rgba(255,255,255,0.07)", overflowY: "auto",
          },
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2.5, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: "#F0F0F0", lineHeight: 1.3 }}>
            {emp.nome_fantasia || emp.razao_social}
          </Typography>
          <Typography variant="caption" sx={{ color: "#9A9A9A", fontFamily: "monospace" }}>
            {emp.cnpj}
          </Typography>
        </Box>

        <Box sx={{ p: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Stage pills */}
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {COLUNAS.map(c => {
                const active = lead.estagio === c.id;
                return (
                  <Box
                    key={c.id}
                    component="button"
                    onClick={() => onMove(lead.id, c.id)}
                    sx={{
                      fontSize: 11, fontWeight: 500, px: 1.5, py: 0.5,
                      borderRadius: "99px", border: "1px solid",
                      cursor: "pointer", transition: "all 0.15s",
                      backgroundColor: active ? c.badgeBg : "transparent",
                      borderColor: active ? c.dotColor : "rgba(255,255,255,0.12)",
                      color: active ? c.badgeColor : "#9A9A9A",
                      "&:hover": { borderColor: active ? c.dotColor : "rgba(249,115,22,0.4)", color: "#F0F0F0" },
                    }}
                  >
                    {c.label}
                  </Box>
                );
              })}
            </Stack>

            {/* SDR status banner */}
            {lead.sdr_status && (
              <Stack direction="row" alignItems="flex-start" gap={1.5} sx={{
                px: 2, py: 1.5, borderRadius: 2, backgroundColor: "#2d2010", border: "1px solid #78450a",
              }}>
                <RadioIcon sx={{ fontSize: 14, color: "#f59e0b", mt: 0.25 }} />
                <Box>
                  <Typography variant="caption" fontWeight={700} sx={{ color: "#fbbf24", display: "block" }}>
                    SDR: {lead.sdr_status}
                  </Typography>
                  {lead.sdr_enviado_em && (
                    <Typography variant="caption" sx={{ color: "#d97706", fontSize: 10 }}>
                      Enviado em {new Date(lead.sdr_enviado_em).toLocaleDateString("pt-BR")}
                    </Typography>
                  )}
                </Box>
              </Stack>
            )}

            {/* Dados */}
            <Card sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#202020" }}>
              <CardContent sx={{ p: "14px !important" }}>
                <Stack spacing={1}>
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
                    <Stack key={k as string} direction="row" gap={1.5}>
                      <Typography variant="caption" sx={{ color: "#9A9A9A", minWidth: 90, flexShrink: 0, fontSize: 11 }}>
                        {k}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#F0F0F0", wordBreak: "break-all", fontSize: 11 }}>
                        {v as string}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            {/* Contatos */}
            <Card sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#202020" }}>
              <CardContent sx={{ p: "14px !important" }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
                  <SendIcon sx={{ fontSize: 13, color: "#a78bfa" }} />
                  <Typography variant="caption" fontWeight={700} sx={{ color: "#9A9A9A", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                    Contatos disponíveis
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {[
                    { IconComp: EmailIcon, label: "E-mail", value: emp.email, color: "#38bdf8" },
                    { IconComp: EmailIcon, label: "E-mail enriquecido", value: emp.email_enriquecido, color: "#7dd3fc" },
                    { IconComp: ChatIcon, label: "WhatsApp público", value: emp.whatsapp_publico, color: "#34d399" },
                    { IconComp: ChatIcon, label: "WhatsApp enriquecido", value: emp.whatsapp_enriquecido, color: "#6ee7b7" },
                    { IconComp: PhoneIcon, label: "Telefone principal", value: emp.telefone_padrao, color: "#94a3b8" },
                    { IconComp: PhoneIcon, label: "Telefone Receita", value: emp.telefone_receita, color: "#64748b" },
                  ].filter(c => c.value).map(c => (
                    <Stack key={c.label} direction="row" alignItems="center" gap={1}>
                      <c.IconComp sx={{ fontSize: 13, color: c.color, flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ color: "#9A9A9A", minWidth: 130, flexShrink: 0, fontSize: 11 }}>
                        {c.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#F0F0F0", wordBreak: "break-all", fontSize: 11 }}>
                        {c.value}
                      </Typography>
                    </Stack>
                  ))}
                  {!temContatoSDR && (
                    <Typography variant="caption" sx={{ color: "rgba(154,154,154,0.6)", fontStyle: "italic", fontSize: 11 }}>
                      Nenhum contato disponível
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {/* Nota */}
            <Box>
              <Typography variant="caption" fontWeight={700} sx={{ color: "#9A9A9A", display: "block", mb: 0.75, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                Notas internas
              </Typography>
              <TextField
                multiline
                rows={3}
                value={nota}
                onChange={e => setNota(e.target.value)}
                onBlur={() => onNotaChange(lead.id, nota)}
                placeholder="Observações sobre o lead..."
                fullWidth
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    fontSize: 12, backgroundColor: "rgba(255,255,255,0.03)",
                    "& fieldset": { borderColor: "rgba(255,255,255,0.10)" },
                    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.20)" },
                    "&.Mui-focused fieldset": { borderColor: "rgba(249,115,22,0.4)" },
                  },
                  "& .MuiInputBase-input": { color: "#F0F0F0" },
                  "& .MuiInputBase-input::placeholder": { color: "rgba(154,154,154,0.5)", opacity: 1 },
                }}
              />
            </Box>

            {/* Ações */}
            <Box>
              <Typography variant="caption" fontWeight={700} sx={{ color: "#9A9A9A", display: "block", mb: 1, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                Ações
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ChatIcon sx={{ fontSize: "14px !important" }} />}
                  onClick={() => setMensagemOpen(true)}
                  sx={{ fontSize: 11, height: 30, borderColor: "#1a5c3a", color: "#34d399", "&:hover": { backgroundColor: "#0d2d20", borderColor: "#34d399" } }}
                >
                  Mensagem
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<BusinessIcon sx={{ fontSize: "14px !important" }} />}
                  onClick={() => setCrmOpen(true)}
                  sx={{ fontSize: 11, height: 30, borderColor: "#1e4060", color: "#60a5fa", "&:hover": { backgroundColor: "#1e2d4a", borderColor: "#60a5fa" } }}
                >
                  Enviar CRM
                </Button>
                {temContatoSDR && !lead.sdr_status && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={sdrLoading ? <CircularProgress size={12} /> : <BoltIcon sx={{ fontSize: "14px !important" }} />}
                    disabled={sdrLoading}
                    onClick={() => onEnviarSDR(lead.id)}
                    sx={{ fontSize: 11, height: 30, borderColor: "#3b1f5c", color: "#a78bfa", "&:hover": { backgroundColor: "#1a1028", borderColor: "#a78bfa" } }}
                  >
                    Enviar SDR
                  </Button>
                )}
                {lead.sdr_status && (
                  <Chip
                    icon={<CheckCircleIcon sx={{ fontSize: "12px !important", "&&": { color: "#34d399" } }} />}
                    label="Enviado ao SDR"
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: 10, height: 28, borderColor: "#1a5c3a", color: "#34d399", backgroundColor: "#0d2d20" }}
                  />
                )}
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Drawer>

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
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 16 }}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <CircularProgress size={16} sx={{ color: "#F97316" }} />
        <Typography variant="body2" sx={{ color: "#9A9A9A" }}>Carregando pipeline...</Typography>
      </Stack>
    </Box>
  );

  if (leads.length === 0) return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 16, gap: 2.5 }}>
      <Box sx={{
        width: 64, height: 64, borderRadius: 3,
        backgroundColor: "#202020", border: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <TrackChangesIcon sx={{ fontSize: 32, color: "#9A9A9A" }} />
      </Box>
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="h6" fontWeight={700} sx={{ color: "#F0F0F0" }}>Pipeline vazio</Typography>
        <Typography variant="body2" sx={{ color: "#9A9A9A", mt: 0.5, maxWidth: 320 }}>
          Adicione empresas da tela de Resultados para começar.
        </Typography>
      </Box>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={() => navigate("/results")}
        sx={{ backgroundColor: "#F97316", color: "#fff", fontWeight: 600, "&:hover": { backgroundColor: "#ea6c10" } }}
      >
        Ir para Resultados
      </Button>
    </Box>
  );

  const leadsParaSDR = leads.filter(l => (l.estagio === "novo" || l.estagio === "em_analise") && !l.sdr_status).length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ color: "#F0F0F0" }}>Pipeline de Leads</Typography>
          <Typography variant="body2" sx={{ color: "#9A9A9A", mt: 0.5 }}>
            {leads.length} lead{leads.length !== 1 ? "s" : ""} · Arraste para mover entre estágios
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          {leadsParaSDR > 0 && (
            <Button
              size="small"
              variant="contained"
              startIcon={sdrLoading ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <BoltIcon sx={{ fontSize: "14px !important" }} />}
              disabled={sdrLoading}
              onClick={handleEnviarTodosSDR}
              sx={{ backgroundColor: "#F97316", color: "#fff", fontWeight: 600, fontSize: 12, "&:hover": { backgroundColor: "#ea6c10" } }}
            >
              Enviar {leadsParaSDR} ao SDR
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon sx={{ fontSize: "14px !important" }} />}
            onClick={() => navigate("/results")}
            sx={{ fontSize: 12, borderColor: "rgba(255,255,255,0.12)", color: "#F0F0F0", "&:hover": { borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.04)" } }}
          >
            Adicionar leads
          </Button>
        </Stack>
      </Stack>

      {/* Stats bar */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1 }}>
        {COLUNAS.map(c => {
          const count = leads.filter(l => l.estagio === c.id).length;
          return (
            <Card key={c.id} sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#181818", textAlign: "center" }}>
              <CardContent sx={{ py: "10px !important", px: "8px !important" }}>
                <Stack direction="row" alignItems="center" justifyContent="center" gap={0.75} sx={{ mb: 0.25 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: c.dotColor, flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: "#9A9A9A", fontWeight: 500, fontSize: 10 }}>{c.label}</Typography>
                </Stack>
                <Typography variant="h6" fontWeight={600} sx={{ color: "#F0F0F0", fontVariantNumeric: "tabular-nums" }}>{count}</Typography>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Kanban */}
      <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 2, minHeight: "60vh" }}>
        {COLUNAS.map(col => {
          const colLeads = leads.filter(l => l.estagio === col.id).sort((a, b) => b.score_icp - a.score_icp);
          const isOver = overCol === col.id;
          return (
            <Box
              key={col.id}
              onDragOver={e => onDragOver(e, col.id)}
              onDrop={e => onDrop(e, col.id)}
              sx={{
                display: "flex", flexDirection: "column", gap: 1,
                minWidth: 240, width: 240, flexShrink: 0,
                borderRadius: 2.5, border: "1px solid",
                p: 1.25, transition: "all 0.15s",
                borderColor: isOver ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.07)",
                backgroundColor: isOver ? "rgba(249,115,22,0.04)" : "rgba(255,255,255,0.02)",
                boxShadow: isOver ? "0 0 0 2px rgba(249,115,22,0.15)" : "none",
              }}
            >
              {/* Column header */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5, pb: 1, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: col.dotColor }} />
                  <Typography variant="caption" fontWeight={700} sx={{ color: "#F0F0F0", fontSize: 12 }}>{col.label}</Typography>
                </Stack>
                <Box sx={{
                  fontSize: 10, fontWeight: 700, px: 1, py: 0.25, borderRadius: "99px",
                  border: `1px solid ${col.dotColor}40`, backgroundColor: col.badgeBg, color: col.badgeColor,
                }}>
                  {colLeads.length}
                </Box>
              </Stack>

              {/* Cards */}
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, minHeight: 120 }}>
                {colLeads.map(lead => (
                  <LeadCard key={lead.id} lead={lead}
                    onMove={handleMove} onRemove={id => setConfirmRemove(id)}
                    onDetail={setDetalhe} isDragging={draggingId === lead.id}
                    onDragStart={onDragStart} onDragEnd={onDragEnd} />
                ))}
                {colLeads.length === 0 && (
                  <Box sx={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    height: 80, borderRadius: 2, border: "2px dashed",
                    transition: "all 0.15s",
                    borderColor: isOver ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.08)",
                    backgroundColor: isOver ? "rgba(249,115,22,0.04)" : "transparent",
                  }}>
                    <Typography variant="caption" sx={{ color: isOver ? "#F97316" : "rgba(154,154,154,0.4)", fontSize: 11 }}>
                      Arraste aqui
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <DetalheSheet lead={detalhe} onClose={() => setDetalhe(null)}
        onMove={handleMove} onNotaChange={handleNota}
        onEnviarSDR={handleEnviarSDR} sdrLoading={sdrLoading} />

      {/* Confirm remove dialog */}
      <Dialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        PaperProps={{ sx: { backgroundColor: "#181818", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 2 } }}
      >
        <DialogTitle sx={{ color: "#F0F0F0", fontWeight: 700, fontSize: 16 }}>Remover do pipeline?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "#9A9A9A", fontSize: 14 }}>
            Esta ação remove o lead do board. Ele continuará disponível nos Resultados.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setConfirmRemove(null)}
            variant="outlined"
            size="small"
            sx={{ borderColor: "rgba(255,255,255,0.12)", color: "#F0F0F0", fontSize: 12 }}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => confirmRemove && handleRemove(confirmRemove)}
            variant="contained"
            size="small"
            sx={{ backgroundColor: "#dc2626", color: "#fff", fontSize: 12, "&:hover": { backgroundColor: "#b91c1c" } }}
          >
            Remover
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Pipeline;
