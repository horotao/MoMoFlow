import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Tick02Icon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { spring } from '../lib/springs';
import { SettingsMorphSelect } from './SettingsMorphSelect';
import { ApiConnectionError, apiProviders, readApiSettings, saveApiSettings, validApiKey, validBaseUrl, type ApiCredential, type ApiProvider } from './apiSettings';
import './NodeSettingsSidebar.css';
import './ApiSettingsDialog.css';

export type ApiConnectionTest = (provider: ApiProvider, credential: ApiCredential, signal: AbortSignal) => Promise<void>;
type Props = { open: boolean; onClose: () => void; onTestConnection?: ApiConnectionTest };
type FieldName = 'baseUrl' | 'apiKey';
type Feedback = { state: 'idle' | 'testing' | 'success' | 'error'; message: string };
const idle: Feedback = { state: 'idle', message: '' };

function ApiSettingsForm({ onClose, onTestConnection }: Omit<Props, 'open'>) {
  const id = useId();
  const reduceMotion = useReducedMotion();
  const [saved] = useState(readApiSettings);
  const [provider, setProvider] = useState<ApiProvider>(saved.provider);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(apiProviders.map(item => [item.id,
    saved.credentials[item.id] ?? { baseUrl: item.baseUrl, apiKey: '' },
  ])) as Record<ApiProvider, ApiCredential>);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [reveal, setReveal] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(idle);
  const request = useRef<AbortController | null>(null);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLDivElement | null>>>({});
  const animations = useRef<Partial<Record<FieldName, Animation>>>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const credential = drafts[provider];
  const valid = { baseUrl: validBaseUrl(credential.baseUrl), apiKey: validApiKey(credential.apiKey) };
  useEffect(() => () => {
    request.current?.abort();
    clearTimeout(timeoutRef.current);
    Object.values(animations.current).forEach(animation => animation?.cancel());
  }, []);

  const resetFeedback = () => {
    request.current?.abort();
    clearTimeout(timeoutRef.current);
    request.current = null;
    setFeedback(idle);
  };
  const shake = (field: FieldName) => {
    animations.current[field]?.cancel();
    if (reduceMotion) return;
    animations.current[field] = fieldRefs.current[field]?.animate(
      [0, -4, 4, -3, 3, 0].map(x => ({ transform: `translateX(${x}px)` })),
      { duration: spring.slow.duration * 1000, easing: 'ease-in-out' },
    );
  };
  const validate = () => {
    if (!credential.apiKey) { setTouched({}); return true; }
    setTouched({ baseUrl: true, apiKey: true });
    for (const field of ['baseUrl', 'apiKey'] as const) if (!valid[field]) shake(field);
    if (!valid.baseUrl || !valid.apiKey) {
      fieldRefs.current[!valid.baseUrl ? 'baseUrl' : 'apiKey']?.querySelector('input')?.focus();
      return false;
    }
    return true;
  };
  const testConnection = async () => {
    if (request.current) return;
    if (!validate()) return;
    if (!onTestConnection) { setFeedback({ state: 'error', message: '连接测试尚未接入' }); return; }
    const controller = new AbortController();
    request.current = controller;
    setFeedback({ state: 'testing', message: '' });
    const timeout = setTimeout(() => {
      if (request.current !== controller) return;
      request.current = null;
      controller.abort();
      setFeedback({ state: 'error', message: '连接超时，请重试' });
    }, 10000);
    timeoutRef.current = timeout;
    try {
      await onTestConnection(provider, { ...credential }, controller.signal);
      if (request.current === controller) setFeedback({ state: 'success', message: '连接成功' });
    } catch (error) {
      if (request.current === controller && !controller.signal.aborted) setFeedback({ state: 'error', message: error instanceof ApiConnectionError ? error.message : '连接失败，请检查地址和 Key' });
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    try {
      const credentials = { ...readApiSettings().credentials };
      if (credential.apiKey) credentials[provider] = { ...credential, baseUrl: credential.baseUrl.replace(/\/+$/, '') };
      else delete credentials[provider];
      saveApiSettings({ provider, credentials });
      onClose();
    } catch { setFeedback({ state: 'error', message: '无法保存，请检查浏览器存储权限' }); }
  };
  return <form className="api-settings-form" onSubmit={save} noValidate>
    <header className="api-settings-header">
      <h2 id={`${id}-title`}>API 设置</h2><span className="api-settings-badge">BYOK</span>
      <button className="api-settings-close" type="button" aria-label="关闭 API 设置" onClick={onClose}>
        <img src="/api-settings/close.svg" alt="" />
      </button>
    </header>
    <div className="api-settings-fields">
      <div className="api-settings-field">
        <label id={`${id}-provider`}>渠道商</label>
        <SettingsMorphSelect value={provider} choices={apiProviders.map(item => item.id)} labels={apiProviders.map(item => item.label)}
          label="渠道商" menuLabel="选择渠道商" appearance="api" leading={provider === 'openai' ? <img src="/api-settings/openai.svg" alt="" /> : undefined}
          onChange={value => { resetFeedback(); setProvider(value as ApiProvider); setTouched({}); setReveal(false); }} />
      </div>
      {(['baseUrl', 'apiKey'] as const).map(field => {
        const key = field === 'apiKey';
        const invalid = Boolean(touched[field] && (credential.apiKey || credential[field]) && !valid[field]);
        const label = key ? 'API Key' : 'Base URL';
        const error = key ? 'API Key 不能包含空格、中文或不可见字符' : '请输入完整的 HTTPS 地址，不包含空格、中文、账号、查询参数或片段';
        return <div key={field} className="api-settings-field">
          <label htmlFor={`${id}-${field}`}>{label}</label>
          <div className="api-settings-input" data-invalid={invalid || undefined} ref={element => { fieldRefs.current[field] = element; }}>
            <input id={`${id}-${field}`} type={key && !reveal ? 'password' : 'text'} value={credential[field]}
              placeholder={key ? '输入 API Key' : 'https://api.openai.com/v1'} aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-${field}-error` : undefined} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={event => { resetFeedback(); setDrafts(current => ({ ...current, [provider]: { ...current[provider], [field]: event.target.value } })); }}
              onBlur={() => { setTouched(current => ({ ...current, [field]: true })); if (credential[field] && !valid[field]) shake(field); }} />
            <AnimatePresence initial={false}>
              {valid[field] && <motion.span className="api-settings-valid" aria-label={`${label} 格式正确`} initial={{ opacity: 0 }}
                animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
                <HugeiconsIcon icon={Tick02Icon} size={16} />
              </motion.span>}
            </AnimatePresence>
            {key && <button type="button" className="api-settings-reveal" aria-label={reveal ? '隐藏 API Key' : '显示 API Key'} aria-pressed={reveal}
              onClick={() => setReveal(current => !current)}>
              {reveal ? <HugeiconsIcon icon={ViewOffSlashIcon} size={20} /> : <img src="/api-settings/view.svg" alt="" />}
            </button>}
          </div>
          {invalid && <span id={`${id}-${field}-error`} className="api-settings-sr-only">{error}</span>}
        </div>;
      })}
    </div>
    <footer className="api-settings-actions">
      <div className="api-settings-test-group">
        <button type="button" className="api-settings-button" disabled={feedback.state === 'testing'} onClick={() => { void testConnection(); }}>
          {feedback.state === 'testing' && <span className="api-settings-spinner" aria-hidden="true" />}
          {feedback.state === 'testing' ? '测试中' : '测试连接'}
        </button>
        <span className="api-settings-feedback" data-state={feedback.state} role="status" aria-live="polite">{feedback.message}</span>
      </div>
      <button type="button" className="api-settings-button" onClick={onClose}>取消</button>
      <button type="submit" className="api-settings-button api-settings-save">保存</button>
    </footer>
  </form>;
}

export function ApiSettingsDialog({ open, onClose, onTestConnection }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reduceMotion = useReducedMotion();
  const openRef = useRef(open);
  openRef.current = open;
  useLayoutEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
  }, [open]);
  useEffect(() => () => { dialog.current?.close(); }, []);
  return createPortal(<dialog ref={dialog} className="api-settings-dialog" aria-label="API 设置" data-settings-select-host
    style={{ '--api-press-duration': `${spring.moderate.duration}s`, '--api-feedback-duration': `${spring.fast.duration}s` } as CSSProperties}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}
    onPointerDown={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <AnimatePresence onExitComplete={() => { if (!openRef.current) dialog.current?.close(); }}>
      {open && <motion.div key="api-settings" className="api-settings-panel" initial={{ opacity: 0, transform: reduceMotion ? 'none' : 'scale(0.97)' }}
        animate={{ opacity: 1, transform: reduceMotion ? 'none' : 'scale(1)' }}
        exit={{ opacity: 0, transform: reduceMotion ? 'none' : 'scale(0.97)', transition: spring.slow.exit }} transition={spring.slow}>
        <ApiSettingsForm onClose={onClose} onTestConnection={onTestConnection} />
      </motion.div>}
    </AnimatePresence>
  </dialog>, document.body);
}
