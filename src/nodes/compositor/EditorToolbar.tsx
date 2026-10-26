import { useState } from 'react';
import { ChevronDown, Hand, Maximize, Minus, MousePointer2, Plus, Redo2, Undo2, Type, PenTool, Square, Circle, Triangle, Star } from 'lucide-react';
import { shapeKinds, type EditorTool, type ShapeKind } from '../compositorGraphics';
import { EditorPopover } from './EditorPopover';

export function EditorToolbar({ tool, space, zoom, canUndo, canRedo, onTool, onUndo, onRedo, onZoom, onFit, disabled }: {
  tool: EditorTool; disabled: boolean; space: boolean; zoom: number; canUndo: boolean; canRedo: boolean;
  onTool: (tool: EditorTool) => void; onUndo: () => void; onRedo: () => void; onZoom: (zoom: number) => void; onFit: () => void;
}) {
  const [shapes, setShapes] = useState<HTMLElement>(), [lastShape, setLastShape] = useState<ShapeKind>('rectangle');
  const shapeNames = { rectangle: '矩形', ellipse: '椭圆', triangle: '三角形', star: '星形' };
  const shapeIcons = { rectangle: Square, ellipse: Circle, triangle: Triangle, star: Star };
  const currentShape = shapeKinds.includes(tool as ShapeKind) ? tool as ShapeKind : lastShape, ShapeIcon = shapeIcons[currentShape];
  const selectShape = (shape: ShapeKind) => { setLastShape(shape); onTool(shape); setShapes(undefined); shapes?.focus(); };
  const [menu, setMenu] = useState<HTMLElement>();
  const choose = (action: () => void) => { action(); setMenu(undefined); menu?.focus(); };
  return <div className="comp-toolbar" role="toolbar" aria-label="Canvas tools" onPointerDown={event => event.stopPropagation()}>
    <button aria-label="Select tool" aria-pressed={tool === 'select' && !space} data-tooltip="Select  V" onClick={() => onTool('select')}><MousePointer2 /></button>
    <button aria-label="Pan tool" aria-pressed={tool === 'hand' || space} data-tooltip="Pan  H / Space" onClick={() => onTool('hand')}><Hand /></button>
    <button aria-label="Text tool" aria-pressed={tool === 'text' && !space} data-tooltip="Text  T" disabled={disabled} onClick={() => onTool('text')}><Type /></button>
    <button aria-label="Pen tool" aria-pressed={tool === 'pen' && !space} data-tooltip="Pen  P" disabled={disabled} onClick={() => onTool('pen')}><PenTool /></button>
    <button aria-label={`添加${shapeNames[currentShape]}`} aria-pressed={tool === currentShape && !space} data-tooltip={`${shapeNames[currentShape]}${currentShape === 'rectangle' ? '  R' : currentShape === 'ellipse' ? '  O' : ''}`} disabled={disabled} onClick={() => selectShape(currentShape)}><ShapeIcon /></button>
    <button className="comp-shapes-menu" aria-label="形状菜单" aria-haspopup="menu" aria-expanded={Boolean(shapes)} disabled={disabled} onClick={event => { setMenu(undefined); setShapes(shapes ? undefined : event.currentTarget); }}><ChevronDown /></button>
    {shapes && <EditorPopover anchor={shapes} side="top" label="形状" onClose={() => setShapes(undefined)}>
      {shapeKinds.map(shape => { const Icon = shapeIcons[shape]; return <button key={shape} role="menuitem" onClick={() => selectShape(shape)}><Icon /><span>{shapeNames[shape]}</span>{['rectangle', 'ellipse'].includes(shape) && <kbd>{shape === 'rectangle' ? 'R' : 'O'}</kbd>}</button>; })}
    </EditorPopover>}
    <span className="comp-divider" />
    <button aria-label="Undo" data-tooltip="Undo  ⌘ / Ctrl Z" disabled={!canUndo} onClick={onUndo}><Undo2 /></button>
    <button aria-label="Redo" data-tooltip="Redo  ⌘ / Ctrl ⇧ Z" disabled={!canRedo} onClick={onRedo}><Redo2 /></button>
    <span className="comp-divider" />
    <button className="comp-zoom" aria-label="缩放菜单" aria-haspopup="menu" aria-expanded={Boolean(menu)} onClick={event => setMenu(menu ? undefined : event.currentTarget)}>{Math.round(zoom * 100)}%<ChevronDown /></button>
    {menu && <EditorPopover anchor={menu} side="top" label="缩放菜单" onClose={() => setMenu(undefined)}>
      <button role="menuitem" onClick={() => choose(() => onZoom(zoom * 1.25))}><Plus /><span>放大</span><kbd>+</kbd></button>
      <button role="menuitem" onClick={() => choose(() => onZoom(zoom / 1.25))}><Minus /><span>缩小</span><kbd>−</kbd></button>
      <div role="separator" />
      <button role="menuitem" onClick={() => choose(() => onZoom(1))}><span>缩放至 100%</span><kbd>⌘0</kbd></button>
      <button role="menuitem" onClick={() => choose(onFit)}><Maximize /><span>适应画布</span><kbd>⇧1</kbd></button>
    </EditorPopover>}
  </div>;
}
