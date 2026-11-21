// Build the EFN design tokens: the curated, named values for building broadcast graphics in the EFN look, derived
// from the measured data (data/element-registry.json, data/design-tokens.json), so every value still has one source.
//
// Outputs (committed, so the package works without a build step):
//   src/design-tokens.js    `designTokens`, plain values for JavaScript (colours as CSS strings, px and ms as numbers)
//   tokens/efn.tokens.json  the same in the W3C Design Tokens format (DTCG 2025.10: $value / $type), for token tools
//   tokens/efn.css          CSS custom properties (--efn-...)
//   tokens/fonts.css        @font-face rules for AkkuratStd from assets/fonts
// Usage: node scripts/build-tokens.js [--check]   (--check: fail if the committed files are out of date)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const REG = json('data/element-registry.json');
const TOK = json('data/design-tokens.json');
const pkg = json('package.json');
const comp = (id) => REG.components.find((c) => c.id === id);
const variant = (id, v) => comp(id).variants.find((x) => x.id === v);
const r4 = (n) => Math.round(n * 10000) / 10000;

// ---------- leaves ----------
// Canonical form: { $type, value (plain), description }. The emitters below turn it into each output format.
const T = (type, value, description) => ({ __leaf: true, type, value, description });
const color = (v, d) => T('color', v, d);
const dim = (v, d) => T('dimension', v, d);          // px on the 1920x1080 canvas
const num = (v, d) => T('number', v, d);
const em = (v, d) => T('em', v, d);                   // em of the text size (DTCG has no em unit: emitted as number)
const ms = (v, d) => T('duration', v, d);
const gradient = (fill, d) => T('gradient', { stops: fill.stops, x1: fill.x1, y1: fill.y1, x2: fill.x2, y2: fill.y2 }, d);
const bezier = (v, d) => T('cubicBezier', v, d);
const FAMILY = ['AkkuratStd', 'Arial', 'sans-serif'];
const type = (t, d, extra = {}) => T('typography', Object.assign({ fontFamily: FAMILY, fontWeight: t.weight, fontSize: t.effectiveSizePx || t.sizePx }, extra), d);

const np = comp('name-plate'), tp = comp('title-plate'), lp = comp('location-plate'), lb = comp('logo-box'), tk = comp('ticker-plate');
const L = comp('logo-line-left'), R = comp('logo-line-right'), col = comp('ticker-column'), vb = comp('ticker-value-box'), ramp = comp('ticker-column-ramp');
const vc = TOK.ticker.valueColors, rows = REG.rows, anim = TOK.animation.overlayTotalsMs;
const tan = Math.tan((np.shape.skewDeg * Math.PI) / 180);
// Refinement parameters (SVG filter terms: dx/dy offset, blur = stdDeviation) as shadows (blur radius = 2 x stdDeviation).
const rgbaOf = (hexColor, a) => { const h = hexColor.replace('#', ''); return `rgba(${[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')}, ${a})`; };
const shadowOf = (q, inset) => Object.assign({ color: rgbaOf(q.color, q.opacity), offsetX: q.dx, offsetY: q.dy, blur: r4(q.blur * 2), spread: 0 }, inset ? { inset: true } : {});
const textShading = (p) => [shadowOf(p.ambient), shadowOf(p.contact), shadowOf(p.rim, true)].concat(p.shade ? [shadowOf(p.shade, true)] : []);

const tree = {
  color: {
    text: {
      light: color(np.text.color, 'Text on navy plates: name, location.'),
      dark: color(tp.text.color, 'Text on beige plates: title, ticker, text line.'),
      logo: color(lb.wordmark.fill, 'EFN logo and programme wordmarks, as on air (the files use #f2f2f2).'),
      clock: color(L.text.color, 'Clock and date on the logo line.'),
      value: color(col.text.value.color, 'Ticker values on their coloured value boxes.'),
    },
    plate: {
      navy: gradient(np.fill, 'Name plate. Horizontal, scales with the plate width.'),
      location: gradient(lp.fill, 'Location plate. Horizontal.'),
      red: gradient(lb.fill, 'Programme logo boxes. Horizontal.'),
      gold: gradient(variant('logo-box', 'nobel').fill, 'Nobel logo box: diagonal, dark bottom-left to light top-right (plus a glitter texture the plate renderer adds).'),
      beige: color(tk.fill.color, 'Ticker and text-line plates.'),
      beigeLight: color(tp.fill.color, 'Title plate.'),
      lineLeft: gradient(L.fill, 'Logo line, left half (clock). Horizontal.'),
      lineRight: gradient(R.fill, 'Logo line, right half (date). Horizontal.'),
    },
    ticker: {
      up: color(vc.up, 'Value box: rising.'),
      down: color(vc.down, 'Value box: falling.'),
      neutral: color(vc['neutral (prices, rates)'], 'Value box: prices and rates.'),
      ramp: color(ramp.fill.color, 'Column ramp behind each value (fades in from 46.4% to 89.5% of the column).'),
    },
    wordmarkEdge: color('#ffe0e3', 'Light inner edge on the bottom/right of the programme wordmarks (about 0.6 px).'),
    backShade: color('rgba(0, 0, 0, 0.2)', 'Logo-line back gradient: this at the bottom of the screen, fading to transparent 64.8 px up.'),
  },
  font: {
    family: T('fontFamily', FAMILY, 'AkkuratStd (assets/fonts; tokens/fonts.css registers it). Weights 400, 400 italic and 700.'),
    weight: { regular: T('fontWeight', 400), bold: T('fontWeight', 700) },
  },
  typography: {
    name: type(np.text, 'Name on the name plate (Flowics sets 49 px; it renders at 45 px).'),
    title: type(tp.text, 'Title on the title plate (Flowics fits it to 43.58 px in a 70.29 px box).'),
    location: type(lp.text, 'Location bar.'),
    textLine: T('typography', { fontFamily: FAMILY, fontWeight: 400, fontSize: 46, letterSpacing: r4(-0.04 * 46) }, 'Text line (one sentence beside the logo box). Letter spacing -0.04 em.'),
    tickerShort: type(col.text.short, 'Ticker: short name, top left of the column.'),
    tickerLong: type(col.text.long, 'Ticker: long name, bottom left of the column.'),
    tickerValue: type(col.text.value, 'Ticker: value, right-aligned on the value box, with shadow.tickerValue.'),
    clock: type(L.text, 'Clock and date on the logo line.'),
  },
  shadow: {
    tickerValue: T('shadow', { color: 'rgba(0, 0, 0, 0.5)', offsetX: 0, offsetY: 2, blur: 2, spread: 0 }, 'Drop shadow under ticker values in the exact Flowics look (with refinements, effect.textLight replaces it).'),
  },
  effect: {
    textLight: T('shadow', textShading(TOK.refinements.textLight), 'Refinement: shading of light text (on navy, red and value boxes): ambient and contact drop shadows, rim light on the top-left inner edge, shade on the bottom-right inner edge. Drawn by the renderer\'s SVG filter (textFilters); blur = 2 x its stdDeviation.'),
    textDark: T('shadow', textShading(TOK.refinements.textDark), 'Refinement: shading of dark text (on beige), as effect.textLight with warm, lighter shadows.'),
    darkTextWeight: T('fontWeight', TOK.refinements.darkText.weight, 'Refinement: bold dark text (title, ticker names) is drawn in this weight, thickened by darkTextStroke: a synthetic semibold, so the shading does not make it look heavy.'),
    darkTextStroke: em(TOK.refinements.darkText.strokeEm, 'Refinement: stroke in the text colour around bold dark text, in em of the text size.'),
    vignette: {
      width: dim(TOK.refinements.vignette.width, 'Refinement, beige plates: the plate colour is burnt in towards the edges, following the plate shape, under the narrow rims. Distance over which it fades out completely.'),
      curve: num(TOK.refinements.vignette.curve, 'Shape of the long ramp: (1 - distance / width)^curve; higher = more concentrated at the edge.'),
      edgeShare: num(TOK.refinements.vignette.edgeShare, 'Part of the strength that only builds up in the last few px (the rest comes from the long ramp).'),
      edgeWidth: dim(TOK.refinements.vignette.edgeWidth, 'Falloff of that edge part: exp(-distance / edgeWidth).'),
      cornerSoftness: dim(TOK.refinements.vignette.cornerSoftness, 'Rounds the mitre where the falloffs of two edges meet in a corner (blur radius, sigma).'),
      offsetX: dim(TOK.refinements.vignette.dx, 'Shift towards the light (upper left), so the lower and right edges burn slightly more.'),
      offsetY: dim(TOK.refinements.vignette.dy),
      burn: num(TOK.refinements.vignette.burn, 'Contrast curve at the edge: gamma exponent on the plate colour (> 1 darkens it with more contrast).'),
      saturate: num(TOK.refinements.vignette.saturate, 'Saturation boost at the edge (1 = none).'),
      strength: num(TOK.refinements.vignette.opacity, 'Strength at the edge (0..1).'),
    },
  },
  shape: {
    skew: num(np.shape.skewDeg, 'Slant of every slanted edge, in degrees. Neighbouring plates stay parallel.'),
    slantPerPx: num(r4(tan), 'Horizontal run of a slanted edge per px of plate height (tan of the skew).'),
    angleComp: num(np.shape.angleComp, 'Corner rounding compensation for roundedSkewedCardPathUniform (1 = circle-equivalent).'),
    overlap: dim(REG.adjacentPlateOverlapPx, 'A plate that follows a slanted edge starts its box this far before the previous box ends.'),
    radius: {
      navy: dim(np.shape.radius), red: dim(lb.shape.radius), beige: dim(tk.shape.radius), beigeLight: dim(tp.shape.radius),
      location: dim(lp.shape.radius), lineLeft: dim(L.shape.radius), lineRight: dim(R.shape.radius),
      valueBox: dim(vb.shape.radius), rampEnd: dim(ramp.lastColumn.shape.radius, 'Rounded right end of the last column ramp.'),
    },
  },
  size: {
    row: dim(rows.mainRow.h, 'Height of a plate row (name, title, logo box, ticker, location).'),
    line: dim(rows.logoLine.h, 'Height of the logo line.'),
    valueBox: { width: dim(vb.size.w), height: dim(vb.size.h) },
    tickerColumns: num(4, 'Values per ticker page.'),
  },
  layout: {
    canvas: { width: dim(1920), height: dim(1080) },
    safe: { left: dim(rows.safeLeft, 'Leftmost plate edge.'), right: dim(rows.safeRight, 'Rightmost plate edge.') },
    row: {
      own: dim(rows.ownRow.y, 'Top of the name strap\'s own row.'),
      main: dim(rows.mainRow.y, 'Top of the main row: logo box + ticker / text line.'),
      logoLine: dim(rows.logoLine.y, 'Top of the logo line.'),
      top: dim(TOK.rows.topRow.y, 'Top of the location bar.'),
    },
  },
  spacing: {
    name: em(np.text.linePaddingEm.left, 'Name text inset from the plate edges (plus the slant run on the slanted side).'),
    titleStart: em(tp.text.linePaddingEm.left, 'Title box: text inset at the start.'),
    titleEnd: em(tp.text.linePaddingEm.right, 'Title box: space after the text. Box width = start + text + end.'),
    tickerColumn: em(col.text.short.linePaddingEm.left, 'Ticker short name and value: inset from the column edges.'),
    tickerLong: em(col.text.long.linePaddingEm.left, 'Ticker long name: inset from the column edge.'),
  },
  motion: {
    ease: {
      sineIn: bezier([0.12, 0, 0.39, 0], 'GSAP sine.in, the default Flowics easing (cubic-bezier fit; exact curve: ease["sine.in"]).'),
      sineOut: bezier([0.61, 1, 0.88, 1], 'GSAP sine.out.'),
      sineInOut: bezier([0.37, 0, 0.63, 1], 'GSAP sine.inOut.'),
      power1Out: bezier([0.5, 1, 0.89, 1], 'GSAP power1 (power1.out): the EFN logo pop.'),
      linear: bezier([0, 0, 1, 1], 'Linear: wipes and some take-outs.'),
    },
    duration: {
      plateIn: ms(500, 'Logo box, ticker plate and text line slide in (slideLeftSolidIn, sine.in).'),
      plateOut: ms(400, 'Logo box, ticker plate and text line slide out.'),
      wipe: ms(400, 'Text wipes (linearWipeRightIn / linearWipeLeftOut).'),
      textUpdate: ms(500, 'Text update: old text slides out, new text slides in.'),
      nameStrapIn: ms(anim['name strap'][0]), nameStrapOut: ms(anim['name strap'][1]),
      tickerIn: ms(anim['ticker (data)'][0]), tickerOut: ms(anim['ticker (data)'][1]),
      logoLineIn: ms(anim['logo line'][0]), logoLineOut: ms(anim['logo line'][1]),
      locationIn: ms(anim.location[0]), locationOut: ms(anim.location[1]),
      pageInterval: ms(TOK.ticker.paging.cycleSeconds * 1000, 'Ticker: time per page (operator-controlled in Flowics).'),
      pageOut: ms(500, 'Ticker page turn: the old page slides 75 px right and fades out.'),
      pageInDelay: ms(700, 'Ticker page turn: the new page starts this long after the turn.'),
      pageIn: ms(500, 'Ticker page turn: the new page slides in from 75 px left and fades in.'),
    },
    distance: { shift: dim(75, 'Travel of the slide-and-fade presets (slideLeftBigIn / slideRightBigOut).') },
  },
  glint: {
    loop: ms(np.glint.loopS * 1000, 'The white glint sweeps once per loop, from the take-in.'),
    opacity: { navy: num(np.glint.peakOpacity), red: num(lb.glint.peakOpacity), line: num(L.glint.peakOpacity) },
    sigma: dim(r4(np.glint.sigmaPx), 'Width of the glint band (gaussian sigma; 41-47 px depending on the plate).'),
    tilt: num(np.glint.tiltDxPerDy, 'Lean of the band: dx per dy (leaning "\\").'),
  },
};

// ---------- emitters ----------
const isLeaf = (o) => o && o.__leaf;
const walk = (node, fn, p = []) => { for (const k of Object.keys(node)) { const v = node[k]; if (isLeaf(v)) fn(p.concat(k), v); else walk(v, fn, p.concat(k)); } };
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function parseColor(c) {
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return { rgb: [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)), a: 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`unparsed colour ${c}`);
}
const hex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const dtcgColor = (c) => { const { rgb, a } = parseColor(c); return Object.assign({ colorSpace: 'srgb', components: rgb.map((v) => r4(v / 255)), hex: hex(rgb) }, a < 1 ? { alpha: a } : {}); };
const cssColor = (c) => { const { rgb, a } = parseColor(c); return a < 1 ? `rgba(${rgb.join(', ')}, ${a})` : hex(rgb); };
const gradientDir = (g) => (g.y1 === g.y2 || g.y1 === undefined ? '90deg' : 'to top right');
const px = (v) => ({ value: v, unit: 'px' });

function dtcg(leaf) {
  const v = leaf.value;
  switch (leaf.type) {
    case 'color': return { $type: 'color', $value: dtcgColor(v) };
    case 'gradient': return { $type: 'gradient', $value: v.stops.map(([p, c]) => ({ color: dtcgColor(c), position: p })),
      $extensions: { 'se.efn': { vector: { x1: v.x1, y1: v.y1, x2: v.x2, y2: v.y2 }, units: 'objectBoundingBox' } } };
    case 'dimension': return { $type: 'dimension', $value: px(v) };
    case 'em': return { $type: 'number', $value: v, $extensions: { 'se.efn': { unit: 'em' } } };
    case 'duration': return { $type: 'duration', $value: { value: v, unit: 'ms' } };
    case 'typography': return { $type: 'typography', $value: Object.assign({ fontFamily: v.fontFamily, fontWeight: v.fontWeight, fontSize: px(v.fontSize), lineHeight: 1 },
      v.letterSpacing !== undefined ? { letterSpacing: px(v.letterSpacing) } : { letterSpacing: px(0) }) };
    case 'shadow': {
      const one = (q) => Object.assign({ color: dtcgColor(q.color), offsetX: px(q.offsetX), offsetY: px(q.offsetY), blur: px(q.blur), spread: px(q.spread) }, q.inset ? { inset: true } : {});
      return { $type: 'shadow', $value: Array.isArray(v) ? v.map(one) : one(v) };
    }
    default: return { $type: leaf.type, $value: v };   // number, fontFamily, fontWeight, cubicBezier
  }
}

function css(leaf) {
  const v = leaf.value;
  switch (leaf.type) {
    case 'color': return [['', cssColor(v)]];
    case 'gradient': return [['', `linear-gradient(${gradientDir(v)}, ${v.stops.map(([p, c]) => `${cssColor(c)} ${r4(p * 100)}%`).join(', ')})`]];
    case 'dimension': return [['', `${v}px`]];
    case 'em': return [['', `${v}em`]];
    case 'duration': return [['', `${v}ms`]];
    case 'cubicBezier': return [['', `cubic-bezier(${v.join(', ')})`]];
    case 'fontFamily': return [['', v.join(', ')]];
    case 'typography': return [['-family', v.fontFamily.join(', ')], ['-weight', String(v.fontWeight)], ['-size', `${v.fontSize}px`]]
      .concat(v.letterSpacing !== undefined ? [['-letter-spacing', `${v.letterSpacing}px`]] : []);
    case 'shadow': return [['', [].concat(v).map((q) => `${q.inset ? 'inset ' : ''}${q.offsetX}px ${q.offsetY}px ${q.blur}px ${cssColor(q.color)}`).join(', ')]];
    default: return [['', String(v)]];
  }
}

const plain = (node) => { const o = {}; for (const k of Object.keys(node)) o[k] = isLeaf(node[k]) ? node[k].value : plain(node[k]); return o; };
const dtcgTree = (node) => {
  const o = {};
  for (const k of Object.keys(node)) {
    const v = node[k];
    o[k] = isLeaf(v) ? Object.assign(dtcg(v), v.description ? { $description: v.description } : {}) : dtcgTree(v);
  }
  return o;
};

const ABOUT = `EFN design tokens (efn-lower-thirds ${pkg.version}): the measured values of EFN's on-air graphics, named for building new ones. Generated by scripts/build-tokens.js from data/element-registry.json and data/design-tokens.json; do not edit by hand. px are on the 1920x1080 canvas.`;

const outputs = {};
outputs['src/design-tokens.js'] = `// ${ABOUT}\n// Plain values: colours are CSS colour strings, gradients { stops: [[offset, colour]], x1, y1, x2, y2 } (objectBoundingBox),\n// px and ms are numbers, em values are numbers. The same tokens in W3C DTCG format: tokens/efn.tokens.json; as CSS: tokens/efn.css.\nexport const designTokens = ${JSON.stringify(plain(tree), null, 2)};\n`;
{
  const tsType = (v, ind) => {
    if (Array.isArray(v)) return v.every((x) => typeof x === 'number') ? 'number[]' : v.every((x) => typeof x === 'string') ? 'string[]' : v.every(Array.isArray) ? 'Array<[number, string]>' : 'Shadow[]';
    if (v && typeof v === 'object' && 'offsetX' in v) return 'Shadow';
    if (v && typeof v === 'object') return v.stops ? 'Gradient' : `{\n${Object.keys(v).map((k) => `${ind}  ${k}: ${tsType(v[k], ind + '  ')};`).join('\n')}\n${ind}}`;
    return typeof v;
  };
  outputs['src/design-tokens.d.ts'] = '// Types for src/design-tokens.js. Generated by scripts/build-tokens.js; do not edit by hand.\n' +
    '/** A horizontal or diagonal plate gradient: stops [offset 0..1, colour], vector in objectBoundingBox units. */\n' +
    'export interface Gradient { stops: Array<[number, string]>; x1: number; y1: number; x2: number; y2: number; }\n' +
    '/** A shadow in CSS terms (px offsets, blur radius = 2 x the SVG stdDeviation); inset: inside the shape. */\n' +
    'export interface Shadow { color: string; offsetX: number; offsetY: number; blur: number; spread: number; inset?: boolean; }\n' +
    `/** ${ABOUT} */\nexport declare const designTokens: ${tsType(plain(tree), '')};\n`;
}
outputs['tokens/efn.tokens.json'] = JSON.stringify(Object.assign({ $description: ABOUT }, dtcgTree(tree)), null, 2) + '\n';
{
  const lines = [];
  walk(tree, (p, leaf) => {
    for (const [suffix, value] of css(leaf)) lines.push(`  --efn-${p.map(kebab).join('-')}${suffix}: ${value};`);
  });
  outputs['tokens/efn.css'] = `/* ${ABOUT} */\n:root {\n${lines.join('\n')}\n}\n`;
}
outputs['tokens/fonts.css'] = `/* AkkuratStd from the efn-lower-thirds package (licensed font: keep within EFN). font-display: block, so graphics never show a fallback font. */\n` +
  [['400', 'normal', 'akkuratstd-400.woff'], ['400', 'italic', 'akkuratstd-400i.woff'], ['700', 'normal', 'akkuratstd-700.woff']]
    .map(([w, st, f]) => `@font-face { font-family: AkkuratStd; font-weight: ${w}; font-style: ${st}; font-display: block; src: url('../assets/fonts/${f}') format('woff'); }`).join('\n') + '\n';

const check = process.argv.includes('--check');
let stale = 0;
for (const [rel, text] of Object.entries(outputs)) {
  const file = path.join(ROOT, rel);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (check) { if (current !== text) { stale++; console.error(`${rel} is out of date: run npm run build`); } continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
if (check) { if (!stale) console.log('design tokens are up to date'); process.exit(stale ? 1 : 0); }
let count = 0; walk(tree, () => count++);
console.log(`design tokens: ${count} tokens -> ${Object.keys(outputs).join(', ')}`);
