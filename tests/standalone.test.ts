import { beforeEach, describe, expect, it } from 'vitest';
import { buildModel } from '../src/core/model';
import { Registry } from '../src/core/registry';
import { builtinTypes, createChart, layoutSankey, squarify } from '../src/index';
import { convertHighcharts } from '../src/compat/highcharts';

const registry = new Registry(builtinTypes);
const vis = () => ({ series: new Map<string, boolean>(), points: new Map<string, boolean>() });

beforeEach(() => {
  document.body.innerHTML = '<div id="c" style="width:700px"></div>';
});

describe('squarify', () => {
  const rect = { left: 0, top: 0, width: 600, height: 400 };
  const values = [6, 6, 4, 3, 2, 2, 1];
  const out = squarify(values, rect);

  it('areas are proportional to values and fill the rect', () => {
    const total = values.reduce((a, b) => a + b, 0);
    out.forEach((r, i) => expect(r.width * r.height).toBeCloseTo((values[i] / total) * 240000, 3));
  });

  it('rects stay inside and do not overlap', () => {
    for (const r of out) {
      expect(r.left).toBeGreaterThanOrEqual(-1e-9);
      expect(r.top + r.height).toBeLessThanOrEqual(400 + 1e-9);
    }
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i];
      const b = out[j];
      const ox = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      const oy = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      expect(ox <= 1e-6 || oy <= 1e-6).toBe(true);
    }
  });

  it('keeps aspect ratios reasonable', () => {
    const worst = Math.max(...out.map(r => Math.max(r.width / r.height, r.height / r.width)));
    expect(worst).toBeLessThan(4);
  });
});

describe('sankey layout', () => {
  const m = buildModel({ series: [{ type: 'sankey', data: [
    ['Solaire', 'Réseau', 30], ['Éolien', 'Réseau', 50], ['Réseau', 'Industrie', 45], ['Réseau', 'Ménages', 35], ['Gaz', 'Industrie', 20],
  ] }] }, registry, vis());
  const { nodes, links } = layoutSankey(m.series[0].points, { left: 0, top: 0, width: 600, height: 300 }, () => '#000', id => id);
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  it('parses [from, to, weight] links', () => {
    expect(m.series[0].points[0]).toMatchObject({ from: 'Solaire', to: 'Réseau', y: 30 });
    expect(links.length).toBe(5);
  });

  it('places nodes in flow order, sinks in the last column', () => {
    expect(byId['Solaire'].col).toBe(0);
    expect(byId['Réseau'].col).toBe(1);
    expect(byId['Industrie'].col).toBe(2);
    expect(byId['Ménages'].col).toBe(2);
  });

  it('node value is the larger of in/out flow and columns do not overlap', () => {
    expect(byId['Réseau'].value).toBe(80);
    const col2 = nodes.filter(n => n.col === 2).sort((a, b) => a.y - b.y);
    expect(col2[0].y + col2[0].h).toBeLessThanOrEqual(col2[1].y);
    for (const n of nodes) {
      expect(n.y).toBeGreaterThanOrEqual(-1e-6);
      expect(n.y + n.h).toBeLessThanOrEqual(300 + 1e-6);
    }
  });
});

describe('standalone charts (DOM)', () => {
  it('gauge: one ring per value and a centre label', () => {
    const chart = createChart('#c', { animation: false, series: [{ type: 'gauge', name: 'Objectifs', suffix: ' %', data: [{ name: 'Ventes', y: 72 }, { name: 'Marge', y: 40 }] }] });
    expect(chart.root.querySelectorAll('path[data-key^="s0:"]').length).toBe(2);
    expect(chart.root.querySelector('.strata-gauge-value')!.textContent).toBe('72 %');
    expect(chart.root.querySelectorAll('.strata-legend-item').length).toBe(2);
    chart.destroy();
  });

  it('gauge: needle variant', () => {
    const chart = createChart('#c', { animation: false, series: [{ type: 'gauge', needle: true, min: 0, max: 200, data: [120], bands: [{ from: 150, to: 200, color: '#ef4444' }] }] });
    expect(chart.root.querySelector('.strata-gauge-needle')).not.toBeNull();
    expect(chart.root.querySelectorAll('.strata-gauge-tick').length).toBeGreaterThan(4);
    chart.destroy();
  });

  it('treemap: groups, leaves, and click-to-zoom with Back', () => {
    const chart = createChart('#c', {
      animation: false,
      height: 400,
      series: [{ type: 'treemap', data: [
        { id: 'eu', name: 'Europe' }, { id: 'as', name: 'Asie' },
        { name: 'France', parent: 'eu', value: 40 }, { name: 'Italie', parent: 'eu', value: 25 },
        { name: 'Japon', parent: 'as', value: 30 }, { name: 'Inde', parent: 'as', value: 20 },
      ] }],
    });
    expect(chart.root.querySelectorAll('.strata-tm-cell').length).toBe(6);
    const svgEl = chart.root.querySelector('.strata-stage > svg')!;
    const eu = chart.root.querySelector('[data-key]') ?? null;
    expect(eu).toBeNull(); // treemap cells have no legend keys
    // Click inside the Europe group (largest, laid out first at the top-left).
    const opts = { clientX: 20, clientY: 40, bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0 };
    svgEl.dispatchEvent(new PointerEvent('pointermove', opts));
    svgEl.dispatchEvent(new PointerEvent('pointerdown', opts));
    svgEl.dispatchEvent(new PointerEvent('pointerup', opts));
    const visible = () => [...chart.root.querySelectorAll('.strata-tm-cell')].length;
    expect(visible()).toBe(2);
    expect(chart.root.querySelector('.strata-gauge-label')!.textContent).toBe('Tout › Europe');
    chart.drillUp();
    expect(visible()).toBe(6);
    chart.destroy();
  });

  it('sankey: nodes, gradient links and labels', () => {
    const chart = createChart('#c', { animation: false, series: [{ type: 'sankey', data: [['A', 'B', 5], ['A', 'C', 3], ['B', 'D', 5]] }] });
    expect(chart.root.querySelectorAll('.strata-sk-node').length).toBe(4);
    expect(chart.root.querySelectorAll('.strata-sk-link').length).toBe(3);
    expect(chart.root.querySelectorAll('linearGradient').length).toBe(3);
    expect(chart.root.querySelectorAll('.strata-sk-label').length).toBe(4);
    chart.destroy();
  });
});

describe('compat for the new types', () => {
  it('maps solidgauge, treemap and sankey configs', () => {
    const g = convertHighcharts({
      chart: { type: 'solidgauge' },
      yAxis: { min: 0, max: 200, stops: [[0.1, '#55BF3B'], [0.9, '#DF5353']] },
      series: [{ name: 'Vitesse', data: [80], dataLabels: { format: '{y} km/h' } }],
    }).options;
    expect(g.series[0]).toMatchObject({ type: 'gauge', min: 0, max: 200, colorRange: ['#55BF3B', '#DF5353'], suffix: ' km/h' });

    const t = convertHighcharts({ series: [{ type: 'treemap', data: [{ id: 'a', name: 'A' }, { name: 'x', parent: 'a', value: 3 }] }] }).options;
    expect(t.series[0].data[1]).toMatchObject({ parent: 'a', y: 3 });

    const s = convertHighcharts({ series: [{ type: 'sankey', keys: ['from', 'to', 'weight'], data: [['a', 'b', 2]], nodes: [{ id: 'a', color: '#f00' }] }] }).options;
    expect(s.series[0].data[0]).toEqual(['a', 'b', 2]);
    expect(s.series[0].nodes?.[0]).toMatchObject({ id: 'a', color: '#f00' });
  });
});
