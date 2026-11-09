import { tickNumberFormatter } from '../core/format';
import { linearTicks, niceStep, type Scale } from './scale';

export class LinearScale implements Scale {
  readonly kind = 'linear' as const;
  readonly bandwidth = 0;
  private lastCount = 6;

  constructor(
    readonly domain: [number, number],
    readonly range: [number, number],
    private numberFormat?: Intl.NumberFormatOptions,
  ) {}

  map(v: number): number {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    return d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  }

  invert(px: number): number {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    return r1 === r0 ? d0 : d0 + ((px - r0) / (r1 - r0)) * (d1 - d0);
  }

  ticks(count: number): number[] {
    this.lastCount = count;
    return linearTicks(this.domain[0], this.domain[1], count);
  }

  tickFormat(locale: string | undefined): (v: number) => string {
    const maxAbs = Math.max(Math.abs(this.domain[0]), Math.abs(this.domain[1]));
    // The step depends on the tick count, known only once ticks() ran: resolve it lazily.
    return v => tickNumberFormatter(locale, niceStep(this.domain[1] - this.domain[0], this.lastCount), maxAbs, this.numberFormat)(v);
  }
}

export class LogScale implements Scale {
  readonly kind = 'log' as const;
  readonly bandwidth = 0;
  readonly domain: [number, number];

  constructor(
    domain: [number, number],
    readonly range: [number, number],
    private numberFormat?: Intl.NumberFormatOptions,
  ) {
    const lo = domain[0] > 0 ? domain[0] : 1;
    const hi = domain[1] > lo ? domain[1] : lo * 10;
    this.domain = [lo, hi];
  }

  /** Expand to whole decades. */
  static nice(min: number, max: number): [number, number] {
    const lo = Math.pow(10, Math.floor(Math.log10(min > 0 ? min : 1)));
    const hi = Math.pow(10, Math.ceil(Math.log10(max > lo ? max : lo * 10)));
    return [lo, hi === lo ? lo * 10 : hi];
  }

  map(v: number): number {
    const l0 = Math.log10(this.domain[0]);
    const l1 = Math.log10(this.domain[1]);
    const lv = Math.log10(v > 0 ? v : this.domain[0]);
    return this.range[0] + ((lv - l0) / (l1 - l0)) * (this.range[1] - this.range[0]);
  }

  invert(px: number): number {
    const l0 = Math.log10(this.domain[0]);
    const l1 = Math.log10(this.domain[1]);
    return Math.pow(10, l0 + ((px - this.range[0]) / (this.range[1] - this.range[0])) * (l1 - l0));
  }

  ticks(count: number): number[] {
    const e0 = Math.floor(Math.log10(this.domain[0]));
    const e1 = Math.ceil(Math.log10(this.domain[1]));
    const decades = e1 - e0;
    const mults = decades * 3 <= count ? [1, 2, 5] : [1];
    const every = Math.max(1, Math.ceil(decades / count));
    const out: number[] = [];
    for (let e = e0; e <= e1; e += every) {
      for (const m of mults) {
        const v = +(m * Math.pow(10, e)).toPrecision(12);
        if (v >= this.domain[0] * (1 - 1e-9) && v <= this.domain[1] * (1 + 1e-9)) out.push(v);
      }
    }
    return out;
  }

  tickFormat(locale: string | undefined): (v: number) => string {
    return tickNumberFormatter(locale, Math.min(1, this.domain[0]), this.domain[1], this.numberFormat ?? { notation: 'compact', maximumFractionDigits: 3 });
  }
}
