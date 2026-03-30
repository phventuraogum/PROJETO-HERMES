// src/components/MensagemModal.tsx
import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent,
  Button, TextField, Stack, Box, Typography, Chip, IconButton,
  CircularProgress,
} from "@mui/material";
import {
  AutoAwesomeRounded, RefreshRounded,
  EmailRounded, MessageRounded,
  ContentCopyRounded, CheckRounded,
} from "@mui/icons-material";
import {
  gerarMensagemAbordagem, type Empresa, type CanalMensagem,
} from "@/lib/api";
import { useTheme } from "@mui/material/styles";
import { denseOutlinedInput } from "@/theme/themeSx";

// LinkedIn icon not in @mui/icons-material standard — use a simple SVG chip
function LinkedInSvg({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
    </svg>
  );
}

type CanalConfig = {
  id: CanalMensagem;
  label: string;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
};

const CANAIS: CanalConfig[] = [
  { id: "whatsapp", label: "WhatsApp", activeColor: "#22C55E", activeBg: "rgba(34,197,94,0.1)",  activeBorder: "rgba(34,197,94,0.3)"  },
  { id: "email",    label: "E-mail",   activeColor: "#38BDF8", activeBg: "rgba(56,189,248,0.1)", activeBorder: "rgba(56,189,248,0.3)" },
  { id: "linkedin", label: "LinkedIn", activeColor: "#60A5FA", activeBg: "rgba(96,165,250,0.1)", activeBorder: "rgba(96,165,250,0.3)" },
];

const paperSx = {
  backgroundColor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "12px",
  minWidth: { xs: 340, sm: 500 },
  maxWidth: 560,
};

export function MensagemModal({
  empresa,
  open,
  onClose,
}: {
  empresa: Empresa;
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const inputDenseSx = denseOutlinedInput(theme);
  const [canal, setCanal]     = useState<CanalMensagem>("whatsapp");
  const [produto, setProduto] = useState("");
  const [corpo, setCorpo]     = useState("");
  const [assunto, setAssunto] = useState("");
  const [iaUsada, setIaUsada] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const gerar = async () => {
    setLoading(true);
    try {
      const resp = await gerarMensagemAbordagem(empresa, canal, produto);
      setCorpo(resp.corpo);
      setAssunto(resp.assunto ?? "");
      setIaUsada(resp.ia);
    } finally {
      setLoading(false);
    }
  };

  const copiar = async () => {
    const texto = canal === "email" && assunto ? `Assunto: ${assunto}\n\n${corpo}` : corpo;
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const canalAtual = CANAIS.find(c => c.id === canal)!;

  return (
    <Dialog open={open} onClose={onClose} PaperProps={{ sx: paperSx }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <AutoAwesomeRounded sx={{ fontSize: 17, color: "#F59E0B" }} />
          <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "text.primary" }}>
            Gerar mensagem de abordagem
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
          {empresa.nome_fantasia || empresa.razao_social} · {empresa.cidade} / {empresa.uf}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: "8px !important" }}>
        <Stack gap={2}>
          {/* Canal selector */}
          <Stack direction="row" gap={1}>
            {CANAIS.map(c => {
              const active = canal === c.id;
              return (
                <Box
                  key={c.id}
                  component="button"
                  onClick={() => { setCanal(c.id); setCorpo(""); setAssunto(""); }}
                  sx={{
                    display: "flex", alignItems: "center", gap: 0.75,
                    px: 1.5, py: 0.75, borderRadius: "8px",
                    border: `1px solid ${active ? c.activeBorder : theme.palette.divider}`,
                    backgroundColor: active ? c.activeBg : "transparent",
                    color: active ? c.activeColor : "text.secondary",
                    fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
                    transition: "all 0.15s",
                    "&:hover": { borderColor: active ? c.activeBorder : "text.secondary", color: active ? c.activeColor : "text.primary" },
                  }}
                >
                  {c.id === "whatsapp" && <MessageRounded sx={{ fontSize: 14 }} />}
                  {c.id === "email"    && <EmailRounded    sx={{ fontSize: 14 }} />}
                  {c.id === "linkedin" && <LinkedInSvg size={14} />}
                  {c.label}
                </Box>
              );
            })}
          </Stack>

          {/* Produto */}
          <TextField
            size="small"
            label="Produto/serviço (opcional)"
            value={produto}
            onChange={e => setProduto(e.target.value)}
            placeholder="ex: consultoria fiscal, software ERP, logística..."
            fullWidth
            sx={inputDenseSx}
          />

          {/* Gerar button */}
          <Button
            variant="contained"
            fullWidth
            onClick={gerar}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded sx={{ fontSize: 16 }} />}
            sx={{ fontWeight: 600, fontSize: "0.8125rem", textTransform: "none", borderRadius: "8px" }}
          >
            {loading ? "Gerando..." : "Gerar mensagem"}
          </Button>

          {/* Resultado */}
          {corpo && (
            <Stack gap={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" gap={1}>
                  {canalAtual.id === "whatsapp" && <MessageRounded sx={{ fontSize: 14, color: canalAtual.activeColor }} />}
                  {canalAtual.id === "email"    && <EmailRounded    sx={{ fontSize: 14, color: canalAtual.activeColor }} />}
                  {canalAtual.id === "linkedin" && <Box sx={{ color: canalAtual.activeColor, display: "flex" }}><LinkedInSvg size={14} /></Box>}
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.primary" }}>{canalAtual.label}</Typography>
                  <Chip
                    label={iaUsada ? "✦ IA" : "template"}
                    size="small"
                    sx={{
                      fontSize: "0.625rem", height: 18,
                      backgroundColor: iaUsada ? "rgba(245,158,11,0.1)" : "action.hover",
                      color: iaUsada ? "#F59E0B" : "text.secondary",
                      border: `1px solid ${iaUsada ? "rgba(245,158,11,0.25)" : theme.palette.divider}`,
                    }}
                  />
                </Stack>
                <Button
                  size="small"
                  startIcon={copiado ? <CheckRounded sx={{ fontSize: 13 }} /> : <ContentCopyRounded sx={{ fontSize: 13 }} />}
                  onClick={copiar}
                  sx={{
                    fontSize: "0.6875rem", textTransform: "none",
                    color: copiado ? "#22C55E" : "text.secondary",
                    "&:hover": { color: copiado ? "#22C55E" : "text.primary" },
                  }}
                >
                  {copiado ? "Copiado!" : "Copiar"}
                </Button>
              </Stack>

              {assunto && (
                <Box sx={{ backgroundColor: "action.hover", border: "1px solid", borderColor: "divider", borderRadius: "8px", px: 2, py: 1.5 }}>
                  <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", display: "block", mb: 0.5 }}>Assunto</Typography>
                  <Typography sx={{ fontSize: "0.875rem", color: "text.primary" }}>{assunto}</Typography>
                </Box>
              )}

              <TextField
                multiline
                rows={8}
                value={corpo}
                onChange={e => setCorpo(e.target.value)}
                fullWidth
                sx={{
                  ...inputDenseSx,
                  "& .MuiInputBase-input": { lineHeight: 1.6 },
                }}
              />

              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                Personalize antes de enviar. Substitua os [colchetes] pelos dados reais.
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
