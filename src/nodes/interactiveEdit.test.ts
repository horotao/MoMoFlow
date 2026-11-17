import assert from 'node:assert/strict';
import test from 'node:test';
import type { Edge } from '@xyflow/react';
import { annotationOutput } from './annotationGraph.ts';
import { canConnect, withoutReplacedInput } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { executionInputs, planExecution } from './executionGraph.ts';
import { annotationHistory, annotationMarkup, commitAnnotations, emptyAnnotationHistory, restoreInteractiveEditData, type AnnotationMark } from './interactiveEdit.ts';
import { defaultSeedreamSettings, seedreamMaxImages } from './seedream.ts';
import { prepareSeedreamRun } from './seedreamRun.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { prepareSunburstRun } from './sunburstRun.ts';
import { initialTextDocument } from './textDocument.ts';
import { resolveTextValue, textAnnotationCount, textVariableCount } from './textVariables.ts';
import type { AppNode, FileNode, InteractiveEditNode, SeedreamNode, SunburstNode, TextNode } from './types.ts';

const position = { x: 0, y: 0 };
const point: AnnotationMark = { id: 'point', start: { x: .24, y: .51 } };
const box: AnnotationMark = { id: 'box', start: { x: 1, y: .8 }, end: { x: .5, y: .2 } };
const asset = { id: 'sample', url: 'https://example.com/image.png', kind: 'image', name: 'image.png' } as const;
const alternative = { ...asset, id: 'another' };
const file: FileNode = { id: 'file', type: 'file', position, data: { assets: [alternative, asset], activeAssetId: asset.id } };
const first = commitAnnotations(emptyAnnotationHistory, asset.id, [point]);
const history = commitAnnotations(first, asset.id, [point, box]);
const editor: InteractiveEditNode = { id: 'editor', type: 'interactive-edit', position, data: { history } };
const text: TextNode = { id: 'text', type: 'text', position, data: {
  text: '编辑图像', content: initialTextDocument('编辑图像', ['annotation-1', 'variable-1', 'annotation-2'], 'text'),
} };
const words: TextNode = { id: 'words', type: 'text', position, data: { text: '和' } };
const seedream: SeedreamNode = { id: 'seedream', type: 'seedream', position, data: { ...defaultSeedreamSettings, imageInputs: 2 } };
const nodes: AppNode[] = [file, editor, text, words, seedream];
const image: Edge = { id: 'image', source: 'file', sourceHandle: 'file', target: 'editor', targetHandle: 'image' };
const points: Edge = { id: 'points', source: 'editor', sourceHandle: point.id, target: 'text', targetHandle: 'annotation-1' };
const boxes: Edge = { id: 'boxes', source: 'editor', sourceHandle: box.id, target: 'text', targetHandle: 'annotation-2' };
const normal: Edge = { id: 'normal', source: 'words', target: 'text', targetHandle: 'variable-1' };
const edges: Edge[] = [image, points, normal, boxes];

test('annotation inputs are separate from normal variables and only accept live annotation handles', () => {
  assert.equal(canConnect(image, nodes, []), true);
  assert.equal(canConnect({ ...image, source: 'words', sourceHandle: null }, nodes, []), false);
  assert.equal(canConnect(points, nodes, [image, normal]), true);
  assert.equal(canConnect({ ...points, targetHandle: 'variable-1' }, nodes, [image]), false);
  assert.equal(canConnect({ ...normal, targetHandle: 'annotation-1' }, nodes, [image]), false);
  assert.equal(canConnect({ ...points, sourceHandle: 'stale' }, nodes, [image]), false);
  assert.equal(canConnect({ ...points, target: 'seedream', targetHandle: 'prompt' }, nodes, [image]), false);
  assert.deepEqual(withoutReplacedInput(points, nodes, edges), [image, normal, boxes]);
  assert.equal(textVariableCount(text, edges), 2);
  assert.equal(textAnnotationCount(text, edges), 3);
  assert.equal(connectionChoices({ nodeId: editor.id, handleId: point.id, direction: 'source', screen: position, position }, nodes, edges)[0]?.handleId, 'annotation-1');
});

test('prompt serializes point and box markup into the Seedream request alongside normal text', () => {
  const prompt = '<point>240 510</point> 和 <bbox>500 200 999 800</bbox> 编辑图像';
  assert.equal(resolveTextValue(text.id, nodes, edges), prompt);
  const requestEdges: Edge[] = [...edges, { id: 'prompt', source: text.id, target: seedream.id, targetHandle: 'prompt' }];
  const manual: FileNode = { ...file, id: 'manual', data: { asset: alternative } };
  for (const extra of [[], [{ id: 'reference', source: manual.id, sourceHandle: 'file', target: seedream.id, targetHandle: 'image-0' }]]) {
    const prepared = prepareSeedreamRun([...nodes, manual], [...requestEdges, ...extra], [seedream.id], 1);
    assert.equal(prepared.error, undefined);
    assert.equal(prepared.tasks[0].seedreamRequest?.prompt, prompt);
    assert.deepEqual(prepared.tasks[0].seedreamRequest?.images, [asset.url]);
  }
});

test('OpenAI aligns numbered markup with the first image and deduplicates an explicitly connected original', () => {
  const gpt: SunburstNode = { id: 'gpt', type: 'sunburst', position, data: { ...defaultSunburstSettings, provider: 'openai', variant: 'Flare', imageInputs: 2 } };
  const prompt = { id: 'prompt', source: text.id, target: gpt.id, targetHandle: 'prompt' };
  const reference = { id: 'reference', source: file.id, sourceHandle: 'file', target: gpt.id, targetHandle: 'image-0' };
  const graph = [...nodes, gpt];
  const requestEdges = [...edges, prompt];
  const plain = prepareSunburstRun(graph, requestEdges, [gpt.id], 2);
  assert.equal(plain.error, undefined);
  assert.equal(plain.tasks.length, 2);
  const request = plain.tasks[0].imageRequest!;
  assert.deepEqual(request.images, [asset.url]);
  assert.deepEqual(request.markupMarks, [{ start: point.start, end: undefined }, { start: box.start, end: box.end }]);
  assert.match(request.prompt, /^红圈 1 中心 和 红框 2 内 编辑图像\n/);
  const other = { ...alternative, url: 'blob:reference' };
  const references = { ...file, data: { ...file.data, assets: [other, asset] } };
  const withImage = prepareSunburstRun(graph.map(node => node.id === file.id ? references : node), [...requestEdges, reference], [gpt.id], 1);
  assert.deepEqual(withImage.tasks[0].imageRequest?.images, [asset.url, other.url]);
  const masked = prepareSunburstRun(graph, [...requestEdges, { ...reference, targetHandle: 'mask' }], [gpt.id], 1);
  assert.match(masked.error!, /标注与 Mask 不能同时使用/);
  const secondEditor: InteractiveEditNode = { ...editor, id: 'second-editor', data: { baseImage: other, history: commitAnnotations(emptyAnnotationHistory, other.id, [box]) } };
  const mixed = prepareSunburstRun([...graph, secondEditor], requestEdges.map(edge => edge.id === boxes.id ? { ...edge, source: secondEditor.id } : edge), [gpt.id], 1);
  assert.match(mixed.error!, /只能标注一张原图/);
  const apimartNode: SunburstNode = { ...gpt, data: { ...gpt.data, provider: 'apimart', channelModel: 'gpt-image-2.6' } };
  const standard = prepareSunburstRun([...nodes, apimartNode], requestEdges, [gpt.id], 1);
  assert.deepEqual(standard.tasks[0].imageRequest?.markupMarks, request.markupMarks);
  assert.deepEqual(standard.tasks[0].imageRequest?.images, [asset.url]);
});

test('APIMart EXT rejects connected annotations before execution and accepts a regular prompt and image', () => {
  const ext: SunburstNode = { id: 'ext', type: 'sunburst', position, data: { ...defaultSunburstSettings, provider: 'apimart', channelModel: 'gpt-image-2.6-ext', imageInputs: 1 } };
  const graph = [...nodes, ext];
  const annotated = [...edges, { id: 'prompt', source: text.id, target: ext.id, targetHandle: 'prompt' }];
  const error = /EXT 不支持交互编辑标注.*标准版/;
  const blocked = prepareSunburstRun(graph, annotated, [ext.id], 1);
  assert.match(blocked.error!, error);
  assert.deepEqual(blocked.tasks, []);
  assert.throws(() => planExecution({ nodes: graph, edges: annotated }, [ext.id], 1), error);
  const regular = [
    { id: 'ordinary-prompt', source: words.id, target: ext.id, targetHandle: 'prompt' },
    { id: 'reference', source: file.id, sourceHandle: 'file', target: ext.id, targetHandle: 'image-0' },
  ];
  assert.doesNotThrow(() => planExecution({ nodes: graph, edges: regular }, [ext.id], 1));
  const request = prepareSunburstRun(graph, regular, [ext.id], 1).tasks[0].imageRequest!;
  assert.equal(request.prompt, words.data.text);
  assert.deepEqual(request.images, [alternative.url, asset.url]);
  assert.equal(request.markupMarks, undefined);
});

test('Seedream groups annotations through nested prompts and routers using only each marked original', () => {
  const secondImage = { ...asset, id: 'second', url: 'blob:second' };
  const secondEditor: InteractiveEditNode = { ...editor, id: 'second-editor', data: {
    baseImage: secondImage, history: commitAnnotations(emptyAnnotationHistory, secondImage.id, [box]),
  } };
  const unusedImage = { ...asset, id: 'unused', url: 'blob:unused' };
  const unusedEditor: InteractiveEditNode = { ...editor, id: 'unused-editor', data: {
    baseImage: unusedImage, history: commitAnnotations(emptyAnnotationHistory, unusedImage.id, [point]),
  } };
  const explicit: FileNode = { ...file, id: 'manual', data: { assets: [secondImage] } };
  const content = initialTextDocument('改为篮球。\n保持背景', ['variable-1', 'annotation-1'], 'outer');
  content.content![0].content![1].text = '。把 ';
  const outer: TextNode = { ...text, id: 'outer', data: { text: '保持背景', content } };
  const router: AppNode = { id: 'router', type: 'router', position, data: {} };
  const result = prepareSeedreamRun([...nodes, secondEditor, unusedEditor, explicit, outer, router], [...edges,
    { id: 'nested', source: text.id, target: outer.id, targetHandle: 'variable-1' },
    { ...boxes, id: 'second-box', source: secondEditor.id, target: outer.id, targetHandle: 'annotation-1' },
    { ...points, id: 'unused-point', source: unusedEditor.id, target: outer.id, targetHandle: 'annotation-2' },
    { id: 'route', source: outer.id, target: router.id, targetHandle: 'input' },
    { id: 'prompt', source: router.id, sourceHandle: 'output', target: seedream.id, targetHandle: 'prompt' },
    { id: 'reference', source: explicit.id, sourceHandle: 'file', target: seedream.id, targetHandle: 'image-0' },
  ], [seedream.id], 1);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.tasks.map(task => task.seedreamRequest?.images), [[asset.url], [secondImage.url]]);
  assert.deepEqual(result.tasks.map(task => task.seedreamRequest?.prompt), [
    '<point>240 510</point> 和 <bbox>500 200 999 800</bbox> 编辑图像。\n保持背景',
    '把 <bbox>500 200 999 800</bbox> 改为篮球。\n保持背景',
  ]);
});

test('Seedream counts annotation originals against its image limit after reusing explicit matches', () => {
  const assets = Array.from({ length: seedreamMaxImages }, (_, index) => ({ ...asset, id: `manual-${index}`, url: `blob:manual-${index}` }));
  const manual: FileNode = { ...file, id: 'manual', data: { assets } };
  const requestEdges: Edge[] = [...edges,
    { id: 'prompt', source: text.id, target: seedream.id, targetHandle: 'prompt' },
    { id: 'reference', source: manual.id, sourceHandle: 'file', target: seedream.id, targetHandle: 'image-0' },
  ];
  const excess = prepareSeedreamRun([...nodes, manual], requestEdges, [seedream.id], 1);
  assert.match(excess.error ?? '', new RegExp(`最多支持 ${seedreamMaxImages} 张参考图片`));
  assert.equal(excess.tasks.length, 0);
  const reuse = prepareSeedreamRun([...nodes, { ...manual, data: { assets: [...assets.slice(0, -1), asset] } }], requestEdges, [seedream.id], 1);
  assert.equal(reuse.error, undefined);
  assert.equal(reuse.tasks[0].seedreamRequest?.images.length, seedreamMaxImages);
  assert.match(reuse.tasks[0].seedreamRequest?.prompt ?? '', /图10 <point>/);
});

test('undo and image changes invalidate unused annotation dependencies, and redo restores them', () => {
  assert.equal(annotationOutput(editor, box.id, nodes, edges)?.image.id, asset.id);
  const undone: InteractiveEditNode = { ...editor, data: { history: { ...history, index: first.index } } };
  const undoNodes = nodes.map(node => node.id === editor.id ? undone : node);
  assert.deepEqual(executionInputs(text, null, { nodes: undoNodes, edges }), [points, normal]);
  assert.deepEqual(executionInputs(text, null, { nodes, edges }), [points, normal, boxes]);
  const changed = nodes.map(node => node.id === file.id ? { ...file, data: { ...file.data, activeAssetId: alternative.id } } : node);
  assert.equal(annotationOutput(editor, box.id, changed, edges), undefined);
  assert.equal(resolveTextValue(text.id, changed, edges).includes('<bbox>'), false);
  assert.deepEqual(executionInputs(text, null, { nodes: changed, edges }), [normal]);
});

test('restoration keeps valid history and rejects frames with more than six marks', () => {
  assert.equal(restoreInteractiveEditData({ history })?.history, history);
  assert.equal(restoreInteractiveEditData({ history: { ...history, frames: [Array.from({ length: 7 }, (_, index) => ({ ...point, id: String(index) }))], index: 0 } })?.history, undefined);
  assert.equal(annotationHistory(editor.data, 'changed'), emptyAnnotationHistory);
  assert.equal(annotationMarkup(box), '<bbox>500 200 999 800</bbox>');
});
