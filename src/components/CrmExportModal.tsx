// src/components/CrmExportModal.tsx
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import { exportToCrm, getCrmKeys, setCrmKey, type Empresa, type LeadExportPayload } from "@/lib/api";
import { toast } from "sonner";

const PROVIDERS = [
  { id: "ploomes" as const, label: "Ploomes" },
  { id: "pipedrive" as const, label: "Pipedrive" },
  { id: "hubspot" as const, label: "HubSpot" },
  { id: "rdstation" as const, label: "RD Station" },
];

function empresaToLead(emp: Empresa): LeadExportPayload {
  return {
    cnpj: emp.cnpj,
    razao_social: emp.razao_social,
    nome_fantasia: emp.nome_fantasia ?? undefined,
      email: (emp.email || emp.email_enriquecido) ?? undefined,
      telefone: emp.telefone_padrao ?? undefined,
      whatsapp: (emp.whatsapp_publico || emp.whatsapp_enriquecido) ?? undefined,
    site: emp.site ?? undefined,
    cidade: emp.cidade ?? undefined,
    uf: emp.uf ?? undefined,
    segmento: emp.segmento ?? undefined,
    porte: emp.porte ?? undefined,
    capital_social: emp.capital_social ?? undefined,
  };
}

export function CrmExportModal({
  open,
  onClose,
  empresa,
}: {
  open: boolean;
  onClose: () => void;
  empresa: Empresa | null;
}) {
  const [provider, setProvider] = useState<"pipedrive" | "hubspot" | "rdstation" | "ploomes">("ploomes");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveKey, setSaveKey] = useState(true);

  const savedKeys = getCrmKeys();
  const currentSaved = savedKeys[provider];

  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
    else {
      setApiKey(savedKeys[provider] || "");
    }
  };

  const handleExport = async () => {
    if (!empresa || !apiKey.trim()) {
      toast.error("Informe a API key do CRM.");
      return;
    }
    setLoading(true);
    try {
      const res = await exportToCrm(provider, apiKey.trim(), empresaToLead(empresa));
      if (res.success) {
        toast.success(res.message || `Lead enviado para ${PROVIDERS.find(p => p.id === provider)?.label}.`);
        if (saveKey) setCrmKey(provider, apiKey.trim());
        onClose();
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar para o CRM.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-base">Enviar lead para CRM</DialogTitle>
          {empresa && (
            <p className="text-xs text-zinc-500 truncate">
              {empresa.nome_fantasia || empresa.razao_social}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">CRM</Label>
            <Select value={provider} onValueChange={(v: any) => { setProvider(v); setApiKey(savedKeys[v] || ""); }}>
              <SelectTrigger className="border-zinc-700 bg-zinc-900/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">
              {provider === "ploomes" && "User Key"}
              {provider === "pipedrive" && "API Token"}
              {provider === "hubspot" && "Access Token (Private App)"}
              {provider === "rdstation" && "Access Token"}
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={currentSaved ? "•••••••• (salvo)" : "Cole aqui"}
              className="border-zinc-700 bg-zinc-900/60"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={saveKey} onChange={e => setSaveKey(e.target.checked)} className="rounded border-zinc-600" />
            Salvar chave para próximas exportações
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700">
              Cancelar
            </Button>
            <Button size="sm" onClick={handleExport} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
