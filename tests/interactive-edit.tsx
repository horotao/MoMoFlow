import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { MotionConfig } from 'motion/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { defaultSeedreamSettings } from '../src/nodes/seedream';
import sampleUrl from './fixtures/image-node-1.png';
import '../src/index.css';

const storage = new WorkflowStorage('momoflow-interactive-edit-demo');
const zoom = Math.min(1, (window.innerWidth - 140) / 1734, (window.innerHeight - 100) / 460);
const initial: Workflow = {
  colorMode: 'dark',
  viewport: { x: (window.innerWidth - 1734 * zoom) / 2, y: (window.innerHeight - 460 * zoom) / 2, zoom },
  nodes: [
    { id: 'source', type: 'file', position: { x: 0, y: 0 }, data: { label: '参考图片', assets: [
      { id: 'sample', name: '示例图片.png', url: sampleUrl, kind: 'image', width: 1536, height: 1152 },
    ] } },
    { id: 'prompt', type: 'text', position: { x: 610, y: 0 }, data: { text: '编辑标注处。' } },
    { id: 'model', type: 'seedream', position: { x: 1280, y: 0 }, data: { ...defaultSeedreamSettings, imageInputs: 1 } },
  ],
  edges: [
    { id: 'input-image', source: 'source', sourceHandle: 'file', target: 'model', targetHandle: 'image-0' },
    { id: 'input-prompt', source: 'prompt', target: 'model', targetHandle: 'prompt' },
  ],
};

const root = createRoot(document.getElementById('root')!);
void storage.load().then(saved => {
  root.render(<StrictMode><MotionConfig reducedMotion="user"><ReactFlowProvider><ModelTasksProvider>
    <Flow storage={storage} saved={saved ?? initial} />
  </ModelTasksProvider></ReactFlowProvider></MotionConfig></StrictMode>);
}, (cause: unknown) => {
  root.render(<p role="alert">{cause instanceof Error ? cause.message : '无法打开交互编辑验收页。'}</p>);
});
