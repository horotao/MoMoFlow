import { ImagePromptAspectRatioMenu } from './ImagePromptAspectRatioMenu';
import { ImagePromptModelMenu, ImagePromptModelBrand } from './ImagePromptModelMenu';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useControllableValue } from './useControllableValue';
import { imagePromptModels, defaultImagePromptModelSelection, type ImagePromptModelSelection, type ImagePromptModelId } from './imagePromptModels';
import { ImagePromptIcon } from './ImagePromptIcon';
import './image-prompt-toolbar.css';

export interface ImagePromptToolbarProps {
  modelLabel?: string;
  modelSelection?: ImagePromptModelSelection;
  defaultModelSelection?: ImagePromptModelSelection;
  onModelSelectionChange?: (selection: ImagePromptModelSelection) => void;
  onModelMenuOpenChange?: (open: boolean) => void;
  aspectRatio?: string;
  defaultAspectRatio?: string;
  onAspectRatioChange?: (ratio: string) => void;
  onAspectRatioMenuOpenChange?: (open: boolean) => void;
  locked?: boolean;
  onLockedChange?: (locked: boolean) => void;
  onModelClick?: () => void;
  onAspectRatioClick?: () => void;
  onToolsClick?: () => void;
  onTagClick?: () => void;
  onDownload?: () => void;
  downloadDisabled?: boolean;
  className?: string;
}

export function ImagePromptToolbar({
  modelLabel, modelSelection, defaultModelSelection = defaultImagePromptModelSelection, onModelSelectionChange, onModelMenuOpenChange, aspectRatio: aspectRatioValue, defaultAspectRatio = '1:1', onAspectRatioChange, onAspectRatioMenuOpenChange, locked = false,
  onLockedChange, onModelClick, onAspectRatioClick, onToolsClick, onTagClick,
  onDownload, downloadDisabled = true,
  className = '',
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
    if (locked && menuOpen) closeMenu();
    if (locked && aspectMenuOpen) closeAspectMenu();
  }, [locked, menuOpen, aspectMenuOpen, closeMenu, closeAspectMenu]);
  return (
    <div className={`image-node-toolbar ${className}`} role="toolbar" aria-label="Image node tools">
      <button ref={trigger} type="button" className="image-node-toolbar-label" aria-label={`选择图像模型：${label}`} aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} disabled={locked}
        onClick={() => { onModelClick?.(); if (menuOpen) closeMenu(); else openModelMenu(); }}
        onKeyDown={event => { if (event.key === 'ArrowDown' && !menuOpen) { event.preventDefault(); openModelMenu(); } }}>
        <ImagePromptModelBrand brand={activeModel?.brand ?? 'openai'} />{label}<ImagePromptIcon name="chevron" />
      </button>
      {menuOpen && !locked && <ImagePromptModelMenu id={menuId} anchor={trigger} selection={selection} onChange={setSelection} pinned={pinned} onPinnedChange={setPinned} onClose={closeMenu} />}
      <span className="image-node-separator" />
      <button ref={aspectTrigger} id={aspectTriggerId} type="button" className="image-node-toolbar-label" aria-label={`选择画面比例：${aspectRatio === 'auto' ? '自动' : aspectRatio}`} aria-haspopup="menu" aria-expanded={aspectMenuOpen} aria-controls={aspectMenuOpen ? aspectMenuId : undefined} disabled={locked}
        onClick={() => { onAspectRatioClick?.(); if (aspectMenuOpen) closeAspectMenu(); else openAspectMenu(); }}
        onKeyDown={event => { if (event.key === 'ArrowDown' && !aspectMenuOpen) { event.preventDefault(); openAspectMenu(); } }}>
        {aspectRatio === 'auto' ? '自动' : aspectRatio}<ImagePromptIcon name="chevron" />
      </button>
      {aspectMenuOpen && !locked && <ImagePromptAspectRatioMenu id={aspectMenuId} labelledBy={aspectTriggerId} anchor={aspectTrigger} value={aspectRatio} onChange={setAspectRatio} onClose={closeAspectMenu} />}
      <span className="image-node-separator" />
      <button type="button" className="image-node-toolbar-label image-node-tools-label" onClick={onToolsClick}><ImagePromptIcon name="tools" />Tools<ImagePromptIcon name="chevron" /></button>
      <span className="image-node-separator" />
      <button type="button" aria-label="Lock node" aria-pressed={locked} onClick={() => onLockedChange?.(!locked)}><ImagePromptIcon name="unlock" /></button>
      <span className="image-node-separator" />
      <button type="button" aria-label="Tag" onClick={onTagClick}><span className="image-node-tag" /></button>
      <button type="button" className="image-node-download" aria-label="Download" onClick={onDownload} disabled={downloadDisabled}><ImagePromptIcon name="download" /></button>
    </div>
  );
}
