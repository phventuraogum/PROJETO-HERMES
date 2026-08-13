import { useEffect, useState, useCallback } from "react";
import {
  Box, Stack, Typography, Button, IconButton, Card,
  TextField, Grid, Chip, Accordion, AccordionSummary,
  AccordionDetails, Paper, Tooltip, CircularProgress,
  Tab, Tabs, MenuItem, Dialog, DialogTitle, DialogContent,
  DialogActions, Select, FormControl, InputLabel,
} from "@mui/material";
import RefreshRoundedIcon       from "@mui/icons-material/RefreshRounded";
import AddRoundedIcon            from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon  from "@mui/icons-material/DeleteOutlineRounded";
import StorageRoundedIcon        from "@mui/icons-material/StorageRounded";
import CheckCircleRoundedIcon    from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon   from "@mui/icons-material/WarningAmberRounded";
import ErrorOutlineRoundedIcon   from "@mui/icons-material/ErrorOutlineRounded";
import ContentCopyRoundedIcon    from "@mui/icons-material/ContentCopyRounded";
import ExpandMoreRoundedIcon     from "@mui/icons-material/ExpandMoreRounded";
import BusinessRoundedIcon       from "@mui/icons-material/BusinessRounded";
import PeopleRoundedIcon         from "@mui/icons-material/PeopleRounded";
import MonitorHeartRoundedIcon   from "@mui/icons-material/MonitorHeartRounded";
import BuildRoundedIcon          from "@mui/icons-material/BuildRounded";
import DashboardRoundedIcon      from "@mui/icons-material/DashboardRounded";
import PersonAddRoundedIcon      from "@mui/icons-material/PersonAddRounded";
import EditRoundedIcon           from "@mui/icons-material/EditRounded";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

// ─── tipos ──────────────────────────────────────────────────────────────────

type OrgAdmin = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  tenant_configured: boolean;
  supabase_url: string | null;
  n8n_outbound_webhook: string | null;
  n8n_kommo_webhook: string | null;
  assertiva_client_id: string | null;
  members_count: number;
};

type ProvisionResult = {
  org_id: string;
  supabase_url: string;
  tables: Record<string, string>;
  needs_provision: boolean;
  sql: string;
  instructions: string;
};

type SystemStats = {
  total_orgs: number;
  configured_tenants: number;
  unconfigured_tenants: number;
  total_members: number;
  unique_users: number;
};

type OrgMember = {
  user_id: string;
  email: string;
  role: string;
  created_at: string | null;
  last_sign_in: string | null;
};

type OrgHealth = {
  org_id: string;
  supabase_url?: string;
  reachable: boolean;
  error?: string;
  tables: Record<string, string>;
  counts: Record<string, number>;
};

// ─── API helpers ─────────────────────────────────────────────────────────────

const api = {
  listOrgs: (): Promise<OrgAdmin[]> =>
    apiFetch("/admin/orgs", { skipOrgHeader: true }),

  createOrg: (body: Record<string, string>): Promise<{ success: boolean; slug: string }> =>
    apiFetch("/admin/orgs", { method: "POST", body: JSON.stringify(body), skipOrgHeader: true }),

  setTenant: (orgId: string, body: Record<string, string>): Promise<{ success: boolean }> =>
    apiFetch(`/admin/orgs/${orgId}/tenant`, { method: "PUT", body: JSON.stringify(body), skipOrgHeader: true }),

  provision: (orgId: string): Promise<ProvisionResult> =>
    apiFetch(`/admin/orgs/${orgId}/provision`, { method: "POST", skipOrgHeader: true }),

  deleteOrg: (orgId: string): Promise<{ success: boolean }> =>
    apiFetch(`/admin/orgs/${orgId}`, { method: "DELETE", skipOrgHeader: true }),

  stats: (): Promise<SystemStats> =>
    apiFetch("/admin/stats", { skipOrgHeader: true }),

  listMembers: (orgId: string): Promise<OrgMember[]> =>
    apiFetch(`/admin/orgs/${orgId}/members`, { skipOrgHeader: true }),

  addMember: (orgId: string, email: string, role: string): Promise<{ success: boolean }> =>
    apiFetch(`/admin/orgs/${orgId}/members`, {
      method: "POST",
      body: JSON.stringify({ user_email: email, role }),
      skipOrgHeader: true,
    }),

  updateMember: (orgId: string, userId: string, role: string): Promise<{ success: boolean }> =>
    apiFetch(`/admin/orgs/${orgId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
      skipOrgHeader: true,
    }),

  removeMember: (orgId: string, userId: string): Promise<{ success: boolean }> =>
    apiFetch(`/admin/orgs/${orgId}/members/${userId}`, { method: "DELETE", skipOrgHeader: true }),

  health: (orgId: string): Promise<OrgHealth> =>
    apiFetch(`/admin/orgs/${orgId}/health`, { skipOrgHeader: true }),
};

// ─── shared styles ────────────────────────────────────────────────────────────

const cardSx = {
  bgcolor: "#141414",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
};

const labelSx = {
  fontSize: "0.625rem",
  fontWeight: 700,
  letterSpacing: "0.15em",
  textTransform: "uppercase" as const,
  color: "#555",
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <Box sx={{
      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
      bgcolor: ok ? "#22c55e" : "#eab308",
    }} />
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    owner:  { bg: "rgba(249,115,22,0.1)",  color: "#F97316", border: "rgba(249,115,22,0.3)"  },
    admin:  { bg: "rgba(56,189,248,0.1)",  color: "#38BDF8", border: "rgba(56,189,248,0.3)"  },
    member: { bg: "rgba(255,255,255,0.05)", color: "#888",   border: "rgba(255,255,255,0.1)" },
  };
  const c = colors[role] ?? colors.member;
  return (
    <Chip
      label={role}
      size="small"
      sx={{
        fontSize: "0.625rem", height: 18,
        bgcolor: c.bg, color: c.color,
        border: `1px solid ${c.border}`,
      }}
    />
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = false }: {
  label: string; value: number | string; sub?: string; accent?: boolean;
}) {
  return (
    <Box sx={{ ...cardSx, p: 2.5 }}>
      <Typography sx={labelSx}>{label}</Typography>
      <Typography sx={{
        fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em",
        color: accent ? "primary.main" : "text.primary", lineHeight: 1.1, mt: 0.75,
      }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.5 }}>{sub}</Typography>
      )}
    </Box>
  );
}

// ─── Tab: Visão Geral ────────────────────────────────────────────────────────

function TabOverview({ orgs, stats }: { orgs: OrgAdmin[]; stats: SystemStats | null }) {
  return (
    <Stack gap={3}>
      {/* KPIs */}
      <Grid container spacing={2}>
        {[
          { label: "Organizações", value: stats?.total_orgs ?? orgs.length, sub: "total cadastradas" },
          { label: "Tenants OK",   value: stats?.configured_tenants ?? orgs.filter(o => o.tenant_configured).length, sub: "com credenciais", accent: true },
          { label: "Sem tenant",   value: stats?.unconfigured_tenants ?? orgs.filter(o => !o.tenant_configured).length, sub: "pendentes" },
          { label: "Membros",      value: stats?.total_members ?? orgs.reduce((s, o) => s + (Number(o.members_count) || 0), 0), sub: "vínculos org/usuário" },
        ].map(k => (
          <Grid size={{ xs: 6, md: 3 }} key={k.label}>
            <KpiCard {...k} />
          </Grid>
        ))}
      </Grid>

      {/* Tabela resumo */}
      <Box sx={cardSx}>
        <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Typography sx={labelSx}>Organizações</Typography>
        </Box>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Nome", "Slug", "Tenant", "Membros", "Criada em"].map(h => (
                <Box key={h} component="th" sx={{ py: 1.25, px: 2, textAlign: "left", ...labelSx }}>{h}</Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {orgs.map((org, i) => (
              <Box key={org.id} component="tr" sx={{
                borderBottom: i < orgs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                "&:hover": { bgcolor: "rgba(255,255,255,0.02)" },
              }}>
                <Box component="td" sx={{ py: 1.5, px: 2 }}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <StatusDot ok={org.tenant_configured} />
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, color: "#D0D0D0" }}>{org.name}</Typography>
                  </Stack>
                </Box>
                <Box component="td" sx={{ py: 1.5, px: 2 }}>
                  <Typography sx={{ fontSize: "0.75rem", fontFamily: "monospace", color: "text.secondary" }}>{org.slug}</Typography>
                </Box>
                <Box component="td" sx={{ py: 1.5, px: 2 }}>
                  <Chip
                    label={org.tenant_configured ? "OK" : "Pendente"}
                    size="small"
                    sx={{
                      fontSize: "0.625rem", height: 18,
                      bgcolor: org.tenant_configured ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                      color: org.tenant_configured ? "#4ade80" : "#facc15",
                      border: `1px solid ${org.tenant_configured ? "rgba(34,197,94,0.3)" : "rgba(234,179,8,0.3)"}`,
                    }}
                  />
                </Box>
                <Box component="td" sx={{ py: 1.5, px: 2 }}>
                  <Typography sx={{ fontSize: "0.8125rem", color: "#888" }}>{org.members_count}</Typography>
                </Box>
                <Box component="td" sx={{ py: 1.5, px: 2 }}>
                  <Typography sx={{ fontSize: "0.75rem", color: "#555" }}>
                    {org.created_at && !isNaN(new Date(org.created_at).getTime())
                      ? new Date(org.created_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </Typography>
                </Box>
              </Box>
            ))}
            {orgs.length === 0 && (
              <Box component="tr">
                <Box component="td" colSpan={5} sx={{ py: 6, textAlign: "center" }}>
                  <Typography sx={{ fontSize: "0.8125rem", color: "#555" }}>Nenhuma organização</Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}

// ─── Tab: Clientes ───────────────────────────────────────────────────────────

function TabClientes({
  orgs, loading, showCreate, setShowCreate, form, setForm,
  tenantForms, setTenantForms, handleCreate, handleSetTenant,
  handleDelete, handleProvision, provisionResults,
}: {
  orgs: OrgAdmin[];
  loading: boolean;
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  form: Record<string, string>;
  setForm: (fn: (f: Record<string, string>) => Record<string, string>) => void;
  tenantForms: Record<string, Record<string, string>>;
  setTenantForms: (fn: (f: Record<string, Record<string, string>>) => Record<string, Record<string, string>>) => void;
  handleCreate: () => void;
  handleSetTenant: (id: string) => void;
  handleDelete: (org: OrgAdmin) => void;
  handleProvision: (id: string) => void;
  provisionResults: Record<string, ProvisionResult>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Stack gap={2}>
      {/* create form */}
      {showCreate && (
        <Box sx={cardSx}>
          <Box sx={{ px: 2.5, pt: 2.5, pb: 2, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <Typography sx={labelSx}>Nova Organização</Typography>
          </Box>
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={2}>
              {[
                { key: "name",                 label: "Nome *",              placeholder: "BF Company"              },
                { key: "slug",                 label: "Slug *",              placeholder: "bfcompany"               },
                { key: "user_email",           label: "E-mail do owner *",   placeholder: "admin@cliente.com"       },
                { key: "user_password",        label: "Senha inicial *",     placeholder: "mínimo 8 caracteres", type: "password" },
                { key: "supabase_url",         label: "Supabase URL",        placeholder: "https://xxx.supabase.co" },
                { key: "supabase_service_key", label: "Service Role Key",    placeholder: "eyJ..."                  },
                { key: "n8n_outbound_webhook", label: "n8n Webhook Outbound",placeholder: "https://..."             },
                { key: "n8n_kommo_webhook",    label: "n8n Webhook Kommo",   placeholder: "https://..."             },
              ].map(f => (
                <Grid size={{ xs: 12, sm: 6 }} key={f.key}>
                  <TextField
                    label={f.label}
                    placeholder={f.placeholder}
                    type={(f as any).type ?? "text"}
                    fullWidth size="small"
                    value={form[f.key] ?? ""}
                    onChange={e => setForm(prev => ({
                      ...prev,
                      [f.key]: f.key === "slug"
                        ? e.target.value.toLowerCase().replace(/\s/g, "")
                        : e.target.value,
                    }))}
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: "0.8125rem", bgcolor: "background.paper" } }}
                  />
                </Grid>
              ))}
            </Grid>
            <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 2 }}>
              <Button variant="outlined" size="small" onClick={() => setShowCreate(false)}
                sx={{ fontSize: "0.8125rem", textTransform: "none", borderColor: "rgba(255,255,255,0.1)", color: "#888" }}>
                Cancelar
              </Button>
              <Button variant="contained" size="small" onClick={handleCreate}
                sx={{ fontSize: "0.8125rem", textTransform: "none", fontWeight: 600 }}>
                Criar Organização
              </Button>
            </Stack>
          </Box>
        </Box>
      )}

      {/* org list */}
      {loading && orgs.length === 0 && (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <CircularProgress size={20} sx={{ color: "#F97316" }} />
        </Box>
      )}

      {orgs.map(org => {
        const tf = tenantForms[org.id] ?? {};
        const pr = provisionResults[org.id];
        const isExpanded = expanded === org.id;

        return (
          <Accordion
            key={org.id}
            expanded={isExpanded}
            onChange={() => setExpanded(isExpanded ? null : org.id)}
            disableGutters
            sx={{
              ...cardSx,
              "&:before": { display: "none" },
              "&.Mui-expanded": { borderColor: "rgba(255,255,255,0.14)" },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 17, color: "#555" }} />}
              sx={{ px: 2.5, minHeight: 52, "& .MuiAccordionSummary-content": { my: 1 } }}
            >
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ flex: 1, mr: 1 }}>
                <StatusDot ok={org.tenant_configured} />
                <Box>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#D0D0D0" }}>{org.name}</Typography>
                  <Typography sx={{ fontSize: "0.6875rem", color: "#555", fontFamily: "monospace" }}>
                    {org.slug} · {org.members_count} membro(s)
                  </Typography>
                </Box>
                <Chip
                  label={org.tenant_configured ? "Tenant OK" : "Sem tenant"}
                  size="small"
                  sx={{
                    fontSize: "0.625rem", height: 18,
                    bgcolor: org.tenant_configured ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                    color: org.tenant_configured ? "#4ade80" : "#facc15",
                    border: `1px solid ${org.tenant_configured ? "rgba(34,197,94,0.3)" : "rgba(234,179,8,0.3)"}`,
                  }}
                />
              </Stack>
              <Tooltip title="Remover org">
                <IconButton size="small"
                  onClick={e => { e.stopPropagation(); handleDelete(org); }}
                  sx={{ color: "text.secondary", "&:hover": { color: "#ef4444" } }}>
                  <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </AccordionSummary>

            <AccordionDetails sx={{ px: 2.5, pb: 3, pt: 2, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <Stack gap={3}>
                {/* tenant credentials */}
                <Box>
                  <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1.5 }}>
                    <StorageRoundedIcon sx={{ fontSize: 13, color: "#555" }} />
                    <Typography sx={labelSx}>Credenciais do Tenant</Typography>
                  </Stack>
                  <Grid container spacing={1.5}>
                    {[
                      { key: "supabase_url",              label: "Supabase URL *",          placeholder: "https://xxx.supabase.co" },
                      { key: "supabase_service_key",      label: "Service Role Key *",       placeholder: "eyJ...", type: "password" },
                      { key: "n8n_outbound_webhook",      label: "n8n Webhook Outbound",     placeholder: "https://..." },
                      { key: "n8n_kommo_webhook",         label: "n8n Webhook Kommo",        placeholder: "https://..." },
                      { key: "assertiva_client_id",       label: "Assertiva Client ID",      placeholder: "client_id" },
                      { key: "assertiva_client_secret",   label: "Assertiva Client Secret",  placeholder: "client_secret", type: "password" },
                    ].map(f => (
                      <Grid size={{ xs: 12, sm: 6 }} key={f.key}>
                        <TextField
                          label={f.label}
                          placeholder={f.placeholder}
                          type={(f as any).type ?? "text"}
                          fullWidth size="small"
                          value={tf[f.key] ?? ""}
                          onChange={e => setTenantForms(prev => ({
                            ...prev,
                            [org.id]: { ...prev[org.id], [f.key]: e.target.value },
                          }))}
                          sx={{ "& .MuiOutlinedInput-root": { fontSize: "0.75rem", bgcolor: "background.paper" } }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                  <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1.5 }}>
                    <Button variant="outlined" size="small" onClick={() => handleProvision(org.id)}
                      sx={{ fontSize: "0.75rem", textTransform: "none", borderColor: "rgba(255,255,255,0.1)", color: "#888" }}>
                      Verificar Provisionamento
                    </Button>
                    <Button variant="contained" size="small" onClick={() => handleSetTenant(org.id)}
                      sx={{ fontSize: "0.75rem", textTransform: "none", fontWeight: 600 }}>
                      Salvar Credenciais
                    </Button>
                  </Stack>
                </Box>

                {/* provision result */}
                {pr && (
                  <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.06)", pt: 2 }}>
                    <Typography sx={{ ...labelSx, display: "block", mb: 1.5 }}>Status das Tabelas</Typography>
                    <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mb: 1.5 }}>
                      {Object.entries(pr.tables).map(([table, status]) => (
                        <Stack key={table} direction="row" alignItems="center" gap={0.5}>
                          {status === "exists"
                            ? <CheckCircleRoundedIcon sx={{ fontSize: 13, color: "#22c55e" }} />
                            : <WarningAmberRoundedIcon sx={{ fontSize: 13, color: "#eab308" }} />}
                          <Typography sx={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#888" }}>{table}</Typography>
                          <Typography sx={{ fontSize: "0.6875rem", color: "#555" }}>({status})</Typography>
                        </Stack>
                      ))}
                    </Stack>
                    <Typography sx={{ fontSize: "0.75rem", color: "#555", mb: 1.5 }}>{pr.instructions}</Typography>
                    {pr.needs_provision && (
                      <Box sx={{ position: "relative" }}>
                        <Paper sx={{
                          bgcolor: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)",
                          borderRadius: "8px", p: 2, overflowX: "auto", maxHeight: 192,
                        }}>
                          <Typography component="pre" sx={{
                            fontFamily: "monospace", fontSize: "0.7rem",
                            lineHeight: 1.7, color: "#A0A0A0", m: 0, whiteSpace: "pre",
                          }}>
                            {pr.sql}
                          </Typography>
                        </Paper>
                        <Tooltip title="Copiar SQL">
                          <IconButton size="small" sx={{
                            position: "absolute", top: 6, right: 6,
                            bgcolor: "rgba(255,255,255,0.05)",
                            "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
                          }}
                            onClick={() => { navigator.clipboard.writeText(pr.sql); toast.success("SQL copiado!"); }}>
                            <ContentCopyRoundedIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </Box>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}

      {orgs.length === 0 && !loading && (
        <Box sx={{ ...cardSx, py: 8, textAlign: "center" }}>
          <Typography sx={{ fontSize: "0.875rem", color: "#555" }}>Nenhuma organização encontrada</Typography>
        </Box>
      )}
    </Stack>
  );
}

// ─── Tab: Membros ────────────────────────────────────────────────────────────

function TabMembros({ orgs }: { orgs: OrgAdmin[] }) {
  const [selectedOrg, setSelectedOrg] = useState(orgs[0]?.id ?? "");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingM, setLoadingM] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [editMember, setEditMember] = useState<OrgMember | null>(null);
  const [editRole, setEditRole] = useState("member");

  const loadMembers = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setLoadingM(true);
    try {
      setMembers(await api.listMembers(orgId));
    } catch {
      toast.error("Erro ao carregar membros");
    } finally {
      setLoadingM(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrg) loadMembers(selectedOrg);
  }, [selectedOrg, loadMembers]);

  const handleAdd = async () => {
    if (!addEmail.trim()) { toast.error("Informe o e-mail"); return; }
    try {
      await api.addMember(selectedOrg, addEmail.trim(), addRole);
      toast.success("Membro adicionado");
      setAddOpen(false); setAddEmail(""); setAddRole("member");
      loadMembers(selectedOrg);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao adicionar"); }
  };

  const handleUpdateRole = async () => {
    if (!editMember) return;
    try {
      await api.updateMember(selectedOrg, editMember.user_id, editRole);
      toast.success("Papel atualizado");
      setEditMember(null);
      loadMembers(selectedOrg);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao atualizar"); }
  };

  const handleRemove = async (m: OrgMember) => {
    if (!confirm(`Remover ${m.email} da org?`)) return;
    try {
      await api.removeMember(selectedOrg, m.user_id);
      toast.success("Membro removido");
      loadMembers(selectedOrg);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao remover"); }
  };

  return (
    <Stack gap={2}>
      {/* org selector */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel sx={{ fontSize: "0.8125rem" }}>Organização</InputLabel>
          <Select
            label="Organização"
            value={selectedOrg}
            onChange={e => setSelectedOrg(e.target.value)}
            sx={{ fontSize: "0.8125rem", bgcolor: "#141414" }}
          >
            {orgs.map(o => (
              <MenuItem key={o.id} value={o.id} sx={{ fontSize: "0.8125rem" }}>{o.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined" size="small"
          startIcon={<PersonAddRoundedIcon sx={{ fontSize: 14 }} />}
          onClick={() => setAddOpen(true)}
          sx={{ fontSize: "0.8125rem", textTransform: "none", borderColor: "rgba(255,255,255,0.1)", color: "#888", "&:hover": { color: "#D0D0D0" } }}
        >
          Adicionar membro
        </Button>
      </Stack>

      {/* members table */}
      <Box sx={cardSx}>
        {loadingM ? (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <CircularProgress size={20} sx={{ color: "#F97316" }} />
          </Box>
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <Box component="thead">
              <Box component="tr" sx={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["E-mail", "Papel", "Último acesso", ""].map(h => (
                  <Box key={h} component="th" sx={{ py: 1.25, px: 2, textAlign: "left", ...labelSx }}>{h}</Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {members.map((m, i) => (
                <Box key={m.user_id} component="tr" sx={{
                  borderBottom: i < members.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.02)" },
                }}>
                  <Box component="td" sx={{ py: 1.5, px: 2 }}>
                    <Typography sx={{ fontSize: "0.8125rem", color: "#C0C0C0" }}>{m.email || "—"}</Typography>
                  </Box>
                  <Box component="td" sx={{ py: 1.5, px: 2 }}>
                    <RoleBadge role={m.role} />
                  </Box>
                  <Box component="td" sx={{ py: 1.5, px: 2 }}>
                    <Typography sx={{ fontSize: "0.75rem", color: "#555" }}>
                      {m.last_sign_in ? new Date(m.last_sign_in).toLocaleDateString("pt-BR") : "Nunca"}
                    </Typography>
                  </Box>
                  <Box component="td" sx={{ py: 1, px: 1.5, textAlign: "right" }}>
                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                      <Tooltip title="Editar papel">
                        <IconButton size="small"
                          onClick={() => { setEditMember(m); setEditRole(m.role); }}
                          sx={{ color: "text.secondary", "&:hover": { color: "#A0A0A0" } }}>
                          <EditRoundedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remover">
                        <IconButton size="small"
                          onClick={() => handleRemove(m)}
                          sx={{ color: "text.secondary", "&:hover": { color: "#ef4444" } }}>
                          <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                </Box>
              ))}
              {members.length === 0 && (
                <Box component="tr">
                  <Box component="td" colSpan={4} sx={{ py: 6, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "0.8125rem", color: "#555" }}>Nenhum membro</Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* add dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)}
        PaperProps={{ sx: { bgcolor: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", minWidth: 380 } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "text.primary", pb: 1 }}>
          Adicionar membro
        </DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <Stack gap={2}>
            <TextField
              size="small" label="E-mail" type="email" fullWidth
              value={addEmail} onChange={e => setAddEmail(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { bgcolor: "background.paper", fontSize: "0.8125rem" } }}
            />
            <TextField
              select size="small" label="Papel" fullWidth
              value={addRole} onChange={e => setAddRole(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { bgcolor: "background.paper", fontSize: "0.8125rem" } }}
            >
              {["owner", "admin", "member"].map(r => (
                <MenuItem key={r} value={r} sx={{ fontSize: "0.8125rem" }}>{r}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" size="small" onClick={() => setAddOpen(false)}
            sx={{ fontSize: "0.8125rem", textTransform: "none", borderColor: "rgba(255,255,255,0.1)", color: "#888" }}>
            Cancelar
          </Button>
          <Button variant="contained" size="small" onClick={handleAdd}
            sx={{ fontSize: "0.8125rem", textTransform: "none", fontWeight: 600 }}>
            Adicionar
          </Button>
        </DialogActions>
      </Dialog>

      {/* edit role dialog */}
      <Dialog open={!!editMember} onClose={() => setEditMember(null)}
        PaperProps={{ sx: { bgcolor: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", minWidth: 320 } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "text.primary", pb: 1 }}>
          Alterar papel
          <Typography sx={{ fontSize: "0.75rem", color: "#555", mt: 0.25 }}>{editMember?.email}</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <TextField
            select size="small" label="Papel" fullWidth
            value={editRole} onChange={e => setEditRole(e.target.value)}
            sx={{ "& .MuiOutlinedInput-root": { bgcolor: "background.paper", fontSize: "0.8125rem" } }}
          >
            {["owner", "admin", "member"].map(r => (
              <MenuItem key={r} value={r} sx={{ fontSize: "0.8125rem" }}>{r}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" size="small" onClick={() => setEditMember(null)}
            sx={{ fontSize: "0.8125rem", textTransform: "none", borderColor: "rgba(255,255,255,0.1)", color: "#888" }}>
            Cancelar
          </Button>
          <Button variant="contained" size="small" onClick={handleUpdateRole}
            sx={{ fontSize: "0.8125rem", textTransform: "none", fontWeight: 600 }}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ─── Tab: Saúde do Sistema ───────────────────────────────────────────────────

function TabSaude({ orgs }: { orgs: OrgAdmin[] }) {
  const [healthMap, setHealthMap] = useState<Record<string, OrgHealth>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  const checkOne = async (orgId: string) => {
    setChecking(prev => ({ ...prev, [orgId]: true }));
    try {
      const h = await api.health(orgId);
      setHealthMap(prev => ({ ...prev, [orgId]: h }));
    } catch {
      setHealthMap(prev => ({ ...prev, [orgId]: { org_id: orgId, reachable: false, error: "Erro de rede", tables: {}, counts: {} } }));
    } finally {
      setChecking(prev => ({ ...prev, [orgId]: false }));
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    await Promise.allSettled(orgs.map(o => checkOne(o.id)));
    setCheckingAll(false);
  };

  return (
    <Stack gap={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="outlined" size="small"
          startIcon={checkingAll ? <CircularProgress size={12} color="inherit" /> : <MonitorHeartRoundedIcon sx={{ fontSize: 14 }} />}
          onClick={checkAll} disabled={checkingAll}
          sx={{ fontSize: "0.8125rem", textTransform: "none", borderColor: "rgba(255,255,255,0.1)", color: "#888", "&:hover": { color: "#D0D0D0" } }}
        >
          Verificar todos
        </Button>
      </Stack>

      <Stack gap={1.5}>
        {orgs.map(org => {
          const h = healthMap[org.id];
          const isChecking = checking[org.id];

          return (
            <Box key={org.id} sx={{ ...cardSx, p: 2.5 }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                <Stack gap={0.5}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    {h ? (
                      h.reachable
                        ? <CheckCircleRoundedIcon sx={{ fontSize: 15, color: "#22c55e" }} />
                        : <ErrorOutlineRoundedIcon sx={{ fontSize: 15, color: "#ef4444" }} />
                    ) : (
                      <Box sx={{ width: 15, height: 15, borderRadius: "50%", bgcolor: "rgba(255,255,255,0.08)" }} />
                    )}
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#D0D0D0" }}>{org.name}</Typography>
                    <Typography sx={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "text.secondary" }}>{org.slug}</Typography>
                  </Stack>

                  {h?.supabase_url && (
                    <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", ml: 3 }}>{h.supabase_url}</Typography>
                  )}

                  {h && !h.reachable && h.error && (
                    <Typography sx={{ fontSize: "0.75rem", color: "#ef4444", ml: 3 }}>{h.error}</Typography>
                  )}

                  {h && h.reachable && (
                    <Stack direction="row" gap={2} sx={{ ml: 3, mt: 0.5 }}>
                      {Object.entries(h.tables).map(([table, status]) => (
                        <Stack key={table} direction="row" alignItems="center" gap={0.5}>
                          {status === "ok"
                            ? <CheckCircleRoundedIcon sx={{ fontSize: 12, color: "#22c55e" }} />
                            : status === "missing"
                            ? <WarningAmberRoundedIcon sx={{ fontSize: 12, color: "#eab308" }} />
                            : <ErrorOutlineRoundedIcon sx={{ fontSize: 12, color: "#ef4444" }} />}
                          <Typography sx={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#888" }}>{table}</Typography>
                          {h.counts[table] !== undefined && (
                            <Typography sx={{ fontSize: "0.6875rem", color: "#555" }}>
                              ({h.counts[table].toLocaleString()})
                            </Typography>
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  )}

                  {!org.tenant_configured && !h && (
                    <Typography sx={{ fontSize: "0.75rem", color: "#555", ml: 3 }}>Tenant não configurado</Typography>
                  )}
                </Stack>

                <Button
                  size="small" variant="outlined"
                  onClick={() => checkOne(org.id)}
                  disabled={isChecking || !org.tenant_configured}
                  startIcon={isChecking ? <CircularProgress size={11} color="inherit" /> : undefined}
                  sx={{
                    fontSize: "0.75rem", textTransform: "none", flexShrink: 0,
                    borderColor: "rgba(255,255,255,0.08)", color: "text.secondary",
                    "&:hover": { borderColor: "rgba(255,255,255,0.15)", color: "#A0A0A0" },
                  }}
                >
                  {isChecking ? "Verificando…" : "Pingar"}
                </Button>
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}

// ─── Tab: Provisionamento ────────────────────────────────────────────────────

function TabProvisionamento({ orgs }: { orgs: OrgAdmin[] }) {
  const [selectedOrg, setSelectedOrg] = useState(orgs[0]?.id ?? "");
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!selectedOrg) return;
    setLoading(true);
    try {
      setResult(await api.provision(selectedOrg));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao verificar provisionamento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap={2}>
      <Stack direction="row" alignItems="center" gap={2}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel sx={{ fontSize: "0.8125rem" }}>Organização</InputLabel>
          <Select
            label="Organização"
            value={selectedOrg}
            onChange={e => { setSelectedOrg(e.target.value); setResult(null); }}
            sx={{ fontSize: "0.8125rem", bgcolor: "#141414" }}
          >
            {orgs.map(o => (
              <MenuItem key={o.id} value={o.id} sx={{ fontSize: "0.8125rem" }}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <StatusDot ok={o.tenant_configured} />
                  {o.name}
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained" size="small"
          startIcon={loading ? <CircularProgress size={12} color="inherit" /> : <BuildRoundedIcon sx={{ fontSize: 14 }} />}
          onClick={run} disabled={loading || !selectedOrg}
          sx={{ fontSize: "0.8125rem", textTransform: "none", fontWeight: 600 }}
        >
          {loading ? "Verificando…" : "Verificar provisionamento"}
        </Button>
      </Stack>

      {result && (
        <Box sx={cardSx}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <Stack direction="row" alignItems="center" gap={1}>
              {result.needs_provision
                ? <WarningAmberRoundedIcon sx={{ fontSize: 15, color: "#eab308" }} />
                : <CheckCircleRoundedIcon sx={{ fontSize: 15, color: "#22c55e" }} />}
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#D0D0D0" }}>
                {result.needs_provision ? "Provisionamento necessário" : "Tudo provisionado"}
              </Typography>
            </Stack>
          </Box>
          <Box sx={{ p: 2.5 }}>
            <Stack gap={2}>
              <Stack direction="row" flexWrap="wrap" gap={2}>
                {Object.entries(result.tables).map(([table, status]) => (
                  <Stack key={table} direction="row" alignItems="center" gap={0.75}>
                    {status === "exists"
                      ? <CheckCircleRoundedIcon sx={{ fontSize: 13, color: "#22c55e" }} />
                      : <WarningAmberRoundedIcon sx={{ fontSize: 13, color: "#eab308" }} />}
                    <Typography sx={{ fontSize: "0.8125rem", fontFamily: "monospace", color: "#A0A0A0" }}>{table}</Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "#555" }}>({status})</Typography>
                  </Stack>
                ))}
              </Stack>

              <Typography sx={{ fontSize: "0.8125rem", color: "#888" }}>{result.instructions}</Typography>

              {result.needs_provision && (
                <Box sx={{ position: "relative" }}>
                  <Paper sx={{
                    bgcolor: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "8px", p: 2, overflowX: "auto",
                  }}>
                    <Typography component="pre" sx={{
                      fontFamily: "monospace", fontSize: "0.7rem",
                      lineHeight: 1.8, color: "#A0A0A0", m: 0, whiteSpace: "pre",
                    }}>
                      {result.sql}
                    </Typography>
                  </Paper>
                  <Tooltip title="Copiar SQL">
                    <IconButton size="small" sx={{
                      position: "absolute", top: 6, right: 6,
                      bgcolor: "rgba(255,255,255,0.05)",
                      "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
                    }}
                      onClick={() => { navigator.clipboard.writeText(result.sql); toast.success("SQL copiado!"); }}>
                      <ContentCopyRoundedIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Stack>
          </Box>
        </Box>
      )}
    </Stack>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminPanel() {
  const [tab, setTab] = useState(0);
  const [orgs, setOrgs] = useState<OrgAdmin[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [provisionResults, setProvisionResults] = useState<Record<string, ProvisionResult>>({});

  const [form, setForm] = useState<Record<string, string>>({
    name: "", slug: "", user_email: "", user_password: "",
    supabase_url: "", supabase_service_key: "",
    n8n_outbound_webhook: "", n8n_kommo_webhook: "",
  });
  const [tenantForms, setTenantForms] = useState<Record<string, Record<string, string>>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [data, statsData] = await Promise.allSettled([api.listOrgs(), api.stats()]);
      if (data.status === "fulfilled") {
        setOrgs(data.value);
        const forms: Record<string, Record<string, string>> = {};
        data.value.forEach(org => {
          forms[org.id] = {
            supabase_url: org.supabase_url ?? "",
            supabase_service_key: "",
            n8n_outbound_webhook: org.n8n_outbound_webhook ?? "",
            n8n_kommo_webhook: org.n8n_kommo_webhook ?? "",
            assertiva_client_id: org.assertiva_client_id ?? "",
            assertiva_client_secret: "",
          };
        });
        setTenantForms(forms);
      } else {
        toast.error("Erro ao carregar organizações");
      }
      if (statsData.status === "fulfilled") setStats(statsData.value);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name || !form.slug || !form.user_email || !form.user_password) {
      toast.error("Nome, slug, e-mail e senha são obrigatórios");
      return;
    }
    try {
      await api.createOrg(form);
      toast.success(`Org "${form.name}" criada`);
      setShowCreate(false);
      setForm({ name: "", slug: "", user_email: "", user_password: "", supabase_url: "", supabase_service_key: "", n8n_outbound_webhook: "", n8n_kommo_webhook: "" });
      load();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao criar org"); }
  };

  const handleSetTenant = async (orgId: string) => {
    const f = tenantForms[orgId] ?? {};
    if (!f.supabase_url || !f.supabase_service_key) {
      toast.error("URL e service key são obrigatórios");
      return;
    }
    try {
      await api.setTenant(orgId, f);
      toast.success("Tenant salvo");
      load();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar tenant"); }
  };

  const handleProvision = async (orgId: string) => {
    try {
      const result = await api.provision(orgId);
      setProvisionResults(prev => ({ ...prev, [orgId]: result }));
    } catch (e: any) { toast.error(e?.message ?? "Erro ao verificar provisionamento"); }
  };

  const handleDelete = async (org: OrgAdmin) => {
    if (!confirm(`Remover org "${org.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.deleteOrg(org.id);
      toast.success(`Org "${org.name}" removida`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao remover org"); }
  };

  const TABS = [
    { label: "Visão Geral",        icon: <DashboardRoundedIcon  sx={{ fontSize: 16 }} /> },
    { label: "Clientes",           icon: <BusinessRoundedIcon   sx={{ fontSize: 16 }} /> },
    { label: "Membros",            icon: <PeopleRoundedIcon     sx={{ fontSize: 16 }} /> },
    { label: "Saúde do Sistema",   icon: <MonitorHeartRoundedIcon sx={{ fontSize: 16 }} /> },
    { label: "Provisionamento",    icon: <BuildRoundedIcon      sx={{ fontSize: 16 }} /> },
  ];

  return (
    <Box sx={{ maxWidth: 960 }}>
      <Stack gap={3}>

        {/* header */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box>
            <Typography sx={{ fontSize: "1.25rem", fontWeight: 700, color: "text.primary", letterSpacing: "-0.01em" }}>
              Central de Controle
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "#555", mt: 0.25 }}>
              Observabilidade completa do sistema Hermes
            </Typography>
          </Box>
          <Stack direction="row" gap={1}>
            <Button
              variant="outlined" size="small"
              startIcon={loading ? <CircularProgress size={12} color="inherit" /> : <RefreshRoundedIcon sx={{ fontSize: 15 }} />}
              onClick={load} disabled={loading}
              sx={{ fontSize: "0.8125rem", textTransform: "none", borderColor: "rgba(255,255,255,0.1)", color: "#888", "&:hover": { color: "#D0D0D0" } }}
            >
              Atualizar
            </Button>
            {tab === 1 && (
              <Button
                variant="contained" size="small"
                startIcon={<AddRoundedIcon sx={{ fontSize: 15 }} />}
                onClick={() => setShowCreate(v => !v)}
                sx={{ fontSize: "0.8125rem", textTransform: "none", fontWeight: 600 }}
              >
                Nova Org
              </Button>
            )}
          </Stack>
        </Stack>

        {/* tabs */}
        <Box>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              "& .MuiTab-root": {
                fontSize: "0.8125rem", textTransform: "none", minHeight: 42,
                color: "#555", gap: 0.75, py: 1,
                "&.Mui-selected": { color: "text.primary" },
              },
              "& .MuiTabs-indicator": { backgroundColor: "#F97316", height: 2 },
            }}
          >
            {TABS.map(t => (
              <Tab key={t.label} label={t.label} icon={t.icon} iconPosition="start" />
            ))}
          </Tabs>
        </Box>

        {/* content */}
        <Box>
          {tab === 0 && <TabOverview orgs={orgs} stats={stats} />}
          {tab === 1 && (
            <TabClientes
              orgs={orgs} loading={loading}
              showCreate={showCreate} setShowCreate={setShowCreate}
              form={form} setForm={setForm}
              tenantForms={tenantForms} setTenantForms={setTenantForms}
              handleCreate={handleCreate} handleSetTenant={handleSetTenant}
              handleDelete={handleDelete} handleProvision={handleProvision}
              provisionResults={provisionResults}
            />
          )}
          {tab === 2 && <TabMembros orgs={orgs} />}
          {tab === 3 && <TabSaude orgs={orgs} />}
          {tab === 4 && <TabProvisionamento orgs={orgs} />}
        </Box>

      </Stack>
    </Box>
  );
}
