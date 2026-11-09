/** Formatting on top of Intl, with formatter caching. */

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

export function numberFormat(locale: string | undefined, opts: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = 'n|' + (locale ?? '') + '|' + JSON.stringify(opts);
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

export function dateFormat(locale: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = 'd|' + (locale ?? '') + '|' + JSON.stringify(opts);
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

/** Number of decimals needed to show values on a grid of `step`. */
export function decimalsFor(step: number): number {
  if (!isFinite(step) || step <= 0) return 0;
  const s = String(+step.toPrecision(12));
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

export function tickNumberFormatter(
  locale: string | undefined,
  step: number,
  maxAbs: number,
  opts?: Intl.NumberFormatOptions,
): (v: number) => string {
  if (opts) {
    const f = numberFormat(locale, opts);
    return v => f.format(v);
  }
  if (maxAbs >= 1e5) {
    const f = numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
    return v => f.format(v);
  }
  const f = numberFormat(locale, { maximumFractionDigits: Math.min(decimalsFor(step), 10) });
  return v => f.format(v === 0 ? 0 : v); // avoid "-0"
}

export function formatValue(v: number | null, locale: string | undefined, opts?: Intl.NumberFormatOptions): string {
  if (v === null || !isFinite(v)) return '–';
  return numberFormat(locale, opts ?? { maximumFractionDigits: 2 }).format(v);
}
