import type { CartesianSeriesType, HitPoint } from '../core/registry';
import { formatValue } from '../core/format';
import { barPath } from '../render/paths';

/** Running-total bars: each bar starts where the previous one ended; `isSum` points show the total. */
export const waterfall: CartesianSeriesType = {
  type: 'waterfall',
  kind: 'cartesian',
  band: true,
  zeroBased: true,
  prepare(s) {
    const o = s.options;
    let run = 0;
    for (const p of s.points) {
      const delta = p.isSum ? 0 : p.y ?? 0;
      p.color = p.isSum ? o.sumColor ?? s.color : delta >= 0 ? o.upColor ?? '#22c55e' : o.downColor ?? '#ef4444';
      if (p.isSum) {
        p.y0 = 0;
        p.y1 = run;
      } else {
        const v = p.visible ? p.y ?? 0 : 0;
        p.y0 = run;
        run += v;
        p.y1 = run;
      }
      p.lo = Math.min(p.y0, p.y1);
      p.hi = Math.max(p.y0, p.y1);
    }
  },
  tooltip(p, env) {
    const delta = p.isSum ? p.y1 : p.y;
    return {
      header: env.xLabel,
      rows: [
        { series: p.isSum ? 'Total' : 'Variation', color: p.color, value: delta, text: (delta !== null && delta > 0 && !p.isSum ? '+' : '') + formatValue(delta, env.locale) },
        ...(p.isSum ? [] : [{ series: 'Cumul', color: 'transparent', value: p.y1 }]),
      ],
    };
  },
  render(ctx) {
    const { scene, group, inverted, bandwidth, slot } = ctx;
    const slotW = bandwidth / Math.max(1, slot.count);
    const barW = Math.max(1, Math.min(slotW * 0.88, 72));
    const radius = Math.min(4, barW / 4);
    const [vMin, vMax] = [Math.min(...ctx.y.domain), Math.max(...ctx.y.domain)];
    const clampV = (v: number) => Math.max(vMin, Math.min(vMax, v));
    const hits: HitPoint[] = [];
    let prev: { end: number; value: number } | null = null;
    for (const p of ctx.points) {
      if (p.y === null && !p.isSum) continue;
      const center = ctx.x.map(p.x);
      const a = center - bandwidth / 2 + slotW * (slot.index + 0.5) - barW / 2;
      const b0 = ctx.y.map(clampV(p.y0));
      const b1 = ctx.y.map(clampV(p.y1));
      const el = scene.el(group, `b-${p.index}`, 'path', {
        d: barPath(a, barW, b0, b1, inverted, radius), fill: p.color, class: 'strata-bar',
      }, { enter: { d: barPath(a, barW, b0, b0, inverted, radius) } });
      if (prev) {
        const v = ctx.y.map(clampV(prev.value));
        const P = (u: number) => (inverted ? `${v},${u}` : `${u},${v}`);
        scene.el(group, `c-${p.index}`, 'path', { d: `M${P(prev.end)}L${P(a)}`, class: 'strata-connector', opacity: 1 }, { enter: { opacity: 0 } });
      }
      prev = { end: a + barW, value: p.y1 };
      const mid = a + barW / 2;
      hits.push({ px: inverted ? b1 : mid, py: inverted ? mid : b1, along: center, point: p, el });
    }
    return hits;
  },
};
