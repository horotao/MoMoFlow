import type { Edge } from '@xyflow/react';
import { isModelNode } from './executionGraph.ts';
import { isCanvasTextNode, isVideoComposerNode, isNodeLocked, type AppNode } from './types.ts';

export const maxSelectionGenerationNodes = 50;

export const canvasRunSelectionEvent = 'canvas-run-selection';

export function requestCanvasRun(ids?: string[]) {
  window.dispatchEvent(new CustomEvent(canvasRunSelectionEvent, { detail: ids }));
}

export function generationNodes(nodes: AppNode[]) {
  return nodes.filter(node => !node.hidden && !isNodeLocked(node) && (isModelNode(node) || isCanvasTextNode(node) || isVideoComposerNode(node) || node.type === 'audio'));
}

export function selectedGenerationNodes(nodes: AppNode[]) {
  return generationNodes(nodes.filter(node => node.selected));
}

export function runGenerationSelection(ids: string[], edges: Edge[], start: (id: string) => Promise<boolean>,
  runs = new Map<string, Promise<boolean>>()) {
  const prerequisites = new Map(ids.map(id => [id, new Set<string>()]));
  for (const { source, target } of edges) {
    if (prerequisites.has(source)) prerequisites.get(target)?.add(source);
  }
  const scheduled: string[] = [];
  function run(id: string, path: ReadonlySet<string>): Promise<boolean> {
    if (path.has(id)) return Promise.resolve(false);
    const existing = runs.get(id);
    if (existing) return existing;
    const next = new Set([...path, id]);
    const upstream = [...prerequisites.get(id)!].map(source => run(source, next));
    const result = Promise.all(upstream).then(results => results.every(Boolean) ? start(id) : false);
    runs.set(id, result);
    scheduled.push(id);
    return result;
  }
  return Promise.all([...prerequisites.keys()].map(id => run(id, new Set())))
    .finally(() => scheduled.forEach(id => runs.delete(id)));
}
