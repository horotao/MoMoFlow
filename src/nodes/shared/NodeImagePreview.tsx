import type { ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
import { FileActionMenu } from '../FileActionMenu';
import { extractFileAsset } from '../fileCollection';
import type { AppNode, FileAsset, FileNode } from '../types';

/** Shared imported/generated image surface; selection stays in the owning node. */
export function NodeImagePreview({ nodeId, assets, active, grid, orderBy, locked, onSelect, onGridChange, onOrderChange, onFullscreen, onDownload, renderMedia, opensOnClick }: {
  nodeId: string;
  assets: FileAsset[];
  active: FileAsset;
  grid: boolean;
  orderBy: FileNode['data']['orderBy'];
  locked: boolean;
  onSelect: (id: string) => void;
  onGridChange: () => void;
  onOrderChange: (order: 'date' | 'name') => void;
  onFullscreen: (id: string, trigger: HTMLElement, keyboard: boolean) => void;
  onDownload: () => void;
  renderMedia: (asset: FileAsset) => ReactNode;
  opensOnClick?: (asset: FileAsset) => boolean;
}) {
  const { getNode, setNodes, screenToFlowPosition } = useReactFlow<AppNode>();
  const index = Math.max(0, assets.findIndex(item => item.id === active.id));
  const opensSingle = opensOnClick?.(active);
  return <>
    {grid ? <div className="node-image-grid" aria-label="图片画廊">
      {[0, 1].map(column => <div className="node-image-column" key={column}>
        {assets.filter((_, i) => i % 2 === column).map(item => {
          const opens = opensOnClick?.(item);
          return <div key={item.id}
            className={`node-image-tile${item.id === active.id ? ' is-active' : ''}`} data-asset-id={item.id}
            role="button" tabIndex={0} aria-label={`${opens ? '查看' : '选择'} ${item.name}`} aria-pressed={item.id === active.id} aria-haspopup={opens ? 'dialog' : undefined}
            draggable={!locked} onClick={event => {
              if (opens) onFullscreen(item.id, event.currentTarget, event.detail === 0);
              else onSelect(item.id);
            }} onDoubleClick={event => { if (!opens) onFullscreen(item.id, event.currentTarget, false); }}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              if (opens) onFullscreen(item.id, event.currentTarget, true);
              else onSelect(item.id);
            }}
            onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-momoflow-asset', item.id); }}
            onDragEnd={event => {
              event.stopPropagation();
              if (event.dataTransfer.dropEffect !== 'move' || !getNode(nodeId)) return;
              if (!document.elementFromPoint(event.clientX, event.clientY)?.classList.contains('react-flow__pane')) return;
              const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              setNodes(nodes => extractFileAsset(nodes, nodeId, item.id, position, `file-${crypto.randomUUID()}`));
            }}>
            {renderMedia(item)}
          </div>;
        })}
      </div>)}
    </div> : <div className="node-image-single" data-asset-id={active.id} role={opensSingle ? 'button' : undefined}
      tabIndex={opensSingle ? 0 : undefined} aria-label={opensSingle ? `查看 ${active.name}` : undefined} aria-haspopup={opensSingle ? 'dialog' : undefined}
      onClick={opensSingle ? event => onFullscreen(active.id, event.currentTarget, event.detail === 0) : undefined}
      onKeyDown={opensSingle ? event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); event.stopPropagation(); onFullscreen(active.id, event.currentTarget, true);
      } : undefined}
      onDoubleClick={event => {
        if (!opensSingle && !(event.target as HTMLElement).closest('video,audio')) onFullscreen(active.id, event.currentTarget, false);
      }}>{renderMedia(active)}</div>}
    <div className="node-image-overlay nodrag nopan">
      <div className="node-image-top">
        <div className="node-image-navigation">{assets.length > 1 && <>
          <button type="button" className="file-icon-button" aria-label={grid ? '返回单张展示' : '图片画廊'} title={grid ? '返回单张展示' : '图片画廊'} aria-pressed={grid} onClick={onGridChange}><ImagePreviewIcon name={grid ? 'grid' : 'gallery'} /></button>
          {grid ? <span>{assets.length} images</span> : <>
            <button type="button" className="file-icon-button" disabled={locked} aria-label="上一张" title="上一张" onClick={() => onSelect(assets[(index - 1 + assets.length) % assets.length].id)}><ImagePreviewIcon name="previous" /></button>
            <span className="node-image-page">{index + 1} / {assets.length}</span>
            <button type="button" className="file-icon-button" disabled={locked} aria-label="下一张" title="下一张" onClick={() => onSelect(assets[(index + 1) % assets.length].id)}><ImagePreviewIcon name="next" /></button>
          </>}
        </>}</div>
        <div className="node-image-tools">
          <FileActionMenu label="排序方式" heading="排序方式" disabled={locked} items={[
            { label: '添加时间', checked: orderBy !== 'name', action: () => onOrderChange('date') },
            { label: '名称', checked: orderBy === 'name', action: () => onOrderChange('name') },
          ]}><ImagePreviewIcon name="order" /></FileActionMenu>
          <button type="button" className="file-icon-button" aria-label={grid ? '下载全部图片' : '下载当前图片'} title={grid ? '下载全部图片' : '下载当前图片'} onClick={onDownload}><ImagePreviewIcon name="download" /></button>
          <button type="button" className="file-icon-button" aria-label="全屏展开" title="全屏展开" onClick={event => onFullscreen(active.id, event.currentTarget, event.detail === 0)}><ImagePreviewIcon name="fullscreen" /></button>
        </div>
      </div>
      {!grid && Boolean(active.width && active.height) && <span className="node-image-resolution">{active.width} × {active.height}</span>}
    </div>
  </>;
}

function ImagePreviewIcon({ name }: { name: 'gallery' | 'grid' | 'previous' | 'next' | 'order' | 'download' | 'fullscreen' }) {
  return <img src={`/image-node/${name}.svg`} width={15} height={15} alt="" draggable={false} />;
}
