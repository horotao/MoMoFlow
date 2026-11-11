import type { IncomingMessage } from 'node:http';
import { apiProviders, validApiKey, validBaseUrl, type ApiCredential, type ApiProvider } from '../src/components/apiSettings.ts';
import { ApiConfigurationError, byokFetch } from './byokFetch.ts';

export function readRequestCredential(req: IncomingMessage, provider: ApiProvider): ApiCredential | undefined {
  const key = req.headers['x-momoflow-api-key'];
  const baseUrl = req.headers['x-momoflow-base-url'];
  const selected = req.headers['x-momoflow-provider'];
  if (key === undefined && baseUrl === undefined && selected === undefined) return undefined;
  if (selected !== provider || typeof key !== 'string' || !validApiKey(key)
    || typeof baseUrl !== 'string' || !validBaseUrl(baseUrl)) throw new ApiConfigurationError('API 配置无效，请重新保存对应渠道的配置');
  return { apiKey: key, baseUrl: baseUrl.replace(/\/+$/, '') };
}

export function providerConnection(req: IncomingMessage, provider: ApiProvider, defaultKey: string, providerFetch: typeof fetch) {
  const credential = readRequestCredential(req, provider);
  const baseUrl = apiProviders.find(item => item.id === provider)!.baseUrl;
  return {
    apiKey: credential?.apiKey ?? defaultKey,
    baseUrl: credential?.baseUrl ?? baseUrl,
    // Injected fetches keep middleware tests entirely offline.
    fetch: credential && providerFetch === globalThis.fetch ? byokFetch : providerFetch,
  };
}

export function zenmuxVertexBase(baseUrl: string) {
  // The UI stores the OpenAI-compatible base. Nano Banana uses the sibling
  // Vertex endpoint on the same configured gateway and path prefix.
  return `${baseUrl.replace(/\/v1\/?$/, '')}/vertex-ai/v1`;
}
