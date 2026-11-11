export {};

const frame = document.querySelector<HTMLIFrameElement>('#canvas')!;
const hexInput = document.querySelector<HTMLInputElement>('#hex')!;
const colorInput = document.querySelector<HTMLInputElement>('#color')!;
const compare = document.querySelector<HTMLButtonElement>('#compare')!;
const status = document.querySelector<HTMLElement>('#status')!;
const presets = document.querySelector<HTMLElement>('#presets')!;
const groups = [
  { name: '中性灰', colors: ['#0c0c0c', '#121212', '#181818', '#1e1e1e'] },
  { name: '暖一点', colors: ['#090908', '#11110f', '#191917', '#22221f'] },
  { name: '冷一点', colors: ['#0c0e12', '#111418', '#171a1f', '#1e2228'] },
];
let current = '#090908';
let selected = current;
let comparing = false;

function normalize(value: string) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1].toLowerCase();
  return `#${hex.length === 3 ? [...hex].map(char => char + char).join('') : hex}`;
}

function render() {
  const preview = frame.contentDocument;
  preview?.documentElement.style.setProperty('--canvas-background', comparing ? current : selected);
  document.querySelector<HTMLElement>('#selected-swatch')!.style.background = selected;
  document.querySelector<HTMLOutputElement>('#selected-hex')!.value = selected.toUpperCase();
  document.querySelector<HTMLElement>('#selected-name')!.textContent = selected === current ? '当前背景' : '试选背景';
  colorInput.value = selected;
  compare.setAttribute('aria-pressed', String(comparing));
  compare.textContent = comparing ? '返回试选颜色' : '对照当前背景';
  presets.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.color === selected));
  });
  status.textContent = comparing
    ? `正在对照当前背景 ${current.toUpperCase()}，再次点击返回。`
    : '仅在此页预览，正式画布保持原样。';
}

function select(color: string) {
  selected = color;
  comparing = false;
  hexInput.value = selected.toUpperCase();
  hexInput.removeAttribute('aria-invalid');
  // Keep the selection in this preview URL, independently of canvas persistence.
  history.replaceState(null, '', `#${selected.slice(1)}`);
  render();
}

for (const group of groups) {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  heading.className = 'group-label';
  heading.textContent = group.name;
  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  for (const color of group.colors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.color = color;
    button.setAttribute('aria-label', `${group.name} ${color}`);
    const swatch = document.createElement('i');
    swatch.style.background = color;
    const label = document.createElement('span');
    label.textContent = color.toUpperCase();
    button.append(swatch, label);
    button.addEventListener('click', () => select(color));
    swatches.append(button);
  }
  section.append(heading, swatches);
  presets.append(section);
}

function initialize() {
  const preview = frame.contentDocument;
  const root = preview?.documentElement;
  if (!root || !preview.defaultView) return;
  current = normalize(preview.defaultView.getComputedStyle(root).getPropertyValue('--canvas-background')) ?? current;
  const heading = preview.querySelector('h1');
  if (heading) heading.textContent = '背景色预览 · 可拖动、缩放';
  select(normalize(location.hash) ?? current);
}

frame.addEventListener('load', initialize);
if (frame.contentDocument?.readyState === 'complete') initialize();
colorInput.addEventListener('input', () => select(colorInput.value));
hexInput.addEventListener('input', () => {
  const color = normalize(hexInput.value);
  hexInput.setAttribute('aria-invalid', String(!color));
  if (color) {
    selected = color;
    comparing = false;
    history.replaceState(null, '', `#${selected.slice(1)}`);
    render();
  }
});
hexInput.addEventListener('blur', () => {
  if (normalize(hexInput.value)) hexInput.value = selected.toUpperCase();
});
hexInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && normalize(hexInput.value)) hexInput.blur();
  if (event.key === 'Escape') select(selected);
});
compare.addEventListener('click', () => { comparing = !comparing; render(); });
document.querySelector('#reset')!.addEventListener('click', () => select(current));
document.querySelector('#copy')!.addEventListener('click', () => {
  void navigator.clipboard.writeText(selected.toUpperCase()).then(() => {
    status.textContent = `已复制 ${selected.toUpperCase()}，选好后把这个色号告诉我。`;
  }).catch(() => {
    hexInput.focus();
    hexInput.select();
    status.textContent = '色号已选中，可按 ⌘C / Ctrl+C 复制。';
  });
});
window.addEventListener('hashchange', () => {
  const color = normalize(location.hash);
  if (color) select(color);
});
