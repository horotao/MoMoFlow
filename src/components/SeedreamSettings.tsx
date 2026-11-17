import { useReactFlow } from '@xyflow/react';
import { NodeIcon } from '../nodes/NodeIcon';
import type { AppNode, SeedreamNode } from '../nodes/types';
import { isSeedreamNode, isNodeLocked } from '../nodes/types';
import { seedreamChoices, seedreamName, type SeedreamSettings as Settings } from '../nodes/seedream';
import { GptSettingsSelect } from './GptSettingsSelect';
import { GptSettingsSegments } from './GptSettingsSegments';
import { NodeSettingsSection } from './NodeSettingsSection';
import { ParameterField } from './ParameterField';
import { SeedreamSizeSelect } from './SeedreamSizeSelect';
import { seedreamPreset } from './imageNodePresets';

const labels: Record<keyof Settings, string> = { size: '宽高比', resolution: '分辨率', outputFormat: '输出格式', background: '背景', nsfwCheck: '内容审核', watermark: '水印' };
export function SeedreamSettings({ node }: { node: SeedreamNode }) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const change = (patch: Partial<Settings>) => {
    const current = getNode(node.id);
    if (!current || !isSeedreamNode(current) || isNodeLocked(current)) return;
    if (patch.size !== undefined && current.data.size !== node.data.size) return;
    updateNodeData(node.id, patch);
    seedreamPreset.remember({ ...current.data, ...patch });
  };
  return <NodeSettingsSection title={seedreamName} icon={<NodeIcon nodeType="seedream" size={20} />} className="sunburst-settings">
    <SeedreamSizeSelect value={node.data.size ?? 'auto'} resolution={node.data.resolution} disabled={node.data.locked}
      onChange={size => change({ size })} onResolutionChange={resolution => change({ resolution })} />
    {(Object.keys(seedreamChoices) as (keyof Settings)[]).filter(field => field !== 'size' && field !== 'resolution').map(field => {
      const Control = field === 'background' ? GptSettingsSelect : GptSettingsSegments;
      const choices = field === 'outputFormat' && node.data.background === 'transparent' ? ['png'] : seedreamChoices[field];
      return <ParameterField key={field} label={labels[field]}>
        <Control label={labels[field]} value={String(node.data[field])} choices={choices}
          labels={choices.map(value => value === 'true' ? '开启' : value === 'false' ? '关闭' : value === 'auto' ? '自动' : value === 'transparent' ? '透明' : value === 'opaque' ? '不透明' : value.toUpperCase())}
          disabled={node.data.locked} onChange={value => change({
            [field]: field === 'nsfwCheck' || field === 'watermark' ? value === 'true' : value,
            ...(field === 'background' && value === 'transparent' ? { outputFormat: 'png' } : {}),
          })} />
      </ParameterField>;
    })}
  </NodeSettingsSection>;
}
