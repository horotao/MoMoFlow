import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import type { AppNode, SunburstNode } from '../nodes/types';
import { isNodeLocked, isSunburstNode } from '../nodes/types';
import { effectiveSunburstSettings } from '../nodes/sunburstRun';
import { defaultSunburstSettings, imageBackgrounds, imageFormats, imageQualityLabels, sunburstLocalParameter, sunburstName, sunburstParameterData, sunburstProviderLabels, sunburstProviders, sunburstQualities, validateSunburstProvider, validateSunburstSettings, type SunburstParameter, type SunburstSettings as Settings } from '../nodes/sunburst';
import { DescriberModelSelect } from './DescriberModelSelect';
import { ParameterField } from './ParameterField';
import { SunburstSizeSelect } from './SunburstSizeSelect';
import { NodeSettingsSection } from './NodeSettingsSection';
import { ParameterExposeButton } from './ParameterExposeButton';

const fieldLabels: Record<SunburstParameter, string> = { provider: '渠道商', variant: '模型版本', quality: '画质', background: '背景', size: '宽高比', outputFormat: '输出格式' };

export function SunburstSettings({ node }: { node: SunburstNode }) {
  const { getNode, getNodes, getEdges, setNodes, setEdges, updateNodeData } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(); const edges = useEdges();
  const effective = effectiveSunburstSettings(node, nodes, edges);
  const provider = effective.provider === 'openai' ? 'openai' : 'zenmux';
  const qualities = sunburstQualities(provider);
  const change = (field: keyof Settings, value: string) => {
    if (isNodeLocked(getNode(node.id))) return;
    updateNodeData(node.id, { [field]: value,
      ...(field === 'background' && value === 'transparent' && node.data.outputFormat === 'jpeg' ? { outputFormat: 'png' } : {}),
      ...(field === 'outputFormat' && value === 'jpeg' && node.data.background === 'transparent' ? { background: 'opaque' } : {}),
    });
  };
  const expose = (field: SunburstParameter) => {
    const current = getNode(node.id);
    if (!current || !isSunburstNode(current) || isNodeLocked(current)) return;
    const exposed = current.data.exposed ?? [];
    if (exposed.includes(field)) {
      let value = sunburstLocalParameter(current.data, field);
      try {
        const resolved = effectiveSunburstSettings(current, getNodes(), getEdges());
        // Detach only this field: unrelated invalid input must not discard it.
        if (field === 'provider') value = validateSunburstProvider(resolved.provider);
        else if (field === 'variant') {
          if (resolved.variant !== 'Sunburst') throw new Error('不支持的模型版本。');
          value = 'Sunburst';
        } else value = validateSunburstSettings({ ...defaultSunburstSettings, provider,
          [field]: resolved[field],
        })[field];
      } catch { /* Invalid input keeps the previous local fallback. */ }
      updateNodeData(node.id, { [field]: value, exposed: exposed.filter(item => item !== field),
        ...(field === 'provider' && !sunburstQualities(validateSunburstProvider(value)).includes(current.data.quality) ? { quality: 'high' } : {}),
      });
      setEdges(all => all.filter(edge => !(edge.target === node.id && edge.targetHandle === field)));
      return;
    }
    const id = crypto.randomUUID();
    const value = String(effective[field] ?? sunburstLocalParameter(current.data, field));
    setNodes(all => [...all.map(item => item.id === node.id ? { ...current, data: { ...current.data, exposed: [...exposed, field] } } : item), {
      id, type: 'model-input', position: { x: current.position.x - 340, y: current.position.y + exposed.length * 200 },
      data: sunburstParameterData(field, value, provider),
    }]);
    setEdges(all => [...all, { id: crypto.randomUUID(), source: id, target: node.id, targetHandle: field }]);
  };
  const exposeButton = (field: SunburstParameter, label = fieldLabels[field]) => {
    const exposed = Boolean(node.data.exposed?.includes(field));
    return <ParameterExposeButton label={label} exposed={exposed} disabled={node.data.locked} onClick={() => expose(field)} />;
  };
  const selectField = (field: 'quality' | 'background' | 'outputFormat', choices: readonly string[], labels: readonly string[]) => <ParameterField label={fieldLabels[field]} exposeButton={exposeButton(field)}>
    <DescriberModelSelect appearance="settings" fluidHover compact label={fieldLabels[field]} value={String(effective[field] ?? '')}
      choices={choices} labels={labels} disabled={node.data.locked || node.data.exposed?.includes(field)} onChange={value => change(field, value)} />
  </ParameterField>;
  return <NodeSettingsSection title={sunburstName} icon={<img src="/gpt-sidebar/brand.svg" width={20} height={20} alt="" />} className="sunburst-settings" fieldsClassName="sunburst-parameter-list">
      <ParameterField label="渠道商" exposeButton={exposeButton('provider')}>
        <DescriberModelSelect appearance="settings" fluidHover compact label="渠道商" value={String(effective.provider ?? 'zenmux')}
          choices={sunburstProviders} labels={sunburstProviders.map(item => sunburstProviderLabels[item])}
          disabled={node.data.locked || node.data.exposed?.includes('provider')} onChange={value => {
            if (isNodeLocked(getNode(node.id))) return;
            const next = validateSunburstProvider(value);
            updateNodeData(node.id, { provider: next, ...(!sunburstQualities(next).includes(node.data.quality) ? { quality: 'high' } : {}) });
          }} />
      </ParameterField>
      <ParameterField label="模型版本" exposeButton={exposeButton('variant')}>
        <DescriberModelSelect appearance="settings" fluidHover compact label="模型版本" value={String(effective.variant)} choices={['Sunburst']}
          disabled={node.data.locked || node.data.exposed?.includes('variant')} onChange={() => {}} />
      </ParameterField>
      {selectField('quality', qualities, qualities.map(quality => imageQualityLabels[quality]))}
      {selectField('background', imageBackgrounds, ['自动', '透明', '不透明'])}
      <SunburstSizeSelect appearance="settings" value={String(effective.size ?? '')} disabled={node.data.locked || node.data.exposed?.includes('size')}
        onChange={value => change('size', value)} exposeButton={exposeButton('size')} resolutionExposeButton={exposeButton('size', '分辨率')} />
      {selectField('outputFormat', imageFormats, ['PNG', 'JPEG', 'WebP'])}
  </NodeSettingsSection>;
}
