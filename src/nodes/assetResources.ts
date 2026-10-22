import { isInvertNode, isLevelsNode, isBlurNode, isColorCorrectionNode, isCropNode, isPainterNode } from './types.ts';
import type { PreviewTask } from './taskQueue';
import type { AppNode, FileNode, SunburstNode } from './types';

// Only URLs created by this registry may be revoked. External links and URLs
// received from another tab are never owned by this page's collector.
export class AssetResources {
  private urls = new Set<string>();
  private staged = new Set<string>();
  private owners = new Map<symbol, Set<string>>();
  private timer?: ReturnType<typeof setTimeout>;

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    this.staged.add(url);
    this.schedule();
    return url;
  }

  setReferences(owner: symbol, urls: Iterable<string>) {
    const references = new Set([...urls].filter(url => url.startsWith('blob:')));
    const previous = this.owners.get(owner);
    if ((previous?.size ?? 0) === references.size && [...references].every(url => previous?.has(url))) return;
    if (references.size) this.owners.set(owner, references);
    else this.owners.delete(owner);
    this.schedule();
  }

  // New imports/results stay staged until a committed canvas takes ownership.
  // Async producers explicitly discard rejected results; no timeout guesses how
  // long React or image decoding will take.
  adopt(owner: symbol, urls: Iterable<string>) {
    const references = [...urls];
    this.setReferences(owner, references);
    for (const url of references) this.staged.delete(url);
  }

  discard(urls: Iterable<string>) {
    for (const url of urls) this.staged.delete(url);
    this.schedule();
  }

  release(owner: symbol) {
    if (this.owners.delete(owner)) this.schedule();
  }

  retain(urls: Iterable<string>): () => void {
    const owner = Symbol('asset operation');
    this.setReferences(owner, urls);
    return () => this.release(owner);
  }

  private schedule() {
    if (this.timer !== undefined) return;
    // Defer until React's commit/layout effects transfer ownership. This also
    // lets StrictMode's cleanup/setup pair reacquire the same URLs safely.
    this.timer = setTimeout(() => this.collect(), 0);
  }

  collect() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const needed = new Set([...this.owners.values()].flatMap(urls => [...urls]));
    for (const url of this.urls) if (!needed.has(url) && !this.staged.has(url)) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }
}

export function nodeAssetUrls(nodes: Iterable<AppNode>): Set<string> {
  const urls = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'file') {
      const data = node.data as FileNode['data'];
      if (data.asset) urls.add(data.asset.url);
      for (const asset of data.assets ?? []) urls.add(asset.url);
    } else if (isInvertNode(node) || isLevelsNode(node) || isBlurNode(node) || isCropNode(node) || isColorCorrectionNode(node)) {
      for (const asset of [node.data.result, node.data.baseImage]) if (asset) urls.add(asset.url);
    } else if (isPainterNode(node)) {
      for (const asset of [node.data.result, node.data.mask, node.data.alphaMask, node.data.baseImage]) if (asset) urls.add(asset.url);
    } else if (node.type === 'sunburst') {
      for (const asset of (node.data as SunburstNode['data']).results ?? []) urls.add(asset.url);
    }
  }
  return urls;
}

export function taskAssetUrls(task: PreviewTask): string[] {
  return [...(task.images ?? []), ...(task.imageRequest?.images ?? []),
    ...(task.imageRequest?.mask ? [task.imageRequest.mask] : [])];
}

export const assetResources = new AssetResources();
const clipboardOwner = Symbol('last local clipboard entry');

// The most recently cut node/copied link must survive history eviction too.
export async function writeAssetClipboard(text: string, urls: Iterable<string>) {
  const references = [...urls];
  const release = assetResources.retain(references);
  try {
    await navigator.clipboard.writeText(text);
    assetResources.setReferences(clipboardOwner, references);
  } finally { release(); }
}

export function releaseAssetClipboard() {
  assetResources.release(clipboardOwner);
}
