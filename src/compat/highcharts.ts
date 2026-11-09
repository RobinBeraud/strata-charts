/**
 * Migration helper: converts the most common Highcharts-style option objects
 * into Strata options. Only option *names* are mirrored (a documented, public
 * configuration format); no Highcharts code is used.
 *
 *   import { fromHighcharts } from 'strata-charts/compat';
 *   createChart(el, fromHighcharts(legacyConfig));
 */
import type { AxisOptions, ChartOptions, PointInput, SeriesOptions } from '../core/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Legacy = Record<string, any>;

const first = (v: unknown): Legacy | undefined => (Array.isArray(v) ? v[0] : (v as Legacy | undefined));
const text = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  const t = (v as Legacy | undefined)?.text;
  return typeof t === 'string' && t ? t : undefined;
};
const percentOf = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v <= 1 ? v : undefined;
  if (typeof v === 'string' && v.endsWith('%')) return parseFloat(v) / 100;
  return undefined;
};

export interface CompatReport {
  options: ChartOptions;
  /** Legacy keys that were ignored because Strata has no equivalent (or does it differently). */
  ignored: string[];
}

const SUPPORTED_TOP = new Set([
  'chart', 'title', 'subtitle', 'xAxis', 'yAxis', 'series', 'plotOptions', 'legend',
  'tooltip', 'colors', 'accessibility', 'credits', 'exporting', 'lang',
  'navigator', 'rangeSelector', 'scrollbar', 'drilldown', 'colorAxis',
]);

function axis(a: Legacy | undefined, ignored: string[], name: string): AxisOptions | undefined {
  if (!a) return undefined;
  const out: AxisOptions = {};
  const type = a.type as string | undefined;
  if (type === 'datetime') out.type = 'time';
  else if (type === 'logarithmic') out.type = 'log';
  else if (type === 'category') out.type = 'category';
  else if (type === 'linear') out.type = 'linear';
  if (Array.isArray(a.categories)) out.categories = a.categories.map(String);
  const title = text(a.title);
  if (title) out.title = title;
  if (typeof a.min === 'number') out.min = a.min;
  if (typeof a.max === 'number') out.max = a.max;
  if (a.gridLineWidth === 0) out.grid = false;
  else if (typeof a.gridLineWidth === 'number' && a.gridLineWidth > 0) out.grid = true;
  if (typeof a.opposite === 'boolean') out.opposite = a.opposite;
  if (Array.isArray(a.plotLines)) {
    out.plotLines = a.plotLines
      .filter((p: Legacy) => typeof p.value === 'number')
      .map((p: Legacy) => ({ value: p.value, label: text(p.label), color: p.color }));
  }
  if (a.labels?.format || a.labels?.formatter) ignored.push(`${name}.labels.format (use ${name}.formatter)`);
  return out;
}

const STANDALONE = new Set(['pie', 'treemap', 'sankey', 'gauge', 'solidgauge']);

function points(data: unknown[], type: string): PointInput[] {
  return data.map(d => {
    if (d === null || typeof d === 'number') return d;
    if (Array.isArray(d)) {
      // [x, o, h, l, c] and [x, y, z] keep their shape; [x, low, high] ranges collapse to [x, high].
      if (d.length >= 5 || (d.length === 3 && (type === 'bubble' || type === 'heatmap' || type === 'sankey'))) return d as PointInput;
      return [d[0], d[d.length - 1] ?? null] as [number | string, number | null];
    }
    const o = d as Legacy;
    return {
      x: o.x ?? (STANDALONE.has(type) ? undefined : o.name),
      y: o.y ?? (type === 'heatmap' ? null : o.value ?? o.weight) ?? null,
      z: o.z ?? (type === 'heatmap' ? o.value : undefined), name: o.name, color: o.color,
      open: o.open, high: o.high, low: o.low, close: o.close, drilldown: o.drilldown, isSum: o.isSum,
      id: o.id, parent: o.parent, from: o.from, to: o.to,
    };
  });
}

export function convertHighcharts(hc: Legacy): CompatReport {
  const ignored: string[] = [];
  for (const k of Object.keys(hc)) if (!SUPPORTED_TOP.has(k)) ignored.push(k);
  const chart = (hc.chart ?? {}) as Legacy;
  const plot = (hc.plotOptions ?? {}) as Legacy;
  const defaultType = (chart.type as string | undefined) ?? 'line';

  const stackingOf = (type: string): ChartOptions['stacking'] => {
    const s = plot[type]?.stacking ?? plot.series?.stacking;
    return s === 'normal' || s === 'percent' ? s : false;
  };

  const series: SeriesOptions[] = ((hc.series ?? []) as Legacy[]).map((s, i) => {
    const legacyType = (s.type as string | undefined) ?? defaultType;
    const type = legacyType === 'solidgauge' || legacyType === 'gauge' ? 'gauge' : legacyType;
    const out: SeriesOptions = { type, data: points(Array.isArray(s.data) ? s.data : [], type) };
    if (typeof s.yAxis === 'number') out.yAxis = s.yAxis;
    const dl = s.dataLabels ?? plot[type]?.dataLabels ?? plot.series?.dataLabels;
    if (dl?.enabled) out.dataLabels = true;
    if (s.upColor) out.upColor = s.upColor;
    if (s.color && type === 'candlestick') out.downColor = s.color;
    if (type === 'gauge') {
      const ya = first(hc.yAxis) ?? {};
      if (typeof ya.min === 'number') out.min = ya.min;
      if (typeof ya.max === 'number') out.max = ya.max;
      if (legacyType === 'gauge') out.needle = true;
      if (Array.isArray(ya.stops)) out.colorRange = ya.stops.map((st: [number, string]) => st[1]);
      if (Array.isArray(ya.plotBands)) out.bands = ya.plotBands.map((b: Legacy) => ({ from: b.from, to: b.to, color: b.color }));
      if (s.dataLabels?.format && typeof s.dataLabels.format === 'string') {
        const m = /\}([^{}]*)$/.exec(s.dataLabels.format.replace(/<[^>]+>/g, ''));
        if (m && m[1].trim()) out.suffix = ' ' + m[1].trim();
      }
    }
    if (type === 'sankey' && Array.isArray(s.nodes)) {
      out.nodes = (s.nodes as Legacy[]).map(n => ({ id: String(n.id), name: n.name, color: n.color }));
    }
    if (s.tooltip?.valueSuffix) out.suffix = s.tooltip.valueSuffix;
    if (type === 'heatmap') {
      const ca = first(hc.colorAxis);
      if (ca?.minColor && ca?.maxColor) out.colorRange = [ca.minColor, ca.maxColor];
      else if (Array.isArray(ca?.stops)) out.colorRange = ca.stops.map((st: [number, string]) => st[1]);
    }
    if (s.id) out.id = String(s.id);
    if (s.name) out.name = String(s.name);
    if (s.color) out.color = s.color;
    if (s.visible === false) out.visible = false;
    if (s.stack !== undefined) out.stack = String(s.stack);
    if (s.dashStyle && s.dashStyle !== 'Solid') out.dash = true;
    if (s.marker?.enabled !== undefined) out.markers = !!s.marker.enabled;
    if (type === 'pie') {
      const inner = percentOf(s.innerSize ?? plot.pie?.innerSize);
      if (inner) out.innerRadius = inner;
    }
    if (s.xAxis) ignored.push(`series[${i}].xAxis (multiple x axes)`);
    return out;
  });

  const types = series.map(s => s.type ?? defaultType);
  const stacking = types.map(stackingOf).find(Boolean) ?? false;
  const zoomType = (chart.zoomType ?? chart.zooming?.type) as string | undefined;
  const tooltip = (hc.tooltip ?? {}) as Legacy;
  const legend = (hc.legend ?? {}) as Legacy;

  const options: ChartOptions = {
    type: defaultType,
    title: text(hc.title),
    subtitle: text(hc.subtitle),
    height: typeof chart.height === 'number' ? chart.height : undefined,
    inverted: chart.inverted === true || undefined,
    palette: Array.isArray(hc.colors) ? hc.colors : undefined,
    stacking,
    xAxis: axis(first(hc.xAxis), ignored, 'xAxis'),
    yAxis: Array.isArray(hc.yAxis) && hc.yAxis.length > 1
      ? hc.yAxis.map((a: Legacy, i: number) => axis(a, ignored, `yAxis[${i}]`) ?? {})
      : axis(first(hc.yAxis), ignored, 'yAxis'),
    navigator: hc.navigator?.enabled === true || (hc.navigator?.enabled !== false && (hc.rangeSelector !== undefined || defaultType === 'candlestick' || defaultType === 'ohlc') && first(hc.xAxis)?.type !== 'category') || undefined,
    rangeSelector: hc.rangeSelector?.enabled === false ? false : undefined,
    drilldown: Array.isArray(hc.drilldown?.series)
      ? { series: (hc.drilldown.series as Legacy[]).map(d => ({ id: String(d.id), name: d.name, type: d.type, data: points(d.data ?? [], d.type ?? defaultType) })) }
      : undefined,
    zoom: typeof zoomType === 'string' && zoomType.includes('x'),
    legend: legend.enabled === false ? false : legend.verticalAlign === 'top' ? { position: 'top' } : undefined,
    tooltip: tooltip.enabled === false
      ? false
      : {
          prefix: tooltip.valuePrefix,
          suffix: tooltip.valueSuffix,
          valueFormat: typeof tooltip.valueDecimals === 'number'
            ? { minimumFractionDigits: tooltip.valueDecimals, maximumFractionDigits: tooltip.valueDecimals }
            : undefined,
        },
    exporting: hc.exporting?.enabled === false ? false : undefined,
    animation: chart.animation === false ? false : undefined,
    description: hc.accessibility?.description,
    series,
  };
  if (tooltip.formatter || tooltip.pointFormat) ignored.push('tooltip.formatter/pointFormat (use tooltip.formatter)');
  if (chart.events || plot.series?.events) ignored.push('events (use chart.on())');
  return { options, ignored };
}

/** Converts a Highcharts-style config object to Strata options. */
export function fromHighcharts(hc: Legacy): ChartOptions {
  return convertHighcharts(hc).options;
}
