// efn-lower-thirds: package entry.
//
//   import { createLowerThird, loadFonts, browserMeasureText } from 'efn-lower-thirds';
//   await loadFonts();                                   // browser: registers AkkuratStd from the package
//   const lt = createLowerThird({ idPrefix: 'lt-' });     // registry, tokens, logo and wordmarks built in
//   el.innerHTML = lt.composite({ name, title, logo, page, clock, date }, { measureText: browserMeasureText(), fontsUrl: null });
//
// Lower-level pieces are exported too: createRenderer (bring your own data), the geometry helpers and the
// slant/rounding function.
import { createRenderer } from './lower-third.js';
import { registry, tokens, efnLogoSvg, wordmarks } from './assets.js';

export { createRenderer, geom, shapePath, slantOffset, cornerGeom, f2, esc } from './lower-third.js';
export { roundedSkewedCardPathUniform, cardCorners } from '../lib/roundedSkewedCardPathUniform.js';
export { registry, tokens, efnLogoSvg, wordmarks, sampleTickerPayload } from './assets.js';

// A renderer with the package's own data and assets. options: { idPrefix } (and any createRenderer option to
// override, e.g. a modified registry).
export function createLowerThird(options = {}) {
  return createRenderer({ registry, tokens, efnLogoSvg, wordmarks, ...options });
}

// AkkuratStd woff files shipped with the package, resolved relative to this module (works with native ES modules
// and with bundlers that understand new URL(..., import.meta.url), e.g. Vite and webpack 5).
export const fontFiles = [
  { weight: '700', style: 'normal', url: new URL('../assets/fonts/akkuratstd-700.woff', import.meta.url).href },
  { weight: '400', style: 'normal', url: new URL('../assets/fonts/akkuratstd-400.woff', import.meta.url).href },
  { weight: '400', style: 'italic', url: new URL('../assets/fonts/akkuratstd-400i.woff', import.meta.url).href },
];

// Browser: register and load AkkuratStd (resolves once all three faces are ready). Safe to call more than once.
export async function loadFonts(fontSet = globalThis.document && globalThis.document.fonts, family = 'AkkuratStd') {
  if (!fontSet) throw new Error('loadFonts: no document.fonts (call it in a browser, or pass a FontFaceSet)');
  const faces = fontFiles.map(f => {
    const existing = [...fontSet].find(x => x.family.replace(/"/g, '') === family && x.weight === f.weight && x.style === f.style);
    if (existing) return existing;
    const face = new FontFace(family, `url(${f.url}) format('woff')`, { weight: f.weight, style: f.style });
    fontSet.add(face);
    return face;
  });
  await Promise.all(faces.map(f => f.load()));
}

// Browser: text advance in px with the real font, for composite()'s measureText option. Load the fonts first.
export function browserMeasureText(family = 'AkkuratStd') {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return (text, { weight = 700, sizePx }) => { ctx.font = `${weight} ${sizePx}px ${family}`; return ctx.measureText(text).width; };
}
