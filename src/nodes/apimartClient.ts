import { readImageApiResponse } from './apimartUpload.ts';
import { ModelRequestCancelled, ModelRequestTimeout, modelRequestError } from './modelRequestError.ts';

function waitForPoll(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 4000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function requestApimartImage<T>(
  path: string,
  input: { outputFormat: string; prompt: string; images: string[] },
  credentialHeaders: Record<string, string>,
  signal: AbortSignal,
  readResult: (result: { imageUrl?: unknown; format?: unknown }) => Promise<T>,
): Promise<T> {
  const call = async (endpoint: string, body: object) => {
    signal.throwIfAborted();
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...credentialHeaders }, signal, body: JSON.stringify(body),
    });
    const result = await readImageApiResponse(response);
    if (!response.ok) throw modelRequestError(result?.error || 'APIMart 请求失败。', response.status, result?.code);
    return result;
  };
  // Only the initial submit can create a billable task.
  const submitted = await call(path, input);
  const taskId: unknown = submitted?.taskId;
  if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(taskId)) throw new Error('APIMart 未返回有效任务编号，请检查请求记录后再手动重试。');
  try {
    for (;;) {
      await waitForPoll(signal);
      let result;
      try { result = await call('/api/apimart/task', { taskId, outputFormat: input.outputFormat }); }
      catch (error) { if (error instanceof ModelRequestTimeout && !signal.aborted) continue; throw error; }
      if (result?.status === 'cancelled') throw new ModelRequestCancelled('APIMart 任务已取消。');
      if (result?.status === 'completed') return await readResult(result);
      if (!['submitted', 'pending', 'processing'].includes(result?.status)) throw new Error('APIMart 返回了无效任务状态。');
    }
  } catch (error) {
    if (signal.aborted) throw error;
    const message = `${error instanceof Error ? error.message : 'APIMart 查询失败。'}\n任务编号：${taskId}`;
    if (error instanceof ModelRequestCancelled) throw new ModelRequestCancelled(message);
    throw new Error(message);
  }
}
