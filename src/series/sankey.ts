import type { Rect, StandaloneItem, StandaloneSeriesType } from '../core/registry';
import type { Point } from '../core/model';
import { formatValue } from '../core/format';

export interface SankeyNode {
  id: string;
  name: string;
  color: string;
  col: number;
  value: number;
  inValue: number;
  outValue: number;
  x: number;
  y: number;
  h: number;
  ins: SankeyLink[];
  outs: SankeyLink[];
}

export interface SankeyLink {
  source: SankeyNode;
  target: SankeyNode;
  value: number;
  point: Point;
  sy: number;
  ty: number;
  w: number;
}

const NODE_W = 12;
const GAP = 12;

/**
 * Column layout: depth from sources (sinks pushed to the last column), heights proportional
 * to flow, then a few relaxation passes pulling each node towards its neighbours' centres.
 */
export function layoutSankey(
  points: Point[],
  rect: Rect,
  colorOf: (id: string, i: number) => string,
  nameOf: (id: string) => string,
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const byId = new Map<string, SankeyNode>();
  const node = (id: string) => {
    let n = byId.get(id);
    if (!n) {
      n = { id, name: nameOf(id), color: colorOf(id, byId.size), col: 0, value: 0, inValue: 0, outValue: 0, x: 0, y: 0, h: 0, ins: [], outs: [] };
      byId.set(id, n);
    }
    return n;
  };
  const links: SankeyLink[] = [];
  for (const p of points) {
    if (!p.from || !p.to || !p.visible || !(p.y && p.y > 0) || p.from === p.to) continue;
    const l: SankeyLink = { source: node(p.from), target: node(p.to), value: p.y, point: p, sy: 0, ty: 0, w: 0 };
    l.source.outs.push(l);
    l.target.ins.push(l);
    links.push(l);
  }
  const nodes = [...byId.values()];
  if (!nodes.length) return { nodes, links };

  // Depth (bounded relaxation also guards against cycles).
  for (let k = 0; k < nodes.length; k++) {
    let changed = false;
    for (const l of links) {
      if (l.target.col < l.source.col + 1) {
        l.target.col = l.source.col + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const maxCol = Math.max(...nodes.map(n => n.col));
  for (const n of nodes) if (!n.outs.length) n.col = maxCol;
  for (const n of nodes) {
    n.inValue = n.ins.reduce((a, l) => a + l.value, 0);
    n.outValue = n.outs.reduce((a, l) => a + l.value, 0);
    n.value = Math.max(n.inValue, n.outValue);
  }

  const cols: SankeyNode[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const n of nodes) cols[n.col].push(n);
  const top = rect.top;
  const bottom = rect.top + rect.height;
  const k = Math.min(...cols.filter(c => c.length).map(c => (rect.height - (c.length - 1) * GAP) / Math.max(1e-9, c.reduce((a, n) => a + n.value, 0))));
  const span = rect.width - NODE_W;
  cols.forEach((c, ci) => {
    let y = top;
    const used = c.reduce((a, n) => a + n.value * k, 0) + (c.length - 1) * GAP;
    y += (rect.height - used) / 2;
    for (const n of c) {
      n.x = rect.left + (maxCol ? (ci / maxCol) * span : span / 2);
      n.h = Math.max(2, n.value * k);
      n.y = y;
      y += n.h + GAP;
    }
  });

  const resolve = (c: SankeyNode[]) => {
    c.sort((a, b) => a.y - b.y);
    let y = top;
    for (const n of c) {
      n.y = Math.max(n.y, y);
      y = n.y + n.h + GAP;
    }
    let limit = bottom;
    for (let i = c.length - 1; i >= 0; i--) {
      const n = c[i];
      n.y = Math.min(n.y, limit - n.h);
      limit = n.y - GAP;
    }
    for (const n of c) n.y = Math.max(top, n.y);
  };
  const centre = (n: SankeyNode) => n.y + n.h / 2;
  for (let it = 0, alpha = 1; it < 8; it++, alpha *= 0.85) {
    for (const c of cols.slice(1)) {
      for (const n of c) {
        if (!n.ins.length) continue;
        const w = n.ins.reduce((a, l) => a + l.value, 0);
        const target = n.ins.reduce((a, l) => a + centre(l.source) * l.value, 0) / w;
        n.y += (target - centre(n)) * alpha;
      }
      resolve(c);
    }
    for (const c of cols.slice(0, -1).reverse()) {
      for (const n of c) {
        if (!n.outs.length) continue;
        const w = n.outs.reduce((a, l) => a + l.value, 0);
        const target = n.outs.reduce((a, l) => a + centre(l.target) * l.value, 0) / w;
        n.y += (target - centre(n)) * alpha;
      }
      resolve(c);
    }
  }

  // Ribbon offsets at both ends, ordered by the other end's position (fewer crossings).
  for (const n of nodes) {
    let off = 0;
    for (const l of n.outs.sort((a, b) => a.target.y - b.target.y)) {
      l.w = l.value * k;
      l.sy = off;
      off += l.w;
    }
    off = 0;
    for (const l of n.ins.sort((a, b) => a.source.y - b.source.y)) {
      l.ty = off;
      off += l.value * k;
    }
  }
  return { nodes, links };
}

const f = (v: number) => Math.round(v * 100) / 100;

function ribbon(l: SankeyLink): { d: string; x0: number; x1: number; y0: number; y1: number; xm: number } {
  const x0 = l.source.x + NODE_W;
  const x1 = l.target.x;
  const y0 = l.source.y + l.sy;
  const y1 = l.target.y + l.ty;
  const xm = (x0 + x1) / 2;
  const w = Math.max(1, l.w);
  return {
    d: `M${f(x0)},${f(y0)}C${f(xm)},${f(y0)} ${f(xm)},${f(y1)} ${f(x1)},${f(y1)}L${f(x1)},${f(y1 + w)}C${f(xm)},${f(y1 + w)} ${f(xm)},${f(y0 + w)} ${f(x0)},${f(y0 + w)}Z`,
    x0, x1, y0, y1, xm,
  };
}

export const sankey: StandaloneSeriesType = {
  type: 'sankey',
  kind: 'standalone',
  legend: 'none',
  render(ctx) {
    const { scene, group, series, locale, measure, rect } = ctx;
    const o = series.options;
    const fmt = (v: number) => formatValue(v, locale, { notation: v >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 1 }) + (o.suffix ?? '');
    const overrides = new Map((o.nodes ?? []).map(n => [n.id, n]));

    // Leave room for the labels of the first and last columns.
    const ids = new Set(series.points.flatMap(p => [p.from, p.to]).filter((v): v is string => !!v));
    const widest = Math.max(0, ...[...ids].map(id => measure(overrides.get(id)?.name ?? id, 12))) + 50;
    const pad = ctx.dataLabels ? Math.min(widest, rect.width * 0.22) : 4;
    const area: Rect = { left: rect.left + 4, top: rect.top + 6, width: rect.width - 8 - pad, height: rect.height - 12 };
    const { nodes, links } = layoutSankey(
      series.points,
      area,
      (id, i) => overrides.get(id)?.color ?? ctx.palette[i % ctx.palette.length],
      id => overrides.get(id)?.name ?? id,
    );
    const items: StandaloneItem[] = [];
    const linkEls = new Map<SankeyLink, SVGElement>();

    links.forEach(l => {
      const r = ribbon(l);
      const gid = `${ctx.uid}-sk-${series.id}-${l.source.id}-${l.target.id}`.replace(/[^\w-]/g, '_');
      const grad = scene.el(ctx.defs, gid, 'linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: r.x0, x2: r.x1, y1: 0, y2: 0 });
      scene.el(grad, 'a', 'stop', { offset: 0, 'stop-color': l.source.color });
      scene.el(grad, 'b', 'stop', { offset: 1, 'stop-color': l.target.color });
      const el = scene.el(group, `link-${l.source.id}>${l.target.id}`, 'path', {
        d: r.d, fill: `url(#${gid})`, class: 'strata-sk-link strata-item', opacity: 1,
      }, { enter: { opacity: 0 } });
      linkEls.set(l, el);
      const w = Math.max(1, l.w);
      items.push({
        key: `${series.id}:${l.point.index}`,
        point: l.point,
        el,
        contains(x, y) {
          if (x < r.x0 || x > r.x1) return false;
          // Bezier x(t) is monotonic: bisect for t, then test the ribbon's thickness there.
          let lo = 0;
          let hi = 1;
          for (let i = 0; i < 18; i++) {
            const t = (lo + hi) / 2;
            const u = 1 - t;
            const xt = u * u * u * r.x0 + 3 * u * u * t * r.xm + 3 * u * t * t * r.xm + t * t * t * r.x1;
            if (xt < x) lo = t;
            else hi = t;
          }
          const t = (lo + hi) / 2;
          const u = 1 - t;
          const yt = (u * u * u + 3 * u * u * t) * r.y0 + (3 * u * t * t + t * t * t) * r.y1;
          return y >= yt - 2 && y <= yt + w + 2;
        },
        anchor: [r.xm, (r.y0 + r.y1) / 2 + w / 2],
        header: `${l.source.name} → ${l.target.name}`,
        rows: [
          { series: 'Flux', color: l.source.color, value: l.value, text: fmt(l.value) },
          { series: `Part de ${l.source.name}`, color: 'transparent', value: null, text: formatValue((l.value / (l.source.outValue || 1)) * 100, locale, { maximumFractionDigits: 1 }) + ' %' },
        ],
      });
    });

    for (const n of nodes) {
      const el = scene.el(group, 'node-' + n.id, 'rect', {
        x: n.x, y: n.y, width: NODE_W, height: n.h, rx: 3, fill: n.color, class: 'strata-sk-node strata-item',
      }, { enter: { y: n.y + n.h / 2, height: 0 } });
      items.push({
        key: `${series.id}:node:${n.id}`,
        point: { ...(n.ins[0] ?? n.outs[0]).point, label: n.name, color: n.color },
        el,
        contains: (x, y) => x >= n.x - 4 && x <= n.x + NODE_W + 4 && y >= n.y && y <= n.y + n.h,
        anchor: [n.x + NODE_W, n.y + n.h / 2],
        header: n.name,
        rows: [
          ...(n.inValue ? [{ series: 'Entrées', color: n.color, value: n.inValue, text: fmt(n.inValue) }] : []),
          ...(n.outValue ? [{ series: 'Sorties', color: n.color, value: n.outValue, text: fmt(n.outValue) }] : []),
        ],
        linked: [...n.ins, ...n.outs].map(l => linkEls.get(l)!).filter(Boolean),
      });
      if (ctx.dataLabels) {
        const label = scene.el(group, 'label-' + n.id, 'text', {
          x: n.x + NODE_W + 6, y: n.y + n.h / 2, dy: '0.35em', 'text-anchor': 'start', class: 'strata-sk-label', opacity: 1,
        }, { enter: { opacity: 0 } });
        const key = n.name + '|' + n.value;
        if (label.getAttribute('data-text') !== key) {
          label.setAttribute('data-text', key);
          label.textContent = n.name + ' ';
          const t = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          t.setAttribute('class', 'strata-sk-value');
          t.textContent = fmt(n.value);
          label.append(t);
        }
      }
    }
    return { series, items };
  },
};
