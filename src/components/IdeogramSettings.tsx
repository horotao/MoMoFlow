import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { NodeIcon } from '../nodes/NodeIcon';
import type { AppNode, IdeogramNode } from '../nodes/types';
import { isIdeogramNode, isNodeLocked } from '../nodes/types';
import { effectiveIdeogramSettings } from '../nodes/ideogramRun';
import { defaultIdeogramEditSettings, ideogramChoices, ideogramEditFields, ideogramGenerationFields, ideogramName, ideogramParameterData, validateIdeogramEditSettings, validateIdeogramSettings, type IdeogramField } from '../nodes/ideogram';
import { DescriberModelSelect } from './DescriberModelSelect';
import { DescriberIcon } from './DescriberIcon';
import { IdeogramEditSizeSelect } from './IdeogramEditSizeSelect';

const choiceLabels: Record<string, string> = { very_low: '极低', low: '低', medium: '中', high: '高', regular: '标准', true: '开启', false: '关闭' };
const labels: Record<IdeogramField, string> = { aspectRatio: '宽高比', resolution: '分辨率', quality: '质量', enablePromptExpansion: '提示词扩展', editQuality: '编辑质量', editPrecision: '编辑精度', editSize: '编辑尺寸' };
export function IdeogramSettings({ node }: { node: IdeogramNode }) {
  const { getNode, getNodes, getEdges, updateNodeData, setNodes, setEdges } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const effective = effectiveIdeogramSettings(node, nodes, edges);
  const editing = edges.some(edge => edge.target === node.id && edge.targetHandle === 'image-0');
  const masked = edges.some(edge => edge.target === node.id && edge.targetHandle === 'mask');
  const sourceSize = editing && (masked || effective.editPrecision === 'high');
  const activeFields = editing ? ideogramEditFields : ideogramGenerationFields;
  const fields = [...new Set([...activeFields, ...(node.data.exposed ?? [])])];
  const expose = (field: IdeogramField) => {
    const current = getNode(node.id);
    if (!current || !isIdeogramNode(current) || isNodeLocked(current)) return;
    const exposed = current.data.exposed ?? [];
    if (exposed.includes(field)) {
      let value = ({ ...defaultIdeogramEditSettings, ...current.data })[field];
      try {
        const effective = effectiveIdeogramSettings(current, getNodes(), getEdges());
        const settings = field.startsWith('edit') ? validateIdeogramEditSettings({ ...effective, ...(sourceSize ? { editSize: 'auto' } : {}) }) : validateIdeogramSettings(effective);
        value = (settings as Record<string, string | boolean>)[field];
      } catch { /* Keep the previous local value when the connection is invalid. */ }
      updateNodeData(node.id, { [field]: value, exposed: exposed.filter(item => item !== field) });
      setEdges(all => all.filter(edge => !(edge.target === node.id && edge.targetHandle === field)));
    } else {
      const id = crypto.randomUUID();
      setNodes(all => [...all.map(item => item.id === node.id ? { ...current, data: { ...current.data, exposed: [...exposed, field] } } : item), {
        id, type: 'model-input', position: { x: node.position.x - 340, y: node.position.y + exposed.length * 200 },
        data: ideogramParameterData(field, String(effective[field] ?? current.data[field])),
      }]);
      setEdges(all => [...all, { id: crypto.randomUUID(), source: id, target: node.id, targetHandle: field }]);
    }
  };
  return <div className="describer-settings sunburst-settings">
    <h2><NodeIcon nodeType="ideogram" size={20} /><span>{ideogramName}</span></h2>
    <p className="describer-hint">{editing ? '图片编辑 · 修改 Image 输入的原图' : '文生图 · 连接 Image 原图后自动切换为编辑'}</p>
    {fields.map(field => {
      const exposed = Boolean(node.data.exposed?.includes(field)), label = labels[field];
      const choices = [...ideogramChoices[field]];
      const inactive = !activeFields.includes(field);
      const disabled = Boolean(node.data.locked || exposed || inactive || (field === 'editSize' && sourceSize));
      const change = (value: string) => { if (!isNodeLocked(getNode(node.id))) updateNodeData(node.id, { [field]: field === 'enablePromptExpansion' ? value === 'true' : value }); };
      return <div className="describer-field" key={field}><label>{label}</label><div className="describer-field-row">
        {field === 'editSize' ? <IdeogramEditSizeSelect value={sourceSize ? 'auto' : String(effective[field] ?? 'auto')} disabled={disabled} onChange={change} /> : <DescriberModelSelect compact label={label} value={String(effective[field] ?? '')} choices={choices} labels={choices.map(value => choiceLabels[value] ?? value.toUpperCase())} disabled={disabled} onChange={change} />}
        <button disabled={node.data.locked || (!exposed && field === 'editSize' && sourceSize)} className="describer-expose" data-exposed={exposed} title={exposed ? '使用本地值' : '设为输入'} aria-label={exposed ? `${label}使用本地值` : `将${label}设为输入`} aria-pressed={exposed} onClick={() => expose(field)}><DescriberIcon name="expose" /></button>
      </div>{inactive && <p className="describer-hint">当前模式不使用此参数。</p>}</div>;
    })}
    <p className="describer-hint">{editing ? `参考图最多 ${masked ? 3 : 4} 张，只编辑 Image 原图。${sourceSize ? '使用 Mask 或高精度时，尺寸跟随原图。' : ''}` : '开启提示词扩展后，模型会先丰富提示词。'}</p>
    {editing && <p className="describer-hint">导入的黑白 Mask：黑色修改、白色保留。Painter 等节点的蒙版会自动转换，尺寸须与原图一致。</p>}
  </div>;
}
