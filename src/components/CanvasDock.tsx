import { useEffect, useRef, useState } from 'react';
import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import { Button } from './ui/button';

export type CanvasTool = 'select' | 'hand';
type Props = {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  colorMode: 'light' | 'dark';
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

export function CanvasDock({ tool, onToolChange, colorMode, canUndo, canRedo, undo, redo }: Props) {
  const { zoom } = useViewport();
  const { zoomTo, fitView } = useReactFlow();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const icon = (name: string) => <img src={`/canvas-dock/${name}-${colorMode}.svg`} alt="" draggable={false} />;
  return <Panel position="bottom-center" className="canvas-dock-panel">
    <div ref={root} className="canvas-dock nodrag nopan" role="toolbar" aria-label="画布工具"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); event.stopPropagation(); }
      }}>
      <div className="canvas-dock-tools">
        {(['select', 'hand'] as const).map((item) => <Button key={item} variant="ghost" size="icon"
          className={`canvas-dock-button canvas-dock-${item}`} aria-label={item === 'select' ? '选择工具' : '抓手工具'}
          title={item === 'select' ? '选择工具 (V)' : '抓手工具 (H)'} aria-pressed={tool === item}
          onClick={() => onToolChange(item)}>{icon(item)}</Button>)}
      </div>
      <div className="canvas-dock-divider" />
      <div className="canvas-dock-history">
        <Button variant="ghost" size="icon" className="canvas-dock-button" aria-label="撤销" title="撤销 (⌘/Ctrl Z)" disabled={!canUndo} onClick={undo}>{icon('undo')}</Button>
        <Button variant="ghost" size="icon" className="canvas-dock-button" aria-label="重做" title="重做 (⌘/Ctrl Shift Z)" disabled={!canRedo} onClick={redo}>{icon('redo')}</Button>
      </div>
      <div className="canvas-dock-zoom">
        <Button ref={trigger} variant="ghost" className="canvas-dock-zoom-trigger" aria-label="画布比例" aria-expanded={open} aria-controls="canvas-zoom-options" onClick={() => setOpen(!open)}>
          <span>{Math.round(zoom * 100)}%</span>{icon('chevron')}
        </Button>
        {open && <div id="canvas-zoom-options" className="canvas-dock-zoom-menu" aria-label="缩放选项">
          {[25, 50, 75, 100, 150, 200].map((value) => <button type="button" key={value}
            aria-current={Math.round(zoom * 100) === value ? 'true' : undefined}
            onClick={() => { void zoomTo(value / 100); setOpen(false); trigger.current?.focus(); }}>{value}%</button>)}
          <button type="button" onClick={() => { void fitView({ padding: 0.2 }); setOpen(false); trigger.current?.focus(); }}>适应画布</button>
        </div>}
      </div>
    </div>
  </Panel>;
}
