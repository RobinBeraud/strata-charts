/**
 * Largest-Triangle-Three-Buckets downsampling (Steinarsson, 2013).
 * Keeps the visual shape of a dense line while drawing ~1 point per pixel.
 */
export function lttb<T>(data: T[], threshold: number, x: (d: T) => number, y: (d: T) => number): T[] {
  const n = data.length;
  if (threshold >= n || threshold < 3) return data.slice();
  const out: T[] = [data[0]];
  const every = (n - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    // Average of the next bucket.
    const nextStart = Math.floor((i + 1) * every) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
    let avgX = 0;
    let avgY = 0;
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += x(data[j]);
      avgY += y(data[j]);
    }
    const len = Math.max(1, nextEnd - nextStart);
    avgX /= len;
    avgY /= len;
    // Point of the current bucket forming the largest triangle with `a` and the average.
    const start = Math.floor(i * every) + 1;
    const end = Math.floor((i + 1) * every) + 1;
    const ax = x(data[a]);
    const ay = y(data[a]);
    let maxArea = -1;
    let pick = start;
    for (let j = start; j < end; j++) {
      const area = Math.abs((ax - avgX) * (y(data[j]) - ay) - (ax - x(data[j])) * (avgY - ay));
      if (area > maxArea) {
        maxArea = area;
        pick = j;
      }
    }
    out.push(data[pick]);
    a = pick;
  }
  out.push(data[n - 1]);
  return out;
}
