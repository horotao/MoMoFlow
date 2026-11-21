import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './add-node-menu.css';

const imageEntry = { id: 'image', type: 'image', label: '图片', description: '生成和编辑图片', key: 'I' } as const;
type AddNodeType = 'image' | 'text';
export interface AddNodeRequest { type: AddNodeType; quantity: number }
export interface AddNodeMenuProps {
  /** Viewport coordinates, unaffected by canvas zoom. Mount only while open. */
  position: { x: number; y: number };
  onSelect: (request: AddNodeRequest) => void;
  onClose: (restoreFocus: boolean) => void;
  /** Excludes the opener from outside-click dismissal. The host restores its focus. */
  allowQuantity?: boolean;
  allowedTypes?: readonly AddNodeType[];
  triggerRef?: RefObject<HTMLElement>;
}

const icons = {
  text: new URL('../image-prompt-node/assets/text.svg', import.meta.url).href,
  image: new URL('./assets/image.svg', import.meta.url).href,
  search: new URL('./assets/search.svg', import.meta.url).href,
  close: new URL('./assets/close.svg', import.meta.url).href,
  minus: new URL('./assets/minus.svg', import.meta.url).href,
  plus: new URL('./assets/plus.svg', import.meta.url).href,
};

function Icon({ name }: { name: keyof typeof icons }) {
  return <span aria-hidden="true" className={`flora-add-node-icon flora-add-node-icon-${name}`} style={{ maskImage: `url("${icons[name]}")` }} />;
}

function normalizeQuantity(value: string) { return Math.max(1, Math.min(20, Math.trunc(Number(value)) || 1)); }

export function AddNodeMenu({ position, onSelect, onClose, triggerRef, allowQuantity = true, allowedTypes }: AddNodeMenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState<Partial<Record<AddNodeType, string>>>({});
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const rows = [imageEntry, { id: 'text', type: 'text', label: '文本', description: '生成文本与 Markdown', key: 'T' } as const]
    .filter(entry => !allowedTypes || allowedTypes.includes(entry.type)).map(entry => ({ ...entry, quantity: allowQuantity }));
  const filtered = rows.filter(entry => `${entry.type} ${entry.label} ${entry.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const width = Math.min(352, Math.max(0, viewport.width - 16));
  const groups = filtered.length ? [filtered] : [];
  const height = filtered.length ? 46 + filtered.length * 48 + groups.length * 8 + groups.length - 1 : 110;
  const left = Math.max(8, Math.min(position.x, viewport.width - width - 8));
  const top = Math.max(8, Math.min(position.y, viewport.height - Math.min(height, viewport.height - 16) - 8));

  useLayoutEffect(() => { search.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    function resize() { setViewport({ width: window.innerWidth, height: window.innerHeight }); }
    function outside(event: Event) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !triggerRef?.current?.contains(event.target)) onClose(false);
    }
    window.addEventListener('resize', resize);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [onClose, triggerRef]);

  function select(entry: typeof rows[number]) {
    onSelect({ type: entry.type, quantity: normalizeQuantity(counts[entry.type] ?? '1') });
    onClose(true);
  }
  function changeQuantity(type: AddNodeType, value: number) {
    setCounts(current => ({ ...current, [type]: String(Math.max(1, Math.min(20, value))) }));
  }

  return createPortal(<div ref={panel} id="canvas-node-menu" role="dialog" aria-label="添加节点" lang="zh-CN" className="flora-add-node-menu nodrag nopan nowheel"
    style={{ left, top, width, maxHeight: Math.max(0, viewport.height - top - 8) }}
    onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onWheel={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(true); return; }
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (input?.getAttribute('role') === 'spinbutton') return;
      if (!input && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const shortcut = filtered.find(entry => entry.key.toLowerCase() === event.key.toLowerCase());
        if (shortcut) { event.preventDefault(); select(shortcut); return; }
      }
      if (event.key === 'ArrowRight' && event.target instanceof HTMLElement && event.target.matches('.flora-add-node-item')) {
        const quantity = event.target.closest('.flora-add-node-row')?.querySelector<HTMLInputElement>('[role=spinbutton]');
        if (quantity) { event.preventDefault(); quantity.focus(); quantity.select(); }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || (input && ['Home', 'End'].includes(event.key))) return;
      const items = [...(panel.current?.querySelectorAll<HTMLButtonElement>('.flora-add-node-item') ?? [])];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : current < 0 ? (event.key === 'ArrowUp' ? items.length - 1 : 0) : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next].focus({ preventScroll: true });
      items[next].scrollIntoView({ block: 'nearest' });
    }}>
    <div className="flora-add-node-search">
      <Icon name="search" />
      <input ref={search} aria-label="搜索节点、操作和工具" placeholder="添加节点、操作和工具" value={query} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && filtered[0]) { event.preventDefault(); select(filtered[0]); } }} />
      <button type="button" aria-label="清空搜索" className="flora-add-node-clear" style={{ visibility: query ? 'visible' : 'hidden' }} onClick={() => { setQuery(''); search.current?.focus(); }}><Icon name="close" /></button>
    </div>
    <div className="flora-add-node-list" role="menu" aria-label="节点和操作">
      {groups.map(group => <div role="group" className="flora-add-node-group" key={group[0].id}>
        {group.map(entry => {
          const quantity = normalizeQuantity(counts[entry.type] ?? '1');
          return <div className="flora-add-node-row" data-type={entry.type} key={entry.id}
            onMouseEnter={event => {
              const focusedRow = document.activeElement?.closest('.flora-add-node-row');
              if (focusedRow && focusedRow !== event.currentTarget) event.currentTarget.querySelector<HTMLButtonElement>('.flora-add-node-item')?.focus({ preventScroll: true });
            }}
            onClick={event => {
              if (event.target instanceof Element && !event.target.closest('button, .flora-add-node-quantity')) select(entry);
            }}>
            <button type="button" role="menuitem" className="flora-add-node-item" aria-label={`${entry.label} ${entry.description}`} onClick={() => select(entry)}>
              <span className="flora-add-node-badge"><Icon name={entry.type} /></span>
              <span className="flora-add-node-copy"><span className="flora-add-node-title">{entry.label}</span><span className="flora-add-node-description" title={entry.description}>{entry.description}</span></span>
            </button>
            {entry.key && <kbd className={`flora-add-node-shortcut${entry.quantity ? ' flora-add-node-replaceable' : ''}`}>{entry.key}</kbd>}
            {entry.quantity && <div className="flora-add-node-quantity" role="group" aria-label={`${entry.label}节点数量`}>
              <button type="button" aria-label={`减少${entry.label}节点数量`} disabled={quantity === 1} onClick={() => changeQuantity(entry.type, quantity - 1)}><Icon name="minus" /></button>
              <input role="spinbutton" inputMode="numeric" aria-label={`${entry.label}节点数量`} aria-valuemin={1} aria-valuemax={20} aria-valuenow={quantity} value={counts[entry.type] ?? '1'}
                onChange={event => { if (/^\d{0,3}$/.test(event.target.value)) setCounts(current => ({ ...current, [entry.type]: event.target.value })); }}
                onBlur={() => changeQuantity(entry.type, quantity)}
                onKeyDown={event => {
                  if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); changeQuantity(entry.type, event.key === 'Home' ? 1 : event.key === 'End' ? 20 : quantity + (event.key === 'ArrowUp' ? 1 : -1)); }
                  if (event.key === 'ArrowLeft') { event.preventDefault(); event.currentTarget.closest('.flora-add-node-row')?.querySelector<HTMLButtonElement>('.flora-add-node-item')?.focus(); }
                  if (event.key === 'Enter') { event.preventDefault(); select(entry); }
                }} />
              <button type="button" aria-label={`增加${entry.label}节点数量`} disabled={quantity === 20} onClick={() => changeQuantity(entry.type, quantity + 1)}><Icon name="plus" /></button>
            </div>}
          </div>;
        })}
      </div>)}
      {!filtered.length && <div className="flora-add-node-empty" role="status">未找到匹配的节点</div>}
    </div>
  </div>, document.body);
}
