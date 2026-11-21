import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CircleArrowUp01Icon } from '@hugeicons/core-free-icons';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { AppNode, SunburstNode } from '../../nodes/types';
import { changeComposerProvider, changeComposerSettings, composerAspectRatios, composerModelId, composerSettings } from '../../nodes/imageComposerSettings';
import { imageQualities, imageQualityLabels, sunburstProviders, sunburstProviderLabels, type SunburstProvider } from '../../nodes/sunburst';
import { seedreamChoices } from '../../nodes/seedream';
import { imagePromptGenerationAspectRatios } from './imagePromptAspectRatios';
import { defaultImagePromptModelSelection, imagePromptModels, type ImagePromptModelId } from './imagePromptModels';
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
  const { updateNodeData } = useReactFlow<AppNode>();
  const [expanded, setExpanded] = useState(true);
  const [modelOpen, setModelOpen] = useState(false);
  const [pinned, setPinned] = useState<ImagePromptModelId[]>(['nano-banana-2']);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const locked = Boolean(data?.locked);
  useEffect(() => { if (locked) setModelOpen(false); }, [locked]);
  const closeModel = useCallback((restoreFocus = false) => {
    setModelOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, []);
  if (!data?.composer) return null;
  const composer = data.composer;
  const modelId = composerModelId(data);
  const model = imagePromptModels.find(item => item.id === modelId);
  const settings = composerSettings(data);
  const seedream = modelId === 'seedream-5-5';
  const nano = modelId.startsWith('nano-banana');
  const automaticSize = !seedream && !nano && data.provider !== 'apimart' && composer.ratio === 'auto';
  const supportedRatios = composerAspectRatios(data);
  const ratios = imagePromptGenerationAspectRatios.filter(ratio => supportedRatios.includes(ratio));
  function edit(patch: Partial<SunburstNode['data']>) {
    if (locked) return;
    sunburstPreset.remember({ ...data!, ...patch });
    updateNodeData(nodeId, patch);
  }
  function setSetting(key: string, value: string) {
    edit(changeComposerSettings(data!, {}, {
      [key]: value, ...(key === 'background' && value === 'transparent' ? { outputFormat: 'png' } : {}),
    }));
  }
  return <Tooltip.Provider delayDuration={300}><section className="image-generation-options nodrag nopan nowheel" aria-label="生成选项"
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onWheel={event => event.stopPropagation()} onKeyDown={event => {
      // Keep canvas shortcuts away from controls while retaining undo/redo.
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') event.stopPropagation();
    }}>
    <h3><button type="button" className="generation-options-heading" aria-expanded={expanded} aria-controls={id}
      onClick={() => { setExpanded(!expanded); setModelOpen(false); }}>
      <HugeiconsIcon icon={CircleArrowUp01Icon} size={14} /><span>生成选项</span>
      <ImagePromptIcon name="chevron" className={expanded ? '' : 'is-collapsed'} />
    </button></h3>
    {expanded && <div id={id} className="generation-options-content">
      <button ref={trigger} type="button" className="generation-options-model" disabled={locked}
        aria-label={`选择生成模型：${model?.name ?? '自动选择模型'}`} aria-haspopup="dialog" aria-expanded={modelOpen && !locked}
        onClick={() => setModelOpen(!modelOpen)}>
        <ImagePromptModelBrand brand={model?.brand ?? 'openai'} /><span>{composer.selection?.autoSelect ? '自动选择模型'
          : (composer.selection?.modelIds.length ?? 0) > 1 ? `${composer.selection!.modelIds.length} 个模型` : model?.name}</span><ImagePromptIcon name="chevron" />
      </button>
      {modelOpen && !locked && <ImagePromptModelMenu id={`${id}-models`} anchor={trigger} selection={composer.selection ?? defaultImagePromptModelSelection}
        pinned={pinned} onPinnedChange={setPinned} onClose={closeModel}
        onChange={selection => edit(changeComposerSettings(data, { selection }))} />}
      {modelId === 'gpt-image-2-6' && <div className="generation-option-row"><span>渠道商</span><GenerationOptionSelect label="渠道商" value={data.provider ?? 'openai'}
        choices={sunburstProviders} labels={sunburstProviders.map(value => sunburstProviderLabels[value])} disabled={locked}
        onChange={value => edit(changeComposerProvider(data, value as SunburstProvider))} /></div>}
      <div className="generation-option-row"><span>画面比例</span><GenerationOptionSelect key={`ratio-${modelId}`} label="画面比例" value={composer.ratio} choices={ratios}
        labels={ratios.map(value => value === 'auto' ? '自动' : value)} disabled={locked}
        onChange={ratio => edit(changeComposerSettings(data, { ratio }))} /></div>
      <div className="generation-option-row"><span>分辨率{automaticSize && <ImagePromptInfoTip label="自动分辨率说明">OpenAI 自动比例下，选择分辨率会将画面比例设为 1:1。也可以先选择其他画面比例。</ImagePromptInfoTip>}</span><GenerationOptionSelect key={`resolution-${modelId}`} label="分辨率" value={automaticSize ? 'auto' : settings.resolution}
        choices={automaticSize ? ['auto', '1K', '2K', '4K'] : seedream ? seedreamChoices.resolution : ['1K', '2K', '4K']}
        labels={automaticSize ? ['自动', '1K', '2K', '4K'] : undefined} disabled={locked}
        onChange={value => { if (value !== 'auto') setSetting('resolution', value); }} /></div>
      {!nano && (seedream || data.provider !== 'apimart' || data.channelModel === 'gpt-image-2.6') && <div className="generation-option-row"><span>背景</span><GenerationOptionSelect label="背景" value={settings.background ?? 'auto'}
        choices={['auto', 'transparent', 'opaque']} labels={['自动', '透明', '不透明']} disabled={locked} onChange={value => setSetting('background', value)} /></div>}
      {!seedream && !nano && <div className="generation-option-row"><span>画质</span><GenerationOptionSelect label="画质" value={settings.quality ?? 'medium'}
        choices={imageQualities} labels={imageQualities.map(value => imageQualityLabels[value])} disabled={locked} onChange={value => setSetting('quality', value)} /></div>}
      <div className="generation-option-row"><span>输出格式</span><GenerationOptionSelect label="输出格式" value={settings.outputFormat}
        choices={settings.background === 'transparent' ? ['png'] : ['png', 'jpeg']} labels={settings.background === 'transparent' ? ['PNG'] : ['PNG', 'JPEG']}
        disabled={locked} onChange={value => setSetting('outputFormat', value)} /></div>
      <div className="generation-options-cost"><span>费用<ImagePromptInfoTip label="生成费用">费用由当前 API 渠道按模型、参数和生成数量结算。</ImagePromptInfoTip></span><span>按实际用量</span></div>
    </div>}
  </section></Tooltip.Provider>;
}
