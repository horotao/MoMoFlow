import { useRef, useState, useEffect, type PointerEvent } from 'react';
import { ParameterSlider, SettingsIcon } from '../components/ParameterControls';
import { DescriberModelSelect } from '../components/DescriberModelSelect';
import { levelsChannels, levelsControls, levelsGammaPosition, levelsGammaAt, updateChannelLevels, type ChannelLevels, type LevelsChannel, type LevelsHistograms, type LevelsSettings } from './levels';

const channelLabels: Record<LevelsChannel, string> = { RGB: 'RGB', R: '红色', G: '绿色', B: '蓝色' };

type Control = typeof levelsControls[number];
function LevelsNumber({ control, value, disabled, onCommit }: { control: Control; value: number; disabled: boolean; onCommit: (value: number) => void }) {
  const formatted = String(control.key === 'gamma' ? Number(value.toFixed(2)) : value);
  const [text, setText] = useState(formatted);
  const cancelled = useRef(false);
  useEffect(() => setText(formatted), [formatted, disabled]);
  return <input type="number" aria-label={control.label} min={control.min} max={control.max} step={control.step} value={text} disabled={disabled}
    onChange={event => setText(event.target.value)} onBlur={() => {
      if (!disabled && !cancelled.current && text !== formatted && text.trim() && Number.isFinite(Number(text))) onCommit(Number(text));
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
  return <div className="levels-histogram-plot"><canvas ref={canvas} width={256} height={58} role="img" aria-label={`${channelLabels[channel]}直方图`} /></div>;
}

export function LevelsControls({ channel, settings, histogram, disabled, onChannel, onStart, onDraft, onCommit, onCancel, onSettings }: {
  channel: LevelsChannel; settings: LevelsSettings; histogram?: LevelsHistograms; disabled: boolean;
  onChannel: (channel: LevelsChannel) => void; onStart: () => void; onDraft: (settings: LevelsSettings) => void;
  onCommit: () => void; onCancel: () => void; onSettings: (settings: LevelsSettings) => void;
}) {
  const values = settings[channel];
  const active = useRef<keyof ChannelLevels>();
  const cancelledRange = useRef(false);
  const position = (key: keyof ChannelLevels) => key === 'gamma' ? levelsGammaPosition(values) : values[key];
  const move = (event: PointerEvent<HTMLDivElement>, key: keyof ChannelLevels) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const value = Math.min(255, Math.max(0, (event.clientX - rect.left) / rect.width * 255));
    const gamma = levelsGammaAt(value, values);
    onDraft(updateChannelLevels(settings, channel, key, key === 'gamma' ? gamma : value));
  };
  const cancel = () => { cancelledRange.current = true; active.current = undefined; onCancel(); };
  const track = (controls: readonly Control[]) => (
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
          onPointerUp={() => { if (active.current) { active.current = undefined; onCommit(); } cancelledRange.current = false; }}
          onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) cancelledRange.current = false; }}
          onPointerCancel={cancel} onLostPointerCapture={() => { if (active.current) cancel(); }}>
          {controls.map(control => <button key={control.key} type="button" role="slider" aria-label={`${control.label}滑块`} aria-valuemin={control.key === 'inputMax' ? values.inputMin : control.min}
            aria-valuemax={control.key === 'inputMin' ? values.inputMax : control.max} aria-valuenow={values[control.key]}
            disabled={disabled} data-level-key={control.key} className={`levels-thumb levels-thumb-${control.key}`} style={{ left: `${position(control.key) / 255 * 100}%` }}
            onKeyDown={event => {
              const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? control.step : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -control.step : 0;
              if (!delta && !['Home', 'End'].includes(event.key)) return;
              event.preventDefault(); event.stopPropagation();
              onSettings(updateChannelLevels(settings, channel, control.key, event.key === 'Home' ? control.min : event.key === 'End' ? control.max : values[control.key] + delta * (event.shiftKey ? 10 : 1)));
            }} />)}
        </div>
  );
  return <div className="levels-settings nodrag nopan nowheel" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') cancel(); }}>
    <div className="levels-channel"><label>通道</label>
      <DescriberModelSelect settings compact fluidHover trailingIcon={<SettingsIcon name="chevron" />} label="通道" menuLabel="色阶通道" choices={levelsChannels} labels={levelsChannels.map(value => channelLabels[value])} value={channel} disabled={disabled} onChange={value => { cancel(); onChannel(value as LevelsChannel); }} />
    </div>
    <div className="levels-histogram"><span>直方图</span><LevelsHistogramView histogram={histogram} channel={channel} />
      {track(levelsControls.slice(0, 3))}
      <div className="levels-values"><span>{values.inputMin}</span><span>{values.gamma.toFixed(2)}</span><span>{values.inputMax}</span></div>
    </div>
    {(['输入色阶', '输出色阶'] as const).map((label, group) => {
      const controls = group === 0 ? levelsControls.slice(0, 3) : levelsControls.slice(3);
      return <section className="levels-control-group" key={label}><h3>{label}</h3>
        {group === 1 && track(controls)}
        {controls.map(control => <ParameterSlider key={`${channel}-${control.key}`} id={`levels-${control.key}`} label={control.key === 'gamma' ? '中间调' : control.key.endsWith('Min') ? '黑场' : '白场'}
          aria-label={control.label} min={control.key === 'gamma' ? -1 : control.min} max={control.key === 'gamma' ? 1 : control.max} step={control.step} value={control.key === 'gamma' ? Math.log10(values.gamma) : values[control.key]} aria-valuetext={String(values[control.key])} disabled={disabled}
          onPointerDown={event => { cancelledRange.current = false; active.current = control.key; onStart(); event.currentTarget.setPointerCapture(event.pointerId); }}
          onChange={event => {
            if (cancelledRange.current) return;
            const next = updateChannelLevels(settings, channel, control.key, control.key === 'gamma' ? 10 ** Number(event.target.value) : Number(event.target.value));
            if (active.current) onDraft(next); else onSettings(next);
          }}
          onPointerUp={() => { if (active.current) { active.current = undefined; onCommit(); } cancelledRange.current = false; }}
          onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) cancelledRange.current = false; }}
          onPointerCancel={cancel} onLostPointerCapture={() => { if (active.current) cancel(); }}
          number={<LevelsNumber control={control} value={values[control.key]} disabled={disabled}
            onCommit={value => onSettings(updateChannelLevels(settings, channel, control.key, value))} />} />)}
      </section>;
    })}
  </div>;
}
