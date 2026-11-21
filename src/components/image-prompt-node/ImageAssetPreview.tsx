import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { FileAsset } from '../../nodes/types';
import { ImagePromptIcon } from './ImagePromptIcon';

export function ImageAssetPreview({ asset, onClose }: { asset: FileAsset; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  return createPortal(<dialog ref={dialog} className="canvas-image-preview" aria-label="图片预览"
    onClose={onClose} onKeyDown={event => event.stopPropagation()}
    onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <img src={asset.url} alt={asset.name} />
    <button type="button" aria-label="关闭图片预览" onClick={() => dialog.current?.close()}><ImagePromptIcon name="close" /></button>
  </dialog>, document.body);
}
