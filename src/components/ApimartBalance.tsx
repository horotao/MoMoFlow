import { useEffect, useState } from 'react';
import { apimartGenerationCompleted } from '../nodes/apimartGeneration';
import { apiCredentialHeaders, apiSettingsStorageKey } from './apiSettings';

const formatCredits = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ApimartBalance() {
  const [revision, setRevision] = useState(0);
  const [label, setLabel] = useState('查询中…');
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === apiSettingsStorageKey) refresh();
    };
    window.addEventListener(apiSettingsStorageKey, refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener(apimartGenerationCompleted, refresh);
    return () => {
      window.removeEventListener(apiSettingsStorageKey, refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(apimartGenerationCompleted, refresh);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLabel('查询中…');
      setError('');
      try {
        const response = await fetch('/api/apimart/balance', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...apiCredentialHeaders('apimart') },
          signal: controller.signal, cache: 'no-store',
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || typeof result?.credits !== 'number' || !Number.isFinite(result.credits)) {
          setLabel(response.status === 401 ? '未配置 Key' : '查询失败');
          setError(typeof result?.error === 'string' ? result.error : '无法读取 APIMart 余额');
          return;
        }
        setLabel(`${formatCredits.format(result.credits)} 积分`);
      } catch {
        if (!controller.signal.aborted) {
          setLabel('查询失败');
          setError('无法读取 APIMart 余额');
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  return <button type="button" className="navigation-credits" title={error || '刷新 APIMart 剩余积分'}
    aria-label={`APIMart 余额：${label}，点击刷新`} onClick={() => setRevision(value => value + 1)}>
    <span className="navigation-credit-icon" aria-hidden="true" />
    <span>{label}</span>
  </button>;
}
