// Option-path coverage: which Highcharts options do the official examples use, and which does Strata honour?
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const captured = JSON.parse(readFileSync(join(OUT, 'hc-configs.json'), 'utf8'));

const POINT_KEYS = new Set(['x', 'y', 'z', 'name', 'color', 'open', 'high', 'low', 'close', 'drilldown', 'isSum', 'id', 'parent', 'value', 'from', 'to', 'weight']);
// Option paths Strata honours (through convertHighcharts or natively). `*` matches one segment.
const SUPPORTED = [
  'chart.type', 'chart.height', 'chart.inverted', 'chart.zoomType', 'chart.zooming.type', 'chart.animation',
  'title.text', 'subtitle.text', 'colors', 'credits.enabled',
  'xAxis.type', 'xAxis.categories', 'xAxis.title.text', 'xAxis.min', 'xAxis.max', 'xAxis.gridLineWidth',
  'yAxis.type', 'yAxis.categories', 'yAxis.title.text', 'yAxis.min', 'yAxis.max', 'yAxis.gridLineWidth', 'yAxis.opposite',
  'yAxis.plotLines.value', 'yAxis.plotLines.label.text', 'yAxis.plotLines.color', 'yAxis.stops', 'yAxis.plotBands.from', 'yAxis.plotBands.to', 'yAxis.plotBands.color',
  'plotOptions.series.stacking', 'plotOptions.*.stacking', 'plotOptions.*.dataLabels.enabled', 'plotOptions.series.dataLabels.enabled', 'plotOptions.pie.innerSize',
  'legend.enabled', 'legend.verticalAlign',
  'tooltip.enabled', 'tooltip.valuePrefix', 'tooltip.valueSuffix', 'tooltip.valueDecimals', 'tooltip.shared',
  'exporting.enabled', 'accessibility',
  'navigator.enabled', 'rangeSelector.enabled', 'drilldown.series',
  'colorAxis.minColor', 'colorAxis.maxColor', 'colorAxis.stops',
  'series.type', 'series.name', 'series.id', 'series.data', 'series.color', 'series.visible', 'series.stack', 'series.dashStyle',
  'series.marker.enabled', 'series.innerSize', 'series.yAxis', 'series.dataLabels.enabled', 'series.upColor', 'series.nodes', 'series.keys',
  'series.tooltip.valueSuffix',
  'drilldown.series.id', 'drilldown.series.name', 'drilldown.series.type', 'drilldown.series.data',
  'series.innerSize', 'series.nodes.id', 'series.nodes.name', 'series.nodes.color', 'colorAxis.min', 'colorAxis.max',
  // Added with the Highcharts 13 compat work:
  'xAxis.labels.format', 'yAxis.labels.format', 'xAxis.visible', 'yAxis.visible',
  'xAxis.plotBands.from', 'xAxis.plotBands.to', 'xAxis.plotBands.color', 'xAxis.plotBands.label.text', 'yAxis.plotBands.label.text',
  'xAxis.plotLines.value', 'xAxis.plotLines.color', 'xAxis.plotLines.label.text', 'xAxis.opposite',
  'series.dataMapping.*', 'plotOptions.*.dataMapping.*',
  'series.pointStart', 'series.pointInterval', 'series.pointIntervalUnit', 'plotOptions.*.pointStart', 'plotOptions.*.pointInterval', 'plotOptions.*.pointIntervalUnit',
  'series.dataLabels.format', 'plotOptions.*.dataLabels.format', 'series.dataLabels.inside', 'plotOptions.*.dataLabels.inside',
  'tooltip.pointFormat', 'series.tooltip.pointFormat',
  'series.colorByPoint', 'plotOptions.*.colorByPoint', 'plotOptions.*.marker.enabled', 'plotOptions.*.dashStyle',
  'xAxis.crosshair', 'lang.locale',
];
const match = (path, pat) => {
  const a = path.split('.');
  const b = pat.split('.');
  return a.length === b.length && b.every((s, i) => s === '*' || s === a[i]);
};
const supported = p => SUPPORTED.some(s => match(p, s));

// Leaf option paths (array indices dropped, point data summarised as series.data).
function paths(o, prefix = '', out = new Set()) {
  if (o === null || typeof o !== 'object' || o.__fn || o.__node || o.__cycle) {
    if (prefix) out.add(prefix);
    return out;
  }
  if (Array.isArray(o)) {
    if (prefix.endsWith('.data') || prefix === 'series.data') {
      out.add(prefix);
      for (const d of o) if (d && typeof d === 'object' && !Array.isArray(d)) for (const k of Object.keys(d)) if (!POINT_KEYS.has(k)) out.add(prefix + '.' + k);
      return out;
    }
    if (o.every(x => x === null || typeof x !== 'object')) {
      out.add(prefix);
      return out;
    }
    for (const x of o) paths(x, prefix, out);
    return out;
  }
  const keys = Object.keys(o);
  // Feature modules count as one feature each (3D injects ~100 zAxis defaults, etc.).
  const COLLAPSE = ['zAxis', 'annotations', 'responsive', 'sonification', 'countries', 'pane', 'data', 'navigation', 'chart.options3d', 'accessibility', 'boost', 'mapNavigation', 'mapView'];
  if (COLLAPSE.includes(prefix)) { if (keys.length) out.add(prefix); return out; }
  if (!keys.length) return out; // empty objects ({}): nothing configured
  for (const k of keys) { if (!prefix && k === 'dataTable') continue; if (k === 'dataTable' || k === 'columns') { out.add(prefix ? prefix + '.' + k : k); continue; } paths(o[k], prefix ? `${prefix}.${k}` : k, out); }
  return out;
}

const usage = new Map();
const perChart = [];
// Weight per example (a page with 100 sparklines counts once): a path counts once per example.
for (const ex of captured) {
  if (!ex.charts.length) continue;
  const ps = new Set();
  for (const c of ex.charts) for (const p of paths(c.options)) ps.add(p);
  let ok = 0;
  for (const p of ps) {
    const u = usage.get(p) ?? { n: 0, ok: supported(p) };
    u.n++;
    usage.set(p, u);
    if (u.ok) ok++;
  }
  const missing = [...ps].filter(p => !supported(p));
  perChart.push({ example: ex.example, charts: ex.charts.length, types: [...new Set(ex.charts.flatMap(c => c.types))], paths: ps.size, supported: ok, pct: +(ok / ps.size * 100).toFixed(0), missing });
}

const rows = [...usage.entries()].sort((a, b) => b[1].n - a[1].n);
const total = rows.reduce((a, [, u]) => a + u.n, 0);
const okUses = rows.reduce((a, [, u]) => a + (u.ok ? u.n : 0), 0);
const distinct = rows.length;
const okDistinct = rows.filter(([, u]) => u.ok).length;
const charts = perChart.length;
const fullCharts = perChart.filter(c => c.missing.length === 0).length;
const top = rows.filter(([, u]) => !u.ok).slice(0, 60).map(([p, u]) => `${String(u.n).padStart(4)}  ${p}`);
const groups = new Map();
for (const [p, u] of rows) {
  const g = p.split('.')[0];
  const e = groups.get(g) ?? { n: 0, ok: 0, distinct: 0 };
  e.n += u.n;
  e.distinct++;
  if (u.ok) e.ok += u.n;
  groups.set(g, e);
}
const hist = [0, 25, 50, 75, 90, 100].map((lo, i, a) => ({ range: `${lo}-${a[i + 1] ?? 100}`, n: perChart.filter(c => c.pct >= lo && (i === a.length - 1 ? c.pct >= 100 : c.pct < (a[i + 1] ?? 101))).length }));
const summary = {
  examples: charts, fullyCovered: fullCharts, distinctPaths: distinct, distinctSupported: okDistinct, uses: total, usesSupported: okUses,
  usageCoverage: +(okUses / total * 100).toFixed(1), distinctCoverage: +(okDistinct / distinct * 100).toFixed(1),
  medianExampleCoverage: [...perChart].map(c => c.pct).sort((a, b) => a - b)[Math.floor(charts / 2)],
  histogram: hist,
  groups: [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25).map(([g, e]) => ({ group: g, uses: e.n, supportedPct: +(e.ok / e.n * 100).toFixed(0), distinct: e.distinct })),
  topMissing: top,
};
writeFileSync(join(OUT, 'coverage.json'), JSON.stringify({ summary, perChart }, null, 1));
console.log(JSON.stringify(summary, null, 1));
