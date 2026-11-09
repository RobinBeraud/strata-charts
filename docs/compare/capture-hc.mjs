// Opens every official Highcharts example, records each chart's user options and a screenshot.
import { chromium } from 'playwright';
import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXAMPLES = process.argv[2];
const OUT = process.argv[3];
mkdirSync(join(OUT, 'hc-shots'), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, colorScheme: 'light' });
const results = [];
for (const dir of readdirSync(EXAMPLES)) {
  const file = join(EXAMPLES, dir, 'index.html');
  if (!existsSync(file)) continue;
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  try {
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1800);
    const charts = await page.evaluate(() => {
      const seen = new WeakSet();
      const ser = (v, depth = 0) => {
        if (typeof v === 'function') return { __fn: true };
        if (v === null || typeof v !== 'object') return v;
        if (v instanceof Date) return v.getTime();
        if (typeof Node !== 'undefined' && v instanceof Node) return { __node: true };
        if (seen.has(v) || depth > 12) return { __cycle: true };
        seen.add(v);
        if (Array.isArray(v)) return v.slice(0, 3000).map(x => ser(x, depth + 1));
        const o = {};
        for (const k of Object.keys(v)) o[k] = ser(v[k], depth + 1);
        return o;
      };
      const H = window.Highcharts;
      if (!H) return [];
      return (H.charts || []).filter(Boolean).map(c => ({
        ctor: c.options?.chart?.type ?? null,
        isStock: !!c.navigator,
        options: ser(c.userOptions),
        types: c.series.map(s => s.type),
      }));
    });
    const el = await page.$('.highcharts-container');
    if (el) await el.screenshot({ path: join(OUT, 'hc-shots', `${dir}.png`) });
    results.push({ example: dir, errors, charts });
    process.stdout.write('.');
  } catch (e) {
    results.push({ example: dir, errors: [String(e.message).slice(0, 200)], charts: [] });
    process.stdout.write('x');
  }
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, 'hc-configs.json'), JSON.stringify(results));
console.log('\ncaptured', results.length, 'examples,', results.reduce((a, r) => a + r.charts.length, 0), 'charts');
