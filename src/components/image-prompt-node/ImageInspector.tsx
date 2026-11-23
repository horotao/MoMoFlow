import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { useStore } from '@xyflow/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { FileAsset, SunburstNode } from '../../nodes/types';
import { selectedImageResult } from '../../nodes/annotationGraph';
import { useVisibleCanvasImage } from '../../nodes/visibleCanvasImage';
import { assetResources } from '../../nodes/assetResources';
import { measureAsset } from '../../nodes/fileMedia';
import { imageCreatedAt, imageDateLabel, imageFormat, imageModel, imageSizeLabel } from '../../nodes/imageMetadata';
import { ImageGenerationOptions } from './ImageGenerationOptions';
import { ImageAssetPreview } from './ImageAssetPreview';
import { ImagePromptIcon, type ImagePromptIconName } from './ImagePromptIcon';
import { requestImageCrop } from '../../nodes/useCanvasImageCrop';
import './image-inspector.css';

export function ImageInspector({ panelRef }: { panelRef?: Ref<HTMLElement> }) {
  const selectedId = useStore(state => {
    const selected = state.nodes.filter(node => node.selected);
    return selected.length === 1 && selected[0].type === 'sunburst' && selected[0].data.composer ? selected[0].id : null;
  });
  const data = useStore(state => selectedId ? state.nodeLookup.get(selectedId)?.data : undefined) as SunburstNode['data'] | undefined;
  const asset = useVisibleCanvasImage(selectedId, data ? selectedImageResult({ data }) : undefined);
  if (!data) return null;
  return <aside ref={panelRef} className="image-inspector nodrag nopan nowheel" aria-label="图片检查器" data-has-image={Boolean(asset)}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onWheel={event => event.stopPropagation()} onKeyDown={event => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') event.stopPropagation();
    }}>
    <ImageInformation key={`${selectedId}:${asset?.id ?? 'empty'}:${asset?.url ?? ''}`} asset={asset}
      onCrop={selectedId && !data.locked ? () => requestImageCrop(selectedId) : undefined}
      name={data.label || asset?.name || 'Image'} generated={data.imageSource !== 'imported'} assets={data.results} />
    <ImageGenerationOptions />
  </aside>;
}

const tools: { icon: ImagePromptIconName; label: string }[] = [
  { icon: 'metadata-extend', label: '扩展图片' }, { icon: 'metadata-edit', label: '编辑图片' },
  { icon: 'metadata-crop', label: '裁剪图片' }, { icon: 'metadata-upscale', label: '放大图片' },
  { icon: 'metadata-remove-background', label: '移除背景' },
];

function ImageInformation({ asset, name, generated, assets, onCrop }: { asset?: FileAsset; name: string; generated: boolean; assets?: FileAsset[]; onCrop?: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [measured, setMeasured] = useState(asset);
  const [preview, setPreview] = useState(false);
  const openingPreview = useRef(false);
  const more = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!asset) return;
    const image = asset;
    const abort = new AbortController();
    const release = assetResources.retain([image.url]);
    // Enrich the view only: inspection must not change history or task inputs.
    async function read() {
      let value = image;
      if (image.size === undefined || !imageFormat(image)) {
        try {
          const response = await fetch(image.url, { signal: abort.signal });
          if (response.ok) {
            const blob = await response.blob();
            value = { ...value, size: image.size ?? blob.size, mimeType: image.mimeType || blob.type };
          }
        } catch { /* Unavailable remote metadata remains unknown. */ }
      }
      if (!value.width || !value.height) value = await measureAsset(value);
      if (!abort.signal.aborted) setMeasured(value);
    }
    void read();
    return () => { abort.abort(); release(); };
  }, [asset]);
  useEffect(() => {
    if (!asset) return;
    function shortcut(event: KeyboardEvent) {
      const target = event.target;
      if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat
        || document.querySelector('dialog[open], [role="menu"]')
        || (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      event.preventDefault(); event.stopPropagation(); setPreview(true);
    }
    window.addEventListener('keydown', shortcut, true);
    return () => window.removeEventListener('keydown', shortcut, true);
  }, [asset]);
  const rows = asset && measured ? [
    ...(generated ? [['模型', imageModel(asset) ?? '—']] : []),
    ['格式', imageFormat(measured) ?? '—'], ['大小', imageSizeLabel(measured.size)],
    ['分辨率', measured.width && measured.height ? `${measured.width} × ${measured.height}${asset.crop ? '（已裁剪）' : ''}` : '—'],
    ['创建时间', imageDateLabel(imageCreatedAt(asset))],
  ] : [];
  return <section className="image-information" aria-label="图片信息">
    <header><h3 title={name}>{name}</h3><button type="button" className="image-information-toggle" aria-label="图片信息"
      disabled={!asset} aria-expanded={Boolean(asset) && expanded} aria-controls={asset ? id : undefined}
      onClick={() => setExpanded(!expanded)}><ImagePromptIcon name="metadata-info" /></button></header>
    {asset && expanded && <dl id={id}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={value}>{value}</dd></div>)}</dl>}
    <footer>{tools.map(tool => <button key={tool.icon} type="button" disabled={tool.icon !== 'metadata-crop' || !asset || !onCrop}
      onClick={tool.icon === 'metadata-crop' ? onCrop : undefined} aria-label={tool.icon === 'metadata-crop' ? tool.label : `${tool.label}（预留）`}
      title={tool.icon === 'metadata-crop' ? tool.label : `${tool.label}（预留）`}><ImagePromptIcon name={tool.icon} /></button>)}
      <DropdownMenu.Root modal={false}><DropdownMenu.Trigger asChild><button ref={more} type="button" disabled={!asset} className="image-information-more" aria-label="更多图片操作"><ImagePromptIcon name="metadata-more" /></button></DropdownMenu.Trigger>
        <DropdownMenu.Portal><DropdownMenu.Content className="image-information-menu nodrag nopan nowheel" align="end" sideOffset={6}
          onKeyDown={event => event.stopPropagation()} onEscapeKeyDown={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
          onCloseAutoFocus={event => { if (openingPreview.current) { event.preventDefault(); openingPreview.current = false; } }}>
          <DropdownMenu.Item onSelect={() => { openingPreview.current = true; setPreview(true); }}><span className="image-information-menu-icon"><ImagePromptIcon name="metadata-fullscreen" /></span><span>全屏</span><kbd>F</kbd></DropdownMenu.Item>
          <DropdownMenu.Item disabled><span className="image-information-menu-icon"><ImagePromptIcon name="metadata-save" /></span><span>保存到素材库</span><kbd>2</kbd></DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>
    </footer>
    {preview && asset && <ImageAssetPreview asset={asset} assets={assets} onClose={() => { setPreview(false); more.current?.focus({ preventScroll: true }); }} />}
  </section>;
}
