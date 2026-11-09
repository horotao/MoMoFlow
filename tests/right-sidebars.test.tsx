import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useReactFlow } from '@xyflow/react';
import { MotionConfig } from 'motion/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import type { AppNode } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/ColorPaletteNode.css';
import '../src/nodes/PainterNode.css';

const kinds = ['sunburst', 'nano-banana', 'ideogram', 'image-describer', 'model-input', 'color-palette'] as const;
const labels = ['GPT Image 2.5', 'Nano Banana', 'Ideogram', '图像描述', '模型选项', '调色板'];
function Probe() {
  const api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>();
  const select = (kind: typeof kinds[number]) => {
    api.setNodes(all => all.map(node => ({ ...node, selected: node.id === kind })));
    void api.setCenter(850, 370, { zoom: .7 });
  };
  Object.assign(window, { rightSidebarQA: { api, select } });
  return <div className="sidebar-qa-toolbar">{kinds.map((kind, index) => <button key={kind} aria-pressed={Boolean(nodes.find(node => node.id === kind)?.selected)} onClick={() => select(kind)}>{labels[index]}</button>)}</div>;
}
const fetchLocal = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('/api/') || /^https?:/.test(url)) throw new Error('Model/network requests are disabled in sidebar acceptance');
  return fetchLocal(input, init);
};
const nodes: AppNode[] = kinds.map(kind => {
  const node = createLibraryNode(kind, { x: 650, y: 80 });
  if (!node) throw new Error(`Missing library node: ${kind}`);
  return { ...node, id: kind, selected: kind === 'sunburst' };
});
nodes.push({ id: 'prompt', type: 'text', position: { x: 60, y: 80 }, data: { text: 'A quiet mountain landscape' } });
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#7760b7"/></svg>');
nodes.push({ id: 'source', type: 'file', position: { x: 60, y: 620 }, data: { assets: [{ id: 'reference', kind: 'image', name: 'reference.svg', url: image, width: 512, height: 512 }] } });
const workflow: Workflow = {
  nodes, edges: kinds.filter(kind => kind !== 'model-input' && kind !== 'color-palette').map(kind => ({ id: `prompt-${kind}`, source: 'prompt', target: kind, targetHandle: 'prompt' })),
  colorMode: 'dark', viewport: { x: 0, y: 140, zoom: .7 },
};
const storage = new WorkflowStorage(`momoflow-right-sidebars-qa-${crypto.randomUUID()}`);
await storage.load();
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ModelTasksProvider><ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider></ModelTasksProvider></MotionConfig>);
