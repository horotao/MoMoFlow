import type { CompositorEffect } from '../compositor';

// IDs, disabled effects and layer transforms don't change processed pixels.
export function effectRasterKey(source: string, effects: CompositorEffect[], scale: number) {
  return JSON.stringify([source, scale, effects.filter(effect => effect.enabled).map(effect =>
    effect.type === 'invert' ? { type: effect.type } : { type: effect.type, settings: effect.settings })]);
}

// Keep recent on/off variants, shared across identical layers, without retaining
// one full-resolution buffer for every historical edit or effect prefix.
export class CompositorRasterCache<T extends { width: number; height: number }> {
  private entries = new Map<string, { source: string; value: T }>();
  private pixels = 0;
  private budget: number;
  constructor(budget: number) { this.budget = budget; }
  get(key: string) {
    const entry = this.entries.get(key);
    if (entry) { this.entries.delete(key); this.entries.set(key, entry); }
    return entry?.value;
  }
  set(key: string, source: string, value: T) {
    this.remove(key);
    const size = value.width * value.height;
    if (size > this.budget) return;
    while (this.pixels + size > this.budget) this.remove(this.entries.keys().next().value!);
    this.entries.set(key, { source, value }); this.pixels += size;
  }
  prune(sources: Set<string>) {
    for (const [key, entry] of this.entries) if (!sources.has(entry.source)) this.remove(key);
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) { this.pixels -= entry.value.width * entry.value.height; this.entries.delete(key); }
  }
  get retainedPixels() { return this.pixels; }
}
