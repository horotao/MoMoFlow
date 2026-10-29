import { useState, type ReactNode } from 'react';
import { imageSizes, imageSizeLabels, validateSunburstSize, sunburstPresetSize, sunburstResolutions, sunburstSizePreset, type SunburstResolution } from '../nodes/sunburst';
import { DescriberModelSelect } from './DescriberModelSelect';

export function SunburstSizeSelect({ value, disabled, onChange, exposeButton }: {
  value: string; disabled?: boolean; onChange: (value: string) => void; exposeButton?: ReactNode;
}) {
  const [custom, setCustom] = useState(false);
  const preset = sunburstSizePreset(value);
  const isCustom = custom || (value !== 'auto' && !preset);
  const resolution = preset?.resolution ?? '1K';
  const [width = '', height = ''] = value === 'auto' ? ['1024', '1024'] : value.split('x');
  let error = '';
  try { validateSunburstSize(value); } catch (cause) { error = (cause as Error).message; }
  return <>
    <div className="describer-field"><label>宽高比</label><div className="describer-field-row">
      <div className="sunburst-size-control nodrag nopan nowheel">
        <DescriberModelSelect fluidHover compact label="宽高比" value={isCustom ? 'custom' : preset?.ratio ?? 'auto'} choices={[...imageSizes, 'custom']} labels={[...imageSizeLabels, '自定义']} disabled={disabled} onChange={next => {
          setCustom(next === 'custom');
          onChange(next === 'custom' ? (value === 'auto' ? '1024x1024' : value) : next === 'auto' ? 'auto' : sunburstPresetSize(next, resolution));
        }} />
        {isCustom && <div className="sunburst-custom-size">
          <label>宽度<input type="number" aria-label="图像宽度" min={16} max={3840} step={16} value={width} disabled={disabled} aria-invalid={Boolean(error)} onChange={event => { setCustom(true); onChange(`${event.target.value}x${height}`); }} /></label>
          <span>×</span>
          <label>高度<input type="number" aria-label="图像高度" min={16} max={3840} step={16} value={height} disabled={disabled} aria-invalid={Boolean(error)} onChange={event => { setCustom(true); onChange(`${width}x${event.target.value}`); }} /></label>
        </div>}
        {error && <div className="sunburst-size-note" role="alert">{error}</div>}
      </div>{exposeButton}
    </div></div>
    <div className="describer-field"><label>分辨率</label><div className="sunburst-field-row">
      <DescriberModelSelect fluidHover compact label="分辨率" value={isCustom ? 'custom' : value === 'auto' ? 'auto' : resolution}
        choices={['auto', ...sunburstResolutions, 'custom']} labels={['自动', '1K', '2K', '4K', '自定义']}
        disabled={disabled} onChange={next => {
          if (next === 'custom') { setCustom(true); if (value === 'auto') onChange('1024x1024'); return; }
          setCustom(false);
          // An arbitrary custom size has no preset ratio. Preserve a matching
          // preset when available; otherwise start the chosen tier at 1:1.
          onChange(next === 'auto' ? 'auto' : sunburstPresetSize(preset?.ratio ?? '1024x1024', next as SunburstResolution));
        }} />
    </div>
      {!error && isCustom && !preset && <div className="sunburst-size-note">自定义尺寸切换到分辨率预设时使用正方形。</div>}
    </div>
  </>;
}
