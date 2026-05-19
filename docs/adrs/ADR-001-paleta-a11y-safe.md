# ADR-001 · Paleta a11y-safe sem violar o Pinn Design System

**Status:** RASCUNHO — aguarda decisão Mesa Executiva (CDO + CMO + CTO)
**Data:** 2026-05-19
**Owner técnico:** Pedro Henrique (CTO Pinn PB)
**Tickets ClickUp:** MAI-01 `86ahbj9zc` · destrava MAI-06, MAI-12, MAI-13, MAI-17, MAI-23 e ÉPICO P4
**Tipo:** Type 1 (irreversível em escala) — afeta marca + acessibilidade legal (LGPD/LBI Brasil)

---

## Contexto

O Pinn Design System v1.0 (Maio/2026, fonte canônica em `G:\PROJETO-HERMES\Pinn Design System\`) define **`#FF6B35` como a única cor de marca (single-accent)**. Hermes é produto da família Pinn BAI e adopta o DS integralmente (memória: `hermes_design_system.md`).

Auditoria a11y dos tokens atuais (referenciada em MAI-12 e MAI-13) detectou:
- **Item ativo do menu** (MAI-12 `86ahbjagj`): foreground = background → contrast ratio **1.00** (invisível).
- **Footer dark** (MAI-13 `86ahbjajf`): "Pinn Admin" preto sobre preto → ratio **1.06**.
- **Orange `#FF6B35` sobre `#FAF8F4` (paper)**: ratio **2.91** — **falha AA** (mínimo 4.5 para texto normal).
- **Orange `#FF6B35` sobre `#FFFFFF`**: ratio **3.07** — falha AA texto, passa AA large text (3.0).

O orange canônico do DS **não passa WCAG 2.1 AA para texto pequeno**. Esta é a contradição que MAI-01 tem que resolver sem queimar a identidade.

## Problema

Dois objetivos legítimos colidem:

1. **CDO/CMO:** o orange `#FF6B35` é a alma da marca (`pinn_ds_canonical.md`). Trocar = perda de identidade compartilhada com Pinn BAI e site. Reabre disputa de marca em meio à beachhead 2026 (indústrias SP/BH).
2. **CTO/legal:** Hermes vende para indústrias B2B R$50M+ que têm exigência de acessibilidade (LBI nº 13.146/2015, Decreto 9.094/2017, ABNT NBR 17225). Texto em ratio 2.91 é juridicamente fora do padrão. Cliente que rode auditoria recusa o produto.

## Opções consideradas

### Opção A · Trocar `#FF6B35` por orange escuro mainline (ex: `#B8431F`)
- **Pró:** WCAG AA passa (ratio 4.92 vs paper, 5.42 vs white). Resolve tudo de uma vez.
- **Contra:** **Quebra identidade DS**. Pinn BAI continua com `#FF6B35`. Site marketing também. Hermes fica visualmente "fora da família". Trabalho de re-padronização cross-produto (MAI-20) volta a zero.
- **Veredicto:** **Não recomendado.** Resolve a11y mas detona o DS.

### Opção B · Manter `#FF6B35` apenas como cor de **superfície/fundo/borda**, nunca em texto pequeno
- **Pró:** Identidade preservada. CTA primário continua `#FF6B35` (`btn-cta` em `index.css:566`).
- **Contra:** Restringe uso real do orange. Eyebrow uppercase (`.pinn-eyebrow` em `index.css:373`) atualmente usa `color: hsl(var(--primary))` — teria que migrar para `--pinn-orange-700` (`#B8431F`).
- **Veredicto:** Possível, mas restritivo.

### Opção C · Token semântico duplo · **RECOMENDADO**

Separar **brand orange** (identidade visual, surfaces, CTA, decorativo) de **interactive orange** (texto, links, focus, qualquer foreground sobre background claro).

```css
/* Pinn DS canônico — INALTERADO */
--pinn-orange:       #FF6B35;   /* alma da marca · surfaces, CTA, decorativo */
--pinn-orange-light: #FFF3ED;   /* wash, accent surface */

/* a11y-safe variants — para foreground sobre paper/white */
--pinn-orange-700:   #B8431F;   /* AA contra paper (5.42) e white (5.42) — JÁ EXISTE em index.css:41 */
--pinn-orange-ink:   #8A3217;   /* AAA grande, AA pequeno garantido */

/* Tokens shadcn passam a apontar pra variant correta conforme uso */
--primary:               16 100% 60%;  /* #FF6B35 — fica para bg/CTA */
--primary-foreground:    0 0% 100%;
--accent-foreground:     16 100% 42%;  /* já é #B8431F — JÁ está correto */
```

Regra de aplicação:
- `bg-primary` / `btn-cta` / `--sh-orange` → continua `#FF6B35` ✓
- Texto/link/eyebrow/ícone-com-significado sobre paper/white → migra para `text-pinn-orange-700`
- Texto sobre night (dark mode) → orange original passa (ratio ~6 contra `#0E0E0E`) ✓

- **Pró:** Zero violação de marca. Zero discordância DS. Resolve WCAG AA. Funciona em light e dark. Aplicação é mecânica (find/replace por intent).
- **Contra:** Exige disciplina de uso. Pinn BAI vai ter que adotar o mesmo padrão pra coerência cross-produto — abre conversa com Renan.
- **Veredicto:** **Recomendado.** Preserva DS canônico, resolve a11y, pinta caminho claro para BAI.

## Decisão recomendada

**Opção C · Token semântico duplo.**

## Plano de implementação (se aprovado)

| Step | Arquivo | Mudança | Ticket |
|------|---------|---------|--------|
| 1 | `src/index.css` | Adicionar comentário canônico sobre uso brand vs interactive | MAI-06 |
| 2 | `src/index.css` | Trocar `.pinn-eyebrow` color de `--primary` para `--pinn-orange-700` em light | MAI-06 |
| 3 | `src/index.css` | Verificar todas as 47 ocorrências de `hsl(var(--primary))` como `color` (não `background`) → migrar para orange-700 onde for foreground sobre paper | MAI-06 |
| 4 | `src/components/layout/Sidebar.tsx` | Item ativo: ajustar `--sidebar-accent-foreground` (já é `#B8431F`) e garantir bg = wash, fg = orange-700 | MAI-12 |
| 5 | `src/components/layout/Footer.tsx` (a confirmar) | "Pinn Admin" não pode usar `--foreground` sobre `--background` quando ambos são dark | MAI-13 |
| 6 | Adicionar lighthouse-ci ao GitHub Actions para gate WCAG futuro | — | follow-up |

## Pre-mortem

**6 meses depois — por que falhou?**

1. **Time aplicou `text-pinn-orange` (brand) em texto novo** → contraste volta a falhar. *Mitigação:* lint rule que bloqueia `color: var(--pinn-orange)` em CSS de componente.
2. **Pinn BAI não adota o padrão** → divergência entre produtos. *Mitigação:* Renan + CDO levam o token semântico ao BAI no próximo Sprint de DS.
3. **Site marketing entra na briga** → reabre decisão. *Mitigação:* site é hero/marketing onde large text passa AA (3.0) já hoje, fora do escopo desta ADR. Manter no roadmap CDO.

## Quem precisa aprovar

- ✅ **CTO (Pedro Henrique)** — autor da ADR
- ⏳ **CDO** — owner do DS canônico, valida que Opção C não viola single-accent
- ⏳ **CMO** — valida que mensagem de marca não muda
- ⏳ **CEO (Renan)** — Type 1, decisão final

## Anti-silo

- **CFO:** custo de implementação ≈ 1.5 dias dev (1 pessoa). Sem custo recorrente.
- **CRO:** zero impacto comercial; cliente B2B vê produto **mais credível** (audita o estilo).
- **COO:** zero impacto operacional.
