import { createRoot } from 'react-dom/client';
import { useCallback, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { CompositorEditor } from '../src/nodes/compositor/CompositorEditor';
import { createLayer, defaultCompositorDocument, type CompositorDocument } from '../src/nodes/compositor';
import { defaultText } from '../src/nodes/compositorGraphics';
import type { AppNode, CompositorNode } from '../src/nodes/types';

// Runs in the existing real-browser check page, without touching the workflow.
// Synthetic keydowns test cancellation; trusted Enter activation is also checked
// manually in the interaction fixture with the browser's keyboard input.
export async function compositorKeyboardChecks(record: (message: string) => void) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), doc = defaultCompositorDocument();
  doc.layers.push(createLayer('keyboard-text', 'Keyboard Text', defaultText()));
  const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const find = (selector: string) => {
    const element = host.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing keyboard target: ${selector}`);
    return element;
  };
  const enter = (target: HTMLElement, options: KeyboardEventInit = {}) => {
    target.focus();
    const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
  try {
    root.render(<ReactFlowProvider><CompositorEditor id="keyboard-qa" name="Keyboard QA" document={doc} inputs={{}} locked={false} error="" pending={false} previewing={false}
      onChange={() => {}} onDraft={() => {}} onClose={() => {}} /></ReactFlowProvider>);
    await settle();
    for (const label of ['Close compositor', 'Layers', 'Assets', 'Select tool', 'Pen tool', 'Shapes menu', 'Zoom menu', 'Select Keyboard Text']) {
      assert(!enter(find(`[aria-label="${label}"]`)), `Enter canceled on ${label}`);
    }
    record('Enter preserves native activation on navigation, layer and toolbar buttons');
    for (const label of ['Shapes menu', 'Zoom menu']) {
      find(`button[aria-label="${label}"]`).click(); await settle();
      assert(!enter(find('[role="menuitem"]')), `Enter canceled in ${label}`);
      find('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
    }
    record('Enter preserves native activation in portaled Shapes and Zoom menus');
    assert(!enter(find('input[aria-label="Canvas width"]')), 'Enter canceled in a numeric input');
    find('[aria-label="Select Keyboard Text"]').click(); await settle();
    const editor = find('[data-compositor-editor]');
    assert(!enter(editor, { isComposing: true }), 'IME Enter consumed as a canvas shortcut');
    assert(!host.querySelector('textarea[aria-label="Edit text layer"]'), 'IME Enter opened text editing');
    assert(enter(editor), 'Canvas Enter did not invoke edit content'); await settle();
    const textarea = find('textarea[aria-label="Edit text layer"]');
    assert(!enter(textarea), 'Text newline canceled');
    assert(enter(textarea, { metaKey: true }), 'Text commit shortcut lost'); await settle();
    assert(!host.querySelector('textarea[aria-label="Edit text layer"]'), 'Text commit did not exit editing');
    record('Canvas Enter still edits text, textarea keeps newlines and commit, IME is untouched');
  } finally { root.unmount(); host.remove(); }
}

export async function compositorPenCommitChecks(record: (message: string) => void) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), initial = defaultCompositorDocument();
  let committed = initial, commits = 0;
  const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
  const find = (selector: string) => {
    const element = host.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing pen target: ${selector}`);
    return element;
  };
  function Harness() {
    const [nodes, setNodes] = useState<AppNode[]>([{ id: 'pen-qa', type: 'compositor', position: { x: 0, y: 0 }, data: { document: initial } }]);
    const [draft, setDraft] = useState<CompositorDocument>(), [open, setOpen] = useState(true);
    const restore = useCallback((value: { nodes: AppNode[] }) => { setDraft(undefined); setNodes(value.nodes); }, []);
    const history = useCanvasHistory(nodes, [], restore);
    committed = (nodes[0] as CompositorNode).data.document;
    return <CanvasHistoryContext.Provider value={history}>{open
      ? <CompositorEditor id="pen-qa" name="Pen QA" document={draft ?? committed} inputs={{}} locked={false} error="" pending={false} previewing={Boolean(draft)}
        onChange={document => { commits++; setDraft(undefined); setNodes(current => current.map(node => ({ ...node, data: { ...node.data, document } }))); }} onDraft={setDraft} onClose={() => setOpen(false)} />
      : <button onClick={() => setOpen(true)}>Reopen pen QA</button>}
    </CanvasHistoryContext.Provider>;
  }
  const activate = async (label: string, key = 'Enter') => {
    const target = find(`[aria-label="${label}"]`); target.focus();
    const event = new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    assert(!event.defaultPrevented, `${label} activation was canceled`);
    assert(target.isConnected, `${label} target was replaced before activation`);
    // Synthetic keydowns have no native click default action. Exercise the same
    // click handler after the capture phase; trusted keys are checked in the UI.
    target.click(); await settle();
  };
  const draw = async (count: number) => {
    await activate('Pen tool');
    const board = find('.comp-artboard'), workspace = find('.comp-workspace'), rect = board.getBoundingClientRect();
    // Synthetic pointers cannot acquire browser pointer capture. This local
    // fixture substitute affects only routing, not editor/document/history code.
    Object.defineProperty(workspace, 'setPointerCapture', { configurable: true, value: () => {} });
    for (let index = 0; index < count; index++) {
      board.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1, clientX: rect.left + 50 + index * 50, clientY: rect.top + 50 + index * 30 }));
      workspace.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0 }));
      await settle();
    }
    assert(host.querySelectorAll('.comp-pen-preview rect').length === count, 'Pen anchors were not created');
  };
  try {
    root.render(<ReactFlowProvider><Harness /></ReactFlowProvider>); await settle();
    await draw(2);
    assert(committed.layers.length === 2 && commits === 0, 'Unfinished path entered history');
    await activate('Hide Background');
    assert(committed.layers.length === 3 && !committed.layers[0].visible, 'Keyboard hide lost the path or visibility');
    assert(commits === 2 && !host.querySelector('.comp-pen-preview'), 'Path and hide must commit separately and clear the pen draft');
    const hidden = JSON.stringify(committed);
    await activate('Close compositor');
    assert(JSON.stringify(committed) === hidden && commits === 2, 'Close overwrote hidden state or added a redundant history step');
    find('button').click(); await settle();
    await activate('Undo');
    assert(committed.layers.length === 3 && committed.layers[0].visible, 'First undo should only undo hiding');
    await activate('Undo');
    assert(JSON.stringify(committed) === JSON.stringify(initial), 'Second undo should only remove the path');
    await activate('Redo');
    assert(committed.layers.length === 3 && committed.layers[0].visible, 'First redo should restore the same path');
    await activate('Redo');
    assert(JSON.stringify(committed) === hidden && commits === 2, 'Second redo did not restore exact hidden document');
    record('Pending pen + Enter hide/close preserves edits and two exact undo/redo steps');

    await activate('Undo'); await activate('Undo');
    await draw(2);
    await activate('Undo');
    assert(host.querySelectorAll('.comp-pen-preview rect').length === 1 && commits === 2, 'Toolbar Undo must still remove an unfinished anchor');
    await activate('Undo');
    assert(!host.querySelector('.comp-pen-preview') && JSON.stringify(committed) === JSON.stringify(initial), 'Empty pen cancellation changed the document');
    record('Toolbar Enter Undo still removes pending anchors without committing a path');

    await draw(1); await activate('Hide Background'); await activate('Close compositor');
    assert(committed.layers.length === 2 && !committed.layers[0].visible && commits === 3, 'A single anchor must be discarded without overwriting hide');
    find('button').click(); await settle(); await activate('Undo');
    assert(JSON.stringify(committed) === JSON.stringify(initial), 'Single-anchor hide should have one undo step');
    await draw(2); await activate('Hide Background', ' '); await activate('Close compositor');
    assert(committed.layers.length === 3 && !committed.layers[0].visible && commits === 5, 'Space activation bypassed the pen commit boundary');
    record('Single-anchor cancellation and Space activation retain visibility and history boundaries');
  } finally { root.unmount(); host.remove(); }
}
