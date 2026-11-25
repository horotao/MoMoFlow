import { useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { nodePreviewDescription, supportsNodePreview, type AddNodeType } from './useAddNodePreview';

const nodeScreenshots = {
  video: {
    src: new URL('./assets/video-preview.png', import.meta.url).href,
    alt: '主画布上的 Video 生成结果、编辑框及播放时间轴',
  },
  audio: {
    src: new URL('./assets/audio-preview.png', import.meta.url).href,
    alt: '主画布中的 Audio 节点与波形预览',
  },
  image: {
    src: new URL('./assets/image-preview.jpg', import.meta.url).href,
    alt: '主画布中的 Image 节点，展示市集照片结果',
  },
  text: {
    src: new URL('./assets/text-preview.png', import.meta.url).href,
    alt: '主画布中的 Text 节点，展示市集描述的提示词和文本结果',
  },
};
const previewWidth = 408;
const minimumWidth = 224;
const gap = 7;
const margin = 8;

interface AddNodePreviewProps {
  previewRef: RefObject<HTMLElement>;
  anchor: HTMLElement;
  menuLeft: number;
  menuTop: number;
  menuWidth: number;
  viewportWidth: number;
  viewportHeight: number;
  type: AddNodeType;
  title: string;
  subtitle: string;
  shortcut: string;
  icon: ReactNode;
  open: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onExit: () => void;
}

export function AddNodePreview({ previewRef, anchor, menuLeft, menuTop, menuWidth, viewportWidth, viewportHeight,
  type, title, subtitle, shortcut, icon, open, onEnter, onLeave, onExit }: AddNodePreviewProps) {
  const spaceRight = viewportWidth - margin - (menuLeft + menuWidth + gap);
  const spaceLeft = menuLeft - margin - gap;
  const side = spaceRight >= previewWidth || spaceRight >= spaceLeft ? 'right' : 'left';
  const width = Math.min(previewWidth, side === 'right' ? spaceRight : spaceLeft);
  const left = side === 'right' ? menuLeft + menuWidth + gap : menuLeft - gap - width;

  useLayoutEffect(() => {
    const panel = previewRef.current;
    if (!panel) return;
    const align = () => {
      const rowTop = anchor.getBoundingClientRect().top;
      const top = Math.max(margin, Math.min(rowTop, viewportHeight - panel.offsetHeight - margin));
      panel.style.top = `${top}px`;
      panel.style.transformOrigin = `${side === 'right' ? 'left' : 'right'} ${Math.max(0, rowTop - top)}px`;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [anchor, menuTop, previewRef, side, viewportHeight, width]);

  if (width < minimumWidth || viewportHeight < 160) return null;
  return <aside ref={previewRef} className="add-node-preview nodrag nopan nowheel" lang="zh-CN"
    aria-label={`${title}节点介绍`} aria-hidden={!open} data-type={type} data-state={open ? 'open' : 'closing'}
    style={{ left, width, maxHeight: viewportHeight - margin * 2 }}
    onPointerEnter={event => { if (supportsNodePreview(event.pointerType)) onEnter(); }}
    onPointerLeave={event => { if (supportsNodePreview(event.pointerType)) onLeave(); }}
    onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === 'opacity') onExit(); }}>
    <header className="add-node-preview-header">
      <span className="flora-add-node-badge add-node-preview-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </header>
    <p className="add-node-preview-description">{nodePreviewDescription[type]}</p>
    <figure className="add-node-preview-example">
      <figcaption lang="en">Node preview</figcaption>
      <div className="add-node-preview-sample">
        <img src={nodeScreenshots[type].src} alt={nodeScreenshots[type].alt} width="768" height="480" />
      </div>
    </figure>
    <footer className="add-node-preview-key">
      <span className="add-node-preview-help" aria-hidden="true">?</span>
      <span>按</span><kbd className="flora-add-node-shortcut">{shortcut}</kbd><span>添加{title}节点</span>
    </footer>
  </aside>;
}
