import { createLibraryNode } from '../../src/components/libraryCatalog';
import type { SunburstNode } from '../../src/nodes/types';

export function canvasImage(id: string, x: number, y: number, data: Partial<SunburstNode['data']> = {}): SunburstNode {
  const node = createLibraryNode('image', { x, y });
  if (node?.type !== 'sunburst' || !node.data.composer) throw new Error('Image factory unavailable');
  return { ...node, id, className: 'canvas-image-node', selected: false, data: { ...node.data, ...data } };
}
