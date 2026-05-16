# olaf — brand kit

The canonical brand definition for the **olaf** platform. Anything visual on
olaf.events, in the PWA, in transactional email, or in marketing material
follows this kit.

## What's in here

| Path                         | What it is                                                  |
| ---------------------------- | ----------------------------------------------------------- |
| `brand-manual.html`          | Full brand manual — open in a browser, print to PDF.       |
| `assets/mark.svg`            | The mark on a light surface (ink ring + amber sun).         |
| `assets/mark-on-dark.svg`    | The mark for dark backgrounds (white ring + amber sun).     |
| `assets/mark-on-amber.svg`   | The mark on amber — sun merges into the ring (§09).         |
| `assets/lockup-horizontal.svg` | Mark + lowercase wordmark in one file.                    |
| `assets/app-icon-512.svg`    | Canonical home-screen squircle, vector source.              |
| `assets/icon-*.png`          | Rasterised app icons at all standard sizes (1024, 512, 192, 180, 32). |
| `assets/icon-512-light.png`  | Light-variant app icon for marketing.                       |
| `assets/icon-512-amber.png`  | Amber-variant app icon for marketing / promo art.           |

## The mark — at a glance

The mark is **B · Sunrise**: a two-peak horizon inside an open black ring,
with an amber sun cresting over the higher peak. Built from one circle, one
polyline, and one filled dot — no gradients, no textures.

Geometry (100×100 grid):

```svg
<svg viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor"
          stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="64" cy="34" r="6.5" fill="#ffc719"/>
  <polyline points="22,68 38,48 47,58 62,38 78,68"
            fill="none" stroke="currentColor" stroke-width="6"
            stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

In React/Next, do not re-implement this — use the `<Logo />` component from
`apps/web/components/ui/logo.tsx`. It already encodes the geometry, the
`currentColor` handling, and the amber sun.

## Colour tokens

These match `apps/web/app/globals.css`. If you ever need to tune them, change
them there — the rest of the system flows through CSS variables.

| Token             | Hex     | Use                                        |
| ----------------- | ------- | ------------------------------------------ |
| `--brand-ink` *   | #000000 | Body text, strokes, primary dark surface   |
| `--canvas`        | #ffffff | Light background                            |
| `--brand`         | #ffc719 | Accent (CTAs, highlight, sun in the mark)  |
| `--border`        | #dcdcdc | Borders, dividers                          |

\* `--brand-ink` is the text colour used on top of the amber background.
White fails WCAG contrast on #ffc719; black is AAA.

## Typography

**Geist Sans** (UI + prose) and **Geist Mono** (labels, code, timestamps).
Both already wired in `apps/web/app/layout.tsx`. No third typeface.

## Voice — in one line

Plain. Direct. A little wry. Specific times, places, distances. Never corporate.

Read §11 of the brand manual for full guidance and examples.

## Rebrand discipline

This kit is the source of truth. If a future surface needs a colour, a
typeface, or a logo treatment that isn't here:

1. First ask whether the surface actually needs it.
2. If yes, update the brand manual *first*, then ship the change.

The manual is short on purpose. Keep it that way.
