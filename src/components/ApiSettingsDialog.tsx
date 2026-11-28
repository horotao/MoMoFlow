import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  RotateClockwiseIcon,
  Tick02Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons';
import { OverlayScrollbars } from './ui/scroll-area';
import {
  ApiConnectionError,
  apiProviders,
  readApiSettings,
  saveApiSettings,
  validApiKey,
  validBaseUrl,
  type ApiCredential,
  type ApiProvider,
} from './apiSettings';
import './ApiSettingsDialog.css';

export type ApiConnectionTest = (provider: ApiProvider, credential: ApiCredential, signal: AbortSignal) => Promise<void>;
type Props = { open: boolean; onClose: () => void; onTestConnection?: ApiConnectionTest };
type FieldName = 'baseUrl' | 'apiKey';
type Feedback = { state: 'idle' | 'testing' | 'success' | 'error'; message: string };

const idle: Feedback = { state: 'idle', message: '' };
const easeOut = [0.23, 1, 0.32, 1] as const;

const modalEnter = { duration: 0.24, ease: easeOut };
const modalExit = { duration: 0.16, ease: easeOut };
const menuEnter = { duration: 0.18, ease: easeOut };
const menuExit = { duration: 0.13, ease: easeOut };
const stateEnter = { duration: 0.16, ease: easeOut };
const stateExit = { duration: 0.12, ease: easeOut };
const tooltipEnter = { duration: 0.125, ease: easeOut };
const tooltipExit = { duration: 0.1, ease: easeOut };

function ApiSettingsForm({ onClose, onTestConnection }: Omit<Props, 'open'>) {
  const id = useId();
  const reduceMotion = useReducedMotion();
  const [saved] = useState(readApiSettings);
  const [provider, setProvider] = useState<ApiProvider>(saved.provider);
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      apiProviders.map(item => [
        item.id,
        saved.credentials[item.id] ?? { baseUrl: item.baseUrl, apiKey: '' },
      ]),
    ) as Record<ApiProvider, ApiCredential>,
  );
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [reveal, setReveal] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(idle);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);

  const request = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const selectWrapRef = useRef<HTMLDivElement>(null);
  const selectTriggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLDivElement | null>>>({});
  const animations = useRef<Partial<Record<FieldName, Animation>>>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const activeIndex = Math.max(0, apiProviders.findIndex(item => item.id === provider));
  const activeMeta = apiProviders[activeIndex] ?? apiProviders[0];
  const credential = drafts[provider];
  const savedCredential = saved.credentials[provider];
  const valid = {
    baseUrl: validBaseUrl(credential.baseUrl),
    apiKey: validApiKey(credential.apiKey),
  };
  const isCustomBaseUrl = credential.baseUrl !== activeMeta.baseUrl;
  const isDirty =
    (savedCredential?.apiKey ?? '') !== credential.apiKey ||
    (savedCredential?.baseUrl ?? activeMeta.baseUrl) !== credential.baseUrl.replace(/\/+$/, '');

  useEffect(() => () => {
    request.current?.abort();
    clearTimeout(timeoutRef.current);
    clearTimeout(tooltipTimerRef.current);
    Object.values(animations.current).forEach(animation => animation?.cancel());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!selectWrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (menuOpen) listboxRef.current?.focus({ preventScroll: true });
  }, [menuOpen]);

  const resetFeedback = () => {
    request.current?.abort();
    clearTimeout(timeoutRef.current);
    request.current = null;
    setFeedback(idle);
  };

  const openMenu = () => {
    setActiveOption(activeIndex);
    setMenuOpen(true);
  };

  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) selectTriggerRef.current?.focus({ preventScroll: true });
  };

  const selectProvider = (next: ApiProvider) => {
    closeMenu(true);
    if (next === provider) return;
    resetFeedback();
    setProvider(next);
    setTouched({});
    setReveal(false);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (menuOpen) closeMenu(true);
      else openMenu();
    }
  };

  const onListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const count = apiProviders.length;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const target = apiProviders[activeOption];
      if (target) selectProvider(target.id);
      return;
    }
    let next = activeOption;
    if (event.key === 'ArrowDown') next = (activeOption + 1) % count;
    else if (event.key === 'ArrowUp') next = (activeOption - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;
    event.preventDefault();
    setActiveOption(next);
  };

  const shake = (field: FieldName) => {
    animations.current[field]?.cancel();
    if (reduceMotion) return;
    animations.current[field] = fieldRefs.current[field]?.animate(
      [0, -4, 4, -3, 2, 0].map(x => ({ transform: `translateX(${x}px)` })),
      { duration: 280, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    );
  };

  const validate = () => {
    if (!credential.apiKey) {
      setTouched({});
      return true;
    }
    setTouched({ baseUrl: true, apiKey: true });
    for (const field of ['baseUrl', 'apiKey'] as const) {
      if (!valid[field]) shake(field);
    }
    if (!valid.baseUrl || !valid.apiKey) {
      fieldRefs.current[!valid.baseUrl ? 'baseUrl' : 'apiKey']?.querySelector('input')?.focus();
      return false;
    }
    return true;
  };

  const testConnection = async () => {
    if (request.current) return;
    if (!validate()) return;
    if (!onTestConnection) {
      setFeedback({ state: 'error', message: '连接测试尚未接入' });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setFeedback({ state: 'testing', message: '正在验证连接…' });
    const timeout = setTimeout(() => {
      if (request.current !== controller) return;
      request.current = null;
      controller.abort();
      setFeedback({ state: 'error', message: '连接超时，请重试' });
    }, 10000);
    timeoutRef.current = timeout;
    try {
      await onTestConnection(provider, { ...credential }, controller.signal);
      if (request.current === controller) {
        setFeedback({ state: 'success', message: '连接成功，配置可用' });
      }
    } catch (error) {
      if (request.current === controller && !controller.signal.aborted) {
        setFeedback({
          state: 'error',
          message: error instanceof ApiConnectionError ? error.message : '连接失败，请检查地址和 Key',
        });
      }
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
      if (credential.apiKey) {
        credentials[provider] = {
          ...credential,
          baseUrl: credential.baseUrl.replace(/\/+$/, ''),
        };
      } else {
        delete credentials[provider];
      }
      saveApiSettings({ provider, credentials });
      onClose();
    } catch {
      setFeedback({ state: 'error', message: '无法保存，请检查浏览器存储权限' });
    }
  };

  const keyHint = savedCredential
    ? credential.apiKey
      ? isDirty
        ? '已修改 · 待保存'
        : '已保存'
      : '保存后恢复默认'
    : credential.apiKey
      ? '待保存'
      : '';

  const showInfoDelayed = () => {
    clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => setInfoOpen(true), 180);
  };

  const hideInfo = () => {
    clearTimeout(tooltipTimerRef.current);
    setInfoOpen(false);
  };

  const testLabel =
    feedback.state === 'testing'
      ? '测试中'
      : feedback.state === 'success'
        ? '重新测试'
        : '测试连接';

  return (
    <>
      <form
        ref={formRef}
        className="api-settings-form shared-scroll-viewport"
        data-orientation="vertical"
        onSubmit={save}
        noValidate
      >
        <header className="api-settings-header">
          <div className="api-settings-title-group">
            <div className="api-settings-title-row">
              <h2 id={`${id}-title`}>API 设置</h2>
              <span className="api-settings-badge">BYOK</span>
            </div>
            <p className="api-settings-subtitle">
              自定义密钥仅保存在本地浏览器
            </p>
          </div>
          <button
            className="api-settings-close"
            type="button"
            aria-label="关闭 API 设置"
            onClick={onClose}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </header>

        <div className="api-settings-body">
          <div className="api-settings-field">
            <div className="api-settings-label-row">
              <span id={`${id}-provider`} className="api-settings-label">
                渠道商
              </span>
            </div>

            <div ref={selectWrapRef} className="api-settings-select-wrap">
              <button
                ref={selectTriggerRef}
                type="button"
                role="combobox"
                aria-labelledby={`${id}-provider`}
                aria-expanded={menuOpen}
                aria-haspopup="listbox"
                aria-controls={menuOpen ? `${id}-provider-list` : undefined}
                className="api-settings-select"
                onClick={() => (menuOpen ? closeMenu(false) : openMenu())}
                onKeyDown={onTriggerKeyDown}
              >
                <span className="api-settings-select-value">{activeMeta.label}</span>
                {validApiKey(drafts[provider].apiKey) && (
                  <span className="api-settings-select-tag">已配置</span>
                )}
                <span className="api-settings-select-chevron" data-open={menuOpen || undefined} aria-hidden="true">
                  <HugeiconsIcon icon={ArrowDown01Icon} size={16} />
                </span>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    key="provider-menu"
                    className="api-settings-select-menu"
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, transform: 'scale(0.96) translateY(-4px)' }
                    }
                    animate={
                      reduceMotion
                        ? { opacity: 1, transition: menuEnter }
                        : { opacity: 1, transform: 'scale(1) translateY(0px)', transition: menuEnter }
                    }
                    exit={
                      reduceMotion
                        ? { opacity: 0, transition: menuExit }
                        : { opacity: 0, transform: 'scale(0.96) translateY(-4px)', transition: menuExit }
                    }
                  >
                    <div
                      ref={listboxRef}
                      id={`${id}-provider-list`}
                      role="listbox"
                      aria-label="选择渠道商"
                      aria-activedescendant={`${id}-provider-opt-${activeOption}`}
                      tabIndex={-1}
                      className="api-settings-select-list"
                      onKeyDown={onListboxKeyDown}
                    >
                      {apiProviders.map((item, index) => {
                        const selected = item.id === provider;
                        const configured = validApiKey(drafts[item.id].apiKey);
                        return (
                          <div
                            key={item.id}
                            id={`${id}-provider-opt-${index}`}
                            role="option"
                            aria-selected={selected}
                            data-active={index === activeOption ? 'true' : undefined}
                            className="api-settings-select-option"
                            onMouseEnter={() => setActiveOption(index)}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => selectProvider(item.id)}
                          >
                            <span className="api-settings-select-option-label">{item.label}</span>
                            <span className="api-settings-select-option-meta">
                              {configured && <span className="api-settings-select-tag">已配置</span>}
                              {selected && (
                                <span className="api-settings-select-check" aria-hidden="true">
                                  <HugeiconsIcon icon={Tick02Icon} size={14} />
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="api-settings-fields-section">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={provider}
                className="api-settings-fields"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(3px)' }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-2px)' }}
                transition={stateEnter}
              >
                {(['baseUrl', 'apiKey'] as const).map(field => {
                  const isKey = field === 'apiKey';
                  const invalid = Boolean(
                    touched[field] && (credential.apiKey || credential[field]) && !valid[field],
                  );
                  const label = isKey ? 'API Key' : 'Base URL';
                  const error = isKey
                    ? 'API Key 不能包含空格、中文或不可见字符'
                    : '请输入完整的 HTTPS 地址，不含空格、中文或查询参数';

                  return (
                    <div key={field} className="api-settings-field">
                      <div className="api-settings-label-row">
                        <span className="api-settings-label-with-info">
                          <label htmlFor={`${id}-${field}`} className="api-settings-label">
                            {label}
                          </label>
                          {isKey && (
                            <span className="api-settings-info-wrap">
                              <button
                                type="button"
                                className="api-settings-info-trigger"
                                aria-label="API Key 说明"
                                aria-describedby={infoOpen ? `${id}-key-tooltip` : undefined}
                                onMouseEnter={showInfoDelayed}
                                onMouseLeave={hideInfo}
                                onFocus={() => {
                                  clearTimeout(tooltipTimerRef.current);
                                  setInfoOpen(true);
                                }}
                                onBlur={hideInfo}
                                onKeyDown={event => {
                                  if (event.key === 'Escape' && infoOpen) {
                                    event.stopPropagation();
                                    hideInfo();
                                  }
                                }}
                              >
                                <HugeiconsIcon icon={InformationCircleIcon} size={14} />
                              </button>
                              <AnimatePresence>
                                {infoOpen && (
                                  <motion.span
                                    key="api-key-tooltip"
                                    id={`${id}-key-tooltip`}
                                    role="tooltip"
                                    className="api-settings-tooltip"
                                    initial={
                                      reduceMotion
                                        ? { opacity: 0 }
                                        : { opacity: 0, transform: 'translate(-50%, 2px) scale(0.97)' }
                                    }
                                    animate={
                                      reduceMotion
                                        ? { opacity: 1, transition: tooltipEnter }
                                        : {
                                            opacity: 1,
                                            transform: 'translate(-50%, 0px) scale(1)',
                                            transition: tooltipEnter,
                                          }
                                    }
                                    exit={
                                      reduceMotion
                                        ? { opacity: 0, transition: tooltipExit }
                                        : {
                                            opacity: 0,
                                            transform: 'translate(-50%, 2px) scale(0.97)',
                                            transition: tooltipExit,
                                          }
                                    }
                                  >
                                    留空使用默认服务
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </span>
                          )}
                        </span>
                        {!isKey && isCustomBaseUrl && (
                          <button
                            type="button"
                            className="api-settings-reset"
                            onClick={() => {
                              resetFeedback();
                              setDrafts(current => ({
                                ...current,
                                [provider]: { ...current[provider], baseUrl: activeMeta.baseUrl },
                              }));
                              setTouched(current => ({ ...current, baseUrl: false }));
                            }}
                          >
                            <HugeiconsIcon icon={RotateClockwiseIcon} size={12} />
                            <span>恢复默认</span>
                          </button>
                        )}
                        {isKey && keyHint && <span className="api-settings-hint">{keyHint}</span>}
                      </div>

                      <div className="api-settings-control-stack">
                        <div
                          className="api-settings-input"
                          data-invalid={invalid || undefined}
                          ref={element => {
                            fieldRefs.current[field] = element;
                          }}
                        >
                          <input
                            id={`${id}-${field}`}
                            type={isKey && !reveal ? 'password' : 'text'}
                            value={credential[field]}
                            placeholder={isKey ? '输入 API Key' : activeMeta.baseUrl}
                            aria-invalid={invalid}
                            aria-describedby={invalid ? `${id}-${field}-error` : undefined}
                            autoComplete="off"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            onChange={event => {
                              resetFeedback();
                              setDrafts(current => ({
                                ...current,
                                [provider]: { ...current[provider], [field]: event.target.value },
                              }));
                            }}
                            onBlur={() => {
                              setTouched(current => ({ ...current, [field]: true }));
                              if (credential[field] && !valid[field]) shake(field);
                            }}
                          />

                          {isKey && (
                            <button
                              type="button"
                              className="api-settings-reveal"
                              aria-label={reveal ? '隐藏 API Key' : '显示 API Key'}
                              aria-pressed={reveal}
                              onClick={() => setReveal(current => !current)}
                            >
                              <AnimatePresence mode="wait" initial={false}>
                                <motion.span
                                  key={reveal ? 'hide' : 'show'}
                                  className="api-settings-icon-swap"
                                  initial={
                                    reduceMotion
                                      ? { opacity: 0 }
                                      : { opacity: 0, transform: 'scale(0.9)', filter: 'blur(2px)' }
                                  }
                                  animate={
                                    reduceMotion
                                      ? { opacity: 1 }
                                      : { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }
                                  }
                                  exit={
                                    reduceMotion
                                      ? { opacity: 0, transition: stateExit }
                                      : {
                                          opacity: 0,
                                          transform: 'scale(0.9)',
                                          filter: 'blur(2px)',
                                          transition: stateExit,
                                        }
                                  }
                                  transition={stateEnter}
                                >
                                  <HugeiconsIcon
                                    icon={reveal ? ViewOffSlashIcon : ViewIcon}
                                    size={16}
                                  />
                                </motion.span>
                              </AnimatePresence>
                            </button>
                          )}
                        </div>

                        <div
                          className="api-settings-error-collapse"
                          data-open={invalid ? 'true' : 'false'}
                        >
                          <div className="api-settings-error-inner">
                            {invalid && (
                              <span id={`${id}-${field}-error`} className="api-settings-error">
                                <HugeiconsIcon icon={AlertCircleIcon} size={14} />
                                <span>{error}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>

            <div
              className="api-settings-feedback-collapse"
              data-open={feedback.state !== 'idle' ? 'true' : 'false'}
            >
              <div className="api-settings-feedback-inner">
                <div
                  className="api-settings-feedback"
                  data-state={feedback.state}
                  role="status"
                  aria-live="polite"
                >
                  {feedback.state === 'testing' && (
                    <span className="api-settings-spinner" aria-hidden="true" />
                  )}
                  {feedback.state === 'success' && (
                    <span className="api-settings-feedback-icon" aria-hidden="true">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} />
                    </span>
                  )}
                  {feedback.state === 'error' && (
                    <span className="api-settings-feedback-icon" aria-hidden="true">
                      <HugeiconsIcon icon={AlertCircleIcon} size={16} />
                    </span>
                  )}
                  <span>{feedback.message}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="api-settings-actions">
          <div className="api-settings-test-group">
            <button
              type="button"
              className="api-settings-button api-settings-test-button"
              disabled={feedback.state === 'testing'}
              onClick={() => {
                void testConnection();
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={feedback.state === 'testing' ? 'testing' : testLabel}
                  className="api-settings-button-content"
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: 'blur(2px)' }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { opacity: 1, filter: 'blur(0px)' }
                  }
                  exit={
                    reduceMotion
                      ? { opacity: 0, transition: stateExit }
                      : { opacity: 0, filter: 'blur(2px)', transition: stateExit }
                  }
                  transition={stateEnter}
                >
                  {feedback.state === 'testing' && (
                    <span className="api-settings-spinner" aria-hidden="true" />
                  )}
                  <span>{testLabel}</span>
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
          <button type="button" className="api-settings-button api-settings-cancel" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="api-settings-button api-settings-save">
            保存
          </button>
        </footer>
      </form>
      <OverlayScrollbars viewportRef={formRef} />
    </>
  );
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

  useEffect(() => () => {
    dialog.current?.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      className="api-settings-dialog"
      aria-label="API 设置"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={event => event.stopPropagation()}
    >
      <AnimatePresence
        onExitComplete={() => {
          if (!openRef.current) dialog.current?.close();
        }}
      >
        {open && (
          <motion.div
            key="api-settings-backdrop"
            className="api-settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: modalEnter }}
            exit={{ opacity: 0, transition: modalExit }}
            onPointerDown={event => {
              if (event.target === event.currentTarget) onClose();
            }}
          />
        )}
        {open && (
          <motion.div
            key="api-settings"
            className="api-settings-panel"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.96)' }}
            animate={
              reduceMotion
                ? { opacity: 1, transition: modalEnter }
                : { opacity: 1, transform: 'scale(1)', transition: modalEnter }
            }
            exit={
              reduceMotion
                ? { opacity: 0, transition: modalExit }
                : { opacity: 0, transform: 'scale(0.97)', transition: modalExit }
            }
          >
            <ApiSettingsForm onClose={onClose} onTestConnection={onTestConnection} />
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>,
    document.body,
  );
}
