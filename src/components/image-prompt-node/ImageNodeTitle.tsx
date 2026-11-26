import { useNodeId } from '@xyflow/react';
import { useNodeCommand } from '../../nodes/nodeCommands';
import { useLayoutEffect, useRef, useState } from 'react';

/** The draft stays local so a completed rename is one document edit. */
export function ImageNodeTitle({ title, editable, locked, onChange }: {
  title: string; editable: boolean; locked: boolean; onChange?: (title: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const active = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const canEdit = editable && !locked && Boolean(onChange);
  // A pointer selection can remove focus before the browser emits blur.
  useLayoutEffect(() => {
    if (canEdit || !active.current) return;
    active.current = false;
    setDraft(null);
    const next = draft?.trim();
    if (!locked && next && next !== title) onChange?.(next);
  }, [canEdit, locked, draft, title, onChange]);
  function start() {
    if (!canEdit) return;
    active.current = true;
    setDraft(title);
  }
  const nodeId = useNodeId();
  useNodeCommand(nodeId, 'rename', start);
  function finish(save: boolean, restoreFocus = false) {
    if (!active.current) return;
    active.current = false;
    const next = draft?.trim();
    setDraft(null);
    if (save && canEdit && next && next !== title) onChange?.(next);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }
  return <span className={`image-node-name${canEdit ? ' is-editable nodrag nopan' : ''}${draft !== null ? ' is-editing' : ''}`}
    onPointerDown={event => { if (canEdit) event.stopPropagation(); }}
    onClick={event => { if (canEdit) event.stopPropagation(); }}
    onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); start(); }}>
    {draft !== null ? <>
      <span className="image-node-name-measure" aria-hidden="true">{draft || ' '}</span>
      <input className="image-node-name-input nodrag nopan nowheel" aria-label="节点名称" value={draft} size={1} autoFocus spellCheck
        onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.currentTarget.value)}
        onBlur={() => finish(true)} onKeyDown={event => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') { event.preventDefault(); finish(true, true); }
          if (event.key === 'Escape') { event.preventDefault(); finish(false, true); }
        }} />
    </> : canEdit ? <button ref={trigger} type="button" className="image-node-name-trigger" title={title}
      aria-label={`重命名节点：${title}`} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); event.stopPropagation(); start(); }
      }}>{title}</button> : <span className="image-node-name-text" title={title}>{title}</span>}
  </span>;
}
