import { NodeToolbarTooltip, NodeToolbarTooltipScope } from '../NodeToolbarTooltip';
import { NodeColorTagButton } from '../NodeColorTagButton';
import { ImagePromptAspectRatioMenu } from './ImagePromptAspectRatioMenu';
import { ImagePromptModelMenu, ImagePromptModelBrand } from './ImagePromptModelMenu';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useControllableValue } from './useControllableValue';
import { imagePromptModels, inpaintModels, defaultImagePromptModelSelection, type ImagePromptModelSelection, type ImagePromptModelId } from './imagePromptModels';
import { ImagePromptIcon } from './ImagePromptIcon';
import { Zap } from 'lucide-react';
import { ImageToolsMenu } from './ImageToolsMenu';
import './image-prompt-toolbar.css';

function stopToolbarNavigation(event: KeyboardEvent<HTMLDivElement>) {
  if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) {
    event.stopPropagation();
  }
}

export interface ImagePromptToolbarProps {
  textModelPicker?: ReactNode;
  textHasOutput?: boolean;
  modelLabel?: string;
  modelSelection?: ImagePromptModelSelection;
  defaultModelSelection?: ImagePromptModelSelection;
  onModelSelectionChange?: (selection: ImagePromptModelSelection) => void;
  onModelMenuOpenChange?: (open: boolean) => void;
  aspectRatio?: string;
  aspectRatioChoices?: readonly string[];
  defaultAspectRatio?: string;
  onAspectRatioChange?: (ratio: string) => void;
  onAspectRatioMenuOpenChange?: (open: boolean) => void;
  hidden?: boolean;
  locked?: boolean;
  onLockedChange?: (locked: boolean) => void;
  onModelClick?: () => void;
  onAspectRatioClick?: () => void;
  onToolsClick?: () => void;
  onCrop?: () => void;
  onInpaint?: () => void;
  cropActive?: boolean;
  inpaintActive?: boolean;
  cropDisabled?: boolean;
  inpaintOnly?: boolean;
  onReplaceImage?: () => void;
  onPreviewImage?: () => void;
  replaceDisabled?: boolean;
  onDownload?: () => void;
  downloadDisabled?: boolean;
  className?: string;
}

export function ImagePromptToolbar({
  modelLabel, modelSelection, defaultModelSelection = defaultImagePromptModelSelection, onModelSelectionChange, onModelMenuOpenChange, aspectRatio: aspectRatioValue, defaultAspectRatio = '1:1', onAspectRatioChange, onAspectRatioMenuOpenChange, locked = false,
  hidden = false, aspectRatioChoices, onLockedChange, onModelClick, onAspectRatioClick, onToolsClick,
  onDownload, downloadDisabled = true, onReplaceImage, onPreviewImage, replaceDisabled = false,
  className = '',
  textModelPicker, textHasOutput = false,
  onCrop, onInpaint, cropActive = false, inpaintActive = false, cropDisabled = false, inpaintOnly = false,
}: ImagePromptToolbarProps) {
  const [selection, setSelection] = useControllableValue(modelSelection, defaultModelSelection, onModelSelectionChange);
  const [aspectRatio, setAspectRatio] = useControllableValue(aspectRatioValue, defaultAspectRatio, onAspectRatioChange);
  const [openMenu, setOpenMenu] = useState<'model' | 'aspect' | null>(null);
  const menuOpen = openMenu === 'model';
  const aspectMenuOpen = openMenu === 'aspect';
  const aspectTrigger = useRef<HTMLButtonElement>(null);
  const aspectMenuId = useId();
  const aspectTriggerId = useId();
  const [pinned, setPinned] = useState<ImagePromptModelId[]>(['nano-banana-2']);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const activeModel = imagePromptModels.find(model => model.id === selection.modelIds[0]);
  const label = modelLabel ?? (selection.autoSelect ? '自动选择模型' : selection.modelIds.length > 1 ? `${selection.modelIds.length} 个模型` : activeModel?.name);
  const closeMenu = useCallback((restoreFocus = false) => {
    setOpenMenu(null);
    onModelMenuOpenChange?.(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, [onModelMenuOpenChange]);
  const closeAspectMenu = useCallback((restoreFocus = false) => {
    setOpenMenu(null);
    onAspectRatioMenuOpenChange?.(false);
    if (restoreFocus) aspectTrigger.current?.focus({ preventScroll: true });
  }, [onAspectRatioMenuOpenChange]);
  function openModelMenu() {
    if (aspectMenuOpen) closeAspectMenu();
    setOpenMenu('model');
    onModelMenuOpenChange?.(true);
  }
  function openAspectMenu() {
    if (menuOpen) closeMenu();
    setOpenMenu('aspect');
    onAspectRatioMenuOpenChange?.(true);
  }
  useEffect(() => {
    if (locked || hidden) {
      if (menuOpen) closeMenu();
      if (aspectMenuOpen) closeAspectMenu();
    }
  }, [locked, hidden, menuOpen, aspectMenuOpen, closeMenu, closeAspectMenu]);
  if (hidden) return null;
  const imageTools = <ImageToolsMenu onCrop={onCrop} onInpaint={onInpaint}
    active={cropActive ? 'crop' : inpaintActive ? 'inpaint' : undefined} disabled={locked || cropDisabled} />;
  const modelPicker = <><NodeToolbarTooltip label="选择图像模型"><button ref={trigger} type="button" className="image-node-toolbar-label" aria-label={`选择图像模型：${label}`} aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} disabled={locked}
    onClick={() => { onModelClick?.(); if (menuOpen) closeMenu(); else openModelMenu(); }}
    onKeyDown={event => { if (event.key === 'ArrowDown' && !menuOpen) { event.preventDefault(); openModelMenu(); } }}>
    <ImagePromptModelBrand brand={activeModel?.brand ?? 'openai'} />{label}<ImagePromptIcon name="chevron" />
  </button></NodeToolbarTooltip>
    {menuOpen && !locked && <ImagePromptModelMenu models={inpaintOnly ? inpaintModels : imagePromptModels}
      singleSelection={inpaintOnly} id={menuId} anchor={trigger} selection={selection} onChange={setSelection}
      pinned={pinned} onPinnedChange={setPinned} onClose={closeMenu} />}</>;
  if (onReplaceImage) return (
    <NodeToolbarTooltipScope><div className={`image-node-toolbar ${className}`} role="toolbar" aria-label={textModelPicker ? 'Text node tools' : 'Image node tools'} onKeyDown={stopToolbarNavigation}>
      {inpaintOnly && <>{modelPicker}<span className="image-node-separator" /></>}
      {imageTools}
      <span className="image-node-separator" />
      <NodeToolbarTooltip label="替换图片"><button type="button" aria-label="替换图片" disabled={locked || replaceDisabled} onClick={onReplaceImage}>
        <ImagePromptIcon name="replace-image" />
      </button></NodeToolbarTooltip>
      <NodeToolbarTooltip label="下载原图"><button type="button" aria-label="下载原图" className="image-node-download" disabled={downloadDisabled} onClick={onDownload}>
        <ImagePromptIcon name="download" />
      </button></NodeToolbarTooltip>
      <NodeToolbarTooltip label="查看大图"><button type="button" aria-label="查看大图" disabled={!onPreviewImage} onClick={onPreviewImage}>
        <ImagePromptIcon name="expand-preview" />
      </button></NodeToolbarTooltip>
      <span className="image-node-separator" />
      <NodeColorTagButton />
      <NodeToolbarTooltip label="添加到素材库"><button type="button" aria-label="添加到素材库" disabled>
        <ImagePromptIcon name="folder" />
      </button></NodeToolbarTooltip>
      <NodeToolbarTooltip label="发送图片"><button type="button" aria-label="发送图片" disabled>
        <ImagePromptIcon name="send-image" />
      </button></NodeToolbarTooltip>
      <NodeToolbarTooltip label="评论"><button type="button" aria-label="评论" disabled>
        <ImagePromptIcon name="comment" />
      </button></NodeToolbarTooltip>
    </div></NodeToolbarTooltipScope>
  );
  return (
    <NodeToolbarTooltipScope><div className={`image-node-toolbar ${className}`} role="toolbar" aria-label={textModelPicker ? 'Text node tools' : 'Image node tools'} onKeyDown={stopToolbarNavigation}>
      {textModelPicker ?? <>{modelPicker}
      <span className="image-node-separator" />
      <NodeToolbarTooltip label="画面比例"><button ref={aspectTrigger} id={aspectTriggerId} type="button" className="image-node-toolbar-label" aria-label={`选择画面比例：${aspectRatio === 'auto' ? '自动' : aspectRatio}`} aria-haspopup="menu" aria-expanded={aspectMenuOpen} aria-controls={aspectMenuOpen ? aspectMenuId : undefined} disabled={locked}
        onClick={() => { onAspectRatioClick?.(); if (aspectMenuOpen) closeAspectMenu(); else openAspectMenu(); }}
        onKeyDown={event => { if (event.key === 'ArrowDown' && !aspectMenuOpen) { event.preventDefault(); openAspectMenu(); } }}>
        {aspectRatio === 'auto' ? '自动' : aspectRatio}<ImagePromptIcon name="chevron" />
      </button></NodeToolbarTooltip>
      {aspectMenuOpen && !locked && <ImagePromptAspectRatioMenu id={aspectMenuId} labelledBy={aspectTriggerId} anchor={aspectTrigger} value={aspectRatio} choices={aspectRatioChoices} onChange={setAspectRatio} onClose={closeAspectMenu} />}</>}
      <span className="image-node-separator" />
      {textModelPicker ? <NodeToolbarTooltip label="工具"><button type="button" className="image-node-toolbar-label image-node-tools-label" aria-disabled="true" onClick={onToolsClick}><ImagePromptIcon name="tools" />Tools<ImagePromptIcon name="chevron" /></button></NodeToolbarTooltip>
        : imageTools}
      <span className="image-node-separator" />
      {textModelPicker && !textHasOutput && <NodeToolbarTooltip label="运行选项"><button type="button" aria-label="运行选项" aria-disabled="true"><Zap size={16} aria-hidden="true" /></button></NodeToolbarTooltip>}
      <NodeToolbarTooltip label={locked ? '解锁节点' : '锁定节点'}><button type="button" aria-label="Lock node" aria-pressed={locked} onClick={() => onLockedChange?.(!locked)}><ImagePromptIcon name="unlock" /></button></NodeToolbarTooltip>
      <span className="image-node-separator" />
      <NodeColorTagButton />
      {textModelPicker ? <><span className="image-node-separator" /><NodeToolbarTooltip label="添加到素材库"><button type="button" aria-label="添加到素材库" aria-disabled="true"><ImagePromptIcon name="folder" /></button></NodeToolbarTooltip>{textHasOutput && <NodeToolbarTooltip label="发送文本"><button type="button" aria-label="发送文本" aria-disabled="true"><ImagePromptIcon name="send-image" /></button></NodeToolbarTooltip>}<span className="image-node-separator" /><NodeToolbarTooltip label="评论"><button type="button" aria-label="评论" aria-disabled="true"><ImagePromptIcon name="comment" /></button></NodeToolbarTooltip></>
        : <NodeToolbarTooltip label="下载图片"><button type="button" className="image-node-download" aria-label="Download" onClick={onDownload} disabled={downloadDisabled}><ImagePromptIcon name="download" /></button></NodeToolbarTooltip>}
    </div></NodeToolbarTooltipScope>
  );
}
