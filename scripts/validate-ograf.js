// Validate every OGraf manifest (*.ograf.json) in a folder against the official OGraf v1 JSON schemas, vendored in
// reference/ograf/json-schemas (no network needed), plus checks the schemas can't express:
//   - the files named by `main` and `thumbnails` exist
//   - the data schema's defaults are valid against the data schema itself
// Usage: node scripts/validate-ograf.js [folder]   (default: ograf/; `npm run build` also checks dist/ograf)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(ROOT, process.argv[2] || 'ograf');
const SCHEMAS = path.join(ROOT, 'reference', 'ograf', 'json-schemas');
const MANIFEST_SCHEMA = 'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const f of walk(SCHEMAS).filter(f => f.endsWith('.json'))) ajv.addSchema(JSON.parse(fs.readFileSync(f, 'utf8')));
const validateManifest = ajv.getSchema(MANIFEST_SCHEMA);

const manifests = fs.readdirSync(dir).filter(f => f.endsWith('.ograf.json'));
if (!manifests.length) { console.error(`no *.ograf.json in ${dir}`); process.exit(1); }
let failed = 0;
for (const file of manifests) {
  const problems = [];
  const m = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (!validateManifest(m)) for (const e of validateManifest.errors) problems.push(`schema: ${e.instancePath || '/'} ${e.message}${e.params && e.params.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
  if (m.$schema !== MANIFEST_SCHEMA) problems.push(`$schema must be ${MANIFEST_SCHEMA}`);
  if (m.main && !fs.existsSync(path.join(dir, m.main))) problems.push(`main file missing: ${m.main}`);
  for (const t of m.thumbnails || []) if (!fs.existsSync(path.join(dir, t.file))) problems.push(`thumbnail missing: ${t.file}`);
  if (m.schema) {
    const data = Object.fromEntries(Object.entries(m.schema.properties || {}).filter(([, p]) => 'default' in p).map(([k, p]) => [k, p.default]));
    const validateData = new Ajv2020({ allErrors: true, strict: false }).compile(m.schema);
    if (!validateData(data)) for (const e of validateData.errors) problems.push(`defaults: ${e.instancePath || '/'} ${e.message}`);
  }
  if (problems.length) failed++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${path.relative(ROOT, path.join(dir, file))}${problems.map(p => `\n     - ${p}`).join('')}`);
}
process.exit(failed ? 1 : 0);
