import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodesData, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Video } from 'lucide-react';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { InputPortRing } from '../components/image-prompt-node/InputPortRing';
import { ImportedMediaToolbar } from '../components/image-prompt-node/ImportedMediaToolbar';
import { assetResources } from './assetResources';
import { canvasImageSize } from './canvasImageGeometry';
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
import { readVideoPreview } from './videoPreview';
import { usePublishNodeGeneration } from './visibleCanvasText';
import { isCanvasTextNode, isCanvasVideo, isNodeLocked, type AppNode, type CanvasImage, type CanvasText, type CanvasVideo, type VideoComposer } from './types';

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
  const pendingUrl = useRef<string>();
  const job = useRef<AbortController>();
  const [generation, setGeneration] = useState<{ id: number; startedAt: number; estimatedSeconds: number; ratio: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const { asset, label, locked } = data;
  const composer = data.videoComposer ?? defaultVideoComposer;
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
  const size = canvasImageSize(generation?.ratio ?? composer.ratio, generation ? undefined : asset);
  const internals = useUpdateNodeInternals();
  useLayoutEffect(() => internals(id), [id, internals, size.width, size.height, incoming, imported]);
  usePublishNodeGeneration(id, Boolean(generation));
  useLayoutEffect(() => {
    if (pendingUrl.current === asset?.url) pendingUrl.current = undefined;
  }, [asset?.url]);
  useLayoutEffect(() => () => {
    job.current?.abort();
    job.current = undefined;
    if (pendingUrl.current) assetResources.discard([pendingUrl.current]);
  }, []);
  const cancel = useCallback(() => {
    job.current?.abort();
    job.current = undefined;
    setGeneration(null);
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

  async function run() {
    const upstream = promptEdge && getNode(promptEdge.source);
    const runPrompt = upstream && isCanvasTextNode(upstream) ? textOutputValue(upstream.data) : prompt;
    if (locked || imported || !runPrompt.trim() || busy || job.current) return false;
    const controller = new AbortController();
    job.current = controller;
    setError('');
    const startedAt = Date.now();
    setGeneration({ id: startedAt, startedAt, estimatedSeconds: 2, ratio: composer.ratio });
    try {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 1800);
        controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      if (controller.signal.aborted) return false;
      const result = await readVideoPreview(composer, controller.signal);
      const node = getNode(id);
      if (controller.signal.aborted || !isCanvasVideo(node) || node.data.locked || node.data.asset?.id !== asset?.id || input.current?.closest('[inert]')) {
        assetResources.discard([result.url]);
        return false;
      }
      pendingUrl.current = result.url;
      updateNodeData(id, { asset: result, videoComposer: node.data.videoComposer ?? composer,
        label: node.data.label === 'Video' ? result.name.replace(/\.mp4$/i, '') : node.data.label });
      return true;
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '无法加载本地预览。');
      return false;
    } finally {
      if (job.current === controller) { job.current = undefined; setGeneration(null); }
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
      pendingUrl.current = replacement.url;
      const asImport = imported || !asset && !getEdges().some(edge => edge.target === id) && !node.data.videoComposer?.prompt;
      updateNodeData(id, { asset: replacement, videoComposer: asImport ? undefined : node.data.videoComposer ?? composer,
        label: asImport && (!asset || node.data.label === asset.name) ? replacement.name : node.data.label });
    } catch (cause) {
      if (input.current === picker) setError(cause instanceof Error ? cause.message : '无法读取视频。');
    } finally {
      if (input.current === picker) setBusy(false);
    }
  }
  const onReplace = () => input.current?.click();
  const onDownload = () => { if (asset) void downloadAsset(asset).catch(() => setError('视频下载失败。')); };
  const onFullscreen = () => { void player.current?.requestFullscreen().catch(() => setError('无法进入全屏播放。')); };
  const edit = (change: Partial<VideoComposer>) => {
    if (!locked) updateNodeData(id, { videoComposer: { ...composer, ...change } });
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
      onGenerate={run} onCancelGeneration={cancel} generation={generation} playbackSlot={setControlsHost}
      textInput={!imported && <button type="button" className="image-node-input" disabled={locked} aria-label="Prompt input" data-connection-port="text" data-connected={Boolean(promptEdge) || undefined}>
        <span className="image-node-port-label"><ImagePromptIcon name="text" />Prompt</span><InputPortRing />
        <Handle type="target" id="prompt" position={Position.Left} isConnectable={connectable} /></button>}
      videoInput={!imported && <button type="button" className="image-node-input" disabled={locked} aria-label="Video input" data-connection-port="video" data-connected={videoRefs.length > 0 || undefined}>
        <span className="image-node-port-label"><Video size={12} />Video <span className="image-node-port-count">{videoRefs.length}/{videoInputHandles.length}</span></span>
        <InputPortRing />{inputSlots(videoInputHandles, occupied, connectable)}</button>}
      imageInputCount={imageRefs.filter(ref => ref.kind === 'image').length} imageInputLimit={videoImageHandles.length}
      references={[...imageRefs, ...videoRefs]} referenceScale={zoom}
      onRemoveReference={edgeId => { if (!locked) setEdges(edges => edges.filter(edge => edge.id !== edgeId)); }}
      outputConnected={edges.some(edge => edge.source === id)} handles={{ image: inputSlots(videoImageHandles, occupied, connectable),
        output: <Handle type="source" position={Position.Right} id="video" isConnectable={connectable} /> }}
      result={asset && <CanvasVideoPlayer key={asset.id} asset={asset} playerRef={player} controlsHost={imported ? undefined : controlsHost} />}
      toolbar={hideToolbar ? null : imported ? <ImportedMediaToolbar kind="video" className="nodrag nopan" replaceDisabled={busy || locked}
        onReplace={onReplace} onDownload={onDownload} onPreview={onFullscreen} /> :
        <CanvasVideoToolbar composer={composer} locked={Boolean(locked)} running={Boolean(generation) || busy} hasResult={Boolean(asset)}
          onEdit={edit} onLock={() => updateNodeData(id, { locked: !locked })} onReplace={onReplace} onDownload={onDownload} onFullscreen={onFullscreen} />}
    />
    {selected && !hideToolbar && canvas && createPortal(<CanvasVideoInspector data={data} composer={imported ? undefined : composer} onImport={onReplace} busy={Boolean(generation) || busy} />, canvas)}
    <input hidden type="file" ref={input} accept="video/mp4,.mp4" aria-label="选择 MP4 文件" onChange={event => {
      const picker = event.currentTarget, file = picker.files?.[0];
      picker.value = '';
      if (file && !locked && !busy && !job.current) void replace(file, picker);
    }} />
    {error && <button type="button" role="alert" className="nodrag" onClick={() => setError('')}>{error}</button>}
  </div>;
}
