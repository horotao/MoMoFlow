import { useState } from 'react';
import { imageSizes, imageSizeLabels, validateSunburstSize } from '../nodes/sunburst';
import { DescriberModelSelect } from './DescriberModelSelect';

export function SunburstSizeSelect({ value, disabled, onChange, node = false }: {
  value: string; disabled?: boolean; onChange: (value: string) => void; node?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const isCustom = custom || !imageSizes.some(size => size === value);
  const [width = '', height = ''] = value === 'auto' ? ['1024', '1024'] : value.split('x');
  let error = '';
  try { validateSunburstSize(value); } catch (cause) { error = (cause as Error).message; }
  return <div className="sunburst-size-control nodrag nopan nowheel">
    <DescriberModelSelect compact={!node} node={node} label="Aspect Ratio" value={isCustom ? 'custom' : value} choices={[...imageSizes, 'custom']} labels={[...imageSizeLabels, 'Custom']} disabled={disabled} onChange={next => {
      setCustom(next === 'custom');
      onChange(next === 'custom' ? (value === 'auto' ? '1024x1024' : value) : next);
    }} />
    {isCustom && <div className="sunburst-custom-size">
      <label>Width<input type="number" aria-label="Image width" min={16} max={3840} step={16} value={width} disabled={disabled} aria-invalid={Boolean(error)} onChange={event => { setCustom(true); onChange(`${event.target.value}x${height}`); }} /></label>
      <span>×</span>
      <label>Height<input type="number" aria-label="Image height" min={16} max={3840} step={16} value={height} disabled={disabled} aria-invalid={Boolean(error)} onChange={event => { setCustom(true); onChange(`${width}x${event.target.value}`); }} /></label>
    </div>}
    {error && <div className="sunburst-size-note" role="alert">{error}</div>}
    {!error && Number(width) * Number(height) > 2560 * 1440 && <div className="sunburst-size-note">Experimental resolution</div>}
  </div>;
}
