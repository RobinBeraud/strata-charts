// jsdom has no canvas: make text measurement fall back to its estimate quietly.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

// jsdom has no PointerEvent: a MouseEvent with pointer fields is enough for our handlers.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}
