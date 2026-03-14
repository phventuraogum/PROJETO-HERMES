import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getCrmKeys, setCrmKey } from "@/lib/api";
import { Save, Key, ExternalLink, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CRM_PROVIDERS = [
  { id: "pipedrive",  label: "Pipedrive",  hint: "API Token — Configurações › Preferências da API",    dot: "#F97316", url: "https://app.pipedrive.com/settings/api" },
  { id: "hubspot",    label: "HubSpot",    hint: "Access Token — Private App ou OAuth",                dot: "#EF4444", url: "https://app.hubspot.com/api-key" },
  { id: "rdstation",  label: "RD Station", hint: "Access Token — Integrações › API",                   dot: "#3B82F6", url: "https://app.rdstation.com.br/integrations" },
];

export default function Settings() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setKeys(getCrmKeys()); }, []);

  const handleChange = (provider: string, value: string) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
    setSaved(prev => ({ ...prev, [provider]: false }));
    setDirty(true);
  };

  const handleSave = () => {
    const newSaved: Record<string, boolean> = {};
    Object.entries(keys).forEach(([provider, value]) => {
      if (value.trim()) { setCrmKey(provider, value); newSaved[provider] = true; }
    });
    setSaved(newSaved);
    setDirty(false);
    toast.success("Configurações salvas com sucesso.");
  };

  return (
    <div className="max-w-2xl space-y-8 animate-in-fade">

      <div>
        <h1 className="text-2xl font-black tracking-tighter" style={{ color: "var(--pinn-black)" }}>
          Configurações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Integrações e chaves de API por organização.</p>
      </div>

      {/* Card CRM — header dark como Pinn */}
      <div className="rounded-xl overflow-hidden border border-border shadow-surface-sm">
        <div className="px-6 py-4 flex items-center gap-3" style={{ background: "var(--pinn-black)" }}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(249,115,22,0.2)" }}>
            <Key className="h-4 w-4" style={{ color: "var(--pinn-orange)" }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Integrações CRM</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,.45)" }}>
              Exporte leads do Pipeline em 1 clique
            </p>
          </div>
        </div>

        <div className="divide-y divide-border bg-white">
          {CRM_PROVIDERS.map(p => (
            <div key={p.id} className="px-6 py-5">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: p.dot }} />
                  <Label className="text-sm font-bold" style={{ color: p.dot }}>{p.label}</Label>
                  {saved[p.id] && keys[p.id] && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Conectado
                    </span>
                  )}
                </div>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                  Obter chave <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">{p.hint}</p>
              <Input type="password" placeholder="Cole sua chave aqui..."
                value={keys[p.id] || ""}
                onChange={e => handleChange(p.id, e.target.value)}
                className="h-9 text-sm font-mono bg-muted/30 border-border/60 focus:border-primary/40 rounded-lg" />
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end"
          style={{ background: "var(--pinn-bg)" }}>
          <Button onClick={handleSave} disabled={!dirty} size="sm"
            className="gap-2 font-bold text-white border-0"
            style={{ background: dirty ? "var(--pinn-orange)" : undefined }}>
            <Save className="h-3.5 w-3.5" />
            Salvar configurações
          </Button>
        </div>
      </div>

      {/* Nota segurança — laranja Pinn */}
      <div className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: "var(--pinn-orange-light)", border: "1px solid var(--pinn-orange-border)" }}>
        <Lock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--pinn-orange-dark)" }} />
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--pinn-orange-dark)" }}>
            Chaves armazenadas localmente
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--pinn-orange-dark)", opacity: 0.7 }}>
            As chaves de API nunca são enviadas para nossos servidores — ficam apenas no seu browser.
          </p>
        </div>
      </div>
    </div>
  );
}
