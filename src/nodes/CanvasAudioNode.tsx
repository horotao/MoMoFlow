import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodesData, useReactFlow, useStore, type NodeProps } from '@xyflow/react';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { InputPortRing } from '../components/image-prompt-node/InputPortRing';
import { AudioWaveform } from './AudioWaveform';
import { AudioInspector, AudioToolbar } from './AudioNodeSettings';
import { audioModel, audioPinned, defaultAudioComposer, type AudioComposer } from './audioComposer';
import { assetResources } from './assetResources';
import { generateSunoAudio } from './apimartAudioClient';
import { defaultSunoOptions } from './suno';
import { audioPreview } from './audioPreview';
import { canvasImageSize } from './canvasImageGeometry';
import { composerRunEvent, type ComposerRunRequest } from './canvasComposerRun';
import { textOutputValue } from './textGeneration';
import { isCanvasAudio, isCanvasTextNode, type AppNode, type CanvasAudio, type CanvasText } from './types';
import { usePublishNodeGeneration } from './visibleCanvasText';
import './CanvasAudioNode.css';

export function CanvasAudioNode({ id, data, selected, isConnectable }: NodeProps<CanvasAudio>) {
  const { getNode, getEdges, updateNodeData, setNodes, setEdges } = useReactFlow<AppNode>();
  const canvas = useStore(state => state.domNode);
  const zoom = useStore(state => state.transform[2]);
  const hideTools = useStore(state => state.userSelectionActive || state.nodes.filter(n => n.selected).length > 1 || (!selected && state.transform[2] <= .14));
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState('');
  const pending = useRef<AbortController>();
  const task = useRef<string>();
  const mount = useRef<HTMLDivElement>(null);
  const composer = data.audioComposer ?? defaultAudioComposer;
  const history = data.audioHistory ?? [];
  const active = Math.max(0, history.findIndex(item => item.id === data.activeAudioId));
  const result = history[active];
  const locked = Boolean(data.locked);
  const busy = startedAt !== null;
  const edges = useEdges();
  const edge = edges.find(e => e.target === id && e.targetHandle === 'prompt');
  const source = useNodesData<CanvasText>(edge?.source ?? '');
  const prompt = edge ? source?.type === 'text' ? textOutputValue(source.data) : '' : composer.prompt;
  const connectable = isConnectable && !locked;
  usePublishNodeGeneration(id, busy);
  const stop = useCallback(() => {
    if (!pending.current) return;
    pending.current.abort();
    pending.current = undefined;
    setStartedAt(null);
    setError('已停止等待，已提交的云端任务可能继续计费。' + (task.current ? ' 任务编号：' + task.current : ''));
  }, []);
  useLayoutEffect(() => () => { pending.current?.abort(); }, []);
  useLayoutEffect(() => { if (locked) stop(); }, [locked, stop]);
  const run = useCallback(async () => {
    const node = getNode(id);
    if (!isCanvasAudio(node) || node.data.locked || pending.current) return false;
    const config = node.data.audioComposer ?? defaultAudioComposer;
    const input = getEdges().find(e => e.target === id && e.targetHandle === 'prompt');
    const upstream = input && getNode(input.source);
    const submitted = input ? upstream && isCanvasTextNode(upstream) ? textOutputValue(upstream.data) : '' : config.prompt;
    if (!submitted.trim()) return false;
    if (!Number.isInteger(config.quantity) || config.quantity < 1 || config.quantity > 20) {
      setError('生成数量须为 1–20 之间的整数。');
      return false;
    }
    const controller = new AbortController();
    pending.current = controller;
    task.current = undefined;
    setError('');
    setProgress(undefined);
    setStartedAt(Date.now());
    const originalId = node.data.activeAudioId;
    let firstId: string | undefined;
    function stillCurrent() {
      const current = getNode(id);
      return !controller.signal.aborted && isCanvasAudio(current) && !current.data.locked && !mount.current?.closest('[inert]')
        && (current.data.activeAudioId === originalId || (firstId !== undefined && current.data.activeAudioId === firstId));
    }
    try {
      for (let i = 0; i < config.quantity; i++) {
        if (!stillCurrent()) return false;
        task.current = undefined;
        await generateSunoAudio(submitted, config.suno ?? defaultSunoOptions, controller.signal,
          taskId => { task.current = taskId; }, fraction => setProgress((i + fraction) / config.quantity), result => {
            if (!stillCurrent()) {
              assetResources.discard([result.asset.url]);
              throw new Error('节点状态已改变，已停止接收生成结果。');
            }
            firstId ??= result.id;
            const activeAudioId = firstId;
            updateNodeData(id, current => {
              if (!isCanvasAudio(current)) return {};
              return { label: current.data.label === 'Audio' ? result.asset.name.replace(/\.[^.]+$/, '') : current.data.label,
                audioHistory: [...(current.data.audioHistory ?? []), result], activeAudioId };
            });
          });
        setProgress((i + 1) / config.quantity);
      }
      return true;
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '音乐生成失败。');
      return false;
    } finally {
      if (pending.current === controller) { pending.current = undefined; setStartedAt(null); }
    }
  }, [id, getNode, getEdges, updateNodeData]);
  useEffect(() => {
    function start(event: Event) {
      const detail = (event as CustomEvent<ComposerRunRequest>).detail;
      if (detail.id === id) detail.completion = run();
    }
    window.addEventListener(composerRunEvent.audio, start);
    return () => window.removeEventListener(composerRunEvent.audio, start);
  }, [id, run]);
  function edit(change: Partial<AudioComposer>) {
    const current = getNode(id);
    if (!isCanvasAudio(current) || current.data.locked || pending.current) return;
    const config = current.data.audioComposer ?? defaultAudioComposer;
    updateNodeData(id, { audioComposer: { prompt: config.prompt, quantity: config.quantity, pinned: audioPinned(config), suno: config.suno ?? defaultSunoOptions, ...change } });
  }
  const settings = { composer, disabled: locked || busy, edit };
  return <div ref={mount} className="canvas-image-mount" style={canvasImageSize('1:1')}>
    <ImagePromptNode kind="audio" className="canvas-audio-node" title={data.label} locked={locked} selected={selected}
      modelLabel={audioModel.name} modelBrand={audioModel.brand}
      onTitleChange={label => { if (!locked) updateNodeData(id, { label }); }}
      onSelectedChange={value => { if (value !== selected) setNodes(nodes => nodes.map(node => node.id === id
        ? { ...node, selected: value } : value ? { ...node, selected: false } : node)); }}
      prompt={prompt} promptReadOnly={Boolean(edge)} suggestion="描述想听的音乐、节奏或氛围…"
      quantity={composer.quantity} onQuantityChange={quantity => edit({ quantity })} onPromptChange={prompt => edit({ prompt })}
      generation={startedAt === null ? null : { id: startedAt, startedAt, estimatedSeconds: 90 * composer.quantity, progress }}
      onGenerate={run} onCancelGeneration={stop}
      textInput={<button type="button" className="image-node-input" disabled={locked} aria-label="Prompt input"
        data-connection-port="text" data-connected={Boolean(edge) || undefined}>
        <span className="image-node-port-label"><ImagePromptIcon name="text" />Prompt</span><InputPortRing />
        <Handle type="target" id="prompt" position={Position.Left} isConnectable={connectable} /></button>}
      outputConnected={edges.some(edge => edge.source === id)} handles={{ image: null, output: <Handle type="source" id="audio" position={Position.Right} isConnectable={connectable} /> }}
      references={edge ? [{ id: edge.id, kind: 'text', name: source?.data.label || 'Text' }] : []} referenceScale={zoom}
      onRemoveReference={edgeId => { if (!locked) setEdges(edges => edges.filter(e => e.id !== edgeId)); }}
      playbackSlot={setControlsHost} playbackBelowActions result={result && <AudioWaveform key={result.id} result={result} controlsHost={controlsHost} />}
      variants={history.map(item => ({ id: item.id, thumbnail: <ImagePromptIcon name="audio" /> }))} activeVariant={active}
      onVariantChange={index => {
        const item = history[index];
        if (locked || busy || !item) return;
        updateNodeData(id, { activeAudioId: item.id, audioComposer: { ...composer,
          prompt: edge ? composer.prompt : item.prompt, pinned: audioPinned(composer), suno: item.suno ?? composer.suno ?? defaultSunoOptions,
        } });
      }}
      toolbar={hideTools ? null : <AudioToolbar {...settings} result={result} locked={locked}
        onLock={() => updateNodeData(id, { locked: !locked })} onDownload={() => {
          const link = document.createElement('a');
          link.href = result?.asset?.url ?? audioPreview.url; link.download = result?.asset?.name ?? data.label + '.wav'; link.click();
        }} />} />
    {error && <div role="alert" className="text-node-error audio-node-error nodrag nopan nowheel" onPointerDown={event => event.stopPropagation()}>
      {error}<button type="button" aria-label="关闭音频生成提示" onClick={() => setError('')}>×</button></div>}
    {selected && !hideTools && canvas && createPortal(<AudioInspector {...settings} name={data.label} result={result} />, canvas)}
  </div>;
}
