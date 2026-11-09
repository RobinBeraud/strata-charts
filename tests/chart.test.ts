import { beforeEach, describe, expect, it } from 'vitest';
import { createChart } from '../src/index';

beforeEach(() => {
  document.body.innerHTML = '<div id="c" style="width:600px"></div>';
});

const opts = {
  animation: false as const,
  title: 'Test',
  series: [
    { id: 'a', name: 'A', type: 'column' as const, data: [['Q1', 3], ['Q2', 5], ['Q3', 2]] as [string, number][] },
    { id: 'b', name: 'B', type: 'line' as const, data: [['Q1', 1], ['Q2', 4], ['Q3', 6]] as [string, number][] },
  ],
};

describe('Chart (DOM)', () => {
  it('renders bars, a line, axis labels and a legend', () => {
    const chart = createChart('#c', opts);
    const root = chart.root;
    expect(root.querySelectorAll('.strata-bar').length).toBe(3);
    expect(root.querySelectorAll('path.strata-line').length).toBe(1);
    const labels = [...root.querySelectorAll('.strata-tick-label')].map(t => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Q1', 'Q2', 'Q3']));
    expect(root.querySelectorAll('.strata-legend-item').length).toBe(2);
    expect(root.querySelector('.strata-stage > svg')!.getAttribute('aria-label')).toContain('2 series');
    chart.destroy();
  });

  it('legend toggles visibility and emits an event', () => {
    const chart = createChart('#c', opts);
    const events: boolean[] = [];
    chart.on('toggle', e => events.push(e.visible));
    (chart.root.querySelector('.strata-legend-item[data-key="a"]') as HTMLButtonElement).click();
    expect(events).toEqual([false]);
    expect(chart.root.querySelectorAll('.strata-bar').length).toBe(0);
    expect(chart.root.querySelector('[data-key="a"]')!.getAttribute('aria-pressed')).toBe('false');
    chart.destroy();
  });

  it('updates data in place (same elements reused)', () => {
    const chart = createChart('#c', opts);
    const bar = chart.root.querySelector('.strata-bar');
    chart.setData('a', [['Q1', 9], ['Q2', 1], ['Q3', 4]]);
    expect(chart.root.querySelector('.strata-bar')).toBe(bar);
    chart.destroy();
  });

  it('exports SVG with resolved styles and CSV', () => {
    const chart = createChart('#c', opts);
    const svgText = chart.toSVG();
    expect(svgText).toContain('<svg');
    expect(svgText).toContain('Test');
    expect(svgText).not.toContain('var(--');
    expect(chart.toCSV().split('\n')).toEqual(['Category,A,B', 'Q1,3,1', 'Q2,5,4', 'Q3,2,6']);
    chart.destroy();
  });

  it('renders a donut with a centre total', () => {
    const chart = createChart('#c', {
      animation: false,
      series: [{ type: 'donut', name: 'Share', data: [{ name: 'x', y: 2 }, { name: 'y', y: 3 }] }],
    });
    expect(chart.root.querySelectorAll('.strata-slice').length).toBe(2);
    expect(chart.root.querySelector('.strata-center-value')!.textContent).toBe('5');
    expect(chart.root.querySelectorAll('.strata-legend-item').length).toBe(2);
    chart.destroy();
  });

  it('never injects tooltip formatter output as HTML', () => {
    const chart = createChart('#c', { ...opts, tooltip: { formatter: () => '<img src=x onerror=alert(1)>' } });
    // Drive the tooltip through the keyboard path.
    chart.root.querySelector('.strata-stage > svg')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    const tt = chart.root.querySelector('.strata-tooltip')!;
    expect(tt.querySelector('img')).toBeNull();
    expect(tt.textContent).toContain('<img');
    chart.destroy();
  });
});
