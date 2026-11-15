import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import type { AppNode, SunburstNode } from '../nodes/types';
import { isNodeLocked, isSunburstNode } from '../nodes/types';
import { effectiveSunburstSettings } from '../nodes/sunburstRun';
import { apimartChannelModels, apimartSvgModels, apimartSvgModelEfforts, sunburstChoices, validateSunburstSize, validateApimartChannelModel, sunburstFormats, sunburstProviderSettings, sunburstVariants, validateSunburstVariant, defaultSunburstSettings, imageBackgrounds, imageQualityLabels, sunburstLocalParameter, sunburstName, sunburstParameterData, sunburstProviderLabels, sunburstProviders, sunburstQualities, validateSunburstProvider, validateSunburstSettings, type SunburstParameter, type SunburstSettings as Settings } from '../nodes/sunburst';
import { DescriberModelSelect } from './DescriberModelSelect';
import { ParameterField } from './ParameterField';
import { SunburstSizeSelect } from './SunburstSizeSelect';
import { NodeSettingsSection } from './NodeSettingsSection';
import { ParameterExposeButton } from './ParameterExposeButton';
import { ApimartSizeSelect } from './ApimartSizeSelect';

const fieldLabels: Record<SunburstParameter, string> = { provider: '渠道商', variant: '模型版本', quality: '画质', background: '背景', size: '宽高比', outputFormat: '输出格式', resolution: '分辨率', complexity: '复杂度', channelModel: '渠道模型', moderation: '内容审核', frameCount: '帧数', svgModel: 'SVG 模型', svgEffort: 'Effort' };

export function SunburstSettings({ node }: { node: SunburstNode }) {
  const { getNode, getNodes, getEdges, setNodes, setEdges, updateNodeData } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(); const edges = useEdges();
  const effective = effectiveSunburstSettings(node, nodes, edges);
  const provider = effective.provider === 'apimart' ? 'apimart' : effective.provider === 'zenmux' ? 'zenmux' : 'openai';
  const apimart = provider === 'apimart';
  const channelModel = effective.channelModel === 'gpt-image-2.6' ? 'gpt-image-2.6' : 'gpt-image-2.6-ext';
  const standard = apimart && channelModel === 'gpt-image-2.6';
  const qualities = sunburstQualities(provider);
  const change = (field: keyof Settings, value: string) => {
    if (isNodeLocked(getNode(node.id))) return;
    let resetSize = false;
    if (standard && field === 'outputFormat' && effective.outputFormat === 'gif' && value !== 'gif') {
      try { validateSunburstSize(effective.size); } catch { resetSize = true; }
    }
    updateNodeData(node.id, { [field]: field === 'frameCount' ? Number(value) : value,
      ...(field === 'channelModel' ? sunburstProviderSettings(node.data, provider, validateApimartChannelModel(value)) : {}),
      ...(apimart && field === 'outputFormat' && value === 'gif' ? { size: 'auto' } : {}),
      ...(resetSize ? { size: 'auto' } : {}),
      ...(field === 'background' && value === 'transparent' && ['jpeg', 'gif'].includes(String(effective.outputFormat)) ? { outputFormat: 'png' } : {}),
      ...(field === 'outputFormat' && ['jpeg', 'gif'].includes(value) && effective.background === 'transparent' ? { background: 'opaque' } : {}),
      ...(field === 'svgModel' && !apimartSvgModelEfforts(value).some(effort => effort === effective.svgEffort) ? { svgEffort: 'auto' } : {}),
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
          value = validateSunburstVariant(resolved.variant);
        } else if (field === 'channelModel') value = validateApimartChannelModel(resolved.channelModel);
        else value = String(validateSunburstSettings({ ...defaultSunburstSettings, provider, channelModel,
          ...(['svgModel', 'svgEffort'].includes(field) ? { outputFormat: 'svg', svgModel: resolved.svgModel } : field === 'frameCount' ? { outputFormat: 'gif' } : {}),
          ...(field === 'size' && standard && resolved.outputFormat === 'gif' ? { outputFormat: 'gif', frameCount: resolved.frameCount } : {}),
          [field]: resolved[field],
        })[field] ?? value);
      } catch { /* Invalid input keeps the previous local fallback. */ }
      updateNodeData(node.id, { [field]: field === 'frameCount' ? Number(value) : value, exposed: exposed.filter(item => item !== field),
        ...(field === 'provider' ? sunburstProviderSettings(current.data, validateSunburstProvider(value)) : {}),
        ...(field === 'channelModel' ? sunburstProviderSettings(current.data, provider, validateApimartChannelModel(value)) : {}),
        ...(field === 'svgModel' && !current.data.exposed?.includes('svgEffort') && !apimartSvgModelEfforts(value).some(effort => effort === effective.svgEffort) ? { svgEffort: 'auto' } : {}),
      });
      setEdges(all => all.filter(edge => !(edge.target === node.id && edge.targetHandle === field)));
      return;
    }
    const id = crypto.randomUUID();
    const value = String(effective[field] ?? sunburstLocalParameter(current.data, field));
    setNodes(all => [...all.map(item => item.id === node.id ? { ...current, data: { ...current.data, exposed: [...exposed, field] } } : item), {
      id, type: 'model-input', position: { x: current.position.x - 340, y: current.position.y + exposed.length * 200 },
      data: sunburstParameterData(field, value, provider, { ...node.data, channelModel, outputFormat: effective.outputFormat as Settings['outputFormat'], svgModel: effective.svgModel as Settings['svgModel'] }),
    }]);
    setEdges(all => [...all, { id: crypto.randomUUID(), source: id, target: node.id, targetHandle: field }]);
  };
  const exposeButton = (field: SunburstParameter, label = fieldLabels[field]) => {
    const exposed = Boolean(node.data.exposed?.includes(field));
    return <ParameterExposeButton label={label} exposed={exposed} disabled={node.data.locked} onClick={() => expose(field)} />;
  };
  const selectField = (field: keyof Settings, choices: readonly string[], labels: readonly string[], disabled = false) => <ParameterField label={fieldLabels[field]} exposeButton={exposeButton(field)}
    labelHint={field === 'outputFormat' ? standard ? 'GIF 和 SVG 支持参考图，不支持蒙版。' : apimart ? 'GIF 仅支持文字生成，宽高比使用自动。' : 'SVG 仅支持文字生成，下载保留矢量路径。' : undefined}>
    <DescriberModelSelect appearance="settings" fluidHover compact label={fieldLabels[field]} value={String(effective[field] ?? '')}
      choices={choices} labels={labels} disabled={disabled || node.data.locked || node.data.exposed?.includes(field)} onChange={value => change(field, value)} />
  </ParameterField>;
  return <NodeSettingsSection title={sunburstName} icon={<img src="/gpt-sidebar/brand.svg" width={20} height={20} alt="" />} className="sunburst-settings" fieldsClassName="sunburst-parameter-list">
      <ParameterField label="渠道商" exposeButton={exposeButton('provider')}>
        <DescriberModelSelect appearance="settings" fluidHover compact label="渠道商" value={String(effective.provider ?? 'openai')}
          choices={sunburstProviders} labels={sunburstProviders.map(item => sunburstProviderLabels[item])}
          disabled={node.data.locked || node.data.exposed?.includes('provider')} onChange={value => {
            if (isNodeLocked(getNode(node.id))) return;
            const next = validateSunburstProvider(value);
            updateNodeData(node.id, { provider: next, ...sunburstProviderSettings(node.data, next) });
          }} />
      </ParameterField>
      {apimart && selectField('channelModel', apimartChannelModels, ['GPT Image 2.6 EXT', 'GPT Image 2.6'])}
      <ParameterField label="模型版本" exposeButton={exposeButton('variant')}>
        <DescriberModelSelect appearance="settings" fluidHover compact label="模型版本" value={String(effective.variant)} choices={sunburstVariants}
          disabled={node.data.locked || node.data.exposed?.includes('variant')} onChange={value => {
            if (isNodeLocked(getNode(node.id))) return;
            updateNodeData(node.id, { variant: validateSunburstVariant(value) });
          }} />
      </ParameterField>
      {selectField('quality', qualities, qualities.map(quality => imageQualityLabels[quality]))}
      {(!apimart || standard) && selectField('background', imageBackgrounds, ['自动', '透明', '不透明'])}
      {apimart ? <>
        <ApimartSizeSelect value={String(effective.size)} resolution={String(effective.resolution)} standard={standard} gif={effective.outputFormat === 'gif'} frameCount={Number(effective.frameCount)}
          disabled={node.data.locked || node.data.exposed?.includes('size')} resolutionDisabled={node.data.locked || node.data.exposed?.includes('resolution')}
          onChange={value => change('size', value)} onResolutionChange={value => change('resolution', value)} exposeButton={exposeButton('size')} resolutionExposeButton={exposeButton('resolution')} />
      </> : <SunburstSizeSelect appearance="settings" value={String(effective.size ?? '')} disabled={node.data.locked || node.data.exposed?.includes('size')}
        onChange={value => change('size', value)} exposeButton={exposeButton('size')} resolutionExposeButton={exposeButton('size', '分辨率')} />}
      {selectField('outputFormat', sunburstFormats(provider, channelModel), sunburstFormats(provider, channelModel).map(value => value === 'webp' ? 'WebP' : value.toUpperCase()))}
      {standard && effective.outputFormat === 'gif' && selectField('frameCount', sunburstChoices.frameCount, sunburstChoices.frameCount)}
      {standard && effective.outputFormat === 'svg' && <>
        {selectField('svgModel', apimartSvgModels, apimartSvgModels)}
        {selectField('svgEffort', apimartSvgModelEfforts(effective.svgModel), apimartSvgModelEfforts(effective.svgModel).map(value => value === 'auto' ? '自动' : value))}
      </>}
  </NodeSettingsSection>;
}
