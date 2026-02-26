// src/pages/Settings.tsx
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getCrmKeys, setCrmKey } from "@/lib/api";
import { Save, Building2, Key } from "lucide-react";
import { toast } from "sonner";

const CRM_PROVIDERS = [
  { id: "pipedrive", label: "Pipedrive", hint: "API Token (Configurações > Preferências da API)" },
  { id: "hubspot", label: "HubSpot", hint: "Access Token (Private App ou OAuth)" },
  { id: "rdstation", label: "RD Station", hint: "Access Token (Integrações > API)" },
];

export default function Settings() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setKeys(getCrmKeys());
  }, []);

  const handleChange = (provider: string, value: string) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    Object.entries(keys).forEach(([provider, value]) => {
      if (value.trim()) setCrmKey(provider, value);
    });
    setDirty(false);
    toast.success("Chaves CRM salvas.");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Integrações e chaves de API (por organização)
        </p>
      </div>

      <Card className="border-zinc-800 bg-zinc-950/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-400" />
            Integrações CRM
          </CardTitle>
          <p className="text-xs text-zinc-500">
            Salve suas chaves para exportar leads direto do Pipeline e Resultados.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {CRM_PROVIDERS.map(p => (
            <div key={p.id} className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Key className="h-3 w-3" />
                {p.label}
              </Label>
              <Input
                type="password"
                value={keys[p.id] || ""}
                onChange={e => handleChange(p.id, e.target.value)}
                placeholder="Cole a chave e salve"
                className="border-zinc-700 bg-zinc-900/60 font-mono text-xs"
              />
              <p className="text-[10px] text-zinc-600">{p.hint}</p>
            </div>
          ))}
          {dirty && (
            <Button size="sm" onClick={handleSave} className="gap-1.5 mt-2">
              <Save className="h-3.5 w-3.5" />
              Salvar chaves
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
