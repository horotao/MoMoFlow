import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ImagePromptNode, type ImagePromptNodeProps } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptToolbar } from '../components/image-prompt-node/ImagePromptToolbar';
import { ImageAssetPreview } from '../components/image-prompt-node/ImageAssetPreview';
import { assetResources } from './assetResources';
import { canvasImageSize } from './canvasImageGeometry';
import { downloadAsset } from './fileMedia';
import { readCanvasImage } from './importCanvasImage';
import { useCanvasImageCrop } from './useCanvasImageCrop';
import { useCanvasImageInpaint } from './useCanvasImageInpaint';
import { isImportedCanvasImage, isNodeLocked, type AppNode, type FileAsset } from './types';

export type CanvasImageChrome = Pick<ImagePromptNodeProps, 'title' | 'onTitleChange' | 'selected' | 'locked' | 'onSelectedChange' | 'outputConnected'> & {
  output: ReactNode;
  showToolbar: boolean;
  toolbarHidden: boolean;
};

export function ImportedCanvasImage({ id, asset, chrome }: { id: string; asset?: FileAsset; chrome: CanvasImageChrome }) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const input = useRef<HTMLInputElement>(null);
  const pendingUrl = useRef<string>();
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { output, showToolbar, toolbarHidden, ...frame } = chrome;
  const crop = useCanvasImageCrop(id, asset, Boolean(frame.locked) || replacing);
  const inpaint = useCanvasImageInpaint(id, asset, Boolean(frame.locked) || replacing || crop.active);

  useLayoutEffect(() => {
    if (pendingUrl.current === asset?.url) pendingUrl.current = undefined;
  }, [asset?.url]);
  useLayoutEffect(() => () => {
    if (pendingUrl.current) assetResources.discard([pendingUrl.current]);
  }, []);

  async function replace(file: File, picker: HTMLInputElement) {
    setReplacing(true);
    setError('');
    try {
      const replacement = await readCanvasImage(file);
      const node = getNode(id);
      if (input.current !== picker || picker.closest('[inert]') || !node || !isImportedCanvasImage(node) || isNodeLocked(node)) {
        assetResources.discard([replacement.url]);
        return;
      }
      pendingUrl.current = replacement.url;
      updateNodeData(id, { label: node.data.label === asset?.name ? replacement.name : node.data.label,
        results: [replacement], activeResultId: replacement.id });
    } catch (cause) {
      if (input.current === picker) setError(cause instanceof Error ? cause.message : '无法替换图片。');
    } finally {
      if (input.current === picker) setReplacing(false);
    }
  }

  return <div className="canvas-image-mount" style={inpaint.size ?? crop.size ?? canvasImageSize('auto', asset)}>
    <ImagePromptNode {...frame} assetOnly className="canvas-imported-image" editModeLabel={inpaint.active ? '局部重绘中' : undefined}
      result={asset && <img src={asset.url} alt={asset.name} />}
      onPreviewImage={asset ? () => setPreviewOpen(true) : undefined}
      handles={{ image: null, output }}
      toolbar={showToolbar ? <ImagePromptToolbar className="nodrag nopan" hidden={toolbarHidden} locked={frame.locked}
        onCrop={crop.open} cropActive={crop.active} cropDisabled={!asset || replacing}
        onInpaint={inpaint.open} inpaintActive={inpaint.active}
        replaceDisabled={replacing} onReplaceImage={() => input.current?.click()} downloadDisabled={!asset}
        onPreviewImage={asset ? () => setPreviewOpen(true) : undefined}
        onDownload={() => { if (asset) void downloadAsset(asset).catch(() => setError('图片下载失败。')); }} /> : null}
    />
    {crop.editor}{crop.error}{inpaint.editor}{inpaint.error}
    <input ref={input} hidden type="file" accept="image/*" aria-label="选择替换图片"
      onChange={event => {
        const picker = event.currentTarget;
        const file = picker.files?.[0];
        picker.value = '';
        if (file && !replacing) void replace(file, picker);
      }} />
    {previewOpen && asset && <ImageAssetPreview asset={asset} onClose={() => setPreviewOpen(false)} />}
    {error && <button type="button" className="nodrag" role="alert" onClick={() => setError('')}>{error}</button>}
  </div>;
}
