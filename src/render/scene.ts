/**
 * Keyed retained-mode SVG scene.
 *
 * Every render pass declares the elements it wants (`el(parent, key, tag, attrs)`).
 * Existing elements are reused and their attributes tweened to the new values;
 * new elements can start from `enter` attributes; elements not declared in a pass
 * fade out and are removed. Path morphing works whenever two path strings share the
 * same command structure (only the numbers differ).
 */

export type AttrValue = string | number | null | undefined | false;
export type Attrs = Record<string, AttrValue>;

export interface ElOptions {
  enter?: Attrs;
  text?: string;
}

const SVGNS = 'http://www.w3.org/2000/svg';
const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

interface Meta {
  gen: number;
  exiting: boolean;
  cur: Map<string, number[]>;
  tgt: Map<string, string>;
}

interface Tween {
  target: string;
  start: number;
  dur: number;
  step: (t: number) => void;
  done?: () => void;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Interpolates between two strings that differ only by their numbers. */
export function interpolator(a: string, b: string): ((t: number) => string) | null {
  if (a === b) return null;
  const an = a.match(NUM);
  const bn = b.match(NUM);
  if (!an || !bn || an.length !== bn.length) return null;
  const as = a.split(NUM);
  const bs = b.split(NUM);
  if (as.length !== bs.length) return null;
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return null;
  const av = an.map(Number);
  const bv = bn.map(Number);
  return t => {
    let out = bs[0];
    for (let i = 0; i < bv.length; i++) out += r2(av[i] + (bv[i] - av[i]) * t) + bs[i + 1];
    return out;
  };
}

export class Scene {
  private gen = 0;
  private duration = 0;
  private children = new Map<Element, Map<string, Element>>();
  private meta = new WeakMap<Element, Meta>();
  private tweens = new Map<string, Tween>();
  private ids = new WeakMap<Element, number>();
  private nextId = 0;
  private frame = 0;

  get animating(): boolean {
    return this.duration > 0;
  }

  begin(duration: number): void {
    this.gen++;
    this.duration = Math.max(0, duration);
  }

  el<K extends keyof SVGElementTagNameMap>(
    parent: Element,
    key: string,
    tag: K,
    attrs: Attrs,
    opts: ElOptions = {},
  ): SVGElementTagNameMap[K] {
    let map = this.children.get(parent);
    if (!map) {
      map = new Map();
      this.children.set(parent, map);
    }
    let el = map.get(key) as SVGElementTagNameMap[K] | undefined;
    let fresh = false;
    if (!el || el.localName !== tag) {
      if (el) this.drop(el, map, key);
      el = document.createElementNS(SVGNS, tag) as SVGElementTagNameMap[K];
      map.set(key, el);
      parent.appendChild(el);
      this.meta.set(el, { gen: this.gen, exiting: false, cur: new Map(), tgt: new Map() });
      fresh = true;
      if (opts.enter && this.duration > 0) {
        for (const [k, v] of Object.entries(opts.enter)) setAttr(el, k, v);
      }
    }
    const m = this.meta.get(el)!;
    m.gen = this.gen;
    if (m.exiting) {
      m.exiting = false;
      this.tweens.delete(this.id(el) + ':opacity');
      if (!('opacity' in attrs)) el.removeAttribute('opacity');
    }
    if (opts.text !== undefined && el.textContent !== opts.text) el.textContent = opts.text;
    const immediate = fresh && !(opts.enter && this.duration > 0);
    for (const k in attrs) this.attr(el, k, attrs[k], immediate);
    return el;
  }

  /** Tween an arbitrary numeric vector and apply it (used for pie angles). */
  value(el: Element, name: string, to: number[], apply: (v: number[]) => void, from?: number[]): void {
    const m = this.meta.get(el);
    if (!m) {
      apply(to);
      return;
    }
    const key = to.join(',');
    if (m.tgt.get(name) === key) return;
    m.tgt.set(name, key);
    const id = this.id(el) + ':v:' + name;
    const start = m.cur.get(name) ?? (this.duration > 0 ? from : undefined);
    if (!start || start.length !== to.length || this.duration === 0) {
      this.tweens.delete(id);
      m.cur.set(name, to);
      apply(to);
      return;
    }
    const s = start.slice();
    this.add(id, {
      target: key,
      start: 0,
      dur: this.duration,
      step: t => {
        const v = s.map((a, i) => a + (to[i] - a) * t);
        m.cur.set(name, v);
        apply(v);
      },
    });
  }

  end(): void {
    for (const [parent, map] of this.children) {
      if (!parent.isConnected && !this.meta.has(parent) && parent.parentNode === null) {
        this.children.delete(parent);
        continue;
      }
      for (const [key, el] of map) {
        const m = this.meta.get(el);
        if (!m || m.gen === this.gen || m.exiting) continue;
        if (this.duration > 0) {
          m.exiting = true;
          const from = Number(el.getAttribute('opacity') ?? 1);
          this.add(this.id(el) + ':opacity', {
            target: '0',
            start: 0,
            dur: this.duration * 0.6,
            step: t => el.setAttribute('opacity', String(r2(from * (1 - t)))),
            done: () => {
              if (m.exiting) this.drop(el, map, key);
            },
          });
        } else {
          this.drop(el, map, key);
        }
      }
    }
  }

  /** Stops all running animations immediately at their target values. */
  finish(): void {
    for (const [id, tw] of this.tweens) {
      tw.step(1);
      this.tweens.delete(id);
      tw.done?.();
    }
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.tweens.clear();
    this.children.clear();
  }

  private drop(el: Element, map: Map<string, Element>, key: string): void {
    el.remove();
    if (map.get(key) === el) map.delete(key);
    for (const parent of this.children.keys()) {
      if (parent === el || el.contains(parent)) this.children.delete(parent);
    }
  }

  private attr(el: Element, name: string, value: AttrValue, immediate: boolean): void {
    const id = this.id(el) + ':' + name;
    if (PAINT.has(name) && typeof value === 'string' && value.startsWith('var(')) {
      this.tweens.delete(id);
      el.removeAttribute(name);
      (el as SVGElement).style.setProperty(name, value);
      return;
    }
    if (PAINT.has(name)) (el as SVGElement).style?.removeProperty(name);
    if (value === null || value === undefined || value === false) {
      this.tweens.delete(id);
      el.removeAttribute(name);
      return;
    }
    const to = typeof value === 'number' ? String(r2(value)) : value;
    const running = this.tweens.get(id);
    if (running && running.target === to) return;
    const from = el.getAttribute(name);
    if (immediate || this.duration === 0 || from === null || from === to) {
      if (running) this.tweens.delete(id);
      if (from !== to) el.setAttribute(name, to);
      return;
    }
    const interp = interpolator(from, to);
    if (!interp) {
      this.tweens.delete(id);
      el.setAttribute(name, to);
      return;
    }
    this.add(id, {
      target: to,
      start: 0,
      dur: this.duration,
      step: t => el.setAttribute(name, t >= 1 ? to : interp(t)),
    });
  }

  private id(el: Element): number {
    let id = this.ids.get(el);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(el, id);
    }
    return id;
  }

  private add(id: string, tw: Tween): void {
    tw.start = performance.now();
    this.tweens.set(id, tw);
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.frame = 0;
    for (const [id, tw] of this.tweens) {
      const t = Math.min(1, Math.max(0, (now - tw.start) / tw.dur));
      tw.step(t >= 1 ? 1 : easeOutCubic(t));
      if (t >= 1) {
        this.tweens.delete(id);
        tw.done?.();
      }
    }
    if (this.tweens.size) this.frame = requestAnimationFrame(this.tick);
  };
}

const PAINT = new Set(['fill', 'stroke', 'stop-color']);

export function setAttr(el: Element, name: string, v: AttrValue): void {
  if (PAINT.has(name) && typeof v === 'string' && v.startsWith('var(')) {
    el.removeAttribute(name);
    (el as SVGElement).style.setProperty(name, v);
    return;
  }
  if (v === null || v === undefined || v === false) el.removeAttribute(name);
  else el.setAttribute(name, typeof v === 'number' ? String(r2(v)) : v);
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) setAttr(el, k, attrs[k]);
  parent?.appendChild(el);
  return el;
}

export function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) for (const k in props.attrs) el.setAttribute(k, props.attrs[k]);
  parent?.appendChild(el);
  return el;
}
