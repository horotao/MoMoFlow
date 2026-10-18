import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTextValue } from './textVariables.ts';
import type { AppNode } from './types.ts';

test('describer output and exposed model values propagate to downstream text nodes', () => {
  const nodes: AppNode[] = [
    { id: 'image', type: 'image-describer', position: { x: 0, y: 0 }, data: { text: 'A mountain at sunset', model: 'test-model', instructions: '', imageInputs: 1 } },
    { id: 'model', type: 'model-input', position: { x: 0, y: 0 }, data: { model: 'another-model' } },
    { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Cinematic light' } },
  ];
  assert.equal(resolveTextValue('model', nodes, []), 'another-model');
  assert.equal(resolveTextValue('prompt', nodes, [{ id: 'edge', source: 'image', target: 'prompt', targetHandle: 'variable-1' }]), 'A mountain at sunset Cinematic light');
});
