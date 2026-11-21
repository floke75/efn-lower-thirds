// EFN lower-third renderer: builds the plates' SVG markup from the component registry and design tokens.
//
// Pure ES module: no file system, no DOM. It runs in the browser (an OGraf graphic sizing its plates from the
// text at runtime) and in Node (scripts/build-svgs.js). Everything it needs is passed in:
//
//   import { createRenderer } from './src/lower-third.js';
//   const r = createRenderer({ registry, tokens, efnLogoSvg, wordmarks, idPrefix });
//     registry    data/element-registry.json (parsed)
//     tokens      data/design-tokens.json (parsed)
//     efnLogoSvg  text of assets/logos/EFN_logo.svg
//     wordmarks   { <logo-box variant id>: text of its assets/wordmarks/*.svg }
//     idPrefix    prefix for every SVG id this renderer emits. Use a distinct one per renderer when several SVGs
//                 are inlined in the same HTML document (ids are document-global there).
//     refinements EFN's additions to the measured look (tokens.refinements): text shading and the beige plates'
//                 vignette. Default true; false draws the exact Flowics replica.
//
//   r.plate(component, width, x, y, { defs })   one plate: fill + rims + glint, masked by its silhouette
//   r.composite(content, { measureText })       the full lower third as one fluid SVG document
//   r.elements()                                every plate at its Flowics size, [{ file, svg }]
//
// Geometry: lib/roundedSkewedCardPathUniform.js. px are 1x on the 1920x1080 canvas.
import { roundedSkewedCardPathUniform, cardCorners } from '../lib/roundedSkewedCardPathUniform.js';

// Plain ES2018 on purpose (no ??, ?., Object.fromEntries, matchAll): runs in Chromium/CEF 69+ playout engines.
const def = (v, d) => (v === undefined || v === null ? d : v);
const fromEntries = (pairs) => pairs.reduce((o, kv) => { o[kv[0]] = kv[1]; return o; }, {});
const allMatches = (s, re) => { const out = []; let m; re.lastIndex = 0; while ((m = re.exec(s))) out.push(m); return out; };

export const f2 = (n) => +(+n).toFixed(2);
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (t) => esc(t).replace(/"/g, '&quot;');   // for values inside "..." attributes

const EDGES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['TL', 'TR', 'BR', 'BL'];
const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const Vec = { add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }), sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }), mul: (a, k) => ({ x: a.x * k, y: a.y * k }),
  dot: (a, b) => a.x * b.x + a.y * b.y, len: (a) => Math.hypot(a.x, a.y), unit: (a) => { const l = Math.hypot(a.x, a.y); return { x: a.x / l, y: a.y / l }; } };
const tanSkew = (shape) => Math.tan((shape.skewDeg * Math.PI) / 180);
const slantsLeft = (shape) => ['right', 'middle'].includes(shape.position);
const slantsRight = (shape) => ['left', 'middle'].includes(shape.position);

// ---------- geometry (pure) ----------
// Visible geometry {X, Y, W, H} of a component's shape placed with its box top-left at (x, y), box width w.
// y is the top of the component's box; shape.insetTop/height place the plate inside it. Slanted sides are pushed
// out by shape.slantOutsetPx and straight sides pulled in by shape.straightInsetPx (both measured on the
// Flowics original), so Flowics box coordinates produce the same visible edges.
export function geom(shape, w, x = 0, y = 0, { height } = {}) {
  const o = shape.slantOutsetPx || {};
  const lo = slantsLeft(shape) ? (o.left || 0) : 0;
  const ro = slantsRight(shape) ? (o.right || 0) : 0;
  const si = shape.straightInsetPx || {};
  const li = lo ? 0 : (si.left || 0), ri = ro ? 0 : (si.right || 0);
  return { X: x - lo + li, Y: y + (height == null ? (shape.insetTop || 0) : 0), W: w + lo + ro - li - ri, H: def(height, shape.height) };
}
const rawPath = (shape, X, Y, W, H, radius) => roundedSkewedCardPathUniform({ width: W, height: H, skewDeg: shape.skewDeg, position: shape.position, radius: def(radius, shape.radius), angleComp: shape.angleComp })
  .replace(/(-?\d+\.\d+),(-?\d+\.\d+)/g, (m, a, b) => `${f2(+a + X)},${f2(+b + Y)}`);
// SVG path data of a component's shape at box width w, box top-left (x, y).
export function shapePath(shape, w, x = 0, y = 0, { height, radius } = {}) {
  const { X, Y, W, H } = geom(shape, w, x, y, { height });
  return rawPath(shape, X, Y, W, H, radius);
}
// Horizontal run of a slanted edge over the shape's height.
export const slantOffset = (shape, h) => def(h, shape.height) * tanSkew(shape);
// The same shape with ONLY one edge moved inward by `delta` (negative = outward); the other three edges stay on
// their lines, so "edge pushed out" + "edge pulled in" (even-odd) is a clean band along that edge.
function edgeMovedPath(shape, g, edge, delta) {
  const t = tanSkew(shape), lS = slantsLeft(shape), rS = slantsRight(shape);
  let { X, Y, W, H } = g;
  if (edge === 'top') { Y += delta; H -= delta; if (rS) W -= delta * t; }
  else if (edge === 'bottom') { H -= delta; if (lS) { X += delta * t; W -= delta * t; } }
  else if (edge === 'left') { X += delta; W -= delta; }
  else if (edge === 'right') { W -= delta; }
  return rawPath(shape, X, Y, W, H);
}
// The shape with EVERY edge moved inward by its own depth (slanted edges kept on parallel lines) and the corner
// radius reduced: the concentric inset used for continuous rim rings.
function insetPath(shape, g, dep, radius) {
  const t = tanSkew(shape), lS = slantsLeft(shape), rS = slantsRight(shape);
  let { X, Y, W, H } = g;
  Y += dep.top; H -= dep.top; if (rS) W -= dep.top * t;
  H -= dep.bottom; if (lS) { X += dep.bottom * t; W -= dep.bottom * t; }
  X += dep.left; W -= dep.left + dep.right;
  return rawPath(shape, X, Y, W, H, Math.max(0, radius));
}
// Corner geometry of the visible shape (same construction as roundedSkewedCardPathUniform): per corner the sharp
// point P, tangent points A (incoming edge) and B (outgoing edge), circle-equivalent centre C and both edges'
// outward normals. Corner order TL, TR, BR, BL; edges top, right, bottom, left.
export function cornerGeom(shape, g) {
  const pts = cardCorners(g.W, g.H, shape.skewDeg, shape.position).map(p => ({ x: p.x + g.X, y: p.y + g.Y }));
  const outN = (p, q) => { const e = Vec.unit(Vec.sub(q, p)); return { x: e.y, y: -e.x }; };   // clockwise polygon, y down
  return pts.map((P, i) => {
    const prev = pts[(i + 3) % 4], next = pts[(i + 1) % 4];
    const dA = Vec.unit(Vec.sub(prev, P)), dB = Vec.unit(Vec.sub(next, P));
    const theta = Math.acos(Math.max(-1, Math.min(1, Vec.dot(dA, dB))));
    const tLen = Math.min(shape.radius * Math.pow(1 / Math.tan(theta / 2), def(shape.angleComp, 1)), Vec.len(Vec.sub(prev, P)) / 2, Vec.len(Vec.sub(next, P)) / 2);
    const bis = Vec.unit(Vec.add(dA, dB));
    return { P, A: Vec.add(P, Vec.mul(dA, tLen)), B: Vec.add(P, Vec.mul(dB, tLen)), C: Vec.add(P, Vec.mul(bis, shape.radius / Math.sin(theta / 2))),
      nA: outN(prev, P), nB: outN(P, next) };
  });
}

// Vignette profile as an feFuncA lookup table. Input: the shape's alpha blurred along one axis with sigma, which at
// distance d inside a straight edge is 1 - Phi(-d / sigma) (<= 0.5 at or outside the edge). Output: profile(d),
// with d = 0 at and outside the edge.
const erf = (x) => {   // Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7)
  const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
};
const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function vignetteTable(sigma, profile, n = 128) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const r = 1 - k / (n - 1);
    let d;
    if (r <= 0) d = Infinity;
    else if (r >= 0.5) d = 0;
    else { let lo = 0, hi = 12; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (normCdf(-mid) > r) lo = mid; else hi = mid; } d = sigma * (lo + hi) / 2; }
    out.push(+Math.max(0, profile(d)).toFixed(4));
  }
  return out.join(' ');
}

// Rims extend BLEED px beyond the true edge so edge pixels are fully the rim colour; the anti-aliased silhouette
// mask then cuts the plate once (stacking anti-aliased masks per edge leaks rim colours into the other edges).
const BLEED = 2;

// ---------- renderer ----------
export function createRenderer({ registry: REG, tokens: TOK, efnLogoSvg = null, wordmarks = {}, idPrefix = '', refinements = true }) {
  const comp = (id) => REG.components.find(c => c.id === id);
  const id = (name) => `${idPrefix}${name}`;
  let uid = 0;
  const nid = (p) => `${idPrefix}${p}${++uid}`;
  const resetIds = () => { uid = 0; };
  const RF = refinements === false ? null : (TOK.refinements || null);

  // ---------- refinements: text shading ----------
  // Two SVG filters (light text, dark text): a soft ambient and a tight contact shadow, the light caught by each
  // glyph's top-left inner edge (rim) and a slight darkening of its bottom-right inner edge (shade). Parameters:
  // tokens.refinements.textLight / textDark. textFilters must be in the defs of any document that uses textAttr().
  function textFilter(name, p) {
    const drop = (k) => { const q = p[k]; return `<feGaussianBlur in="SourceAlpha" stdDeviation="${q.blur}"/><feOffset dx="${q.dx}" dy="${q.dy}" result="${k}A"/><feFlood flood-color="${q.color}" flood-opacity="${q.opacity}"/><feComposite in2="${k}A" operator="in" result="${k}"/>`; };
    const band = (k) => { const q = p[k]; return `<feOffset in="SourceAlpha" dx="${q.dx}" dy="${q.dy}" result="${k}S"/><feComposite in="SourceAlpha" in2="${k}S" operator="out"/><feGaussianBlur stdDeviation="${q.blur}"/><feComposite in2="SourceAlpha" operator="in" result="${k}A"/><feFlood flood-color="${q.color}" flood-opacity="${q.opacity}"/><feComposite in2="${k}A" operator="in" result="${k}"/>`; };
    // a layer that is missing (or has opacity 0) is left out of the filter, e.g. dark text has no inner shade
    const on = (k) => !!(p[k] && p[k].opacity > 0);
    const node = (k) => (on(k) ? `<feMergeNode in="${k}"/>` : '');
    return `<filter id="${id(name)}" x="-15%" y="-35%" width="130%" height="185%" color-interpolation-filters="sRGB">` +
      ['ambient', 'contact'].filter(on).map(drop).join('') + ['rim', 'shade'].filter(on).map(band).join('') +
      `<feMerge>${node('ambient')}${node('contact')}<feMergeNode in="SourceGraphic"/>${node('shade')}${node('rim')}</feMerge></filter>`;
  }
  const textFilters = RF ? textFilter('textLight', RF.textLight) + textFilter('textDark', RF.textDark) : '';
  // filter attribute for a text element: kind 'light' (on navy, red, value boxes) or 'dark' (on beige)
  const textAttr = (kind) => (RF ? ` filter="url(#${id(kind === 'dark' ? 'textDark' : 'textLight')})"` : '');
  const useTextFilters = (defs) => { if (RF && defs && defs.indexOf(textFilters) < 0) defs.push(textFilters); };
  // Weight of bold dark text (title, ticker names). Flowics: 700. Refinement: a lighter weight thickened by a stroke
  // in the text colour (tokens.refinements.darkText: weight, strokeEm), so the shading doesn't make it look heavy.
  const darkWeight = (sizePx, color) => {
    const dt = RF && RF.darkText;
    if (!dt) return ' font-weight="700"';
    const sw = +(sizePx * dt.strokeEm).toFixed(3);
    return ` font-weight="${dt.weight}"` + (sw > 0 ? ` stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"` : '');
  };

  // ---------- paint ----------
  const stops = (arr) => arr.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  function fillPaint(fill, defs) {
    if (!fill) return '#000';
    if (fill.type === 'solid') return fill.color;
    if (fill.type === 'linearGradient') {   // stops + vector; objectBoundingBox = scales with the plate
      const gid = nid('g');
      defs.push(`<linearGradient id="${gid}" gradientUnits="${fill.units || 'objectBoundingBox'}" x1="${fill.x1}" y1="${fill.y1}" x2="${fill.x2}" y2="${fill.y2}">${stops(fill.stops)}</linearGradient>`);
      return `url(#${gid})`;
    }
    if (fill.color && !fill.gradient) return fill.color;
    const tokenName = fill.token && fill.token.split('.').pop();
    const t = tokenName && TOK.fills[tokenName];
    if (typeof t === 'string') return t;
    if (t && (t.stops || t.approxStops)) {
      let s = t.stops || t.approxStops;
      if (fill.mirrored) s = [...s].reverse().map(([o, c]) => [f2(1 - o), c]);
      const gid = nid('g'); defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">${stops(s)}</linearGradient>`);
      return `url(#${gid})`;
    }
    return '#000';
  }

  // Continuous rim rings with direction-dependent colour (registry bevel + bevel.corners + bevel.along).
  // The bevel behaves like directional light: the rim colour depends on the edge normal, and around a rounded
  // corner it changes continuously. Layer k = one ring of even thickness (outer bleed minus the concentric inset
  // at that layer's per-edge depth), painted deepest first. Inside each ring: zones along the straight edges
  // (edge colour + measured variation along the edge) and, in each corner, a gradient along the corner chord whose
  // stops follow the measured per-angle colours, corrected so both ends equal the adjacent zones (no seam).
  function rimRings(shape, gm, bevel, defs) {
    const N = Math.max(...EDGES.map(e => (bevel[e] || []).length));
    if (!N) return '';
    const cg = cornerGeom(shape, gm);
    const layerOf = (e, k) => { const L = bevel[e] || []; return L.length ? L[Math.min(k, L.length - 1)] : { depth: 0, color: '#000000' }; };
    const D = Math.max(...EDGES.flatMap(e => (bevel[e] || []).map(l => l.depth))) + 1.5, EPS = 0.75;
    const pt = (p) => `${f2(p.x)},${f2(p.y)}`;
    const outer = insetPath(shape, gm, { top: -BLEED, right: -BLEED, bottom: -BLEED, left: -BLEED }, shape.radius + BLEED);
    // straight zones: edge j runs from corner j (its B point) to corner j+1 (its A point)
    const zones = EDGES.map((e, j) => {
      const s = cg[j].B, en = cg[(j + 1) % 4].A, u = Vec.unit(Vec.sub(en, s)), n = cg[j].nB;
      const s2 = Vec.sub(s, Vec.mul(u, EPS)), e2 = Vec.add(en, Vec.mul(u, EPS));
      return { edge: e, poly: [Vec.add(s2, Vec.mul(n, BLEED)), Vec.add(e2, Vec.mul(n, BLEED)), Vec.sub(e2, Vec.mul(n, D)), Vec.sub(s2, Vec.mul(n, D))] };
    });
    const cornerPolys = cg.map(c => [Vec.add(c.A, Vec.mul(c.nA, BLEED)), Vec.add(c.P, Vec.mul(Vec.add(c.nA, c.nB), BLEED)), Vec.add(c.B, Vec.mul(c.nB, BLEED)),
      Vec.sub(c.B, Vec.mul(c.nB, D)), c.C, Vec.sub(c.A, Vec.mul(c.nA, D))]);
    // corner stop positions along the chord A->B for each measured angle, on the arc of radius rho (each ring lies
    // on its own, smaller radius)
    const cornerStops = (i, rho) => {
      const m = bevel.corners[CORNERS[i]]; if (!m) return null;
      const c = cg[i], AB = Vec.sub(c.B, c.A), L2 = Vec.dot(AB, AB);
      let last = 0;
      return m.samples.map(s => {
        const a = (s.angle * Math.PI) / 180, q = Vec.add(c.C, Vec.mul({ x: Math.cos(a), y: -Math.sin(a) }, rho));
        const p = Math.max(last, Math.min(1, Math.max(0, Vec.dot(Vec.sub(q, c.A), AB) / L2))); last = p;
        return { p, colors: s.colors };
      });
    };
    const EDGE_A = { TL: 'left', TR: 'top', BR: 'right', BL: 'bottom' }, EDGE_B = { TL: 'top', TR: 'right', BR: 'bottom', BL: 'left' };
    let out = '';
    for (let k = N - 1; k >= 0; k--) {
      const dep = fromEntries(EDGES.map(e => [e, layerOf(e, k).depth]));
      const meanDep = EDGES.reduce((a, e) => a + dep[e], 0) / 4;
      const cid = nid('ring');
      defs.push(`<clipPath id="${cid}"><path clip-rule="evenodd" d="${outer} ${insetPath(shape, gm, dep, shape.radius - meanDep)}"/></clipPath>`);
      let gk = '';
      // colour along a straight edge: the layer colour plus the variation measured along the edge (inner layers
      // pick up the plate gradient towards the ends)
      const alongColor = (edge, q) => {
        const al = bevel.along && bevel.along[edge] && bevel.along[edge].samples;
        const base = hex2rgb(layerOf(edge, k).color);
        if (!al || !al.length) return base;
        const kk = (x) => hex2rgb(x.colors[Math.min(k, x.colors.length - 1)]);
        const mid = al.filter(x => x.t >= 0.3 && x.t <= 0.7);
        const ref = [0, 1, 2].map(c => mid.reduce((a, x) => a + kk(x)[c], 0) / mid.length);
        return base.map((v, c) => v + kk(q)[c] - ref[c]);
      };
      zones.forEach((z, j) => {
        const al = bevel.along && bevel.along[z.edge] && bevel.along[z.edge].samples;
        if (!al || !al.length) { gk += `<polygon points="${z.poly.map(pt).join(' ')}" fill="${layerOf(z.edge, k).color}"/>`; return; }
        const s0 = cg[j].B, s1 = cg[(j + 1) % 4].A, zid = nid('zg');
        defs.push(`<linearGradient id="${zid}" gradientUnits="userSpaceOnUse" x1="${f2(s0.x)}" y1="${f2(s0.y)}" x2="${f2(s1.x)}" y2="${f2(s1.y)}">` +
          al.map(q => `<stop offset="${q.t}" stop-color="${rgb2hex(alongColor(z.edge, q))}"/>`).join('') + `</linearGradient>`);
        gk += `<polygon points="${z.poly.map(pt).join(' ')}" fill="url(#${zid})"/>`;
      });
      // colour of a straight zone at one end of its segment (t=0 start / t=1 end), for seamless corner ends
      const zoneEnd = (edge, atEnd) => {
        const al = bevel.along && bevel.along[edge] && bevel.along[edge].samples;
        if (!al || !al.length) return hex2rgb(layerOf(edge, k).color);
        return alongColor(edge, atEnd ? al[al.length - 1] : al[0]);
      };
      CORNERS.forEach((cn, i) => {
        // ring k's colour sits between depth k-1 and k: map angles on that mid-depth radius
        const dk = (layerOf(EDGE_A[cn], k).depth + layerOf(EDGE_B[cn], k).depth) / 2;
        const dk1 = k ? (layerOf(EDGE_A[cn], k - 1).depth + layerOf(EDGE_B[cn], k - 1).depth) / 2 : 0;
        const st = cornerStops(i, Math.max(0.5, shape.radius - (dk + dk1) / 2)); if (!st || !st.length) return;
        // corner i: A = end of the incoming edge's segment, B = start of the outgoing edge's segment
        const ca = zoneEnd(EDGE_A[cn], true), cb = zoneEnd(EDGE_B[cn], false);
        const sc = (s) => hex2rgb(s.colors[Math.min(k, s.colors.length - 1)]);
        const d0 = ca.map((v, j) => v - sc(st[0])[j]), d1 = cb.map((v, j) => v - sc(st[st.length - 1])[j]);
        const gid = nid('cg'), c = cg[i];
        defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f2(c.A.x)}" y1="${f2(c.A.y)}" x2="${f2(c.B.x)}" y2="${f2(c.B.y)}">` +
          st.map(s => `<stop offset="${+s.p.toFixed(4)}" stop-color="${rgb2hex(sc(s).map((v, j) => v + d0[j] * (1 - s.p) + d1[j] * s.p))}"/>`).join('') + `</linearGradient>`);
        gk += `<polygon data-corner="${cn}:${k}" points="${cornerPolys[i].map(pt).join(' ')}" fill="url(#${gid})"/>`;
      });
      out += `<g data-rim-ring="${k}" clip-path="url(#${cid})">${gk}</g>`;
    }
    return out;
  }

  // One plate: fill (+ glitter texture) + rims + glint, cut by its anti-aliased silhouette. Returns markup and
  // pushes its <defs> entries into `defs`. Overrides: fill, bevel, glint, shape (e.g. a variant's own values).
  function plate(c, w, x, y, { fill = c.fill, bevel = c.bevel, glint = c.glint, shape = c.shape, height, defs, glintTo }) {
    const gm = geom(shape, w, x, y, { height });
    const d = rawPath(shape, gm.X, gm.Y, gm.W, gm.H);
    const paint = fillPaint(fill, defs);
    const box = `x="${f2(x - 6)}" y="${f2(y - 6)}" width="${f2(w + 12)}" height="${f2(def(height, shape.height) + 12 + (shape.insetTop || 0))}"`;
    const sil = nid('sil');
    defs.push(`<mask id="${sil}" maskUnits="userSpaceOnUse" ${box}><path d="${d}" fill="#fff"/></mask>`);
    let g = `<path d="${d}" fill="${paint}"/>`;
    const vg = RF && RF.vignette && RF.vignette.components.indexOf(c.id) >= 0 ? RF.vignette : null;
    if (fill && fill.texture && fill.texture.type === 'glitter') {
      // Gold glitter: two grey fractal-noise layers (fine grain + coarse mottling) added to the fill, clipped to
      // the shape. Frequencies/amplitudes calibrated to the Nobel video's texture statistics.
      const t = fill.texture, fid = nid('glitter'), [s1, s2] = t.seeds || [7, 3];
      const gray = '1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1';
      defs.push(`<filter id="${fid}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="${t.fineBaseFrequency}" numOctaves="2" seed="${s1}" result="n1"/><feColorMatrix in="n1" type="matrix" values="${gray}" result="g1"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency="${t.coarseBaseFrequency}" numOctaves="2" seed="${s2}" result="n2"/><feColorMatrix in="n2" type="matrix" values="${gray}" result="g2"/>` +
        `<feComposite in="g1" in2="g2" operator="arithmetic" k1="0" k2="${t.fineAmplitude}" k3="${t.coarseAmplitude}" k4="${f2(0.5 - (t.fineAmplitude + t.coarseAmplitude) / 2)}" result="noise"/>` +
        `<feComposite in="SourceGraphic" in2="noise" operator="arithmetic" k1="0" k2="1" k3="1" k4="-0.5" result="sum"/>` +
        `<feComposite in="sum" in2="SourceAlpha" operator="in"/></filter>`);
      g = `<path d="${d}" fill="${paint}" filter="url(#${fid})"/>`;
    }
    if (vg) {
      // Refinement: the plate's own colour burnt in towards the edges: a contrast curve (gamma) that darkens it and a
      // saturation boost, so the sand gets deeper and richer rather than greyer.
      // Edge mask, at distance d from the nearest edge, in two parts that add up to `opacity` at the edge:
      //   ramp: (1 - edgeShare) x (1 - d / width)^curve   a long, gentle build-up over `width` px
      //   edge: edgeShare x exp(-d / edgeWidth)           the last few px, where it rises to full strength
      // so the burn stays gradual until close to the edge. The distance comes from the shape's alpha blurred along
      // one axis at a time (horizontal for the left/right and slanted edges, vertical for top/bottom), read through
      // lookup tables that turn the blurred value back into distance and apply the profile. The axes are combined
      // with max(), so a corner is never stronger than the edges beside it (a 2D blur burns corners in more); a
      // light blur rounds the ramp's mitre where the axes meet. dx/dy shift the axes towards the light.
      // It sits under the narrow rims.
      const vid = nid('vig'), W0 = vg.width, sig = W0 / 2.4, m = W0 + Math.abs(vg.dx) + Math.abs(vg.dy) + 2;
      const share = def(vg.edgeShare, 0), ew = def(vg.edgeWidth, 2), curve = def(vg.curve, 1);
      const rampT = vignetteTable(sig, (dd) => (1 - share) * Math.pow(Math.max(0, 1 - dd / W0), curve));
      const edgeT = vignetteTable(sig, (dd) => (share > 0 ? share * Math.exp(-dd / ew) : 0));
      const toGrey = '<feColorMatrix values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1"/>';
      // Each axis: blurred alpha (outside the plate it reads as "at the edge", so the smoothing blur doesn't weaken
      // the edge) -> each table -> grey.
      const axis = (k, sd, dx, dy) => `<feGaussianBlur in="SourceAlpha" stdDeviation="${sd}" result="${k}b"/><feOffset in="${k}b" dx="${dx}" dy="${dy}" result="${k}o"/>` +
        `<feComponentTransfer in="${k}o"><feFuncA type="table" tableValues="${rampT}"/></feComponentTransfer>${toGrey.replace('/>', ` result="${k}r"/>`)}` +
        `<feComponentTransfer in="${k}o"><feFuncA type="table" tableValues="${edgeT}"/></feComponentTransfer>${toGrey.replace('/>', ` result="${k}e"/>`)}`;
      defs.push(`<filter id="${vid}" filterUnits="userSpaceOnUse" x="${f2(gm.X - m)}" y="${f2(gm.Y - m)}" width="${f2(gm.W + 2 * m)}" height="${f2(gm.H + 2 * m)}" color-interpolation-filters="sRGB">` +
        axis('mx', `${f2(sig)} 0`, vg.dx, 0) + axis('my', `0 ${f2(sig)}`, 0, vg.dy) +
        `<feBlend in="mxr" in2="myr" mode="lighten"/><feGaussianBlur stdDeviation="${f2(def(vg.cornerSoftness, 3))}" result="ramp"/>` +
        '<feBlend in="mxe" in2="mye" mode="lighten" result="edgeband"/>' +
        '<feComposite in="ramp" in2="edgeband" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>' +
        `<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${vg.opacity} 0 0 0 0"/><feComposite in2="SourceAlpha" operator="in" result="edge"/>` +
        `<feComponentTransfer in="SourceGraphic">${['R', 'G', 'B'].map((ch) => `<feFunc${ch} type="gamma" amplitude="1" exponent="${vg.burn}" offset="0"/>`).join('')}</feComponentTransfer>` +
        `<feColorMatrix type="saturate" values="${vg.saturate}"/><feComposite in2="edge" operator="in"/></filter>`);
      g += `<path data-refinement="vignette" d="${d}" fill="${paint}" filter="url(#${vid})"/>`;
    }
    if (bevel && bevel.corners) g += rimRings(shape, gm, bevel, defs);
    else for (const edge of ['top', 'left', 'right', 'bottom']) {   // fallback: per-edge bands (no corner data)
      const layers = [...((bevel && bevel[edge]) || [])].sort((a, b) => b.depth - a.depth);
      if (!layers.length) continue;
      const outer = edgeMovedPath(shape, gm, edge, -BLEED);
      for (const L of layers) {
        g += `<path data-rim="${edge}:${L.depth}" fill-rule="evenodd" d="${outer} ${edgeMovedPath(shape, gm, edge, L.depth)}" fill="${L.color}"/>`;
      }
    }
    if (glint && glint.sigmaPx) {
      // White band with gaussian profile (sigma), tilted (dx/dy), travelling linearly from centreFromPx to
      // centreToPx (relative to the box left) while its opacity follows the measured envelope. SMIL, 15 s loop.
      const gid = nid('glint'), sig = glint.sigmaPx, ext = sig * 2.6, midY = gm.Y + gm.H / 2, L = glint.loopS || 15, k = (s) => f2(s / L);
      const st = Array.from({ length: 13 }, (_, i) => { const dd = -ext + (i * 2 * ext) / 12; return [f2((dd + ext) / (2 * ext)), Math.exp(-(dd * dd) / (2 * sig * sig))]; });
      defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">${st.map(([o, a]) => `<stop offset="${o}" stop-color="#fff" stop-opacity="${+a.toFixed(4)}"/>`).join('')}</linearGradient>`);
      const x0 = f2(x + glint.centreFromPx), x1 = f2(x + glint.centreToPx);
      const skew = +(Math.atan(glint.tiltDxPerDy || 0) * 180 / Math.PI).toFixed(2);
      const gl = `<g class="glint" transform="translate(0,${f2(midY)}) skewX(${skew}) translate(0,${f2(-midY)})"><g opacity="0">` +
        `<rect x="${f2(-ext)}" y="${f2(gm.Y - 2)}" width="${f2(2 * ext)}" height="${f2(gm.H + 4)}" fill="url(#${gid})"/>` +
        `<animateTransform attributeName="transform" type="translate" values="${x0};${x0};${x1};${x1}" keyTimes="0;${k(glint.visibleFromS)};${k(glint.visibleToS)};1" dur="${L}s" repeatCount="indefinite"/>` +
        (glint.envelope
          ? `<animate attributeName="opacity" values="0;${glint.envelope.map(e => e[1]).join(';')};0" keyTimes="0;${glint.envelope.map(e => k(e[0])).join(';')};1" dur="${L}s" repeatCount="indefinite"/></g></g>`
          : `<animate attributeName="opacity" values="0;0;${glint.peakOpacity};0;0" keyTimes="0;${k(glint.visibleFromS)};${k(glint.peakAtS)};${k(glint.visibleToS)};1" dur="${L}s" repeatCount="indefinite"/></g></g>`);
      // glintTo: the glint goes into its own markup (same silhouette mask), e.g. for a separately composited layer,
      // so its animation doesn't make the browser redraw the plate (and its filters) every frame.
      if (glintTo) glintTo.push(`<g data-glint="${c.id}" mask="url(#${sil})">${gl}</g>`);
      else g += gl;
    }
    return `<g data-component="${c.id}" mask="url(#${sil})">${g}</g>`;
  }

  // ---------- logos ----------
  // Filters in canvas px (the logo <path> is scaled inside an unscaled <g>, so offsets stay in px).
  //  logoBevel     EFN logo (white on navy): 1px white inner edge top/left + ~1px hard black edge below (offset y+1).
  //  wordmarkInset logo-box wordmarks: letters #ebebeb + ~0.6px light-pink (#ffe0e3) inner edge bottom/right
  //                (no dark outer edge: scored against the Flowics frames, it makes the letter edges too dark).
  const logoFilters = `<filter id="${id('logoBevel')}" x="-10%" y="-20%" width="120%" height="150%" color-interpolation-filters="sRGB">
<feOffset in="SourceAlpha" dx="0.3" dy="1" result="off"/><feGaussianBlur in="off" stdDeviation="0.3" result="offb"/>
<feFlood flood-color="#000"/><feComposite in2="offb" operator="in" result="shadow"/>
<feOffset in="SourceAlpha" dx="0.5" dy="0.8" result="sh"/><feComposite in="SourceAlpha" in2="sh" operator="out" result="edgeTL"/>
<feFlood flood-color="#fff"/><feComposite in2="edgeTL" operator="in" result="hl"/>
<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/><feMergeNode in="hl"/></feMerge></filter>
<filter id="${id('wordmarkInset')}" x="-5%" y="-10%" width="110%" height="120%" color-interpolation-filters="sRGB">
<feOffset in="SourceAlpha" dx="-0.6" dy="-0.6" result="up"/><feComposite in="SourceAlpha" in2="up" operator="out" result="edgeBR"/>
<feFlood flood-color="#ffe0e3"/><feComposite in2="edgeBR" operator="in" result="light"/>
<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="light"/></feMerge></filter>`;
  const EFN_PATH = efnLogoSvg ? efnLogoSvg.match(/ d="([^"]+)"/)[1] : null;
  const EFN_BBOX = comp('logo-line-logo').layout.logoBBoxInSvg;
  // EFN logo fitted (contain) into the box x, y, w, h. Needs logoFilters in the document's defs.
  function efnLogo(x, y, w, h, fill = '#ebebeb') {
    if (!EFN_PATH) throw new Error('createRenderer: efnLogoSvg was not provided');
    const sc = Math.min(w / EFN_BBOX.w, h / EFN_BBOX.h);
    const ox = x + (w - EFN_BBOX.w * sc) / 2 - EFN_BBOX.x * sc, oy = y + (h - EFN_BBOX.h * sc) / 2 - EFN_BBOX.y * sc;
    return shadeLogo(`<g data-component="logo-line-logo" filter="url(#${id('logoBevel')})"><path d="${EFN_PATH}" fill="${fill}" transform="translate(${f2(ox)},${f2(oy)}) scale(${+sc.toFixed(5)})"/></g>`);
  }
  // Refinement: logos get the light-text shading on top of their measured treatment (needs textFilters in defs).
  const shadeLogo = (markup) => (RF && markup ? `<g data-refinement="logo-shading"${textAttr('light')}>${markup}</g>` : markup);
  // Client wordmark of a logo-box variant, placed in the box at (bx, by) with its fitted transform, on-air fill
  // and inset treatment. "" when no wordmark was supplied for the variant. Needs logoFilters in the defs.
  function wordmark(v, bx, by) {
    const cw = v.clientWordmark;
    if (!cw || !cw.supplied || !cw.placement) return '';
    const txt = wordmarks[v.id];
    if (!txt) throw new Error(`createRenderer: wordmarks.${v.id} (${cw.file}) was not provided`);
    const d = allMatches(txt, /<path\b[^>]*?\bd="([^"]+)"/g).map(m => m[1]).join(' ');
    if (!d) throw new Error('no path data in ' + cw.file);
    const p = cw.placement;
    return shadeLogo(`<g data-slot="wordmark" data-wordmark="${v.id}" filter="url(#${id('wordmarkInset')})"><path d="${d}" fill="${comp('logo-box').wordmark.fill}" transform="translate(${f2(bx + p.tx)},${f2(by + p.ty)}) scale(${p.scale})"/></g>`);
  }

  // ---------- documents ----------
  const FONT_CSS = (rel) => `<style>
@font-face{font-family:AkkuratStd;font-weight:700;src:url('${rel}/akkuratstd-700.woff') format('woff')}
@font-face{font-family:AkkuratStd;font-weight:400;src:url('${rel}/akkuratstd-400.woff') format('woff')}
@font-face{font-family:AkkuratStd;font-weight:400;font-style:italic;src:url('${rel}/akkuratstd-400i.woff') format('woff')}
text{font-family:AkkuratStd,Arial,sans-serif}</style>`;
  // A complete <svg> document. fontsUrl: folder of the AkkuratStd woff files (omit when the page loads the fonts).
  // fluid: no fixed width/height, so the SVG fills its viewport (1080p, UHD, ... from the same markup).
  const svgDocument = (w, h, defs, body, { fontsUrl, fluid = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" ${fluid ? 'width="100%" height="100%"' : `width="${f2(w)}" height="${f2(h)}"`} viewBox="0 0 ${f2(w)} ${f2(h)}"><defs>${fontsUrl ? FONT_CSS(fontsUrl) : ''}${defs.join('')}</defs>${body}</svg>\n`;

  // ---------- text sizing ----------
  // Title box (Flowics rule): 0.5em + text advance + 0.8em; the slant is not added.
  const titleWidth = (textW) => { const tt = comp('title-plate').text, s = tt.effectiveSizePx; return tt.linePaddingEm.left * s + textW + tt.linePaddingEm.right * s; };
  // Name plate: PROVISIONAL responsive rule. Flowics keeps 588.5 px and shrinks the text; here the plate keeps
  // at least that width and grows with the text (padding 0.15em each side plus the slanted edge's run).
  const namePlateWidth = (textW) => { const np = comp('name-plate'), t = np.text, s = t.effectiveSizePx; return Math.max(np.flowicsSize.w, t.linePaddingEm.left * s + textW + t.linePaddingEm.right * s + slantOffset(np.shape)); };
  // Without a measureText hook (e.g. Node) text advances are estimated; "EFN" was measured at 42 px.
  const estimateWidth = (text, size) => (text === 'EFN' ? 81.8 : text.length * 0.62 * 42) * size / 42;

  // ---------- name strap: name plate + title plate on one row ----------
  // Returns the four parts separately so a graphic can animate them, plus the layout it used:
  //   { namePlate, nameText, titlePlate, titleText, layout }   (titlePlate/titleText are '' when title is '')
  // content: { name, title }. options: measureText (sizes the plates from the text, see composite()),
  //          separateGlint (the name plate's glint is returned as nameGlint instead of inside namePlate),
  //          row: 'own' (y 880.41, above the main row) | 'main' (y 956.01, in place of the logo box), defs.
  // Fitting (with measureText): the name plate keeps at least its Flowics width and grows with the name; the
  // title box hugs its text (0.5em + text + 0.8em). If both don't fit between the safe edges, the title keeps up
  // to 40% of the row and the fonts shrink to fit, as Flowics' fitOneLine / fitContainer do.
  function nameStrap(content = {}, { measureText, row = 'own', defs, separateGlint = false } = {}) {
    const rows = REG.rows, np = comp('name-plate'), tp = comp('title-plate');
    const t = np.text, tt = tp.text, nfs0 = t.effectiveSizePx, tfs0 = tt.effectiveSizePx;
    const y = row === 'main' ? rows.mainRow.y : rows.ownRow.y;
    const name = def(content.name, ''), title = def(content.title, '');
    const x0 = np.layout.x, right = rows.safeRight, overlap = REG.adjacentPlateOverlapPx;
    const padN = (t.linePaddingEm.left + t.linePaddingEm.right) * nfs0 + slantOffset(np.shape);
    const padT = (tt.linePaddingEm.left + tt.linePaddingEm.right) * tfs0;
    const nameAdv = measureText ? measureText(name, { weight: t.weight, sizePx: nfs0 }) : null;
    const titleAdv = !title ? 0 : measureText ? measureText(title, { weight: RF && RF.darkText ? RF.darkText.weight : tt.weight, sizePx: tfs0 }) : estimateWidth(title, tfs0);
    let nameW = measureText ? namePlateWidth(nameAdv) : np.flowicsSize.w, nfs = nfs0, tfs = tfs0, tw = title ? padT + titleAdv : 0;
    if (measureText) {
      const avail = right - x0 + (title ? overlap : 0);
      const nameMax = title ? Math.max(np.flowicsSize.w, avail - Math.min(tw, avail * 0.4)) : avail;
      if (nameW > nameMax) { nameW = nameMax; nfs = nfs0 * Math.min(1, (nameW - padN) / nameAdv); }
      const titleRoom = avail - nameW;
      if (title && tw > titleRoom) { const s = titleRoom / (padT + titleAdv); tfs = tfs0 * s; tw = titleRoom; }
    }
    const glints = separateGlint ? [] : null;
    const out = { namePlate: plate(np, nameW, x0, y, { defs, glintTo: glints }), titlePlate: '', titleText: '' };
    if (glints) out.nameGlint = glints.join('');
    useTextFilters(defs);
    out.nameText = `<text data-slot="name" x="${f2(x0 + t.linePaddingEm.left * nfs0)}" y="${f2(y + t.box.y + t.box.h / 2)}" dominant-baseline="central" font-weight="700" font-size="${f2(nfs)}" fill="${t.color}"${textAttr('light')}>${esc(name)}</text>`;
    const layout = { y, name: { x: x0, w: nameW, textBoxW: nameW - 13.5, fontPx: f2(nfs) }, title: null };
    if (title) {
      const tx = x0 + nameW - overlap;   // = 595.0 in Flowics: the title starts 4.5 px before the name box ends
      const ty = y + tp.layout.yOffsetInRow;
      out.titlePlate = plate(tp, tw, tx, ty, { defs });
      out.titleText = `<text data-slot="title" x="${f2(tx + tt.linePaddingEm.left * tfs)}" y="${f2(ty + tp.shape.insetTop + tp.shape.height / 2)}" dominant-baseline="central"${darkWeight(tfs, tt.color)} font-size="${f2(tfs)}" fill="${tt.color}"${textAttr('dark')}>${esc(title)}</text>`;
      layout.title = { x: tx, y: ty, w: tw, elementW: right - tx, fontPx: f2(tfs) };
    }
    out.layout = layout;
    return out;
  }

  // ---------- logo box + ticker on the main row ----------
  // Returns the parts separately so a graphic can animate them, plus the layout it used:
  //   { logoPlate, wordmark, tickerPlate, tickerClip, pages, layout }
  // content: { logo (logo-box variant id), pages: [[row, row, row, row], ...] } (rows as in the feed, see
  //          sampleTickerPayload). pages[i] is the markup of page i: 4 column ramps plus each row's value box and
  //          texts, as Flowics' list item holds them. options: defs (receives the parts' <defs> entries),
  //          separateGlint (the logo box's glint is returned as logoGlint instead of inside logoPlate).
  // The ticker starts 4.5 px before the logo box ends and runs to the safe right edge. tickerClip is the id of a
  // clipPath (pushed to defs) with the ticker plate's silhouette: Flowics clips all column content to it.
  // Column geometry (ramps, value-box fades) is the same on every page, so its defs are made once.
  function logoTicker(content = {}, { defs, separateGlint = false } = {}) {
    const rows = REG.rows, lb = comp('logo-box'), y = rows.mainRow.y;
    const logoId = def(content.logo, 'borslunch'), pages = def(content.pages, []);
    const v = lb.variants.find(x => x.id === logoId);
    if (!v) throw new Error(`unknown logo-box variant "${logoId}"`);
    const lx = lb.layout.x, lw = v.flowicsSize.w;
    const out = {};
    const glints = separateGlint ? [] : null;
    out.logoPlate = plate(lb, lw, lx, y, Object.assign({ defs, glintTo: glints }, v.fill ? { fill: v.fill } : {}, v.bevel ? { bevel: v.bevel } : {}));
    if (glints) out.logoGlint = glints.join('');
    out.wordmark = wordmark(v, lx, y);
    if (out.wordmark && defs.indexOf(logoFilters) < 0) defs.push(logoFilters);   // the wordmark's inset filter
    if (out.wordmark) useTextFilters(defs);                                         // and its shading (refinements)
    const tk = comp('ticker-plate');
    const tx = lx + lw - REG.adjacentPlateOverlapPx;   // = 341.5 in Flowics (BÖRSLUNCH)
    const tw = rows.safeRight - tx;
    out.tickerPlate = plate(tk, tw, tx, y, { defs });
    const col = comp('ticker-column'), vb = comp('ticker-value-box'), ramp = comp('ticker-column-ramp'), ts = col.text;
    const listX = tx + col.layout.listInsetFromPlate.x, listY = y + col.layout.listInsetFromPlate.y, listW = rows.safeRight - listX, listH = col.layout.listHeight;
    const colW = listW / 4;
    defs.push(`<linearGradient id="${id('rampg')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ramp.fill.color}" stop-opacity="0"/><stop offset="1" stop-color="${ramp.fill.color}" stop-opacity="1"/></linearGradient>`,
      `<filter id="${id('vshadow')}" x="-5%" y="-20%" width="110%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-color="#000" flood-opacity="0.5"/></filter>`);
    // Flowics masks the whole list with the ticker's hard mask: nothing in the columns paints outside the plate.
    out.tickerClip = nid('tclip');
    defs.push(`<clipPath id="${out.tickerClip}"><path d="${shapePath(tk.shape, tw, tx, y)}"/></clipPath>`);
    if (pages.length) useTextFilters(defs);
    const columns = pages.length ? [0, 1, 2, 3].map((i) => {
      const cx = listX + i * colW;
      // ramp: 235 wide, right-anchored in a rect that starts 2px below the list top; gradient 46.4%..89.5% of the column
      const rx = cx + colW - ramp.size.w, ry = listY + 2;
      const g0 = (cx + colW * 0.464 - rx) / ramp.size.w, g1 = (cx + colW * 0.895 - rx) / ramp.size.w;
      const gid = nid('rg'); defs.push(`<linearGradient id="${gid}" x1="${f2(Math.max(0, g0))}" y1="0" x2="${f2(g1)}" y2="0"><stop offset="0" stop-color="${ramp.fill.color}" stop-opacity="0"/><stop offset="1" stop-color="${ramp.fill.color}" stop-opacity="1"/></linearGradient>`);
      // last column: straight right edge with rounded right corners instead of the slanted ramp
      const rs = i === 3 ? ramp.lastColumn.shape : ramp.shape;
      // value box: 195.5 x 34.7 at 97% of the free space, faded in from the left of the column
      const bx = cx + (colW - vb.size.w) * 0.97, by = listY + vb.layout.yOffsetInColumn;
      const mid = nid('vm'), fid = nid('vf');
      const s0 = (cx + colW * 0.515 - bx) / vb.size.w;
      defs.push(`<linearGradient id="${fid}" x1="0" y1="0" x2="1" y2="0"><stop offset="${f2(Math.max(0, s0))}" stop-color="#fff" stop-opacity="${s0 < 0 ? f2(-s0 / (1 - s0)) : 0}"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>`,
        `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${f2(bx)}" y="${f2(by)}" width="${vb.size.w}" height="${vb.size.h}"><rect x="${f2(bx)}" y="${f2(by)}" width="${vb.size.w}" height="${vb.size.h}" fill="url(#${fid})"/></mask>`);
      return { cx, ramp: `<path data-component="ticker-column-ramp" d="${shapePath(rs, ramp.size.w, rx, ry)}" fill="url(#${gid})"/>`, boxPath: shapePath(vb.shape, vb.size.w, bx, by), mask: mid };
    }) : [];
    // Per column: ramp, value box, short name, value, long name. With refinements the texts of a page are shaded
    // as two groups (dark names, light values) instead of one filter per text: the columns never overlap, so it
    // looks the same at a fraction of the drawing work.
    const shortText = (c, row, shade) => `<text data-slot="short" x="${f2(c.cx + ts.short.linePaddingEm.left * 32)}" y="${f2(listY + ts.short.linePaddingEm.top * 32 + 32)}"${darkWeight(32, ts.short.color)} font-size="32" fill="${ts.short.color}"${shade ? textAttr('dark') : ''}>${esc(def(row['Kort namn'], ''))}</text>`;
    // value: the Flowics drop shadow, or with refinements the light-text shading (which includes its shadow)
    const valueText = (c, row, shade) => `<text data-slot="value" x="${f2(c.cx + colW - ts.value.linePaddingEm.right * 32)}" y="${f2(listY + ts.value.linePaddingEm.top * 32 + 32)}" text-anchor="end" font-weight="700" font-size="32" fill="#fff"${RF ? (shade ? textAttr('light') : '') : ` filter="url(#${id('vshadow')})"`}>${esc(def(row['Procent string'], ''))}</text>`;
    const longText = (c, row, shade) => (row['Eget namn'] ? `<text data-slot="long" x="${f2(c.cx + ts.long.linePaddingEm.left * 18)}" y="${f2(listY + listH - 9)}" font-weight="400" font-size="18" fill="${ts.long.color}"${shade ? textAttr('dark') : ''}>${esc(row['Eget namn'])}</text>` : '');
    const box = (c, row) => (row['Color value'] ? `<path data-component="ticker-value-box" d="${c.boxPath}" fill="${escAttr(row['Color value'])}" mask="url(#${c.mask})"/>` : '');
    out.pages = pages.map((page) => {
      if (!RF) return columns.map((c, i) => { const row = page[i]; return row ? c.ramp + box(c, row) + shortText(c, row, true) + valueText(c, row, true) + longText(c, row, true) : c.ramp; }).join('');
      let under = '', dark = '', light = '';
      columns.forEach((c, i) => {
        const row = page[i];
        under += c.ramp + (row ? box(c, row) : '');
        if (row) { dark += shortText(c, row, false) + longText(c, row, false); light += valueText(c, row, false); }
      });
      return under + (dark ? `<g data-shade="dark"${textAttr('dark')}>${dark}</g>` : '') + (light ? `<g data-shade="light"${textAttr('light')}>${light}</g>` : '');
    });
    out.layout = { y, logo: { x: lx, w: lw, variant: v.id }, ticker: { x: tx, w: tw }, list: { x: listX, y: listY, w: listW, h: listH, colW } };
    return out;
  }

  // ---------- plate styles: the measured looks at any size ----------
  // Each style is the fill, rims and glint of a measured plate. stylePlate() draws one on a shape of any width,
  // height, slant and radius, filling exactly x..x+width, y..y+height (the Flowics box corrections are dropped).
  // Rims keep their measured px depths at every size; the glint travel scales with the width.
  const STYLES = {
    navy: ['name-plate'], location: ['location-plate'], red: ['logo-box'], gold: ['logo-box', 'nobel'],
    beige: ['ticker-plate'], 'beige-light': ['title-plate'], 'line-left': ['logo-line-left'], 'line-right': ['logo-line-right'],
  };
  // slant: which sides are slanted -> the geometry's `position` (named after the straight side's placement)
  const SLANTS = { right: 'left', left: 'right', both: 'middle', none: 'none' };
  const POSITION_SLANT = { left: 'right', right: 'left', middle: 'both', none: 'none' };
  const plateStyles = Object.keys(STYLES);
  function plateStyle(name) {
    const s = STYLES[name];
    if (!s) throw new Error(`unknown plate style "${name}" (one of ${plateStyles.join(', ')})`);
    const c = comp(s[0]), v = s[1] ? c.variants.find((x) => x.id === s[1]) : null;
    const textColor = (c.text && c.text.color) || TOK.typography[name === 'beige' ? 'tickerShort' : 'location'].color;
    return { component: c, fill: (v && v.fill) || c.fill, bevel: (v && v.bevel) || c.bevel, glint: c.glint && c.glint.sigmaPx ? c.glint : null,
      slant: POSITION_SLANT[c.shape.position], radius: c.shape.radius, height: c.shape.height, textColor };
  }
  // options: width (required), height (default: the style's measured plate height), x, y, slant ('right' | 'left'
  // | 'both' | 'none', default: the style's own), radius, glint (true: the style's glint, if it has one), defs.
  function stylePlate(name, { width, height, x = 0, y = 0, slant, radius, glint = false, defs } = {}) {
    const st = plateStyle(name), c = st.component;
    if (!(width > 0)) throw new Error('stylePlate: width must be a positive number');
    if (!defs) throw new Error('stylePlate: options.defs (an array) is required');
    const position = SLANTS[def(slant, st.slant)];
    if (!position) throw new Error(`unknown slant "${slant}" (right, left, both or none)`);
    const h = def(height, st.height);
    const shape = Object.assign({}, c.shape, { position, radius: def(radius, st.radius), insetTop: 0, height: h, slantOutsetPx: {}, straightInsetPx: {} });
    const g = glint && st.glint ? Object.assign({}, st.glint, { centreFromPx: st.glint.centreRelative[0] * width, centreToPx: st.glint.centreRelative[1] * width }) : null;
    return plate(c, width, x, y, { defs, shape, fill: st.fill, bevel: st.bevel, glint: g });
  }
  // One styled plate as a complete SVG document of width x height (fluid: fills its container instead).
  function plateSvg(name, options = {}) {
    resetIds();
    const defs = [], h = def(options.height, plateStyle(name).height);
    const body = stylePlate(name, Object.assign({}, options, { x: 0, y: 0, height: h, defs }));
    return svgDocument(options.width, h, defs, body, { fluid: !!options.fluid });
  }

  // ---------- full lower third ----------
  // content: { name, title, logo (logo-box variant id), page (4 ticker rows), clock, date }
  // options: measureText(text, { weight, sizePx }) -> advance in px (browser: canvas measureText) sizes the
  //          name and title plates from the text; without it the Flowics widths are used.
  //          fontsUrl (default '../../assets/fonts', right for dist/preview), fluid (default true).
  function composite(content = {}, { measureText, fontsUrl = '../../assets/fonts', fluid = true } = {}) {
    resetIds();
    const defs = [logoFilters];
    let body = '';
    const rows = REG.rows;
    const name = def(content.name, 'Namn Efternamn'), title = def(content.title, 'EFN'), logoId = def(content.logo, 'borslunch'), page = def(content.page, []);
    // back gradient
    { const L = comp('logo-line-back-gradient').layout;
      defs.push(`<linearGradient id="${id('backgrad')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`);
      body += `<rect data-component="logo-line-back-gradient" x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" fill="url(#${id('backgrad')})"/>`; }
    // name + title
    { const ns = nameStrap({ name, title }, { measureText, row: 'own', defs });
      body += ns.namePlate + ns.nameText + ns.titlePlate + ns.titleText; }
    // logo box + ticker
    { const lt = logoTicker({ logo: logoId, pages: page.length ? [page] : [] }, { defs });
      body += lt.logoPlate + lt.wordmark + lt.tickerPlate + `<g data-group="ticker-columns" clip-path="url(#${lt.tickerClip})">${lt.pages.join('')}</g>`; }
    // logo line
    { const L = comp('logo-line-left'), R = comp('logo-line-right'), y = rows.logoLine.y;
      body += plate(L, L.layout.w, L.layout.x, y, { defs });
      body += plate(R, R.layout.w, R.layout.x, y, { defs });
      const lg = comp('logo-line-logo').layout; body += efnLogo(lg.x + 2, lg.y + 1, lg.w - 4, lg.h - 2);
      body += `<text data-slot="clock" x="${f2(L.layout.x + L.text.offsetX)}" y="${f2(y + 18.5)}" dominant-baseline="central" font-weight="700" font-size="23" fill="${L.text.color}"${textAttr('light')}>${esc(def(content.clock, ''))}</text>`;
      body += `<text data-slot="date" x="${f2(R.layout.x + R.layout.w - R.text.insetRight)}" y="${f2(y + 18.5)}" text-anchor="end" dominant-baseline="central" font-weight="700" font-size="23" fill="${R.text.color}"${textAttr('light')}>${esc(def(content.date, ''))}</text>`;
      useTextFilters(defs); }
    return svgDocument(1920, 1080, defs, body, { fontsUrl, fluid });
  }

  // ---------- base elements at Flowics size ----------
  // Every plate at the width it has in Flowics, without text: [{ file, svg }].
  function elements() {
    const out = [];
    const list = [];
    const el = (file, c, w, opts = {}) => list.push([file, c, w, opts]);
    el('name-plate.svg', comp('name-plate'), 588.5);
    el('title-plate.svg', comp('title-plate'), 136.4); // example width: "EFN" at 42px + 0.5em + 0.8em
    for (const v of comp('logo-box').variants) el(`logo-box--${v.id}.svg`, comp('logo-box'), v.flowicsSize.w, { ...(v.fill ? { fill: v.fill } : {}), ...(v.bevel ? { bevel: v.bevel } : {}), wordmark: v });
    for (const v of comp('ticker-plate').variants) el(`ticker-plate--${v.id}.svg`, comp('ticker-plate'), v.flowicsSize.w);
    el('location-plate.svg', comp('location-plate'), 963);
    el('location-plate--split-right.svg', comp('location-plate'), 963, { shape: comp('location-plate').shapeSplitRight });
    el('logo-line-left.svg', comp('logo-line-left'), 906);
    el('logo-line-right.svg', comp('logo-line-right'), 907);
    for (const [file, c, w, opts] of list) {
      resetIds(); const defs = [];
      const shape = opts.shape || c.shape;
      let body = plate(c, w, 0, 0, { ...opts, defs });
      if (opts.wordmark) { const wm = wordmark(opts.wordmark, 0, 0); if (wm) { defs.push(logoFilters); useTextFilters(defs); body += wm; } }
      out.push({ file, svg: svgDocument(w, def(c.boxHeight, (shape.insetTop || 0) + shape.height), defs, body) });
    }
    // value boxes (feed colours) and column ramps
    const c = comp('ticker-value-box');
    for (const [k, color] of Object.entries(TOK.ticker.valueColors)) {
      resetIds(); const defs = [];
      const { w, h } = c.size; const d = shapePath(c.shape, w, 0, 0);
      defs.push(`<linearGradient id="${id('vfade')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.515" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="${id('vm')}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="url(#${id('vfade')})"/></mask>`);
      out.push({ file: `ticker-value-box--${k.split(' ')[0]}.svg`, svg: svgDocument(w, h, defs, `<path data-component="ticker-value-box" d="${d}" fill="${color}" mask="url(#${id('vm')})"/>`) });
    }
    const r = comp('ticker-column-ramp');
    for (const [file, sh] of [['ticker-column-ramp.svg', r.shape], ['ticker-column-ramp--last.svg', r.lastColumn.shape]]) {
      const w = 235, h = r.shape.height + 2 * r.shape.insetTop, defs = [];
      const d = shapePath(sh, w, 0, 0);
      defs.push(`<linearGradient id="${id('ramp')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${r.fill.color}" stop-opacity="0"/><stop offset="1" stop-color="${r.fill.color}" stop-opacity="1"/></linearGradient>`);
      out.push({ file, svg: svgDocument(w, h, defs, `<path data-component="ticker-column-ramp" d="${d}" fill="url(#${id('ramp')})"/>`) });
    }
    { const defs = [logoFilters]; useTextFilters(defs); out.push({ file: 'logo-line-logo.svg', svg: svgDocument(86, 37, defs, efnLogo(2, 1, 82, 35)) }); }
    return out;
  }

  return { comp, resetIds, refinements: RF, textFilters, textAttr, plate, plateStyles, plateStyle, stylePlate, plateSvg, logoFilters, efnLogo, wordmark, svgDocument, titleWidth, namePlateWidth, nameStrap, logoTicker, composite, elements,
    geom, shapePath, slantOffset, cornerGeom };
}
