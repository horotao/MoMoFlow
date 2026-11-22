import { textGenerationInput } from './textGeneration.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { editPromptMentions, mentionCandidates, validPromptMentions, pruneDisconnectedMentions } from './promptMentions.ts';
import type { AppNode, CanvasImage, CanvasText } from './types.ts';
import type { Edge } from '@xyflow/react';
const image = (id: string): CanvasImage => ({ id, type: 'sunburst', position: { x: 0, y: 0 }, data: {
  label: id, imageInputs: 16, composer: { prompt: '', quantity: 1, ratio: '1:1' },
} } as CanvasImage);
const text = (id: string): CanvasText => ({ id, type: 'text', position: { x: 0, y: 0 }, data: { text: '',
  textComposer: { prompt: '', quantity: 1, format: 'txt', selection: { modelIds: ['gpt-6-luna'], multiple: false, autoSelect: false } },
} });
const edit = { prompt: 'use source twice', mentions: [{ nodeId: 'source', from: 4, to: 10 }] };
test('pasting several capsules connects unique sources atomically in clipboard order', () => {
  const pasted = { prompt: 'one two one', mentions: [{ nodeId: 'one', from: 0, to: 3 }, { nodeId: 'two', from: 4, to: 7 }, { nodeId: 'one', from: 8, to: 11 }] };
  const nodes: AppNode[] = [image('one'), image('two'), text('target')];
  const result = editPromptMentions('target', pasted, nodes, [], ['one', 'two', 'one'], 'paste')!;
  assert.deepEqual(result.addedEdges.map(edge => [edge.id, edge.source, edge.targetHandle]), [['paste', 'one', 'image-0'], ['paste-1', 'two', 'image-1']]);
  assert.deepEqual((result.nodes[2] as CanvasText).data.textComposer.mentions, pasted.mentions);
  const full = Array.from({ length: 15 }, (_, i) => ({ id: `edge-${i}`, source: `other-${i}`, target: 'target', targetHandle: `image-${i}` }));
  assert.equal(editPromptMentions('target', pasted, nodes, full, ['one', 'two'], 'paste'), undefined);
  assert.equal(full.length, 15);
  assert.equal((nodes[2] as CanvasText).data.textComposer.prompt, '');
});
test('replacing a capsule frees its auto-created port before connecting pasted sources', () => {
  const target = text('target');
  target.data.textComposer = { ...target.data.textComposer, prompt: 'old', mentions: [{ nodeId: 'old', from: 0, to: 3 }] };
  const full: Edge[] = Array.from({ length: 16 }, (_, i) => ({ id: `edge-${i}`, source: i === 0 ? 'old' : `other-${i}`, target: 'target', targetHandle: `image-${i}`, data: { mention: i === 0 } }));
  const result = editPromptMentions('target', { prompt: 'new', mentions: [{ nodeId: 'new', from: 0, to: 3 }] }, [image('new'), target], full, ['new'], 'paste')!;
  assert.equal(result.edges.length, 16);
  assert.equal(result.added?.targetHandle, 'image-0');
  assert.equal(result.edges.some(edge => edge.source === 'old'), false);
});
test('picker lists the newest canvas additions first, including empty Images, regardless of image completion dates', () => {
  const regenerated = image('regenerated'), legacy = image('legacy'), imported = image('imported');
  regenerated.data.results = [
    { id: 'latest', name: 'new.png', kind: 'image', url: 'https://example.com/new.png', createdAt: 1795340000000 },
    { id: 'old', name: 'old.png', kind: 'image', url: 'https://example.com/old.png', createdAt: 1795000000000 },
  ];
  regenerated.data.activeResultId = 'latest';
  legacy.data.results = [{ id: 'legacy', name: 'Sunburst-1795231573405.png', kind: 'image', url: 'https://example.com/legacy.png' }];
  imported.data.results = [{ id: 'imported', name: 'upload.png', kind: 'image', url: 'https://example.com/upload.png', createdAt: 1795300000000 }];
  const nodes: AppNode[] = [regenerated, legacy, imported, image('empty-old'), image('empty-new'), text('target')];
  const original = nodes.map(node => node.id);
  const order = ['empty-new', 'empty-old', 'imported', 'legacy', 'regenerated'];
  assert.deepEqual(mentionCandidates('target', nodes, []).map(node => node.id), order);
  assert.deepEqual(nodes.map(node => node.id), original);
  regenerated.data.activeResultId = 'old';
  assert.deepEqual(mentionCandidates('target', nodes, []).map(node => node.id), order);
});
test('candidate sorting does not mutate model input order or connected grouping', () => {
  const first = image('first'), second = image('second');
  for (const node of [first, second]) node.data.results = [{ id: node.id, name: 'image.png', kind: 'image', url: 'https://example.com/image.png', createdAt: 1795300000000 }];
  const edge: Edge = { id: 'manual', source: 'first', target: 'target', targetHandle: 'image-0' };
  const edges = [edge];
  const candidates = mentionCandidates('target', [first, second, text('target')], edges);
  assert.deepEqual(candidates.map(node => [node.id, node.connected]), [['second', false], ['first', true]]);
  assert.deepEqual(edges, [edge]);
});
test('@ commits a real image input with the capsule, keeping model input and save/undo in one graph snapshot', () => {
  const before: AppNode[] = [image('source'), text('target')];
  const result = editPromptMentions('target', edit, before, [], 'source', 'wire')!;
  assert.deepEqual(result.edges[0], { id: 'wire', source: 'source', target: 'target', sourceHandle: 'result', targetHandle: 'image-0', type: 'default', data: { mention: true } });
  assert.deepEqual((result.nodes[1] as CanvasText).data.textComposer.mentions, edit.mentions);
  assert.equal((before[1] as CanvasText).data.textComposer.prompt, '');
  assert.deepEqual(JSON.parse(JSON.stringify(result)).nodes[1].data.textComposer.mentions, edit.mentions);
});
test('a repeated mention reuses the wire and deleting its last capsule removes only @-owned wires', () => {
  const nodes: AppNode[] = [image('source'), text('target')];
  const first = editPromptMentions('target', edit, nodes, [], 'source', 'wire')!;
  const repeated = editPromptMentions('target', { prompt: 'source source', mentions: [{ nodeId: 'source', from: 0, to: 6 }, { nodeId: 'source', from: 7, to: 13 }] }, first.nodes, first.edges, 'source')!;
  assert.equal(repeated.edges.length, 1);
  assert.equal(editPromptMentions('target', { prompt: '', mentions: [] }, repeated.nodes, repeated.edges)!.edges.length, 0);
  const manual: Edge = { ...first.edges[0], data: undefined };
  assert.equal(editPromptMentions('target', { prompt: '', mentions: [] }, first.nodes, [manual])!.edges.length, 1);
});
test('picker excludes text and self; graph validation rejects cycles, full inputs, locked nodes and read-only prompts', () => {
  const nodes: AppNode[] = [image('source'), image('target'), text('text')];
  assert.deepEqual(mentionCandidates('target', nodes, []).map(n => n.id), ['source']);
  assert.equal(editPromptMentions('target', edit, nodes, [{ id: 'back', source: 'target', target: 'source' }], 'source'), undefined);
  const full = Array.from({ length: 16 }, (_, i) => ({ id: `wire${i}`, source: `other${i}`, target: 'target', targetHandle: `image-${i}` }));
  assert.equal(editPromptMentions('target', edit, nodes, full, 'source'), undefined);
  assert.equal(editPromptMentions('target', edit, nodes.map(n => n.id === 'source' ? { ...n, data: { ...n.data, locked: true } } : n) as AppNode[], [], 'source'), undefined);
  assert.equal(editPromptMentions('target', edit, nodes, [{ id: 'prompt', source: 'text', target: 'target', targetHandle: 'prompt' }], 'source'), undefined);
});
test('image mentions follow the first reference ratio and use the next free port without replacing inputs', () => {
  const source = image('source'); source.data.results = [{ id: 'asset', url: 'data:image/png,x', name: 'source', kind: 'image', width: 1600, height: 900 }];
  const nodes: AppNode[] = [source, image('target')];
  const result = editPromptMentions('target', edit, nodes, [], 'source', 'new')!;
  assert.equal((result.nodes[1] as CanvasImage).data.composer.ratio, '16:9');
  const second = editPromptMentions('target', edit, nodes, [{ id: 'old', source: 'other', target: 'target', targetHandle: 'image-0' }], 'source', 'second')!;
  assert.equal(second.added?.targetHandle, 'image-1');
});
test('invalid or overlapping persisted mention offsets cannot corrupt ordinary prompt text', () => {
  assert.deepEqual(validPromptMentions('source', [{ nodeId: 'a', from: 0, to: 6 }, { nodeId: 'b', from: 1, to: 3 }, { nodeId: 'c', from: 8, to: 9 }]), [{ nodeId: 'a', from: 0, to: 6 }]);
});

test('disconnect removes only that source’s capsules and shifts the other offsets without changing its input', () => {
  const target = text('target');
  target.data.textComposer = { ...target.data.textComposer, prompt: 'source and other', mentions: [
    { nodeId: 'source', from: 0, to: 6 }, { nodeId: 'other', from: 11, to: 16 },
  ] };
  const result = pruneDisconnectedMentions([target], [{ id: 'wire', source: 'source', target: 'target', targetHandle: 'image-0' }]);
  const composer = (result[0] as CanvasText).data.textComposer;
  assert.equal(composer.prompt, ' and other');
  assert.deepEqual(composer.mentions, [{ nodeId: 'other', from: 5, to: 10 }]);
  assert.equal(target.data.textComposer.prompt, 'source and other');
});

test('mentioned images reach the actual text request as image inputs alongside readable prompt text', () => {
  const source = image('source');
  source.data.results = [{ id: 'asset', kind: 'image', name: 'source.png', url: 'data:image/png;base64,AA==' }];
  const result = editPromptMentions('target', edit, [source, text('target')], [], 'source', 'wire')!;
  const request = textGenerationInput('target', result.nodes, result.edges);
  assert.equal(request.prompt, 'use image 1 twice');
  assert.deepEqual(request.images, ['data:image/png;base64,AA==']);
  assert.equal(request.prompt.includes('<span'), false);
});
