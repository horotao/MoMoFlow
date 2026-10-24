import { useRef, useState, type PointerEvent } from 'react';
import { levelsChannels, levelsControls, levelsGammaAt, levelsGammaPosition, updateChannelLevels, type ChannelLevels, type LevelsChannel, type LevelsSettings } from '../levels';
import { InspectorSelect } from './InspectorControls';

export function LevelsEffectControls({ settings, onDraft, onCommit, onCancel }: {
  settings: LevelsSettings; onDraft: (value: LevelsSettings) => void; onCommit: (value: LevelsSettings) => void; onCancel: () => void;
}) {
  const [channel, setChannel] = useState<LevelsChannel>('RGB');
  const [dragging, setDragging] = useState<keyof ChannelLevels>();
  const gesture = useRef<{ key: keyof ChannelLevels; initial: LevelsSettings; latest?: LevelsSettings }>();
  const values = settings[channel];
  const position = (key: keyof ChannelLevels) => key === 'gamma' ? levelsGammaPosition(values, false) : values[key];
  const change = (source: LevelsSettings, key: keyof ChannelLevels, point: number) => updateChannelLevels(source, channel, key,
    key === 'gamma' ? levelsGammaAt(point, source[channel]) : point);
  const cancel = () => { gesture.current = undefined; setDragging(undefined); onCancel(); };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = Math.min(255, Math.max(0, (event.clientX - rect.left) / rect.width * 255));
    current.latest = change(current.initial, current.key, point);
    onDraft(current.latest);
  };
  return <div className="comp-levels" onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) { if (gesture.current) cancel(); return; }
    if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); cancel(); }
  }}>
    <div className="comp-effect-select"><span>Channel</span><InspectorSelect label="Levels channel" value={channel}
      options={levelsChannels.map(value => ({ value, label: value }))} onChange={value => { cancel(); setChannel(value as LevelsChannel); }} /></div>
    {(['Inputs', 'Outputs'] as const).map((label, group) => {
      const controls = group === 0 ? levelsControls.slice(0, 3) : levelsControls.slice(3);
      return <div className="comp-levels-row" key={label}><span>{label}</span>
        <div className="comp-levels-track" onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          const target = (event.target as HTMLElement).closest<HTMLElement>('[data-level-key]');
          const rect = event.currentTarget.getBoundingClientRect(), point = (event.clientX - rect.left) / rect.width * 255;
          const key = target?.dataset.levelKey as keyof ChannelLevels | undefined ?? controls.reduce((best, item) =>
            Math.abs(position(item.key) - point) < Math.abs(position(best.key) - point) ? item : best).key;
          gesture.current = { key, initial: settings }; setDragging(key);
          event.currentTarget.querySelector<HTMLElement>(`[data-level-key="${key}"]`)?.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          if (!target) move(event);
        }} onPointerMove={move} onPointerUp={() => {
          const current = gesture.current; gesture.current = undefined; setDragging(undefined);
          if (current?.latest && JSON.stringify(current.latest) !== JSON.stringify(current.initial)) onCommit(current.latest);
          else if (current) onCancel();
        }} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current) cancel(); }}>
          {controls.map(control => {
            const label = control.key === 'gamma' ? 'Input midtones' : control.label;
            const value = position(control.key);
            return <button key={control.key} type="button" role="slider" aria-label={`${label} slider`} aria-valuemin={control.key === 'inputMax' || control.key === 'gamma' ? values.inputMin : 0}
              aria-valuemax={control.key === 'inputMin' || control.key === 'gamma' ? values.inputMax : 255} aria-valuenow={value}
              aria-valuetext={control.key === 'gamma' ? `${Math.round(value)}, gamma ${Number(values.gamma.toFixed(2))}` : String(value)}
              data-level-key={control.key} className={`comp-levels-thumb is-${control.key}${dragging === control.key ? ' is-dragging' : ''}`} style={{ left: `${value / 255 * 100}%` }}
              onKeyDown={event => {
                const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0;
                if (!delta && !['Home', 'End'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                onCommit(change(settings, control.key, event.key === 'Home' ? 0 : event.key === 'End' ? 255 : value + delta * (event.shiftKey ? 10 : 1)));
              }}><span className="comp-levels-value">{Math.round(value)}</span></button>;
          })}
        </div>
      </div>;
    })}
  </div>;
}
