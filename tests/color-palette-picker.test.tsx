import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, useNodesState, type Edge } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { DescriberPanel } from '../src/components/DescriberPanel';
import { ColorPaletteNode } from '../src/nodes/ColorPaletteNode';
import type { AppNode, ColorPaletteNode as PaletteNode } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/ColorPaletteNode.css';

// Real React components, portals, React Flow updates and canvas history. This
// fixture owns its state and does not read or write the user's saved workflow.
const initial = '#AB12CD';
const edges: Edge[] = [];
const nodeTypes = { 'color-palette': ColorPaletteNode };
let committed = initial, revision = 0;
function Harness({ zoom = 1, multiple = false }: { zoom?: number; multiple?: boolean }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([
    { id: 'palette-qa', type: 'color-palette', selected: true, position: { x: 80, y: 80 }, data: { colors: [{ id: 'one', hex: initial }, ...(multiple ? [{ id: 'two', hex: '#FFFFFF' }, { id: 'three', hex: '#000000' }] : [])] } },
  ]);
  const restore = useCallback((snapshot: { nodes: AppNode[] }) => setNodes(snapshot.nodes), [setNodes]);
  const history = useCanvasHistory(nodes, edges, restore);
  committed = (nodes[0] as PaletteNode).data.colors[0].hex;
  return <CanvasHistoryContext.Provider value={history}>
    <button data-test="outside">Outside picker</button>
    <button data-test="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
    <button data-test="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} defaultViewport={{ x: 0, y: 0, zoom }}>
      <DescriberPanel />
    </ReactFlow>
  </CanvasHistoryContext.Provider>;
}
const host = document.getElementById('root')!;
const root = createRoot(host);
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }
function key(target: HTMLElement, value: string, options: KeyboardEventInit = {}) {
  const init = { key: value, bubbles: true, cancelable: true, ...options };
  const event = new KeyboardEvent('keydown', init);
  target.dispatchEvent(event);
  target.dispatchEvent(new KeyboardEvent('keyup', init));
  return event;
}
async function reset(zoom = 1, multiple = false) {
  root.render(<ReactFlowProvider key={++revision}><Harness zoom={zoom} multiple={multiple} /></ReactFlowProvider>);
  // React Flow publishes controlled nodes to its store in an effect, after the
  // React tree mounts. Wait for that publication before exercising the sidebar.
  for (let frame = 0; frame < 60; frame++) {
    await settle();
    if (document.querySelector('.palette-settings .palette-swatch') && committed === initial) break;
  }
  assert(committed === initial, 'Fixture did not reset');
}
async function open(inline = false) {
  find(inline ? '.palette-canvas .palette-edit-color' : '.palette-settings .palette-swatch').click();
  await settle();
}
async function input(value: string) {
  const element = find<HTMLInputElement>('[aria-label="Hex color"]'); element.focus();
  // Use the native setter so React receives a genuine value change through its
  // input handler. Browser-trusted typing is verified separately in the UI.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}
async function outside() {
  find('[data-test="outside"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  await settle();
  assert(!document.querySelector('.palette-picker'), 'Outside pointerdown did not dismiss');
}
async function travel(action: 'undo' | 'redo') {
  const button = find<HTMLButtonElement>(`[data-test="${action}"]`);
  assert(!button.disabled, `${action} unavailable`); button.click(); await settle();
}
async function oneUndo(expected: string) {
  await travel('undo'); assert(committed === initial, 'One undo did not restore original color');
  assert(find<HTMLButtonElement>('[data-test="undo"]').disabled, 'Duplicate history entry');
  await travel('redo'); assert(committed === expected, 'Redo did not restore exact color');
}
const results = document.getElementById('results')!;
const passed: string[] = [];
async function check(name: string, run: () => Promise<void>, zoom = 1, multiple = false) {
  await reset(zoom, multiple); await run(); passed.push(name); results.textContent = passed.map(value => `PASS ${value}`).join('\n');
}
async function run() {
  for (const inline of [false, true]) {
    await check(`${inline ? 'Node' : 'Sidebar'} outside dismissal saves HEX exactly once`, async () => {
      await open(inline); await input('123456'); await outside();
      assert(committed === '#123456', 'Outside dismissal discarded HEX'); await oneUndo('#123456');
    });
  }
  await check('Shorthand and lowercase HEX normalize on dismissal', async () => {
    await open(); await input('#abc'); await outside();
    assert(committed === '#AABBCC', 'HEX not normalized'); await oneUndo('#AABBCC');
  });
  await check('Invalid HEX and Escape discard drafts without history', async () => {
    await open(); await input('zzzzzz'); await outside();
    assert(committed === initial && find<HTMLButtonElement>('[data-test="undo"]').disabled, 'Invalid HEX committed');
    await open(); await input('123456'); key(find('[aria-label="Hex color"]'), 'Escape'); await settle();
    assert(committed === initial && !document.querySelector('.palette-picker'), 'Escape committed or left picker open');
    assert(find<HTMLButtonElement>('[data-test="undo"]').disabled, 'Escape added history');
  });
  await check('Internal blur then outside dismissal commits only once', async () => {
    await open(); await input('123456'); find('.palette-picker').focus(); await settle(); await outside();
    assert(committed === '#123456', 'Blur failed to commit'); await oneUndo('#123456');
  });
  for (const modifier of ['metaKey', 'ctrlKey'] as const) {
    await check(`${modifier} undo/redo works with dialog and range focus`, async () => {
      await open(); await input('123456'); key(find('[aria-label="Hex color"]'), 'Enter'); await settle();
      assert(committed === '#123456' && document.activeElement === find('.palette-picker'), 'Enter did not commit/focus dialog');
      for (const selector of ['.palette-picker', 'input[aria-label="Hue"]']) {
        const target = find(selector); target.focus();
        assert(key(target, 'z', { [modifier]: true }).defaultPrevented, 'Canvas undo not handled'); await settle();
        assert(committed === initial, 'Shortcut did not undo');
        assert(find<HTMLButtonElement>('[data-test="undo"]').disabled, 'Undo added a history entry');
        key(target, 'Z', { [modifier]: true, shiftKey: true }); await settle();
        assert(committed === '#123456', 'Shortcut did not redo');
        assert(find<HTMLInputElement>('[aria-label="Hex color"]').value === '123456', 'Picker not synchronized after history travel');
      }
    });
  }
  await check('Text undo and IME keep native behavior, not canvas history', async () => {
    await open(); await input('123456'); key(find('[aria-label="Hex color"]'), 'Enter'); await settle();
    await input('654321'); const field = find('[aria-label="Hex color"]');
    for (const metaKey of [true, false]) {
      assert(!key(field, 'z', { metaKey, ctrlKey: !metaKey }).defaultPrevented, 'Native text undo was canceled');
      assert(committed === '#123456', 'Text undo traveled canvas history');
    }
    key(field, 'Enter', { isComposing: true }); await settle();
    assert(document.activeElement === field && committed === '#123456', 'IME Enter committed draft');
  });
  await check('Sequential HEX edits retain separate history steps', async () => {
    await open(); await input('123456'); await outside();
    await open(); await input('654321'); await outside();
    await travel('undo'); assert(committed === '#123456', 'Consecutive edits were merged');
    await travel('undo'); assert(committed === initial, 'Second undo lost original');
    await travel('redo'); await travel('redo'); assert(committed === '#654321', 'Sequential redo failed');
  });
  for (const zoom of [0.53, 1, 1.5]) {
    await check(`Synthetic drag at ${zoom * 100}% supplies a loaded image and preserves cancellation/history/sidebar`, async () => {
      const source = find('.palette-canvas .palette-color-row');
      const list = find('.palette-canvas .palette-color-list');
      const transfer = new DataTransfer();
      let preview: Element | undefined;
      const nativeSetDragImage = transfer.setDragImage.bind(transfer);
      Object.defineProperty(transfer, 'setDragImage', { value: (image: Element, x: number, y: number) => {
        preview = image; nativeSetDragImage(image, x, y);
      } });
      const dispatch = (target: HTMLElement, type: string, point = { clientX: 0, clientY: 0 }) =>
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer, ...point }));
      const order = () => [...document.querySelectorAll('.palette-canvas .palette-hex-label')].map(el => el.textContent).join(',');
      const sidebar = () => [...document.querySelectorAll<HTMLInputElement>('.palette-settings input')].map(el => `#${el.value}`).join(',');
      const original = `${initial},#FFFFFF,#000000`, reordered = `#FFFFFF,#000000,${initial}`;
      dispatch(source, 'dragstart'); await settle();
      assert(preview instanceof HTMLImageElement && preview.complete && preview.naturalWidth === 1
        && preview.naturalHeight === 1, 'Preview is not a loaded intrinsic image');
      assert(!!document.querySelector('.palette-canvas.is-sorting'), 'In-place drag feedback missing');
      dispatch(list, 'dragleave'); dispatch(source, 'dragend'); await settle();
      assert(order() === original && !document.querySelector('.is-sorting, .palette-drop-line'), 'Canceled drag left changes or feedback');
      assert(find<HTMLButtonElement>('[data-test="undo"]').disabled, 'Canceled drag added history');
      dispatch(source, 'dragstart'); await settle();
      const rect = list.getBoundingClientRect(), point = { clientX: rect.left + 10, clientY: rect.bottom - 1 };
      dispatch(list, 'dragover', point); await settle();
      assert(!!document.querySelector('.palette-drop-line') && order() === original, 'Preview reordered data before drop');
      dispatch(list, 'drop', point); dispatch(source, 'dragend'); await settle();
      assert(order() === reordered && sidebar() === reordered, 'Drop did not synchronize node and sidebar');
      await travel('undo');
      assert(order() === original && sidebar() === original && find<HTMLButtonElement>('[data-test="undo"]').disabled, 'Drag did not undo in one step');
      await travel('redo'); assert(order() === reordered && sidebar() === reordered, 'Drag redo lost order');
      preview = undefined;
      const sidebarRow = find('.palette-settings .palette-color-row');
      dispatch(sidebarRow, 'dragstart'); await settle();
      assert(preview === undefined, 'Sidebar native preview changed');
      dispatch(sidebarRow, 'dragend'); await settle();
    }, zoom, true);
  }
  results.dataset.result = 'passed';
  results.textContent += `\n${passed.length} checks passed`;
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${error instanceof Error ? error.message : String(error)}`; });
