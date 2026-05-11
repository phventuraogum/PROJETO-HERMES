# Pinn — Design System

> *"Receita previsível em B2B não é improviso. É arquitetura."*
> — Manifesto Pinn

This is the working design system for **Pinn** — Product Builder de **Revenue OS** para indústrias B2B brasileiras. It encodes the brand's verbal voice, visual foundations, logo system, and product UI into reusable tokens, components, and templates.

---

## 1 · Company Context

**Pinn** is a *Product Builder* — explicitly **not** SaaS, **not** an agency, **not** a consultancy. It designs, builds and operates a *Revenue Operating System* inside Brazilian B2B industrial companies (química, metalurgia, alimentícia, automotiva, têxtil, embalagem, eletroeletrônica, cosméticos), then leaves the customer with the machine running.

- **Category disputed:** Revenue OS (new in BR — 12-18 month window to own the term)
- **ICP:** Indústrias B2B, R$ 50M-R$ 300M revenue, ticket R$ 50k+, ciclo 30-180d, SP / BH
- **Buyer:** CRO / Diretor Comercial (primary) · CEO / Diretor-Geral (decisor)
- **Slogan:** *"Prospecção para máquinas. Fechamento para humanos."*
- **Tagline:** *"Revenue OS."*
- **Anti-positioning (parte do produto):** "Não somos SaaS. Não somos agência. Não somos consultoria."
- **Founder:** Renan Viglioni — 16 anos B2B brasileiro, background **operações + delivery** (não vendas).

### Architecture of brand — 7 SKUs
- **Pinn Agent Sales** — IA SDR operacional
- **Pinn BAI** — inteligência de dados B2B + dashboards (dark-mode product surface)
- **Pinn Outbound** — motor de demanda (wedge)
- **Pinn APA** — agentes de processos
- **Pinn MicroSaaS Studio** — verticais sob demanda
- **Bundle Agent Sales + BAI** — alvo principal de venda
- **Expansão de Conta**

### Channels (current state)
| Channel | URL | Status |
|---|---|---|
| Site | pinnpb.com | needs full refac (hero + cases + diagnóstico CTA) |
| LinkedIn Company | linkedin.com/company/pinnpb | needs new banner + tagline |
| LinkedIn Founder | linkedin.com/in/renanviglioni | active, founder-led |
| Pinn BAI | pinnbai.lovable.app | dark-mode SaaS (paleta laranja+dark) |
| Hermes (legacy) | hermescraper.com | architecture decision pending |

### Inputs read for this system
- `uploads/BRANDBOOK_PINN_v1.docx` → extracted: `uploads/brandbook_extracted.txt`
- `uploads/VOICE_TONE_PINN.docx` → extracted: `uploads/voice_extracted.txt`
- `uploads/Logo Pinn.jpeg` (640×640, black geometric mark on orange gradient) → `assets/logo-original.jpeg`
- Strategic brief from CMO (Revenue OS positioning, 7 SKUs, anti-positioning frases)

No codebase or Figma was supplied for Pinn BAI / pinnpb.com — UI kits in this system are inferred from brandbook directives + observed-channel descriptions, **and should be calibrated against the live products before production use.**

---

## 2 · Content Fundamentals

The Pinn voice is **"founder mostrando raciocínio em alta resolução"** — peer-level, executive, builder. Five non-negotiable attributes:

1. **Cirúrgica** — short sentences, hard consonants, no floreio. Affirms, never asks.
2. **Específica** — non-round numbers, proper nouns, absolute dates, real cases.
3. **Honest-direct** — vulnerability when it lands, anti-positioning when useful. No self-flagellation, no self-aggrandizement.
4. **Builder** — voice of someone who *operates*, not someone who sells. Theses come from observation.
5. **Peer-level** — "Eu vi" mais que "eu te ensino". Talks to people at the table, not followers.

### Casing & punctuation
- Headings: **Sentence case**, never ALL CAPS in body text. Eyebrows / metric labels in `UPPERCASE` with wide tracking are OK.
- "Pinn" is always **capitalised P, lowercase rest** (`Pinn`). Never `PINN`, never `PINNPB`, never `Pinn PB`.
- Sub-brands: `Pinn Agent Sales`, `Pinn BAI`, `Pinn Outbound`, `Pinn APA`. Always `Pinn [Name]`.
- Tagline punctuation matters: **`Revenue OS.`** with a closing period — final, declarative.
- Money: `R$ 50M`, `R$ 6.300`, `R$ 35k` — Brazilian convention, ALWAYS with the `R$ `.

### Pronouns & POV
- "**Construímos**" not "transformamos". Verbs of *operation*, not transformation.
- "**Vimos**" / "**vi**" not "acreditamos". Theses come from observation.
- Reader address: minimal "você" — peer-level register, never tutor / coach.
- "Eu" is OK in founder-led pieces (Renan-specific vulnerability).

### Anchor phrases (canonical — repeat to build recognition)
- `Prospecção para máquinas. Fechamento para humanos.` — slogan
- `Revenue OS.` — tagline
- `Foundation layer virou commodity.` — frase-tese de mercado
- `Não vendemos modelo. Construímos a operação.` — tese Pinn
- `Receita previsível em B2B não é improviso. É arquitetura.` — manifesto
- `Sistema é meu. Resultado é seu. Retorno é nosso.` — governança cliente
- `Builder, não vendedor.` — identidade

### Banned vocabulary (4 categories — `voice_extracted.txt` §3.2 has full list)
- **Legacy:** "SDR de IA Personalizado", "SaaS/MicroSaaS" como categoria, "Hermes/Sales Agent/BAI Outbound" (nomes legacy), "Revenue by design"
- **Genérico:** "Soluções de IA sob medida", "Automação inteligente", "Disruptivo", "Líder de mercado em…"
- **Creator:** "Hoje quero falar sobre", "Bora?", "Comenta aí", emoji em sequência, setas →→→
- **Vendedor:** "Transformamos sua empresa", "Nossa metodologia exclusiva", "Espero que esteja bem!"

### Emoji
- **Avoid in formal material** (deck, site, brandbook, executive PDF, cold email).
- **OK in moderation** in LinkedIn posts and inside product UI (Pinn BAI). 0–1 per piece — never sequences.
- **Never** as visual decoration in headlines, never to substitute for icons, never as bullet markers.

### Vibe — three keywords
**Premium, executive, builder.** Not startup-bro. Not corporate-grey. Not creator-vibrant.

### Worked example (do / don't, from voice doc §9)
> ❌ `DESCUBRA O FUTURO. Construa. Automatize. Otimize. Soluções personalizadas de IA…`
> ✅ `A maioria das empresas B2B compra IA. Construímos máquina de receita. Pinn é Product Builder de Revenue OS para indústrias B2B. Prospecção para máquinas. Fechamento para humanos.`

> ❌ `Sou Renan, founder da Pinn. Somos especialistas em soluções de IA sob medida...`
> ✅ `[Nome], vi que vocês contrataram 4 SDRs em 60 dias. Em indústrias do porte de vocês, o ramp-up de SDR é 4-6 meses... É gargalo de gente, ou de arquitetura?`

Full operational guide (10 situations, 10 antipatterns, 5-question checklist) is in `uploads/voice_extracted.txt`. **That document is the source of truth for any copy generated.**

---

## 3 · Visual Foundations

### Vibe & differentiation
The market (Driva, Cortex, Ramper) is azul-roxo / azul-corporativo. Pinn is **deliberately orange** — executive premium, warm, builder. The visual feel is: **lots of paper-white, generous space, hairline rules, one warm accent.** Not dashboards-with-everything. Not gradients-and-glow. **Premium B2B respira.**

### Color
- **Pinn Orange `#FF6B35`** — soul of the brand. Used for CTAs, links, key callouts, headlines accents. Never as a full background except in display contexts (slide hero, banner). Light surfaces are the rule.
- **Pinn Orange Dark `#E55A2B`** — hover, secondary accent, gradients into the primary.
- **Pinn Orange Light `#FFF3ED`** — wash background for callouts, ICP zones, emphasis blocks.
- **Pinn Ink `#1A1A1A`** — primary text. Premium B2B uses near-black, never `#000`.
- **Pinn Graphite `#555555`** — secondary text, captions.
- **Pinn Mute `#999999`** — tertiary, footnotes, watermarks.
- **Surface `#F6F4EF` / Paper `#FAF8F4`** — warm-off-white surfaces (proposed secondary palette additions; documents and section breaks).
- **Functional:** `#2E7D32` success · `#C62828` error · `#F57C00` warning.
- **Pinn Night `#0E0E0E` family** — exclusive to Pinn BAI product surfaces.

> ⚠️ **Secondary palette (sand `#E9E1D2`, clay `#D9C9B8`, steel `#2E3A40`, moss `#4A5A3F`)** is proposed by Claude Design — flag for validation. Intent: warm-cool quiet executive accents that don't compete with orange. See `colors_and_type.css`.

### Typography
- **Inter** — primary, **brand-supplied** (`fonts/Inter-VariableFont_opsz_wght.ttf` + italic, variable 100–900 / opsz 14–32). Tela-otimizada, premium B2B. Loaded via `@font-face` in `colors_and_type.css`.
- **JetBrains Mono** — sparse use for stat tags, metric labels, code-style anti-positioning chips. *(Claude Design substitution; flag if unwanted.)*
- **Arial** — Word/PDF/email universal fallback (per brandbook).
- **No serif.** Voice é tech-builder moderno, não publication editorial.

Scale (`colors_and_type.css`):
- Hero/display 60–80pt bold · H1 30–40 · H2 24–30 · H3 18–24 · Body 11–14 regular · Quote 16–24 italic.
- Tracking: tight (`-0.02em`) on hero/display; snug on H1/H2; uppercase eyebrow at `+0.08em`.

### Spacing & layout
- 8pt baseline. Section rhythm = 2-3× body size = `var(--sp-9)` 96px between sections.
- Margins in documents: ≥1in (2.5cm) — premium B2B respira.
- Text measure: 65–75 characters per line. CSS var `--measure-text: 42rem`.
- Logo protection area: 1× the height of the mark on all sides.
- Grid: 12-column, 24px gutter.

### Backgrounds
- **Default:** `#FFFFFF` for product / digital. `#F6F4EF` paper-warm for documents, slide bodies, deck backgrounds.
- **No gradients in product UI.** Allowed: subtle vertical gradient `--pinn-orange` → `--pinn-orange-dark` on hero blocks of the marketing site, and the original photographic gradient seen on the source logo.
- **No glassmorphism, no glow, no neon.** Premium executive ≠ tech-bro.
- **Patterns:** sparse — a hairline grid (`#E6E4E0` 1px) is acceptable as background texture for technical sections; never as decoration.

### Imagery
- Real industrial environments. Real people (Renan, team, clients with permission). Sober warm tones that pair with orange.
- **Avoid:** stock executives shaking hands, stock "diverse smiling team", brain-with-circuits AI imagery, generic neural-network visuals, oversaturated gradients.
- B&W or duotone (ink + warm wash) treatments are fine for portraits — they pair with the orange better than full-saturation colour photos.

### Borders, shadows, radii
- **Hairlines** `1px` `#E6E4E0` for everything structural. Strong borders only when the element must read as a button.
- **Shadows** are soft, low-key, executive — see `--sh-1`, `--sh-2`, `--sh-3` in `colors_and_type.css`. No deep dropshadows. There is a single accent shadow `--sh-orange` reserved for the primary CTA button only.
- **Radii** are restrained: `2/4/8/12px`. Pills (`999px`) only for tags / chips, never on buttons. Cards = `8px` (`--r-3`). Hero / modal = `20px` max.

### Hover & press states
- **Buttons:** background goes `var(--pinn-orange)` → `var(--pinn-orange-dark)` (hover) on the primary; secondary buttons darken the border to ink. Press = `transform: scale(0.98)` for ~80ms.
- **Links:** colour does not change on hover (already orange) — instead, a 1px underline appears.
- **Cards:** lift `translateY(-2px)` + shadow steps from `--sh-1` to `--sh-2`.
- **Opacity:** never below 0.55 on inactive UI; muted text uses dedicated `--fg-3` colour, not opacity.

### Motion
- **Easing:** `cubic-bezier(.2,.7,.2,1)` (ease) and `cubic-bezier(.16,1,.3,1)` (ease-out).
- **Durations:** 120ms (micro), 200ms (default), 360ms (page transitions).
- **No bounces. No springy overshoot.** Voice é cirúrgica — motion is, too.
- Fades, restrained translates (≤8px), and width / opacity transitions only.

### Transparency & blur
- **Transparency:** ink-on-paper. Use `rgba(26,26,26, .04 / .06 / .08)` for hairlines and shadow tints — never as a decorative effect.
- **Blur:** sparingly, only for sticky nav backdrop (`backdrop-filter: blur(12px) saturate(1.1)` on `rgba(255,255,255,0.72)`). Not on cards. Not on heroes.

### Capsules vs protection gradients
Pinn does **not** use protection gradients (those bottom-of-image dark gradients used to legibilize white text over a photo). Instead we use **capsules**: the text sits on a small `--pinn-orange-light` or `--pinn-paper` block, with a hairline divider, anchored to one corner of the image. Cleaner, more architectural, less marketing-deck.

### Fixed elements (layout rules)
- Site nav: sticky top, hairline rule on scroll, height 64px desktop / 56px mobile, blur backdrop.
- Slide deck: page-number + tagline `Revenue OS.` always bottom-right, mute (`--fg-3`).
- Email signature: 4 lines max, mono only on the URL.

---

## 4 · Iconography

See full notes in `assets/ICONOGRAPHY.md` (written below).

**TL;DR:** line-style only, 1.5–2pt stroke, 24px artboard, rounded ends, `--pinn-ink` by default with `--pinn-orange` reserved for highlight icons. Library: **Lucide Icons** (CDN-linked). Phosphor is the brandbook's secondary recommendation. **No emoji in formal material. No "AI cliché" iconography** (brain-with-circuits, neural net mesh, robot heads).

---

## 5 · Files in this system (manifest)

```
/
├── README.md                       ← this file
├── SKILL.md                        ← agent skill manifest (cross-compatible w/ Claude Code)
├── colors_and_type.css             ← design tokens (CSS vars)
├── assets/
│   ├── logo-original.jpeg          ← source logo (640×640, JPEG)
│   ├── pinn-mark.svg               ← geometric mark, recreated as vector
│   ├── pinn-wordmark.svg           ← "Pinn" wordmark
│   ├── pinn-wordmark-extended.svg  ← "Pinn Product Builder"
│   ├── pinn-lockup-tagline.svg     ← "Pinn / Revenue OS." vertical lockup
│   └── ICONOGRAPHY.md              ← iconography rules
├── preview/                        ← design-system cards (rendered in DS tab)
├── ui_kits/
│   ├── pinnpb-site/                ← marketing site UI kit (pinnpb.com)
│   └── pinn-bai/                   ← Pinn BAI dashboard kit (dark mode)
├── slides/                         ← deck templates (1920×1080)
└── uploads/                        ← raw inputs (brandbook, voice doc, source logo)
```

### UI kits available
- **`ui_kits/pinnpb-site/`** — marketing site recreation. Hero, anti-positioning blocks, ICP / Revenue OS explainer, cases, diagnóstico CTA, footer.
- **`ui_kits/pinn-bai/`** — Pinn BAI product surface (dark mode). Login, dashboard, ICP filter, account drilldown, weekly ata template.

### Slides available
- `slides/index.html` (deck index) + per-slide JSX components (capa, problema, tese, produto, caso, investimento, próximos passos, encerramento).

---

## 6 · Caveats & open questions

1. **No live access** to pinnpb.com or pinnbai.lovable.app source — UI kits are inferred from brandbook descriptions and channel references. Calibrate against live products before shipping production code.
2. **Logo mark recreation:** the source `Logo Pinn.jpeg` is a raster (640×640). I recreated the geometric mark as SVG by tracing visually — proportions are approximate. **Recommend asking a designer to provide a vector master,** as the brandbook itself flags (Parte IV, footnote: "contratar designer profissional pra formalizar logo").
3. **Secondary palette** (clay / sand / steel / moss) is a *proposal* by Claude Design. Validate before locking.
4. **Typography v2** — brandbook is open to Söhne / Neue Haas / GT America for premium feel. Inter is the v1 lock and is licensed-free; the others are paid licenses.
5. **Hermes architecture** is undecided in the brandbook — UI kits don't include a Hermes surface yet.
6. **Image library:** the brandbook calls for real photography (Renan, team, clients). I've used neutral placeholder blocks (`--pinn-clay`, `--pinn-paper`) where photos belong. **Do not ship without real photo assets.**

---

*This system is governed under CMO Pinn PB. Última atualização do brandbook fonte: maio/2026 · v1.0.*

> *"Revenue OS."*
