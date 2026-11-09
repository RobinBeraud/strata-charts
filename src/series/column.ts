import type { CartesianSeriesType, HitPoint } from '../core/registry';
import { barPath } from '../render/paths';

/** Vertical columns; with `inverted` (or type "bar") they become horizontal bars. */
export const column: CartesianSeriesType = {
  type: 'column',
  kind: 'cartesian',
  band: true,
  stackFamily: 'column',
  zeroBased: true,
  render(ctx) {
    const { scene, group, inverted, slot, bandwidth } = ctx;
    const slotW = bandwidth / Math.max(1, slot.count);
    const barW = Math.max(1, Math.min(slotW * 0.88, 72));
    const radius = Math.min(4, barW / 4);
    const hits: HitPoint[] = [];
    for (const p of ctx.points) {
      if (p.y === null || !p.visible) continue;
      const center = ctx.x.map(p.x);
      const a = center - bandwidth / 2 + slotW * (slot.index + 0.5) - barW / 2;
      const b0 = ctx.y.map(ctx.base(p));
      const b1 = ctx.y.map(p.y1);
      const el = scene.el(group, `b-${p.index}`, 'path', {
        d: barPath(a, barW, b0, b1, inverted, radius),
        fill: p.color,
        class: 'strata-bar',
      }, { enter: { d: barPath(a, barW, b0, b0, inverted, radius) } });
      const mid = a + barW / 2;
      hits.push({ px: inverted ? b1 : mid, py: inverted ? mid : b1, along: center, point: p, el });
    }
    return hits;
  },
};
