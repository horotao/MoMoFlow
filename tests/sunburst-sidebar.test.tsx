import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { MotionConfig } from 'motion/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import type { AppNode, SunburstNode } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

function Probe() {
  const api = useReactFlow<AppNode>();
  Object.assign(window, { sunburstSidebarQA: {
    api,
    reset: () => {
      api.setNodes([
        { id: 'prompt', type: 'text', position: { x: 60, y: 80 }, data: { text: 'A quiet mountain landscape' } },
        { ...createLibraryNode('sunburst', { x: 650, y: 80 }) as SunburstNode, id: 'image', selected: true },
      ]);
      api.setEdges([{ id: 'prompt-image', source: 'prompt', target: 'image', targetHandle: 'prompt' }]);
    },
  } });
  return null;
}
const fetchLocal = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('/api/') || /^https?:/.test(url)) throw new Error('Model/network requests are disabled in sidebar acceptance');
  return fetchLocal(input, init);
};
const storage = new WorkflowStorage(`momoflow-sunburst-sidebar-qa-${crypto.randomUUID()}`);
await storage.load();
const generator = createLibraryNode('sunburst', { x: 650, y: 80 }) as SunburstNode;
const workflow: Workflow = {
  nodes: [
    { id: 'prompt', type: 'text', position: { x: 60, y: 80 }, data: { text: 'A quiet mountain landscape' } },
    { ...generator, id: 'image', selected: true },
  ],
  edges: [{ id: 'prompt-image', source: 'prompt', target: 'image', targetHandle: 'prompt' }],
  colorMode: 'dark', viewport: { x: 0, y: 140, zoom: .7 },
};
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ModelTasksProvider><ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider></ModelTasksProvider></MotionConfig>);
