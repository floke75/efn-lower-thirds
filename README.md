# EFN lower thirds

EFN's on-air lower thirds, rebuilt as resolution-independent SVG for the [OGraf](https://github.com/ebu/ograf) standard. They replace the current Flowics graphic.

The plates (shape, slant, corner rounding, rims, gradients, glint, logos, wordmarks) are replicated to pixel level against the Flowics original. The remaining work is turning them into the final OGraf graphics: responsive text fitting, animations, states and data.

## Contents

| Path | What |
|---|---|
| `lib/roundedSkewedCardPathUniform.js` | **Slant and corner-rounding tool.** Builds the SVG path of a plate with slanted sides and uniformly rounded corners at any width. |
| `scripts/build-svgs.js` | Builds every plate and a full lower-third preview from the data below. Contains the renderer for rims (`rimRings`), fills, glint, logo filters and wordmark placement. |
| `data/element-registry.json` | **Source of truth.** One entry per component (`name-plate`, `title-plate`, `logo-box` + 8 variants, `ticker-plate` + 6 variants, ticker column / value box / ramp, `location-plate`, logo line, …), with shape parameters, rims, fill, glint, text slots, layout rules and the Flowics graphics each one replaces. |
| `data/design-tokens.json` | Shared values: shape, fills, rim model, typography, animation timings, states, data feed, rendering. |
| `data/samples/ticker-payload.json` | Sample of the ticker data feed. |
| `docs/design-spec.md` | The design rules in prose: layout, shape, rims, fills, glint, ticker, logos, text, animation, data, rendering. **Read this first.** |
| `reference/flowics/` | The Flowics original as data, for the animation and state work: `layout-spec.json` (every overlay and element in 1920×1080 px, with styles, bindings, in/out and update animations), `layout-outline.txt` (readable outline), `animation-presets.json` (the 37 GSAP presets). |
| `assets/fonts/` | AkkuratStd 400 / 400i / 700 (woff). Licensed font. |
| `assets/logos/EFN_logo.svg` | EFN logo. |
| `assets/wordmarks/` | Programme wordmarks supplied by EFN: Börslunch, Direkt, Morgon, Råvaror, Nobel. `manifest.json` keeps the original filenames. |

## Build

Needs Node 18 or later; there are no dependencies.

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

`my-content.json` is `{ "clock": "16:24", "date": "9 nov 2026", "page": [4 ticker rows] }`, with rows shaped like the ones in `data/samples/ticker-payload.json`.

The preview SVG has no fixed size. Render it at **3840×2160 and downscale to 1080p**: the rims are half-pixel layers at 1080p, so this matches the original best.

## The slant and rounding tool

```js
const { roundedSkewedCardPathUniform } = require('./lib/roundedSkewedCardPathUniform.js');

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
- To match the original exactly, place the shape inside the component box with the registry's `insetTop`, `slantOutsetPx` and `straightInsetPx` (see `geom()` in `scripts/build-svgs.js`).
- `cardCorners()` returns the four corner points.

## Next steps

- **Runtime plate builder:** `scripts/build-svgs.js` runs in Node and reads files from disk. Responsive OGraf graphics size their plates from the text at runtime, so its shape, rim, fill and glint functions need to move into a browser module.
- **Text fitting:** name and title fitting rules, and the chaining rule (each plate starts 4.5 px into the previous box). See the design spec.
- **Animations and states:** from `reference/flowics/` and the `animation` and `states` tokens.
- **Missing wordmarks:** BÖRSFRUKOST, MARKNAD and UPDATE haven't been supplied, so those logo boxes are plate-only.
- **Glint timing:** start each plate's 15 s glint loop when the plate is taken in.

## Provenance

Every value was measured on the Flowics graphic "Ny skylt" (its 2× plate videos and masks) and checked against the live output. The full lower third differs by a mean of 3.2–3.8 out of 255.

The measurement tools, source captures and comparison renders are kept outside this repository, in the reconstruction workspace (`LowerThird_Reconstruct`).
