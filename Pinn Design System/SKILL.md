---
name: pinn-design
description: Use this skill to generate well-branded interfaces and assets for Pinn (Product Builder de Revenue OS para indústrias B2B brasileiras), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

# Pinn — Design Skill

Read `README.md` within this skill (it is the source of truth for company context, voice, visual foundations, and file manifest), then explore the other available files:

- `colors_and_type.css` — design tokens (CSS variables for color, type scale, spacing, radii, shadows, easing). Pull this in via `<link rel="stylesheet">` before doing anything visual.
- `assets/` — logo system (mark, wordmark, extended, lockup), source logo, and `ICONOGRAPHY.md`.
- `preview/` — small swatch / specimen / component cards. Open these to see the system at a glance.
- `ui_kits/pinnpb-site/` — Pinn marketing site recreation (light, premium B2B).
- `ui_kits/pinn-bai/` — Pinn BAI product surface (dark mode, the only Pinn surface in dark).
- `slides/` — 6-slide commercial deck template (1920×1080, deck-stage based).
- `uploads/` — original brandbook (`brandbook_extracted.txt`) and voice/tone doc (`voice_extracted.txt`). **The voice doc is the source of truth for any copy generated.**

## Non-negotiables (read before producing anything)

- **Brand name:** always `Pinn` (capital P, lowercase rest). Never `PINN`, `PINNPB`, `Pinn PB`. Sub-brands: `Pinn [Name]` — e.g. `Pinn BAI`, `Pinn Agent Sales`.
- **Tagline:** `Revenue OS.` (with closing period).
- **Slogan:** `Prospecção para máquinas. Fechamento para humanos.`
- **Anti-positioning is part of the product.** Show "não somos SaaS / agência / consultoria" prominently when the surface is commercial.
- **Voice:** cirúrgica, peer-level, builder. Never creator (`Bora?`, `Hoje quero falar sobre`), never sales-y (`transformamos sua empresa`), never legacy (`Revenue by design`, `SDR de IA`).
- **Color soul:** Pinn Orange `#FF6B35` is the only accent. Surfaces are paper-white (`#FFFFFF` / `#F6F4EF`) — except Pinn BAI, which is dark.
- **No emoji in formal material.** No AI-cliché iconography (brain-circuits, neural mesh).
- **Iconography:** Lucide line-style only, 1.5–2pt stroke. Never hand-roll SVG icons.
- **Type:** Inter (UI/digital), Arial (Word/PDF), JetBrains Mono (chrome / metric tags only). No serif.

## Usage

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out of this skill into the destination project and create static HTML files for the user to view. If working on production code, copy assets and read the rules in `README.md` to become an expert in designing with the Pinn brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design (deck slide? LinkedIn post? site section? Pinn BAI screen?), ask which Pinn SKU it serves (Agent Sales / BAI / Outbound / APA / MicroSaaS Studio / Bundle / Expansão), and act as an expert designer who outputs HTML artifacts *or* production code, depending on the need.

When in doubt about copy, default to one of the canonical anchor phrases (see README §2) — repetition builds recognition.
