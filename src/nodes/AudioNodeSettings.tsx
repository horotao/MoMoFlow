import { NodeColorTagButton } from '../components/NodeColorTagButton';
import { NodeToolbarTooltip, NodeToolbarTooltipScope } from '../components/NodeToolbarTooltip';
import { GenerationOptionsPanel } from '../components/image-prompt-node/GenerationOptionsPanel';
import { GenerationOptionSelect } from '../components/image-prompt-node/GenerationOptionSelect';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { ImagePromptInfoTip } from '../components/image-prompt-node/ImagePromptInfoTip';
import { MediaToolbarAction } from '../components/image-prompt-node/ImportedMediaToolbar';
import { MediaInformationCard } from '../components/image-prompt-node/MediaInformationCard';
import { useState } from 'react';
import { audioModel, audioPinned, audioResultModel, type AudioComposer, type AudioResult } from './audioComposer';
import { defaultSunoOptions, sunoFormats, sunoVarieties, sunoVoices, sunoWeightLabels, type SunoOptions } from './suno';
import { MediaModelPicker } from './MediaModelPicker';
import { audioPreview } from './audioPreview';
import { imageDateLabel, imageSizeLabel } from './imageMetadata';
import { videoTimeLabel } from './fileMedia';

interface Settings {
  composer: AudioComposer; disabled: boolean; edit: (change: Partial<AudioComposer>) => void;
}
function AudioModelPicker({ composer, disabled, edit, appearance }: Settings & { appearance: 'toolbar' | 'inspector' }) {
  return <MediaModelPicker appearance={appearance} label="选择音频模型" name={audioModel.name} brand={audioModel.brand}
    models={[audioModel]} groups={{ featured: [audioModel.id], providers: {} }} selection={{ modelIds: [audioModel.id], multiple: false, autoSelect: false }} singleSelection
    pinned={audioPinned(composer)} disabled={disabled} onChange={() => {}} onPinnedChange={pinned => edit({ pinned })} />;
}

function WeightControl({ label, value, disabled, onChange }: {
  label: string; value: number; disabled: boolean; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return <div className="audio-option-slider"><div><span>{label}</span>
    <input aria-label={label + '数值'} type="number" min={0} max={1} step=".01" disabled={disabled} value={draft ?? value.toFixed(2)}
      onChange={event => {
        const { value: text, valueAsNumber, validity } = event.target;
        setDraft(text);
        if (validity.valid && Number.isFinite(valueAsNumber)) onChange(valueAsNumber);
      }}
      onBlur={event => {
        const number = event.target.valueAsNumber;
        if (Number.isFinite(number)) onChange(Math.max(0, Math.min(1, Math.round(number * 100) / 100)));
        setDraft(undefined);
      }} /></div>
    <input aria-label={label} type="range" min={0} max={1} step=".01" disabled={disabled}
      value={value} onChange={event => onChange(event.target.valueAsNumber)} /></div>;
}

function AudioParameters({ composer, disabled, edit, toolbar = false }: Settings & { toolbar?: boolean }) {
  const options = composer.suno ?? defaultSunoOptions;
  const change = (update: Partial<SunoOptions>) => edit({ suno: { ...options, ...update } });
  if (toolbar) return <GenerationOptionSelect label="人声" choices={sunoVoices} value={options.voice} disabled={disabled}
    onChange={voice => change({ voice: voice as SunoOptions['voice'] })} />;
  return <>
    <div className="generation-option-row"><span>风格变化程度</span><GenerationOptionSelect label="风格变化程度" choices={sunoVarieties}
      value={options.variety} disabled={disabled} onChange={variety => change({ variety: variety as SunoOptions['variety'] })} /></div>
    <div className="generation-option-row"><span>音频格式</span><GenerationOptionSelect label="音频格式" choices={sunoFormats}
      value={options.audio_format} disabled={disabled} onChange={format => change({ audio_format: format as SunoOptions['audio_format'] })} /></div>
    {(Object.keys(sunoWeightLabels) as (keyof typeof sunoWeightLabels)[]).map(key => <WeightControl key={key} label={sunoWeightLabels[key]}
      value={options[key]} disabled={disabled} onChange={value => change({ [key]: value })} />)}
  </>;
}

export function AudioToolbar({ locked, result, onLock, onDownload, ...settings }: Settings & {
  locked: boolean; result?: AudioResult; onLock: () => void; onDownload: () => void;
}) {
  const divider = <span className="image-node-separator" />;
  return <NodeToolbarTooltipScope><div role="toolbar" aria-label="Audio node tools" className="image-node-toolbar audio-toolbar nodrag nopan"
    onKeyDown={e => e.stopPropagation()}>
    <AudioModelPicker {...settings} appearance="toolbar" />
    {divider}<AudioParameters {...settings} toolbar />
    {divider}<NodeToolbarTooltip label={locked ? '解锁节点' : '锁定节点'}><button type="button" aria-label="Lock node" aria-pressed={locked}
      onClick={onLock}><ImagePromptIcon name="unlock" /></button></NodeToolbarTooltip>
    {divider}<NodeColorTagButton />{divider}<MediaToolbarAction label="添加到素材库" icon="folder" />
    {result && <MediaToolbarAction label="发送音频" icon="send-image" />}
    <MediaToolbarAction label="下载音频" icon="download" disabled={!result} onClick={onDownload} />
    {divider}<MediaToolbarAction label="评论" icon="comment" />
  </div></NodeToolbarTooltipScope>;
}

export function AudioInspector({ name, result, ...settings }: Settings & { name: string; result?: AudioResult }) {
  const asset = result?.asset;
  const rows = result ? [['模型', audioResultModel(result.model)], ['格式', result.suno?.audio_format.toUpperCase() ?? 'WAV'],
    ['大小', imageSizeLabel(asset ? asset.size : audioPreview.bytes)], ['时长', asset && !asset.duration ? '—' : videoTimeLabel(asset?.duration ?? audioPreview.duration)],
    ['创建时间', imageDateLabel(result.createdAt)]] : [];
  return <aside aria-label="音频检查器" className="image-inspector audio-inspector nodrag nopan nowheel"
    onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    <MediaInformationCard label="音频信息" name={asset?.name ?? name} rows={rows}>{null}</MediaInformationCard>
    <GenerationOptionsPanel><AudioModelPicker {...settings} appearance="inspector" /><AudioParameters {...settings} />
      <div className="generation-options-cost"><span>费用<ImagePromptInfoTip label="音频生成费用">生成音乐会使用 APIMart 额度，费用以实际任务为准。</ImagePromptInfoTip></span><span>按实际用量</span></div>
    </GenerationOptionsPanel>
  </aside>;
}
