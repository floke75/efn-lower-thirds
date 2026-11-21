// <efn-plate>: an EFN plate behind HTML content, for broadcast graphics built in the browser.
//
//   import 'efn-lower-thirds/plate-element';            // defines <efn-plate> (and registers AkkuratStd)
//   <efn-plate variant="navy">Namn Efternamn</efn-plate>
//   <efn-plate variant="beige-light" slant="both" style="height: 60px">Titel</efn-plate>
//
// The plate (fill, rims, optional glint) is drawn as SVG behind the content and redrawn whenever the element's size
// changes, so it hugs its text like the lower-third plates do. Size it with ordinary CSS: the default height is
// the 71 px plate row; the width follows the content.
//
// Attributes:
//   variant   navy (default), location, red, gold, beige, beige-light, line-left, line-right
//   slant     right | left | both | none   which sides are slanted (default: the variant's own)
//   radius    corner radius in px (default: the variant's measured radius)
//   glint     present: the variant's glint sweeps over the plate every 15 s (navy, red, gold, line-left/right)
//   flat      present: the exact Flowics look, without EFN's refinements (text shading, beige vignette)
// CSS: --efn-plate-padding (default 0.5em) is the text inset on straight sides; slanted sides add the slant's run.
// The text colour defaults to the variant's (light on navy and red, dark on beige); set `color` to override.
// The text gets the refinements' shading (soft shadows, rim light): an SVG filter applied with CSS `filter`, defined
// in the element and once in the document, so engines that resolve url(#id) either way find it.
// Parts: ::part(plate) (the svg), ::part(content).
// Methods: restartGlint() restarts the glint loop (e.g. at a take-in).
//
// Plain ES2018 + Custom Elements v1, Shadow DOM v1 and ResizeObserver: Chromium/CEF 69 and later. Importing it
// without a DOM (Node, server-side rendering) is safe: it then defines nothing.
import { createLowerThird, loadFonts, slantOffset } from '../index.js';

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;
const VARIANTS = ['navy', 'location', 'red', 'gold', 'beige', 'beige-light', 'line-left', 'line-right'];
const SVG_NS = 'http://www.w3.org/2000/svg';
let count = 0;
let fontsRequested = false;
let shading = null;   // text-shading filters with fixed ids (efn-textLight, efn-textDark), shared by every plate
const textFilters = () => (shading || (shading = createLowerThird({ idPrefix: 'efn-' }))).textFilters;
function addDocumentFilters() {
  if (typeof document === 'undefined' || !document.body || document.getElementById('efn-textLight')) return;
  const holder = document.createElementNS(SVG_NS, 'svg');
  holder.setAttribute('aria-hidden', 'true');
  holder.setAttribute('data-efn', 'text-filters');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  holder.innerHTML = `<defs>${textFilters()}</defs>`;
  document.body.appendChild(holder);
}

const CSS = `
:host { position: relative; display: inline-flex; box-sizing: border-box; vertical-align: top; height: 71px;
  font-family: AkkuratStd, Arial, sans-serif; font-weight: 700; font-size: 42px; line-height: 1; white-space: nowrap; }
:host([hidden]) { display: none; }
svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.content { position: relative; display: flex; align-items: center; box-sizing: border-box; height: 100%; }
`;

export class EfnPlate extends Base {
  static get observedAttributes() { return ['variant', 'slant', 'radius', 'glint', 'flat']; }

  constructor() {
    super();
    this._n = ++count;
    this._lt = createLowerThird({ idPrefix: `efnp${this._n}-` });
    this._ltFlat = null;
    this._key = '';
    this._size = { w: 0, h: 0 };
    this._raf = 0;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><style data-efn="color"></style>` +
      `<svg class="filters" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${textFilters()}</defs></svg>` +
      '<svg part="plate" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg><div class="content" part="content"><slot></slot></div>';
    this._svg = root.querySelector('svg[part="plate"]');
    this._content = root.querySelector('.content');
    this._colorStyle = root.querySelector('style[data-efn="color"]');
  }

  connectedCallback() {
    addDocumentFilters();
    if (!fontsRequested) {
      fontsRequested = true;
      loadFonts().catch((e) => console.warn('[efn] AkkuratStd could not be loaded, using a fallback font', e));
    }
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver((entries) => {
        const r = entries[entries.length - 1].contentRect;
        this._size = { w: r.width, h: r.height };
        this._schedule();
      });
      this._ro.observe(this);
    } else {
      this._onResize = () => { this._size = { w: this.offsetWidth, h: this.offsetHeight }; this._schedule(); };
      window.addEventListener('resize', this._onResize);
      this._onResize();
    }
    this._schedule();
  }

  disconnectedCallback() {
    if (this._ro) this._ro.disconnect();
    this._ro = null;
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  attributeChangedCallback() { this._schedule(); }

  get variant() { const v = this.getAttribute('variant'); return VARIANTS.indexOf(v) >= 0 ? v : 'navy'; }
  set variant(v) { this.setAttribute('variant', v); }

  restartGlint() { if (typeof this._svg.setCurrentTime === 'function') this._svg.setCurrentTime(0); }

  // Draw now (normally it happens on the next frame after a change). Returns the plate's markup.
  render() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    const flat = this.hasAttribute('flat');
    const lt = flat ? (this._ltFlat || (this._ltFlat = createLowerThird({ idPrefix: `efnp${this._n}f-`, refinements: false }))) : this._lt;
    const variant = this.variant, style = lt.plateStyle(variant);
    const slantAttr = this.getAttribute('slant');
    const slant = ['right', 'left', 'both', 'none'].indexOf(slantAttr) >= 0 ? slantAttr : style.slant;
    const radiusAttr = parseFloat(this.getAttribute('radius'));
    const radius = isFinite(radiusAttr) && radiusAttr >= 0 ? radiusAttr : style.radius;
    const glint = this.hasAttribute('glint');
    const w = Math.round(this._size.w * 100) / 100, h = Math.round(this._size.h * 100) / 100;
    this._colorStyle.textContent = `:host { color: ${style.textColor}; }`;
    // padding: the base inset on straight sides, plus the slant's horizontal run on slanted sides
    const run = h > 0 ? Math.round(slantOffset(style.component.shape, h) * 100) / 100 : 0;
    const pad = 'var(--efn-plate-padding, 0.5em)';
    this._content.style.paddingLeft = slant === 'left' || slant === 'both' ? `calc(${pad} + ${run}px)` : pad;
    this._content.style.paddingRight = slant === 'right' || slant === 'both' ? `calc(${pad} + ${run}px)` : pad;
    const dark = style.textColor === lt.plateStyle('beige').textColor;
    this._content.style.filter = flat ? '' : `url(#efn-${dark ? 'textDark' : 'textLight'})`;
    // refinements: bold dark text is drawn as a lighter weight thickened by a stroke (a synthetic semibold)
    const dt = !flat && dark && lt.refinements && lt.refinements.darkText;
    this._content.style.fontWeight = dt ? String(dt.weight) : '';
    this._content.style.setProperty('-webkit-text-stroke', dt ? `${dt.strokeEm}em currentColor` : '');
    const key = [variant, slant, radius, glint, flat, w, h].join('|');
    if (key === this._key) return this._svg.innerHTML;
    this._key = key;
    if (!(w > 0 && h > 0)) { this._svg.innerHTML = ''; return ''; }
    lt.resetIds();
    const defs = [];
    const body = lt.stylePlate(variant, { width: w, height: h, slant, radius, glint, defs });
    this._svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this._svg.innerHTML = `<defs>${defs.join('')}</defs>${body}`;
    return this._svg.innerHTML;
  }

  _schedule() {
    if (this._raf || typeof requestAnimationFrame !== 'function') return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('efn-plate')) customElements.define('efn-plate', EfnPlate);
