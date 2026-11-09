import type { CartesianContext, CartesianSeriesType, HitPoint } from '../core/registry';
import type { NSeries } from '../core/model';
import { formatValue } from '../core/format';
import { barPath } from '../render/paths';

const UP = '#22c55e';
const DOWN = '#ef4444';
const f = (v: number) => Math.round(v * 100) / 100;

function prepare(s: NSeries): void {
  for (const p of s.points) {
    if (!p.ohlc) continue;
    p.lo = p.ohlc[2];
    p.hi = p.ohlc[1];
    p.y0 = p.y1 = p.ohlc[3];
  }
}

function render(ctx: CartesianContext, style: 'candle' | 'ohlc'): HitPoint[] {
  const { scene, group, series, inverted, bandwidth } = ctx;
  const up = series.options.upColor ?? UP;
  const down = series.options.downColor ?? DOWN;
  const w = Math.max(1, Math.min(bandwidth * 0.72, 26));
  const P = (u: number, v: number) => (inverted ? `${f(v)},${f(u)}` : `${f(u)},${f(v)}`);
  const hits: HitPoint[] = [];
  for (const p of ctx.points) {
    if (!p.ohlc || !p.visible) continue;
    const [o, h, l, c] = p.ohlc;
    const color = c >= o ? up : down;
    const u = ctx.x.map(p.x);
    const yo = ctx.y.map(o);
    const yh = ctx.y.map(h);
    const yl = ctx.y.map(l);
    let yc = ctx.y.map(c);
    if (Math.abs(yc - yo) < 1) yc = yo + (inverted ? 1 : -1);
    if (style === 'candle') {
      scene.el(group, `w-${p.index}`, 'path', {
        d: `M${P(u, yh)}L${P(u, yl)}`, stroke: color, 'stroke-width': 1.25, fill: 'none',
      }, { enter: { d: `M${P(u, yo)}L${P(u, yo)}` } });
      const el = scene.el(group, `b-${p.index}`, 'path', {
        d: barPath(u - w / 2, w, yo, yc, inverted, 1.5), fill: color, class: 'strata-bar',
      }, { enter: { d: barPath(u - w / 2, w, yo, yo, inverted, 1.5) } });
      hits.push({ px: inverted ? yc : u, py: inverted ? u : yc, along: u, point: p, el });
    } else {
      const t = w / 2;
      scene.el(group, `o-${p.index}`, 'path', {
        d: `M${P(u, yh)}L${P(u, yl)}M${P(u - t, yo)}L${P(u, yo)}M${P(u, yc)}L${P(u + t, yc)}`,
        stroke: color, 'stroke-width': 1.75, fill: 'none', 'stroke-linecap': 'round',
      }, { enter: { d: `M${P(u, yo)}L${P(u, yo)}M${P(u, yo)}L${P(u, yo)}M${P(u, yo)}L${P(u, yo)}` } });
      hits.push({ px: inverted ? yc : u, py: inverted ? u : yc, along: u, point: p });
    }
  }
  return hits;
}

const tooltip: CartesianSeriesType['tooltip'] = (p, env) => {
  const [o, h, l, c] = p.ohlc ?? [p.y ?? 0, p.y ?? 0, p.y ?? 0, p.y ?? 0];
  const color = c >= o ? p.series.options.upColor ?? UP : p.series.options.downColor ?? DOWN;
  const pct = o ? ((c - o) / o) * 100 : 0;
  const row = (name: string, v: number) => ({ series: name, color, value: v, text: formatValue(v, env.locale) });
  return {
    header: `${env.xLabel} · ${p.series.name}`,
    rows: [
      row('Ouverture', o), row('Haut', h), row('Bas', l), row('Clôture', c),
      { series: 'Variation', color: 'transparent', value: pct, text: `${pct >= 0 ? '+' : ''}${formatValue(pct, env.locale, { maximumFractionDigits: 2 })} %` },
    ],
  };
};

export const candlestick: CartesianSeriesType = {
  type: 'candlestick',
  kind: 'cartesian',
  needsWidth: true,
  prepare,
  tooltip,
  render: ctx => render(ctx, 'candle'),
};

export const ohlc: CartesianSeriesType = {
  type: 'ohlc',
  kind: 'cartesian',
  needsWidth: true,
  prepare,
  tooltip,
  render: ctx => render(ctx, 'ohlc'),
};
