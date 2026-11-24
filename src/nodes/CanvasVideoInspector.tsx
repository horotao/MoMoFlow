import { useState } from 'react';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { GenerationOptionsPanel } from '../components/image-prompt-node/GenerationOptionsPanel';
import { videoModelDisplay } from './videoComposer';
import type { CanvasVideo, VideoComposer } from './types';

export function CanvasVideoInspector({ data, composer, onImport, busy }: {
  data: CanvasVideo['data']; composer?: VideoComposer; onImport: () => void; busy: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const asset = data.asset;
  return <aside aria-label="视频检查器" className="image-inspector nodrag nopan nowheel"
    onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    <section className="image-information" aria-label="视频信息">
      <header><ImagePromptIcon name="video" /><h3>{data.label}</h3><button type="button" aria-label="视频信息" className="image-information-toggle"
        aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><ImagePromptIcon name="metadata-info" /></button></header>
      {expanded && <dl>{[['文件名', asset?.name], ['格式', asset && 'MP4'], ['分辨率', asset?.width && asset.height && `${asset.width} × ${asset.height}`],
        ['时长', asset?.duration && `${Number(asset.duration.toFixed(2))}s`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>}
      {!asset && <footer><button type="button" className="video-inspector-import" onClick={onImport} disabled={busy || data.locked}>导入 MP4</button></footer>}
    </section>
    {composer && <GenerationOptionsPanel label="高级参数">{[
      ['模型', videoModelDisplay(composer).label], ['画面比例', composer.ratio], ['时长', composer.seconds+'s'],
    ].map(([label, value]) => <div className="generation-option-row" key={label}><span>{label}</span><span>{value}</span></div>)}</GenerationOptionsPanel>}
  </aside>;
}
