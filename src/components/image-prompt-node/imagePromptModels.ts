import type { SunburstVariant } from '../../nodes/sunburst';

// Listed timings are reference presentation, not live estimates.
export const imagePromptModels = [
  { id: 'nano-banana-2', name: 'Nano Banana 2', brand: 'google', time: '1 分钟', description: "Google 全新一代先进图像模型。" },
  { id: 'nano-banana-2-1', name: 'Nano Banana 2.1', brand: 'google', time: '40 秒', description: "Google 快速图像模型，支持调节思考强度，是 Nano Banana 2 的升级版。" },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', brand: 'google', time: '15 秒', description: 'Google 高画质图像模型，最高支持 4K。' },
  { id: 'gpt-image-2-6', name: 'GPT Image 2.6 Sunburst', brand: 'openai', time: '1 分钟', description: 'OpenAI 旗舰图像模型，擅长精细创作。' },
  { id: 'gpt-image-2-6-flare', name: 'GPT Image 2.6 Flare', brand: 'openai', time: '30 秒', description: 'OpenAI 图像生成与编辑模型，适合快速迭代。' },
  { id: 'seedream-5-5', name: 'Seedream 5.5', brand: 'bytedance', time: '25 秒', isNew: true, description: '字节跳动图像模型，支持最多 10 张参考图和透明背景。' },
] as const;
export type ImagePromptModelId = typeof imagePromptModels[number]['id'];
export const gptImageVariants: Partial<Record<ImagePromptModelId, SunburstVariant>> = {
  'gpt-image-2-6': 'Sunburst',
  'gpt-image-2-6-flare': 'Flare',
};
export const inpaintModels = imagePromptModels.filter(model => gptImageVariants[model.id]);

export interface ImagePromptModelSelection {
  modelIds: ImagePromptModelId[];
  autoSelect: boolean;
  multiple: boolean;
}
export const defaultImagePromptModelSelection: ImagePromptModelSelection = {
  modelIds: ['gpt-image-2-6'], autoSelect: false, multiple: false,
};
