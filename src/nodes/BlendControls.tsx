import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DescriberModelSelect } from '../components/DescriberModelSelect';
import { blendModes, type BlendMode, type BlendSettings } from './blend';
const separators = [1, 4, 8, 11, 14];
export function BlendControls({ settings, disabled, onDraft, onCommit, onCancel }: {
  settings: BlendSettings; disabled: boolean; onDraft: (value: BlendSettings) => void; onCommit: (value: BlendSettings) => void; onCancel: () => void;
}) {
  const percent = Math.round(settings.opacity * 100);
  const [text, setText] = useState(`${percent}%`);
  const cancelled = useRef(false), dragging = useRef(false), draft = useRef(settings);
  useEffect(() => setText(`${percent}%`), [percent]);
  const cancel = () => { dragging.current = false; onCancel(); };
  useEffect(() => { const blur = () => { dragging.current = false; onCancel(); }; window.addEventListener('blur', blur); return () => window.removeEventListener('blur', blur); }, [onCancel]);
  return <div className="blend-controls nodrag nopan nowheel" onKeyDown={event => { if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z')) event.stopPropagation(); if (event.key === 'Escape') cancel(); }}>
    <div className="blend-mode"><span>Mode</span><DescriberModelSelect compact label="Mode" menuLabel="Blend mode" value={settings.mode} choices={blendModes} separators={separators} disabled={disabled} onChange={mode => onCommit({ ...settings, mode: mode as BlendMode })} /></div>
    <div className="blend-opacity"><span>Opacity</span>
      <input type="range" aria-label="Opacity slider" min={0} max={100} step={1} value={percent} disabled={disabled} style={{ '--blend-opacity': `${percent}%` } as CSSProperties}
        onPointerDown={() => { dragging.current = true; draft.current = settings; }}
        onChange={event => { const value = { ...settings, opacity: Number(event.target.value) / 100 }; draft.current = value; if (dragging.current) onDraft(value); else onCommit(value); }}
        onPointerUp={() => { if (dragging.current) { dragging.current = false; onCommit(draft.current); } }} onPointerCancel={cancel} onLostPointerCapture={() => { if (dragging.current) cancel(); }} />
      <input type="text" autoComplete="off" data-1p-ignore="true" inputMode="decimal" role="spinbutton" aria-label="Opacity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%`} value={text} disabled={disabled}
        onChange={event => setText(event.target.value)} onFocus={event => event.currentTarget.select()}
        onBlur={() => { const value = Number(text.trim().replace(/%$/, '')); if (!cancelled.current && text.trim() && Number.isFinite(value)) onCommit({ ...settings, opacity: Math.max(0, Math.min(100, value)) / 100 }); cancelled.current = false; setText(`${percent}%`); }}
        onKeyDown={event => { if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); } if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onCommit({ ...settings, opacity: Math.max(0, Math.min(100, percent + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1))) / 100 }); } }} />
    </div>
  </div>;
}
