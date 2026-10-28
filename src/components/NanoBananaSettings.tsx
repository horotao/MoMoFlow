import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { NodeIcon } from '../nodes/NodeIcon';
import type { AppNode, NanoBananaNode } from '../nodes/types';
import { isNanoBananaNode, isNodeLocked } from '../nodes/types';
import { effectiveNanoBananaSettings } from '../nodes/nanoBananaRun';
import { nanoBananaChoices, nanoBananaName, nanoBananaParameterData, validateNanoBananaSettings, type NanoBananaSettings as Settings } from '../nodes/nanoBanana';
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
        id, type: 'model-input', position: { x: node.position.x - 340, y: node.position.y + exposed.length * 200 },
        data: nanoBananaParameterData(field, String(effective[field] ?? current.data[field])),
      }]);
      setEdges(all => [...all, { id: crypto.randomUUID(), source: id, target: node.id, targetHandle: field }]);
    }
  };
  return <div className="describer-settings sunburst-settings">
    <h2><NodeIcon nodeType="nano-banana" size={20} /><span>{nanoBananaName}</span></h2>
    {(Object.keys(nanoBananaChoices) as (keyof Settings)[]).map(field => {
      const exposed = Boolean(node.data.exposed?.includes(field)), label = labels[field];
      const choices = [...nanoBananaChoices[field]];
      return <div className="describer-field" key={field}><label>{label}</label><div className="describer-field-row">
        <DescriberModelSelect fluidHover compact label={label} value={String(effective[field] ?? '')} choices={choices} labels={choices.map(value => value === 'auto' ? '自动' : value.toUpperCase())} disabled={node.data.locked || exposed} onChange={value => { if (!isNodeLocked(getNode(node.id))) updateNodeData(node.id, { [field]: value }); }} />
        <button disabled={node.data.locked} className="describer-expose" data-exposed={exposed} title={exposed ? '使用本地值' : '设为输入'} aria-label={exposed ? `${label}使用本地值` : `将${label}设为输入`} aria-pressed={exposed} onClick={() => expose(field)}><DescriberIcon name="expose" /></button>
      </div></div>;
    })}
    <p className="describer-hint">格式在生成后转换；JPEG 的透明区域会填为白色。</p>
  </div>;
}
