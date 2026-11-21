// Types for src/elements/efn-plate.js (import 'efn-lower-thirds/plate-element' to define <efn-plate>).
import type { PlateStyleName } from '../index.js';

/** <efn-plate variant slant radius glint flat>: an EFN plate behind its HTML content, redrawn when it resizes.
 *  flat: the exact Flowics look, without the refinements (text shading, beige vignette). */
export declare class EfnPlate extends HTMLElement {
  /** navy (default), location, red, gold, beige, beige-light, line-left, line-right */
  variant: PlateStyleName;
  /** Restart the glint loop (e.g. at a take-in). */
  restartGlint(): void;
  /** Draw now instead of on the next frame. Returns the plate's SVG markup. */
  render(): string;
}

declare global {
  interface HTMLElementTagNameMap { 'efn-plate': EfnPlate }
}
