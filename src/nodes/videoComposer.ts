import type { VideoComposer } from './types';
import { normalizeVideoComposer } from './apimartVideo.ts';

export const videoModels = [
  { id: 'seedance', name: 'Seedance 2.5 Flash', brand: 'bytedance', description: '字节跳动 Seedance 2.5 视频模型的快速版，可根据文本、图片、参考视频和音频生成 480p 和 720p 视频。' },
  { id: 'kling', name: 'Kling V4 Flash', brand: 'kling', description: '快手可灵 Kling 4.0 中更快、更具性价比的一档，用同一个模型 ID 完成文生视频、首帧图生视频、参考生视频、视频编辑与续写。每段视频 3～20 秒、720p，均带音轨。' },
  { id: 'minimax', name: 'MiniMax H3', brand: 'minimax', description: 'MiniMax H3 可生成最长 15 秒的 2K 视频，并带原生立体声音频。' },
] as const;
export const defaultVideoComposer: VideoComposer = { prompt: '', model: 'seedance', ratio: '16:9', seconds: 5 };
export const videoImageHandles = Array.from({ length: 9 }, (_, i) => `image-${i}`);
export const videoInputHandles = Array.from({ length: 3 }, (_, i) => `video-${i}`);

export function videoModelDisplay(composer: VideoComposer) {
  const selection = normalizeVideoComposer(composer).selection!;
  const model = videoModels.find(item => item.id === selection.modelIds[0]) ?? videoModels[0];
  return { selection, label: model.name, brand: model.brand };
}
