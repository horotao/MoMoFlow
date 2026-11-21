import { sunburstPreset } from './imageNodePresets';
import { anchorCanvasImage } from '../nodes/canvasImageGeometry';
import type { SunburstNode } from '../nodes/types';

export function createLibraryNode(id: string, position: { x: number; y: number }): SunburstNode | undefined {
  if (id !== 'image') return;
  const preset = sunburstPreset.newNodeData();
  return anchorCanvasImage<SunburstNode>({ id: crypto.randomUUID(), position, selected: true, type: 'sunburst', data: {
    ...preset, variant: 'Sunburst', outputFormat: 'png', imageInputs: 16,
    size: 'auto', composer: { prompt: '', quantity: 1, ratio: 'auto' },
  } });
}
