import { useReactFlow } from '@xyflow/react';
import type { AppNode, SunburstNode } from '../nodes/types';
import { isNodeLocked, isSunburstNode } from '../nodes/types';
import { effectiveSunburstSettings } from '../nodes/sunburstRun';
import { apimartChannelModels, apimartSvgModels, apimartSvgModelEfforts, sunburstFrameCounts, validateSunburstSize, validateApimartChannelModel, sunburstOutputChoices, sunburstProviderSettings, sunburstVariants, validateSunburstVariant, imageBackgrounds, imageQualities, imageQualityLabels, sunburstName, sunburstProviderLabels, sunburstProviders, validateSunburstProvider, type SunburstParameter, type SunburstSettings as Settings } from '../nodes/sunburst';
import { GptSettingsSelect } from './GptSettingsSelect';
import { GptSettingsSegments } from './GptSettingsSegments';
import { ParameterField } from './ParameterField';
import { SunburstSizeSelect } from './SunburstSizeSelect';
import { NodeSettingsSection } from './NodeSettingsSection';
import { ApimartSizeSelect } from './ApimartSizeSelect';
import { sunburstPreset } from './imageNodePresets';

const fieldLabels: Record<SunburstParameter, string> = { provider: '渠道商', variant: '模型版本', quality: '画质', background: '背景', size: '宽高比', outputFormat: '输出格式', resolution: '分辨率', complexity: '复杂度', channelModel: '渠道模型', moderation: '内容审核', frameCount: '帧数', svgModel: 'SVG 模型', svgEffort: 'Effort' };

export function SunburstSettings({ node }: { node: SunburstNode }) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const effective = effectiveSunburstSettings(node);
  const provider = effective.provider === 'apimart' ? 'apimart' : 'openai';
  const apimart = provider === 'apimart';
  const channelModel = effective.channelModel === 'gpt-image-2.6' ? 'gpt-image-2.6' : 'gpt-image-2.6-ext';
  const standard = apimart && channelModel === 'gpt-image-2.6';
  const changeSettings = (data: Partial<SunburstNode['data']>) => {
    const current = getNode(node.id);
    if (!current || !isSunburstNode(current) || isNodeLocked(current)) return;
    updateNodeData(node.id, data);
    sunburstPreset.remember({ ...current.data, ...data });
  };
  const change = (field: keyof Settings, value: string) => {
    let resetSize = false;
    if (standard && field === 'outputFormat' && effective.outputFormat === 'gif' && value !== 'gif') {
      try { validateSunburstSize(effective.size); } catch { resetSize = true; }
    }
    changeSettings({ [field]: field === 'frameCount' ? Number(value) : value,
      ...(field === 'channelModel' ? sunburstProviderSettings(node.data, provider, validateApimartChannelModel(value)) : {}),
      ...(apimart && field === 'outputFormat' && value === 'gif' ? { size: 'auto' } : {}),
      ...(resetSize ? { size: 'auto' } : {}),
      ...(field === 'background' && value === 'transparent' && ['jpeg', 'gif'].includes(String(effective.outputFormat)) ? { outputFormat: 'png' } : {}),
      ...(field === 'outputFormat' && ['jpeg', 'gif'].includes(value) && effective.background === 'transparent' ? { background: 'opaque' } : {}),
      ...(field === 'svgModel' && !apimartSvgModelEfforts(value).some(effort => effort === effective.svgEffort) ? { svgEffort: 'auto' } : {}),
    });
  };
  const disabled = Boolean(node.data.locked);
  const selectField = (field: keyof Settings, choices: readonly string[], labels = choices) => (
    <ParameterField label={fieldLabels[field]}>
      <GptSettingsSelect label={fieldLabels[field]} value={String(effective[field] ?? '')}
        choices={choices} labels={labels} disabled={disabled} onChange={value => change(field, value)} />
    </ParameterField>
  );
  const formats = sunburstOutputChoices(provider, channelModel);
  const outputFormat = String(effective.outputFormat);
  const formatHint = standard ? 'GIF 和 SVG 支持参考图，不支持蒙版。'
    : apimart ? 'GIF 仅支持文字生成，宽高比使用自动。' : 'SVG 仅支持文字生成，下载保留矢量路径。';
  return <NodeSettingsSection title={sunburstName} icon={<img src="/gpt-sidebar/settings-brand.svg" width={18} height={18} alt="" />} className="sunburst-settings" fieldsClassName="sunburst-parameter-list">
      <ParameterField label="渠道商">
        <GptSettingsSelect label="渠道商" value={String(effective.provider ?? 'openai')}
          choices={sunburstProviders} labels={sunburstProviders.map(item => sunburstProviderLabels[item])}
          disabled={disabled} onChange={value => {
            const next = validateSunburstProvider(value);
            changeSettings({ provider: next, ...sunburstProviderSettings(node.data, next) });
          }} />
      </ParameterField>
      {apimart && selectField('channelModel', apimartChannelModels, ['GPT Image 2.6 EXT', 'GPT Image 2.6'])}
      <ParameterField label="模型版本">
        <GptSettingsSegments label="模型版本" value={String(effective.variant)} choices={sunburstVariants}
          disabled={disabled} onChange={value => changeSettings({ variant: validateSunburstVariant(value) })} />
      </ParameterField>
      {selectField('quality', imageQualities, imageQualities.map(quality => imageQualityLabels[quality]))}
      {(!apimart || standard) && selectField('background', imageBackgrounds, ['自动', '透明', '不透明'])}
      {apimart ? <ApimartSizeSelect value={String(effective.size)} resolution={String(effective.resolution)} standard={standard} gif={effective.outputFormat === 'gif'} frameCount={Number(effective.frameCount)}
          disabled={disabled}
          onChange={value => change('size', value)} onResolutionChange={value => change('resolution', value)} />
        : <SunburstSizeSelect value={String(effective.size ?? '')} disabled={disabled}
        onChange={value => change('size', value)} />}
      <ParameterField label="输出格式" labelHint={formatHint}
        detail={outputFormat === 'webp' && <p className="gpt-settings-legacy-format">当前值：WebP（旧设置）</p>}>
        <GptSettingsSegments label="输出格式" value={outputFormat} choices={formats} labels={formats.map(value => value.toUpperCase())}
          disabled={disabled} onChange={value => change('outputFormat', value)} />
      </ParameterField>
      {standard && effective.outputFormat === 'gif' && selectField('frameCount', sunburstFrameCounts)}
      {standard && effective.outputFormat === 'svg' && <>
        {selectField('svgModel', apimartSvgModels, apimartSvgModels)}
        {selectField('svgEffort', apimartSvgModelEfforts(effective.svgModel), apimartSvgModelEfforts(effective.svgModel).map(value => value === 'auto' ? '自动' : value))}
      </>}
  </NodeSettingsSection>;
}
