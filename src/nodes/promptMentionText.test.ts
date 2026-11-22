import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, CanvasImage, CanvasText } from './types.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { prepareModel } from './executionGraph.ts';
import { textGenerationInput } from './textGeneration.ts';
import { reorderImageReferences } from './imageReferenceOrder.ts';
import { numberedMentionPrompt } from './promptMentionText.ts';

const prompt = 'A.png 与 B.png，再看 A.png；文件名 A.png 不替换。';
const mentions = [
  { nodeId: 'A', from: 0, to: 5 },
  { nodeId: 'B', from: prompt.indexOf('B.png'), to: prompt.indexOf('B.png') + 5 },
  { nodeId: 'A', from: prompt.indexOf('A.png', 5), to: prompt.indexOf('A.png', 5) + 5 },
];
const image = (id: string): CanvasImage => ({ id, type: 'sunburst', position: { x: 0, y: 0 }, data: {
  ...defaultSunburstSettings, imageInputs: 16,
  composer: { prompt: '', quantity: 1, ratio: '1:1' },
  results: [{ id: `${id}-asset`, name: `${id}.png`, kind: 'image', url: `blob:${id}` }],
} });
const text = (id: string): CanvasText => ({ id, type: 'text', position: { x: 0, y: 0 }, data: { text: '',
  textComposer: { prompt, mentions, quantity: 1, format: 'txt', selection: { modelIds: ['gpt-6-luna'], autoSelect: false, multiple: false } },
} });
const edgesFor = (target: string): Edge[] => [
  { id: 'b', source: 'B', sourceHandle: 'result', target, targetHandle: 'image-9' },
  { id: 'a', source: 'A', sourceHandle: 'result', target, targetHandle: 'image-3' },
];
const numbered = 'image 1 与 image 2，再看 image 1；文件名 A.png 不替换。';

for (const model of ['gpt-image-2-6', 'seedream-5-5', 'nano-banana-2-1'] as const) {
  test(`${model} sends capsule indices matching final image inputs, including reorder and literal filenames`, () => {
    const target = image('target');
    target.data.composer = { prompt: `  ${prompt}  `, mentions: mentions.map(item => ({ ...item, from: item.from + 2, to: item.to + 2 })), quantity: 1, ratio: '1:1',
      selection: { modelIds: [model], autoSelect: false, multiple: false } };
    const nodes: AppNode[] = [image('A'), image('B'), target];
    const before = JSON.stringify(nodes);
    const run = (edges: Edge[]) => {
      const task = prepareModel({ nodes, edges }, target.id)[0];
      return task.imageRequest ?? task.seedreamRequest ?? task.nanoBananaRequest;
    };
    assert.equal(run(edgesFor(target.id))?.prompt, numbered);
    const reordered = run(reorderImageReferences(edgesFor(target.id), target.id, ['b', 'a']))!;
    assert.deepEqual(reordered.images, ['blob:B', 'blob:A']);
    assert.equal(reordered.prompt, 'image 2 与 image 1，再看 image 2；文件名 A.png 不替换。');
    assert.equal(JSON.stringify(nodes), before);
  });
}

test('Text uses compact model image indices after manual references and does not rename saved capsules', () => {
  const target = text('target');
  const nodes = [image('manual'), image('A'), image('B'), target];
  const edges = [...edgesFor(target.id), { id: 'manual', source: 'manual', sourceHandle: 'result', target: target.id, targetHandle: 'image-0' }];
  const request = textGenerationInput(target.id, nodes, edges);
  assert.deepEqual(request.images, ['blob:manual', 'blob:A', 'blob:B']);
  assert.equal(request.prompt, 'image 2 与 image 3，再看 image 2；文件名 A.png 不替换。');
  assert.equal(target.data.textComposer.prompt, prompt);
  assert.throws(() => textGenerationInput(target.id, nodes, edges.filter(edge => edge.source !== 'A')), /引用图片未包含/);
});

test('authored upstream Text capsules are numbered against the consuming Image inputs', () => {
  const upstream = text('upstream'), target = image('target');
  const graph = { nodes: [image('A'), image('B'), upstream, target], edges: [...edgesFor(target.id), { id: 'prompt', source: upstream.id, sourceHandle: 'text', target: target.id, targetHandle: 'prompt' }] };
  assert.equal(prepareModel(graph, target.id)[0].imageRequest?.prompt, numbered);
  upstream.data.text = 'A.png 是模型输出的普通文字';
  assert.equal(prepareModel(graph, target.id)[0].imageRequest?.prompt, upstream.data.text);
});

test('same-URL nodes keep separate input positions; prepended or deduplicated inputs use the final array', () => {
  const inputs = [{ nodeId: 'A', url: 'blob:same' }, { nodeId: 'B', url: 'blob:same' }];
  assert.equal(numberedMentionPrompt(prompt, mentions, inputs, ['blob:same', 'blob:same']), numbered);
  assert.equal(numberedMentionPrompt(prompt, mentions, inputs, ['blob:original', 'blob:same']), 'image 2 与 image 2，再看 image 2；文件名 A.png 不替换。');
  assert.throws(() => numberedMentionPrompt(prompt, mentions, inputs, []), /引用图片未包含/);
});
