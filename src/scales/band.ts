import type { Scale } from './scale';

/** Categories as evenly sized bands. `offset` is the first visible category index (zoom). */
export class BandScale implements Scale {
  readonly kind = 'band' as const;
  readonly domain: [number, number];

  constructor(
    readonly offset: number,
    readonly count: number,
    readonly range: [number, number],
    readonly labels: string[],
    readonly padding = 0.22,
  ) {
    this.domain = [offset - 0.5, offset + count - 0.5];
  }

  get step(): number {
    return (this.range[1] - this.range[0]) / Math.max(1, this.count);
  }

  get bandwidth(): number {
    return Math.abs(this.step) * (1 - this.padding);
  }

  map(i: number): number {
    return this.range[0] + (i - this.offset + 0.5) * this.step;
  }

  invert(px: number): number {
    const i = this.offset + Math.floor((px - this.range[0]) / this.step);
    return Math.max(this.offset, Math.min(this.offset + this.count - 1, i));
  }

  ticks(): number[] {
    return Array.from({ length: this.count }, (_, i) => this.offset + i);
  }

  tickFormat(): (v: number) => string {
    return v => this.labels[v] ?? String(v);
  }
}
