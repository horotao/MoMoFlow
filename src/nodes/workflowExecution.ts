import { routedEdges } from './router.ts';
import { grokImageModel } from './grokImage.ts';
import { annotationOutput, storedAnnotationResult } from './annotationGraph.ts';
import { seedreamModel } from './seedream.ts';
import { nanoBananaModel } from './nanoBanana.ts';
import { klingImageModel } from './klingImage.ts';
import { sunburstModelForProvider } from './sunburst.ts';
import { composerExecutionNode, composerModelId } from './imageComposerSettings.ts';
import type { AppNode, FileAsset } from './types';
import type { PreviewTask } from './taskQueue';
import { imageTaskRequest, isActiveTask, modelTaskLabel } from './taskQueue.ts';
import { ModelRequestCancelled, ModelRequestTimeout } from './modelRequestError.ts';
import { isImageGeneratorNode, isNodeLocked } from './types.ts';
import { executionInputs, executionSourceAssets, fixedOutput, graphGuard, isModelNode, nodeProblem, preflight, prepareModel, requestSignature, reusable, selectedResult, stableSignature, type ExecutionGraph } from './executionGraph.ts';
import { effectiveSunburstSettings, imageOutput } from './sunburstRun.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';

export type ExecutionStore = { getSnapshot: () => PreviewTask[]; update: (change: (tasks: PreviewTask[]) => PreviewTask[]) => void; subscribe: (listener: () => void) => () => void };
export type ExecutionIO = {
  request: (task: PreviewTask, signal: AbortSignal) => Promise<FileAsset | FileAsset[]>;
  snapshot: (assets: FileAsset[], signal: AbortSignal) => Promise<{ assets: Map<string, FileAsset>; release: () => void }>;
  verify: (assets: FileAsset[], signal: AbortSignal) => Promise<void>;
  retain: (graph: ExecutionGraph) => () => void;
  discard: (assets: FileAsset[]) => void;
  patch: (id: string, data: Record<string, unknown>, publishImmediately?: boolean) => void;
  onImageGenerated?: (prompt: string) => Promise<void>;
};
type Root = { refreshImages: ReadonlySet<string>; existingImagesOnly?: boolean; id: string; sourceId?: string; batchId: string; controller: AbortController; guard: string; tasks: string[]; memo: Map<string, Promise<void>>; remote: Map<string, FileAsset>; outputs: Map<string, Record<string, unknown>>; releases: (() => void)[]; done?: Promise<void> };
type Flight = { nodeId: string; tasks: string[]; controller: AbortController; consumers: Set<AbortSignal>; promise: Promise<Record<string, unknown>> };
type ModelAttempt = { prepared: PreviewTask; signature: string };
type RunOptions = {
  existingImagesOnly?: boolean;
  additions?: { sourceId: string; graph: ExecutionGraph; publish: () => void };
};

function describeAttempt(task: PreviewTask, prepared: PreviewTask): PreviewTask {
  const described = { ...task, model: prepared.model, seedreamGroup: prepared.seedreamGroup };
  return { ...described, label: modelTaskLabel(described) };
}
export function aborted(signal: AbortSignal) { if (signal.aborted) throw new Error(typeof signal.reason === 'string' ? signal.reason : '运行已取消。'); }
export function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error(String(signal.reason || '运行已取消。')));
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error(String(signal.reason || '运行已取消。')));
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

// Every consumer keeps the exact accepted output, even if another root commits
// a different result to the same canvas node before this consumer resumes.
function modelOutput(node: AppNode): Record<string, unknown> {

  const result = selectedResult(node);
  return { results: result ? [result] : [], activeResultId: result?.id, outputMode: 'outputMode' in node.data ? node.data.outputMode : undefined };
}

export class WorkflowExecution {
  private graph: ExecutionGraph;
  private roots = new Set<Root>();
  private flights = new Map<string, Flight>();
  private stopped = false;
  private modelSlots = 0;
  private slotWaiters = new Set<() => void>();
  private unsubscribe: () => void;
  private store: ExecutionStore;
  private io: ExecutionIO;
  constructor(graph: ExecutionGraph, store: ExecutionStore, io: ExecutionIO) {
    this.store = store; this.io = io;
    this.graph = { ...graph, edges: routedEdges(graph.edges) };
    this.unsubscribe = store.subscribe(() => {
      for (const root of this.roots) {
        if (!root.tasks.some(id => this.active(id))) root.controller.abort('运行已取消。');
      }
      for (const flight of this.flights.values()) if (!flight.tasks.some(id => this.active(id))) flight.controller.abort('上游任务已取消。');
    });
  }
  private active(id: string) { return this.store.getSnapshot().some(task => task.id === id && isActiveTask(task)); }
  private state(id: string, patch: Partial<PreviewTask>) {
    this.store.update(tasks => tasks.map(task => task.id === id && isActiveTask(task) ? { ...task, ...patch } : task));
  }
  observe(snapshot: ExecutionGraph) {
    const graph = { ...snapshot, edges: routedEdges(snapshot.edges) };
    this.graph = graph;
    for (const root of this.roots) {
      try { if (graphGuard({ ...graph, refreshImages: root.refreshImages }, root.id, true) !== root.guard) root.controller.abort('输入或输出选择已变化，请重新运行。'); }
      catch { root.controller.abort('依赖节点已删除或连接失效。'); }
    }
  }
  private commit(id: string, data: Record<string, unknown>, publishImmediately: boolean) {
    this.graph = { ...this.graph, nodes: this.graph.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...data } } as AppNode : node) };
    // Only an engine-owned successful commit advances edit guards. Cancelled
    // roots stay cancelled, even when undo later restores the same input hash.
    for (const root of this.roots) if (!root.controller.signal.aborted) root.guard = graphGuard({ ...this.graph, refreshImages: root.refreshImages }, root.id, true);
    this.io.patch(id, data, publishImmediately);
  }
  private graphFor(root: Root): ExecutionGraph {
    const graph = { ...this.graph, refreshImages: root.refreshImages, nodes: this.graph.nodes.map(node => {
      const output = root.outputs.get(node.id);
      if (!output) return node;
      const results = output.results as FileAsset[] | undefined;
      const data: Record<string, unknown> = { ...node.data, ...output };
      if (isImageGeneratorNode(node) && results) {
        data.results = [...(node.data.results ?? []).filter(asset => !results.some(result => result.id === asset.id)), ...results];
      }
      return { ...node, data } as AppNode;
    }) };
    if (!root.remote.size) return graph;
    // Snapshots may identify two different remote URLs as the same image.
    // Keep reference ports already excluded during dependency preparation out
    // of that merged request.
    const ignored = new Set(graph.nodes.filter(node => node.type === 'seedream'
      && !executionInputs(node, undefined, graph).some(edge => /^image-\d+$/.test(edge.targetHandle ?? ''))).map(node => node.id));
    const edges = graph.edges.filter(edge => !ignored.has(edge.target) || !/^image-\d+$/.test(edge.targetHandle ?? ''));
    return { ...graph, edges, nodes: mapAssets(graph.nodes, asset => {
      const snapshot = root.remote.get(asset.url);
      // A stored annotation belongs to an asset ID even if another node shares its URL.
      return snapshot ? { ...asset, url: snapshot.url, contentHash: snapshot.contentHash ?? asset.contentHash } : asset;
    }) };
  }
  run(ids: string[], runs: number, seedreamGroupId?: string, { existingImagesOnly = false, additions }: RunOptions = {}) {
    if (this.stopped) throw new Error('执行器已关闭。');
    const requested = new Set(ids);
    if (!requested.size) return Promise.resolve(false);
    const targets = [...new Set([...requested, ...(additions?.graph.nodes.map(node => node.id) ?? [])])];
    const running = new Set([...this.roots].map(root => root.id).concat([...this.flights.values()].map(flight => flight.nodeId)));
    const sourceId = additions?.sourceId;
    if (targets.some(id => running.has(id)) || [...this.roots].some(root => root.sourceId && requested.has(root.sourceId))) {
      throw new Error('选中节点已有运行中的任务，请等待完成后再运行。');
    }
    const graph = additions ? { nodes: [...this.graph.nodes, ...additions.graph.nodes], edges: routedEdges([...this.graph.edges, ...additions.graph.edges]) } : this.graph;
    const refreshImages = new Set(graph.nodes.filter(node => isImageGeneratorNode(node)
      && (!selectedResult(node) || targets.includes(node.id) || running.has(node.id))).map(node => node.id));
    const plannedGraph = { ...graph, refreshImages, existingImagesOnly };
    preflight(plannedGraph, targets, runs);
    const batchId = crypto.randomUUID();
    const planned = targets.map(id => {
      const node = graph.nodes.find(item => item.id === id)!;
      const firstTask = this.placeholder(node, batchId, Boolean(additions));
      const tasks = firstTask.model === klingImageModel ? [firstTask]
        : [firstTask, ...Array.from({ length: runs - 1 }, () => this.placeholder(node, batchId, Boolean(additions)))];
      const root: Root = {
        refreshImages, existingImagesOnly, id, sourceId, batchId, tasks: tasks.map(task => task.id),
        controller: new AbortController(), guard: graphGuard(plannedGraph, id, true),
        memo: new Map(), remote: new Map(), outputs: new Map(), releases: [],
      };
      return { root, tasks };
    });
    if (additions) {
      this.graph = graph;
      additions.publish();
    }
    const roots = planned.map(({ root }) => root);
    roots.forEach(root => this.roots.add(root));
    this.store.update(current => [...current, ...planned.flatMap(({ tasks }) => tasks)]);
    for (const root of roots) {
      // Deferral lets every selected target register before dependency traversal.
      root.done = Promise.resolve().then(async () => {
        const signal = root.controller.signal;
        const release = this.io.retain(this.graph);
        try {
          const initialGraph = this.graphFor(root);
          const sources = executionSourceAssets(initialGraph, root.id, targets);
          // Existing generated images are required assets. Check them before any
          // upstream work, and never recover a missing image with a paid request.
          for (const source of initialGraph.nodes) {
            const result = selectedResult(source);
            if (!targets.includes(source.id) && fixedOutput(source, initialGraph) && result && sources.some(asset => asset.url === result.url)) {
              await this.verifyImageResult(root, source);
            }
          }
          await this.snapshotAssets(root, sources);
          aborted(signal);
          const node = this.graph.nodes.find(item => item.id === root.id)!;
          await Promise.all(executionInputs(node, undefined, this.graphFor(root)).map(edge => this.ensure(root, edge.source, edge.sourceHandle)));
          aborted(signal);
          const graph = this.graphFor(root);
          const prepared = prepareModel(graph, root.id, runs)
            .filter(task => !seedreamGroupId || task.seedreamGroup?.imageId === seedreamGroupId);
          if (!prepared.length) nodeProblem(node, '原图标注已变化，请检查提示词后重新运行。');
          const attempts = prepared.map(task => ({ prepared: task, signature: requestSignature(task, graph) }));
          const scheduled = this.expandRootTasks(root, attempts);
          await this.executeAttempts(root.id, scheduled, signal, output => this.pinOutput(root, root.id, output), existingImagesOnly);
        } catch (error) {
          const message = error instanceof Error ? error.message : '工作流执行失败。';
          const state = signal.aborted || error instanceof ModelRequestCancelled ? 'Cancelled' : error instanceof ModelRequestTimeout ? 'TimedOut' : 'Failed';
          for (const taskId of root.tasks) this.state(taskId, { state, error: message, notice: undefined });
        } finally {
          root.controller.abort('本次运行已结束。');
          this.roots.delete(root); root.releases.forEach(release => release()); release();
        }
      });
    }
    // A connected consumer waits for the output of the node it is wired to.
    const requestedRoots = roots.filter(root => requested.has(root.id));
    return Promise.all(requestedRoots.map(root => root.done)).then(() => requestedRoots.every(root => root.outputs.has(root.id)));
  }
  private placeholder(node: AppNode, batchId: string, distinguishVariants = false): PreviewTask {
    if (!isModelNode(node)) nodeProblem(node, '节点已下线或不能运行。');
    const selected = composerExecutionNode(node);
    let model: string;
    let imageVariant: PreviewTask['imageVariant'];
    if (selected.type === 'sunburst' && [klingImageModel, grokImageModel].includes(composerModelId(selected.data))) {
      model = composerModelId(selected.data);
    } else if (selected.type === 'sunburst') {
      const settings = effectiveSunburstSettings(selected);
      model = sunburstModelForProvider(settings.provider, settings.variant, settings.channelModel);
      if (distinguishVariants && model === 'gpt-image-2.6-ext') imageVariant = settings.variant;
    } else {
      model = selected.type === 'seedream' ? seedreamModel : selected.data.model ?? nanoBananaModel;
    }
    return { id: crypto.randomUUID(), nodeId: node.id, batchId, label: modelTaskLabel({ model, imageVariant }), model, imageVariant, createdAt: Date.now(), state: 'Queued', progress: 0, started: 0, notice: '等待上游' };
  }
  private expandRootTasks(root: Root, attempts: ModelAttempt[]) {
    const current = this.store.getSnapshot();
    const added: PreviewTask[] = [], updated = new Map<string, PreviewTask>();
    const scheduled = root.tasks.flatMap(id => {
      const task = current.find(item => item.id === id);
      if (!task || !isActiveTask(task)) return [];
      return attempts.map((attempt, index) => {
        const queued = describeAttempt(index ? { ...task, id: crypto.randomUUID() } : task, attempt.prepared);
        if (index) added.push(queued);
        else if (queued !== task) updated.set(id, queued);
        return { ...attempt, taskId: queued.id };
      });
    });
    root.tasks.push(...added.map(task => task.id));
    if (added.length || updated.size) this.store.update(tasks => [...tasks.map(task => updated.get(task.id) ?? task), ...added]);
    return scheduled;
  }
  private ensure(root: Root, id: string, handle?: string | null): Promise<void> {
    const key = `${id}:${handle ?? ''}`;
    const existing = root.memo.get(key);
    if (existing) return existing;
    const promise = this.ensureOutput(root, id, handle);
    root.memo.set(key, promise);
    return promise;
  }
  private async ensureOutput(root: Root, id: string, handle?: string | null) {
    const signal = root.controller.signal;
    aborted(signal);
    let graph = this.graphFor(root);
    let node = graph.nodes.find(item => item.id === id)!;
    const annotation = storedAnnotationResult(node, handle, graph.nodes, graph.edges);
    if (annotation) { await this.verifyOutput(root, [annotation.image]); return; }
    // A running iterator target has one root per item. Shared, non-iterated
    // upstreams can serve every item; iterated upstreams must match its identity.
    const selected = [...this.roots].find(other => other !== root && other.id === id);
    if (selected?.done) {
      await withAbort(selected.done, signal);
      if (!selected.tasks.every(taskId => this.store.getSnapshot().find(task => task.id === taskId)?.state === 'Done')) nodeProblem(node, '上游运行失败或已取消。');
      const output = selected.outputs.get(id);
      if (!output) nodeProblem(node, '上游没有提供本次运行结果。');
      this.pinOutput(root, id, output);
      return;
    }
    if (fixedOutput(node, graph)) {
      if (isImageGeneratorNode(node)) await this.verifyImageResult(root, node);
      this.pinOutput(root, id, modelOutput(node));
      return;
    }
    if (root.existingImagesOnly && isModelNode(node)) nodeProblem(node, '参考图片尚未就绪。');
    await Promise.all(executionInputs(node, handle, graph).map(edge => this.ensure(root, edge.source, edge.sourceHandle)));
    aborted(signal);
    graph = this.graphFor(root); node = graph.nodes.find(item => item.id === id)!;
    if (node.type === 'file' && handle && handle !== 'file') {
      const annotation = annotationOutput(node, handle, graph.nodes, graph.edges);
      if (!annotation) nodeProblem(node, '标注或原图已变化，请重新运行。');
      await this.verifyOutput(root, [annotation.image]);
      return;
    }
    if (isModelNode(node)) {
      // Locked nodes may supply a proven result, but may never be executed.
      const unlocked = { ...graph, nodes: graph.nodes.map(item => item.id === id ? { ...item, data: { ...item.data, locked: false } } as AppNode : item) };
      const attempts = prepareModel(unlocked, id).map(prepared => ({ prepared, signature: requestSignature(prepared, graph) }));
      const cached = attempts.length === 1 && reusable(node, attempts[0].signature) ? node : undefined;
      if (cached) {
        try {
          await this.verifyOutput(root, isImageGeneratorNode(cached) ? [selectedResult(cached)!] : []);
          this.pinOutput(root, id, modelOutput(cached));
          for (const taskId of root.tasks) this.state(taskId, { notice: '已复用上游，准备剩余输入' });
          return;
        } catch { aborted(signal); /* Missing cached media needs regeneration. */ }
      }
      if (isNodeLocked(node)) nodeProblem(node, '已锁定且结果需要更新，请先解锁。');
      await this.shared(root, id, attempts);
    } else if (node.type === 'file') {
      await this.verifyOutput(root, imageOutput(node, handle));
    }
  }
  private async verifyImageResult(root: Root, node: AppNode) {
    try { await this.verifyOutput(root, [selectedResult(node)!]); }
    catch {
      aborted(root.controller.signal);
      nodeProblem(node, '已有图片无法读取，请恢复图片或主动运行该生图节点重新生成。');
    }
  }
  private async snapshotAssets(root: Root, assets: FileAsset[]) {
    const originals = assets.filter(asset => /^https?:/.test(asset.url) && !root.remote.has(asset.url));
    if (!originals.length) return;
    const snapshot = await this.io.snapshot(originals, root.controller.signal);
    root.releases.push(snapshot.release);
    for (const [url, asset] of snapshot.assets) root.remote.set(url, asset);
    aborted(root.controller.signal);
  }
  private async verifyOutput(root: Root, assets: FileAsset[]) {
    await this.snapshotAssets(root, assets);
    await this.io.verify(assets.map(asset => root.remote.get(asset.url) ?? asset), root.controller.signal);
  }
  private pinOutput(root: Root, id: string, patch: Record<string, unknown>) {
    root.outputs.set(id, patch);
    root.releases.push(this.io.retain(this.graphFor(root)));
  }
  private async shared(root: Root, id: string, attempts: ModelAttempt[]) {
    const key = stableSignature([id, attempts.map(attempt => attempt.signature)]);
    let flight = this.flights.get(key);
    if (!flight || flight.controller.signal.aborted) {
      const node = this.graph.nodes.find(item => item.id === id)!;
      const tasks = attempts.map(attempt => describeAttempt(this.placeholder(node, root.batchId), attempt.prepared));
      const controller = new AbortController();
      flight = { nodeId: id, tasks: tasks.map(task => task.id), controller, consumers: new Set(), promise: Promise.resolve({}) };
      this.flights.set(key, flight);
      this.store.update(current => [...current, ...tasks]);
      const releaseAssets = this.io.retain(this.graphFor(root));
      const scheduled = attempts.map((attempt, index) => ({ ...attempt, taskId: tasks[index].id }));
      flight.promise = Promise.resolve().then(() => this.executeAttempts(id, scheduled, controller.signal))
        .finally(() => { releaseAssets(); if (this.flights.get(key) === flight) this.flights.delete(key); });
    }
    const signal = root.controller.signal;
    flight.consumers.add(signal);
    const release = () => { flight!.consumers.delete(signal); if (!flight!.consumers.size) flight!.controller.abort('没有等待此上游的运行。'); };
    signal.addEventListener('abort', release, { once: true });
    try { const patch = await withAbort(flight.promise, signal); aborted(signal); this.pinOutput(root, id, patch); }
    finally { signal.removeEventListener('abort', release); release(); }
  }
  private async acquireModelSlot(signal: AbortSignal) {
    while (this.modelSlots >= 4) {
      let wake!: () => void;
      const available = new Promise<void>(resolve => { wake = resolve; this.slotWaiters.add(wake); });
      try { await withAbort(available, signal); } finally { this.slotWaiters.delete(wake); }
    }
    aborted(signal); this.modelSlots++;
    return () => { this.modelSlots--; this.slotWaiters.forEach(wake => wake()); };
  }
  private async executeAttempts(id: string, attempts: (ModelAttempt & { taskId: string })[], signal: AbortSignal, accept?: (output: Record<string, unknown>) => void, publishImmediately = false) {
    let latest: Record<string, unknown> = {}, failure: unknown;
    for (const { prepared, signature, taskId } of attempts) {
      aborted(signal);
      try {
        if (!this.active(taskId)) throw new ModelRequestCancelled('运行已取消。');
        latest = await this.executeModel(id, prepared, signature, taskId, signal, publishImmediately);
        accept?.(latest);
      } catch (error) {
        // A failed request should not prevent independent requests in the run.
        if (signal.aborted) throw error;
        failure ??= error;
      }
    }
    if (failure) throw failure;
    return latest;
  }
  private async executeModel(id: string, prepared: PreviewTask, signature: string, taskId: string, signal: AbortSignal, publishImmediately: boolean) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const unsubscribe = this.store.subscribe(() => { if (!this.active(taskId)) controller.abort('运行已取消。'); });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let assets: FileAsset[] = [], attached = false;
    let releaseSlot = () => {};
    const release = this.io.retain(this.graph);
    try {
      aborted(signal); aborted(controller.signal);
      releaseSlot = await this.acquireModelSlot(controller.signal);
      aborted(controller.signal);
      // APIMart owns its polling deadline.
      if (prepared.imageRequest?.provider !== 'apimart' && !prepared.seedreamRequest && !prepared.nanoBananaRequest && !prepared.klingImageRequest && !prepared.grokImageRequest) {
        const deadline = 310000;
        timeout = setTimeout(() => controller.abort(new ModelRequestTimeout('请求超时；不会自动重试。')), deadline);
      }
      const queued = this.store.getSnapshot().find(task => task.id === taskId)!;
      const task = { ...prepared, id: taskId, label: queued.label, notice: undefined, state: 'Running' as const, started: Date.now() };
      // Retain the caller's batch identity and user-visible label.
      const { batchId: _batchId, createdAt: _createdAt, ...request } = task;
      void _batchId; void _createdAt;
      this.state(taskId, request);
      const pending = this.io.request(task, controller.signal).then(result => {
        if (controller.signal.aborted) this.io.discard(Array.isArray(result) ? result : [result]);
        return result;
      });
      const result = await withAbort(pending, controller.signal);
      aborted(signal); aborted(controller.signal);
      if (!this.active(taskId)) throw new Error('运行已取消。');
      const node = this.graph.nodes.find(item => item.id === id);
      if (!node || isNodeLocked(node)) throw new Error('节点已删除或锁定。');
      assets = Array.isArray(result) ? result : [result];
      if (!isImageGeneratorNode(node) || !assets.length || assets.some(asset => !asset?.url)) throw new Error('未返回有效图片。');
      const generated = assets.map(asset => ({ ...asset, createdAt: asset.createdAt ?? Date.now(), generation: { version: 1 as const, ...(node.type === 'sunburst' && node.data.composer ? { taskId } : {}), inputSignature: signature, outputSignature: asset.id } }));
      const output = { results: generated, activeResultId: generated[generated.length - 1].id, outputMode: undefined };
      this.commit(id, { ...output, results: [...(node.data.results ?? []), ...generated] }, publishImmediately);
      attached = true;
      this.state(taskId, { state: 'Done', progress: 100, notice: undefined });
      const prompt = imageTaskRequest(task)?.prompt;
      if (prompt?.trim() && this.io.onImageGenerated) {
        // Project metadata is written independently of the completed image task.
        const notify = this.io.onImageGenerated;
        void Promise.resolve().then(() => notify(prompt)).catch(() => {});
      }
      return output;
    } catch (error) {
      const deadline = controller.signal.reason instanceof ModelRequestTimeout;
      const failure = deadline ? controller.signal.reason : error;
      const state = deadline ? 'TimedOut' : controller.signal.aborted || signal.aborted || failure instanceof ModelRequestCancelled ? 'Cancelled' : failure instanceof ModelRequestTimeout ? 'TimedOut' : 'Failed';
      this.state(taskId, { state, error: failure instanceof Error ? failure.message : '执行失败。', notice: undefined });
      throw failure;
    } finally {
      if (!attached) this.io.discard(assets);
      releaseSlot(); clearTimeout(timeout); unsubscribe(); signal.removeEventListener('abort', cancel); release();
    }
  }
  dispose() {
    this.stopped = true;
    for (const root of this.roots) root.controller.abort('画布已关闭。');
    for (const flight of this.flights.values()) flight.controller.abort('画布已关闭。');
    this.unsubscribe();
  }
}
