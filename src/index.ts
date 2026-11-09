import { Chart, type ChartConfig } from './core/chart';
import type { SeriesType } from './core/registry';
import type { ChartOptions } from './core/types';
import { area, areaspline, line, spline } from './series/line';
import { column } from './series/column';
import { bubble, scatter } from './series/scatter';
import { pie } from './series/pie';
import { candlestick, ohlc } from './series/financial';
import { waterfall } from './series/waterfall';
import { heatmap } from './series/heatmap';
import { gauge } from './series/gauge';
import { treemap, squarify } from './series/treemap';
import { sankey, layoutSankey } from './series/sankey';

export { Chart };
export type { ChartConfig, ChartEventMap } from './core/chart';
export type * from './core/types';
export type { Point, NSeries } from './core/model';
export type { SeriesType, CartesianSeriesType, StandaloneSeriesType, CartesianContext, StandaloneContext, StandaloneItem, HitPoint } from './core/registry';

export { line, spline, area, areaspline, column, scatter, bubble, candlestick, ohlc, waterfall, heatmap, gauge, treemap, sankey, pie };
export { squarify, layoutSankey };
export { DEFAULT_PALETTE } from './core/model';
export { lttb } from './data/lttb';
export { niceDomain, niceStep } from './scales/scale';
export { DEFAULT_RANGES } from './core/chart';
export { ramp, mix } from './core/color';

/** All built-in series types. */
export const builtinTypes: SeriesType[] = [line, spline, area, areaspline, column, scatter, bubble, candlestick, ohlc, waterfall, heatmap, gauge, treemap, sankey, pie];

/** Create a chart with every built-in series type available. */
export function createChart(
  target: HTMLElement | string,
  options: ChartOptions,
  config: Partial<ChartConfig> = {},
): Chart {
  return new Chart(target, options, { types: [...builtinTypes, ...(config.types ?? [])] });
}
