/** Typed event emitter. `on` returns its own unsubscribe function. */
export class Emitter<M extends object> {
  private handlers = new Map<keyof M, Set<(e: never) => void>>();

  on<K extends keyof M>(type: K, fn: (e: M[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as (e: never) => void);
    return () => this.off(type, fn);
  }

  off<K extends keyof M>(type: K, fn: (e: M[K]) => void): void {
    this.handlers.get(type)?.delete(fn as (e: never) => void);
  }

  emit<K extends keyof M>(type: K, e: M[K]): void {
    this.handlers.get(type)?.forEach(fn => (fn as (e: M[K]) => void)(e));
  }

  clear(): void {
    this.handlers.clear();
  }
}
