import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export const blendGroups = [
  ['Normal'], ['Darken', 'Multiply', 'Color Burn'], ['Lighten', 'Add', 'Screen', 'Color Dodge'],
  ['Overlay', 'Hard Light', 'Soft Light'], ['Difference', 'Exclusion', 'Divide'], ['Hue', 'Saturation', 'Color', 'Luminosity'],
] as const;
export const blendModes = blendGroups.flat();
export type BlendMode = typeof blendModes[number];
export type BlendSettings = { mode: BlendMode; opacity: number };
export type BlendData = { label?: string; locked?: boolean; settings: BlendSettings; back?: FileAsset; front?: FileAsset; result?: FileAsset; outputRevision?: string };
export const defaultBlendSettings: BlendSettings = { mode: 'Normal', opacity: 1 };
export const blendDocument = (data: BlendData) => ({ label: data.label, locked: data.locked, settings: data.settings, back: data.back, front: data.front });
export const blendRevision = (settings: BlendSettings, back?: FileAsset, front?: FileAsset) => JSON.stringify(['blend-v2-weavy-linear', back?.id, front?.id, settings.mode, settings.opacity]);
export function restoreBlendData(value: unknown): BlendData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as BlendData;
  if (!data.settings || !blendModes.includes(data.settings.mode) || !Number.isFinite(data.settings.opacity) || data.settings.opacity < 0 || data.settings.opacity > 1) return;
  if ([data.back, data.front].some(asset => asset !== undefined && (!isFileAsset(asset) || asset.kind !== 'image'))) return;
  return { settings: { mode: data.settings.mode, opacity: data.settings.opacity }, back: data.back, front: data.front, label: typeof data.label === 'string' ? data.label : undefined, locked: false };
}

// Compatibility target: Weavy's linear-light renderer, verified with exported
// RGBA fixtures. The mode formulas and transparent-backdrop behavior deliberately
// differ from CSS/Canvas blending. See docs/blend-verification.md.
type RGB = [number, number, number];
export const srgbToLinear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
export const linearToSrgb = (value: number) => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
const linearBytes = Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));

function toBlendHsl(c: RGB): RGB {
  const low = Math.min(...c), high = Math.max(...c), span = high - low;
  const lightness = (high + low) / 2;
  if (!span) return [0, 0, lightness];
  const hue = high === c[0] ? (c[1] - c[2]) / span : high === c[1] ? 2 + (c[2] - c[0]) / span : 4 + (c[0] - c[1]) / span;
  // Weavy uses this saturation denominator for dark colors too, rather than
  // standard HSL's low-lightness branch. Keep this explicit for compatibility.
  return [((hue + 6) % 6) / 6, span / (2 - high - low), lightness];
}
function blendColor(back: RGB, front: RGB, mode: BlendMode): RGB {
  const b = toBlendHsl(back), f = toBlendHsl(front);
  const hue = mode === 'Hue' || mode === 'Color' ? f[0] : b[0];
  const saturation = mode === 'Saturation' || mode === 'Color' ? f[1] : b[1];
  const lightness = mode === 'Luminosity' ? f[2] : b[2];
  const chroma = saturation * (1 - Math.abs(2 * lightness - 1));
  return [0, 4, 2].map(offset => {
    const ramp = Math.max(0, Math.min(1, Math.abs((hue * 6 + offset) % 6 - 3) - 1));
    return lightness + chroma * (ramp - .5);
  }) as RGB;
}
export function blendChannel(b: number, f: number, mode: BlendMode): number {
  switch (mode) {
    case 'Darken': return Math.min(b, f);
    case 'Multiply': return b * f;
    case 'Color Burn': return f === 0 ? 0 : Math.max(0, 1 - (1 - b) / f);
    case 'Lighten': return Math.max(b, f);
    case 'Add': return b + f; // Clamp after opacity and compositing, not before.
    case 'Screen': return b + f - b * f;
    case 'Color Dodge': return f === 1 ? 1 : Math.min(1, b / (1 - f));
    case 'Overlay': return b <= .5 ? 2 * b * f : 1 - 2 * (1 - b) * (1 - f);
    case 'Hard Light': return f <= .5 ? 2 * b * f : 1 - 2 * (1 - b) * (1 - f);
    case 'Soft Light': return f <= .5 ? b - (1 - 2 * f) * b * (1 - b) : b + (2 * f - 1) * (Math.sqrt(b) - b);
    case 'Difference': return Math.abs(b - f);
    case 'Exclusion': return b + f - 2 * b * f;
    case 'Divide': return Math.min(1, b / Math.max(f, .0001));
    default: return f;
  }
}
export function blendPixels(back: Uint8ClampedArray, front: Uint8ClampedArray, settings: BlendSettings): Uint8ClampedArray<ArrayBuffer> {
  if (back.length !== front.length || back.length % 4) throw new Error('Blend inputs must have matching RGBA dimensions.');
  const output = new Uint8ClampedArray(back.length);
  const opacity = Math.max(0, Math.min(1, settings.opacity));
  const nonseparable = ['Hue', 'Saturation', 'Color', 'Luminosity'].includes(settings.mode);
  for (let i = 0; i < back.length; i += 4) {
    const ab = back[i + 3] / 255, af = front[i + 3] / 255 * opacity, alpha = af + ab * (1 - af);
    if (!alpha) continue;
    if (!af) { output.set(back.subarray(i, i + 4), i); continue; }
    let mixed: RGB | undefined;
    if (nonseparable) {
      const b: RGB = ab ? [linearBytes[back[i]], linearBytes[back[i + 1]], linearBytes[back[i + 2]]] : [0, 0, 0];
      const f: RGB = [linearBytes[front[i]], linearBytes[front[i + 1]], linearBytes[front[i + 2]]];
      mixed = blendColor(b, f, settings.mode);
    }
    for (let c = 0; c < 3; c++) {
      const b = ab ? linearBytes[back[i + c]] : 0, f = linearBytes[front[i + c]];
      const blended = mixed?.[c] ?? blendChannel(b, f, settings.mode);
      // Weavy blends the source against the unpremultiplied backdrop first,
      // then composites that blended layer using source-over in linear light.
      const linear = (af * blended + (1 - af) * ab * b) / alpha;
      output[i + c] = linearToSrgb(Math.max(0, Math.min(1, linear))) * 255;
    }
    output[i + 3] = alpha * 255;
  }
  return output;
}
