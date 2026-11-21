// EFN logo box + ticker: the programme's red logo box, and beside it the beige ticker plate with market values in
// pages of 4 that turn every few seconds.
// OGraf Graphics v1. Manifest: efn-ticker.ograf.json. Replaces the Flowics overlays LOGOBOX-* (region LOGOBOX) and
// TICKER-LINE-* PRE / OPEN (region TICKER-LINE). It is one graphic because the ticker starts where the logo box
// ends, and separate OGraf graphics cannot see each other's size.
//
// Animations follow the Flowics originals (ms):
//   in:  logo box and ticker plate slide out from under their left edges   @0   +500 sine.in
//        the columns slide in from 75 px left and fade in                  @400 +360 slow (GSAP SlowMo)
//        the page slides in from 75 px left and fades in                   @700 +500 sine.in    -> 1200 ms
//   out: the columns wipe out right to left                                @0   +200 sine.in
//        the page slides 75 px right and fades out (hidden by the wipe)    @0   +500 sine.in
//        logo box and ticker plate slide back under their left edges       @0   +400 sine.in    ->  500 ms
//   page turn, every `interval` ms while shown (Flowics' automatic list cycling, from the first page at each
//   take-in; a timer that restarts when the interval or the number of pages changes):
//        the old page slides 75 px right and fades out                     @0   +500 sine.in
//        the new page slides in from 75 px left and fades in               @700 +500 sine.in
// The page turns are a pure function of the action log and time, like the take-in and take-out, so non-real-time
// rendering shows the same page at the same moment as real-time playout.
//
// Data: the pages come from the ticker feed (the Flowics JSON datasource in design-tokens.json data.feed, or the
// `feed` URL): fetched in load(), then polled every 5 s in real time; fetched once in non-real-time, so a render
// is repeatable. When `pages` is given it is used instead of the feed. New feed values replace the text in place,
// as Flowics' data bindings do.
import { EfnGraphic, EASE } from './lib/efn-graphic.mjs';
import { tokens, registry } from './lib/efn-lower-thirds.mjs';

const IN = {
  logo: { delay: 0, duration: 500, ease: 'sine.in' },
  plate: { delay: 0, duration: 500, ease: 'sine.in' },
  listWipe: { delay: 0, duration: 0, ease: 'linear' },     // the out wipe resets as the take-in starts
  listFade: { delay: 400, duration: 360, ease: 'slow' },
  itemOut: { delay: 0, duration: 0, ease: 'linear' },
  itemIn: { delay: 700, duration: 500, ease: 'sine.in' },
};
const OUT = {
  logo: { delay: 0, duration: 400, ease: 'sine.in' },
  plate: { delay: 0, duration: 400, ease: 'sine.in' },
  listWipe: { delay: 0, duration: 200, ease: 'sine.in' },
  listFade: { delay: 200, duration: 0, ease: 'linear' },   // reset once the wipe has hidden the columns
  itemOut: { delay: 0, duration: 500, ease: 'sine.in' },
  itemIn: { delay: 500, duration: 0, ease: 'linear' },
};
const TURN = { out: { delay: 0, duration: 500 }, in: { delay: 700, duration: 500 } };   // sine.in, as the list item
const SHIFT = 75;      // px, Flowics slideLeftBigIn / slideRightBigOut
const OPEN = 4000;     // clip width that never clips anything
const LOGOS = registry.components.filter((c) => c.id === 'logo-box')[0].variants.map((v) => v.id);
const GROUPS = ['open', 'pre'];
const FEED = tokens.data.feed;
const POLL_MS = tokens.data.pollSeconds * 1000;
const FETCH_TIMEOUT_MS = 5000;

export default class EfnTicker extends EfnGraphic {
  static get defaults() { return { logo: 'borslunch', group: 'open', interval: 6000, feed: '', pages: [] }; }
  static get animation() { return { in: IN, out: OUT }; }
  static get stepCount() { return 1; }

  normalize(data) {
    const interval = Number(data.interval);
    return {
      logo: LOGOS.indexOf(data.logo) >= 0 ? data.logo : 'borslunch',
      group: GROUPS.indexOf(data.group) >= 0 ? data.group : 'open',
      interval: isFinite(interval) && interval > 0 ? Math.round(Math.min(60000, Math.max(2000, interval))) : 6000,
      feed: typeof data.feed === 'string' ? data.feed.trim() : '',
      pages: normalizePages(data.pages),
    };
  }

  // ---------- data source ----------

  // The scene: the operator's data with the pages resolved from `pages` or the feed.
  resolve(data) {
    const c = this._resolved;
    if (c && c.data === data && c.feed === this._feed) return c.scene;
    const feed = this._feed && this._feed.url === feedUrl(data) ? this._feed.pages : null;
    const pages = data.pages.length ? data.pages : feed ? feed[data.group] || [] : [];
    const scene = { logo: data.logo, interval: data.interval, pages };
    this._resolved = { data, feed: this._feed, scene };
    return scene;
  }

  timingKey(scene) { return `${scene.interval}/${scene.pages.length}`; }

  async prepare() {
    this._feed = null;
    this._resolved = null;
    this._gen = (this._gen || 0) + 1;
    if (!this._data.pages.length) await this._fetchFeed(this._gen, FETCH_TIMEOUT_MS);
    if (this._renderType === 'realtime') this._poll(this._gen);
  }

  teardown() {
    this._gen = (this._gen || 0) + 1;              // stops the poll loop and ignores fetches in flight
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = 0;
    if (this._abort) this._abort.abort();
    this._abort = null;
  }

  async updateAction(params) {
    const r = await super.updateAction(params);
    // A new feed URL (or switching back from `pages` to the feed): fetch now rather than at the next poll.
    if (this._renderType === 'realtime' && !this._data.pages.length && !(this._feed && this._feed.url === feedUrl(this._data))) {
      const gen = this._gen;
      this._fetchFeed(gen, FETCH_TIMEOUT_MS).then((changed) => { if (changed && gen === this._gen) this._refresh(); });
    }
    return r;
  }

  _poll(gen) {
    this._pollTimer = setTimeout(() => {
      this._pollTimer = 0;
      if (gen !== this._gen) return;
      this._fetchFeed(gen, POLL_MS).then((changed) => {
        if (gen !== this._gen) return;
        if (changed) this._refresh();
        this._poll(gen);
      });
    }, POLL_MS);
  }

  // Fetch the feed. Resolves true when its pages changed. Errors keep the last good data (logged once per outage).
  async _fetchFeed(gen, timeoutMs) {
    const url = feedUrl(this._data);
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    if (this._abort) this._abort.abort();
    this._abort = ctrl;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, timeoutMs);
    try {
      const res = await fetch(url, ctrl ? { cache: 'no-store', signal: ctrl.signal } : { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body || !body.data || typeof body.data !== 'object') throw new Error('no "data" object in the feed');
      if (gen !== this._gen) return false;
      const pages = {};
      for (const g of GROUPS) pages[g] = normalizePages(body.data[g]);
      const text = JSON.stringify(pages);
      if (this._feedFailed) console.info('[efn] ticker feed is back:', url);
      this._feedFailed = false;
      if (this._feed && this._feed.url === url && this._feed.text === text) return false;
      this._feed = { url, pages, text };
      return true;
    } catch (e) {
      if (gen === this._gen && !this._feedFailed) console.warn('[efn] ticker feed unavailable, keeping the last data:', url, (e && e.message) || e);
      if (gen === this._gen) this._feedFailed = true;
      return false;
    } finally {
      clearTimeout(timer);
      if (this._abort === ctrl) this._abort = null;
    }
  }

  // ---------- pages over time ----------

  // Which page is shown at T: { idx, prev, turn, next }. idx is the current page; prev and turn (ms) describe the
  // latest page turn (null if none happened in this showing); next is the time of the next turn (null if none).
  // Flowics: the list starts at the first page at each take-in and advances every interval; a change of interval
  // or page count restarts the timer, and a page that no longer exists falls back to the first one.
  _pages(T) {
    const show = this._showingAt(T), log = this._sceneLog;
    if (!show || !log.length) return { idx: 0, prev: null, turn: null, next: null };
    const end = show.until === null ? T : Math.min(T, show.until);
    let j = 0;
    while (j + 1 < log.length && log[j + 1].at <= show.since) j++;
    let S = timing(log[j].scene), anchor = show.since, idx = 0, prev = null, turn = null;
    const advance = (to) => {
      if (S.count < 2) return;
      const k = Math.floor((to - anchor) / S.interval);
      if (k < 1) return;
      prev = (idx + k - 1) % S.count;
      idx = (idx + k) % S.count;
      turn = anchor + k * S.interval;
      anchor = turn;
    };
    for (j++; j < log.length && log[j].at <= end; j++) {
      advance(log[j].at);
      const c = timing(log[j].scene);
      if (idx >= c.count) { idx = 0; prev = null; turn = null; }
      if (prev !== null && prev >= c.count) prev = null;
      anchor = log[j].at;
      S = c;
    }
    advance(end);
    return { idx, prev, turn, next: show.until === null && S.count >= 2 ? anchor + S.interval : null };
  }

  isAnimating(T) {
    const p = this._pages(T);
    return p.turn !== null && T < p.turn + TURN.in.delay + TURN.in.duration;
  }

  nextAnimationAt(T) { return this._pages(T).next; }

  // ---------- drawing ----------

  buildScene(scene) {
    this.lt.resetIds();
    const defs = [];
    const s = this.lt.logoTicker({ logo: scene.logo, pages: scene.pages }, { defs, separateGlint: true });
    const L = (this._layout = s.layout);
    this._tickerClip = s.tickerClip;
    const id = (n) => `${this._id}${n}`;
    const top = f2(L.y - 12), h = 100;   // clip band: the row plus room for rims and the glint's overshoot
    defs.push(
      `<clipPath id="${id('logoSlide')}"><rect x="${f2(L.logo.x)}" y="${top}" width="${OPEN}" height="${h}"/></clipPath>`,
      `<clipPath id="${id('listWipe')}"><rect data-efn="list-wipe" x="${f2(L.ticker.x - 3)}" y="${top}" width="0" height="${h}"/></clipPath>`);
    // The ticker plate slides under its own slanted left edge: while it moves it is clipped to its silhouette at
    // rest (Flowics' hard mask). The columns are always clipped to it.
    // The logo box's glint goes in the overlay (composited separately, so it doesn't redraw the plates and text).
    const logoGroup = (inner) => `<g data-efn="logo" clip-path="url(#${id('logoSlide')})"><g data-efn="logo-slide">${inner}</g></g>`;
    const body =
      logoGroup(s.logoPlate + s.wordmark) +
      `<g data-efn="plate"><g data-efn="plate-clip"><g data-efn="plate-slide">${s.tickerPlate}</g></g></g>` +
      `<g data-efn="list" clip-path="url(#${s.tickerClip})"><g clip-path="url(#${id('listWipe')})"><g data-efn="list-move">` +
      s.pages.map((p, i) => `<g data-page="${i}">${p}</g>`).join('') +
      '</g></g></g>';
    return { defs, body, overlay: logoGroup(s.logoGlint) };
  }

  bindScene(root) {
    const q = (sel) => root.querySelector(sel), all = (sel) => Array.prototype.slice.call(root.querySelectorAll(sel));
    this._el = {
      logo: all('[data-efn="logo"]'), logoSlide: all('[data-efn="logo-slide"]'),
      plate: q('[data-efn="plate"]'), plateClip: q('[data-efn="plate-clip"]'), plateSlide: q('[data-efn="plate-slide"]'),
      list: q('[data-efn="list"]'), wipe: q('[data-efn="list-wipe"]'), move: q('[data-efn="list-move"]'),
      pages: all('[data-page]'),
    };
  }

  applyChannels(v, T) {
    const L = this._layout, el = this._el;
    show(el.logo, v.logo > 0);
    el.logoSlide.forEach((g) => move(g, v.logo >= 1 ? 0 : -(1 - v.logo) * L.logo.w, 1));
    show(el.plate, v.plate > 0);
    move(el.plateSlide, v.plate >= 1 ? 0 : -(1 - v.plate) * L.ticker.w, 1);
    if (v.plate >= 1) el.plateClip.removeAttribute('clip-path');
    else el.plateClip.setAttribute('clip-path', `url(#${this._tickerClip})`);

    const item = v.itemIn * v.itemOut;
    const on = v.listWipe > 0 && v.listFade > 0 && item > 0 && el.pages.length > 0;
    show(el.list, on);
    el.wipe.setAttribute('width', v.listWipe >= 1 ? OPEN : f2(3 + v.listWipe * L.ticker.w));
    move(el.move, -SHIFT * (1 - v.listFade), v.listFade);
    // Each page: the take-in / take-out motion of the list item, plus the page turn.
    const p = on ? this._pages(T) : { idx: 0, prev: null, turn: null };
    const x0 = -SHIFT * (1 - v.itemIn) + SHIFT * (1 - v.itemOut);
    const outE = p.turn === null ? 1 : progress(T - p.turn, TURN.out), inE = p.turn === null ? 1 : progress(T - p.turn, TURN.in);
    el.pages.forEach((g, i) => {
      if (i === p.idx) { show(g, inE > 0); move(g, x0 - SHIFT * (1 - inE), item * inE); }
      else if (i === p.prev && outE < 1) { show(g, true); move(g, x0 + SHIFT * outE, item * (1 - outE)); }
      else { show(g, false); move(g, 0, 1); }
    });
  }
}

// ---------- helpers ----------

function feedUrl(data) { return data.feed || FEED; }
function timing(scene) { return { interval: scene.interval, count: scene.pages.length }; }
// Eased progress of a page-turn tween: exactly 0 before and 1 after it.
function progress(dt, tw) { return EASE['sine.in']((dt - tw.delay) / tw.duration); }

// Pages as the feed delivers them: [[row, row, row, row], ...], at most 4 rows a page. Also accepts JSON text
// (from controllers that only edit strings). Rows keep only the fields the ticker shows.
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]+)$/i;
function normalizePages(pages) {
  if (typeof pages === 'string') { try { pages = pages.trim() ? JSON.parse(pages) : []; } catch (e) { pages = []; } }
  if (!Array.isArray(pages)) return [];
  return pages.filter(Array.isArray).map((page) => page.slice(0, 4).map((row) => {
    const r = row && typeof row === 'object' ? row : {};
    const color = str(r['Color value']).trim();
    return { 'Kort namn': str(r['Kort namn']), 'Eget namn': str(r['Eget namn']), 'Procent string': str(r['Procent string']), 'Color value': COLOR.test(color) ? color : '' };
  })).filter((page) => page.length > 0);
}
function str(v) { return v === undefined || v === null ? '' : String(v); }

// show / hide one element or each element of a list
function show(el, on) { [].concat(el).forEach((e) => { if (on) e.removeAttribute('display'); else e.setAttribute('display', 'none'); }); }
// Horizontal offset and opacity of a group; attributes are removed at rest so the shown state is the plain markup.
function move(el, x, opacity) {
  if (Math.abs(x) < 0.005) el.removeAttribute('transform'); else el.setAttribute('transform', `translate(${f2(x)},0)`);
  if (opacity >= 1) el.removeAttribute('opacity'); else el.setAttribute('opacity', String(Math.round(Math.max(0, opacity) * 10000) / 10000));
}
function f2(n) { return Math.round(n * 100) / 100; }
