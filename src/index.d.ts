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
}

export interface Geometry { X: number; Y: number; W: number; H: number }

export interface NameStrapOptions {
  measureText?: MeasureText;
  /** 'own': y 880.41, above the main row (default). 'main': y 956.01, in place of the logo box. */
  row?: 'own' | 'main';
  /** Receives the parts' <defs> entries. */
  defs?: string[];
}

export interface NameStrap {
  namePlate: string;
  nameText: string;
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

export interface RendererOptions {
  registry: Registry;
  tokens: Tokens;
  /** Text of assets/logos/EFN_logo.svg (needed for the logo line). */
  efnLogoSvg?: string | null;
  /** Wordmark SVG text per logo-box variant id. */
  wordmarks?: Record<string, string>;
  /** Prefix for every SVG id, to keep ids unique when several SVGs share one HTML document. */
  idPrefix?: string;
}

export interface Renderer {
  comp(id: string): Component | undefined;
  resetIds(): void;
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

export const fontFiles: Array<{ weight: string; style: string; url: string }>;
/** Browser: register and load AkkuratStd from the package. */
export function loadFonts(fontSet?: FontFaceSet, family?: string): Promise<void>;
/** Browser: a MeasureText using a canvas and the real font. */
export function browserMeasureText(family?: string): MeasureText;
