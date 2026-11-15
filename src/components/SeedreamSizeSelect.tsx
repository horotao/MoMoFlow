import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { normalizeSeedreamSize, seedreamAspectRatios, seedreamResolutions, validateSeedreamSize, type SeedreamSettings } from '../nodes/seedream';
import { DescriberModelSelect } from './DescriberModelSelect';
import { ParameterField } from './ParameterField';

function SeedreamPixelInputs({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const source = `${value}:${Boolean(disabled)}`;
  const initial = () => {
    const [width = '', height = ''] = value.split('x');
    return { source, width, height };
  };
  const [draft, setDraft] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const composing = useRef(false);
  useLayoutEffect(() => {
    composing.current = false;
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [source]);
  // External edits, undo and locking replace any unfinished local draft.
  if (draft.source !== source) setDraft(initial());
  const cancelPending = () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  };
  const commit = (next = draft) => {
    cancelPending();
    if (disabled) return;
    const size = normalizeSeedreamSize(next.width, next.height, value);
    const [width, height] = size.split('x');
    setDraft({ source, width, height });
    if (size !== value) onChange(size);
  };
  const edit = (index: number, value: string) => {
    const next = { ...draft, [index === 0 ? 'width' : 'height']: value };
    setDraft(next);
    cancelPending();
    // Leave cleared fields available for the next digit instead of restoring
    // them mid-entry. Enter and blur still finish incomplete input immediately.
    if (!disabled && !composing.current && next.width !== '' && next.height !== '') timer.current = setTimeout(() => commit(next), 250);
  };
  return <div className="sunburst-custom-size" onBlur={event => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) commit();
  }}>
    {(['宽度', '高度'] as const).map((label, index) => <label key={label}>{label}<span className="sunburst-dimension">
      <input type="number" aria-label={`图像${label}`} min={1} step={1} value={index === 0 ? draft.width : draft.height} disabled={disabled}
        onChange={event => edit(index, event.target.value)}
        onCompositionStart={() => { composing.current = true; cancelPending(); }}
        onCompositionEnd={event => { composing.current = false; edit(index, event.currentTarget.value); }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
        }} /><span aria-hidden="true">px</span>
    </span></label>)}
  </div>;
}

export function SeedreamSizeSelect({ value, resolution, disabled, resolutionDisabled, onChange, onResolutionChange, exposeButton, resolutionExposeButton }: {
  value: string; resolution: string; disabled?: boolean; resolutionDisabled?: boolean;
  onChange: (value: string) => void; onResolutionChange: (value: SeedreamSettings['resolution']) => void;
  exposeButton: ReactNode; resolutionExposeButton: ReactNode;
}) {
  const presets: readonly string[] = ['auto', ...seedreamAspectRatios];
  const custom = !presets.includes(value);
  let error = '';
  try { validateSeedreamSize(value); } catch (cause) { error = (cause as Error).message; }
  return <>
    <ParameterField label="宽高比" exposeButton={exposeButton} detail={<>
      {custom && <SeedreamPixelInputs value={value} disabled={disabled} onChange={onChange} />}
      {error && <div className="sunburst-size-note" role="alert">{error}</div>}
    </>}>
      <DescriberModelSelect appearance="settings" fluidHover compact label="宽高比" value={custom ? 'custom' : value}
        choices={[...presets, 'custom']} labels={['自动', ...seedreamAspectRatios, '精确像素']} disabled={disabled}
        onChange={next => onChange(next === 'custom' ? resolution === '2K' ? '2048x2048' : '1536x1536' : next)} />
    </ParameterField>
    <ParameterField label="分辨率" exposeButton={resolutionExposeButton}>
      <DescriberModelSelect appearance="settings" fluidHover compact label="分辨率" value={custom ? 'custom' : resolution}
        choices={custom ? ['custom'] : seedreamResolutions} labels={custom ? ['精确像素'] : seedreamResolutions}
        disabled={resolutionDisabled || custom} onChange={value => {
          const next = seedreamResolutions.find(resolution => resolution === value);
          if (next) onResolutionChange(next);
        }} />
    </ParameterField>
  </>;
}
