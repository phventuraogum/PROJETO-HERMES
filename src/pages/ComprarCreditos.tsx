// src/pages/ComprarCreditos.tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getCreditPackages,
  checkoutCredits,
  getCredits,
  type CreditPackage,
  type CheckoutResult,
} from "@/lib/api";
import { Coins, Loader2, QrCode, Copy, Check, ExternalLink, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
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
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Resultado: mostrar PIX ou Boleto
  if (result) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Pagamento gerado</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {result.credits} créditos · R$ {result.value.toFixed(2).replace(".", ",")}
          </p>
        </div>

        {result.pix_qr_code && result.pix_copy_paste ? (
          <Card className="border-zinc-800 bg-zinc-950/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="h-4 w-4 text-emerald-500" />
                Pague com PIX
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Escaneie o QR Code no app do seu banco ou copie o código abaixo.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center p-4 rounded-xl bg-white">
                <img
                  src={`data:image/png;base64,${result.pix_qr_code}`}
                  alt="QR Code PIX"
                  className="w-48 h-48"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={result.pix_copy_paste}
                  className="font-mono text-xs bg-zinc-900 border-zinc-700"
                />
                <Button variant="outline" size="icon" onClick={copyPix} className="border-zinc-700 shrink-0">
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-zinc-500">
                Após o pagamento, os créditos serão adicionados em até alguns minutos.
              </p>
            </CardContent>
          </Card>
        ) : result.bank_slip_url ? (
          <Card className="border-zinc-800 bg-zinc-950/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-amber-500" />
                Boleto bancário
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Abra o link abaixo para visualizar e pagar o boleto.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button asChild className="w-full gap-2">
                <a href={result.bank_slip_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Abrir boleto
                </a>
              </Button>
              {result.invoice_url && (
                <Button variant="outline" asChild className="w-full gap-2 border-zinc-700">
                  <a href={result.invoice_url} target="_blank" rel="noreferrer">
                    Ver fatura no Asaas
                  </a>
                </Button>
              )}
              <p className="text-[10px] text-zinc-500">
                Vencimento: {new Date(result.due_date).toLocaleDateString("pt-BR")}. Créditos creditados após confirmação do pagamento.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => { setResult(null); setSelected(null); setBillingType(null); }}>
            Comprar mais créditos
          </Button>
        </div>
      </div>
    );
  }

  // Listagem de pacotes + formulário
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Coins className="h-7 w-7 text-amber-500" />
            Comprar créditos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Use créditos para enriquecer leads nas prospecções. Pagamento via PIX ou Boleto.
          </p>
        </div>
        {saldo !== null && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-center">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Saldo atual</p>
            <p className="text-xl font-bold text-amber-400">{saldo}</p>
            <p className="text-[10px] text-zinc-500">créditos</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {packages.map(pkg => (
          <Card
            key={pkg.id}
            className={cn(
              "cursor-pointer transition-all border-zinc-800 bg-zinc-950/60 hover:border-amber-600/50",
              selected?.id === pkg.id && "border-amber-500 ring-1 ring-amber-500/30"
            )}
            onClick={() => setSelected(pkg)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{pkg.label}</CardTitle>
                {pkg.badge && (
                  <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-400 border-0">
                    {pkg.badge}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                R$ {pkg.price.toFixed(2).replace(".", ",")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                R$ {(pkg.price / pkg.credits).toFixed(2).replace(".", ",")} / crédito
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {selected && (
        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader>
            <CardTitle className="text-base">Dados para cobrança</CardTitle>
            <p className="text-xs text-muted-foreground">
              Pacote: {selected.label} · R$ {selected.price.toFixed(2).replace(".", ",")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome ou razão social"
                  className="border-zinc-700 bg-zinc-900/60"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  className="border-zinc-700 bg-zinc-900/60"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>CPF ou CNPJ</Label>
              <Input
                value={form.cpf_cnpj}
                onChange={handleCpfChange}
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                className="border-zinc-700 bg-zinc-900/60 font-mono"
                maxLength={18}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => setBillingType("PIX")}
                disabled={checkingOut}
                className={cn(
                  "gap-2",
                  billingType === "PIX"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                )}
              >
                <QrCode className="h-4 w-4" />
                PIX
              </Button>
              <Button
                onClick={() => setBillingType("BOLETO")}
                disabled={checkingOut}
                variant={billingType === "BOLETO" ? "default" : "outline"}
                className={cn(
                  "gap-2",
                  billingType === "BOLETO" ? "bg-amber-600 hover:bg-amber-700" : "border-zinc-700"
                )}
              >
                <CreditCard className="h-4 w-4" />
                Boleto
              </Button>
            </div>

            <Button
              className="w-full mt-4 gap-2"
              size="lg"
              disabled={!billingType || checkingOut}
              onClick={handleCheckout}
            >
              {checkingOut ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Gerando cobrança...</>
              ) : (
                <>Gerar cobrança {billingType === "PIX" ? "PIX" : "Boleto"}</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {!selected && packages.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Selecione um pacote acima para continuar.
        </p>
      )}
    </div>
  );
}
