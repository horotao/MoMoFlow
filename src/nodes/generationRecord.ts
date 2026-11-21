import type { FileAsset } from './types';

export const modelInputSignatureVersion = 'model-input-v1';

export function savedImagePrompt(asset: FileAsset): string | undefined {
  const generation = asset.generation;
  if (asset.kind !== 'image' || generation?.version !== 1 || generation.outputSignature !== asset.id) return;
  try {
    const input: unknown = JSON.parse(generation.inputSignature);
    if (!Array.isArray(input) || input[0] !== modelInputSignatureVersion) return;
    const prompt: unknown = input[2]?.prompt;
    if (typeof prompt === 'string' && prompt.trim()) return prompt;
  } catch { /* Older or damaged generation records may not contain a recoverable prompt. */ }
}
