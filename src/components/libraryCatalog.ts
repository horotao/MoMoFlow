import { sunburstPreset } from './imageNodePresets';
import type { SunburstNode } from '../nodes/types';

export function createLibraryNode(id: string, position: { x: number; y: number }): SunburstNode | undefined {
  if (id !== 'image') return;
  const preset = sunburstPreset.newNodeData();
  return { id: crypto.randomUUID(), position, selected: true, type: 'sunburst', data: {
    ...preset, variant: 'Sunburst', outputFormat: 'png', imageInputs: 16,
    size: preset.provider === 'openai' ? '1024x1024' : '1:1', composer: { prompt: '', quantity: 1, ratio: '1:1' },
  } };
}
