/**
 * Migration helper: converts Highcharts-style option objects into Strata options.
 * Only option *names* are mirrored (a documented, public configuration format);
 * no Highcharts code is used.
 *
 *   import { convertHighcharts } from 'strata-charts/compat';
 *   const { options, ignored } = convertHighcharts(legacyConfig);
 *   createChart(el, options);
 */
import type { AxisOptions, ChartOptions, DataLabelOptions, PointInput, SeriesOptions } from '../core/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Legacy = Record<string, any>;

const first = (v: unknown): Legacy | undefined => (Array.isArray(v) ? v[0] : (v as Legacy | undefined));

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
/** Highcharts strings may contain HTML: keep the text only (Strata never injects HTML). */
export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/\s+/g, ' ')
    .trim();
}
const text = (v: unknown): string | undefined => {
  const t = typeof v === 'string' ? v : (v as Legacy | undefined)?.text;
  return typeof t === 'string' && t ? stripHtml(t) || undefined : undefined;
};
const percentOf = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v <= 1 ? v : undefined;
  if (typeof v === 'string' && v.endsWith('%')) return parseFloat(v) / 100;
  return undefined;
};
/** Plain colours pass through; gradients and patterns fall back to their first colour. */
const color = (v: unknown): string | undefined => {
  // Highcharts' own CSS variables and pattern ids mean nothing outside Highcharts: use the Strata palette.
  if (typeof v === 'string') return /var\(--highcharts|^url\(/.test(v) ? undefined : v;
  const stops = (v as Legacy | undefined)?.stops;
  if (Array.isArray(stops) && Array.isArray(stops[0]) && typeof stops[0][1] === 'string') return stops[0][1];
  const pattern = (v as Legacy | undefined)?.pattern;
  if (pattern) return color(pattern.color);
  return undefined;
};

// ---------------------------------------------------------------- format strings

const PLACEHOLDER = /\{([^{}:]+)(?::([^{}]+))?\}/g;

function numberSpec(spec: string | undefined): Intl.NumberFormatOptions | undefined {
  const m = /^(,)?\.(\d+)f$/.exec(spec?.trim() ?? '');
  return m ? { minimumFractionDigits: +m[2], maximumFractionDigits: +m[2] } : undefined;
}

/**
 * Compiles the common subset of Highcharts format strings ("{point.y:.1f} mm", "{value}°C",
 * "{series.name}") into a function. Returns null for formats using helpers ({#if}, {#each}…).
 */
export function compileFormat(fmt: string, locale?: string): ((ctx: Record<string, unknown>) => string) | null {
  // Helpers ({#if}, {/if}, {divide y 1000}, {abs value}) are not supported: keep Strata's defaults.
  if (/\{[#/]|\{[^{}:]*\s[^{}]*\}/.test(fmt)) return null;
  const plain = stripHtml(fmt);
  return ctx =>
    plain.replace(PLACEHOLDER, (_, path: string, spec?: string) => {
      const v = ctx[path.trim()];
      if (typeof v === 'number') return new Intl.NumberFormat(locale, numberSpec(spec) ?? { maximumFractionDigits: 2 }).format(v);
      return v === undefined || v === null ? '' : String(v);
    });
}

/** Extracts prefix / suffix / decimals around the value placeholder of a tooltip pointFormat. */
function valueAffixes(fmt: string): { prefix?: string; suffix?: string; decimals?: number } | null {
  if (/\{[#/]|\{[^{}:]*\s[^{}]*\}/.test(fmt)) return null;
  const plain = stripHtml(fmt);
  const m = /\{(?:point\.)?(?:y|value|z)(?::([^{}]+))?\}([^{]*)/.exec(plain);
  if (!m) return null;
  const before = plain.slice(0, m.index);
  const prefix = /([^\s\w{}:]{1,3})\s*$/.exec(before)?.[1];
  const suffix = m[2].replace(/\s+$/, '');
  const decimals = numberSpec(m[1])?.maximumFractionDigits;
  return { prefix: prefix || undefined, suffix: suffix || undefined, decimals };
}

// ---------------------------------------------------------------- axes

function axis(a: Legacy | undefined, ignored: string[], name: string, category: boolean, locale?: string): AxisOptions | undefined {
  if (!a) return undefined;
  const out: AxisOptions = {};
  const type = a.type as string | undefined;
  if (type === 'datetime') out.type = 'time';
  else if (type === 'logarithmic') out.type = 'log';
  else if (type === 'category') out.type = 'category';
  else if (type === 'linear') out.type = 'linear';
  if (Array.isArray(a.categories)) out.categories = a.categories.map((c: unknown) => stripHtml(String(c)));
  const title = text(a.title);
  if (title) out.title = title;
  if (typeof a.min === 'number') out.min = a.min;
  if (typeof a.max === 'number') out.max = a.max;
  if (a.visible === false) out.visible = false;
  if (a.gridLineWidth === 0) out.grid = false;
  else if (typeof a.gridLineWidth === 'number' && a.gridLineWidth > 0) out.grid = true;
  if (typeof a.opposite === 'boolean') out.opposite = a.opposite;
  if (Array.isArray(a.plotLines)) {
    out.plotLines = a.plotLines
      .filter((p: Legacy) => typeof p.value === 'number')
      .map((p: Legacy) => ({ value: p.value, label: text(p.label), color: color(p.color) }));
  }
  if (Array.isArray(a.plotBands)) {
    out.plotBands = a.plotBands
      .filter((b: Legacy) => typeof b.from === 'number' && typeof b.to === 'number')
      .map((b: Legacy) => ({ from: b.from, to: b.to, label: text(b.label), color: color(b.color) }));
  }
  if (typeof a.labels?.format === 'string') {
    const f = compileFormat(a.labels.format, locale);
    if (f) out.formatter = (value, label) => f({ value: category ? label : value, text: label });
    else ignored.push(`${name}.labels.format (template helpers)`);
  }
  if (a.labels?.formatter) ignored.push(`${name}.labels.formatter (use ${name}.formatter)`);
  return out;
}

// ---------------------------------------------------------------- data

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
      y: o.y ?? (type === 'heatmap' ? null : o.value ?? o.weight ?? o.high) ?? null,
      z: o.z ?? (type === 'heatmap' ? o.value : undefined), name: o.name !== undefined ? stripHtml(String(o.name)) : undefined, color: color(o.color),
      open: o.open, high: o.high, low: o.low, close: o.close, drilldown: o.drilldown, isSum: o.isSum,
      id: o.id, parent: o.parent, from: o.from, to: o.to,
    };
  });
}

/** Highcharts 13 data API: a chart-level `dataTable` of columns, read by `dataMapping` per series. */
function fromTable(columns: Record<string, unknown[]>, mapping: Record<string, unknown>, xIsCategory: boolean): Legacy[] {
  const names = Object.keys(columns);
  const n = Math.max(0, ...names.map(k => (Array.isArray(columns[k]) ? columns[k].length : 0)));
  const map = { ...mapping } as Record<string, string>;
  if (!map.x && !map.name) {
    // Default label column: the first one holding text (e.g. "Month"), as Highcharts does for categories.
    const label = names.find(k => columns[k]?.some(v => typeof v === 'string'));
    if (label && Object.values(map).every(c => c !== label)) map[xIsCategory ? 'name' : 'x'] = label;
  }
  const rows: Legacy[] = [];
  for (let i = 0; i < n; i++) {
    const row: Legacy = {};
    for (const [key, col] of Object.entries(map)) {
      if (typeof col !== 'string' || !columns[col]) continue;
      row[key] = columns[col][i];
    }
    rows.push(row);
  }
  return rows;
}

function withPointStart(data: unknown[], start: number, interval: number, unit: string | undefined): unknown[] {
  const at = (i: number) => {
    if (!unit) return start + i * interval;
    const d = new Date(start);
    if (unit === 'day') d.setUTCDate(d.getUTCDate() + i * interval);
    else if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + i * interval);
    else if (unit === 'year') d.setUTCFullYear(d.getUTCFullYear() + i * interval);
    return d.getTime();
  };
  return data.map((v, i) => {
    if (v === null || typeof v === 'number') return [at(i), v];
    if (v && typeof v === 'object' && !Array.isArray(v) && (v as Legacy).x === undefined) return { ...(v as Legacy), x: at(i) };
    return v;
  });
}

/** Untyped x axes whose x values are all millisecond timestamps (1970–2100) are time axes. */
function inferTime(a: AxisOptions | undefined, series: SeriesOptions[]): AxisOptions | undefined {
  if (a?.type || a?.categories) return a;
  const xs: unknown[] = [];
  for (const s of series) {
    if (STANDALONE.has(s.type ?? '')) return a;
    for (const p of s.data.slice(0, 50)) xs.push(Array.isArray(p) ? p[0] : p && typeof p === 'object' ? (p as Legacy).x : undefined);
  }
  const nums = xs.filter((x): x is number => typeof x === 'number');
  if (nums.length >= 2 && nums.length === xs.filter(x => x !== undefined).length && nums.every(x => x > 1e11 && x < 4.2e12)) {
    return { ...a, type: 'time' };
  }
  return a;
}

export interface CompatReport {
  options: ChartOptions;
  /** Legacy keys that were ignored because Strata has no equivalent (or does it differently). */
  ignored: string[];
}

const SUPPORTED_TOP = new Set([
  'chart', 'title', 'subtitle', 'xAxis', 'yAxis', 'series', 'plotOptions', 'legend',
  'tooltip', 'colors', 'accessibility', 'credits', 'exporting', 'lang',
  'navigator', 'rangeSelector', 'scrollbar', 'drilldown', 'colorAxis', 'dataTable',
]);

export function convertHighcharts(hc: Legacy): CompatReport {
  const ignored: string[] = [];
  for (const k of Object.keys(hc)) if (!SUPPORTED_TOP.has(k)) ignored.push(k);
  const chart = (hc.chart ?? {}) as Legacy;
  const plot = (hc.plotOptions ?? {}) as Legacy;
  const defaultType = (chart.type as string | undefined) ?? 'line';
  const locale = typeof hc.lang?.locale === 'string' ? hc.lang.locale : undefined;
  const xa = first(hc.xAxis);
  const xIsCategory = xa?.type === 'category' || Array.isArray(xa?.categories);
  const columns = hc.dataTable?.columns as Record<string, unknown[]> | undefined;
  /** Series option with plotOptions fallbacks (series > plotOptions.type > plotOptions.series). */
  const opt = (s: Legacy, type: string, key: string) => s[key] ?? plot[type]?.[key] ?? plot.series?.[key];

  const stackingOf = (type: string): ChartOptions['stacking'] => {
    const s = plot[type]?.stacking ?? plot.series?.stacking;
    return s === 'normal' || s === 'percent' ? s : false;
  };

  const series: SeriesOptions[] = ((hc.series ?? []) as Legacy[]).map((s, i) => {
    const legacyType = (s.type as string | undefined) ?? defaultType;
    const type = legacyType === 'solidgauge' || legacyType === 'gauge' ? 'gauge' : legacyType;

    let raw: unknown[] = Array.isArray(s.data) ? s.data : [];
    const mapping = { ...plot.series?.dataMapping, ...plot[legacyType]?.dataMapping, ...s.dataMapping };
    const mapped = !raw.length && columns && Object.keys(mapping).length > 0;
    if (mapped) raw = fromTable(columns, mapping, xIsCategory);
    const start = opt(s, legacyType, 'pointStart');
    if (typeof start === 'number' || typeof start === 'string') {
      const t = typeof start === 'string' ? Date.parse(start) : start;
      raw = withPointStart(raw, t, Number(opt(s, legacyType, 'pointInterval') ?? 1), opt(s, legacyType, 'pointIntervalUnit'));
    }

    const out: SeriesOptions = { type, data: points(raw, type) };
    if (typeof s.yAxis === 'number') out.yAxis = s.yAxis;
    const dl = opt(s, legacyType, 'dataLabels');
    const dlObj = Array.isArray(dl) ? dl[0] : dl;
    if (dlObj?.enabled) {
      const f = typeof dlObj.format === 'string' ? compileFormat(dlObj.format, locale) : null;
      const cfg: DataLabelOptions = {};
      if (f) {
        cfg.formatter = p => f({
          y: p.y, 'point.y': p.y, x: p.x, 'point.x': p.x, key: p.label, 'point.key': p.label, name: p.label, 'point.name': p.label,
          'series.name': p.series, percentage: p.percent, 'point.percentage': p.percent, value: p.y, 'point.value': p.y,
        });
      }
      if (dlObj.inside !== undefined) cfg.inside = !!dlObj.inside;
      out.dataLabels = Object.keys(cfg).length ? cfg : true;
    }
    if (s.upColor) out.upColor = color(s.upColor);
    if (s.color && type === 'candlestick') out.downColor = color(s.color);
    if (opt(s, legacyType, 'colorByPoint') === true) out.colorByPoint = true;
    if (type === 'gauge') {
      const ya = first(hc.yAxis) ?? {};
      if (typeof ya.min === 'number') out.min = ya.min;
      if (typeof ya.max === 'number') out.max = ya.max;
      if (legacyType === 'gauge') out.needle = true;
      if (Array.isArray(ya.stops)) out.colorRange = ya.stops.map((st: [number, string]) => st[1]);
      if (Array.isArray(ya.plotBands)) out.bands = ya.plotBands.map((b: Legacy) => ({ from: b.from, to: b.to, color: color(b.color) ?? '#94a3b8' }));
      if (typeof dlObj?.format === 'string') {
        const m = /\}([^{}]*)$/.exec(stripHtml(dlObj.format));
        if (m && m[1].trim()) out.suffix = ' ' + m[1].trim();
      }
    }
    if (type === 'sankey' && Array.isArray(s.nodes)) {
      out.nodes = (s.nodes as Legacy[]).map(n => ({ id: String(n.id), name: n.name, color: color(n.color) }));
    }
    const st = s.tooltip as Legacy | undefined;
    if (st?.valueSuffix) out.suffix = st.valueSuffix;
    else if (typeof st?.pointFormat === 'string') {
      const a = valueAffixes(st.pointFormat);
      if (a?.suffix) out.suffix = a.suffix.startsWith(' ') || /^[%°]/.test(a.suffix) ? a.suffix : ' ' + a.suffix;
    }
    if (type === 'heatmap') {
      const ca = first(hc.colorAxis);
      if (ca?.minColor && ca?.maxColor) out.colorRange = [color(ca.minColor)!, color(ca.maxColor)!];
      else if (Array.isArray(ca?.stops)) out.colorRange = ca.stops.map((x: [number, string]) => x[1]);
    }
    if (s.id) out.id = String(s.id);
    const name = s.name ?? (mapped ? mapping.y ?? mapping.value : undefined);
    if (name) out.name = stripHtml(String(name));
    const c = color(s.color);
    if (c && type !== 'candlestick') out.color = c;
    if (s.visible === false) out.visible = false;
    if (s.stack !== undefined) out.stack = String(s.stack);
    const dash = opt(s, legacyType, 'dashStyle');
    if (dash && dash !== 'Solid') out.dash = true;
    const marker = opt(s, legacyType, 'marker');
    if (marker?.enabled !== undefined) out.markers = !!marker.enabled;
    if (type === 'pie') {
      const inner = percentOf(s.innerSize ?? plot.pie?.innerSize);
      if (inner) out.innerRadius = inner;
    }
    if (s.xAxis) ignored.push(`series[${i}].xAxis (multiple x axes)`);
    return out;
  });

  // Several solid gauges sharing a pane are concentric rings in Highcharts: one Strata gauge with one point per ring.
  const gauges = series.filter(s => s.type === 'gauge' && !s.needle);
  if (gauges.length > 1 && gauges.length === series.length) {
    const merged: SeriesOptions = {
      ...gauges[0],
      name: text(hc.title) ?? gauges[0].name,
      data: gauges.map(g => {
        const p = g.data[0];
        const y = typeof p === 'number' ? p : p && !Array.isArray(p) && typeof p === 'object' ? (p.y as number) : null;
        const c = p && !Array.isArray(p) && typeof p === 'object' ? p.color : undefined;
        return { name: g.name, y, color: c ?? g.color };
      }),
    };
    series.splice(0, series.length, merged);
  }

  const types = series.map(s => s.type ?? defaultType);
  const stacking = types.map(stackingOf).find(Boolean) ?? false;
  const zoomType = (chart.zoomType ?? chart.zooming?.type) as string | undefined;
  const tooltip = (hc.tooltip ?? {}) as Legacy;
  const legend = (hc.legend ?? {}) as Legacy;
  const affixes = typeof tooltip.pointFormat === 'string' ? valueAffixes(tooltip.pointFormat) : null;
  const decimals = typeof tooltip.valueDecimals === 'number' ? tooltip.valueDecimals : affixes?.decimals;

  const options: ChartOptions = {
    type: defaultType,
    title: text(hc.title),
    subtitle: text(hc.subtitle),
    height: typeof chart.height === 'number' ? chart.height : undefined,
    inverted: chart.inverted === true || undefined,
    palette: Array.isArray(hc.colors) ? hc.colors.map(color).filter((c: string | undefined): c is string => !!c) : undefined,
    locale,
    stacking,
    xAxis: inferTime(axis(xa, ignored, 'xAxis', xIsCategory, locale), series),
    yAxis: Array.isArray(hc.yAxis) && hc.yAxis.length > 1
      ? hc.yAxis.map((a: Legacy, i: number) => axis(a, ignored, `yAxis[${i}]`, a?.type === 'category', locale) ?? {})
      : axis(first(hc.yAxis), ignored, 'yAxis', first(hc.yAxis)?.type === 'category', locale),
    navigator: hc.navigator?.enabled === true || (hc.navigator?.enabled !== false && (hc.rangeSelector !== undefined || defaultType === 'candlestick' || defaultType === 'ohlc') && xa?.type !== 'category') || undefined,
    rangeSelector: hc.rangeSelector?.enabled === false ? false : undefined,
    drilldown: Array.isArray(hc.drilldown?.series)
      ? { series: (hc.drilldown.series as Legacy[]).map(d => ({ id: String(d.id), name: d.name, type: d.type, data: points(d.data ?? [], d.type ?? defaultType) })) }
      : undefined,
    zoom: typeof zoomType === 'string' && zoomType.includes('x'),
    legend: legend.enabled === false ? false : legend.verticalAlign === 'top' ? { position: 'top' } : undefined,
    tooltip: tooltip.enabled === false
      ? false
      : {
          prefix: tooltip.valuePrefix ?? affixes?.prefix,
          suffix: tooltip.valueSuffix ?? affixes?.suffix,
          valueFormat: typeof decimals === 'number' ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : undefined,
        },
    exporting: hc.exporting?.enabled === false ? false : undefined,
    animation: chart.animation === false ? false : undefined,
    description: hc.accessibility?.description,
    series,
  };
  if (tooltip.formatter) ignored.push('tooltip.formatter (use tooltip.formatter)');
  if (typeof tooltip.pointFormat === 'string' && !affixes) ignored.push('tooltip.pointFormat (template helpers)');
  if (chart.events || plot.series?.events) ignored.push('events (use chart.on())');
  return { options, ignored };
}

/** Converts a Highcharts-style config object to Strata options. */
export function fromHighcharts(hc: Legacy): ChartOptions {
  return convertHighcharts(hc).options;
}
