import { useCanvasMentions } from './CanvasMentionContext';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Handle, Position, useEdges, useNodesData, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptToolbar } from '../components/image-prompt-node/ImagePromptToolbar';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { InputPortRing } from '../components/image-prompt-node/InputPortRing';
import { ImagePromptGeneration } from '../components/image-prompt-node/ImagePromptGeneration';
import { TextOutput } from '../components/image-prompt-node/TextOutput';
import { TextModelPicker } from '../components/image-prompt-node/TextModelPicker';
import { usePublishTextGeneration, usePublishVisibleText } from './visibleCanvasText';
import { textInputReferences, textReferenceEdges } from './textReferences';
import { prepareTextRequest, runTextBatch, type TextBatchItem } from './textGenerationClient';
import { completeTextBatchResult, selectTextResult, textGenerationInput, textHistory, textModelSelection } from './textGeneration';
import { textModelDisplay } from '../components/image-prompt-node/textModels';
import { imageInputHandles, isImageInputHandle } from './connectionRules';
import { isCanvasTextNode, isNodeLocked, type AppNode, type SunburstNode, type CanvasText, type TextComposerData } from './types';
import { canvasTextRunEvent, type CanvasTextRunRequest } from './canvasTextRun';
import '../components/image-prompt-node/text-prompt-node.css';
import './CanvasImageNode.css';

interface TextBatchState {
  id: string; prompt: string; model: string; previousResultId?: string; items: TextBatchItem[];
  settings: Pick<TextComposerData, 'reasoningEffort' | 'webSearch'>;
  finished?: boolean; finalResultId?: string;
}

export function CanvasTextNode({ id, data, selected, isConnectable }: NodeProps<CanvasText>) {
  const { setNodes, setEdges, updateNodeData, getNode, getNodes, getEdges } = useReactFlow<AppNode>();
  const edges = useEdges();
  const mentions = useCanvasMentions(id);
  const internals = useUpdateNodeInternals();
  const overview = useStore(state => Math.round(state.transform[2] * 100) <= 14);
  const toolbarHidden = useStore(state => state.userSelectionActive || state.nodes.filter(node => node.selected).length > 1);
  const zoom = useStore(state => state.transform[2]);
  const composer = { ...data.textComposer, selection: textModelSelection(data.textComposer.selection) };
  const [batch, setBatch] = useState<TextBatchState | null>(null);
  const [viewingId, setViewing] = useState<string>();
  const viewing = useRef<string>();
  const [revealingResult, setRevealingResult] = useState<string>();
  const revealTimer = useRef<ReturnType<typeof setTimeout>>();
  const request = useRef<AbortController>();
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const history = textHistory(data);
  const active = history.find(result => result.id === data.activeTextResultId) ?? history[history.length - 1];
  const pending = (item: TextBatchItem) => item.state === 'queued' || item.state === 'running';
  const item = batch && (viewingId ? batch.items.find(item => item.id === viewingId)
    : batch.items.find(pending) ?? [...batch.items].reverse().find(item => item.result) ?? batch.items[0]);
  const showingRun = Boolean(item && pending(item));
  usePublishTextGeneration(id, Boolean(batch?.items.some(pending)));
  const outputId = item?.id ?? active?.id;
  usePublishVisibleText(id, item ? item.result : active);
  const referenceEdges = useMemo(() => textReferenceEdges(id, edges), [id, edges]);
  const referenceSources = useMemo(() => referenceEdges.map(edge => edge.source), [referenceEdges]);
  const sourceNodes = useNodesData<SunburstNode | CanvasText>(referenceSources);
  const inputs = textInputReferences(referenceEdges, sourceNodes);
  const references = referenceEdges.filter(edge => isImageInputHandle(edge.targetHandle));
  const occupied = new Set(references.map(edge => edge.targetHandle));
  const available = imageInputHandles.find(handle => !occupied.has(handle));
  const connectedText = edges.some(edge => edge.target === id && edge.targetHandle === 'text');
  const connectable = isConnectable && !data.locked;
  useLayoutEffect(() => { internals(id); }, [id, internals, connectedText, references.length, available]);
  useEffect(() => () => { request.current?.abort(); clearTimeout(revealTimer.current); }, []);
  useLayoutEffect(() => {
    if (showingRun && follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [item?.text, showingRun]);
  useLayoutEffect(() => {
    if (showingRun) follow.current = true;
    if (scroller.current) scroller.current.scrollTop = showingRun ? scroller.current.scrollHeight : 0;
  }, [outputId, showingRun]);
  useLayoutEffect(() => {
    if (batch?.finished && batch.items.every(item => !item.result || history.some(result => result.id === item.id))
      && (!batch.finalResultId || data.activeTextResultId === batch.finalResultId)) setBatch(null);
  }, [batch, history, data.activeTextResultId]);
  function edit(change: Partial<TextComposerData>) {
    if (!data.locked) updateNodeData(id, {
      ...(!data.textHistory?.length && data.text ? { textHistory: history } : {}),
      textComposer: { ...composer, ...change },
    });
  }
  const currentGenerate = useRef(generate);
  useLayoutEffect(() => { currentGenerate.current = generate; });
  useEffect(() => {
    const run = (event: Event) => {
      const detail = (event as CustomEvent<CanvasTextRunRequest>).detail;
      if (detail.id === id) detail.completion = currentGenerate.current(true);
    };
    window.addEventListener(canvasTextRunEvent, run);
    return () => window.removeEventListener(canvasTextRunEvent, run);
  }, [id]);
  async function generate(fromSelection = false) {
    if (request.current || batch || data.locked) return;
    let plan;
    try { plan = textGenerationInput(id, getNodes(), getEdges()); }
    catch (error) { setError(error instanceof Error ? error.message : '请检查输入。'); return; }
    const controller = new AbortController();
    request.current = controller;
    const previousHistory = history;
    const prompt = composer.prompt;
    const { quantity, ...input } = plan;
    const ids = Array.from({ length: quantity }, () => crypto.randomUUID());
    const initial: TextBatchState = { id: crypto.randomUUID(), prompt, model: input.model, previousResultId: active?.id,
      settings: { reasoningEffort: input.reasoningEffort, webSearch: input.webSearch },
      items: ids.map(id => ({ id, state: 'queued', text: '' })) };
    follow.current = true;
    clearTimeout(revealTimer.current); setRevealingResult(undefined);
    setError(''); viewing.current = undefined; setViewing(undefined); setBatch(initial);
    try {
      const execute = await prepareTextRequest(input, controller.signal);
      const items = await runTextBatch(ids, prompt, execute, controller.signal, {
        onChange: items => {
          if (request.current === controller && !controller.signal.aborted) setBatch({ ...initial, items });
        },
        onCompleted: result => {
          if (controller.signal.aborted) return;
          const select = !viewing.current || viewing.current === result.id;
          if (select) {
            clearTimeout(revealTimer.current); setRevealingResult(result.id);
            revealTimer.current = setTimeout(() => setRevealingResult(undefined), 450);
          }
          // React Flow may publish getNode() a frame later. Functional node
          // updates keep simultaneous completions from overwriting siblings.
          setNodes(nodes => nodes.map(node => node.id === id && isCanvasTextNode(node) ? {
            ...node, data: { ...node.data, ...completeTextBatchResult({ ...node.data,
              textHistory: node.data.textHistory?.length ? node.data.textHistory : previousHistory }, result, ids, select) },
          } : node));
        },
      });
      if (controller.signal.aborted || !getNode(id)) return;
      const completed = items.flatMap(item => item.result ? [item.result] : []);
      const chosen = viewing.current;
      const finalResultId = !chosen || (ids.includes(chosen) && !completed.some(result => result.id === chosen))
        ? completed[completed.length - 1]?.id ?? initial.previousResultId : chosen;
      const finish = () => setNodes(nodes => nodes.map(node => {
        if (node.id !== id || !isCanvasTextNode(node)) return node;
        // Reconcile the finished batch as well as per-item commits, including
        // an undo made while other variants were still running.
        let finished = node.data;
        for (const result of completed) finished = { ...finished, ...completeTextBatchResult(finished, result, ids, false) };
        const result = completed.find(result => result.id === finalResultId) ?? textHistory(finished).find(result => result.id === finalResultId);
        return { ...node, data: { ...finished, ...(result ? selectTextResult(finished, result) : {}) } };
      }));
      if (fromSelection) flushSync(finish);
      else finish();
      setBatch({ ...initial, items, finished: true, finalResultId });
      const failures = items.flatMap((item, index) => item.error ? [`第 ${index + 1} 份：${item.error}`] : []);
      if (failures.length) setError(`${completed.length} 份成功，${failures.length} 份失败。不会自动重试。\n${failures.join('\n')}`);
      return completed.length > 0;
    } catch (error) {
      if (!controller.signal.aborted) { setBatch(null); setError(error instanceof Error ? error.message : '文本生成失败，请检查网络后手动重试。'); }
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  }
  function cancel() {
    request.current?.abort();
    const chosen = viewing.current;
    const fallback = batch && (!chosen || batch.items.some(item => item.id === chosen && !item.result))
      ? [...batch.items].reverse().find(item => item.result)?.result : undefined;
    if (fallback) setNodes(nodes => nodes.map(node => node.id === id && isCanvasTextNode(node)
      ? { ...node, data: { ...node.data, ...selectTextResult(node.data, fallback) } } : node));
    request.current = undefined; setBatch(null);
    setError('已停止本批生成，已完成结果已保留。已提交请求仍可能计费。');
  }
  const output = item ? item.text : data.text;
  // The reference uses a 20s visual estimate and a 40s thumbnail timeline.
  const generation = item && showingRun ? { id: item.id, startedAt: item.startedAt, estimatedSeconds: 20 } : null;
  const batchIds = new Set(batch?.items.map(item => item.id));
  const variants = [
    ...history.filter(result => !batchIds.has(result.id)).map(result => ({ id: result.id, thumbnail: <ImagePromptIcon name="history-text" /> })),
    ...(batch?.items.map(item => ({ id: item.id, pending: pending(item), thumbnail: pending(item)
      ? <div className="text-node-history-loading" aria-hidden="true"><ImagePromptGeneration state={{ id: item.id, startedAt: item.startedAt,
        estimatedSeconds: 20, progress: item.state === 'queued' ? 0 : undefined }} fillOnly /></div>
      : item.error ? <span title={item.error}><ImagePromptIcon name="info" /></span> : <ImagePromptIcon name="history-text" /> })) ?? []),
  ];
  const format = composer.format;
  const model = textModelDisplay(composer.selection);
  const controls = { locked: Boolean(data.locked), onLockedChange: (locked: boolean) => updateNodeData(id, { locked }) };
  return <div className="canvas-image-mount canvas-text-mount" style={{ width: 384, height: 384 }}>
    <ImagePromptNode kind="text" {...controls} title={data.label || 'Text'} modelLabel={model.label} modelBrand={model.brand}
      onTitleChange={label => {
        const node = getNode(id);
        if (node && !isNodeLocked(node)) updateNodeData(id, { label });
      }}
      selected={selected} onSelectedChange={value => {
        if (selected !== value) setNodes(nodes => nodes.map(node => node.id === id ? { ...node, selected: value } : value ? { ...node, selected: false } : node));
      }}
      promptMentions={composer.mentions} mentionCandidates={mentions.candidates} onMentionEdit={mentions.onEdit}
      prompt={composer.prompt} onPromptChange={prompt => edit({ prompt })} suggestion="Short film logline and synopsis"
      quantity={composer.quantity} onQuantityChange={quantity => edit({ quantity })} onGenerate={() => { void generate(); }} onCancelGeneration={cancel} canGenerateWithoutPrompt={connectedText}
      textFormat={format} onTextFormatChange={format => edit({ format })}
      generation={showingRun ? generation : null}
      variants={variants} activeVariant={Math.max(0, variants.findIndex(variant => variant.id === outputId))}
      onVariantChange={index => {
        if (data.locked) return;
        clearTimeout(revealTimer.current); setRevealingResult(undefined);
        const variant = variants[index];
        if (!variant) return;
        viewing.current = variant.id; setViewing(variant.id);
        const batchItem = batch?.items.find(item => item.id === variant.id);
        const result = history.find(result => result.id === variant.id) ?? batchItem?.result;
        if (result) setNodes(nodes => nodes.map(node => node.id === id && isCanvasTextNode(node)
          ? { ...node, data: { ...node.data, ...selectTextResult(node.data, result) } } : node));
        else if (batch) {
          follow.current = true;
          setNodes(nodes => nodes.map(node => {
            if (node.id !== id || !isCanvasTextNode(node)) return node;
            const previous = [...batch.items].reverse().find(item => item.result)?.result
              ?? textHistory(node.data).find(result => result.id === batch.previousResultId);
            return { ...node, data: { ...node.data, ...(previous ? selectTextResult(node.data, previous) : {}),
              textComposer: { ...node.data.textComposer, ...batch.settings, prompt: batch.prompt, selection: { modelIds: [batch.model], autoSelect: false, multiple: false } } } };
          }));
        }
      }}
      textResult={item || output ? <div ref={scroller} className="text-node-output-scroll" onScroll={event => {
        const el = event.currentTarget; follow.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
      }}>
        {item?.error ? <div className="text-node-output-source">{item.error}</div>
          : <TextOutput key={outputId} text={output} citations={item ? item.result?.citations : active?.citations} format={format} streaming={showingRun} reveal={showingRun || Boolean(outputId && revealingResult === outputId)} />}
      </div> : undefined}
      imageInputCount={references.length} outputConnected={edges.some(edge => edge.source === id)}
      references={inputs} referenceScale={zoom}
      onRemoveReference={edgeId => {
        if (!data.locked) setEdges(current => current.filter(edge => edge.target !== id || edge.id !== edgeId));
      }}
      textInput={<button type="button" className="image-node-input text-node-input" data-connection-port="text" data-connected={connectedText || undefined} aria-label="Text input" disabled={data.locked}>
        <span className="image-node-port-label"><ImagePromptIcon name="text" />Text</span>
        <InputPortRing />
        <Handle type="target" position={Position.Left} id="text" isConnectable={connectable} />
      </button>}
      handles={{ image: [...(available ? [available] : []), ...imageInputHandles.filter(handle => occupied.has(handle))].map(handle =>
        <Handle key={handle} type="target" position={Position.Left} id={handle} isConnectable={connectable && handle === available} style={{ pointerEvents: handle === available ? undefined : 'none' }} />),
      output: <Handle type="source" position={Position.Right} id="text" isConnectable={connectable} /> }}
      toolbar={overview && !selected ? null : <ImagePromptToolbar className="nodrag nopan" {...controls} hidden={toolbarHidden}
        textHasOutput={Boolean(batch || data.text)}
        textModelPicker={<TextModelPicker selection={composer.selection} onChange={selection => edit({ selection })} locked={data.locked} hidden={toolbarHidden} />} />}
    />
    {error && <div className="text-node-error nodrag nopan nowheel" role="alert" onPointerDown={event => event.stopPropagation()}>{error}<button type="button" aria-label="关闭文本生成提示" onClick={() => setError('')}>×</button></div>}
  </div>;
}
