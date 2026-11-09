// Static feature matrices: series types, modules, API methods. Status: yes | partial | no.
const Y = 'yes', P = 'partial', N = 'no';

export const seriesTypes = {
  // Core & "more"
  line: Y, spline: Y, area: Y, areaspline: Y, column: Y, bar: Y, scatter: Y, pie: Y, bubble: Y,
  arearange: N, areasplinerange: N, columnrange: N, boxplot: N, errorbar: N, gauge: Y, solidgauge: Y, polygon: N,
  waterfall: Y, columnpyramid: N, dumbbell: N, lollipop: N, variablepie: N, variwide: N, pareto: N, histogram: N, bellcurve: N,
  // Modules
  heatmap: Y, tilemap: N, treemap: Y, sunburst: N, treegraph: N, sankey: Y, dependencywheel: N, arcdiagram: N, organization: N,
  networkgraph: N, packedbubble: N, venn: N, wordcloud: N, timeline: N, xrange: N, gantt: N, funnel: N, pyramid: N,
  streamgraph: N, bullet: N, item: N, dotplot: N, pictorial: N, vector: N, windbarb: N, contour: N, flowmap: N,
  // 3D
  cylinder: N, funnel3d: N, pyramid3d: N, scatter3d: N,
  // Stock
  candlestick: Y, ohlc: Y, hlc: N, flags: N, heikinashi: N, hollowcandlestick: N, renko: N, pointandfigure: N,
  // Maps
  map: N, mapline: N, mappoint: N, mapbubble: N, geoheatmap: N, tiledwebmap: N,
};

export const modules = {
  accessibility: [P, 'focusable SVG, arrow keys, aria-live, legend buttons; no sonification, no data table, no info regions'],
  annotations: [N, ''], 'annotations-advanced': [N, ''],
  'arrow-symbols': [N, ''], boost: [P, 'LTTB decimation + single-path scatter instead of WebGL'], 'boost-canvas': [P, 'same'],
  'broken-axis': [N, ''], coloraxis: [P, 'heatmap colour ramp + gradient legend; no colorAxis on other types'],
  'current-date-indicator': [N, ''], data: [N, 'no CSV/HTML table/Google Sheets loader'], 'data-sorting': [N, ''],
  'data-tools': [N, ''], datagrouping: [P, 'LTTB visual decimation, not aggregation'], debugger: [N, ''],
  'drag-panes': [N, ''], 'draggable-points': [N, ''], drilldown: [Y, 'animated, Back button, keyboard'],
  'export-data': [P, 'CSV download; no data table / XLS'], exporting: [Y, 'PNG, SVG, CSV menu; no print / PDF'],
  'full-screen': [N, ''], 'grid-axis': [N, ''], 'marker-clusters': [N, ''], 'mouse-wheel-zoom': [Y, 'ctrl/⌘ + wheel, pinch'],
  navigator: [Y, 'brush, handles, period buttons'], 'no-data-to-display': [N, ''], 'non-cartesian-zoom': [N, ''],
  'offline-exporting': [Y, 'export is fully client-side'], 'parallel-coordinates': [N, ''], pathfinder: [N, ''],
  'pattern-fill': [N, ''], 'price-indicator': [N, ''], 'series-label': [N, ''], 'series-on-point': [N, ''],
  'solid-gauge': [Y, ''], sonification: [N, ''], 'static-scale': [N, ''], stock: [P, 'navigator, range buttons, candles, OHLC; no scrollbar, no compare, no indicators'],
  'stock-tools': [N, ''], textpath: [N, ''], treegrid: [N, ''],
  'responsive (core)': [P, 'auto layout via ResizeObserver; no responsive.rules'],
  'stacking (core)': [Y, 'normal + percent, per axis'], 'multiple axes (core)': [P, 'multiple y axes with aligned ticks; one x axis'],
  'plot lines/bands (core)': [P, 'y plot lines; no x plot lines, no plot bands'], 'tooltip (core)': [P, 'shared tooltip, custom formatter; no split tooltip, no HTML format strings'],
  'legend (core)': [P, 'toggle + hover highlight, top/bottom; no layout/align options, no navigation'],
  'zones / negativeColor (core)': [N, ''], 'polar charts (core)': [N, ''], 'logarithmic axis (core)': [Y, ''], 'datetime axis (core)': [Y, 'calendar ticks, Intl formats'],
  'i18n / lang (core)': [P, 'Intl number/date locale; UI strings in French'], 'styled mode / CSS (core)': [Y, 'CSS variables, dark mode'],
  'events (core)': [P, 'render, hover, click, toggle, zoom, drilldown; no per-point/series option callbacks'],
};

export const api = [
  ['Chart.update(options)', Y, 'chart.update()'], ['Chart.destroy()', Y, 'chart.destroy()'], ['Chart.redraw()/reflow()', Y, 'automatic (ResizeObserver)'],
  ['Chart.setSize()', P, 'follows container width; height option'], ['Chart.addSeries()', P, 'via update({ series })'], ['Chart.get(id)', N, ''],
  ['Chart.setTitle()', Y, 'update({ title })'], ['Chart.zoomOut() / showResetZoom()', Y, 'chart.zoom(null) + Reset button'],
  ['Chart.showLoading()/hideLoading()', N, ''], ['Chart.getSelectedPoints()', N, ''], ['Chart.drillUp()', Y, 'chart.drillUp()'],
  ['Chart.addSeriesAsDrilldown()', P, 'chart.drillDown(point) with drilldown.series'], ['Chart.exportChart()/getSVG()', Y, 'download() / toSVG() / toPNG()'],
  ['Chart.downloadCSV()/getCSV()', Y, 'download("csv") / toCSV()'], ['Chart.print()', N, ''], ['Chart.addAnnotation()', N, ''],
  ['Chart.addAxis()', N, ''], ['Chart.sonify()', N, ''],
  ['Series.setData()', Y, 'chart.setData(id, data)'], ['Series.addPoint() (streaming)', P, 'setData with the new array'], ['Series.removePoint()', P, 'setData'],
  ['Series.show()/hide()/setVisible()', Y, 'chart.setVisible(id, bool)'], ['Series.update()', P, 'update({ series })'], ['Series.remove()', P, 'update({ series })'],
  ['Series.select()', N, ''], ['Point.update()/remove()', P, 'setData'], ['Point.select()', N, ''], ['Point.setVisible() (pie)', Y, 'setVisible("id:index")'],
  ['Axis.setExtremes()', P, 'x only: chart.zoom([a, b]); y via update({ yAxis: { min, max } })'], ['Axis.getExtremes()', N, ''],
  ['Axis.addPlotLine()/removePlotLine()', P, 'update({ yAxis: { plotLines } })'], ['Axis.setCategories()', Y, 'update({ xAxis: { categories } })'],
  ['Axis.toPixels()/toValue()', N, ''], ['Highcharts.setOptions() (global theme)', P, 'CSS variables / palette per chart; no global defaults by design'],
  ['Highcharts.addEvent() / events', Y, 'chart.on(type, fn) returns unsubscribe'],
];
