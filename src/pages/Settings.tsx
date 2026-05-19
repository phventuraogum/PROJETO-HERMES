import { useState, useEffect } from "react";
import { Save, Key, ExternalLink, CheckCircle2, Lock, Shield } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getCrmKeysStatus, saveCrmKey } from "@/lib/api";

const CRM_PROVIDERS = [
  { id: "pipedrive", label: "Pipedrive", hint: "API Token — Configurações › Preferências da API", dot: "#F97316", url: "https://app.pipedrive.com/settings/api" },
  { id: "hubspot", label: "HubSpot", hint: "Access Token — Private App ou OAuth", dot: "#EF4444", url: "https://app.hubspot.com/api-key" },
  { id: "rdstation", label: "RD Station", hint: "Access Token — Integrações › API", dot: "#3B82F6", url: "https://app.rdstation.com.br/integrations" },
];

// MAI-19 · validação inline pra chaves CRM
const PLACEHOLDER_HINTS = /^(api[_-]?key|sua[_-]?chave|seu[_-]?token|cole[_-]?aqui|your[_-]?key|placeholder|xxx+|test)/i;

function validateApiKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // vazio é OK (significa "não configurada")
  if (trimmed.length < 10) return "Chave muito curta — confira se colou inteira.";
  if (PLACEHOLDER_HINTS.test(trimmed)) return "Parece um placeholder. Cole a chave real obtida no provedor.";
  return null;
}

export default function Settings() {
  // JUN 1.3 · keys agora vivem cifradas no backend. Frontend só mantém valor enquanto
  // user digita; quando salva, vai pra API. configured indica se já existe chave gravada.
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCrmKeysStatus().then((status) => {
      if (cancelled) return;
      setConfigured(status);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleChange = (provider: string, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
    setSaved((prev) => ({ ...prev, [provider]: false }));
    if (errors[provider]) setErrors((prev) => ({ ...prev, [provider]: null }));
    setDirty(true);
  };

  const handleBlur = (provider: string) => {
    setErrors((prev) => ({ ...prev, [provider]: validateApiKey(keys[provider] || "") }));
  };

  const handleSave = async () => {
    // Valida todas antes de salvar
    const newErrors: Record<string, string | null> = {};
    let hasError = false;
    Object.entries(keys).forEach(([provider, value]) => {
      const err = validateApiKey(value);
      newErrors[provider] = err;
      if (err) hasError = true;
    });
    setErrors(newErrors);
    if (hasError) {
      toast.error("Corrija os campos destacados antes de salvar.");
      return;
    }

    setSaving(true);
    const newSaved: Record<string, boolean> = {};
    const failures: string[] = [];
    for (const [provider, value] of Object.entries(keys)) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      try {
        await saveCrmKey(provider as "pipedrive" | "hubspot" | "rdstation", trimmed);
        newSaved[provider] = true;
      } catch (e) {
        failures.push(provider);
      }
    }
    setSaving(false);

    if (failures.length > 0) {
      toast.error(`Falha ao salvar: ${failures.join(", ")}. Verifique conexão.`);
    } else {
      // Atualiza status (mostra "Configurado" no UI) + limpa o input
      setSaved(newSaved);
      setConfigured((prev) => ({ ...prev, ...newSaved }));
      setKeys({});
      setDirty(false);
      toast.success("Chaves CRM salvas (cifradas no backend).");
    }
  };

  return (
    <div className="max-w-3xl space-y-6 animate-in-fade">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/65">Conta</p>
        <h1 className="text-2xl font-black tracking-tighter text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Integrações e chaves de API por organização.</p>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="gradient-card border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl shadow-surface-xs"
              style={{ background: "var(--pinn-orange-light)", color: "var(--pinn-orange)" }}
            >
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Integrações CRM</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Conecte provedores e exporte leads do pipeline com menos atrito.
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-border bg-card">
          {CRM_PROVIDERS.map((provider) => (
            <div key={provider.id} className="px-6 py-5">
              <div className="mb-2 flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: provider.dot }} />
                  <Label className="text-sm font-semibold text-foreground">{provider.label}</Label>
                  {(saved[provider.id] || configured[provider.id]) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {saved[provider.id] ? "Atualizado" : "Configurado"}
                    </span>
                  )}
                </div>
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
                >
                  Obter chave
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="mb-3 text-[11px] text-muted-foreground">{provider.hint}</p>
              <Input
                type="password"
                placeholder={configured[provider.id] ? "•••••••• (já configurado — digite pra substituir)" : "Cole sua chave aqui..."}
                value={keys[provider.id] || ""}
                onChange={(event) => handleChange(provider.id, event.target.value)}
                onBlur={() => handleBlur(provider.id)}
                disabled={loading}
                aria-invalid={!!errors[provider.id]}
                aria-describedby={errors[provider.id] ? `${provider.id}-error` : undefined}
                className={`h-10 rounded-xl border-border/70 bg-muted/20 font-mono text-sm focus:border-primary/40 ${errors[provider.id] ? "border-red-500/40" : ""}`}
              />
              {errors[provider.id] && (
                <p id={`${provider.id}-error`} role="alert" className="mt-2 text-[11px] text-red-500 flex items-center gap-1">
                  <Shield className="h-3 w-3 shrink-0" />
                  {errors[provider.id]}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-border bg-muted/20 px-6 py-4">
          <Button onClick={handleSave} disabled={!dirty || saving} size="sm" className="gap-2 font-semibold shadow-surface-xs">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </div>

      <div
        className="flex items-start gap-3 rounded-2xl p-4 shadow-surface-xs"
        style={{ background: "var(--pinn-orange-light)", border: "1px solid var(--pinn-orange-border)" }}
      >
        <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--pinn-orange-dark)" }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--pinn-orange-dark)" }}>
            Chaves cifradas no servidor
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--pinn-orange-dark)", opacity: 0.78 }}>
            As chaves de API são cifradas via pgcrypto (AES-CBC simétrico) com chave-mestra do servidor antes de irem ao banco.
            O frontend nunca recebe o valor decifrado de volta — só o status "configurado". Isolamento por organização via RLS.
          </p>
        </div>
      </div>
    </div>
  );
}
