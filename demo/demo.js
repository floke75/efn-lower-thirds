// Browser demo: the package running live in the page, exactly as an app or OGraf graphic would use it:
// load the fonts, create a renderer with the built-in data, measure text with the real AkkuratStd font and
// re-render the full lower third on every edit.
import { createLowerThird, loadFonts, browserMeasureText, registry, sampleTickerPayload as payload, f2 } from '../src/index.js';

await loadFonts();
const renderer = createLowerThird({ idPrefix: 'lt-' });
const measureText = browserMeasureText();
const comp = (id) => registry.components.find(c => c.id === id);
const logoVariants = comp('logo-box').variants;

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
