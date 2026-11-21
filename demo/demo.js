// Browser demo: the renderer from src/lower-third.js running live in the page.
// It loads the registry, tokens and logo/wordmark SVGs over HTTP, measures text with the real AkkuratStd font
// (canvas measureText) and re-renders the full lower third on every edit. This is the same path an OGraf
// graphic takes at runtime.
import { createRenderer, f2 } from '../src/lower-third.js';

const get = (url, as = 'json') => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r[as](); });

const [registry, tokens, payload] = await Promise.all([
  get('../data/element-registry.json'), get('../data/design-tokens.json'), get('../data/samples/ticker-payload.json')]);
const comp = (id) => registry.components.find(c => c.id === id);
const logoVariants = comp('logo-box').variants;
const efnLogoSvg = await get('../' + comp('logo-line-logo').asset, 'text');
const wordmarks = Object.fromEntries(await Promise.all(logoVariants.filter(v => v.clientWordmark?.supplied)
  .map(async v => [v.id, await get('../' + v.clientWordmark.file, 'text')])));

const renderer = createRenderer({ registry, tokens, efnLogoSvg, wordmarks, idPrefix: 'lt-' });

// Text advance with the broadcast font: wait for both weights, then measure on a canvas.
await Promise.all(['700', '400'].map(w => document.fonts.load(`${w} 40px AkkuratStd`)));
const ctx = document.createElement('canvas').getContext('2d');
const measureText = (text, { weight, sizePx }) => { ctx.font = `${weight} ${sizePx}px AkkuratStd`; return ctx.measureText(text).width; };

// controls
const form = document.getElementById('controls'), stage = document.getElementById('stage'), readout = document.getElementById('readout');
for (const v of logoVariants) form.logo.add(new Option(v.flowicsName.replace(/^LOGOBOX-/, '') + (v.clientWordmark?.supplied ? '' : ' (no wordmark yet)'), v.id));
form.logo.value = 'borslunch';
const pages = Object.entries(payload.data).flatMap(([group, list]) => list.map((page, i) => ({ key: `${group}:${i}`, label: `${group} ${i + 1}`, page })));
for (const p of pages) form.page.add(new Option(p.label, p.key));
form.page.value = 'open:0';
const now = new Date();
form.clock.value = now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
form.date.value = now.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Stockholm' }).replace('.', '');

function render() {
  const content = {
    name: form.name.value, title: form.title.value, logo: form.logo.value,
    page: pages.find(p => p.key === form.page.value).page, clock: form.clock.value, date: form.date.value,
  };
  const responsive = form.responsive.checked;
  // fontsUrl: null -> the page provides the fonts (see index.html)
  stage.innerHTML = renderer.composite(content, { measureText: responsive ? measureText : undefined, fontsUrl: null });
  stage.className = `bg-${form.bg.value}`;
  const np = comp('name-plate'), tt = comp('title-plate').text;
  const nameW = responsive ? renderer.namePlateWidth(measureText(content.name, { weight: 700, sizePx: np.text.effectiveSizePx })) : np.flowicsSize.w;
  const titleW = renderer.titleWidth(measureText(content.title, { weight: 700, sizePx: tt.effectiveSizePx }));
  readout.textContent = `name plate ${f2(nameW)} px · title plate ${f2(titleW)} px at x ${f2(np.layout.x + nameW - registry.adjacentPlateOverlapPx)} · `
    + `logo box ${logoVariants.find(v => v.id === content.logo).flowicsSize.w} px · canvas 1920×1080, rendered ${stage.clientWidth}×${stage.clientHeight}`;
}
form.addEventListener('input', render);
new ResizeObserver(render).observe(stage);
render();
