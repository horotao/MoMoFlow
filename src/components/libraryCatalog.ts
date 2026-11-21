import { sunburstPreset } from './imageNodePresets.ts';
import { anchorCanvasImage } from '../nodes/canvasImageGeometry.ts';
import type { SunburstNode } from '../nodes/types';

export function createLibraryNode(id: string, position: { x: number; y: number }): SunburstNode | undefined {
  if (id !== 'image') return;
  const preset = sunburstPreset.newNodeData();
  return anchorCanvasImage<SunburstNode>({ id: crypto.randomUUID(), position, selected: true, type: 'sunburst', data: {
    ...preset,
  } });
}
