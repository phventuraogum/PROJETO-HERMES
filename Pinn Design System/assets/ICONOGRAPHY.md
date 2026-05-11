# Pinn — Iconography

## Approach
Premium B2B builder voice → **line-style only**, never filled. Restrained, geometric, low-decoration. Icons are wayfinding, not personality.

## Specs
- **Style:** line / outline (Lucide-grade). Never solid fills, never duotone.
- **Stroke:** 1.5px on 24×24 artboard (display 16–20px); 2px when scaled to 32px+.
- **Ends:** round caps (`stroke-linecap: round`).
- **Joins:** round joins (`stroke-linejoin: round`).
- **Corner radii (in glyphs):** 2–4px subtle rounding.
- **Color:**
  - Default → `--pinn-ink` (`#1A1A1A`).
  - Highlight / active → `--pinn-orange` (`#FF6B35`).
  - On dark surface → `#F2F2F2` default, orange highlight.
  - **Never** brand-orange + ink-blue together — a single accent at a time.

## Library
- **Primary: [Lucide Icons](https://lucide.dev)** — CDN-linked. The brand audit recommended Lucide or Phosphor; Lucide is the production default for this system.
  - CDN: `<script src="https://unpkg.com/lucide@latest"></script>` then `lucide.createIcons()`.
- **Secondary (per brandbook):** [Phosphor Icons](https://phosphoricons.com) — only used if Lucide is missing a glyph for a specific case. **Do not mix sets in one screen.**

## What we DON'T use
- ❌ **Emoji in formal material** (deck, site, brandbook, executive PDF, cold email). OK in LinkedIn posts (controlled, ≤1) and inside Pinn BAI UI for status badges.
- ❌ **AI clichés:** brain-with-circuits, neural-net mesh, robot heads, glowing nodes, "spark" icons, magic wands.
- ❌ **Filled / duotone icons.** Premium B2B is line.
- ❌ **3D / isometric** illustration.
- ❌ **Hand-drawn squiggle** UX-friendly icon style.
- ❌ **Unicode characters as icons** (✓ ★ ➤ → → →) inside formal material. Use a real Lucide glyph.

## Mapping (Lucide names) — common UI roles
| Role | Glyph |
|---|---|
| Anti-positioning checks | `x` (in `--pinn-error` for "não somos"), `check` (in `--pinn-success` for "somos") |
| Revenue OS / system | `cpu`, `layers`, `git-branch`, `workflow` |
| Demand / outbound | `radar`, `crosshair`, `send` |
| Qualification | `funnel`, `filter`, `target` |
| Conversion | `handshake`, `users` |
| Expansion | `arrow-up-right`, `trending-up` |
| Governance / dashboards | `gauge`, `bar-chart-3`, `line-chart` |
| Cases | `factory`, `building-2` |
| Schedule diagnóstico | `calendar-clock` |
| Email | `mail` |

## Logo as icon
The Pinn geometric mark (`assets/pinn-mark.svg`) functions as the favicon and as the avatar where a single glyph is needed. **Never** combine the mark with a Lucide icon at the same scale.

## Substitution flag
This system links to Lucide via CDN for live demos. **For production**, ask the team to either pin Lucide as a dependency (`npm i lucide` / `lucide-react`) or download the SVGs into `assets/icons/` so the brand isn't dependent on a third-party CDN.
