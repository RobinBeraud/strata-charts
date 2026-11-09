/**
 * Minimal entry: the chart engine without any series type.
 * Import only the series you use and pass them in `types` — everything else is tree-shaken.
 *
 *   import { Chart } from 'strata-charts/core';
 *   import { line } from 'strata-charts';
 *   new Chart(el, options, { types: [line] });
 */
export { Chart } from './core/chart';
export type { ChartConfig, ChartEventMap } from './core/chart';
export type * from './core/types';
export type { Point, NSeries } from './core/model';
export type { SeriesType, CartesianSeriesType, StandaloneSeriesType, CartesianContext, StandaloneContext, StandaloneItem, HitPoint } from './core/registry';
