import { useRef, useState, useEffect, type PointerEvent } from 'react';
import { DescriberModelSelect } from '../components/DescriberModelSelect';
import { defaultLevelsSettings, levelsChannels, levelsControls, levelsGammaPosition, levelsGammaAt, updateChannelLevels, type ChannelLevels, type LevelsChannel, type LevelsHistograms, type LevelsSettings } from './levels';

type Control = typeof levelsControls[number];
function LevelsNumber({ control, value, disabled, onCommit }: { control: Control; value: number; disabled: boolean; onCommit: (value: number) => void }) {
  const formatted = String(control.key === 'gamma' ? Number(value.toFixed(2)) : value);
  const [text, setText] = useState(formatted);
  const cancelled = useRef(false);
  useEffect(() => setText(formatted), [formatted]);
  return <input type="number" aria-label={control.label} min={control.min} max={control.max} step={control.step} value={text} disabled={disabled}
    onChange={event => setText(event.target.value)} onBlur={() => {
      if (!cancelled.current && text !== formatted && text.trim() && Number.isFinite(Number(text))) onCommit(Number(text));
      cancelled.current = false; setText(formatted);
    }} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); }
      if (event.key === 'Enter') event.currentTarget.blur();
    }} />;
}

function LevelsHistogramView({ histogram, channel }: { histogram?: LevelsHistograms; channel: LevelsChannel }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 256, 58);
    if (!histogram) return;
    const source = histogram.source[channel], adjusted = histogram.adjusted[channel];
    const peak = Math.max(...source, ...adjusted);
    if (!peak) return;
    // Shared scale keeps before/after densities comparable. Keep the raster
    // columns and eight-pixel headroom when the graph is enlarged on the canvas.
    for (const [bins, opacity] of [[source, .75], [adjusted, .25]] as const) {
      context.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      bins.forEach((count, index) => {
        const height = Math.round(count / peak * 50);
        context.fillRect(index, 58 - height, 1, height);
      });
    }
  }, [histogram, channel]);
  return <div className="levels-histogram-plot"><canvas ref={canvas} width={256} height={58} role="img" aria-label={`${channel} histogram`} /></div>;
}

export function LevelsControls({ channel, settings, histogram, disabled, onChannel, onStart, onDraft, onCommit, onCancel, onSettings }: {
  channel: LevelsChannel; settings: LevelsSettings; histogram?: LevelsHistograms; disabled: boolean;
  onChannel: (channel: LevelsChannel) => void; onStart: () => void; onDraft: (settings: LevelsSettings) => void;
  onCommit: () => void; onCancel: () => void; onSettings: (settings: LevelsSettings) => void;
}) {
  const values = settings[channel];
  const active = useRef<keyof ChannelLevels>();
  const position = (key: keyof ChannelLevels) => key === 'gamma' ? levelsGammaPosition(values) : values[key];
  const move = (event: PointerEvent<HTMLDivElement>, key: keyof ChannelLevels) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const value = Math.min(255, Math.max(0, (event.clientX - rect.left) / rect.width * 255));
    const gamma = levelsGammaAt(value, values);
    onDraft(updateChannelLevels(settings, channel, key, key === 'gamma' ? gamma : value));
  };
  const cancel = () => { active.current = undefined; onCancel(); };
  return <div className="levels-settings nodrag nopan nowheel" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') cancel(); }}>
    <div className="levels-row levels-channel"><span>Channel</span><div className="levels-channel-actions">
      <DescriberModelSelect compact label="Channel" menuLabel="Levels channel" choices={levelsChannels} value={channel} disabled={disabled} onChange={value => onChannel(value as LevelsChannel)} />
      <button className="color-reset" type="button" disabled={disabled} onClick={() => onSettings(structuredClone(defaultLevelsSettings))}>Reset</button>
    </div></div>
    <div className="levels-row levels-histogram"><span>Histogram</span><LevelsHistogramView histogram={histogram} channel={channel} /></div>
    {(['Inputs', 'Outputs'] as const).map((label, group) => {
      const controls = group === 0 ? levelsControls.slice(0, 3) : levelsControls.slice(3);
      return <div className="levels-row levels-range-row" key={label}><span>{label}</span><div>
        <div className="levels-track" onPointerDown={event => {
          if (disabled || event.button !== 0) return;
          event.preventDefault();
          const target = (event.target as HTMLElement).closest<HTMLElement>('[data-level-key]');
          const rect = event.currentTarget.getBoundingClientRect();
          const point = (event.clientX - rect.left) / rect.width * 255;
          const key = target?.dataset.levelKey as keyof ChannelLevels | undefined
            ?? controls.reduce((best, item) => Math.abs(position(item.key) - point) < Math.abs(position(best.key) - point) ? item : best).key;
          event.currentTarget.querySelector<HTMLElement>(`[data-level-key="${key}"]`)?.focus();
          active.current = key; onStart();
          event.currentTarget.setPointerCapture(event.pointerId);
          if (!target) move(event, key);
        }} onPointerMove={event => { if (active.current) move(event, active.current); }}
          onPointerUp={() => { if (active.current) { active.current = undefined; onCommit(); } }}
          onPointerCancel={cancel} onLostPointerCapture={() => { if (active.current) cancel(); }}>
          {controls.map(control => <button key={control.key} type="button" role="slider" aria-label={`${control.label} slider`} aria-valuemin={control.key === 'inputMax' ? values.inputMin : control.min}
            aria-valuemax={control.key === 'inputMin' ? values.inputMax : control.max} aria-valuenow={values[control.key]}
            disabled={disabled} data-level-key={control.key} className={`levels-thumb levels-thumb-${control.key}`} style={{ left: `${position(control.key) / 255 * 100}%` }}
            onKeyDown={event => {
              const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? control.step : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -control.step : 0;
              if (!delta && !['Home', 'End'].includes(event.key)) return;
              event.preventDefault(); event.stopPropagation();
              onSettings(updateChannelLevels(settings, channel, control.key, event.key === 'Home' ? control.min : event.key === 'End' ? control.max : values[control.key] + delta * (event.shiftKey ? 10 : 1)));
            }} />)}
        </div>
        <div className="levels-numbers">{controls.map(control => <LevelsNumber key={`${channel}-${control.key}`} control={control} value={values[control.key]} disabled={disabled}
          onCommit={value => onSettings(updateChannelLevels(settings, channel, control.key, value))} />)}</div>
      </div></div>;
    })}
  </div>;
}
