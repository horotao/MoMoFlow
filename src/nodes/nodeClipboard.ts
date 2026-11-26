import type { Edge, XYPosition } from '@xyflow/react';
import { mapAssets } from '../persistence/workflowStorage';
import { assetResources, nodeAssetUrls } from './assetResources';
import { duplicateNodes } from './duplicateNodes';
import type { AppNode } from './types';

type Graph = { nodes: AppNode[]; edges: Edge[] };
type Entry = Graph & { token: string; blobs: Map<string, Blob> };
const prefix = 'MoMoFlow node: ';

// Keep the last copied graph and its binary assets together across tabs and reloads.
// The system clipboard identifies the snapshot without exposing large media as text.
async function clipboardDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('momoflow-node-clipboard', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clipboard');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function cloneNodeGraph(nodes: AppNode[], edges: Edge[], id: string, position: XYPosition, detach: boolean): Graph {
  const copies = duplicateNodes(nodes, edges, [id], undefined, 'command');
  return { edges: copies.edges, nodes: copies.nodes.map(node => ({
    ...node, dragging: false,
    ...(node.id === copies.ids.get(id) ? { position, parentId: detach ? undefined : node.parentId } : {}),
  })) };
}

async function storeGraph(graph: Graph, token: string) {
  const urls = [...nodeAssetUrls(graph.nodes)].filter(url => url.startsWith('blob:'));
  const release = assetResources.retain(urls);
  try {
    const blobs = new Map(await Promise.all(urls.map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('复制的素材无法读取。');
      return [url, await response.blob()] as const;
    })));
    const db = await clipboardDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('clipboard', 'readwrite');
        tx.objectStore('clipboard').put({ ...graph, token, blobs } satisfies Entry, token);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  } finally { release(); }
}

export async function copyNodeGraph(graph: Graph) {
  const token = prefix + crypto.randomUUID();
  const staged = storeGraph(graph, token);
  let copied = false;
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const payload = staged.then(() => new Blob([token], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': payload })]);
    } else {
      await staged;
      await navigator.clipboard.writeText(token);
    }
    copied = true;
  } finally {
    await staged;
    // A denied clipboard write must leave the previous pasteable entry intact.
    const db = await clipboardDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('clipboard', 'readwrite');
        const store = tx.objectStore('clipboard');
        if (copied) {
          const previous = store.get('current');
          previous.onsuccess = () => {
            if (typeof previous.result === 'string') store.delete(previous.result);
            store.put(token, 'current');
          };
        } else store.delete(token);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
}

export const isNodeClipboard = (text: string) => text.startsWith(prefix);

export async function readNodeGraph(token: string, position: XYPosition): Promise<Graph> {
  const db = await clipboardDatabase();
  try {
    const entry = await new Promise<Entry | undefined>((resolve, reject) => {
      const request = db.transaction('clipboard').objectStore('clipboard').get(token);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const root = entry?.nodes.find(node => !node.parentId);
    if (!entry || entry.token !== token || !root) throw new Error('找不到复制的节点，请重新复制。');
    const graph = cloneNodeGraph(entry.nodes, entry.edges, root.id, position, true);
    const urls = new Map<string, string>();
    graph.nodes = mapAssets(graph.nodes, asset => {
      const blob = entry.blobs.get(asset.url);
      if (!blob) return asset;
      let url = urls.get(asset.url);
      if (!url) { url = assetResources.create(blob); urls.set(asset.url, url); }
      return { ...asset, url };
    });
    return graph;
  } finally { db.close(); }
}
