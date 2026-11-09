# Rétro-ingénierie de Highcharts 13.1.1 et modernisation : Strata Charts

## 1. Méthode

| Étape | Détail |
|---|---|
| Outil | **rea 6.8.0** (`npm install -g rea-agents`, dépôt morluto/rea), commande `rea analyze-javascript-application` |
| Cible | `Highcharts-13.1.1.zip` → `code/es-modules` (1 009 fichiers, 7,3 Mo de JS) |
| Analyse | 1 008 fichiers parsés, 515 468 nœuds AST, 7 055 constats, 7 min 25 s |
| Graphe produit | 3 390 nœuds, 9 168 relations (2 100 imports statiques, 733 `require`), graphe sémantique de 100 000 nœuds et 92 902 relations |
| Limites signalées par rea | `Core/Series/Series.js` a épuisé les 3 Go de tas de l'analyseur ; graphe sémantique tronqué à 100 000 nœuds. Les métriques d'import restent complètes. |
| Fichiers bruts | `docs/rea/rea-summary.json`, `docs/rea/metriques-graphe.txt`, `docs/rea/metrics.py` (script d'extraction) |

L'analyse est statique : rea n'exécute aucun code de Highcharts.

## 2. Ce que révèle l'architecture de Highcharts

**Un noyau en étoile autour de quelques modules « dieu ».** Nombre de modules qui importent chacun d'eux (fan-in) :

| Module | Importé par |
|---|---|
| `Shared/Utilities.js` | 416 modules |
| `Core/Globals.js` (l'objet global `H`) | 257 |
| `Core/Series/SeriesRegistry.js` | 186 |
| `Core/Defaults.js` | 67 |

**Des fichiers géants :** `Series.js` 157 Ko, `AxisDefaults.js` 127 Ko, `Chart.js` 120 Ko, `Defaults.js` 120 Ko.

**L'extension se fait par mutation de prototypes partagés :**
- 125 appels `registerSeriesType` ;
- 230 appels `compose()` répartis dans 33 fichiers `*Composition.js` ;
- 342 affectations `.prototype.` ;
- 554 `addEvent` et 261 `fireEvent`, utilisés comme crochets internes.

Un module ajoute des comportements en modifiant les classes de base au moment où il est importé : le point d'entrée fait `import '../Series/Line/LineSeries.js'` uniquement pour cet effet de bord. Conséquences :
- le *tree-shaking* est impossible ;
- l'ordre de chargement compte ;
- deux graphiques ne peuvent pas avoir des types de séries différents.

**Configuration :** un objet d'options global, fusionné en profondeur (565 appels `merge`).

**Autres constats :**
- Code TypeScript compilé en namespaces IIFE (84 `var` restants).
- 28 usages de `innerHTML`, compensés par un assainisseur AST maison.
- Seulement 3 `ResizeObserver` et 11 `requestAnimationFrame`.
- Les requêtes réseau (`fetch`) sont confinées aux connecteurs de données (CSV, JSON, Google Sheets).
- **Point fort : aucun cycle d'import** (0 composante fortement connexe).

**Poids :** le cœur `highcharts.js` pèse 280 Ko minifié (102 Ko gzip), avant tout module. Il faut ajouter `stock` (115 Ko), `highcharts-more` (102 Ko), `accessibility` (139 Ko), `exporting` (31 Ko), `drilldown` (23 Ko) et `heatmap` (22 Ko).

## 3. Strata Charts : la refonte

Strata est une réécriture **« clean-room »** : aucune ligne de Highcharts n'a été copiée. Le code de Highcharts est sous licence propriétaire (« Integration of this software requires a license »). Seuls les **noms d'options**, qui forment un format de configuration public, sont repris par l'adaptateur `fromHighcharts()`.

| Problème identifié dans Highcharts | Choix de Strata |
|---|---|
| Objet global `H`, registre global | Registre **par graphique** : `new Chart(el, opts, { types: [line, column] })`, aucun état global |
| Enregistrement par effets de bord et patch de prototypes | Types de séries = objets simples `{ type, render, prepare?, tooltip? }`, `sideEffects: false`, *tree-shakable* |
| Fichiers de 120 à 160 Ko | 29 modules, environ 4 800 lignes au total ; le plus gros (`chart.ts`, interactions) fait 44 Ko |
| `addEvent` sur les prototypes | Émetteur typé : `chart.on('click', fn)` renvoie sa fonction de désabonnement |
| Animation impérative par élément | **Scène SVG à clés** : chaque rendu déclare l'état voulu ; les éléments sont réutilisés, les chemins *morphés* et les sorties animées en fondu |
| Thèmes en objets JS | **Variables CSS**, clair et sombre automatiques (`prefers-color-scheme`), `prefers-reduced-motion` respecté |
| Formats de date et de nombre maison | `Intl.NumberFormat` et `Intl.DateTimeFormat` (locale réelle, ex. `fr-FR`) |
| `innerHTML` + assainisseur | **Jamais** d'HTML injecté : les infobulles personnalisées sont du texte ou un `Node` |
| Module Boost (WebGL/Canvas) séparé | Décimation **LTTB** intégrée (~1 point par pixel) ; nuages de points de plus de 1 500 points dessinés en **un seul tracé SVG** |
| Module d'accessibilité de 139 Ko | Natif : SVG focalisable, navigation aux flèches, région `aria-live`, légende en `<button aria-pressed>` |

### Fonctionnalités livrées

- **Types :** line, spline, area, areaspline (empilés normal ou pourcentage), column, bar, scatter (mode rapide), bubble, candlestick, ohlc, waterfall, heatmap, pie, donut, **gauge** (anneaux ou cadran à aiguille), **treemap** (squarified, zoom par clic) et **sankey** (rubans en dégradé).
- **Axes :** linéaire, logarithmique, temporel (ticks calendaires), catégories ; **plusieurs axes Y** aux graduations alignées ; lignes de référence (`plotLines`).
- **Étiquettes :** étiquettes de données avec **anti-collision** (bascule à l'intérieur ou à l'extérieur de la barre selon la place, contraste automatique du texte) ; étiquettes de camembert **réparties sans chevauchement**.
- **Navigation :** zoom par glissement, Ctrl ou ⌘ + molette et pincement, défilement horizontal ; **navigateur** façon Stock avec fenêtre déplaçable et poignées ; boutons de période 1M, 3M, 6M, YTD, 1A, Tout.
- **Drilldown animé :** les formes morphent du parent vers les enfants ; retour par bouton ou Retour arrière.
- **Export et migration :** PNG, SVG autonome (styles résolus) et CSV ; adaptateur `fromHighcharts()` qui liste les options ignorées.

## 4. Mesures

| | Highcharts 13.1.1 | Strata 0.1 |
|---|---|---|
| Bundle minifié, cœur | 280 Ko (102 Ko gzip) | 90 Ko (32 Ko gzip) **avec les 15 types** |
| Équivalent fonctionnel de la démo | cœur + stock + more + heatmap + drilldown + exporting + accessibility ≈ 710 Ko | 90 Ko |
| Tests | – | 52 tests (Vitest + jsdom), tous verts |
| 50 000 points en courbe | Boost requis | rendu direct, ~1 point par pixel |

**Comparaison honnête :** Highcharts couvre beaucoup plus de choses. Ces fonctionnalités **ne sont pas** encore dans Strata :
- cartes (Maps), Gantt, 3D ;
- annotations, indicateurs techniques, sonification ;
- axes X multiples ;
- serveur d'export ;
- `responsive.rules`, connecteurs de données.

Les tailles comparent donc des périmètres différents.

## 5. Lancer le projet

```bash
cd strata
npm install
npm run dev        # démo sur http://localhost:5199
npm test           # 52 tests
npm run build      # dist/ (ESM + .d.ts)
```

```ts
import { createChart } from 'strata-charts';
import { fromHighcharts } from 'strata-charts/compat';

const chart = createChart('#el', {
  type: 'column',
  title: 'Ventes',
  locale: 'fr-FR',
  dataLabels: true,
  yAxis: [{ title: 'k€' }, { title: 'Marge %' }],
  series: [
    { name: 'CA', data: [['T1', 120], ['T2', 140]] },
    { name: 'Marge', type: 'spline', yAxis: 1, data: [['T1', 21], ['T2', 24]] },
  ],
});
chart.on('click', e => console.log(e.points));

// Configuration Highcharts existante :
createChart('#legacy', fromHighcharts(ancienneConfig));
```

## 6. Pistes suivantes

1. Types restants : radar, entonnoir (funnel), boîte à moustaches (box plot).
2. Rendu Canvas/WebGL optionnel au-delà d'environ 500 000 points.
3. Règles responsives (`responsive`) et annotations.
4. Tests visuels de non-régression (captures Playwright).
