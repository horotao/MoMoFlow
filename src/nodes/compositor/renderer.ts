import type { CompositorDocument, CompositorInputs, CompositorLayout } from '../compositor';
import type { RenderRequest } from './render.worker';
export type CompositorFrame = { bitmap: ImageBitmap; blob?: Blob; layout: CompositorLayout };
type Job = { request: RenderRequest; resolve: (value?: CompositorFrame) => void; reject: (error: Error) => void };
// Each queue has one running job and only the newest pending job. Independent
// draft/native workers keep expensive PNG/effect work away from pointer gestures.
export class CompositorRenderer {
  private worker: Worker;
  private active?: Job;
  private pending?: Job;
  private serial = 0;
  private disposed = false;
  constructor(private draft: boolean) {
    this.worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }: MessageEvent<CompositorFrame & { id: number; error?: string }>) => {
      const job = this.active;
      this.active = undefined;
      if (!job || data.id !== job.request.id || this.disposed) data.bitmap?.close();
      else if (data.error) job.reject(new Error(data.error));
      else job.resolve(data);
      if (this.pending && !this.disposed) { const next = this.pending; this.pending = undefined; this.start(next); }
    };
    this.worker.onerror = () => {
      this.active?.reject(new Error('图像处理线程无法运行，请重新打开编辑器或刷新页面。'));
      this.pending?.resolve(); this.active = undefined; this.pending = undefined;
    };
  }
  render(document: CompositorDocument, inputs: CompositorInputs): Promise<CompositorFrame | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      const job: Job = { request: { id: ++this.serial, document, inputs, draft: this.draft }, resolve, reject };
      if (this.active) { this.pending?.resolve(); this.pending = job; } else this.start(job);
    });
  }
  private start(job: Job) { this.active = job; this.worker.postMessage(job.request); }
  dispose() { this.disposed = true; this.worker.terminate(); this.active?.resolve(); this.pending?.resolve(); this.active = undefined; this.pending = undefined; }
}
