/** Public option types. Plain data, fully typed, no global defaults object. */

export type Primitive = number | string | Date;

export interface PointObject {
  x?: Primitive;
  /** Numeric value, or a category label on category y axes (heatmap). */
  y?: number | string | null;
  /** Third dimension: bubble size, heatmap value. */
  z?: number | null;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  name?: string;
  color?: string;
  /** Id of a series in `drilldown.series` shown when the point is clicked. */
  drilldown?: string;
  /** Waterfall: this bar shows the running total instead of a delta. */
  isSum?: boolean;
  /** Treemap: node id and parent id (hierarchy). */
  id?: string;
  parent?: string;
  /** Alias of `y` (treemap). */
  value?: number;
  /** Sankey link: source node, target node, weight (alias of `y`). */
  from?: string;
  to?: string;
  weight?: number;
}

export type PointInput =
  | number
  | null
  | [Primitive, number | null]
  /** [x, y, z] — bubble / heatmap (y may be a category label). */
  | [Primitive, number | string | null, number | null]
  /** [x, open, high, low, close] — candlestick / ohlc. */
  | [Primitive, number, number, number, number]
  | PointObject;

export type SeriesKind =
  | 'line'
  | 'spline'
  | 'area'
  | 'areaspline'
  | 'column'
  | 'bar'
  | 'scatter'
  | 'bubble'
  | 'candlestick'
  | 'ohlc'
  | 'waterfall'
  | 'heatmap'
  | 'gauge'
  | 'treemap'
  | 'sankey'
  | 'pie'
  | 'donut'
  | (string & {});

export interface DataLabelOptions {
  /** Return the label text for a point. Rendered as text, never as HTML. */
  formatter?: (point: { x: number; y: number | null; label: string; series: string; percent?: number }) => string;
  /** Columns: draw the label inside the bar end. Defaults to inside when stacked. */
  inside?: boolean;
}

export interface SeriesOptions {
  /** Stable identity, used to animate between updates. Defaults to the index. */
  id?: string;
  type?: SeriesKind;
  name?: string;
  data: PointInput[];
  color?: string;
  visible?: boolean;
  /** Stack group name when `stacking` is on. */
  stack?: string;
  /** Index of the y axis this series is drawn against (see `yAxis` array). */
  yAxis?: number;
  /** Show point markers. Defaults to automatic (shown when points are sparse). */
  markers?: boolean;
  dash?: boolean;
  /** Value labels next to points. Collisions are resolved automatically. */
  dataLabels?: boolean | DataLabelOptions;
  /** One palette colour per point instead of one per series. */
  colorByPoint?: boolean;
  /** Pie/donut: inner radius as a ratio of the outer radius (0–0.9). */
  innerRadius?: number;
  /** Candlestick / ohlc / waterfall colours. */
  upColor?: string;
  downColor?: string;
  sumColor?: string;
  /** Heatmap / gauge colour ramp, low to high (2 or more colours). */
  colorRange?: string[];
  /** Gauge scale. Defaults to 0–100. */
  min?: number;
  max?: number;
  /** Gauge: coloured zones on the track. */
  bands?: { from: number; to: number; color: string }[];
  /** Gauge: classic dial with a needle instead of filled rings. */
  needle?: boolean;
  /** Text appended to displayed values (gauge, treemap, sankey). */
  suffix?: string;
  /** Sankey node overrides (colour, display name). */
  nodes?: { id: string; name?: string; color?: string }[];
}

export interface PlotLine {
  value: number;
  label?: string;
  color?: string;
}

export interface AxisOptions {
  type?: 'linear' | 'log' | 'time' | 'category';
  title?: string;
  categories?: string[];
  min?: number;
  max?: number;
  /** Secondary value axes are drawn on the opposite side by default. */
  opposite?: boolean;
  /** Intl options used for numeric tick labels. */
  numberFormat?: Intl.NumberFormatOptions;
  /** Custom label formatter. Wins over every other format option. */
  formatter?: (value: number, label: string) => string;
  grid?: boolean;
  /** `false` hides labels, title and grid (the axis still scales the data). */
  visible?: boolean;
  plotLines?: PlotLine[];
  plotBands?: { from: number; to: number; color?: string; label?: string }[];
}

export interface TooltipRow {
  series: string;
  color: string;
  value: number | null;
  percent?: number;
  /** Pre-formatted value (wins over `value`). */
  text?: string;
}

export interface TooltipContext {
  header: string;
  rows: TooltipRow[];
}

export interface TooltipOptions {
  enabled?: boolean;
  prefix?: string;
  suffix?: string;
  valueFormat?: Intl.NumberFormatOptions;
  /** Return a string (rendered as text, never as HTML) or a DOM node. */
  formatter?: (ctx: TooltipContext) => string | Node;
}

export interface RangeButton {
  label: string;
  /** Duration in ms, or 'ytd' / 'all'. */
  range: number | 'ytd' | 'all';
}

export interface ChartOptions {
  /** Default series type. */
  type?: SeriesKind;
  title?: string;
  subtitle?: string;
  /** Height of the plot stage in px (width is always the container's). */
  height?: number;
  theme?: 'auto' | 'light' | 'dark';
  palette?: string[];
  locale?: string;
  animation?: boolean | { duration?: number };
  stacking?: 'normal' | 'percent' | false;
  /** Swap axes (horizontal bars). Implied by `bar` series. */
  inverted?: boolean;
  xAxis?: AxisOptions;
  /** One value axis, or several (series pick one with `yAxis: index`). Ticks are aligned across axes. */
  yAxis?: AxisOptions | AxisOptions[];
  legend?: boolean | { position?: 'top' | 'bottom' };
  tooltip?: boolean | TooltipOptions;
  /** Drag (and ctrl/⌘ + wheel or pinch) to zoom along the x axis. */
  zoom?: boolean;
  /** Overview strip under the plot with a draggable window (continuous x axes). */
  navigator?: boolean;
  /** Period buttons for time axes. Defaults to on when `navigator` is on. */
  rangeSelector?: boolean | RangeButton[];
  /** Default data labels for every series. */
  dataLabels?: boolean | DataLabelOptions;
  /** Series reachable by clicking points that carry `drilldown: id`. */
  drilldown?: { series: SeriesOptions[] };
  /** Export menu (PNG, SVG, CSV). */
  exporting?: boolean;
  /** Screen-reader description added to the chart's accessible name. */
  description?: string;
  series: SeriesOptions[];
}
