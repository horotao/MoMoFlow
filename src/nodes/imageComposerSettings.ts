import { imageSizes, imageSizeLabels, sunburstPresetSize, sunburstSizePreset, sunburstProviderSettings, apimartAspectRatios, apimartStandardAspectRatios, migrateSunburstProvider, type SunburstChannel, type SunburstProvider, type SunburstResolution } from './sunburst.ts';
import { defaultSeedreamSettings, seedreamChoices } from './seedream.ts';
import { defaultNanoBananaSettings, nanoBananaAspectRatios, nanoBananaProAspectRatios, nanoBananaProModel } from './nanoBanana.ts';
import { defaultKlingImageSettings, klingImageModel, klingImageQuantityRange, klingImageRatios } from './klingImage.ts';
import { defaultImagePromptModelSelection, gptImageVariants, restoreImagePromptModelSelection, type ImagePromptModelId } from '../components/image-prompt-node/imagePromptModels.ts';
import type { ImageComposerData, SunburstNode, ImageGeneratorNode, NanoBananaNode, SeedreamNode } from './types';

export function composerModelSelection(data: SunburstNode['data']) {
  const selection = restoreImagePromptModelSelection(data.composer?.selection ?? defaultImagePromptModelSelection);
  // Older projects stored Flare in variant and used the shared GPT Image menu ID.
  if (data.variant !== 'Flare' || !selection.modelIds.includes('gpt-image-2-6')
    || selection.modelIds.includes('gpt-image-2-6-flare')) return selection;
  return { ...selection, modelIds: selection.modelIds.map(id => id === 'gpt-image-2-6' ? 'gpt-image-2-6-flare' : id) };
}

export const composerModelId = (data: SunburstNode['data']) => composerModelSelection(data).modelIds[0] ?? 'gpt-image-2-6';

export function composerChannel(data: SunburstNode['data']): SunburstChannel {
  if (data.inpaint) return 'openai';
  const migrated = migrateSunburstProvider(data.provider);
  if (migrated) return migrated.channelModel;
  return data.provider === 'apimart' ? data.channelModel ?? 'gpt-image-2.6-ext' : 'openai';
}

export function composerAspectRatios(data: SunburstNode['data']): readonly string[] {
  const model = composerModelId(data);
  if (model === klingImageModel) return klingImageRatios;
  if (model === 'seedream-5-5') return seedreamChoices.size;
  if (model === 'nano-banana-pro') return nanoBananaProAspectRatios;
  if (model === 'nano-banana-2-1') return nanoBananaAspectRatios;
  const channel = composerChannel(data);
  if (channel === 'gpt-image-2.6-ext') return apimartAspectRatios;
  if (channel === 'gpt-image-2.6') return apimartStandardAspectRatios;
  return ['auto', ...imageSizeLabels.slice(1)];
}

export function composerAspectRatio(data: SunburstNode['data']) {
  const ratio = data.composer?.ratio ?? 'auto';
  const model = composerModelId(data);
  if (model === klingImageModel && !klingImageRatios.some(choice => choice === ratio)) return 'auto';
  // Pro could already be saved with an unsupported ratio while it was a placeholder.
  return model === 'nano-banana-pro' && !nanoBananaProAspectRatios.some(choice => choice === ratio)
    ? 'auto' : ratio;
}

export function savedComposerModelSettings(byModel: ImageComposerData['modelSettings'], model: ImagePromptModelId) {
  return byModel?.[model] ?? (model === 'nano-banana-2-1' ? byModel?.['nano-banana-2'] : undefined);
}

export function composerQuantityRange(data: SunburstNode['data']) {
  const selection = composerModelSelection(data);
  if (selection.autoSelect || !selection.modelIds.includes(klingImageModel)) return { min: 1, max: 20 };
  return klingImageQuantityRange(data.composer?.modelSettings?.[klingImageModel]?.mode);
}

export function composerKlingSettings(data: SunburstNode['data']) {
  const saved = savedComposerModelSettings(data.composer?.modelSettings, klingImageModel);
  return { resolution: saved?.resolution ?? defaultKlingImageSettings.resolution,
    mode: saved?.mode ?? defaultKlingImageSettings.mode, outputFormat: defaultKlingImageSettings.outputFormat };
}

export function composerSettings(data: SunburstNode['data']): {
  resolution: string; outputFormat: string; background?: string; quality?: string; mode?: string;
} {
  const model = composerModelId(data);
  if (model === klingImageModel) return composerKlingSettings(data);
  const saved = savedComposerModelSettings(data.composer?.modelSettings, model);
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
  const nextVariant = change.selection?.modelIds.map(id => gptImageVariants[id]).find(Boolean);
  const selectedVariant = nextVariant ? { variant: nextVariant } : {};
  const updated = { ...data, ...selectedVariant, composer };
  if (!variant) composer.modelSettings = {
    ...composer.modelSettings, [model]: { ...savedComposerModelSettings(composer.modelSettings, model), ...settings },
  };
  const { min, max } = composerQuantityRange(updated);
  composer.quantity = Math.max(min, Math.min(max, composer.quantity));
  if (change.ratio !== undefined) delete composer.followReferenceRatio;
  if (change.selection && !composerAspectRatios(updated).includes(composer.ratio)) composer.ratio = 'auto';
  if (!variant) return { ...selectedVariant, composer };
  if (change.ratio === undefined && settings.resolution === undefined && !change.selection) return { ...settings, composer };
  const next = { ...composerSettings(updated), ...settings };
  const usesApimart = composerChannel(data) !== 'openai';
  // OpenAI accepts a pixel size, so choosing a tier from automatic sizing also
  // chooses an explicit square ratio. Keep the toolbar and request in sync.
  if (settings.resolution !== undefined && composer.ratio === 'auto' && !usesApimart) composer.ratio = '1:1';
  const ratio = composer.ratio;
  const resolution = next.resolution as SunburstResolution;
  const size = usesApimart ? ratio : ratio === 'auto' ? 'auto'
    : sunburstPresetSize(imageSizes[imageSizeLabels.indexOf(ratio)] ?? 'auto', resolution);
  return { ...settings, ...selectedVariant, size, resolution, composer };
}

export function changeComposerChannel(data: SunburstNode['data'], channel: SunburstChannel) {
  const provider: SunburstProvider = channel === 'openai' ? 'openai' : 'apimart';
  const channelModel = channel === 'openai' ? data.channelModel : channel;
  const converted = sunburstProviderSettings(data, provider, channelModel);
  const next = { ...data, ...converted, provider, channelModel };
  const previousRatio = data.composer!.ratio;
  const ratio = next.outputFormat !== 'gif' && composerAspectRatios(next).includes(previousRatio) ? previousRatio : 'auto';
  const patch = changeComposerSettings(next, { ratio });
  if (data.composer?.followReferenceRatio) patch.composer.followReferenceRatio = true;
  return { ...converted, provider, channelModel, ...patch };
}

// Keep the canvas node stable while adapting its settings to existing clients.
export function composerExecutionNode(node: ImageGeneratorNode): ImageGeneratorNode {
  if (node.type !== 'sunburst' || !node.data.composer) return node;
  const selection = composerModelSelection(node.data);
  const [model] = selection.modelIds;
  if (selection.autoSelect || !model || (selection.modelIds.length > 1 && (!selection.multiple || node.data.inpaint))) {
    throw new Error('请选择一个生成模型。');
  }
  const variant = gptImageVariants[model];
  if (variant) return { ...node, data: { ...node.data, variant, imageInputs: node.data.inpaint ? 1 : 16 } };
  if (node.data.inpaint) throw new Error('局部重绘需要选择 GPT Image 2.6 Sunburst 或 Flare。');
  if (model === klingImageModel) return node;
  const settings = composerSettings(node.data);
  const common = { locked: node.data.locked, label: node.data.label, imageInputs: 16, results: node.data.results, activeResultId: node.data.activeResultId };
  if (model === 'seedream-5-5') return { ...node, type: 'seedream', data: {
    ...common, ...defaultSeedreamSettings, ...settings, size: node.data.composer.ratio,
  } } as SeedreamNode;
  if (model === 'nano-banana-2-1' || model === 'nano-banana-pro') return { ...node, type: 'nano-banana', data: {
    ...common, ...defaultNanoBananaSettings, outputFormat: settings.outputFormat,
    aspectRatio: composerAspectRatio(node.data), imageSize: settings.resolution,
    ...(model === 'nano-banana-pro' ? { model: nanoBananaProModel } : {}),
  } } as NanoBananaNode;
  throw new Error('请选择可用的生成模型。');
}
