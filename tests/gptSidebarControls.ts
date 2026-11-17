function control(field: string) {
  const element = document.querySelector<HTMLElement>(`.image-model-settings [aria-label="${field}"]:is([role="combobox"], [role="radiogroup"])`);
  if (!element) throw new Error(`Missing ${field} control`);
  return element;
}

function listbox(field: string) {
  return document.querySelector<HTMLElement>(`[role="listbox"][aria-label="${field}"]:not([aria-hidden="true"])`);
}

function segments(element: HTMLElement) {
  return [...element.querySelectorAll<HTMLElement>('.gpt-segment-label')];
}

export function gptSegmentValue(field: string) {
  return control(field).querySelector('input:checked + .gpt-segment-label')?.textContent;
}

export function gptSettingDisabled(field: string) {
  const element = control(field);
  return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

export async function chooseGptSetting(field: string, label: string, settle: () => Promise<void>) {
  const element = control(field);
  if (element.getAttribute('role') === 'radiogroup') {
    const option = segments(element).find(item => item.textContent === label);
    const input = option?.parentElement?.querySelector('input');
    if (!input) throw new Error(`Missing ${field} option ${label}`);
    input.scrollIntoView({ block: 'nearest' });
    input.click();
  } else {
    element.scrollIntoView({ block: 'nearest' });
    element.click();
    await settle();
    const option = [...listbox(field)?.querySelectorAll<HTMLElement>('[role="option"]') ?? []].find(item => item.textContent === label);
    if (!option) throw new Error(`Missing ${field} option ${label}`);
    option.click();
  }
  await settle();
}

export async function gptSettingOptions(field: string, settle: () => Promise<void>) {
  const element = control(field);
  if (element.getAttribute('role') === 'radiogroup') return segments(element).map(item => item.textContent);
  element.scrollIntoView({ block: 'nearest' });
  element.click();
  await settle();
  const menu = listbox(field);
  if (!menu) throw new Error(`Missing ${field} menu`);
  const values = [...menu.querySelectorAll('[role="option"]')].map(item => item.textContent);
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  return values;
}

export function moveGptRunCount(key: 'ArrowRight' | 'ArrowLeft' | 'Home') {
  const slider = document.querySelector('.image-model-settings [role="slider"][aria-label="运行次数"]');
  if (!slider) throw new Error('Missing GPT Image run-count slider');
  slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}
