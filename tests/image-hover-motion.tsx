import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Background, ReactFlow, type Edge } from '@xyflow/react';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { BlurNode } from '../src/nodes/BlurNode';
import { ColorCorrectionNode } from '../src/nodes/ColorCorrectionNode';
import { FileNode } from '../src/nodes/FileNode';
import { IdeogramNode } from '../src/nodes/IdeogramNode';
import { ImageIteratorNode } from '../src/nodes/ImageIteratorNode';
import { InvertNode } from '../src/nodes/InvertNode';
import { LevelsNode } from '../src/nodes/LevelsNode';
import { MatteGrowShrinkNode } from '../src/nodes/MatteGrowShrinkNode';
import { NanoBananaNode } from '../src/nodes/NanoBananaNode';
import { PreviewNode } from '../src/nodes/PreviewNode';
import { ResizeNode } from '../src/nodes/ResizeNode';
import { RotateFlipNode } from '../src/nodes/RotateFlipNode';
import { SeedreamNode } from '../src/nodes/SeedreamNode';
import { SunburstNode } from '../src/nodes/SunburstNode';
import { CompositorNode } from '../src/nodes/compositor/CompositorNode';
import { defaultBlurSettings } from '../src/nodes/blur';
import { defaultColorSettings } from '../src/nodes/colorCorrection';
import { defaultCompositorDocument } from '../src/nodes/compositor';
import { defaultIdeogramSettings } from '../src/nodes/ideogram';
import { defaultLevelsSettings } from '../src/nodes/levels';
import { defaultMatteGrowShrinkSettings } from '../src/nodes/matteGrowShrink';
import { defaultNanoBananaSettings } from '../src/nodes/nanoBanana';
import { defaultResizeSettings } from '../src/nodes/resize';
import { defaultRotateFlipSettings } from '../src/nodes/rotateFlip';
import { defaultSeedreamSettings } from '../src/nodes/seedream';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import type { AppNode, FileAsset } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/LevelsNode.css';
import './image-hover-motion.css';

const assets: FileAsset[] = [
  { id: 'landscape', name: '横幅.png', kind: 'image', url: '/tests/fixtures/image-node-1.png', width: 1536, height: 1152 },
  { id: 'square', name: '方图.png', kind: 'image', url: '/tests/fixtures/image-node-2.png', width: 1024, height: 1024 },
];
const collection = { assets, activeAssetId: assets[0].id };
const results = { results: assets, activeResultId: assets[0].id, imageInputs: 1 };
const baseImage = assets[0];
const sample = { id: 'sample', position: { x: 0, y: 0 } };
type Scenario = { label: string; node: AppNode; targetHandle?: string };
const scenarios: Scenario[] = [
  { label: '导入 · 单图', node: { ...sample, type: 'file', data: { ...collection, viewMode: 'single' } } },
  { label: '导入 · 画廊', node: { ...sample, type: 'file', data: { ...collection, viewMode: 'all' } } },
  { label: 'GPT Image 2.6', node: { ...sample, type: 'sunburst', data: { ...defaultSunburstSettings, ...results } } },
  { label: 'Nano Banana', node: { ...sample, type: 'nano-banana', data: { ...defaultNanoBananaSettings, ...results } } },
  { label: 'Seedream 5.5', node: { ...sample, type: 'seedream', data: { ...defaultSeedreamSettings, ...results } } },
  { label: 'Ideogram 4.5', node: { ...sample, type: 'ideogram', data: { ...defaultIdeogramSettings, ...results } } },
  { label: '图片迭代', node: { ...sample, type: 'image-iterator', data: { ...collection, viewMode: 'single' } } },
  { label: '预览', node: { ...sample, type: 'preview', data: {} }, targetHandle: 'file' },
  { label: '反相', node: { ...sample, type: 'invert', data: { baseImage } } },
  { label: '模糊', node: { ...sample, type: 'blur', data: { baseImage, settings: defaultBlurSettings } } },
  { label: '色彩校正', node: { ...sample, type: 'color-correction', data: { baseImage, settings: defaultColorSettings } } },
  { label: '色阶', node: { ...sample, type: 'levels', data: { baseImage, channel: 'RGB', settings: defaultLevelsSettings } } },
  { label: '蒙版扩张 / 收缩', node: { ...sample, type: 'matte-grow-shrink', data: { baseImage, settings: defaultMatteGrowShrinkSettings } } },
  { label: '调整尺寸', node: { ...sample, type: 'resize', data: { baseImage, settings: defaultResizeSettings } } },
  { label: '旋转与翻转', node: { ...sample, type: 'rotate-flip', data: { baseImage, settings: defaultRotateFlipSettings } } },
  { label: '合成器', node: { ...sample, type: 'compositor', data: { document: defaultCompositorDocument() } }, targetHandle: 'background' },
  { label: '导入 · 空状态', node: { ...sample, type: 'file', data: {} } },
];
const nodeTypes = {
  file: FileNode, 'image-iterator': ImageIteratorNode, preview: PreviewNode, 'nano-banana': NanoBananaNode,
  sunburst: SunburstNode, ideogram: IdeogramNode, seedream: SeedreamNode, compositor: CompositorNode,
  invert: InvertNode, blur: BlurNode, 'color-correction': ColorCorrectionNode, levels: LevelsNode,
  'matte-grow-shrink': MatteGrowShrinkNode, resize: ResizeNode, 'rotate-flip': RotateFlipNode,
};

function StudyPanel({ id, scenario, zoomLimit }: { id: 'fast' | 'canvas'; scenario: Scenario; zoomLimit: number }) {
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [nodeHeight, setNodeHeight] = useState(0);
  const [graph] = useState(() => {
    const nodes: AppNode[] = [{ ...scenario.node, id: `${id}-sample` }];
    const edges: Edge[] = [];
    if (scenario.targetHandle) {
      nodes.push({ id: `${id}-source`, type: 'file', data: collection, hidden: true, position: { x: -600, y: 0 } });
      edges.push({ id: `${id}-edge`, source: `${id}-source`, sourceHandle: 'file', target: `${id}-sample`, targetHandle: scenario.targetHandle, hidden: true });
    }
    return { nodes, edges };
  });

  useEffect(() => {
    const element = stage.current!;
    const resize = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);

  const zoom = width ? Math.min(zoomLimit, (width - 56) / 456) : zoomLimit;
  return <section className={`hover-motion-panel hover-motion-${id}`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{id === 'fast' ? '快速试验版' : '正式画布节奏'}</h2>
    <div ref={stage} className="hover-motion-stage" style={{ height: 28 + Math.max(550, nodeHeight) * zoom }}>
      {width > 0 && <ModelTasksProvider>
        <ReactFlow<AppNode> defaultNodes={graph.nodes} defaultEdges={graph.edges} nodeTypes={nodeTypes} colorMode="dark"
          onNodesChange={changes => {
            const measurement = changes.find(change => change.type === 'dimensions' && change.id === `${id}-sample`);
            if (measurement?.type === 'dimensions' && measurement.dimensions) setNodeHeight(measurement.dimensions.height);
          }}
          viewport={{ x: (width - 456 * zoom) / 2, y: 14, zoom }} minZoom={0.3}
          nodesDraggable={false} nodesConnectable={false}
          panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
          proOptions={{ hideAttribution: true }}>
          <Background gap={16} size={1} color="#3b3b3b" />
        </ReactFlow>
      </ModelTasksProvider>}
    </div>
  </section>;
}

export function Study() {
  const [index, setIndex] = useState(0);
  const [zoomLimit, setZoomLimit] = useState(0.85);
  const scenario = scenarios[index];

  return <main className="hover-motion-study">
    <header className="hover-motion-header">
      <h1>图片悬停动效</h1>
      <p>在两张图之间划过，对比快速试验版和正式画布使用的 4 倍时长。</p>
      <div className="hover-motion-controls">
        <label>节点 <select value={index} onChange={event => setIndex(Number(event.target.value))}>
          {scenarios.map((item, value) => <option key={item.label} value={value}>{item.label}</option>)}
        </select></label>
        <label>最大缩放 <select value={zoomLimit} onChange={event => setZoomLimit(Number(event.target.value))}>
          <option value={0.6}>60%</option><option value={0.85}>85%</option><option value={1}>100%</option>
        </select></label>
      </div>
    </header>
    <div className="hover-motion-comparison">
      <StudyPanel key={`fast-${index}`} id="fast" scenario={scenario} zoomLimit={zoomLimit} />
      <StudyPanel key={`canvas-${index}`} id="canvas" scenario={scenario} zoomLimit={zoomLimit} />
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Study />);
