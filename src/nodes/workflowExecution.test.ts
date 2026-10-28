import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowExecution, type ExecutionIO, type ExecutionStore } from './workflowExecution.ts';
import { executionSourceAssets, graphGuard, preflight, prepareModel, requestSignature, sourceSignature, type ExecutionGraph } from './executionGraph.ts';
import { defaultPainterData, painterRevision } from './painter.ts';
import { resizeRevision } from './resize.ts';
import { defaultCompositorDocument } from './compositor.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';
import { defaultIdeogramSettings } from './ideogram.ts';
import { isDescriberNode, isImageGeneratorNode, type AppNode, type FileAsset } from './types.ts';
import type { PreviewTask } from './taskQueue';
import { isActiveTask } from './taskQueue.ts';
import { workflowSnapshot, mapAssets } from '../persistence/workflowStorage.ts';

const file = (id: string): AppNode => ({ id, type: 'file', position: { x: 0, y: 0 }, data: { assets: [{ id, name: id, kind: 'image', url: `blob:${id}` }] } });
const describer = (id: string): AppNode => ({ id, type: 'image-describer', position: { x: 0, y: 0 }, data: { text: '', instructions: 'describe', model: 'deepseek-flash', imageInputs: 1 } });
const generator = (id: string): AppNode => ({ id, type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } });
const edge = (source: string, target: string, targetHandle: string, sourceHandle?: string) => ({ id: `${source}-${target}-${targetHandle}`, source, target, targetHandle, sourceHandle });
function fixture(): ExecutionGraph {
  return { nodes: [file('a'), file('b'), describer('da'), describer('db'), { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'combined' } }, generator('g')],
    edges: [edge('a', 'da', 'image-0', 'file'), edge('b', 'db', 'image-0', 'file'), edge('da', 'prompt', 'variable-1'), edge('db', 'prompt', 'variable-2'), edge('prompt', 'g', 'prompt')] };
}
function harness(initial = fixture(), request?: ExecutionIO['request'], local?: ExecutionIO['local'], io: Partial<Pick<ExecutionIO, 'verify' | 'snapshot'>> = {}) {
  let graph = initial, tasks: PreviewTask[] = [];
  const listeners = new Set<() => void>(), requests: PreviewTask[] = [], discarded: FileAsset[] = [];
  const store: ExecutionStore = { getSnapshot: () => tasks, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, update: change => { tasks = change(tasks); listeners.forEach(listener => listener()); } };
  const engine = new WorkflowExecution(graph, store, {
    patch: (id, data) => { graph = { ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...data } } as AppNode : node) }; },
    retain: () => () => {}, discard: assets => discarded.push(...assets), snapshot: async () => ({ assets: new Map(), release: () => {} }), verify: async () => {}, ...io,
    local: local ?? (async () => { throw new Error('local failure'); }),
    request: async (task, signal) => { requests.push(task); return request ? request(task, signal) : task.imageRequest || task.nanoBananaRequest || task.ideogramRequest ? { id: crypto.randomUUID(), name: 'generated', kind: 'image', url: 'blob:generated' } : `description ${task.nodeId}`; },
  });
  return { engine, store, requests, discarded, get graph() { return graph; }, edit(change: (graph: ExecutionGraph) => ExecutionGraph) { graph = change(graph); engine.observe(graph); }, node(id: string) { return graph.nodes.find(node => node.id === id)!; } };
}
async function until(check: () => boolean) { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.fail('condition not reached'); }
const changeAsset = (graph: ExecutionGraph, id: string, assetId: string): ExecutionGraph => ({ ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...file(id), data: { assets: [{ id: assetId, name: assetId, kind: 'image', url: `blob:${assetId}` }] } } as AppNode : node) });

test('two upstream branches finish before target; repeat reuses and replacement updates only one branch', async () => {
  const h = harness(); await h.engine.run(['g'], 1);
  assert.deepEqual(h.requests.map(task => task.nodeId), ['da', 'db', 'g']);
  assert.equal(h.requests[2].imageRequest?.prompt, 'description da description db combined');
  await h.engine.run(['g'], 1); assert.deepEqual(h.requests.map(task => task.nodeId), ['da', 'db', 'g', 'g']);
  h.edit(graph => changeAsset(graph, 'a', 'a2')); await h.engine.run(['g'], 1);
  assert.deepEqual(h.requests.slice(4).map(task => task.nodeId), ['da', 'g']);
  assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
});

test('Runs = 3 prepares dependencies once and preserves three distinct target requests', async () => {
  const h = harness(); await h.engine.run(['g'], 3);
  assert.deepEqual(h.requests.map(task => task.nodeId), ['da', 'db', 'g', 'g', 'g']);
  assert.equal(new Set(h.requests.filter(task => task.nodeId === 'g').map(task => task.id)).size, 3);
  const node = h.node('g'); assert.ok(isImageGeneratorNode(node)); assert.equal(node.data.results?.length, 3);
});

test('manual description survives source replacement and remains visibly distinguishable', async () => {
  const h = harness(); await h.engine.run(['g'], 1);
  const marker = sourceSignature(h.graph, h.node('da'));
  h.edit(graph => ({ ...graph, nodes: graph.nodes.map(node => node.id === 'da' ? { ...node, data: { ...node.data, text: 'my words', outputMode: 'manual', sourceSignature: marker } } as AppNode : node) }));
  h.edit(graph => changeAsset(graph, 'a', 'replacement'));
  assert.notEqual(sourceSignature(h.graph, h.node('da')), marker);
  await h.engine.run(['g'], 1);
  assert.deepEqual(h.requests.slice(3).map(task => task.nodeId), ['g']);
  assert.equal(h.requests[3].imageRequest?.prompt, 'my words description db combined');
  const node = h.node('da'); assert.ok(isDescriberNode(node)); assert.equal(node.data.text, 'my words');
});

test('A → B → undo A cannot revive an aborted request or start downstream', async () => {
  const pending: { resolve: (text: string) => void; signal: AbortSignal }[] = [];
  const h = harness(fixture(), (_task, signal) => new Promise(resolve => pending.push({ resolve, signal })));
  const original = h.graph; const done = h.engine.run(['g'], 1);
  await until(() => pending.length === 2);
  h.edit(graph => changeAsset(graph, 'a', 'b')); h.edit(() => original);
  await done;
  assert.ok(pending.every(item => item.signal.aborted));
  pending.forEach(item => item.resolve('late')); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.requests.length, 2);
  assert.ok(h.graph.nodes.filter(isDescriberNode).every(node => node.data.text === ''));
  assert.ok(h.store.getSnapshot().every(task => !isActiveTask(task)));
});

test('known missing selection is identified before ANY model request across the plan', () => {
  const graph = fixture(); graph.nodes.push({ id: 'mask', type: 'masks-extractor', position: { x: 0, y: 0 }, data: {} });
  graph.edges.push(edge('b', 'mask', 'image', 'file'), edge('mask', 'g', 'mask', 'mask'));
  const h = harness(graph);
  assert.throws(() => h.engine.run(['g'], 1), /必要选区/); assert.equal(h.requests.length, 0); assert.equal(h.store.getSnapshot().length, 0);
});

test('empty/replaced local output fails explicitly and never runs downstream or hangs', async () => {
  const graph: ExecutionGraph = { nodes: [file('a'), { id: 'resize', type: 'resize', position: { x: 0, y: 0 }, data: { settings: { lockAspectRatio: true } } }, describer('d')], edges: [edge('a', 'resize', 'image', 'file'), edge('resize', 'd', 'image-0', 'result')] };
  const h = harness(graph, undefined, async () => ({}));
  await h.engine.run(['d'], 1);
  assert.equal(h.requests.length, 0); assert.equal(h.store.getSnapshot()[0].state, 'Failed');
  assert.match(h.store.getSnapshot()[0].error!, /输出未完成或已被替换/);
});

test('shared dependency across targets executes once, cancelled consumer does not cancel sibling', async () => {
  const graph = fixture(); graph.nodes.push(generator('g2')); graph.edges.push(edge('prompt', 'g2', 'prompt'));
  const pending: { task: PreviewTask; signal: AbortSignal; resolve: (result: string) => void }[] = [];
  const h = harness(graph, (task, signal) => task.nodeId.startsWith('d') ? new Promise(resolve => pending.push({ task, signal, resolve })) : Promise.resolve({ id: crypto.randomUUID(), name: 'g', kind: 'image', url: 'blob:g' }));
  const first = h.engine.run(['g'], 1), second = h.engine.run(['g2'], 1);
  await until(() => pending.length === 2);
  h.store.update(tasks => tasks.map(task => task.nodeId === 'g' ? { ...task, state: 'Cancelled' } : task));
  assert.ok(pending.every(item => !item.signal.aborted));
  pending.forEach(item => item.resolve(item.task.nodeId)); await Promise.all([first, second]);
  assert.deepEqual(h.requests.map(task => task.nodeId), ['da', 'db', 'g2']);
});

test('refresh changes Blob URLs but not effective signatures or reusable results', async () => {
  const h = harness(); await h.engine.run(['g'], 1);
  const saved = workflowSnapshot({ ...h.graph, viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' });
  const restored = { ...saved, nodes: mapAssets(saved.nodes, asset => ({ ...asset, url: `blob:restored-${asset.id}` })) };
  const next = harness(restored); await next.engine.run(['g'], 1);
  assert.deepEqual(next.requests.map(task => task.nodeId), ['g']);
  const da = h.node('da'); assert.ok(isDescriberNode(da));
  assert.equal(requestSignature(prepareModel(restored, 'da'), restored), da.data.generation?.inputSignature);
});

test('unused variables and Compare second branch do not enter a target plan', () => {
  const graph = fixture();
  graph.nodes.push({ id: 'unused', type: 'router', position: { x: 0, y: 0 }, data: {} });
  graph.nodes = graph.nodes.map(node => node.id === 'prompt' ? { ...node, data: { text: '', content: { type: 'doc', content: [{ type: 'promptVariable', attrs: { handleId: 'variable-1' } }] } } } as AppNode : node);
  graph.edges.push(edge('unused', 'prompt', 'variable-3', 'output'));
  const plan = preflight(graph, ['g'], 1);
  assert.ok(![...plan.get('g')!].some(key => key.startsWith('db:') || key.startsWith('unused:')));
  const compare: ExecutionGraph = { nodes: [file('a'), { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { mode: 'slider', split: .5 } } as AppNode, describer('d'), graph.nodes.find(node => node.id === 'unused')!], edges: [edge('a', 'compare', 'input-1', 'file'), edge('unused', 'compare', 'input-2', 'output'), edge('compare', 'd', 'image-0', 'output-1')] };
  assert.doesNotThrow(() => preflight(compare, ['d'], 1));
});

test('movement and rename do not cancel; failures block consumers without automatic retry', async () => {
  const h = harness(fixture(), async task => { if (task.nodeId === 'da') throw new Error('mock failure'); return 'okay'; });
  const before = graphGuard(h.graph, 'g', true);
  h.edit(graph => ({ ...graph, nodes: graph.nodes.map(node => ({ ...node, position: { x: 99, y: 99 }, data: { ...node.data, label: 'renamed' } } as AppNode)) }));
  assert.equal(graphGuard(h.graph, 'g', true), before);
  await h.engine.run(['g'], 1); assert.equal(h.requests.filter(task => task.nodeId === 'da').length, 1); assert.ok(!h.requests.some(task => task.nodeId === 'g'));
});

test('all supported model adapters participate in dependency execution', async () => {
  for (const type of ['nano-banana', 'ideogram'] as const) {
    const graph = fixture(); graph.nodes = graph.nodes.map(node => node.id === 'g' ? { ...node, type, data: { ...(type === 'nano-banana' ? defaultNanoBananaSettings : defaultIdeogramSettings), imageInputs: 1 } } as AppNode : node);
    const h = harness(graph); await h.engine.run(['g'], 1); await h.engine.run(['g'], 1);
    assert.deepEqual(h.requests.map(task => task.nodeId), ['da', 'db', 'g', 'g']);
  }
});

test('legacy descriptions refresh automatically once, then reuse the recorded result', async () => {
  const graph = fixture();
  graph.nodes = graph.nodes.map(node => isDescriberNode(node) ? { ...node, data: { ...node.data, text: 'legacy description' } } : node);
  const h = harness(graph);
  await h.engine.run(['g'], 1);
  assert.deepEqual(h.requests.map(task => task.nodeId), ['da', 'db', 'g']);
  assert.equal(h.requests[2].imageRequest?.prompt, 'description da description db combined');
  assert.ok(h.graph.nodes.filter(isDescriberNode).every(node => node.data.generation?.version === 1));
  await h.engine.run(['g'], 1);
  assert.deepEqual(h.requests.slice(3).map(task => task.nodeId), ['g']);
});

test('legacy generated images refresh before downstream and subsequently reuse across all image models', async () => {
  for (const type of ['sunburst', 'nano-banana', 'ideogram'] as const) {
    const graph = fixture();
    graph.nodes = graph.nodes.map(node => node.id === 'g' ? { ...node, type, data: { ...(type === 'sunburst' ? defaultSunburstSettings : type === 'nano-banana' ? defaultNanoBananaSettings : defaultIdeogramSettings), imageInputs: 1, results: [{ id: 'legacy', kind: 'image', name: 'legacy.png', url: 'blob:legacy' }], activeResultId: 'legacy' } } as AppNode : node);
    graph.nodes.push(describer('downstream'));
    graph.edges.push(edge('g', 'downstream', 'image-0', 'result'));
    const h = harness(graph);
    await h.engine.run(['downstream'], 1);
    assert.deepEqual(h.requests.map(task => task.nodeId), ['da', 'db', 'g', 'downstream']);
    assert.equal(h.requests[3].images?.[0], 'blob:generated');
    const imageNode = h.node('g'); assert.ok(isImageGeneratorNode(imageNode));
    assert.equal(imageNode.data.results?.length, 2);
    assert.notEqual(imageNode.data.activeResultId, 'legacy');
    await h.engine.run(['downstream'], 1);
    assert.deepEqual(h.requests.slice(4).map(task => task.nodeId), ['downstream']);
  }
});

test('failed legacy refresh preserves old output without starting downstream', async () => {
  const graph = fixture();
  graph.nodes = graph.nodes.map(node => isDescriberNode(node) ? { ...node, data: { ...node.data, text: 'legacy description' } } : node);
  const h = harness(graph, async () => { throw new Error('mock refresh failed'); });
  await h.engine.run(['g'], 1);
  assert.ok(h.requests.length > 0 && h.requests.every(task => task.nodeId !== 'g'));
  assert.ok(h.graph.nodes.filter(isDescriberNode).every(node => node.data.text === 'legacy description' && !node.data.generation));
  assert.ok(h.store.getSnapshot().every(task => !isActiveTask(task)));
});

test('cycles and multi-run dependent targets are rejected', () => {
  assert.throws(() => preflight(fixture(), ['da', 'g'], 3), /多次运行/);
  const cycle = fixture(); cycle.edges.push(edge('prompt', 'da', 'instructions'));
  assert.throws(() => preflight(cycle, ['g'], 1), /循环/);
});

test('explicitly selected upstream runs even when it has legacy or manual output', async () => {
  for (const manual of [false, true]) {
    const graph = fixture(); graph.nodes = graph.nodes.map(node => node.id === 'da' ? { ...node, data: { ...node.data, text: 'old', ...(manual ? { outputMode: 'manual' } : {}) } } as AppNode : node);
    const h = harness(graph); await h.engine.run(['g', 'da'], 1);
    assert.equal(h.requests.filter(task => task.nodeId === 'da').length, 1);
    assert.ok(h.requests.findIndex(task => task.nodeId === 'g') > h.requests.findIndex(task => task.nodeId === 'da'));
    assert.ok(h.requests.find(task => task.nodeId === 'g')?.imageRequest?.prompt.includes('description da'));
  }
});

test('long shared router chains have bounded edit guards and cycle checks', () => {
  const graph = fixture(); let source = 'da';
  for (let i = 0; i < 80; i++) {
    const id = `router-${i}`;
    graph.nodes.push({ id, type: 'router', position: { x: i, y: 0 }, data: {} });
    graph.edges.push(edge(source, id, 'input', i ? 'output' : undefined)); source = id;
  }
  graph.edges = graph.edges.filter(item => item.id !== 'da-prompt-variable-1');
  graph.edges.push(edge(source, 'prompt', 'variable-1', 'output'));
  assert.ok(graphGuard(graph, 'g', true).length < 30000);
  assert.doesNotThrow(() => preflight(graph, ['g'], 1));
});

function cachedLocalGraph(): ExecutionGraph {
  const settings = { width: 32, height: 24, lockAspectRatio: true };
  return { nodes: [file('source'), { id: 'resize', type: 'resize', position: { x: 0, y: 0 }, data: {
    settings, result: { id: 'expired', kind: 'image', name: 'cached.png', url: 'blob:expired' }, outputRevision: resizeRevision({ settings }, 'source'),
  } }, describer('d')], edges: [edge('source', 'resize', 'image', 'file'), edge('resize', 'd', 'image-0', 'result')] };
}

test('expired local output rebuilds once from the original and the next run reuses it', async () => {
  let renders = 0;
  const h = harness(cachedLocalGraph(), undefined, async node => {
    renders++;
    return { result: { id: 'rebuilt', kind: 'image', name: 'rebuilt.png', url: 'blob:rebuilt' }, outputRevision: 'outputRevision' in node.data ? node.data.outputRevision : undefined };
  }, { verify: async assets => { if (assets.some(asset => asset.id === 'expired')) throw new Error('missing cache'); } });
  await h.engine.run(['d'], 1);
  assert.equal(renders, 1); assert.deepEqual(h.requests[0].images, ['blob:rebuilt']);
  assert.equal(h.store.getSnapshot()[0].state, 'Done');
  await h.engine.run(['d'], 1);
  assert.equal(renders, 1); assert.equal(h.requests.length, 2);
});

test('unreadable original, locked local output and cancellation never trigger cache recovery', async () => {
  for (const mode of ['original', 'locked', 'cancelled'] as const) {
    const graph = cachedLocalGraph();
    if (mode === 'locked') graph.nodes[1] = { ...graph.nodes[1], data: { ...graph.nodes[1].data, locked: true } } as AppNode;
    let renders = 0;
    const h = harness(graph, undefined, async () => { renders++; return {}; }, { verify: async assets => {
      if (assets.some(asset => asset.id === (mode === 'original' ? 'source' : 'expired'))) {
        if (mode === 'cancelled') h.store.update(tasks => tasks.map(task => ({ ...task, state: 'Cancelled' })));
        throw new Error('missing asset');
      }
    } });
    await h.engine.run(['d'], 1);
    assert.equal(renders, 0, mode); assert.equal(h.requests.length, 0, mode);
    assert.ok(h.store.getSnapshot().every(task => !isActiveTask(task)));
  }
});

test('failed local rebuilding stops downstream instead of looping or using the stale cache', async () => {
  let renders = 0;
  const h = harness(cachedLocalGraph(), undefined, async () => { renders++; throw new Error('render failed'); }, {
    verify: async assets => { if (assets.some(asset => asset.id === 'expired')) throw new Error('missing cache'); },
  });
  await h.engine.run(['d'], 1);
  assert.equal(renders, 1); assert.equal(h.requests.length, 0);
  assert.match(h.store.getSnapshot()[0].error!, /render failed/);
});

test('source planning excludes unused Compare branches, overridden fallbacks and historical results', () => {
  const remote = (id: string): FileAsset => ({ id, kind: 'image', name: id, url: `https://example.invalid/${id}` });
  const graph: ExecutionGraph = { nodes: [
    { id: 'c', type: 'compare', position: { x: 0, y: 0 }, data: { mode: 'slider', split: .5, input1: remote('needed'), input2: remote('unused') } }, describer('d'),
  ], edges: [edge('c', 'd', 'image-0', 'output-1')] };
  assert.deepEqual(executionSourceAssets(graph, 'd').map(asset => asset.id), ['needed']);
  graph.nodes.push(file('replacement')); graph.edges.push(edge('replacement', 'c', 'input-1', 'file'));
  assert.deepEqual(executionSourceAssets(graph, 'd').map(asset => asset.id), ['replacement']);
  const models = fixture(); models.nodes.push(describer('downstream')); models.edges.push(edge('g', 'downstream', 'image-0', 'result'));
  const g = models.nodes.find(node => node.id === 'g')!; assert.ok(isImageGeneratorNode(g));
  g.data.results = [remote('history'), remote('current')]; g.data.activeResultId = 'current';
  assert.deepEqual(executionSourceAssets(models, 'downstream').map(asset => asset.id).sort(), ['a', 'b']);
  g.data.outputMode = 'fixed';
  assert.deepEqual(executionSourceAssets(models, 'downstream').map(asset => asset.id), ['current']);
  assert.deepEqual(executionSourceAssets(models, 'downstream', ['g', 'downstream']).map(asset => asset.id).sort(), ['a', 'b']);
  const doc = defaultCompositorDocument();
  doc.canvas.autoSize = false;
  doc.layers = [
    { ...doc.layers[0], id: 'visible', source: { kind: 'asset', asset: remote('visible') } },
    { ...doc.layers[0], id: 'hidden', visible: false, source: { kind: 'asset', asset: remote('hidden') } },
    { ...doc.layers[0], id: 'linked', source: { kind: 'input', handle: 'background', fallback: remote('fallback') } },
  ];
  const composition: ExecutionGraph = { nodes: [file('source'), { id: 'comp', type: 'compositor', position: { x: 0, y: 0 }, data: { document: doc } }, describer('d')], edges: [edge('source', 'comp', 'background', 'file'), edge('comp', 'd', 'image-0', 'result')] };
  assert.deepEqual(executionSourceAssets(composition, 'd').map(asset => asset.id).sort(), ['source', 'visible']);
});

test('expired selected remote model cache regenerates while unselected history is never fetched', async () => {
  const warm = harness(); await warm.engine.run(['g'], 1);
  const graph = warm.graph;
  const g = graph.nodes.find(node => node.id === 'g')!; assert.ok(isImageGeneratorNode(g));
  const cached = g.data.results![0];
  g.data.results = [{ ...cached, id: 'history', url: 'https://example.invalid/history' }, { ...cached, url: 'https://example.invalid/selected' }];
  graph.nodes.push(describer('downstream')); graph.edges.push(edge('g', 'downstream', 'image-0', 'result'));
  const fetched: string[] = [];
  const h = harness(graph, undefined, undefined, { snapshot: async assets => {
    fetched.push(...assets.map(asset => asset.url)); throw new Error('expired remote output');
  } });
  await h.engine.run(['downstream'], 1);
  assert.deepEqual(fetched, ['https://example.invalid/selected']);
  assert.deepEqual(h.requests.map(task => task.nodeId), ['g', 'downstream']);
  assert.equal(h.requests[1].images?.[0], 'blob:generated');
  await h.engine.run(['downstream'], 1);
  assert.equal(fetched.length, 1); assert.deepEqual(h.requests.slice(2).map(task => task.nodeId), ['downstream']);
});

test('required remote source failure stops the plan before any model call', async () => {
  const graph = fixture();
  graph.nodes[0] = { ...file('a'), data: { assets: [{ id: 'remote', kind: 'image', name: 'remote', url: 'https://example.invalid/source' }] } } as AppNode;
  const h = harness(graph, undefined, undefined, { snapshot: async () => { throw new Error('source unreachable'); } });
  await h.engine.run(['g'], 1);
  assert.equal(h.requests.length, 0); assert.match(h.store.getSnapshot()[0].error!, /source unreachable/);
});

const textNode = (id: string, text: string): AppNode => ({ id, type: 'text', position: { x: 0, y: 0 }, data: { text } });
const generatedAsset = (id: string): FileAsset => ({ id, name: id, kind: 'image', url: `blob:${id}` });

test('concurrent roots retain their own describer and generated-image outputs', async () => {
  for (const image of [false, true]) {
    const upstream = image ? generator('up') : describer('up');
    const graph: ExecutionGraph = { nodes: [file('a'), textNode('p', 'paint'), upstream, generator('g1'), generator('g2')], edges: [edge('a', 'up', 'image-0', 'file'), ...(image ? [edge('p', 'up', 'prompt'), edge('p', 'g1', 'prompt'), edge('p', 'g2', 'prompt')] : []), ...['g1', 'g2'].map(id => edge('up', id, image ? 'image-0' : 'prompt', image ? 'result' : undefined))] };
    graph.nodes[0] = { ...file('a'), data: { assets: [{ ...generatedAsset('a'), url: 'https://example.invalid/changing.png' }] } } as AppNode;
    let snapshot = 0;
    const pending: ((value: string | FileAsset) => void)[] = [];
    const h = harness(graph, task => task.nodeId === 'up' ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(generatedAsset(task.nodeId!)), undefined, {
      snapshot: async assets => ({ assets: new Map(assets.map(asset => [asset.url, { ...asset, url: `blob:revision-${++snapshot}`, contentHash: `revision-${snapshot}` }])), release: () => {} }),
    });
    const first = h.engine.run(['g1'], 1), second = h.engine.run(['g2'], 1);
    await until(() => pending.length === 2);
    pending[0](image ? generatedAsset('version-1') : 'version-1');
    pending[1](image ? generatedAsset('version-2') : 'version-2');
    await Promise.all([first, second]);
    for (const [index, id] of ['g1', 'g2'].entries()) {
      const request = h.requests.find(task => task.nodeId === id)?.imageRequest;
      assert.equal(image ? request?.images[0] : request?.prompt, `${image ? 'blob:' : ''}version-${index + 1}`);
    }
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
    h.engine.dispose();
  }
});

test('known empty prompts and invalid static parameters fail before any upstream request', () => {
  for (const type of ['sunburst', 'nano-banana', 'ideogram'] as const) {
    for (const invalidPrompt of [true, false]) {
      const target: AppNode = { id: 'target', type, position: { x: 0, y: 0 }, data: { ...(type === 'sunburst' ? defaultSunburstSettings : type === 'nano-banana' ? defaultNanoBananaSettings : defaultIdeogramSettings), imageInputs: 1, ...(!invalidPrompt ? type === 'nano-banana' ? { imageSize: 'invalid' } : type === 'ideogram' ? { editQuality: 'invalid' } : { quality: 'invalid' } : {}) } } as AppNode;
      const graph: ExecutionGraph = { nodes: [textNode('p', 'valid'), textNode('empty', invalidPrompt ? '' : 'valid'), generator('up'), target], edges: [edge('p', 'up', 'prompt'), edge('up', 'target', 'image-0', 'result'), edge('empty', 'target', 'prompt')] };
      const h = harness(graph);
      assert.throws(() => h.engine.run(['target'], 1), invalidPrompt ? /非空提示词/ : /参数/);
      assert.equal(h.requests.length, 0); assert.equal(h.store.getSnapshot().length, 0);
      h.engine.dispose();
    }
  }
});

test('dynamic prompts and settings defer validation; fixed manual inputs are validated immediately', async () => {
  const graph: ExecutionGraph = { nodes: [file('a'), describer('d'), generator('g'), textNode('p', 'paint')], edges: [edge('a', 'd', 'image-0', 'file'), edge('d', 'g', 'size'), edge('p', 'g', 'prompt')] };
  const h = harness(graph, async task => task.nodeId === 'd' ? '1024x1024' : generatedAsset('g'));
  await h.engine.run(['g'], 1);
  assert.equal(h.requests[1].imageRequest?.size, '1024x1024');
  h.edit(current => ({ ...current, nodes: current.nodes.map(node => node.id === 'd' ? { ...node, data: { ...node.data, text: 'invalid', outputMode: 'manual' } } as AppNode : node) }));
  assert.throws(() => h.engine.run(['g'], 1), /有效的宽高/);
  assert.equal(h.requests.length, 2);
});

test('Painter mask rebuilds missing or unreadable alpha output through Router/Compare for both models', async () => {
  for (const type of ['sunburst', 'ideogram'] as const) for (const expired of [false, true]) for (const route of ['direct', 'router', 'compare']) {
    const mask = generatedAsset('visible-mask'), alpha = generatedAsset('alpha-mask');
    const data = { ...defaultPainterData, baseImage: generatedAsset('a'), mask, ...(expired ? { alphaMask: alpha } : {}) };
    const painter: AppNode = { id: 'painter', type: 'painter', position: { x: 0, y: 0 }, data: { ...data, outputRevision: painterRevision(data, 'a') } };
    const graph: ExecutionGraph = { nodes: [file('a'), textNode('prompt', 'edit'), painter, { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} }, { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { mode: 'slider', split: .5 } }, { id: 'g', type, position: { x: 0, y: 0 }, data: { ...(type === 'sunburst' ? defaultSunburstSettings : defaultIdeogramSettings), imageInputs: 1 } } as AppNode], edges: [edge('prompt', 'g', 'prompt'), edge('a', 'g', 'image-0', 'file'), edge('painter', 'router', 'input', 'mask'), edge('router', 'compare', 'input-1', 'output'), edge(route === 'direct' ? 'painter' : route, 'g', 'mask', route === 'direct' ? 'mask' : route === 'router' ? 'output' : 'output-1')] };
    let renders = 0;
    const h = harness(graph, undefined, async () => { renders++; return { mask, alphaMask: generatedAsset('fresh-alpha'), outputRevision: painterRevision(data, 'a') }; }, { verify: async assets => { if (assets.some(asset => asset.url === alpha.url)) throw new Error('expired alpha'); } });
    await h.engine.run(['g'], 1);
    assert.equal(renders, route === 'compare' ? 0 : 1); assert.equal(h.requests.length, 1);
    assert.equal((h.requests[0].imageRequest ?? h.requests[0].ideogramRequest)?.mask, route === 'compare' ? mask.url : 'blob:fresh-alpha');
    await h.engine.run(['g'], 1); assert.equal(renders, route === 'compare' ? 0 : 1);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
  }
});

test('model request deadline starts after slot acquisition; queued cancellation still works', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const graph: ExecutionGraph = { nodes: [file('a'), textNode('p', 'paint'), ...['g1', 'g2', 'g3', 'g4'].map(generator), describer('d'), describer('cancel')], edges: [...['g1', 'g2', 'g3', 'g4'].map(id => edge('p', id, 'prompt')), edge('a', 'd', 'image-0', 'file'), edge('a', 'cancel', 'image-0', 'file')] };
  const pending: { task: PreviewTask; signal: AbortSignal; resolve: (result: FileAsset | string) => void }[] = [];
  const h = harness(graph, (task, signal) => new Promise(resolve => pending.push({ task, signal, resolve })));
  const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
  const busy = h.engine.run(['g1', 'g2', 'g3', 'g4'], 1); await flush();
  const waiting = h.engine.run(['d'], 1), cancelled = h.engine.run(['cancel'], 1); await flush();
  assert.equal(pending.length, 4);
  t.mock.timers.tick(130001); await flush();
  assert.equal(h.store.getSnapshot().find(task => task.nodeId === 'd')?.state, 'Queued');
  h.store.update(tasks => tasks.map(task => task.nodeId === 'cancel' ? { ...task, state: 'Cancelled' } : task)); await cancelled;
  pending[0].resolve(generatedAsset('first')); await flush();
  assert.equal(pending.length, 5); assert.equal(pending[4].task.nodeId, 'd');
  t.mock.timers.tick(129999); await flush(); assert.equal(pending[4].signal.aborted, false);
  t.mock.timers.tick(1); await waiting; assert.equal(pending[4].signal.aborted, true);
  for (const item of pending.slice(1, 4)) item.resolve(generatedAsset(item.task.nodeId!));
  await busy;
  assert.equal(h.requests.filter(task => task.nodeId === 'd').length, 1);
  assert.equal(h.requests.filter(task => task.nodeId === 'cancel').length, 0);
  h.engine.dispose();
});

test('Runs = 3 continues independent attempts after first or middle failure without retrying', async () => {
  for (const failureIndex of [0, 1]) {
    let attempts = 0;
    const h = harness(fixture(), async task => {
      if (!task.imageRequest) return `description ${task.nodeId}`;
      if (attempts++ === failureIndex) throw new Error('one attempt failed');
      return generatedAsset(`result-${attempts}`);
    });
    await h.engine.run(['g'], 3);
    assert.deepEqual(h.requests.map(task => task.nodeId), ['da', 'db', 'g', 'g', 'g']);
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
    const h = harness(fixture(), async task => {
      if (!task.imageRequest) return `description ${task.nodeId}`;
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

test('changed remote generated content invalidates local derivatives; equal content with a new Blob URL reuses', async () => {
  const upstream = generator('up'), settings = { width: 32, height: 24, lockAspectRatio: true };
  const original: FileAsset = { ...generatedAsset('remote-result'), url: 'https://example.invalid/generated.png' };
  const graph: ExecutionGraph = { nodes: [textNode('p', 'paint'), upstream, { id: 'resize', type: 'resize', position: { x: 0, y: 0 }, data: { settings } }, describer('d')], edges: [edge('p', 'up', 'prompt'), edge('up', 'resize', 'image', 'result'), edge('resize', 'd', 'image-0', 'result')] };
  assert.ok(isImageGeneratorNode(upstream));
  const signature = requestSignature(prepareModel(graph, 'up'), graph);
  upstream.data.results = [{ ...original, generation: { version: 1, inputSignature: signature, outputSignature: original.id } }];
  upstream.data.activeResultId = original.id;
  let snapshots = 0, renders = 0;
  const hashes: (string | undefined)[] = [];
  const h = harness(graph, undefined, async (_node, current) => {
    const image = current.nodes.find(node => node.id === 'up')!; assert.ok(isImageGeneratorNode(image));
    hashes.push(image.data.results?.[0].contentHash);
    return { result: generatedAsset(`resized-${++renders}`), outputRevision: resizeRevision({ settings }, original.id) };
  }, {
    snapshot: async assets => ({ assets: new Map(assets.map(asset => [asset.url, { ...asset, url: `blob:snapshot-${++snapshots}`, contentHash: snapshots === 1 ? 'hash-1' : 'hash-2' }])), release: () => {} }),
  });
  await h.engine.run(['d'], 1); await h.engine.run(['d'], 1); await h.engine.run(['d'], 1);
  assert.equal(snapshots, 3); assert.equal(renders, 2);
  assert.deepEqual(hashes, ['hash-1', 'hash-2']);
  assert.deepEqual(h.requests.map(task => task.nodeId), ['d', 'd', 'd']);
  assert.deepEqual(h.requests.map(task => task.images), [['blob:resized-1'], ['blob:resized-2'], ['blob:resized-2']]);
  assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
  h.engine.dispose();
});

function iteratorGraph(values = ['水彩猫', '像素猫', '写实猫']): ExecutionGraph {
  return { nodes: [{ id: 'iterator', type: 'text-iterator', position: { x: 0, y: 0 }, data: { items: values.map((text, index) => ({ id: `item-${index}`, text })) } }, generator('g')], edges: [edge('iterator', 'g', 'prompt', 'text')] };
}

test('Text Iterator creates separate requests for every item across all image model adapters', async () => {
  for (const type of ['sunburst', 'nano-banana', 'ideogram'] as const) {
    const graph = iteratorGraph();
    graph.nodes[1] = type === 'sunburst' ? generator('g') : type === 'nano-banana'
      ? { id: 'g', type, position: { x: 0, y: 0 }, data: { ...defaultNanoBananaSettings, imageInputs: 1 } }
      : { id: 'g', type, position: { x: 0, y: 0 }, data: { ...defaultIdeogramSettings, imageInputs: 1 } };
    const h = harness(graph); await h.engine.run(['g'], 1);
    assert.deepEqual(h.requests.map(task => (task.imageRequest ?? task.nanoBananaRequest ?? task.ideogramRequest)?.prompt), ['水彩猫', '像素猫', '写实猫']);
    assert.deepEqual(h.requests.map(task => task.iteration?.index), [0, 1, 2]);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Done' && task.label?.includes('/3')));
    const result = h.node('g'); assert.ok(isImageGeneratorNode(result)); assert.equal(result.data.results?.length, 3);
    assert.deepEqual(result.data.results?.map(asset => asset.generation?.iteration?.text), ['水彩猫', '像素猫', '写实猫']);
    h.engine.dispose();
  }
});

test('iterator follows Router and Prompt variables, preserves duplicates and multiplies explicit repeats', async () => {
  const graph = iteratorGraph(['重复', '重复']);
  graph.nodes.push({ id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} }, textNode('template', '以水彩画表现'));
  graph.edges = [edge('iterator', 'router', 'input', 'text'), edge('router', 'template', 'variable-1', 'output'), edge('template', 'g', 'prompt')];
  const h = harness(graph); await h.engine.run(['g'], 2);
  assert.equal(h.requests.length, 4);
  assert.ok(h.requests.every(task => task.imageRequest?.prompt === '重复 以水彩画表现'));
  assert.equal(new Set(h.requests.map(task => task.id)).size, 4);
  assert.deepEqual(h.requests.map(task => task.iteration?.itemId).sort(), ['item-0', 'item-0', 'item-1', 'item-1']);
  assert.equal(h.graph.nodes.find(node => node.id === 'iterator')?.type, 'text-iterator');
  h.engine.dispose();
});

test('iterator downstream dependencies keep each iteration image paired with its own prompt', async () => {
  const graph = iteratorGraph(['first', 'second']);
  graph.nodes.push(generator('final'));
  graph.edges.push(edge('iterator', 'final', 'prompt', 'text'), edge('g', 'final', 'image-0', 'result'));
  const pending: { task: PreviewTask; resolve: (asset: FileAsset) => void }[] = [];
  const h = harness(graph, task => task.nodeId === 'g' ? new Promise(resolve => pending.push({ task, resolve })) : Promise.resolve(generatedAsset(`final-${task.iteration?.index}`)));
  const done = h.engine.run(['final'], 1);
  await until(() => pending.length === 2);
  pending[1].resolve(generatedAsset('second-image'));
  await until(() => h.requests.some(task => task.nodeId === 'final'));
  pending[0].resolve(generatedAsset('first-image')); await done;
  const finals = h.requests.filter(task => task.nodeId === 'final');
  assert.deepEqual(finals.map(task => task.imageRequest?.prompt), ['second', 'first']);
  assert.deepEqual(finals.map(task => task.imageRequest?.images), [['blob:second-image'], ['blob:first-image']]);
  h.engine.dispose();
});

test('overlapping iterator runs wait for the matching upstream item, including duplicate prompts and reversed completion', async () => {
  for (const values of [['first', 'second'], ['same', 'same']]) for (const first of [0, 1]) {
    const graph = iteratorGraph(values);
    graph.nodes.push(generator('final'));
    graph.edges.push(edge('iterator', 'final', 'prompt', 'text'), edge('g', 'final', 'image-0', 'result'));
    const pending: { task: PreviewTask; resolve: (asset: FileAsset) => void }[] = [];
    const h = harness(graph, task => task.nodeId === 'g' ? new Promise(resolve => pending.push({ task, resolve })) : Promise.resolve(generatedAsset(`final-${task.iteration?.index}`)));
    try {
      const upstream = h.engine.run(['g'], 1);
      await until(() => pending.length === 2);
      const downstream = h.engine.run(['final'], 1);
      await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(h.requests.filter(task => task.nodeId === 'final').length, 0);
      pending[first].resolve(generatedAsset(`image-${first}`));
      await until(() => h.requests.some(task => task.nodeId === 'final'));
      await new Promise(resolve => setTimeout(resolve, 5));
      const completed = h.requests.filter(task => task.nodeId === 'final');
      assert.equal(completed.length, 1, 'the other item must keep waiting');
      assert.equal(completed[0].iteration?.index, first);
      assert.deepEqual(completed[0].imageRequest?.images, [`blob:image-${first}`]);
      pending[1 - first].resolve(generatedAsset(`image-${1 - first}`));
      await Promise.all([upstream, downstream]);
      assert.equal(pending.length, 2, 'reuse the running upstream without extra provider requests');
      for (const task of h.requests.filter(task => task.nodeId === 'final')) {
        assert.equal(task.imageRequest?.prompt, values[task.iteration!.index]);
        assert.deepEqual(task.imageRequest?.images, [`blob:image-${task.iteration!.index}`]);
      }
      assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
    } finally { h.engine.dispose(); }
  }
});

test('completed iterator images are restored by item identity while siblings run and after reload', async () => {
  for (const kind of ['text', 'image']) {
    const graph = kind === 'text' ? iteratorGraph(['same', 'same', 'same']) : imageIteratorGraph();
    if (kind === 'image') graph.nodes = mapAssets(graph.nodes, asset => ({ ...asset, contentHash: 'identical-content' }));
    graph.nodes.push(generator('final'));
    graph.edges.push(edge(kind === 'text' ? 'iterator' : 'prompt', 'final', 'prompt', kind === 'text' ? 'text' : undefined), edge('g', 'final', 'image-0', 'result'));
    const pending: { task: PreviewTask; resolve: (asset: FileAsset) => void }[] = [];
    const h = harness(graph, task => task.nodeId === 'g' ? new Promise(resolve => pending.push({ task, resolve })) : Promise.resolve(generatedAsset(`final-${task.iteration?.itemId}`)));
    try {
      const upstream = h.engine.run(['g'], 1);
      await until(() => pending.length === 3);
      for (const index of [0, 1]) {
        pending[index].resolve(generatedAsset(`upstream-${pending[index].task.iteration!.itemId}`));
        await until(() => h.store.getSnapshot().filter(task => task.nodeId === 'g' && task.state === 'Done').length === index + 1);
      }
      const downstream = h.engine.run(['final'], 1);
      await until(() => h.requests.filter(task => task.nodeId === 'final').length === 2);
      for (const task of h.requests.filter(task => task.nodeId === 'final')) assert.deepEqual(task.imageRequest?.images, [`blob:upstream-${task.iteration!.itemId}`]);
      pending[2].resolve(generatedAsset(`upstream-${pending[2].task.iteration!.itemId}`));
      await Promise.all([upstream, downstream]);
      assert.equal(pending.length, 3, 'completed entries do not generate again');
      const restored = harness(h.graph);
      try {
        await restored.engine.run(['final'], 1);
        assert.equal(restored.requests.filter(task => task.nodeId === 'g').length, 0, 'persisted generation metadata restores each item');
        for (const task of restored.requests) assert.deepEqual(task.imageRequest?.images, [`blob:upstream-${task.iteration!.itemId}`]);
        restored.edit(current => ({ ...current, nodes: current.nodes.map(node => node.id === 'g' ? { ...node, data: { ...node.data, quality: 'high' } } as AppNode : node) }));
        await restored.engine.run(['final'], 1);
        assert.equal(restored.requests.filter(task => task.nodeId === 'g').length, 3, 'changed model settings invalidate every historical item');
      } finally { restored.engine.dispose(); }
    } finally { h.engine.dispose(); }
  }
});

test('identical iterator inputs do not share model outputs between different items', async () => {
  const graph = iteratorGraph(['same', 'same']);
  graph.nodes.push(generator('final'));
  graph.edges.push(edge('iterator', 'final', 'prompt', 'text'), edge('g', 'final', 'image-0', 'result'));
  const h = harness(graph, async task => generatedAsset(`${task.nodeId}-${task.iteration!.itemId}`));
  try {
    await h.engine.run(['final'], 1);
    assert.equal(h.requests.filter(task => task.nodeId === 'g').length, 2);
    for (const task of h.requests.filter(task => task.nodeId === 'final')) assert.deepEqual(task.imageRequest?.images, [`blob:g-${task.iteration!.itemId}`]);
  } finally { h.engine.dispose(); }
});

test('dependent batch selections reject fixed upstream outputs before creating any tasks', () => {
  for (const order of [['g', 'final'], ['final', 'g']]) for (const kind of ['image', 'description']) {
    const graph = imageIteratorGraph();
    graph.nodes = graph.nodes.map(node => node.id !== 'g' ? node : kind === 'image'
      ? { ...generator('g'), data: { ...defaultSunburstSettings, imageInputs: 1, outputMode: 'fixed', results: [generatedAsset('old')] } } as AppNode
      : { ...describer('g'), data: { text: 'old description', model: 'deepseek-flash', instructions: 'describe', imageInputs: 1, outputMode: 'manual' } } as AppNode);
    if (kind === 'description') graph.edges = graph.edges.filter(item => item.targetHandle !== 'prompt');
    graph.nodes.push(generator('final'));
    if (kind === 'image') graph.edges.push(edge('prompt', 'final', 'prompt'), edge('g', 'final', 'image-0', 'result'));
    else graph.edges.push(edge('g', 'final', 'prompt'));
    const h = harness(graph);
    try {
      assert.throws(() => h.engine.run(order, 1), /只选择最终目标/);
      assert.equal(h.store.getSnapshot().length, 0);
      assert.equal(h.requests.length, 0);
    } finally { h.engine.dispose(); }
  }
});

test('overlapping iterator upstream failure only blocks the corresponding downstream item', async () => {
  const graph = iteratorGraph(['first', 'second']);
  graph.nodes.push(generator('final'));
  graph.edges.push(edge('iterator', 'final', 'prompt', 'text'), edge('g', 'final', 'image-0', 'result'));
  const pending: { resolve: (asset: FileAsset) => void; reject: (error: Error) => void }[] = [];
  const h = harness(graph, task => task.nodeId === 'g' ? new Promise((resolve, reject) => pending.push({ resolve, reject })) : Promise.resolve(generatedAsset('final')));
  try {
    const upstream = h.engine.run(['g'], 1);
    await until(() => pending.length === 2);
    const downstream = h.engine.run(['final'], 1);
    await new Promise(resolve => setTimeout(resolve, 5));
    pending[0].reject(new Error('first failed'));
    pending[1].resolve(generatedAsset('second'));
    await Promise.all([upstream, downstream]);
    const finals = h.requests.filter(task => task.nodeId === 'final');
    assert.equal(finals.length, 1);
    assert.equal(finals[0].iteration?.itemId, 'item-1');
    assert.deepEqual(finals[0].imageRequest?.images, ['blob:second']);
  } finally { h.engine.dispose(); }
});

test('shared upstream unrelated to the iterator can retry without inherited item metadata', async () => {
  const graph = iteratorGraph(['first', 'second']);
  graph.nodes.push(file('file'), describer('description'), textNode('prompt', 'combine'));
  graph.edges = [edge('file', 'description', 'image-0', 'file'), edge('description', 'prompt', 'variable-1'), edge('iterator', 'prompt', 'variable-2', 'text'), edge('prompt', 'g', 'prompt')];
  let fail = true;
  const h = harness(graph, async task => {
    if (task.nodeId === 'description') {
      if (fail) throw new Error('temporary failure');
      return 'shared description';
    }
    return generatedAsset(`generated-${task.iteration?.index}`);
  });
  try {
    await h.engine.run(['g'], 1);
    const shared = h.store.getSnapshot().filter(task => task.nodeId === 'description');
    assert.equal(shared.length, 1);
    assert.equal(shared[0].state, 'Failed');
    assert.equal(shared[0].iteration, undefined);
    fail = false;
    await h.engine.run([shared[0].nodeId], 1, shared[0].iteration);
    assert.equal(h.store.getSnapshot().slice(-1)[0]?.state, 'Done');
    await h.engine.run(['g'], 1);
    assert.equal(h.requests.filter(task => task.nodeId === 'description').length, 2, 'retried shared output is reused');
    assert.deepEqual(h.requests.filter(task => task.nodeId === 'g').map(task => task.iteration?.itemId), ['item-0', 'item-1']);
  } finally { h.engine.dispose(); }
});

test('shared upstream that depends on the iterator retains its own failed-item retry', async () => {
  const graph = iteratorGraph(['first', 'second']);
  graph.nodes.push(generator('final'));
  graph.edges.push(edge('iterator', 'final', 'prompt', 'text'), edge('g', 'final', 'image-0', 'result'));
  let fail = true;
  const h = harness(graph, async task => {
    if (task.nodeId === 'g' && task.iteration?.itemId === 'item-1' && fail) throw new Error('second failed');
    return generatedAsset(`${task.nodeId}-${task.iteration?.itemId}`);
  });
  try {
    await h.engine.run(['final'], 1);
    const failed = h.store.getSnapshot().find(task => task.nodeId === 'g' && task.state === 'Failed')!;
    assert.equal(failed.iteration?.itemId, 'item-1');
    fail = false;
    const count = h.requests.length;
    await h.engine.run([failed.nodeId], 1, failed.iteration);
    assert.equal(h.requests.length, count + 1);
    assert.equal(h.requests[count].imageRequest?.prompt, 'second');
    assert.equal(h.requests[count].iteration?.itemId, 'item-1');
    assert.equal(h.store.getSnapshot().slice(-1)[0]?.state, 'Done');
  } finally { h.engine.dispose(); }
});

test('all iterator items validate before requests, including empty lists, blank entries and oversized later prompts', () => {
  for (const values of [[], ['ok', ' '], ['ok', 'x'.repeat(32001)], Array(51).fill('ok')]) {
    const h = harness(iteratorGraph(values));
    assert.throws(() => h.engine.run(['g'], 1));
    assert.equal(h.requests.length, 0); assert.equal(h.store.getSnapshot().length, 0); h.engine.dispose();
  }
  const graph = iteratorGraph();
  graph.nodes.push(textNode('source', '["正常", 3]'));
  graph.edges.push(edge('source', 'iterator', 'input'));
  const h = harness(graph); assert.throws(() => h.engine.run(['g'], 1), /每一项/); assert.equal(h.requests.length, 0); h.engine.dispose();
});

test('JSON array input expands, multiline input stays one item, and original local list survives', async () => {
  const graph = iteratorGraph(); graph.nodes.push(textNode('source', '["红", "蓝"]')); graph.edges.push(edge('source', 'iterator', 'input'));
  const h = harness(graph); await h.engine.run(['g'], 1);
  assert.deepEqual(h.requests.map(task => task.imageRequest?.prompt), ['红', '蓝']);
  h.edit(current => ({ ...current, nodes: current.nodes.map(node => node.id === 'source' ? textNode('source', '第一行\n第二行') : node) }));
  await h.engine.run(['g'], 1);
  assert.equal(h.requests[2].imageRequest?.prompt, '第一行\n第二行');
  h.edit(current => ({ ...current, edges: current.edges.filter(edge => edge.target !== 'iterator') }));
  await h.engine.run(['g'], 1); assert.equal(h.requests.length, 6); h.engine.dispose();
});

test('one cancelled iterator task does not cancel siblings; failed item retries alone and edits invalidate its retry', async () => {
  const pending: { task: PreviewTask; signal: AbortSignal; resolve: (asset: FileAsset) => void; reject: (error: Error) => void }[] = [];
  const h = harness(iteratorGraph(), (task, signal) => new Promise((resolve, reject) => pending.push({ task, signal, resolve, reject })));
  const done = h.engine.run(['g'], 1); await until(() => pending.length === 3);
  h.store.update(tasks => tasks.map(task => task.iteration?.index === 0 ? { ...task, state: 'Cancelled' } : task));
  assert.ok(pending[0].signal.aborted); assert.ok(!pending[1].signal.aborted && !pending[2].signal.aborted);
  pending[0].resolve(generatedAsset('late')); pending[1].reject(new Error('one item failed')); pending[2].resolve(generatedAsset('success')); await done;
  const failed = h.store.getSnapshot().find(task => task.state === 'Failed')!;
  const retry = h.engine.run(['g'], 1, failed.iteration); await until(() => pending.length === 4);
  assert.equal(pending[3].task.imageRequest?.prompt, '像素猫'); pending[3].resolve(generatedAsset('retried')); await retry;
  const result = h.node('g'); assert.ok(isImageGeneratorNode(result)); assert.equal(result.data.results?.length, 2);
  h.edit(current => ({ ...current, nodes: current.nodes.map(node => node.id === 'iterator' ? iteratorGraph(['水彩猫', 'changed', '写实猫']).nodes[0] : node) }));
  assert.throws(() => h.engine.run(['g'], 1, failed.iteration), /修改或删除/);
  assert.equal(h.requests.length, 4); h.engine.dispose();
});

test('editing iterator cancels queued and active items; late responses cannot overwrite results', async () => {
  const pending: { signal: AbortSignal; resolve: (asset: FileAsset) => void }[] = [];
  const h = harness(iteratorGraph(Array.from({ length: 6 }, (_, index) => `item ${index}`)), (_task, signal) => new Promise(resolve => pending.push({ signal, resolve })));
  const done = h.engine.run(['g'], 1); await until(() => pending.length === 4);
  h.edit(current => ({ ...current, nodes: current.nodes.map(node => node.id === 'iterator' ? iteratorGraph(['changed']).nodes[0] : node) }));
  await done;
  assert.ok(pending.every(item => item.signal.aborted));
  pending.forEach(item => item.resolve(generatedAsset('late')));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.requests.length, 4); assert.ok(h.store.getSnapshot().every(task => task.state === 'Cancelled'));
  const result = h.node('g'); assert.ok(isImageGeneratorNode(result)); assert.equal(result.data.results?.length ?? 0, 0); h.engine.dispose();
});

function imageIteratorGraph(count = 3): ExecutionGraph {
  return {
    nodes: [
      { id: 'images', type: 'image-iterator', position: { x: 0, y: 0 }, data: { assets: Array.from({ length: count }, (_, index) => generatedAsset(`image-${index}`)), activeAssetId: 'image-1' } },
      textNode('prompt', 'edit this image'), generator('g'),
    ],
    edges: [edge('images', 'g', 'image-0', 'file'), edge('prompt', 'g', 'prompt')],
  };
}

test('Image Iterator submits one image per item to each model adapter and respects runs', async () => {
  for (const type of ['sunburst', 'nano-banana', 'ideogram', 'image-describer'] as const) {
    const graph = imageIteratorGraph();
    if (type === 'nano-banana') graph.nodes[2] = { id: 'g', type, position: { x: 0, y: 0 }, data: { ...defaultNanoBananaSettings, imageInputs: 1 } };
    if (type === 'ideogram') graph.nodes[2] = { id: 'g', type, position: { x: 0, y: 0 }, data: { ...defaultIdeogramSettings, imageInputs: 1 } };
    if (type === 'image-describer') { graph.nodes[2] = describer('g'); graph.edges.pop(); }
    const h = harness(graph);
    try {
      await h.engine.run(['g'], 2);
      assert.equal(h.requests.length, 6);
      for (const task of h.requests) {
        assert.equal(task.iteration?.kind, 'image');
        const images = task.ideogramRequest ? [task.ideogramRequest.image] : task.imageRequest?.images ?? task.nanoBananaRequest?.images ?? task.images;
        assert.deepEqual(images, [`blob:image-${task.iteration?.index}`]);
      }
      assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
      assert.equal(h.node('images').type, 'image-iterator');
    } finally { h.engine.dispose(); }
  }
});

test('Image Iterator passes through Router and local image processing with per-image outputs', async () => {
  const graph = imageIteratorGraph(2);
  graph.nodes.push({ id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} }, { id: 'invert', type: 'invert', position: { x: 0, y: 0 }, data: {} });
  graph.edges = [edge('images', 'router', 'input', 'file'), edge('router', 'invert', 'image', 'output'), edge('invert', 'g', 'image-0', 'result'), edge('prompt', 'g', 'prompt')];
  const h = harness(graph, undefined, async (_node, snapshot) => {
    const source = snapshot.nodes.find(node => node.id === 'images')!;
    assert.equal(source.type, 'file');
    const asset = (source.data as { assets: FileAsset[] }).assets[0];
    const { invertRevision } = await import('./invert.ts');
    return { result: generatedAsset(`inverted-${asset.id}`), outputRevision: invertRevision(asset.id) };
  });
  try {
    await h.engine.run(['g'], 1);
    assert.deepEqual(h.requests.map(task => task.imageRequest?.images).sort(), [['blob:inverted-image-0'], ['blob:inverted-image-1']]);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
  } finally { h.engine.dispose(); }
});

test('equal-content image iterator items retain separate local revisions while same-item consumers share work', async () => {
  const { invertRevision } = await import('./invert.ts');
  for (const sameUrl of [false, true]) {
    const graph = imageIteratorGraph(2);
    graph.nodes = mapAssets(graph.nodes, asset => ({ ...asset, url: `https://images.example/${sameUrl ? 'shared' : asset.id}.png` }));
    graph.nodes.push({ id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} }, { id: 'invert', type: 'invert', position: { x: 0, y: 0 }, data: {} }, generator('g2'));
    graph.edges = [edge('images', 'router', 'input', 'file'), edge('router', 'invert', 'image', 'output'), ...['g', 'g2'].flatMap(id => [edge('invert', id, 'image-0', 'result'), edge('prompt', id, 'prompt')])];
    const renders: string[] = [];
    const h = harness(graph, undefined, async (_node, snapshot) => {
      const asset = (snapshot.nodes.find(node => node.id === 'images')!.data as { assets: FileAsset[] }).assets[0];
      renders.push(asset.id);
      // Keep work in flight until all roots have traversed the shared branch.
      await new Promise(resolve => setTimeout(resolve, asset.id === 'image-0' ? 10 : 5));
      return { result: generatedAsset(`inverted-${asset.id}`), outputRevision: invertRevision(asset.id) };
    }, { snapshot: async assets => ({
      assets: new Map(assets.map(asset => [asset.url, { ...asset, url: `blob:snapshot-${asset.id}`, contentHash: 'same-content' }])), release: () => {},
    }) });
    try {
      await h.engine.run(['g', 'g2'], 2);
      assert.deepEqual(h.store.getSnapshot().map(task => task.state), Array(8).fill('Done'));
      assert.deepEqual(renders.sort(), ['image-0', 'image-1'], 'one render per input identity, shared by both target nodes');
      assert.equal(h.requests.length, 8);
      for (const task of h.requests) assert.deepEqual(task.imageRequest?.images, [`blob:inverted-${task.iteration!.itemId}`]);
    } finally { h.engine.dispose(); }
  }
});

test('local work unrelated to the iterator still shares across different text items', async () => {
  const { invertRevision } = await import('./invert.ts');
  const graph = iteratorGraph(['one', 'two', 'three']);
  graph.nodes.push(file('source'), { id: 'invert', type: 'invert', position: { x: 0, y: 0 }, data: {} });
  graph.edges.push(edge('source', 'invert', 'image', 'file'), edge('invert', 'g', 'image-0', 'result'));
  let renders = 0;
  const h = harness(graph, undefined, async () => {
    renders++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { result: generatedAsset('shared-inverted'), outputRevision: invertRevision('source') };
  });
  try {
    await h.engine.run(['g'], 1);
    assert.equal(renders, 1);
    assert.equal(h.requests.length, 3);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
    for (const task of h.requests) assert.deepEqual(task.imageRequest?.images, ['blob:shared-inverted']);
  } finally { h.engine.dispose(); }
});

test('overlapping image iterator runs reuse only the matching image even when completion is reversed', async () => {
  const graph = imageIteratorGraph(2);
  graph.nodes.push(generator('final'));
  graph.edges.push(edge('g', 'final', 'image-0', 'result'), edge('prompt', 'final', 'prompt'));
  const pending: { task: PreviewTask; resolve: (asset: FileAsset) => void }[] = [];
  const h = harness(graph, task => task.nodeId === 'g' ? new Promise(resolve => pending.push({ task, resolve })) : Promise.resolve(generatedAsset('final')));
  try {
    const first = h.engine.run(['g'], 1); await until(() => pending.length === 2);
    const second = h.engine.run(['final'], 1); await new Promise(resolve => setTimeout(resolve, 5));
    pending[1].resolve(generatedAsset('second-result'));
    await until(() => h.requests.some(task => task.nodeId === 'final'));
    const completed = h.requests.filter(task => task.nodeId === 'final');
    assert.equal(completed.length, 1);
    assert.equal(completed[0].iteration?.itemId, 'image-1');
    assert.deepEqual(completed[0].imageRequest?.images, ['blob:second-result']);
    pending[0].resolve(generatedAsset('first-result')); await Promise.all([first, second]);
    assert.equal(pending.length, 2);
    assert.deepEqual(h.requests.filter(task => task.nodeId === 'final').map(task => task.imageRequest?.images), [['blob:second-result'], ['blob:first-result']]);
  } finally { h.engine.dispose(); }
});

test('image failures retry only their own asset and reject replaced images', async () => {
  let fail = true;
  const h = harness(imageIteratorGraph(), async task => {
    if (fail && task.iteration?.itemId === 'image-1') throw new Error('one image failed');
    return generatedAsset(`result-${task.iteration?.itemId}`);
  });
  try {
    await h.engine.run(['g'], 1);
    const failed = h.store.getSnapshot().find(task => task.state === 'Failed')!;
    assert.equal(failed.iteration?.kind, 'image');
    fail = false; await h.engine.run(['g'], 1, failed.iteration);
    assert.equal(h.requests.length, 4);
    assert.deepEqual(h.requests[3].imageRequest?.images, ['blob:image-1']);
    h.edit(graph => ({ ...graph, nodes: graph.nodes.map(node => node.id === 'images' ? { ...node, data: { assets: [generatedAsset('replacement')] } } as AppNode : node) }));
    assert.throws(() => h.engine.run(['g'], 1, failed.iteration), /修改或删除/);
  } finally { h.engine.dispose(); }
});

test('remote image snapshots read only their own item and a broken item does not fail its siblings', async () => {
  const graph = imageIteratorGraph(2);
  graph.nodes = mapAssets(graph.nodes, asset => ({ ...asset, url: `https://images.example/${asset.id}.png` }));
  const snapshots: string[][] = [];
  const h = harness(graph, undefined, undefined, { snapshot: async assets => {
    snapshots.push(assets.map(asset => asset.id));
    assert.equal(assets.length, 1);
    if (assets[0].id === 'image-0') throw new Error('unreadable remote image');
    return { assets: new Map(assets.map(asset => [asset.url, { ...asset, url: `blob:snapshot-${asset.id}`, contentHash: asset.id }])), release: () => {} };
  } });
  try {
    await h.engine.run(['g'], 1);
    assert.deepEqual(snapshots.sort(), [['image-0'], ['image-1']]);
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.requests[0].imageRequest?.images, ['blob:snapshot-image-1']);
    assert.equal(h.store.getSnapshot().filter(task => task.state === 'Failed').length, 1);
    assert.equal(h.store.getSnapshot().filter(task => task.state === 'Done').length, 1);
  } finally { h.engine.dispose(); }
});

test('repeated remote URLs remain separate iterator items after snapshot mapping', async () => {
  const graph = imageIteratorGraph(2);
  graph.nodes = mapAssets(graph.nodes, asset => ({ ...asset, url: 'https://images.example/shared.png' }));
  const h = harness(graph, undefined, undefined, { snapshot: async assets => ({
    assets: new Map(assets.map(asset => [asset.url, { ...asset, url: `blob:snapshot-${asset.id}`, contentHash: 'same-content' }])), release: () => {},
  }) });
  try {
    await h.engine.run(['g'], 1);
    assert.equal(h.requests.length, 2);
    for (const task of h.requests) assert.deepEqual(task.imageRequest?.images, [`blob:snapshot-${task.iteration?.itemId}`]);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Done'));
  } finally { h.engine.dispose(); }
});

test('image cover browsing keeps active tasks alive; list edits cancel queued items and reject late results', async () => {
  const pending: { signal: AbortSignal; resolve: (asset: FileAsset) => void }[] = [];
  const h = harness(imageIteratorGraph(6), (_task, signal) => new Promise(resolve => pending.push({ signal, resolve })));
  try {
    const done = h.engine.run(['g'], 1); await until(() => pending.length === 4);
    h.edit(graph => ({ ...graph, nodes: graph.nodes.map(node => node.id === 'images' ? { ...node, data: { ...node.data, activeAssetId: 'image-5', viewMode: 'single' } } as AppNode : node) }));
    assert.ok(pending.every(item => !item.signal.aborted));
    h.edit(graph => ({ ...graph, nodes: graph.nodes.map(node => node.id === 'images' ? { ...node, data: { assets: [] } } as AppNode : node) }));
    await done;
    assert.ok(pending.every(item => item.signal.aborted));
    pending.forEach(item => item.resolve(generatedAsset('late'))); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(h.requests.length, 4);
    assert.ok(h.store.getSnapshot().every(task => task.state === 'Cancelled'));
    const model = h.node('g'); assert.ok(isImageGeneratorNode(model)); assert.equal(model.data.results?.length ?? 0, 0);
  } finally { h.engine.dispose(); }
});
