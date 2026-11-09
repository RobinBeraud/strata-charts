/** Scales are small pure objects: data value <-> pixel. */

export type ScaleKind = 'linear' | 'log' | 'time' | 'band';

export interface Scale {
  readonly kind: ScaleKind;
  readonly domain: [number, number];
  readonly range: [number, number];
  /** Pixel size of one category band (0 for continuous scales). */
  readonly bandwidth: number;
  map(v: number): number;
  invert(px: number): number;
  ticks(count: number): number[];
  /** Tick label for a value produced by `ticks`. */
  tickFormat(locale: string | undefined): (v: number) => string;
}

/** A "nice" step (1, 2, 2.5, 5 × 10^n) that splits `span` into about `count` parts. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const f = n < 1.5 ? 1 : n < 2.25 ? 2 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10;
  return f * mag;
}

const clean = (v: number) => +v.toPrecision(12);

/** Extend [min, max] outwards to multiples of a nice step. */
export function niceDomain(min: number, max: number, count: number): { domain: [number, number]; step: number } {
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  let step = niceStep(max - min, count);
  // A second pass: rounding can change the span enough to pick another step.
  for (let i = 0; i < 2; i++) {
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const next = niceStep(hi - lo, count);
    if (next === step) break;
    step = next;
  }
  return { domain: [clean(Math.floor(min / step) * step), clean(Math.ceil(max / step) * step)], step };
}

export function linearTicks(min: number, max: number, count: number): number[] {
  const step = niceStep(max - min, count);
  const out: number[] = [];
  const start = Math.ceil(min / step - 1e-9);
  const end = Math.floor(max / step + 1e-9);
  for (let i = start; i <= end && out.length < 500; i++) out.push(clean(i * step));
  return out;
}
