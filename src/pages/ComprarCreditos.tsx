// src/pages/ComprarCreditos.tsx
import { useEffect, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  CircularProgress,
  IconButton,
  Chip,
  Grid,
} from "@mui/material";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import QrCodeIcon from "@mui/icons-material/QrCode";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import {
  getCreditPackages,
  checkoutCredits,
  getCredits,
  type CreditPackage,
  type CheckoutResult,
} from "@/lib/api";
import { toast } from "sonner";

export default function ComprarCreditos() {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CreditPackage | null>(null);
  const [billingType, setBillingType] = useState<"PIX" | "BOLETO" | null>(null);
  const [form, setForm] = useState({ name: "", email: "", cpf_cnpj: "" });
  const [checkingOut, setCheckingOut] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [saldo, setSaldo] = useState<number | null>(null);

  useEffect(() => {
    getCreditPackages()
      .then(r => setPackages(r.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
    getCredits().then(r => setSaldo(r.saldo)).catch(() => {});
  }, []);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    let formatted = "";
    if (digits.length <= 11) {
      formatted = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
        d ? `${a}.${b}.${c}-${d}` : (c ? `${a}.${b}.${c}` : (b ? `${a}.${b}` : a || "")));
    } else {
      formatted = digits.slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, d, e) =>
        e ? `${a}.${b}.${c}/${d}-${e}` : (d ? `${a}.${b}.${c}/${d}` : (c ? `${a}.${b}.${c}` : (b ? `${a}.${b}` : a || ""))));
    }
    setForm(prev => ({ ...prev, cpf_cnpj: formatted }));
  };

  const handleCheckout = async () => {
    if (!selected || !billingType) return;
    if (!form.name.trim() || !form.email.trim() || !form.cpf_cnpj.trim()) {
      toast.error("Preencha nome, e-mail e CPF/CNPJ.");
      return;
    }
    const cpf = form.cpf_cnpj.replace(/\D/g, "");
    if (cpf.length !== 11 && cpf.length !== 14) {
      toast.error("CPF deve ter 11 dígitos ou CNPJ 14 dígitos.");
      return;
    }
    setCheckingOut(true);
    setResult(null);
    try {
      const res = await checkoutCredits(selected.id, billingType, {
        name: form.name.trim(),
        email: form.email.trim(),
        cpf_cnpj: cpf,
      });
      setResult(res);
      toast.success("Cobrança gerada! Complete o pagamento para receber os créditos.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar cobrança.");
    } finally {
      setCheckingOut(false);
    }
  };

  const copyPix = async () => {
    if (!result?.pix_copy_paste) return;
    await navigator.clipboard.writeText(result.pix_copy_paste);
    setCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 12 }}>
        <CircularProgress size={32} sx={{ color: "text.secondary" }} />
      </Box>
    );
  }

  // ── Resultado: mostrar PIX ou Boleto ──────────────────────────────────────
  if (result) {
    return (
      <Box sx={{ maxWidth: 512, mx: "auto" }}>
        <Stack spacing={3}>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h5" fontWeight={700}>Pagamento gerado</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {result.credits} créditos · R$ {result.value.toFixed(2).replace(".", ",")}
            </Typography>
          </Box>

          {result.pix_qr_code && result.pix_copy_paste ? (
            <Card sx={{ border: "1px solid", borderColor: "rgba(255,255,255,0.07)" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <QrCodeIcon sx={{ fontSize: 18, color: "#34d399" }} />
                  <Typography variant="subtitle1" fontWeight={600}>Pague com PIX</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2.5 }}>
                  Escaneie o QR Code no app do seu banco ou copie o código abaixo.
                </Typography>
                <Box sx={{ display: "flex", justifyContent: "center", mb: 2.5, p: 2, bgcolor: "#141414", borderRadius: "8px" }}>
                  <Box
                    component="img"
                    src={`data:image/png;base64,${result.pix_qr_code}`}
                    alt="QR Code PIX"
                    sx={{ width: 192, height: 192 }}
                  />
                </Box>
                <Stack direction="row" spacing={1}>
                  <TextField
                    value={result.pix_copy_paste}
                    inputProps={{
                      readOnly: true,
                      style: { fontFamily: "monospace", fontSize: 12 },
                    }}
                    size="small"
                    fullWidth
                    sx={{ "& .MuiInputBase-root": { bgcolor: "rgba(255,255,255,0.04)" } }}
                  />
                  <IconButton
                    onClick={copyPix}
                    sx={{
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: "8px",
                      flexShrink: 0,
                      color: copied ? "#34d399" : "text.secondary",
                    }}
                  >
                    {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                  </IconButton>
                </Stack>
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.5 }}>
                  Após o pagamento, os créditos serão adicionados em até alguns minutos.
                </Typography>
              </CardContent>
            </Card>
          ) : result.bank_slip_url ? (
            <Card sx={{ border: "1px solid", borderColor: "rgba(255,255,255,0.07)" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <CreditCardIcon sx={{ fontSize: 18, color: "#fbbf24" }} />
                  <Typography variant="subtitle1" fontWeight={600}>Boleto bancário</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2.5 }}>
                  Abra o link abaixo para visualizar e pagar o boleto.
                </Typography>
                <Stack spacing={1.5}>
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    startIcon={<OpenInNewIcon fontSize="small" />}
                    component="a"
                    href={result.bank_slip_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir boleto
                  </Button>
                  {result.invoice_url && (
                    <Button
                      variant="outlined"
                      fullWidth
                      component="a"
                      href={result.invoice_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver fatura no Asaas
                    </Button>
                  )}
                  <Typography variant="caption" color="text.disabled">
                    Vencimento: {new Date(result.due_date).toLocaleDateString("pt-BR")}. Créditos creditados após confirmação do pagamento.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button
              variant="text"
              onClick={() => { setResult(null); setSelected(null); setBillingType(null); }}
              sx={{ color: "text.secondary" }}
            >
              Comprar mais créditos
            </Button>
          </Box>
        </Stack>
      </Box>
    );
  }

  // ── Listagem de pacotes + formulário ──────────────────────────────────────
  return (
    <Box sx={{ maxWidth: 896, mx: "auto" }}>
      <Stack spacing={4}>

        {/* Cabeçalho */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <MonetizationOnIcon sx={{ fontSize: 28, color: "#f59e0b" }} />
              <Typography variant="h5" fontWeight={700}>Comprar créditos</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Use créditos para enriquecer leads nas prospecções. Pagamento via PIX ou Boleto.
            </Typography>
          </Box>
          {saldo !== null && (
            <Box
              sx={{
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "12px",
                px: 2.5,
                py: 1.5,
                textAlign: "center",
                flexShrink: 0,
                bgcolor: "rgba(255,255,255,0.03)",
              }}
            >
              <Typography variant="caption" color="text.disabled" sx={{ textTransform: "uppercase", letterSpacing: 1, display: "block" }}>
                Saldo atual
              </Typography>
              <Typography variant="h5" fontWeight={700} sx={{ color: "#f59e0b", lineHeight: 1.2 }}>
                {saldo}
              </Typography>
              <Typography variant="caption" color="text.disabled">créditos</Typography>
            </Box>
          )}
        </Stack>

        {/* Cards de pacotes */}
        <Grid container spacing={2}>
          {packages.map(pkg => (
            <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={pkg.id}>
              <Card
                onClick={() => setSelected(pkg)}
                sx={{
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: selected?.id === pkg.id ? "primary.main" : "rgba(255,255,255,0.07)",
                  boxShadow: selected?.id === pkg.id ? "0 0 0 1px rgba(249,115,22,0.3)" : "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  "&:hover": {
                    borderColor: selected?.id === pkg.id ? "primary.main" : "rgba(249,115,22,0.4)",
                  },
                  height: "100%",
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={600}>{pkg.label}</Typography>
                    {pkg.badge && (
                      <Chip
                        label={pkg.badge}
                        size="small"
                        sx={{
                          fontSize: "0.62rem",
                          height: 18,
                          bgcolor: "rgba(249,115,22,0.15)",
                          color: "primary.main",
                          fontWeight: 600,
                        }}
                      />
                    )}
                  </Stack>
                  <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                    R$ {pkg.price.toFixed(2).replace(".", ",")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    R$ {(pkg.price / pkg.credits).toFixed(2).replace(".", ",")} / crédito
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Formulário de checkout */}
        {selected && (
          <Card sx={{ border: "1px solid", borderColor: "rgba(255,255,255,0.07)" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                Dados para cobrança
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2.5 }}>
                Pacote: {selected.label} · R$ {selected.price.toFixed(2).replace(".", ",")}
              </Typography>

              <Stack spacing={2}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Nome completo"
                      placeholder="Nome ou razão social"
                      fullWidth
                      size="small"
                      value={form.name}
                      onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="E-mail"
                      type="email"
                      placeholder="email@exemplo.com"
                      fullWidth
                      size="small"
                      value={form.email}
                      onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </Grid>
                </Grid>

                <TextField
                  label="CPF ou CNPJ"
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  size="small"
                  value={form.cpf_cnpj}
                  onChange={handleCpfChange}
                  inputProps={{ maxLength: 18, style: { fontFamily: "monospace" } }}
                />

                {/* Tipo de pagamento */}
                <Stack direction="row" spacing={1.5} sx={{ pt: 0.5 }}>
                  <Button
                    variant={billingType === "PIX" ? "contained" : "outlined"}
                    disabled={checkingOut}
                    startIcon={<QrCodeIcon fontSize="small" />}
                    onClick={() => setBillingType("PIX")}
                    sx={billingType === "PIX" ? {
                      bgcolor: "#16a34a",
                      "&:hover": { bgcolor: "#15803d" },
                    } : {}}
                  >
                    PIX
                  </Button>
                  <Button
                    variant={billingType === "BOLETO" ? "contained" : "outlined"}
                    disabled={checkingOut}
                    startIcon={<CreditCardIcon fontSize="small" />}
                    onClick={() => setBillingType("BOLETO")}
                    sx={billingType === "BOLETO" ? {
                      bgcolor: "#d97706",
                      "&:hover": { bgcolor: "#b45309" },
                    } : {}}
                  >
                    Boleto
                  </Button>
                </Stack>

                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  fullWidth
                  disabled={!billingType || checkingOut}
                  onClick={handleCheckout}
                  startIcon={checkingOut ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {checkingOut
                    ? "Gerando cobrança..."
                    : `Gerar cobrança ${billingType === "PIX" ? "PIX" : billingType === "BOLETO" ? "Boleto" : ""}`}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {!selected && packages.length > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            Selecione um pacote acima para continuar.
          </Typography>
        )}

      </Stack>
    </Box>
  );
}
