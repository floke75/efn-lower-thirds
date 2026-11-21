// Types for src/motion.js.
export type EaseName = 'linear' | 'sine.in' | 'sine.out' | 'sine.inOut' | 'power1.in' | 'power1.out' | 'power1.inOut' | 'slow';
/** Easing curves (GSAP names): progress 0..1 -> eased 0..1, exactly 0 and 1 at the ends. */
export declare const ease: Record<EaseName, (progress: number) => number>;
/** CSS timing functions closest to each curve ("slow" has none: animate it from JavaScript). */
export declare const cssEase: Record<Exclude<EaseName, 'slow'>, string>;
