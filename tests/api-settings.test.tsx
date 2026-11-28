import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { CanvasSidebar } from '../src/components/CanvasSidebar';
import { ApiSettingsDialog, type ApiConnectionTest } from '../src/components/ApiSettingsDialog';
import { apiSettingsStorageKey, readApiSettings } from '../src/components/apiSettings';
import '../src/index.css';

type Mode = 'unavailable' | 'success' | 'failure' | 'timeout' | 'deferred';
let mode: Mode = 'unavailable';
let finish: (() => void) | undefined;
let lastSignal: AbortSignal | undefined;
let calls = 0;
let setMode: (mode: Mode) => void;

const testConnection: ApiConnectionTest = async (_provider, _credential, signal) => {
  lastSignal = signal;
  calls++;
  if (mode === 'timeout' || mode === 'deferred') {
    return new Promise<void>(resolve => {
      finish = resolve;
    });
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  if (mode === 'failure') throw new Error('test-only upstream error with secret that must not appear');
};

function Harness() {
  const [open, setOpen] = useState(false);
  const [currentMode, updateMode] = useState<Mode>('success');
  setMode = next => {
    mode = next;
    updateMode(next);
  };
  const addTrigger = useRef<HTMLButtonElement>(null);
  return (
    <MotionConfig reducedMotion="user">
      <div className="qa-controls">
        <span>仅模拟状态，不发送 API 请求</span>
        <select
          aria-label="模拟测试状态"
          value={currentMode}
          onChange={event => setMode(event.target.value as Mode)}
        >
          <option value="success">成功</option>
          <option value="failure">失败</option>
          <option value="unavailable">尚未接入</option>
          <option value="timeout">超时（10秒）</option>
        </select>
        <button onClick={() => setOpen(true)}>打开弹窗</button>
      </div>
      <CanvasSidebar
        tool="select"
        onToolChange={() => {}}
        addTrigger={addTrigger}
        menuOpen={false}
        onAddMenu={() => {}}
        onApiSettings={() => setOpen(true)}
      />
      <ApiSettingsDialog
        open={open}
        onClose={() => setOpen(false)}
        onTestConnection={currentMode === 'unavailable' ? undefined : testConnection}
      />
    </MotionConfig>
  );
}

const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const wait = async (ms: number) => {
  await new Promise(resolve => setTimeout(resolve, ms));
  await settle();
};
const find = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
const checks: string[] = [];
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  checks.push(message);
}
const keyField = () => find<HTMLInputElement>('input[id$="-apiKey"]');
const urlField = () => find<HTMLInputElement>('input[id$="-baseUrl"]');
const click = async (selector: string) => {
  find<HTMLButtonElement>(selector).click();
  await settle();
};
const input = async (field: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
};
const blur = async (field: HTMLInputElement) => {
  field.focus();
  field.blur();
  await settle();
};
const open = async () => {
  await click('.canvas-sidebar [aria-label="更多"]');
  check(
    Boolean(document.querySelector('#canvas-more-menu.node-add-menu [role="menuitem"]')),
    'More reuses the canvas context menu component',
  );
  await click('#canvas-more-menu [role="menuitem"]');
  await wait(300);
};
const cancel = async () => {
  await click('.api-settings-close');
  await wait(240);
};

async function run() {
  const previous = localStorage.getItem(apiSettingsStorageKey);
  localStorage.removeItem(apiSettingsStorageKey);
  try {
    createRoot(find('#root')).render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    await settle();
    setMode('unavailable');
    await settle();
    await open();

    const dialog = find<HTMLDialogElement>('.api-settings-dialog');
    const panel = find('.api-settings-panel');
    const backdrop = find('.api-settings-backdrop');
    check(dialog.open && dialog.matches(':modal'), 'API settings use a native modal that isolates canvas input');
    check(
      Math.abs(panel.getBoundingClientRect().width - Math.min(480, innerWidth - 32)) < 1 &&
        getComputedStyle(panel).borderRadius === '24px',
      'Modal uses the compact 480px width and 24px radius',
    );
    check(
      getComputedStyle(backdrop).backdropFilter === 'blur(8px)' &&
        getComputedStyle(backdrop).opacity === '1',
      'Animated backdrop uses the 8px blur token and fades in with the panel',
    );
    check(
      find('.api-settings-input').getBoundingClientRect().height === 36 &&
        find('.api-settings-select').getBoundingClientRect().height === 36 &&
        getComputedStyle(keyField()).fontSize === '14px',
      'Inputs and provider dropdown share 36px height and 14px body typography',
    );
    check(keyField().type === 'password' && !keyField().value, 'Key starts empty and masked');
    check(!dialog.textContent?.includes('留空使用默认服务'), 'Default service hint stays hidden until info icon is hovered or focused');
    find<HTMLButtonElement>('.api-settings-info-trigger').focus();
    await wait(160);
    check(
      find('.api-settings-tooltip').textContent === '留空使用默认服务',
      'Info icon beside API Key reveals the default-service tooltip',
    );
    find<HTMLButtonElement>('.api-settings-info-trigger').blur();
    await wait(140);

    await input(keyField(), 'bad key');
    check(keyField().getAttribute('aria-invalid') === 'false', 'First entry does not show errors mid-typing');
    await blur(keyField());
    check(
      keyField().getAttribute('aria-invalid') === 'true' &&
        find('.api-settings-error').textContent?.includes('API Key'),
      'Whitespace triggers the destructive border and visible inline error message on blur',
    );

    await input(keyField(), 'sk-test-only');
    await wait(200);
    check(
      keyField().getAttribute('aria-invalid') === 'false' &&
        Boolean(find('.api-settings-select').textContent?.includes('已配置')),
      'Valid key clears errors quietly and marks the active provider as configured',
    );

    await click('.api-settings-reveal');
    check(keyField().type === 'text', 'Reveal key toggles visibility');
    await click('.api-settings-reveal');
    check(keyField().type === 'password', 'Hide key restores masking');

    await input(urlField(), 'https://api.example.com/中文');
    await blur(urlField());
    check(
      urlField().getAttribute('aria-invalid') === 'true' && Boolean(document.querySelector('.api-settings-reset')),
      'Invalid custom URL shows error and exposes inline reset-to-default control',
    );
    await click('.api-settings-reset');
    check(
      urlField().value === 'https://api.openai.com/v1' && urlField().getAttribute('aria-invalid') === 'false',
      'Reset button restores provider default URL and clears invalid state',
    );

    await click('.api-settings-test-group button');
    check(
      find('.api-settings-feedback').textContent === '连接测试尚未接入' && calls === 0,
      'UI-only entry never reports a fabricated connection success',
    );

    // Open provider dropdown and verify concentric radii + options
    await click('.api-settings-select');
    await wait(220);
    const menu = find('.api-settings-select-menu');
    const options = Array.from(menu.querySelectorAll<HTMLElement>('[role="option"]'));
    check(
      options.map(row => row.querySelector('.api-settings-select-option-label')?.textContent?.trim()).join(',') ===
        'OpenAI 官方,APIMart,DeepSeek',
      'Provider dropdown lists all active BYOK providers',
    );
    check(
      getComputedStyle(menu).borderRadius === '12px' &&
        options.every(row => getComputedStyle(row).borderRadius === '8px'),
      'Dropdown menu uses concentric 12px/8px radii',
    );
    check(
      Boolean(options[0].textContent?.includes('已配置')) && !options[1].textContent?.includes('已配置'),
      'Configured provider shows a subtle neutral tag in the dropdown list',
    );

    // Select APIMart
    options[1].click();
    await wait(220);
    check(
      !document.querySelector('.api-settings-select-menu') &&
        urlField().value === 'https://api.apimart.ai/v1' &&
        keyField().value === '',
      'Selecting provider closes menu and updates URL without carrying another provider key',
    );

    // Reopen dropdown via keyboard and switch back to OpenAI
    find('.api-settings-select').focus();
    find('.api-settings-select').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await wait(220);
    const listbox = find('.api-settings-select-list');
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await settle();
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(220);
    check(keyField().value === 'sk-test-only', 'Switching back with keyboard restores the current provider draft');

    setMode('success');
    await settle();
    await click('.api-settings-test-group button');
    check(
      find<HTMLButtonElement>('.api-settings-test-group button').disabled &&
        Boolean(document.querySelector('.api-settings-spinner')),
      'Testing displays loading feedback and prevents duplicate clicks',
    );
    await wait(360);
    check(
      find('.api-settings-feedback').textContent === '连接成功，配置可用',
      'Simulated success appears in the neutral status strip',
    );

    setMode('failure');
    await settle();
    await click('.api-settings-test-group button');
    await wait(360);
    check(
      find('.api-settings-feedback').textContent === '连接失败，请检查地址和 Key' &&
        !dialog.textContent?.includes('upstream'),
      'Simulated failure uses concise local copy without echoing provider secrets',
    );

    setMode('deferred');
    await settle();
    await click('.api-settings-test-group button');
    await input(keyField(), 'sk-edited-only');
    check(lastSignal?.aborted, 'Editing credentials cancels the previous test');
    finish?.();
    await settle();
    check(!find('.api-settings-feedback').textContent, 'Late test responses cannot replace feedback for changed credentials');

    setMode('timeout');
    await settle();
    await click('.api-settings-test-group button');
    await wait(10100);
    check(
      lastSignal?.aborted && find('.api-settings-feedback').textContent === '连接超时，请重试',
      'Timeout releases loading state and exposes a retryable result',
    );

    await click('.api-settings-save');
    await wait(240);
    check(
      !dialog.open && readApiSettings().credentials.openai?.apiKey === 'sk-edited-only',
      'Save persists this provider and closes the modal',
    );

    await open();
    check(
      keyField().value === 'sk-edited-only' && keyField().type === 'password',
      'Reopening restores the saved credential masked',
    );

    await input(keyField(), 'sk-discard-only');
    await cancel();
    await open();
    check(keyField().value === 'sk-edited-only', 'Cancel discards unsaved changes');

    await input(keyField(), '');
    await click('.api-settings-save');
    await wait(240);
    check(
      !readApiSettings().credentials.openai,
      'Clearing a saved Key removes only that channel override and restores server defaults',
    );

    await open();
    check(
      keyField().value === '' && keyField().getAttribute('aria-invalid') === 'false',
      'An empty default Key remains optional on reopening',
    );

    await cancel();
    check(
      document.activeElement?.getAttribute('aria-label') === '更多',
      'Closing returns focus to the Dock trigger',
    );
  } finally {
    if (previous === null) localStorage.removeItem(apiSettingsStorageKey);
    else localStorage.setItem(apiSettingsStorageKey, previous);
  }
  setMode('success');
  const results = find('#results');
  results.dataset.result = 'passed';
  results.textContent = `PASS · ${checks.length} checks\n${checks.join('\n')}`;
}

void run().catch(error => {
  const results = find('#results');
  results.dataset.result = 'failed';
  results.textContent = `FAIL · ${checks.length} checks\n${String(error)}\n${checks.join('\n')}`;
});
