export const apiProviders = [
  { id: 'openai', label: 'OpenAI 官方', baseUrl: 'https://api.openai.com/v1' },
  { id: 'zenmux', label: 'ZenMux', baseUrl: 'https://zenmux.ai/api/v1' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { id: 'wavespeed', label: 'WaveSpeed', baseUrl: 'https://api.wavespeed.ai/api/v3' },
] as const;
export type ApiProvider = typeof apiProviders[number]['id'];
export type ApiCredential = { baseUrl: string; apiKey: string };
export type ApiSettings = { provider: ApiProvider; credentials: Partial<Record<ApiProvider, ApiCredential>> };
export const apiSettingsStorageKey = 'momoflow-api-settings-v1';

export function validBaseUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value) || value.length > 2048 || /[^\x21-\x7e]/.test(value) || value.includes('\\')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
export const validApiKey = (value: string) => value.length > 0 && value.length <= 4096 && /^[\x21-\x7e]+$/.test(value);
export function readApiSettings(storage?: Pick<Storage, 'getItem'>): ApiSettings {
  const empty: ApiSettings = { provider: 'openai', credentials: {} };
  try {
    const data = JSON.parse((storage ?? globalThis.localStorage)?.getItem(apiSettingsStorageKey) ?? 'null');
    if (!data || typeof data !== 'object') return empty;
    const credentials: ApiSettings['credentials'] = {};
    for (const { id } of apiProviders) {
      const entry = data.credentials?.[id];
      if (entry && typeof entry.baseUrl === 'string' && typeof entry.apiKey === 'string'
        && validBaseUrl(entry.baseUrl) && validApiKey(entry.apiKey)) credentials[id] = { baseUrl: entry.baseUrl, apiKey: entry.apiKey };
    }
    return { provider: apiProviders.some(item => item.id === data.provider) ? data.provider : 'openai', credentials };
  } catch { return empty; }
}
export function saveApiSettings(settings: ApiSettings, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(apiSettingsStorageKey, JSON.stringify(settings));
}

export function apiCredentialHeaders(provider: ApiProvider): Record<string, string> {
  const credential = readApiSettings().credentials[provider];
  if (!credential) return {};
  return {
    'X-MoMoFlow-Provider': provider,
    'X-MoMoFlow-Api-Key': credential.apiKey,
    'X-MoMoFlow-Base-Url': credential.baseUrl,
  };
}

export class ApiConnectionError extends Error {}

export async function testApiConnection(provider: ApiProvider, credential: ApiCredential, signal: AbortSignal): Promise<void> {
  const response = await fetch('/api/settings/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, ...credential }), signal,
  });
  const result = await response.json().catch(() => { throw new ApiConnectionError('连接测试服务不可用'); });
  if (!response.ok || result?.ok !== true) throw new ApiConnectionError(typeof result?.error === 'string' ? result.error : '连接测试失败');
}
