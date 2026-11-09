import { describe, expect, it } from 'vitest';
import { niceDomain, niceStep, linearTicks } from '../src/scales/scale';
import { LinearScale, LogScale } from '../src/scales/linear';
import { BandScale } from '../src/scales/band';
import { TimeScale, pickInterval } from '../src/scales/time';
import { lttb } from '../src/data/lttb';
import { interpolator } from '../src/render/scene';
import { barPath, monotonePath, arcPath } from '../src/render/paths';
import { applyStacking, buildModel } from '../src/core/model';
import { Registry } from '../src/core/registry';
import { builtinTypes } from '../src/index';
import { convertHighcharts } from '../src/compat/highcharts';
import { decimalsFor } from '../src/core/format';

const registry = new Registry(builtinTypes);
const vis = () => ({ series: new Map<string, boolean>(), points: new Map<string, boolean>() });

describe('scales', () => {
  it('picks 1/2/2.5/5 steps', () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(10, 4)).toBe(2.5);
    expect(niceStep(1, 10)).toBe(0.1);
    expect(niceStep(7, 5)).toBe(1);
  });

  it('extends domains to nice bounds', () => {
    expect(niceDomain(3, 97, 5).domain).toEqual([0, 100]);
    expect(niceDomain(-12, 48, 6).domain).toEqual([-20, 50]);
    expect(niceDomain(5, 5, 5).domain[0]).toBeLessThan(5);
  });

  it('produces clean ticks without float noise', () => {
    expect(linearTicks(0, 1, 10)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('maps and inverts linearly', () => {
    const s = new LinearScale([0, 100], [300, 0]);
    expect(s.map(25)).toBe(225);
    expect(s.invert(225)).toBe(25);
  });

  it('log scale ticks on decades', () => {
    const s = new LogScale(LogScale.nice(3, 4000), [0, 100]);
    expect(s.domain).toEqual([1, 10000]);
    expect(s.ticks(6)).toEqual([1, 10, 100, 1000, 10000]);
    expect(s.ticks(3)).toEqual([1, 100, 10000]);
    expect(s.map(100)).toBeCloseTo(50);
  });

  it('band scale centres categories', () => {
    const s = new BandScale(0, 4, [0, 400], ['a', 'b', 'c', 'd']);
    expect(s.map(0)).toBe(50);
    expect(s.map(3)).toBe(350);
    expect(s.invert(260)).toBe(2);
    expect(s.invert(-50)).toBe(0);
    expect(s.bandwidth).toBeCloseTo(78);
  });

  it('time scale picks calendar-aware intervals', () => {
    const day = 86400000;
    expect(pickInterval(30 * day, 6)).toEqual(['week', 1]);
    expect(pickInterval(365 * day, 6)).toEqual(['month', 3]);
    const s = new TimeScale([new Date(2026, 0, 1).getTime(), new Date(2026, 11, 31).getTime()], [0, 600]);
    const ticks = s.ticks(12);
    expect(ticks.length).toBeGreaterThanOrEqual(11);
    expect(new Date(ticks[1]).getDate()).toBe(1);
  });

  it('decimals follow the step', () => {
    expect(decimalsFor(2.5)).toBe(1);
    expect(decimalsFor(0.05)).toBe(2);
    expect(decimalsFor(100)).toBe(0);
  });
});

describe('LTTB', () => {
  it('keeps endpoints and reduces to the threshold', () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({ x: i, y: Math.sin(i / 100) }));
    const out = lttb(data, 500, d => d.x, d => d.y);
    expect(out.length).toBe(500);
    expect(out[0]).toBe(data[0]);
    expect(out[499]).toBe(data[9999]);
  });

  it('preserves spikes', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: i === 500 ? 100 : 0 }));
    const out = lttb(data, 50, d => d.x, d => d.y);
    expect(out.some(d => d.y === 100)).toBe(true);
  });
});

describe('scene interpolation', () => {
  it('interpolates paths with the same structure', () => {
    const f = interpolator('M0,0L10,10', 'M10,20L30,40')!;
    expect(f(0.5)).toBe('M5,10L20,25');
  });

  it('refuses different structures', () => {
    expect(interpolator('M0,0L1,1', 'M0,0L1,1L2,2')).toBeNull();
    expect(interpolator('M0,0', 'L0,0')).toBeNull();
  });

  it('bar paths keep their structure for any height (morphable)', () => {
    const a = barPath(0, 20, 100, 100, false, 4);
    const b = barPath(0, 20, 100, 20, false, 4);
    expect(interpolator(a, b)).not.toBeNull();
  });

  it('monotone curves keep the command count', () => {
    const p1 = monotonePath([[0, 0], [10, 5], [20, 2], [30, 8]]);
    const p2 = monotonePath([[0, 3], [10, 1], [20, 9], [30, 4]]);
    expect(interpolator(p1, p2)).not.toBeNull();
    expect(arcPath(0, 0, 0, 10, 0, Math.PI)).toContain('A10,10');
  });
});

describe('model & stacking', () => {
  it('detects category axes and builds categories in order', () => {
    const m = buildModel({ series: [{ type: 'column', data: [['Q1', 3], ['Q2', 5]] }, { data: [['Q2', 1], ['Q3', 2]] }] }, registry, vis());
    expect(m.xType).toBe('category');
    expect(m.categories).toEqual(['Q1', 'Q2', 'Q3']);
    expect(m.series[1].points[0].x).toBe(1);
  });

  it('turns "bar" into inverted columns', () => {
    const m = buildModel({ type: 'bar', series: [{ data: [1, 2] }] }, registry, vis());
    expect(m.inverted).toBe(true);
    expect(m.series[0].type).toBe('column');
  });

  it('stacks positives and negatives separately', () => {
    const m = buildModel({
      stacking: 'normal',
      series: [
        { type: 'column', data: [5, -2] },
        { type: 'column', data: [3, -4] },
      ],
    }, registry, vis());
    const [a, b] = m.series;
    // First series on top (Highcharts' reversedStacks default).
    expect([b.points[0].y0, b.points[0].y1]).toEqual([0, 3]);
    expect([a.points[0].y0, a.points[0].y1]).toEqual([3, 8]);
    expect([a.points[1].y0, a.points[1].y1]).toEqual([-4, -6]);
  });

  it('percent stacking sums to 100', () => {
    const m = buildModel({
      stacking: 'percent',
      series: [{ type: 'area', data: [1, 3] }, { type: 'area', data: [3, 1] }],
    }, registry, vis());
    expect(m.series[0].points[0].y1).toBeCloseTo(100);
    expect(m.series[0].points[0].percent).toBeCloseTo(25);
  });

  it('hidden series do not stack', () => {
    const v = vis();
    v.series.set('s0', false);
    const m = buildModel({ stacking: 'normal', series: [{ type: 'area', data: [5] }, { type: 'area', data: [3] }] }, registry, v);
    expect(m.series[1].points[0].y0).toBe(0);
  });

  it('lines do not stack (no stack family)', () => {
    const series = buildModel({ series: [{ data: [1] }, { data: [2] }] }, registry, vis()).series;
    applyStacking(series, 'normal', t => registry.get(t)?.stackFamily);
    expect(series[1].points[0].y0).toBe(0);
  });

  it('parses time axes from ISO strings', () => {
    const m = buildModel({ xAxis: { type: 'time' }, series: [{ data: [['2026-01-01', 1], ['2026-02-01', 2]] }] }, registry, vis());
    expect(m.series[0].points[1].x).toBe(Date.parse('2026-02-01'));
  });
});

describe('Highcharts compat', () => {
  it('maps the common options', () => {
    const { options, ignored } = convertHighcharts({
      chart: { type: 'column', zoomType: 'x', height: 300 },
      title: { text: 'Sales' },
      xAxis: { categories: ['A', 'B'], title: { text: 'Region' } },
      yAxis: [{ title: { text: 'Units' }, plotLines: [{ value: 3, label: { text: 'Target' } }] }],
      plotOptions: { column: { stacking: 'percent' } },
      tooltip: { valueSuffix: ' u', valueDecimals: 1 },
      legend: { enabled: false },
      credits: { enabled: false },
      annotations: [],
      series: [{ name: 'X', data: [1, 2] }, { type: 'pie', innerSize: '50%', data: [{ name: 'a', y: 1 }] }],
    });
    expect(options.type).toBe('column');
    expect(options.zoom).toBe(true);
    expect(options.title).toBe('Sales');
    expect(options.xAxis?.categories).toEqual(['A', 'B']);
    expect((options.yAxis as { plotLines?: unknown[] })?.plotLines?.[0]).toMatchObject({ value: 3, label: 'Target' });
    expect(options.stacking).toBe('percent');
    expect(options.legend).toBe(false);
    expect(options.series[1].innerRadius).toBe(0.5);
    expect(options.tooltip).toMatchObject({ suffix: ' u', valueFormat: { maximumFractionDigits: 1 } });
    expect(ignored).toContain('annotations');
  });
});
