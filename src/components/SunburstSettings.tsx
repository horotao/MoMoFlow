import { SunburstSizeSelect } from './SunburstSizeSelect';
import { sunburstParameterData } from '../nodes/sunburst';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import type { AppNode, SunburstNode } from '../nodes/types';
import { isNodeLocked } from '../nodes/types';
import { effectiveSunburstSettings } from '../nodes/sunburstRun';
import { imageBackgrounds, imageFormats, imageQualities, imageSizes, imageSizeLabels, sunburstName, sunburstFieldLabels, validateSunburstSettings, type SunburstSettings as Settings } from '../nodes/sunburst';
import { DescriberModelSelect } from './DescriberModelSelect';
import { DescriberIcon } from './DescriberIcon';
import { OpenAIIcon } from './OpenAIIcon';

export function SunburstSettings({ node }: { node: SunburstNode }) {
  const { getNode, getNodes, getEdges, setNodes, setEdges, updateNodeData } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(); const edges = useEdges();
  const effective = effectiveSunburstSettings(node, nodes, edges);
  const change = (field: keyof Settings, value: string) => {
    if (isNodeLocked(getNode(node.id))) return;
    // JPEG cannot represent transparency; switching local values keeps the pair valid.
    updateNodeData(node.id, { [field]: value,
      ...(field === 'background' && value === 'transparent' && node.data.outputFormat === 'jpeg' ? { outputFormat: 'png' } : {}),
      ...(field === 'outputFormat' && value === 'jpeg' && node.data.background === 'transparent' ? { background: 'opaque' } : {}),
    });
  };
  const expose = (field: keyof Settings) => {
    const current = getNode(node.id);
    if (!current || isNodeLocked(current)) return;
    const exposed = node.data.exposed ?? [];
    if (exposed.includes(field)) {
      let settings: Settings;
      try { settings = validateSunburstSettings(effectiveSunburstSettings(node, getNodes(), getEdges())); }
      catch { settings = node.data; }
      updateNodeData(node.id, { [field]: settings[field], exposed: exposed.filter(value => value !== field) });
      setEdges(all => all.filter(edge => !(edge.target === node.id && edge.targetHandle === field)));
      return;
    }
    const id = crypto.randomUUID();
    setNodes(all => [...all.map(item => item.id === node.id ? { ...node, data: { ...node.data, exposed: [...exposed, field] } } : item), {
      id, type: 'model-input', position: { x: node.position.x - 340, y: node.position.y + exposed.length * 200 },
      data: sunburstParameterData(field, String(effective[field] ?? node.data[field])),
    }]);
    setEdges(all => [...all, { id: crypto.randomUUID(), source: id, target: node.id, targetHandle: field }]);
  };
  const fields: { field: keyof Settings; choices: readonly string[]; labels?: string[] }[] = [
    { field: 'quality', choices: imageQualities }, { field: 'background', choices: imageBackgrounds },
    { field: 'size', choices: imageSizes, labels: imageSizeLabels }, { field: 'outputFormat', choices: imageFormats },
  ];
  return <div className="describer-settings sunburst-settings">
    <h2><OpenAIIcon /><span>{sunburstName}</span></h2>
    <div className="describer-field"><label>Variant</label><div className="sunburst-field-row"><DescriberModelSelect compact label="Variant" value="Sunburst" choices={['Sunburst']} disabled={node.data.locked} onChange={() => {}} /></div></div>
    {fields.map(({ field, choices, labels }) => {
      const label = sunburstFieldLabels[field]; const exposed = Boolean(node.data.exposed?.includes(field));
      return <div className="describer-field" key={field}><label>{label}</label><div className="describer-field-row">
        {field === 'size' ? <SunburstSizeSelect value={String(effective.size ?? '')} disabled={node.data.locked || exposed} onChange={value => change('size', value)} /> : <DescriberModelSelect compact label={label} value={String(effective[field] ?? '')} choices={[...choices]} labels={labels} disabled={node.data.locked || exposed} onChange={value => change(field, value)} />}
        <button disabled={node.data.locked} className="describer-expose" data-exposed={exposed} title={exposed ? 'Use local value' : 'Set as input'} aria-label={`Set ${label} as input`} aria-pressed={exposed} onClick={() => expose(field)}><DescriberIcon name="expose" /></button>
      </div></div>;
    })}
  </div>;
}
