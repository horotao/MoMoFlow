import { notifyApimartGenerationCompleted } from './apimartGeneration.ts';
import { modelTimeoutCode } from './modelRequestError.ts';
import { apimartResultUrl } from './apimartResult.ts';

const taskIdPattern = /^[a-zA-Z0-9_-]{1,200}$/;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function downloadMedia(url: unknown, signal: AbortSignal, label: string, mime: string, allowed: readonly string[], maxMiB: number) {
  const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
  const response = await fetch(apimartResultUrl(url), { signal: downloadSignal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`${label}结果下载失败（HTTP ${response.status}），不会重新提交任务。`);
  const declaredMime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (declaredMime && !allowed.includes(declaredMime) && declaredMime !== 'application/octet-stream') throw new Error(`APIMart 未返回有效的${label}文件。`);
  const limit = maxMiB * 1024 * 1024;
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`APIMart 返回了空${label}。`);
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get('content-length')) > limit) throw new Error(`${label}结果超过 ${maxMiB} MiB。`);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error(`${label}结果超过 ${maxMiB} MiB。`);
      parts.push(new Uint8Array(value));
    }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  signal.throwIfAborted();
  if (!size) throw new Error(`APIMart 返回了空${label}。`);
  return new Blob(parts, { type: mime });
}

export async function requestMediaTask<T>({ label, submitPath, taskPath, headers, input, signal, onSubmitted, onProgress, readResult }: {
  label: string; submitPath: string; taskPath: string; headers: Record<string, string>; input: object; signal: AbortSignal;
  onSubmitted: (taskId: string) => void; onProgress?: (fraction: number) => void;
  readResult: (data: Record<string, unknown>, taskId: string) => Promise<T>;
}): Promise<T> {
  const call = async (path: string, body: object, requestSignal: AbortSignal) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: requestSignal, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    return { response, data };
  };
  let taskId: string | undefined;
  try {
    const submitted = await call(submitPath, input,
      AbortSignal.any([signal, AbortSignal.timeout(70000)]));
    if (!submitted.response.ok) throw new Error(submitted.data?.error ?? `${label}提交失败（HTTP ${submitted.response.status}）。`);
    if (typeof submitted.data?.taskId !== 'string' || !taskIdPattern.test(submitted.data.taskId)) throw new Error('未收到有效任务编号，请先检查 APIMart 请求记录。');
    taskId = submitted.data.taskId as string;
    onSubmitted(taskId);
    const deadline = Date.now() + 30 * 60_000;
    while (Date.now() < deadline) {
      await sleep(5000, signal);
      let polled;
      try {
        polled = await call(taskPath, { taskId }, AbortSignal.any([signal, AbortSignal.timeout(30000)]));
      } catch {
        signal.throwIfAborted();
        continue; // Only retry polling; never submit another billable request.
      }
      const { response, data } = polled;
      if ([408, 429, 503, 504].includes(response.status) || [408, 429, 500, 502, 503, 504].includes(data?.diagnostic?.status) || data?.code === modelTimeoutCode) continue;
      if (!response.ok) throw new Error(data?.error ?? `${label}查询失败（HTTP ${response.status}）。`);
      if (data?.status === 'cancelled') throw new Error('APIMart 任务已取消。');
      if (['submitted', 'pending', 'processing'].includes(data?.status)) {
        if (typeof data.progress === 'number' && Number.isFinite(data.progress)) onProgress?.(Math.max(0, Math.min(1, data.progress / 100)));
        continue;
      }
      if (data?.status !== 'completed') throw new Error('APIMart 返回了未知任务状态。');
      notifyApimartGenerationCompleted();
      return await readResult(data, taskId);
    }
    throw new Error('已停止等待，任务可能仍在 APIMart 运行，请查请求记录。');
  } catch (cause) {
    signal.throwIfAborted();
    const reason = cause instanceof Error ? cause.message : label + '生成失败。';
    throw new Error(taskId ? `${reason}\n任务编号：${taskId}` : `${reason} 如提交结果不明，请先检查 APIMart 请求记录再重试。`);
  }
}
