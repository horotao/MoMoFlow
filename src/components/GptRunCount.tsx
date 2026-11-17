import { NodeRangeInput } from '../nodes/shared/NodeRangeInput';
import './GptSettingsControls.css';

export function GptRunCount({ value, disabled, onChange }: {
  value: number; disabled?: boolean; onChange: (value: number) => void;
}) {
  return <div className="gpt-run-field">
    <span>运行次数</span>
    <div className="gpt-run-count">
      <NodeRangeInput className="gpt-run-range" aria-label="运行次数" min={1} max={10} step={1}
        value={value} disabled={disabled} onValueChange={onChange} />
      <span className="gpt-run-count-value" aria-hidden="true">{value}</span>
    </div>
  </div>;
}
