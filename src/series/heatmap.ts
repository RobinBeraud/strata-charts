import type { CartesianSeriesType, HitPoint } from '../core/registry';
import type { NSeries } from '../core/model';
import { ramp } from '../core/color';
import { formatValue } from '../core/format';

export const HEATMAP_RAMP = ['#e0f2fe', '#38bdf8', '#6366f1', '#581c87'];

function extent(s: NSeries): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of s.points) {
    if (p.z === undefined) continue;
    lo = Math.min(lo, p.z);
    hi = Math.max(hi, p.z);
  }
  return isFinite(lo) ? [lo, hi] : [0, 1];
}

/** Grid of coloured cells: x and y are categories, z is the value. */
export const heatmap: CartesianSeriesType = {
  type: 'heatmap',
  kind: 'cartesian',
  band: true,
  hover: '2d',
  colorScale(s) {
    const [min, max] = extent(s);
    return { min, max, colors: s.options.colorRange ?? HEATMAP_RAMP };
  },
  prepare(s) {
    const [min, max] = extent(s);
    const colors = s.options.colorRange ?? HEATMAP_RAMP;
    for (const p of s.points) {
      if (p.z !== undefined) p.color = ramp(colors, max === min ? 0.5 : (p.z - min) / (max - min));
    }
  },
  tooltip(p, env) {
    return {
      header: env.xLabel,
      rows: [{ series: env.yCategories[p.y ?? -1] ?? String(p.y), color: p.color, value: p.z ?? null }],
    };
  },
  render(ctx) {
    const { scene, group, inverted } = ctx;
    const step = (s: typeof ctx.x) => ('step' in s ? Math.abs((s as unknown as { step: number }).step) : 20);
    const sx = step(ctx.x);
    const sy = step(ctx.y);
    const hits: HitPoint[] = [];
    for (const p of ctx.points) {
      if (p.y === null || p.z === undefined || !p.visible) continue;
      const [cx, cy] = ctx.pos(p.x, p.y);
      const [w, h] = inverted ? [sy, sx] : [sx, sy];
      const el = scene.el(group, `h-${p.index}`, 'rect', {
        x: cx - w / 2 + 1, y: cy - h / 2 + 1, width: Math.max(0, w - 2), height: Math.max(0, h - 2),
        rx: 3, fill: p.color, class: 'strata-cell', opacity: 1,
      }, { enter: { opacity: 0 } });
      hits.push({ px: cx, py: cy, along: inverted ? cy : cx, point: p, el, r: Math.max(w, h) / 2 });
    }
    return hits;
  },
};

export function formatHeat(v: number, locale?: string): string {
  return formatValue(v, locale, { maximumFractionDigits: 1 });
}
