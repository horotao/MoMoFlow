import type { Edge, Rect } from '@xyflow/react';
import { imagePromptModels } from '../components/image-prompt-node/imagePromptModels.ts';
import { selectedImageResult } from './annotationGraph.ts';
import { anchorCanvasImage, canvasImageBaseSize, canvasImageSize } from './canvasImageGeometry.ts';
import { imageInputHandles, isImageInputHandle } from './connectionRules.ts';
import { changeComposerSettings, composerModelSelection } from './imageComposerSettings.ts';
import { referenceRatioSettings } from './imageReferenceRatio.ts';
import { isImageGeneratorNode, type AppNode, type CanvasImage } from './types.ts';

export function imageModelBranches(source: CanvasImage, nodes: AppNode[], edges: Edge[], bounds: (id: string) => Rect) {
  const selection = composerModelSelection(source.data);
  if (source.data.inpaint || selection.autoSelect || !selection.multiple) return;
  const modelIds = [...new Set(selection.modelIds)];
  if (modelIds.length < 2) return;

  const inputEdges = edges.filter(edge => edge.target === source.id
    && (edge.targetHandle === 'prompt' || isImageInputHandle(edge.targetHandle)));
  const reference = inputEdges.filter(edge => isImageInputHandle(edge.targetHandle))
    .sort((a, b) => imageInputHandles.indexOf(a.targetHandle!) - imageInputHandles.indexOf(b.targetHandle!))
    .map(edge => nodes.find(node => node.id === edge.source))
    .filter(isImageGeneratorNode)
    .map(node => selectedImageResult(node))
    .find(Boolean);
  const sourceBounds = bounds(source.id);
  const obstacles = nodes.filter(node => !node.hidden && node.type !== 'canvas-group')
    .map(node => bounds(node.id)).sort((a, b) => a.x - b.x);
  const gap = 64;
  const y = sourceBounds.y;
  let x = sourceBounds.x + sourceBounds.width + gap;
  const branches = modelIds.slice(1).map(modelId => {
    const model = imagePromptModels.find(item => item.id === modelId);
    if (!model) throw new Error('请选择可用的生成模型。');
    const patch = changeComposerSettings(source.data, {
      selection: { modelIds: [modelId], autoSelect: false, multiple: false },
    });
    const data = { ...source.data, ...patch, label: model.name, results: undefined,
      activeResultId: undefined, annotations: undefined, outputMode: undefined, sourceSignature: undefined };
    Object.assign(data, referenceRatioSettings(data, reference));
    const { width, height } = canvasImageSize(data.composer.ratio, undefined, reference);
    for (const other of obstacles) {
      if (y < other.y + other.height && y + height > other.y
        && x < other.x + other.width + gap && x + width + gap > other.x) {
        x = other.x + other.width + gap;
      }
    }
    const node = anchorCanvasImage<CanvasImage>({
      id: crypto.randomUUID(), type: source.type, position: { x: x + (width - canvasImageBaseSize) / 2, y }, data,
    });
    x += width + gap;
    return node;
  });
  return {
    nodes: branches,
    edges: branches.flatMap(branch => inputEdges.map(edge => ({
      ...edge, id: crypto.randomUUID(), target: branch.id, selected: false,
    }))),
  };
}
