import type { CartesianContext, CartesianSeriesType, HitPoint } from '../core/registry';
import { formatValue } from '../core/format';

/** Above this many points a series is drawn as ONE path of round-capped dots (fast, still vector). */
export const FAST_THRESHOLD = 1500;

function renderScatter(ctx: CartesianContext): HitPoint[] {
  const { scene, group, series, inverted } = ctx;
  const hits: HitPoint[] = [];
  const pts = ctx.points.filter(p => p.y !== null && p.visible);
  const fast = pts.length > FAST_THRESHOLD;
  const r = fast ? 2.25 : pts.length > 400 ? 3 : 4.5;
  let d = '';
  for (const p of pts) {
    const [px, py] = ctx.pos(p.x, p.y!);
    if (fast) d += `M${Math.round(px * 10) / 10},${Math.round(py * 10) / 10}h0`;
    else {
      scene.el(group, `p-${p.index}`, 'circle', {
        cx: px, cy: py, r, fill: p.color, 'fill-opacity': 0.72,
        stroke: p.color, 'stroke-opacity': 0.9, 'stroke-width': 1,
      }, { enter: { cx: px, cy: py, r: 0 } });
    }
    hits.push({ px, py, along: inverted ? py : px, point: p, r });
  }
  if (fast) {
    scene.el(group, 'fast', 'path', {
      d, stroke: series.color, 'stroke-width': r * 2, 'stroke-linecap': 'round', 'stroke-opacity': 0.55, fill: 'none', opacity: 1,
    }, { enter: { opacity: 0 } });
  }
  return hits;
}

function renderBubble(ctx: CartesianContext): HitPoint[] {
  const { scene, group, inverted, plot } = ctx;
  const pts = ctx.points.filter(p => p.y !== null && p.visible && p.z !== undefined);
  const zMax = Math.max(1e-9, ...ctx.series.points.map(p => Math.abs(p.z ?? 0)));
  const rMin = 4;
  const rMax = Math.max(rMin + 2, Math.min(plot.width, plot.height) / 9);
  const hits: HitPoint[] = [];
  // Largest first, so small bubbles stay on top and hoverable.
  const sorted = pts.slice().sort((a, b) => Math.abs(b.z!) - Math.abs(a.z!));
  for (const p of sorted) {
    const [px, py] = ctx.pos(p.x, p.y!);
    const r = rMin + (rMax - rMin) * Math.sqrt(Math.abs(p.z!) / zMax);
    const el = scene.el(group, `p-${p.index}`, 'circle', {
      cx: px, cy: py, r, fill: p.color, 'fill-opacity': 0.45, stroke: p.color, 'stroke-width': 1.25, class: 'strata-bubble',
    }, { enter: { cx: px, cy: py, r: 0 } });
    hits.push({ px, py, along: inverted ? py : px, point: p, r, el });
  }
  return hits.sort((a, b) => a.along - b.along);
}

const xyTooltip: CartesianSeriesType['tooltip'] = (p, env) => {
  const rows = [
    { series: 'x', color: p.color, value: p.x, text: env.xLabel },
    { series: 'y', color: p.color, value: p.y },
  ];
  if (p.z !== undefined) rows.push({ series: 'z', color: p.color, value: p.z, text: formatValue(p.z, env.locale) });
  return { header: p.name ?? p.series.name, rows };
};

export const scatter: CartesianSeriesType = {
  type: 'scatter',
  kind: 'cartesian',
  hover: '2d',
  tooltip: xyTooltip,
  render: renderScatter,
};

export const bubble: CartesianSeriesType = {
  type: 'bubble',
  kind: 'cartesian',
  padding: 0.12,
  hover: '2d',
  tooltip: xyTooltip,
  render: renderBubble,
};
