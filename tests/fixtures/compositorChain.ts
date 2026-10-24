import { compositorRevision, defaultCompositorDocument } from '../../src/nodes/compositor.ts';
import type { AppNode, CompositorNode, FileAsset } from '../../src/nodes/types';
import type { Edge } from '@xyflow/react';

// Each level fans out to both inputs of the next level. Since both full-size
// layers are identical, these valid initial results share the source PNG pixels.
export function compositorChain(depth: number, image: FileAsset) {
  const file: AppNode = { id: 'chain-file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [image] } };
  const nodes: AppNode[] = [file], edges: Edge[] = [], compositors: CompositorNode[] = [];
  let source = file.id, asset = image;
  for (let index = 0; index < depth; index++) {
    const id = `chain-${index}`, document = defaultCompositorDocument();
    const inputs = { background: { connected: true, asset }, 'layer-1': { connected: true, asset } };
    const result = { ...image, id: `${id}-output`, name: `${id}.png` };
    const node: CompositorNode = { id, type: 'compositor', position: { x: 480 * (index + 1), y: 0 }, data: {
      label: `Chain ${index + 1}`, document, result, outputRevision: compositorRevision(document, inputs),
    } };
    for (const handle of ['background', 'layer-1']) edges.push({ id: `${id}-${handle}`, source, sourceHandle: index ? 'result' : 'file', target: id, targetHandle: handle });
    nodes.push(node); compositors.push(node); source = id; asset = result;
  }
  return { nodes, edges, file, compositors };
}
