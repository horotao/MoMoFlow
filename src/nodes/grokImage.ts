export const grokImageModel = 'grok-imagine-2.0-ext';
export const grokImageName = 'Grok Imagine 2.0';
export const grokImageRatios = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] as const;
export const grokImageMaxReferences = 5;

export function validateGrokImageRequest(input: Record<string, unknown>) {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt) throw new Error('请输入 Grok Imagine 2.0 提示词。');
  const size = grokImageRatios.find(ratio => ratio === input.size);
  if (!size) throw new Error('Grok Imagine 2.0 的画面比例无效。');
  const images = input.images;
  if (!Array.isArray(images) || images.length > grokImageMaxReferences || !images.every((url): url is string => typeof url === 'string')) {
    throw new Error('Grok Imagine 2.0 最多支持 5 张参考图。');
  }
  return { size, prompt, images };
}
export type GrokImageRequest = ReturnType<typeof validateGrokImageRequest>;
