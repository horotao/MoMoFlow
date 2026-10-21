import type { LevelsSettings } from './levels';
import type { LevelsReply, LevelsRequest } from './levelsProtocol';

type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;
type Job = {
  settings: LevelsSettings; exportPng: boolean; draft: boolean;
  resolve: (frame: LevelsReply | undefined) => void;
  reject: (error: Error) => void;
};

// At most one running frame and one waiting frame, even during rapid dragging.
export class LevelsRenderer {
  private active?: Job;
  private pending?: Job;
  private stopped = false;

  private worker: WorkerPort;

  constructor(source: ImageBitmap, worker: WorkerPort = new Worker(
    new URL('./levels.worker.ts', import.meta.url), { type: 'module' },
  )) {
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<LevelsReply>) => {
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
      this.active?.reject(new Error('色阶线程运行失败。'));
      this.dispose();
    };
    worker.postMessage({ type: 'source', source } satisfies LevelsRequest, [source]);
  }

  render(settings: LevelsSettings, exportPng: boolean, draft = false): Promise<LevelsReply | undefined> {
    if (this.stopped) return Promise.reject(new Error('色阶线程已关闭。'));
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
    this.worker.postMessage({ type: 'render', settings: job.settings, exportPng: job.exportPng, draft: job.draft } satisfies LevelsRequest);
  }

  dispose() {
    this.stopped = true;
    this.active?.resolve(undefined);
    this.pending?.resolve(undefined);
    this.active = this.pending = undefined;
    this.worker.terminate();
  }
}
