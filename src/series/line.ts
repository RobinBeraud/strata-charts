import type { CartesianContext, CartesianSeriesType, HitPoint } from '../core/registry';
import type { Point } from '../core/model';
import { lttb } from '../data/lttb';
import { linearPath, monotonePath } from '../render/paths';

type XY = [number, number];

interface LineStyle {
  area: boolean;
  smooth: boolean;
}

function renderLine(ctx: CartesianContext, style: LineStyle): HitPoint[] {
  const { scene, group, series, inverted, plot } = ctx;
  const color = series.color;
  const hits: HitPoint[] = [];

  // Split into segments at null values (gaps).
  const segments: Point[][] = [];
  let cur: Point[] = [];
  for (const p of ctx.points) {
    if (p.y === null || !p.visible) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length) segments.push(cur);

  const alongLen = inverted ? plot.height : plot.width;
  const total = segments.reduce((n, s) => n + s.length, 0);
  let decimated = false;

  // Stacked areas never overlap: a flat translucent fill reads best. Overlapping areas get a fading gradient.
  const stacked = !!ctx.stacking;
  let gradientId = '';
  if (style.area && !stacked) {
    gradientId = `${ctx.uid}-grad-${series.id}`;
    const grad = scene.el(ctx.defs, gradientId, 'linearGradient', {
      id: gradientId,
      x1: 0, y1: 0,
      x2: inverted ? 1 : 0, y2: inverted ? 0 : 1,
    });
    const flip = inverted;
    scene.el(grad, 'a', 'stop', { offset: 0, 'stop-color': color, 'stop-opacity': flip ? 0.04 : 0.32 });
    scene.el(grad, 'b', 'stop', { offset: 1, 'stop-color': color, 'stop-opacity': flip ? 0.32 : 0.03 });
  }

  segments.forEach((seg, si) => {
    let pts = seg.map(p => {
      const [px, py] = ctx.pos(p.x, p.y1);
      const [bx, by] = ctx.pos(p.x, ctx.base(p));
      return { p, px, py, bx, by };
    });
    if (pts.length > alongLen * 1.5) {
      decimated = true;
      const share = Math.max(3, Math.round((alongLen * 1.2 * pts.length) / total));
      pts = lttb(pts, share, d => (inverted ? d.py : d.px), d => (inverted ? d.px : d.py));
    }
    const top: XY[] = pts.map(d => [d.px, d.py]);
    const bottom: XY[] = pts.map(d => [d.bx, d.by]);
    const build = (a: XY[], move = true) => (style.smooth ? monotonePath(a, inverted, move) : linearPath(a, move));
    const d = build(top);
    const flat = build(bottom);

    if (style.area) {
      const rev = bottom.slice().reverse();
      scene.el(group, `area-${si}`, 'path', {
        d: d + build(rev, false) + 'Z',
        fill: stacked ? color : `url(#${gradientId})`,
        'fill-opacity': stacked ? 0.3 : null,
        stroke: 'none',
      }, { enter: { d: flat + build(rev, false) + 'Z' } });
    }

    scene.el(group, `line-${si}`, 'path', {
      d,
      fill: 'none',
      stroke: color,
      'stroke-width': 2.25,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'stroke-dasharray': series.options.dash ? '6 5' : null,
      class: 'strata-line',
    }, { enter: { d: flat } });

    for (const q of pts) hits.push({ px: q.px, py: q.py, along: inverted ? q.py : q.px, point: q.p });
  });

  const showMarkers = series.options.markers ?? (!decimated && total <= Math.max(12, alongLen / 18));
  if (showMarkers) {
    for (const h of hits) {
      const [bx, by] = ctx.pos(h.point.x, ctx.base(h.point));
      scene.el(group, `m-${h.point.index}`, 'circle', {
        cx: h.px, cy: h.py, r: 3.25, fill: h.point.color, class: 'strata-marker',
      }, { enter: { cx: bx, cy: by, r: 0 } });
    }
  }
  return hits;
}

const make = (type: string, style: LineStyle, stackFamily?: string): CartesianSeriesType => ({
  type,
  kind: 'cartesian',
  stackFamily,
  zeroBased: style.area,
  render: ctx => renderLine(ctx, style),
});

export const line = make('line', { area: false, smooth: false });
export const spline = make('spline', { area: false, smooth: true });
export const area = make('area', { area: true, smooth: false }, 'area');
export const areaspline = make('areaspline', { area: true, smooth: true }, 'area');
