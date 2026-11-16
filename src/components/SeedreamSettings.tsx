import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { NodeIcon } from '../nodes/NodeIcon';
import type { AppNode, SeedreamNode } from '../nodes/types';
import { isSeedreamNode, isNodeLocked } from '../nodes/types';
import { effectiveSeedreamSettings } from '../nodes/seedreamRun';
import { isSeedreamExactSize, seedreamChoices, seedreamName, seedreamParameterData, validateSeedreamSettings, type SeedreamSettings as Settings } from '../nodes/seedream';
import { DescriberModelSelect } from './DescriberModelSelect';
import { NodeSettingsSection } from './NodeSettingsSection';
import { ParameterField } from './ParameterField';
import { ParameterExposeButton } from './ParameterExposeButton';
import { SeedreamSizeSelect } from './SeedreamSizeSelect';
import { seedreamPreset } from './imageNodePresets';

const labels: Record<keyof Settings, string> = { size: '宽高比', resolution: '分辨率', outputFormat: '输出格式', background: '背景', nsfwCheck: '内容审核', watermark: '水印' };
export function SeedreamSettings({ node }: { node: SeedreamNode }) {
  const { getNode, getNodes, getEdges, updateNodeData, setNodes, setEdges } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const effective = effectiveSeedreamSettings(node, nodes, edges);
  const change = (patch: Partial<Settings>) => {
    const current = getNode(node.id);
    if (!current || !isSeedreamNode(current) || isNodeLocked(current)) return;
    if (patch.size !== undefined && current.data.size !== node.data.size) return;
    updateNodeData(node.id, patch);
    seedreamPreset.remember({ ...current.data, ...patch });
  };
  const expose = (field: keyof Settings) => {
    const current = getNode(node.id);
    if (!current || !isSeedreamNode(current) || isNodeLocked(current)) return;
    const exposed = current.data.exposed ?? [];
    if (exposed.includes(field)) {
      let settings: Settings;
      try { settings = validateSeedreamSettings(effectiveSeedreamSettings(current, getNodes(), getEdges())); }
      catch { settings = current.data; }
      updateNodeData(node.id, { [field]: settings[field], exposed: exposed.filter(item => item !== field) });
      setEdges(all => all.filter(edge => !(edge.target === node.id && edge.targetHandle === field)));
    } else {
      const id = crypto.randomUUID();
      setNodes(all => [...all.map(item => item.id === node.id ? { ...current, data: { ...current.data, exposed: [...exposed, field] } } : item), {
        id, type: 'model-input', position: { x: node.position.x - 340, y: node.position.y + exposed.length * 200 },
        data: seedreamParameterData(field, String(effective[field] ?? current.data[field])),
      }]);
      setEdges(all => [...all, { id: crypto.randomUUID(), source: id, target: node.id, targetHandle: field }]);
    }
  };
  const exposeButton = (field: keyof Settings) => <ParameterExposeButton label={labels[field]} exposed={Boolean(node.data.exposed?.includes(field))}
    disabled={node.data.locked || field === 'resolution' && isSeedreamExactSize(effective.size) && !node.data.exposed?.includes(field)} onClick={() => expose(field)} />;
  return <NodeSettingsSection title={seedreamName} icon={<NodeIcon nodeType="seedream" size={20} />} className="sunburst-settings">
    <div className="sunburst-provider"><span>APIMart</span><span>按用量计费</span></div>
    <SeedreamSizeSelect value={String(effective.size)} resolution={String(effective.resolution)}
      disabled={node.data.locked || node.data.exposed?.includes('size')} resolutionDisabled={node.data.locked || node.data.exposed?.includes('resolution')}
      exposeButton={exposeButton('size')} resolutionExposeButton={exposeButton('resolution')}
      onChange={size => change({ size })} onResolutionChange={resolution => change({ resolution })} />
    {(Object.keys(seedreamChoices) as (keyof Settings)[]).filter(field => field !== 'size' && field !== 'resolution').map(field => {
      const exposed = Boolean(node.data.exposed?.includes(field)), label = labels[field];
      const choices = field === 'outputFormat' && effective.background === 'transparent' ? ['png'] : [...seedreamChoices[field]];
      return <ParameterField key={field} label={label} exposeButton={exposeButton(field)}>
        <DescriberModelSelect appearance="settings" fluidHover compact label={label} value={String(effective[field] ?? '')} choices={choices} labels={choices.map(value => value === 'true' ? '开启' : value === 'false' ? '关闭' : value === 'auto' ? '自动' : value === 'transparent' ? '透明' : value === 'opaque' ? '不透明' : value.toUpperCase())} disabled={node.data.locked || exposed} onChange={value => change({
          [field]: field === 'nsfwCheck' || field === 'watermark' ? value === 'true' : value,
          ...(field === 'background' && value === 'transparent' && !node.data.exposed?.includes('outputFormat') ? { outputFormat: 'png' } : {}),
        })} />
      </ParameterField>;
    })}
  </NodeSettingsSection>;
}
