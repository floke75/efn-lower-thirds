# EFN lower thirds

EFN's on-air lower thirds, rebuilt as resolution-independent SVG for the [OGraf](https://github.com/ebu/ograf) standard. They replace the current Flowics graphic.

The plates (shape, slant, corner rounding, rims, gradients, glint, logos, wordmarks) are replicated to pixel level against the Flowics original. The package renders them in any browser or in Node, sized from their text at runtime. The remaining work is turning this into the final OGraf graphics: text fitting rules, animations, states and data.

## Use it in an app

The repository is an installable package: plain ES modules, no dependencies, no build step, with TypeScript declarations.

```bash
npm install github:floke75/efn-lower-thirds#v0.2.0
```

The repository is private, so the machine running the install needs GitHub access to it (for example, signed in with `gh auth login`). Pin a tag, and bump it to take an update.

```js
import { createLowerThird, loadFonts, browserMeasureText, sampleTickerPayload } from 'efn-lower-thirds';

await loadFonts();                                   // registers AkkuratStd from the package (browser)
const lt = createLowerThird({ idPrefix: 'lt-' });    // registry, tokens, EFN logo and wordmarks are built in

el.innerHTML = lt.composite(
  { name: 'Namn Efternamn', title: 'EFN', logo: 'borslunch', page: sampleTickerPayload.data.open[0], clock: '16:24', date: '9 nov 2026' },
  { measureText: browserMeasureText(), fontsUrl: null },   // plates sized from the text; fonts come from loadFonts()
);
```

- **`composite()`** returns one fluid SVG document (no fixed size; it fills its container). Give the container a 16:9 box.
- **Without `measureText`** (for example in Node) the plates keep their Flowics widths.
- **`idPrefix`** keeps SVG ids unique when several lower thirds share one HTML page.
- **Your own layout:** build single plates and wrap them yourself:

  ```js
  const defs = [];
  const body = lt.plate(lt.comp('title-plate'), lt.titleWidth(textWidth), x, y, { defs });
  const svg = lt.svgDocument(1920, 1080, defs, body, { fluid: true });
  ```

- **Other exports:**
  - `elements()`: every plate at its Flowics size
  - `namePlateWidth()` / `titleWidth()`: the sizing rules
  - `efnLogo()`, `wordmark()`, `logoFilters`
  - geometry helpers: `geom()`, `shapePath()`, `cornerGeom()`, `slantOffset()`
  - the built-in `registry`, `tokens`, `wordmarks`, `efnLogoSvg`
- **Bundlers:** fonts are resolved with `new URL(..., import.meta.url)`, which works with native ES modules, Vite and webpack 5. You can also serve `efn-lower-thirds/assets/fonts/*` yourself and use your own `@font-face`.

**Entry points:**

| Import | What |
|---|---|
| `efn-lower-thirds` | Everything above. Includes the built-in data (about 135 KB). |
| `efn-lower-thirds/renderer` | `createRenderer({ registry, tokens, efnLogoSvg, wordmarks })` only, for bringing your own (e.g. edited) data. |
| `efn-lower-thirds/geometry` | Just the slant and corner-rounding functions. |
| `efn-lower-thirds/data/*`, `efn-lower-thirds/assets/*` | The raw JSON, fonts, logo and wordmark files. |

The name plate's growth rule (`namePlateWidth`) is provisional; see the design spec.

Instead of npm you can add the repository as a git submodule and import `src/index.js` directly.

## Contents

| Path | What |
|---|---|
| `src/lower-third.js` | **The renderer.** Turns the registry into SVG markup: plates (fill, rims, glint, silhouette), the EFN logo, wordmarks and the full lower third. No file-system or DOM access. |
| `src/index.js` | Package entry: `createLowerThird()` with the built-in data, `loadFonts()`, `browserMeasureText()`, re-exports. |
| `src/assets.js` | **Generated** from `data/` and `assets/` by `npm run build` (committed, so installs need no build). |
| `lib/roundedSkewedCardPathUniform.js` | **Slant and corner-rounding tool.** Builds the SVG path of a plate with slanted sides and uniformly rounded corners at any width. |
| `data/element-registry.json` | **Source of truth.** One entry per component (`name-plate`, `title-plate`, `logo-box` + 8 variants, `ticker-plate` + 6 variants, ticker column / value box / ramp, `location-plate`, logo line, …), with shape parameters, rims, fill, glint, text slots, layout rules and the Flowics graphics each one replaces. |
| `data/design-tokens.json` | Shared values: shape, fills, rim model, typography, animation timings, states, data feed, rendering. |
| `data/samples/ticker-payload.json` | Sample of the ticker data feed. |
| `docs/design-spec.md` | The design rules in prose: layout, shape, rims, fills, glint, ticker, logos, text, animation, data, rendering. **Read this first.** |
| `demo/` | Browser demo of the package (`npm run demo`). |
| `scripts/` | `build-assets.js` (generates `src/assets.js`), `build-svgs.js` (static SVGs into `dist/`), `serve.js` (demo server). |
| `reference/flowics/` | The Flowics original as data, for the animation and state work: `layout-spec.json` (every overlay and element in 1920×1080 px, with styles, bindings, in/out and update animations), `layout-outline.txt` (readable outline), `animation-presets.json` (the 37 GSAP presets). |
| `assets/fonts/` | AkkuratStd 400 / 400i / 700 (woff). Licensed font. |
| `assets/logos/EFN_logo.svg` | EFN logo. |
| `assets/wordmarks/` | Programme wordmarks supplied by EFN: Börslunch, Direkt, Morgon, Råvaror, Nobel. `manifest.json` keeps the original filenames. |

Needs Node 18 or later for the scripts.

## Working on the package

```bash
npm run build
```

This regenerates `src/assets.js` and writes static SVGs to `dist/` (not committed):
- `dist/elements/<component>[--variant].svg`: each plate at its Flowics size, without text.
- `dist/preview/on-air-capture.svg`: the full lower third with sample content.

Run it after editing anything in `data/` or `assets/`. Before committing:

```bash
npm run check
```

It fails if `src/assets.js` is out of date.

To try changes live:

```bash
npm run demo
```

Then open http://127.0.0.1:8765/demo/. Type a name or title and the plates resize with the text; the ticker re-chains after whichever logo box you pick. If that port is taken, run `node scripts/serve.js 9000`.

To render the preview with your own content (same fields as `composite()`):

```bash
node scripts/build-svgs.js --data my-content.json --name my-preview
```

Render SVGs at **3840×2160 and downscale to 1080p**: the rims are half-pixel layers at 1080p, so this matches the original best.

**Releasing:**
1. Bump `version` in `package.json`.
2. Commit.
3. Tag `vX.Y.Z` and push with `--tags`.
4. Apps update by changing the tag in their install line.

## The slant and rounding tool

```js
import { roundedSkewedCardPathUniform, cardCorners } from 'efn-lower-thirds/geometry';

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
- To match the original exactly, place the shape inside the component box with the registry's `insetTop`, `slantOutsetPx` and `straightInsetPx` (`geom()` / `shapePath()` do this).
- `cardCorners()` returns the four corner points.

## Next steps

- **OGraf packaging:** wrap `createLowerThird` in the OGraf graphic web component, with its manifest, data schema, and load / update / play / stop.
- **Text fitting:** decide the final name-plate rule (grow with the text, as in the demo, or shrink the text as Flowics does). See the design spec.
- **Animations and states:** from `reference/flowics/` and the `animation` and `states` tokens.
- **Missing wordmarks:** BÖRSFRUKOST, MARKNAD and UPDATE haven't been supplied, so those logo boxes are plate-only.
- **Glint timing:** start each plate's 15 s glint loop when the plate is taken in.

## Provenance

Every value was measured on the Flowics graphic "Ny skylt" (its 2× plate videos and masks) and checked against the live output. The full lower third differs by a mean of 3.2–3.8 out of 255.

The measurement tools, source captures and comparison renders are kept outside this repository, in the reconstruction workspace (`LowerThird_Reconstruct`).

**Licence and access:** the repository holds a licensed font (AkkuratStd) and EFN's Flowics feed URL (`design-tokens.json` → `data.feed`). Keep it private.
