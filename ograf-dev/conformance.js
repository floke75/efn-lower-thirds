// OGraf v1 conformance checks for a graphic, run in a browser the way a renderer would drive it.
// Covers the normative parts of https://ograf.ebu.io/v1/specification/docs/Specification.html that a graphic can
// get wrong, plus the lifecycle checks the EBU runs on its own examples. Used by ograf-dev/index.html.
//
//   import { runConformance } from './conformance.js';
//   const results = await runConformance(manifestUrl);   // [{ name, pass, detail }]

// A class can be registered under only one tag name: reuse the existing registration (as a renderer must when
// it shows a graphic twice), otherwise register it under a new tag.
const registered = new WeakMap();
export function tagFor(Graphic, prefix) {
  const known = registered.get(Graphic) || (customElements.getName && customElements.getName(Graphic));
  if (known) return known;
  const tag = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  customElements.define(tag, Graphic);
  registered.set(Graphic, tag);
  return tag;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (r) => r === undefined || (r && typeof r.statusCode === 'number' && r.statusCode >= 200 && r.statusCode < 300);
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
// Instance-specific ids (and nothing else) may differ between two renders of the same state.
const snapshot = (el) => (el.shadowRoot ? el.shadowRoot.innerHTML : el.innerHTML).replace(/efn\d+-/g, 'efnX-');

export async function runConformance(manifestUrl) {
  const results = [];
  const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
  const manifestHref = new URL(manifestUrl, location.href).href;
  const manifest = await (await fetch(manifestHref, { cache: 'no-store' })).json();
  const defaults = Object.fromEntries(Object.entries((manifest.schema && manifest.schema.properties) || {}).filter(([, p]) => 'default' in p).map(([k, p]) => [k, p.default]));
  const durations = Object.fromEntries((manifest.actionDurations || []).filter(d => d.type !== 'customAction').map(d => [d.type, d.duration]));
  const stepCount = manifest.stepCount === undefined ? 1 : manifest.stepCount;

  check('manifest file name ends with .ograf.json', /\.ograf\.json$/.test(new URL(manifestHref).pathname));
  const mod = await import(new URL(manifest.main, manifestHref).href);
  const Graphic = mod.default;
  check('main exports a default class extending HTMLElement', typeof Graphic === 'function' && Graphic.prototype instanceof HTMLElement);
  const required = ['load', 'dispose', 'playAction', 'stopAction', 'updateAction', 'customAction'].concat(manifest.supportsNonRealTime ? ['goToTime', 'setActionsSchedule'] : []);
  const missing = required.filter(m => typeof Graphic.prototype[m] !== 'function');
  check('implements every required method', !missing.length, missing.length ? `missing: ${missing.join(', ')}` : required.join(', '));
  const tag = tagFor(Graphic, 'ograf-conformance');

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1920px;height:1080px;overflow:hidden';
  document.body.append(host);
  const make = async (renderType = 'realtime', data = defaults) => {
    const el = document.createElement(tag);
    host.append(el);
    const r = await el.load({ data, renderType, renderCharacteristics: { resolution: { width: 1920, height: 1080 }, frameRate: 50 } });
    return { el, r };
  };

  try {
    // load / step model (realtime)
    let { el, r } = await make();
    check('load() resolves with a 2xx status', ok(r), JSON.stringify(r));
    const pristine = snapshot(el);   // loaded, never shown
    const p0 = await el.playAction({ goto: 0, skipAnimation: true });
    check('playAction({goto:0}) returns currentStep 0', ok(p0) && has(p0, 'currentStep') && p0.currentStep === 0, JSON.stringify(p0));
    if (stepCount >= 1) {
      const pEnd = await el.playAction({ goto: stepCount, skipAnimation: true });
      check(`playAction({goto:${stepCount}}) goes to the end: currentStep present and undefined`, ok(pEnd) && has(pEnd, 'currentStep') && pEnd.currentStep === undefined, JSON.stringify(pEnd));
      const a = await el.playAction({ skipAnimation: true }), b = await el.playAction({ skipAnimation: true });
      check('playAction() with default delta: start -> 0, then (stepCount 1) -> end', a.currentStep === 0 && (stepCount === 1 ? b.currentStep === undefined : b.currentStep === 1), `${a.currentStep} -> ${b.currentStep}`);
      const neg = await el.playAction({ delta: -5, skipAnimation: true });
      check('playAction with a negative delta from the start does not fail', ok(neg) && has(neg, 'currentStep'), JSON.stringify(neg));
    }
    const s = await el.stopAction({ skipAnimation: true });
    check('stopAction({skipAnimation:true}) resolves with a 2xx status', ok(s), JSON.stringify(s));
    const s2 = await el.stopAction({});
    check('stopAction() when already stopped resolves', ok(s2));
    const u = await el.updateAction({ data: defaults, skipAnimation: true });
    check('updateAction() resolves with a 2xx status', ok(u), JSON.stringify(u));
    const up = await el.updateAction({ data: {}, skipAnimation: true });
    check('updateAction() accepts a partial (empty) update', ok(up));
    const ids = (manifest.customActions || []).map(a => a.id);
    const c = await el.customAction({ id: '__not_an_action__', payload: null });
    check('customAction() with an unknown id returns a 4xx status', c && c.statusCode >= 400 && c.statusCode < 500, JSON.stringify(c));
    for (const id of ids) { const ca = await el.customAction({ id, payload: null, skipAnimation: true }); check(`customAction("${id}") resolves`, ok(ca)); }

    // timing: promises resolve when the animation has finished (actionDurations)
    await el.stopAction({ skipAnimation: true });
    let t0 = performance.now(); const pa = await el.playAction({ goto: 0 }); const dPlay = performance.now() - t0;
    if (durations.playAction > 0) check(`animated playAction resolves after its ${durations.playAction} ms animation`, ok(pa) && dPlay >= durations.playAction - 40 && dPlay <= durations.playAction + 500, `${Math.round(dPlay)} ms`);
    t0 = performance.now(); const sa = await el.stopAction({}); const dStop = performance.now() - t0;
    if (durations.stopAction > 0) check(`animated stopAction resolves after its ${durations.stopAction} ms animation`, ok(sa) && dStop >= durations.stopAction - 40 && dStop <= durations.stopAction + 500, `${Math.round(dStop)} ms`);
    check('when stopAction resolves, the output is exactly the never-shown state', snapshot(el) === pristine);

    // interruptions: every call resolves, the last one wins
    const play = el.playAction({ goto: 0 });
    await sleep(50);
    const stop = el.stopAction({ skipAnimation: true });
    const both = await Promise.race([Promise.all([play, stop]).then(() => true), sleep(4000).then(() => false)]);
    check('play interrupted by stop: both promises resolve', both);
    check('play interrupted by stop(skipAnimation): ends hidden, same as never shown', snapshot(el) === pristine);
    const p1 = el.playAction({ goto: 0 }), u1 = el.updateAction({ data: defaults }), s1 = el.stopAction({}), p2 = el.playAction({ goto: 0, skipAnimation: true });
    const all = await Promise.race([Promise.all([p1, u1, s1, p2]).then(() => true), sleep(5000).then(() => false)]);
    check('overlapping play/update/stop/play calls all resolve', all);
    const shownSnap = snapshot(el);
    await el.playAction({ goto: 0, skipAnimation: true });
    check('playAction({goto:0}) while already at step 0 does not change the output', snapshot(el) === shownSnap);

    // dispose
    const d = await el.dispose({});
    check('dispose() resolves with a 2xx status and clears the output', ok(d) && (el.shadowRoot ? el.shadowRoot.childElementCount === 0 : el.childElementCount === 0), JSON.stringify(d));
    el.remove();

    // non-real-time
    if (manifest.supportsNonRealTime) {
      ({ el, r } = await make('non-realtime'));
      check('non-realtime load() resolves with a 2xx status', ok(r));
      const sched = await el.setActionsSchedule({ schedule: [
        { timestamp: 100, action: { type: 'playAction', params: { goto: 0 } } },
        { timestamp: 2500, action: { type: 'updateAction', params: { data: defaults } } },
        { timestamp: 4000, action: { type: 'stopAction', params: {} } },
      ] });
      check('setActionsSchedule() resolves', sched === undefined || typeof sched === 'object');
      const frames = {};
      for (const t of [0, 600, 1300, 3000, 4500, 6000]) { const g = await el.goToTime({ timestamp: t }); frames[t] = { ok: ok(g), snap: snapshot(el) }; }
      check('goToTime() resolves with a 2xx status', Object.values(frames).every(f => f.ok));
      await el.goToTime({ timestamp: 1300 }); const again = snapshot(el);
      check('goToTime() is deterministic, also when seeking backwards', again === frames[1300].snap);
      check('non-realtime frames change over the schedule (in, shown, out)', frames[0].snap !== frames[600].snap && frames[600].snap !== frames[1300].snap && frames[1300].snap !== frames[6000].snap);
      check('non-realtime: hidden before the first play and after the stop animation', frames[0].snap === frames[6000].snap);
      const nrtShown = frames[3000].snap;
      await el.dispose({}); el.remove();
      // same state rendered in real time
      ({ el } = await make('realtime'));
      await el.playAction({ goto: 0, skipAnimation: true });
      const rtShown = snapshot(el);
      check('real-time and non-real-time render the shown state identically', rtShown === nrtShown);
      await el.dispose({}); el.remove();
    }
  } catch (e) {
    check('no exceptions', false, String(e && e.stack || e));
  } finally {
    host.remove();
  }
  return results;
}

