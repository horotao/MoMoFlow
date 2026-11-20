import { Background, Controls, ReactFlow, type NodeProps } from '@xyflow/react';
import { createRoot } from 'react-dom/client';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { ImageGenerationNode } from '../src/nodes/SunburstNode';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import type { SunburstNode } from '../src/nodes/types';
import landscape from './fixtures/image-node-1.png';
import square from './fixtures/image-node-2.png';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import './result-interactive-edit.css';

function ResultPreview(props: NodeProps<SunburstNode>) {
  return <ImageGenerationNode {...props} name="GPT Image 2.6" icon={null} maxImages={16} />;
}

const nodeTypes = { sunburst: ResultPreview };
const nodes: SunburstNode[] = [{
  id: 'result', type: 'sunburst', position: { x: 0, y: 0 },
  data: { ...defaultSunburstSettings, imageInputs: 1, activeResultId: 'landscape', results: [
    { id: 'landscape', kind: 'image', name: '横幅.png', url: landscape, width: 1536, height: 1152 },
    { id: 'square', kind: 'image', name: '方图.png', url: square, width: 1024, height: 1024 },
  ] },
}];

export function ResultEditStudy() {
  return <main className="result-edit-study">
    <h1>生成结果 · 交互编辑</h1>
    <p>把鼠标移到图片上，再悬停在「排序方式」左侧的图标上。</p>
    <div className="result-edit-stage">
      <ModelTasksProvider>
        <ReactFlow defaultNodes={nodes} nodeTypes={nodeTypes} colorMode="dark" fitView fitViewOptions={{ maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}>
          <Background gap={20} size={1} color="#373737" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ModelTasksProvider>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<ResultEditStudy />);
