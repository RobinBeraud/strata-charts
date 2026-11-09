# À quel point Strata est proche de Highcharts ?

Mesure faite sur les sources et les **165 exemples officiels** livrés avec Highcharts 13.1.1, le 9 novembre 2026.

## En bref

| Mesure | Résultat |
|---|---|
| Exemples officiels rendus **fidèlement** | **51 / 165 (31 %)** |
| Exemples rendus fidèlement **ou de façon approchante** | **75 / 165 (45 %)** |
| Score visuel pondéré, tous exemples confondus | **44 %** |
| Score visuel pondéré, sur les types que Strata gère | **77 %** |
| Options de configuration réellement utilisées par les exemples, prises en charge (pondéré par usage) | **46 %** (137 options distinctes sur 1 094) |
| Types de graphiques | **17 / 71** (24 %) |
| Indicateurs techniques boursiers | **0 / 48** |
| Modules d'extension | 10 complets, 14 partiels, 29 absents (sur 53 recensés) |
| Méthodes d'API publiques courantes | 13 équivalentes, 11 partielles, 11 absentes (sur 35) |

**Lecture :**
- **Forces.** Sur le cœur de métier (lignes, aires, colonnes, barres, camemberts, nuages, jauges, heatmap, sankey, treemap, cascade, chandeliers), Strata est proche ou équivalent dans les trois quarts des cas.
- **Faiblesses.** L'écart vient surtout de la largeur du catalogue (54 types de graphiques absents, graphiques polaires et 3D), puis d'options de mise en forme fine (alignements, épaisseurs, marges d'axes).

## Méthode

1. **Inventaire statique des sources** (`code/es-modules`). On relève :
   - tous les appels `registerSeriesType('…')` (119 types, dont 48 indicateurs) ;
   - les 77 modules de `code/modules` ;
   - les méthodes documentées `@function Highcharts.Chart#…`, `Series#…`, `Point#…` et `Axis#…`.
2. **Capture des exemples officiels.** Les 170 pages d'`examples/` sont ouvertes dans Chromium (Playwright), et 165 contiennent un graphique. Pour chaque graphique, on enregistre :
   - la configuration réelle (`chart.userOptions`) ;
   - une capture d'écran.
3. **Couverture des options.** Chaque configuration est aplatie en chemins d'options, par exemple `yAxis.labels.format`. Chaque chemin compte une fois par exemple, et on compare avec la liste des options que Strata honore. Les modules entiers comptent pour une seule entrée : `zAxis`, `annotations`, `responsive`, `data`, etc.
4. **Rendu Strata.** Chaque configuration passe par `convertHighcharts()` puis `createChart()`, et l'on capture le résultat.
5. **Comparaison visuelle.** Les 94 rendus possibles sont examinés côte à côte avec la capture Highcharts, puis notés :
   - **F** fidèle (même graphique, mêmes données, mêmes axes ; seul le style diffère) = 1 ;
   - **A** approchant (un élément notable manque) = 0,75 ;
   - **D** dégradé (trompeur ou parties majeures absentes) = 0,35 ;
   - **X** faux ou vide = 0.

Scripts : [`docs/compare/`](compare). Les captures Highcharts ne sont pas publiées.

## Détail des 165 exemples

| Verdict | Nombre | Exemples typiques |
|---|---|---|
| Fidèle | 51 | aires empilées, colonnes groupées/empilées/%, combos double et triple axe, régressions, heatmap, sankey, cascade, jauges speedometer et solid, camemberts, séries temporelles, axe log, bandes de tracé |
| Approchant | 24 | anneau multi-KPI (anneaux 270° au lieu de 360°), camembert à motifs, donut avec titre central personnalisé, prévision en pointillés (zones), treemap à niveaux, i18n |
| Dégradé | 9 | demi-camembert (`startAngle`/`endAngle`), nuage avec dispersion (`jitter`), sparklines, sankey vertical, treemap coloré par `colorAxis`, colonnes superposées (`grouping: false`) |
| Faux ou vide | 10 | horloge (jauge à 3 aiguilles), heatmap sur axe temporel, heatmap sur image, camemberts imbriqués, graphique `styled mode` pur CSS, graphiques synchronisés, boost à 500 000 et 1 000 000 de points |
| Non pris en charge (type absent) | 51 | treegraph (4), arearange, boxplot, organization, packedbubble (3 chacun), sunburst, venn, dumbbell, polygon, windbarb… |
| Non pris en charge (fonction absente) | 20 | 3D (10), polaire (7), coordonnées parallèles (2), dessin libre avec `renderer` (1) |

## Options les plus utilisées et encore manquantes

Nombre d'exemples qui les utilisent :

| Option | Exemples | Nature |
|---|---|---|
| `title.align`, `subtitle.align` | 47, 33 | mise en forme (Strata aligne à gauche) |
| `tooltip.headerFormat` | 43 | gabarit d'en-tête d'infobulle |
| `responsive.rules` | 25 | règles responsives |
| `xAxis.lineWidth`, `yAxis.lineWidth`, `chart.plotBorderWidth` | 21, 14, 16 | mise en forme |
| `legend.align`, `legend.layout` | 18, 15 | légende verticale ou à droite |
| `yAxis.endOnTick`, `startOnTick`, `xAxis.minPadding`, `maxPadding` | 15, 10, 12, 12 | marges d'axes |
| `series.dataLabels.style.*` | 15+ | style des étiquettes |
| `data.csv` (module data) | 15 | chargement CSV |
| `pane` (jauges, polaire) | 13 | panneaux |
| `series.marker.radius`, `series.borderRadius`, `series.lineWidth` | 10, 10, 9 | mise en forme |

## Ce que l'analyse a permis de corriger

L'analyse a servi de banc d'essai. Le score d'options est passé de **37,5 % à 45,7 %**, la médiane par exemple de **43 % à 52 %**, et plusieurs vrais bugs ont été corrigés.

| Problème trouvé | Correction |
|---|---|
| Highcharts 13 déclare les données dans `dataTable` + `dataMapping` (16 exemples), et Strata rendait des graphiques vides | prise en charge dans `convertHighcharts` |
| `pointStart` / `pointInterval` / `pointIntervalUnit` ignorés (abscisses 0, 1, 2…) | pris en charge |
| Gabarits `{point.y:.1f} mm`, `{value}°C` (infobulles, étiquettes d'axes et de données) | mini-moteur de gabarits ; les gabarits à fonctions (`{#if}`, `{divide …}`) sont détectés et laissés de côté |
| HTML dans les titres et catégories | converti en texte (Strata n'injecte jamais d'HTML) |
| Couleurs en dégradé, motif ou variable CSS Highcharts : 2 plantages, plus des points noirs et lignes invisibles | couleur de repli ; Strata accepte désormais les couleurs `var(--…)` |
| **Bug Strata :** sur un axe temporel de moins d'un jour, toutes les graduations affichaient la date au lieu de l'heure | corrigé (le format est lu après le calcul des graduations) |
| Ordre d'empilement inverse de Highcharts | aligné : première série en haut (`reversedStacks`) |
| Plusieurs `solidgauge` dans un même panneau | fusionnées en anneaux concentriques |
| Abscisses en millisecondes sans `type: 'datetime'` | axe temporel déduit automatiquement |
| Pas de `plotBands`, pas de `plotLines` en x, pas d'axe masqué (`visible: false`), pas de `colorByPoint` | ajoutés |
| Unités différentes par série (mm et °C sur un double axe) | l'infobulle affiche l'unité de chaque série |

## Feuille de route pour se rapprocher

Ordonnée par gain sur les exemples officiels :

1. **Mise en forme courante** (environ 150 usages) :
   - `title.align`, `legend.align` / `layout` ;
   - épaisseurs de traits, marges d'axes (`min/maxPadding`, `start/endOnTick`) ;
   - styles des étiquettes, `tooltip.headerFormat`.
2. **Types les plus demandés :** treegraph, arearange / columnrange (intervalles), boxplot, organization, packedbubble, sunburst, dumbbell.
3. **Graphiques polaires / radar :** 7 exemples, structure proche de la jauge existante.
4. **Camembert partiel** (`startAngle`/`endAngle`), camemberts imbriqués (`size`/`innerSize` par série), `jitter`, `grouping: false`.
5. **`responsive.rules`** et **module `data`** (CSV, tableau HTML).
6. **Rendu Canvas/WebGL** au-delà d'environ 300 000 points.
7. Plus tard, et peut-être jamais : 3D, cartes, Gantt, sonification, les 48 indicateurs boursiers.

Les étapes 1 à 4 feraient passer environ 35 exemples supplémentaires en « fidèle » ou « approchant ». Le taux dépasserait alors les 65 %.
