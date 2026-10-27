import { createContext } from 'react';
import { assetResources } from './assetResources';
import type { FileAsset } from './types';
import type { MaskBitmap, MaskPoint } from './masksExtractor';

export type MaskProgress = { stage: 'loading' | 'download' | 'encoding' | 'segmenting'; progress?: number };
export type MaskPredictor = (source: FileAsset, point: MaskPoint, options: {
  signal: AbortSignal; onProgress: (progress: MaskProgress) => void; recalculate?: boolean;
}) => Promise<MaskBitmap>;
export type MaskWorkerRequest = { id: number; source: { id: string; url: string }; point: MaskPoint; recalculate?: boolean };
export type MaskWorkerResponse = { id: number } & ({ type: 'progress'; progress: MaskProgress } | { type: 'result'; bitmap: MaskBitmap } | { type: 'error'; message: string });

let worker: Worker | undefined, sequence = 0;
const requests = new Map<number, { resolve: (value: MaskBitmap) => void; reject: (error: Error) => void; progress: (value: MaskProgress) => void }>();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

export const predictMask: MaskPredictor = (source, point, options) => {
  if (options.signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  clearTimeout(idleTimer);
  if (!worker) {
    worker = new Worker(new URL('./masksInference.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<MaskWorkerResponse>) => {
      const message = event.data, pending = requests.get(message.id);
      if (!pending) return;
      if (message.type === 'progress') pending.progress(message.progress);
      else if (message.type === 'result') pending.resolve(message.bitmap);
      else pending.reject(new Error(message.message));
    };
    worker.onerror = () => {
      for (const pending of requests.values()) pending.reject(new Error('分割服务加载失败，请检查网络后重试。'));
      worker?.terminate(); worker = undefined;
    };
  }
  const id = ++sequence, currentWorker = worker;
  const release = assetResources.retain([source.url]);
  return new Promise<MaskBitmap>((resolve, reject) => {
    const abort = () => { currentWorker.postMessage({ cancel: id }); finish(); reject(new DOMException('Cancelled', 'AbortError')); };
    const finish = () => {
      requests.delete(id); options.signal.removeEventListener('abort', abort); release();
      if (!requests.size) idleTimer = setTimeout(() => { worker?.terminate(); worker = undefined; }, 120_000);
    };
    requests.set(id, { resolve: value => { finish(); resolve(value); }, reject: error => { finish(); reject(error); }, progress: options.onProgress });
    options.signal.addEventListener('abort', abort, { once: true });
    currentWorker.postMessage({ id, source: { id: source.id, url: source.url }, point, recalculate: options.recalculate } satisfies MaskWorkerRequest);
  });
};

// The provider also allows deterministic browser acceptance without downloading a model.
export const MaskInferenceContext = createContext<MaskPredictor>(predictMask);
