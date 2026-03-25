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
import { Loader2, Send, Lock, Unlock, AlertTriangle } from "lucide-react";
import { exportToCrm, getCrmKeys, setCrmKey, type Empresa, type LeadExportPayload } from "@/lib/api";
import { toast } from "sonner";

type Provider = "ploomes" | "pipedrive" | "hubspot" | "rdstation" | "kommo";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "ploomes", label: "Ploomes" },
  { id: "pipedrive", label: "Pipedrive" },
  { id: "hubspot", label: "HubSpot" },
  { id: "rdstation", label: "RD Station" },
  { id: "kommo", label: "Kommo" },
];

const KEY_LABEL: Record<Provider, string> = {
  ploomes: "User Key",
  pipedrive: "API Token",
  hubspot: "Access Token (Private App)",
  rdstation: "Access Token",
  kommo: "Access Token",
};

const SUBDOMAIN_STORAGE_KEY = "kommo_subdomain";

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

function isKommoConfigured(): boolean {
  const keys = getCrmKeys();
  return !!(keys["kommo"] && keys[SUBDOMAIN_STORAGE_KEY]);
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
  const [provider, setProvider] = useState<Provider>("ploomes");
  const [apiKey, setApiKey] = useState("");
  const [kommoSubdomain, setKommoSubdomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveKey, setSaveKey] = useState(true);
  // Lock state: Kommo config fica travada após salvar
  const [kommoLocked, setKommoLocked] = useState(false);
  const [unlockConfirm, setUnlockConfirm] = useState(false);

  // Lê as chaves sempre frescas ao abrir o modal
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      onClose();
      return;
    }
    const keys = getCrmKeys();
    setApiKey(keys[provider] || "");
    setKommoSubdomain(keys[SUBDOMAIN_STORAGE_KEY] || "");
    setKommoLocked(isKommoConfigured());
    setUnlockConfirm(false);
  };

  const handleProviderChange = (v: Provider) => {
    const keys = getCrmKeys();
    setProvider(v);
    setApiKey(keys[v] || "");
    if (v === "kommo") {
      setKommoSubdomain(keys[SUBDOMAIN_STORAGE_KEY] || "");
      setKommoLocked(isKommoConfigured());
      setUnlockConfirm(false);
    }
  };

  const handleUnlockRequest = () => {
    setUnlockConfirm(true);
  };

  const handleUnlockConfirm = () => {
    setKommoLocked(false);
    setUnlockConfirm(false);
    setApiKey("");
    setKommoSubdomain("");
  };

  const handleUnlockCancel = () => {
    setUnlockConfirm(false);
  };

  const handleExport = async () => {
    if (!empresa || !apiKey.trim()) {
      toast.error("Informe a API key do CRM.");
      return;
    }
    if (provider === "kommo" && !kommoSubdomain.trim()) {
      toast.error("Informe o subdomínio da conta Kommo.");
      return;
    }
    setLoading(true);
    try {
      const keys = getCrmKeys();
      // Se Kommo está travado, usa as chaves salvas (não o que está no input mascarado)
      const effectiveKey = (provider === "kommo" && kommoLocked)
        ? keys["kommo"] || apiKey.trim()
        : apiKey.trim();
      const effectiveSubdomain = (provider === "kommo" && kommoLocked)
        ? keys[SUBDOMAIN_STORAGE_KEY] || kommoSubdomain.trim()
        : kommoSubdomain.trim();

      const res = await exportToCrm(
        provider,
        effectiveKey,
        empresaToLead(empresa),
        provider === "kommo" ? { kommo_subdomain: effectiveSubdomain } : undefined,
      );
      if (res.success) {
        toast.success(res.message || `Lead enviado para ${PROVIDERS.find(p => p.id === provider)?.label}.`);
        if (saveKey && !kommoLocked) {
          setCrmKey(provider, effectiveKey);
          if (provider === "kommo") {
            setCrmKey(SUBDOMAIN_STORAGE_KEY, effectiveSubdomain);
            setKommoLocked(true);
          }
        }
        onClose();
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar para o CRM.");
    } finally {
      setLoading(false);
    }
  };

  const savedKeys = getCrmKeys();
  const isKommoLocked = provider === "kommo" && kommoLocked;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base">Enviar lead para CRM</DialogTitle>
          {empresa && (
            <p className="text-xs text-muted-foreground/70 truncate">
              {empresa.nome_fantasia || empresa.razao_social}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">CRM</Label>
            <Select value={provider} onValueChange={(v: any) => handleProviderChange(v)}>
              <SelectTrigger className="border-border bg-muted/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Kommo: subdomínio */}
          {provider === "kommo" && (
            <div className="space-y-2">
              <Label className="text-xs">Subdomínio da conta</Label>
              <div className="flex items-center gap-1">
                <Input
                  value={isKommoLocked ? savedKeys[SUBDOMAIN_STORAGE_KEY] || "" : kommoSubdomain}
                  onChange={e => setKommoSubdomain(e.target.value)}
                  placeholder="sua-empresa"
                  disabled={isKommoLocked}
                  className="border-border bg-muted/30 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">.kommo.com</span>
              </div>
            </div>
          )}

          {/* API Key / Access Token */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{KEY_LABEL[provider]}</Label>
              {isKommoLocked && (
                <div className="flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Configuração salva</span>
                </div>
              )}
            </div>
            <Input
              type="password"
              value={isKommoLocked ? "••••••••••••••••" : apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={savedKeys[provider] ? "•••••••• (salvo)" : "Cole aqui"}
              disabled={isKommoLocked}
              className="border-border bg-muted/30 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Bloco de confirmação para desbloquear Kommo */}
          {provider === "kommo" && isKommoLocked && !unlockConfirm && (
            <button
              type="button"
              onClick={handleUnlockRequest}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Unlock className="h-3 w-3" />
              Alterar configuração do Kommo
            </button>
          )}

          {provider === "kommo" && unlockConfirm && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Isso vai apagar a configuração atual do Kommo. Tem certeza?
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                  onClick={handleUnlockConfirm}
                >
                  Sim, alterar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={handleUnlockCancel}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Salvar chave — não mostra quando Kommo está travado */}
          {!isKommoLocked && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={saveKey}
                onChange={e => setSaveKey(e.target.checked)}
                className="rounded border-border"
              />
              Salvar chave para próximas exportações
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} className="border-border">
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
