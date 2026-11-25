import { useState, type ComponentProps } from 'react';
import { Upload } from 'lucide-react';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { ImagePromptInfoTip } from '../components/image-prompt-node/ImagePromptInfoTip';
import { GenerationOptionsPanel } from '../components/image-prompt-node/GenerationOptionsPanel';
import { GenerationOptionSelect } from '../components/image-prompt-node/GenerationOptionSelect';
import { MediaInformationCard } from '../components/image-prompt-node/MediaInformationCard';
import { imageDateLabel, imageSizeLabel } from './imageMetadata';
import { downloadAsset, videoTimeLabel } from './fileMedia';
import { VideoModelPicker } from './VideoModelPicker';
import { videoCapabilities, videoOptions, type VideoOptions } from './apimartVideo';
import { videoStopNotice } from './apimartVideoClient';
import type { CanvasVideo, VideoComposer } from './types';
import './CanvasVideoInspector.css';

function OptionRow(props: ComponentProps<typeof GenerationOptionSelect>) {
  return <div className="generation-option-row">
    <span>{props.label}</span>
    <GenerationOptionSelect {...props} />
  </div>;
}

type VideoSettingsProps = {
  composer: VideoComposer; disabled: boolean; followsInputRatio: boolean; onEdit: (change: Partial<VideoComposer>) => void;
};

function VideoGenerationOptions({ composer, onEdit, disabled, followsInputRatio }: VideoSettingsProps) {
  const model = composer.model;
  const cap = videoCapabilities[model];
  const options = videoOptions(composer);
  const seconds = Array.from({ length: cap.max - cap.min + 1 }, (_, index) => String(cap.min + index));
  if (model === 'seedance') seconds.unshift('-1');
  function edit(change: Partial<VideoOptions>) {
    onEdit({ modelOptions: { ...composer.modelOptions, [model]: { ...options, ...change } } });
  }
  function toggle(label: string, key: 'generateAudio' | 'keepAudio', fallback = false) {
    return <OptionRow label={label} value={(options[key] ?? fallback) ? 'on' : 'off'}
      choices={['off', 'on']} labels={['关闭', '开启']} disabled={disabled} onChange={value => edit({ [key]: value === 'on' })} />;
  }

  return <GenerationOptionsPanel className="video-generation-options">
    <VideoModelPicker appearance="inspector" composer={composer} disabled={disabled} onEdit={onEdit} />
    <OptionRow label="画面比例" value={followsInputRatio ? '跟随素材' : composer.ratio} choices={cap.ratios}
      labels={cap.ratios.map(value => value === 'auto' ? '自动' : value)} disabled={disabled || followsInputRatio}
      onChange={ratio => onEdit({ ratio })} />
    <OptionRow label="分辨率" value={options.resolution ?? cap.resolutions[0]} choices={cap.resolutions}
      disabled={disabled} onChange={resolution => edit({ resolution })} />
    <OptionRow label="时长" value={String(composer.seconds)} choices={seconds}
      labels={seconds.map(value => value === '-1' ? '自动' : value + ' 秒')}
      disabled={disabled} onChange={value => onEdit({ seconds: Number(value) })} />
    {model === 'seedance' && toggle('生成声音', 'generateAudio', true)}
    {model === 'kling' && toggle('保留参考视频原声', 'keepAudio')}
    <div className="generation-options-cost"><span>费用<ImagePromptInfoTip label="视频生成费用">{`生成会使用 APIMart 额度。${videoStopNotice}`}</ImagePromptInfoTip></span>
      <span>按实际用量</span></div>
    {model === 'seedance' && composer.seconds === -1 && <p className="video-cost-note">自动时长按 30 秒预扣，完成后按实际用量结算。</p>}
  </GenerationOptionsPanel>;
}

export function CanvasVideoInspector({ data, composer, onImport, onEdit, busy, followsInputRatio }: {
  data: CanvasVideo['data']; composer?: VideoComposer; onImport: () => void; onEdit: VideoSettingsProps['onEdit']; busy: boolean; followsInputRatio: boolean;
}) {
  const [downloadError, setDownloadError] = useState('');
  const asset = data.asset;
  const disabled = busy || Boolean(data.locked);
  const rows = asset ? [
    ['格式', asset.mimeType === 'video/quicktime' || /\.mov$/i.test(asset.name) ? 'MOV' : 'MP4'],
    ['大小', imageSizeLabel(asset.size)],
    ['分辨率', asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'],
    ['时长', asset.duration !== undefined && Number.isFinite(asset.duration) ? videoTimeLabel(asset.duration) : '—'],
    ['创建时间', imageDateLabel(asset.createdAt)],
    ['创建者', '—'],
  ] : [];
  return <aside aria-label="视频检查器" className="image-inspector nodrag nopan nowheel"
    onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    <MediaInformationCard label="视频信息" name={asset?.name || data.label} rows={rows}>
      {asset && <footer>
        <button type="button" disabled aria-label="放大视频（预留）" title="放大视频（预留）"><ImagePromptIcon name="metadata-upscale" /></button>
        <button type="button" disabled aria-label="移除背景（预留）" title="移除背景（预留）"><ImagePromptIcon name="metadata-remove-background" /></button>
        <button type="button" disabled className="image-information-more" aria-label="更多视频操作（预留）" title="更多视频操作（预留）"><ImagePromptIcon name="metadata-more" /></button>
      </footer>}
      {!asset && <footer><button type="button" className="video-inspector-import" onClick={onImport} disabled={disabled}><Upload size={14} aria-hidden="true" />导入 MP4</button></footer>}
      {data.lastFrame && <footer><button type="button" className="video-inspector-import" onClick={() => {
        setDownloadError('');
        if (data.lastFrame) void downloadAsset(data.lastFrame).catch(() => setDownloadError('尾帧下载失败。'));
      }}>下载尾帧</button>{downloadError && <span role="alert">{downloadError}</span>}</footer>}
    </MediaInformationCard>
    {composer && <VideoGenerationOptions composer={composer} disabled={disabled} followsInputRatio={followsInputRatio} onEdit={onEdit} />}
  </aside>;
}
