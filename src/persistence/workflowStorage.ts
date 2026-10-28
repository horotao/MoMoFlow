import { isMasksExtractorNode } from '../nodes/types.ts';
import { isImageGeneratorNode } from '../nodes/types.ts';
import { isBlendNode } from '../nodes/types.ts';
import { isCompareNode } from '../nodes/types.ts';
import { isColorPaletteNode, isCompositorNode, isResizeNode, isRotateFlipNode, isInvertNode, isLevelsNode, isMatteGrowShrinkNode, isBlurNode, isColorCorrectionNode, isCropNode, isPainterNode } from '../nodes/types.ts';
import { assetResources, nodeAssetUrls } from '../nodes/assetResources.ts';
import type { Edge, Viewport } from '@xyflow/react';
import type { AppNode, FileAsset, FileNode, ImageGeneratorNode } from '../nodes/types';

export type Workflow = {
  nodes: AppNode[];
  edges: Edge[];
  viewport: Viewport;
  colorMode: 'light' | 'dark';
};
type StoredWorkflow = Workflow & { version: 1; revision?: string };
const documentKey = 'current';

// Drop React Flow's temporary interaction/measurement state, retain node content.
export function workflowSnapshot(workflow: Workflow): StoredWorkflow {
  return {
    ...workflow, version: 1,
    nodes: workflow.nodes.map(node => ({
      ...node, selected: undefined, dragging: undefined, measured: undefined, resizing: undefined,
    })),
    edges: workflow.edges.map(edge => ({ ...edge, selected: undefined })),
  };
}

export function mapAssets(nodes: AppNode[], map: (asset: FileAsset) => FileAsset): AppNode[] {
  return nodes.map(node => {
    if (isBlendNode(node)) return { ...node, data: { ...node.data, back: node.data.back ? map(node.data.back) : undefined, front: node.data.front ? map(node.data.front) : undefined, result: node.data.result ? map(node.data.result) : undefined } };
    if (isCompareNode(node)) return { ...node, data: { ...node.data, input1: node.data.input1 ? map(node.data.input1) : undefined, input2: node.data.input2 ? map(node.data.input2) : undefined } };
    if (isCompositorNode(node)) return { ...node, data: { ...node.data,
      result: node.data.result ? map(node.data.result) : undefined,
      document: { ...node.data.document, layers: node.data.document.layers.map(layer => layer.source.kind === 'asset'
        ? { ...layer, source: { kind: 'asset' as const, asset: map(layer.source.asset) } } : layer.source.kind === 'input' ? { ...layer, source: { ...layer.source, fallback: layer.source.fallback ? map(layer.source.fallback) : undefined } } : layer) },
    } };
    if (isColorPaletteNode(node)) return { ...node, data: { ...node.data, result: node.data.result ? map(node.data.result) : undefined } };
    if ((node.type === 'file' || node.type === 'image-iterator')) {
      const data = node.data as FileNode['data'];
      return { ...node, data: {
        ...data,
        asset: data.asset ? map(data.asset) : undefined,
        assets: data.assets?.map(map),
      } } as AppNode;
    }
    if (isResizeNode(node) || isRotateFlipNode(node) || isInvertNode(node) || isLevelsNode(node) || isMatteGrowShrinkNode(node) || isBlurNode(node) || isCropNode(node) || isColorCorrectionNode(node)) return { ...node, data: { ...node.data,
      baseImage: node.data.baseImage ? map(node.data.baseImage) : undefined,
      result: node.data.result ? map(node.data.result) : undefined,
    } } as AppNode;
    if (isMasksExtractorNode(node)) return { ...node, data: { ...node.data,
      baseImage: node.data.baseImage ? map(node.data.baseImage) : undefined,
      result: node.data.result ? map(node.data.result) : undefined,
      mask: node.data.mask ? map(node.data.mask) : undefined,
    } };
    if (isPainterNode(node)) return { ...node, data: { ...node.data,
      baseImage: node.data.baseImage ? map(node.data.baseImage) : undefined,
      result: node.data.result ? map(node.data.result) : undefined,
      mask: node.data.mask ? map(node.data.mask) : undefined,
      alphaMask: node.data.alphaMask ? map(node.data.alphaMask) : undefined,
    } };
    if (isImageGeneratorNode(node)) return { ...node, data: {
      ...node.data, results: (node.data as ImageGeneratorNode['data']).results?.map(map),
    } } as AppNode;
    return node;
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('本地存储事务已中止。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('无法写入本地存储。'));
  });
}

export class WorkflowStorage {
  private databaseName: string;
  constructor(databaseName = 'momoflow-canvas') { this.databaseName = databaseName; }
  private database?: Promise<IDBDatabase>;
  private assetKeys = new Map<string, string>();
  private storedKeys = new Set<string>();
  private restoredUrls: string[] = [];
  private assetOwner = Symbol('restoring canvas');
  private revision?: string;

  private open(): Promise<IDBDatabase> {
    if (!this.database) this.database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('workflows');
        request.result.createObjectStore('assets');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他 MoMoFlow 页面后重试。'));
    }).catch(error => { this.database = undefined; throw error; });
    return this.database;
  }

  async load(): Promise<Workflow | null> {
    const db = await this.open();
    const transaction = db.transaction(['workflows', 'assets'], 'readonly');
    const done = completed(transaction);
    const document = transaction.objectStore('workflows').get(documentKey);
    const assets = transaction.objectStore('assets').getAll();
    const keys = transaction.objectStore('assets').getAllKeys();
    await done;
    const saved = document.result as StoredWorkflow | undefined;
    if (!saved) return null;
    if (saved.version !== 1 || !Array.isArray(saved.nodes) || !Array.isArray(saved.edges)
      || !saved.viewport || ![saved.viewport.x, saved.viewport.y, saved.viewport.zoom].every(Number.isFinite)
      || saved.viewport.zoom <= 0) throw new Error('保存的画布格式无法读取，原有数据已保留。');
    this.revision = saved.revision;
    this.storedKeys = new Set(keys.result as string[]);
    const blobs = new Map(keys.result.map((key, index) => [key, assets.result[index] as Blob]));
    const urls = new Map<string, string>();
    const nodes = mapAssets(saved.nodes, asset => {
      if (!asset.url.startsWith('blob:')) return asset;
      const key = asset.url;
      let url = urls.get(key);
      if (!url) {
        const blob = blobs.get(key);
        if (!(blob instanceof Blob)) throw new Error('保存的素材缺失，原有数据已保留。');
        url = assetResources.create(blob);
        urls.set(key, url);
        this.assetKeys.set(url, key);
        this.restoredUrls.push(url);
        assetResources.setReferences(this.assetOwner, this.restoredUrls);
      }
      return { ...asset, url };
    });
    return { ...saved, nodes };
  }

  // The caller serializes saves. Assets and graph commit in the same transaction.
  async save(workflow: Workflow): Promise<void> {
    const release = assetResources.retain(nodeAssetUrls(workflow.nodes));
    try { await this.write(workflow); }
    finally { release(); }
  }

  private async write(workflow: Workflow): Promise<void> {
    const snapshot = workflowSnapshot(workflow);
    const required = new Map<string, string>();
    snapshot.nodes = mapAssets(snapshot.nodes, asset => {
      if (!asset.url.startsWith('blob:')) return asset;
      const key = this.assetKeys.get(asset.url) ?? asset.url;
      required.set(key, asset.url);
      return { ...asset, url: key };
    });
    const additions = await Promise.all([...required].filter(([key]) => !this.storedKeys.has(key)).map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('无法保存本地素材。');
      return [key, await response.blob()] as const;
    }));
    const db = await this.open();
    const transaction = db.transaction(['workflows', 'assets'], 'readwrite');
    const done = completed(transaction);
    const assets = transaction.objectStore('assets');
    const documents = transaction.objectStore('workflows');
    const current = documents.get(documentKey);
    let failure: unknown;
    snapshot.revision = crypto.randomUUID();
    current.onsuccess = () => {
      try {
        // Refuse stale tabs instead of overwriting newer work or deleting its assets.
        if (current.result?.revision !== this.revision) {
          const error = new Error('画布已在其他页面更新。请先保留本页改动，再重新打开画布。');
          error.name = 'WorkflowConflictError';
          throw error;
        }
        for (const [key, blob] of additions) assets.put(blob, key);
        for (const key of this.storedKeys) if (!required.has(key)) assets.delete(key);
        documents.put(snapshot, documentKey);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    await done.catch(error => { throw failure ?? error; });
    this.revision = snapshot.revision;
    this.storedKeys = new Set(required.keys());
  }

  releaseRestoredAssets() {
    assetResources.discard(this.restoredUrls);
    assetResources.release(this.assetOwner);
    this.restoredUrls = [];
  }

  dispose() {
    this.releaseRestoredAssets();
    void this.database?.then(db => db.close()).catch(() => {});
  }
}
