import { sunburstPreset } from './imageNodePresets.ts';
import { anchorCanvasImage } from '../nodes/canvasImageGeometry.ts';
import type { SunburstNode, CanvasText } from '../nodes/types';

export function createLibraryNode(id: 'image', position: { x: number; y: number }): SunburstNode;
export function createLibraryNode(id: 'text', position: { x: number; y: number }): CanvasText;
export function createLibraryNode(id: string, position: { x: number; y: number }): SunburstNode | CanvasText | undefined;
export function createLibraryNode(id: string, position: { x: number; y: number }): SunburstNode | CanvasText | undefined {
  if (id === 'text') return anchorCanvasImage<CanvasText>({ id: crypto.randomUUID(), type: 'text', position, selected: true,
    data: { text: '', label: 'Text', textComposer: { prompt: '', format: 'txt', quantity: 1, reasoningEffort: 'medium', webSearch: false,
      selection: { modelIds: ['gpt-6.2-sol'], autoSelect: false, multiple: false } } } });
  if (id !== 'image') return;
  const preset = sunburstPreset.newNodeData();
  return anchorCanvasImage<SunburstNode>({ id: crypto.randomUUID(), position, selected: true, type: 'sunburst', data: {
    ...preset,
  } });
}
