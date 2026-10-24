import test from 'node:test';
import assert from 'node:assert/strict';
import { compositorChain } from '../../tests/fixtures/compositorChain.ts';
import { compositorInputs, imageOutput } from './sunburstRun.ts';
import { defaultPainterData, painterRevision } from './painter.ts';
import type { AppNode, FileAsset } from './types';

const image: FileAsset = { id: 'source', name: 'source.png', kind: 'image', url: 'blob:source', width: 640, height: 360 };

test('shared multi-level inputs validate each output once per read, not once per path', () => {
  for (const depth of [4, 8, 16, 32]) {
    const { nodes, edges, compositors } = compositorChain(depth, image);
    let validations = 0;
    for (const node of compositors) {
      const revision = node.data.outputRevision;
      Object.defineProperty(node.data, 'outputRevision', { get() { validations++; return revision; } });
    }
    const last = compositors[depth - 1];
    assert.deepEqual(imageOutput(last, 'result', nodes, edges), [last.data.result]);
    assert.equal(validations, depth);
    validations = 0;
    const inputs = compositorInputs(last.id, nodes, edges);
    assert.equal(inputs.background.asset?.id, compositors[depth - 2].data.result?.id);
    assert.equal(inputs['layer-1'].asset, inputs.background.asset);
    assert.equal(validations, depth - 1);
  }
});

test('empty outputs are shared within a read and edits, undo and reconnect revalidate on the next read', () => {
  const { nodes, edges, file, compositors } = compositorChain(16, image), last = compositors[15];
  const original = compositors[0].data.outputRevision;
  let validations = 0, revision = 'stale';
  Object.defineProperty(compositors[0].data, 'outputRevision', { get() { validations++; return revision; } });
  assert.deepEqual(imageOutput(last, 'result', nodes, edges), []);
  assert.equal(validations, 1);
  revision = original!;
  assert.deepEqual(imageOutput(last, 'result', nodes, edges), [last.data.result]);
  const document = compositors[0].data.document;
  compositors[0].data.document = { ...document, canvas: { ...document.canvas, fill: '#ff0000' } };
  assert.deepEqual(imageOutput(last, 'result', nodes, edges), []);
  compositors[0].data.document = document;
  assert.deepEqual(imageOutput(last, 'result', nodes, edges), [last.data.result]);
  assert.deepEqual(imageOutput(last, 'result', nodes, edges.slice(1)), []);
  assert.deepEqual(imageOutput(last, 'result', nodes, edges), [last.data.result]);
  if (file.type === 'file') file.data.assets = [{ ...image, id: 'replacement' }];
  assert.deepEqual(imageOutput(last, 'result', nodes, edges), []);
  if (file.type === 'file') file.data.assets = [{ ...image, url: 'blob:restored' }];
  assert.deepEqual(imageOutput(last, 'result', nodes, edges), [last.data.result]);
});

test('memoized outputs retain separate Painter result, mask and alpha-mask ports', () => {
  const painter: AppNode = { id: 'painter', type: 'painter', position: { x: 0, y: 0 }, data: {
    ...defaultPainterData, result: { ...image, id: 'result' }, mask: { ...image, id: 'mask' }, alphaMask: { ...image, id: 'alpha' },
    outputRevision: painterRevision(defaultPainterData),
  } };
  const inputs = compositorInputs('consumer', [painter], ['result', 'mask', 'alpha-mask', 'result'].map((handle, index) => ({
    id: `${index}`, source: painter.id, sourceHandle: handle, target: 'consumer', targetHandle: `layer-${index}`,
  })));
  assert.deepEqual(Object.values(inputs).map(input => input.asset?.id), ['result', 'mask', 'alpha', 'result']);
});

test('path cycle detection rejects indirect cycles without marking shared siblings as cyclic', () => {
  const { nodes, edges, compositors } = compositorChain(8, image), last = compositors[7];
  const cyclic = edges.map(edge => edge.target === compositors[0].id ? { ...edge, source: last.id, sourceHandle: 'result' } : edge);
  assert.deepEqual(imageOutput(last, 'result', nodes, cyclic), []);
  const inputs = compositorInputs(last.id, nodes, cyclic);
  assert.equal(inputs.background.asset, undefined);
  assert.equal(inputs['layer-1'].asset, undefined);
  assert.deepEqual(imageOutput(last, 'result', nodes, edges), [last.data.result]);
  const visited = new Set([last.id]);
  assert.deepEqual(imageOutput(last, 'result', nodes, edges, visited), []);
  assert.deepEqual([...visited], [last.id]);
});
