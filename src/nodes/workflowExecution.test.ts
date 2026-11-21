import { defaultSeedreamSettings } from './seedream.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowExecution, type ExecutionIO, type ExecutionStore } from './workflowExecution.ts';
import { preflight, prepareModel, requestSignature, selectedResult, type ExecutionGraph } from './executionGraph.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { ModelRequestCancelled } from './modelRequestError.ts';
import { isImageGeneratorNode, isImportedCanvasImage, type AppNode, type SunburstNode, type FileAsset } from './types.ts';
import type { PreviewTask } from './taskQueue';
import { isActiveTask } from './taskQueue.ts';
import { workflowSnapshot } from '../persistence/workflowStorage.ts';
import { commitAnnotations, emptyAnnotationHistory } from './interactiveEdit.ts';
import { initialTextDocument } from './textDocument.ts';
import { createImportedCanvasImage } from './importCanvasImage.ts';
import { canConnect } from './connectionRules.ts';

const file = (id: string): AppNode => ({ id, type: 'file', position: { x: 0, y: 0 }, data: { assets: [{ id, name: id, kind: 'image', url: `blob:${id}` }] } });
const generator = (id: string): AppNode => ({ id, type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } });
const edge = (source: string, target: string, targetHandle: string, sourceHandle?: string) => ({ id: `${source}-${target}-${targetHandle}`, source, target, targetHandle, sourceHandle });
function fixture(): ExecutionGraph {
  return { nodes: [file('a'), textNode('prompt', 'combined'), generator('g')], edges: [edge('prompt', 'g', 'prompt'), edge('a', 'g', 'image-0', 'file')] };
}
function harness(initial = fixture(), request?: ExecutionIO['request'], io: Partial<Pick<ExecutionIO, 'verify' | 'snapshot' | 'onImageGenerated'>> = {}) {
  let graph = initial, tasks: PreviewTask[] = [];
  const listeners = new Set<() => void>(), requests: PreviewTask[] = [], discarded: FileAsset[] = [];
  const store: ExecutionStore = { getSnapshot: () => tasks, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, update: change => { tasks = change(tasks); listeners.forEach(listener => listener()); } };
  const engine = new WorkflowExecution(graph, store, {
    patch: (id, data) => { graph = { ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...data } } as AppNode : node) }; },
    retain: () => () => {}, discard: assets => discarded.push(...assets), snapshot: async () => ({ assets: new Map(), release: () => {} }), verify: async () => {}, ...io,
    request: async (task, signal) => { requests.push(task); return request ? request(task, signal) : { id: crypto.randomUUID(), name: 'generated', kind: 'image', url: 'blob:generated' }; },
  });
  return { engine, store, requests, discarded, get graph() { return graph; }, edit(change: (graph: ExecutionGraph) => ExecutionGraph) { graph = change(graph); engine.observe(graph); }, node(id: string) { return graph.nodes.find(node => node.id === id)!; } };
}
function recordedSunburstGraph(recording: 'legacy' | 'apimart' | 'openai'): ExecutionGraph {
  const image = (id: string): SunburstNode => ({ id, type: 'sunburst', position: { x: 0, y: 0 }, data: {
    ...defaultSunburstSettings, imageInputs: 16, composer: { prompt: 'A circle', ratio: '1:1', quantity: 1 },
  } });
  const upstream = image('upstream'), source = image('source');
  source.data.results = [generatedAsset('original')];
  if (recording !== 'legacy') upstream.data = { ...upstream.data, provider: recording, ...(recording === 'apimart' ? { channelModel: 'gpt-image-2.6' } : {}) };
  const graph: ExecutionGraph = {
    nodes: [source, upstream, image('downstream')],
    edges: [edge('source', 'upstream', 'image-0', 'result'), edge('upstream', 'downstream', 'image-0', 'result')],
  };
  const recorded = prepareModel(graph, 'upstream')[0];
  assert.ok(recorded.imageRequest);
  // Reproduce the persisted request schema before provider selection existed.
  if (recording === 'legacy') {
    recorded.model = 'openai/gpt-image-2.5-sunburst';
    delete recorded.imageRequest.provider;
    delete recorded.imageRequest.variant;
  }
  const asset: FileAsset = { id: 'cached', kind: 'image', name: 'cached.png', url: 'blob:cached', generation: {
    version: 1, inputSignature: requestSignature(recorded, graph), outputSignature: 'cached',
  } };
  upstream.data = { ...upstream.data, results: [asset], activeResultId: asset.id };
  return JSON.parse(JSON.stringify(workflowSnapshot({ ...graph, colorMode: 'dark', viewport: { x: 0, y: 0, zoom: 1 } })));
}

test('imported canvas images only supply references and replacements keep their connections', async () => {
  const original: FileAsset = { id: 'original', kind: 'image', name: 'original.png', url: 'blob:original', width: 1024, height: 1024 };
  const imported = createImportedCanvasImage(original, { x: 100, y: 50 });
  const target: SunburstNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: {
    ...defaultSunburstSettings, provider: 'openai', imageInputs: 16, composer: { prompt: 'Use the original', quantity: 1, ratio: '1:1' },
  } };
  const reference = edge(imported.id, target.id, 'image-0', 'result');
  assert.ok(canConnect(reference, [imported, target], []));
  assert.equal(canConnect(edge(target.id, imported.id, 'image-0', 'result'), [imported, target], []), false);
  const saved = workflowSnapshot({ nodes: [imported, target], edges: [reference], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' });
  assert.ok(isImportedCanvasImage(saved.nodes[0]));
  assert.throws(() => preflight(saved, [imported.id], 1), /不能运行/);
  const h = harness(saved);
  try {
    await h.engine.run([target.id], 1);
    const replacement = { ...original, id: 'replacement', url: 'blob:replacement' };
    h.edit(graph => ({ ...graph, nodes: graph.nodes.map(node => node.id === imported.id
      ? { ...imported, data: { ...imported.data, results: [replacement], activeResultId: replacement.id } } : node) }));
    await h.engine.run([target.id], 1);
    assert.deepEqual(h.requests.map(task => [task.nodeId, task.imageRequest?.images]),
      [[target.id, ['blob:original']], [target.id, ['blob:replacement']]]);
    assert.deepEqual(h.graph.edges, saved.edges);
  } finally { h.engine.dispose(); }
});

test('workflow sends a connected annotation through Prompt and Seedream without a model call for the editor', async () => {
  const history = commitAnnotations(emptyAnnotationHistory, 'reference', [{ id: 'mark', start: { x: .3, y: .6 } }]);
  const graph: ExecutionGraph = {
    nodes: [
      file('reference'),
      { id: 'edit', type: 'interactive-edit', position: { x: 0, y: 0 }, data: { history } },
      { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: {
        text: '改为橙色', content: initialTextDocument('改为橙色', ['annotation-1'], 'prompt'),
      } },
      { id: 'seedream', type: 'seedream', position: { x: 0, y: 0 }, data: { ...defaultSeedreamSettings, imageInputs: 1 } },
    ],
    edges: [
      edge('reference', 'edit', 'image', 'file'), edge('edit', 'prompt', 'annotation-1', 'mark'),
      edge('prompt', 'seedream', 'prompt'),
    ],
  };
  const namingPrompts: string[] = [];
  const h = harness(graph, async () => ({ id: 'edited', name: 'edited', kind: 'image', url: 'blob:edited' }), {
    onImageGenerated: async prompt => { namingPrompts.push(prompt); },
  });
  try {
    await h.engine.run(['seedream'], 1);
    assert.deepEqual(h.requests.map(task => task.nodeId), ['seedream']);
    assert.equal(h.requests[0].seedreamRequest?.prompt, '<point>300 600</point> 改为橙色');
    assert.deepEqual(namingPrompts, [h.requests[0].seedreamRequest?.prompt]);
    assert.deepEqual(h.requests[0].seedreamRequest?.images, ['blob:reference']);
    assert.equal(h.store.getSnapshot()[0].state, 'Done');
  } finally {
    h.engine.dispose();
  }
});

test('Seedream can reuse the manually attached copy of a remote annotation image without losing its original mark', async () => {
  const url = 'https://images.example/shared.png';
  const reference = { ...file('original'), data: { assets: [{ id: 'original', name: 'original', kind: 'image', url }] } } as AppNode;
  const explicit = { ...file('manual'), data: { assets: [{ id: 'manual', name: 'manual', kind: 'image', url }] } } as AppNode;
  const history = commitAnnotations(emptyAnnotationHistory, 'original', [{ id: 'mark', start: { x: .2, y: .5 } }]);
  const graph: ExecutionGraph = { nodes: [
    reference, explicit,
    { id: 'edit', type: 'interactive-edit', position: { x: 0, y: 0 }, data: { history } },
    { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: {
      text: '替换', content: initialTextDocument('替换', ['annotation-1'], 'prompt'),
    } },
    { id: 'seedream', type: 'seedream', position: { x: 0, y: 0 }, data: { ...defaultSeedreamSettings, imageInputs: 1 } },
  ], edges: [
    edge('original', 'edit', 'image', 'file'), edge('edit', 'prompt', 'annotation-1', 'mark'),
    edge('prompt', 'seedream', 'prompt'), edge('manual', 'seedream', 'image-0', 'file'),
  ] };
  const snapshots: string[] = [];
  const h = harness(graph, async () => ({ id: 'edited', name: 'edited', kind: 'image', url: 'blob:edited' }), {
    snapshot: async assets => {
      snapshots.push(...assets.map(asset => asset.id));
      return { assets: new Map(assets.map(asset => [asset.url, { ...asset, url: 'blob:shared-reference', contentHash: 'shared' }])), release: () => {} };
    },
  });
  try {
    await h.engine.run(['seedream'], 1);
    assert.deepEqual(snapshots, ['manual']);
    assert.equal(h.requests[0].seedreamRequest?.prompt, '<point>200 500</point> 替换');
    assert.deepEqual(h.requests[0].seedreamRequest?.images, ['blob:shared-reference']);
    assert.equal(h.store.getSnapshot()[0].state, 'Done');
  } finally { h.engine.dispose(); }
});

function splitSeedreamGraph(): ExecutionGraph {
  const position = { x: 0, y: 0 };
  const content = initialTextDocument(' 改成篮球。', ['annotation-1', 'annotation-2'], 'prompt');
  content.content![0].content![1].text = ' 改成足球，把 ';
  const graph: ExecutionGraph = {
    nodes: [
      file('point-image'), file('box-image'), generator('unused'),
      { id: 'point-edit', type: 'interactive-edit', position, data: {
        history: commitAnnotations(emptyAnnotationHistory, 'point-image', [{ id: 'point', start: { x: .3, y: .6 } }]),
      } },
      { id: 'box-edit', type: 'interactive-edit', position, data: {
        history: commitAnnotations(emptyAnnotationHistory, 'box-image', [{ id: 'box', start: { x: .1, y: .2 }, end: { x: .4, y: .5 } }]),
      } },
      { id: 'prompt', type: 'text', position, data: { text: '', content } },
      { id: 'seedream', type: 'seedream', position, data: { ...defaultSeedreamSettings, imageInputs: 1 } },
    ],
    edges: [
      edge('point-image', 'point-edit', 'image', 'file'), edge('box-image', 'box-edit', 'image', 'file'),
      edge('point-edit', 'prompt', 'annotation-1', 'point'), edge('box-edit', 'prompt', 'annotation-2', 'box'),
      edge('prompt', 'seedream', 'prompt'), edge('unused', 'seedream', 'image-0', 'result'),
    ],
  };
  return graph;
}

test('Seedream shares an instruction that lists two marks and keeps local follow-up text with its clause', () => {
  const graph = splitSeedreamGraph();
  const prompt = graph.nodes.find(node => node.id === 'prompt')!;
  assert.equal(prompt.type, 'text');
  assert.ok('content' in prompt.data && prompt.data.content);
  const line = prompt.data.content.content![0];
  const [, , second] = line.content!;
  const [first] = line.content!;
  line.content = [
    { type: 'text', text: '把 ' }, first, { type: 'text', text: ' 和 ' }, second,
    { type: 'text', text: ' 都调亮。把 ' }, first, { type: 'text', text: ' 改为红色。只保留深色条纹。把 ' },
    second, { type: 'text', text: ' 改为蓝色。' },
  ];
  prompt.data.content.content!.push({ type: 'paragraph', content: [{ type: 'text', text: '保持原有构图。' }] });
  assert.deepEqual(prepareModel(graph, 'seedream').map(task => task.seedreamRequest?.prompt), [
    '把 <point>300 600</point> 都调亮。\n把 <point>300 600</point> 改为红色。\n只保留深色条纹。\n保持原有构图。',
    '把 <bbox>100 200 400 500</bbox> 都调亮。\n把 <bbox>100 200 400 500</bbox> 改为蓝色。\n保持原有构图。',
  ]);
  line.content[2].text = ' 改为黑色 ';
  assert.throws(() => preflight(graph, ['seedream'], 1), /分开不同原图的标注指令/);
});

test('Seedream continues after a split request fails and retries only that original', async () => {
  const h = harness(splitSeedreamGraph(), async task => {
    if (task.seedreamGroup?.index === 0 && h.requests.length === 1) throw new Error('point failed');
    return { id: String(task.seedreamGroup?.index), kind: 'image', name: 'result', url: 'blob:result' };
  });
  try {
    await h.engine.run(['seedream'], 1);
    assert.deepEqual(h.requests.map(task => [task.seedreamRequest?.images, task.seedreamRequest?.prompt]), [
      [['blob:point-image'], '<point>300 600</point> 改成足球'],
      [['blob:box-image'], '把 <bbox>100 200 400 500</bbox>  改成篮球。'],
    ]);
    const tasks = h.store.getSnapshot();
    assert.deepEqual(tasks.map(task => task.state), ['Failed', 'Done']);
    assert.equal(tasks[0].batchId, tasks[1].batchId);
    assert.equal(selectedResult(h.node('seedream'))?.id, '1');
    const group = tasks[0].seedreamGroup;
    assert.ok(group);
    await h.engine.run(['seedream'], 1, group.imageId);
    assert.deepEqual(h.requests.map(task => task.seedreamGroup?.imageId), ['point-image', 'box-image', 'point-image']);
    const node = h.node('seedream');
    assert.ok(isImageGeneratorNode(node));
    assert.deepEqual(node.data.results?.map(asset => asset.id), ['1', '0']);
  } finally { h.engine.dispose(); }
});

test('current model signatures reuse upstream results, including locked nodes', async () => {
  for (const recording of ['apimart', 'openai'] as const) for (const locked of [false, true]) {
    const graph = recordedSunburstGraph(recording);
    graph.nodes = graph.nodes.map(node => node.id === 'upstream' ? { ...node, data: { ...node.data, locked } } as AppNode : node);
    const h = harness(graph);
    await h.engine.run(['downstream'], 1);
    assert.deepEqual(h.requests.map(task => task.nodeId), ['downstream'], `${recording}, locked=${locked}`);
    assert.deepEqual(h.requests[0].imageRequest?.images, ['blob:cached']);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
    h.engine.dispose();
  }
});

test('upstream image results survive model, provider, input and parameter changes', async () => {
  for (const change of ['model-upgrade', 'variant', 'provider', 'prompt', 'image', '2K', '4K', 'quality', 'output', 'signature', 'locked-size', 'openai-to-apimart']) {
    const graph = recordedSunburstGraph(change === 'model-upgrade' ? 'legacy' : change === 'openai-to-apimart' ? 'openai' : 'apimart');
    graph.nodes = graph.nodes.map(node => {
      if (change === 'prompt' && node.id === 'upstream' && isImageGeneratorNode(node) && node.type === 'sunburst') return { ...node, data: { ...node.data, composer: { ...node.data.composer!, prompt: 'A different circle' } } };
      if (change === 'image' && node.id === 'source') return { ...node, data: { ...node.data, results: [generatedAsset('replacement')] } } as AppNode;
      if (node.id !== 'upstream' || !isImageGeneratorNode(node)) return node;
      return { ...node, data: { ...node.data,
        ...(change === 'provider' ? { provider: 'openai' } : change === 'openai-to-apimart' ? { provider: 'apimart', channelModel: 'gpt-image-2.6' } : {}),
        ...(['2K', '4K', 'locked-size'].includes(change) ? { size: change === '2K' ? '2048x2048' : '3840x2160', locked: change === 'locked-size' } : {}),
        ...(change === 'quality' ? { quality: 'high' } : {}),
        ...(change === 'variant' ? { variant: 'Flare' } : {}),
        ...(['output', 'signature'].includes(change) ? { results: node.data.results!.map(asset => ({ ...asset, generation: { ...asset.generation!, ...(change === 'output' ? { outputSignature: 'wrong' } : { inputSignature: '{broken' }) } })) } : {}),
      } } as AppNode;
    });
    const h = harness(graph); await h.engine.run(['downstream'], 1);
    assert.deepEqual(h.requests.map(task => task.nodeId), ['downstream'], change);
    assert.deepEqual(h.requests[0].imageRequest?.images, ['blob:cached']);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
    h.engine.dispose();
  }
});
test('existing image cuts off invalid or missing generation inputs; explicitly running it still validates', async () => {
  for (const type of ['sunburst', 'nano-banana', 'seedream'] as const) {
    const graph: ExecutionGraph = { nodes: [
      { ...generator('up'), type, data: { results: [generatedAsset('chosen')], activeResultId: 'chosen' } } as AppNode,
      generator('down'), textNode('prompt', 'paint'),
    ], edges: [edge('prompt', 'down', 'prompt'), edge('up', 'down', 'image-0', 'result')] };
    const h = harness(graph);
    await h.engine.run(['down'], 1);
    assert.deepEqual(h.requests.map(task => task.nodeId), ['down']);
    assert.deepEqual(h.requests[0].imageRequest?.images, ['blob:chosen']);
    assert.throws(() => h.engine.run(['up'], 1), /提示词/);
    h.engine.dispose();
  }
});

const textNode = (id: string, text: string): AppNode => ({ id, type: 'text', position: { x: 0, y: 0 }, data: { text } });
async function until(check: () => boolean) { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.fail('condition not reached'); }
const changeAsset = (graph: ExecutionGraph, id: string, assetId: string): ExecutionGraph => ({ ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...file(id), data: { assets: [{ id: assetId, name: assetId, kind: 'image', url: `blob:${assetId}` }] } } as AppNode : node) });
const generatedAsset = (id: string): FileAsset => ({ id, name: id, kind: 'image', url: `blob:${id}` });

test('Runs = 3 continues independent attempts after first or middle failure without retrying', async () => {
  for (const failureIndex of [0, 1]) {
    let attempts = 0;
    const h = harness(fixture(), async () => {
      if (attempts++ === failureIndex) throw new Error('one attempt failed');
      return generatedAsset(`result-${attempts}`);
    });
    await h.engine.run(['g'], 3);
    assert.deepEqual(h.requests.map(task => task.nodeId), ['g', 'g', 'g']);
    const targets = h.store.getSnapshot().filter(task => task.nodeId === 'g');
    assert.deepEqual(targets.map(task => task.state), [0, 1, 2].map(index => index === failureIndex ? 'Failed' : 'Done'));
    assert.ok(targets.every(task => task.started > 0));
    assert.equal(new Set(h.requests.filter(task => task.nodeId === 'g').map(task => task.id)).size, 3);
    const output = h.node('g'); assert.ok(isImageGeneratorNode(output)); assert.equal(output.data.results?.length, 2);
    h.engine.dispose();
  }
});

test('multi-run cancellation or input invalidation stops remaining attempts, including after a failed attempt', async () => {
  for (const invalidate of [false, true]) {
    let attempts = 0, resolve!: (asset: FileAsset) => void;
    const h = harness(fixture(), async () => {
      if (attempts++ === 0) throw new Error('first attempt failed');
      return new Promise<FileAsset>(done => { resolve = done; });
    });
    const done = h.engine.run(['g'], 3);
    await until(() => attempts === 2);
    if (invalidate) h.edit(graph => changeAsset(graph, 'a', 'new-input'));
    else h.store.update(tasks => tasks.map(task => task.nodeId === 'g' && isActiveTask(task) ? { ...task, state: 'Cancelled' } : task));
    await done;
    resolve(generatedAsset('late-result')); await new Promise(done => setTimeout(done, 1));
    assert.equal(attempts, 2);
    assert.deepEqual(h.store.getSnapshot().filter(task => task.nodeId === 'g').map(task => task.state), ['Failed', 'Cancelled', 'Cancelled']);
    const output = h.node('g'); assert.ok(isImageGeneratorNode(output)); assert.equal(output.data.results?.length ?? 0, 0);
    h.engine.dispose();
  }
});

test('SVG reference input rejects the whole workflow before any upstream model request', async () => {
  const graph = fixture();
  graph.nodes = graph.nodes.map(node => node.id === 'g' ? { ...node, data: { ...node.data, outputFormat: 'svg' } } as AppNode : node);
  graph.edges.push(edge('a', 'g', 'image-0', 'file'));
  const h = harness(graph);
  assert.throws(() => h.engine.run(['g'], 1), /SVG.*文字生成/);
  assert.equal(h.requests.length, 0);
  h.engine.dispose();
});

test('APIMart waits for its existing async task beyond the generic image deadline and still supports cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const graph: ExecutionGraph = { nodes: [
    { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'An orange circle' } },
    { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, provider: 'apimart', imageInputs: 1 } },
  ], edges: [edge('prompt', 'g', 'prompt')] };
  let requestSignal: AbortSignal | undefined;
  const h = harness(graph, (_task, signal) => { requestSignal = signal; return new Promise(() => {}); });
  const running = h.engine.run(['g'], 1);
  for (let index = 0; index < 80; index++) await Promise.resolve();
  assert.equal(h.requests.length, 1);
  t.mock.timers.tick(620000);
  for (let index = 0; index < 80; index++) await Promise.resolve();
  assert.equal(requestSignal?.aborted, false);
  assert.equal(h.store.getSnapshot()[0].state, 'Running');
  assert.equal(h.requests.length, 1);
  h.store.update(tasks => tasks.map(task => ({ ...task, state: 'Cancelled' })));
  await running;
  assert.equal(requestSignal?.aborted, true);
  assert.equal(h.store.getSnapshot()[0].state, 'Cancelled');
  h.engine.dispose();
});

test('Seedream 5.5 waits for its existing async task beyond the generic image deadline and still supports cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const graph: ExecutionGraph = { nodes: [
    { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'An orange circle' } },
    { id: 'g', type: 'seedream', position: { x: 0, y: 0 }, data: { ...defaultSeedreamSettings, imageInputs: 1 } },
  ], edges: [edge('prompt', 'g', 'prompt')] };
  let requestSignal: AbortSignal | undefined;
  const h = harness(graph, (_task, signal) => { requestSignal = signal; return new Promise(() => {}); });
  const running = h.engine.run(['g'], 1);
  for (let index = 0; index < 80; index++) await Promise.resolve();
  assert.equal(h.requests.length, 1);
  t.mock.timers.tick(620000);
  for (let index = 0; index < 80; index++) await Promise.resolve();
  assert.equal(requestSignal?.aborted, false);
  assert.equal(h.store.getSnapshot()[0].state, 'Running');
  assert.equal(h.requests.length, 1);
  h.store.update(tasks => tasks.map(task => ({ ...task, state: 'Cancelled' })));
  await running;
  assert.equal(requestSignal?.aborted, true);
  assert.equal(h.store.getSnapshot()[0].state, 'Cancelled');
  h.engine.dispose();
});

test('provider-cancelled APIMart tasks and their dependents end as Cancelled and preserve prior outputs', async () => {
  const previous: FileAsset = { id: 'previous', name: 'previous.png', kind: 'image', url: 'blob:previous' };
  for (const downstream of [false, true]) {
    const graph: ExecutionGraph = { nodes: [
      { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'A circle' } },
      { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, provider: 'apimart', imageInputs: 1, ...(downstream ? {} : { results: [previous] }) } },
      ...(downstream ? [generator('d')] : []),
    ], edges: [edge('prompt', 'g', 'prompt'), ...(downstream ? [edge('prompt', 'd', 'prompt'), edge('g', 'd', 'image-0', 'result')] : [])] };
    const h = harness(graph, async () => { throw new ModelRequestCancelled('APIMart 任务已取消。任务编号：task_cancelled'); });
    await h.engine.run([downstream ? 'd' : 'g'], 1);
    assert.equal(h.requests.length, 1);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Cancelled'));
    assert.ok(h.store.getSnapshot().every(task => task.error?.includes('task_cancelled')));
    if (!downstream) assert.equal(selectedResult(h.node('g'))?.id, 'previous');
    h.engine.dispose();
  }
});

test('Image composer batches use the inline prompt, with a connected Prompt taking precedence', () => {
  const image = generator('image');
  assert.ok(isImageGeneratorNode(image) && image.type === 'sunburst');
  image.data.composer = { prompt: 'inline prompt', ratio: '1:1', quantity: 20 };
  const graph: ExecutionGraph = { nodes: [image, textNode('text', 'connected prompt')], edges: [] };
  preflight(graph, ['image'], 20);
  assert.equal(prepareModel(graph, 'image')[0].imageRequest?.prompt, 'inline prompt');
  graph.edges = [edge('text', 'image', 'prompt')];
  assert.equal(prepareModel(graph, 'image')[0].imageRequest?.prompt, 'connected prompt');
  assert.throws(() => preflight(graph, ['image'], 21), /1–20/);
  image.data.composer.selection = { modelIds: ['seedream-5-5'], multiple: false, autoSelect: false };
  assert.doesNotThrow(() => preflight(graph, ['image'], 1));
  assert.equal(prepareModel(graph, 'image')[0].seedreamRequest?.prompt, 'connected prompt');
  image.data.composer.selection = { modelIds: ['nano-banana-pro'], multiple: false, autoSelect: false };
  assert.throws(() => preflight(graph, ['image'], 1), /请选择其中一个模型/);
});

test('Seedream Image composer executes a batch and commits both results to the existing canvas node', async () => {
  const image = generator('image');
  assert.ok(isImageGeneratorNode(image) && image.type === 'sunburst');
  image.data.composer = { prompt: 'a leaf', ratio: '1:1', quantity: 2,
    selection: { modelIds: ['seedream-5-5'], autoSelect: false, multiple: false },
    modelSettings: { 'seedream-5-5': { resolution: '2K', background: 'transparent', outputFormat: 'png' } } };
  const h = harness({ nodes: [image], edges: [] });
  await h.engine.run([image.id], image.data.composer.quantity);
  assert.equal(h.requests.length, 2);
  for (const { seedreamRequest } of h.requests) {
    assert.deepEqual(seedreamRequest, {
      ...defaultSeedreamSettings, prompt: 'a leaf', size: '1:1', resolution: '2K',
      background: 'transparent', outputFormat: 'png', images: [],
    });
  }
  const finished = h.store.getSnapshot();
  assert.deepEqual(finished.map(task => task.state), ['Done', 'Done']);
  const saved = h.node(image.id);
  assert.ok(isImageGeneratorNode(saved) && saved.type === 'sunburst');
  assert.deepEqual(saved.data.results?.map(asset => asset.generation?.taskId).sort(), finished.map(task => task.id).sort());
  assert.ok(selectedResult(saved)?.generation?.taskId);
  assert.ok(saved.data.results?.every(asset => typeof asset.createdAt === 'number' && asset.createdAt > 0));
  h.engine.dispose();
});
