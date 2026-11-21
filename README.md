# EFN lower thirds

EFN's on-air lower thirds, rebuilt as resolution-independent SVG for the [OGraf](https://github.com/ebu/ograf) standard. They replace the current Flowics graphic.

The plates (shape, slant, corner rounding, rims, gradients, glint, logos, wordmarks) are replicated to pixel level against the Flowics original. The renderer runs in the browser, so plates can be sized from their text at runtime. The remaining work is turning this into the final OGraf graphics: text fitting rules, animations, states and data.

## Contents

| Path | What |
|---|---|
| `src/lower-third.js` | **The renderer.** An ES module with no file-system or DOM access, so it runs in the browser and in Node. It turns the registry into SVG markup: plates (fill, rims, glint, silhouette), the EFN logo, wordmarks and the full lower third. |
| `lib/roundedSkewedCardPathUniform.js` | **Slant and corner-rounding tool.** Builds the SVG path of a plate with slanted sides and uniformly rounded corners at any width. |
| `demo/` | Browser demo: the renderer running live, with name, title, logo box, ticker page, clock and date controls and text-driven plate sizing. |
| `scripts/build-svgs.js` | Writes every plate and a full lower-third preview to `dist/` using the renderer. |
| `scripts/serve.js` | Zero-dependency static server for the demo. |
| `data/element-registry.json` | **Source of truth.** One entry per component (`name-plate`, `title-plate`, `logo-box` + 8 variants, `ticker-plate` + 6 variants, ticker column / value box / ramp, `location-plate`, logo line, …), with shape parameters, rims, fill, glint, text slots, layout rules and the Flowics graphics each one replaces. |
| `data/design-tokens.json` | Shared values: shape, fills, rim model, typography, animation timings, states, data feed, rendering. |
| `data/samples/ticker-payload.json` | Sample of the ticker data feed. |
| `docs/design-spec.md` | The design rules in prose: layout, shape, rims, fills, glint, ticker, logos, text, animation, data, rendering. **Read this first.** |
| `reference/flowics/` | The Flowics original as data, for the animation and state work: `layout-spec.json` (every overlay and element in 1920×1080 px, with styles, bindings, in/out and update animations), `layout-outline.txt` (readable outline), `animation-presets.json` (the 37 GSAP presets). |
| `assets/fonts/` | AkkuratStd 400 / 400i / 700 (woff). Licensed font. |
| `assets/logos/EFN_logo.svg` | EFN logo. |
| `assets/wordmarks/` | Programme wordmarks supplied by EFN: Börslunch, Direkt, Morgon, Råvaror, Nobel. `manifest.json` keeps the original filenames. |

Needs Node 18 or later. There are no dependencies and no bundler; the code is plain ES modules.

## Demo

```bash
npm run demo
```

Then open http://127.0.0.1:8765/demo/. To use another port, run `node scripts/serve.js 9000`.

Type a name or title and the plates resize with the text, measured in the real AkkuratStd font. The title chains onto the name plate at the parallel slant, and the ticker re-chains after whichever logo box you pick. Untick "Size plates from the text" to see the fixed Flowics widths.

## Using the renderer

```js
import { createRenderer } from './src/lower-third.js';

// Load these however your runtime does: fetch() in a graphic, fs in Node.
const r = createRenderer({
  registry,        // data/element-registry.json
  tokens,          // data/design-tokens.json
  efnLogoSvg,      // text of assets/logos/EFN_logo.svg
  wordmarks,       // { borslunch: '<svg…', direkt: '<svg…', … } from assets/wordmarks
  idPrefix: 'lt-', // keeps SVG ids unique when several SVGs share one HTML document
});

// The full lower third as one fluid SVG document (fills its container at any resolution)
const ctx = document.createElement('canvas').getContext('2d');
const measureText = (text, { weight, sizePx }) => { ctx.font = `${weight} ${sizePx}px AkkuratStd`; return ctx.measureText(text).width; };
el.innerHTML = r.composite(
  { name: 'Namn Efternamn', title: 'EFN', logo: 'borslunch', page: tickerRows, clock: '16:24', date: '9 nov 2026' },
  { measureText, fontsUrl: null },   // fontsUrl: null when the page already loads AkkuratStd
);

// Or a single plate at any width, for your own layout
const defs = [];
const markup = r.plate(r.comp('title-plate'), r.titleWidth(textWidth), x, y, { defs });
const svg = r.svgDocument(1920, 1080, defs, markup, { fluid: true });
```

Other exports:
- `elements()`: every plate at its Flowics size.
- `namePlateWidth()` / `titleWidth()`: the sizing rules.
- `efnLogo()`, `wordmark()`, `logoFilters`.
- Geometry helpers: `geom()`, `shapePath()`, `cornerGeom()`, `slantOffset()`.

The name plate's growth rule (`namePlateWidth`) is provisional; see the design spec.

## Build static SVGs

```bash
npm run build
```

This writes `dist/` (not committed):

- `dist/elements/<component>[--variant].svg`: each plate at its Flowics size, without text.
- `dist/preview/on-air-capture.svg`: the full lower third with sample content.

To render the preview with your own content:

```bash
node scripts/build-svgs.js --data my-content.json --name my-preview
```

`my-content.json` takes the same `content` fields as `composite()`. Node has no text measurement, so the plates keep their Flowics widths there.

Render SVGs at **3840×2160 and downscale to 1080p**: the rims are half-pixel layers at 1080p, so this matches the original best.

## The slant and rounding tool

```js
import { roundedSkewedCardPathUniform, cardCorners } from './lib/roundedSkewedCardPathUniform.js';

// A name plate 640 px wide, with the registry's shape parameters
const d = roundedSkewedCardPathUniform({
  width: 640, height: 70.16, skewDeg: 8.45, position: 'left', radius: 5.3, angleComp: 1,
});
// -> SVG path data, drawn from (0, 0)
```

- `position` sets which sides are slanted:
  - `left`: first plate in a row (slanted right edge)
  - `middle`: a plate in between (both edges slanted)
  - `right`: last plate in a row (slanted left edge)
  - `none`: no slant
- Neighbouring slanted edges stay parallel at any width.
- To match the original exactly, place the shape inside the component box with the registry's `insetTop`, `slantOutsetPx` and `straightInsetPx` (`geom()` / `shapePath()` in `src/lower-third.js` do this).
- `cardCorners()` returns the four corner points.

## Next steps

- **OGraf packaging:** wrap `createRenderer` in the OGraf graphic web component, with its manifest, data schema, and load / update / play / stop.
- **Text fitting:** decide the final name-plate rule (grow with the text, as in the demo, or shrink the text as Flowics does). See the design spec.
- **Animations and states:** from `reference/flowics/` and the `animation` and `states` tokens.
- **Missing wordmarks:** BÖRSFRUKOST, MARKNAD and UPDATE haven't been supplied, so those logo boxes are plate-only.
- **Glint timing:** start each plate's 15 s glint loop when the plate is taken in.

## Provenance

Every value was measured on the Flowics graphic "Ny skylt" (its 2× plate videos and masks) and checked against the live output. The full lower third differs by a mean of 3.2–3.8 out of 255.

The measurement tools, source captures and comparison renders are kept outside this repository, in the reconstruction workspace (`LowerThird_Reconstruct`).
