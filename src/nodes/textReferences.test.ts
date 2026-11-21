import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryNode } from '../components/libraryCatalog.ts';
import { textInputReferences, textReferenceEdges } from './textReferences.ts';
import { textGenerationInput } from './textGeneration.ts';

test('Text previews use the same selected images and port order as execution, and follow upstream names and history', () => {
  const text = { ...createLibraryNode('text', { x: 0, y: 0 }), id: 'source' };
  text.data.label = '西瓜 雨伞 公交站'; text.data.text = '上游提示词';
  const target = { ...createLibraryNode('text', { x: 500, y: 0 }), id: 'target' };
  const a = { ...createLibraryNode('image', { x: 0, y: 500 }), id: 'image-a' };
  const b = { ...createLibraryNode('image', { x: 0, y: 1000 }), id: 'image-b' };
  a.data.results = [{ id: 'a1', kind: 'image', name: '第一张', url: 'first.png' }, { id: 'a2', kind: 'image', name: '第二张', url: 'second.png' }];
  a.data.activeResultId = 'a1';
  b.data.results = [{ id: 'b1', kind: 'image', name: '第三张', url: 'third.png' }];
  const edges = [
    { id: 'b', source: b.id, target: target.id, sourceHandle: 'result', targetHandle: 'image-3' },
    { id: 't', source: text.id, target: target.id, sourceHandle: 'text', targetHandle: 'text' },
    { id: 'a', source: a.id, target: target.id, sourceHandle: 'result', targetHandle: 'image-0' },
    { id: 'other', source: b.id, target: 'elsewhere', sourceHandle: 'result', targetHandle: 'image-0' },
  ];
  const before = JSON.stringify(edges);
  const incoming = textReferenceEdges(target.id, edges);
  const sources = [text, a, b];
  const preview = textInputReferences(incoming, sources);
  assert.deepEqual(preview.map(item => item.id), ['t', 'a', 'b']);
  assert.equal(preview[0].kind, 'text'); assert.equal(preview[0].name, text.data.label);
  assert.deepEqual(preview.filter(item => item.kind === 'image').map(item => item.url), textGenerationInput(target.id, [...sources, target], edges).images);
  text.data.label = '改名后的文本'; a.data.activeResultId = 'a2';
  const updated = textInputReferences(incoming, sources);
  assert.equal(updated[0].name, '改名后的文本'); assert.equal(updated[1].url, 'second.png');
  assert.equal(updated[1].name, '第二张'); assert.equal(JSON.stringify(edges), before);
  assert.deepEqual(textInputReferences(textReferenceEdges(target.id, edges.filter(edge => edge.id !== 't')), sources).map(item => item.id), ['a', 'b']);
});

test('Text reference connections stay visible while an upstream result is empty or unavailable', () => {
  const edges = [{ id: 't', source: 'missing-text', target: 'target', targetHandle: 'text' },
    { id: 'i', source: 'missing-image', target: 'target', targetHandle: 'image-0' }];
  assert.deepEqual(textInputReferences(textReferenceEdges('target', edges), []), [
    { id: 't', kind: 'text', name: '上游 Text' }, { id: 'i', kind: 'image', name: '上游 Image', url: undefined },
  ]);
});
