import type { PromptModelSelection } from './ImagePromptModelMenu';
import { textModels, textModelSelection, defaultTextModel } from '../../nodes/textGeneration.ts';
export { textModels };
export function textModelLabel(selection: PromptModelSelection) {
  const current = textModelSelection(selection);
  return current.autoSelect ? '自动选择模型' : current.modelIds.length > 1 ? `${current.modelIds.length} 个模型`
    : textModels.find(model => model.id === current.modelIds[0])?.name ?? textModels.find(model => model.id === defaultTextModel)!.name;
}
