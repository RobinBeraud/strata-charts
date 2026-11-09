import type { Scene } from '../render/scene';
import type { Scale } from '../scales/scale';
import type { NSeries, Point } from './model';
import type { TooltipRow } from './types';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HitPoint {
  px: number;
  py: number;
  /** Pixel position of the point's x value along the x axis (band centre for categories). */
  along: number;
  point: Point;
  el?: SVGElement;
  /** Hit radius for 2D picking (bubbles, heatmap cells). */
  r?: number;
}

export interface CartesianContext {
  scene: Scene;
  group: SVGGElement;
  defs: SVGGElement;
  uid: string;
  series: NSeries;
  /** Points inside the visible window (plus one neighbour on each side). */
  points: Point[];
  x: Scale;
  y: Scale;
  inverted: boolean;
  plot: Rect;
  stacking: 'normal' | 'percent' | false;
  /** Data -> screen coordinates, handling inverted charts. */
  pos(x: number, y: number): [number, number];
  /** Value where a point's bar/area starts, clamped to the visible value range. */
  base(p: Point): number;
  /** Position of this series among side-by-side columns. */
  slot: { index: number; count: number };
  /** Pixel width available for one x slot (category band or min x spacing). */
  bandwidth: number;
}

export interface TooltipInfo {
  header?: string;
  rows: TooltipRow[];
}

export interface TooltipEnv {
  xLabel: string;
  yCategories: string[];
  locale?: string;
}

export interface ColorScaleInfo {
  min: number;
  max: number;
  colors: string[];
}

export interface CartesianSeriesType {
  type: string;
  kind: 'cartesian';
  /** Prefers a category (band) x axis and sits in a column slot. */
  band?: boolean;
  /** Needs a bar width on continuous axes (candlesticks). */
  needsWidth?: boolean;
  /** Series of the same family stack together. */
  stackFamily?: string;
  /** Include the zero line in the value domain. */
  zeroBased?: boolean;
  /** Extra room around the data, as a fraction of each axis span (bubbles need it). */
  padding?: number;
  /** Hover picks the nearest point in 2D instead of the nearest x. */
  hover?: '2d' | 'x';
  /** Adjust y0/y1/lo/hi after stacking (waterfall running totals, OHLC extents…). */
  prepare?(s: NSeries): void;
  /** Custom tooltip rows for one point. */
  tooltip?(p: Point, env: TooltipEnv): TooltipInfo;
  /** Continuous colour legend (heatmaps). */
  colorScale?(s: NSeries): ColorScaleInfo;
  render(ctx: CartesianContext): HitPoint[];
}

/** Context for series that lay themselves out without axes (pie, gauge, treemap, sankey). */
export interface StandaloneContext {
  scene: Scene;
  group: SVGGElement;
  defs: SVGGElement;
  uid: string;
  series: NSeries;
  /** Area allotted to this series. */
  rect: Rect;
  cx: number;
  cy: number;
  /** Largest circle radius that fits the rect (minus label room when labels are on). */
  radius: number;
  locale?: string;
  showLabels: boolean;
  measure: (text: string, size?: number) => number;
  /** Per-chart UI state that survives re-renders (e.g. the treemap node being viewed). */
  state: Map<string, unknown>;
  /** Default data label setting for the chart. */
  dataLabels: boolean;
  /** Chart palette (for colours the series assigns itself, e.g. sankey nodes). */
  palette: string[];
}

/** One hoverable / focusable shape of a standalone series. */
export interface StandaloneItem {
  /** Matches the legend key ("seriesId:pointIndex") when the item has a legend entry. */
  key: string;
  point: Point;
  el: SVGElement;
  contains(x: number, y: number): boolean;
  /** Where the tooltip points to. */
  anchor: [number, number];
  /** CSS transform applied while hovered (pie slices pop out). */
  pop?: string;
  /** Other shapes highlighted together with this one (a sankey node's links). */
  linked?: Element[];
  header?: string;
  rows?: TooltipRow[];
  /** Click/Enter handler; return true when the chart must re-render (e.g. treemap zoom). Return an undo function to support "Back". */
  activate?: () => (() => void) | null;
}

export interface StandaloneHit {
  series: NSeries;
  items: StandaloneItem[];
}

export interface StandaloneSeriesType {
  type: string;
  kind: 'standalone';
  band?: undefined;
  needsWidth?: undefined;
  stackFamily?: undefined;
  /** What the legend lists: the points (pie), the series itself, or nothing. */
  legend?: 'points' | 'series' | 'none';
  /** Needs room for outside labels when laid out. */
  outsideLabels?: boolean;
  render(ctx: StandaloneContext): StandaloneHit;
}

export type SeriesType = CartesianSeriesType | StandaloneSeriesType;

/** Per-chart registry: series types are passed in, never patched onto shared prototypes. */
export class Registry {
  private types = new Map<string, SeriesType>();

  constructor(types: Iterable<SeriesType>) {
    for (const t of types) this.types.set(t.type, t);
  }

  get(type: string): SeriesType | undefined {
    return this.types.get(type);
  }
}
