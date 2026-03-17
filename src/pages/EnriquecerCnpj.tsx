// src/pages/EnriquecerCnpj.tsx
import { useState } from "react";
import { Search, Building2, Mail, Phone, MessageCircle, Globe, CheckCircle2, AlertCircle, Loader2, Zap, RefreshCw, MapPin, DollarSign, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buscarEmpresaPorCnpj, enriquecerEmpresaPorCnpj, Empresa } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function InfoRow({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number | null | undefined;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", highlight ? "text-emerald-400" : "text-zinc-500")} />
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className={cn("text-sm font-medium break-all", highlight ? "text-emerald-300" : "text-zinc-200")}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  const color =
    value >= 75 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
    value >= 50 ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
    value >= 25 ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
    "bg-rose-500/20 text-rose-300 border-rose-500/30";
  return (
    <div className={cn("flex flex-col items-center rounded-lg border px-3 py-2", color)}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  );
}

export default function EnriquecerCnpj() {
  const [cnpjInput, setCnpjInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  async function handleBuscar() {
    const digits = cnpjInput.replace(/\D/g, "");
    if (digits.length !== 14) {
      setError("Informe um CNPJ válido com 14 dígitos.");
      return;
    }
    setLoading(true);
    setError(null);
    setEmpresa(null);
    setEnrichMsg(null);
    try {
      const res = await buscarEmpresaPorCnpj(digits);
      setEmpresa(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao buscar empresa.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnriquecer() {
    if (!empresa) return;
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const res = await enriquecerEmpresaPorCnpj(empresa.cnpj);
      setEnrichMsg(res.message || "Enriquecimento iniciado com sucesso.");
      // Recarrega dados após enriquecimento
      const updated = await buscarEmpresaPorCnpj(empresa.cnpj);
      setEmpresa(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enriquecer empresa.";
      setEnrichMsg(msg);
    } finally {
      setEnriching(false);
    }
  }

  const qualidade = empresa?.qualidade as Record<string, number> | undefined;
  const confiabilidade = empresa?.confiabilidade as Record<string, unknown> | undefined;
  const situacaoOk = empresa?.situacao_cadastral?.toLowerCase().includes("ativa");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Search className="h-6 w-6 text-blue-400" />
            Enriquecer CNPJ
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Busque uma empresa pelo CNPJ e enriqueça seus dados de contato automaticamente.
          </p>
        </div>

        {/* Formulário de busca */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="cnpj" className="text-zinc-300 text-sm mb-1.5 block">
                  CNPJ da Empresa
                </Label>
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00"
                  value={cnpjInput}
                  onChange={(e) => setCnpjInput(formatCnpj(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500"
                  maxLength={18}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleBuscar}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-2">{loading ? "Buscando..." : "Buscar"}</span>
                </Button>
              </div>
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resultado */}
        {empresa && (
          <div className="space-y-4">
            {/* Cabeçalho da empresa */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="text-lg text-white truncate">
                      {empresa.razao_social || "Empresa sem nome"}
                    </CardTitle>
                    {empresa.nome_fantasia && empresa.nome_fantasia !== empresa.razao_social && (
                      <p className="text-sm text-zinc-400 mt-0.5">{empresa.nome_fantasia}</p>
                    )}
                    <p className="text-xs text-zinc-500 font-mono mt-1">
                      {empresa.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "shrink-0 border",
                      situacaoOk
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-zinc-700/50 text-zinc-400 border-zinc-600"
                    )}
                  >
                    {situacaoOk ? (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    ) : (
                      <AlertCircle className="h-3 w-3 mr-1" />
                    )}
                    {empresa.situacao_cadastral || "Situação desconhecida"}
                  </Badge>
                </div>
              </CardHeader>

              <Separator className="bg-zinc-800" />

              <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <InfoRow icon={MapPin} label="Cidade / UF" value={empresa.cidade && empresa.uf ? `${empresa.cidade} - ${empresa.uf}` : empresa.cidade || empresa.uf} />
                <InfoRow icon={FileText} label="CNAE Principal" value={empresa.cnae_principal} />
                <InfoRow icon={DollarSign} label="Capital Social" value={empresa.capital_social ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(empresa.capital_social) : null} />
              </CardContent>
            </Card>

            {/* Contatos */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-zinc-200">Contatos</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <InfoRow icon={Mail} label="E-mail (enriquecido)" value={empresa.email_enriquecido} highlight />
                <InfoRow icon={Mail} label="E-mail (Receita)" value={empresa.email} />
                <InfoRow icon={Phone} label="Telefone (enriquecido)" value={empresa.telefone_enriquecido} highlight />
                <InfoRow icon={Phone} label="Telefone (Receita)" value={empresa.telefone_receita} />
                <InfoRow icon={MessageCircle} label="WhatsApp (enriquecido)" value={empresa.whatsapp_enriquecido} highlight />
                <InfoRow icon={MessageCircle} label="WhatsApp (público)" value={empresa.whatsapp_publico} />
                <InfoRow icon={Globe} label="Site" value={empresa.site} highlight />
              </CardContent>
            </Card>

            {/* Scores */}
            {qualidade && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-zinc-200">Scores de Qualidade</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {qualidade.completude !== undefined && <ScoreBadge label="Completude" value={Math.round(qualidade.completude)} />}
                    {qualidade.precisao !== undefined && <ScoreBadge label="Precisão" value={Math.round(qualidade.precisao)} />}
                    {qualidade.atualidade !== undefined && <ScoreBadge label="Atualidade" value={Math.round(qualidade.atualidade)} />}
                    {qualidade.consistencia !== undefined && <ScoreBadge label="Consistência" value={Math.round(qualidade.consistencia)} />}
                    {qualidade.score_total !== undefined && <ScoreBadge label="Total" value={Math.round(qualidade.score_total)} />}
                  </div>
                  {confiabilidade && (
                    <p className="text-xs text-zinc-500 mt-3">
                      Score de confiabilidade:{" "}
                      <span className="text-zinc-300 font-medium">
                        {(confiabilidade as Record<string, number>).score ?? "—"}
                      </span>
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* IA */}
            {empresa.resumo_ia_empresa && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Resumo IA
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {empresa.resumo_ia_empresa}
                  </p>
                  {empresa.enriquecimento_data && (
                    <p className="text-xs text-zinc-600 mt-2">
                      Atualizado em: {new Date(empresa.enriquecimento_data).toLocaleString("pt-BR")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ação de enriquecimento */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleEnriquecer}
                disabled={enriching}
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                {enriching ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {enriching ? "Enriquecendo..." : "Forçar Enriquecimento"}
              </Button>
              {enrichMsg && (
                <p className="text-sm text-zinc-400">{enrichMsg}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
