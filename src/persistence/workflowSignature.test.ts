import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowSignature } from './workflowSignature.ts';
import { defaultSunburstSettings } from '../nodes/sunburst.ts';
import type { Workflow } from './workflowStorage';
import type { SunburstNode } from '../nodes/types';

const text: SunburstNode = { id: 'text', type: 'sunburst', position: { x: 10, y: 20 }, data: { ...defaultSunburstSettings, imageInputs: 16, composer: { prompt: '中文提示词', quantity: 1, ratio: '1:1' } } };
const source: SunburstNode = { ...text, id: 'source', data: { ...text.data } };
const baseline: Workflow = { nodes: [source, text], edges: [{ id: 'edge', source: 'source', target: 'text', sourceHandle: 'result', targetHandle: 'image-0' }], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' };

test('selection, dragging, measured dimensions and resize flags do not dirty a restored canvas', () => {
  const transient: Workflow = {
    ...baseline,
    nodes: [source, { ...text, selected: true, dragging: true, resizing: false, measured: { width: 480, height: 405 } }],
    edges: baseline.edges.map(edge => ({ ...edge, selected: true })),
  };
  assert.equal(workflowSignature(transient), workflowSignature(baseline));
});

test('actual text, graph, geometry, parameters, asset and viewport edits still dirty the canvas', () => {
  const edits: Workflow[] = [
    { ...baseline, nodes: [source, { ...text, data: { ...text.data, composer: { ...text.data.composer!, prompt: 'changed' } } }] },
    { ...baseline, nodes: [source, { ...text, data: { ...text.data, locked: true } }] },
    { ...baseline, nodes: [source, { ...text, position: { x: 11, y: 20 } }] },
    { ...baseline, nodes: [source, { ...text, style: { width: 600 } }] },
    { ...baseline, edges: [] },
    { ...baseline, nodes: [] },
    { ...baseline, viewport: { x: 10, y: 0, zoom: 1 } },
    { ...baseline, viewport: { x: 0, y: 0, zoom: 0.75 } },
    { ...baseline, nodes: [source, { ...text, data: { ...text.data, results: [{ id: 'a', name: 'a.png', kind: 'image' as const, url: 'blob:a' }] } }] },
  ];
  for (const edit of edits) assert.notEqual(workflowSignature(edit), workflowSignature(baseline));
  assert.equal(workflowSignature(structuredClone(baseline)), workflowSignature(baseline));
});

test('legacy light mode normalizes without dirtying restored content', () => {
  assert.equal(workflowSignature({ ...baseline, colorMode: 'light' }), workflowSignature(baseline));
});
