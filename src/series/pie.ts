import type { StandaloneItem, StandaloneSeriesType } from '../core/registry';
import { formatValue } from '../core/format';
import { arcPath } from '../render/paths';

const START = -Math.PI / 2;
const LINE = 17;
const SVGNS = 'http://www.w3.org/2000/svg';

export interface PieLabel {
  i: number;
  mid: number;
  right: boolean;
  y: number;
  text: string;
  pct: string;
  value: number;
}

/**
 * Spread labels on one side so none overlap: sort by angle-derived y, push down,
 * then push back up from the bottom bound. Drops the smallest slices if they cannot fit.
 */
export function spreadLabels<T extends { y: number; value: number }>(labels: T[], top: number, bottom: number, gap = LINE): T[] {
  const capacity = Math.max(1, Math.floor((bottom - top) / gap) + 1);
  let kept = labels;
  if (labels.length > capacity) kept = labels.slice().sort((a, b) => b.value - a.value).slice(0, capacity);
  kept = kept.slice().sort((a, b) => a.y - b.y);
  for (let k = 0; k < kept.length; k++) kept[k].y = Math.max(kept[k].y, top, k ? kept[k - 1].y + gap : -Infinity);
  for (let k = kept.length - 1; k >= 0; k--) kept[k].y = Math.min(kept[k].y, bottom, k < kept.length - 1 ? kept[k + 1].y - gap : Infinity);
  return kept;
}

export const pie: StandaloneSeriesType = {
  type: 'pie',
  kind: 'standalone',
  legend: 'points',
  outsideLabels: true,
  render(ctx) {
    const { scene, group, series, cx, cy, radius } = ctx;
    const ratio = Math.max(0, Math.min(0.9, series.options.innerRadius ?? (series.rawType === 'donut' ? 0.62 : 0)));
    const r1 = radius;
    const r0 = radius * ratio;
    const values = series.points.map(p => (p.visible && p.y !== null && p.y > 0 ? p.y : 0));
    const total = values.reduce((a, b) => a + b, 0);
    const items: StandaloneItem[] = [];
    const labels: PieLabel[] = [];
    let a = START;

    series.points.forEach((p, i) => {
      const sweep = total ? (values[i] / total) * Math.PI * 2 : 0;
      const a0 = a;
      const a1 = a + sweep;
      a = a1;
      const el = scene.el(group, `slice-${i}`, 'path', { fill: p.color, class: 'strata-slice strata-item', 'data-key': `${series.id}:${i}` });
      // Centre and radii are part of the tweened vector so a resize re-lays out the arcs too.
      scene.value(el, 'arc', [a0, a1, r0, r1, cx, cy], v => el.setAttribute('d', arcPath(v[4], v[5], v[2], v[3], v[0], v[1])), [START, START, r0, r1, cx, cy]);
      const mid = (a0 + a1) / 2;
      if (sweep > 0) {
        items.push({
          key: `${series.id}:${i}`,
          point: p,
          el,
          contains(x, y) {
            const r = Math.hypot(x - cx, y - cy);
            if (r < r0 || r > r1 + 8) return false;
            let a = Math.atan2(y - cy, x - cx);
            if (a < START) a += Math.PI * 2;
            return a >= a0 && a < a1;
          },
          anchor: [cx + Math.cos(mid) * (r1 * 0.75 + r0 * 0.25), cy + Math.sin(mid) * (r1 * 0.75 + r0 * 0.25)],
          pop: `translate(${Math.cos(mid) * 7}px,${Math.sin(mid) * 7}px)`,
          header: p.label,
          rows: [{ series: series.name, color: p.color, value: p.y, percent: total ? (values[i] / total) * 100 : undefined }],
        });
      }
      if (ctx.showLabels && sweep > 0.035) {
        const pct = formatValue((values[i] / total) * 100, ctx.locale, { maximumFractionDigits: 1 }) + ' %';
        labels.push({ i, mid, right: Math.cos(mid) >= 0, y: cy + (r1 + 16) * Math.sin(mid), text: p.label, pct, value: values[i] });
      }
    });

    const top = cy - r1 - 10;
    const bottom = cy + r1 + 10;
    for (const side of [true, false]) {
      for (const l of spreadLabels(labels.filter(l => l.right === side), top, bottom)) {
        const cos = Math.cos(l.mid);
        const sin = Math.sin(l.mid);
        const ex = cx + (r1 + 10) * cos;
        const ey = cy + (r1 + 10) * sin;
        const lx = cx + (side ? 1 : -1) * (r1 + 26);
        scene.el(group, `conn-${l.i}`, 'path', {
          d: `M${cx + (r1 + 2) * cos},${cy + (r1 + 2) * sin}L${ex},${ey}L${lx},${l.y}`,
          class: 'strata-pie-connector',
          opacity: 1,
        }, { enter: { opacity: 0 } });
        const label = scene.el(group, `label-${l.i}`, 'text', {
          x: lx + (side ? 5 : -5), y: l.y, dy: '0.35em',
          'text-anchor': side ? 'start' : 'end',
          class: 'strata-pie-label',
          opacity: 1,
        }, { enter: { opacity: 0 } });
        const key = l.text + '|' + l.pct;
        if (label.getAttribute('data-text') !== key) {
          label.setAttribute('data-text', key);
          label.textContent = l.text + ' ';
          const t = document.createElementNS(SVGNS, 'tspan');
          t.setAttribute('class', 'strata-pie-pct');
          t.textContent = l.pct;
          label.append(t);
        }
      }
    }

    if (r0 > 30) {
      scene.el(group, 'center-value', 'text', {
        x: cx, y: cy, dy: '0.1em', 'text-anchor': 'middle', class: 'strata-center-value',
      }, { text: formatValue(total, ctx.locale, { notation: total >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 1 }) });
      scene.el(group, 'center-label', 'text', {
        x: cx, y: cy + 18, 'text-anchor': 'middle', class: 'strata-center-label',
      }, { text: series.name });
    }

    return { series, items };
  },
};
