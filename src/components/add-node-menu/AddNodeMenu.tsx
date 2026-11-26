import { ClipboardPaste, Merge } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AddNodePreview } from './AddNodePreview';
import { addNodeEntries, nodePreviewDescription, supportsNodePreview, useAddNodePreview, type AddNodeType } from './useAddNodePreview';
import './add-node-menu.css';

export interface AddNodeRequest { type: AddNodeType; quantity: number }
export interface AddNodeMenuProps {
  /** Viewport coordinates, unaffected by canvas zoom. Mount only while open. */
  position: { x: number; y: number };
  onSelect: (request: AddNodeRequest) => void;
  canvasActions?: {
    import: () => void;
    paste: () => void;
    pasteData: (clipboard: DataTransfer) => boolean;
  };
  onClose: (restoreFocus: boolean) => void;
  /** Excludes the opener from outside-click dismissal. The host restores its focus. */
  allowQuantity?: boolean;
  allowedTypes?: readonly AddNodeType[];
  triggerRef?: RefObject<HTMLElement>;
}

const icons = {
  text: new URL('../image-prompt-node/assets/text.svg', import.meta.url).href,
  image: new URL('./assets/image.svg', import.meta.url).href,
  video: new URL('./assets/video.svg', import.meta.url).href,
  audio: new URL('./assets/audio.svg', import.meta.url).href,
  import: new URL('./assets/import.svg', import.meta.url).href,
  search: new URL('./assets/search.svg', import.meta.url).href,
  close: new URL('./assets/close.svg', import.meta.url).href,
  minus: new URL('./assets/minus.svg', import.meta.url).href,
  plus: new URL('./assets/plus.svg', import.meta.url).href,
};

function Icon({ name }: { name: keyof typeof icons | 'router' }) {
  if (name === 'router') return <Merge size={14} style={{ rotate: '90deg' }} aria-hidden="true" />;
  return <span aria-hidden="true" className={`flora-add-node-icon flora-add-node-icon-${name}`} style={{ maskImage: `url("${icons[name]}")` }} />;
}

const canvasEntries = [
  { type: 'import', label: '导入', description: '从电脑添加图片或 MP4 视频' },
  { type: 'paste', label: '粘贴', description: '支持从外部粘贴图片' },
] as const;

function normalizeQuantity(value: string) { return Math.max(1, Math.min(20, Math.trunc(Number(value)) || 1)); }

export function AddNodeMenu({ position, onSelect, onClose, triggerRef, allowQuantity = true, allowedTypes, canvasActions }: AddNodeMenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const { preview, enter, leave, keepOpen, reset, finishExit } = useAddNodePreview();
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState<Partial<Record<AddNodeType, string>>>({});
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const rows = addNodeEntries
    .filter(entry => !allowedTypes || allowedTypes.includes(entry.type)).map(entry => ({ ...entry, quantity: allowQuantity }));
  const term = query.trim().toLowerCase();
  const actions = canvasActions ? canvasEntries.filter(entry => (entry.type + entry.label + entry.description).toLowerCase().includes(term)) : [];
  const filtered = rows.filter(entry => `${entry.type} ${entry.label} ${entry.description}`.toLowerCase().includes(term));
  const previewEntry = preview && filtered.find(entry => entry.type === preview.type);
  const width = Math.min(352, Math.max(0, viewport.width - 16));
  const nodeHeight = filtered.length ? 8 + filtered.length * 48 : 0;
  const actionHeight = actions.length ? 8 + actions.reduce((height, entry) => height + (entry.description ? 48 : 40), 0) : 0;
  const divider = filtered.length > 0 && actions.length > 0;
  const height = nodeHeight || actionHeight ? 46 + nodeHeight + actionHeight + Number(divider) : 110;
  const apple = /Mac|iPhone|iPad/.test(navigator.platform);
  const left = Math.max(8, Math.min(position.x, viewport.width - width - 8));
  const top = Math.max(8, Math.min(position.y, viewport.height - Math.min(height, viewport.height - 16) - 8));

  useLayoutEffect(() => { search.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    function resize() {
      reset();
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    function outside(event: Event) {
      if (event.target instanceof Node && !panel.current?.contains(event.target)
        && !previewRef.current?.contains(event.target) && !triggerRef?.current?.contains(event.target)) onClose(false);
    }
    window.addEventListener('resize', resize);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [onClose, reset, triggerRef]);

  function select(entry: typeof rows[number]) {
    onSelect({ type: entry.type, quantity: normalizeQuantity(counts[entry.type] ?? '1') });
    onClose(true);
  }
  function selectAction(action: typeof canvasEntries[number]['type']) {
    if (!canvasActions) return;
    onClose(true);
    canvasActions[action]();
  }
  function changeQuantity(type: AddNodeType, value: number) {
    setCounts(current => ({ ...current, [type]: String(Math.max(1, Math.min(20, value))) }));
  }
  function changeQuery(value: string) {
    reset();
    setQuery(value);
  }

  return createPortal(<><div ref={panel} id="canvas-node-menu" role="dialog" aria-label="添加节点" lang="zh-CN" className="flora-add-node-menu nodrag nopan nowheel"
    style={{ left, top, width, maxHeight: Math.max(0, viewport.height - top - 8) }}
    onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onWheel={event => event.stopPropagation()}
    onPaste={event => {
      if (event.target instanceof HTMLInputElement && event.target !== search.current) return;
      if (canvasActions?.pasteData(event.clipboardData)) {
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(true); return; }
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (input?.getAttribute('role') === 'spinbutton') return;
      if (!input && canvasActions && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'v') {
        event.preventDefault(); selectAction('paste'); return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if ((!input || input === search.current && !query) && event.key.toLowerCase() === 'u' && actions.some(entry => entry.type === 'import')) {
          event.preventDefault(); selectAction('import'); return;
        }
        const shortcut = !input && filtered.find(entry => entry.key.toLowerCase() === event.key.toLowerCase());
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
      reset();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : current < 0 ? (event.key === 'ArrowUp' ? items.length - 1 : 0) : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next].focus({ preventScroll: true });
      items[next].scrollIntoView({ block: 'nearest' });
    }}>
    <div className="flora-add-node-search">
      <Icon name="search" />
      <input ref={search} aria-label="搜索节点、操作和工具" placeholder="添加节点、操作和工具" value={query} onChange={event => changeQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (filtered[0]) select(filtered[0]);
          else if (actions[0]) selectAction(actions[0].type);
        }} />
      <button type="button" aria-label="清空搜索" className="flora-add-node-clear" style={{ visibility: query ? 'visible' : 'hidden' }} onClick={() => { changeQuery(''); search.current?.focus(); }}><Icon name="close" /></button>
    </div>
    <div className="flora-add-node-list" role="menu" aria-label="节点和操作" onScroll={reset}>
      {filtered.length > 0 && <div role="group" className="flora-add-node-group">
        {filtered.map(entry => {
          const quantity = normalizeQuantity(counts[entry.type] ?? '1');
          return <div className="flora-add-node-row" data-type={entry.type} key={entry.type}
            onPointerEnter={event => {
              if (!event.buttons && supportsNodePreview(event.pointerType)) enter(entry.type, event.currentTarget);
            }}
            onPointerLeave={event => { if (supportsNodePreview(event.pointerType)) leave(); }}
            onPointerCancel={reset}
            onMouseEnter={event => {
              const focusedRow = document.activeElement?.closest('.flora-add-node-row');
              if (focusedRow && focusedRow !== event.currentTarget) event.currentTarget.querySelector<HTMLButtonElement>('.flora-add-node-item')?.focus({ preventScroll: true });
            }}
            onClick={event => {
              if (event.target instanceof Element && !event.target.closest('button, .flora-add-node-quantity')) select(entry);
            }}>
            <button type="button" role="menuitem" className="flora-add-node-item" aria-label={`${entry.label} ${entry.description}`}
              aria-keyshortcuts={entry.key} aria-description={nodePreviewDescription[entry.type]} onClick={() => select(entry)}>
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
      </div>}
      {divider && <div role="separator" className="flora-add-node-divider" />}
      {actions.length > 0 && <div role="group" aria-label="画布操作" className="flora-add-node-group" onPointerEnter={reset} onFocus={reset}>
        {actions.map(entry => {
          const paste = entry.type === 'paste';
          return <button type="button" role="menuitem" key={entry.type} className="flora-add-node-item flora-add-node-action"
            aria-keyshortcuts={paste ? (apple ? 'Meta+V' : 'Control+V') : 'U'} onClick={() => selectAction(entry.type)}>
            <span className="flora-add-node-badge">{paste ? <ClipboardPaste size={12} aria-hidden="true" /> : <Icon name="import" />}</span>
            <span className="flora-add-node-copy"><span className="flora-add-node-title">{entry.label}</span>
              {entry.description && <span className="flora-add-node-description">{entry.description}</span>}
            </span>
            <kbd className="flora-add-node-shortcut">{paste ? (apple ? '⌘V' : 'Ctrl+V') : 'U'}</kbd>
          </button>;
        })}
      </div>}
      {!filtered.length && !actions.length && <div className="flora-add-node-empty" role="status">{allowedTypes?.length === 0 ? '没有能同时接入所有所选节点的类型' : canvasActions ? '未找到匹配的节点或操作' : '未找到匹配的节点'}</div>}
    </div>
  </div>
    {preview && previewEntry && <AddNodePreview key={preview.type} previewRef={previewRef} anchor={preview.anchor}
      menuLeft={left} menuTop={top} menuWidth={width} viewportWidth={viewport.width} viewportHeight={viewport.height}
      type={preview.type} title={previewEntry.label} subtitle={previewEntry.description}
      shortcut={previewEntry.key} icon={<Icon name={preview.type} />} open={preview.open}
      onEnter={keepOpen} onLeave={leave} onExit={finishExit} />}
  </>, document.body);
}
