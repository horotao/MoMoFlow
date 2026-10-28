import type { Edge } from '@xyflow/react';
import { resolveOutputSource } from './router.ts';
import type { AppNode, FileAsset } from './types';
import type { PreviewTask } from './taskQueue';
import { isActiveTask } from './taskQueue.ts';
import { isDescriberNode, isImageGeneratorNode, isNodeLocked } from './types.ts';
import { executionInputs, executionSourceAssets, fixedOutput, graphGuard, isModelNode, nodeProblem, preflight, prepareModel, requestSignature, reusable, selectedResult, stableSignature, type ExecutionGraph } from './executionGraph.ts';
import { imageOutput } from './sunburstRun.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';

export type ExecutionStore = { getSnapshot: () => PreviewTask[]; update: (change: (tasks: PreviewTask[]) => PreviewTask[]) => void; subscribe: (listener: () => void) => () => void };
export type ExecutionIO = {
  request: (task: PreviewTask, signal: AbortSignal) => Promise<string | FileAsset | FileAsset[]>;
  local: (node: AppNode, graph: ExecutionGraph, signal: AbortSignal) => Promise<Record<string, unknown>>;
  snapshot: (assets: FileAsset[], signal: AbortSignal) => Promise<{ assets: Map<string, FileAsset>; release: () => void }>;
  verify: (assets: FileAsset[], signal: AbortSignal) => Promise<void>;
  retain: (graph: ExecutionGraph) => () => void;
  discard: (assets: FileAsset[]) => void;
  patch: (id: string, data: Record<string, unknown>) => void;
};
type Root = { id: string; controller: AbortController; guard: string; tasks: string[]; memo: Map<string, Promise<void>>; remote: Map<string, FileAsset>; outputs: Map<string, Record<string, unknown>>; releases: (() => void)[]; done?: Promise<void> };
type LocalFlight = { controller: AbortController; consumers: Set<AbortSignal>; promise: Promise<Record<string, unknown>> };
type Flight = { nodeId: string; taskId: string; controller: AbortController; consumers: Set<AbortSignal>; promise: Promise<Record<string, unknown>> };
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
  if (isDescriberNode(node)) return { text: node.data.text, generation: node.data.generation, outputMode: node.data.outputMode };
  const result = selectedResult(node);
  return { results: result ? [result] : [], activeResultId: result?.id, outputMode: 'outputMode' in node.data ? node.data.outputMode : undefined };
}

export class WorkflowExecution {
  private graph: ExecutionGraph;
  private roots = new Set<Root>();
  private flights = new Map<string, Flight>();
  private localFlights = new Map<string, LocalFlight>();
  private stopped = false;
  private modelSlots = 0;
  private slotWaiters = new Set<() => void>();
  private unsubscribe: () => void;
  private store: ExecutionStore;
  private io: ExecutionIO;
  constructor(graph: ExecutionGraph, store: ExecutionStore, io: ExecutionIO) {
    this.store = store; this.io = io;
    this.graph = graph;
    this.unsubscribe = store.subscribe(() => {
      for (const root of this.roots) {
        if (!root.tasks.some(id => this.active(id))) root.controller.abort('运行已取消。');
      }
      for (const flight of this.flights.values()) if (!this.active(flight.taskId)) flight.controller.abort('上游任务已取消。');
    });
  }
  private active(id: string) { return this.store.getSnapshot().some(task => task.id === id && isActiveTask(task)); }
  private state(id: string, patch: Partial<PreviewTask>) {
    this.store.update(tasks => tasks.map(task => task.id === id && isActiveTask(task) ? { ...task, ...patch } : task));
  }
  observe(graph: ExecutionGraph) {
    this.graph = graph;
    for (const root of this.roots) {
      try { if (graphGuard(graph, root.id, true) !== root.guard) root.controller.abort('输入或输出选择已变化，请重新运行。'); }
      catch { root.controller.abort('依赖节点已删除或连接失效。'); }
    }
  }
  private commit(id: string, data: Record<string, unknown>) {
    this.graph = { ...this.graph, nodes: this.graph.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...data } } as AppNode : node) };
    // Only an engine-owned successful commit advances edit guards. Cancelled
    // roots stay cancelled, even when undo later restores the same input hash.
    for (const root of this.roots) if (!root.controller.signal.aborted) root.guard = graphGuard(this.graph, root.id, true);
    this.io.patch(id, data);
  }
  private graphFor(root: Root): ExecutionGraph {
    return { ...this.graph, nodes: mapAssets(this.graph.nodes.map(node => root.outputs.has(node.id) ? { ...node, data: { ...node.data, ...root.outputs.get(node.id) } } as AppNode : node), asset => root.remote.get(asset.url) ? { ...root.remote.get(asset.url)!, maskMode: asset.maskMode } : asset) };
  }
  run(ids: string[], runs: number) {
    if (this.stopped) throw new Error('执行器已关闭。');
    const targets = [...new Set(ids)];
    if (!targets.length) return Promise.resolve();
    if (targets.some(id => [...this.roots].some(root => root.id === id) || [...this.flights.values()].some(flight => flight.nodeId === id))) throw new Error('选中节点已有运行中的任务，请等待完成后再运行。');
    preflight(this.graph, targets, runs);
    const batchId = crypto.randomUUID();
    const roots = targets.map(id => {
      const tasks = Array.from({ length: runs }, () => this.placeholder(id, batchId));
      const root: Root = { id, tasks: tasks.map(task => task.id), controller: new AbortController(), guard: graphGuard(this.graph, id, true), memo: new Map(), remote: new Map(), outputs: new Map(), releases: [] };
      this.roots.add(root);
      this.store.update(current => [...current, ...tasks]);
      return root;
    });
    for (const root of roots) {
      // Deferral lets every selected target register before dependency traversal.
      root.done = Promise.resolve().then(async () => {
        const signal = root.controller.signal;
        const release = this.io.retain(this.graph);
        try {
          await this.snapshotAssets(root, executionSourceAssets(this.graph, root.id, targets));
          aborted(signal);
          const node = this.graph.nodes.find(item => item.id === root.id)!;
          await Promise.all(executionInputs(node, undefined, this.graphFor(root)).map(edge => this.ensureInput(root, node, edge)));
          aborted(signal);
          const graph = this.graphFor(root);
          const prepared = prepareModel(graph, root.id);
          const signature = requestSignature(prepared, graph);
          for (const taskId of root.tasks) {
            aborted(signal);
            if (!this.active(taskId)) continue;
            try {
              this.pinOutput(root, root.id, await this.executeModel(root.id, prepared, signature, taskId, signal));
            } catch {
              // executeModel records this attempt's failure. The remaining
              // requested runs are independent attempts, not automatic retries.
              // Only cancellation or an invalidated graph stops the whole root.
              aborted(signal);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '工作流执行失败。';
          for (const taskId of root.tasks) this.state(taskId, { state: signal.aborted ? 'Cancelled' : 'Failed', error: message, notice: undefined });
        } finally {
          root.controller.abort('本次运行已结束。');
          this.roots.delete(root); root.releases.forEach(release => release()); release();
        }
      });
    }
    return Promise.all(roots.map(root => root.done)).then(() => {});
  }
  private placeholder(id: string, batchId: string): PreviewTask {
    const node = this.graph.nodes.find(item => item.id === id)!;
    const label = node.data.label || ({ sunburst: 'GPT Image 2.5', 'nano-banana': 'Nano Banana', ideogram: 'Ideogram 4.5', 'image-describer': '图像描述' } as Record<string, string>)[node.type!] || node.type;
    return { id: crypto.randomUUID(), nodeId: id, batchId, label, model: node.type!, createdAt: Date.now(), state: 'Queued', progress: 0, started: 0, notice: '等待上游' };
  }
  private ensureInput(root: Root, consumer: AppNode, edge: Edge) {
    // Match the model adapter's Painter Mask alias, including Router chains.
    // Compare exposes its visible image instead and retains that existing rule.
    if (['sunburst', 'ideogram'].includes(consumer.type ?? '') && edge.targetHandle === 'mask') {
      const graph = this.graphFor(root);
      const origin = resolveOutputSource(graph.nodes.find(node => node.id === edge.source), edge.sourceHandle, graph.nodes, graph.edges);
      if (origin?.node.type === 'painter' && origin.handle === 'mask') return this.ensure(root, origin.node.id, 'alpha-mask');
    }
    return this.ensure(root, edge.source, edge.sourceHandle);
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
    const selected = [...this.roots].find(other => other !== root && other.id === id);
    if (selected?.done) {
      await withAbort(selected.done, signal);
      if (!selected.tasks.every(taskId => this.store.getSnapshot().find(task => task.id === taskId)?.state === 'Done')) nodeProblem(node, '上游运行失败或已取消。');
      const output = selected.outputs.get(id);
      if (!output) nodeProblem(node, '上游没有提供本次运行结果。');
      this.pinOutput(root, id, output);
      return;
    }
    if (fixedOutput(node)) {
      await this.verifyOutput(root, isImageGeneratorNode(node) ? [selectedResult(node)!] : []);
      this.pinOutput(root, id, modelOutput(node));
      return;
    }
    await Promise.all(executionInputs(node, handle, graph).map(edge => this.ensureInput(root, node, edge)));
    aborted(signal);
    graph = this.graphFor(root); node = graph.nodes.find(item => item.id === id)!;
    if (isModelNode(node)) {
      // Locked nodes may supply a proven result, but may never be executed.
      const unlocked = { ...graph, nodes: graph.nodes.map(item => item.id === id ? { ...item, data: { ...item.data, locked: false } } as AppNode : item) };
      const prepared = prepareModel(unlocked, id), signature = requestSignature(prepared, graph);
      if (reusable(node, signature)) {
        try {
          await this.verifyOutput(root, isImageGeneratorNode(node) ? [selectedResult(node)!] : []);
          this.pinOutput(root, id, modelOutput(node));
          for (const taskId of root.tasks) this.state(taskId, { notice: '已复用上游，准备剩余输入' });
          return;
        } catch { aborted(signal); /* Missing cached media needs regeneration. */ }
      }
      if (isNodeLocked(node)) nodeProblem(node, '已锁定且结果需要更新，请先解锁。');
      await this.shared(root, `${id}:${signature}`, id, prepared, signature);
    } else if (!['text', 'router', 'compare', 'model-input', 'position-logger'].includes(node.type ?? '') && !(node.type === 'color-palette' && handle === 'text')) {
      const output = imageOutput(node, handle, graph.nodes, graph.edges);
      const localSignature = graphGuard(graph, id, true, handle);
      const snapshotCompatible = !root.remote.size || node.type === 'file' || ('executionSignature' in node.data && node.data.executionSignature === localSignature);
      if (output.length && snapshotCompatible) {
        try {
          await this.verifyOutput(root, output);
          this.pinOutput(root, id, Object.fromEntries(Object.entries(node.data).filter(([key]) => ['result', 'mask', 'alphaMask', 'outputRevision', 'executionSignature'].includes(key))));
          return;
        } catch (error) {
          aborted(signal);
          // Original uploads and locked nodes cannot be rebuilt automatically.
          if (node.type === 'file' || isNodeLocked(node)) throw error;
        }
      }
      if (isNodeLocked(node)) nodeProblem(node, '已锁定且没有有效输出。');
      await this.sharedLocal(root, node, graph, localSignature, handle);
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
  private async sharedLocal(root: Root, node: AppNode, graph: ExecutionGraph, signature: string, handle?: string | null) {
    let flight = this.localFlights.get(signature);
    if (!flight || flight.controller.signal.aborted) {
      const controller = new AbortController(), releaseAssets = this.io.retain(graph);
      const created: LocalFlight = { controller, consumers: new Set(), promise: Promise.resolve({}) };
      flight = created; this.localFlights.set(signature, created);
      created.promise = Promise.resolve().then(async () => {
        const signal = controller.signal;
        aborted(signal);
        const work = this.io.local(node, graph, signal).then(patch => {
          if (signal.aborted) this.io.discard(Object.values(patch).filter((value): value is FileAsset => Boolean(value && typeof value === 'object' && 'url' in value && 'id' in value)));
          return patch;
        });
        const patch = await withAbort(work, signal); aborted(signal);
        const updated = { ...graph, nodes: graph.nodes.map(item => item.id === node.id ? { ...item, data: { ...item.data, ...patch } } as AppNode : item) };
        if (!imageOutput(updated.nodes.find(item => item.id === node.id), handle, updated.nodes, updated.edges).length) {
          this.io.discard(Object.values(patch).filter((value): value is FileAsset => Boolean(value && typeof value === 'object' && 'url' in value && 'id' in value)));
          nodeProblem(node, '正式输出未完成或已被替换。');
        }
        const completed = { ...patch, executionSignature: signature };
        this.commit(node.id, completed);
        return completed;
      }).finally(() => { releaseAssets(); if (this.localFlights.get(signature) === created) this.localFlights.delete(signature); });
    }
    const signal = root.controller.signal;
    flight.consumers.add(signal);
    const release = () => { flight!.consumers.delete(signal); if (!flight!.consumers.size) flight!.controller.abort('本地图像处理已取消。'); };
    signal.addEventListener('abort', release, { once: true });
    try { const patch = await withAbort(flight.promise, signal); aborted(signal); this.pinOutput(root, node.id, patch); }
    finally { signal.removeEventListener('abort', release); release(); }
  }
  private async shared(root: Root, key: string, id: string, prepared: PreviewTask, signature: string) {
    let flight = this.flights.get(key);
    if (!flight || flight.controller.signal.aborted) {
      const task = this.placeholder(id, this.store.getSnapshot().find(task => task.id === root.tasks[0])!.batchId);
      const controller = new AbortController();
      flight = { nodeId: id, taskId: task.id, controller, consumers: new Set(), promise: Promise.resolve({}) };
      this.flights.set(key, flight);
      this.store.update(tasks => [...tasks, task]);
      const releaseAssets = this.io.retain(this.graphFor(root));
      flight.promise = Promise.resolve().then(() => this.executeModel(id, prepared, signature, task.id, controller.signal)).finally(() => { releaseAssets(); if (this.flights.get(key) === flight) this.flights.delete(key); });
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
  private async executeModel(id: string, prepared: PreviewTask, signature: string, taskId: string, signal: AbortSignal) {
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
      timeout = setTimeout(() => controller.abort('请求超时；不会自动重试。'), isDescriberNode(this.graph.nodes.find(node => node.id === id)!) ? 130000 : 310000);
      const task = { ...prepared, id: taskId, notice: undefined, state: 'Running' as const, started: Date.now() };
      // Retain the caller's batch identity and user-visible label.
      const { batchId: _batchId, createdAt: _createdAt, ...request } = task;
      void _batchId; void _createdAt;
      this.state(taskId, request);
      const pending = this.io.request(task, controller.signal).then(result => {
        if (controller.signal.aborted && typeof result !== 'string') this.io.discard(Array.isArray(result) ? result : [result]);
        return result;
      });
      const result = await withAbort(pending, controller.signal);
      aborted(signal); aborted(controller.signal);
      if (!this.active(taskId)) throw new Error('运行已取消。');
      const node = this.graph.nodes.find(item => item.id === id);
      if (!node || isNodeLocked(node)) throw new Error('节点已删除或锁定。');
      let output: Record<string, unknown>;
      if (typeof result === 'string') {
        if (!isDescriberNode(node) || !result.trim()) throw new Error('未返回有效描述。');
        output = { text: result, outputMode: undefined, sourceSignature: undefined, generation: { version: 1, inputSignature: signature, outputSignature: stableSignature(result) } };
        this.commit(id, output);
      } else {
        assets = Array.isArray(result) ? result : [result];
        if (!isImageGeneratorNode(node) || !assets.length || assets.some(asset => !asset?.url)) throw new Error('未返回有效图片。');
        const generated = assets.map(asset => ({ ...asset, generation: { version: 1 as const, inputSignature: signature, outputSignature: asset.id } }));
        output = { results: generated, activeResultId: generated[generated.length - 1].id, outputMode: undefined };
        this.commit(id, { ...output, results: [...(node.data.results ?? []), ...generated] });
        attached = true;
      }
      this.state(taskId, { state: 'Done', progress: 100, notice: undefined });
      return output;
    } catch (error) {
      this.state(taskId, { state: controller.signal.aborted || signal.aborted ? 'Cancelled' : 'Failed', error: error instanceof Error ? error.message : '执行失败。', notice: undefined });
      throw error;
    } finally {
      if (!attached) this.io.discard(assets);
      releaseSlot(); clearTimeout(timeout); unsubscribe(); signal.removeEventListener('abort', cancel); release();
    }
  }
  dispose() {
    this.stopped = true;
    for (const root of this.roots) root.controller.abort('画布已关闭。');
    for (const flight of this.flights.values()) flight.controller.abort('画布已关闭。');
    for (const flight of this.localFlights.values()) flight.controller.abort('画布已关闭。');
    this.unsubscribe();
  }
}
