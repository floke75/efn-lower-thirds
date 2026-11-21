// Build the EFN lower-third SVGs from data/element-registry.json + data/design-tokens.json.
// Shapes come from lib/roundedSkewedCardPathUniform.js (slant + corner rounding) with the registry's parameters;
// rims, fills, glint and logo treatments are rendered from the registry/token values.
//
// Outputs (dist/, not committed):
//   elements/<component-id>[--variant].svg   plates at their Flowics size (no text)
//   preview/on-air-capture.svg                full lower third with sample content (fluid: renders at any size)
//   preview/<name>.svg                        same, with your own content (--data <json> --name <name>)
// --data JSON: { clock, date, page: [4 ticker rows as in data/samples/ticker-payload.json] }
// Usage: node scripts/build-svgs.js [--data content.json --name my-preview]
const fs = require('fs'), path = require('path');
const { roundedSkewedCardPathUniform } = require('../lib/roundedSkewedCardPathUniform.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const REG = require(path.join(ROOT, 'data', 'element-registry.json'));
const TOK = require(path.join(ROOT, 'data', 'design-tokens.json'));
const payload = require(path.join(ROOT, 'data', 'samples', 'ticker-payload.json'));
const argv = process.argv.slice(2), argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const previewData = argOf('--data') ? JSON.parse(fs.readFileSync(argOf('--data'), 'utf8')) : null;
const comp = (id) => REG.components.find(c => c.id === id);

const f2 = (n) => +(+n).toFixed(2);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- shapes ----------
// Path for a component's shape at width w, placed with its bounding box top-left at (x, y).
// y is the top of the component's box; shape.insetTop/height shift the actual shape inside it.
// Slanted sides are pushed out by shape.slantOutsetPx (measured Flowics overshoot), so that Flowics box
// coordinates produce the same visible edges.
// Visible geometry of a component placed at (x, y) with box width w: {X, Y, W, H} of the drawn shape.
function geom(shape, w, x = 0, y = 0, { height } = {}) {
  const o = shape.slantOutsetPx || {};
  const lo = ['right', 'middle'].includes(shape.position) ? (o.left || 0) : 0;
  const ro = ['left', 'middle'].includes(shape.position) ? (o.right || 0) : 0;
  const si = shape.straightInsetPx || {};
  const li = lo ? 0 : (si.left || 0), ri = ro ? 0 : (si.right || 0);
  return { X: x - lo + li, Y: y + (height == null ? (shape.insetTop || 0) : 0), W: w + lo + ro - li - ri, H: height ?? shape.height };
}
const rawPath = (shape, X, Y, W, H, radius) => roundedSkewedCardPathUniform({ width: W, height: H, skewDeg: shape.skewDeg, position: shape.position, radius: radius ?? shape.radius, angleComp: shape.angleComp })
  .replace(/(-?\d+\.\d+),(-?\d+\.\d+)/g, (m, a, b) => `${f2(+a + X)},${f2(+b + Y)}`);
function shapePath(shape, w, x = 0, y = 0, { height, radius } = {}) {
  const { X, Y, W, H } = geom(shape, w, x, y, { height });
  return rawPath(shape, X, Y, W, H, radius);
}
// The same shape with ONLY one edge moved inward by `delta` (negative = outward). The other three edges stay
// exactly on their original lines (slanted edges are kept on their line by adjusting x/width), so a path made of
// "edge pushed out" + "edge pulled in" (even-odd) is a clean band along that one edge.
function edgeMovedPath(shape, g, edge, delta) {
  const t = Math.tan((shape.skewDeg * Math.PI) / 180);
  const lS = ['right', 'middle'].includes(shape.position), rS = ['left', 'middle'].includes(shape.position);
  let { X, Y, W, H } = g;
  if (edge === 'top') { Y += delta; H -= delta; if (rS) W -= delta * t; }
  else if (edge === 'bottom') { H -= delta; if (lS) { X += delta * t; W -= delta * t; } }
  else if (edge === 'left') { X += delta; W -= delta; }
  else if (edge === 'right') { W -= delta; }
  return rawPath(shape, X, Y, W, H);
}
const slantOffset = (shape, h) => (h ?? shape.height) * Math.tan((shape.skewDeg * Math.PI) / 180);

// The shape with EVERY edge moved inward by its own depth (slanted edges kept on parallel lines, horizontal
// shift as measured) and the corner radius reduced -> concentric inset used for continuous rim rings.
function insetPath(shape, g, dep, radius) {
  const t = Math.tan((shape.skewDeg * Math.PI) / 180);
  const lS = ['right', 'middle'].includes(shape.position), rS = ['left', 'middle'].includes(shape.position);
  let { X, Y, W, H } = g;
  Y += dep.top; H -= dep.top; if (rS) W -= dep.top * t;
  H -= dep.bottom; if (lS) { X += dep.bottom * t; W -= dep.bottom * t; }
  X += dep.left; W -= dep.left + dep.right;
  return rawPath(shape, X, Y, W, H, Math.max(0, radius));
}
// Corner geometry of the visible shape (same construction as roundedSkewedCardPathUniform): per corner the sharp
// point P, tangent points A (on the incoming edge) and B (on the outgoing edge), circle-equivalent centre C, and
// the outward normals of both edges. Corner order TL, TR, BR, BL; edges top, right, bottom, left.
const { cardCorners } = require('../lib/roundedSkewedCardPathUniform.js');
const Vec = { add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }), sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }), mul: (a, k) => ({ x: a.x * k, y: a.y * k }),
  dot: (a, b) => a.x * b.x + a.y * b.y, len: (a) => Math.hypot(a.x, a.y), unit: (a) => { const l = Math.hypot(a.x, a.y); return { x: a.x / l, y: a.y / l }; } };
function cornerGeom(shape, g) {
  const pts = cardCorners(g.W, g.H, shape.skewDeg, shape.position).map(p => ({ x: p.x + g.X, y: p.y + g.Y }));
  const outN = (p, q) => { const e = Vec.unit(Vec.sub(q, p)); return { x: e.y, y: -e.x }; };   // clockwise polygon, y down
  return pts.map((P, i) => {
    const prev = pts[(i + 3) % 4], next = pts[(i + 1) % 4];
    const dA = Vec.unit(Vec.sub(prev, P)), dB = Vec.unit(Vec.sub(next, P));
    const theta = Math.acos(Math.max(-1, Math.min(1, Vec.dot(dA, dB))));
    const tLen = Math.min(shape.radius * Math.pow(1 / Math.tan(theta / 2), shape.angleComp ?? 1), Vec.len(Vec.sub(prev, P)) / 2, Vec.len(Vec.sub(next, P)) / 2);
    const bis = Vec.unit(Vec.add(dA, dB));
    return { P, A: Vec.add(P, Vec.mul(dA, tLen)), B: Vec.add(P, Vec.mul(dB, tLen)), C: Vec.add(P, Vec.mul(bis, shape.radius / Math.sin(theta / 2))),
      nA: outN(prev, P), nB: outN(P, next) };
  });
}
const EDGES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['TL', 'TR', 'BR', 'BL'];
const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

// ---------- paint ----------
let uid = 0;
const nid = (p) => `${p}${++uid}`;
const stops = (arr) => arr.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
function fillPaint(fill, defs) {
  if (!fill) return '#000';
  if (fill.type === 'solid') return fill.color;
  if (fill.type === 'linearGradient') {   // measured (registry): stops + vector, objectBoundingBox = scales with the plate
    const id = nid('g');
    defs.push(`<linearGradient id="${id}" gradientUnits="${fill.units || 'objectBoundingBox'}" x1="${fill.x1}" y1="${fill.y1}" x2="${fill.x2}" y2="${fill.y2}">${stops(fill.stops)}</linearGradient>`);
    return `url(#${id})`;
  }
  if (fill.color && !fill.gradient) return fill.color;
  const tokenName = fill.token && fill.token.split('.').pop();
  const t = tokenName && TOK.fills[tokenName];
  if (typeof t === 'string') return t;
  if (t && (t.stops || t.approxStops)) {
    let s = t.stops || t.approxStops;
    if (fill.mirrored) s = [...s].reverse().map(([o, c]) => [f2(1 - o), c]);
    const id = nid('g'); defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops(s)}</linearGradient>`);
    return `url(#${id})`;
  }
  return '#000';
}

// Plate = fill + measured rims per edge + optional glint.
// Rim layer (edge E, depth d) = ONE even-odd path: [shape with E pushed out by BLEED] + [shape with E pulled
// in by d]. Both share the other three edges exactly, so they cancel analytically there (no leakage into the
// other edges' pixels), and the band follows E's rounded corners. Layers are painted deepest first.
// The 2px bleed beyond E guarantees the edge pixels are fully that rim's colour; the anti-aliased silhouette
// mask then cuts the plate once. (Stacked anti-aliased masks were tried first: they don't cancel at shared
// edges -- white then black at 25% coverage leaves ~19% -- and leaked every rim colour into the other edges.)
const BLEED = 2;

// Continuous rim rings with direction-dependent colour (registry bevel + bevel.corners).
// The source bevel behaves like directional light: the rim colour depends on the edge normal, and around a
// rounded corner it changes continuously (measured per angle by tools/measure_corner_rims.py).
// Layer k = one ring of even thickness (outer bleed minus the concentric inset at that layer's per-edge depth),
// painted deepest first. Inside each ring: solid zones on the straight edges (measured edge colours) and, in each
// corner, a gradient along the corner chord whose stops follow the measured per-angle colours, corrected so both
// ends equal the adjacent edges' colours exactly (no seam).
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
  // corner stop positions along the chord A->B for each measured angle, on the arc of radius rho (each ring
  // lies on its own, smaller radius: mapping with the outer radius would shift inner layers' colours along the arc)
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
    const dep = Object.fromEntries(EDGES.map(e => [e, layerOf(e, k).depth]));
    const meanDep = EDGES.reduce((a, e) => a + dep[e], 0) / 4;
    const cid = nid('ring');
    defs.push(`<clipPath id="${cid}"><path clip-rule="evenodd" d="${outer} ${insetPath(shape, gm, dep, shape.radius - meanDep)}"/></clipPath>`);
    let gk = '';
    // Colour along a straight edge: the pixel-row-accurate layer colour (measured mid-plate, t 0.3-0.7) plus the
    // VARIATION measured along the edge (inner layers pick up the plate gradient towards the ends).
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

function plate(c, w, x, y, { fill = c.fill, bevel = c.bevel, glint = c.glint, shape = c.shape, height, defs }) {
  const gm = geom(shape, w, x, y, { height });
  const d = rawPath(shape, gm.X, gm.Y, gm.W, gm.H);
  const paint = fillPaint(fill, defs);
  const box = `x="${f2(x - 6)}" y="${f2(y - 6)}" width="${f2(w + 12)}" height="${f2((height ?? shape.height) + 12 + (shape.insetTop || 0))}"`;
  const sil = nid('sil');
  defs.push(`<mask id="${sil}" maskUnits="userSpaceOnUse" ${box}><path d="${d}" fill="#fff"/></mask>`);
  let g = `<path d="${d}" fill="${paint}"/>`;
  if (fill && fill.texture && fill.texture.type === 'glitter') {
    // Gold glitter: two grey fractal-noise layers (fine grain + coarse mottling) added to the fill, clipped to
    // the shape. Frequencies/amplitudes calibrated to the Nobel video's high-pass std and autocorrelation.
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
    // Measured glint (registry .glint): white band with gaussian profile (sigma), tilted (dx/dy), travelling
    // linearly from centreFromPx to centreToPx (rel. to the box left) while its opacity ramps 0 -> peak -> 0.
    const gid = nid('glint'), sig = glint.sigmaPx, ext = sig * 2.6, midY = gm.Y + gm.H / 2, L = glint.loopS || 15, k = (s) => f2(s / L);
    const st = Array.from({ length: 13 }, (_, i) => { const d = -ext + (i * 2 * ext) / 12; return [f2((d + ext) / (2 * ext)), Math.exp(-(d * d) / (2 * sig * sig))]; });
    defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">${st.map(([o, a]) => `<stop offset="${o}" stop-color="#fff" stop-opacity="${+a.toFixed(4)}"/>`).join('')}</linearGradient>`);
    const x0 = f2(x + glint.centreFromPx), x1 = f2(x + glint.centreToPx);
    const skew = +(Math.atan(glint.tiltDxPerDy || 0) * 180 / Math.PI).toFixed(2);
    g += `<g class="glint" transform="translate(0,${f2(midY)}) skewX(${skew}) translate(0,${f2(-midY)})"><g opacity="0">` +
      `<rect x="${f2(-ext)}" y="${f2(gm.Y - 2)}" width="${f2(2 * ext)}" height="${f2(gm.H + 4)}" fill="url(#${gid})"/>` +
      `<animateTransform attributeName="transform" type="translate" values="${x0};${x0};${x1};${x1}" keyTimes="0;${k(glint.visibleFromS)};${k(glint.visibleToS)};1" dur="${L}s" repeatCount="indefinite"/>` +
      (glint.envelope
        ? `<animate attributeName="opacity" values="0;${glint.envelope.map(e => e[1]).join(';')};0" keyTimes="0;${glint.envelope.map(e => k(e[0])).join(';')};1" dur="${L}s" repeatCount="indefinite"/></g></g>`
        : `<animate attributeName="opacity" values="0;0;${glint.peakOpacity};0;0" keyTimes="0;${k(glint.visibleFromS)};${k(glint.peakAtS)};${k(glint.visibleToS)};1" dur="${L}s" repeatCount="indefinite"/></g></g>`);
  }
  return `<g data-component="${c.id}" mask="url(#${sil})">${g}</g>`;
}

// ---------- logos ----------
const efnSvg = fs.readFileSync(path.join(ROOT, comp('logo-line-logo').asset), 'utf8');
const EFN_PATH = efnSvg.match(/ d="([^"]+)"/)[1];
const EFN_BBOX = comp('logo-line-logo').layout.logoBBoxInSvg;
// Filters in canvas px (the logo <path> is scaled inside an unscaled <g>, so offsets stay in px).
//  logoBevel     EFN logo (white on navy): 1px white inner edge top/left + ~1px hard black edge below (offset y+1).
//  wordmarkInset logo-box wordmarks: letters #ebebeb + ~0.6px light-pink (#ffe0e3) inner edge bottom/right
//                (no dark outer edge: scored against the Flowics frames, it makes the letter edges too dark).
const LOGO_FILTERS = `<filter id="logoBevel" x="-10%" y="-20%" width="120%" height="150%" color-interpolation-filters="sRGB">
<feOffset in="SourceAlpha" dx="0.3" dy="1" result="off"/><feGaussianBlur in="off" stdDeviation="0.3" result="offb"/>
<feFlood flood-color="#000"/><feComposite in2="offb" operator="in" result="shadow"/>
<feOffset in="SourceAlpha" dx="0.5" dy="0.8" result="sh"/><feComposite in="SourceAlpha" in2="sh" operator="out" result="edgeTL"/>
<feFlood flood-color="#fff"/><feComposite in2="edgeTL" operator="in" result="hl"/>
<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/><feMergeNode in="hl"/></feMerge></filter>
<filter id="wordmarkInset" x="-5%" y="-10%" width="110%" height="120%" color-interpolation-filters="sRGB">
<feOffset in="SourceAlpha" dx="-0.6" dy="-0.6" result="up"/><feComposite in="SourceAlpha" in2="up" operator="out" result="edgeBR"/>
<feFlood flood-color="#ffe0e3"/><feComposite in2="edgeBR" operator="in" result="light"/>
<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="light"/></feMerge></filter>`;
function efnLogo(x, y, w, h, fill = '#ebebeb') {
  const sc = Math.min(w / EFN_BBOX.w, h / EFN_BBOX.h);
  const ox = x + (w - EFN_BBOX.w * sc) / 2 - EFN_BBOX.x * sc, oy = y + (h - EFN_BBOX.h * sc) / 2 - EFN_BBOX.y * sc;
  return `<g data-component="logo-line-logo" filter="url(#logoBevel)"><path d="${EFN_PATH}" fill="${fill}" transform="translate(${f2(ox)},${f2(oy)}) scale(${+sc.toFixed(5)})"/></g>`;
}

// Client wordmark (assets/wordmarks) placed with its fitted transform, measured on-air fill and inset treatment.
// Returns "" when no wordmark was supplied for the variant.
function wordmarkSvg(v, bx, by) {
  const cw = v.clientWordmark;
  if (!cw || !cw.supplied || !cw.placement) return '';
  const txt = fs.readFileSync(path.join(ROOT, cw.file), 'utf8');
  const d = [...txt.matchAll(/<path\b[^>]*?\bd="([^"]+)"/g)].map(m => m[1]).join(' ');
  if (!d) throw new Error('no path data in ' + cw.file);
  const p = cw.placement;
  return `<g data-slot="wordmark" data-wordmark="${v.id}" filter="url(#wordmarkInset)"><path d="${d}" fill="${comp('logo-box').wordmark.fill}" transform="translate(${f2(bx + p.tx)},${f2(by + p.ty)}) scale(${p.scale})"/></g>`;
}

// ---------- documents ----------
const FONT_CSS = (rel) => `<style>
@font-face{font-family:AkkuratStd;font-weight:700;src:url('${rel}/akkuratstd-700.woff') format('woff')}
@font-face{font-family:AkkuratStd;font-weight:400;src:url('${rel}/akkuratstd-400.woff') format('woff')}
@font-face{font-family:AkkuratStd;font-weight:400;font-style:italic;src:url('${rel}/akkuratstd-400i.woff') format('woff')}
text{font-family:AkkuratStd,Arial,sans-serif}</style>`;
// fluid=true: no fixed width/height -> the SVG fills its viewport (render at 1080p, UHD, ... from the same file)
const doc = (w, h, defs, body, fontRel, fluid = false) => `<svg xmlns="http://www.w3.org/2000/svg" ${fluid ? 'width="100%" height="100%"' : `width="${f2(w)}" height="${f2(h)}"`} viewBox="0 0 ${f2(w)} ${f2(h)}"><defs>${fontRel ? FONT_CSS(fontRel) : ''}${defs.join('')}</defs>${body}</svg>\n`;
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
fs.rmSync(OUT, { recursive: true, force: true });

// ---------- 1. base elements at Flowics size ----------
const elements = [];
const el = (file, c, w, opts = {}) => elements.push([file, c, w, opts]);
el('name-plate.svg', comp('name-plate'), 588.5);
el('title-plate.svg', comp('title-plate'), 136.4); // example width: "EFN" at 42px + 0.5em + 0.8em
for (const v of comp('logo-box').variants) el(`logo-box--${v.id}.svg`, comp('logo-box'), v.flowicsSize.w, { ...(v.fill ? { fill: v.fill } : {}), ...(v.bevel ? { bevel: v.bevel } : {}), wordmark: v });
for (const v of comp('ticker-plate').variants) el(`ticker-plate--${v.id}.svg`, comp('ticker-plate'), v.flowicsSize.w);
el('location-plate.svg', comp('location-plate'), 963);
el('location-plate--split-right.svg', comp('location-plate'), 963, { shape: comp('location-plate').shapeSplitRight });
el('logo-line-left.svg', comp('logo-line-left'), 906);
el('logo-line-right.svg', comp('logo-line-right'), 907);
for (const [file, c, w, opts] of elements) {
  uid = 0; const defs = [];
  const shape = opts.shape || c.shape;
  let body = plate(c, w, 0, 0, { ...opts, defs });
  if (opts.wordmark) { const wm = wordmarkSvg(opts.wordmark, 0, 0); if (wm) { defs.push(LOGO_FILTERS); body += wm; } }
  write(`elements/${file}`, doc(w, c.boxHeight ?? (shape.insetTop || 0) + shape.height, defs, body));
}
// value boxes (feed colours) and column ramps
{
  const c = comp('ticker-value-box');
  for (const [k, color] of Object.entries(TOK.ticker.valueColors)) {
    uid = 0; const defs = [];
    const { w, h } = c.size; const d = shapePath(c.shape, w, 0, 0);
    defs.push(`<linearGradient id="vfade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.515" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="vm" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="url(#vfade)"/></mask>`);
    write(`elements/ticker-value-box--${k.split(' ')[0]}.svg`, doc(w, h, defs, `<path data-component="ticker-value-box" d="${d}" fill="${color}" mask="url(#vm)"/>`));
  }
  const r = comp('ticker-column-ramp');
  for (const [file, sh] of [['ticker-column-ramp.svg', r.shape], ['ticker-column-ramp--last.svg', r.lastColumn.shape]]) {
    const w = 235, h = r.shape.height + 2 * r.shape.insetTop, defs = [];
    const d = shapePath(sh, w, 0, 0);
    defs.push(`<linearGradient id="ramp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${r.fill.color}" stop-opacity="0"/><stop offset="1" stop-color="${r.fill.color}" stop-opacity="1"/></linearGradient>`);
    write(`elements/${file}`, doc(w, h, defs, `<path data-component="ticker-column-ramp" d="${d}" fill="url(#ramp)"/>`));
  }
}
{ const defs = [LOGO_FILTERS]; write('elements/logo-line-logo.svg', doc(86, 37, defs, efnLogo(2, 1, 82, 35))); }

// ---------- 2. composite: full lower third with content ----------
// Name (own row) + title, logo box BÖRSLUNCH + ticker BÖRSLUNCH OPEN (first data page), logo line with clock/date.
function composite(content) {
uid = 0;
const defs = [LOGO_FILTERS];
let body = '';
const rows = REG.rows;
// back gradient
{ const L = comp('logo-line-back-gradient').layout;
  defs.push(`<linearGradient id="backgrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`);
  body += `<rect data-component="logo-line-back-gradient" x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" fill="url(#backgrad)"/>`; }
// name + title
{ const np = comp('name-plate'), y = rows.ownRow.y, w = np.flowicsSize.w;
  body += plate(np, w, np.layout.x, y, { defs });
  const t = np.text, fs_ = t.effectiveSizePx;
  body += `<text data-slot="name" x="${f2(np.layout.x + t.linePaddingEm.left * fs_)}" y="${f2(y + t.box.y + t.box.h / 2)}" dominant-baseline="central" font-weight="700" font-size="${fs_}" fill="${t.color}">Namn Efternamn</text>`;
  // title: left slanted edge parallel to the name plate's right edge, gap 3.8px; width hugs text
  const tp = comp('title-plate'), tt = tp.text, tfs = tt.effectiveSizePx, textW = 81.8 * tfs / 42; // "EFN" advance measured at 42px, scaled
  // Flowics rule: the next plate box starts adjacentPlateOverlapPx (4.5) before the previous box ends
  const tx = np.layout.x + w - REG.adjacentPlateOverlapPx;   // = 595.0 in Flowics
  // Flowics: box width = 0.5em + text advance + 0.8em (slant NOT added); text starts 0.5em from the box's bottom-left x
  const tw = tt.linePaddingEm.left * tfs + textW + tt.linePaddingEm.right * tfs;
  const ty = y + tp.layout.yOffsetInRow;
  body += plate(tp, tw, tx, ty, { defs });
  body += `<text data-slot="title" x="${f2(tx + tt.linePaddingEm.left * tfs)}" y="${f2(ty + tp.shape.insetTop + tp.shape.height / 2)}" dominant-baseline="central" font-weight="700" font-size="${tfs}" fill="${tt.color}">EFN</text>`; }
// logo box + ticker
{ const lb = comp('logo-box'), v = lb.variants.find(x => x.id === 'borslunch'), y = rows.mainRow.y;
  body += plate(lb, v.flowicsSize.w, lb.layout.x, y, { defs });
  const wm = lb.wordmark;
  body += wordmarkSvg(v, lb.layout.x, y);   // client wordmark, fitted placement + inset treatment
  const tk = comp('ticker-plate'), tv = tk.variants.find(x => x.id === 'borslunch');
  const tx = lb.layout.x + v.flowicsSize.w - REG.adjacentPlateOverlapPx;   // = 341.5 in Flowics
  const tw = REG.rows.safeRight - tx;
  body += plate(tk, tw, tx, y, { defs });
  // columns
  const col = comp('ticker-column'), vb = comp('ticker-value-box'), ramp = comp('ticker-column-ramp');
  const listX = tx + col.layout.listInsetFromPlate.x, listY = y + col.layout.listInsetFromPlate.y, listW = REG.rows.safeRight - listX, listH = col.layout.listHeight;
  const colW = listW / 4, page = content.page;
  defs.push(`<linearGradient id="rampg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ramp.fill.color}" stop-opacity="0"/><stop offset="1" stop-color="${ramp.fill.color}" stop-opacity="1"/></linearGradient>`,
    `<filter id="vshadow" x="-5%" y="-20%" width="110%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="1" flood-color="#000" flood-opacity="0.5"/></filter>`);
  // Flowics masks the whole list with the ticker's hard mask: nothing in the columns paints outside the plate.
  const tclip = nid('tclip');
  defs.push(`<clipPath id="${tclip}"><path d="${shapePath(tk.shape, tw, tx, y)}"/></clipPath>`);
  body += `<g data-group="ticker-columns" clip-path="url(#${tclip})">`;
  page.forEach((row, i) => {
    const cx = listX + i * colW;
    // ramp: 235 wide, right-anchored in a rect that starts 2px below the list top; gradient 46.4%..89.5% of the column
    const rx = cx + colW - ramp.size.w, ry = listY + 2;
    const g0 = (cx + colW * 0.464 - rx) / ramp.size.w, g1 = (cx + colW * 0.895 - rx) / ramp.size.w;
    const gid = nid('rg'); defs.push(`<linearGradient id="${gid}" x1="${f2(Math.max(0, g0))}" y1="0" x2="${f2(g1)}" y2="0"><stop offset="0" stop-color="${ramp.fill.color}" stop-opacity="0"/><stop offset="1" stop-color="${ramp.fill.color}" stop-opacity="1"/></linearGradient>`);
    // last column: END mask shape (straight right edge, rounded right corners) instead of the slanted one
    const rs = i === page.length - 1 ? ramp.lastColumn.shape : ramp.shape;
    body += `<path data-component="ticker-column-ramp" d="${shapePath(rs, ramp.size.w, rx, ry)}" fill="url(#${gid})"/>`;
    // value box: contain-fitted 195.5 x 34.7 at 97% of the free space, faded from the left of the column
    const bx = cx + (colW - vb.size.w) * 0.97, by = listY + vb.layout.yOffsetInColumn;
    const mid = nid('vm'), fid = nid('vf');
    const s0 = (cx + colW * 0.515 - bx) / vb.size.w;
    defs.push(`<linearGradient id="${fid}" x1="0" y1="0" x2="1" y2="0"><stop offset="${f2(Math.max(0, s0))}" stop-color="#fff" stop-opacity="${s0 < 0 ? f2(-s0 / (1 - s0)) : 0}"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>`,
      `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${f2(bx)}" y="${f2(by)}" width="${vb.size.w}" height="${vb.size.h}"><rect x="${f2(bx)}" y="${f2(by)}" width="${vb.size.w}" height="${vb.size.h}" fill="url(#${fid})"/></mask>`);
    body += `<path data-component="ticker-value-box" d="${shapePath(vb.shape, vb.size.w, bx, by)}" fill="${row['Color value']}" mask="url(#${mid})"/>`;
    const ts = col.text;
    body += `<text data-slot="short" x="${f2(cx + ts.short.linePaddingEm.left * 32)}" y="${f2(listY + ts.short.linePaddingEm.top * 32 + 32)}" font-weight="700" font-size="32" fill="${ts.short.color}">${esc(row['Kort namn'])}</text>`;
    body += `<text data-slot="value" x="${f2(cx + colW - ts.value.linePaddingEm.right * 32)}" y="${f2(listY + ts.value.linePaddingEm.top * 32 + 32)}" text-anchor="end" font-weight="700" font-size="32" fill="#fff" filter="url(#vshadow)">${esc(row['Procent string'])}</text>`;
    if (row['Eget namn']) body += `<text data-slot="long" x="${f2(cx + ts.long.linePaddingEm.left * 18)}" y="${f2(listY + listH - 9)}" font-weight="400" font-size="18" fill="${ts.long.color}">${esc(row['Eget namn'])}</text>`;
  });
  body += '</g>'; }
// logo line
{ const L = comp('logo-line-left'), R = comp('logo-line-right'), y = rows.logoLine.y;
  body += plate(L, L.layout.w, L.layout.x, y, { defs });
  body += plate(R, R.layout.w, R.layout.x, y, { defs });
  const lg = comp('logo-line-logo').layout; body += efnLogo(lg.x + 2, lg.y + 1, lg.w - 4, lg.h - 2);
  body += `<text data-slot="clock" x="${f2(L.layout.x + L.text.offsetX)}" y="${f2(y + 18.5)}" dominant-baseline="central" font-weight="700" font-size="23" fill="${L.text.color}">${esc(content.clock)}</text>`;
  body += `<text data-slot="date" x="${f2(R.layout.x + R.layout.w - R.text.insetRight)}" y="${f2(y + 18.5)}" text-anchor="end" dominant-baseline="central" font-weight="700" font-size="23" fill="${R.text.color}">${esc(content.date)}</text>`; }
return doc(1920, 1080, defs, body, '../../assets/fonts', true);
}
write('preview/on-air-capture.svg', composite({ page: payload.data.open[0], clock: '16:24', date: '9 nov 2026' }));
if (previewData) write(`preview/${argOf('--name') || 'custom'}.svg`, composite(previewData));
console.log('elements:', fs.readdirSync(path.join(OUT, 'elements')).length, ' preview:', fs.readdirSync(path.join(OUT, 'preview')).join(', '));
