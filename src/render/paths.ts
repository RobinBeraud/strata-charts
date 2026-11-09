/** Path builders. Each produces a constant command structure for a given point count, so updates morph. */

type XY = [number, number];
const f = (v: number) => Math.round(v * 100) / 100;

export function linearPath(pts: XY[], move = true): string {
  if (!pts.length) return '';
  let d = (move ? 'M' : 'L') + f(pts[0][0]) + ',' + f(pts[0][1]);
  for (let i = 1; i < pts.length; i++) d += 'L' + f(pts[i][0]) + ',' + f(pts[i][1]);
  return d;
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson): smooth, never overshoots
 * the data, so a smoothed line never shows peaks that do not exist.
 * `vertical` = the independent variable runs along y (inverted charts).
 */
export function monotonePath(pts: XY[], vertical = false, move = true): string {
  const n = pts.length;
  if (n < 3) return linearPath(pts, move);
  const u = pts.map(p => (vertical ? p[1] : p[0]));
  const v = pts.map(p => (vertical ? p[0] : p[1]));
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = u[i + 1] - u[i];
    m[i] = dx[i] === 0 ? 0 : (v[i + 1] - v[i]) / dx[i];
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  t[n - 1] = m[n - 2];
  const P = (a: number, b: number) => (vertical ? f(b) + ',' + f(a) : f(a) + ',' + f(b));
  let d = (move ? 'M' : 'L') + P(u[0], v[0]);
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += 'C' + P(u[i] + h, v[i] + t[i] * h) + ' ' + P(u[i + 1] - h, v[i + 1] - t[i + 1] * h) + ' ' + P(u[i + 1], v[i + 1]);
  }
  return d;
}

/**
 * A bar from value pixel b0 (base) to b1 (end) spanning [a, a+w] along the category axis,
 * with rounded corners on the end side.
 */
export function barPath(a: number, w: number, b0: number, b1: number, inverted: boolean, radius: number): string {
  const dir = Math.sign(b1 - b0) || -1;
  const len = Math.abs(b1 - b0);
  const r = Math.max(0, Math.min(radius, w / 2, len));
  const P = (u: number, v: number) => (inverted ? f(v) + ',' + f(u) : f(u) + ',' + f(v));
  return (
    'M' + P(a, b0) +
    'L' + P(a, b1 - dir * r) +
    'Q' + P(a, b1) + ' ' + P(a + r, b1) +
    'L' + P(a + w - r, b1) +
    'Q' + P(a + w, b1) + ' ' + P(a + w, b1 - dir * r) +
    'L' + P(a + w, b0) + 'Z'
  );
}

/** Ring sector between angles a0..a1 (radians, 0 = 3 o'clock, clockwise). */
export function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  let sweep = a1 - a0;
  if (sweep <= 0.0001) return `M${f(cx)},${f(cy)}Z`;
  if (sweep >= Math.PI * 2 - 1e-4) {
    sweep = Math.PI * 2 - 1e-4;
    a1 = a0 + sweep;
  }
  const large = sweep > Math.PI ? 1 : 0;
  const x0 = cx + r1 * Math.cos(a0);
  const y0 = cy + r1 * Math.sin(a0);
  const x1 = cx + r1 * Math.cos(a1);
  const y1 = cy + r1 * Math.sin(a1);
  if (r0 <= 0.5) {
    return `M${f(cx)},${f(cy)}L${f(x0)},${f(y0)}A${f(r1)},${f(r1)} 0 ${large} 1 ${f(x1)},${f(y1)}Z`;
  }
  const x2 = cx + r0 * Math.cos(a1);
  const y2 = cy + r0 * Math.sin(a1);
  const x3 = cx + r0 * Math.cos(a0);
  const y3 = cy + r0 * Math.sin(a0);
  return `M${f(x0)},${f(y0)}A${f(r1)},${f(r1)} 0 ${large} 1 ${f(x1)},${f(y1)}L${f(x2)},${f(y2)}A${f(r0)},${f(r0)} 0 ${large} 0 ${f(x3)},${f(y3)}Z`;
}
