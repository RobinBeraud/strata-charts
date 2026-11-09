import { createChart, type Chart, type ChartOptions, type PointInput } from '../src/index';
import { fromHighcharts } from '../src/compat/highcharts';

// Deterministic pseudo-random numbers so the demo is reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
const round1 = (v: number) => Math.round(v * 10) / 10;

const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const DAY = 86400000;
const charts: Chart[] = [];
const add = (c: Chart) => (charts.push(c), c);

// 1. Dense time series: navigator, range buttons, zoom.
function walk(n: number, start: number, vol: number): [number, number][] {
  const t0 = new Date(2024, 0, 1).getTime();
  const step = (Date.now() - t0) / n;
  let v = start;
  return Array.from({ length: n }, (_, i) => {
    v += (start - v) * 0.004 + gauss() * vol;
    return [t0 + i * step, Math.round(v * 100) / 100];
  });
}
add(createChart('#c-time', {
  type: 'line',
  title: 'Latence p95 de l’API',
  subtitle: '2 séries × 25 000 mesures',
  height: 400,
  zoom: true,
  navigator: true,
  locale: 'fr-FR',
  xAxis: { type: 'time' },
  yAxis: { title: 'ms', plotLines: [{ value: 260, label: 'SLO 260 ms', color: '#ef4444' }] },
  tooltip: { suffix: ' ms', valueFormat: { maximumFractionDigits: 1 } },
  series: [
    { id: 'eu', name: 'Europe', data: walk(25000, 180, 2.2) },
    { id: 'us', name: 'Amérique', data: walk(25000, 140, 2.6) },
  ],
}));

// 2. Candlesticks.
function candles(n: number): PointInput[] {
  const out: PointInput[] = [];
  let price = 120;
  const t0 = new Date(2025, 0, 2).getTime();
  for (let i = 0, d = 0; i < n; d++) {
    const t = t0 + d * DAY;
    const wd = new Date(t).getDay();
    if (wd === 0 || wd === 6) continue;
    const o = price;
    const c = Math.max(5, o + gauss() * 2.4 + 0.08);
    const h = Math.max(o, c) + Math.abs(gauss()) * 1.3;
    const l = Math.min(o, c) - Math.abs(gauss()) * 1.3;
    out.push([t, round1(o), round1(h), round1(l), round1(c)]);
    price = c;
    i++;
  }
  return out;
}
add(createChart('#c-stock', {
  type: 'candlestick',
  title: 'ACME SA',
  subtitle: 'Cours journalier (EUR)',
  height: 380,
  zoom: true,
  navigator: true,
  locale: 'fr-FR',
  xAxis: { type: 'time' },
  series: [{ id: 'acme', name: 'ACME', data: candles(480) }],
}));

// 3. Dual axis + data labels.
const revenue = () => months.map(m => [m, Math.round(80 + rand() * 120)] as [string, number]);
const margin = () => months.map(m => [m, round1(18 + rand() * 14)] as [string, number]);
const dual = add(createChart('#c-dual', {
  title: 'Chiffre d’affaires et marge',
  locale: 'fr-FR',
  yAxis: [{ title: 'k€' }, { title: 'Marge %', numberFormat: { maximumFractionDigits: 0 } }],
  series: [
    { id: 'ca', name: 'CA (k€)', type: 'column', data: revenue(), dataLabels: true },
    { id: 'marge', name: 'Marge (%)', type: 'spline', yAxis: 1, data: margin(), color: '#f59e0b', markers: true },
  ],
}));

// 4. Drilldown.
const regions = ['Europe', 'Amériques', 'Asie', 'Afrique', 'Océanie'];
const countries: Record<string, string[]> = {
  Europe: ['France', 'Allemagne', 'Italie', 'Espagne', 'Pays-Bas'],
  Amériques: ['États-Unis', 'Canada', 'Brésil', 'Mexique'],
  Asie: ['Japon', 'Inde', 'Corée', 'Singapour', 'Vietnam'],
  Afrique: ['Maroc', 'Nigeria', 'Kenya'],
  Océanie: ['Australie', 'Nouvelle-Zélande'],
};
const drillSeries = regions.map(r => ({
  id: 'dd-' + r,
  name: r,
  data: countries[r].map(c => [c, Math.round(5 + rand() * 40)] as [string, number]),
}));
add(createChart('#c-drill', {
  type: 'column',
  title: 'Ventes par région',
  locale: 'fr-FR',
  dataLabels: true,
  series: [{
    id: 'regions',
    name: 'Ventes (M€)',
    data: drillSeries.map(s => ({ x: s.name, y: s.data.reduce((a, d) => a + (d[1] as number), 0), drilldown: s.id })),
  }],
  drilldown: { series: drillSeries },
}));

// 5. Waterfall.
add(createChart('#c-waterfall', {
  type: 'waterfall',
  title: 'Du chiffre d’affaires au résultat net',
  subtitle: 'M€',
  locale: 'fr-FR',
  dataLabels: true,
  series: [{
    id: 'pnl',
    name: 'Compte de résultat',
    data: [
      ['Chiffre d’affaires', 420], ['Coût des ventes', -168], { x: 'Marge brute', isSum: true },
      ['Marketing', -62], ['R&D', -71], ['Frais généraux', -38], { x: 'EBITDA', isSum: true },
      ['Amortissements', -24], ['Impôts', -19], { x: 'Résultat net', isSum: true },
    ],
  }],
}));

// 6. Heatmap.
const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const hours = Array.from({ length: 12 }, (_, i) => `${8 + i}h`);
const heat = (): PointInput[] => days.flatMap((d, di) => hours.map((h, hi) => {
  const peak = Math.exp(-((hi - 4) ** 2) / 8) + Math.exp(-((hi - 9) ** 2) / 6) * 0.8;
  const weekend = di >= 5 ? 0.45 : 1;
  return [d, h, Math.round((peak * weekend * 90 + rand() * 18))] as [string, string, number];
}));
add(createChart('#c-heat', {
  type: 'heatmap',
  title: 'Commandes par heure',
  locale: 'fr-FR',
  height: 360,
  dataLabels: true,
  series: [{ id: 'orders', name: 'Commandes', data: heat() }],
}));

// 7. Percent-stacked areas.
const share = () => months.map(m => [m, Math.round(10 + rand() * 40)] as [string, number]);
const areaChart = add(createChart('#c-area', {
  type: 'areaspline',
  title: 'Répartition du trafic',
  subtitle: 'Empilement en pourcentage',
  stacking: 'percent',
  locale: 'fr-FR',
  series: [
    { id: 'organic', name: 'Organique', data: share() },
    { id: 'paid', name: 'Payant', data: share() },
    { id: 'social', name: 'Social', data: share() },
    { id: 'direct', name: 'Direct', data: share() },
  ],
}));

// 8. Horizontal stacked bars with inside labels.
const teams = ['Plateforme', 'Paiements', 'Mobile', 'Données', 'Support', 'Croissance'];
const bars = () => teams.map(t => [t, Math.round(3 + rand() * 18)] as [string, number]);
const barChart = add(createChart('#c-bar', {
  type: 'bar',
  title: 'Tickets ouverts par équipe',
  stacking: 'normal',
  dataLabels: true,
  locale: 'fr-FR',
  series: [
    { id: 'p1', name: 'Critique', color: '#ef4444', data: bars() },
    { id: 'p2', name: 'Majeur', color: '#f59e0b', data: bars() },
    { id: 'p3', name: 'Mineur', color: '#94a3b8', data: bars() },
  ],
}));

// 9. Donut with many slices (label layout) + drilldown.
const sources = ['Recherche', 'Direct', 'Réseaux', 'E-mail', 'Partenaires', 'Presse', 'Podcasts', 'Événements', 'Affiliation'];
const slices = () => sources.map((name, i) => ({ name, y: Math.round(2 + rand() * (i < 4 ? 45 : 8)), drilldown: i === 2 ? 'social' : undefined }));
const donutChart = add(createChart('#c-donut', {
  title: 'Origine des inscriptions',
  locale: 'fr-FR',
  series: [{ id: 'src', type: 'donut', name: 'Inscriptions', data: slices() }],
  drilldown: { series: [{ id: 'social', name: 'Réseaux', type: 'donut', data: [{ name: 'LinkedIn', y: 14 }, { name: 'Instagram', y: 9 }, { name: 'TikTok', y: 7 }, { name: 'YouTube', y: 5 }, { name: 'X', y: 3 }] }] },
}));

// 10. Bubbles.
const countriesB = ['France', 'Allemagne', 'Espagne', 'Italie', 'Pologne', 'Suède', 'Portugal', 'Grèce', 'Irlande', 'Belgique'];
add(createChart('#c-bubble', {
  type: 'bubble',
  title: 'Revenu, espérance de vie et population',
  locale: 'fr-FR',
  xAxis: { title: 'PIB / habitant (k€)' },
  yAxis: { title: 'Espérance de vie' },
  series: [{
    id: 'eu',
    name: 'Pays',
    data: countriesB.map(name => ({ name, x: round1(20 + rand() * 60), y: round1(76 + rand() * 7), z: Math.round(5 + rand() * 80) })),
  }],
}));

// 11. Large scatter (fast path).
const cluster = (cx: number, cy: number, n: number) =>
  Array.from({ length: n }, () => [round1(cx + gauss() * 7), round1(cy + gauss() * 10)] as [number, number]);
add(createChart('#c-scatter', {
  type: 'scatter',
  title: 'Temps de session vs. pages vues',
  locale: 'fr-FR',
  zoom: true,
  xAxis: { title: 'Minutes' },
  yAxis: { title: 'Pages' },
  series: [
    { id: 'new', name: 'Nouveaux', data: cluster(14, 20, 10000) },
    { id: 'ret', name: 'Fidèles', data: cluster(34, 48, 10000) },
  ],
}));

// 13. Gauges: rings and needle, updated live.
const kpis = () => [
  { name: 'Ventes', y: Math.round(55 + rand() * 40) },
  { name: 'Satisfaction', y: Math.round(60 + rand() * 35) },
  { name: 'Rétention', y: Math.round(40 + rand() * 50) },
];
const gaugeChart = add(createChart('#c-gauge', {
  title: 'Objectifs du trimestre',
  locale: 'fr-FR',
  series: [{ id: 'kpi', type: 'gauge', name: 'Objectifs', suffix: ' %', data: kpis() }],
}));
const needleChart = add(createChart('#c-needle', {
  title: 'Charge serveur',
  locale: 'fr-FR',
  series: [{
    id: 'load', type: 'gauge', needle: true, name: 'Requêtes / s', min: 0, max: 1200, suffix: ' req/s', data: [640],
    bands: [{ from: 0, to: 700, color: '#22c55e' }, { from: 700, to: 950, color: '#f59e0b' }, { from: 950, to: 1200, color: '#ef4444' }],
  }],
}));
setInterval(() => {
  if (document.hidden) return;
  needleChart.setData('load', [Math.round(450 + rand() * 650)]);
}, 2200);

// 14. Sankey.
add(createChart('#c-sankey', {
  type: 'sankey',
  title: 'Flux d’énergie',
  subtitle: 'TWh, de la production aux usages',
  height: 420,
  locale: 'fr-FR',
  series: [{
    id: 'energy',
    name: 'Énergie',
    suffix: ' TWh',
    data: [
      ['Nucléaire', 'Électricité', 320], ['Hydraulique', 'Électricité', 58], ['Éolien', 'Électricité', 48], ['Solaire', 'Électricité', 23],
      ['Gaz', 'Électricité', 30], ['Gaz', 'Chaleur', 140], ['Pétrole', 'Carburants', 520], ['Biomasse', 'Chaleur', 110],
      ['Électricité', 'Industrie', 110], ['Électricité', 'Résidentiel', 160], ['Électricité', 'Tertiaire', 120], ['Électricité', 'Pertes', 89],
      ['Chaleur', 'Résidentiel', 150], ['Chaleur', 'Industrie', 100], ['Carburants', 'Transports', 470], ['Carburants', 'Industrie', 50],
    ],
    nodes: [{ id: 'Pertes', color: '#64748b' }],
  }],
}));

// 15. Treemap with two levels.
const tree = [
  { id: 'tech', name: 'Technologie' }, { id: 'health', name: 'Santé' }, { id: 'fin', name: 'Finance' }, { id: 'energy', name: 'Énergie' }, { id: 'cons', name: 'Consommation' },
  ...[['Logiciels', 'tech', 420], ['Semi-conducteurs', 'tech', 310], ['Matériel', 'tech', 160], ['Cloud', 'tech', 240], ['Cybersécurité', 'tech', 90],
    ['Pharma', 'health', 280], ['Biotech', 'health', 150], ['Équipements', 'health', 110], ['Assurance santé', 'health', 70],
    ['Banques', 'fin', 260], ['Assurance', 'fin', 140], ['Paiements', 'fin', 120], ['Gestion d’actifs', 'fin', 60],
    ['Pétrole & gaz', 'energy', 170], ['Renouvelables', 'energy', 95], ['Services', 'energy', 40],
    ['Distribution', 'cons', 190], ['Automobile', 'cons', 130], ['Luxe', 'cons', 110], ['Alimentation', 'cons', 80]]
    .map(([name, parent, value]) => ({ name: name as string, parent: parent as string, value: value as number })),
];
add(createChart('#c-treemap', {
  type: 'treemap',
  title: 'Capitalisation par secteur',
  subtitle: 'Mds €',
  height: 440,
  locale: 'fr-FR',
  series: [{ id: 'mcap', name: 'Capitalisation', suffix: ' Md€', data: tree }],
}));

// 12. A Highcharts-style config, converted.
const legacy = {
  chart: { type: 'spline' },
  title: { text: 'Températures moyennes' },
  subtitle: { text: 'Configuration héritée, convertie' },
  xAxis: { categories: months },
  yAxis: { title: { text: '°C' } },
  tooltip: { valueSuffix: ' °C', valueDecimals: 1 },
  credits: { enabled: false },
  series: [
    { name: 'Lyon', data: [3.2, 4.8, 8.6, 11.5, 15.6, 19.4, 21.8, 21.3, 17.5, 13.2, 7.6, 4.1] },
    { name: 'Oslo', data: [-4.3, -4, -0.2, 4.5, 10.8, 15.2, 16.4, 15.2, 10.8, 6.3, 0.7, -3.1], dashStyle: 'ShortDash' },
  ],
};
add(createChart('#c-compat', { ...fromHighcharts(legacy), locale: 'fr-FR' }));

// Controls.
document.getElementById('randomize')!.addEventListener('click', () => {
  const upd = (c: Chart, make: (i: number) => unknown) => {
    const o = c.options as ChartOptions;
    c.update({ series: o.series.map((s, i) => ({ ...s, data: make(i) as never })) });
  };
  upd(dual, i => (i === 0 ? revenue() : margin()));
  upd(areaChart, share);
  upd(barChart, bars);
  upd(donutChart, slices);
  upd(gaugeChart, kpis);
});

let theme: 'light' | 'dark' | null = (new URLSearchParams(location.search).get('theme') as 'light' | 'dark' | null) ?? null;
if (theme) for (const c of charts) c.update({ theme }, false);
document.getElementById('theme')!.addEventListener('click', () => {
  const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  theme = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  for (const c of charts) c.update({ theme }, false);
});

Object.assign(window, { charts });
