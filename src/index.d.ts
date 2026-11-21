// Type declarations for efn-lower-thirds (the code is plain JavaScript ES modules).

export type CardPosition = 'left' | 'middle' | 'right' | 'none';

/** Shape parameters of a component (registry `components[].shape`). px are 1x on the 1920x1080 canvas. */
export interface Shape {
  position: CardPosition;
  skewDeg: number;
  radius: number;
  angleComp?: number;
  height: number;
  insetTop?: number;
  straightInsetPx?: { left?: number; right?: number };
  slantOutsetPx?: { left?: number; right?: number };
}

export interface LogoBoxVariant {
  id: string;
  flowicsName: string;
  flowicsSize: { w: number; h: number };
  clientWordmark?: { supplied: boolean; file?: string; placement?: { tx: number; ty: number; scale: number } };
  [key: string]: unknown;
}

export interface Component {
  id: string;
  description?: string;
  flowicsNames?: string[];
  shape?: Shape;
  boxHeight?: number;
  variants?: LogoBoxVariant[] | Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface Registry {
  rows: { ownRow: { y: number; h: number }; mainRow: { y: number; h: number }; logoLine: { y: number; h: number }; safeLeft: number; safeRight: number };
  adjacentPlateOverlapPx: number;
  components: Component[];
  [key: string]: unknown;
}

export type Tokens = Record<string, any>;

/** One ticker item as delivered by the feed (see sampleTickerPayload). */
export interface TickerRow {
  'Kort namn'?: string;
  'Eget namn'?: string;
  'Procent string'?: string;
  'Color value'?: string;
  [field: string]: string | undefined;
}

export interface Content {
  name?: string;
  title?: string;
  /** logo-box variant id: borsfrukost, borslunch, marknad, ravaror, direkt, update, morgon, nobel */
  logo?: string;
  /** 4 ticker rows */
  page?: TickerRow[];
  clock?: string;
  date?: string;
}

/** Text advance in px for the given font weight and size. */
export type MeasureText = (text: string, font: { weight: number | string; sizePx: number }) => number;

export interface CompositeOptions {
  /** Sizes the name and title plates from the text. Without it the Flowics widths are used. */
  measureText?: MeasureText;
  /** Folder of the AkkuratStd woff files embedded as @font-face, or null when the page loads the fonts. */
  fontsUrl?: string | null;
  /** No fixed width/height: the SVG fills its container. Default true. */
  fluid?: boolean;
}

export interface PlateOptions {
  /** Receives the plate's <defs> entries. */
  defs: string[];
  fill?: unknown;
  bevel?: unknown;
  glint?: unknown;
  shape?: Shape;
  height?: number;
  /** Receives the plate's glint (masked to the plate) instead of drawing it inside the plate, e.g. for a separately
   *  composited layer so the glint animation doesn't redraw the plate. */
  glintTo?: string[];
}

export interface Geometry { X: number; Y: number; W: number; H: number }

export interface NameStrapOptions {
  measureText?: MeasureText;
  /** 'own': y 880.41, above the main row (default). 'main': y 956.01, in place of the logo box. */
  row?: 'own' | 'main';
  /** Receives the parts' <defs> entries. */
  defs?: string[];
  /** Return the name plate's glint separately (nameGlint) instead of inside namePlate. */
  separateGlint?: boolean;
}

export interface NameStrap {
  namePlate: string;
  nameText: string;
  /** The name plate's glint, when separateGlint was set. */
  nameGlint?: string;
  /** '' when the title is empty */
  titlePlate: string;
  titleText: string;
  layout: {
    y: number;
    name: { x: number; w: number; textBoxW: number; fontPx: number };
    /** null when the title is empty. elementW: the title element's width to the safe right edge (its wipe width). */
    title: { x: number; y: number; w: number; elementW: number; fontPx: number } | null;
  };
}

export interface LogoTicker {
  logoPlate: string;
  /** The logo box's glint, when separateGlint was set. */
  logoGlint?: string;
  /** '' when no wordmark was supplied for the variant */
  wordmark: string;
  tickerPlate: string;
  /** id of a clipPath (pushed to defs) with the ticker plate's silhouette; clip the pages with it */
  tickerClip: string;
  /** markup per page: 4 column ramps plus each row's value box and texts */
  pages: string[];
  layout: {
    y: number;
    logo: { x: number; w: number; variant: string };
    /** ticker plate box: starts 4.5 px before the logo box ends, runs to the safe right edge */
    ticker: { x: number; w: number };
    list: { x: number; y: number; w: number; h: number; colW: number };
  };
}

export type PlateStyleName = 'navy' | 'location' | 'red' | 'gold' | 'beige' | 'beige-light' | 'line-left' | 'line-right';
/** Which sides of a plate are slanted. */
export type Slant = 'right' | 'left' | 'both' | 'none';

/** A measured plate look (see Renderer.plateStyle). */
export interface PlateStyle {
  /** registry component the look comes from */
  component: Component;
  fill: unknown;
  bevel: unknown;
  /** null when the plate has no glint */
  glint: unknown | null;
  slant: Slant;
  radius: number;
  /** measured plate height in px */
  height: number;
  /** text colour used on it */
  textColor: string;
}

export interface StylePlateOptions {
  width: number;
  /** default: the style's measured height */
  height?: number;
  x?: number;
  y?: number;
  /** default: the style's own */
  slant?: Slant;
  /** default: the style's measured radius */
  radius?: number;
  /** true: the style's glint (if it has one), travel scaled to the width */
  glint?: boolean;
  /** receives the plate's <defs> entries */
  defs: string[];
}

/** One layer of the refinements' SVG shading: offset, gaussian blur (stdDeviation), colour and opacity. */
export interface FilterLayer { dx: number; dy: number; blur: number; color: string; opacity: number }
/** Text shading: ambient and contact drop shadows, rim light (top-left inner edge), shade (bottom-right inner edge). */
export interface TextShading { ambient: FilterLayer; contact: FilterLayer; rim: FilterLayer; shade?: FilterLayer }
/** EFN's additions to the measured look (tokens.refinements). */
export interface Refinements {
  textLight: TextShading;
  textDark: TextShading;
  /** bold dark text (title, ticker names): this weight plus a stroke of strokeEm (em) in the text colour */
  darkText?: { weight: number; strokeEm: number };
  /** the listed components' plates (the beige ones) burn in towards their edges: strength at distance d = opacity x
   *  [(1 - edgeShare) x (1 - d / width)^curve + edgeShare x exp(-d / edgeWidth)]; dx/dy = shift towards the light,
   *  burn = gamma exponent, saturate = saturation boost */
  vignette: { components: string[]; width: number; curve?: number; edgeShare?: number; edgeWidth?: number; cornerSoftness?: number; dx: number; dy: number; burn: number; saturate: number; opacity: number };
  [key: string]: unknown;
}

export interface RendererOptions {
  registry: Registry;
  tokens: Tokens;
  /** Text of assets/logos/EFN_logo.svg (needed for the logo line). */
  efnLogoSvg?: string | null;
  /** Wordmark SVG text per logo-box variant id. */
  wordmarks?: Record<string, string>;
  /** Prefix for every SVG id, to keep ids unique when several SVGs share one HTML document. */
  idPrefix?: string;
  /** EFN's refinements (text shading, beige vignette). Default true; false draws the exact Flowics replica. */
  refinements?: boolean;
}

export interface Renderer {
  comp(id: string): Component | undefined;
  resetIds(): void;
  /** The refinement parameters in use, or null when refinements are off. */
  refinements: Refinements | null;
  /** The two text-shading <filter>s (ids <idPrefix>textLight / textDark); '' when refinements are off. */
  textFilters: string;
  /** ` filter="url(#…)"` for a text element ('light' on navy/red/value boxes, 'dark' on beige); '' when off. */
  textAttr(kind: 'light' | 'dark'): string;
  /** One plate (fill, rims, glint, silhouette mask). Pushes its <defs> entries into options.defs. */
  plate(component: Component, width: number, x: number, y: number, options: PlateOptions): string;
  /** <filter> definitions used by efnLogo() and wordmark(); add them to the document's defs. */
  logoFilters: string;
  efnLogo(x: number, y: number, w: number, h: number, fill?: string): string;
  wordmark(variant: LogoBoxVariant, boxX: number, boxY: number): string;
  svgDocument(w: number, h: number, defs: string[], body: string, options?: { fontsUrl?: string | null; fluid?: boolean }): string;
  /** Title box width for a text advance: 0.5em + text + 0.8em. */
  titleWidth(textWidth: number): number;
  /** Name plate width for a text advance (provisional rule: at least the Flowics 588.5 px). */
  namePlateWidth(textWidth: number): number;
  /** Name plate + title plate on one row, as separate parts (for animating them). */
  nameStrap(content?: { name?: string; title?: string }, options?: NameStrapOptions): NameStrap;
  /** Names of the plate styles: the measured looks, usable at any size. */
  plateStyles: PlateStyleName[];
  plateStyle(name: PlateStyleName): PlateStyle;
  /** One plate in a style at any width/height/slant/radius, filling exactly x..x+width, y..y+height. */
  stylePlate(name: PlateStyleName, options: StylePlateOptions): string;
  /** One styled plate as a complete SVG document (width x height, or fluid). */
  plateSvg(name: PlateStyleName, options: Omit<StylePlateOptions, 'defs' | 'x' | 'y'> & { fluid?: boolean }): string;
  /** Logo box + ticker plate on the main row, with the ticker pages, as separate parts (for animating them). */
  logoTicker(content?: { logo?: string; pages?: TickerRow[][] }, options?: { defs: string[]; separateGlint?: boolean }): LogoTicker;
  /** The full lower third as one SVG document. */
  composite(content?: Content, options?: CompositeOptions): string;
  /** Every plate at its Flowics size, without text. */
  elements(): Array<{ file: string; svg: string }>;
  geom: typeof geom;
  shapePath: typeof shapePath;
  slantOffset: typeof slantOffset;
  cornerGeom: typeof cornerGeom;
}

export function createRenderer(options: RendererOptions): Renderer;
/** A renderer with the package's own registry, tokens, EFN logo and wordmarks. */
export function createLowerThird(options?: Partial<RendererOptions>): Renderer;

export function geom(shape: Shape, w: number, x?: number, y?: number, options?: { height?: number }): Geometry;
export function shapePath(shape: Shape, w: number, x?: number, y?: number, options?: { height?: number; radius?: number }): string;
export function slantOffset(shape: Shape, height?: number): number;
export function cornerGeom(shape: Shape, g: Geometry): Array<{ P: Point; A: Point; B: Point; C: Point; nA: Point; nB: Point }>;
export function f2(n: number | string): number;
export function esc(text: unknown): string;

export interface Point { x: number; y: number }
export function roundedSkewedCardPathUniform(options: { width: number; height: number; skewDeg: number; position: CardPosition; radius?: number; angleComp?: number }): string;
export function cardCorners(width: number, height: number, skewDeg: number, position: CardPosition): Point[];

export const registry: Registry;
export const tokens: Tokens;
export const efnLogoSvg: string;
export const wordmarks: Record<string, string>;
export const sampleTickerPayload: { data: Record<string, TickerRow[][]>; [key: string]: unknown };

export { ease, cssEase } from './motion.js';
export type { EaseName } from './motion.js';
export { designTokens } from './design-tokens.js';
export type { Gradient } from './design-tokens.js';

export const fontFiles: Array<{ weight: string; style: string; url: string }>;
/** Browser: register and load AkkuratStd from the package. */
export function loadFonts(fontSet?: FontFaceSet, family?: string): Promise<void>;
/** Browser: a MeasureText using a canvas and the real font. */
export function browserMeasureText(family?: string): MeasureText;
