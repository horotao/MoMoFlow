import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowSignature } from './workflowSignature.ts';
import { initialTextDocument, documentText } from '../nodes/textDocument.ts';
import type { Workflow } from './workflowStorage';
import type { TextNode } from '../nodes/types';

const text: TextNode = { id: 'text', type: 'text', position: { x: 10, y: 20 }, data: { text: '中文提示词' } };
const baseline: Workflow = { nodes: [text], edges: [{ id: 'edge', source: 'source', target: 'text', targetHandle: 'variable-1' }], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' };

test('selection, dragging, measured dimensions and resize flags do not dirty a restored canvas', () => {
  const transient: Workflow = {
    ...baseline,
    nodes: [{ ...text, selected: true, dragging: true, resizing: false, measured: { width: 480, height: 405 } }],
    edges: baseline.edges.map(edge => ({ ...edge, selected: true })),
  };
  assert.equal(workflowSignature(transient), workflowSignature(baseline));
});

test('hydrated legacy text, rich document key order and empty paragraphs are equivalent', () => {
  const content = initialTextDocument(text.data.text, ['variable-1'], text.id);
  const hydrated: Workflow = { ...baseline, nodes: [{ ...text, data: { content, text: documentText(content) } }] };
  assert.equal(workflowSignature(hydrated), workflowSignature(baseline));
  const empty: Workflow = { ...baseline, edges: [], nodes: [{ ...text, data: { text: '', content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] } } }] };
  const tiptap: Workflow = { ...empty, nodes: [{ ...text, data: { content: { content: [{ type: 'paragraph' }], type: 'doc' }, text: '' } }] };
  assert.equal(workflowSignature(empty), workflowSignature(tiptap));
  assert.equal(workflowSignature({ ...baseline, version: 1, revision: 'storage metadata' } as Workflow), workflowSignature(baseline));
});

test('actual text, graph, geometry, parameters, asset and viewport edits still dirty the canvas', () => {
  const edits: Workflow[] = [
    { ...baseline, nodes: [{ ...text, data: { text: 'changed' } }] },
    { ...baseline, nodes: [{ ...text, data: { ...text.data, locked: true } }] },
    { ...baseline, nodes: [{ ...text, position: { x: 11, y: 20 } }] },
    { ...baseline, nodes: [{ ...text, style: { width: 600 } }] },
    { ...baseline, edges: [] },
    { ...baseline, nodes: [] },
    { ...baseline, viewport: { x: 10, y: 0, zoom: 1 } },
    { ...baseline, viewport: { x: 0, y: 0, zoom: 0.75 } },
    { ...baseline, colorMode: 'light' },
    { ...baseline, nodes: [...baseline.nodes, { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [{ id: 'a', name: 'a.png', kind: 'image', url: 'blob:a' }] } }] },
  ];
  for (const edit of edits) assert.notEqual(workflowSignature(edit), workflowSignature(baseline));
  assert.equal(workflowSignature(structuredClone(baseline)), workflowSignature(baseline));
});
