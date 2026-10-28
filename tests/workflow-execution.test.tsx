import { runBoundaryChecks } from './workflow-boundaries.test';
import { defaultBlendSettings } from '../src/nodes/blend';
import { defaultLevelsSettings } from '../src/nodes/levels';
import { defaultColorSettings } from '../src/nodes/colorCorrection';
import { defaultMatteGrowShrinkSettings } from '../src/nodes/matteGrowShrink';
import { defaultCompositorDocument } from '../src/nodes/compositor';
import { defaultPainterData } from '../src/nodes/painter';
import { encodeMask } from '../src/nodes/masksExtractor';
import { imageOutput } from '../src/nodes/sunburstRun';
import { useCallback, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge, type Edge, type ReactFlowInstance } from '@xyflow/react';
import { nodeTypes } from '../src/nodes';
import type { AppNode, FileAsset } from '../src/nodes/types';
import { isDescriberNode, isImageGeneratorNode, isResizeNode } from '../src/nodes/types';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { defaultBlurSettings } from '../src/nodes/blur';
import { BlurRenderer } from '../src/nodes/blurRender';
import { requireFormalFrame, renderExecutionOutput } from '../src/nodes/executionLocal';
import { sourceSignature } from '../src/nodes/executionGraph';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { useModelTaskStore } from '../src/components/useModelTasks';
import { DescriberPanel } from '../src/components/DescriberPanel';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import { assetResources } from '../src/nodes/assetResources';
import { isActiveTask } from '../src/nodes/taskQueue';
import '@xyflow/react/dist/style.css';
import '../src/index.css';

const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
canvas.getContext('2d')!.fillStyle = '#61bfc0'; canvas.getContext('2d')!.fillRect(0, 0, 64, 48);
const png = canvas.toDataURL('image/png');
const nativeFetch = window.fetch.bind(window);
const blob = await (await nativeFetch(png)).blob();
const sample: FileAsset = { id: 'sample-a', name: 'A.png', kind: 'image', url: assetResources.create(blob), width: 64, height: 48 };
const b: FileAsset = { ...sample, id: 'sample-b', name: 'B.png', url: assetResources.create(blob) };
const file = (id: string, asset: FileAsset, y: number): AppNode => ({ id, type: 'file', position: { x: 0, y }, data: { assets: [asset] } });
const describer = (id: string, y: number): AppNode => ({ id, type: 'image-describer', position: { x: 500, y }, data: { text: '', instructions: 'Describe the image', model: 'deepseek-flash', imageInputs: 1 } });
const initialNodes: AppNode[] = [file('a', sample, 0), file('b', b, 550), describer('da', 0), describer('db', 550), { id: 'prompt', type: 'text', position: { x: 1000, y: 0 }, data: { text: 'Combine both descriptions.' } }, { id: 'g', type: 'sunburst', position: { x: 1500, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 }, selected: true }];
const initialEdges: Edge[] = [{ id: 'a-da', source: 'a', sourceHandle: 'file', target: 'da', targetHandle: 'image-0' }, { id: 'b-db', source: 'b', sourceHandle: 'file', target: 'db', targetHandle: 'image-0' }, { id: 'da-p', source: 'da', target: 'prompt', targetHandle: 'variable-1' }, { id: 'db-p', source: 'db', target: 'prompt', targetHandle: 'variable-2' }, { id: 'p-g', source: 'prompt', target: 'g', targetHandle: 'prompt' }];
type Request = { path: string; body: Record<string, unknown>; signal?: AbortSignal | null; resolve: (response: Response) => void; settled: boolean };
const requests: Request[] = [];
const remoteReads: string[] = [];
const remoteBase = `${location.origin}/__workflow_mock__/`;
const remoteAsset = (id: string): FileAsset => ({ ...sample, id, url: `${remoteBase}${id}.png` });
let deferred = false;
window.fetch = (input, init) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (path.startsWith(remoteBase)) {
    remoteReads.push(path);
    return Promise.resolve(new Response(path.endsWith('/valid.png') ? blob : null, { status: path.endsWith('/valid.png') ? 200 : 404 }));
  }
  if (path.startsWith('/api/')) {
    if (!['/api/describer', '/api/sunburst', '/api/nano-banana', '/api/ideogram', '/api/ideogram/edit'].includes(path)) return Promise.reject(new Error(`Blocked unexpected model API ${path}`));
    return new Promise(resolve => {
      const request = { path, body: JSON.parse(String(init?.body)), signal: init?.signal, resolve, settled: false }; requests.push(request);
      if (!deferred) setTimeout(() => respond(request), 20);
    });
  }
  if (/^(blob:|data:)/.test(path)) return nativeFetch(input, init);
  return Promise.reject(new Error(`External request blocked: ${path}`));
};
function respond(request: Request) { if (request.settled) return; request.settled = true; request.resolve(Response.json(request.path === '/api/describer' ? { text: `Description ${requests.indexOf(request) + 1}` } : { image: png, format: 'png' })); }
let graph = { nodes: initialNodes, edges: initialEdges };
let setNodes: (change: (nodes: AppNode[]) => AppNode[]) => void;
let setEdges: (change: (edges: Edge[]) => Edge[]) => void;
let store: ReturnType<typeof useModelTaskStore>;
let flow: ReactFlowInstance<AppNode>;
let undo: () => void;
function Harness() {
  const [nodes, updateNodes, onNodesChange] = useNodesState(initialNodes), [edges, updateEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const restore = useCallback((value: { nodes: AppNode[]; edges: Edge[] }) => { updateNodes(value.nodes); updateEdges(value.edges); }, [updateNodes, updateEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  store = useModelTaskStore(); setNodes = updateNodes; setEdges = updateEdges; undo = history.undo;
  useLayoutEffect(() => { graph = { nodes, edges }; }, [nodes, edges]);
  return <CanvasHistoryContext.Provider value={history}><button id="theme" onClick={() => { const next = mode === 'dark' ? 'light' : 'dark'; document.documentElement.classList.toggle('dark', next === 'dark'); setMode(next); }}>切换主题</button><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connection => updateEdges(all => addEdge(connection, all))} onInit={instance => { flow = instance; }} colorMode={mode} fitView><Background /><Controls /><MiniMap /><DescriberPanel /></ReactFlow></CanvasHistoryContext.Provider>;
}
const checks: string[] = [];
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function check(value: unknown, message: string) { assert(value, message); checks.push(message); document.getElementById('results')!.textContent = `Running (${checks.length})\n${checks.join('\n')}`; }
async function until(condition: () => boolean, message: string) { for (let i = 0; i < 600; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error(message); }
const settle = () => new Promise(resolve => setTimeout(resolve, 100));
const start = (id = 'g') => window.dispatchEvent(new CustomEvent('describer-run', { detail: id }));
async function completed(startIndex: number) { await until(() => store.getSnapshot().length > startIndex && store.getSnapshot().slice(startIndex).every(task => !isActiveTask(task)), 'workflow did not finish'); }
const target = () => graph.nodes.find(node => node.id === 'g')!;
async function run() {
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><ModelTasksProvider><Harness /></ModelTasksProvider></ReactFlowProvider>);
  await until(() => Boolean(flow) && Boolean(document.querySelector('.sunburst-run')), 'canvas did not mount'); await settle();
  setNodes(all => all.map(node => isDescriberNode(node) ? { ...node, data: { ...node.data, text: 'Legacy description without generation record' } } : node)); await settle();
  let count = store.getSnapshot().length; start(); await completed(count);
  check(requests.length === 3 && requests.slice(0, 2).every(request => request.path === '/api/describer') && requests[2].path === '/api/sunburst', 'Legacy descriptions automatically refresh before image generation');
  check(String(requests[2].body.prompt).includes('Description 1') && String(requests[2].body.prompt).includes('Description 2'), 'Target receives fresh upstream text');
  count = store.getSnapshot().length; start(); await completed(count);
  check(requests.length === 4, 'Unchanged upstream results are reused');
  document.querySelector<HTMLButtonElement>('[aria-label="增加运行次数"]')!.click(); await settle(); document.querySelector<HTMLButtonElement>('[aria-label="增加运行次数"]')!.click(); await settle();
  count = store.getSnapshot().length; start(); await completed(count);
  check(requests.length === 7 && requests.slice(4).every(request => request.path === '/api/sunburst'), 'Runs = 3 sends three target requests and no repeated descriptions');
  document.querySelector<HTMLButtonElement>('[aria-label="减少运行次数"]')!.click(); await settle(); document.querySelector<HTMLButtonElement>('[aria-label="减少运行次数"]')!.click(); await settle();
  const da = graph.nodes.find(node => node.id === 'da')!;
  const marker = sourceSignature(graph, da);
  setNodes(all => all.map(node => node.id === 'da' ? { ...node, data: { ...node.data, text: 'Manually edited description', outputMode: 'manual', sourceSignature: marker } } as AppNode : node)); await settle();
  setNodes(all => all.map(node => node.id === 'a' ? { ...node, data: { assets: [{ ...sample, id: 'replacement' }] } } as AppNode : node)); await settle();
  setNodes(all => all.map(node => ({ ...node, selected: node.id === 'da' }))); await settle();
  check(sourceSignature(graph, graph.nodes.find(node => node.id === 'da')!) !== marker, 'Manual description source changes are tracked internally');
  check(!document.querySelector('.model-output-policy'), 'Internal reuse policies add no controls to the canvas or sidebar');
  setNodes(all => all.map(node => ({ ...node, selected: node.id === 'g' }))); await settle();
  count = store.getSnapshot().length; start(); await completed(count);
  check(requests.length === 8 && String(requests[7].body.prompt).includes('Manually edited description'), 'Manual text survives changing the image and is reused deliberately');
  const savedGraph = graph;
  setNodes(all => all.map(node => node.id === 'da' ? { ...node, data: { ...node.data, text: '', outputMode: undefined, generation: undefined } } as AppNode : node)); await settle();
  deferred = true; count = store.getSnapshot().length; start(); await until(() => requests.length === 9, 'cancel scenario did not start');
  // A -> B -> actual canvas undo restores A, but must not revive its request.
  const beforeAsset = graph.nodes.find(node => node.id === 'a')!;
  await new Promise(resolve => setTimeout(resolve, 800));
  setNodes(all => all.map(node => node.id === 'a' ? { ...node, data: { assets: [{ ...sample, id: 'changed-during-run' }] } } as AppNode : node)); await settle(); undo(); await settle();
  check(JSON.stringify(graph.nodes.find(node => node.id === 'a')?.data) === JSON.stringify(beforeAsset.data), 'Canvas undo restores original input A');
  respond(requests[8]); await completed(count); await settle();
  check(requests[8].signal?.aborted && requests.length === 9 && graph.nodes.filter(isDescriberNode).find(node => node.id === 'da')?.data.text === '', 'A → B → undo A rejects late output and never starts target');
  deferred = false;
  setNodes(() => [...savedGraph.nodes, { id: 'mask', type: 'masks-extractor', position: { x: 1000, y: 650 }, data: {} }]);
  setEdges(() => [...savedGraph.edges, { id: 'b-mask', source: 'b', sourceHandle: 'file', target: 'mask', targetHandle: 'image' }, { id: 'mask-g', source: 'mask', sourceHandle: 'mask', target: 'g', targetHandle: 'mask' }]); await settle();
  start(); await settle();
  check(requests.length === 9 && document.querySelector('[role="alert"]')?.textContent?.includes('必要选区') && graph.nodes.find(node => node.id === 'mask')?.selected, 'Missing selection blocks every model request and focuses the problem node');
  setNodes(() => savedGraph.nodes); setEdges(() => savedGraph.edges); await settle();
  // Exercise the real preview replaceable queue and formal-output contract.
  const renderer = new BlurRenderer(await createImageBitmap(canvas));
  const first = renderer.render(defaultBlurSettings, true), replaced = renderer.render(defaultBlurSettings, true), newest = renderer.render(defaultBlurSettings, true);
  const empty = await replaced; let rejected = false; try { requireFormalFrame(empty); } catch { rejected = true; }
  const frames = await Promise.all([first, newest]); frames.forEach(frame => frame?.bitmap?.close()); renderer.dispose();
  check(empty === undefined && rejected, 'A replaced preview frame cannot be mistaken for formal success');
  const localNode: AppNode = { id: 'formal-blur', type: 'blur', position: { x: 0, y: 0 }, data: { settings: defaultBlurSettings, baseImage: sample } };
  const formal = await renderExecutionOutput(localNode, { nodes: [localNode], edges: [] }, new AbortController().signal);
  check(Boolean(formal.result && formal.outputRevision), 'Dedicated formal worker completes after preview replacement without hanging');
  // No mounted Resize/Blur component: execution must still produce native output.
  const resize: AppNode = { id: 'resize', type: 'resize', position: { x: 0, y: 0 }, data: { settings: { width: 32, height: 24, lockAspectRatio: true }, baseImage: sample } };
  const resized = await renderExecutionOutput(resize, { nodes: [resize], edges: [] }, new AbortController().signal);
  check((resized.result as FileAsset).width === 32 && (resized.result as FileAsset).height === 24, 'Formal local rendering works independently of mounted previews');
  const examples: AppNode[] = [
    { id: 'invert', type: 'invert', position: { x: 0, y: 0 }, data: { baseImage: sample } },
    { id: 'crop', type: 'crop', position: { x: 0, y: 0 }, data: { baseImage: sample, rect: { x: 0, y: 0, width: .5, height: .5 }, aspectLocked: false } },
    { id: 'rotate', type: 'rotate-flip', position: { x: 0, y: 0 }, data: { baseImage: sample, settings: { rotation: 90, flipHorizontal: true, flipVertical: false } } },
    { id: 'levels', type: 'levels', position: { x: 0, y: 0 }, data: { baseImage: sample, settings: defaultLevelsSettings, channel: 'RGB' } },
    { id: 'color', type: 'color-correction', position: { x: 0, y: 0 }, data: { baseImage: sample, settings: defaultColorSettings } },
    { id: 'matte', type: 'matte-grow-shrink', position: { x: 0, y: 0 }, data: { baseImage: sample, settings: defaultMatteGrowShrinkSettings } },
    { id: 'blend', type: 'blend', position: { x: 0, y: 0 }, data: { back: sample, front: b, settings: defaultBlendSettings } },
    { id: 'palette', type: 'color-palette', position: { x: 0, y: 0 }, data: { colors: [{ id: 'red', hex: '#ff0000' }] } },
    { id: 'painter', type: 'painter', position: { x: 0, y: 0 }, data: { ...defaultPainterData, baseImage: sample } },
    { id: 'masks', type: 'masks-extractor', position: { x: 0, y: 0 }, data: { baseImage: sample, selection: encodeMask({ width: 64, height: 48, pixels: new Uint8Array(64 * 48).fill(1, 0, 64 * 24) }, sample.id, 'selection') } },
    { id: 'compositor', type: 'compositor', position: { x: 0, y: 0 }, data: { document: { ...defaultCompositorDocument(), canvas: { width: 64, height: 48, autoSize: false, aspectLocked: false, fill: '#ffffff' } } } },
  ];
  for (const node of examples) {
    const patch = await renderExecutionOutput(node, { nodes: [node], edges: [] }, new AbortController().signal);
    const updated = { ...node, data: { ...node.data, ...patch } } as AppNode;
    const output = imageOutput(updated, node.type === 'color-palette' ? 'image' : 'result', [updated], []);
    check(output.length === 1 && Boolean(output[0].width && output[0].height), `${node.type}: formal output matches existing revision contract`);
    assetResources.discard(Object.values(patch).filter((value): value is FileAsset => Boolean(value && typeof value === 'object' && 'url' in value)).map(asset => asset.url));
  }
  // A real mixed chain, including fresh model output and asynchronous workers.
  const mixedNodes: AppNode[] = [
    { id: 'mixed-prompt', type: 'text', position: { x: -1000, y: 1400 }, data: { text: 'Mixed workflow' } },
    { id: 'mixed-image', type: 'sunburst', position: { x: -500, y: 1400 }, data: { ...defaultSunburstSettings, imageInputs: 1, results: [{ ...sample, id: 'legacy-generated-image' }], activeResultId: 'legacy-generated-image' } },
    { id: 'mixed-resize', type: 'resize', position: { x: 0, y: 1400 }, data: { settings: { width: 32, height: 24, lockAspectRatio: true } } },
    { id: 'mixed-blur', type: 'blur', position: { x: 500, y: 1400 }, data: { settings: defaultBlurSettings } },
    { ...describer('mixed-description', 1400), position: { x: 1000, y: 1400 } },
  ];
  setNodes(all => [...all, ...mixedNodes]);
  setEdges(all => [...all,
    { id: 'mixed-1', source: 'mixed-prompt', target: 'mixed-image', targetHandle: 'prompt' },
    { id: 'mixed-2', source: 'mixed-image', sourceHandle: 'result', target: 'mixed-resize', targetHandle: 'image' },
    { id: 'mixed-3', source: 'mixed-resize', sourceHandle: 'result', target: 'mixed-blur', targetHandle: 'image' },
    { id: 'mixed-4', source: 'mixed-blur', sourceHandle: 'result', target: 'mixed-description', targetHandle: 'image-0' },
  ]); await settle();
  const beforeMixed = requests.length; count = store.getSnapshot().length; start('mixed-description'); await completed(count);
  check(requests.length === beforeMixed + 2 && requests[beforeMixed].path === '/api/sunburst' && requests[beforeMixed + 1].path === '/api/describer' && store.getSnapshot().slice(count).every(task => task.state === 'Done'), 'Legacy image refresh → Resize → Blur → description waits for fresh formal output');
  const afterMixed = requests.length; count = store.getSnapshot().length; start('mixed-description'); await completed(count);
  check(requests.length === afterMixed + 1 && requests[afterMixed].path === '/api/describer', 'Refreshed legacy image is reused on the next downstream run');
  // Invalidate a real cached PNG without changing inputs/settings. The mounted
  // preview keeps its revision, so only the execution path can repair it.
  const cachedResize = graph.nodes.find(node => node.id === 'mixed-resize')!;
  assert(isResizeNode(cachedResize) && cachedResize.data.result, 'resize cache missing');
  const expiredUrl = URL.createObjectURL(blob); URL.revokeObjectURL(expiredUrl);
  setNodes(all => all.map(node => node.id === cachedResize.id ? { ...cachedResize, data: { ...cachedResize.data, result: { ...cachedResize.data.result!, url: expiredUrl } } } : node)); await settle();
  const beforeRepair = requests.length; count = store.getSnapshot().length; start('mixed-description'); await completed(count);
  const repairedResize = graph.nodes.find(node => node.id === cachedResize.id)!;
  check(isResizeNode(repairedResize) && repairedResize.data.result?.url !== expiredUrl && repairedResize.data.result?.width === 32 && requests.length === beforeRepair + 1 && store.getSnapshot().slice(count).every(task => task.state === 'Done'), 'Expired local PNG rebuilds automatically before downstream without repeating the image model');
  // Compare's unused embedded input must never enter the remote snapshot plan.
  setNodes(all => [...all,
    { id: 'remote-compare', type: 'compare', position: { x: 0, y: 2200 }, data: { mode: 'slider', split: .5, input1: sample, input2: remoteAsset('unused') } },
    { ...describer('remote-description', 2200), position: { x: 500, y: 2200 } },
  ]);
  setEdges(all => [...all, { id: 'remote-compare-description', source: 'remote-compare', sourceHandle: 'output-1', target: 'remote-description', targetHandle: 'image-0' }]); await settle();
  count = store.getSnapshot().length; start('remote-description'); await completed(count);
  check(remoteReads.length === 0 && store.getSnapshot().slice(count).every(task => task.state === 'Done'), 'Unused expired Compare image is never fetched and does not block downstream');
  const generated = graph.nodes.find(node => node.id === 'mixed-image')!;
  assert(isImageGeneratorNode(generated) && generated.data.results?.length, 'image cache missing');
  const selectedImage = generated.data.results.find(asset => asset.id === generated.data.activeResultId)!;
  setNodes(all => all.map(node => node.id === generated.id ? { ...generated, data: { ...generated.data, results: [remoteAsset('history'), ...generated.data.results!] } } as AppNode : node)); await settle();
  const beforeHistory = requests.length; count = store.getSnapshot().length; start('mixed-description'); await completed(count);
  check(remoteReads.length === 0 && requests.length === beforeHistory + 1 && store.getSnapshot().slice(count).every(task => task.state === 'Done'), 'Unselected expired historical image is never fetched and current result is reused');
  setNodes(all => all.map(node => node.id === generated.id && isImageGeneratorNode(node) ? { ...node, data: { ...node.data, results: node.data.results!.map(asset => asset.id === selectedImage.id ? { ...asset, url: remoteAsset('expired-selected').url } : asset) } } as AppNode : node)); await settle();
  const beforeRemoteRepair = requests.length; count = store.getSnapshot().length; start('mixed-description'); await completed(count);
  check(remoteReads.length === 1 && remoteReads[0] === remoteAsset('expired-selected').url && requests.length === beforeRemoteRepair + 2 && requests[beforeRemoteRepair].path === '/api/sunburst' && store.getSnapshot().slice(count).every(task => task.state === 'Done'), 'Expired selected remote result regenerates automatically while history remains untouched');
  // A required remote input is snapshotted and passed to the model as local bytes.
  setNodes(all => all.map(node => node.id === 'remote-compare' ? { ...node, data: { mode: 'slider', split: .5, input1: remoteAsset('valid'), input2: remoteAsset('unused') } } as AppNode : node)); await settle();
  count = store.getSnapshot().length; start('remote-description'); await completed(count);
  check(remoteReads.at(-1) === remoteAsset('valid').url && store.getSnapshot().slice(count).every(task => task.state === 'Done'), 'Required remote input is snapshotted successfully without reading unused inputs');
  setNodes(all => all.map(node => node.id === 'remote-compare' ? { ...node, data: { mode: 'slider', split: .5, input1: remoteAsset('missing-source'), input2: remoteAsset('unused') } } as AppNode : node)); await settle();
  const beforeMissing = requests.length; count = store.getSnapshot().length; start('remote-description'); await completed(count);
  check(requests.length === beforeMissing && store.getSnapshot().slice(count).every(task => task.state === 'Failed'), 'Unrecoverable original input stops before model submission');
  setNodes(() => savedGraph.nodes); setEdges(() => savedGraph.edges); await settle();
  await runBoundaryChecks(sample, check);
  const storage = new WorkflowStorage(`workflow-execution-qa-${crypto.randomUUID()}`);
  await storage.save({ ...graph, viewport: flow.getViewport(), colorMode: 'dark' });
  const restored = await storage.load(); assert(restored, 'saved fixture missing');
  check(restored.nodes.filter(isDescriberNode).find(node => node.id === 'db')?.data.generation?.version === 1 && restored.nodes.filter(isImageGeneratorNode).find(node => node.id === 'g')?.data.results?.every(asset => asset.generation?.version === 1), 'Success records persist with text and each generated image');
  setNodes(() => restored.nodes); setEdges(() => restored.edges); await settle();
  const before = requests.length; count = store.getSnapshot().length; start(); await completed(count);
  check(requests.length === before + 1, 'Restored Blob URLs preserve upstream reuse');
  // Isolated canvas controls and graph edits.
  setNodes(all => all.map(node => node.id === 'g' ? { ...node, position: { x: node.position.x + 40, y: node.position.y + 20 } } : node)); await settle();
  check(target().position.x === savedGraph.nodes.find(node => node.id === 'g')!.position.x + 40, 'Moving nodes updates coordinates without losing results');
  await flow.zoomTo(.5); check(Math.abs(flow.getZoom() - .5) < .01 && Boolean(document.querySelector('.react-flow__minimap')), 'Zoom controls and minimap remain available');
  document.getElementById('theme')!.click(); await settle(); check(Boolean(document.querySelector('.react-flow.light')), 'Light theme renders workflow controls');
  await flow.fitView({ padding: .15 });
  document.getElementById('results')!.textContent = `PASS (${checks.length}) · No real model calls\n${checks.join('\n')}`; document.getElementById('results')!.dataset.result = 'passed';
}
void run().catch(error => { document.getElementById('results')!.textContent += `\nFAIL: ${error instanceof Error ? error.stack : String(error)}`; document.getElementById('results')!.dataset.result = 'failed'; });
