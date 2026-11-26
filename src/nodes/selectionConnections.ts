import type { Connection, Edge } from '@xyflow/react';
import { selectedImageResult } from './annotationGraph.ts';
import { canvasImageSize, hasImageDimensions } from './canvasImageGeometry.ts';
import { composerAspectRatio } from './imageComposerSettings.ts';
import { imageInputHandles } from './connectionRules.ts';
import { portChoices, type ConnectionChoice } from './connectionRecommendations.ts';
import { canvasOutputHandle } from './router.ts';
import { isCanvasImageNode, isCanvasVideo, isVideoComposerNode, type AppNode } from './types.ts';
import { videoAudioHandles, videoImageHandles, videoInputHandles } from './videoComposer.ts';

type SourceLink = Pick<Connection, 'source' | 'sourceHandle' | 'targetHandle'>;
type SelectionChoice = ConnectionChoice & { links: SourceLink[] };

function targetSlots(choice: ConnectionChoice) {
  switch (choice.handleId) {
    case 'image-0': return choice.itemId === 'video' ? videoImageHandles : imageInputHandles;
    case 'audio-0': return videoAudioHandles;
    case 'video-0': return videoInputHandles;
    default: return [choice.handleId];
  }
}

/** Each offered destination must have a distinct input for every selected output. */
export function selectionConnectionChoices(nodes: AppNode[], sourceIds: string[], edges: Edge[] = []): SelectionChoice[] {
  if (sourceIds.length < 2) return [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const sources = sourceIds.map(id => {
    const node = byId.get(id);
    const handleId = node?.type === 'router' ? 'out' : canvasOutputHandle(node) ?? null;
    return { id, handleId, choices: portChoices({ direction: 'source', handleId }, node, edges, nodes) };
  });
  const result: SelectionChoice[] = [];
  for (const first of sources[0].choices) {
    const occupied = new Set<string | null>();
    const links: SourceLink[] = [];
    for (const source of sources) {
      const choice = source.choices.find(item => item.itemId === first.itemId);
      const slot = choice && targetSlots(choice).find(handle => !occupied.has(handle));
      if (!slot) break;
      occupied.add(slot);
      links.push({ source: source.id, sourceHandle: source.handleId, targetHandle: slot });
    }
    if (links.length === sources.length) result.push({ ...first, links });
  }
  return result;
}

/** New nodes use a top-center origin. Place their left midpoint on the loose wire
 * endpoint after the first usable reference has determined the rendered size. */
export function selectionTargetSize(node: AppNode, sources: AppNode[]) {
  if (isCanvasImageNode(node)) return canvasImageSize(composerAspectRatio(node.data));
  if (isVideoComposerNode(node)) {
    const image = sources.filter(isCanvasImageNode).map(selectedImageResult).find(Boolean);
    const reference = image ?? sources.filter(isCanvasVideo).find(source => source.data.asset)?.data.asset;
    return canvasImageSize(node.data.videoComposer?.ratio ?? '16:9', reference && hasImageDimensions(reference) ? reference : undefined);
  }
  return canvasImageSize('1:1');
}
