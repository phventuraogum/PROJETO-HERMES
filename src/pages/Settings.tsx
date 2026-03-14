import { useState, useEffect } from "react";
import { Save, Key, ExternalLink, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getCrmKeys, setCrmKey } from "@/lib/api";

const CRM_PROVIDERS = [
  { id: "pipedrive", label: "Pipedrive", hint: "API Token — Configurações › Preferências da API", dot: "#F97316", url: "https://app.pipedrive.com/settings/api" },
  { id: "hubspot", label: "HubSpot", hint: "Access Token — Private App ou OAuth", dot: "#EF4444", url: "https://app.hubspot.com/api-key" },
  { id: "rdstation", label: "RD Station", hint: "Access Token — Integrações › API", dot: "#3B82F6", url: "https://app.rdstation.com.br/integrations" },
];

export default function Settings() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setKeys(getCrmKeys());
  }, []);

  const handleChange = (provider: string, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
    setSaved((prev) => ({ ...prev, [provider]: false }));
    setDirty(true);
  };

  const handleSave = () => {
    const newSaved: Record<string, boolean> = {};
    Object.entries(keys).forEach(([provider, value]) => {
      if (value.trim()) {
        setCrmKey(provider, value);
        newSaved[provider] = true;
      }
    });
    setSaved(newSaved);
    setDirty(false);
    toast.success("Configurações salvas com sucesso.");
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
                  {saved[provider.id] && keys[provider.id] && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Conectado
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
                placeholder="Cole sua chave aqui..."
                value={keys[provider.id] || ""}
                onChange={(event) => handleChange(provider.id, event.target.value)}
                className="h-10 rounded-xl border-border/70 bg-muted/20 font-mono text-sm focus:border-primary/40"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-border bg-muted/20 px-6 py-4">
          <Button onClick={handleSave} disabled={!dirty} size="sm" className="gap-2 font-semibold shadow-surface-xs">
            <Save className="h-3.5 w-3.5" />
            Salvar configurações
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
            Chaves armazenadas localmente
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--pinn-orange-dark)", opacity: 0.78 }}>
            As chaves de API ficam apenas no navegador da sessão atual. O objetivo aqui é reduzir atrito de setup sem
            poluir a experiência com telas de integração desnecessárias.
          </p>
        </div>
      </div>
    </div>
  );
}
