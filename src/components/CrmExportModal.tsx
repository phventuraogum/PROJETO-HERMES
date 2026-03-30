// src/components/CrmExportModal.tsx
import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Stack, Box, Typography,
  CircularProgress, Checkbox, FormControlLabel,
} from "@mui/material";
import {
  SendRounded, LockRounded, LockOpenRounded, WarningAmberRounded,
} from "@mui/icons-material";
import { exportToCrm, getCrmKeys, setCrmKey, type Empresa, type LeadExportPayload } from "@/lib/api";
import { toast } from "sonner";
import { useTheme } from "@mui/material/styles";
import { denseOutlinedInput } from "@/theme/themeSx";

type Provider = "ploomes" | "pipedrive" | "hubspot" | "rdstation" | "kommo";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "ploomes",   label: "Ploomes"                      },
  { id: "pipedrive", label: "Pipedrive"                    },
  { id: "hubspot",   label: "HubSpot"                      },
  { id: "rdstation", label: "RD Station"                   },
  { id: "kommo",     label: "Kommo"                        },
];

const KEY_LABEL: Record<Provider, string> = {
  ploomes:   "User Key",
  pipedrive: "API Token",
  hubspot:   "Access Token (Private App)",
  rdstation: "Access Token",
  kommo:     "Access Token",
};

const SUBDOMAIN_STORAGE_KEY = "kommo_subdomain";

function empresaToLead(emp: Empresa): LeadExportPayload {
  return {
    cnpj:          emp.cnpj,
    razao_social:  emp.razao_social,
    nome_fantasia: emp.nome_fantasia ?? undefined,
    email:         (emp.email || emp.email_enriquecido) ?? undefined,
    telefone:      emp.telefone_padrao ?? undefined,
    whatsapp:      (emp.whatsapp_publico || emp.whatsapp_enriquecido) ?? undefined,
    site:          emp.site ?? undefined,
    cidade:        emp.cidade ?? undefined,
    uf:            emp.uf ?? undefined,
    segmento:      emp.segmento ?? undefined,
    porte:         emp.porte ?? undefined,
    capital_social: emp.capital_social ?? undefined,
  };
}

function isKommoConfigured(): boolean {
  const keys = getCrmKeys();
  return !!(keys["kommo"] && keys[SUBDOMAIN_STORAGE_KEY]);
}

const paperSx = {
  backgroundColor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "12px",
  minWidth: 420,
};

export function CrmExportModal({
  open,
  onClose,
  empresa,
}: {
  open: boolean;
  onClose: () => void;
  empresa: Empresa | null;
}) {
  const theme = useTheme();
  const inputDenseSx = denseOutlinedInput(theme);
  const [provider, setProvider]           = useState<Provider>("ploomes");
  const [apiKey, setApiKey]               = useState("");
  const [kommoSubdomain, setKommoSubdomain] = useState("");
  const [loading, setLoading]             = useState(false);
  const [saveKey, setSaveKey]             = useState(true);
  const [kommoLocked, setKommoLocked]     = useState(false);
  const [unlockConfirm, setUnlockConfirm] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (!v) { onClose(); return; }
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

  const handleUnlockConfirm = () => {
    setKommoLocked(false);
    setUnlockConfirm(false);
    setApiKey("");
    setKommoSubdomain("");
  };

  const handleExport = async () => {
    if (!empresa || !apiKey.trim()) { toast.error("Informe a API key do CRM."); return; }
    if (provider === "kommo" && !kommoSubdomain.trim()) { toast.error("Informe o subdomínio da conta Kommo."); return; }
    setLoading(true);
    try {
      const keys = getCrmKeys();
      const effectiveKey       = (provider === "kommo" && kommoLocked) ? keys["kommo"] || apiKey.trim() : apiKey.trim();
      const effectiveSubdomain = (provider === "kommo" && kommoLocked) ? keys[SUBDOMAIN_STORAGE_KEY] || kommoSubdomain.trim() : kommoSubdomain.trim();

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
          if (provider === "kommo") { setCrmKey(SUBDOMAIN_STORAGE_KEY, effectiveSubdomain); setKommoLocked(true); }
        }
        onClose();
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar para o CRM.");
    } finally {
      setLoading(false);
    }
  };

  const savedKeys    = getCrmKeys();
  const isKommoLocked = provider === "kommo" && kommoLocked;

  return (
    <Dialog open={open} onClose={() => handleOpenChange(false)} PaperProps={{ sx: paperSx }}>
      <DialogTitle sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "text.primary", pb: 0.5 }}>
        Enviar lead para CRM
        {empresa && (
          <Typography sx={{ fontSize: "0.75rem", color: "#666", mt: 0.25 }} noWrap>
            {empresa.nome_fantasia || empresa.razao_social}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent sx={{ pt: "12px !important" }}>
        <Stack gap={2}>
          {/* CRM selector */}
          <TextField
            select
            size="small"
            label="CRM"
            value={provider}
            onChange={e => handleProviderChange(e.target.value as Provider)}
            fullWidth
            sx={inputDenseSx}
          >
            {PROVIDERS.map(p => (
              <MenuItem key={p.id} value={p.id} sx={{ fontSize: "0.8125rem" }}>{p.label}</MenuItem>
            ))}
          </TextField>

          {/* Kommo subdomain */}
          {provider === "kommo" && (
            <Stack direction="row" alignItems="center" gap={1}>
              <TextField
                size="small"
                label="Subdomínio da conta"
                value={isKommoLocked ? savedKeys[SUBDOMAIN_STORAGE_KEY] || "" : kommoSubdomain}
                onChange={e => setKommoSubdomain(e.target.value)}
                placeholder="sua-empresa"
                disabled={isKommoLocked}
                fullWidth
                sx={inputDenseSx}
              />
              <Typography sx={{ fontSize: "0.75rem", color: "#666", whiteSpace: "nowrap" }}>.kommo.com</Typography>
            </Stack>
          )}

          {/* API key */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
              <Typography sx={{ fontSize: "0.75rem", color: "#888" }}>{KEY_LABEL[provider]}</Typography>
              {isKommoLocked && (
                <Stack direction="row" alignItems="center" gap={0.5}>
                  <LockRounded sx={{ fontSize: 12, color: "#666" }} />
                  <Typography sx={{ fontSize: "0.6875rem", color: "#666" }}>Configuração salva</Typography>
                </Stack>
              )}
            </Stack>
            <TextField
              size="small"
              type="password"
              value={isKommoLocked ? "••••••••••••••••" : apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={savedKeys[provider] ? "•••••••• (salvo)" : "Cole aqui"}
              disabled={isKommoLocked}
              fullWidth
              sx={inputDenseSx}
            />
          </Box>

          {/* Unlock kommo */}
          {provider === "kommo" && isKommoLocked && !unlockConfirm && (
            <Button
              size="small"
              startIcon={<LockOpenRounded sx={{ fontSize: 14 }} />}
              onClick={() => setUnlockConfirm(true)}
              sx={{ alignSelf: "flex-start", fontSize: "0.75rem", textTransform: "none", color: "#666", p: 0, "&:hover": { color: "#A0A0A0" } }}
            >
              Alterar configuração do Kommo
            </Button>
          )}

          {provider === "kommo" && unlockConfirm && (
            <Box sx={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "8px", p: 1.5 }}>
              <Stack direction="row" gap={1} mb={1.5}>
                <WarningAmberRounded sx={{ fontSize: 15, color: "#F59E0B", mt: 0.1, flexShrink: 0 }} />
                <Typography sx={{ fontSize: "0.75rem", color: "#F59E0B" }}>
                  Isso vai apagar a configuração atual do Kommo. Tem certeza?
                </Typography>
              </Stack>
              <Stack direction="row" gap={1}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleUnlockConfirm}
                  sx={{ fontSize: "0.75rem", textTransform: "none", borderColor: "rgba(245,158,11,0.4)", color: "#F59E0B" }}
                >
                  Sim, alterar
                </Button>
                <Button
                  size="small"
                  onClick={() => setUnlockConfirm(false)}
                  sx={{ fontSize: "0.75rem", textTransform: "none", color: "#888" }}
                >
                  Cancelar
                </Button>
              </Stack>
            </Box>
          )}

          {/* Save key checkbox */}
          {!isKommoLocked && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={saveKey}
                  onChange={e => setSaveKey(e.target.checked)}
                  sx={{ color: "#444", "&.Mui-checked": { color: "#F97316" } }}
                />
              }
              label={<Typography sx={{ fontSize: "0.75rem", color: "#888" }}>Salvar chave para próximas exportações</Typography>}
            />
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{ fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px", borderColor: "rgba(255,255,255,0.1)", color: "#888" }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <SendRounded sx={{ fontSize: 15 }} />}
          sx={{ fontWeight: 600, fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px" }}
        >
          Enviar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
