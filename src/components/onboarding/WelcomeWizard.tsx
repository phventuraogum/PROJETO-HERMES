import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight, Building2, Key, Zap, X, ExternalLink, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useOrg } from "@/tenancy/OrgContext";
import { saveCrmKey, getCrmKeysStatus } from "@/lib/api";
import { BRAND } from "@/config/brand";
import { toast } from "sonner";

/* ─────────────────────────────────────────────────────────────────────────────
 * JUN 6.2 · Wizard pós-signup (3 passos)
 *
 * Fluxo:
 *   1. Org confirm — mostra qual org está logada (Pinn / OM MKT / etc)
 *   2. CRM keys (opcional) — Pipedrive/HubSpot/RD com saveCrmKey (backend cifrado)
 *   3. CTA primeira busca — manda pra /app
 *
 * Estado: localStorage flag `hermes:wizard_v1_done:{org_id}` evita repetição.
 * ────────────────────────────────────────────────────────────────────────── */

const WIZARD_FLAG = "hermes:wizard_v1_done";

const CRM_PROVIDERS = [
  { id: "pipedrive", label: "Pipedrive", url: "https://app.pipedrive.com/settings/api" },
  { id: "hubspot",   label: "HubSpot",   url: "https://app.hubspot.com/api-key" },
  { id: "rdstation", label: "RD Station", url: "https://app.rdstation.com.br/integrations" },
] as const;

type ProviderId = (typeof CRM_PROVIDERS)[number]["id"];

export function useWizardState() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id || "default";
  const key = `${WIZARD_FLAG}:${orgId}`;

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    const done = localStorage.getItem(key);
    if (!done) setOpen(true);
  }, [currentOrg, key]);

  const dismiss = () => {
    localStorage.setItem(key, new Date().toISOString());
    setOpen(false);
  };

  return { open, dismiss, orgName: currentOrg?.name || "Sua organização" };
}

export function WelcomeWizard({ open, onDone, orgName }: { open: boolean; onDone: () => void; orgName: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [crmKeys, setCrmKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      getCrmKeysStatus().then(setConfigured).catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  const handleSaveCrm = async () => {
    const toSave = Object.entries(crmKeys).filter(([, v]) => v.trim());
    if (toSave.length === 0) {
      setStep(3);
      return;
    }
    setSaving(true);
    let ok = 0;
    for (const [provider, value] of toSave) {
      try {
        await saveCrmKey(provider as ProviderId, value);
        ok++;
      } catch (e) {
        console.warn(`Falha ao salvar ${provider}:`, e);
      }
    }
    setSaving(false);
    if (ok > 0) toast.success(`${ok} chave(s) CRM salva(s) (cifradas no servidor).`);
    setStep(3);
  };

  const finish = () => {
    onDone();
    navigate("/app");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg surface-elevated p-6 sm:p-8 space-y-6">
        <button
          type="button"
          onClick={onDone}
          aria-label="Pular wizard"
          className="absolute top-3 right-3 text-muted-foreground/60 hover:text-foreground transition-colors p-1.5 rounded-pinn-2 hover:bg-muted/40"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                step >= n ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
          <span className="text-[10px] font-mono-pinn text-muted-foreground/60 ml-2">{step}/3</span>
        </div>

        {/* Step 1: Org confirm */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-pinn-3 bg-primary/10 text-primary shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-pinn-h3 font-bold tracking-tight">Bem-vindo ao {BRAND.product}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Vamos configurar sua prospecção em 3 passos rápidos.
                </p>
              </div>
            </div>

            <div className="rounded-pinn-3 border border-border bg-muted/30 px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Organização ativa</p>
              <p className="text-base font-semibold text-foreground mt-1 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {orgName}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Cada org tem suas próprias chaves de integração, leads e configurações. Você pode trocar pelo seletor no menu.
              </p>
            </div>

            <Button onClick={() => setStep(2)} className="w-full gap-2">
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: CRM keys */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-pinn-3 bg-primary/10 text-primary shrink-0">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-pinn-h3 font-bold tracking-tight">Integrar CRM (opcional)</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Conecte agora pra exportar leads em 1 clique. Pode fazer depois em Configurações.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {CRM_PROVIDERS.map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`wiz-${p.id}`} className="text-xs font-semibold flex items-center gap-2">
                      {p.label}
                      {configured[p.id] && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Configurado
                        </span>
                      )}
                    </Label>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      Obter chave
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <Input
                    id={`wiz-${p.id}`}
                    type="password"
                    placeholder={configured[p.id] ? "•••••••• (digite pra substituir)" : "Cole sua chave aqui..."}
                    value={crmKeys[p.id] || ""}
                    onChange={(e) => setCrmKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 rounded-pinn-2 bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground">
              <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
              <span>Chaves cifradas via pgcrypto antes de irem ao banco. Servidor não loga; frontend nunca recebe valor decifrado de volta.</span>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(3)} className="flex-1">
                Pular
              </Button>
              <Button onClick={handleSaveCrm} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Salvando..." : "Salvar + continuar"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: CTA primeira busca */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-pinn-3 bg-primary/10 text-primary shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-pinn-h3 font-bold tracking-tight">Tudo pronto</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Sua primeira prospecção em ~2min. Escolha CNAE, UF e capital mínimo — o {BRAND.product} faz o resto.
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-sm">
              {[
                "56M+ CNPJs da base oficial Receita Federal",
                "Enriquecimento automático: email, WhatsApp, sócios LinkedIn",
                "Score ICP V2 com disqualifiers + saúde fiscal",
                "Pipeline integrado a Pipedrive, HubSpot, RD, Ploomes, Kommo",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>

            <Button onClick={finish} className="w-full gap-2 btn-cta">
              Fazer primeira prospecção
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
