import { Scene, html, svg } from '../render/scene';
import type { BandScale } from '../scales/band';
import { formatDateFull } from '../scales/time';
import { renderCartesian, renderStandalone, type CartesianFrame, type Env, type Frame, type Layers, type StandaloneFrame } from './cartesian';
import { Emitter } from './events';
import { formatValue } from './format';
import { buildModel, type Model, type NSeries, type Point, type Visibility } from './model';
import { Registry, type CartesianSeriesType, type HitPoint, type SeriesType, type StandaloneItem, type StandaloneSeriesType } from './registry';
import { ensureStyles, resolveVars, SVG_CSS } from './theme';
import type { ChartOptions, PointInput, RangeButton, TooltipOptions, TooltipRow } from './types';

export interface ChartConfig {
  /** Series types available to this chart. Nothing is registered globally. */
  types: SeriesType[];
}

export interface ChartEventMap {
  render: { chart: Chart };
  hover: { points: Point[] };
  click: { points: Point[] };
  toggle: { key: string; name: string; visible: boolean };
  zoom: { range: [number, number] | null };
  drilldown: { point: Point | null; depth: number };
}

let counter = 0;
const DEFAULT_HEIGHT = 340;
const DEFAULT_DURATION = 650;
const DAY = 86400000;
export const DEFAULT_RANGES: RangeButton[] = [
  { label: '1M', range: 30 * DAY },
  { label: '3M', range: 91 * DAY },
  { label: '6M', range: 182 * DAY },
  { label: 'YTD', range: 'ytd' },
  { label: '1A', range: 365 * DAY },
  { label: 'Tout', range: 'all' },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function nearest(points: HitPoint[], along: number): number {
  let lo = 0;
  let hi = points.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].along < along) lo = mid;
    else hi = mid;
  }
  return Math.abs(points[lo].along - along) <= Math.abs(points[hi].along - along) ? lo : hi;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Hovered =
  | { kind: 'cartesian'; hits: HitPoint[] }
  | { kind: 'standalone'; item: StandaloneItem }
  | null;

interface NavDrag {
  mode: 'l' | 'r' | 'pan';
  startX: number;
  brush: [number, number];
}

export class Chart {
  readonly root: HTMLDivElement;
  private readonly header: HTMLDivElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly subtitleEl: HTMLParagraphElement;
  private readonly rangeBox: HTMLDivElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly exportBtn: HTMLButtonElement;
  private readonly menu: HTMLDivElement;
  private readonly legend: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly tooltip: HTMLDivElement;
  private readonly live: HTMLDivElement;
  private readonly layers: Layers;

  private readonly scene = new Scene();
  private readonly events = new Emitter<ChartEventMap>();
  private readonly registry: Registry;
  private readonly uid = `strata${++counter}`;
  private vis: Visibility = { series: new Map(), points: new Map() };

  private opts: ChartOptions;
  private model!: Model;
  private frame: Frame | null = null;
  private view: [number, number] | null = null;
  private activeRange: string | null = null;
  /** Undo steps for "Back": drilldowns and in-place navigation (treemap zoom). */
  private backStack: (() => void)[] = [];
  /** Per-chart UI state handed to standalone series (survives re-renders). */
  private readonly state = new Map<string, unknown>();
  private hovered: Hovered = null;
  private hoverKey = '';
  private active = -1;
  private drag: { start: number; cur: number } | null = null;
  private navDrag: NavDrag | null = null;
  private width = 0;
  private height = 0;
  private font = 'system-ui, sans-serif';
  private ro?: ResizeObserver;
  private raf = 0;
  private destroyed = false;
  private measureCtx: CanvasRenderingContext2D | null | undefined;

  constructor(target: HTMLElement | string, options: ChartOptions, config: ChartConfig) {
    const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
    if (!host) throw new Error(`[strata] Container not found: ${String(target)}`);
    ensureStyles(host.ownerDocument);
    this.registry = new Registry(config.types);
    this.opts = options;

    this.root = html('div', { class: 'strata' });
    this.header = html('div', { class: 'strata-header' }, this.root);
    const titles = html('div', { class: 'strata-titles' }, this.header);
    this.titleEl = html('h3', { class: 'strata-title' }, titles);
    this.subtitleEl = html('p', { class: 'strata-subtitle' }, titles);
    const toolbar = html('div', { class: 'strata-toolbar' }, this.header);
    this.rangeBox = html('div', { class: 'strata-ranges', attrs: { role: 'group', 'aria-label': 'Période' } }, toolbar);
    this.backBtn = html('button', { class: 'strata-btn', text: '‹ Retour', attrs: { type: 'button' } }, toolbar);
    this.resetBtn = html('button', { class: 'strata-btn', text: 'Réinitialiser', attrs: { type: 'button' } }, toolbar);
    this.exportBtn = html('button', {
      class: 'strata-btn strata-icon-btn',
      attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Exporter', title: 'Exporter' },
    }, toolbar);
    this.exportBtn.append(svg('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' }));
    svg('path', { d: 'M8 2v8m0 0L5 7m3 3 3-3M3 12.5h10', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.exportBtn.firstChild as Element);
    this.menu = html('div', { class: 'strata-menu', attrs: { role: 'menu' } }, this.root);
    this.menu.hidden = true;
    for (const [fmt, label] of [['png', 'Image PNG'], ['svg', 'Vectoriel SVG'], ['csv', 'Données CSV']] as const) {
      html('button', { text: label, attrs: { type: 'button', role: 'menuitem', 'data-format': fmt } }, this.menu);
    }
    this.legend = html('div', { class: 'strata-legend', attrs: { role: 'group', 'aria-label': 'Légende' } });
    this.stage = html('div', { class: 'strata-stage' }, this.root);
    this.svg = svg('svg', { role: 'img', tabindex: 0, focusable: 'true' }, this.stage);
    this.layers = {
      defs: svg('defs', {}, this.svg) as unknown as SVGGElement,
      grid: svg('g', { class: 'strata-layer-grid' }, this.svg),
      under: svg('g', { class: 'strata-layer-under' }, this.svg),
      series: svg('g', { class: 'strata-layer-series' }, this.svg),
      labels: svg('g', { class: 'strata-layer-labels', 'pointer-events': 'none' }, this.svg),
      axes: svg('g', { class: 'strata-layer-axes' }, this.svg),
      nav: svg('g', { class: 'strata-layer-nav' }, this.svg),
      hover: svg('g', { class: 'strata-layer-hover', 'pointer-events': 'none' }, this.svg),
      overlay: svg('g', { class: 'strata-layer-overlay', 'pointer-events': 'none' }, this.svg),
    };
    this.tooltip = html('div', { class: 'strata-tooltip', attrs: { 'aria-hidden': 'true' } }, this.stage);
    this.live = html('div', { class: 'strata-sr', attrs: { 'aria-live': 'polite', role: 'status' } }, this.root);

    host.appendChild(this.root);
    this.bind();
    this.render(true);

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        if (Math.round(this.stage.clientWidth) !== this.width) this.schedule();
      });
      this.ro.observe(this.stage);
    }
  }

  // ---------------------------------------------------------------- API

  get options(): Readonly<ChartOptions> {
    return this.opts;
  }

  /** Shallow-merges options and re-renders, animating from the previous state. */
  update(partial: Partial<ChartOptions>, animate = true): this {
    this.opts = { ...this.opts, ...partial };
    this.render(animate);
    return this;
  }

  setData(series: number | string, data: PointInput[], animate = true): this {
    const i = typeof series === 'number' ? series : this.opts.series.findIndex((s, k) => (s.id ?? `s${k}`) === series);
    if (i < 0 || i >= this.opts.series.length) throw new Error(`[strata] No series ${String(series)}`);
    const next = this.opts.series.slice();
    next[i] = { ...next[i], data };
    return this.update({ series: next }, animate);
  }

  /** Show/hide a series (by id) or a pie slice ("seriesId:pointIndex"). */
  setVisible(key: string, visible: boolean): this {
    (key.includes(':') ? this.vis.points : this.vis.series).set(key, visible);
    this.render(true);
    const name = this.legendItems().find(i => i.key === key)?.name ?? key;
    this.events.emit('toggle', { key, name, visible });
    return this;
  }

  /** Set the visible x window (data units; category indices on category axes). `null` resets. */
  zoom(range: [number, number] | null, animate = true): this {
    this.view = range;
    this.activeRange = null;
    this.render(animate);
    this.events.emit('zoom', { range });
    return this;
  }

  /** Open the drilldown series of a point (same as clicking it). */
  drillDown(point: Point): boolean {
    const target = point.drilldown ? this.opts.drilldown?.series.find(s => s.id === point.drilldown) : undefined;
    if (!target) return false;
    const prev = { options: this.opts, view: this.view, vis: this.vis };
    this.backStack.push(() => {
      this.opts = prev.options;
      this.view = prev.view;
      this.vis = prev.vis;
    });
    const parent = point.series;
    this.vis = { series: new Map(), points: new Map() };
    this.view = null;
    const polar = this.registry.get(parent.type)?.kind === 'standalone';
    this.opts = {
      ...this.opts,
      subtitle: [this.opts.title, point.label].filter(Boolean).join(' › '),
      title: target.name ?? point.label,
      xAxis: { ...this.opts.xAxis, categories: undefined },
      // Keep the parent's id so shapes morph from the parent's into the children's.
      series: [{ ...target, id: parent.id, type: target.type ?? parent.rawType, color: target.color ?? (polar ? undefined : point.color) }],
    };
    this.render(true);
    this.events.emit('drilldown', { point, depth: this.backStack.length });
    return true;
  }

  drillUp(): this {
    const undo = this.backStack.pop();
    if (!undo) return this;
    undo();
    this.render(true);
    this.events.emit('drilldown', { point: null, depth: this.backStack.length });
    return this;
  }

  on<K extends keyof ChartEventMap>(type: K, fn: (e: ChartEventMap[K]) => void): () => void {
    return this.events.on(type, fn);
  }

  destroy(): void {
    this.destroyed = true;
    this.ro?.disconnect();
    cancelAnimationFrame(this.raf);
    this.scene.dispose();
    this.events.clear();
    document.removeEventListener('pointerdown', this.onDocDown);
    this.root.remove();
  }

  // ---------------------------------------------------------------- Export

  /** Standalone SVG (styles resolved, title included). */
  toSVG(): string {
    this.scene.finish();
    const W = this.width;
    const H = this.height;
    const o = this.opts;
    const head = o.title ? (o.subtitle ? 50 : 32) : 0;
    const out = svg('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: W,
      height: H + head,
      viewBox: `0 0 ${W} ${H + head}`,
      'font-family': this.font,
    });
    const style = svg('style', {}, out);
    style.textContent = resolveVars(SVG_CSS, this.root);
    svg('rect', { width: W, height: H + head, fill: resolveVars('var(--sc-bg)', this.root) }, out);
    if (o.title) {
      svg('text', { x: 12, y: 22, class: 'strata-title-export' }, out).textContent = o.title;
      if (o.subtitle) svg('text', { x: 12, y: 40, class: 'strata-subtitle-export' }, out).textContent = o.subtitle;
    }
    const body = svg('g', { transform: `translate(0,${head})` }, out);
    for (const key of ['defs', 'grid', 'under', 'series', 'labels', 'axes', 'nav'] as const) {
      body.appendChild(this.layers[key].cloneNode(true));
    }
    return new XMLSerializer().serializeToString(out);
  }

  async toPNG(scale = 2): Promise<Blob> {
    const text = this.toSVG();
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('[strata] Could not rasterize SVG'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('[strata] Canvas 2D unavailable');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('[strata] PNG encoding failed'))), 'image/png'),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  toCSV(): string {
    const m = this.model;
    const lines: string[] = [];
    if (m.cartesian.length) {
      const xs = [...new Set(m.cartesian.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
      lines.push([this.opts.xAxis?.title ?? (m.xType === 'time' ? 'Date' : m.xType === 'category' ? 'Category' : 'X'), ...m.cartesian.map(s => s.name)].map(csvCell).join(','));
      const byX = m.cartesian.map(s => new Map(s.points.map(p => [p.x, p.z ?? p.y] as const)));
      for (const xv of xs) {
        const label = m.xType === 'category' ? m.categories[xv] : m.xType === 'time' ? new Date(xv).toISOString() : xv;
        lines.push([label, ...byX.map(map => map.get(xv) ?? null)].map(csvCell).join(','));
      }
    } else {
      lines.push(['Series', 'Name', 'Value'].map(csvCell).join(','));
      for (const s of m.standalone) for (const p of s.points) lines.push([s.name, p.label, p.y].map(csvCell).join(','));
    }
    return lines.join('\n');
  }

  async download(format: 'png' | 'svg' | 'csv' = 'png', filename?: string): Promise<void> {
    const name = filename ?? (this.opts.title ?? 'chart').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    const blob =
      format === 'png' ? await this.toPNG()
      : format === 'svg' ? new Blob([this.toSVG()], { type: 'image/svg+xml' })
      : new Blob(['﻿' + this.toCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name || 'chart'}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------------------------------------------------------------- Render

  private duration(): number {
    const a = this.opts.animation;
    if (a === false) return 0;
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    return typeof a === 'object' ? a.duration ?? DEFAULT_DURATION : DEFAULT_DURATION;
  }

  private schedule(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.render(false));
  }

  private measure = (text: string, size = 11.5): number => {
    if (this.measureCtx === undefined) {
      try {
        this.measureCtx = document.createElement('canvas').getContext('2d');
      } catch {
        this.measureCtx = null;
      }
    }
    if (!this.measureCtx) return text.length * size * 0.56;
    this.measureCtx.font = `${size}px ${this.font}`;
    return this.measureCtx.measureText(text).width;
  };

  private typeOf(s: NSeries): SeriesType | undefined {
    return this.registry.get(s.type);
  }

  private render(animate: boolean): void {
    if (this.destroyed) return;
    const o = this.opts;
    if (o.theme && o.theme !== 'auto') this.root.dataset.theme = o.theme;
    else delete this.root.dataset.theme;
    this.font = getComputedStyle(this.root).fontFamily || this.font;
    this.width = Math.max(160, Math.round(this.stage.clientWidth || 640));
    this.height = o.height ?? DEFAULT_HEIGHT;
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute('height', String(this.height));

    this.model = buildModel(o, this.registry, this.vis);
    this.clearHover();
    this.scene.begin(animate ? this.duration() : 0);
    const env: Env = {
      scene: this.scene,
      layers: this.layers,
      model: this.model,
      opts: o,
      registry: this.registry,
      width: this.width,
      height: this.height,
      view: this.view,
      uid: this.uid,
      locale: o.locale,
      measure: this.measure,
    };
    this.frame = this.model.cartesian.length ? renderCartesian(env) : renderStandalone(env, this.state);
    this.scene.end();

    this.renderHeader();
    this.renderLegend();
    this.svg.setAttribute('aria-label', this.describe());
    this.events.emit('render', { chart: this });
  }

  private rangeButtons(): RangeButton[] | null {
    const rs = this.opts.rangeSelector;
    if (rs === false || this.model.xType !== 'time') return null;
    if (!rs && !this.opts.navigator) return null;
    return Array.isArray(rs) ? rs : DEFAULT_RANGES;
  }

  private renderHeader(): void {
    const o = this.opts;
    this.titleEl.textContent = o.title ?? '';
    this.titleEl.hidden = !o.title;
    this.subtitleEl.textContent = o.subtitle ?? '';
    this.subtitleEl.hidden = !o.subtitle;
    this.backBtn.hidden = !this.backStack.length;
    const ranges = this.rangeButtons();
    this.resetBtn.hidden = !this.view || !!ranges;
    this.exportBtn.hidden = o.exporting === false;
    if (ranges) {
      if (this.rangeBox.childElementCount !== ranges.length) {
        this.rangeBox.replaceChildren(...ranges.map(r => html('button', { class: 'strata-range', text: r.label, attrs: { type: 'button' } })));
      }
      const current = this.view ? this.activeRange : 'all-implicit';
      ranges.forEach((r, i) => {
        const b = this.rangeBox.children[i] as HTMLButtonElement;
        const on = current === r.label || (current === 'all-implicit' && r.range === 'all');
        b.setAttribute('aria-pressed', String(on));
      });
    } else this.rangeBox.replaceChildren();
    this.header.hidden = !o.title && !o.subtitle && !this.view && o.exporting === false && !ranges && !this.backStack.length;
  }

  private legendItems(): { key: string; name: string; color: string; visible: boolean }[] {
    const m = this.model;
    if (m.cartesian.length) return m.cartesian.map(s => ({ key: s.id, name: s.name, color: s.color, visible: s.visible }));
    return m.standalone.flatMap(s => {
      const mode = (this.typeOf(s) as StandaloneSeriesType | undefined)?.legend ?? 'points';
      if (mode === 'none') return [];
      if (mode === 'series') return [{ key: s.id, name: s.name, color: s.color, visible: s.visible }];
      return s.points.filter(p => !p.parent).map(p => ({ key: `${s.id}:${p.index}`, name: p.label, color: p.color, visible: p.visible }));
    });
  }

  private renderLegend(): void {
    const opt = this.opts.legend;
    const onTop = typeof opt === 'object' && opt.position === 'top';
    const anchor = onTop ? this.stage : this.live;
    if (this.legend.nextSibling !== anchor) this.root.insertBefore(this.legend, anchor);
    if (opt === false) {
      this.legend.replaceChildren();
      return;
    }

    // Continuous colour legend (heatmaps).
    const scaled = this.model.cartesian.find(s => s.visible && (this.typeOf(s) as CartesianSeriesType | undefined)?.colorScale);
    if (scaled) {
      const info = (this.typeOf(scaled) as CartesianSeriesType).colorScale!(scaled);
      const box = html('div', { class: 'strata-colorlegend' });
      const fmt = (v: number) => formatValue(v, this.opts.locale, { maximumFractionDigits: 1 });
      html('span', { text: fmt(info.min) }, box);
      const bar = html('span', { class: 'strata-colorbar' }, box);
      bar.style.background = `linear-gradient(90deg, ${info.colors.join(', ')})`;
      html('span', { text: fmt(info.max) }, box);
      this.legend.replaceChildren(box);
      return;
    }

    const items = this.legendItems();
    if (items.length < 2) {
      this.legend.replaceChildren();
      return;
    }
    const existing = new Map<string, HTMLButtonElement>();
    for (const b of Array.from(this.legend.children) as HTMLButtonElement[]) if (b.dataset.key) existing.set(b.dataset.key, b);
    const next: HTMLButtonElement[] = [];
    for (const it of items) {
      let b = existing.get(it.key);
      if (!b) {
        b = html('button', { class: 'strata-legend-item', attrs: { type: 'button', 'data-key': it.key } });
        html('span', { class: 'strata-swatch' }, b);
        html('span', { class: 'strata-legend-label' }, b);
      }
      (b.firstChild as HTMLElement).style.background = it.color;
      (b.lastChild as HTMLElement).textContent = it.name;
      b.setAttribute('aria-pressed', String(it.visible));
      b.title = `${it.visible ? 'Masquer' : 'Afficher'} ${it.name}`;
      next.push(b);
    }
    this.legend.replaceChildren(...next);
  }

  private describe(): string {
    const m = this.model;
    const o = this.opts;
    const kinds = [...new Set(m.series.map(s => s.rawType))].join(', ');
    const names = m.series.map(s => s.name).join(', ');
    const parts = [
      o.title ?? 'Chart',
      `${kinds} chart, ${m.series.length} series: ${names}.`,
      o.description ?? '',
      'Use the arrow keys to move between data points.',
    ];
    return parts.filter(Boolean).join(' ');
  }

  // ---------------------------------------------------------------- Interaction

  private bind(): void {
    const s = this.svg;
    s.addEventListener('pointermove', this.onMove);
    s.addEventListener('pointerdown', this.onDown);
    s.addEventListener('pointerup', this.onUp);
    s.addEventListener('pointercancel', () => {
      this.drag = null;
      this.navDrag = null;
      this.layers.overlay.replaceChildren();
    });
    s.addEventListener('pointerleave', () => {
      if (!this.drag && !this.navDrag) this.clearHover();
    });
    s.addEventListener('dblclick', () => {
      if (this.view) this.zoom(null);
    });
    s.addEventListener('wheel', this.onWheel, { passive: false });
    s.addEventListener('keydown', this.onKey);
    s.addEventListener('blur', () => this.clearHover());

    this.legend.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('.strata-legend-item');
      if (b) this.setVisible(b.dataset.key!, b.getAttribute('aria-pressed') !== 'true');
    });
    this.legend.addEventListener('pointerover', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('.strata-legend-item');
      this.highlight(b && b.getAttribute('aria-pressed') === 'true' ? b.dataset.key! : null);
    });
    this.legend.addEventListener('pointerleave', () => this.highlight(null));
    this.legend.addEventListener('focusin', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('.strata-legend-item');
      if (b) this.highlight(b.dataset.key!);
    });
    this.legend.addEventListener('focusout', () => this.highlight(null));

    this.rangeBox.addEventListener('click', e => {
      const b = (e.target as Element).closest('button');
      const ranges = this.rangeButtons();
      if (!b || !ranges) return;
      const r = ranges[Array.prototype.indexOf.call(this.rangeBox.children, b)];
      if (r) this.applyRange(r);
    });
    this.backBtn.addEventListener('click', () => this.drillUp());
    this.resetBtn.addEventListener('click', () => this.zoom(null));
    this.exportBtn.addEventListener('click', () => this.toggleMenu());
    this.menu.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-format]');
      if (!b) return;
      this.toggleMenu(false);
      void this.download(b.dataset.format as 'png' | 'svg' | 'csv');
    });
    this.menu.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.toggleMenu(false);
        this.exportBtn.focus();
      }
    });
    document.addEventListener('pointerdown', this.onDocDown);
  }

  private applyRange(r: RangeButton): void {
    const f = this.frame;
    if (!f || f.kind !== 'cartesian') return;
    const [lo, hi] = f.full;
    let range: [number, number] | null;
    if (r.range === 'all') range = null;
    else if (r.range === 'ytd') range = [Math.max(lo, new Date(new Date(hi).getFullYear(), 0, 1).getTime()), hi];
    else range = [Math.max(lo, hi - r.range), hi];
    this.zoom(range);
    this.activeRange = r.label;
    this.renderHeader();
  }

  private onDocDown = (e: PointerEvent): void => {
    if (!this.menu.hidden && !this.menu.contains(e.target as Node) && !this.exportBtn.contains(e.target as Node)) this.toggleMenu(false);
  };

  private toggleMenu(open = this.menu.hidden): void {
    this.menu.hidden = !open;
    this.exportBtn.setAttribute('aria-expanded', String(open));
    if (open) (this.menu.firstElementChild as HTMLElement | null)?.focus();
  }

  private highlight(key: string | null): void {
    this.svg.classList.toggle('strata-dim', !!key);
    for (const el of Array.from(this.svg.querySelectorAll('.strata-series.is-hover, .strata-item.is-hover'))) el.classList.remove('is-hover');
    if (!key) return;
    const sel = key.includes(':') ? `[data-key="${CSS.escape(key)}"]` : `[data-series="${CSS.escape(key)}"]`;
    this.svg.querySelector(sel)?.classList.add('is-hover');
  }

  private pointer(ev: PointerEvent | WheelEvent): [number, number] {
    const r = this.svg.getBoundingClientRect();
    const k = r.width ? this.width / r.width : 1;
    return [(ev.clientX - r.left) * k, (ev.clientY - r.top) * k];
  }

  private inNav(f: CartesianFrame, mx: number, my: number): boolean {
    const n = f.nav;
    return !!n && mx >= n.rect.left - 10 && mx <= n.rect.left + n.rect.width + 10 && my >= n.rect.top && my <= n.rect.top + n.rect.height;
  }

  private setViewFromNav(a: number, b: number): void {
    const f = this.frame;
    if (!f || f.kind !== 'cartesian' || !f.nav) return;
    const { rect, scale } = f.nav;
    const right = rect.left + rect.width;
    a = clamp(a, rect.left, right);
    b = clamp(b, rect.left, right);
    if (b - a < 6) return;
    this.view = a <= rect.left + 0.5 && b >= right - 0.5 ? null : [scale.invert(a), scale.invert(b)];
    this.activeRange = null;
    this.schedule();
  }

  private onMove = (ev: PointerEvent): void => {
    const f = this.frame;
    if (!f) return;
    const [mx, my] = this.pointer(ev);
    if (f.kind === 'cartesian') {
      if (this.navDrag && f.nav) {
        const d = this.navDrag;
        const dx = mx - d.startX;
        const [a, b] = d.brush;
        const { rect } = f.nav;
        if (d.mode === 'pan') {
          const w = b - a;
          const na = clamp(a + dx, rect.left, rect.left + rect.width - w);
          this.setViewFromNav(na, na + w);
        } else if (d.mode === 'l') this.setViewFromNav(Math.min(a + dx, b - 6), b);
        else this.setViewFromNav(a, Math.max(b + dx, a + 6));
        return;
      }
      if (this.inNav(f, mx, my)) {
        const [a, b] = f.nav!.brush;
        this.svg.style.cursor = Math.abs(mx - a) <= 8 || Math.abs(mx - b) <= 8 ? 'ew-resize' : mx > a && mx < b ? 'grab' : 'pointer';
        this.clearHover();
        return;
      }
      const along = f.inverted ? my : mx;
      if (this.drag) {
        const lo = f.inverted ? f.plot.top : f.plot.left;
        const hi = lo + (f.inverted ? f.plot.height : f.plot.width);
        this.drag.cur = clamp(along, lo, hi);
        this.drawSelection(f);
        return;
      }
      const p = f.plot;
      if (mx < p.left - 6 || mx > p.left + p.width + 6 || my < p.top - 6 || my > p.top + p.height + 6) {
        this.clearHover();
        return;
      }
      this.showCartesian(f, this.pick(f, along, mx, my), along);
    } else {
      this.hoverStandalone(f, mx, my);
    }
    this.svg.style.cursor = this.hoveredPoints().some(p => p.drilldown) ? 'pointer' : '';
  };

  private onDown = (ev: PointerEvent): void => {
    const f = this.frame;
    if (!f || ev.button !== 0) return;
    const [mx, my] = this.pointer(ev);
    if (f.kind === 'cartesian' && f.nav && this.inNav(f, mx, my)) {
      let [a, b] = f.nav.brush;
      let mode: NavDrag['mode'];
      if (Math.abs(mx - a) <= 8) mode = 'l';
      else if (Math.abs(mx - b) <= 8) mode = 'r';
      else {
        mode = 'pan';
        if (mx < a || mx > b) {
          // Jump: centre the window on the click, then keep dragging it.
          const w = b - a;
          const { rect } = f.nav;
          a = clamp(mx - w / 2, rect.left, rect.left + rect.width - w);
          b = a + w;
          this.setViewFromNav(a, b);
        }
      }
      this.navDrag = { mode, startX: mx, brush: [a, b] };
      this.svg.setPointerCapture?.(ev.pointerId);
      ev.preventDefault();
      return;
    }
    if (ev.pointerType !== 'mouse') this.onMove(ev);
    if (!this.opts.zoom || f.kind !== 'cartesian') return;
    const p = f.plot;
    if (mx < p.left || mx > p.left + p.width || my < p.top || my > p.top + p.height) return;
    const along = f.inverted ? my : mx;
    this.drag = { start: along, cur: along };
    this.svg.setPointerCapture?.(ev.pointerId);
  };

  private onUp = (): void => {
    if (this.navDrag) {
      this.navDrag = null;
      this.events.emit('zoom', { range: this.view });
      return;
    }
    const d = this.drag;
    this.drag = null;
    this.layers.overlay.replaceChildren();
    const f = this.frame;
    if (d && f?.kind === 'cartesian' && Math.abs(d.cur - d.start) >= 8) {
      const a = f.x.invert(Math.min(d.start, d.cur));
      const b = f.x.invert(Math.max(d.start, d.cur));
      if (f.x.kind !== 'band' || b > a) this.zoom([a, b]);
      return;
    }
    this.activate();
  };

  private activate(): void {
    const pts = this.hoveredPoints();
    if (!pts.length) return;
    this.events.emit('click', { points: pts });
    const h = this.hovered;
    if (h?.kind === 'standalone' && h.item.activate) {
      const undo = h.item.activate();
      if (undo) {
        this.backStack.push(undo);
        this.render(true);
        this.events.emit('drilldown', { point: h.item.point, depth: this.backStack.length });
        return;
      }
    }
    const drillable = pts.find(p => p.drilldown);
    if (drillable) this.drillDown(drillable);
  }

  /** Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer; horizontal wheel pans. */
  private onWheel = (ev: WheelEvent): void => {
    const f = this.frame;
    if (!f || f.kind !== 'cartesian' || !this.opts.zoom) return;
    const [mx, my] = this.pointer(ev);
    const p = f.plot;
    if (mx < p.left || mx > p.left + p.width || my < p.top || my > p.top + p.height) return;
    const [x0, x1] = f.xDomain;
    const [lo, hi] = f.full;
    const span = x1 - x0;
    let next: [number, number];
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const c = f.x.invert(f.inverted ? my : mx);
      const k = Math.exp(clamp(ev.deltaY, -100, 100) * 0.006);
      next = [c - (c - x0) * k, c + (x1 - c) * k];
    } else if (this.view && Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
      ev.preventDefault();
      const shift = (ev.deltaX / (f.inverted ? p.height : p.width)) * span;
      const s = clamp(shift, lo - x0, hi - x1);
      next = [x0 + s, x1 + s];
    } else return;
    if (next[1] - next[0] >= hi - lo) this.view = null;
    else this.view = [Math.max(lo, next[0]), Math.min(hi, next[1])];
    this.activeRange = null;
    this.schedule();
  };

  private onKey = (ev: KeyboardEvent): void => {
    const f = this.frame;
    if (!f) return;
    if (ev.key === 'Backspace' && this.backStack.length) {
      ev.preventDefault();
      this.drillUp();
      return;
    }
    const slots = this.slots(f);
    if (!slots.length) return;
    let i = this.active;
    switch (ev.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        i = i < 0 ? 0 : Math.min(slots.length - 1, i + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        i = i < 0 ? slots.length - 1 : Math.max(0, i - 1);
        break;
      case 'Home':
        i = 0;
        break;
      case 'End':
        i = slots.length - 1;
        break;
      case 'Escape':
        this.clearHover();
        return;
      case 'Enter':
      case ' ':
        ev.preventDefault();
        this.activate();
        return;
      default:
        return;
    }
    ev.preventDefault();
    this.active = i;
    if (f.kind === 'cartesian') {
      const xv = slots[i] as number;
      const along = f.x.map(xv);
      this.showCartesian(f, this.pick(f, along), along);
    } else {
      this.showItem(slots[i] as StandaloneItem);
    }
    this.live.textContent = this.tooltip.textContent ?? '';
  };

  private slots(f: Frame): (number | StandaloneItem)[] {
    if (f.kind === 'cartesian') {
      return [...new Set(f.hits.flatMap(h => h.points.map(p => p.point.x)))].sort((a, b) => a - b);
    }
    return f.hits.flatMap(h => h.items);
  }

  private is2d(s: NSeries): boolean {
    return (this.typeOf(s) as CartesianSeriesType | undefined)?.hover === '2d';
  }

  private pick(f: CartesianFrame, along: number, mx?: number, my?: number): HitPoint[] {
    const all = f.hits.filter(h => h.points.length);
    if (!all.length) return [];
    if (mx !== undefined && my !== undefined && all.every(h => this.is2d(h.series))) {
      let best: HitPoint | null = null;
      let bd = 24;
      for (const h of all) {
        for (const p of h.points) {
          const d = Math.hypot(p.px - mx, p.py - my) - (p.r ?? 0);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
      }
      return best ? [best] : [];
    }
    if (f.x.kind === 'band') {
      const xv = f.x.invert(along);
      return all.filter(h => !this.is2d(h.series)).map(h => h.points.find(p => p.point.x === xv)).filter((p): p is HitPoint => !!p);
    }
    let best: HitPoint | null = null;
    for (const h of all) {
      const i = nearest(h.points, along);
      const p = h.points[i];
      if (p && (!best || Math.abs(p.along - along) < Math.abs(best.along - along))) best = p;
    }
    if (!best) return [];
    const target = best.along;
    const out: HitPoint[] = [];
    for (const h of all) {
      const p = h.points[nearest(h.points, target)];
      if (p && Math.abs(p.along - target) <= 24) out.push(p);
    }
    return out;
  }

  private showCartesian(f: CartesianFrame, hits: HitPoint[], along: number): void {
    if (!hits.length) {
      this.clearHover();
      return;
    }
    const key = hits.map(h => h.point.series.id + ':' + h.point.index).join('|');
    if (key === this.hoverKey) return;
    this.clearHover();
    this.hoverKey = key;
    this.hovered = { kind: 'cartesian', hits };
    const { plot } = f;
    const first = hits[0].point;
    const center = f.x.map(first.x);
    const twoD = hits.every(h => this.is2d(h.point.series));
    this.active = this.slots(f).indexOf(first.x);

    if (!twoD && f.x.kind === 'band') {
      const bw = Math.abs((f.x as BandScale).step);
      svg('rect', f.inverted
        ? { x: plot.left, y: center - bw / 2, width: plot.width, height: bw, class: 'strata-band' }
        : { x: center - bw / 2, y: plot.top, width: bw, height: plot.height, class: 'strata-band' }, this.layers.under);
    } else if (!twoD) {
      svg('line', f.inverted
        ? { x1: plot.left, x2: plot.left + plot.width, y1: center, y2: center, class: 'strata-crosshair' }
        : { x1: center, x2: center, y1: plot.top, y2: plot.top + plot.height, class: 'strata-crosshair' }, this.layers.hover);
    }
    for (const h of hits) {
      if (h.el) h.el.classList.add('is-hover');
      else svg('circle', { cx: h.px, cy: h.py, r: Math.max(5, (h.r ?? 0) + 2), fill: h.point.color, class: 'strata-hover-marker' }, this.layers.hover);
    }

    // Tooltip: series types may contribute their own rows (OHLC, waterfall, heatmap…).
    const m = this.model;
    const xLabel = this.xLabel(f, first);
    const env = { xLabel, yCategories: m.yCategories, locale: this.opts.locale };
    let header = xLabel;
    const rows: TooltipRow[] = [];
    for (const h of hits) {
      const t = this.typeOf(h.point.series) as CartesianSeriesType | undefined;
      if (t?.tooltip) {
        const info = t.tooltip(h.point, { ...env, xLabel: this.xLabel(f, h.point) });
        if (hits.length === 1 && info.header) header = info.header;
        rows.push(...info.rows);
      } else {
        rows.push({
          series: h.point.series.name,
          color: h.point.color,
          value: h.point.y,
          percent: m.stacking === 'percent' ? h.point.percent : undefined,
        });
      }
    }
    const total = m.stacking === 'normal' && rows.length > 1 && hits.every(h => !(this.typeOf(h.point.series) as CartesianSeriesType).tooltip)
      ? rows.reduce((a, r) => a + (r.value ?? 0), 0)
      : undefined;
    this.fillTooltip(header, rows, total, hits.some(h => h.point.drilldown));
    const ax = f.inverted ? Math.max(...hits.map(h => h.px)) : twoD ? hits[0].px + (hits[0].r ?? 0) : along;
    const ay = f.inverted ? along : Math.min(...hits.map(h => h.py));
    this.placeTooltip(ax, ay);
    this.events.emit('hover', { points: hits.map(h => h.point) });
  }

  private xLabel(f: CartesianFrame, p: Point): string {
    const m = this.model;
    const xo = this.opts.xAxis;
    if (m.xType === 'category') return m.categories[p.x] ?? p.label;
    const label = m.xType === 'time'
      ? formatDateFull(p.x, this.opts.locale, f.xDomain[1] - f.xDomain[0])
      : formatValue(p.x, this.opts.locale);
    return xo?.formatter ? xo.formatter(p.x, label) : label;
  }

  private hoverStandalone(f: StandaloneFrame, mx: number, my: number): void {
    // Last drawn wins (treemap leaves sit on top of their group).
    const items = f.hits.flatMap(h => h.items);
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].contains(mx, my)) {
        this.active = i;
        this.showItem(items[i]);
        return;
      }
    }
    this.clearHover();
  }

  private showItem(item: StandaloneItem): void {
    const key = 'item:' + item.point.series.id + ':' + item.key;
    if (key === this.hoverKey) return;
    this.clearHover();
    this.hoverKey = key;
    this.hovered = { kind: 'standalone', item };
    if (item.pop) item.el.style.transform = item.pop;
    item.el.classList.add('is-hover');
    item.linked?.forEach(el => el.classList.add('is-hover'));
    this.svg.classList.add('strata-dim');
    const p = item.point;
    this.fillTooltip(
      item.header ?? p.label,
      item.rows ?? [{ series: p.series.name, color: p.color, value: p.y }],
      undefined,
      !!p.drilldown || !!item.activate,
    );
    this.placeTooltip(item.anchor[0], item.anchor[1]);
    this.events.emit('hover', { points: [p] });
  }

  private hoveredPoints(): Point[] {
    const h = this.hovered;
    if (!h) return [];
    return h.kind === 'cartesian' ? h.hits.map(x => x.point) : [h.item.point];
  }

  private tooltipOptions(): TooltipOptions | null {
    const t = this.opts.tooltip;
    if (t === false || (typeof t === 'object' && t.enabled === false)) return null;
    return typeof t === 'object' ? t : {};
  }

  private fillTooltip(header: string, rows: TooltipRow[], total?: number, drillable = false): void {
    const t = this.tooltipOptions();
    const tt = this.tooltip;
    if (!t) return;
    tt.replaceChildren();
    if (t.formatter) {
      const out = t.formatter({ header, rows });
      if (typeof out === 'string') tt.textContent = out;
      else tt.appendChild(out);
      return;
    }
    const fmt = (v: number | null) => (t.prefix ?? '') + formatValue(v, this.opts.locale, t.valueFormat) + (t.suffix ?? '');
    html('div', { class: 'strata-tt-head', text: header }, tt);
    const row = (r: TooltipRow, isTotal = false) => {
      const el = html('div', { class: isTotal ? 'strata-tt-row is-total' : 'strata-tt-row' }, tt);
      const sw = html('span', { class: 'strata-swatch' }, el);
      sw.style.background = isTotal ? 'transparent' : r.color;
      html('span', { class: 'strata-tt-name', text: r.series }, el);
      const val = html('span', { class: 'strata-tt-val', text: r.text ?? fmt(r.value) }, el);
      if (r.percent !== undefined) html('span', { class: 'strata-tt-pct', text: `${formatValue(r.percent, this.opts.locale, { maximumFractionDigits: 1 })} %` }, val);
    };
    rows.forEach(r => row(r));
    if (total !== undefined) row({ series: 'Total', color: '', value: total }, true);
    if (drillable) html('div', { class: 'strata-tt-hint', text: 'Cliquer pour détailler' }, tt);
  }

  private placeTooltip(ax: number, ay: number): void {
    if (!this.tooltipOptions()) return;
    const tt = this.tooltip;
    tt.classList.add('is-visible');
    const w = tt.offsetWidth;
    const h = tt.offsetHeight;
    let x = ax + 18;
    if (x + w > this.width) x = ax - 18 - w;
    if (x < 0) x = clamp(ax - w / 2, 0, Math.max(0, this.width - w));
    const y = clamp(ay - h / 2, -8, Math.max(-8, this.height - h + 8));
    tt.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }

  private clearHover(): void {
    if (!this.hovered && !this.hoverKey) return;
    this.hoverKey = '';
    const h = this.hovered;
    if (h?.kind === 'cartesian') for (const x of h.hits) x.el?.classList.remove('is-hover');
    if (h?.kind === 'standalone') {
      if (h.item.pop) h.item.el.style.transform = '';
      h.item.el.classList.remove('is-hover');
      h.item.linked?.forEach(el => el.classList.remove('is-hover'));
      this.svg.classList.remove('strata-dim');
    }
    this.hovered = null;
    this.layers.hover.replaceChildren();
    this.layers.under.replaceChildren();
    this.tooltip.classList.remove('is-visible');
    this.events.emit('hover', { points: [] });
  }

  private drawSelection(f: CartesianFrame): void {
    const d = this.drag!;
    const a = Math.min(d.start, d.cur);
    const len = Math.abs(d.cur - d.start);
    this.layers.overlay.replaceChildren();
    this.clearHover();
    svg('rect', f.inverted
      ? { x: f.plot.left, y: a, width: f.plot.width, height: len, class: 'strata-selection', rx: 3 }
      : { x: a, y: f.plot.top, width: len, height: f.plot.height, class: 'strata-selection', rx: 3 }, this.layers.overlay);
  }
}
