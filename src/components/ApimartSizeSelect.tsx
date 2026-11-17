import { apimartAspectRatios, apimartStandardAspectRatios, sunburstResolutions, validateApimartGifSize, validateSunburstSize } from '../nodes/sunburst';
import { GptSettingsSelect } from './GptSettingsSelect';
import { GptSettingsSegments } from './GptSettingsSegments';
import { ParameterField } from './ParameterField';

export function ApimartSizeSelect({ value, resolution, standard, gif, frameCount, disabled, onChange, onResolutionChange }: {
  value: string; resolution: string; standard: boolean; gif: boolean; frameCount: number;
  disabled?: boolean;
  onChange: (value: string) => void; onResolutionChange: (value: string) => void;
}) {
  const ratios: readonly string[] = standard ? gif ? ['auto'] : apimartStandardAspectRatios : apimartAspectRatios;
  const custom = standard && !ratios.includes(value);
  const [width = '', height = ''] = custom ? value.split('x') : gif ? ['512', '512'] : ['1024', '1024'];
  let error = '';
  if (custom) try { if (gif) validateApimartGifSize(value, frameCount); else validateSunburstSize(value); } catch (cause) { error = (cause as Error).message; }
  return <>
    <ParameterField label="宽高比" detail={<>
      {custom && <div className="sunburst-custom-size">{(['宽度', '高度'] as const).map((label, index) => <label key={label}>{label}<span className="sunburst-dimension">
        <input type="number" aria-label={`图像${label}`} min={16} max={3840} step={16} value={index === 0 ? width : height} disabled={disabled} aria-invalid={Boolean(error)} onChange={event => {
          onChange(index === 0 ? `${event.target.value}x${height}` : `${width}x${event.target.value}`);
        }} /><span aria-hidden="true">px</span>
      </span></label>)}</div>}
      {error && <div className="sunburst-size-note" role="alert">{error}</div>}
    </>}>
      <GptSettingsSelect label="宽高比" value={custom ? 'custom' : value}
        choices={standard ? [...ratios, 'custom'] : ratios} labels={[...ratios.map(value => value === 'auto' ? '自动' : value), ...(standard ? ['自定义'] : [])]}
        disabled={disabled || !standard && gif} onChange={next => onChange(next === 'custom' ? gif ? '512x512' : '1024x1024' : next)} />
    </ParameterField>
    {!custom && !(standard && gif) && <ParameterField label="分辨率">
      <GptSettingsSegments label="分辨率" value={resolution} choices={sunburstResolutions}
        disabled={disabled} onChange={onResolutionChange} />
    </ParameterField>}
  </>;
}
