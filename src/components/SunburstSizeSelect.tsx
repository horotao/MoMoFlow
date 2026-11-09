import { useState, type ReactNode } from 'react';
import { imageSizes, imageSizeLabels, validateSunburstSize, sunburstPresetSize, sunburstResolutions, sunburstSizePreset, type SunburstResolution } from '../nodes/sunburst';
import { DescriberModelSelect } from './DescriberModelSelect';
import { ParameterField } from './ParameterField';

export function SunburstSizeSelect({ value, disabled, onChange, exposeButton, resolutionExposeButton, appearance = 'settings' }: {
  value: string; disabled?: boolean; onChange: (value: string) => void; exposeButton?: ReactNode; resolutionExposeButton?: ReactNode; appearance?: 'default' | 'settings';
}) {
  const [custom, setCustom] = useState(false);
  const preset = sunburstSizePreset(value);
  const isCustom = value !== 'auto' && (custom || !preset);
  const resolution = preset?.resolution ?? '1K';
  const [width = '', height = ''] = value === 'auto' ? ['1024', '1024'] : value.split('x');
  let error = '';
  try { validateSunburstSize(value); } catch (cause) { error = (cause as Error).message; }
  return <>
    <ParameterField label="宽高比" exposeButton={exposeButton} detail={<>
      {isCustom && <div className="sunburst-custom-size">{(['宽度', '高度'] as const).map((label, index) => <label key={label}>{label}<span className="sunburst-dimension">
        <input type="number" aria-label={`图像${label}`} min={16} max={3840} step={16} value={index === 0 ? width : height} disabled={disabled} aria-invalid={Boolean(error)} onChange={event => {
          setCustom(true); onChange(index === 0 ? `${event.target.value}x${height}` : `${width}x${event.target.value}`);
        }} /><span aria-hidden="true">px</span>
      </span></label>)}</div>}
      {error && <div className="sunburst-size-note" role="alert">{error}</div>}
    </>}>
      <DescriberModelSelect appearance={appearance} fluidHover compact label="宽高比" value={isCustom ? 'custom' : preset?.ratio ?? 'auto'} choices={[...imageSizes, 'custom']} labels={[...imageSizeLabels, '自定义']} disabled={disabled} onChange={next => {
        setCustom(next === 'custom');
        onChange(next === 'custom' ? (value === 'auto' ? '1024x1024' : value) : next === 'auto' ? 'auto' : sunburstPresetSize(next, resolution));
      }} />
    </ParameterField>
    <ParameterField label="分辨率" exposeButton={resolutionExposeButton}>
      <DescriberModelSelect appearance={appearance} fluidHover compact label="分辨率" value={isCustom ? 'custom' : value === 'auto' ? 'auto' : resolution}
        choices={['auto', ...sunburstResolutions, 'custom']} labels={['自动', '1K', '2K', '4K', '自定义']} disabled={disabled} onChange={next => {
          if (next === 'custom') { setCustom(true); if (value === 'auto') onChange('1024x1024'); return; }
          setCustom(false);
          onChange(next === 'auto' ? 'auto' : sunburstPresetSize(preset?.ratio ?? '1024x1024', next as SunburstResolution));
        }} />
    </ParameterField>
  </>;
}
