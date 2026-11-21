// Part of `npm run typecheck`: every runtime export has a declaration and every declaration has a runtime export,
// for each entry point. (tsc checks the declarations themselves; this keeps them in step with the JavaScript.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES = [['src/index.js', 'src/index.d.ts'], ['src/lower-third.js', 'src/lower-third.d.ts'],
  ['lib/roundedSkewedCardPathUniform.js', 'lib/roundedSkewedCardPathUniform.d.ts'],
  ['src/design-tokens.js', 'src/design-tokens.d.ts'], ['src/motion.js', 'src/motion.d.ts'], ['src/elements/efn-plate.js', 'src/elements/efn-plate.d.ts']];

let failed = false;
for (const [js, dts] of ENTRIES) {
  const runtime = Object.keys(await import(pathToFileURL(path.join(ROOT, js)).href));
  const src = fs.readFileSync(path.join(ROOT, dts), 'utf8');
  const declared = [...src.matchAll(/^export (?:declare )?(?:function|const|let|class) (\w+)/gm)].map(m => m[1]);
  for (const m of src.matchAll(/^export \{([^}]+)\} from/gm)) declared.push(...m[1].split(',').map(s => s.trim()).filter(Boolean));
  const missing = runtime.filter(k => !declared.includes(k)), extra = [...new Set(declared)].filter(k => !runtime.includes(k));
  if (missing.length || extra.length) failed = true;
  console.log(`${js}: ${missing.length || extra.length ? `MISMATCH (no types: ${missing.join(', ') || '-'}; declared but not exported: ${extra.join(', ') || '-'})` : `${runtime.length} exports, all declared`}`);
}
process.exit(failed ? 1 : 0);
