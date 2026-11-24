import type { VideoComposer } from './types';

export const videoModels = [
  { id: 'seedance', name: 'Seedance 2.5', brand: 'bytedance', description: '字节跳动 · 视频生成' },
  { id: 'kling', name: 'Kling V4', brand: 'kling', description: '可灵 · 视频生成' },
  { id: 'minimax', name: 'MiniMax H3 Max', brand: 'minimax', description: 'MiniMax · 视频生成' },
] as const;
export const defaultVideoComposer: VideoComposer = { prompt: '', model: 'seedance', ratio: '16:9', seconds: 5 };
export const videoRatios = ['16:9', '1:1', '9:16'] as const;
export const videoImageHandles = Array.from({ length: 9 }, (_, i) => `image-${i}`);
export const videoInputHandles = Array.from({ length: 3 }, (_, i) => `video-${i}`);

export function videoModelDisplay(composer: VideoComposer) {
  const selection = composer.selection ?? { modelIds: [composer.model], autoSelect: false, multiple: false };
  const model = videoModels.find(item => item.id === selection.modelIds[0]) ?? videoModels[0];
  const label = selection.autoSelect ? '自动选择模型' : selection.modelIds.length > 1 ? `${selection.modelIds.length} 个模型` : model.name;
  return { selection, label, brand: model.brand };
}
