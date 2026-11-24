import { grokImageModel } from '../../nodes/grokImage.ts';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { resolveTextValue } from '../../nodes/textVariables';
import { isImageInputHandle } from '../../nodes/connectionRules';
import { estimateApimartImageCredits, estimateImageCost } from '../../nodes/imagePricing';
import { textCostLabel } from '../../nodes/textPricing';
import { GenerationOptionsPanel } from './GenerationOptionsPanel';
import type { AppNode, SunburstNode } from '../../nodes/types';
import { changeComposerChannel, changeComposerSettings, composerAspectRatio, composerAspectRatios, composerChannel, composerModelId, composerModelSelection, composerSettings } from '../../nodes/imageComposerSettings';
import { extImageOutputCredits, sunburstResolutions, imageQualities, imageQualityLabels, sunburstChannels, sunburstChannelLabels, type SunburstChannel } from '../../nodes/sunburst';
import { seedreamChoices, seedreamOutputCredits, seedreamReferenceCredits } from '../../nodes/seedream';
import { klingImageModel, klingImageModes, klingImageOutputCredits, klingImageResolutions } from '../../nodes/klingImage';
import { imagePromptGenerationAspectRatios } from './imagePromptAspectRatios';
import { defaultPinnedImageModelIds, gptImageVariants, imagePromptModels, inpaintModels, type ImagePromptModelId } from './imagePromptModels';
import { ImagePromptModelBrand, ImagePromptModelMenu } from './ImagePromptModelMenu';
import { ImagePromptIcon } from './ImagePromptIcon';
import { ImagePromptInfoTip } from './ImagePromptInfoTip';
import { GenerationOptionSelect } from './GenerationOptionSelect';
import { sunburstPreset } from '../imageNodePresets';
import './image-generation-options.css';

export function ImageGenerationOptions() {
  const selectedId = useStore(state => {
    const selected = state.nodes.filter(node => node.selected);
    return selected.length === 1 && selected[0].type === 'sunburst' && selected[0].data.composer
      && selected[0].data.imageSource !== 'imported' ? selected[0].id : null;
  });
  return selectedId ? <GenerationOptions key={selectedId} nodeId={selectedId} /> : null;
}

function GenerationOptions({ nodeId }: { nodeId: string }) {
  const data = useStore(state => state.nodeLookup.get(nodeId)?.data) as SunburstNode['data'] | undefined;
  const upstreamPrompt = useStore(state => {
    const edge = state.edges.find(edge => edge.target === nodeId && edge.targetHandle === 'prompt');
    return edge ? resolveTextValue(edge.source, state.nodes as AppNode[], state.edges) : undefined;
  });
  const referenceCount = useStore(state => state.edges.filter(edge => edge.target === nodeId && isImageInputHandle(edge.targetHandle)).length);
  const { updateNodeData } = useReactFlow<AppNode>();
  if (!data?.composer) return null;
  return <ImageGenerationSettings data={data} prompt={data.inpaint ? undefined : upstreamPrompt} referenceCount={data.inpaint ? 1 : referenceCount} inpaintOnly={Boolean(data.inpaint)} onChange={patch => {
    if (!data.inpaint) sunburstPreset.remember({ ...data, ...patch });
    updateNodeData(nodeId, patch);
  }} />;
}

export function ImageGenerationSettings({ data, onChange, inpaintOnly = false, prompt, referenceCount = 0, className }: {
  data: SunburstNode['data'];
  onChange: (patch: Partial<SunburstNode['data']>) => void;
  inpaintOnly?: boolean;
  className?: string;
  prompt?: string;
  referenceCount?: number;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const [pinned, setPinned] = useState<ImagePromptModelId[]>(() => [...defaultPinnedImageModelIds]);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const locked = Boolean(data.locked);
  useEffect(() => { if (locked) setModelOpen(false); }, [locked]);
  const closeModel = useCallback((restoreFocus = false) => {
    setModelOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, []);
  if (!data?.composer) return null;
  const composer = data.composer;
  const selection = composerModelSelection(data);
  const modelId = composerModelId(data);
  const model = imagePromptModels.find(item => item.id === modelId);
  const settings = composerSettings(data);
  const seedream = modelId === 'seedream-5-5';
  const nano = modelId.startsWith('nano-banana');
  const grok = modelId === grokImageModel;
  const kling = modelId === klingImageModel;
  const klingResolution = kling ? klingImageResolutions.find(resolution => resolution === settings.resolution) : undefined;
  const channel = composerChannel(data);
  const extResolution = gptImageVariants[modelId] && channel === 'gpt-image-2.6-ext'
    ? sunburstResolutions.find(value => value === settings.resolution) : undefined;
  const outputCredits = extResolution ? extImageOutputCredits[extResolution] : klingResolution && klingImageOutputCredits[klingResolution];
  const isGpt = !selection.autoSelect && Boolean(gptImageVariants[modelId]);
  const standard = channel === 'gpt-image-2.6';
  const estimator = standard ? estimateApimartImageCredits : estimateImageCost;
  const seedreamResolution = seedream && !selection.autoSelect
    ? seedreamChoices.resolution.find(value => value === settings.resolution) : undefined;
  const seedreamPrice = seedreamResolution && seedreamOutputCredits[seedreamResolution];
  const estimate = seedreamPrice !== undefined ? composer.quantity * (seedreamPrice + referenceCount * seedreamReferenceCredits)
    : isGpt && (standard || channel === 'openai')
    ? estimator(data, prompt ?? composer.prompt, referenceCount, composer.quantity) : undefined;
  const estimateLabel = estimate === undefined ? '按实际用量' : (standard || seedream)
    ? `≈${estimate.toLocaleString('en-US', { maximumFractionDigits: 4 })} 积分` : textCostLabel(estimate, true);
  const autoPrecharge = isGpt && standard && data.quality === 'auto';
  const estimateTitle = `${selection.modelIds.length > 1 ? '当前模型' : ''}${autoPrecharge ? '预计预扣' : '预计费用'}`;
  const rate = standard ? 'APIMart 黄金会员积分费率' : 'OpenAI 标准美元费率';
  const autoSize = standard ? '自动比例暂按当前分辨率的 1:1。' : '自动尺寸暂按 1024×1024。';
  const autoQuality = standard ? '自动画质按最高画质预扣，完成后按实际用量退差额。' : '自动画质暂按中等。';
  const estimateTip = seedreamPrice !== undefined
    ? `APIMart 黄金价。每张输出 ${seedreamPrice} 积分，每次生成使用 ${referenceCount} 张参考图，每张参考图 ${seedreamReferenceCredits} 积分。共生成 ${composer.quantity} 张。`
    : `${model?.name} 共 ${composer.quantity} 张，按${rate}估算。提示词按长度估算，${referenceCount} 张参考图按每张约 1536 tokens 计入。图片输出按尺寸与画质估算。${data.size === 'auto' ? autoSize : ''}${data.quality === 'auto' ? autoQuality : ''}实际费用以账单为准。`;
  const showBackground = !nano && !kling && !grok && (seedream || channel !== 'gpt-image-2.6-ext');
  const transparent = showBackground && settings.background === 'transparent';
  const automaticSize = Boolean(gptImageVariants[modelId]) && channel === 'openai' && composer.ratio === 'auto';
  const supportedRatios = composerAspectRatios(data);
  const ratios = imagePromptGenerationAspectRatios.filter(ratio => supportedRatios.includes(ratio));
  function edit(patch: Partial<SunburstNode['data']>) {
    if (!locked) onChange(patch);
  }
  function setSetting(key: string, value: string) {
    edit(changeComposerSettings(data, {}, {
      [key]: value, ...(key === 'background' && value === 'transparent' ? { outputFormat: 'png' } : {}),
    }));
  }
  return <GenerationOptionsPanel className={className} onCollapse={() => setModelOpen(false)}>
      <button ref={trigger} type="button" className="generation-options-model" disabled={locked}
        aria-label={`选择生成模型：${model?.name ?? '自动选择模型'}`} aria-haspopup="dialog" aria-expanded={modelOpen && !locked}
        onClick={() => setModelOpen(!modelOpen)}>
        <ImagePromptModelBrand brand={model?.brand ?? 'openai'} /><span>{selection.autoSelect ? '自动选择模型'
          : selection.modelIds.length > 1 ? `${selection.modelIds.length} 个模型` : model?.name}</span><ImagePromptIcon name="chevron" />
      </button>
      {modelOpen && !locked && <ImagePromptModelMenu models={inpaintOnly ? inpaintModels : imagePromptModels} singleSelection={inpaintOnly}
        id={`${id}-models`} anchor={trigger} selection={selection}
        pinned={pinned} onPinnedChange={setPinned} onClose={closeModel}
        onChange={selection => edit(changeComposerSettings(data, { selection }))} />}
      {!inpaintOnly && gptImageVariants[modelId] && <div className="generation-option-row"><span>渠道商</span><GenerationOptionSelect label="渠道商" value={channel}
        choices={sunburstChannels} labels={sunburstChannels.map(value => sunburstChannelLabels[value])} disabled={locked}
        onChange={value => edit(changeComposerChannel(data, value as SunburstChannel))} /></div>}
      <div className="generation-option-row"><span>画面比例</span><GenerationOptionSelect key={`ratio-${modelId}`} label="画面比例" value={composerAspectRatio(data)} choices={ratios}
        labels={ratios.map(value => value === 'auto' ? '自动' : value)} disabled={locked}
        onChange={ratio => edit(changeComposerSettings(data, { ratio }))} /></div>
      {!grok && <div className="generation-option-row"><span>分辨率{automaticSize && <ImagePromptInfoTip label="自动分辨率说明">OpenAI 自动比例下，选择分辨率会将画面比例设为 1:1。也可以先选择其他画面比例。</ImagePromptInfoTip>}</span><GenerationOptionSelect key={`resolution-${modelId}`} label="分辨率" value={automaticSize ? 'auto' : settings.resolution}
        choices={automaticSize ? ['auto', '1K', '2K', '4K'] : seedream ? seedreamChoices.resolution : kling ? klingImageResolutions : ['1K', '2K', '4K']}
        labels={automaticSize ? ['自动', '1K', '2K', '4K'] : undefined} disabled={locked}
        onChange={value => { if (value !== 'auto') setSetting('resolution', value); }} /></div>}
      {showBackground && <div className="generation-option-row"><span>背景</span><GenerationOptionSelect label="背景" value={settings.background ?? 'auto'}
        choices={['auto', 'transparent', 'opaque']} labels={['自动', '透明', '不透明']} disabled={locked} onChange={value => setSetting('background', value)} /></div>}
      {!seedream && !nano && !kling && !grok && <div className="generation-option-row"><span>画质</span><GenerationOptionSelect label="画质" value={settings.quality ?? 'medium'}
        choices={imageQualities} labels={imageQualities.map(value => imageQualityLabels[value])} disabled={locked} onChange={value => setSetting('quality', value)} /></div>}
      {kling && <div className="generation-option-row"><span>生成模式<ImagePromptInfoTip label="Kling 生成模式说明">普通生成支持 1–9 张。关联组图支持 2–4 张，张数在节点生成按钮旁调整。</ImagePromptInfoTip></span>
        <GenerationOptionSelect label="生成模式" value={settings.mode ?? 'standard'} choices={klingImageModes} labels={['普通生成', '关联组图']}
          disabled={locked} onChange={value => setSetting('mode', value)} /></div>}
      {!grok && <div className="generation-option-row"><span>输出格式</span><GenerationOptionSelect label="输出格式" value={settings.outputFormat}
        choices={transparent || kling ? ['png'] : ['png', 'jpeg']} labels={transparent || kling ? ['PNG'] : ['PNG', 'JPEG']}
        disabled={locked} onChange={value => setSetting('outputFormat', value)} /></div>}
      <div className="generation-options-cost">
        <span>{estimate !== undefined ? estimateTitle : '费用'}<ImagePromptInfoTip label="生成费用">{estimate !== undefined ? estimateTip : extResolution
          ? '按 APIMart EXT 黄金价显示当前分辨率的每张参考单价，实际费用以 APIMart 结算为准。'
          : klingResolution
          ? '按 APIMart 黄金价显示每张输出图片的参考单价。输入参考图另计，实际费用以 APIMart 结算为准。'
          : '费用由当前 API 渠道按模型、参数和生成数量结算。'}</ImagePromptInfoTip></span>
        {outputCredits !== undefined ? <span className="generation-options-unit-price" aria-live="polite" aria-atomic="true">
          {outputCredits} Credits/张
        </span> : <span aria-live="polite">{estimateLabel}</span>}
      </div>
  </GenerationOptionsPanel>;
}
