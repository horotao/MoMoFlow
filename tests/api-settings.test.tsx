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
  lastSignal = signal; calls++;
  if (mode === 'timeout' || mode === 'deferred') return new Promise<void>(resolve => { finish = resolve; });
  await new Promise(resolve => setTimeout(resolve, 300));
  if (mode === 'failure') throw new Error('test-only upstream error with secret that must not appear');
};
function Harness() {
  const [open, setOpen] = useState(false);
  const [currentMode, updateMode] = useState<Mode>('unavailable');
  setMode = next => { mode = next; updateMode(next); };
  const addTrigger = useRef<HTMLButtonElement>(null);
  return <MotionConfig reducedMotion="user">
    <div className="qa-controls"><span>仅模拟状态，不发送 API 请求</span><select aria-label="模拟测试状态" value={currentMode} onChange={event => setMode(event.target.value as Mode)}>
      <option value="unavailable">尚未接入</option><option value="success">成功</option><option value="failure">失败</option><option value="timeout">超时（10秒）</option>
    </select><button onClick={() => setOpen(true)}>打开弹窗</button></div>
    <CanvasSidebar tool="select" onToolChange={() => {}} addTrigger={addTrigger} menuOpen={false} onAddMenu={() => {}} onApiSettings={() => setOpen(true)} />
    <ApiSettingsDialog open={open} onClose={() => setOpen(false)} onTestConnection={currentMode === 'unavailable' ? undefined : testConnection} />
  </MotionConfig>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const wait = async (ms: number) => { await new Promise(resolve => setTimeout(resolve, ms)); await settle(); };
const find = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
const checks: string[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks.push(message); }
const keyField = () => find<HTMLInputElement>('input[id$="-apiKey"]');
const urlField = () => find<HTMLInputElement>('input[id$="-baseUrl"]');
const click = async (selector: string) => { find<HTMLButtonElement>(selector).click(); await settle(); };
const input = async (field: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true })); await settle();
};
const blur = async (field: HTMLInputElement) => { field.focus(); field.blur(); await settle(); };
const open = async () => {
  await click('.canvas-sidebar [aria-label="更多"]');
  check(Boolean(document.querySelector('#canvas-more-menu.node-add-menu [role="menuitem"]')), 'More reuses the canvas context menu component');
  await click('#canvas-more-menu [role="menuitem"]'); await wait(350);
};
const cancel = async () => { await click('.api-settings-close'); await wait(250); };
async function run() {
  const previous = localStorage.getItem(apiSettingsStorageKey);
  localStorage.removeItem(apiSettingsStorageKey);
  try {
    createRoot(find('#root')).render(<StrictMode><Harness /></StrictMode>); await settle();
    await open();
    const dialog = find<HTMLDialogElement>('.api-settings-dialog');
    const panel = find('.api-settings-panel');
    check(dialog.open && dialog.matches(':modal'), 'API settings use a native modal that isolates canvas input');
    check(Math.abs(panel.getBoundingClientRect().width - Math.min(480, innerWidth - 32)) < 1 && getComputedStyle(panel).borderRadius === '24px', 'Modal uses the compact 480px width and 24px radius');
    check(getComputedStyle(dialog, '::backdrop').backdropFilter === 'blur(10.8px)' && getComputedStyle(dialog, '::backdrop').backgroundColor === 'rgba(0, 0, 0, 0.3)', 'Backdrop matches the Figma blur and dark overlay');
    const assets = Array.from(dialog.querySelectorAll<HTMLImageElement>('img'));
    await Promise.all(assets.map(asset => asset.decode()));
    check(assets.length === 4 && assets.every(asset => asset.naturalWidth === 20 && asset.getBoundingClientRect().width === 20 && asset.getBoundingClientRect().height === 20), 'All four Figma SVGs load at their intrinsic 20px dimensions');
    check(find('.api-settings-input').getBoundingClientRect().height === 36 && find('.api-settings-select').getBoundingClientRect().height === 36, 'Inputs and provider select share the 36px design height');
    check(keyField().type === 'password' && !keyField().value, 'Key starts empty and masked');
    await input(keyField(), 'bad key');
    check(keyField().getAttribute('aria-invalid') === 'false', 'First entry does not show errors mid-typing');
    await blur(keyField());
    check(keyField().getAttribute('aria-invalid') === 'true' && getComputedStyle(keyField().parentElement!).borderTopColor === 'rgb(244, 119, 119)', 'Whitespace triggers the red validation border on blur');
    check(find('.api-settings-sr-only').getBoundingClientRect().width === 1, 'Validation has no visible error copy or reserved error row');
    await input(keyField(), 'sk-test-only');
    check(keyField().getAttribute('aria-invalid') === 'false' && document.querySelectorAll('.api-settings-valid').length === 2, 'Correction immediately clears the error and shows both format checks');
    await click('.api-settings-reveal'); check(keyField().type === 'text', 'Reveal key toggles visibility');
    await click('.api-settings-reveal'); check(keyField().type === 'password', 'Hide key restores masking');
    await input(urlField(), 'https://api.example.com/中文'); await blur(urlField());
    check(urlField().getAttribute('aria-invalid') === 'true', 'Chinese characters in URL are rejected');
    await input(urlField(), 'https://api.openai.com/v1');
    await click('.api-settings-test-group button');
    check(find('.api-settings-feedback').textContent === '连接测试尚未接入' && calls === 0, 'UI-only entry never reports a fabricated connection success');
    await click('.api-settings-select'); await wait(400);
    const list = find('.api-settings-select-popup .settings-select-list');
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
    check(rows.every(row => Math.abs(row.getBoundingClientRect().height - 36) < 1) && getComputedStyle(list).rowGap === '4px', 'Provider options use spacious 36px rows with 4px gaps');
    check(list.scrollHeight <= list.clientHeight + 1 && rows[rows.length - 1].getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom, 'Popup sizing includes the larger rows and gaps without clipping the last option');
    check(getComputedStyle(find('.api-settings-select')).borderRadius === '8px'
      && getComputedStyle(find('.api-settings-select-popup')).borderRadius === '8px'
      && rows.every(row => getComputedStyle(row).borderRadius === '3px'), 'Closed and open surfaces share 8px corners with concentric inset option corners');
    check(document.querySelectorAll('[role="option"][aria-selected="true"]').length === 1 && !document.querySelector('.settings-select-popup .settings-select-row'), 'Provider popup keeps one checked selected option with no duplicate header');
    const options = document.querySelectorAll<HTMLElement>('[role="option"]'); options[1].click(); await settle();
    check(urlField().value === 'https://zenmux.ai/api/v1' && keyField().value === '', 'Changing provider selects its URL without carrying another provider key');
    await click('.api-settings-select'); await wait(400); document.querySelectorAll<HTMLElement>('[role="option"]')[0].click(); await settle();
    check(keyField().value === 'sk-test-only', 'Switching back restores the current provider draft');
    setMode('success'); await settle();
    await click('.api-settings-test-group button');
    check(find<HTMLButtonElement>('.api-settings-test-group button').disabled && find('.api-settings-spinner'), 'Testing displays loading feedback and prevents duplicate clicks');
    await wait(350);
    check(find('.api-settings-feedback').textContent === '连接成功', 'Simulated success appears beside the test button');
    setMode('failure'); await settle(); await click('.api-settings-test-group button'); await wait(350);
    check(find('.api-settings-feedback').textContent === '连接失败，请检查地址和 Key' && !dialog.textContent?.includes('upstream'), 'Simulated failure uses concise local copy without echoing provider secrets');
    const feedback = find('.api-settings-feedback').getBoundingClientRect(); const button = find('.api-settings-test-group button').getBoundingClientRect();
    check(Math.abs(feedback.top + feedback.height / 2 - button.top - button.height / 2) < 1, 'Test feedback is vertically centered with the button');
    setMode('deferred'); await settle(); await click('.api-settings-test-group button');
    await input(keyField(), 'sk-edited-only');
    check(lastSignal?.aborted, 'Editing credentials cancels the previous test'); finish?.(); await settle();
    check(!find('.api-settings-feedback').textContent, 'Late test responses cannot replace feedback for changed credentials');
    setMode('timeout'); await settle(); await click('.api-settings-test-group button'); await wait(10100);
    check(lastSignal?.aborted && find('.api-settings-feedback').textContent === '连接超时，请重试', 'Timeout releases loading state and exposes a retryable result');
    await click('.api-settings-save'); await wait(250);
    check(!dialog.open && readApiSettings().credentials.openai?.apiKey === 'sk-edited-only', 'Save persists this provider and closes the modal');
    await open();
    check(keyField().value === 'sk-edited-only' && keyField().type === 'password', 'Reopening restores the saved credential masked');
    await input(keyField(), 'sk-discard-only'); await cancel(); await open();
    check(keyField().value === 'sk-edited-only', 'Cancel discards unsaved changes');
    await input(keyField(), '');
    await click('.api-settings-save'); await wait(250);
    check(!readApiSettings().credentials.openai, 'Clearing a saved Key removes only that channel override and restores server defaults');
    await open();
    check(keyField().value === '' && keyField().getAttribute('aria-invalid') === 'false', 'An empty default Key remains optional on reopening');
    await cancel();
    check(document.activeElement?.getAttribute('aria-label') === '更多', 'Closing returns focus to the Dock trigger');
  } finally {
    if (previous === null) localStorage.removeItem(apiSettingsStorageKey); else localStorage.setItem(apiSettingsStorageKey, previous);
  }
  setMode('unavailable');
  const results = find('#results'); results.dataset.result = 'passed'; results.textContent = `PASS · ${checks.length} checks\n${checks.join('\n')}`;
}
void run().catch(error => { const results = find('#results'); results.dataset.result = 'failed'; results.textContent = `FAIL · ${checks.length} checks\n${String(error)}\n${checks.join('\n')}`; });
