import { isCanvasVideo, isFileNode, isImageGeneratorNode, isInteractiveEditNode } from '../nodes/types.ts';
import { assetResources, nodeAssetUrls } from '../nodes/assetResources.ts';
import { hasLegacyImageGraph, migrateLegacyImageGraph } from './legacyImageMigration.ts';
import type { Edge, Viewport } from '@xyflow/react';
import type { AppNode, FileAsset } from '../nodes/types';

export type Workflow = {
  nodes: AppNode[];
  edges: Edge[];
  viewport: Viewport;
  // Accept legacy snapshots; the app only displays and saves dark mode.
  colorMode: 'light' | 'dark';
};
type StoredWorkflow = Workflow & { version: 1; revision?: string };
const documentKey = 'current';

export const preImageMigrationKey = 'pre-image-migration';
type LegacyBackup = { workflow: StoredWorkflow; assetKeys: string[] };

// Unknown retired node types can still refer to local blobs in their own shape.
function originalAssetKeys(workflow: StoredWorkflow, storedKeys: Set<string>) {
  const keys = new Set<string>();
  const seen = new Set<object>();
  function visit(value: unknown) {
    if (typeof value === 'string' && storedKeys.has(value)) keys.add(value);
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    Object.values(value).forEach(visit);
  }
  visit(workflow);
  return [...keys];
}

// Drop React Flow's temporary interaction/measurement state, retain node content.
export function workflowSnapshot(workflow: Workflow): StoredWorkflow {
  const graph = migrateLegacyImageGraph(workflow.nodes, workflow.edges);
  return {
    ...workflow, version: 1, colorMode: 'dark',
    nodes: graph.nodes.map(node => ({
      ...node, selected: undefined, dragging: undefined, measured: undefined, resizing: undefined,
    })),
    edges: graph.edges.map(edge => ({ ...edge, selected: undefined })),
  };
}

export function mapAssets(nodes: AppNode[], map: (asset: FileAsset) => FileAsset): AppNode[] {
  const visit = (asset: FileAsset): FileAsset => {
    // Existing visitors (including project thumbnails) see the visible asset first.
    const mapped = map(asset);
    return mapped.crop ? { ...mapped, crop: { ...mapped.crop, source: map(mapped.crop.source) } } : mapped;
  };
  return nodes.map(node => {

    if (isFileNode(node)) {
      const { data } = node;
      return { ...node, data: {
        ...data,
        asset: data.asset ? visit(data.asset) : undefined,
        assets: data.assets?.map(visit),
      } } as AppNode;
    }

    if (isCanvasVideo(node)) return { ...node, data: { ...node.data, asset: node.data.asset ? visit(node.data.asset) : undefined,
      lastFrame: node.data.lastFrame ? visit(node.data.lastFrame) : undefined } };
    if (isInteractiveEditNode(node)) return { ...node, data: { ...node.data,
      baseImage: node.data.baseImage ? visit(node.data.baseImage) : undefined,
    } };

    if (isImageGeneratorNode(node)) return { ...node, data: {
      ...node.data, results: node.data.results?.map(visit),
      ...(node.type === 'sunburst' && node.data.inpaint ? {
        inpaint: { image: visit(node.data.inpaint.image), mask: visit(node.data.inpaint.mask) },
      } : {}),
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
    const graph = migrateLegacyImageGraph(saved.nodes, saved.edges,
      asset => !asset.url.startsWith('blob:') || blobs.get(asset.url) instanceof Blob);
    const nodes = mapAssets(graph.nodes, asset => {
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
    return { ...saved, nodes, edges: graph.edges, colorMode: 'dark' };
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
    const original = documents.get(preImageMigrationKey);
    const current = documents.get(documentKey);
    let failure: unknown;
    let archivedKeys = new Set<string>();
    snapshot.revision = crypto.randomUUID();
    current.onsuccess = () => {
      try {
        // Refuse stale tabs instead of overwriting newer work or deleting its assets.
        if (current.result?.revision !== this.revision) {
          const error = new Error('画布已在其他页面更新。请先保留本页改动，再重新打开画布。');
          error.name = 'WorkflowConflictError';
          throw error;
        }
        const previous = current.result as StoredWorkflow | undefined;
        const backup = original.result as LegacyBackup | undefined;
        if (backup) archivedKeys = new Set(backup.assetKeys);
        else if (previous && hasLegacyImageGraph(previous.nodes, previous.edges)) {
          const assetKeys = originalAssetKeys(previous, this.storedKeys);
          // Save the original before replacing the live graph, in the same transaction.
          documents.add({ workflow: previous, assetKeys } satisfies LegacyBackup, preImageMigrationKey);
          archivedKeys = new Set(assetKeys);
        }
        for (const [key, blob] of additions) assets.put(blob, key);
        for (const key of this.storedKeys) if (!required.has(key) && !archivedKeys.has(key)) assets.delete(key);
        documents.put(snapshot, documentKey);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    await done.catch(error => { throw failure ?? error; });
    this.revision = snapshot.revision;
    this.storedKeys = new Set([...required.keys(), ...archivedKeys]);
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
