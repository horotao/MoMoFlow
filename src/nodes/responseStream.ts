/** Decode SSE at byte, UTF-8 and CRLF boundaries; ignore comments/keepalives. */
export async function* readSse(stream: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<Record<string, unknown>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let lines: string[] = [];
  let eventSize = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (pending.length > 2 * 1024 * 1024) throw new Error('流式响应过长。');
      // Complete the final event even if the transport omits its last blank line.
      if (done) pending += '\n\n';
      let end: number;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end).replace(/\r$/, '');
        pending = pending.slice(end + 1);
        if (line.startsWith('data:')) {
          const data = line.slice(5).replace(/^ /, '');
          eventSize += data.length;
          if (eventSize > 2 * 1024 * 1024) throw new Error('流式事件过长。');
          lines.push(data);
        } else if (!line && lines.length) {
          const data = lines.join('\n'); lines = []; eventSize = 0;
          if (data === '[DONE]') return;
          const event: unknown = JSON.parse(data);
          if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('流式事件格式无效。');
          yield event as Record<string, unknown>;
        }
      }
      if (done) return;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
