import { useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Handle, Position, useEdges, useNodesData, useReactFlow, useStore, useUpdateNodeInternals, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { InputPortRing } from '../components/image-prompt-node/InputPortRing';
import { ImagePromptGeneration } from '../components/image-prompt-node/ImagePromptGeneration';
import { textOutputValue } from './textGeneration';
import { textInputReferences, textReferenceEdges } from './textReferences';
import { ImagePromptToolbar } from '../components/image-prompt-node/ImagePromptToolbar';
import { sunburstPreset } from '../components/imageNodePresets';
import { useModelTasks } from '../components/useModelTasks';
import { isActiveTask, type PreviewTask } from './taskQueue';
import { downloadAsset } from './fileMedia';
import { savedImagePrompt } from './generationRecord';
import { imageInputHandles, isImageInputHandle } from './connectionRules';
import { changeComposerSettings, composerAspectRatios } from './imageComposerSettings';
import { canvasImageSize, hasImageDimensions } from './canvasImageGeometry';
import { reorderImageReferences } from './imageReferenceOrder';
import { referenceRatioSettings } from './imageReferenceRatio';
import { ImportedCanvasImage, type CanvasImageChrome } from './ImportedCanvasImage';
import { selectedImageResult } from './annotationGraph';
import { usePublishVisibleImage } from './visibleCanvasImage';
import type { CanvasText } from './types';
import type { AppNode, CanvasImage, FileAsset, ImageComposerData } from './types';
import './CanvasImageNode.css';

// All Image nodes share the selection check for the same React Flow nodes array.
const multipleSelection = new WeakMap<readonly Node[], boolean>();
const generationState = (task: PreviewTask) => ({
  id: task.id, startedAt: task.started || undefined, estimatedSeconds: 25,
  progress: task.state === 'Queued' ? 0 : undefined,
});

function hasMultipleSelection(nodes: readonly Node[]) {
  const cached = multipleSelection.get(nodes);
  if (cached !== undefined) return cached;
  let selectedCount = 0;
  for (const node of nodes) {
    if (node.selected) selectedCount++;
    if (selectedCount === 2) break;
  }
  const multiple = selectedCount === 2;
  multipleSelection.set(nodes, multiple);
  return multiple;
}

export function CanvasImageNode({ id, data, selected, isConnectable }: NodeProps<CanvasImage>) {
  const { setNodes } = useReactFlow<AppNode>();
  const edges = useEdges();
  const overview = useStore(state => Math.round(state.transform[2] * 100) <= 14);
  const toolbarHidden = useStore(state => state.userSelectionActive || hasMultipleSelection(state.nodes));
  const connectable = isConnectable && !data.locked;
  const chrome: CanvasImageChrome = {
    selected, locked: Boolean(data.locked), toolbarHidden, showToolbar: !overview || selected,
    outputConnected: edges.some(edge => edge.source === id),
    output: <Handle type="source" position={Position.Right} id="result" isConnectable={connectable} />,
    onSelectedChange: value => {
      if (selected !== value) setNodes(nodes => nodes.map(node => node.id === id
        ? { ...node, selected: value } : value ? { ...node, selected: false } : node));
    },
  };
  if (data.imageSource === 'imported') {
    const asset = selectedImageResult({ data });
    return <ImportedCanvasImage id={id} asset={asset} chrome={chrome} />;
  }
  return <GeneratingCanvasImage id={id} data={data} edges={edges} connectable={connectable} chrome={chrome} />;
}

function GeneratingCanvasImage({ id, data, edges, connectable, chrome }: {
  id: string; data: CanvasImage['data']; edges: Edge[]; connectable: boolean; chrome: CanvasImageChrome;
}) {
  const composer = data.composer;
  const zoom = useStore(state => state.transform[2]);
  const { setEdges, updateNodeData } = useReactFlow<AppNode>();
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
  const [error, setError] = useState('');
  const references = useMemo(() => edges.filter(edge => edge.target === id && isImageInputHandle(edge.targetHandle))
    .sort((a, b) => imageInputHandles.indexOf(a.targetHandle ?? '') - imageInputHandles.indexOf(b.targetHandle ?? '')), [edges, id]);
  const incoming = useMemo(() => textReferenceEdges(id, edges), [edges, id]);
  const referenceSources = useMemo(() => incoming.map(edge => edge.source), [incoming]);
  const sourceNodes = useNodesData<CanvasImage | CanvasText>(referenceSources);
  const promptEdge = incoming.find(edge => edge.targetHandle === 'prompt');
  const promptSource = sourceNodes.find(node => node.id === promptEdge?.source);
  const prompt = promptEdge ? promptSource?.type === 'text' ? textOutputValue(promptSource.data) : '' : composer.prompt;
  const inputs = references.map(edge => {
    const source = sourceNodes.find(node => node.id === edge.source);
    const asset = source?.type === 'sunburst' ? selectedImageResult(source) : undefined;
    return { id: edge.id, asset, name: asset?.name || source?.data.label || '上游 Image' };
  });
  const occupied = new Set(references.map(edge => edge.targetHandle));

  const available = imageInputHandles.find(handle => !occupied.has(handle));
  const active = results.find(asset => chosen && (asset.generation?.taskId ?? asset.id) === chosen) ?? results.find(asset => asset.id === data.activeResultId) ?? results[results.length - 1];
  usePublishVisibleImage(id, active);
  const [loadedSizes, setLoadedSizes] = useState<Record<string, { width: number; height: number }>>({});
  const dimensions = (asset?: FileAsset) => asset && (hasImageDimensions(asset) ? asset : loadedSizes[asset.url] ?? asset);
  const firstReference = inputs.find(input => input.asset)?.asset;
  const referenceWidth = dimensions(firstReference)?.width;
  const referenceHeight = dimensions(firstReference)?.height;
  useLayoutEffect(() => {
    const patch = referenceRatioSettings(data, { width: referenceWidth, height: referenceHeight });
    if (patch) updateNodeData(id, patch);
  }, [id, data, referenceWidth, referenceHeight, updateNodeData]);
  const { width, height } = canvasImageSize(composer.ratio, dimensions(active), dimensions(firstReference), task);
  useLayoutEffect(() => { internals(id); }, [id, internals, available, edges, width, height]);
  function rememberSize(asset?: FileAsset) {
    if (!asset || hasImageDimensions(asset) || loadedSizes[asset.url]) return;
    return ({ currentTarget: image }: SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: width, naturalHeight: height } = image;
      if (width && height) setLoadedSizes(current => ({ ...current, [asset.url]: { width, height } }));
    };
  }
  const variants = [
    ...results.map(asset => ({ id: asset.generation?.taskId ?? asset.id, thumbnail: <img src={asset.url} alt="" /> })),
    ...activeTasks.map(item => ({ id: item.id, pending: true,
      thumbnail: <ImagePromptGeneration state={generationState(item)} fillOnly />,
    })),
  ];
  function edit(change: Partial<ImageComposerData>) {
    if (data.locked) return;
    const patch = changeComposerSettings(data, change);
    if (change.ratio !== undefined || change.selection !== undefined || change.quantity !== undefined) sunburstPreset.remember({ ...data, ...patch });
    updateNodeData(id, patch);
  }
  const controls = {
    modelSelection: composer.selection,
    onModelSelectionChange: (selection: NonNullable<ImageComposerData['selection']>) => edit({ selection }),
    aspectRatio: composer.ratio,
    aspectRatioChoices: composerAspectRatios(data),
    onAspectRatioChange: (ratio: string) => edit({ ratio }),
    locked: Boolean(data.locked),
    onLockedChange: (locked: boolean) => updateNodeData(id, { locked }),
  };
  const { output, showToolbar, toolbarHidden, ...frame } = chrome;
  return <div className="canvas-image-mount" style={{ width, height }}>
    <ImagePromptNode {...controls} {...frame} title={data.label}
      prompt={prompt} promptReadOnly={Boolean(promptEdge)} onPromptChange={prompt => edit({ prompt })}
      quantity={composer.quantity} onQuantityChange={quantity => edit({ quantity })}
      onGenerate={() => window.dispatchEvent(new CustomEvent('describer-run', { detail: id }))}
      generation={task ? generationState(task) : null}
      result={active ? <img src={active.url} alt={active.name} onLoad={rememberSize(active)} /> : undefined}
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
          ...(promptEdge ? {} : { composer: { ...composer, prompt: savedImagePrompt(asset) ?? composer.prompt } }),
        });
      }}
      imageInputCount={references.length}
      references={textInputReferences(incoming, sourceNodes).map(input => ({ ...input, onLoad: rememberSize(inputs.find(item => item.id === input.id)?.asset) }))}
      textInput={<button type="button" className="image-node-input" data-connection-port="text" data-connected={Boolean(promptEdge) || undefined} aria-label="Prompt input" disabled={data.locked}>
        <span className="image-node-port-label"><ImagePromptIcon name="text" />Prompt</span>
        <InputPortRing />
        <Handle type="target" position={Position.Left} id="prompt" isConnectable={connectable} />
      </button>}
      onRemoveReference={edgeId => {
        if (!data.locked) setEdges(current => current.filter(edge => edge.target !== id || edge.id !== edgeId));
      }}
      referenceScale={zoom}
      onReorderReferences={order => {
        if (!data.locked) setEdges(current => reorderImageReferences(current, id, order));
      }}
      handles={{
        image: [...(available ? [available] : []), ...imageInputHandles.filter(handle => occupied.has(handle))].map(handle =>
          <Handle key={handle} type="target" position={Position.Left} id={handle}
            isConnectable={connectable && handle === available} style={{ pointerEvents: handle === available ? undefined : 'none' }} />),
        output,
      }}
      toolbar={!showToolbar ? null : <ImagePromptToolbar className="nodrag nopan" {...controls} hidden={toolbarHidden} downloadDisabled={!active}
        onDownload={() => { if (active) void downloadAsset(active).catch(() => setError('图片下载失败。')); }} />}
    />
    {error && <button type="button" role="alert" onClick={() => setError('')}>{error}</button>}
  </div>;
}
