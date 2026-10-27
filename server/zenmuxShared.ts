import type { IncomingMessage } from 'node:http';

export type ProviderDiagnostic = {
  status: number;
  requestId?: string;
  type?: string;
  code?: string;
  message?: string;
};

// Only retain diagnostic fields, never the raw response or echoed image payloads.
export function diagnosticText(value: unknown, apiKey: string, limit = 2000): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).split(apiKey).join('[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/data:[^\s"'<>]+/gi, '[image data redacted]')
    .replace(/[A-Za-z0-9+/=]{256,}/g, '[payload redacted]')
    .replace(/\p{Cc}/gu, ' ').trim();
  return text ? text.slice(0, limit) + (text.length > limit ? '… [truncated]' : '') : undefined;
}

// Log identifiers only: messages/stacks can echo prompts, images, URLs or headers.
export function logIdentifier(value: unknown, apiKey: string): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value);
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(text)) return undefined;
  return diagnosticText(text, apiKey, 200);
}

type ErrorDiagnostic = { name?: string; code?: string; causes?: ErrorDiagnostic[] };
export function errorDiagnostic(error: unknown, apiKey: string, depth = 0): ErrorDiagnostic | undefined {
  if (!error || typeof error !== 'object' || depth >= 3) return undefined;
  const value = error as { name?: unknown; code?: unknown; cause?: unknown; errors?: unknown };
  const nested = [value.cause, ...(Array.isArray(value.errors) ? value.errors.slice(0, 4) : [])];
  const causes = nested.map(cause => errorDiagnostic(cause, apiKey, depth + 1)).filter(cause => cause !== undefined);
  return {
    name: logIdentifier(value.name, apiKey), code: logIdentifier(value.code, apiKey),
    ...(causes.length ? { causes } : {}),
  };
}

export async function readErrorDiagnostic(response: Response, apiKey: string): Promise<Partial<ProviderDiagnostic>> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length <= 64 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 64 * 1024) return { message: '服务商错误响应过长，未保留正文。' };
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let body;
    try { body = JSON.parse(text); }
    catch {
      // Do not surface gateway HTML or broken JSON as a model error message.
      return /^[\s]*[<{[]/.test(text) ? {} : { message: diagnosticText(text, apiKey) };
    }
    const error = body?.error;
    return {
      type: diagnosticText(error?.type, apiKey, 200),
      code: diagnosticText(error?.code, apiKey, 200),
      message: diagnosticText(typeof error === 'string' ? error : error?.message ?? body?.message, apiKey),
      requestId: diagnosticText(body?.request_id ?? body?.requestId ?? error?.request_id, apiKey, 200),
    };
  } catch { return {}; }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function trusted(req: IncomingMessage) {
  const host = req.headers.host;
  const match = host?.match(/^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return false;
  const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
  return req.headers.origin === undefined || req.headers.origin === `${protocol}://${host}`;
}
