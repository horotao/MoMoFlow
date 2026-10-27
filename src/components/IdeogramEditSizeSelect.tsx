import { useState } from 'react';
import { ideogramChoices, validateIdeogramEditSize } from '../nodes/ideogram';
import { DescriberModelSelect } from './DescriberModelSelect';

export function IdeogramEditSizeSelect({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [custom, setCustom] = useState(false);
  const choices: readonly string[] = ideogramChoices.editSize;
  const isCustom = custom || !choices.includes(value);
  const [width = '', height = ''] = value === 'auto' ? ['1024', '1024'] : value.split('*');
  let error = '';
  try { validateIdeogramEditSize(value); } catch (cause) { error = (cause as Error).message; }
  return <div className="sunburst-size-control nodrag nopan nowheel">
    <DescriberModelSelect compact label="编辑尺寸" value={isCustom && !disabled ? 'custom' : value} choices={[...choices, 'custom']} labels={['跟随原图', '1024 × 1024', '1536 × 1024', '1024 × 1536', '2048 × 2048', '自定义']} disabled={disabled} onChange={next => {
      setCustom(next === 'custom'); onChange(next === 'custom' ? (value === 'auto' ? '1024*1024' : value) : next);
    }} />
    {isCustom && !disabled && <div className="sunburst-custom-size">
      <label>宽度<input type="number" aria-label="编辑图像宽度" min={256} max={4992} step={32} value={width} aria-invalid={Boolean(error)} onChange={event => onChange(`${event.target.value}*${height}`)} /></label>
      <span>×</span>
      <label>高度<input type="number" aria-label="编辑图像高度" min={256} max={4992} step={32} value={height} aria-invalid={Boolean(error)} onChange={event => onChange(`${width}*${event.target.value}`)} /></label>
    </div>}
    {error && !disabled && <div className="sunburst-size-note" role="alert">{error}</div>}
  </div>;
}
