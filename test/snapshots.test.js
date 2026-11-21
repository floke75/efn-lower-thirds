// Snapshot tests: every SVG the package can produce, rendered with fixed inputs and compared with the fingerprints in
// test/snapshots.json. Any change to the output of the renderer (plates, rims, text layout, ids, tokens used) fails
// here, so a change made for one graphic or app can't silently alter another.
//
//   npm test                 compare
//   npm run test:update      accept the current output as the new baseline (review it first, e.g. demo/plates.html)
//
// On a mismatch the new output is written to test/output/<case>.svg (not committed) so you can open or diff it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLowerThird, sampleTickerPayload as payload, registry } from '../src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, 'snapshots.json');
const OUTPUT = path.join(HERE, 'output');
const UPDATE = process.argv.includes('--update');

// Deterministic stand-in for a browser's text measurement (wide capitals, narrow i/l/1, average otherwise).
const measureText = (text, { sizePx }) => [...String(text)].reduce((w, ch) => w + (/[A-ZÅÄÖ%]/.test(ch) ? 0.68 : /[il1.,' ]/.test(ch) ? 0.28 : 0.56), 0) * sizePx;

function cases() {
  const lt = createLowerThird();
  const out = {};
  const open = payload.data.open, pre = payload.data.pre;
  const doc = (defsAndBody) => { const defs = []; const body = defsAndBody(defs); return lt.svgDocument(1920, 1080, defs, body); };

  out['composite/flowics-widths'] = lt.composite({ page: open[0], clock: '16:24', date: '9 nov 2026' });
  out['composite/measured'] = lt.composite({ name: 'Anna Andersson', title: 'Chefsekonom, Banken', logo: 'direkt', page: pre[0], clock: '09:05', date: '21 nov 2026' }, { measureText });
  for (const { file, svg } of lt.elements()) out[`elements/${file.replace(/\.svg$/, '')}`] = svg;

  for (const [name, content, row] of [['own', { name: 'Namn Efternamn', title: 'Titel' }, 'own'], ['main-long', { name: 'Maximilian Johansson-Lindqvist', title: 'Global chefsstrateg för tillväxtmarknader och råvaror' }, 'main'], ['no-title', { name: 'Namn', title: '' }, 'own']]) {
    out[`name-strap/${name}`] = doc((defs) => { lt.resetIds(); const s = lt.nameStrap(content, { measureText, row, defs }); return s.namePlate + s.nameText + s.titlePlate + s.titleText; });
  }
  for (const v of registry.components.find((c) => c.id === 'logo-box').variants) {
    out[`logo-ticker/${v.id}`] = doc((defs) => { lt.resetIds(); const s = lt.logoTicker({ logo: v.id, pages: [open[0], open[1]] }, { defs }); return s.logoPlate + s.wordmark + s.tickerPlate + s.pages.join('<!--page-->'); });
  }
  for (const style of lt.plateStyles) {
    out[`plates/${style}`] = lt.plateSvg(style, { width: 400 });
    if (lt.plateStyle(style).glint) out[`plates/${style}-glint`] = lt.plateSvg(style, { width: 400, glint: true });
  }
  for (const slant of ['right', 'left', 'both', 'none']) out[`plates/navy-slant-${slant}`] = lt.plateSvg('navy', { width: 300, slant });
  for (const h of [37, 110]) out[`plates/navy-h${h}`] = lt.plateSvg('navy', { width: 300, height: h });
  out['plates/beige-radius-0'] = lt.plateSvg('beige', { width: 300, radius: 0 });

  // The exact Flowics replica (refinements off) stays locked too.
  const exact = createLowerThird({ refinements: false });
  out['exact/composite'] = exact.composite({ page: open[0], clock: '16:24', date: '9 nov 2026' });
  out['exact/composite-measured'] = exact.composite({ name: 'Anna Andersson', title: 'Chefsekonom, Banken', logo: 'direkt', page: pre[0], clock: '09:05', date: '21 nov 2026' }, { measureText });
  for (const style of ['beige', 'beige-light', 'navy']) out[`exact/plates-${style}`] = exact.plateSvg(style, { width: 400 });
  return out;
}

const fingerprint = (s) => ({ sha256: crypto.createHash('sha256').update(s).digest('hex'), bytes: Buffer.byteLength(s) });
const current = cases();

if (UPDATE) {
  const manifest = {};
  for (const name of Object.keys(current).sort()) manifest[name] = fingerprint(current[name]);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  console.log(`snapshots: wrote ${Object.keys(manifest).length} fingerprints to test/snapshots.json`);
} else {
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  for (const name of Object.keys(current)) {
    test(`snapshot ${name}`, () => {
      const want = manifest[name];
      assert.ok(want, `no snapshot for ${name}: run npm run test:update`);
      const got = fingerprint(current[name]);
      if (got.sha256 !== want.sha256) {
        const file = path.join(OUTPUT, `${name}.svg`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, current[name]);
      }
      assert.equal(got.sha256, want.sha256, `${name} changed (${want.bytes} -> ${got.bytes} bytes); new output: test/output/${name}.svg`);
    });
  }
  test('no stale snapshots', () => {
    const stale = Object.keys(manifest).filter((n) => !(n in current));
    assert.deepEqual(stale, [], 'cases in test/snapshots.json that no longer exist: run npm run test:update');
  });
}
