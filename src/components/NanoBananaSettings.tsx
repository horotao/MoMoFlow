import { modelParameterPosition } from '../nodes/nodeLayout';
import { SettingsIcon, SettingsSection } from './ParameterControls';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import type { AppNode, NanoBananaNode } from '../nodes/types';
import { isNanoBananaNode, isNodeLocked } from '../nodes/types';
import { effectiveNanoBananaSettings } from '../nodes/nanoBananaRun';
import { nanoBananaChoices, nanoBananaParameterData, validateNanoBananaSettings, type NanoBananaSettings as Settings } from '../nodes/nanoBanana';
import { DescriberModelSelect } from './DescriberModelSelect';
import { DescriberIcon } from './DescriberIcon';

const labels: Record<keyof Settings, string> = { aspectRatio: '宽高比', imageSize: '分辨率', outputFormat: '输出格式' };
export function NanoBananaSettings({ node }: { node: NanoBananaNode }) {
  const { getNode, getNodes, getEdges, updateNodeData, setNodes, setEdges } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const effective = effectiveNanoBananaSettings(node, nodes, edges);
  const expose = (field: keyof Settings) => {
    const current = getNode(node.id);
    if (!current || !isNanoBananaNode(current) || isNodeLocked(current)) return;
    const exposed = current.data.exposed ?? [];
    if (exposed.includes(field)) {
      let settings: Settings;
      try { settings = validateNanoBananaSettings(effectiveNanoBananaSettings(current, getNodes(), getEdges())); }
      catch { settings = current.data; }
      updateNodeData(node.id, { [field]: settings[field], exposed: exposed.filter(item => item !== field) });
      setEdges(all => all.filter(edge => !(edge.target === node.id && edge.targetHandle === field)));
    } else {
      const id = crypto.randomUUID();
      setNodes(all => [...all.map(item => item.id === node.id ? { ...current, data: { ...current.data, exposed: [...exposed, field] } } : item), {
        id, type: 'model-input', position: modelParameterPosition(current, all, exposed.length),
        data: nanoBananaParameterData(field, String(effective[field] ?? current.data[field])),
      }]);
      setEdges(all => [...all, { id: crypto.randomUUID(), source: id, target: node.id, targetHandle: field }]);
    }
  };
  const renderField = (field: keyof Settings) => {
      const exposed = Boolean(node.data.exposed?.includes(field)), label = labels[field];
      const choices = [...nanoBananaChoices[field]];
      return <div className="describer-field" key={field}><label>{label}</label><div className="describer-field-row">
        <DescriberModelSelect settings fluidHover compact trailingIcon={<SettingsIcon name="chevron" />} label={label} value={String(effective[field] ?? '')} choices={choices} labels={choices.map(value => value === 'auto' ? '自动' : value.toUpperCase())} disabled={node.data.locked || exposed} onChange={value => { if (!isNodeLocked(getNode(node.id))) updateNodeData(node.id, { [field]: value }); }} />
        <button disabled={node.data.locked} className="describer-expose" data-exposed={exposed} title={exposed ? '使用本地值' : '设为输入'} aria-label={exposed ? `${label}使用本地值` : `将${label}设为输入`} aria-pressed={exposed} onClick={() => expose(field)}><DescriberIcon name="expose" /></button>
      </div></div>;
  };

  return <div className="describer-settings sunburst-settings">
    <div className="describer-field settings-provider"><label>渠道商</label><div className="settings-fixed-value">ZenMux</div></div>
    {renderField('aspectRatio')}{renderField('imageSize')}
    <SettingsSection>{renderField('outputFormat')}
      <div className="describer-field"><label>模型版本</label><div className="settings-fixed-value">Nano Banana 2.1</div></div>
      <p className="describer-hint">格式在生成后转换；JPEG 的透明区域会填为白色。</p>
    </SettingsSection>
  </div>;
}
