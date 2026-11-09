import type { StandaloneItem, StandaloneSeriesType } from '../core/registry';
import { ramp } from '../core/color';
import { formatValue } from '../core/format';
import { niceStep } from '../scales/scale';

/** 240° dial: from 150° (lower left) clockwise to 30° (lower right). */
const A0 = (5 * Math.PI) / 6;
const SWEEP = (4 * Math.PI) / 3;
const f = (v: number) => Math.round(v * 100) / 100;

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const sweep = Math.max(0.0001, a1 - a0);
  const large = sweep > Math.PI ? 1 : 0;
  return `M${f(cx + r * Math.cos(a0))},${f(cy + r * Math.sin(a0))}A${f(r)},${f(r)} 0 ${large} 1 ${f(cx + r * Math.cos(a0 + sweep))},${f(cy + r * Math.sin(a0 + sweep))}`;
}

function inSweep(x: number, y: number, cx: number, cy: number): boolean {
  let a = Math.atan2(y - cy, x - cx);
  while (a < A0) a += Math.PI * 2;
  return a <= A0 + SWEEP + 0.05;
}

/**
 * Gauge. Each point is one ring (concentric "activity rings" when there are several),
 * or a classic dial with a needle (`needle: true`). Zones via `bands`, colour ramp via `colorRange`.
 */
export const gauge: StandaloneSeriesType = {
  type: 'gauge',
  kind: 'standalone',
  legend: 'points',
  render(ctx) {
    const { scene, group, series, rect, locale } = ctx;
    const o = series.options;
    const min = o.min ?? 0;
    const max = o.max ?? 100;
    const span = max - min || 1;
    const frac = (v: number) => Math.max(0, Math.min(1, (v - min) / span));
    const fmt = (v: number | null) => formatValue(v, locale, { maximumFractionDigits: 1 }) + (o.suffix ?? '');
    const pts = series.points.filter(p => p.visible && p.y !== null);
    const colorOf = (v: number, fallback: string) =>
      o.bands?.find(b => v >= b.from && v <= b.to)?.color ?? (o.colorRange ? ramp(o.colorRange, frac(v)) : fallback);

    // The dial is 1.5 r tall (r above the centre, r·sin 30° below), plus room for the caption.
    const r = Math.max(30, Math.min(rect.width / 2 - 12, (rect.height - 34) / 1.5 - 6));
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + (rect.height - 1.5 * r - 26) / 2 + r;
    const items: StandaloneItem[] = [];
    const ends: [number, number][] = [];

    if (o.needle) {
      const t = Math.max(8, r * 0.09);
      const rr = r - t / 2;
      scene.el(group, 'track', 'path', { d: arc(cx, cy, rr, A0, A0 + SWEEP), fill: 'none', class: 'strata-gauge-trackline', 'stroke-width': t });
      (o.bands ?? []).forEach((b, i) => {
        scene.el(group, `band-${i}`, 'path', {
          d: arc(cx, cy, rr, A0 + frac(b.from) * SWEEP, A0 + frac(b.to) * SWEEP), fill: 'none', stroke: b.color, 'stroke-width': t,
        });
      });
      const step = niceStep(span, 8);
      for (let v = Math.ceil(min / step) * step, k = 0; v <= max + 1e-9 && k < 40; v += step, k++) {
        const a = A0 + frac(v) * SWEEP;
        const r1 = r - t - 4;
        const r2 = r1 - 8;
        const key = String(+v.toPrecision(12));
        scene.el(group, 'tick-' + key, 'line', {
          x1: cx + r1 * Math.cos(a), y1: cy + r1 * Math.sin(a), x2: cx + r2 * Math.cos(a), y2: cy + r2 * Math.sin(a), class: 'strata-gauge-tick',
        });
        if (r > 70) {
          const r3 = r2 - 12;
          scene.el(group, 'tl-' + key, 'text', {
            x: cx + r3 * Math.cos(a), y: cy + r3 * Math.sin(a), dy: '0.35em', 'text-anchor': 'middle', class: 'strata-gauge-ticklabel',
          }, { text: formatValue(+v.toPrecision(12), locale, { notation: 'compact' }) });
        }
      }
      const p = pts[0];
      if (p) {
        const len = r - t - 10;
        const w = Math.max(3, r * 0.035);
        const needle = scene.el(group, 'needle', 'path', { class: 'strata-gauge-needle strata-item' });
        scene.value(needle, 'a', [A0 + frac(p.y!) * SWEEP, cx, cy], ([a, x, y]) => {
          const tip = [x + len * Math.cos(a), y + len * Math.sin(a)];
          const n = [Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w];
          const back = [x - 14 * Math.cos(a), y - 14 * Math.sin(a)];
          needle.setAttribute('d', `M${f(back[0] + n[0])},${f(back[1] + n[1])}L${f(tip[0])},${f(tip[1])}L${f(back[0] - n[0])},${f(back[1] - n[1])}Z`);
        }, [A0, cx, cy]);
        scene.el(group, 'hub', 'circle', { cx, cy, r: Math.max(6, r * 0.06), class: 'strata-gauge-hub' });
        scene.el(group, 'value', 'text', {
          x: cx, y: cy + r * 0.42, 'text-anchor': 'middle', class: 'strata-gauge-value', 'font-size': Math.max(16, Math.min(40, r * 0.24)),
        }, { text: fmt(p.y) });
        items.push({
          key: `${series.id}:${p.index}`,
          point: p,
          el: needle,
          contains: (x, y) => Math.hypot(x - cx, y - cy) <= r && inSweep(x, y, cx, cy),
          anchor: [cx + r * 0.55, cy - r * 0.2],
          header: p.name ?? series.name,
          rows: [{ series: series.name, color: colorOf(p.y!, p.color), value: p.y, text: fmt(p.y) }],
        });
      }
      ends.push([A0, r], [A0 + SWEEP, r]);
    } else {
      const n = Math.max(1, pts.length);
      const t = Math.min(r * 0.24, (r * 0.62) / n);
      const gap = n > 1 ? t * 0.22 : 0;
      pts.forEach((p, i) => {
        const outer = r - i * (t + gap);
        const mid = outer - t / 2;
        const v = p.y!;
        const color = colorOf(v, p.color);
        scene.el(group, `track-${p.index}`, 'path', {
          d: arc(cx, cy, mid, A0, A0 + SWEEP), fill: 'none', stroke: color, 'stroke-opacity': 0.14, 'stroke-width': t, 'stroke-linecap': 'round',
        });
        const el = scene.el(group, `ring-${p.index}`, 'path', {
          fill: 'none', stroke: color, 'stroke-width': t, 'stroke-linecap': 'round', class: 'strata-item', 'data-key': `${series.id}:${p.index}`,
          opacity: frac(v) > 0 ? 1 : 0,
        });
        // Angle, radius and centre are tweened together, so value changes sweep and resizes re-layout.
        scene.value(el, 'arc', [frac(v), mid, cx, cy], ([fr, m, x, y]) => el.setAttribute('d', arc(x, y, m, A0, A0 + Math.max(0.0001, fr) * SWEEP)), [0, mid, cx, cy]);
        const end = A0 + frac(v) * SWEEP;
        items.push({
          key: `${series.id}:${p.index}`,
          point: p,
          el,
          contains: (x, y) => {
            const d = Math.hypot(x - cx, y - cy);
            return d >= outer - t - 3 && d <= outer + 3 && inSweep(x, y, cx, cy);
          },
          anchor: [cx + mid * Math.cos(end), cy + mid * Math.sin(end)],
          header: p.name ?? series.name,
          rows: [
            { series: p.name ?? series.name, color, value: v, text: fmt(v) },
            { series: 'Progression', color: 'transparent', value: frac(v) * 100, text: formatValue(frac(v) * 100, locale, { maximumFractionDigits: 0 }) + ' %' },
          ],
        });
      });
      const first = pts[0];
      if (first && ctx.dataLabels) {
        const inner = r - n * (t + gap);
        const size = Math.max(16, Math.min(52, inner * (n > 1 ? 0.42 : 0.5)));
        scene.el(group, 'value', 'text', {
          x: cx, y: cy + size * 0.12, 'text-anchor': 'middle', class: 'strata-gauge-value', 'font-size': size,
        }, { text: fmt(first.y) });
        scene.el(group, 'label', 'text', {
          x: cx, y: cy + size * 0.12 + 20, 'text-anchor': 'middle', class: 'strata-gauge-label',
        }, { text: n > 1 ? first.name ?? series.name : series.name });
      }
      if (n === 1) ends.push([A0, r - t / 2], [A0 + SWEEP, r - t / 2]);
    }

    // Scale end labels under both ends of the dial.
    if (ends.length && rect.width > 160) {
      ends.forEach(([a, rr], i) => {
        scene.el(group, `end-${i}`, 'text', {
          x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) + 22, 'text-anchor': 'middle', class: 'strata-gauge-ticklabel',
        }, { text: formatValue(i ? max : min, locale, { notation: 'compact' }) });
      });
    }
    return { series, items };
  },
};
