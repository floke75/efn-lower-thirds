// Motion for EFN broadcast graphics: the easing curves the Flowics originals use, for JavaScript animation and as
// CSS approximations. Pure ES2018, no DOM.
//
//   import { ease, cssEase } from 'efn-lower-thirds';
//   const x = from + (to - from) * ease['sine.in'](t / duration);     // t in ms
//   el.style.transitionTimingFunction = cssEase['sine.in'];
//
// Names follow GSAP, which Flowics animates with. Every function maps progress 0..1 to 0..1 and returns exactly
// 0 and 1 at the ends (Math.cos(PI / 2) is not exactly 0, and "has the tween finished" checks rely on it).
// The per-element durations and delays are in designTokens.motion.

const exact = (f) => (p) => (p <= 0 ? 0 : p >= 1 ? 1 : f(p));

// GSAP SlowMo (EasePack), non-yoyo: fast in, a long near-linear slow middle, fast out. GSAP's "slow" is
// SlowMo with linearRatio 0.7 and power 0.7.
function slowMo(linearRatio, power) {
  const pow = linearRatio < 1 ? power : 0, p1 = (1 - linearRatio) / 2, p3 = p1 + linearRatio;
  return (p) => {
    const r = p + (0.5 - p) * pow;
    if (p < p1) { const q = 1 - p / p1; return r - q * q * q * q * r; }
    if (p > p3) { const q = (p - p3) / p1; return r + (p - r) * q * q * q * q; }
    return r;
  };
}

export const ease = {
  linear: exact((p) => p),
  'sine.in': exact((p) => 1 - Math.cos((p * Math.PI) / 2)),
  'sine.out': exact((p) => Math.sin((p * Math.PI) / 2)),
  'sine.inOut': exact((p) => -(Math.cos(Math.PI * p) - 1) / 2),
  'power1.in': exact((p) => p * p),
  'power1.out': exact((p) => 1 - (1 - p) * (1 - p)),
  'power1.inOut': exact((p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p))),
  slow: exact(slowMo(0.7, 0.7)),
};

// CSS timing functions closest to each curve (cubic-bezier fits; sine from the standard easeInSine family).
// "slow" has no cubic-bezier equivalent: animate it from JavaScript with ease.slow.
export const cssEase = {
  linear: 'linear',
  'sine.in': 'cubic-bezier(0.12, 0, 0.39, 0)',
  'sine.out': 'cubic-bezier(0.61, 1, 0.88, 1)',
  'sine.inOut': 'cubic-bezier(0.37, 0, 0.63, 1)',
  'power1.in': 'cubic-bezier(0.11, 0, 0.5, 0)',
  'power1.out': 'cubic-bezier(0.5, 1, 0.89, 1)',
  'power1.inOut': 'cubic-bezier(0.45, 0, 0.55, 1)',
};
