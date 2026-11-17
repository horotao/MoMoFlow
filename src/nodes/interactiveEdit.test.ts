import assert from 'node:assert/strict';
import test from 'node:test';
import type { Edge } from '@xyflow/react';
import { annotationOutput } from './annotationGraph.ts';
import { canConnect, withoutReplacedInput } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { executionInputs } from './executionGraph.ts';
import { annotationHistory, annotationMarkup, commitAnnotations, emptyAnnotationHistory, restoreInteractiveEditData, type AnnotationMark } from './interactiveEdit.ts';
import { defaultSeedreamSettings, seedreamMaxImages } from './seedream.ts';
import { prepareSeedreamRun } from './seedreamRun.ts';
import { initialTextDocument } from './textDocument.ts';
import { resolveTextValue, textAnnotationCount, textVariableCount } from './textVariables.ts';
import type { AppNode, FileNode, InteractiveEditNode, SeedreamNode, TextNode } from './types.ts';

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
