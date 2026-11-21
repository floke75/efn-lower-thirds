// Shared base for the EFN OGraf graphics (OGraf Graphics v1, https://ograf.ebu.io).
//
// A graphic subclass describes WHAT to draw and HOW it animates; this class does everything the OGraf
// interface requires:
//   load / dispose / playAction / stopAction / updateAction / customAction   (real-time)
//   goToTime / setActionsSchedule                                            (non-real-time)
//
// Animation model. Each graphic has a few "channels" (e.g. plate, name, title), each a number from 0 (hidden)
// to 1 (shown). Taking the graphic in or out adds an entry to an action log; each entry starts one tween per
// channel (delay, duration, easing, target value). The visible state at time T is a pure function of the log
// and T. Real-time rendering evaluates it at "now"; non-real-time rendering evaluates it at the requested
// timestamp, with the log built from the action schedule. Both paths use the same code, so a frame rendered
// with goToTime() matches the frame shown live at the same moment.
//
// A new action interrupts the previous one cleanly: each channel continues from wherever it is when the new
// tween for that channel starts, and tweens of the old action that had not started yet are dropped.
//
// Subclass contract:
//   static get defaults()            data used when load() gets no data (mirrors the manifest schema defaults)
//   static get animation()           { in: {channel: {delay, duration, ease}}, out: {...} }  (ms; ease: see EASE)
//   normalize(data)                  -> clean data object (types coerced, unknown fields dropped)
//   buildScene(data)                 -> { defs: string[], body: string }  SVG markup for the 1920x1080 stage
//   bindScene(svg)                   look up the elements applyChannels() drives
//   applyChannels(values)            values = {channel: 0..1}; update transforms / clip rects
//
// Written as plain ES2020 (no class fields), so it runs in older Chromium/CEF builds used by renderers.
import { createLowerThird, loadFonts, browserMeasureText } from './efn-lower-thirds.mjs';

export const EASE = {
  linear: (p) => p,
  'sine.in': (p) => 1 - Math.cos((p * Math.PI) / 2),
  'sine.out': (p) => Math.sin((p * Math.PI) / 2),
  'sine.inOut': (p) => -(Math.cos(Math.PI * p) - 1) / 2,
};

const STAGE_CSS = `
:host { display: block; position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
svg.efn-stage { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; }
text { font-family: AkkuratStd, Arial, sans-serif; }
`;

let instances = 0;

export class EfnGraphic extends HTMLElement {
  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    this._id = `efn${++instances}-`;          // unique SVG id prefix per instance
    this._log = [];                            // [{ at, kind: 'in' | 'out', instant }]
    this._step = undefined;                    // current step (undefined = start / end state)
    this._data = null;
    this._renderType = 'realtime';
    this._origin = 0;                          // performance.now() at load()
    this._floor = 0;                           // the real-time clock never runs backwards past this (see _waitUntil)
    this._raf = 0;
    this._waits = new Set();                   // pending action promises { timer, resolve }
    this._schedule = [];                       // non-real-time
    this._renderedKey = null;
  }

  // ---------- OGraf: lifecycle ----------

  async load(params) {
    const { data, renderType = 'realtime' } = params || {};
    try {
      this._cancel();
      this._renderType = renderType === 'non-realtime' ? 'non-realtime' : 'realtime';
      this._origin = performance.now();
      this._floor = 0;
      this._log = [];
      this._step = undefined;
      this._schedule = [];
      try { await loadFonts(); } catch (e) { console.warn('[efn] AkkuratStd could not be loaded, using a fallback font', e); }
      this.lt = createLowerThird({ idPrefix: this._id });
      this.measureText = browserMeasureText();
      this._data = this.normalize(Object.assign({}, this.constructor.defaults, data || {}));
      this._root.innerHTML = '';
      this._render(this._renderType === 'realtime' ? this._now() : 0, this._data);
      return { statusCode: 200 };
    } catch (e) {
      return error(e);
    }
  }

  async dispose() {
    this._cancel();
    this._root.innerHTML = '';
    this._log = [];
    this._schedule = [];
    this._svg = null;
    return { statusCode: 200 };
  }

  // ---------- OGraf: real-time actions ----------

  async playAction(params) {
    const { goto, delta, skipAnimation = false } = params || {};
    try {
      const target = this._targetStep(this._step, goto, delta);
      if (target === undefined) {                                    // past the last step: take it out
        const done = this._takeOut(skipAnimation);
        this._step = undefined;
        await done;
        return { statusCode: 200, currentStep: undefined };
      }
      const done = this._step === undefined ? this._takeIn(skipAnimation) : Promise.resolve();
      this._step = target;
      await done;
      return { statusCode: 200, currentStep: this._step };
    } catch (e) {
      return Object.assign(error(e), { currentStep: this._step });
    }
  }

  async stopAction(params) {
    const { skipAnimation = false } = params || {};
    try {
      const done = this._takeOut(skipAnimation);
      this._step = undefined;
      await done;
      return { statusCode: 200 };
    } catch (e) {
      return error(e);
    }
  }

  async updateAction(params) {
    const { data } = params || {};
    try {
      this._data = this.normalize(Object.assign({}, this._data, data || {}));
      if (this._renderType === 'realtime') this._render(this._now(), this._data);
      return { statusCode: 200 };
    } catch (e) {
      return error(e);
    }
  }

  async customAction(params) {
    const id = params && params.id;
    return { statusCode: 400, statusMessage: `Unknown custom action: ${String(id)}` };
  }

  // ---------- OGraf: non-real-time ----------

  async setActionsSchedule(params) {
    const schedule = (params && params.schedule) || [];
    this._schedule = schedule.slice().sort((a, b) => a.timestamp - b.timestamp);
    return {};
  }

  async goToTime(params) {
    try {
      const T = Math.max(0, Number(params && params.timestamp) || 0);
      const { log, data } = this._replaySchedule(T);
      this._log = log;
      this._render(T, data);
      return { statusCode: 200 };
    } catch (e) {
      return error(e);
    }
  }

  // ---------- steps ----------

  _targetStep(current, goto, delta) {
    const stepCount = this.constructor.stepCount;
    const target = Number.isInteger(goto) && goto >= 0 ? goto : (current === undefined ? -1 : current) + (Number.isInteger(delta) ? delta : 1);
    if (target < 0) return 0;
    return stepCount >= 0 && target >= stepCount ? undefined : target;
  }
  static get stepCount() { return 1; }

  // ---------- action log ----------

  _takeIn(instant) { return this._transition('in', instant); }
  _takeOut(instant) { return this._transition('out', instant); }

  // Going in while already in (or out while already out): don't restart the animation. Wait for the running
  // one, or jump to its end state when skipAnimation is set.
  _transition(kind, instant) {
    const last = this._log[this._log.length - 1];
    const already = last ? last.kind === kind : kind === 'out';
    if (already && !instant) return last ? this._waitUntil(this._entryEnd(last)) : Promise.resolve();
    if (!last && kind === 'out') return Promise.resolve();
    return this._addAction(kind, instant);
  }

  _addAction(kind, instant) {
    if (this._renderType !== 'realtime') return Promise.resolve();   // non-real-time: driven by the schedule
    const now = this._now();
    this._compact(now);
    const entry = { at: now, kind, instant: !!instant };
    this._log.push(entry);
    this._resolveWaits();                                           // an earlier action's promise resolves now
    this._render(now, this._data);
    this._loop();
    return this._waitUntil(this._entryEnd(entry));
  }

  _tweens(entry) {
    const def = this.constructor.animation[entry.kind];
    const to = entry.kind === 'in' ? 1 : 0;
    return Object.keys(def).map((channel) => {
      const d = def[channel];
      const start = entry.at + (entry.instant ? 0 : d.delay);
      return { channel, start, end: start + (entry.instant ? 0 : d.duration), to, ease: EASE[d.ease] || EASE.linear, at: entry.at };
    });
  }

  _entryEnd(entry) { return Math.max.apply(null, this._tweens(entry).map((t) => t.end)); }

  // Channel values at time T: each channel continues from its current value when its next tween starts; tweens
  // that a later action pre-empted before they started are dropped.
  _valuesAt(T) {
    const all = [];
    this._log.forEach((e, i) => this._tweens(e).forEach((t) => all.push(Object.assign(t, { order: i }))));
    const values = {};
    const channels = Object.keys(this.constructor.animation.in);
    for (const ch of channels) {
      const list = all.filter((t) => t.channel === ch);
      const valid = list.filter((t) => !list.some((u) => u.order > t.order && u.at <= t.start))
        .sort((a, b) => a.start - b.start || a.order - b.order);
      let prev = null;
      for (const t of valid) {
        if (t.start > T) break;
        t.from = prev ? tweenValue(prev, t.start) : 0;
        prev = t;
      }
      values[ch] = prev ? tweenValue(prev, T) : 0;
    }
    return values;
  }

  // Start time of the most recent take-in at or before T (glint loops are timed from it), or null if hidden.
  _shownSince(T) {
    let since = null;
    for (const e of this._log) if (e.at <= T) since = e.kind === 'in' ? e.at : null;
    return since;
  }

  // Keep the log short in long real-time sessions: once nothing is animating, the state is fully described by
  // one instant entry.
  _compact(now) {
    if (!this._log.length) return;
    const busy = this._log.some((e) => this._entryEnd(e) > now);
    if (busy) return;
    const last = this._log[this._log.length - 1];
    const since = this._shownSince(now);
    this._log = [{ at: last.kind === 'in' ? since : last.at, kind: last.kind, instant: true }];
  }

  // ---------- non-real-time schedule ----------

  _replaySchedule(T) {
    let data = this.normalize(Object.assign({}, this._data));
    let step;
    const log = [];
    for (const item of this._schedule) {
      if (item.timestamp > T) break;
      const a = item.action || {}, p = a.params || {}, at = item.timestamp;
      if (a.type === 'updateAction') data = this.normalize(Object.assign({}, data, p.data || {}));
      else if (a.type === 'playAction') {
        const target = this._targetStep(step, p.goto, p.delta);
        if (target === undefined) { log.push({ at, kind: 'out', instant: !!p.skipAnimation }); step = undefined; }
        else { if (step === undefined) log.push({ at, kind: 'in', instant: !!p.skipAnimation }); step = target; }
      } else if (a.type === 'stopAction') { log.push({ at, kind: 'out', instant: !!p.skipAnimation }); step = undefined; }
    }
    return { log, data };
  }

  // ---------- rendering ----------

  // Real-time clock (ms since load). Monotonic, and never earlier than an action end that has already been
  // rendered: timers can fire a fraction of a millisecond early, and the final frame must be the exact end state.
  _now() { return Math.max(performance.now() - this._origin, this._floor); }

  _render(T, data) {
    const key = JSON.stringify(data);
    if (key !== this._renderedKey) {
      const scene = this.buildScene(data);
      this._root.innerHTML = `<style>${STAGE_CSS}</style><svg class="efn-stage" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet"><defs>${scene.defs.join('')}</defs>${scene.body}</svg>`;
      this._svg = this._root.querySelector('svg');
      this.bindScene(this._svg);
      this._renderedKey = key;
    }
    this.applyChannels(this._valuesAt(T));
    this._syncGlint(T);
  }

  // Glints are SMIL animations on a 15 s loop that starts when the graphic is taken in (as the Flowics videos
  // did). Real-time: restart the SVG clock at each take-in and let it run. Non-real-time: pause it and seek.
  _syncGlint(T) {
    const svg = this._svg;
    if (!svg || typeof svg.setCurrentTime !== 'function') return;
    const since = this._shownSince(T);
    if (since === null || this._renderType !== 'realtime') {
      svg.pauseAnimations();
      svg.setCurrentTime(since === null ? 0 : Math.max(0, T - since) / 1000);
    } else {
      const want = Math.max(0, T - since) / 1000;
      if (svg.animationsPaused() || Math.abs(svg.getCurrentTime() - want) > 0.1) svg.setCurrentTime(want);
      svg.unpauseAnimations();
    }
  }

  _loop() {
    if (this._raf || typeof requestAnimationFrame !== 'function') return;
    const tick = () => {
      this._raf = 0;
      const now = this._now();
      this._render(now, this._data);
      if (this._log.some((e) => this._entryEnd(e) > now)) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  // Resolves at real-time T (or earlier, when a newer action supersedes it). Renders the final frame itself too,
  // so the end state is exact even where requestAnimationFrame is throttled.
  _waitUntil(T) {
    return new Promise((resolve) => {
      const w = { resolve };
      w.timer = setTimeout(() => { this._waits.delete(w); this._floor = Math.max(this._floor, T); this._render(this._now(), this._data); resolve(); }, Math.max(0, T - this._now()));
      this._waits.add(w);
    });
  }

  _resolveWaits() {
    for (const w of this._waits) { clearTimeout(w.timer); w.resolve(); }
    this._waits.clear();
  }

  _cancel() {
    this._resolveWaits();
    if (this._raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._renderedKey = null;
  }
}

function tweenValue(t, T) {
  if (T >= t.end) return t.to;
  if (T <= t.start) return t.from;
  return t.from + (t.to - t.from) * t.ease((T - t.start) / (t.end - t.start));
}

function error(e) {
  console.error('[efn]', e);
  return { statusCode: 500, statusMessage: (e && e.message) || String(e) };
}
