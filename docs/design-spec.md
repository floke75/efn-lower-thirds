# EFN lower thirds: design spec

The rules the SVG build follows. Every value comes from the Flowics graphic "Ny skylt" (Full HD 1920×1080, transparent background) and was measured on its 2× (UHD) sources. The numbers live in `data/element-registry.json` (per component) and `data/design-tokens.json` (shared). This page explains them.

px are **1×** on the 1920×1080 canvas.

For building new graphics, the same values are available as named design tokens (`designTokens`, `tokens/efn.css`, `tokens/efn.tokens.json`), generated from the registry by `scripts/build-tokens.js`. The plate looks are available at any size as plate styles (`stylePlate()`, `<efn-plate>`). See "Design system" in the README.

## Layout

| Row | y | height | Content |
|---|---|---|---|
| own row | 880.41 | 71 | name plate + title plate (name on its own row) |
| main row | 956.01 | 71 | logo box + ticker / text line, or the name plate (NAMNSKYLT replaces the logo box) |
| logo line | 1031.5 | 37 | logo line left + EFN logo + logo line right (clock, date) |
| top | 13.5 / 21.6 | 70.5 | location bar (PLATS ALT INFO, split variant) |

- Safe area: x 11 to 1909.
- **Chaining rule:** a plate that follows a slanted edge starts its box **4.5 px before the previous box ends** (`adjacentPlateOverlapPx`). Examples: title x = 11 + 588.5 − 4.5 = 595; ticker x = 11 + 335 − 4.5 = 341.5.
- **Regions:** each of the 7 Flowics regions shows at most one overlay at a time; taking another overlay in the same region replaces it. The full overlay list with integration IDs is in `reference/flowics/layout-outline.txt`.

## Shape

Every plate is one shape from `lib/roundedSkewedCardPathUniform.js`:

- **Slant:** 8.45° on every slanted edge, so neighbouring plates run parallel.
- **Corners:** `angleComp` 1 (circle-equivalent rounding on every corner angle).
- **Position** (which sides are slanted):
  - `left` (straight left, slanted right): name, logo box, location, logo line left
  - `right` (slanted left, straight right): ticker / text line, logo line right
  - `middle` (both slanted): title, value boxes, location split-right
- **Radii:**

| Plate | Radius |
|---|---|
| name, logo box | 5.3 |
| ticker | 5.4 |
| title | 5.7 |
| location | 5.8 |
| logo line left / right | 3.5 / 3.7 |
| value box | 2.4 |
| last ticker column ramp | 2.6 |

- **Edge placement inside the component box:**
  - `shape.insetTop` and `shape.height` give the visible plate inside `boxHeight` (71 for most plates).
  - `shape.slantOutsetPx`: slanted edges sit 0.35–0.8 px *outside* the box.
  - `shape.straightInsetPx`: straight edges sit about 0.3 px *inside* it.
  - `geom()` in `src/lower-third.js` applies all three.

## Rims (bevel)

Each plate has a thin layered rim, lit from the upper left (brightest facing ≈117°).

- **Per edge:** `bevel.top/right/bottom/left` is a list of layers `{depth, color}`. `depth` is the distance from the true edge, outside → inside, in 0.5 px steps (one source pixel at 2×). For example:
  - name plate: top `#f7ffff → #effafd → #7b9ebb`, right `#00021b → #012953`
  - beige plates: right edge mid-brown `#746b5a → #807766 → #bbb2a1`, not black
  - red plates: right edge `#230805 → #7b0000 → #940a0f`
- **Around corners:** `bevel.corners` holds the colour per angle around each rounded corner. The rim colour follows the edge normal, so the bright top light carries around the corner and tapers into the dimmer side light.
- **Along edges:** `bevel.along` holds how the inner layers change along each straight edge (they blend with the plate's gradient).
- **How they're drawn** (`rimRings()`): each layer is one continuous ring of even thickness (outer bleed minus a concentric inset), painted deepest first. Straight zones use the edge colour plus the along-edge variation. Corners use gradients on the measured per-angle colours, mapped on each ring's radius and pinned to the neighbouring edges. The whole plate is then cut once by an anti-aliased silhouette.

## Fills

All plate gradients are **horizontal** and **scale with the plate width** (`objectBoundingBox` x 0→1, sRGB). That's what keeps responsive plates looking right.

| Plate | Fill |
|---|---|
| logo boxes (red) | 2 stops `#790012 → #e10029` |
| name plate | 6 stops, `#001125 → … → #1a507a` |
| location | 3 stops `#001122 → #062842 → #1f5b8b` |
| logo line left / right | 6 stops each, mirrored |
| ticker / title (beige) | flat `#ede4d3` / `#f0e7d7` |
| Nobel logo box (gold) | diagonal `#985a00 → #e3bf1e` (dark bottom-left), plus a two-scale glitter texture (`feTurbulence`, fine 1.3 / coarse 0.12) |

## Glint

A white band sweeps across some plates once per 15 s loop.

- **Profile:** Gaussian, σ ≈ 41–47 px, tilted dx/dy 0.33 (leaning "\\").
- **Motion:** linear travel while the opacity rises, peaks and falls (the logo box holds a plateau). Each element has a 7-point opacity envelope.
- **Peak opacity:** 0.09 on navy, 0.155 on red.
- **Windows in the loop:**
  - name 5.6–10.5 s
  - logo box 8.4–13.3 s
  - logo line left 2.8–7.1 s
  - logo line right 6.8–11.1 s
- **No glint:** beige plates and the location bar.
- Per-element values are in `components[].glint`. The glint is SMIL; the OGraf graphics restart its 15 s loop when the plate is taken in, as the Flowics videos did (and seek it in non-real-time rendering).

## Ticker

- 4 columns per page; column width = list width / 4. The list starts 31.35 px into the plate.
- **Value box:** colour from the feed's `Color value`.
  - up: green `rgb(0,174,119)`
  - down: red `rgb(224,1,42)`
  - neutral (prices, rates): `rgb(175,165,134)`

  The box fades in from the left: opacity 0 at 51.5% of the column, 1 at its right end.
- **Column ramp:** `#e0d1ad`, opacity 0 → 1 from 46.4% to 89.5% of the column, 235 px wide, right-aligned.
  - Columns 1–3 have a slanted right edge with sharp corners.
  - The last column has a straight right edge with rounded right corners (`ticker-column-ramp.lastColumn`).
- **Clip:** all column content (ramps, value boxes, text) is clipped to the ticker plate's outline.
- **Text:** short name 700 / 32 px top-left; value 700 / 32 px white, right-aligned, shadow 0 2px 2px rgba(0,0,0,0.5); long name 400 / 18 px at the bottom.

## Logos

- **EFN logo** (`assets/logos/EFN_logo.svg`): fill `#ebebeb`, a 1 px white inner highlight on the top/left edges and a hard black edge about 1 px below (`logoBevel` filter).
- **Programme wordmarks** (`assets/wordmarks/`, supplied by EFN; `manifest.json` keeps the original filenames):
  - **Placement:** all at one scale (≈0.21 px per SVG unit), caps at y 16.75–55.7. BÖRSLUNCH sits 2.6 px higher for its umlauts. Exact per-variant transforms are in `logo-box.variants[].clientWordmark.placement`.
  - **Treatment:** on-air fill `#ebebeb` (the files use `#f2f2f2`), plus a 0.6 px light-pink `#ffe0e3` inner edge on the bottom/right (`wordmarkInset` filter).
  - **Plate width:** 11.5 + wordmark ink width + about 21.5 px.

## Text and responsiveness

Font: AkkuratStd 400 / 400i / 700 (`assets/fonts`).

| Slot | Weight / size | Colour | Rule |
|---|---|---|---|
| name | 700 / 49 (renders ≈45) | `rgb(240,240,240)` | Flowics shrinks it to fit one line (`fitOneLine`) |
| title | 700 / 42 (renders 43.58) | `rgb(26,26,26)` | box hugs text: 0.5em + text + 0.8em; text starts 0.5em from the box's bottom-left |
| location | 700 / 42 | `rgb(240,240,240)` | same em padding as the title |
| text line | 400 / 46, letter-spacing −0.04 | `rgb(26,26,26)` | |
| clock / date | 700 / 23 | | on the logo line halves |

Flowics uses fixed-width plates: the name plate is always 588.5 px, and there are 15 fixed ticker overlays, one per logo box width. The SVG build is **fully responsive** (`composite()` with a `measureText` hook, see the demo):
- Measure the text in the renderer and size each plate from it.
- Draw every plate with `roundedSkewedCardPathUniform`.
- Chain each plate 4.5 px into the previous box.

One ticker component then replaces all the fixed-width variants.

The name-plate rule in `namePlateWidth()` is **provisional**: at least 588.5 px, growing with the text (0.15em padding each side plus the slanted edge's run). The final fitting rule is still open.

## Animation and states

Implemented for the name strap (`ograf/efn-name-strap.mjs`) and the logo box + ticker (`ograf/efn-ticker.mjs`); the other graphics follow the same model (`ograf/lib/efn-graphic.mjs`).

The Flowics original's animations are summarised in `design-tokens.json` (`animation`, `states`). The full GSAP preset table is in `reference/flowics/animation-presets.json`. Per-element in/out timings and `updateAnimation` are in `reference/flowics/layout-spec.json`.

- **Plates:** `slideLeftSolidIn` (slides out from under its own left edge) / `slideLeftSolidOut`, 400–500 ms, mostly `sine.in`.
- **Text:**
  - name and title wipe in (`linearWipeRightIn`) after the plate
  - text updates slide the old text out left and the new text in from the right, 500 ms each
- **Logo box and ticker plate:** `slideLeftSolidIn` 500 ms / `slideLeftSolidOut` 400 ms, `sine.in`, both from 0 ms. The ticker plate slides under its own slanted left edge (Flowics clips it with its hard mask).
- **Ticker columns** (Flowics "Anim Container"): in `slideLeftBigIn` (from 75 px left, fading in) at 400 ms for 360 ms, GSAP `slow` (SlowMo 0.7/0.7); out `linearWipeLeftOut` 0–200 ms, `sine.in`.
- **Ticker pages** (Flowics list item, one page of 4 values): in `slideLeftBigIn` at 700 ms for 500 ms, out `slideRightBigOut` 0–500 ms, both `sine.in`. The 50 ms stagger never applies, since a page is the only item shown.
  - Paging: automatic, every 6 s by default (operator-controlled interval). Each take-in starts at the first page.
  - A page turn plays the old page's out and the new page's in at the same time, so the new page arrives 700 ms after the turn.
  - A change of interval or page count restarts the timer; a page that no longer exists falls back to the first.
- **Logo line:** the halves slide in from their sides (600 ms), the EFN logo expands in (300 ms, `power1`), and the back gradient fades in (900 ms).
- **Overlay totals in/out (ms):**
  - name strap 1200 / 870
  - logo box 500 / 400
  - ticker 1200 / 500
  - logo line 900 / 600
  - location 400 / 450
- **No logic on the page:** there are no conditionals and no take-in/take-out event chains. The operator does all sequencing from the remote controller.

## Data

- **Ticker feed:** a Flowics JSON HTTP Push datasource, polled every 5 s (URL in `design-tokens.json` → `data.feed`).
  - Groups `pre` and `open`, each an array of 4-item pages.
  - Row fields: `Kort namn`, `Eget namn`, `Kurs`, `Enhet`, `Procent string`, `Color value`, `Flag`, …
  - Sample: `data/samples/ticker-payload.json`.
- **Clock:** `HH:mm`, Europe/Stockholm.
- **Date on the logo line:** comes from the feed (`/Datum`), not the clock.

## Rendering

Render at **UHD (3840×2160) and downscale 2×2 to 1080p**:
- the rims are 0.5 px layers (one source pixel at 2×)
- native 1080p rendering adds coloured sub-pixel fringes to text

Rendered this way, the full lower third differs from the Flowics original by a mean of 3.2–3.8 out of 255. What's left is hairline anti-aliasing on plate and letter edges, plus sub-pixel offsets in the Flowics page's own 1080p render.

## Refinements (EFN additions)

Not part of the Flowics original: designed on top of the measured look, on by default, and switchable off (`refinements: false`) for the exact replica. Parameters: `data/design-tokens.json` → `refinements`.

- **Text shading** (an SVG filter per text colour):
  - a soft ambient shadow and a tight contact shadow, offset down-right;
  - the light caught by each glyph's top-left inner edge (rim);
  - a slight darkening of its bottom-right inner edge (shade).

  The EFN logo and the programme wordmarks get the light-text version on top of their measured treatment.

  The light-text version (navy, red and the value boxes) uses black shadows. The dark-text version (beige) uses warm, lighter shadows and a fainter rim, so dark letters never get a light outline. The light version replaces the Flowics value-box shadow.
- **Dark text weight:** the shading made bold dark text (title, ticker names) look heavy, so it is drawn lighter: AkkuratStd 400 with a 0.03 em stroke in the text colour, a synthetic semibold (the font only ships 400 and 700). The plates still size from the text.
- **Beige vignette:** title, ticker and text-line plates burn in towards their edges.
  - **Colour:** the plate's own colour, not a grey overlay. A gamma curve (`burn`) darkens it with more contrast and a saturation boost (`saturate`) enriches it, so the sand gets deeper and warmer.
  - **Shape:** the strength at distance d from the nearest edge of the plate's silhouette has two parts that add up to `opacity` at the edge:
    - a long, gentle ramp, (1 − `edgeShare`) × (1 − d / `width`)^`curve`, over `width` px;
    - a narrow edge band, `edgeShare` × exp(−d / `edgeWidth`), that brings it to full strength only in the last few px.

    So the burn stays gradual until close to the edge and never reads as a frame. It is shifted slightly towards the light at the upper left.
  - **Corners:** the distance is measured per axis (left/right and slanted edges, top/bottom) and the stronger one wins, so a corner is never darker than the edges beside it.
  - **Layering:** it sits under the narrow rims, so the two read as one deeper bevel.

## Not covered yet

- **Wordmarks not supplied:** BÖRSFRUKOST, MARKNAD and UPDATE. Those logo boxes are plate-only for now; each variant's `measuredWordmark` gives the wordmark area to fit.
- **Full-screen slates** (end credits, start slates): described in the registry (`credits-band`, `start-slate`), not vectorised.
- **Nobel glitter:** it matches the source's texture statistics but is a different random instance, and it's static.
