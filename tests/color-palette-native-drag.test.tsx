import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, useNodesState, type Edge } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { DescriberPanel } from '../src/components/DescriberPanel';
import { ColorPaletteNode } from '../src/nodes/ColorPaletteNode';
import type { AppNode, ColorPaletteNode as PaletteNode } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/ColorPaletteNode.css';

// Run through Vite and use real browser mouse input. dispatchEvent cannot pass:
// the probe requires isTrusted, and delegates to the actual native API. The
// broken control deliberately submits the old detached canvas to that same API.
// OS drag overlays are NOT included in page screenshots: compare OS/window
// captures for the broken control and fixed mode before claiming visual success.
const originalSetDragImage = DataTransfer.prototype.setDragImage;
let trustedDrag = false;
let calls = 0;
let mode = 'fixed';
function report(message: string, result: string) {
  const output = document.getElementById('native-result');
  if (output) { output.textContent = message; output.dataset.result = result; }
}
document.addEventListener('dragstart', event => {
  trustedDrag = event.isTrusted;
  calls = 0;
  report(trustedDrag ? 'Trusted drag started; awaiting native preview call' : 'FAIL: synthetic drag is not native evidence', 'pending');
}, true);
DataTransfer.prototype.setDragImage = function (image, x, y) {
  let actual = image;
  if (mode === 'broken') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    actual = canvas;
  }
  originalSetDragImage.call(this, actual, x, y);
  calls++;
  const loaded = actual instanceof HTMLImageElement && actual.complete && actual.naturalWidth === 1 && actual.naturalHeight === 1;
  let transparent = false;
  if (loaded && actual instanceof HTMLImageElement) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(actual, 0, 0);
    transparent = context.getImageData(0, 0, 1, 1).data[3] === 0;
  }
  const valid = trustedDrag && loaded && transparent && x === 0 && y === 0;
  report(`${valid ? 'PASS' : 'FAIL'} native preview contract: trusted=${trustedDrag}, loaded image=${loaded}, transparent=${transparent}, native calls=${calls}. OS overlay still requires visual inspection.`, valid ? 'passed' : 'failed');
};
document.addEventListener('dragend', event => {
  const end = document.getElementById('drag-end');
  if (end) end.textContent = `dragend: trusted=${event.isTrusted}, dropEffect=${event.dataTransfer?.dropEffect}`;
}, true);
document.addEventListener('keydown', event => {
  const output = document.getElementById('last-key');
  if (output) output.textContent = `keydown: ${event.key}, trusted=${event.isTrusted}, target=${(event.target as Element).tagName}`;
}, true);
const initial = ['#FFFFFF', '#FF0000', '#FF00F2', '#FFB300', '#000000'];
const edges: Edge[] = [];
const nodeTypes = { 'color-palette': ColorPaletteNode };
function Canvas({ zoom }: { zoom: number }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([
    { id: 'native-palette', type: 'color-palette', selected: true, position: { x: 30, y: 30 }, data: { colors: initial.map((hex, i) => ({ id: `color-${i}`, hex })) } },
  ]);
  const restore = useCallback((snapshot: { nodes: AppNode[] }) => setNodes(snapshot.nodes), [setNodes]);
  const history = useCanvasHistory(nodes, edges, restore);
  const order = (nodes[0] as PaletteNode).data.colors.map(c => c.hex).join(',');
  return <CanvasHistoryContext.Provider value={history}>
    <div style={{ padding: '8px 16px', display: 'flex', gap: 12 }}>
      <button data-test="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
      <button data-test="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
      <output data-test="order">{order}</output>
    </div>
    <div style={{ height: 740 }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
        defaultViewport={{ x: 20, y: 0, zoom }} onKeyDown={event => {
          if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') || event.nativeEvent.isComposing) return;
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo();
          }
        }}>
        <DescriberPanel />
      </ReactFlow>
    </div>
  </CanvasHistoryContext.Provider>;
}
function Harness() {
  const [zoom, setZoom] = useState(.53);
  const [revision, setRevision] = useState(0);
  return <>
    <header style={{ padding: 16, background: '#292929', font: '13px/1.5 monospace' }}>
      <strong>Color palette — native drag regression (isolated workflow)</strong>
      <div style={{ display: 'flex', gap: 16, margin: '8px 0' }}>
        <label>Preview <select aria-label="Preview mode" defaultValue="fixed" onChange={event => { mode = event.target.value; report('Ready for real mouse drag', 'pending'); }}>
          <option value="fixed">Fixed image</option><option value="broken">Broken canvas control</option>
        </select></label>
        <label>Zoom <select aria-label="Test zoom" value={zoom} onChange={event => { setZoom(Number(event.target.value)); setRevision(v => v + 1); }}>
          <option value={.53}>53%</option><option value={1}>100%</option><option value={1.5}>150%</option>
        </select></label>
        <button onClick={() => setRevision(v => v + 1)}>Reset workflow</button>
      </div>
      <div id="native-result" role="status" data-result="pending">Ready for real mouse drag</div>
      <div id="drag-end">No drag completed</div>
      <div id="last-key">No key received</div>
    </header>
    <ReactFlowProvider key={revision}><Canvas zoom={zoom} /></ReactFlowProvider>
  </>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
