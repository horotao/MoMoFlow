import { isGraphicSource, type GraphicSource } from './compositorGraphics.ts';
import { defaultBlurSettings, restoreBlurData, type BlurSettings } from './blur.ts';
import { defaultColorSettings, restoreColorData, type ColorSettings } from './colorCorrection.ts';
import { defaultLevelsSettings, restoreLevelsData, type LevelsSettings } from './levels.ts';
import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export const blendModes = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const;
export type BlendMode = typeof blendModes[number];
export type LayerTransform = { x: number; y: number; width: number; height: number; rotation: number };
export type CompositorEffect = { id: string; enabled: boolean } & (
  { type: 'blur'; settings: BlurSettings } | { type: 'color'; settings: ColorSettings } |
  { type: 'levels'; settings: LevelsSettings } | { type: 'invert' }
);
export type CompositorLayer = {
  id: string; name: string; source: { kind: 'input'; handle: string; fallback?: FileAsset } | { kind: 'asset'; asset: FileAsset } | GraphicSource;
  visible: boolean; locked: boolean; aspectLocked: boolean; transform?: LayerTransform;
  opacity: number; blendMode: BlendMode; stroke: { enabled: boolean; color: string; width: number; join?: 'miter' | 'round' | 'bevel'; cap?: 'butt' | 'round' | 'square' }; effects: CompositorEffect[];
};
export type CompositorDocument = {
  version: 1;
  inputs: { id: string; name: string }[];
  layers: CompositorLayer[]; // Bottom to top; input identity is independent of stacking order.
  canvas: { width: number; height: number; autoSize: boolean; aspectLocked: boolean; fill: string | null };
  timeline: { enabled: boolean; duration: number; fps: number; tracks: { layerId: string; keyframes: { time: number; transform: Partial<LayerTransform> }[] }[] };
};
export type CompositorData = { label?: string; locked?: boolean; document: CompositorDocument; result?: FileAsset; outputRevision?: string };
export type CompositorInputs = Record<string, { connected: boolean; asset?: FileAsset }>;
export type ResolvedLayer = CompositorLayer & { asset?: FileAsset; transform: LayerTransform };
export type CompositorLayout = { width: number; height: number; layers: ResolvedLayer[] };
export const MAX_COMPOSITOR_EDGE = 8192;
export const MAX_COMPOSITOR_PIXELS = 32 * 1024 * 1024;
export const MAX_COMPOSITOR_LAYERS = 64;
export function createLayer(id: string, name: string, source: CompositorLayer['source']): CompositorLayer {
  return { id, name, source, visible: true, locked: false, aspectLocked: true, opacity: 1, blendMode: 'source-over', stroke: { enabled: false, color: '#ffffff', width: 2 }, effects: [] };
}
export function defaultCompositorDocument(): CompositorDocument {
  return { version: 1, inputs: [{ id: 'background', name: 'Background' }, { id: 'layer-1', name: 'Layer 1' }],
    layers: [createLayer('background', 'Background', { kind: 'input', handle: 'background' }), createLayer('layer-1', 'Layer 1', { kind: 'input', handle: 'layer-1' })],
    canvas: { width: 1024, height: 1024, autoSize: true, aspectLocked: false, fill: null },
    timeline: { enabled: false, duration: 5, fps: 30, tracks: [] } };
}
export function addCompositorInput(document: CompositorDocument): CompositorDocument {
  if (document.layers.length >= MAX_COMPOSITOR_LAYERS) return document;
  let index = 1;
  while (document.inputs.some(input => input.id === `layer-${index}`)) index++;
  const id = `layer-${index}`, name = `Layer ${index}`;
  return { ...document, inputs: [...document.inputs, { id, name }], layers: [...document.layers, createLayer(id, name, { kind: 'input', handle: id })] };
}
export function removeCompositorLayer(document: CompositorDocument, id: string) {
  const layer = document.layers.find(item => item.id === id);
  if (!layer || layer.locked || (layer.source.kind === 'input' && layer.source.handle === 'background')) return document;
  const handle = layer.source.kind === 'input' ? layer.source.handle : undefined;
  return { ...document, layers: document.layers.filter(item => item.id !== id), inputs: document.inputs.filter(item => item.id !== handle),
    timeline: { ...document.timeline, tracks: document.timeline.tracks.filter(track => track.layerId !== id) } };
}
export function moveCompositorLayer(document: CompositorDocument, id: string, index: number): CompositorDocument {
  const layers = [...document.layers], from = layers.findIndex(layer => layer.id === id);
  if (from < 0 || layers[from].locked) return document;
  layers.splice(Math.max(0, Math.min(layers.length - 1, index)), 0, ...layers.splice(from, 1));
  return { ...document, layers };
}
export function layerAsset(layer: CompositorLayer, inputs: CompositorInputs) {
  if (layer.source.kind !== 'asset' && layer.source.kind !== 'input') return undefined;
  return layer.source.kind === 'asset' ? layer.source.asset : inputs[layer.source.handle]?.connected ? inputs[layer.source.handle]?.asset : layer.source.fallback;
}
export function compositorLayout(document: CompositorDocument, inputs: CompositorInputs, sizes: Record<string, { width: number; height: number }> = {}): CompositorLayout {
  const backgroundLayer = document.layers.find(layer => layer.source.kind === 'input' && layer.source.handle === 'background');
  const background = inputs.background?.connected ? inputs.background.asset : backgroundLayer ? layerAsset(backgroundLayer, inputs) : undefined;
  const backgroundSize = background && (sizes[background.url] ?? background);
  const width = document.canvas.autoSize && backgroundSize?.width ? backgroundSize.width : document.canvas.width;
  const height = document.canvas.autoSize && backgroundSize?.height ? backgroundSize.height : document.canvas.height;
  return { width, height, layers: document.layers.map(layer => {
    const asset = layerAsset(layer, inputs), size = asset && (sizes[asset.url] ?? asset);
    const w = size?.width || width, h = size?.height || height, scale = Math.min(width / w, height / h, 1);
    return { ...layer, asset: asset ? { ...asset, width: w, height: h } : undefined, transform: layer.transform ?? { x: (width - w * scale) / 2, y: (height - h * scale) / 2, width: w * scale, height: h * scale, rotation: 0 } };
  }) };
}
// Editing metadata does not invalidate pixels or allocate another PNG.
export function compositorRenderDocument(document: CompositorDocument): CompositorDocument {
  return { ...document, inputs: document.inputs.map(input => ({ ...input, name: '' })),
    canvas: { ...document.canvas, aspectLocked: false },
    layers: document.layers.map(layer => ({ ...layer, name: layer.id, locked: false, aspectLocked: false })),
    timeline: { enabled: false, duration: 5, fps: 30, tracks: [] } };
}
export function compositorRevision(document: CompositorDocument, inputs: CompositorInputs): string {
  // Local assets have immutable IDs; IndexedDB recreates their Blob URLs on load.
  // Keeping those ephemeral URLs out of the version also restores locked outputs.
  return JSON.stringify(['compositor-v2', compositorRenderDocument(document), document.inputs.map(input => [input.id, inputs[input.id]?.connected ?? false, inputs[input.id]?.asset ?? null])],
    (key, value: unknown) => key === 'url' && typeof value === 'string' && value.startsWith('blob:') ? '<local-asset>' : value);
}
export function compositorPending(document: CompositorDocument, inputs: CompositorInputs) {
  return document.layers.some(layer => (layer.visible || (document.canvas.autoSize && layer.source.kind === 'input' && layer.source.handle === 'background')) && layer.source.kind === 'input' && inputs[layer.source.handle]?.connected && !inputs[layer.source.handle]?.asset);
}
export function compositorDocument(data: CompositorData) { return { label: data.label, locked: data.locked, document: data.document }; }
export function snapshotCompositor(document: CompositorDocument, inputs: CompositorInputs): CompositorDocument {
  return { ...document, layers: document.layers.map(layer => {
    const asset = layerAsset(layer, inputs);
    return asset && layer.source.kind === 'input' ? { ...layer, source: { ...layer.source, fallback: asset } } : layer;
  }) };
}
export function newEffect(type: CompositorEffect['type']): CompositorEffect {
  const base = { id: crypto.randomUUID(), enabled: true };
  if (type === 'blur') return { ...base, type, settings: { ...defaultBlurSettings, size: 10 } };
  if (type === 'color') return { ...base, type, settings: { ...defaultColorSettings } };
  if (type === 'levels') return { ...base, type, settings: structuredClone(defaultLevelsSettings) };
  return { ...base, type };
}
export function resizeLayer(transform: LayerTransform, dx: number, dy: number, corner: string, aspectLocked: boolean, centered = false): LayerTransform {
  const radians = transform.rotation * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  const localX = dx * cos + dy * sin, localY = -dx * sin + dy * cos;
  const sx = corner.includes('w') ? -1 : corner.includes('e') ? 1 : 0, sy = corner.includes('n') ? -1 : corner.includes('s') ? 1 : 0;
  const factor = centered ? 2 : 1;
  let width = Math.max(1, transform.width + sx * localX * factor), height = Math.max(1, transform.height + sy * localY * factor);
  if (aspectLocked) {
    const ratio = !sy || (sx && Math.abs(localX / transform.width) >= Math.abs(localY / transform.height)) ? width / transform.width : height / transform.height;
    const bounded = Math.max(1 / Math.min(transform.width, transform.height), Math.min(ratio, MAX_COMPOSITOR_EDGE * 2 / Math.max(transform.width, transform.height)));
    width = transform.width * bounded; height = transform.height * bounded;
  }
  width = Math.min(MAX_COMPOSITOR_EDGE * 2, width); height = Math.min(MAX_COMPOSITOR_EDGE * 2, height);
  const cx = centered ? 0 : sx * (width - transform.width) / 2, cy = centered ? 0 : sy * (height - transform.height) / 2;
  return { ...transform, width, height, x: transform.x + (transform.width - width) / 2 + cx * cos - cy * sin, y: transform.y + (transform.height - height) / 2 + cx * sin + cy * cos };
}
// Align the visible rotated bounds, retaining the layer's center-based transform.
export function alignCompositorLayer(t: LayerTransform, canvas: { width: number; height: number }, alignment: number): LayerTransform {
  const radians = t.rotation * Math.PI / 180, c = Math.abs(Math.cos(radians)), s = Math.abs(Math.sin(radians));
  const width = t.width * c + t.height * s, height = t.width * s + t.height * c;
  return alignment < 3 ? { ...t, x: (alignment === 0 ? width / 2 : alignment === 1 ? canvas.width / 2 : canvas.width - width / 2) - t.width / 2 }
    : { ...t, y: (alignment === 3 ? height / 2 : alignment === 4 ? canvas.height / 2 : canvas.height - height / 2) - t.height / 2 };
}
const finite = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function restoreCompositorData(value: unknown): CompositorData | undefined {
  try {
    if (!value || typeof value !== 'object') return;
    const data = value as CompositorData, doc = data.document;
    if (!doc || doc.version !== 1 || !Array.isArray(doc.inputs) || !Array.isArray(doc.layers) || doc.inputs.length > MAX_COMPOSITOR_LAYERS || doc.layers.length > MAX_COMPOSITOR_LAYERS
      || new Set(doc.inputs.map(input => input.id)).size !== doc.inputs.length || new Set(doc.layers.map(layer => layer.id)).size !== doc.layers.length
      || !doc.inputs.some(input => input.id === 'background') || doc.inputs.some(input => !/^(background|layer-\d+)$/.test(input.id) || typeof input.name !== 'string')) return;
    const c = doc.canvas;
    if (!c || !finite(c.width, 1, MAX_COMPOSITOR_EDGE) || !finite(c.height, 1, MAX_COMPOSITOR_EDGE) || !Number.isInteger(c.width) || !Number.isInteger(c.height) || c.width * c.height > MAX_COMPOSITOR_PIXELS
      || typeof c.autoSize !== 'boolean' || typeof c.aspectLocked !== 'boolean' || (c.fill !== null && !color(c.fill))) return;
    for (const layer of doc.layers) {
      if (typeof layer.id !== 'string' || typeof layer.name !== 'string' || typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean' || typeof layer.aspectLocked !== 'boolean'
        || !finite(layer.opacity, 0, 1) || !blendModes.includes(layer.blendMode) || !layer.stroke || typeof layer.stroke.enabled !== 'boolean' || !color(layer.stroke.color) || !finite(layer.stroke.width, 0, 256)
        || !Array.isArray(layer.effects) || layer.effects.length > 16) return;
      if (layer.source.kind === 'input') { const source = layer.source; if (!doc.inputs.some(input => input.id === source.handle) || (source.fallback && (!isFileAsset(source.fallback) || source.fallback.kind !== 'image'))) return; }
      else if (layer.source.kind === 'asset') { if (!isFileAsset(layer.source.asset) || layer.source.asset.kind !== 'image') return; }
      else if (!isGraphicSource(layer.source) || !layer.transform) return;
      if (layer.stroke.join && !['miter', 'round', 'bevel'].includes(layer.stroke.join)) return;
      if (layer.stroke.cap && !['butt', 'round', 'square'].includes(layer.stroke.cap)) return;
      const t = layer.transform;
      if (t && (!finite(t.x, -1e6, 1e6) || !finite(t.y, -1e6, 1e6) || !finite(t.width, 1, 16384) || !finite(t.height, 1, 16384) || !finite(t.rotation, -36000, 36000))) return;
      for (const effect of layer.effects) {
        if (typeof effect.id !== 'string' || typeof effect.enabled !== 'boolean' || !['blur', 'color', 'levels', 'invert'].includes(effect.type)) return;
        if (effect.type === 'blur' && !restoreBlurData({ settings: effect.settings })) return;
        if (effect.type === 'color' && !restoreColorData({ settings: effect.settings })) return;
        if (effect.type === 'levels' && !restoreLevelsData({ channel: 'RGB', settings: effect.settings })) return;
      }
    }
    if (!doc.timeline || typeof doc.timeline.enabled !== 'boolean' || !finite(doc.timeline.duration, .1, 86400) || !finite(doc.timeline.fps, 1, 120) || !Array.isArray(doc.timeline.tracks) || doc.timeline.tracks.length) return;
    return { label: typeof data.label === 'string' ? data.label : undefined, locked: false, document: structuredClone(doc) };
  } catch { return; }
}
