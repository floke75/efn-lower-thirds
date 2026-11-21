// Type test for the package's declarations: compiled with `npm run typecheck` (tsc --noEmit), never run.
// It imports the package by its own name, so the "exports" map and its "types" conditions are checked too.
// Lines marked @ts-expect-error must fail to compile: they make sure the types reject wrong usage instead of
// accepting anything.
import {
  createLowerThird, createRenderer, loadFonts, browserMeasureText, fontFiles,
  registry, tokens, efnLogoSvg, wordmarks, sampleTickerPayload,
  geom, shapePath, slantOffset, cornerGeom, f2, esc,
  roundedSkewedCardPathUniform, cardCorners,
  type Renderer, type NameStrap, type LogoTicker, type Content, type MeasureText, type Shape, type TickerRow, type Component, type LogoBoxVariant,
} from 'efn-lower-thirds';
import { createRenderer as createRendererOnly, type RendererOptions } from 'efn-lower-thirds/renderer';
import { roundedSkewedCardPathUniform as pathOnly, cardCorners as cornersOnly, type CardPosition } from 'efn-lower-thirds/geometry';

// ---------- renderer with built-in data ----------
const lt: Renderer = createLowerThird({ idPrefix: 'lt-' });
const page: TickerRow[] = sampleTickerPayload.data.open[0];
const content: Content = { name: 'Namn Efternamn', title: 'EFN', logo: 'borslunch', page, clock: '16:24', date: '9 nov 2026' };
const measure: MeasureText = browserMeasureText();
const doc: string = lt.composite(content, { measureText: measure, fontsUrl: null, fluid: true });
const docNode: string = lt.composite();
const files: Array<{ file: string; svg: string }> = lt.elements();

// ---------- single plates ----------
const title: Component | undefined = lt.comp('title-plate');
if (title) {
  const defs: string[] = [];
  const body: string = lt.plate(title, lt.titleWidth(120), 595, 880.41, { defs });
  const svg: string = lt.svgDocument(1920, 1080, defs, body, { fluid: true });
  const nameW: number = lt.namePlateWidth(500);
  // @ts-expect-error plate() needs the defs array
  lt.plate(title, 100, 0, 0, {});
}
const strapDefs: string[] = [];
const strap: NameStrap = lt.nameStrap({ name: 'Namn Efternamn', title: 'EFN' }, { measureText: measure, row: 'main', defs: strapDefs });
const strapMarkup: string = strap.namePlate + strap.nameText + strap.titlePlate + strap.titleText;
const titleWipe: number | undefined = strap.layout.title?.elementW;
// @ts-expect-error row is 'own' or 'main'
lt.nameStrap({ name: 'x' }, { row: 'side' });
const tickerDefs: string[] = [];
const lbt: LogoTicker = lt.logoTicker({ logo: 'borslunch', pages: [sampleTickerPayload.data.open[0]] }, { defs: tickerDefs });
const tickerMarkup: string = lbt.logoPlate + lbt.wordmark + lbt.tickerPlate + `<g clip-path="url(#${lbt.tickerClip})">${lbt.pages.join('')}</g>`;
const colW: number = lbt.layout.list.colW;
// @ts-expect-error logoTicker() needs the defs array
lt.logoTicker({ logo: 'borslunch' }, {});
const variant = (registry.components.find(c => c.id === 'logo-box')?.variants ?? [])[0] as LogoBoxVariant;
const wm: string = lt.wordmark(variant, 11, 956.01);
const logo: string = lt.efnLogo(917, 1031.5, 86, 37);
const filters: string = lt.logoFilters;

// ---------- bring your own data ----------
const opts: RendererOptions = { registry, tokens, efnLogoSvg, wordmarks };
const r2: Renderer = createRenderer(opts);
const r3: Renderer = createRendererOnly({ registry, tokens });
// @ts-expect-error registry and tokens are required
createRenderer({ efnLogoSvg });

// ---------- geometry ----------
const shape: Shape = { position: 'left', skewDeg: 8.45, radius: 5.3, angleComp: 1, height: 70.16, insetTop: 0.38 };
const g = geom(shape, 588.5, 11, 880.41);
const area: number = g.W * g.H;
const d1: string = shapePath(shape, 588.5, 11, 880.41, { radius: 4 });
const run: number = slantOffset(shape);
const corners = cornerGeom(shape, g);
const cx: number = corners[0].C.x;
const pos: CardPosition = 'middle';
const d2: string = roundedSkewedCardPathUniform({ width: 300, height: 70.16, skewDeg: 8.45, position: pos, radius: 5.7, angleComp: 1 });
const d3: string = pathOnly({ width: 300, height: 70, skewDeg: 8.45, position: 'none' });
const pts: number = cardCorners(300, 70, 8.45, 'right').length + cornersOnly(300, 70, 8.45, 'left').length;
// @ts-expect-error position must be left | middle | right | none
roundedSkewedCardPathUniform({ width: 300, height: 70, skewDeg: 8.45, position: 'center' });
const rounded: number = f2(1.23456);
const safe: string = esc('S&P <500>');

// ---------- browser helpers ----------
async function boot(): Promise<void> {
  await loadFonts();
  await loadFonts(document.fonts, 'AkkuratStd');
}
const urls: string[] = fontFiles.map(f => f.url);
// @ts-expect-error measureText returns a number
const bad: MeasureText = () => 'wide';
