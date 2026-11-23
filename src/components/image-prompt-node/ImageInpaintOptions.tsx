import { Eraser01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { InpaintBrushMode } from '../../nodes/imageInpaint';
import { GenerationOptionsPanel } from './GenerationOptionsPanel';
import { ImagePromptIcon } from './ImagePromptIcon';
import './image-inpaint-options.css';

export function ImageInpaintOptions({ diameter, mode, disabled, onDiameterChange, onModeChange, onClear }: {
  diameter: number;
  mode: InpaintBrushMode;
  disabled: boolean;
  onDiameterChange: (diameter: number) => void;
  onModeChange: (mode: InpaintBrushMode) => void;
  onClear: () => void;
}) {
  return <GenerationOptionsPanel className="image-inpaint-options" label="画笔选项" icon={<ImagePromptIcon name="metadata-edit" />}>
    <label className="image-inpaint-size">
      <span><span>画笔大小</span><span aria-hidden="true">{diameter} px</span></span>
      <input type="range" aria-label="画笔大小" aria-valuetext={`${diameter} px`} min={5} max={100} step={1}
        value={diameter} disabled={disabled} onChange={event => onDiameterChange(event.currentTarget.valueAsNumber)} />
    </label>
    <div className="image-inpaint-options-actions">
      <div className="image-inpaint-modes" role="group" aria-label="选区模式">
        <button type="button" aria-label="擦除选区" aria-pressed={mode === 'erase'} disabled={disabled}
          onClick={() => onModeChange('erase')}><ImagePromptIcon name="minus" /></button>
        <button type="button" aria-label="添加选区" aria-pressed={mode === 'paint'} disabled={disabled}
          onClick={() => onModeChange('paint')}><ImagePromptIcon name="plus" /></button>
      </div>
      <button type="button" className="image-inpaint-clear" disabled={disabled} onClick={onClear}>
        <HugeiconsIcon icon={Eraser01Icon} size={12} aria-hidden="true" />清除
      </button>
    </div>
  </GenerationOptionsPanel>;
}
