import { Plus } from 'lucide-react';
import type { ModelInputNode } from '../nodes/types';
import { describerModels } from '../nodes/describer';

export function ModelOptionsSettings({ node, onChange }: {
  node: ModelInputNode; onChange: (data: Partial<ModelInputNode['data']>) => void;
}) {
  const { data } = node;
  // Include a custom value from earlier nodes so the selected value remains editable.
  const savedOptions = data.options ?? describerModels;
  const options = savedOptions.includes(data.model) ? savedOptions : [data.model, ...savedOptions];
  return <div className="describer-settings model-options-settings">
    <h2>{data.label || 'Model Name'}</h2>
    <div className="describer-field" id={`options-${node.id}`}>Options</div>
    <div role="radiogroup" aria-labelledby={`options-${node.id}`}>
      {options.map((option, index) => <div className="model-option-row" key={index}>
        <input disabled={data.locked} type="radio" name={`model-${node.id}`} aria-label={option || `Option ${index + 1}`} checked={data.model === option} onChange={() => onChange({ model: option })} />
        <input disabled={data.locked} type="text" aria-label={`Option ${index + 1}`} value={option} onChange={event => {
          const updated = [...options];
          updated[index] = event.target.value;
          onChange({ options: updated, ...(data.model === option ? { model: event.target.value } : {}) });
        }} />
      </div>)}
    </div>
    <button disabled={data.locked} className="model-add-option" onClick={() => {
      let option = 'New option';
      for (let count = 2; options.includes(option); count++) option = `New option ${count}`;
      onChange({ options: [...options, option] });
    }}><Plus size={16} strokeWidth={1} />Add another item</button>
  </div>;
}
