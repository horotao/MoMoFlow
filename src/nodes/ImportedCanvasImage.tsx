import { useState, type ReactNode } from 'react';
import { ImagePromptNode, type ImagePromptNodeProps } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptToolbar } from '../components/image-prompt-node/ImagePromptToolbar';
import { ImageAssetPreview } from '../components/image-prompt-node/ImageAssetPreview';
import { requestNodeCommand } from './nodeCommands';
import { canvasImageSize } from './canvasImageGeometry';
import { downloadAsset } from './fileMedia';
import { useCanvasImageCrop } from './useCanvasImageCrop';
import { useCanvasImageInpaint } from './useCanvasImageInpaint';
import type { FileAsset } from './types';

export type CanvasImageChrome = Pick<ImagePromptNodeProps, 'title' | 'onTitleChange' | 'selected' | 'locked' | 'onSelectedChange' | 'outputConnected'> & {
  output: ReactNode;
  replacing: boolean;
  showToolbar: boolean;
  toolbarHidden: boolean;
};

export function ImportedCanvasImage({ id, asset, chrome }: { id: string; asset?: FileAsset; chrome: CanvasImageChrome }) {
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { output, showToolbar, toolbarHidden, replacing, ...frame } = chrome;
  const crop = useCanvasImageCrop(id, asset, Boolean(frame.locked) || replacing);
  const inpaint = useCanvasImageInpaint(id, asset, Boolean(frame.locked) || replacing || crop.active);

  return <div className="canvas-image-mount" style={inpaint.size ?? crop.size ?? canvasImageSize('auto', asset)}>
    <ImagePromptNode {...frame} assetKind="image" className="canvas-imported-image" editModeLabel={inpaint.active ? '局部重绘中' : undefined}
      result={asset && <img src={asset.url} alt={asset.name} />}
      onPreviewImage={asset ? () => setPreviewOpen(true) : undefined}
      handles={{ image: null, output }}
      toolbar={showToolbar ? <ImagePromptToolbar className="nodrag nopan" {...(inpaint.active ? inpaint.controls : {})} hidden={toolbarHidden} locked={frame.locked}
        onCrop={crop.open} cropActive={crop.active} cropDisabled={!asset || replacing}
        onInpaint={inpaint.open} inpaintActive={inpaint.active} inpaintOnly={inpaint.active}
        replaceDisabled={replacing} onReplaceImage={() => requestNodeCommand(id, 'replace')} downloadDisabled={!asset}
        onPreviewImage={asset ? () => setPreviewOpen(true) : undefined}
        onDownload={() => { if (asset) void downloadAsset(asset).catch(() => setError('图片下载失败。')); }} /> : null}
    />
    {crop.editor}{crop.error}{inpaint.editor}{inpaint.error}
    {previewOpen && asset && <ImageAssetPreview asset={asset} onClose={() => setPreviewOpen(false)} />}
    {error && <button type="button" className="nodrag" role="alert" onClick={() => setError('')}>{error}</button>}
  </div>;
}
