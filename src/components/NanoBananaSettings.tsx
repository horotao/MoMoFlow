import { useReactFlow } from '@xyflow/react';
import { NodeIcon } from '../nodes/NodeIcon';
import type { AppNode, NanoBananaNode } from '../nodes/types';
import { isNanoBananaNode, isNodeLocked } from '../nodes/types';
import { nanoBananaChoices, nanoBananaName, type NanoBananaSettings as Settings } from '../nodes/nanoBanana';
import { GptSettingsSelect } from './GptSettingsSelect';
import { GptSettingsSegments } from './GptSettingsSegments';
import { NodeSettingsSection } from './NodeSettingsSection';
import { ParameterField } from './ParameterField';
import { nanoBananaPreset } from './imageNodePresets';

const labels: Record<keyof Settings, string> = { aspectRatio: '宽高比', imageSize: '分辨率', outputFormat: '输出格式' };
export function NanoBananaSettings({ node }: { node: NanoBananaNode }) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const change = (field: keyof Settings, value: string) => {
    const current = getNode(node.id);
    if (!current || !isNanoBananaNode(current) || isNodeLocked(current)) return;
    const patch = { [field]: value };
    updateNodeData(node.id, patch);
    nanoBananaPreset.remember({ ...current.data, ...patch });
  };
  return <NodeSettingsSection title={nanoBananaName} icon={<NodeIcon nodeType="nano-banana" size={20} />} className="sunburst-settings">
    {(Object.keys(nanoBananaChoices) as (keyof Settings)[]).map(field => {
      const Control = field === 'aspectRatio' ? GptSettingsSelect : GptSettingsSegments;
      const choices: readonly string[] = nanoBananaChoices[field];
      return <ParameterField key={field} label={labels[field]}>
        <Control label={labels[field]} value={node.data[field]} choices={choices}
          labels={choices.map(value => value === 'auto' ? '自动' : value.toUpperCase())}
          disabled={node.data.locked} onChange={value => change(field, value)} />
      </ParameterField>;
    })}
  </NodeSettingsSection>;
}
