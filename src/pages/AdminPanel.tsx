import { useEffect, useState } from "react";
import { Plus, RefreshCw, Server, Trash2, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

// ─── tipos ────────────────────────────────────────────────────────────────────

type OrgAdmin = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  tenant_configured: boolean;
  supabase_url: string | null;
  n8n_outbound_webhook: string | null;
  n8n_kommo_webhook: string | null;
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

// ─── helpers ──────────────────────────────────────────────────────────────────

async function adminListOrgs(): Promise<OrgAdmin[]> {
  return apiFetch("/admin/orgs", { skipOrgHeader: true });
}

async function adminCreateOrg(body: Record<string, string>): Promise<{ success: boolean; slug: string }> {
  return apiFetch("/admin/orgs", { method: "POST", body, skipOrgHeader: true });
}

async function adminSetTenant(orgId: string, body: Record<string, string>): Promise<{ success: boolean }> {
  return apiFetch(`/admin/orgs/${orgId}/tenant`, { method: "PUT", body, skipOrgHeader: true });
}

async function adminProvision(orgId: string): Promise<ProvisionResult> {
  return apiFetch(`/admin/orgs/${orgId}/provision`, { method: "POST", skipOrgHeader: true });
}

async function adminDeleteOrg(orgId: string): Promise<{ success: boolean }> {
  return apiFetch(`/admin/orgs/${orgId}`, { method: "DELETE", skipOrgHeader: true });
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function AdminPanel() {
  const [orgs, setOrgs] = useState<OrgAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);

  // form criar org
  const [form, setForm] = useState({
    name: "", slug: "", user_email: "", user_password: "",
    supabase_url: "", supabase_service_key: "",
    n8n_outbound_webhook: "", n8n_kommo_webhook: "",
  });

  // form tenant por org
  const [tenantForms, setTenantForms] = useState<Record<string, Record<string, string>>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminListOrgs();
      setOrgs(data);
      // pré-preenche forms de tenant com dados existentes
      const forms: Record<string, Record<string, string>> = {};
      data.forEach(org => {
        forms[org.id] = {
          supabase_url: org.supabase_url ?? "",
          supabase_service_key: "",
          n8n_outbound_webhook: org.n8n_outbound_webhook ?? "",
          n8n_kommo_webhook: org.n8n_kommo_webhook ?? "",
        };
      });
      setTenantForms(forms);
    } catch {
      toast.error("Erro ao carregar organizações");
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
      await adminCreateOrg(form);
      toast.success(`Org "${form.name}" criada com sucesso`);
      setShowCreate(false);
      setForm({ name: "", slug: "", user_email: "", user_password: "", supabase_url: "", supabase_service_key: "", n8n_outbound_webhook: "", n8n_kommo_webhook: "" });
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar org");
    }
  };

  const handleSetTenant = async (orgId: string) => {
    const f = tenantForms[orgId] ?? {};
    if (!f.supabase_url || !f.supabase_service_key) {
      toast.error("URL e service key do Supabase são obrigatórios");
      return;
    }
    try {
      await adminSetTenant(orgId, f);
      toast.success("Tenant salvo e cache invalidado");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar tenant");
    }
  };

  const handleProvision = async (orgId: string) => {
    try {
      const result = await adminProvision(orgId);
      setProvisionResult(result);
      setExpandedOrg(orgId);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao verificar provisionamento");
    }
  };

  const handleDelete = async (org: OrgAdmin) => {
    if (!confirm(`Remover org "${org.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await adminDeleteOrg(org.id);
      toast.success(`Org "${org.name}" removida`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao remover org");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Painel Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie organizações, credenciais e provisionamento</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Org
          </Button>
        </div>
      </div>

      {/* ── Formulário criar org ── */}
      {showCreate && (
        <div className="border rounded-lg p-5 bg-card space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Nova Organização</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="BF Company" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Slug / Org ID *</Label>
              <Input placeholder="bfcompany" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s/g, "") }))} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail do usuário *</Label>
              <Input type="email" placeholder="admin@cliente.com" value={form.user_email} onChange={e => setForm(f => ({ ...f, user_email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Senha inicial *</Label>
              <Input type="password" placeholder="mínimo 8 caracteres" value={form.user_password} onChange={e => setForm(f => ({ ...f, user_password: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Supabase URL (cliente)</Label>
              <Input placeholder="https://xxx.supabase.co" value={form.supabase_url} onChange={e => setForm(f => ({ ...f, supabase_url: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Service Role Key (cliente)</Label>
              <Input placeholder="eyJ..." value={form.supabase_service_key} onChange={e => setForm(f => ({ ...f, supabase_service_key: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>n8n Webhook Outbound</Label>
              <Input placeholder="https://n8n.../webhook/..." value={form.n8n_outbound_webhook} onChange={e => setForm(f => ({ ...f, n8n_outbound_webhook: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>n8n Webhook Kommo</Label>
              <Input placeholder="https://n8n.../webhook/..." value={form.n8n_kommo_webhook} onChange={e => setForm(f => ({ ...f, n8n_kommo_webhook: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleCreate}>Criar Organização</Button>
          </div>
        </div>
      )}

      {/* ── Lista de orgs ── */}
      <div className="space-y-3">
        {orgs.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma organização encontrada</p>
        )}
        {orgs.map(org => {
          const tf = tenantForms[org.id] ?? {};
          const isExpanded = expandedOrg === org.id;
          const pr = isExpanded ? provisionResult : null;

          return (
            <div key={org.id} className="border rounded-lg bg-card overflow-hidden">
              {/* cabeçalho */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${org.tenant_configured ? "bg-green-500" : "bg-yellow-500"}`} />
                  <div>
                    <p className="font-medium text-sm">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.slug} · {org.members_count} membro(s)</p>
                  </div>
                  {org.tenant_configured ? (
                    <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-500/20">Tenant OK</span>
                  ) : (
                    <span className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/20">Sem tenant</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(org)} title="Remover org">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedOrg(isExpanded ? null : org.id)}>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* detalhes expandidos */}
              {isExpanded && (
                <div className="border-t px-4 py-4 space-y-5">
                  {/* config tenant */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> Credenciais do Tenant</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Supabase URL *</Label>
                        <Input className="text-xs h-8" placeholder="https://xxx.supabase.co" value={tf.supabase_url ?? ""} onChange={e => setTenantForms(f => ({ ...f, [org.id]: { ...f[org.id], supabase_url: e.target.value } }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Service Role Key *</Label>
                        <Input className="text-xs h-8" type="password" placeholder="eyJ..." value={tf.supabase_service_key ?? ""} onChange={e => setTenantForms(f => ({ ...f, [org.id]: { ...f[org.id], supabase_service_key: e.target.value } }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">n8n Webhook Outbound</Label>
                        <Input className="text-xs h-8" placeholder="https://..." value={tf.n8n_outbound_webhook ?? ""} onChange={e => setTenantForms(f => ({ ...f, [org.id]: { ...f[org.id], n8n_outbound_webhook: e.target.value } }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">n8n Webhook Kommo</Label>
                        <Input className="text-xs h-8" placeholder="https://..." value={tf.n8n_kommo_webhook ?? ""} onChange={e => setTenantForms(f => ({ ...f, [org.id]: { ...f[org.id], n8n_kommo_webhook: e.target.value } }))} />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleProvision(org.id)}>
                        Verificar Provisionamento
                      </Button>
                      <Button size="sm" onClick={() => handleSetTenant(org.id)}>
                        Salvar Credenciais
                      </Button>
                    </div>
                  </div>

                  {/* resultado de provisionamento */}
                  {pr && (
                    <div className="space-y-3 border-t pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status das Tabelas</p>
                      <div className="flex gap-3 flex-wrap">
                        {Object.entries(pr.tables).map(([table, status]) => (
                          <div key={table} className="flex items-center gap-1.5 text-xs">
                            {status === "exists"
                              ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              : <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />}
                            <span className="font-mono">{table}</span>
                            <span className="text-muted-foreground">({status})</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{pr.instructions}</p>
                      {pr.needs_provision && (
                        <div className="relative">
                          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto leading-relaxed max-h-48">{pr.sql}</pre>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-2 right-2 h-6 w-6"
                            onClick={() => { navigator.clipboard.writeText(pr.sql); toast.success("SQL copiado!"); }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
