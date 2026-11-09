import { describe, expect, it } from 'vitest';
import { compileFormat, convertHighcharts, stripHtml } from '../src/compat/highcharts';

describe('Highcharts 13 compat', () => {
  it('reads dataTable columns through dataMapping', () => {
    const { options } = convertHighcharts({
      dataTable: { columns: { Month: ['Jan', 'Feb'], Rain: [49, 71], Temp: [-13, -12] } },
      xAxis: [{ type: 'category' }],
      series: [{ type: 'column', dataMapping: { y: 'Rain' } }, { name: 'Température', dataMapping: { y: 'Temp' } }],
    });
    expect(options.series[0].name).toBe('Rain');
    expect(options.series[0].data).toEqual([expect.objectContaining({ x: 'Jan', y: 49 }), expect.objectContaining({ x: 'Feb', y: 71 })]);
    expect(options.series[1].name).toBe('Température');
  });

  it('expands pointStart / pointInterval', () => {
    const { options } = convertHighcharts({ plotOptions: { series: { pointStart: 1940 } }, series: [{ data: [1, 2, 3] }] });
    expect(options.series[0].data).toEqual([[1940, 1], [1941, 2], [1942, 3]]);
    const m = convertHighcharts({ series: [{ pointStart: Date.UTC(2020, 0, 1), pointIntervalUnit: 'month', data: [1, 2] }] }).options;
    expect((m.series[0].data[1] as [number, number])[0]).toBe(Date.UTC(2020, 1, 1));
  });

  it('compiles format strings and strips HTML', () => {
    expect(compileFormat('{value} mm', 'en-US')!({ value: 12 })).toBe('12 mm');
    expect(compileFormat('<b>{point.y:.1f}</b> %', 'en-US')!({ 'point.y': 3.14159 })).toBe('3.1 %');
    expect(compileFormat('{#if point.y}x{/if}')).toBeNull();
    expect(stripHtml('Source: <a href="https://x.y">SSB</a> &amp; co')).toBe('Source: SSB & co');
  });

  it('maps tooltip pointFormat, labels.format, gradients, colorByPoint, plot bands', () => {
    const { options, ignored } = convertHighcharts({
      title: { text: 'A <span style="color:red">B</span>' },
      colors: [{ linearGradient: {}, stops: [[0, '#123456'], [1, '#000']] }, '#abcdef'],
      tooltip: { pointFormat: '{series.name}: <b>{point.y:.2f} °C</b>' },
      xAxis: { plotBands: [{ from: 1, to: 2, color: 'rgba(0,0,0,.1)' }], visible: false },
      yAxis: { labels: { format: '{value}%' } },
      series: [{ type: 'column', colorByPoint: true, data: [1, 2] }],
    });
    expect(options.title).toBe('A B');
    expect(options.palette).toEqual(['#123456', '#abcdef']);
    expect(options.tooltip).toMatchObject({ suffix: ' °C', valueFormat: { maximumFractionDigits: 2 } });
    expect(options.xAxis).toMatchObject({ visible: false, plotBands: [{ from: 1, to: 2 }] });
    expect((options.yAxis as { formatter: (v: number, l: string) => string }).formatter(50, '50')).toBe('50%');
    expect(options.series[0].colorByPoint).toBe(true);
    expect(ignored).not.toContain('tooltip.pointFormat (template helpers)');
  });
});
