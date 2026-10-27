import type { MaskPredictor, MaskProgress } from './masksInference';
import type { MaskBitmap, MaskPoint } from './masksExtractor';

type Candidate = {
  inputId: string; url: string; point: MaskPoint; controller: AbortController;
  promise: Promise<MaskBitmap>; settled: boolean;
  listeners: Set<(progress: MaskProgress) => void>;
};

// One candidate per node. A click at the hovered point can adopt either the
// completed mask or the in-flight inference without submitting another GPU job.
export function cacheMaskCandidate(predict: MaskPredictor): MaskPredictor {
  let current: Candidate | undefined;
  return (source, point, options) => {
    if (options.signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    if (!current || current.controller.signal.aborted || options.recalculate
      || current.inputId !== source.id || current.url !== source.url
      || current.point.x !== point.x || current.point.y !== point.y) {
      current?.controller.abort();
      const controller = new AbortController(), listeners = new Set<(progress: MaskProgress) => void>();
      const candidate: Candidate = {
        inputId: source.id, url: source.url, point, controller, listeners, settled: false,
        promise: Promise.resolve().then(() => predict(source, point, { ...options, signal: controller.signal,
          onProgress: progress => { for (const listener of listeners) listener(progress); } })),
      };
      current = candidate;
      void candidate.promise.then(() => { candidate.settled = true; }, () => {
        candidate.settled = true;
        if (current === candidate) current = undefined;
      });
    }
    const candidate = current;
    return new Promise<MaskBitmap>((resolve, reject) => {
      // Give each subscriber its own listener, even if callbacks are reused.
      const progress = (value: MaskProgress) => options.onProgress(value);
      const finish = () => {
        candidate.listeners.delete(progress);
        options.signal.removeEventListener('abort', abort);
        // The click replaces the hover subscriber in this same turn. Only cancel
        // the GPU work when no caller adopts it before the microtask boundary.
        queueMicrotask(() => {
          if (!candidate.settled && !candidate.listeners.size) {
            candidate.controller.abort();
            if (current === candidate) current = undefined;
          }
        });
      };
      const abort = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')); };
      candidate.listeners.add(progress);
      options.signal.addEventListener('abort', abort, { once: true });
      void candidate.promise.then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
    });
  };
}
