import { useEffect, useState } from 'react';
import type { FileAsset } from '../../nodes/types';
import { measureAsset } from '../../nodes/fileMedia';
import { imageCreatedAt, imageDateLabel, imageFormat, imageModel, imageSizeLabel } from '../../nodes/imageMetadata';
import { ScrollArea } from '../ui/scroll-area';

export function FullscreenImageInformation({ asset }: { asset: FileAsset }) {
  const [measured, setMeasured] = useState(asset);
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      let value = asset;
      if (value.size === undefined || !imageFormat(value)) {
        try {
          const response = await fetch(asset.url, { signal: abort.signal });
          if (response.ok) { const blob = await response.blob(); value = { ...value, size: value.size ?? blob.size, mimeType: value.mimeType || blob.type }; }
        } catch { /* Missing metadata is displayed as unknown. */ }
      }
      if (!value.width || !value.height) value = await measureAsset(value);
      if (!abort.signal.aborted) setMeasured(value);
    })();
    return () => abort.abort();
  }, [asset]);
  const time = imageCreatedAt(asset);
  const date = imageDateLabel(time).replace(/\s0(\d:)/, ' $1');
  const created = time ? `${date}:${String(new Date(time).getSeconds()).padStart(2, '0')}` : date;
  const rows: [string, string][] = [
    ['名称', asset.name], ['模型', imageModel(asset) ?? '—'], ['文件类型', imageFormat(measured) ?? '—'],
    ['文件大小', imageSizeLabel(measured.size)], ['分辨率', measured.width && measured.height ? `${measured.width} × ${measured.height}` : '—'],
    ['创建时间', created],
    ['创建者', '—'],
  ];
  return <aside className="image-fullscreen-information" aria-label="图片信息"><ScrollArea className="image-fullscreen-information-scroll-area" viewportClassName="image-fullscreen-information-scroll"><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></ScrollArea></aside>;
}
