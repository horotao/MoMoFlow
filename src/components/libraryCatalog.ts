import { defaultRouterLabel, routerSize } from '../nodes/router.ts';
import { defaultAudioComposer } from '../nodes/audioComposer.ts';
import { defaultVideoComposer } from '../nodes/videoComposer.ts';
import { sunburstPreset } from './imageNodePresets.ts';
import { anchorCanvasImage, canvasImageSize } from '../nodes/canvasImageGeometry.ts';
import type { SunburstNode, CanvasText, CanvasRouter, CanvasMediaNode } from '../nodes/types';

export function createLibraryNode(id: 'router', position: { x: number; y: number }): CanvasRouter;
export function createLibraryNode(id: 'image', position: { x: number; y: number }): SunburstNode;
export function createLibraryNode(id: 'text', position: { x: number; y: number }): CanvasText;
export function createLibraryNode(id: 'video' | 'audio', position: { x: number; y: number }): CanvasMediaNode;
export function createLibraryNode(id: string, position: { x: number; y: number }): SunburstNode | CanvasText | CanvasMediaNode | CanvasRouter | undefined;
export function createLibraryNode(id: string, position: { x: number; y: number }): SunburstNode | CanvasText | CanvasMediaNode | CanvasRouter | undefined {
  if (id === 'router') return { id: crypto.randomUUID(), type: id, origin: [.5, 0], selected: true,
    position: { x: position.x + routerSize.width / 2, y: position.y }, data: { label: defaultRouterLabel } };
  if (id === 'video' || id === 'audio') {
    const base = { id: crypto.randomUUID(), position, selected: true };
    if (id === 'video') return { ...base, type: id, origin: [.5, 0],
      position: { x: position.x + canvasImageSize(defaultVideoComposer.ratio).width / 2, y: position.y },
      data: { label: 'Video', videoComposer: { ...defaultVideoComposer } } };
    return anchorCanvasImage<CanvasMediaNode>({ ...base, type: id, data: { label: 'Audio', audioComposer: { ...defaultAudioComposer } } });
  }
  if (id === 'text') return anchorCanvasImage<CanvasText>({ id: crypto.randomUUID(), type: 'text', position, selected: true,
    data: { text: '', label: 'Text', textComposer: { prompt: '', format: 'txt', quantity: 1, reasoningEffort: 'medium', webSearch: false,
      selection: { modelIds: ['gpt-6.2-sol'], autoSelect: false, multiple: false } } } });
  if (id !== 'image') return;
  const preset = sunburstPreset.newNodeData();
  return anchorCanvasImage<SunburstNode>({ id: crypto.randomUUID(), position, selected: true, type: 'sunburst', data: {
    ...preset,
  } });
}
