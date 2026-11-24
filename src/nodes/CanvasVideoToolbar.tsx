import { useCallback, useId, useRef, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { ImagePromptModelBrand, ImagePromptModelMenu } from '../components/image-prompt-node/ImagePromptModelMenu';
import { ImagePromptAspectRatioMenu } from '../components/image-prompt-node/ImagePromptAspectRatioMenu';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { MediaToolbarAction } from '../components/image-prompt-node/ImportedMediaToolbar';
import { NodeToolbarTooltip, NodeToolbarTooltipScope } from '../components/NodeToolbarTooltip';
import { NodeColorTagButton } from '../components/NodeColorTagButton';
import { videoModels, videoModelDisplay, videoRatios } from './videoComposer';
import type { VideoComposer } from './types';

interface Props {
  composer: VideoComposer; locked: boolean; running: boolean; hasResult: boolean;
  onEdit: (change: Partial<VideoComposer>) => void; onLock: () => void;
  onReplace: () => void; onDownload: () => void; onFullscreen: () => void;
}

export function CanvasVideoToolbar({ composer, locked, running, hasResult, onEdit, onLock, onReplace, onDownload, onFullscreen }: Props) {
  const [menu, setMenu] = useState<'model' | 'ratio' | null>(null);
  const [pinned, setPinned] = useState<VideoComposer['model'][]>([]);
  const modelButton = useRef<HTMLButtonElement>(null), ratioButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { label, brand, selection } = videoModelDisplay(composer);
  const closeModel = useCallback((focus = false) => { setMenu(null); if (focus) modelButton.current?.focus(); }, []);
  const closeRatio = useCallback((focus = false) => { setMenu(null); if (focus) ratioButton.current?.focus(); }, []);
  const disabled = locked || running;
  const divider = <span className="image-node-separator" />;
  return <NodeToolbarTooltipScope><div role="toolbar" aria-label="Video node tools" className="image-node-toolbar nodrag nopan" onKeyDown={event => event.stopPropagation()}>
    <NodeToolbarTooltip label="选择视频模型"><button type="button" ref={modelButton} className="image-node-toolbar-label"
      aria-label={`选择视频模型：${label}`} aria-haspopup="dialog" aria-expanded={menu === 'model'} disabled={disabled}
      onClick={() => setMenu(menu === 'model' ? null : 'model')} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setMenu('model'); } }}>
      <ImagePromptModelBrand brand={brand} />{label}<ImagePromptIcon name="chevron" />
    </button></NodeToolbarTooltip>
    {menu === 'model' && !disabled && <ImagePromptModelMenu id={id + '-model'} anchor={modelButton} label="选择视频模型" models={videoModels}
      selection={selection} multipleHelp="可保存多个视频模型。本地预览使用同一段示例视频。" pinned={pinned} onPinnedChange={setPinned}
      onChange={value => onEdit({ model: value.modelIds[0], selection: value })} onClose={closeModel} />}
    {divider}
    <NodeToolbarTooltip label="画面比例"><button type="button" ref={ratioButton} id={id + '-ratio-button'} className="image-node-toolbar-label"
      aria-label={`选择画面比例：${composer.ratio}`} aria-expanded={menu === 'ratio'} aria-haspopup="menu" disabled={disabled}
      onClick={() => setMenu(menu === 'ratio' ? null : 'ratio')} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setMenu('ratio'); } }}>
      {composer.ratio}<ImagePromptIcon name="chevron" /></button></NodeToolbarTooltip>
    {menu === 'ratio' && !disabled && <ImagePromptAspectRatioMenu id={id+'-ratio'} labelledBy={id+'-ratio-button'} anchor={ratioButton}
      value={composer.ratio} choices={videoRatios} onChange={ratio => onEdit({ ratio })} onClose={closeRatio} />}
    {divider}
    <MediaToolbarAction label="减少一秒" icon="minus" disabled={disabled || composer.seconds <= 1} onClick={() => onEdit({ seconds: composer.seconds - 1 })} />
    <span className="video-toolbar-duration" aria-label="视频时长">{composer.seconds}s</span>
    <MediaToolbarAction label="增加一秒" icon="plus" disabled={disabled || composer.seconds >= 10} onClick={() => onEdit({ seconds: composer.seconds + 1 })} />
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
