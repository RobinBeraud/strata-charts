import { beforeEach, describe, expect, it } from 'vitest';
import { alignedDomain } from '../src/core/cartesian';
import { buildModel } from '../src/core/model';
import { Registry } from '../src/core/registry';
import { ramp, prefersLightText } from '../src/core/color';
import { spreadLabels } from '../src/series/pie';
import { builtinTypes, createChart } from '../src/index';

const registry = new Registry(builtinTypes);
const vis = () => ({ series: new Map<string, boolean>(), points: new Map<string, boolean>() });

beforeEach(() => {
  document.body.innerHTML = '<div id="c" style="width:700px"></div>';
});

describe('model extensions', () => {
  it('waterfall builds running totals and sum bars', () => {
    const m = buildModel({ series: [{ type: 'waterfall', data: [['Start', 100], ['A', 30], ['B', -50], { x: 'Fin', isSum: true }] }] }, registry, vis());
    const p = m.series[0].points;
    expect(p.map(q => [q.y0, q.y1])).toEqual([[0, 100], [100, 130], [130, 80], [0, 80]]);
    expect(p[2].color).toBe('#ef4444');
  });

  it('candlesticks use high/low for the axis extent', () => {
    const m = buildModel({ xAxis: { type: 'time' }, series: [{ type: 'candlestick', data: [[0, 10, 15, 8, 12], [1, 12, 13, 9, 9]] }] }, registry, vis());
    const p = m.series[0].points[0];
    expect([p.lo, p.hi, p.y]).toEqual([8, 15, 12]);
  });

  it('heatmap y labels become categories and cells are coloured by z', () => {
    const m = buildModel({ series: [{ type: 'heatmap', data: [['Lun', '9h', 1], ['Lun', '10h', 5], ['Mar', '9h', 3]] }] }, registry, vis());
    expect(m.yCategories).toEqual(['9h', '10h']);
    expect(m.series[0].points[1].y).toBe(1);
    expect(m.series[0].points[0].color).not.toBe(m.series[0].points[1].color);
  });

  it('series stack per y axis', () => {
    const m = buildModel({ stacking: 'normal', yAxis: [{}, {}], series: [
      { type: 'column', data: [5] }, { type: 'column', data: [3], yAxis: 1 },
    ] }, registry, vis());
    expect(m.series[1].points[0].y0).toBe(0);
  });
});

describe('layout helpers', () => {
  it('aligned domains share the tick count', () => {
    const [lo, hi] = alignedDomain(3, 87, 5);
    expect(lo).toBeLessThanOrEqual(3);
    expect(hi).toBeGreaterThanOrEqual(87);
    const step = (hi - lo) / 5;
    expect([1, 2, 2.5, 5].some(f => Math.abs(step / Math.pow(10, Math.floor(Math.log10(step))) - f) < 1e-9)).toBe(true);
  });

  it('pie labels never overlap', () => {
    const labels = [0, 2, 4, 5, 6].map((y, i) => ({ y, value: 10 - i }));
    const out = spreadLabels(labels, 0, 200, 17);
    for (let i = 1; i < out.length; i++) expect(out[i].y - out[i - 1].y).toBeGreaterThanOrEqual(17);
  });

  it('pie labels drop the smallest slices when space runs out', () => {
    const labels = Array.from({ length: 10 }, (_, i) => ({ y: 50, value: i }));
    const out = spreadLabels(labels, 0, 34, 17);
    expect(out.map(l => l.value).sort()).toEqual([7, 8, 9]);
  });

  it('colour ramps and contrast', () => {
    expect(ramp(['#000000', '#ffffff'], 0)).toBe('#000000');
    expect(ramp(['#000000', '#ffffff'], 1)).toBe('#ffffff');
    expect(prefersLightText('#1e1b4b')).toBe(true);
    expect(prefersLightText('#e0f2fe')).toBe(false);
  });
});

describe('Chart features (DOM)', () => {
  it('draws a secondary axis on the right', () => {
    const chart = createChart('#c', {
      animation: false,
      yAxis: [{ title: 'CA' }, { title: 'Marge %' }],
      series: [{ type: 'column', data: [['a', 100], ['b', 300]] }, { type: 'line', yAxis: 1, data: [['a', 12], ['b', 18]] }],
    });
    const titles = [...chart.root.querySelectorAll('.strata-axis-title')].map(t => t.textContent);
    expect(titles).toEqual(expect.arrayContaining(['CA', 'Marge %']));
    chart.destroy();
  });

  it('renders data labels', () => {
    const chart = createChart('#c', { animation: false, dataLabels: true, series: [{ type: 'column', data: [['a', 10], ['b', 20]] }] });
    expect([...chart.root.querySelectorAll('.strata-data-label')].map(t => t.textContent).sort()).toEqual(['10', '20']);
    chart.destroy();
  });

  it('drills down and back up', () => {
    const chart = createChart('#c', {
      animation: false,
      title: 'Ventes',
      series: [{ id: 'root', type: 'column', data: [{ x: 'Europe', y: 10, drilldown: 'eu' }, { x: 'Asie', y: 5 }] }],
      drilldown: { series: [{ id: 'eu', name: 'Europe', data: [['France', 6], ['Italie', 4]] }] },
    });
    const point = (chart as unknown as { model: { series: { points: unknown[] }[] } }).model.series[0].points[0];
    expect(chart.drillDown(point as never)).toBe(true);
    expect(chart.options.title).toBe('Europe');
    const labels = [...chart.root.querySelectorAll('.strata-tick-label')].map(t => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['France', 'Italie']));
    chart.drillUp();
    expect(chart.options.title).toBe('Ventes');
    chart.destroy();
  });

  it('navigator and range buttons appear on time axes', () => {
    const day = 86400000;
    const chart = createChart('#c', {
      animation: false,
      navigator: true,
      xAxis: { type: 'time' },
      series: [{ data: Array.from({ length: 400 }, (_, i) => [Date.UTC(2025, 0, 1) + i * day, Math.sin(i / 20)] as [number, number]) }],
    });
    expect(chart.root.querySelector('.strata-nav-brush')).not.toBeNull();
    expect(chart.root.querySelectorAll('.strata-range').length).toBe(6);
    (chart.root.querySelectorAll('.strata-range')[0] as HTMLButtonElement).click();
    expect(chart.root.querySelectorAll('.strata-range')[0].getAttribute('aria-pressed')).toBe('true');
    chart.destroy();
  });

  it('draws large scatter series as a single path', () => {
    const data = Array.from({ length: 3000 }, (_, i) => [i, (i * 7919) % 1000] as [number, number]);
    const chart = createChart('#c', { animation: false, type: 'scatter', series: [{ data }] });
    expect(chart.root.querySelectorAll('.strata-layer-series circle').length).toBe(0);
    expect(chart.root.querySelectorAll('.strata-layer-series path').length).toBe(1);
    chart.destroy();
  });
});
