import type { MatteGrowShrinkSettings } from './matteGrowShrink';
import type { MatteGrowShrinkReply, MatteGrowShrinkRequest } from './matteGrowShrinkProtocol';

type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;
type Job = {
  settings: MatteGrowShrinkSettings; exportPng: boolean; draft: boolean;
  resolve: (frame: MatteGrowShrinkReply | undefined) => void;
  reject: (error: Error) => void;
};

// At most one running frame and one waiting frame, even during rapid dragging.
export class MatteGrowShrinkRenderer {
  private active?: Job;
  private pending?: Job;
  private stopped = false;

  private worker: WorkerPort;

  constructor(source: ImageBitmap, worker: WorkerPort = new Worker(
    new URL('./matteGrowShrink.worker.ts', import.meta.url), { type: 'module' },
  )) {
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<MatteGrowShrinkReply>) => {
      const frame = event.data;
      if (this.stopped) { frame.bitmap?.close(); return; }
      const job = this.active;
      this.active = undefined;
      if (frame.error) job?.reject(new Error(frame.error));
      else if (job) job.resolve(frame);
      else frame.bitmap?.close();
      const next = this.pending;
      this.pending = undefined;
      if (next) this.start(next);
    };
    worker.onerror = () => {
      this.active?.reject(new Error('蒙版扩张 / 收缩线程运行失败。'));
      this.dispose();
    };
    worker.postMessage({ type: 'source', source } satisfies MatteGrowShrinkRequest, [source]);
  }

  render(settings: MatteGrowShrinkSettings, exportPng: boolean, draft = false): Promise<MatteGrowShrinkReply | undefined> {
    if (this.stopped) return Promise.reject(new Error('蒙版扩张 / 收缩线程已关闭。'));
    return new Promise((resolve, reject) => {
      const job = { settings, exportPng, draft, resolve, reject };
      if (!this.active) this.start(job);
      else {
        this.pending?.resolve(undefined);
        this.pending = job;
      }
    });
  }

  private start(job: Job) {
    this.active = job;
    this.worker.postMessage({ type: 'render', settings: job.settings, exportPng: job.exportPng, draft: job.draft } satisfies MatteGrowShrinkRequest);
  }

  dispose() {
    this.stopped = true;
    this.active?.resolve(undefined);
    this.pending?.resolve(undefined);
    this.active = this.pending = undefined;
    this.worker.terminate();
  }
}
