"""Visual verdicts from the side-by-side review (Highcharts | Strata), plus the overall score."""
import json, sys, collections

# F = faithful (same chart, data and axes; style differences only)
# A = close (right chart and data, one notable element missing)
# D = degraded (renders, but misleading or major parts missing)
# X = wrong / empty
V = {
 'accessible-line': 'F', 'accessible-pie': 'A', 'all-instruments': 'D', 'area-chart': 'F', 'area-missing': 'F',
 'area-negative': 'F', 'area-race-chart': 'A', 'area-stacked': 'F', 'area-stacked-inverted': 'A', 'area-stacked-percent': 'F',
 'areaspline': 'F', 'bar-chart': 'F', 'bar-force': 'A', 'bar-negative-stack': 'A', 'bar-race': 'D', 'bar-stacked': 'F',
 'bubble': 'F', 'bubble-3d': 'A', 'bullet-graph': 'X', 'calendar-heatmap-month': 'X', 'chart-update': 'F', 'column-basic': 'F',
 'column-comparison': 'D', 'column-drilldown': 'A', 'column-negative': 'F', 'column-parsed': 'F', 'column-rotated-labels': 'F',
 'column-stacked': 'F', 'column-stacked-and-grouped': 'F', 'column-stacked-percent': 'F', 'combo': 'A', 'combo-data-resolution': 'F',
 'combo-dual-axes': 'F', 'combo-multi-axes': 'F', 'combo-regression': 'F', 'donut': 'F', 'donut-chart': 'A', 'donut-race': 'A',
 'dynamic-click-to-add': 'F', 'dynamic-master-detail': 'A', 'dynamic-update': 'F', 'gauge-clock': 'X', 'gauge-dual': 'A',
 'gauge-inspiration': 'F', 'gauge-multiple-kpi': 'A', 'gauge-solid': 'F', 'gauge-speedometer': 'F', 'gauge-vu-meter': 'A',
 'heatmap': 'F', 'heatmap-canvas': 'X', 'heatmap-interpolation': 'X', 'html-legend': 'F', 'i18n': 'A', 'line-boost': 'X',
 'line-chart': 'F', 'line-csv': 'F', 'line-custom-entrance-animation': 'F', 'line-forecast': 'A', 'line-labels': 'F',
 'line-log-axis': 'F', 'line-race': 'A', 'line-time-series': 'F', 'live-data': 'F', 'livedata-columns': 'A', 'pie-chart': 'F',
 'pie-custom-entrance-animation': 'F', 'pie-donut': 'X', 'pie-drilldown': 'F', 'pie-gradient': 'A', 'pie-legend': 'F',
 'pie-monochrome': 'A', 'pie-semi-circle': 'D', 'plotline-context': 'F', 'responsive': 'F', 'sankey-diagram': 'F', 'scatter': 'F',
 'scatter-boost': 'X', 'scatter-jitter': 'D', 'sonification-music': 'D', 'sonification-navigation': 'A', 'sonified-function': 'F',
 'sparkline': 'D', 'spline-inverted': 'F', 'spline-irregular-time': 'F', 'spline-plot-bands': 'F', 'spline-symbols': 'F',
 'styled-mode-column': 'A', 'styled-mode-pie': 'X', 'synchronized-charts': 'X', 'treemap-coloraxis': 'D',
 'treemap-large-dataset': 'A', 'treemap-with-levels': 'A', 'vertical-sankey': 'D', 'waterfall': 'F',
}
W = {'F': 1.0, 'A': 0.75, 'D': 0.35, 'X': 0.0}

r = json.load(open(sys.argv[1] + '/strata-results.json', encoding='utf-8'))
ex = collections.OrderedDict()
for x in r:
    ex.setdefault(x['example'], []).append(x)


def status(xs):
    if all(x['status'] == 'rendered' for x in xs):
        return 'rendered'
    if any(x['status'] == 'unsupported-feature' for x in xs):
        return 'unsupported-feature'
    return 'unsupported-type'


rows = []
for e, xs in ex.items():
    s = status(xs)
    v = V.get(e) if s == 'rendered' else ('N' if s else 'N')
    rows.append((e, s, v))
missing = [e for e, s, v in rows if s == 'rendered' and v is None]
assert not missing, missing
c = collections.Counter(v for _, _, v in rows)
total = len(rows)
score = sum(W.get(v, 0) for _, _, v in rows) / total * 100
rendered = [v for _, s, v in rows if s == 'rendered']
score_rendered = sum(W[v] for v in rendered) / len(rendered) * 100
print(json.dumps({
    'examples': total, 'verdicts': dict(c), 'rendered': len(rendered),
    'unsupported_type': sum(1 for _, s, _ in rows if s == 'unsupported-type'),
    'unsupported_feature': sum(1 for _, s, _ in rows if s == 'unsupported-feature'),
    'faithful_or_close_pct_all': round((c['F'] + c['A']) / total * 100, 1),
    'faithful_pct_all': round(c['F'] / total * 100, 1),
    'weighted_score_all': round(score, 1), 'weighted_score_rendered': round(score_rendered, 1),
}, indent=1))
json.dump(rows, open(sys.argv[1] + '/verdicts.json', 'w'), indent=1)
