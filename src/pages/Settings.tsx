import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Box, Stack, Typography, Button, TextField, Card, CardContent,
  Divider, Link,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import KeyIcon from "@mui/icons-material/Key";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { alpha, useTheme } from "@mui/material/styles";
import { getCrmKeys, setCrmKey } from "@/lib/api";

const CRM_PROVIDERS = [
  { id: "pipedrive", label: "Pipedrive", hint: "API Token — Configurações › Preferências da API", dot: "#F97316", url: "https://app.pipedrive.com/settings/api" },
  { id: "hubspot", label: "HubSpot", hint: "Access Token — Private App ou OAuth", dot: "#EF4444", url: "https://app.hubspot.com/api-key" },
  { id: "rdstation", label: "RD Station", hint: "Access Token — Integrações › API", dot: "#3B82F6", url: "https://app.rdstation.com.br/integrations" },
];

export default function Settings() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const cardSx = {
    borderRadius: 2,
    border: "1px solid",
    borderColor: "pinn.border",
    backgroundColor: "background.paper",
  };

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
    <Box sx={{ maxWidth: 768, display: "flex", flexDirection: "column", gap: 3 }}>

      {/* Page Header */}
      <Box>
        <Typography sx={{
          fontSize: "0.625rem", fontWeight: 600, color: "text.secondary",
          textTransform: "uppercase", letterSpacing: "0.24em", mb: 0.5,
        }}>
          Conta
        </Typography>
        <Typography variant="h5" fontWeight={700} sx={{ color: "text.primary", letterSpacing: "-0.02em" }}>
          Configurações
        </Typography>
        <Typography sx={{ fontSize: "0.85rem", color: "text.secondary", mt: 0.5 }}>
          Integrações e chaves de API por organização.
        </Typography>
      </Box>

      {/* CRM Integrations Card */}
      <Card sx={{ ...cardSx, overflow: "hidden" }}>
        {/* Card header */}
        <Box sx={{
          px: 3, py: 2.5,
          background: isDark
            ? "linear-gradient(135deg, rgba(249,115,22,0.06), rgba(249,115,22,0.02))"
            : "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(249,115,22,0.03))",
          borderBottom: "1px solid",
          borderBottomColor: "divider",
        }}>
          <Stack direction="row" alignItems="flex-start" gap={1.5}>
            <Box sx={{
              height: 40, width: 40,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.12 : 0.14),
              color: "primary.main",
              flexShrink: 0,
            }}>
              <KeyIcon sx={{ fontSize: 18 }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "text.primary" }}>
                Integrações CRM
              </Typography>
              <Typography sx={{ mt: 0.5, fontSize: "0.82rem", color: "text.secondary" }}>
                Conecte provedores e exporte leads do pipeline com menos atrito.
              </Typography>
            </Box>
          </Stack>
        </Box>

        {/* Provider rows */}
        <Box sx={{ backgroundColor: "background.paper" }}>
          {CRM_PROVIDERS.map((provider, idx) => (
            <Box key={provider.id}>
              {idx > 0 && <Divider sx={{ borderColor: "divider" }} />}
              <Box sx={{ px: 3, py: 2.5 }}>
                {/* Row header */}
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} sx={{ mb: 1 }}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Box sx={{ height: 8, width: 8, borderRadius: "50%", backgroundColor: provider.dot, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary" }}>
                      {provider.label}
                    </Typography>
                    {saved[provider.id] && keys[provider.id] && (
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <CheckCircleIcon sx={{ fontSize: 12, color: "success.main" }} />
                        <Typography sx={{ fontSize: "0.68rem", fontWeight: 600, color: "success.main" }}>
                          Conectado
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                  <Link
                    href={provider.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="none"
                    sx={{
                      display: "inline-flex", alignItems: "center", gap: 0.5,
                      fontSize: "0.68rem", color: "text.secondary",
                      transition: "color 0.2s",
                      "&:hover": { color: "primary.main" },
                      flexShrink: 0,
                    }}
                  >
                    Obter chave
                    <OpenInNewIcon sx={{ fontSize: 12 }} />
                  </Link>
                </Stack>

                {/* Hint */}
                <Typography sx={{ mb: 1.5, fontSize: "0.68rem", color: "text.secondary" }}>
                  {provider.hint}
                </Typography>

                {/* API key input */}
                <TextField
                  type="password"
                  placeholder="Cole sua chave aqui..."
                  value={keys[provider.id] || ""}
                  onChange={(event) => handleChange(provider.id, event.target.value)}
                  fullWidth
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      height: 40,
                      backgroundColor: isDark ? alpha("#fff", 0.03) : alpha(theme.palette.common.black, 0.04),
                      borderRadius: 2,
                      fontFamily: "monospace",
                      fontSize: "0.82rem",
                      "& fieldset": {
                        borderColor: isDark ? alpha("#fff", 0.1) : alpha(theme.palette.common.black, 0.12),
                      },
                      "&:hover fieldset": {
                        borderColor: isDark ? alpha("#fff", 0.18) : alpha(theme.palette.common.black, 0.2),
                      },
                      "&.Mui-focused fieldset": { borderColor: alpha(theme.palette.primary.main, 0.45), borderWidth: 1 },
                      "& input": { color: "text.primary" },
                      "& input::placeholder": { color: "text.secondary", opacity: 1 },
                    },
                  }}
                />
              </Box>
            </Box>
          ))}
        </Box>

        {/* Card footer / save button */}
        <Box sx={{
          display: "flex", justifyContent: "flex-end",
          px: 3, py: 2,
          borderTop: "1px solid",
          borderTopColor: "divider",
          backgroundColor: isDark ? alpha("#fff", 0.02) : alpha(theme.palette.common.black, 0.02),
        }}>
          <Button
            onClick={handleSave}
            disabled={!dirty}
            size="small"
            variant="contained"
            startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
            sx={{
              backgroundColor: "primary.main",
              "&:hover": { backgroundColor: "primary.dark" },
              "&:disabled": { backgroundColor: alpha(theme.palette.primary.main, 0.3), color: alpha(theme.palette.common.white, 0.4) },
              color: "primary.contrastText",
              fontWeight: 600,
              fontSize: "0.8rem",
              borderRadius: 1.5,
              px: 2,
            }}
          >
            Salvar configurações
          </Button>
        </Box>
      </Card>

      {/* Local storage notice */}
      <Box sx={{
        display: "flex", alignItems: "flex-start", gap: 1.5,
        borderRadius: 2.5, p: 2,
        backgroundColor: "rgba(249,115,22,0.06)",
        border: "1px solid rgba(249,115,22,0.15)",
      }}>
        <LockOutlinedIcon sx={{ fontSize: 16, color: "rgba(249,115,22,0.8)", flexShrink: 0, mt: 0.25 }} />
        <Box>
          <Typography sx={{ fontSize: "0.82rem", fontWeight: 600, color: "rgba(249,115,22,0.9)" }}>
            Chaves armazenadas localmente
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: "0.75rem", lineHeight: 1.55, color: "rgba(249,115,22,0.65)" }}>
            As chaves de API ficam apenas no navegador da sessão atual. O objetivo aqui é reduzir atrito de setup sem
            poluir a experiência com telas de integração desnecessárias.
          </Typography>
        </Box>
      </Box>

    </Box>
  );
}
