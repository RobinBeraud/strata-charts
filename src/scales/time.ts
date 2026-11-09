import { dateFormat } from '../core/format';
import { niceStep, type Scale } from './scale';

export type TimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const S = 1000;
const MIN = 60 * S;
const H = 60 * MIN;
const D = 24 * H;

const INTERVALS: [TimeUnit, number, number][] = [
  ['second', 1, S], ['second', 5, 5 * S], ['second', 15, 15 * S], ['second', 30, 30 * S],
  ['minute', 1, MIN], ['minute', 5, 5 * MIN], ['minute', 15, 15 * MIN], ['minute', 30, 30 * MIN],
  ['hour', 1, H], ['hour', 3, 3 * H], ['hour', 6, 6 * H], ['hour', 12, 12 * H],
  ['day', 1, D], ['day', 2, 2 * D], ['week', 1, 7 * D],
  ['month', 1, 30.5 * D], ['month', 3, 91.3 * D], ['month', 6, 182.6 * D],
  ['year', 1, 365 * D],
];

export function pickInterval(span: number, count: number): [TimeUnit, number] {
  const target = span / Math.max(1, count);
  for (const [unit, step, ms] of INTERVALS) if (ms >= target) return [unit, step];
  return ['year', Math.max(1, Math.round(niceStep(span / (365 * D), count)))];
}

export function floorTime(t: number, unit: TimeUnit, step: number): Date {
  const d = new Date(t);
  switch (unit) {
    case 'second': d.setMilliseconds(0); d.setSeconds(Math.floor(d.getSeconds() / step) * step); break;
    case 'minute': d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / step) * step); break;
    case 'hour': d.setMinutes(0, 0, 0); d.setHours(Math.floor(d.getHours() / step) * step); break;
    case 'day': d.setHours(0, 0, 0, 0); break;
    case 'week': d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); break;
    case 'month': d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(Math.floor(d.getMonth() / step) * step); break;
    case 'year': d.setHours(0, 0, 0, 0); d.setMonth(0, 1); d.setFullYear(Math.floor(d.getFullYear() / step) * step); break;
  }
  return d;
}

function addTime(d: Date, unit: TimeUnit, step: number): void {
  switch (unit) {
    case 'second': d.setSeconds(d.getSeconds() + step); break;
    case 'minute': d.setMinutes(d.getMinutes() + step); break;
    case 'hour': d.setHours(d.getHours() + step); break;
    case 'day': d.setDate(d.getDate() + step); break;
    case 'week': d.setDate(d.getDate() + 7 * step); break;
    case 'month': d.setMonth(d.getMonth() + step); break;
    case 'year': d.setFullYear(d.getFullYear() + step); break;
  }
}

export class TimeScale implements Scale {
  readonly kind = 'time' as const;
  readonly bandwidth = 0;
  unit: TimeUnit = 'day';

  constructor(readonly domain: [number, number], readonly range: [number, number]) {}

  map(v: number): number {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    return d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  }

  invert(px: number): number {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    return d0 + ((px - r0) / (r1 - r0)) * (d1 - d0);
  }

  ticks(count: number): number[] {
    const [d0, d1] = this.domain;
    const [unit, step] = pickInterval(d1 - d0, count);
    this.unit = unit;
    const d = floorTime(d0, unit, step);
    const out: number[] = [];
    for (let i = 0; i < 400 && d.getTime() <= d1; i++) {
      if (d.getTime() >= d0) out.push(d.getTime());
      addTime(d, unit, step);
    }
    return out;
  }

  tickFormat(locale: string | undefined): (v: number) => string {
    const unit = this.unit;
    const time = dateFormat(locale, { hour: '2-digit', minute: '2-digit' });
    const sec = dateFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const day = dateFormat(locale, { day: 'numeric', month: 'short' });
    const month = dateFormat(locale, { month: 'short' });
    const year = dateFormat(locale, { year: 'numeric' });
    // Ticks that open a larger unit get the larger label ("Jan" -> "2026").
    return v => {
      const d = new Date(v);
      const midnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
      if (unit === 'year') return year.format(d);
      if (unit === 'month') return d.getMonth() === 0 ? year.format(d) : month.format(d);
      if (unit === 'day' || unit === 'week') return d.getDate() === 1 && d.getMonth() === 0 ? year.format(d) : day.format(d);
      if (midnight) return day.format(d);
      return unit === 'second' ? sec.format(d) : time.format(d);
    };
  }
}

export function formatDateFull(v: number, locale: string | undefined, span: number): string {
  const withTime = span < 3 * D;
  return dateFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(v));
}
