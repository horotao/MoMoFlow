import assert from 'node:assert/strict';
import test from 'node:test';
import type { Edge } from '@xyflow/react';
import { annotationOutput } from './annotationGraph.ts';
import { migrateFileAnnotations } from './annotationMigration.ts';
import { editImageAnnotationsFromPrompt, isInlineAnnotationLink, syncImageAnnotationPrompts } from './imageAnnotationPrompts.ts';
import { canConnect, withoutReplacedInput } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { executionInputs, executionSourceAssets, graphGuard, preflight } from './executionGraph.ts';
import { annotationHistory, annotationMarkup, commitAnnotations, emptyAnnotationHistory, restoreInteractiveEditData, resultAnnotationDraftHandle, type AnnotationMark } from './interactiveEdit.ts';
import { defaultSeedreamSettings, seedreamMaxImages } from './seedream.ts';
import { prepareSeedreamRun } from './seedreamRun.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { prepareSunburstRun } from './sunburstRun.ts';
import { hasVariable, initialTextDocument, withoutVariables } from './textDocument.ts';
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

test('a generated result draft binds its chips and downstream execution to the original result', () => {
  const other = { ...asset, id: 'new-result', url: 'https://example.com/new.png' };
  const source: SunburstNode = { id: 'source', position, type: 'sunburst', data: {
    ...defaultSunburstSettings, imageInputs: 1, results: [asset, other], activeResultId: asset.id, annotations: [history],
  } };
  const prompt: TextNode = { ...text, data: { text: '编辑标注区域。' } };
  const draft: Edge = { id: 'draft', source: source.id, sourceHandle: 'result', target: prompt.id, targetHandle: resultAnnotationDraftHandle, data: { assetId: asset.id } };
  const before = syncImageAnnotationPrompts([source, prompt, seedream], [draft]);
  assert.equal(before.edges.filter(isInlineAnnotationLink).length, 2);
  assert.match(resolveTextValue(prompt.id, before.nodes, before.edges), /<point>240 510<\/point>.*<bbox>500 200 999 800<\/bbox>/);
  const connected = [...before.edges,
    { id: 'image', source: source.id, sourceHandle: 'result', target: seedream.id, targetHandle: 'image-0' },
    { id: 'prompt', source: prompt.id, target: seedream.id, targetHandle: 'prompt' },
  ];
  const graph = { ...syncImageAnnotationPrompts(before.nodes, connected), refreshImages: new Set([source.id]) };
  const switched = { ...graph, ...syncImageAnnotationPrompts(
    graph.nodes.map(node => node.id === source.id ? { ...source, data: { ...source.data, activeResultId: other.id } } : node), graph.edges,
  ) };
  assert.equal(graphGuard(switched, seedream.id, true), graphGuard(graph, seedream.id, true));
  assert.deepEqual(executionSourceAssets(switched, seedream.id), [asset]);
  assert.equal(preflight(switched, [seedream.id], 1).size, 1);
  const prepared = prepareSeedreamRun(switched.nodes, switched.edges, [seedream.id], 1);
  assert.equal(prepared.error, undefined);
  assert.deepEqual(prepared.tasks[0].seedreamRequest?.images, [asset.url]);
  assert.match(prepared.tasks[0].seedreamRequest?.prompt ?? '', /<point>240 510<\/point>.*<bbox>500 200 999 800<\/bbox>/);
  const removed = editImageAnnotationsFromPrompt(switched.nodes, switched.edges.filter(isInlineAnnotationLink), []);
  const updatedHistory = removed.annotationsByNode.get(source.id)![0];
  assert.deepEqual(updatedHistory.frames[updatedHistory.index], []);
});

test('deleting prompt references records one image edit and leaves unrelated marks and locked images intact', () => {
  const source: FileNode = { ...file, data: { ...file.data, activeAssetId: alternative.id, annotations: [history] } };
  const removed = [{ ...points, source: file.id }, { ...boxes, source: file.id }];
  const deleted = editImageAnnotationsFromPrompt([source], removed, []);
  assert.deepEqual([...deleted.synced], [points.id, boxes.id]);
  const after = deleted.annotationsByNode.get(file.id)![0];
  assert.deepEqual(after.frames, [...history.frames, []]);
  const restored = editImageAnnotationsFromPrompt([{ ...source, data: { ...source.data, annotations: [after] } }], [], removed);
  const restoredHistory = restored.annotationsByNode.get(file.id)![0];
  assert.deepEqual(restoredHistory.frames[restoredHistory.index], [point, box]);
  const remaining = editImageAnnotationsFromPrompt([source], [removed[0]], []).annotationsByNode.get(file.id)![0];
  const movedBox = { ...box, start: { x: .91, y: .67 } };
  const later = commitAnnotations(remaining, asset.id, [movedBox]);
  const undoPoint = editImageAnnotationsFromPrompt([{ ...source, data: { ...source.data, annotations: [later] } }], [], [removed[0]]);
  const undoHistory = undoPoint.annotationsByNode.get(file.id)![0];
  assert.deepEqual(undoHistory.frames[undoHistory.index], [point, movedBox]);
  const locked = editImageAnnotationsFromPrompt([{ ...source, data: { ...source.data, locked: true } }], removed, []);
  assert.equal(locked.synced.size, 0);
  assert.equal(locked.annotationsByNode.size, 0);
});

test('undoing an image deletion restores its retained prompt reference without changing the reference identity', () => {
  const migrated = migrateFileAnnotations(nodes, edges);
  const source = migrated.nodes.find(node => node.id === file.id) as FileNode;
  const link = { ...points, source: file.id, data: { annotationDeletedFromPrompt: true } };
  const deletedEdges = migrated.edges.map(edge => edge.id === link.id ? link : edge);
  const content = withoutVariables(text.data.content!, new Set(['annotation-1']));
  const withoutPoint = commitAnnotations(history, asset.id, [box]);
  const changedNodes = [{ ...source, data: { ...source.data, annotations: [withoutPoint] } }, { ...text, data: { ...text.data, content } }];
  assert.equal(syncImageAnnotationPrompts(changedNodes, deletedEdges).nodes, changedNodes);
  const undone = syncImageAnnotationPrompts([{ ...source, data: { ...source.data, annotations: [history] } }, changedNodes[1]], deletedEdges);
  const restored = undone.nodes.find(node => node.id === text.id) as TextNode;
  assert.ok(hasVariable(restored.data.content!, 'annotation-1'));
  const restoredLink = undone.edges.find(edge => edge.id === link.id);
  assert.equal(restoredLink?.source, link.source);
  assert.equal(restoredLink?.sourceHandle, link.sourceHandle);
  assert.equal(restoredLink?.targetHandle, link.targetHandle);
  assert.equal(restoredLink?.data?.annotationDeletedFromPrompt, undefined);
});

test('removing an image mark removes the inline atom and undo restores its place in a multi-paragraph prompt', () => {
  const migrated = migrateFileAnnotations(nodes, edges);
  const source = migrated.nodes.find(node => node.id === file.id) as FileNode;
  const atom = (handleId: string) => ({ type: 'promptVariable', attrs: { handleId, ownerId: text.id } });
  const value = (text: string) => ({ type: 'text', text });
  const content = { type: 'doc', content: [
    { type: 'paragraph', content: [atom('annotation-1'), value(' 改为蓝色')] },
    { type: 'paragraph', content: [value('在 '), atom('annotation-2'), value(' 处加星形')] },
  ] };
  const prompt: TextNode = { ...text, data: { ...text.data, content } };
  const deletedHistory = commitAnnotations(history, asset.id, [point]);
  const deletedImage: FileNode = { ...source, data: { ...source.data, annotations: [deletedHistory] } };
  const deleted = syncImageAnnotationPrompts([deletedImage, prompt, words], migrated.edges);
  const after = deleted.nodes.find(node => node.id === prompt.id) as TextNode;
  assert.ok(hasVariable(after.data.content!, 'annotation-1'));
  assert.ok(!hasVariable(after.data.content!, 'annotation-2'));
  assert.deepEqual(deleted.edges.find(edge => edge.id === boxes.id)?.data?.annotationPromptPositions, [{ paragraph: 1, offset: 2, slot: 0 }]);
  // The editor may join the two text nodes while the atom is absent.
  const normalized: TextNode = { ...after, data: { ...after.data, content: { type: 'doc', content: [
    content.content[0], { type: 'paragraph', content: [value('在  处加星形')] },
  ] } } };
  const undone = syncImageAnnotationPrompts([source, normalized, words], deleted.edges);
  assert.deepEqual((undone.nodes.find(node => node.id === prompt.id) as TextNode).data.content, content);
  assert.equal(undone.edges.find(edge => edge.id === boxes.id)?.data?.annotationPromptPositions, undefined);
  const redone = syncImageAnnotationPrompts([deletedImage, undone.nodes[1], words], undone.edges);
  assert.ok(!hasVariable((redone.nodes[1] as TextNode).data.content!, 'annotation-2'));
});

test('File annotations follow the existing image connection and insert numbered prompt references once', () => {
  const source: FileNode = { ...file, data: { assets: [asset], annotations: [history] } };
  const prompt: TextNode = { ...text, data: { text: '编辑选中区域' } };
  const inputs: Edge[] = [
    { id: 'image', source: file.id, sourceHandle: 'file', target: seedream.id, targetHandle: 'image-0' },
    { id: 'prompt', source: text.id, target: seedream.id, targetHandle: 'prompt' },
  ];
  const graph = syncImageAnnotationPrompts([source, prompt, seedream], inputs);
  const links = graph.edges.filter(isInlineAnnotationLink);
  assert.deepEqual(links.map(edge => [edge.source, edge.sourceHandle, edge.target]), [[file.id, point.id, prompt.id], [file.id, box.id, prompt.id]]);
  assert.equal(resolveTextValue(prompt.id, graph.nodes, graph.edges), '编辑选中区域 <point>240 510</point> <bbox>500 200 999 800</bbox>');
  assert.equal(syncImageAnnotationPrompts(graph.nodes, graph.edges).nodes, graph.nodes);
  assert.equal(syncImageAnnotationPrompts(graph.nodes, graph.edges).edges, graph.edges);
  assert.doesNotThrow(() => preflight(graph, [seedream.id], 1));
  const prepared = prepareSeedreamRun(graph.nodes, graph.edges, [seedream.id], 1);
  assert.equal(prepared.error, undefined);
  assert.deepEqual(prepared.tasks[0].seedreamRequest?.images, [asset.url]);
  assert.equal(prepared.tasks[0].seedreamRequest?.prompt, resolveTextValue(prompt.id, graph.nodes, graph.edges));
  const gpt: SunburstNode = { id: 'gpt', type: 'sunburst', position, data: { ...defaultSunburstSettings, provider: 'openai', imageInputs: 1 } };
  const gptGraph = syncImageAnnotationPrompts([...graph.nodes, gpt], [...graph.edges, ...inputs.map(edge => ({ ...edge, id: `gpt-${edge.id}`, target: gpt.id }))]);
  assert.doesNotThrow(() => preflight(gptGraph, [gpt.id], 1));
  const request = prepareSunburstRun(gptGraph.nodes, gptGraph.edges, [gpt.id], 1).tasks[0].imageRequest;
  assert.deepEqual(request?.images, [asset.url]);
  assert.deepEqual(request?.markupMarks, [{ start: point.start, end: undefined }, { start: box.start, end: box.end }]);
  const moved = { ...point, start: { x: .35, y: .4 } };
  const next = graph.nodes.map(node => node.id === file.id ? { ...source, data: { ...source.data, annotations: [commitAnnotations(history, asset.id, [moved, box])] } } : node);
  assert.notEqual(graphGuard(graph, seedream.id), graphGuard({ ...graph, nodes: next }, seedream.id));
  const disconnected = syncImageAnnotationPrompts(graph.nodes, graph.edges.filter(edge => edge.id !== 'image'));
  assert.equal(disconnected.edges.some(isInlineAnnotationLink), false);
  assert.equal(resolveTextValue(prompt.id, disconnected.nodes, disconnected.edges).trim(), '编辑选中区域');
});

test('legacy annotation nodes migrate to File without losing prompt references or undo frames', () => {
  const migrated = migrateFileAnnotations(nodes, edges);
  assert.equal(migrated.nodes.some(node => node.type === 'interactive-edit'), false);
  const source = migrated.nodes.find(node => node.id === file.id) as FileNode;
  assert.deepEqual(source.data.annotations, [history]);
  assert.deepEqual(migrated.edges, [{ ...points, source: file.id }, normal, { ...boxes, source: file.id }]);
  assert.equal(resolveTextValue(text.id, migrated.nodes, migrated.edges), resolveTextValue(text.id, nodes, edges));
  const detached = migrateFileAnnotations([{ ...editor, data: { history, baseImage: asset } }, text], [points]);
  assert.equal(detached.nodes[0].type, 'file');
  assert.equal(annotationOutput(detached.nodes[0], point.id, detached.nodes, detached.edges)?.image.id, asset.id);
});

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
  assert.throws(() => preflight({ nodes: graph, edges: annotated }, [ext.id], 1), error);
  const regular = [
    { id: 'ordinary-prompt', source: words.id, target: ext.id, targetHandle: 'prompt' },
    { id: 'reference', source: file.id, sourceHandle: 'file', target: ext.id, targetHandle: 'image-0' },
  ];
  assert.doesNotThrow(() => preflight({ nodes: graph, edges: regular }, [ext.id], 1));
  const request = prepareSunburstRun(graph, regular, [ext.id], 1).tasks[0].imageRequest!;
  assert.equal(request.prompt, words.data.text);
  assert.deepEqual(request.images, [alternative.url, asset.url]);
  assert.equal(request.markupMarks, undefined);
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
