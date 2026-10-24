import { blurPixels } from '../blur.ts';
import { correctPixels } from '../colorCorrection.ts';
import { invertPixels } from '../invert.ts';
import { levelsPixels } from '../levels.ts';
import type { CompositorEffect } from '../compositor';

export function compositorPixels(source: Uint8ClampedArray, width: number, height: number, effects: CompositorEffect[], scale = 1) {
  let pixels: Uint8ClampedArray = new Uint8ClampedArray(source);
  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (effect.type === 'blur') pixels = blurPixels(pixels, width, height, effect.settings, scale);
    if (effect.type === 'color') correctPixels(pixels, effect.settings);
    if (effect.type === 'levels') pixels = levelsPixels(pixels, effect.settings);
    if (effect.type === 'invert') pixels = invertPixels(pixels);
  }
  return pixels;
}

// Only interactive previews use this bounded cache. A later effect changing
// must not rerun an expensive unchanged prefix (for example Blur -> Color).
export class CompositorEffectCache {
  private entries = new Map<string, Uint8ClampedArray>();
  private pixels = 0;
  private budget: number;
  constructor(budget = 4 * 1024 * 1024) { this.budget = budget; }
  render(sourceKey: string, source: Uint8ClampedArray, width: number, height: number, effects: CompositorEffect[], scale: number) {
    const enabled = effects.filter(effect => effect.enabled);
    const keys = enabled.map((_, index) => JSON.stringify([sourceKey, width, height, scale, enabled.slice(0, index + 1)]));
    let pixels = source, start = 0;
    for (let i = keys.length - 1; i >= 0; i--) {
      const cached = this.entries.get(keys[i]);
      if (cached) { this.entries.delete(keys[i]); this.entries.set(keys[i], cached); pixels = cached; start = i + 1; break; }
    }
    for (let i = start; i < enabled.length; i++) {
      pixels = compositorPixels(pixels, width, height, [enabled[i]], scale);
      if (width * height <= this.budget) {
        this.entries.set(keys[i], pixels); this.pixels += width * height;
        while (this.pixels > this.budget) { const key = this.entries.keys().next().value!; this.pixels -= this.entries.get(key)!.length / 4; this.entries.delete(key); }
      }
    }
    return pixels;
  }
  get retainedPixels() { return this.pixels; }
}
