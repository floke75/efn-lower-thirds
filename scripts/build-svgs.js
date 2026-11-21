// Build the EFN lower-third SVGs into dist/ with the renderer in src/lower-third.js (the same module a browser
// graphic uses at runtime). This script only loads the data and assets from disk and writes the files.
//
// Outputs (dist/, not committed):
//   elements/<component-id>[--variant].svg   plates at their Flowics size (no text)
//   preview/on-air-capture.svg                full lower third with sample content (fluid: renders at any size)
//   preview/<name>.svg                        same, with your own content (--data <json> --name <name>)
// --data JSON: { name, title, logo, clock, date, page: [4 ticker rows as in data/samples/ticker-payload.json] }
// Usage: node scripts/build-svgs.js [--data content.json --name my-preview]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from '../src/lower-third.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const registry = json('data/element-registry.json');
const tokens = json('data/design-tokens.json');
const payload = json('data/samples/ticker-payload.json');
const logoLogo = registry.components.find(c => c.id === 'logo-line-logo');
const wordmarks = Object.fromEntries(registry.components.find(c => c.id === 'logo-box').variants
  .filter(v => v.clientWordmark && v.clientWordmark.supplied).map(v => [v.id, read(v.clientWordmark.file)]));
const r = createRenderer({ registry, tokens, efnLogoSvg: read(logoLogo.asset), wordmarks });

const argv = process.argv.slice(2), argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const previewData = argOf('--data') ? JSON.parse(fs.readFileSync(argOf('--data'), 'utf8')) : null;
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

fs.rmSync(OUT, { recursive: true, force: true });
for (const { file, svg } of r.elements()) write(`elements/${file}`, svg);
write('preview/on-air-capture.svg', r.composite({ page: payload.data.open[0], clock: '16:24', date: '9 nov 2026' }));
if (previewData) write(`preview/${argOf('--name') || 'custom'}.svg`, r.composite(previewData));
console.log('elements:', fs.readdirSync(path.join(OUT, 'elements')).length, ' preview:', fs.readdirSync(path.join(OUT, 'preview')).join(', '));
