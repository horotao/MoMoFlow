import { useEffect, useRef, useState } from 'react';

export function ResizeDimension({ axis, value, disabled, onCommit }: {
  axis: 'width' | 'height'; value?: number; disabled?: boolean; onCommit: (value: number) => void;
}) {
  const initial = value?.toString() ?? '';
  const [draft, setDraft] = useState(initial);
  const cancelled = useRef(false);
  useEffect(() => { setDraft(initial); }, [initial]);
  return <label className="resize-dimension">
    <span>{axis === 'width' ? 'W' : 'H'}</span>
    <input aria-label={axis === 'width' ? 'Width' : 'Height'} inputMode="numeric" autoComplete="off" value={draft} placeholder="—" disabled={disabled}
      onFocus={() => { cancelled.current = false; }}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => {
        if (!cancelled.current && draft !== initial && draft.trim()) onCommit(Number(draft));
        setDraft(initial);
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; setDraft(initial); event.currentTarget.blur(); }
      }} />
  </label>;
}
