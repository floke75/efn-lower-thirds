// A minimal OGraf renderer for development: loads a graphic from its manifest exactly as a renderer would
// (import `main`, define the custom element under a tag of our choosing, call load(), then the actions), plus a
// data form generated from the manifest schema, a non-real-time scrubber and the conformance checks.
// URL options: ?manifest=<url>  &bg=grey|white|checker|none  &autoplay=1 (play with skipAnimation after load)
import { runConformance, tagFor } from './conformance.js';

const GRAPHICS = [
  ['Name strap (source)', '../ograf/efn-name-strap.ograf.json'],
  ['Name strap (built, dist/ograf)', '../dist/ograf/efn-lower-thirds/efn-name-strap.ograf.json'],
];
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const stage = $('stage'), log = $('log');
let manifest, manifestHref, graphic;

for (const [label, url] of GRAPHICS) $('manifest').add(new Option(label, url));
const wanted = params.get('manifest');
if (wanted && !GRAPHICS.some(([, u]) => u === wanted)) $('manifest').add(new Option(wanted, wanted));
$('manifest').value = wanted || GRAPHICS[0][1];
$('bg').value = params.get('bg') || 'grey';
stage.className = `bg-${$('bg').value}`;

const write = (call, result) => { log.textContent = `${new Date().toISOString().slice(11, 23)}  ${call} -> ${JSON.stringify(result, (k, v) => v === undefined ? '«undefined»' : v)}\n` + log.textContent; };
const call = async (name, args) => { const r = await graphic[name](args); write(`${name}(${JSON.stringify(args)})`, r); return r; };
const defaults = () => Object.fromEntries(Object.entries(manifest.schema?.properties || {}).filter(([, p]) => 'default' in p).map(([k, p]) => [k, p.default]));

function buildForm() {
  const form = $('data');
  form.innerHTML = '';
  const props = Object.entries(manifest.schema?.properties || {}).sort((a, b) => (a[1].order ?? 99) - (b[1].order ?? 99));
  for (const [key, p] of props) {
    const label = document.createElement('label');
    label.textContent = p.label || p.title || key;
    let input;
    if (p.enum) { input = document.createElement('select'); for (const v of p.enum) input.add(new Option(p.gddOptions?.labels?.[v] ?? v, v)); }
    else { input = document.createElement('input'); if (p.maxLength) input.maxLength = p.maxLength; }
    input.name = key;
    input.value = p.default ?? '';
    label.append(input);
    form.append(label);
  }
}
const formData = () => Object.fromEntries([...$('data').elements].filter(e => e.name).map(e => [e.name, e.value]));

async function mount(renderType = 'realtime') {
  if (graphic) { await call('dispose', {}); graphic.remove(); }
  manifestHref = new URL($('manifest').value, location.href).href;
  manifest = await (await fetch(manifestHref, { cache: 'no-store' })).json();
  const Graphic = (await import(new URL(manifest.main, manifestHref).href)).default;
  const tag = tagFor(Graphic, 'efn-dev-graphic');
  graphic = document.createElement(tag);
  stage.append(graphic);
  if (!$('data').childElementCount || $('data').dataset.manifest !== manifestHref) { buildForm(); $('data').dataset.manifest = manifestHref; }
  const { width, height } = stage.getBoundingClientRect();
  await call('load', { data: formData(), renderType, renderCharacteristics: { resolution: { width: Math.round(width), height: Math.round(height) }, frameRate: 50 } });
}

$('schedule').value = JSON.stringify([
  { timestamp: 200, action: { type: 'playAction', params: { goto: 0 } } },
  { timestamp: 3000, action: { type: 'updateAction', params: { data: { title: 'Ny titel efter uppdatering' } } } },
  { timestamp: 5500, action: { type: 'stopAction', params: {} } },
], null, 1);

$('play').onclick = () => call('playAction', { goto: 0, skipAnimation: $('skip').checked });
$('next').onclick = () => call('playAction', { delta: 1, skipAnimation: $('skip').checked });
$('stop').onclick = () => call('stopAction', { skipAnimation: $('skip').checked });
$('update').onclick = () => call('updateAction', { data: formData(), skipAnimation: $('skip').checked });
$('reload').onclick = () => mount('realtime');
$('manifest').onchange = () => mount('realtime');
$('bg').onchange = () => { stage.className = `bg-${$('bg').value}`; };
$('nrt').onclick = async () => {
  await mount('non-realtime');
  await call('setActionsSchedule', { schedule: JSON.parse($('schedule').value) });
  await call('goToTime', { timestamp: Number($('time').value) });
};
$('time').oninput = async () => {
  $('timeLabel').textContent = `${$('time').value} ms`;
  if (graphic && typeof graphic.goToTime === 'function') { const r = await graphic.goToTime({ timestamp: Number($('time').value) }); if (r?.statusCode !== 200) write('goToTime', r); }
};
$('conform').onclick = async () => {
  $('results').textContent = 'running…';
  const results = await runConformance(manifestHref);
  const failed = results.filter(r => !r.pass);
  $('summary').textContent = `${results.length - failed.length}/${results.length} passed`;
  $('results').innerHTML = results.map(r => `<span class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span>  ${r.name}${r.detail ? `  <span>(${r.detail.replace(/</g, '&lt;')})</span>` : ''}`).join('\n');
  window.__conformance = results;
};

await mount('realtime');
if (params.get('autoplay')) await call('playAction', { goto: 0, skipAnimation: true });
window.__harness = { get graphic() { return graphic; }, mount, call, runConformance };
