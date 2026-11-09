import type { AxisOptions, ChartOptions, PointInput, Primitive, SeriesOptions } from './types';
import type { Registry } from './registry';

export const DEFAULT_PALETTE = [
  '#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#0ea5e9', '#22c55e', '#ec4899', '#64748b', '#84cc16',
];

export type XType = 'linear' | 'log' | 'time' | 'category';

export interface Point {
  index: number;
  /** Numeric x: category index, timestamp or number. */
  x: number;
  label: string;
  /** Primary value (close for OHLC, category index on category y axes). */
  y: number | null;
  /** Bar/area bottom and top in value units. [0, y] when not stacked. */
  y0: number;
  y1: number;
  /** Value extent used for the axis domain (high/low for OHLC). */
  lo: number;
  hi: number;
  z?: number;
  ohlc?: [number, number, number, number];
  percent?: number;
  total?: number;
  name?: string;
  color: string;
  visible: boolean;
  drilldown?: string;
  isSum?: boolean;
  /** Treemap hierarchy. */
  id?: string;
  parent?: string;
  /** Sankey link endpoints. */
  from?: string;
  to?: string;
  series: NSeries;
}

export interface NSeries {
  id: string;
  index: number;
  type: string;
  /** Type as written in the options (before "bar" -> column, "donut" -> pie). */
  rawType: string;
  name: string;
  color: string;
  visible: boolean;
  stack: string;
  yAxis: number;
  options: SeriesOptions;
  points: Point[];
}

export interface Model {
  series: NSeries[];
  cartesian: NSeries[];
  /** Series drawn without axes (pie, gauge, treemap, sankey). */
  standalone: NSeries[];
  xType: XType;
  categories: string[];
  /** Category labels of the first y axis (heatmaps). Empty for numeric axes. */
  yCategories: string[];
  yAxes: AxisOptions[];
  inverted: boolean;
  stacking: 'normal' | 'percent' | false;
}

/** User visibility overrides (legend clicks), keyed by series id or "seriesId:pointIndex". */
export interface Visibility {
  series: Map<string, boolean>;
  points: Map<string, boolean>;
}

interface Raw {
  x?: Primitive;
  y: number | string | null;
  z?: number | null;
  ohlc?: [number, number, number, number];
  name?: string;
  color?: string;
  drilldown?: string;
  isSum?: boolean;
  id?: string;
  parent?: string;
  from?: string;
  to?: string;
}

export function parsePoint(d: PointInput): Raw {
  if (d === null || typeof d === 'number') return { y: d };
  if (Array.isArray(d)) {
    if (d.length >= 5) {
      const [x, o, h, l, c] = d as [Primitive, number, number, number, number];
      return { x, y: c, ohlc: [o, h, l, c] };
    }
    if (d.length === 3) return { x: d[0], y: d[1] as number | string | null, z: d[2] as number | null };
    return { x: d[0], y: d[1] as number | null };
  }
  const ohlc = d.open !== undefined && d.high !== undefined && d.low !== undefined && d.close !== undefined
    ? [d.open, d.high, d.low, d.close] as [number, number, number, number]
    : undefined;
  return {
    x: d.x,
    y: d.y ?? d.value ?? d.weight ?? (ohlc ? ohlc[3] : null),
    z: d.z,
    ohlc,
    name: d.name,
    color: d.color,
    drilldown: d.drilldown,
    isSum: d.isSum,
    id: d.id,
    parent: d.parent,
    from: d.from,
    to: d.to,
  };
}

const isText = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

export function normalizeAxes(y: ChartOptions['yAxis']): AxisOptions[] {
  if (Array.isArray(y)) return y.length ? y : [{}];
  return [y ?? {}];
}

export function buildModel(o: ChartOptions, registry: Registry, vis: Visibility): Model {
  const palette = o.palette?.length ? o.palette : DEFAULT_PALETTE;
  let inverted = !!o.inverted;
  const yAxes = normalizeAxes(o.yAxis);

  const entries = o.series.map((s, i) => {
    const rawType = s.type ?? o.type ?? 'line';
    let type = rawType;
    if (type === 'bar') {
      inverted = true;
      type = 'column';
    }
    if (type === 'donut') type = 'pie';
    const def = registry.get(type);
    if (!def) throw new Error(`[strata] Unknown series type "${type}". Register it via the "types" option.`);
    return { s, i, type, rawType, def, raws: s.data.map(parsePoint) };
  });

  const xOpt = o.xAxis ?? {};
  const anyTextX = entries.some(e => e.def.kind === 'cartesian' && e.raws.some(r => isText(r.x)));
  const anyBand = entries.some(e => e.def.band);
  let xType: XType = xOpt.type ?? (xOpt.categories || anyTextX || anyBand ? 'category' : 'linear');
  if (entries.every(e => e.def.kind !== 'cartesian')) xType = 'category';

  const makeCategories = (initial: string[] | undefined) => {
    const list = [...(initial ?? [])];
    const index = new Map(list.map((c, i) => [c, i] as const));
    const get = (label: string): number => {
      let i = index.get(label);
      if (i === undefined) {
        i = list.length;
        list.push(label);
        index.set(label, i);
      }
      return i;
    };
    return { list, get };
  };
  const xCats = makeCategories(xOpt.categories);
  const y0Opt = yAxes[0];
  const yIsCategory = y0Opt.type === 'category' || !!y0Opt.categories || entries.some(e => e.def.kind === 'cartesian' && e.raws.some(r => isText(r.y)));
  const yCats = makeCategories(y0Opt.categories);

  const toX = (v: Primitive | undefined, i: number): number => {
    if (xType === 'category') {
      if (v === undefined) return i;
      if (typeof v === 'number' && xOpt.categories) return v;
      return xCats.get(v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
    }
    if (v === undefined) return i;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string') return xType === 'time' ? Date.parse(v) : Number(v);
    return v;
  };

  let colorIndex = 0;
  const series: NSeries[] = entries.map(({ s, i, type, rawType, def, raws }) => {
    const id = s.id ?? `s${i}`;
    const polar = def.kind === 'standalone';
    const color = s.color ?? (polar ? palette[0] : palette[colorIndex++ % palette.length]);
    const ns: NSeries = {
      id,
      index: i,
      type,
      rawType,
      name: s.name ?? `Series ${i + 1}`,
      color,
      visible: vis.series.get(id) ?? s.visible !== false,
      stack: s.stack ?? '',
      yAxis: Math.max(0, Math.min(yAxes.length - 1, s.yAxis ?? 0)),
      options: s,
      points: [],
    };
    ns.points = raws.map((r, pi) => {
      const x = polar ? pi : toX(r.x, pi);
      // Standalone [from, to, weight] tuples (sankey links).
      const link = polar && isText(r.x) && isText(r.y);
      const from = r.from ?? (link ? (r.x as string) : undefined);
      const to = r.to ?? (link ? (r.y as string) : undefined);
      let y: number | null;
      if (link) y = num(r.z);
      else if (isText(r.y)) y = yIsCategory ? yCats.get(r.y) : Number(r.y);
      else y = num(r.y);
      const label = polar
        ? r.name ?? (from && to ? `${from} → ${to}` : undefined) ?? (isText(r.x) ? r.x : xCats.list[pi]) ?? r.id ?? `Slice ${pi + 1}`
        : xType === 'category'
          ? xCats.list[x] ?? String(x)
          : String(x);
      const p: Point = {
        index: pi,
        x,
        label,
        y,
        y0: 0,
        y1: y ?? 0,
        lo: y ?? 0,
        hi: y ?? 0,
        z: num(r.z) ?? undefined,
        ohlc: r.ohlc,
        name: r.name,
        color: r.color ?? (polar ? palette[pi % palette.length] : color),
        visible: vis.points.get(`${id}:${pi}`) ?? true,
        drilldown: r.drilldown,
        isSum: r.isSum,
        id: r.id,
        parent: r.parent,
        from,
        to,
        series: ns,
      };
      return p;
    });
    return ns;
  });

  const stacking = o.stacking ?? false;
  const cartesian = series.filter(s => registry.get(s.type)?.kind === 'cartesian');
  applyStacking(cartesian, stacking, t => registry.get(t)?.stackFamily);
  for (const s of cartesian) {
    const t = registry.get(s.type);
    if (t?.kind === 'cartesian') t.prepare?.(s);
  }

  return {
    series,
    cartesian,
    standalone: series.filter(s => registry.get(s.type)?.kind === 'standalone'),
    xType,
    categories: xCats.list,
    yCategories: yIsCategory ? yCats.list : [],
    yAxes,
    inverted,
    stacking,
  };
}

/**
 * Computes y0/y1 for stacked series. Series stack when they share a family
 * (area / column), a `stack` name and a y axis. Positive and negative values stack apart.
 */
export function applyStacking(
  series: NSeries[],
  mode: 'normal' | 'percent' | false,
  familyOf: (type: string) => string | undefined,
): void {
  for (const s of series) {
    for (const p of s.points) {
      p.y0 = 0;
      p.y1 = p.y ?? 0;
      p.lo = p.hi = p.y1;
      p.percent = undefined;
      p.total = undefined;
    }
  }
  if (!mode) return;

  const groups = new Map<string, NSeries[]>();
  for (const s of series) {
    const family = familyOf(s.type);
    if (!family || !s.visible) continue;
    const key = family + '|' + s.stack + '|' + s.yAxis;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }

  for (const group of groups.values()) {
    const totals = new Map<number, number>();
    for (const s of group) {
      for (const p of s.points) {
        if (p.y !== null && p.visible) totals.set(p.x, (totals.get(p.x) ?? 0) + Math.abs(p.y));
      }
    }
    const pos = new Map<number, number>();
    const neg = new Map<number, number>();
    for (const s of group) {
      for (const p of s.points) {
        const total = totals.get(p.x) ?? 0;
        p.total = total;
        let v = p.y ?? 0;
        if (p.y !== null && total) p.percent = (Math.abs(p.y) / total) * 100;
        if (mode === 'percent') v = total ? (v / total) * 100 : 0;
        const acc = v >= 0 ? pos : neg;
        const base = acc.get(p.x) ?? 0;
        p.y0 = base;
        p.y1 = base + v;
        p.lo = Math.min(p.y0, p.y1);
        p.hi = Math.max(p.y0, p.y1);
        acc.set(p.x, p.y1);
      }
    }
  }
}
