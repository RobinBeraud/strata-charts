/**
 * Theming = CSS custom properties. Light/dark follow `prefers-color-scheme`
 * unless `data-theme` forces one. Users restyle with plain CSS.
 */

const VARS_LIGHT = `--sc-bg:#ffffff;--sc-text:#0f172a;--sc-muted:#64748b;--sc-grid:rgba(100,116,139,.16);--sc-axis:rgba(100,116,139,.5);--sc-crosshair:rgba(100,116,139,.55);--sc-band:rgba(100,116,139,.08);--sc-select:rgba(99,102,241,.14);--sc-select-border:rgba(99,102,241,.65);--sc-tooltip:rgba(255,255,255,.88);--sc-tooltip-border:rgba(15,23,42,.08);--sc-shadow:0 10px 30px -8px rgba(15,23,42,.18);--sc-focus:#6366f1;`;
const VARS_DARK = `--sc-bg:#0f1423;--sc-text:#e2e8f0;--sc-muted:#94a3b8;--sc-grid:rgba(148,163,184,.13);--sc-axis:rgba(148,163,184,.4);--sc-crosshair:rgba(148,163,184,.5);--sc-band:rgba(148,163,184,.08);--sc-select:rgba(129,140,248,.16);--sc-select-border:rgba(129,140,248,.7);--sc-tooltip:rgba(23,30,48,.88);--sc-tooltip-border:rgba(255,255,255,.08);--sc-shadow:0 10px 30px -8px rgba(0,0,0,.55);--sc-focus:#818cf8;`;

/** Styles that apply inside the SVG. Also embedded (resolved) in SVG/PNG exports. */
export const SVG_CSS = `
.strata-grid{stroke:var(--sc-grid);stroke-width:1;shape-rendering:crispEdges}
.strata-zero{stroke:var(--sc-axis)}
.strata-axis-line{stroke:var(--sc-axis);stroke-width:1;shape-rendering:crispEdges}
.strata-tick-label{fill:var(--sc-muted);font-size:11.5px;font-variant-numeric:tabular-nums}
.strata-axis-title{fill:var(--sc-muted);font-size:12px;font-weight:500}
.strata-plotline{stroke-width:1.25;stroke-dasharray:4 4}
.strata-plotband{fill:var(--sc-band)}
.strata-plotband-label{fill:var(--sc-muted);font-size:11px;font-weight:600}
.strata-plotline-label{font-size:11px;font-weight:600;paint-order:stroke;stroke:var(--sc-bg);stroke-width:3px}
.strata-marker{stroke:var(--sc-bg);stroke-width:1.75}
.strata-hover-marker{stroke:var(--sc-bg);stroke-width:2.5}
.strata-crosshair{stroke:var(--sc-crosshair);stroke-width:1;stroke-dasharray:3 3}
.strata-band{fill:var(--sc-band)}
.strata-selection{fill:var(--sc-select);stroke:var(--sc-select-border);stroke-width:1}
.strata-slice{stroke:var(--sc-bg);stroke-width:2}
.strata-pie-label{fill:var(--sc-text);font-size:12px}
.strata-pie-pct{fill:var(--sc-muted)}
.strata-pie-connector{fill:none;stroke:var(--sc-axis);stroke-width:1}
.strata-center-value{fill:var(--sc-text);font-size:22px;font-weight:650;font-variant-numeric:tabular-nums}
.strata-center-label{fill:var(--sc-muted);font-size:11.5px}
.strata-data-label{fill:var(--sc-text);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;paint-order:stroke;stroke:var(--sc-bg);stroke-width:3px;stroke-linejoin:round}
.strata-data-label.is-inside{fill:#0f172a;stroke:none}
.strata-data-label.is-light{fill:#ffffff}
.strata-connector{stroke:var(--sc-axis);stroke-width:1;stroke-dasharray:3 3;fill:none}
.strata-cell{stroke:none}
.strata-nav-bg{fill:var(--sc-band);stroke:var(--sc-grid)}
.strata-nav-mask{fill:var(--sc-bg);fill-opacity:.55}
.strata-nav-brush{fill:var(--sc-select);stroke:var(--sc-select-border);stroke-width:1}
.strata-nav-handle{fill:var(--sc-bg);stroke:var(--sc-select-border);stroke-width:1.25}
.strata-title-export{fill:var(--sc-text);font-size:15px;font-weight:650}
.strata-subtitle-export{fill:var(--sc-muted);font-size:12.5px}
.strata-gauge-track{fill:var(--sc-band);stroke:none}
.strata-gauge-value{fill:var(--sc-text);font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.strata-gauge-label{fill:var(--sc-muted);font-size:12px}
.strata-gauge-trackline{stroke:var(--sc-band)}
.strata-gauge-tick{stroke:var(--sc-axis);stroke-width:1.25}
.strata-gauge-ticklabel{fill:var(--sc-muted);font-size:10.5px;font-variant-numeric:tabular-nums}
.strata-gauge-needle{fill:var(--sc-text)}
.strata-gauge-hub{fill:var(--sc-bg);stroke:var(--sc-text);stroke-width:2.5}
.strata-tm-label{font-size:12px;font-weight:600;pointer-events:none}
.strata-tm-value{font-size:11px;fill-opacity:.8;font-variant-numeric:tabular-nums;pointer-events:none}
.strata-tm-header{font-size:11px;font-weight:650;letter-spacing:.02em;text-transform:uppercase;pointer-events:none}
.strata-tm-cell{stroke:var(--sc-bg);stroke-width:1.5}
.strata-tm-cell.is-hover{stroke:var(--sc-text);stroke-width:2}
.strata-sk-node{stroke:none}
.strata-sk-link{fill-opacity:.38;transition:fill-opacity .2s,opacity .2s}
.strata-sk-link.is-hover{fill-opacity:.65}
.strata-sk-label{fill:var(--sc-text);font-size:12px;font-weight:550;paint-order:stroke;stroke:var(--sc-bg);stroke-width:3px;stroke-linejoin:round;pointer-events:none}
.strata-sk-value{fill:var(--sc-muted);font-weight:500}
`;

const CSS = `
.strata{${VARS_LIGHT}position:relative;display:flex;flex-direction:column;gap:8px;box-sizing:border-box;padding:16px 16px 12px;background:var(--sc-bg);color:var(--sc-text);font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;border-radius:14px;-webkit-font-smoothing:antialiased;min-width:0}
@media (prefers-color-scheme:dark){.strata:not([data-theme=light]){${VARS_DARK}}}
.strata[data-theme=dark]{${VARS_DARK}}
.strata *,.strata *::before,.strata *::after{box-sizing:border-box}
.strata-header{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px 12px;min-height:0}
.strata-titles{min-width:0}
.strata-header:empty{display:none}
.strata-title{margin:0;font-size:15px;font-weight:650;letter-spacing:-.01em;line-height:1.3}
.strata-subtitle{margin:2px 0 0;color:var(--sc-muted);font-size:12.5px}
.strata-toolbar{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:6px;margin-left:auto}
.strata-btn{appearance:none;border:1px solid var(--sc-grid);background:transparent;color:var(--sc-muted);font:inherit;font-size:12px;line-height:1;padding:6px 10px;border-radius:8px;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.strata-btn:hover{background:var(--sc-band);color:var(--sc-text)}
.strata-btn[hidden]{display:none}
.strata-btn:focus-visible,.strata-legend-item:focus-visible,.strata-menu button:focus-visible{outline:2px solid var(--sc-focus);outline-offset:2px}
.strata-menu{position:absolute;right:16px;top:48px;z-index:6;display:flex;flex-direction:column;min-width:170px;padding:4px;background:var(--sc-tooltip);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--sc-tooltip-border);border-radius:10px;box-shadow:var(--sc-shadow)}
.strata-menu[hidden]{display:none}
.strata-menu button{appearance:none;border:0;background:transparent;color:var(--sc-text);text-align:left;font:inherit;font-size:12.5px;padding:7px 10px;border-radius:6px;cursor:pointer}
.strata-menu button:hover{background:var(--sc-band)}
.strata-legend{display:flex;flex-wrap:wrap;gap:2px 4px;margin:0 -6px}
.strata-legend:empty{display:none}
.strata-legend-item{display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--sc-text);font:inherit;font-size:12.5px;padding:4px 8px;border-radius:999px;cursor:pointer;transition:opacity .2s,background .15s}
.strata-legend-item:hover{background:var(--sc-band)}
.strata-legend-item[aria-pressed=false]{opacity:.5}
.strata-legend-item[aria-pressed=false] .strata-swatch{background:transparent!important;box-shadow:inset 0 0 0 1.5px currentColor}
.strata-swatch{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.strata-stage{position:relative;width:100%;min-width:0}
.strata-stage>svg{display:block;width:100%;overflow:visible;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.strata-stage>svg:focus{outline:none}
.strata-stage>svg:focus-visible{outline:2px solid var(--sc-focus);outline-offset:4px;border-radius:6px}
.strata-series{transition:opacity .2s}
.strata-dim .strata-series:not(.is-hover){opacity:.18}
.strata-slice{transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .2s}
.strata-item{transition:opacity .2s}
.strata-dim .strata-item:not(.is-hover){opacity:.35}
.strata-dim .strata-cell-group.strata-item:not(.is-hover){opacity:1}
.strata-bar{transition:filter .15s}
.strata-bar.is-hover{filter:brightness(1.12) saturate(1.1)}
.strata-tooltip{position:absolute;left:0;top:0;pointer-events:none;z-index:5;min-width:150px;max-width:300px;padding:8px 10px;background:var(--sc-tooltip);-webkit-backdrop-filter:blur(12px) saturate(1.4);backdrop-filter:blur(12px) saturate(1.4);border:1px solid var(--sc-tooltip-border);border-radius:10px;box-shadow:var(--sc-shadow);font-size:12.5px;opacity:0;transition:opacity .15s,transform .1s ease-out;will-change:transform}
.strata-tooltip.is-visible{opacity:1}
.strata-tt-head{font-weight:600;margin-bottom:4px}
.strata-tt-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:8px;padding:1px 0}
.strata-tt-row.is-total{border-top:1px solid var(--sc-grid);margin-top:4px;padding-top:5px}
.strata-tt-row .strata-swatch{width:8px;height:8px;border-radius:50%}
.strata-tt-name{color:var(--sc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.strata-tt-val{font-variant-numeric:tabular-nums;font-weight:600;text-align:right;white-space:nowrap}
.strata-tt-pct{color:var(--sc-muted);font-weight:500;margin-left:4px}
.strata-icon-btn{display:inline-flex;align-items:center;justify-content:center;padding:5px 7px}
.strata-ranges{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--sc-grid);border-radius:9px}
.strata-ranges:empty{display:none}
.strata-range{appearance:none;border:0;background:transparent;color:var(--sc-muted);font:inherit;font-size:11.5px;font-weight:550;padding:4px 8px;border-radius:7px;cursor:pointer;transition:background .15s,color .15s}
.strata-range:hover{color:var(--sc-text);background:var(--sc-band)}
.strata-range[aria-pressed=true]{background:var(--sc-select);color:var(--sc-text)}
.strata-range:focus-visible{outline:2px solid var(--sc-focus);outline-offset:1px}
.strata-colorlegend{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--sc-muted);font-variant-numeric:tabular-nums;padding:0 6px}
.strata-colorbar{width:min(260px,50vw);height:8px;border-radius:99px}
.strata-tt-hint{margin-top:5px;font-size:11px;color:var(--sc-muted)}
.strata-layer-nav{cursor:inherit}
.strata-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.strata *{transition:none!important}}
${SVG_CSS}`;

export function ensureStyles(doc: Document = document): void {
  if (doc.getElementById('strata-styles')) return;
  const style = doc.createElement('style');
  style.id = 'strata-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** Replace var(--x) with the computed value on `el`, for standalone exports. */
export function resolveVars(css: string, el: Element): string {
  const cs = getComputedStyle(el);
  return css.replace(/var\((--[\w-]+)\)/g, (_, name: string) => cs.getPropertyValue(name).trim() || 'currentColor');
}
