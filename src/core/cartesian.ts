import type { Scene } from '../render/scene';
import type { Scale } from '../scales/scale';
import { niceDomain, niceStep } from '../scales/scale';
import { LinearScale, LogScale } from '../scales/linear';
import { BandScale } from '../scales/band';
import { TimeScale } from '../scales/time';
import { lttb } from '../data/lttb';
import { linearPath } from '../render/paths';
import { prefersLightText } from './color';
import { formatValue } from './format';
import { DEFAULT_PALETTE, type Model, type NSeries, type Point } from './model';
import type { CartesianSeriesType, HitPoint, Rect, Registry, StandaloneHit } from './registry';
import type { AxisOptions, ChartOptions, DataLabelOptions } from './types';

export interface Layers {
  defs: SVGGElement;
  grid: SVGGElement;
  under: SVGGElement;
  series: SVGGElement;
  labels: SVGGElement;
  axes: SVGGElement;
  nav: SVGGElement;
  hover: SVGGElement;
  overlay: SVGGElement;
}

export interface Env {
  scene: Scene;
  layers: Layers;
  model: Model;
  opts: ChartOptions;
  registry: Registry;
  width: number;
  height: number;
  view: [number, number] | null;
  uid: string;
  locale?: string;
  measure: (text: string, size?: number) => number;
}

export interface SeriesHits {
  series: NSeries;
  points: HitPoint[];
}

export interface NavFrame {
  rect: Rect;
  scale: Scale;
  brush: [number, number];
}

export interface CartesianFrame {
  kind: 'cartesian';
  plot: Rect;
  x: Scale;
  /** Primary value axis. */
  y: Scale;
  ys: Scale[];
  inverted: boolean;
  hits: SeriesHits[];
  xDomain: [number, number];
  /** Unzoomed x extent of the data. */
  full: [number, number];
  nav?: NavFrame;
}

export interface StandaloneFrame {
  kind: 'standalone';
  hits: StandaloneHit[];
}

export type Frame = CartesianFrame | StandaloneFrame;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function windowPoints(points: Point[], x0: number, x1: number, band: boolean): Point[] {
  const out: Point[] = [];
  const inside = (p: Point | undefined) => !!p && p.x >= x0 && p.x <= x1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (inside(p) || (!band && (inside(points[i - 1]) || inside(points[i + 1])))) out.push(p);
  }
  return out;
}

function minDelta(series: NSeries[], fallback: number): number {
  const xs = [...new Set(series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
  let d = Infinity;
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 0) d = Math.min(d, xs[i] - xs[i - 1]);
  return isFinite(d) ? d : fallback;
}

/** A domain covering [lo, hi] with exactly `n` nice intervals, so its ticks line up with another axis. */
export function alignedDomain(lo: number, hi: number, n: number): [number, number] {
  if (lo === hi) hi = lo + 1;
  let step = niceStep(hi - lo, n);
  for (let guard = 0; guard < 20; guard++) {
    const start = Math.floor(lo / step) * step;
    if (start + n * step >= hi - 1e-9) return [+start.toPrecision(12), +(start + n * step).toPrecision(12)];
    step = niceStep(step * 1.5 * n, n);
  }
  return [lo, hi];
}

interface AxisPlace {
  index: number;
  side: 'left' | 'right' | 'top' | 'bottom';
  offset: number;
  size: number;
}

export function renderCartesian(env: Env): CartesianFrame {
  const { model, opts, registry, scene, layers, width, height, measure, locale } = env;
  const xOpt = opts.xAxis ?? {};
  const yAxes = model.yAxes;
  const inverted = model.inverted;
  const typeOf = (s: NSeries) => registry.get(s.type) as CartesianSeriesType;
  const visible = model.cartesian.filter(s => s.visible);
  const isBand = model.xType === 'category';
  const sized = (s: NSeries) => !!(typeOf(s).band || typeOf(s).needsWidth);

  // ---- X domain -----------------------------------------------------------
  let full: [number, number];
  if (isBand) full = [0, Math.max(0, model.categories.length - 1)];
  else {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of visible) {
      for (const p of s.points) {
        if (p.y === null || !isFinite(p.x)) continue;
        if (p.x < lo) lo = p.x;
        if (p.x > hi) hi = p.x;
      }
    }
    if (!isFinite(lo)) [lo, hi] = [0, 1];
    if (xOpt.min !== undefined) lo = xOpt.min;
    if (xOpt.max !== undefined) hi = xOpt.max;
    const bars = visible.filter(sized);
    if (bars.length) {
      const d = minDelta(bars, (hi - lo) / 10 || 1);
      lo -= d / 2;
      hi += d / 2;
    }
    if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
    const xPad = Math.max(0, ...visible.map(s => typeOf(s).padding ?? 0));
    if (xPad) [lo, hi] = [lo - (hi - lo) * xPad, hi + (hi - lo) * xPad];
    full = [lo, hi];
  }
  let x0 = full[0];
  let x1 = full[1];
  if (env.view) {
    const [a, b] = [Math.min(...env.view), Math.max(...env.view)];
    if (isBand) {
      x0 = clamp(Math.round(a), full[0], full[1]);
      x1 = clamp(Math.round(b), full[0], full[1]);
    } else {
      x0 = a;
      x1 = b > a ? b : a + 1;
    }
  }

  const windowed = new Map<NSeries, Point[]>();
  for (const s of model.cartesian) windowed.set(s, env.view || isBand ? windowPoints(s.points, x0, x1, isBand) : s.points);

  // ---- Value domains, one per axis -----------------------------------------
  const ext = yAxes.map(() => ({ lo: Infinity, hi: -Infinity, zero: false }));
  for (const s of visible) {
    const t = typeOf(s);
    const e = ext[s.yAxis];
    if (t.zeroBased) e.zero = true;
    for (const p of windowed.get(s)!) {
      if ((p.y === null && !p.isSum) || !p.visible || p.x < x0 || p.x > x1) continue;
      if (p.lo < e.lo) e.lo = p.lo;
      if (p.hi > e.hi) e.hi = p.hi;
    }
  }
  const pct = model.stacking === 'percent';
  for (const [i, e] of ext.entries()) {
    if (!isFinite(e.lo)) [e.lo, e.hi] = [0, 1];
    const pad = Math.max(0, ...visible.filter(s => s.yAxis === i).map(s => typeOf(s).padding ?? 0));
    if (pad) [e.lo, e.hi] = [e.lo - (e.hi - e.lo) * pad, e.hi + (e.hi - e.lo) * pad];
    if (e.zero) {
      e.lo = Math.min(e.lo, 0);
      e.hi = Math.max(e.hi, 0);
    }
    if (pct) {
      e.lo = Math.min(0, e.lo);
      e.hi = Math.max(100, e.hi);
    }
  }

  const valueLen = inverted ? width : height;
  const valueCount = clamp(Math.round(inverted ? valueLen / 110 : valueLen / 56), 2, 10);
  const yBand = model.yCategories.length > 0;

  // Primary domain first; the others are aligned to its tick count.
  const domains: [number, number][] = [];
  let intervals = valueCount;
  yAxes.forEach((ao, i) => {
    const e = ext[i];
    if (ao.type === 'log') {
      domains.push(LogScale.nice(ao.min ?? e.lo, ao.max ?? e.hi));
      return;
    }
    if (i === 0 && yBand) {
      domains.push([-0.5, model.yCategories.length - 0.5]);
      return;
    }
    if (pct && ao.min === undefined && ao.max === undefined) {
      domains.push([e.lo, e.hi]);
      if (i === 0) intervals = 5;
      return;
    }
    let d: [number, number];
    if (i === 0 || yAxes[0].type === 'log' || yBand) {
      const n = niceDomain(e.lo, e.hi, valueCount);
      d = n.domain;
      if (i === 0) intervals = Math.max(1, Math.round((d[1] - d[0]) / n.step));
    } else d = alignedDomain(e.lo, e.hi, intervals);
    domains.push([ao.min ?? d[0], ao.max ?? d[1]]);
  });

  const makeY = (i: number, range: [number, number]): Scale => {
    const ao = yAxes[i];
    if (i === 0 && yBand) return new BandScale(0, model.yCategories.length, range, model.yCategories, 0);
    if (ao.type === 'log') return new LogScale(domains[i], range, ao.numberFormat);
    return new LinearScale(domains[i], range, ao.numberFormat);
  };
  const tickCount = (i: number) => (domains[i] && yAxes[i].type !== 'log' && !(i === 0 && yBand) ? intervals : valueCount);
  const valueTicks = (s: Scale, i: number): number[] => {
    if (s.kind === 'band') return s.ticks(0);
    if (s.kind === 'linear' && i > 0 && yAxes[0].type !== 'log' && !yBand) {
      const [d0, d1] = s.domain;
      return Array.from({ length: intervals + 1 }, (_, k) => +(d0 + ((d1 - d0) * k) / intervals).toPrecision(12));
    }
    return s.ticks(tickCount(i));
  };
  const fmtY = (s: Scale, i: number) => {
    const base = s.tickFormat(locale);
    const ao = yAxes[i];
    return (v: number) => {
      const label = pct ? base(v) + ' %' : base(v);
      return ao.formatter ? ao.formatter(v, label) : label;
    };
  };

  // ---- Layout -------------------------------------------------------------
  const navOn = !!opts.navigator && !isBand;
  const navH = navOn ? 44 : 0;
  const top = 10;
  const places: AxisPlace[] = [];
  const sizes = yAxes.map((ao, i) => {
    const probe = makeY(i, [0, 1]);
    const f = fmtY(probe, i);
    const w = Math.max(0, ...valueTicks(probe, i).map(v => measure(f(v))));
    if (ao.visible === false) return 0;
    return inverted ? 22 + (ao.title ? 18 : 0) : Math.ceil(w) + 10 + (ao.title ? 20 : 0);
  });
  let leftUsed = 0;
  let rightUsed = 0;
  yAxes.forEach((ao, i) => {
    const opposite = ao.opposite ?? i > 0;
    if (!inverted) {
      places.push({ index: i, side: opposite ? 'right' : 'left', offset: opposite ? rightUsed : leftUsed, size: sizes[i] });
      if (opposite) rightUsed += sizes[i];
      else leftUsed += sizes[i];
    } else {
      places.push({ index: i, side: opposite ? 'top' : 'bottom', offset: opposite ? rightUsed : leftUsed, size: sizes[i] });
      if (opposite) rightUsed += sizes[i];
      else leftUsed += sizes[i];
    }
  });

  let catLabelW = 0;
  if (inverted && isBand) {
    for (let i = x0; i <= x1; i++) catLabelW = Math.max(catLabelW, measure(model.categories[i] ?? ''));
    catLabelW = Math.min(catLabelW, width * 0.35);
  }

  let plot: Rect;
  const xHidden = xOpt.visible === false;
  const xTitle = xOpt.title && !xHidden ? 20 : 0;
  if (!inverted) {
    const left = Math.max(leftUsed, 24);
    const right = Math.max(rightUsed, 16);
    const bottom = (xHidden ? 8 : 24) + xTitle + (navOn ? navH + 10 : 0);
    plot = { left, top, width: Math.max(20, width - left - right), height: Math.max(20, height - top - bottom) };
  } else {
    const left = Math.ceil(isBand ? catLabelW : 40) + 12 + xTitle;
    const t = top + rightUsed;
    const bottom = Math.max(leftUsed, 24);
    plot = { left, top: t, width: Math.max(20, width - left - 24), height: Math.max(20, height - t - bottom) };
  }

  const alongRange: [number, number] = inverted ? [plot.top, plot.top + plot.height] : [plot.left, plot.left + plot.width];
  const valueRange: [number, number] = inverted ? [plot.left, plot.left + plot.width] : [plot.top + plot.height, plot.top];

  const makeX = (d: [number, number], range: [number, number], niceIt: boolean): Scale => {
    if (isBand) return new BandScale(d[0], d[1] - d[0] + 1, range, model.categories);
    if (model.xType === 'time') return new TimeScale(d, range);
    if (model.xType === 'log') return new LogScale(d, range, xOpt.numberFormat);
    return new LinearScale(niceIt ? niceDomain(d[0], d[1], 6).domain : d, range, xOpt.numberFormat);
  };
  const allPoints2d = visible.length > 0 && visible.every(s => typeOf(s).hover === '2d' && !typeOf(s).band);
  const x = makeX([x0, x1], alongRange, allPoints2d && !env.view);
  const ys = yAxes.map((_, i) => makeY(i, valueRange));
  const y = ys[0];

  // ---- Axes ---------------------------------------------------------------
  renderXAxis(env, { plot, x, inverted, isBand });
  for (const place of places) {
    const i = place.index;
    const s = ys[i];
    const owner = yAxes.length > 1 ? visible.find(v => v.yAxis === i) : undefined;
    renderValueAxis(env, {
      plot, scale: s, place, axis: yAxes[i], primary: i === 0, ticks: valueTicks(s, i), fmt: fmtY(s, i),
      color: owner?.color, band: s.kind === 'band',
    });
  }

  // ---- Clip ---------------------------------------------------------------
  const clipId = `${env.uid}-clip`;
  const clip = scene.el(layers.defs, 'clip', 'clipPath', { id: clipId });
  const pad = 6;
  scene.el(clip, 'r', 'rect', { x: plot.left - pad, y: plot.top - pad, width: plot.width + pad * 2, height: plot.height + pad * 2 });

  // ---- Series -------------------------------------------------------------
  const alongLen = inverted ? plot.height : plot.width;
  let bandwidth: number;
  if (isBand) bandwidth = x.bandwidth;
  else {
    const bars = visible.filter(sized);
    const d = bars.length ? minDelta(bars, (x1 - x0) / 10) : (x1 - x0) / 10;
    bandwidth = clamp(Math.abs(x.map(x0 + d) - x.map(x0)) * 0.8, 1, alongLen / 3);
  }

  const columnSeries = visible.filter(s => typeOf(s).band && typeOf(s).hover !== '2d');
  const slotKeyOf = (s: NSeries) => (model.stacking && typeOf(s).stackFamily ? `stack:${s.stack}:${s.yAxis}` : 'series:' + s.id);
  const slotKeys: string[] = [];
  for (const s of columnSeries) {
    const key = slotKeyOf(s);
    if (!slotKeys.includes(key)) slotKeys.push(key);
  }

  const hits: SeriesHits[] = [];
  for (const s of model.cartesian) {
    if (!s.visible) continue;
    const t = typeOf(s);
    const sy = ys[s.yAxis];
    const [vMin, vMax] = [Math.min(...sy.domain), Math.max(...sy.domain)];
    const stacked = !!model.stacking && !!t.stackFamily;
    const group = scene.el(layers.series, `s-${s.id}`, 'g', {
      class: 'strata-series',
      'clip-path': `url(#${clipId})`,
      'data-series': s.id,
    });
    layers.series.appendChild(group); // keep declaration order = z-order
    const pos = (xv: number, yv: number): [number, number] => {
      const a = x.map(xv);
      const b = sy.map(yv);
      return inverted ? [b, a] : [a, b];
    };
    const slotIndex = slotKeys.indexOf(slotKeyOf(s));
    const points = t.render({
      scene,
      group,
      defs: layers.defs,
      uid: env.uid,
      series: s,
      points: windowed.get(s)!,
      x,
      y: sy,
      inverted,
      plot,
      stacking: model.stacking,
      pos,
      base: p => clamp(stacked ? p.y0 : t.zeroBased ? 0 : vMin, vMin, vMax),
      slot: slotIndex >= 0 ? { index: slotIndex, count: slotKeys.length } : { index: 0, count: 1 },
      bandwidth,
    });
    hits.push({ series: s, points: points.filter(h => h.point.x >= x0 && h.point.x <= x1) });
  }

  renderDataLabels(env, hits, plot, inverted, typeOf, ys, bandwidth);

  // ---- Navigator ----------------------------------------------------------
  let nav: NavFrame | undefined;
  if (navOn) {
    const rect: Rect = { left: plot.left, top: height - navH, width: plot.width, height: navH - 4 };
    const scale = makeX(full, [rect.left, rect.left + rect.width], false);
    nav = renderNavigator(env, rect, scale, visible, [x0, x1]);
  }

  return { kind: 'cartesian', plot, x, y, ys, inverted, hits, xDomain: [x0, x1], full, nav };
}

// ---------------------------------------------------------------- axes

interface ValueAxisArgs {
  plot: Rect;
  scale: Scale;
  place: AxisPlace;
  axis: AxisOptions;
  primary: boolean;
  ticks: number[];
  fmt: (v: number) => string;
  color?: string;
  band: boolean;
}

function renderValueAxis(env: Env, a: ValueAxisArgs): void {
  const { scene, layers } = env;
  const { plot, scale, place, axis } = a;
  const right = plot.left + plot.width;
  const bottom = plot.top + plot.height;
  const fade = { enter: { opacity: 0 } };
  const k = `y${place.index}-`;
  const hasNeg = Math.min(...scale.domain) < 0;
  const labelFill = a.color ?? null;
  const hidden = axis.visible === false;

  for (const v of a.ticks) {
    const p = scale.map(v);
    const key = String(v);
    if (a.primary && axis.grid !== false && !a.band) {
      const cls = v === 0 && hasNeg ? 'strata-grid strata-zero' : 'strata-grid';
      scene.el(layers.grid, k + 'g' + key, 'line', place.side === 'left' || place.side === 'right'
        ? { x1: plot.left, x2: right, y1: p, y2: p, opacity: 1, class: cls }
        : { x1: p, x2: p, y1: plot.top, y2: bottom, opacity: 1, class: cls }, fade);
    }
    if (hidden) continue;
    let attrs;
    switch (place.side) {
      case 'left': attrs = { x: plot.left - place.offset - 8, y: p, dy: '0.32em', 'text-anchor': 'end' }; break;
      case 'right': attrs = { x: right + place.offset + 8, y: p, dy: '0.32em', 'text-anchor': 'start' }; break;
      case 'bottom': attrs = { x: p, y: bottom + place.offset + 17, 'text-anchor': 'middle' }; break;
      case 'top': attrs = { x: p, y: plot.top - place.offset - 8, 'text-anchor': 'middle' }; break;
    }
    scene.el(layers.axes, k + 'l' + key, 'text', { ...attrs, class: 'strata-tick-label', opacity: 1, fill: labelFill }, { ...fade, text: a.fmt(v) });
  }

  if (axis.title && !hidden) {
    const mid = plot.top + plot.height / 2;
    let attrs;
    switch (place.side) {
      case 'left': attrs = { x: 0, y: 0, transform: `translate(${plot.left - place.offset - place.size + 12},${mid}) rotate(-90)` }; break;
      case 'right': attrs = { x: 0, y: 0, transform: `translate(${right + place.offset + place.size - 6},${mid}) rotate(90)` }; break;
      case 'bottom': attrs = { x: plot.left + plot.width / 2, y: bottom + place.offset + 36, transform: null }; break;
      case 'top': attrs = { x: plot.left + plot.width / 2, y: plot.top - place.offset - 26, transform: null }; break;
    }
    scene.el(layers.axes, k + 'title', 'text', { ...attrs, 'text-anchor': 'middle', class: 'strata-axis-title', fill: labelFill }, { text: axis.title });
  }

  renderReferences(env, k, scale, axis, plot, place.side === 'bottom' || place.side === 'top');
}

/** Plot lines and plot bands of one axis. `vertical`: the axis runs horizontally, so marks are vertical. */
function renderReferences(env: Env, k: string, scale: Scale, axis: AxisOptions, plot: Rect, vertical: boolean): void {
  const { scene, layers } = env;
  const right = plot.left + plot.width;
  const bottom = plot.top + plot.height;
  const [dLo, dHi] = [Math.min(...scale.domain), Math.max(...scale.domain)];
  (axis.plotBands ?? []).forEach((b, i) => {
    const lo = Math.max(dLo, Math.min(b.from, b.to));
    const hi = Math.min(dHi, Math.max(b.from, b.to));
    if (hi <= lo) return;
    const p0 = scale.map(lo);
    const p1 = scale.map(hi);
    const a = Math.min(p0, p1);
    const len = Math.abs(p1 - p0);
    scene.el(layers.grid, k + 'pb' + i, 'rect', vertical
      ? { x: a, y: plot.top, width: len, height: plot.height, fill: b.color ?? null, class: 'strata-plotband' }
      : { x: plot.left, y: a, width: plot.width, height: len, fill: b.color ?? null, class: 'strata-plotband' });
    if (b.label) {
      scene.el(layers.axes, k + 'pbl' + i, 'text', vertical
        ? { x: a + len / 2, y: plot.top + 12, 'text-anchor': 'middle', class: 'strata-plotband-label' }
        : { x: plot.left + 6, y: a + 12, class: 'strata-plotband-label' },
      { text: b.label });
    }
  });
  (axis.plotLines ?? []).forEach((pl, i) => {
    // Lines outside the visible range are not drawn (they would float over the title).
    if (pl.value < dLo || pl.value > dHi) return;
    const p = scale.map(pl.value);
    const color = pl.color ?? '#ef4444';
    scene.el(layers.axes, k + 'pl' + i, 'line', vertical
      ? { x1: p, x2: p, y1: plot.top, y2: bottom, stroke: color, class: 'strata-plotline' }
      : { x1: plot.left, x2: right, y1: p, y2: p, stroke: color, class: 'strata-plotline' });
    if (pl.label) {
      scene.el(layers.axes, k + 'pll' + i, 'text', vertical
        ? { x: p + 4, y: plot.top + 10, fill: color, class: 'strata-plotline-label' }
        : { x: right - 4, y: p - 5, 'text-anchor': 'end', fill: color, class: 'strata-plotline-label' },
      { text: pl.label });
    }
  });
}

function renderXAxis(env: Env, a: { plot: Rect; x: Scale; inverted: boolean; isBand: boolean }): void {
  const { scene, layers, opts, measure, locale } = env;
  const { plot, x, inverted, isBand } = a;
  const xOpt = opts.xAxis ?? {};
  const right = plot.left + plot.width;
  const bottom = plot.top + plot.height;
  const fade = { enter: { opacity: 0 } };
  renderReferences(env, 'x-', x, xOpt, plot, !inverted);
  if (xOpt.visible === false) return;

  scene.el(layers.axes, 'x-line', 'line', inverted
    ? { x1: plot.left, x2: plot.left, y1: plot.top, y2: bottom, class: 'strata-axis-line' }
    : { x1: plot.left, x2: right, y1: bottom, y2: bottom, class: 'strata-axis-line' });

  const xFmtBase = x.tickFormat(locale);
  const xFmt = (v: number) => {
    const label = xFmtBase(v);
    return xOpt.formatter ? xOpt.formatter(v, label) : label;
  };
  let xTicks: number[];
  if (isBand) {
    const all = x.ticks(0);
    const step = Math.abs((x as BandScale).step);
    const need = inverted ? 16 : Math.max(...all.map(v => measure(xFmt(v)))) + 12;
    const every = Math.max(1, Math.ceil(need / Math.max(1, step)));
    xTicks = all.filter((_, i) => i % every === 0);
  } else {
    const len = inverted ? plot.height : plot.width;
    let count = clamp(Math.round(len / (inverted ? 40 : 90)), 2, 12);
    xTicks = x.ticks(count);
    for (let i = 0; i < 4 && !inverted; i++) {
      const widest = Math.max(0, ...xTicks.map(v => measure(xFmt(v))));
      const spacing = xTicks.length > 1 ? Math.abs(x.map(xTicks[1]) - x.map(xTicks[0])) : len;
      if (widest + 14 <= spacing) break;
      count = Math.max(2, Math.floor(count * 0.66));
      xTicks = x.ticks(count);
    }
  }
  const showXGrid = xOpt.grid ?? (!isBand && env.model.cartesian.every(s => env.registry.get(s.type)?.kind === 'cartesian' && (env.registry.get(s.type) as CartesianSeriesType).hover === '2d'));
  for (const v of xTicks) {
    const p = x.map(v);
    if (p < (inverted ? plot.top : plot.left) - 1 || p > (inverted ? bottom : right) + 1) continue;
    const key = String(v);
    scene.el(layers.axes, 'xl' + key, 'text', inverted
      ? { x: plot.left - 8, y: p, dy: '0.32em', 'text-anchor': 'end', class: 'strata-tick-label', opacity: 1 }
      : { x: p, y: bottom + 17, 'text-anchor': 'middle', class: 'strata-tick-label', opacity: 1 },
    { ...fade, text: xFmt(v) });
    if (showXGrid) {
      scene.el(layers.grid, 'xg' + key, 'line', inverted
        ? { x1: plot.left, x2: right, y1: p, y2: p, class: 'strata-grid', opacity: 1 }
        : { x1: p, x2: p, y1: plot.top, y2: bottom, class: 'strata-grid', opacity: 1 }, fade);
    }
  }
  if (xOpt.title) {
    scene.el(layers.axes, 'x-title', 'text', inverted
      ? { x: 0, y: 0, 'text-anchor': 'middle', class: 'strata-axis-title', transform: `translate(12,${plot.top + plot.height / 2}) rotate(-90)` }
      : { x: plot.left + plot.width / 2, y: bottom + 38, 'text-anchor': 'middle', class: 'strata-axis-title', transform: null },
    { text: xOpt.title });
  }
}

// ---------------------------------------------------------------- data labels

interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: LabelBox, b: LabelBox) =>
  a.x < b.x + b.w + 2 && b.x < a.x + a.w + 2 && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1;

function renderDataLabels(
  env: Env,
  hits: SeriesHits[],
  plot: Rect,
  inverted: boolean,
  typeOf: (s: NSeries) => CartesianSeriesType,
  ys: Scale[],
  bandwidth: number,
): void {
  const { scene, layers, opts, measure, locale, model } = env;
  const placed: LabelBox[] = [];
  const size = 11;
  const lh = 13;
  for (const { series: s, points } of hits) {
    const dl = s.options.dataLabels ?? opts.dataLabels;
    if (!dl) continue;
    const cfg: DataLabelOptions = typeof dl === 'object' ? dl : {};
    const t = typeOf(s);
    const stacked = !!model.stacking && !!t.stackFamily;
    const isBar = !!(t.band || t.needsWidth) && t.hover !== '2d';
    const isCell = t.hover === '2d' && !!t.band;
    // Larger values first: they win collisions.
    const order = points.slice().sort((a, b) => Math.abs(b.point.y ?? 0) - Math.abs(a.point.y ?? 0));
    for (const h of order) {
      const p = h.point;
      if (p.y === null && !p.isSum) continue;
      const raw = isCell ? p.z ?? null : p.isSum ? p.y1 : p.y;
      let text: string;
      if (cfg.formatter) text = cfg.formatter({ x: p.x, y: raw, label: p.label, series: s.name, percent: p.percent });
      else if (model.stacking === 'percent' && p.percent !== undefined) text = formatValue(p.percent, locale, { maximumFractionDigits: 0 }) + ' %';
      else text = formatValue(raw, locale, { notation: Math.abs(raw ?? 0) >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 1 });
      if (!text) continue;
      const w = measure(text, size);
      const positive = p.y1 >= p.y0;
      const sy = ys[s.yAxis];
      const [d0, d1] = [Math.min(...sy.domain), Math.max(...sy.domain)];
      // Bar length from data, not the DOM: the element may still be mid-animation.
      const barLen = Math.abs(sy.map(clamp(p.y1, d0, d1)) - sy.map(clamp(p.y0, d0, d1)));
      const place = (inside: boolean): { ax: number; ay: number; anchor: 'start' | 'middle' | 'end' } | null => {
        if (isCell) return (h.r ?? 0) * 2 >= w + 4 ? { ax: h.px, ay: h.py, anchor: 'middle' } : null;
        if (!isBar) return { ax: h.px, ay: h.py - 10 - lh / 2, anchor: 'middle' };
        if (inside && (inverted ? barLen < w + 8 : barLen < lh + 4 || bandwidth < w * 0.6)) return null;
        if (!inverted) return { ax: h.px, ay: positive !== inside ? h.py - 6 - lh / 2 : h.py + 6 + lh / 2, anchor: 'middle' };
        const out = positive !== inside;
        return { ax: out ? h.px + 6 : h.px - 6, ay: h.py, anchor: out ? 'start' : 'end' };
      };
      const fits = (b: LabelBox) =>
        b.x >= plot.left - 4 && b.x + b.w <= plot.left + plot.width + 30 && b.y >= plot.top - 8 && b.y + b.h <= plot.top + plot.height + 4;
      const preferInside = isCell || (isBar && (cfg.inside ?? stacked));
      // Try the preferred side, then the other one (e.g. the tallest bar's label flips inside).
      const options = isBar ? [preferInside, !preferInside] : [preferInside];
      let chosen: { ax: number; ay: number; anchor: 'start' | 'middle' | 'end'; inside: boolean; box: LabelBox } | null = null;
      for (const inside of options) {
        const pos = place(inside);
        if (!pos) continue;
        const bx = pos.anchor === 'middle' ? pos.ax - w / 2 : pos.anchor === 'start' ? pos.ax : pos.ax - w;
        const box = { x: bx, y: pos.ay - lh / 2, w, h: lh };
        if (!fits(box) || placed.some(q => overlaps(q, box))) continue;
        chosen = { ...pos, inside, box };
        break;
      }
      if (!chosen) continue;
      placed.push(chosen.box);
      const { ax, ay, anchor, inside } = chosen;
      const light = inside && prefersLightText(p.color);
      scene.el(layers.labels, `dl-${s.id}-${p.index}`, 'text', {
        x: ax, y: ay, dy: '0.35em', 'text-anchor': anchor, opacity: 1,
        class: inside ? (light ? 'strata-data-label is-inside is-light' : 'strata-data-label is-inside') : 'strata-data-label',
      }, { enter: { opacity: 0 }, text });
    }
  }
}

// ---------------------------------------------------------------- navigator

function renderNavigator(env: Env, rect: Rect, scale: Scale, visible: NSeries[], view: [number, number]): NavFrame {
  const { scene, layers } = env;
  const bottom = rect.top + rect.height;
  scene.el(layers.nav, 'bg', 'rect', { x: rect.left, y: rect.top, width: rect.width, height: rect.height, rx: 6, class: 'strata-nav-bg' });

  // Mini series: each visible series reduced to ~1 point per pixel, scaled to the strip.
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of visible) for (const p of s.points) if (p.y !== null) {
    lo = Math.min(lo, p.lo);
    hi = Math.max(hi, p.hi);
  }
  if (!isFinite(lo)) [lo, hi] = [0, 1];
  if (lo === hi) hi = lo + 1;
  const vy = (v: number) => bottom - 3 - ((v - lo) / (hi - lo)) * (rect.height - 8);
  for (const s of visible) {
    const pts = s.points.filter(p => p.y !== null).map(p => [scale.map(p.x), vy(p.y1)] as [number, number]);
    const reduced = pts.length > rect.width ? lttb(pts, Math.round(rect.width), d => d[0], d => d[1]) : pts;
    if (reduced.length < 2) continue;
    const d = linearPath(reduced);
    scene.el(layers.nav, `area-${s.id}`, 'path', {
      d: `${d}L${reduced[reduced.length - 1][0]},${bottom}L${reduced[0][0]},${bottom}Z`, fill: s.color, 'fill-opacity': 0.12, stroke: 'none',
    });
    scene.el(layers.nav, `line-${s.id}`, 'path', { d, fill: 'none', stroke: s.color, 'stroke-width': 1, 'stroke-opacity': 0.8 });
  }

  const a = clamp(scale.map(view[0]), rect.left, rect.left + rect.width);
  const b = clamp(scale.map(view[1]), rect.left, rect.left + rect.width);
  scene.el(layers.nav, 'mask-l', 'rect', { x: rect.left, y: rect.top, width: Math.max(0, a - rect.left), height: rect.height, class: 'strata-nav-mask' });
  scene.el(layers.nav, 'mask-r', 'rect', { x: b, y: rect.top, width: Math.max(0, rect.left + rect.width - b), height: rect.height, class: 'strata-nav-mask' });
  scene.el(layers.nav, 'brush', 'rect', { x: a, y: rect.top + 0.5, width: Math.max(1, b - a), height: rect.height - 1, rx: 4, class: 'strata-nav-brush' });
  const hh = 18;
  for (const [key, px] of [['h-l', a], ['h-r', b]] as const) {
    scene.el(layers.nav, key, 'rect', { x: px - 4, y: rect.top + rect.height / 2 - hh / 2, width: 8, height: hh, rx: 3, class: 'strata-nav-handle' });
  }
  return { rect, scale, brush: [a, b] };
}

export function renderStandalone(env: Env, state: Map<string, unknown>): StandaloneFrame {
  const { model, registry, scene, layers, width, height, locale, measure, opts } = env;
  const list = model.standalone.filter(s => s.visible);
  const n = Math.max(1, list.length);
  const cellW = width / n;
  const out: StandaloneHit[] = [];
  list.forEach((s, i) => {
    const t = registry.get(s.type);
    if (!t || t.kind !== 'standalone') return;
    const rect: Rect = { left: cellW * i + 4, top: 4, width: cellW - 8, height: height - 8 };
    const showLabels = !t.outsideLabels || cellW >= 300;
    const room = t.outsideLabels && showLabels ? { v: 26, h: 110 } : { v: 8, h: 8 };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.max(24, Math.min(rect.height / 2 - room.v, rect.width / 2 - room.h));
    const group = scene.el(layers.series, `p-${s.id}`, 'g', { class: 'strata-standalone', 'data-series': s.id });
    out.push(t.render({
      scene, group, defs: layers.defs, uid: env.uid, series: s, rect, cx, cy, radius, locale, showLabels, measure, state,
      dataLabels: opts.dataLabels !== false,
      palette: opts.palette?.length ? opts.palette : DEFAULT_PALETTE,
    }));
  });
  return { kind: 'standalone', hits: out };
}
