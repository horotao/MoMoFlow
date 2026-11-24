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
  const openContextMenu = () => {
    const options = { view: window, button: 2, bubbles: true, cancelable: true, clientX: 340, clientY: 240 };
    pane.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 2 }));
    pane.dispatchEvent(new MouseEvent('mouseup', options));
  };
  for (const [type, open] of [['image', () => dock.click()], ['text', openContextMenu], ['video', () => dock.click()], ['audio', openContextMenu]] as const) {
    open();
    const menu = await element('#canvas-node-menu');
    const rows = menu.querySelectorAll<HTMLElement>('[data-type]');
    if (Array.from(rows, row => row.dataset.type).join(',') !== 'image,text,video,audio') {
      throw new Error('Expected the Image, Text, Video and Audio menu entries');
    }
    menu.querySelector<HTMLButtonElement>(`[data-type="${type}"] [role=menuitem]`)!.click();
    await element(`.react-flow__node-${type === 'image' ? 'sunburst' : type}`);
    await new Promise(requestAnimationFrame);
  }
  if (document.querySelectorAll('.react-flow__node').length !== 4) throw new Error('Node creation failed');
  result.dataset.result = 'passed';
  result.textContent = 'PASS · 左侧和右键入口均包含 四个选项，均可创建对应节点';
}
void run().catch(error => { result.dataset.result = 'failed'; result.textContent = String(error); });
