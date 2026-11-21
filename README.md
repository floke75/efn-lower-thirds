# EFN lower thirds

EFN's on-air lower thirds, rebuilt as resolution-independent SVG for the [OGraf](https://github.com/ebu/ograf) standard. They replace the current Flowics graphic.

The plates (shape, slant, corner rounding, rims, gradients, glint, logos, wordmarks) are replicated to pixel level against the Flowics original. The package renders them in any browser or in Node, sized from their text at runtime. The OGraf graphics are built on top of that: so far the name strap and the logo box + ticker.

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

## Use it in an app

The repository is an installable package: plain ES modules, no runtime dependencies, no build step, with TypeScript declarations (checked by `npm run typecheck`).

```bash
npm install github:floke75/efn-lower-thirds#v0.4.0
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
| `demo/` | Browser demo of the package (`npm run demo`). |
| `scripts/` | `build-assets.js` (generates `src/assets.js`), `build-svgs.js` (static SVGs into `dist/`), `build-ograf.js` (OGraf package + zip), `validate-ograf.js` (manifests vs the official schemas), `check-compat.js` (ES2018 / Chromium 69 guard), `serve.js` (dev server). |
| `reference/flowics/` | The Flowics original as data, for the animation and state work: `layout-spec.json` (every overlay and element in 1920×1080 px, with styles, bindings, in/out and update animations), `layout-outline.txt` (readable outline), `animation-presets.json` (the 37 GSAP presets). |
| `assets/fonts/` | AkkuratStd 400 / 400i / 700 (woff). Licensed font. |
| `assets/logos/EFN_logo.svg` | EFN logo. |
| `assets/wordmarks/` | Programme wordmarks supplied by EFN: Börslunch, Direkt, Morgon, Råvaror, Nobel. `manifest.json` keeps the original filenames. |

Needs Node 18 or later for the scripts. Run `npm install` once for the TypeScript dev dependency.

## Working on the package

```bash
npm run build
```

This regenerates `src/assets.js` and writes to `dist/` (not committed): static SVGs, and the OGraf package (folder + zip). In detail:
- `dist/elements/<component>[--variant].svg`: each plate at its Flowics size, without text.
- `dist/preview/on-air-capture.svg`: the full lower third with sample content.

Run it after editing anything in `data/` or `assets/`. Before committing:

```bash
npm run check
```

It fails if `src/assets.js` is out of date, if a manifest doesn't validate against the official OGraf schemas, or if the runtime code uses syntax or APIs newer than ES2018 / Chromium 69.

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

- **More OGraf graphics** on the same base class: logo line (clock, date), location bar, text line (the text-line overlays sit beside the logo box like the ticker, so it could become a mode of the ticker graphic).
- **Try the package in the target renderer(s)** and adjust `renderRequirements` if they need it.
- **Text fitting:** decide the final name-plate rule (grow with the text, as in the demo, or shrink the text as Flowics does). See the design spec.
- **Missing wordmarks:** BÖRSFRUKOST, MARKNAD and UPDATE haven't been supplied, so those logo boxes are plate-only.

## Provenance

Every value was measured on the Flowics graphic "Ny skylt" (its 2× plate videos and masks) and checked against the live output. The full lower third differs by a mean of 3.2–3.8 out of 255.

The measurement tools, source captures and comparison renders are kept outside this repository, in the reconstruction workspace (`LowerThird_Reconstruct`).

**Licence and access:** the repository holds a licensed font (AkkuratStd) and EFN's Flowics feed URL (`design-tokens.json` → `data.feed`). Keep it private.
