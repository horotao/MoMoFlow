import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { Flow } from '../src/App';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import '../src/index.css';

const result = document.querySelector<HTMLElement>('#results')!;
const storage = new WorkflowStorage('image-menu-test-' + crypto.randomUUID());
createRoot(document.querySelector('#root')!).render(<ReactFlowProvider><Flow storage={storage} saved={null} /></ReactFlowProvider>);

async function element(selector: string) {
  for (let i = 0; i < 180; i++) {
    const item = document.querySelector<HTMLElement>(selector);
    if (item) return item;
    await new Promise(requestAnimationFrame);
  }
  throw new Error('Missing ' + selector);
}

async function run() {
  const pane = await element('.react-flow__pane');
  const dock = await element('.canvas-sidebar-add');
  for (const open of [() => dock.click(), () => {
    const options = { view: window, button: 2, bubbles: true, cancelable: true, clientX: 340, clientY: 240 };
    pane.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 2 }));
    pane.dispatchEvent(new MouseEvent('mouseup', options));
  }]) {
    open();
    const menu = await element('#canvas-node-menu');
    const rows = menu.querySelectorAll<HTMLElement>('[data-type]');
    if (rows.length !== 1 || rows[0].dataset.type !== 'image') throw new Error('Unexpected menu entries');
    menu.querySelector<HTMLButtonElement>('[role=menuitem]')!.click();
    await element('.canvas-image-node');
    await new Promise(requestAnimationFrame);
  }
  if (document.querySelectorAll('.canvas-image-node').length !== 2) throw new Error('Image creation failed');
  result.dataset.result = 'passed';
  result.textContent = 'PASS · 左侧和右键入口均只创建 Image';
}
void run().catch(error => { result.dataset.result = 'failed'; result.textContent = String(error); });
