import { useCallback, useId, useRef, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { VideoModelPicker } from './VideoModelPicker';
import { ImagePromptAspectRatioMenu } from '../components/image-prompt-node/ImagePromptAspectRatioMenu';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { MediaToolbarAction } from '../components/image-prompt-node/ImportedMediaToolbar';
import { NodeToolbarTooltip, NodeToolbarTooltipScope } from '../components/NodeToolbarTooltip';
import { NodeColorTagButton } from '../components/NodeColorTagButton';
import { videoCapabilities } from './apimartVideo';
import type { VideoComposer } from './types';

interface Props {
  composer: VideoComposer; locked: boolean; running: boolean; hasResult: boolean; followsInputRatio: boolean;
  onEdit: (change: Partial<VideoComposer>) => void; onLock: () => void;
  onReplace: () => void; onDownload: () => void; onFullscreen: () => void;
}

export function CanvasVideoToolbar({ composer, locked, running, hasResult, followsInputRatio, onEdit, onLock, onReplace, onDownload, onFullscreen }: Props) {
  const [ratioOpen, setRatioOpen] = useState(false);
  const ratioButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const closeRatio = useCallback((focus = false) => { setRatioOpen(false); if (focus) ratioButton.current?.focus(); }, []);
  const disabled = locked || running;
  const cap = videoCapabilities[composer.model];
  const autoDuration = composer.seconds === -1;
  const divider = <span className="image-node-separator" />;
  return <NodeToolbarTooltipScope><div role="toolbar" aria-label="Video node tools" className="image-node-toolbar nodrag nopan" onKeyDown={event => event.stopPropagation()}>
    <VideoModelPicker appearance="toolbar" composer={composer} disabled={disabled} onEdit={onEdit} />
    {divider}
    <NodeToolbarTooltip label="画面比例"><button type="button" ref={ratioButton} id={id + '-ratio-button'} className="image-node-toolbar-label"
      aria-label={followsInputRatio ? '画面比例：跟随素材' : `选择画面比例：${composer.ratio}`} aria-expanded={ratioOpen} aria-haspopup="menu" disabled={disabled || followsInputRatio}
      onClick={() => setRatioOpen(value => !value)} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setRatioOpen(true); } }}>
      {followsInputRatio ? '跟随素材' : composer.ratio === 'auto' ? '自动' : composer.ratio}<ImagePromptIcon name="chevron" /></button></NodeToolbarTooltip>
    {ratioOpen && !disabled && !followsInputRatio && <ImagePromptAspectRatioMenu id={id+'-ratio'} labelledBy={id+'-ratio-button'} anchor={ratioButton}
      value={composer.ratio} choices={cap.ratios} onChange={ratio => onEdit({ ratio })} onClose={closeRatio} />}
    {divider}
    <MediaToolbarAction label="减少一秒" icon="minus" disabled={disabled || autoDuration || composer.seconds <= cap.min} onClick={() => onEdit({ seconds: composer.seconds - 1 })} />
    <span className="video-toolbar-duration" aria-label="视频时长">{autoDuration ? '自动' : composer.seconds + 's'}</span>
    <MediaToolbarAction label="增加一秒" icon="plus" disabled={disabled || autoDuration || composer.seconds >= cap.max} onClick={() => onEdit({ seconds: composer.seconds + 1 })} />
    {divider}
    <NodeToolbarTooltip label="工具"><button type="button" className="image-node-toolbar-label image-node-tools-label" aria-disabled="true"><ImagePromptIcon name="tools" />Tools<ImagePromptIcon name="chevron" /></button></NodeToolbarTooltip>
    {hasResult && <MediaToolbarAction label="替换视频" icon="image-up" disabled={disabled} onClick={onReplace} />}
    {divider}
    <NodeToolbarTooltip label={locked ? '解锁节点' : '锁定节点'}><button type="button" aria-label="Lock node" aria-pressed={locked} onClick={onLock}><ImagePromptIcon name="unlock" /></button></NodeToolbarTooltip>
    {divider}<NodeColorTagButton />{divider}
    <MediaToolbarAction label="添加到素材库" icon="folder" />
    {hasResult && <MediaToolbarAction label="发送视频" icon="send-image" />}
    <MediaToolbarAction label="下载视频" icon="download" disabled={!hasResult} onClick={onDownload} />
    {divider}
    {hasResult && <><NodeToolbarTooltip label="讨论"><button type="button" aria-label="讨论" aria-disabled="true"><MessagesSquare size={16} /></button></NodeToolbarTooltip>
      <MediaToolbarAction label="全屏播放" icon="metadata-fullscreen" onClick={onFullscreen} />{divider}</>}
    <MediaToolbarAction label="评论" icon="comment" />
  </div></NodeToolbarTooltipScope>;
}
