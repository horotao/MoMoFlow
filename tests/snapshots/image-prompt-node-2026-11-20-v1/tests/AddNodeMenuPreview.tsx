import { useCallback, useRef, useState } from 'react';
import { AddNodeMenu, type AddNodeRequest, type AddNodeType } from '../components/add-node-menu/AddNodeMenu';

const labels: Record<AddNodeType, string> = { text: '文本', image: '图片', video: '视频', audio: '音频', '3d': '3D', import: '导入', export: '导出' };

export function AddNodeMenuPreview({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => initiallyOpen ? { x: (window.innerWidth - 352) / 2, y: (window.innerHeight - 399) / 2 } : null);
  const [request, setRequest] = useState<AddNodeRequest | null>(null);
  const close = useCallback((restoreFocus: boolean) => {
    setPosition(null);
    if (restoreFocus) canvas.current?.focus({ preventScroll: true });
  }, []);

  return <>
    <div ref={canvas} className="prototype-context-target" role="region" aria-label="画布预览" tabIndex={-1} onContextMenu={event => {
      event.preventDefault();
      setPosition({ x: event.clientX, y: event.clientY });
    }} />
    {position && <AddNodeMenu position={position} onClose={close} onSelect={setRequest} />}
    {request && <output className="prototype-add-node-request" aria-live="polite" data-type={request.type} data-quantity={request.quantity}>{labels[request.type]} × {request.quantity}</output>}
  </>;
}
