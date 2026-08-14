import { useEffect, useState } from "react";
import {
  Building2,
  Code2,
  ExternalLink,
  Globe,
  Loader2,
  ReceiptText,
  RefreshCw,
  Store,
  Tags,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { buscarDossieEmpresa, type DossieHermes } from "@/lib/api";
import { cn } from "@/lib/utils";
import RawDataView from "./RawDataView";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: DossieHermes }
  | { status: "error"; message: string };

interface Props {
  cnpj: string;
  /** Se `true`, dispara o fetch ao montar. Default `true`. */
  autoload?: boolean;
}

function formatBRL(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

const SectionLabel = ({ icon: Icon, children }: { icon: typeof Globe; children: React.ReactNode }) => (
  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
    <Icon className="h-3 w-3" /> {children}
  </p>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <p className="text-xs text-muted-foreground">
    <span className="text-muted-foreground/60">{label}:</span> {children}
  </p>
);

export default function DossieHermesSection({ cnpj, autoload = true }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [showRaw, setShowRaw] = useState(false);

  async function load(refresh = false) {
    setState({ status: "loading" });
    try {
      const data = await buscarDossieEmpresa(cnpj, { refresh });
      setState({ status: "ok", data });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Falha ao buscar dossiê",
      });
    }
  }

  useEffect(() => {
    if (!autoload || !cnpj) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj]);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <section className="rounded-xl border border-border bg-muted/20 p-4">
        <SectionLabel icon={Globe}>Dossiê Hermes (Receita Federal)</SectionLabel>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando dados de Receita Federal, sócios, filiais e site oficial…
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between">
          <SectionLabel icon={Globe}>Dossiê Hermes (Receita)</SectionLabel>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Tentar novamente" onClick={() => load()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-xs text-destructive">{state.message}</p>
      </section>
    );
  }

  const d = state.data;
  const enderecoLinha = [d.endereco?.tipo_logradouro, d.endereco?.logradouro, d.endereco?.numero, d.endereco?.complemento]
    .filter(Boolean)
    .join(" ");
  const enderecoExtras = [
    d.endereco?.bairro,
    d.endereco?.cep ? `CEP ${d.endereco.cep}` : null,
    [d.endereco?.cidade, d.endereco?.uf].filter(Boolean).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");

  const filiaisExternas = (d.filiais ?? []).filter((f) => !f.is_self);
  const filiaisAtivas = filiaisExternas.filter((f) => (f.situacao || "").toLowerCase().includes("ativ"));
  const siteVerificado = ["rdap", "rdap_email_receita", "cnpj_na_pagina"].includes(d.site_oficial?.confianca ?? "");

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon={Globe}>Dossiê Hermes ({d.fonte})</SectionLabel>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6"
            title={showRaw ? "Ocultar JSON cru" : "Ver JSON cru do dossiê"}
            onClick={() => setShowRaw((v) => !v)}>
            <Code2 className={cn("h-3.5 w-3.5", showRaw && "text-primary")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Atualizar dossiê (descarta cache)"
            onClick={() => load(true)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showRaw && (
        <RawDataView
          data={d}
          title="Dossiê Hermes (JSON cru)"
          highlight={["cnpj", "telefone", "whatsapp", "email", "site", "ie", "cnae"]}
        />
      )}

      {/* Resumo cadastral */}
      <div>
        <div className="mb-2 flex flex-wrap gap-1">
          {d.tipo && (
            <Badge variant="outline" className={cn("text-[10px]", d.tipo.toLowerCase() === "matriz" && "border-primary/50 text-primary")}>
              {d.tipo.toUpperCase()}
            </Badge>
          )}
          {d.situacao_cadastral && (
            <Badge variant="outline" className={cn("text-[10px]",
              d.situacao_cadastral.toLowerCase() === "ativa" ? "border-emerald-500/50 text-emerald-600" : "border-amber-500/50 text-amber-600")}>
              {d.situacao_cadastral}
            </Badge>
          )}
          {d.porte && <Badge variant="outline" className="text-[10px]">{d.porte}</Badge>}
        </div>
        <div className="space-y-1">
          {d.razao_social && <Field label="Razão social">{d.razao_social}</Field>}
          {d.nome_fantasia && <Field label="Nome fantasia">{d.nome_fantasia}</Field>}
          {d.natureza_juridica && <Field label="Natureza jurídica">{d.natureza_juridica}</Field>}
          {d.qualificacao_responsavel && <Field label="Resp. legal">{d.qualificacao_responsavel}</Field>}
          {formatBRL(d.capital_social) && <Field label="Capital social">{formatBRL(d.capital_social)}</Field>}
          {d.data_inicio_atividade && <Field label="Início atividade">{d.data_inicio_atividade}</Field>}
          {d.atualizado_em && <p className="text-[11px] text-muted-foreground/50">Atualizado em {d.atualizado_em} (Receita)</p>}
        </div>
      </div>

      {(enderecoLinha || enderecoExtras) && (
        <div>
          <SectionLabel icon={Building2}>Endereço fiscal</SectionLabel>
          <p className="text-xs text-muted-foreground">
            {enderecoLinha || "—"}
            {enderecoExtras && <span className="block text-muted-foreground/60">{enderecoExtras}</span>}
          </p>
        </div>
      )}

      {(d.contatos_receita?.telefone1 || d.contatos_receita?.telefone2 || d.contatos_receita?.email) && (
        <div>
          <SectionLabel icon={ReceiptText}>Contatos da Receita</SectionLabel>
          <div className="space-y-0.5">
            {d.contatos_receita.telefone1 && <Field label="Telefone 1">{d.contatos_receita.telefone1}</Field>}
            {d.contatos_receita.telefone2 && <Field label="Telefone 2">{d.contatos_receita.telefone2}</Field>}
            {d.contatos_receita.email && (
              <Field label="E-mail">
                <a href={`mailto:${d.contatos_receita.email}`} className="text-primary hover:underline">
                  {d.contatos_receita.email}
                </a>
              </Field>
            )}
          </div>
        </div>
      )}

      <Separator />

      {/* CNAEs completos */}
      <div>
        <SectionLabel icon={Tags}>CNAEs ({(d.cnaes_secundarias ?? []).length} secundárias)</SectionLabel>
        <div className="space-y-1">
          {d.cnae_principal?.subclasse && (
            <p className="text-xs">
              <span className="font-semibold text-emerald-600">Principal:</span>{" "}
              <span className="font-mono">{d.cnae_principal.subclasse}</span> — {d.cnae_principal.descricao}
            </p>
          )}
          {(d.cnaes_secundarias ?? []).map((c, i) => (
            <p key={`${c.subclasse}-${i}`} className="text-xs text-muted-foreground">
              <span className="font-mono text-muted-foreground/70">{c.subclasse}</span> — {c.descricao}
            </p>
          ))}
        </div>
      </div>

      {/* Inscrições estaduais */}
      {(d.inscricoes_estaduais ?? []).length > 0 && (
        <>
          <Separator />
          <div>
            <SectionLabel icon={ReceiptText}>Inscrições estaduais ({d.inscricoes_estaduais.length})</SectionLabel>
            <div className="flex flex-wrap gap-1">
              {d.inscricoes_estaduais.map((ie, i) => (
                <Badge key={`${ie.uf}-${ie.ie}-${i}`} variant="outline"
                  className={cn("text-[10px]", ie.ativa && "border-emerald-500/50 text-emerald-600")}>
                  {ie.uf}: {ie.ie}{ie.ativa ? "" : " (inativa)"}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* QSA */}
      {(d.socios ?? []).length > 0 && (
        <>
          <Separator />
          <div>
            <SectionLabel icon={Users}>Quadro Societário (QSA — {d.socios.length})</SectionLabel>
            <div className="space-y-2">
              {d.socios.map((s, i) => (
                <div key={`${s.cpf_cnpj}-${i}`} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{s.nome || "(sem nome)"}</span>
                    {s.tipo && <Badge variant="outline" className="h-4 text-[9px]">{String(s.tipo).toUpperCase()}</Badge>}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {s.cpf_cnpj && <p className="font-mono text-[11px] text-muted-foreground/60">{s.cpf_cnpj}</p>}
                    {s.qualificacao && <p className="text-xs text-muted-foreground">{s.qualificacao}</p>}
                    {s.faixa_etaria && <p className="text-[11px] text-muted-foreground/60">Faixa etária: {s.faixa_etaria}</p>}
                    {s.data_entrada && <p className="text-[11px] text-muted-foreground/60">Entrou em {s.data_entrada}</p>}
                    {s.representante && (
                      <p className="text-xs text-muted-foreground">
                        <span className="text-muted-foreground/60">Repr. legal:</span> {s.representante}
                        {s.qualificacao_representante && ` (${s.qualificacao_representante})`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Filiais */}
      {filiaisExternas.length > 0 && (
        <>
          <Separator />
          <div>
            <SectionLabel icon={Store}>Filiais ({filiaisExternas.length} • {filiaisAtivas.length} ativas)</SectionLabel>
            <div className="space-y-2">
              {filiaisExternas.map((f, i) => (
                <div key={`${f.cnpj}-${i}`} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{f.cnpj}</span>
                    <Badge variant="outline"
                      className={cn("h-4 text-[9px]", (f.situacao || "").toLowerCase().includes("ativ") && "border-emerald-500/50 text-emerald-600")}>
                      {f.situacao || "—"}
                    </Badge>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {(f.cidade || f.uf) && (
                      <p className="text-xs text-muted-foreground">{[f.cidade, f.uf].filter(Boolean).join(" / ")}</p>
                    )}
                    {f.atividade_principal && <p className="text-[11px] text-muted-foreground/60">{f.atividade_principal}</p>}
                    {f.telefone && <p className="text-[11px] text-muted-foreground/60">☏ {f.telefone}</p>}
                    {f.email && (
                      <p className="text-xs">
                        <a href={`mailto:${f.email}`} className="text-primary hover:underline">{f.email}</a>
                      </p>
                    )}
                    {f.data_inicio && (
                      <p className="text-[11px] text-muted-foreground/60">
                        Início: {f.data_inicio}
                        {f.data_situacao && ` · Situação desde ${f.data_situacao}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Site oficial */}
      {d.site_oficial?.url && (
        <>
          <Separator />
          <div>
            <SectionLabel icon={ExternalLink}>Site oficial</SectionLabel>
            <div className="flex items-center gap-2">
              <a href={d.site_oficial.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">
                {d.site_oficial.url}
              </a>
              {siteVerificado && (
                <span title="Site confirmado pelo CNPJ (registro.br ou pagina)"
                  className="flex-shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                  verificado
                </span>
              )}
            </div>
            {d.site_oficial.contatos_extraidos && (
              <div className="mt-1.5 space-y-0.5">
                {d.site_oficial.contatos_extraidos.emails.length > 0 && (
                  <Field label="E-mails">{d.site_oficial.contatos_extraidos.emails.join(" · ")}</Field>
                )}
                {d.site_oficial.contatos_extraidos.telefones.length > 0 && (
                  <Field label="Telefones">{d.site_oficial.contatos_extraidos.telefones.join(" · ")}</Field>
                )}
                {d.site_oficial.contatos_extraidos.whatsapps.length > 0 && (
                  <Field label="WhatsApp">{d.site_oficial.contatos_extraidos.whatsapps.join(" · ")}</Field>
                )}
                {Object.keys(d.site_oficial.contatos_extraidos.redes_sociais).length > 0 && (
                  <Field label="Redes">
                    {Object.entries(d.site_oficial.contatos_extraidos.redes_sociais)
                      .map(([plat, slug]) => `${plat}: ${slug}`)
                      .join(" · ")}
                  </Field>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
