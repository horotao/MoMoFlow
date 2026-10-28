import type { TextIteration } from './textIterator';
import type { ImageIteration } from './imageIterator';

export type WorkflowIteration = TextIteration | ImageIteration;

export function sameIteration(left: WorkflowIteration, right?: WorkflowIteration) {
  if (!right || left.nodeId !== right.nodeId || left.itemId !== right.itemId) return false;
  return left.kind === 'image' ? right.kind === 'image' && left.signature === right.signature
    : right.kind !== 'image' && left.text === right.text;
}
