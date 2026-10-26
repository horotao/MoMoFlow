import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, MoreVertical } from 'lucide-react';
import { DescriberIcon } from './DescriberIcon';

export function DescriberPreview({ text, model, instructions, onClose, onClear, locked }: {
  locked?: boolean; text: string; model: string; instructions: string; onClose: () => void; onClear: () => void;
}) {
  const [info, setInfo] = useState(false);
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div ref={root} className="describer-preview nodrag nopan" role="dialog" aria-modal="true" aria-label="Generated text preview" onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === 'Escape') { if (menu) setMenu(false); else onClose(); }
    if (event.key === 'Tab') {
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []);
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('.describer-preview-tools')) setMenu(false); }}>
    <header className="describer-preview-title"><button aria-label="Close preview" onClick={onClose}><DescriberIcon name="close" /></button><span>Image Describer</span></header>
    <div className="describer-preview-stage"><div className="describer-preview-text nowheel" tabIndex={0}>{text || 'No generated text yet'}</div></div>
    <div className="describer-preview-tools"><button aria-label={info ? 'Hide Info' : 'Show Info'} title={info ? 'Hide Info' : 'Show Info'} aria-pressed={info} onClick={() => setInfo(!info)}><Info size={14} /></button><button aria-label="打开操作菜单" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreVertical size={14} /></button>
      {menu && <div className="describer-preview-menu" role="menu"><button role="menuitem" disabled={locked} onClick={() => { if (!locked) onClear(); }}>删除当前生成结果</button><button role="menuitem" disabled>删除其他生成结果</button><button role="menuitem" disabled={locked} onClick={() => { if (!locked) onClear(); }}>删除全部生成结果</button></div>}
    </div>
    {info && <aside className="describer-preview-info nowheel"><dl><dt>Model</dt><dd>Image Describer</dd><dt>Prompt</dt><dd>{instructions}</dd><dt>Model</dt><dd>{model}</dd></dl></aside>}
    <aside className="describer-preview-rail"><div className="describer-preview-count">1 / 1</div><button className="describer-preview-thumb" aria-label="Current text" aria-current="true">T</button></aside>
  </div>, document.body);
}
