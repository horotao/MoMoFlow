import { ImageUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { NodeToolbarTooltip, NodeToolbarTooltipScope } from '../NodeToolbarTooltip';
import { NodeColorTagButton } from '../NodeColorTagButton';
import { ImagePromptIcon, type ImagePromptIconName } from './ImagePromptIcon';
import './image-prompt-toolbar.css';

interface Props {
  kind: 'image' | 'video';
  tools?: ReactNode;
  className?: string;
  onReplace: () => void;
  replaceDisabled?: boolean;
  onDownload?: () => void;
  onPreview?: () => void;
}

export function MediaToolbarAction({ label, icon, onClick, disabled = !onClick }: {
  label: string; icon: ImagePromptIconName | 'image-up'; onClick?: () => void; disabled?: boolean;
}) {
  return <NodeToolbarTooltip label={label}><button type="button" aria-label={label}
    className={icon === 'download' ? 'image-node-download' : undefined} disabled={disabled} onClick={onClick}>
    {icon === 'image-up' ? <ImageUp size={16} aria-hidden="true" /> : <ImagePromptIcon name={icon} />}
  </button></NodeToolbarTooltip>;
}

export function ImportedMediaToolbar({ kind, tools, className = '', onReplace, replaceDisabled, onDownload, onPreview }: Props) {
  const video = kind === 'video';
  const divider = <span className="image-node-separator" />;
  const download = <MediaToolbarAction label={video ? '下载原视频' : '下载原图'} icon="download" onClick={onDownload} />;
  const preview = <MediaToolbarAction label={video ? '全屏播放' : '查看大图'} icon={video ? 'metadata-fullscreen' : 'expand-preview'} onClick={onPreview} />;
  return <NodeToolbarTooltipScope><div role="toolbar" aria-label={video ? 'Video node tools' : 'Image node tools'}
    className={`image-node-toolbar ${className}`} onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) event.stopPropagation();
    }}>
    {tools ?? <NodeToolbarTooltip label="工具"><button type="button" className="image-node-toolbar-label image-node-tools-label"
      aria-label="工具" aria-disabled="true"><ImagePromptIcon name="tools" />Tools<ImagePromptIcon name="chevron" /></button></NodeToolbarTooltip>}
    {!video && divider}
    <MediaToolbarAction label={video ? '替换视频' : '替换图片'} icon={video ? 'image-up' : 'replace-image'} disabled={replaceDisabled} onClick={onReplace} />
    {!video && <>{download}{preview}</>}
    {divider}
    <NodeColorTagButton />
    {video && divider}
    <MediaToolbarAction label="添加到素材库" icon="folder" />
    <MediaToolbarAction label={video ? '发送视频' : '发送图片'} icon="send-image" />
    {video && <>{download}{divider}{preview}{divider}</>}
    <MediaToolbarAction label="评论" icon="comment" />
  </div></NodeToolbarTooltipScope>;
}
