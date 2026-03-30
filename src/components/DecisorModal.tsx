import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Stack, Typography, Button, Chip, IconButton,
  CircularProgress, Divider, Tooltip, Collapse,
} from "@mui/material";
import {
  CloseRounded, PersonRounded, PhoneRounded,
  EmailRounded, RefreshRounded,
  BusinessRounded, LinkRounded, WarningAmberRounded,
  ManageSearchRounded, ExpandMoreRounded,
} from "@mui/icons-material";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

// ─── tipos ────────────────────────────────────────────────────────────────

interface Telefone {
  numero: string;
  tipo: "fixo" | "movel";
  whatsapp: boolean;
  nao_perturbe: boolean;
  ultimo_contato?: string;
}

interface Socio {
  nome: string;
  cpf_cnpj?: string;
  cargo?: string;
  data_entrada?: string;
}

interface PessoaFisicaDados {
  encontrado: boolean;
  cpf: string;
  nome?: string;
  data_nascimento?: string;
  obito?: boolean;
  telefones?: Telefone[];
  emails?: { email: string; tipo?: string }[];
  empresas?: { cnpj?: string; razao_social?: string; cargo?: string }[];
}

interface DecisorDados {
  encontrado: boolean;
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  situacao?: string;
  porte?: string;
  funcionarios?: number;
  site?: string;
  telefones?: Telefone[];
  emails?: { email: string; tipo?: string }[];
  socios?: Socio[];
  fonte?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cnpj: string;
  nomeEmpresa?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────

function fmtTel(num: string): string {
  const d = num.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return num;
}

// ─── SocioRow: mostra sócio + botão de enriquecimento CPF ─────────────────

function SocioRow({ s }: { s: Socio }) {
  const [open, setOpen] = useState(false);
  const [pf, setPF]     = useState<PessoaFisicaDados | null>(null);
  const [loading, setLoading] = useState(false);

  const cpfLimpo = (s.cpf_cnpj || "").replace(/\D/g, "");
  const isCPF = cpfLimpo.length === 11;

  const loadPF = async (refresh = false) => {
    if (!isCPF) return;
    setLoading(true);
    try {
      const params = refresh ? "?refresh=true" : "";
      const res = await apiFetch(`/assertiva/pessoa/${cpfLimpo}${params}`);
      setPF(res.dados);
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao buscar dados do sócio");
    } finally {
      setLoading(false);
    }
  };

  const pfTels = pf?.telefones ?? [];
  const pfWA   = pfTels.filter(t => t.whatsapp);
  const pfOthers = pfTels.filter(t => !t.whatsapp);
  const pfEmails = pf?.emails ?? [];

  return (
    <Box sx={{ borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
      {/* Header do sócio */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 1.5, py: 1.25 }}>
        <Box sx={{
          width: 28, height: 28, borderRadius: "50%",
          backgroundColor: "rgba(249,115,22,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "#F97316" }}>
            {(s.nome || "?")[0].toUpperCase()}
          </Typography>
        </Box>
        <Box flex={1}>
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{s.nome}</Typography>
          {s.cargo && (
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{s.cargo}</Typography>
          )}
        </Box>
        <Stack direction="row" alignItems="center" gap={0.5}>
          {s.data_entrada && (
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", flexShrink: 0 }}>
              desde {s.data_entrada}
            </Typography>
          )}
          {isCPF && (
            <Tooltip title={open ? "Ocultar dados pessoais" : "Buscar dados pessoais"}>
              <IconButton
                size="small"
                onClick={() => open ? setOpen(false) : (pf ? setOpen(true) : loadPF())}
                disabled={loading}
                sx={{ color: open ? "#F97316" : "text.secondary" }}
              >
                {loading
                  ? <CircularProgress size={14} color="inherit" />
                  : open
                    ? <ExpandMoreRounded sx={{ fontSize: 16 }} />
                    : <ManageSearchRounded sx={{ fontSize: 16 }} />
                }
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      {/* Dados PF expandidos */}
      <Collapse in={open && !!pf}>
        {pf && !pf.encontrado && (
          <Box sx={{ px: 1.5, pb: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", pt: 1 }}>
              CPF não encontrado na base Assertiva.
            </Typography>
          </Box>
        )}

        {pf?.encontrado && (
          <Stack gap={1} sx={{ px: 1.5, pb: 1.5, pt: 1, borderTop: "1px solid", borderColor: "divider", backgroundColor: "action.hover" }}>
            {/* WhatsApp pessoal */}
            {pfWA.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: "#4ADE80", textTransform: "uppercase", letterSpacing: "0.08em", mb: 0.5 }}>
                  WhatsApp pessoal
                </Typography>
                {pfWA.map((t, i) => (
                  <Stack key={i} direction="row" alignItems="center" gap={1}
                    sx={{ px: 1.25, py: 0.75, borderRadius: "6px", border: "1px solid rgba(34,197,94,0.2)", backgroundColor: "rgba(34,197,94,0.05)", mb: 0.5 }}>
                    <Box component="svg" viewBox="0 0 24 24" sx={{ width: 13, height: 13, fill: "#4ADE80", flexShrink: 0 }}>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </Box>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, fontFamily: "monospace" }}>
                      {fmtTel(t.numero)}
                    </Typography>
                    {t.nao_perturbe && (
                      <Chip label="NP" size="small"
                        sx={{ fontSize: "0.5rem", height: 14, backgroundColor: "rgba(239,68,68,0.1)", color: "#FCA5A5" }} />
                    )}
                  </Stack>
                ))}
              </Box>
            )}

            {/* Outros telefones pessoais */}
            {pfOthers.length > 0 && (
              <Stack gap={0.5}>
                {pfOthers.map((t, i) => (
                  <Stack key={i} direction="row" alignItems="center" gap={1}
                    sx={{ px: 1.25, py: 0.75, borderRadius: "6px", border: "1px solid", borderColor: "divider" }}>
                    <PhoneRounded sx={{ fontSize: 13, color: "text.secondary" }} />
                    <Typography sx={{ fontSize: "0.8125rem", fontFamily: "monospace", flex: 1 }}>{fmtTel(t.numero)}</Typography>
                    <Chip label={t.tipo} size="small" variant="outlined" sx={{ fontSize: "0.5625rem", height: 16, textTransform: "capitalize" }} />
                  </Stack>
                ))}
              </Stack>
            )}

            {/* E-mails pessoais */}
            {pfEmails.length > 0 && (
              <Stack gap={0.5}>
                {pfEmails.map((e, i) => (
                  <Stack key={i} direction="row" alignItems="center" gap={1}
                    sx={{ px: 1.25, py: 0.75, borderRadius: "6px", border: "1px solid", borderColor: "divider" }}>
                    <EmailRounded sx={{ fontSize: 13, color: "text.secondary" }} />
                    <Typography sx={{ fontSize: "0.8125rem", flex: 1 }}>{e.email}</Typography>
                  </Stack>
                ))}
              </Stack>
            )}

            {pfWA.length === 0 && pfOthers.length === 0 && pfEmails.length === 0 && (
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                Nenhum contato encontrado para este sócio.
              </Typography>
            )}

            {/* Refresh PF */}
            <Stack direction="row" justifyContent="flex-end">
              <Button size="small" sx={{ fontSize: "0.625rem", color: "text.secondary", minWidth: 0, p: "2px 6px" }}
                startIcon={<RefreshRounded sx={{ fontSize: 11 }} />}
                onClick={() => loadPF(true)}>
                Atualizar
              </Button>
            </Stack>
          </Stack>
        )}
      </Collapse>
    </Box>
  );
}

// ─── componente ───────────────────────────────────────────────────────────

export default function DecisorModal({ open, onClose, cnpj, nomeEmpresa }: Props) {
  const [dados, setDados]     = useState<DecisorDados | null>(null);
  const [fonte, setFonte]     = useState<"cache" | "assertiva" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = async (refresh = false) => {
    if (!cnpj) return;
    setLoading(true);
    setError(null);
    try {
      const params = refresh ? "?refresh=true" : "";
      const res = await apiFetch(`/assertiva/decisores/${cnpj}${params}`);
      setDados(res.dados);
      setFonte(res.fonte);
    } catch (e: any) {
      const msg = e?.message || "Erro ao buscar decisores";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && cnpj) {
      setDados(null);
      setFonte(null);
      setError(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cnpj]);

  const socios    = dados?.socios    ?? [];
  const telefones = dados?.telefones ?? [];
  const emails    = dados?.emails    ?? [];
  const whatsapps = telefones.filter(t => t.whatsapp);

  const paperSx = {
    backgroundColor: "background.paper",
    backgroundImage: "none",
    border: "1px solid",
    borderColor: "divider",
    borderRadius: "16px",
    maxWidth: 560,
    width: "100%",
  };

  return (
    <Dialog open={open} onClose={onClose} PaperProps={{ sx: paperSx }}>
      {/* Header */}
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Box sx={{
              width: 32, height: 32, borderRadius: "8px",
              backgroundColor: "rgba(249,115,22,0.1)",
              border: "1px solid rgba(249,115,22,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <PersonRounded sx={{ fontSize: 16, color: "#F97316" }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>
                Decisores
              </Typography>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                {nomeEmpresa || cnpj}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {fonte && (
              <Chip
                label={fonte === "cache" ? "Cache" : "Assertiva"}
                size="small"
                sx={{
                  fontSize: "0.625rem", height: 20,
                  backgroundColor: fonte === "cache" ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.1)",
                  color: fonte === "cache" ? "#60A5FA" : "#4ADE80",
                  border: `1px solid ${fonte === "cache" ? "rgba(59,130,246,0.2)" : "rgba(34,197,94,0.2)"}`,
                }}
              />
            )}
            <Tooltip title="Atualizar da Assertiva">
              <IconButton size="small" onClick={() => load(true)} disabled={loading} sx={{ color: "text.secondary" }}>
                <RefreshRounded sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
              <CloseRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 2.5 }}>
        {/* Loading */}
        {loading && (
          <Stack alignItems="center" justifyContent="center" py={5} gap={1.5}>
            <CircularProgress size={28} color="primary" />
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
              Consultando Assertiva...
            </Typography>
          </Stack>
        )}

        {/* Erro */}
        {!loading && error && (
          <Stack alignItems="center" gap={1.5} py={4}>
            <WarningAmberRounded sx={{ fontSize: 32, color: "#F59E0B" }} />
            <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", textAlign: "center" }}>
              {error}
            </Typography>
            <Button size="small" variant="outlined" onClick={() => load()}>
              Tentar novamente
            </Button>
          </Stack>
        )}

        {/* Não encontrado */}
        {!loading && !error && dados && !dados.encontrado && (
          <Stack alignItems="center" gap={1.5} py={4}>
            <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
              CNPJ não encontrado na base Assertiva.
            </Typography>
          </Stack>
        )}

        {/* Dados */}
        {!loading && !error && dados?.encontrado && (
          <Stack gap={3}>
            {/* Info da empresa */}
            <Box sx={{ p: 2, borderRadius: "10px", border: "1px solid", borderColor: "divider", backgroundColor: "action.hover" }}>
              <Stack direction="row" alignItems="flex-start" gap={1.5}>
                <BusinessRounded sx={{ fontSize: 15, color: "text.secondary", mt: 0.25 }} />
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                    {dados.nome_fantasia || dados.razao_social}
                  </Typography>
                  {dados.nome_fantasia && dados.razao_social !== dados.nome_fantasia && (
                    <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{dados.razao_social}</Typography>
                  )}
                  <Stack direction="row" gap={1} mt={0.75} flexWrap="wrap">
                    {dados.situacao && (
                      <Chip label={dados.situacao} size="small" sx={{ fontSize: "0.625rem", height: 18 }} />
                    )}
                    {dados.porte && (
                      <Chip label={dados.porte} size="small" variant="outlined" sx={{ fontSize: "0.625rem", height: 18 }} />
                    )}
                    {dados.funcionarios && (
                      <Chip label={`${dados.funcionarios} func.`} size="small" variant="outlined" sx={{ fontSize: "0.625rem", height: 18 }} />
                    )}
                  </Stack>
                  {dados.site && (
                    <Stack direction="row" alignItems="center" gap={0.5} mt={0.75}>
                      <LinkRounded sx={{ fontSize: 12, color: "text.secondary" }} />
                      <Typography
                        component="a"
                        href={dados.site.startsWith("http") ? dados.site : `https://${dados.site}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ fontSize: "0.6875rem", color: "#F97316", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                      >
                        {dados.site}
                      </Typography>
                    </Stack>
                  )}
                </Box>
              </Stack>
            </Box>

            {/* WhatsApp em destaque */}
            {whatsapps.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "#4ADE80", textTransform: "uppercase", letterSpacing: "0.08em", mb: 1 }}>
                  WhatsApp confirmado
                </Typography>
                <Stack gap={1}>
                  {whatsapps.map((t, i) => (
                    <Stack key={i} direction="row" alignItems="center" justifyContent="space-between"
                      sx={{ p: 1.5, borderRadius: "8px", border: "1px solid rgba(34,197,94,0.2)", backgroundColor: "rgba(34,197,94,0.05)" }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        {/* WhatsApp icon via SVG inline */}
                      <Box component="svg" viewBox="0 0 24 24" sx={{ width: 16, height: 16, fill: "#4ADE80", flexShrink: 0 }}>
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </Box>
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, fontFamily: "monospace" }}>
                          {fmtTel(t.numero)}
                        </Typography>
                        {t.nao_perturbe && (
                          <Chip label="NÃO PERTURBE" size="small"
                            sx={{ fontSize: "0.5625rem", height: 16, backgroundColor: "rgba(239,68,68,0.1)", color: "#FCA5A5" }} />
                        )}
                      </Stack>
                      <Chip label={t.tipo} size="small" variant="outlined"
                        sx={{ fontSize: "0.625rem", height: 18, textTransform: "capitalize" }} />
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Todos os telefones */}
            {telefones.filter(t => !t.whatsapp).length > 0 && (
              <Box>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em", mb: 1 }}>
                  Outros telefones
                </Typography>
                <Stack gap={0.75}>
                  {telefones.filter(t => !t.whatsapp).map((t, i) => (
                    <Stack key={i} direction="row" alignItems="center" gap={1.5}
                      sx={{ px: 1.5, py: 1, borderRadius: "8px", border: "1px solid", borderColor: "divider" }}>
                      <PhoneRounded sx={{ fontSize: 14, color: "text.secondary" }} />
                      <Typography sx={{ fontSize: "0.8125rem", fontFamily: "monospace", flex: 1 }}>
                        {fmtTel(t.numero)}
                      </Typography>
                      <Chip label={t.tipo} size="small" variant="outlined"
                        sx={{ fontSize: "0.625rem", height: 18, textTransform: "capitalize" }} />
                      {t.nao_perturbe && (
                        <Chip label="NP" size="small"
                          sx={{ fontSize: "0.5625rem", height: 16, backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }} />
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}

            {/* E-mails */}
            {emails.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em", mb: 1 }}>
                  E-mails
                </Typography>
                <Stack gap={0.75}>
                  {emails.map((e, i) => (
                    <Stack key={i} direction="row" alignItems="center" gap={1.5}
                      sx={{ px: 1.5, py: 1, borderRadius: "8px", border: "1px solid", borderColor: "divider" }}>
                      <EmailRounded sx={{ fontSize: 14, color: "text.secondary" }} />
                      <Typography sx={{ fontSize: "0.8125rem", flex: 1 }}>{e.email}</Typography>
                      {e.tipo && (
                        <Chip label={e.tipo} size="small" variant="outlined"
                          sx={{ fontSize: "0.625rem", height: 18, textTransform: "capitalize" }} />
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Sócios */}
            {socios.length > 0 && (
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Sócios / Decisores
                  </Typography>
                  <Typography sx={{ fontSize: "0.625rem", color: "text.secondary" }}>
                    Clique em <ManageSearchRounded sx={{ fontSize: 11, verticalAlign: "middle" }} /> para enriquecer
                  </Typography>
                </Stack>
                <Stack gap={0.75}>
                  {socios.map((s, i) => (
                    <SocioRow key={i} s={s} />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
          Fechar
        </Button>
        <Button size="small" variant="outlined" startIcon={<RefreshRounded sx={{ fontSize: 14 }} />}
          onClick={() => load(true)} disabled={loading}>
          Atualizar da API
        </Button>
      </DialogActions>
    </Dialog>
  );
}
