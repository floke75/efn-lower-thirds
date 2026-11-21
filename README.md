# EFN lower thirds

EFN's on-air lower thirds, rebuilt as resolution-independent SVG for the [OGraf](https://github.com/ebu/ograf) standard. They replace the current Flowics graphic.

The plates (shape, slant, corner rounding, rims, gradients, glint, logos, wordmarks) are replicated to pixel level against the Flowics original. The package renders them in any browser or in Node, sized from their text at runtime. The OGraf graphics are built on top of that: so far the name strap and the logo box + ticker. It is also the base of EFN's broadcast design system: design tokens, the plate looks at any size, and an `<efn-plate>` element for new motion graphics in the same style.

## OGraf graphics

| Graphic | Manifest | Replaces (Flowics) |
|---|---|---|
| Name strap: name plate + title plate | `ograf/efn-name-strap.ograf.json` | NAMN1, NAMN2, NAMNSKYLT-EGEN-RAD, NAMNSKYLT |
| Logo box + ticker: programme logo box and the market ticker beside it | `ograf/efn-ticker.ograf.json` | LOGOBOX-\*, TICKER-LINE-\* PRE / OPEN |

**Building and delivering:** `npm run build` writes `dist/ograf/efn-lower-thirds/` and `dist/efn-lower-thirds-ograf-<version>.zip`. Load that folder or zip into an OGraf renderer or server.

- **Self-contained:** the manifests, the graphic modules, a private copy of the renderer and the fonts. Every reference is relative. The only network request is the ticker's data feed (see below).
- **Validated:** each manifest is checked against the official OGraf v1 JSON schemas, vendored in `reference/ograf/`.

**Serving requirements:**
- Serve the folder over http(s). Browsers refuse ES modules from `file://`.
- `.mjs` must be served as `text/javascript`. Some servers don't map `.mjs` by default, and the graphic then fails to load.

**Name strap data:**

| Field | Description |
|---|---|
| `name` | The person's name. |
| `title` | Their role. Empty shows the name only. |
| `row` | `own` (default) is the row above the main row. `main` puts it in place of the logo box. |

`row` is marked `hidden`, so GUIs leave it out of the graphic's display label.

**Name strap animations:** the Flowics animations, reproduced exactly:

| | Plate | Name text | Title | Total |
|---|---|---|---|---|
| In | slides out from under its left edge at 400 ms | wipes in at 550 ms | wipes in at 800 ms | 1200 ms |
| Out | slides back at 470 ms | wipes out at 450 ms | wipes out at 0 ms | 870 ms |

Updates apply instantly; Flowics had no update animation here either.

**Logo box + ticker:** one graphic, because the ticker starts where the logo box ends (4.5 px into it) and separate OGraf graphics can't see each other's size. It replaces the 8 logo-box overlays and the 15 fixed-width ticker overlays.

| Field | Description |
|---|---|
| `logo` | Logo box: BÖRSFRUKOST, BÖRSLUNCH (default), MARKNAD, RÅVAROR, MORGON, DIREKT, UPDATE, NOBEL. BÖRSFRUKOST, MARKNAD and UPDATE are plate-only until their wordmarks are supplied. |
| `group` | Which list of the feed to show: `open` (default) or `pre`. |
| `interval` | Time per page in ms (`duration-ms`, default 6000, 2000–60000). |
| `feed` | Feed URL. Empty (default) is the EFN ticker feed. Hidden. |
| `pages` | Pages to show instead of the feed: `[[row × up to 4], …]`, rows as the feed has them (`Kort namn`, `Eget namn`, `Procent string`, `Color value`). Also accepted as JSON text. Hidden. |

- **Data:** the graphic fetches the feed in `load()`. In real time it then polls every 5 s, and new values replace the text in place, as Flowics' bindings do. In non-real-time it fetches once, so a render is repeatable. If the feed can't be reached, the plates still show and the columns stay empty until data arrives; the last good data is kept during an outage.
- **Pages:** 4 values a page. Each take-in starts at the first page; then a page turns every `interval`. Changing the interval or the number of pages restarts that timer, and if the current page no longer exists the ticker goes back to the first. This is Flowics' list logic (read from its player code), and it is a pure function of time, so non-real-time renders show the same page as live playout.

**Logo box + ticker animations** (Flowics timings; GSAP `slow` is SlowMo):

| | Logo box and ticker plate | Columns | Page | Total |
|---|---|---|---|---|
| In | slide out from under their left edges, 0–500 ms | slide in from 75 px left and fade in, 400–760 ms (`slow`) | slides in from 75 px left and fades in, 700–1200 ms | 1200 ms |
| Out | slide back, 0–400 ms | wipe out right to left, 0–200 ms | slides 75 px right and fades, 0–500 ms | 500 ms |
| Page turn | | | old page out 0–500 ms, new page in 700–1200 ms | |

Not reproduced: Flowics delays the BÖRSFRUKOST logo box's take-out by 1 s (only that variant). Changing `logo` or `group` while on air switches instantly; in Flowics that would be taking a different overlay.

**What the graphics implement (OGraf v1, spec as of Oct 2026):**
- **Real-time and non-real-time.** `goToTime()` and `setActionsSchedule()` give frame-exact renders; a frame at time T matches the live output at T.
- **Steps.** `stepCount` 1, with the exact step rules and a `currentStep` in every `playAction` result.
- **`skipAnimation`** on every action.
- **Overlapping calls.** Any call can interrupt another; every promise resolves, and each animated action resolves when its animation ends.
- **Unknown custom action ids** return a 4xx status.
- **`dispose()`** clears everything.
- **Manifest extras:** `actionDurations`, `thumbnails`, `renderRequirements` (ideal values only, so no renderer is excluded), and GDD types for the data form.
- **Engine support:** runtime code is ES2018 and uses only browser APIs present in Chromium/CEF 69, the engine generation still found in playout. `npm run check` guards this. It has been tested in current Chromium only.
- **Fonts and sizing:** AkkuratStd is registered from the package (`FontFace`). The graphic fills its element at any 16:9 resolution, and renders sharpest at UHD.

**Developing:** run `npm run demo` and open http://127.0.0.1:8765/ograf-dev/. It is a small OGraf renderer:
- loads a graphic from its manifest;
- play / next / stop / update, with `skipAnimation`;
- a data form generated from the manifest schema;
- a non-real-time scrubber driven by a schedule you can edit;
- **Run OGraf conformance checks**: 28 checks, covering the normative parts of the spec plus the EBU's own example tests. The ticker is checked against the sample feed in `data/samples/`, so the result doesn't depend on live market data.

Also in `ograf-dev/`:
- `frame.html` renders one frame of a graphic, full viewport (used for thumbnails).
- `sheet.html` renders an animation contact sheet.

## Design system

For new broadcast graphics and motion elements in the EFN look (not general web design). Everything below is measured from the on-air graphics and generated from the registry, so there is one source for every value.

**Tokens** (`npm run build` regenerates them from `data/`; `npm run check` fails if they are stale):

| File | For |
|---|---|
| `designTokens` (from `efn-lower-thirds`) | JavaScript: colours as CSS strings, gradients as `{ stops, x1, y1, x2, y2 }`, px and ms as numbers. Typed. |
| `tokens/efn.css` | CSS custom properties: `--efn-color-plate-navy`, `--efn-typography-name-size`, `--efn-motion-duration-plate-in`, … |
| `tokens/fonts.css` | `@font-face` for AkkuratStd (`font-display: block`, so a graphic never shows a fallback font). |
| `tokens/efn.tokens.json` | The W3C Design Tokens format (DTCG 2025.10), for token tools (Style Dictionary, Figma plugins). |

Groups: `color` (text, plate fills and gradients, ticker values), `font`, `typography` (one style per text slot), `shadow`, `effect` (the refinements below), `shape` (skew 8.45°, radii, the 4.5 px chaining overlap), `size`, `layout` (canvas, safe area, rows), `spacing` (em insets), `motion` (easings, durations, the 75 px shift), `glint`. px are on the 1920×1080 canvas.

**Refinements:** two additions on top of the measured Flowics look, on by default in everything (OGraf graphics, `composite()`, plate styles, `<efn-plate>`):
- **Text shading:** a soft ambient shadow and a tight contact shadow, light caught by the top-left inner edge of each glyph and a slight shade on its bottom-right inner edge. One version for light text (on navy, red and the value boxes; it replaces the original value shadow) and a warmer, lighter one for dark text on beige. The EFN logo and the programme wordmarks get the light version on top of their own treatment.
- **Dark text weight:** bold dark text (title, ticker names) is drawn a little lighter, so the shading doesn't make it look heavy: AkkuratStd 400 thickened by a stroke in the text colour (0.03 em), a synthetic semibold between the 400 and 700 the font ships with.
- **Beige vignette:** towards their edges the title, ticker and text-line plates burn in: the sand colour gets darker with more contrast and more saturation (a gamma curve plus a saturation boost on the plate's own colour, not a grey overlay). It is full only at the very edge and fades out gradually over a wide band, following the plate shape; corners are never stronger than the edges beside them. It sits under the narrow rims and is lit from the upper left like them, so the lower and right edges burn slightly more.

The parameters are in `data/design-tokens.json` → `refinements` (and as tokens under `effect`). `createLowerThird({ refinements: false })` and `<efn-plate flat>` give the exact Flowics replica. The snapshot tests lock both looks. The renderer's `textFilters` and `textAttr('light' | 'dark')` apply the text shading to your own SVG text.

**Motion:** `ease` has the curves Flowics animates with, under their GSAP names (`sine.in`, `sine.out`, `power1.*`, `slow` = GSAP SlowMo), exact at 0 and 1. `cssEase` has the closest CSS `cubic-bezier()` for each (none for `slow`). The per-element timings are in `designTokens.motion`, and the OGraf graphics use the same curves.

**Plate styles:** the measured plate looks (fill, rims, glint), at any width, height, slant and radius:

| Style | From | Text | Default slant |
|---|---|---|---|
| `navy` | name plate | light | right |
| `location` | location bar | light | right |
| `red` | logo box | light | right |
| `gold` | Nobel logo box (with glitter) | light | right |
| `beige` | ticker / text line | dark | left |
| `beige-light` | title plate | dark | both |
| `line-left`, `line-right` | logo line halves (37 px) | light | right / left |

```js
const lt = createLowerThird({ idPrefix: 'gfx-' });
const defs = [];
const body = lt.stylePlate('navy', { width: 420, height: 71, x: 100, y: 900, slant: 'right', glint: true, defs });
const svg = lt.plateSvg('beige', { width: 300, height: 50 });      // one plate as a complete SVG document
```

The plate fills exactly `x..x+width` × `y..y+height`. Rims keep their measured px depth at every size, and the glint's travel scales with the width. Corner radii default to the measured ones; set `radius` for very small or very large plates. Heights other than the measured ones (71 and 37 px) look right but weren't compared with an original, since none exists.

**`<efn-plate>`:** a plate behind HTML content, which hugs its text and redraws when its size changes:

```html
<link rel="stylesheet" href="node_modules/efn-lower-thirds/tokens/fonts.css">
<script type="module">import 'efn-lower-thirds/plate-element';</script>

<efn-plate variant="navy" glint>Namn Efternamn</efn-plate>
<efn-plate variant="beige-light" style="height: 69px">Titel</efn-plate>
```

- **Attributes:** `variant` (a style above), `slant` (`right`, `left`, `both`, `none`), `radius`, `glint`, `flat` (no refinements).
- **Text shading:** the refinements' SVG filter, applied with CSS `filter`. It is defined inside the element and once in the document, so engines that resolve `url(#…)` in either scope find it.
- **Size it with CSS.** The default height is the 71 px row; the width follows the content. Font and text colour default to the variant's; override them with ordinary CSS.
- **Text inset:** `--efn-plate-padding` (default `0.5em`) on straight sides; slanted sides add the slant's run.
- **Glint:** `restartGlint()` restarts its 15 s loop, e.g. at a take-in.
- **Chaining:** to chain plates as the lower third does, give each following plate `margin-left: calc(-1 * var(--efn-shape-overlap))`.
- **Where it runs:** Chromium/CEF 69 and later. Importing it without a DOM (Node) is safe.

`npm run demo` → http://127.0.0.1:8765/demo/plates.html shows every style, slant and height, and the colour and type tokens.

## Use it in an app

The repository is an installable package: plain ES modules, no runtime dependencies, no build step, with TypeScript declarations (checked by `npm run typecheck`).

```bash
npm install github:floke75/efn-lower-thirds#v0.5.0
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
  - the built-in `registry`, `tokens` (the measurement record the renderer uses), `wordmarks`, `efnLogoSvg`
  - the design system: `designTokens`, `ease`, `cssEase`, and on the renderer `plateStyles`, `plateStyle()`, `stylePlate()`, `plateSvg()` (see Design system)
- **Bundlers:** fonts are resolved with `new URL(..., import.meta.url)`, which works with native ES modules, Vite and webpack 5. You can also serve `efn-lower-thirds/assets/fonts/*` yourself and use your own `@font-face`.

**Entry points:**

| Import | What |
|---|---|
| `efn-lower-thirds` | Everything above. Includes the built-in data (about 135 KB). |
| `efn-lower-thirds/renderer` | `createRenderer({ registry, tokens, efnLogoSvg, wordmarks })` only, for bringing your own (e.g. edited) data. |
| `efn-lower-thirds/geometry` | Just the slant and corner-rounding functions. |
| `efn-lower-thirds/plate-element` | Defines `<efn-plate>` (the only entry point with a side effect). |
| `efn-lower-thirds/tokens/*` | `efn.css`, `fonts.css`, `efn.tokens.json`. |
| `efn-lower-thirds/data/*`, `efn-lower-thirds/assets/*` | The raw JSON, fonts, logo and wordmark files. |

The name plate's growth rule (`namePlateWidth`) is provisional; see the design spec.

Instead of npm you can add the repository as a git submodule and import `src/index.js` directly.

## Contents

| Path | What |
|---|---|
| `ograf/` | **The OGraf graphics** (source): manifests, graphic modules, the shared base class `lib/efn-graphic.mjs`, thumbnails. `npm run build` turns them into the self-contained `dist/ograf/efn-lower-thirds/`. |
| `ograf-dev/` | Dev renderer, conformance checks, frame and contact-sheet pages (see OGraf graphics above). |
| `reference/ograf/` | The official OGraf v1 JSON schemas (MIT, EBU), for offline manifest validation. |
| `src/lower-third.js` | **The renderer.** Turns the registry into SVG markup: plates (fill, rims, glint, silhouette), the EFN logo, wordmarks and the full lower third. No file-system or DOM access. |
| `src/index.js` | Package entry: `createLowerThird()` with the built-in data, `loadFonts()`, `browserMeasureText()`, re-exports. |
| `src/assets.js` | **Generated** from `data/` and `assets/` by `npm run build` (committed, so installs need no build). |
| `lib/roundedSkewedCardPathUniform.js` | **Slant and corner-rounding tool.** Builds the SVG path of a plate with slanted sides and uniformly rounded corners at any width. |
| `data/element-registry.json` | **Source of truth.** One entry per component (`name-plate`, `title-plate`, `logo-box` + 8 variants, `ticker-plate` + 6 variants, ticker column / value box / ramp, `location-plate`, logo line, …), with shape parameters, rims, fill, glint, text slots, layout rules and the Flowics graphics each one replaces. |
| `data/design-tokens.json` | Shared values: shape, fills, rim model, typography, animation timings, states, data feed, rendering. |
| `data/samples/ticker-payload.json` | Sample of the ticker data feed. |
| `docs/design-spec.md` | The design rules in prose: layout, shape, rims, fills, glint, ticker, logos, text, animation, data, rendering. **Read this first.** |
| `demo/` | Browser demos (`npm run demo`): `index.html`, the full lower third, editable; `plates.html`, the style guide (plate styles, `<efn-plate>`, tokens). |
| `tokens/` | **Generated** design tokens: `efn.css`, `fonts.css`, `efn.tokens.json` (DTCG). See Design system. |
| `src/design-tokens.js`, `src/motion.js`, `src/elements/efn-plate.js` | `designTokens` (generated), the easing curves, and the `<efn-plate>` element. |
| `test/` | `npm test`: snapshot fingerprints of every SVG the package produces (`snapshots.json`), and behaviour tests (easings, plate styles, tokens, ticker page timing). `types.ts` is the type test. |
| `scripts/` | `build-assets.js` (generates `src/assets.js`), `build-tokens.js` (generates the design tokens), `build-svgs.js` (static SVGs into `dist/`), `build-ograf.js` (OGraf package + zip), `validate-ograf.js` (manifests vs the official schemas), `check-compat.js` (ES2018 / Chromium 69 guard), `serve.js` (dev server). |
| `reference/flowics/` | The Flowics original as data, for the animation and state work: `layout-spec.json` (every overlay and element in 1920×1080 px, with styles, bindings, in/out and update animations), `layout-outline.txt` (readable outline), `animation-presets.json` (the 37 GSAP presets). |
| `assets/fonts/` | AkkuratStd 400 / 400i / 700 (woff). Licensed font. |
| `assets/logos/EFN_logo.svg` | EFN logo. |
| `assets/wordmarks/` | Programme wordmarks supplied by EFN: Börslunch, Direkt, Morgon, Råvaror, Nobel. `manifest.json` keeps the original filenames. |

Needs Node 18 or later for the scripts. Run `npm install` once for the TypeScript dev dependency.

## Working on the package

```bash
npm run build
```

This regenerates `src/assets.js` and the design tokens (`src/design-tokens.js`, `tokens/`), and writes to `dist/` (not committed): static SVGs, and the OGraf package (folder + zip). In detail:
- `dist/elements/<component>[--variant].svg`: each plate at its Flowics size, without text.
- `dist/preview/on-air-capture.svg`: the full lower third with sample content.

Run it after editing anything in `data/` or `assets/`. Before committing:

```bash
npm run check
```

It fails if `src/assets.js` or the design tokens are out of date, if a manifest doesn't validate against the official OGraf schemas, or if the runtime code uses syntax or APIs newer than ES2018 / Chromium 69.

```bash
npm test
```

It renders every SVG the package can produce (the full lower third, each plate, name strap, logo box + ticker for every logo, every plate style, slant and size, and the exact Flowics look without refinements) with fixed inputs and compares them with the fingerprints in `test/snapshots.json`. Any change to the output fails: a change made for one graphic can't quietly alter another. When a change is intended, check it visually (`demo/plates.html`, `npm run build` previews), then accept it with `npm run test:update` and commit the updated `test/snapshots.json`. A failing case writes its new output to `test/output/` for inspection. It also tests the easing curves, the plate-style API, the token values and the ticker's page timing.

After changing the API or the declarations:

```bash
npm run typecheck
```

It compiles `test/types.ts` against the TypeScript declarations, importing the package by name, and checks that every runtime export is declared and vice versa. TypeScript is a dev dependency only, so apps that install the package don't get it.

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
1. Bump `version` in `package.json` (and the graphics' manifests), then run `npm run build`, `npm run check` and `npm test`.
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

- **More OGraf graphics** on the same base class: logo line (clock, date), location bar, text line (the text-line overlays sit beside the logo box like the ticker, so it could become a mode of the ticker graphic).
- **Try the package in the target renderer(s)** and adjust `renderRequirements` if they need it.
- **Text fitting:** decide the final name-plate rule (grow with the text, as in the demo, or shrink the text as Flowics does). See the design spec.
- **Missing wordmarks:** BÖRSFRUKOST, MARKNAD and UPDATE haven't been supplied, so those logo boxes are plate-only.
- **Design system, still to do:** motion helpers for the Flowics presets (slide from under an edge, wipe, slide-and-fade) on top of `ease`; a guide to writing a new OGraf graphic on the base class (today it is a comment in `ograf/lib/efn-graphic.mjs`); pixel (screenshot) tests next to the SVG snapshots; a changelog.

## Provenance

Every value was measured on the Flowics graphic "Ny skylt" (its 2× plate videos and masks) and checked against the live output. The full lower third differs by a mean of 3.2–3.8 out of 255.

The measurement tools, source captures and comparison renders are kept outside this repository, in the reconstruction workspace (`LowerThird_Reconstruct`).

**Licence and access:** the repository holds a licensed font (AkkuratStd) and EFN's Flowics feed URL (`design-tokens.json` → `data.feed`). Keep it private.
