import type { ReactNode } from 'react';
import { apimartAspectRatios, apimartStandardAspectRatios, sunburstResolutions, validateApimartGifSize, validateSunburstSize } from '../nodes/sunburst';
import { DescriberModelSelect } from './DescriberModelSelect';
import { ParameterField } from './ParameterField';

export function ApimartSizeSelect({ value, resolution, standard, gif, frameCount, disabled, resolutionDisabled, onChange, onResolutionChange, exposeButton, resolutionExposeButton }: {
  value: string; resolution: string; standard: boolean; gif: boolean; frameCount: number;
  disabled?: boolean; resolutionDisabled?: boolean;
  onChange: (value: string) => void; onResolutionChange: (value: string) => void;
  exposeButton: ReactNode; resolutionExposeButton: ReactNode;
}) {
  const ratios: readonly string[] = standard ? gif ? ['auto'] : apimartStandardAspectRatios : apimartAspectRatios;
  const custom = standard && !ratios.includes(value);
  const [width = '', height = ''] = custom ? value.split('x') : gif ? ['512', '512'] : ['1024', '1024'];
  let error = '';
  if (custom) try { if (gif) validateApimartGifSize(value, frameCount); else validateSunburstSize(value); } catch (cause) { error = (cause as Error).message; }
  return <>
    <ParameterField label="宽高比" exposeButton={exposeButton} detail={<>
      {custom && <div className="sunburst-custom-size">{(['宽度', '高度'] as const).map((label, index) => <label key={label}>{label}<span className="sunburst-dimension">
        <input type="number" aria-label={`图像${label}`} min={16} max={3840} step={16} value={index === 0 ? width : height} disabled={disabled} aria-invalid={Boolean(error)} onChange={event => {
          onChange(index === 0 ? `${event.target.value}x${height}` : `${width}x${event.target.value}`);
        }} /><span aria-hidden="true">px</span>
      </span></label>)}</div>}
      {error && <div className="sunburst-size-note" role="alert">{error}</div>}
    </>}>
      <DescriberModelSelect appearance="settings" fluidHover compact label="宽高比" value={custom ? 'custom' : value}
        choices={standard ? [...ratios, 'custom'] : ratios} labels={[...ratios.map(value => value === 'auto' ? '自动' : value), ...(standard ? ['自定义'] : [])]}
        disabled={disabled || !standard && gif} onChange={next => onChange(next === 'custom' ? gif ? '512x512' : '1024x1024' : next)} />
    </ParameterField>
    {!(standard && gif) && <ParameterField label="分辨率" exposeButton={resolutionExposeButton}>
      <DescriberModelSelect appearance="settings" fluidHover compact label="分辨率" value={custom ? 'custom' : resolution}
        choices={custom ? ['custom'] : sunburstResolutions} labels={custom ? ['自定义'] : sunburstResolutions}
        disabled={resolutionDisabled || custom} onChange={onResolutionChange} />
    </ParameterField>}
  </>;
}
