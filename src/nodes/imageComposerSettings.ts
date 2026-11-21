import { imageSizes, imageSizeLabels, sunburstPresetSize, sunburstSizePreset, type SunburstResolution } from './sunburst.ts';
import { defaultSeedreamSettings } from './seedream.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';
import type { ImageComposerData, SunburstNode, ImageGeneratorNode, NanoBananaNode, SeedreamNode } from './types';

export const composerModelId = (data: SunburstNode['data']) => data.composer?.selection?.modelIds[0] ?? 'gpt-image-2-6';

export function composerSettings(data: SunburstNode['data']) {
  const model = composerModelId(data);
  const saved = data.composer?.modelSettings?.[model];
  if (model === 'seedream-5-5') return { ...defaultSeedreamSettings, resolution: '2K', ...saved };
  if (model.startsWith('nano-banana')) return { ...defaultNanoBananaSettings, resolution: '1K', ...saved };
  return { quality: data.quality, background: data.background, outputFormat: data.outputFormat,
    resolution: data.resolution ?? sunburstSizePreset(data.size)?.resolution ?? '1K' };
}

// Toolbar and generation options write the same ratio and API size in one edit.
export function changeComposerSettings(data: SunburstNode['data'], change: Partial<ImageComposerData>, settings: Record<string, string> = {}) {
  const composer = { ...data.composer!, ...change };
  const model = composer.selection?.modelIds[0] ?? 'gpt-image-2-6';
  if (model !== 'gpt-image-2-6') return { composer: { ...composer, modelSettings: {
    ...composer.modelSettings, [model]: { ...composer.modelSettings?.[model], ...settings },
  } } };
  if (change.ratio === undefined && settings.resolution === undefined) return { ...settings, composer };
  const next = { ...composerSettings({ ...data, composer }), ...settings };
  const ratio = composer.ratio;
  const resolution = next.resolution as SunburstResolution;
  const size = data.provider === 'apimart' ? ratio : ratio === 'auto' ? 'auto'
    : sunburstPresetSize(imageSizes[imageSizeLabels.indexOf(ratio)] ?? 'auto', resolution);
  return { ...settings, size, resolution, composer };
}

// Keep the canvas node stable while adapting its settings to existing clients.
export function composerExecutionNode(node: ImageGeneratorNode): ImageGeneratorNode {
  if (node.type !== 'sunburst' || !node.data.composer) return node;
  const selection = node.data.composer.selection;
  if (selection && (selection.autoSelect || selection.modelIds.length !== 1)) throw new Error('请选择一个生成模型。');
  const model = composerModelId(node.data);
  if (model === 'gpt-image-2-6') return { ...node, data: { ...node.data, imageInputs: 16 } };
  const settings = composerSettings(node.data);
  const common = { locked: node.data.locked, label: node.data.label, imageInputs: 16, results: node.data.results, activeResultId: node.data.activeResultId };
  if (model === 'seedream-5-5') return { ...node, type: 'seedream', data: {
    ...common, ...defaultSeedreamSettings, ...settings, size: node.data.composer.ratio,
  } } as SeedreamNode;
  if (model === 'nano-banana-2-1') return { ...node, type: 'nano-banana', data: {
    ...common, ...defaultNanoBananaSettings, outputFormat: settings.outputFormat,
    aspectRatio: node.data.composer.ratio, imageSize: settings.resolution,
  } } as NanoBananaNode;
  throw new Error('当前渠道支持 GPT Image 2.6、Seedream 5.5 和 Nano Banana 2.1，请选择其中一个模型。');
}
