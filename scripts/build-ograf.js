// Assemble the distributable OGraf package: dist/ograf/efn-lower-thirds/ (+ a .zip of it where `tar` can write
// zips, e.g. Windows 10+ and macOS).
//
// The folder is self-contained, as OGraf renderers require: the manifests, the graphic modules and a private copy
// of the renderer (src/, lib/, fonts) under lib/efn-lower-thirds/. All references are relative, so the folder
// works from any URL. The source shim ograf/lib/efn-lower-thirds.mjs (which points into the repo) is replaced by
// one that points at the private copy. Every manifest is validated against the official schemas afterwards.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const OUT_PARENT = path.join(ROOT, 'dist', 'ograf');
const OUT = path.join(OUT_PARENT, 'efn-lower-thirds');
const VENDOR = path.join(OUT, 'lib', 'efn-lower-thirds');
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

fs.rmSync(OUT_PARENT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'ograf'), OUT, { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js'))) cp(path.join(ROOT, 'src', f), path.join(VENDOR, 'src', f));
cp(path.join(ROOT, 'lib', 'roundedSkewedCardPathUniform.js'), path.join(VENDOR, 'lib', 'roundedSkewedCardPathUniform.js'));
for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'fonts'))) cp(path.join(ROOT, 'assets', 'fonts', f), path.join(VENDOR, 'assets', 'fonts', f));
fs.writeFileSync(path.join(OUT, 'lib', 'efn-lower-thirds.mjs'),
  `// The EFN renderer (efn-lower-thirds ${pkg.version}), bundled with these graphics.\nexport * from './efn-lower-thirds/src/index.js';\n`);
fs.writeFileSync(path.join(OUT, 'README.md'), `# EFN lower thirds: OGraf graphics (${pkg.version})

OGraf v1 graphics (https://ograf.ebu.io). Each \`*.ograf.json\` file in this folder is one graphic; give your
renderer or OGraf server this folder (or the zip of it). Everything the graphics draw with is inside it,
referenced relatively. The one network request is the ticker's data: efn-ticker fetches the EFN ticker feed (a
Flowics JSON datasource, CORS-enabled), so the renderer needs internet access for it, or pass \`pages\` in the data.
Serve the folder over http(s), with .mjs as text/javascript: browsers block ES modules on file:// URLs.

Built from the efn-lower-thirds repository. Contains the licensed AkkuratStd font: keep it within EFN.
`);

const valid = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'validate-ograf.js'), OUT], { stdio: 'inherit' });
if (valid.status !== 0) process.exit(valid.status || 1);

// Zip it with whatever the system has: Windows' own bsdtar (Git Bash puts GNU tar, which can't write zips, first
// on the PATH), `zip`, or bsdtar as `tar` (macOS).
const zip = path.join(ROOT, 'dist', `efn-lower-thirds-ograf-${pkg.version}.zip`);
fs.rmSync(zip, { force: true });
const winTar = process.platform === 'win32' && path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const zippers = [
  winTar && fs.existsSync(winTar) && [winTar, ['-a', '-c', '-f', zip, 'efn-lower-thirds']],
  ['zip', ['-qr', zip, 'efn-lower-thirds']],
  ['tar', ['-a', '-c', '-f', zip, 'efn-lower-thirds']],
].filter(Boolean);
let zipped = false;
for (const [cmd, args] of zippers) {
  const r = spawnSync(cmd, args, { cwd: OUT_PARENT, stdio: 'ignore' });
  if (r.status === 0 && fs.existsSync(zip) && fs.readFileSync(zip).subarray(0, 2).toString() === 'PK') { zipped = true; break; }
  fs.rmSync(zip, { force: true });
}
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [e.name]);
const files = walk(OUT).length;
console.log(`dist/ograf/efn-lower-thirds: ${files} files` + (zipped ? `, ${path.relative(ROOT, zip)}` : ' (no zip: no zip-capable tool found)'));
