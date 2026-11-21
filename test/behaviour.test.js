// Behaviour tests for logic that snapshots don't cover: easing curves, the plate-style API, the design tokens and
// the ticker's page timing (the rules that decide which page is on screen when).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLowerThird, ease, cssEase, designTokens } from '../src/index.js';

test('easing curves start and end exactly at 0 and 1', () => {
  for (const [name, f] of Object.entries(ease)) {
    assert.equal(f(0), 0, name); assert.equal(f(1), 1, name);
    assert.equal(f(-1), 0, name); assert.equal(f(2), 1, name);
    const mid = f(0.5); assert.ok(mid > 0 && mid < 1, `${name}(0.5) = ${mid}`);
  }
  for (const name of Object.keys(cssEase)) assert.ok(name in ease, `cssEase.${name} has a JS curve`);
});

test('GSAP slow (SlowMo 0.7/0.7) runs near-linearly through the middle', () => {
  const s = ease.slow;
  assert.ok(Math.abs(s(0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs((s(0.6) - s(0.4)) - 0.2 * 0.3) < 1e-9, 'middle slope is 1 - power = 0.3');
});

test('plate styles: every style draws, options are validated', () => {
  const lt = createLowerThird();
  assert.deepEqual(lt.plateStyles, ['navy', 'location', 'red', 'gold', 'beige', 'beige-light', 'line-left', 'line-right']);
  for (const s of lt.plateStyles) {
    const svg = lt.plateSvg(s, { width: 250, height: 50 });
    assert.match(svg, /^<svg [^>]*width="250" height="50" viewBox="0 0 250 50"/, s);
  }
  assert.throws(() => lt.stylePlate('purple', { width: 10, defs: [] }), /unknown plate style/);
  assert.throws(() => lt.stylePlate('navy', { width: 10, defs: [], slant: 'up' }), /unknown slant/);
  assert.throws(() => lt.stylePlate('navy', { width: 0, defs: [] }), /width/);
  assert.throws(() => lt.stylePlate('navy', { width: 10 }), /defs/);
  assert.equal(lt.plateStyle('beige').textColor, designTokens.color.text.dark);
  assert.equal(lt.plateStyle('navy').textColor, designTokens.color.text.light);
});

test('refinements: on by default, off draws the exact Flowics look', () => {
  const content = { name: 'Namn', title: 'Titel', page: [{ 'Kort namn': 'A', 'Procent string': '+1 %', 'Color value': '#00ae77' }] };
  const refined = createLowerThird().composite(content), exact = createLowerThird({ refinements: false }).composite(content);
  assert.equal((refined.match(/data-refinement="vignette"/g) || []).length, 2, 'title and ticker plates get the vignette');
  assert.match(refined, /<text data-slot="name"[^>]*filter="url\(#textLight\)"/);
  assert.match(refined, /<text data-slot="title"[^>]*filter="url\(#textDark\)"/);
  assert.match(refined, /<text data-slot="value"[^>]*filter="url\(#textLight\)"/);
  assert.doesNotMatch(exact, /data-refinement|textLight|textDark/);
  assert.match(exact, /<text data-slot="value"[^>]*filter="url\(#vshadow\)"/, 'exact keeps the Flowics value shadow');
  assert.equal(createLowerThird({ refinements: false }).textFilters, '');
  assert.equal(createLowerThird().plateSvg('navy', { width: 200 }).indexOf('vignette'), -1, 'navy plates have no vignette');
});

test('design tokens carry the measured values', () => {
  const t = designTokens;
  assert.equal(t.shape.skew, 8.45);
  assert.equal(t.shape.overlap, 4.5);
  assert.equal(t.color.plate.beige, '#ede4d3');
  assert.deepEqual(t.color.plate.red.stops, [[0, '#790012'], [1, '#e10029']]);
  assert.equal(t.layout.row.main, 956.01);
  assert.equal(t.motion.duration.pageInterval, 6000);
  assert.equal(t.typography.name.fontSize, 45);
});

// ---------- ticker page timing ----------
// The graphic class extends HTMLElement; a stand-in base lets Node load it. Only the pure timing method is used.
globalThis.HTMLElement = globalThis.HTMLElement || class {};
const { default: EfnTicker } = await import('../ograf/efn-ticker.mjs');
const Base = Object.getPrototypeOf(EfnTicker.prototype);
const pagesAt = (log, sceneLog, T) => EfnTicker.prototype._pages.call({ _log: log, _sceneLog: sceneLog, _showingAt: Base._showingAt }, T);
const scene = (at, interval, count) => ({ at, key: `${interval}/${count}`, scene: { interval, pages: Array.from({ length: count }, () => []) } });
const IN = (at, instant = false) => ({ at, kind: 'in', instant }), OUT = (at) => ({ at, kind: 'out', instant: false });

test('ticker: first page at take-in, then a turn every interval, wrapping round', () => {
  const log = [IN(1000)], sl = [scene(0, 6000, 3)];
  assert.deepEqual(pagesAt(log, sl, 500), { idx: 0, prev: null, turn: null, next: null }, 'not shown yet');
  assert.deepEqual(pagesAt(log, sl, 6999), { idx: 0, prev: null, turn: null, next: 7000 });
  assert.deepEqual(pagesAt(log, sl, 7000), { idx: 1, prev: 0, turn: 7000, next: 13000 });
  assert.deepEqual(pagesAt(log, sl, 13500), { idx: 2, prev: 1, turn: 13000, next: 19000 });
  assert.deepEqual(pagesAt(log, sl, 19000), { idx: 0, prev: 2, turn: 19000, next: 25000 });
});

test('ticker: the page freezes at take-out and restarts at the first page on the next take-in', () => {
  const log = [IN(1000), OUT(10000), IN(20000)], sl = [scene(0, 6000, 3)];
  assert.deepEqual(pagesAt(log, sl, 15000), { idx: 1, prev: 0, turn: 7000, next: null });
  assert.deepEqual(pagesAt(log, sl, 21000), { idx: 0, prev: null, turn: null, next: 26000 });
});

test('ticker: a take-in while already in continues the same showing', () => {
  assert.deepEqual(pagesAt([IN(1000), IN(4000, true)], [scene(0, 6000, 3)], 7500), { idx: 1, prev: 0, turn: 7000, next: 13000 });
});

test('ticker: an interval change restarts the timer at the change', () => {
  const sl = [scene(0, 6000, 3), scene(9000, 2000, 3)];
  assert.deepEqual(pagesAt([IN(1000)], sl, 10999), { idx: 1, prev: 0, turn: 7000, next: 11000 });
  assert.deepEqual(pagesAt([IN(1000)], sl, 11500), { idx: 2, prev: 1, turn: 11000, next: 13000 });
});

test('ticker: fewer pages falls back to the first when the current page is gone', () => {
  const sl = [scene(0, 6000, 3), scene(14000, 6000, 2)];
  assert.deepEqual(pagesAt([IN(1000)], sl, 13500), { idx: 2, prev: 1, turn: 13000, next: 19000 });
  assert.deepEqual(pagesAt([IN(1000)], sl, 15000), { idx: 0, prev: null, turn: null, next: 20000 });
});

test('ticker: one page never turns', () => {
  assert.deepEqual(pagesAt([IN(0)], [scene(0, 6000, 1)], 60000), { idx: 0, prev: null, turn: null, next: null });
});
