# Jackdaw brand assets

The marks for **Jackdaw** — this repo's web and desktop clients, and the
Jackdaw mobile app. **This directory is the source of truth**: take the mark
from here rather than exporting a fresh one or copying one you found elsewhere
in the tree.

Mantle's own marks are a different brand and live in [`../brand-mantle/`](../brand-mantle/).

`dark` and `light` name the **background the mark is drawn for**, not the mark's
own colour. The `dark` variants are cream and belong on a dark ground; the
`light` variants are dark brown and belong on a pale one.

## The current mark — `redesign/`

The illustrated jackdaw in a ringed circle, from 2026-08-12. **This is the
current brand** and supersedes the flat SVG marks below. It is what
`client/web` serves from `public/brand/`, what the desktop app uses as its
icon, and what Jackdaw mobile generates its app icon and launch screen from.

| file | what it is |
|---|---|
| `redesign/jackdaw-icon-logo-{dark,light}-trans.png` | The badge alone |
| `redesign/jackdaw-name-logo-{dark,light}-trans.png` | The wordmark alone |
| `redesign/jackdaw-icon-name-logo-{dark,light}-row-trans.png` | Horizontal lockup |
| `redesign/jackdaw-icon-name-logo-{dark,light}-trans.png` | Stacked lockup |
| `redesign/jackdaw-redesign.afpalette` | The Affinity palette |

### Colours

| swatch | hex | where it comes from |
|---|---|---|
| Brand brown | `#2D1500` | the ring of the light-background badge; the darkest swatch in the palette |
| Brand cream | `#FDE7BC` | the ring and wordmark of the dark variants (the wordmark is 100% this one colour) |

### ⚠️ The badge's cream field is semi-transparent

Only about **32% opaque**. The artwork was drawn against a light page, so
compositing it straight onto the brand brown turns the interior a muddy olive.
It looks correct in any image viewer — which shows it on white — and wrong in
the app, which is what makes this worth writing down.

Anywhere the badge goes onto a dark ground, slide an opaque `#FDE7BC` disc
under it first, inset ~1.5% so the disc edge hides beneath the cream ring.
Both consumers already do this: `client/desktop/README.md` carries the
ImageMagick recipe, and Jackdaw mobile does it in `tool/generate_app_icon.dart`.

## The earlier flat marks — `jackdaw-*.svg`

From 2026-08-10/11, a bolder minimal jackdaw head. **Superseded** by the
redesign; kept because they are true vectors and still useful where a flat
single-colour mark is wanted (a favicon, a monochrome print, a stencil).

| file | what it is |
|---|---|
| `jackdaw-icon-{dark,light}.svg` | Square 1024² icon mark |
| `jackdaw-logo-{dark,light}.svg` | Wordmark |
| `jackdaw-icon-logo-{dark,light}.svg` | Horizontal lockup |

## Don't

- Don't composite the redesign badge onto a dark ground without the disc above.
- Don't stretch, rotate, or add effects to the mark.
- Don't rebuild the wordmark by setting type — it's custom lettering, not a font.
- Don't re-export a raster from a raster.
