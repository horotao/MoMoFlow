import type { PromptModelSelection } from './ImagePromptModelMenu';
import { textModels, defaultTextModel } from '../../nodes/textGeneration.ts';
export { textModels };
export function textModelDisplay({ autoSelect, modelIds }: PromptModelSelection) {
  if (autoSelect) return { label: '自动选择模型', brand: 'openai' };
  if (modelIds.length > 1) return { label: `${modelIds.length} 个模型`, brand: 'openai' };
  const model = textModels.find(model => model.id === modelIds[0]) ?? textModels.find(model => model.id === defaultTextModel)!;
  return { label: model.name, brand: model.brand };
}
