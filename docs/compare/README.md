# Comparison harness (Strata vs Highcharts examples)

Reproduces the numbers in [../COMPARAISON-HIGHCHARTS.fr.md](../COMPARAISON-HIGHCHARTS.fr.md). Requires a local copy of the Highcharts distribution zip (not included) and Playwright.

1. `node capture-hc.mjs <highcharts>/examples <out>`: opens every official example, saves `userOptions` and a screenshot.
2. Copy `compare.html` to `bench/compare.html`, run `npm run dev`, then `node render-strata.mjs <out> http://localhost:5199`: converts each config with `convertHighcharts()` and renders it with Strata.
3. `node coverage.mjs <out>`: option-path coverage (weighted by example).
4. `python verdicts.py <out>`: visual verdicts (from a manual side-by-side review) and scores.

`coverage-summary.json` and `verdicts.json` are the results of the 9 November 2026 run.
