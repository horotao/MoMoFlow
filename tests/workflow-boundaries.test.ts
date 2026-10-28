import { WorkflowExecution, type ExecutionIO, type ExecutionStore } from '../src/nodes/workflowExecution';
import { readExecutionAsset } from '../src/nodes/executionAssets';
import { renderExecutionOutput } from '../src/nodes/executionLocal';
import { defaultPainterData, painterRevision } from '../src/nodes/painter';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { defaultIdeogramSettings } from '../src/nodes/ideogram';
import { assetResources, nodeAssetUrls } from '../src/nodes/assetResources';
import { prepareModel, requestSignature, type ExecutionGraph } from '../src/nodes/executionGraph';
import { isImageGeneratorNode, isPainterNode } from '../src/nodes/types';
import type { AppNode, FileAsset } from '../src/nodes/types';
import type { PreviewTask } from '../src/nodes/taskQueue';

const position = { x: 0, y: 0 };
const text = (id: string, value: string): AppNode => ({ id, type: 'text', position, data: { text: value } });
const describe = (id: string): AppNode => ({ id, type: 'image-describer', position, data: { text: '', instructions: 'Describe', model: 'deepseek-flash', imageInputs: 1 } });
const generate = (id: string): AppNode => ({ id, type: 'sunburst', position, data: { ...defaultSunburstSettings, imageInputs: 1 } });
const edge = (source: string, target: string, targetHandle: string, sourceHandle?: string) => ({ id: `${source}-${target}-${targetHandle}`, source, target, targetHandle, sourceHandle });
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

function harness(initial: ExecutionGraph, sample: FileAsset, overrides: Partial<ExecutionIO> = {}) {
  let graph = initial, tasks: PreviewTask[] = [];
  const listeners = new Set<() => void>(), requests: PreviewTask[] = [];
  const store: ExecutionStore = { getSnapshot: () => tasks, update: change => { tasks = change(tasks); listeners.forEach(listener => listener()); }, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  const engine = new WorkflowExecution(graph, store, {
    patch: (id, patch) => { graph = { ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...patch } } as AppNode : node) }; },
    retain: current => assetResources.retain(nodeAssetUrls(current.nodes)),
    discard: assets => assetResources.discard(assets.map(asset => asset.url)),
    snapshot: async () => ({ assets: new Map(), release: () => {} }),
    verify: async (assets, signal) => { for (const asset of assets) await readExecutionAsset(asset.url, signal); },
    local: renderExecutionOutput,
    ...overrides,
    request: async (task, signal) => { requests.push(task); return overrides.request ? overrides.request(task, signal) : task.imageRequest || task.ideogramRequest ? { ...sample, id: crypto.randomUUID() } : 'Description'; },
  });
  return { engine, requests, store, get graph() { return graph; } };
}

export async function runBoundaryChecks(sample: FileAsset, check: (value: unknown, message: string) => void) {
  const file: AppNode = { id: 'a', type: 'file', position, data: { assets: [sample] } };
  const graph: ExecutionGraph = { nodes: [file, describe('d'), generate('g1'), generate('g2')], edges: [edge('a', 'd', 'image-0', 'file'), edge('d', 'g1', 'prompt'), edge('d', 'g2', 'prompt')] };
  const remote = { ...sample, url: 'https://example.invalid/changing-image.png' };
  graph.nodes[0] = { ...file, data: { assets: [remote] } } as AppNode;
  let revision = 0;
  const pending: ((result: string) => void)[] = [];
  const concurrent = harness(graph, sample, {
    snapshot: async () => ({ assets: new Map([[remote.url, { ...sample, contentHash: `revision-${++revision}` }]]), release: () => {} }),
    request: async task => task.nodeId === 'd' ? new Promise(resolve => pending.push(resolve)) : { ...sample, id: crypto.randomUUID() },
    verify: async () => {},
  });
  const first = concurrent.engine.run(['g1'], 1), second = concurrent.engine.run(['g2'], 1); await flush();
  check(pending.length === 2, 'Concurrent snapshots produce two distinct upstream requests');
  pending[0]('Version A'); pending[1]('Version B'); await Promise.all([first, second]);
  check(concurrent.requests.find(task => task.nodeId === 'g1')?.imageRequest?.prompt === 'Version A' && concurrent.requests.find(task => task.nodeId === 'g2')?.imageRequest?.prompt === 'Version B', 'Concurrent downstream runs retain their own upstream text');
  concurrent.engine.dispose();

  const invalid = harness({ nodes: [text('p', 'paint'), text('empty', ''), generate('up'), generate('target')], edges: [edge('p', 'up', 'prompt'), edge('up', 'target', 'image-0', 'result'), edge('empty', 'target', 'prompt')] }, sample);
  let error = ''; try { await invalid.engine.run(['target'], 1); } catch (problem) { error = String(problem); }
  check(error.includes('非空提示词') && invalid.requests.length === 0 && invalid.store.getSnapshot().length === 0, 'Known empty target prompt blocks every upstream model submission');
  invalid.engine.dispose();

  let attempts = 0;
  const repeated = harness({ nodes: [file, describe('d'), generate('g')], edges: [edge('a', 'd', 'image-0', 'file'), edge('d', 'g', 'prompt')] }, sample, {
    request: async task => {
      if (!task.imageRequest) return 'Paint';
      if (attempts++ === 0) throw new Error('First attempt failed');
      return { ...sample, id: crypto.randomUUID() };
    },
  });
  await repeated.engine.run(['g'], 3);
  check(repeated.requests.map(task => task.nodeId).join(',') === 'd,g,g,g' && repeated.store.getSnapshot().filter(task => task.nodeId === 'g').map(task => task.state).join(',') === 'Failed,Done,Done', 'Runs = 3 continues the two remaining requests after one failure, with upstream prepared once');
  repeated.engine.dispose();

  const pixels = document.createElement('canvas'); pixels.width = 64; pixels.height = 48;
  const context = pixels.getContext('2d')!;
  const variants: Blob[] = [];
  for (const color of ['#ff0000', '#0000ff']) {
    context.fillStyle = color; context.fillRect(0, 0, 64, 48);
    variants.push(await new Promise<Blob>(resolve => pixels.toBlob(blob => resolve(blob!), 'image/png')));
  }
  const generated = generate('up');
  const remoteResult = { ...sample, id: 'remote-generated', url: 'https://example.invalid/generated.png' };
  const remoteGraph: ExecutionGraph = { nodes: [text('p', 'paint'), generated, { id: 'resize', type: 'resize', position, data: { settings: { width: 32, height: 24, lockAspectRatio: true } } }, describe('d')], edges: [edge('p', 'up', 'prompt'), edge('up', 'resize', 'image', 'result'), edge('resize', 'd', 'image-0', 'result')] };
  if (!isImageGeneratorNode(generated)) throw new Error('Missing generator');
  generated.data.results = [{ ...remoteResult, generation: { version: 1, inputSignature: requestSignature(prepareModel(remoteGraph, 'up'), remoteGraph), outputSignature: remoteResult.id } }];
  generated.data.activeResultId = remoteResult.id;
  let snapshots = 0, renders = 0;
  const exportedUrls: string[] = [];
  const remoteDerived = harness(remoteGraph, sample, {
    snapshot: async (assets, signal) => {
      const url = assetResources.create(variants[Math.min(snapshots++, 1)]);
      const release = assetResources.retain([url]);
      const { contentHash } = await readExecutionAsset(url, signal, true);
      return { assets: new Map(assets.map(asset => [asset.url, { ...asset, url, contentHash }])), release: () => { release(); assetResources.discard([url]); } };
    },
    local: async (...args) => {
      renders++;
      const patch = await renderExecutionOutput(...args);
      for (const value of Object.values(patch)) if (value && typeof value === 'object' && 'url' in value) exportedUrls.push(String(value.url));
      return patch;
    },
  });
  try {
    const observed: number[][] = [];
    for (let index = 0; index < 3; index++) {
      await remoteDerived.engine.run(['d'], 1);
      const url = remoteDerived.requests[index]?.images?.[0];
      if (!url) throw new Error('Missing derived image request');
      const { blob } = await readExecutionAsset(url, new AbortController().signal);
      const bitmap = await createImageBitmap(blob);
      context.clearRect(0, 0, 64, 48); context.drawImage(bitmap, 0, 0); bitmap.close();
      observed.push([...context.getImageData(0, 0, 1, 1).data]);
    }
    check(observed[0].join(',') === '255,0,0,255' && observed[1].join(',') === '0,0,255,255', 'Changed remote generated bytes rebuild Resize and reach downstream as new pixels');
    check(snapshots === 3 && renders === 2 && remoteDerived.requests[1].images?.[0] === remoteDerived.requests[2].images?.[0], 'Equal remote content with a new Blob URL reuses the derived image');
    check(remoteDerived.requests.every(task => task.nodeId === 'd') && remoteDerived.store.getSnapshot().every(task => task.state === 'Done'), 'Refreshing remote derived pixels does not rerun the image model');
  } finally { remoteDerived.engine.dispose(); assetResources.discard(exportedUrls); }

  // Identical remote bytes still represent independent Image Iterator assets.
  // Exercise real Invert PNG exports and sharing across two downstream models.
  const iteratorGraph: ExecutionGraph = {
    nodes: [
      { id: 'images', type: 'image-iterator', position, data: { assets: ['one', 'two'].map(id => ({ ...sample, id, url: `https://example.invalid/${id}.png` })) } },
      { id: 'router', type: 'router', position, data: {} }, { id: 'invert', type: 'invert', position, data: {} },
      text('p', 'edit'), generate('g1'), generate('g2'),
    ],
    edges: [edge('images', 'router', 'input', 'file'), edge('router', 'invert', 'image', 'output'), ...['g1', 'g2'].flatMap(id => [edge('p', id, 'prompt'), edge('invert', id, 'image-0', 'result')])],
  };
  const iteratorRenders: string[] = [], iteratorOutputs: string[] = [];
  let releaseExports!: () => void;
  const exportGate = new Promise<void>(resolve => { releaseExports = resolve; });
  const iterated = harness(iteratorGraph, sample, {
    snapshot: async (assets, signal) => {
      const url = assetResources.create(variants[0]);
      const release = assetResources.retain([url]);
      const { contentHash } = await readExecutionAsset(url, signal, true);
      return { assets: new Map(assets.map(asset => [asset.url, { ...asset, url, contentHash }])), release: () => { release(); assetResources.discard([url]); } };
    },
    local: async (...args) => {
      const source = args[1].nodes.find(node => node.id === 'images')!;
      iteratorRenders.push((source.data as { assets: FileAsset[] }).assets[0].id);
      await exportGate;
      const patch = await renderExecutionOutput(...args);
      for (const value of Object.values(patch)) if (value && typeof value === 'object' && 'url' in value) iteratorOutputs.push(String(value.url));
      return patch;
    },
  });
  try {
    const done = iterated.engine.run(['g1', 'g2'], 2);
    for (let index = 0; index < 100 && iteratorRenders.length < 2; index++) await new Promise(resolve => setTimeout(resolve, 10));
    check(iteratorRenders.slice().sort().join(',') === 'one,two', 'Equal-content image items render separately while same-item model branches share Invert');
    releaseExports(); await done;
    check(iterated.requests.length === 8 && iterated.store.getSnapshot().every(task => task.state === 'Done'), 'Two image items × two model branches × two runs all complete');
    const outputByItem = new Map<string, Set<string>>();
    for (const task of iterated.requests) {
      const item = task.iteration!.itemId;
      const urls = outputByItem.get(item) ?? new Set<string>(); outputByItem.set(item, urls);
      urls.add(task.imageRequest!.images[0]);
    }
    check(outputByItem.size === 2 && [...outputByItem.values()].every(urls => urls.size === 1) && new Set([...outputByItem.values()].flatMap(urls => [...urls])).size === 2, 'Every model request retains its own item output; repeats reuse that output');
    for (const urls of outputByItem.values()) {
      const { blob } = await readExecutionAsset([...urls][0], new AbortController().signal);
      const bitmap = await createImageBitmap(blob);
      context.clearRect(0, 0, 64, 48); context.drawImage(bitmap, 0, 0); bitmap.close();
      check([...context.getImageData(0, 0, 1, 1).data].join(',') === '0,255,255,255', 'Each iterated Invert output contains the expected cyan pixels');
    }
  } finally { releaseExports(); iterated.engine.dispose(); assetResources.discard(iteratorOutputs); }

  // Native Painter exports, including the actual alpha PNG consumed by adapters.
  for (const type of ['sunburst', 'ideogram'] as const) for (const expired of [false, true]) {
    const data = { ...defaultPainterData, baseImage: sample, width: 64, height: 48 };
    const expiredUrl = URL.createObjectURL(new Blob(['expired'])); URL.revokeObjectURL(expiredUrl);
    const painter: AppNode = { id: 'painter', type: 'painter', position, data: { ...data, mask: sample, ...(expired ? { alphaMask: { ...sample, url: expiredUrl } } : {}), outputRevision: painterRevision(data, sample.id) } };
    const target: AppNode = type === 'sunburst' ? generate('g') : { id: 'g', type, position, data: { ...defaultIdeogramSettings, imageInputs: 1 } };
    const nodes: AppNode[] = [file, text('p', 'edit'), painter, { id: 'r', type: 'router', position, data: {} }, target];
    let exports = 0;
    const outputUrls: string[] = [];
    const h = harness({ nodes, edges: [edge('p', 'g', 'prompt'), edge('a', 'g', 'image-0', 'file'), edge('painter', 'r', 'input', 'mask'), edge('r', 'g', 'mask', 'output')] }, sample, {
      local: async (...args) => { exports++; const patch = await renderExecutionOutput(...args); for (const value of Object.values(patch)) if (value && typeof value === 'object' && 'url' in value) outputUrls.push(String(value.url)); return patch; },
    });
    await h.engine.run(['g'], 1);
    const mask = (h.requests[0]?.imageRequest ?? h.requests[0]?.ideogramRequest)?.mask;
    const alpha = h.graph.nodes.find(node => node.id === 'painter')!;
    check(exports === 1 && isPainterNode(alpha) && mask === alpha.data.alphaMask?.url && mask !== expiredUrl && Boolean(mask) && h.store.getSnapshot().every(task => task.state === 'Done'), `${type}: ${expired ? 'expired' : 'missing'} Painter alpha mask is rebuilt through Router before model preparation`);
    h.engine.dispose(); assetResources.discard(outputUrls);
  }

  // Observe request timer registration without waiting minutes or touching API.
  const originalTimeout = window.setTimeout;
  const requestTimers: (() => void)[] = [];
  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (timeout === 130000 && typeof handler === 'function') requestTimers.push(() => handler(...args));
    return originalTimeout(handler, timeout, ...args);
  }) as typeof window.setTimeout;
  const slots: { task: PreviewTask; resolve: (result: string | FileAsset) => void }[] = [];
  const queued = harness({ nodes: [file, text('p', 'paint'), ...['q1', 'q2', 'q3', 'q4'].map(generate), describe('waiting')], edges: [...['q1', 'q2', 'q3', 'q4'].map(id => edge('p', id, 'prompt')), edge('a', 'waiting', 'image-0', 'file')] }, sample, { verify: async () => {}, request: (task) => new Promise(resolve => slots.push({ task, resolve })) });
  try {
    const busy = queued.engine.run(['q1', 'q2', 'q3', 'q4'], 1); await flush();
    const waiting = queued.engine.run(['waiting'], 1); await flush();
    check(slots.length === 4 && requestTimers.length === 0 && queued.store.getSnapshot().find(task => task.nodeId === 'waiting')?.state === 'Queued', 'Queued describer has no running request timeout');
    slots[0].resolve({ ...sample, id: 'q1' }); await flush();
    check(slots.length === 5 && requestTimers.length === 1, 'Request timeout starts only after a model slot becomes available');
    requestTimers[0](); await waiting;
    for (const slot of slots.slice(1, 4)) slot.resolve({ ...sample, id: slot.task.nodeId! });
    await busy;
    check(queued.store.getSnapshot().find(task => task.nodeId === 'waiting')?.error?.includes('请求超时'), 'A genuinely timed-out request ends without automatic retry');
  } finally { queued.engine.dispose(); window.setTimeout = originalTimeout; }

  const originalFetch = window.fetch;
  try {
    for (const phase of ['headers', 'body']) {
      let signal: AbortSignal | null | undefined;
      window.fetch = async (_input, init) => { signal = init?.signal; return phase === 'headers' ? new Promise<Response>(() => {}) : { ok: true, blob: () => new Promise<Blob>(() => {}) } as Response; };
      let problem = '';
      try { await readExecutionAsset('https://example.invalid/stall', new AbortController().signal, true, 20); } catch (error) { problem = String(error); }
      check(problem.includes('读取图片超时') && signal?.aborted, `Stalled asset ${phase} ends within its deadline and aborts transport`);
    }
  } finally { window.fetch = originalFetch; }
}
