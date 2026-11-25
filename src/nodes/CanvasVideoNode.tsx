import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodesData, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Video } from 'lucide-react';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { InputPortRing } from '../components/image-prompt-node/InputPortRing';
import { ImportedMediaToolbar } from '../components/image-prompt-node/ImportedMediaToolbar';
import { assetResources } from './assetResources';
import { canvasImageSize, hasImageDimensions } from './canvasImageGeometry';
import { CanvasVideoPlayer } from './CanvasVideoPlayer';
import { CanvasVideoToolbar } from './CanvasVideoToolbar';
import { CanvasVideoInspector } from './CanvasVideoInspector';
import { useCanvasMentions } from './CanvasMentionContext';
import { readCanvasVideo } from './importCanvasVideo';
import { downloadAsset } from './fileMedia';
import { composerRunEvent, type ComposerRunRequest } from './canvasComposerRun';
import { textOutputValue } from './textGeneration';
import { textInputReferences, textReferenceEdges } from './textReferences';
import { defaultVideoComposer, videoImageHandles, videoInputHandles, videoModelDisplay } from './videoComposer';
import { generateApimartVideo, videoStopNotice } from './apimartVideoClient';
import { normalizeVideoComposer } from './apimartVideo';
import { selectedImageResult } from './annotationGraph';
import { usePublishNodeGeneration } from './visibleCanvasText';
import { isCanvasTextNode, isCanvasVideo, isImageGeneratorNode, isNodeLocked, type AppNode, type CanvasImage, type CanvasText, type CanvasVideo, type FileAsset, type VideoComposer } from './types';

function inputSlots(handles: string[], occupied: Set<string | null | undefined>, enabled: boolean) {
  const free = handles.find(handle => !occupied.has(handle));
  return handles.filter(handle => handle === free || occupied.has(handle)).map(handle =>
    <Handle key={handle} type="target" position={Position.Left} id={handle}
      isConnectable={enabled && handle === free} style={{ pointerEvents: handle === free ? undefined : 'none' }} />);
}

export function CanvasVideoNode({ id, data, selected, isConnectable }: NodeProps<CanvasVideo>) {
  const { getNode, getEdges, updateNodeData, setNodes, setEdges } = useReactFlow<AppNode>();
  const hideToolbar = useStore(state => state.userSelectionActive || state.nodes.filter(node => node.selected).length > 1
    || (!selected && state.transform[2] <= .14));
  const canvas = useStore(state => state.domNode);
  const zoom = useStore(state => state.transform[2]);
  const input = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const pendingUrls = useRef<string[]>([]);
  const submittedTask = useRef<string>();
  const job = useRef<AbortController>();
  const [generation, setGeneration] = useState<{ id: number; startedAt: number; estimatedSeconds: number; ratio: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const { asset, label, locked } = data;
  const composer = normalizeVideoComposer(data.videoComposer ?? defaultVideoComposer);
  const imported = Boolean(asset && !data.videoComposer);
  const model = videoModelDisplay(composer);
  const edges = useEdges();
  const incoming = useMemo(() => edges.filter(edge => edge.target === id), [edges, id]);
  const occupied = new Set(incoming.map(edge => edge.targetHandle));
  const sourceIds = useMemo(() => incoming.map(edge => edge.source), [incoming]);
  const sources = useNodesData<CanvasImage | CanvasText | CanvasVideo>(sourceIds);
  const promptEdge = incoming.find(edge => edge.targetHandle === 'prompt');
  const promptSource = sources.find(source => source.id === promptEdge?.source);
  const prompt = promptEdge ? promptSource?.type === 'text' ? textOutputValue(promptSource.data) : '' : composer.prompt;
  const mentions = useCanvasMentions(id);
  const imageRefs = textInputReferences(textReferenceEdges(id, incoming), sources.filter(source => source.type !== 'video'));
  const videoRefs = incoming.filter(edge => videoInputHandles.includes(edge.targetHandle ?? '')).map(edge => {
    const source = sources.find(source => source.id === edge.source);
    return { id: edge.id, kind: 'video' as const, name: source?.data.label || 'Video', url: source?.type === 'video' ? source.data.asset?.url : undefined };
  });
  const size = canvasImageSize(generation?.ratio ?? composer.ratio, !generation && asset && hasImageDimensions(asset) ? asset : undefined);
  const internals = useUpdateNodeInternals();
  useLayoutEffect(() => internals(id), [id, internals, size.width, size.height, incoming, imported]);
  usePublishNodeGeneration(id, Boolean(generation));
  useLayoutEffect(() => {
    pendingUrls.current = pendingUrls.current.filter(url => url !== asset?.url && url !== data.lastFrame?.url);
  }, [asset?.url, data.lastFrame?.url]);
  useLayoutEffect(() => () => {
    job.current?.abort();
    job.current = undefined;
    assetResources.discard(pendingUrls.current);
  }, []);
  const cancel = useCallback(() => {
    if (!job.current) return;
    job.current.abort();
    job.current = undefined;
    const taskId = submittedTask.current;
    submittedTask.current = undefined;
    setGeneration(null);
    setError(taskId ? `${videoStopNotice} 任务编号：${taskId}` : '已停止等待。如请求可能已发出，请先检查 APIMart 请求记录。');
  }, []);
  useLayoutEffect(() => { if (locked) cancel(); }, [locked, cancel]);
  const runner = useRef(run);
  useLayoutEffect(() => { runner.current = run; });
  useEffect(() => {
    const start = (event: Event) => {
      const detail = (event as CustomEvent<ComposerRunRequest>).detail;
      if (detail.id === id) detail.completion = runner.current();
    };
    window.addEventListener(composerRunEvent.video, start);
    return () => window.removeEventListener(composerRunEvent.video, start);
  }, [id]);

  const pictureCount = imageRefs.filter(ref => ref.kind === 'image').length;
  const klingFirstFrame = composer.model === 'kling' && pictureCount === 1 && !videoRefs.length;

  async function run() {
    const nodeAtStart = getNode(id);
    if (!isCanvasVideo(nodeAtStart) || isNodeLocked(nodeAtStart) || imported || busy || job.current) return false;
    const config = normalizeVideoComposer(nodeAtStart.data.videoComposer ?? defaultVideoComposer);
    const liveEdges = getEdges().filter(edge => edge.target === id);
    const textEdge = liveEdges.find(edge => edge.targetHandle === 'prompt');
    const upstream = textEdge ? getNode(textEdge.source) : undefined;
    const runPrompt = textEdge ? upstream && isCanvasTextNode(upstream) ? textOutputValue(upstream.data) : '' : config.prompt;
    const controller = new AbortController();
    job.current = controller;
    submittedTask.current = undefined;
    setError('');
    const startedAt = Date.now();
    setGeneration({ id: startedAt, startedAt, estimatedSeconds: 120, ratio: config.ratio });
    try {
      const inputs = (handles: string[], resolve: (node: AppNode | undefined) => FileAsset | undefined) => handles.flatMap(handle => {
        const edge = liveEdges.find(edge => edge.targetHandle === handle);
        if (!edge) return [];
        const asset = resolve(getNode(edge.source));
        if (!asset) throw new Error('有连接的参考素材尚未就绪，请先生成或导入素材。');
        return [{ nodeId: edge.source, asset }];
      });
      const images = inputs(videoImageHandles, node => isImageGeneratorNode(node) ? selectedImageResult(node) : undefined);
      const videos = inputs(videoInputHandles, node => isCanvasVideo(node) ? node.data.asset : undefined).map(ref => ref.asset);
      const result = await generateApimartVideo(config, runPrompt,
        textEdge ? undefined : config.mentions, images, videos, controller.signal, taskId => { submittedTask.current = taskId; });
      const node = getNode(id);
      if (controller.signal.aborted || !isCanvasVideo(node) || node.data.locked || node.data.asset?.id !== nodeAtStart.data.asset?.id || input.current?.closest('[inert]')) {
        assetResources.discard([result.url]);
        return false;
      }
      pendingUrls.current = [result.url];
      updateNodeData(id, { asset: result, lastFrame: undefined, videoComposer: node.data.videoComposer ?? config,
        label: node.data.label === 'Video' ? result.name.replace(/\.(mp4|mov)$/i, '') : node.data.label });
      return true;
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '视频生成失败。');
      return false;
    } finally {
      if (job.current === controller) { job.current = undefined; submittedTask.current = undefined; setGeneration(null); }
    }
  }
  async function replace(file: File, picker: HTMLInputElement) {
    setBusy(true);
    setError('');
    try {
      const replacement = await readCanvasVideo(file);
      const node = getNode(id);
      if (input.current !== picker || picker.closest('[inert]') || !isCanvasVideo(node) || node.data.locked
        || node.data.asset?.id !== asset?.id) {
        assetResources.discard([replacement.url]);
        return;
      }
      pendingUrls.current = [replacement.url];
      const asImport = imported || !asset && !getEdges().some(edge => edge.target === id) && !node.data.videoComposer?.prompt;
      updateNodeData(id, { asset: replacement, lastFrame: undefined, videoComposer: asImport ? undefined : node.data.videoComposer ?? composer,
        label: asImport && (!asset || node.data.label === asset.name) ? replacement.name : node.data.label });
    } catch (cause) {
      if (input.current === picker) setError(cause instanceof Error ? cause.message : '无法读取视频。');
    } finally {
      if (input.current === picker) setBusy(false);
    }
  }
  function saveVideoMetadata(width: number, height: number, duration: number) {
    const node = getNode(id);
    if (!isCanvasVideo(node) || !node.data.asset || node.data.asset.id !== asset?.id) return;
    const current = node.data.asset;
    if (current.width === width && current.height === height && current.duration === duration) return;
    updateNodeData(id, { asset: { ...current, width, height, duration } });
  }
  const onReplace = () => input.current?.click();
  const onDownload = () => { if (asset) void downloadAsset(asset).catch(() => setError('视频下载失败。')); };
  const onFullscreen = () => { void player.current?.requestFullscreen().catch(() => setError('无法进入全屏播放。')); };
  const edit = (change: Partial<VideoComposer>) => {
    const node = getNode(id);
    if (!isCanvasVideo(node) || node.data.locked || job.current || busy) return;
    const current = normalizeVideoComposer(node.data.videoComposer ?? defaultVideoComposer);
    updateNodeData(id, { videoComposer: normalizeVideoComposer({ ...current, ...change }) });
  };
  const connectable = isConnectable && !locked;
  return <div className="canvas-image-mount" style={size}>
    <ImagePromptNode kind="video" assetKind={imported ? 'video' : undefined} className={imported ? 'canvas-imported-video' : 'canvas-generated-video'}
      title={label} selected={selected} locked={locked} modelLabel={model.label} modelBrand={model.brand}
      onTitleChange={value => { if (!isNodeLocked(getNode(id))) updateNodeData(id, { label: value }); }}
      onSelectedChange={value => {
        if (value !== selected) setNodes(nodes => nodes.map(node => node.id === id
          ? { ...node, selected: value } : value ? { ...node, selected: false } : node));
      }}
      prompt={prompt} promptReadOnly={Boolean(promptEdge)} suggestion="Dust particles in a sunbeam"
      onPromptChange={prompt => edit({ prompt })} promptMentions={promptEdge ? [] : composer.mentions}
      mentionCandidates={mentions.candidates} onMentionEdit={promptEdge ? undefined : mentions.onEdit}
      onGenerate={run} canGenerateWithoutPrompt={klingFirstFrame} onCancelGeneration={cancel} generation={generation} playbackSlot={setControlsHost}
      playbackBelowActions={size.height >= size.width}
      textInput={!imported && <button type="button" className="image-node-input" disabled={locked} aria-label="Prompt input" data-connection-port="text" data-connected={Boolean(promptEdge) || undefined}>
        <span className="image-node-port-label"><ImagePromptIcon name="text" />Prompt</span><InputPortRing />
        <Handle type="target" id="prompt" position={Position.Left} isConnectable={connectable} /></button>}
      videoInput={!imported && <button type="button" className="image-node-input" disabled={locked} aria-label="Video input" data-connection-port="video" data-connected={videoRefs.length > 0 || undefined}>
        <span className="image-node-port-label"><Video size={12} />Video <span className="image-node-port-count">{videoRefs.length}/{videoInputHandles.length}</span></span>
        <InputPortRing />{inputSlots(videoInputHandles, occupied, connectable)}</button>}
      imageInputCount={pictureCount} imageInputLimit={videoImageHandles.length}
      references={[...imageRefs, ...videoRefs]} referenceScale={zoom}
      onRemoveReference={edgeId => { if (!locked) setEdges(edges => edges.filter(edge => edge.id !== edgeId)); }}
      outputConnected={edges.some(edge => edge.source === id)} handles={{ image: inputSlots(videoImageHandles, occupied, connectable),
        output: <Handle type="source" position={Position.Right} id="video" isConnectable={connectable} /> }}
      result={asset && <CanvasVideoPlayer key={asset.id} asset={asset} playerRef={player} onMetadata={saveVideoMetadata} onDownload={onDownload} controlsHost={imported ? undefined : controlsHost} />}
      toolbar={hideToolbar ? null : imported ? <ImportedMediaToolbar kind="video" className="nodrag nopan" replaceDisabled={busy || locked}
        onReplace={onReplace} onDownload={onDownload} onPreview={onFullscreen} /> :
        <CanvasVideoToolbar composer={composer} locked={Boolean(locked)} running={Boolean(generation) || busy} hasResult={Boolean(asset)} followsInputRatio={klingFirstFrame}
          onEdit={edit} onLock={() => updateNodeData(id, { locked: !locked })} onReplace={onReplace} onDownload={onDownload} onFullscreen={onFullscreen} />}
    />
    {selected && !hideToolbar && canvas && createPortal(<CanvasVideoInspector data={data} composer={imported ? undefined : composer} followsInputRatio={klingFirstFrame} onImport={onReplace} onEdit={edit} busy={Boolean(generation) || busy} />, canvas)}
    <input hidden type="file" ref={input} accept="video/mp4,.mp4" aria-label="选择 MP4 文件" onChange={event => {
      const picker = event.currentTarget, file = picker.files?.[0];
      picker.value = '';
      if (file && !locked && !busy && !job.current) void replace(file, picker);
    }} />
    {error && <button type="button" role="alert" className="nodrag" onClick={() => setError('')}>{error}</button>}
  </div>;
}
