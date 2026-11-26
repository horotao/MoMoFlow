import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodesData, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Video } from 'lucide-react';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { InputPortRing } from '../components/image-prompt-node/InputPortRing';
import { ImportedMediaToolbar } from '../components/image-prompt-node/ImportedMediaToolbar';
import { selectedAudioAsset } from './audioPreview';
import { assetResources } from './assetResources';
import { canvasImageSize, hasImageDimensions } from './canvasImageGeometry';
import { CanvasVideoPlayer } from './CanvasVideoPlayer';
import { CanvasVideoToolbar } from './CanvasVideoToolbar';
import { CanvasVideoInspector } from './CanvasVideoInspector';
import { useCanvasMentions } from './CanvasMentionContext';
import { readCanvasVideo } from './importCanvasVideo';
import { downloadAsset, measureAsset } from './fileMedia';
import { composerRunEvent, type ComposerRunRequest } from './canvasComposerRun';
import { textOutputValue } from './textGeneration';
import { acceptsVideoAudio, videoAudioHandles, defaultVideoComposer, videoFrameHandles, videoImageHandles, videoInputHandles, videoModelDisplay } from './videoComposer';
import { generateApimartVideo, videoStopNotice } from './apimartVideoClient';
import { normalizeVideoComposer, videoOptions } from './apimartVideo';
import { selectedImageResult } from './annotationGraph';
import { usePublishNodeGeneration } from './visibleCanvasText';
import { isCanvasAudio, isCanvasTextNode, isCanvasVideo, isImageGeneratorNode, isNodeLocked, type AppNode, type CanvasAudio, type CanvasImage, type CanvasText, type CanvasVideo, type FileAsset, type VideoComposer } from './types';

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
  const sources = useNodesData<CanvasAudio | CanvasImage | CanvasText | CanvasVideo>(sourceIds);
  const promptEdge = incoming.find(edge => edge.targetHandle === 'prompt');
  const promptSource = sources.find(source => source.id === promptEdge?.source);
  const prompt = promptEdge ? promptSource?.type === 'text' ? textOutputValue(promptSource.data) : '' : composer.prompt;
  const mentions = useCanvasMentions(id);
  const frameMode = videoOptions(composer).imageMode === 'first-last';
  const audioEnabled = !imported && acceptsVideoAudio(composer);
  const mediaInputs = [...videoFrameHandles, ...videoImageHandles, ...videoInputHandles, ...videoAudioHandles].flatMap(handle => {
    const edge = incoming.find(edge => edge.targetHandle === handle);
    if (!edge) return [];
    const source = sources.find(node => node.id === edge.source);
    const kind: 'audio' | 'video' | 'image' = videoAudioHandles.includes(handle) ? 'audio' : videoInputHandles.includes(handle) ? 'video' : 'image';
    const asset = source?.type === 'sunburst' ? selectedImageResult(source) : source?.type === 'video' ? source.data.asset : source?.type === 'audio' ? selectedAudioAsset(source.data) : undefined;
    const name = kind === 'audio' ? asset?.name ?? source?.data.label ?? 'Audio' : kind === 'image' ? asset?.name || source?.data.label || '上游 Image' : source?.data.label || 'Video';
    let videoImageRole: 'First' | 'Last' | 'Ref' | undefined;
    if (frameMode && kind === 'image') {
      videoImageRole = handle === 'first-frame' ? 'First' : handle === 'last-frame' ? 'Last' : 'Ref';
    }
    return [{ id: edge.id, kind, asset, url: asset?.url, name, videoImageRole }];
  });
  const references = promptEdge ? [{ id: promptEdge.id, kind: 'text' as const, name: promptSource?.data.label || '上游 Text' }, ...mediaInputs] : mediaInputs;
  const followsInputRatio = mediaInputs.some(input => input.kind !== 'audio');
  const reference = mediaInputs.find(input => input.kind !== 'audio' && input.asset)?.asset;
  const [measured, setMeasured] = useState<FileAsset>();
  useEffect(() => {
    if (reference?.kind !== 'image' || hasImageDimensions(reference)) return;
    let current = true;
    void measureAsset(reference).then(image => { if (current && hasImageDimensions(image)) setMeasured(image); });
    return () => { current = false; };
  }, [reference]);
  const dimensions = reference && (hasImageDimensions(reference) ? reference : measured?.url === reference.url ? measured : undefined);
  const nextRatio = dimensions ? `${dimensions.width}:${dimensions.height}` : composer.ratio;
  const size = canvasImageSize(generation?.ratio ?? nextRatio, !generation && !dimensions && asset && hasImageDimensions(asset) ? asset : undefined);
  const internals = useUpdateNodeInternals();
  useLayoutEffect(() => internals(id), [id, internals, size.width, size.height, incoming, imported, frameMode, audioEnabled]);
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

  const pictureCount = mediaInputs.filter(ref => ref.kind === 'image').length;
  const videoCount = mediaInputs.filter(ref => ref.kind === 'video').length;
  const audioCount = mediaInputs.filter(ref => ref.kind === 'audio').length;
  const klingFirstFrame = composer.model === 'kling' && pictureCount === 1 && !videoCount;

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
    setGeneration({ id: startedAt, startedAt, estimatedSeconds: 120, ratio: nextRatio });
    try {
      const inputs = (handles: string[], resolve: (node: AppNode | undefined) => FileAsset | undefined) => handles.flatMap(handle => {
        const edge = liveEdges.find(edge => edge.targetHandle === handle);
        if (!edge) return [];
        const asset = resolve(getNode(edge.source));
        if (!asset) throw new Error('有连接的参考素材尚未就绪，请先生成或导入素材。');
        return [{ nodeId: edge.source, asset }];
      });
      const useFrames = videoOptions(config).imageMode === 'first-last';
      if (useFrames && liveEdges.some(edge => videoImageHandles.includes(edge.targetHandle ?? '') || videoInputHandles.includes(edge.targetHandle ?? ''))) {
        throw new Error('首尾帧模式只接收帧图片。请断开普通参考素材，或切换到 Auto。');
      }
      if (useFrames && !videoFrameHandles.every(handle => liveEdges.some(edge => edge.targetHandle === handle))) {
        throw new Error('请分别连接首帧和尾帧图片。');
      }
      const images = inputs([...videoFrameHandles, ...videoImageHandles], node => isImageGeneratorNode(node) ? selectedImageResult(node) : undefined);
      const videos = inputs(videoInputHandles, node => isCanvasVideo(node) ? node.data.asset : undefined).map(ref => ref.asset);
      const audio = inputs(videoAudioHandles, node => isCanvasAudio(node) ? selectedAudioAsset(node.data) : undefined).map(ref => ref.asset);
      const result = await generateApimartVideo(config, runPrompt,
        textEdge ? undefined : config.mentions, images, videos, audio, controller.signal, taskId => { submittedTask.current = taskId; });
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
    const next = normalizeVideoComposer({ ...current, ...change });
    if (acceptsVideoAudio(current) && !acceptsVideoAudio(next) && audioCount) {
      setEdges(edges => edges.filter(edge => edge.target !== id || !videoAudioHandles.includes(edge.targetHandle ?? '')));
    }
    updateNodeData(id, { videoComposer: next });
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
      frameInputs={frameMode && videoFrameHandles.map((handle, i) => {
        const label = i === 0 ? 'First frame' : 'Last frame';
        return <button key={handle} type="button" aria-label={label} className="image-node-input" data-connection-port={handle}
          data-connected={occupied.has(handle) || undefined} disabled={locked}>
          <span className="image-node-port-label"><span className="image-node-port-icon image-node-port-icon-image" aria-hidden="true" />{label}</span>
          <InputPortRing /><Handle type="target" position={Position.Left} id={handle} isConnectable={connectable} />
        </button>;
      })}
      videoInput={!imported && <button type="button" className="image-node-input" disabled={locked} aria-label="Video input" data-connection-port="video" data-connected={videoCount > 0 || undefined}>
        <span className="image-node-port-label"><Video size={12} />Video <span className="image-node-port-count">{videoCount}/{videoInputHandles.length}</span></span>
        <InputPortRing />{inputSlots(videoInputHandles, occupied, connectable)}</button>}
      audioInput={audioEnabled && <button type="button" className="image-node-input" disabled={locked} aria-label="Audio input"
        data-connection-port="audio" data-connected={audioCount > 0 || undefined}>
        <span className="image-node-port-label"><ImagePromptIcon name="audio" />Audio <span className="image-node-port-count">{audioCount}/{videoAudioHandles.length}</span></span>
        <InputPortRing />{inputSlots(videoAudioHandles, occupied, connectable)}</button>}
      imageInputCount={frameMode ? mediaInputs.filter(ref => ref.videoImageRole === 'Ref').length : pictureCount} imageInputLimit={videoImageHandles.length}
      references={references}
      onRemoveReference={edgeId => { if (!locked) setEdges(edges => edges.filter(edge => edge.id !== edgeId)); }}
      outputConnected={edges.some(edge => edge.source === id)} handles={{ image: <>{!frameMode && videoFrameHandles.filter(handle => occupied.has(handle)).map(handle =>
        <Handle key={handle} type="target" position={Position.Left} id={handle} isConnectable={false} style={{ pointerEvents: 'none' }} />)}
        {inputSlots(videoImageHandles, occupied, connectable && (frameMode || pictureCount < videoImageHandles.length))}</>,
        output: <Handle type="source" position={Position.Right} id="video" isConnectable={connectable} /> }}
      result={asset && <CanvasVideoPlayer key={asset.id} asset={asset} playerRef={player} onMetadata={saveVideoMetadata} onDownload={onDownload} controlsHost={imported ? undefined : controlsHost} />}
      toolbar={hideToolbar ? null : imported ? <ImportedMediaToolbar kind="video" className="nodrag nopan" replaceDisabled={busy || locked}
        onReplace={onReplace} onDownload={onDownload} onPreview={onFullscreen} /> :
        <CanvasVideoToolbar composer={composer} locked={Boolean(locked)} running={Boolean(generation) || busy} hasResult={Boolean(asset)} followsInputRatio={followsInputRatio}
          onEdit={edit} onLock={() => updateNodeData(id, { locked: !locked })} onReplace={onReplace} onDownload={onDownload} onFullscreen={onFullscreen} />}
    />
    {selected && !hideToolbar && canvas && createPortal(<CanvasVideoInspector data={data} composer={imported ? undefined : composer} followsInputRatio={followsInputRatio} onEdit={edit} busy={Boolean(generation) || busy} />, canvas)}
    <input hidden type="file" ref={input} accept="video/mp4,.mp4" aria-label="选择 MP4 文件" onChange={event => {
      const picker = event.currentTarget, file = picker.files?.[0];
      picker.value = '';
      if (file && !locked && !busy && !job.current) void replace(file, picker);
    }} />
    {error && <button type="button" role="alert" className="nodrag" onClick={() => setError('')}>{error}</button>}
  </div>;
}
