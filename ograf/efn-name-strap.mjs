// EFN name strap: navy name plate with the person's name, and a beige title plate on the same row.
// OGraf Graphics v1. Manifest: efn-name-strap.ograf.json. Replaces the Flowics overlays NAMN1, NAMN2,
// NAMNSKYLT-EGEN-RAD (own row) and NAMNSKYLT (main row).
//
// Animations follow the Flowics originals exactly (ms):
//   in:  plate slides out from under its left edge  @400 +400 sine.in
//        name text wipes in left to right           @550 +400 linear
//        title (plate + text) wipes in              @800 +400 sine.in     -> 1200 ms
//   out: title wipes out right to left              @0   +450 linear
//        name text wipes out                        @450 +400 linear
//        plate slides back under its left edge      @470 +400 linear      -> 870 ms
// As in Flowics, the title wipe runs across the whole title element (to the safe right edge), not just the box.
import { EfnGraphic } from './lib/efn-graphic.mjs';

const IN = {
  plate: { delay: 400, duration: 400, ease: 'sine.in' },
  name: { delay: 550, duration: 400, ease: 'linear' },
  title: { delay: 800, duration: 400, ease: 'sine.in' },
};
const OUT = {
  title: { delay: 0, duration: 450, ease: 'linear' },
  name: { delay: 450, duration: 400, ease: 'linear' },
  plate: { delay: 470, duration: 400, ease: 'linear' },
};
const ROWS = ['own', 'main'];
const OPEN = 4000;   // clip width that never clips anything (used once a wipe has finished)

export default class EfnNameStrap extends EfnGraphic {
  static get defaults() { return { name: 'Namn Efternamn', title: 'Titel', row: 'own' }; }
  static get animation() { return { in: IN, out: OUT }; }
  static get stepCount() { return 1; }

  normalize(data) {
    return {
      name: data.name == null ? '' : String(data.name),
      title: data.title == null ? '' : String(data.title),
      row: ROWS.indexOf(data.row) >= 0 ? data.row : 'own',
    };
  }

  buildScene(data) {
    this.lt.resetIds();
    const defs = [];
    const s = this.lt.nameStrap({ name: data.name, title: data.title }, { measureText: this.measureText, row: data.row, defs, separateGlint: true });
    const L = (this._layout = s.layout);
    const id = (n) => `${this._id}${n}`;
    const top = f2(L.y - 12), h = 100;   // clip band: the row plus room for rims and the glint's overshoot
    defs.push(
      `<clipPath id="${id('slide')}"><rect x="${f2(L.name.x)}" y="${top}" width="${OPEN}" height="${h}"/></clipPath>`,
      `<clipPath id="${id('nameWipe')}"><rect data-efn="name-wipe" x="${f2(L.name.x - 3)}" y="${top}" width="0" height="${h}"/></clipPath>`,
      `<clipPath id="${id('titleWipe')}"><rect data-efn="title-wipe" x="${f2((L.title ? L.title.x : 0) - 3)}" y="${top}" width="0" height="${h}"/></clipPath>`);
    // The name plate's glint goes in the overlay (composited separately, so it doesn't redraw the plates and text).
    const plateGroup = (inner) => `<g data-efn="plate" clip-path="url(#${id('slide')})"><g data-efn="slide">${inner}</g></g>`;
    const body =
      plateGroup(s.namePlate) +
      `<g data-efn="name" clip-path="url(#${id('nameWipe')})">${s.nameText}</g>` +
      (L.title ? `<g data-efn="title" clip-path="url(#${id('titleWipe')})">${s.titlePlate}${s.titleText}</g>` : '');
    return { defs, body, overlay: plateGroup(s.nameGlint) };
  }

  bindScene(root) {
    const all = (sel) => Array.prototype.slice.call(root.querySelectorAll(sel));
    this._el = {
      plate: all('[data-efn="plate"]'), slide: all('[data-efn="slide"]'),
      name: all('[data-efn="name"]'), nameWipe: root.querySelector('[data-efn="name-wipe"]'),
      title: all('[data-efn="title"]'), titleWipe: root.querySelector('[data-efn="title-wipe"]'),
    };
  }

  applyChannels(v) {
    const L = this._layout, el = this._el;
    show(el.plate, v.plate > 0);
    el.slide.forEach((g) => g.setAttribute('transform', v.plate >= 1 ? '' : `translate(${f2(-(1 - v.plate) * L.name.w)},0)`));
    show(el.name, v.name > 0);
    el.nameWipe.setAttribute('width', v.name >= 1 ? OPEN : f2(3 + v.name * L.name.textBoxW));
    if (L.title) {
      show(el.title, v.title > 0);
      el.titleWipe.setAttribute('width', v.title >= 1 ? OPEN : f2(3 + v.title * L.title.elementW));
    }
  }
}

// show / hide one element or each element of a list
function show(el, on) { [].concat(el).forEach((e) => { if (on) e.removeAttribute('display'); else e.setAttribute('display', 'none'); }); }
function f2(n) { return Math.round(n * 100) / 100; }
