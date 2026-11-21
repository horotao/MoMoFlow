import { useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptToolbar } from '../components/image-prompt-node/ImagePromptToolbar';
import { useModelTasks } from '../components/useModelTasks';
import { isActiveTask } from './taskQueue';
import { downloadAsset } from './fileMedia';
import { savedImagePrompt } from './executionGraph';
import { imageSizes, imageSizeLabels } from './sunburst';
import type { AppNode, ImageComposerData, SunburstNode } from './types';
import './CanvasImageNode.css';

const imageHandles = Array.from({ length: 16 }, (_, i) => 'image-' + i);

export function CanvasImageNode({ id, data, selected, isConnectable }: NodeProps<SunburstNode & { data: { composer: ImageComposerData } }>) {
  const composer = data.composer;
  const { updateNodeData, setNodes } = useReactFlow<AppNode>();
  const edges = useEdges();
  const internals = useUpdateNodeInternals();
  const results = data.results ?? [];
  const tasks = useModelTasks();
  // Queue completion can render before React Flow publishes the matching image.
  // Keep its thumbnail and generation layer until both stores agree.
  const pendingIds = useRef(new Set<string>());
  const activeTasks = tasks.filter(task => task.nodeId === id && (isActiveTask(task)
    || (task.state === 'Done' && pendingIds.current.has(task.id)
      && !results.some(asset => asset.generation?.taskId === task.id))));
  useLayoutEffect(() => {
    pendingIds.current = new Set(activeTasks.map(task => task.id));
  });
  const batch = activeTasks[0]?.batchId;
  const [viewing, setViewing] = useState<{ batch: string; variantId: string }>();
  const chosen = batch && viewing?.batch === batch ? viewing.variantId : undefined;
  const task = chosen ? activeTasks.find(item => item.id === chosen) : activeTasks[0];
  const overview = useStore(state => Math.round(state.transform[2] * 100) <= 14);
  const [error, setError] = useState('');
  const references = edges.filter(edge => edge.target === id && edge.targetHandle?.startsWith('image-'));
  const occupied = new Set(references.map(edge => edge.targetHandle));

  const available = imageHandles.find(handle => !occupied.has(handle));
  useLayoutEffect(() => { internals(id); }, [id, internals, available, edges]);
  const active = results.find(asset => chosen && (asset.generation?.taskId ?? asset.id) === chosen) ?? results.find(asset => asset.id === data.activeResultId) ?? results[results.length - 1];
  const variants = [
    ...results.map(asset => ({ id: asset.generation?.taskId ?? asset.id, thumbnail: <img src={asset.url} alt="" /> })),
    ...activeTasks.map(item => ({ id: item.id, pending: true })),
  ];
  function edit(change: Partial<ImageComposerData>) {
    if (!data.locked) updateNodeData(id, { composer: { ...composer, ...change } });
  }
  const controls = {
    modelSelection: composer.selection,
    onModelSelectionChange: (selection: NonNullable<ImageComposerData['selection']>) => edit({ selection }),
    aspectRatio: composer.ratio,
    onAspectRatioChange: (ratio: string) => {
      if (data.locked) return;
      const size = data.provider === 'openai' ? imageSizes[imageSizeLabels.indexOf(ratio)] ?? 'auto' : ratio;
      updateNodeData(id, { size, composer: { ...composer, ratio } });
    },
    locked: Boolean(data.locked),
    onLockedChange: (locked: boolean) => updateNodeData(id, { locked }),
  };
  const connectable = isConnectable && !data.locked;
  return <div className="canvas-image-mount">
    <ImagePromptNode {...controls} title={data.label} selected={selected}
      onSelectedChange={value => {
        if (selected !== value) setNodes(nodes => nodes.map(node => node.id === id ? { ...node, selected: value } : value ? { ...node, selected: false } : node));
      }}
      prompt={composer.prompt} onPromptChange={prompt => edit({ prompt })}
      quantity={composer.quantity} onQuantityChange={quantity => edit({ quantity })}
      onGenerate={() => window.dispatchEvent(new CustomEvent('describer-run', { detail: id }))}
      generation={task ? { id: task.id, startedAt: task.started || undefined, estimatedSeconds: 25 } : null}
      result={active ? <img src={active.url} alt={active.name} /> : undefined}
      variants={variants} activeVariant={task ? results.length + activeTasks.indexOf(task) : active ? results.indexOf(active) : 0}
      onVariantChange={index => {
        if (data.locked) return;
        if (batch && variants[index]) {
          setViewing({ batch, variantId: variants[index].id });
          return;
        }
        const asset = results[index];
        if (asset) updateNodeData(id, {
          activeResultId: asset.id,
          composer: { ...composer, prompt: savedImagePrompt(asset) ?? composer.prompt },
        });
      }}
      imageInputCount={references.length} outputConnected={edges.some(edge => edge.source === id)}
      handles={{
        prompt: <Handle type="target" position={Position.Left} id="prompt" isConnectable={connectable} />,
        image: [...(available ? [available] : []), ...imageHandles.filter(handle => occupied.has(handle))].map(handle =>
          <Handle key={handle} type="target" position={Position.Left} id={handle}
            isConnectable={connectable && handle === available} style={{ pointerEvents: handle === available ? undefined : 'none' }} />),
        output: <Handle type="source" position={Position.Right} id="result" isConnectable={connectable} />,
      }}
      toolbar={overview && !selected ? null : <ImagePromptToolbar className="nodrag nopan" {...controls} downloadDisabled={!active}
        onDownload={() => { if (active) void downloadAsset(active).catch(() => setError('图片下载失败。')); }} />}
    />
    {error && <button type="button" role="alert" onClick={() => setError('')}>{error}</button>}
  </div>;
}
