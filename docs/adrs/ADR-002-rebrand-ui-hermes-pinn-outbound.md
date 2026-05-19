# ADR-002 · Rebrand UI: "Hermes" vs "Pinn Outbound" no produto

**Status:** RASCUNHO — aguarda decisão Mesa Executiva (CMO + CDO + CRO + CTO)
**Data:** 2026-05-19
**Owner técnico:** Pedro Henrique (CTO Pinn PB)
**Tickets ClickUp:** MAI-02 `86ahbjcuh` · destrava ÉPICO P5 (onboarding) e MAI-21 (copyright já feito)
**Tipo:** Type 1 (reversível mas caro) — afeta percepção de cliente, comms externas, documentação

---

## Contexto

O produto se chama **Hermes** internamente desde o primeiro dia. Espaço ClickUp é "Pinn Outbound (Hermes)". URLs são `hermes.*`. Header (`src/components/layout/Header.tsx:54`) hardcoda `<span>Hermes</span>` como label de marca. Login footer dizia "© 2025 Hermes" (corrigido para "© 2026 Pinn PB" em MAI-21).

A Pinn vende o produto como parte da linha **Pinn Sales Agent / Pinn BAI / Pinn APA**. "Hermes" não é uma das três — é nome interno. Cliente que assina contrato lê "Pinn", não "Hermes".

Status atual: **mistura de marca na UI**. Cliente vê "Hermes" no header e "Pinn" no footer/contrato/site. Inconsistência ruim para B2B premium (beachhead indústrias R$50M+).

## Problema

Decidir nome **visível ao cliente** no produto e o caminho técnico de implementação.

## Opções consideradas

### Opção A · Renomear UI inteira para "Pinn Outbound"
- **Pró:** Alinha 100% com linha de produto Pinn. Cliente vê uma marca só.
- **Contra:** "Hermes" tem identidade interna forte (URL, time, código, ClickUp space). Renomear tudo = retrabalho cross-stack (docs, scripts, deploys, env vars). URL `hermes.pinnpb.com.br` continua. Pode confundir time que fala "Hermes" há meses.
- **Veredicto:** Caro. Faz sentido se "Pinn Outbound" virar SKU oficial; caso contrário é cosmético.

### Opção B · Manter "Hermes" como nome do produto, "Pinn" como organização
- **Pró:** Zero retrabalho técnico. "Pinn" continua como umbrella, "Hermes" como produto irmão de BAI/Agent Sales/APA.
- **Contra:** Cliente compra "Pinn BAI" e "Pinn Outbound" no mesmo deck, mas o app diz "Hermes". Quebra coerência narrativa do CRO.
- **Veredicto:** Status quo. Aceitável só se Hermes virar nome de linha de produto público.

### Opção C · Co-branding "Pinn Outbound (Hermes)" no header · **RECOMENDADO temporário**
- **Pró:** Reconhece transição. Permite cliente novo associar "Pinn Outbound" sem perder reconhecimento de quem já conhece "Hermes" do roadmap interno. Visual: "Pinn Outbound" como nome principal, "Hermes" em badge mute pequeno (eyebrow).
- **Contra:** Solução transitória — exige decisão final futura sobre dropar "Hermes".
- **Veredicto:** **Recomendado como ponte (3-6 meses)** enquanto base de clientes for pequena e fácil de re-treinar.

### Opção D · Config-driven brand label
Independente da escolha A/B/C, criar `src/config/brand.ts` com:

```typescript
export const BRAND = {
  product:      "Pinn Outbound",   // visível ao cliente
  productAlias: "Hermes",          // opcional (mostrado como subtítulo se != null)
  org:          "Pinn PB",
  copyright:    "© 2026 Pinn PB",
} as const;
```

Todo lugar que hoje hardcoda "Hermes" passa a importar `BRAND.product`. Trocar nome no futuro = mudar 1 arquivo. **Esta opção é ortogonal e deve ser executada independente da escolha narrativa.**

## Decisão recomendada

- **Narrativa:** Opção C (co-branding "Pinn Outbound (Hermes)") por 6 meses, com cláusula de re-avaliação em Nov/2026.
- **Técnica:** Opção D obrigatória — config-driven label, custo ~1h dev.

## Plano de implementação (se aprovado)

| Step | Arquivo | Mudança | Estimativa |
|------|---------|---------|------------|
| 1 | `src/config/brand.ts` | Criar export `BRAND` com 4 campos canônicos | 10min |
| 2 | `src/components/layout/Header.tsx:54` | Substituir `<span>Hermes</span>` por `<span>{BRAND.product}</span>{BRAND.productAlias && <span className="text-muted-foreground/60 ml-2 text-xs">({BRAND.productAlias})</span>}` | 5min |
| 3 | `src/components/layout/Sidebar.tsx` brand block (linhas 75-80) | Logo + nome a partir de `BRAND` | 5min |
| 4 | `src/pages/Login.tsx` (já parcialmente feito em MAI-21) | Trocar todos os "Hermes" hardcoded por `BRAND.*` | 10min |
| 5 | `src/pages/Landing.tsx`, `QueryWorkbench.tsx`, `Pipeline.tsx`, `Dashboard.tsx`, `Configure.tsx`, `ConsultaFiscal.tsx`, `EnriquecerCnpj.tsx`, `LeadLists.tsx` (8 arquivos com "Hermes" hardcoded) | Audit e migrar para `BRAND` | 1.5h |
| 6 | `index.html` `<title>` | "Pinn Outbound (Hermes)" | 2min |
| 7 | `public/manifest.json` (se existir) | name + short_name | 2min |
| 8 | `README.md` | Adicionar nota sobre nome interno vs visível | 5min |

**Estimativa total:** 2h dev.

**Não tocado nesta ADR:**
- URL/DNS (continua `hermes.*`) — decisão de infra separada
- Nome do repo (continua `PROJETO-HERMES`) — decisão de governança separada
- ClickUp space (continua "Pinn Outbound (Hermes)") — já tem ambos

## Pre-mortem

**6 meses depois — por que falhou?**

1. **Cliente continua confuso com 2 nomes no header** → re-decisão acelerada. *Mitigação:* config-driven permite drop em 5min.
2. **Time interno parou de chamar de "Hermes" e dropou alias antes da hora** → fica só "Pinn Outbound". *Mitigação:* aceitável — set `productAlias: null` no `brand.ts`.
3. **Lançou um Pinn Outbound 2.0 e Hermes virou versão antiga** → confusão de versão. *Mitigação:* improvável no horizonte de 6 meses.

## Quem precisa aprovar

- ✅ **CTO (Pedro Henrique)** — autor da ADR, owner da implementação
- ⏳ **CMO** — owner do brand voice, valida "Pinn Outbound" como nome público
- ⏳ **CDO** — valida apresentação visual do co-branding (header com nome + alias)
- ⏳ **CRO** — confirma que comms comerciais (deck, proposta) já dizem "Pinn Outbound"
- ⏳ **CEO (Renan)** — Type 1, decisão final

## Anti-silo

- **CFO:** custo desprezível (2h dev). Zero recorrência. Reversível em 5min via `brand.ts`.
- **COO:** ZERO retrabalho operacional. Não toca docs, contratos, processos.
- **CDO:** define apresentação visual do co-branding (peso, hierarquia, cor de alias).
