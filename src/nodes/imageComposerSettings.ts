import { imageSizes, imageSizeLabels, sunburstPresetSize, sunburstSizePreset, sunburstProviderSettings, apimartAspectRatios, type SunburstProvider, type SunburstResolution } from './sunburst.ts';
import { defaultSeedreamSettings, seedreamChoices } from './seedream.ts';
import { defaultNanoBananaSettings, nanoBananaAspectRatios } from './nanoBanana.ts';
import { defaultImagePromptModelSelection, gptImageVariants } from '../components/image-prompt-node/imagePromptModels.ts';
import type { ImageComposerData, SunburstNode, ImageGeneratorNode, NanoBananaNode, SeedreamNode } from './types';

export function composerModelSelection(data: SunburstNode['data']) {
  const selection = data.composer?.selection ?? defaultImagePromptModelSelection;
  // Older projects stored Flare in variant and used the shared GPT Image menu ID.
  if (data.variant !== 'Flare' || !selection.modelIds.includes('gpt-image-2-6')
    || selection.modelIds.includes('gpt-image-2-6-flare')) return selection;
  return { ...selection, modelIds: selection.modelIds.map(id => id === 'gpt-image-2-6' ? 'gpt-image-2-6-flare' : id) };
}

export const composerModelId = (data: SunburstNode['data']) => composerModelSelection(data).modelIds[0] ?? 'gpt-image-2-6';

export function composerAspectRatios(data: SunburstNode['data']): readonly string[] {
  const model = composerModelId(data);
  if (model === 'seedream-5-5') return seedreamChoices.size;
  if (model.startsWith('nano-banana')) return nanoBananaAspectRatios;
  if (!data.inpaint && data.provider === 'apimart' && data.channelModel !== 'gpt-image-2.6') return apimartAspectRatios;
  return ['auto', ...imageSizeLabels.slice(1)];
}

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
  const model = change.selection?.modelIds[0] ?? composerModelId({ ...data, composer });
  const variant = gptImageVariants[model];
  const selectedVariant = change.selection && variant ? { variant } : {};
  const updated = { ...data, ...selectedVariant, composer };
  if (change.ratio !== undefined) delete composer.followReferenceRatio;
  if (change.selection && !composerAspectRatios(updated).includes(composer.ratio)) composer.ratio = 'auto';
  if (!variant) return { composer: { ...composer, modelSettings: {
    ...composer.modelSettings, [model]: { ...composer.modelSettings?.[model], ...settings },
  } } };
  if (change.ratio === undefined && settings.resolution === undefined && !change.selection) return { ...settings, composer };
  const next = { ...composerSettings(updated), ...settings };
  const usesApimart = !data.inpaint && data.provider === 'apimart';
  // OpenAI accepts a pixel size, so choosing a tier from automatic sizing also
  // chooses an explicit square ratio. Keep the toolbar and request in sync.
  if (settings.resolution !== undefined && composer.ratio === 'auto' && !usesApimart) composer.ratio = '1:1';
  const ratio = composer.ratio;
  const resolution = next.resolution as SunburstResolution;
  const size = usesApimart ? ratio : ratio === 'auto' ? 'auto'
    : sunburstPresetSize(imageSizes[imageSizeLabels.indexOf(ratio)] ?? 'auto', resolution);
  return { ...settings, ...selectedVariant, size, resolution, composer };
}

export function changeComposerProvider(data: SunburstNode['data'], provider: SunburstProvider) {
  // Keep restored standard choices; new APIMart choices use EXT.
  const channelModel = data.channelModel ?? 'gpt-image-2.6-ext';
  const converted = sunburstProviderSettings(data, provider, channelModel);
  const next = { ...data, ...converted, provider, channelModel };
  const ratio = provider === 'apimart' && channelModel === 'gpt-image-2.6-ext'
    && !apimartAspectRatios.some(value => value === data.composer!.ratio) ? 'auto' : data.composer!.ratio;
  const patch = changeComposerSettings(next, { ratio });
  if (data.composer?.followReferenceRatio) patch.composer.followReferenceRatio = true;
  return { ...converted, provider, channelModel, ...patch };
}

// Keep the canvas node stable while adapting its settings to existing clients.
export function composerExecutionNode(node: ImageGeneratorNode): ImageGeneratorNode {
  if (node.type !== 'sunburst' || !node.data.composer) return node;
  const selection = node.data.composer.selection;
  if (selection && (selection.autoSelect || selection.modelIds.length !== 1)) throw new Error('请选择一个生成模型。');
  const model = composerModelId(node.data);
  const variant = gptImageVariants[model];
  if (variant) return { ...node, data: { ...node.data, variant, imageInputs: node.data.inpaint ? 1 : 16 } };
  if (node.data.inpaint) throw new Error('局部重绘需要选择 GPT Image 2.6 Sunburst 或 Flare。');
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
