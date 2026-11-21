// Part of `npm run check`: keep the code that runs inside renderers at ES2018 + APIs available in Chromium/CEF 69,
// the engine generation still found in broadcast playout. Flags syntax and APIs newer than that in the runtime
// files (heuristic: comments are skipped; strings and regexes are not parsed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['src/index.js', 'src/lower-third.js', 'lib/roundedSkewedCardPathUniform.js',
  ...fs.readdirSync(path.join(ROOT, 'ograf')).filter(f => f.endsWith('.mjs')).map(f => `ograf/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'ograf', 'lib')).filter(f => f.endsWith('.mjs')).map(f => `ograf/lib/${f}`)];
const RULES = [
  [/\?\?/, 'nullish coalescing ?? (ES2020, Chromium 80)'],
  [/\?\.[\w([]/, 'optional chaining ?. (ES2020, Chromium 80)'],
  [/\|\|=|&&=/, 'logical assignment (ES2021)'],
  [/^\s*(static\s+)?#?\w+\s*=(?!=|>)[^;]*;\s*$/, 'class field (ES2022, Chromium 72-74)', (line, ctx) => ctx.inClassBody],
  [/(^|[^\w$'"`])#\w+/, 'private class member (ES2022)', (line) => !/["'`]/.test(line)],
  [/Object\.fromEntries/, 'Object.fromEntries (Chromium 73)'],
  [/\.matchAll\(/, 'String.prototype.matchAll (Chromium 73)'],
  [/\.replaceAll\(/, 'String.prototype.replaceAll (Chromium 85)'],
  [/Object\.hasOwn\(/, 'Object.hasOwn (Chromium 93)'],
  [/\.at\(-?\d/, 'Array.prototype.at (Chromium 92)'],
  [/structuredClone\(/, 'structuredClone (Chromium 98)'],
  [/\b(findLast|toSorted|toReversed)\(/, 'ES2023 array methods'],
  [/catch\s*\{/, 'optional catch binding (ES2019, Chromium 66) - fine, but keep (e) for older tooling'],
  [/^await\s/, 'top-level await (Chromium 89)'],
];

let problems = 0;
for (const rel of FILES) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  let depth = 0, classDepth = -1;
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    const ctx = { inClassBody: classDepth >= 0 && depth === classDepth + 1 };
    if (!/^\s*(\/\/|\*|\/\*)/.test(line)) for (const [re, what, when] of RULES) {
      if (re.test(code) && (!when || when(code, ctx))) { problems++; console.log(`${rel}:${i + 1}  ${what}\n    ${line.trim().slice(0, 120)}`); }
    }
    if (/\bclass\b[^{]*\{/.test(code) && classDepth < 0) classDepth = depth;
    depth += (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
    if (classDepth >= 0 && depth <= classDepth) classDepth = -1;
  });
}
console.log(problems ? `${problems} compatibility problem(s)` : `compat: ${FILES.length} runtime files are ES2018 / Chromium 69 clean`);
process.exit(problems ? 1 : 0);
