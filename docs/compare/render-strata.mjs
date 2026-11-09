// Renders every captured Highcharts config with Strata (via convertHighcharts) and screenshots it.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:5199';
mkdirSync(join(OUT, 'strata-shots'), { recursive: true });
const captured = JSON.parse(readFileSync(join(OUT, 'hc-configs.json'), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 700 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message)));
await page.goto(`${BASE}/bench/compare.html`);
await page.waitForFunction(() => window.ready === true);

const results = [];
for (const ex of captured) {
  for (const [i, c] of ex.charts.entries()) {
    pageErrors.length = 0;
    let res;
    try {
      res = await page.evaluate(o => window.strataRender(o), c.options);
    } catch (e) {
      res = { status: 'error', error: String(e.message).slice(0, 200) };
    }
    if (pageErrors.length && res.status === 'rendered') res = { ...res, status: 'error', error: pageErrors[0].slice(0, 200) };
    if (res.status === 'rendered') {
      await page.waitForTimeout(60);
      const el = await page.$('#c .strata');
      if (el) await el.screenshot({ path: join(OUT, 'strata-shots', `${ex.example}${i ? '-' + i : ''}.png`) });
    }
    results.push({ example: ex.example, index: i, hcTypes: c.types, ...res });
  }
  process.stdout.write('.');
}
await browser.close();
writeFileSync(join(OUT, 'strata-results.json'), JSON.stringify(results, null, 1));
const by = s => results.filter(r => r.status === s).length;
console.log(`\ncharts ${results.length} rendered ${by('rendered')} unsupported ${by('unsupported-type')} errors ${by('error')}`);
