import type { Rect, StandaloneItem, StandaloneSeriesType } from '../core/registry';
import type { Point } from '../core/model';
import { mix, prefersLightText } from '../core/color';
import { formatValue } from '../core/format';

/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000): rows of rectangles
 * whose aspect ratios stay close to 1. Returns one rect per value, in input order.
 */
export function squarify(values: number[], r: Rect): Rect[] {
  const out: Rect[] = values.map(() => ({ left: r.left, top: r.top, width: 0, height: 0 }));
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (!total || r.width <= 0 || r.height <= 0) return out;
  const order = values.map((_, i) => i).filter(i => values[i] > 0).sort((a, b) => values[b] - values[a]);
  const scale = (r.width * r.height) / total;
  let { left: x, top: y, width: w, height: h } = r;

  const worst = (row: number[], len: number) => {
    let s = 0;
    let mx = 0;
    let mn = Infinity;
    for (const i of row) {
      const a = values[i] * scale;
      s += a;
      mx = Math.max(mx, a);
      mn = Math.min(mn, a);
    }
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const place = (row: number[]) => {
    const s = row.reduce((a, i) => a + values[i] * scale, 0);
    if (w >= h) {
      const cw = h ? s / h : 0;
      let yy = y;
      for (const i of row) {
        const hh = cw ? (values[i] * scale) / cw : 0;
        out[i] = { left: x, top: yy, width: cw, height: hh };
        yy += hh;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = w ? s / w : 0;
      let xx = x;
      for (const i of row) {
        const ww = rh ? (values[i] * scale) / rh : 0;
        out[i] = { left: xx, top: y, width: ww, height: rh };
        xx += ww;
      }
      y += rh;
      h -= rh;
    }
  };

  let row: number[] = [];
  for (let k = 0; k < order.length; ) {
    const len = Math.min(w, h);
    const next = [...row, order[k]];
    if (!row.length || worst(next, len) <= worst(row, len)) {
      row = next;
      k++;
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}

interface Node {
  id: string;
  point: Point;
  parent?: string;
  children: Node[];
  value: number;
  color: string;
}

const inset = (r: Rect, d: number): Rect => ({ left: r.left + d, top: r.top + d, width: Math.max(0, r.width - 2 * d), height: Math.max(0, r.height - 2 * d) });
const inside = (r: Rect, x: number, y: number) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

/**
 * Treemap: points form a hierarchy through `id` / `parent`. Two levels are shown at a time
 * (groups and their children); clicking a group zooms into it, "Back" zooms out.
 */
export const treemap: StandaloneSeriesType = {
  type: 'treemap',
  kind: 'standalone',
  legend: 'none',
  render(ctx) {
    const { scene, group, series, locale, measure, state } = ctx;
    const o = series.options;
    const fmt = (v: number) => formatValue(v, locale, { notation: v >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 1 }) + (o.suffix ?? '');

    // Build the tree.
    const nodes = new Map<string, Node>();
    for (const p of series.points) {
      const id = p.id ?? p.label;
      nodes.set(id, { id, point: p, parent: p.parent, children: [], value: 0, color: p.color });
    }
    const roots: Node[] = [];
    for (const n of nodes.values()) {
      const parent = n.parent ? nodes.get(n.parent) : undefined;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    const sum = (n: Node): number => {
      const own = n.point.visible ? Math.max(0, n.point.y ?? 0) : 0;
      n.value = n.children.length ? n.children.reduce((a, c) => a + sum(c), 0) || own : own;
      return n.value;
    };
    roots.forEach(sum);
    // Colours: top-level nodes keep their colour, descendants get tints of it.
    const ownColor = (p: Point) => {
      const d = series.options.data[p.index];
      return !!d && typeof d === 'object' && !Array.isArray(d) && !!d.color;
    };
    const tint = (n: Node) => {
      n.children.sort((a, b) => b.value - a.value).forEach((c, i, all) => {
        if (!ownColor(c.point)) c.color = mix(n.color, '#ffffff', 0.12 + (0.38 * i) / Math.max(1, all.length));
        tint(c);
      });
    };
    roots.forEach((r, i) => {
      if (!ownColor(r.point)) r.color = ctx.palette[i % ctx.palette.length];
      tint(r);
    });

    // Current zoom root.
    const stateKey = 'treemap:' + series.id;
    const rootId = state.get(stateKey) as string | undefined;
    const current = rootId ? nodes.get(rootId) : undefined;
    const level1 = (current ? current.children : roots).filter(n => n.value > 0);
    const total = level1.reduce((a, n) => a + n.value, 0);

    // Breadcrumb when zoomed.
    let area = ctx.rect;
    if (current) {
      const trail: string[] = [];
      for (let n: Node | undefined = current; n; n = n.parent ? nodes.get(n.parent) : undefined) trail.unshift(n.point.label);
      scene.el(group, 'crumb', 'text', { x: area.left + 2, y: area.top + 12, class: 'strata-gauge-label' }, { text: ['Tout', ...trail].join(' › ') });
      area = { ...area, top: area.top + 22, height: area.height - 22 };
    }

    const items: StandaloneItem[] = [];
    const zoomInto = (n: Node) => () => {
      const prev = state.get(stateKey);
      state.set(stateKey, n.id);
      return () => (prev === undefined ? state.delete(stateKey) : state.set(stateKey, prev));
    };
    const cell = (n: Node, r: Rect, depth: number, groupEl?: SVGElement) => {
      const light = prefersLightText(n.color);
      const ink = light ? '#ffffff' : '#0f172a';
      const el = scene.el(group, 'c-' + n.id, 'rect', {
        x: r.left, y: r.top, width: r.width, height: r.height, rx: depth === 1 ? 6 : 4, fill: n.color,
        class: depth === 1 && n.children.length ? 'strata-tm-cell strata-cell-group strata-item' : 'strata-tm-cell strata-item',
        opacity: 1,
      }, { enter: { opacity: 0 } });
      const pct = total ? (n.value / total) * 100 : 0;
      const parentNode = n.parent ? nodes.get(n.parent) : undefined;
      items.push({
        key: `${series.id}:${n.point.index}`,
        point: n.point,
        el,
        contains: (x, y) => inside(r, x, y),
        anchor: [r.left + r.width / 2, r.top + Math.min(r.height / 2, 30)],
        header: parentNode && depth > 1 ? `${parentNode.point.label} › ${n.point.label}` : n.point.label,
        rows: [
          { series: 'Valeur', color: n.color, value: n.value, text: fmt(n.value) },
          { series: depth > 1 && parentNode ? `Part de ${parentNode.point.label}` : 'Part du total', color: 'transparent', value: null,
            text: formatValue(depth > 1 && parentNode ? (n.value / parentNode.value) * 100 : pct, locale, { maximumFractionDigits: 1 }) + ' %' },
        ],
        activate: n.children.length ? zoomInto(n) : depth > 1 && parentNode?.children.length && parentNode !== current ? zoomInto(parentNode) : undefined,
        linked: groupEl ? [groupEl] : undefined,
      });
      return { el, ink };
    };

    const rects = squarify(level1.map(n => n.value), area);
    level1.forEach((n, i) => {
      const r = inset(rects[i], 1);
      const { el: gEl, ink } = cell(n, r, 1);
      const hasKids = n.children.some(c => c.value > 0);
      const header = hasKids && r.height > 44 && r.width > 60;
      if (hasKids) {
        const body = header ? { left: r.left + 3, top: r.top + 20, width: r.width - 6, height: r.height - 23 } : inset(r, 3);
        const kids = n.children.filter(c => c.value > 0);
        const kr = squarify(kids.map(c => c.value), body);
        kids.forEach((c, k) => {
          const cr = inset(kr[k], 1);
          const { ink: cInk } = cell(c, cr, 2, gEl);
          label(c, cr, cInk, false);
        });
        if (header) {
          const name = n.point.label.toUpperCase();
          const text = measure(name, 11) + 8 < r.width ? name : '';
          scene.el(group, 'h-' + n.id, 'text', { x: r.left + 7, y: r.top + 14, fill: ink, class: 'strata-tm-header', opacity: 1 }, { enter: { opacity: 0 }, text });
        }
      } else label(n, r, ink, true);
    });

    function label(n: Node, r: Rect, ink: string, big: boolean): void {
      if (!ctx.dataLabels) return;
      const name = n.point.label;
      const fits = measure(name, 12) + 12 < r.width && r.height > 22;
      scene.el(group, 'l-' + n.id, 'text', { x: r.left + 6, y: r.top + 17, fill: ink, class: 'strata-tm-label', opacity: fits ? 1 : 0 }, { enter: { opacity: 0 }, text: name });
      const value = fmt(n.value);
      const vfits = fits && r.height > (big ? 40 : 38) && measure(value, 11) + 12 < r.width;
      scene.el(group, 'v-' + n.id, 'text', { x: r.left + 6, y: r.top + 32, fill: ink, class: 'strata-tm-value', opacity: vfits ? 1 : 0 }, { enter: { opacity: 0 }, text: value });
    }

    return { series, items };
  },
};
