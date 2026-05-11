# Pinn — Slide Templates

Sample 6-slide commercial deck demonstrating the Pinn slide system. Open `index.html`.

## Slide types covered
- **01 Cover** (`CoverSlide`) — eyebrow + bold display headline + 3-column meta strip + chrome
- **02 Big quote / tese** (`QuoteSlide`) — surface bg, anchor-phrase format with orange-accent emphasis
- **03 Problem stats** (`StatsSlide`) — h-title + 3 oversized numbers (Pinn Orange) + small source caption
- **04 Comparison** (`CompareSlide`) — anti-positioning two-column (neg = soft red, pos = ink + orange bullets)
- **05 Product / Revenue OS** (`ProductSlide`) — five-column dimensional grid, mono numbering
- **06 Closing CTA** (`CloseSlide`) — full-bleed Pinn Orange, oversized headline + two card slots

## System rules
- 1920×1080, 96/120 padding
- Top + bottom chrome rails (mono, slide counter, confidential mark)
- Two background tones: white (default) and `surface` (#FAF7F2). Solid orange or ink reserved for cover/closing/breakers.
- Display text scales from 64pt (h-title) → 96pt (quote) → 156pt (closing).
- Mono is reserved for chrome, eyebrows, sources, slide numbers — never body.
- Every slide has the Pinn mark in the top-left chrome.

## Adding a slide
Add another `<section class="slide [variant]" data-screen-label="NN Title">` inside `<deck-stage>`. Variants: none (white), `.surface`, `.dark`, `.orange`. Reuse classes documented above.
