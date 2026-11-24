import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { ImageInpaintEditor } from '../components/image-prompt-node/ImageInpaintEditor';
import { ImageGenerationSettings } from '../components/image-prompt-node/ImageGenerationOptions';
import { defaultImagePromptModelSelection, type ImagePromptModelSelection } from '../components/image-prompt-node/imagePromptModels';
import { createLibraryNode } from '../components/libraryCatalog';
import { selectedImageResult } from './annotationGraph';
import { assetResources } from './assetResources';
import { canvasImageBaseSize, canvasImageSize, hasImageDimensions } from './canvasImageGeometry';
import { measureAsset } from './fileMedia';
import { inpaintSettings, prepareInpaintInput, type InpaintStroke } from './imageInpaint';
import { changeComposerSettings, composerAspectRatios, composerModelSelection } from './imageComposerSettings';
import { isCanvasImageNode, isNodeLocked, type AppNode, type CanvasImage, type FileAsset, type ImageInpaintInput } from './types';

const initialSettings: CanvasImage['data'] = {
  ...inpaintSettings, imageInputs: 1,
  composer: { prompt: '', quantity: 1, ratio: 'auto', selection: defaultImagePromptModelSelection },
};

export function useCanvasImageInpaint(id: string, asset?: FileAsset, disabled = false) {
  const flow = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const [source, setSource] = useState<FileAsset>();
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef<AbortController>();
  const focus = useRef(false);
  const active = Boolean(source && !disabled && asset?.id === source.id && asset.url === source.url);
  const size = active ? canvasImageSize('auto', source) : undefined;

  useEffect(() => () => operation.current?.abort(), []);
  useLayoutEffect(() => { internals(id); }, [id, internals, active, size?.width, size?.height]);
  useEffect(() => {
    if (source && !active) {
      operation.current?.abort();
      setSource(undefined);
      setSaving(false);
    }
  }, [source, active]);
  useLayoutEffect(() => {
    if (source || !focus.current) return;
    focus.current = false;
    document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .image-node-tools-label`)?.focus({ preventScroll: true });
  }, [id, source]);

  function matches(image: FileAsset) {
    const node = flow.getNode(id);
    if (!node || !isCanvasImageNode(node) || isNodeLocked(node) || (node.parentId && isNodeLocked(flow.getNode(node.parentId)))) return false;
    const displayed = selectedImageResult(node);
    return displayed?.id === image.id && displayed.url === image.url;
  }

  async function open() {
    if (!asset || disabled || active) return;
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setError('');
    const measured = hasImageDimensions(asset) ? asset : await measureAsset(asset);
    if (controller.signal.aborted || !matches(asset)) return;
    if (!hasImageDimensions(measured)) { setError('无法读取重绘图片，请重试。'); return; }
    flow.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id })));
    setSettings(initialSettings);
    setSource(measured);
  }

  function close(restoreFocus = true) {
    operation.current?.abort();
    focus.current = restoreFocus;
    setSaving(false);
    setError('');
    setSource(undefined);
  }

  async function submit(prompt: string, strokes: readonly InpaintStroke[], quantity: number) {
    if (!source || !size || !active || saving || operation.current === undefined || !matches(source)) return;
    const { signal } = operation.current;
    const release = assetResources.retain([source.url]);
    setSaving(true);
    setError('');
    let prepared: ImageInpaintInput | undefined;
    let committed = false;
    try {
      prepared = await prepareInpaintInput(source, strokes, size, signal);
      if (signal.aborted || !matches(source)) return;
      const bounds = flow.getNodesBounds([id]);
      let x = bounds.x + bounds.width + 64;
      const y = bounds.y;
      const occupied = flow.getNodes().filter(node => !node.hidden && node.type !== 'canvas-group')
        .map(node => flow.getNodesBounds([node.id]));
      for (const other of occupied.sort((a, b) => a.x - b.x)) {
        if (y < other.y + other.height && y + size.height > other.y && x < other.x + other.width + 32 && x + size.width + 32 > other.x) {
          x = other.x + other.width + 64;
        }
      }
      const node = createLibraryNode('image', { x: x + (size.width - canvasImageBaseSize) / 2, y });
      node.data = {
        ...settings, label: '局部重绘', inpaint: prepared,
        composer: { ...settings.composer, prompt, quantity },
      };
      flushSync(() => {
        close(false);
        flow.setNodes(nodes => [...nodes.map(current => current.selected ? { ...current, selected: false } : current), node]);
        flow.setEdges(edges => [...edges, { id: crypto.randomUUID(), source: id, target: node.id, sourceHandle: 'result', targetHandle: 'image-0' }]);
      });
      committed = true;
      window.dispatchEvent(new CustomEvent('describer-run', { detail: node.id }));
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : '无法准备局部重绘，请重试。');
    } finally {
      release();
      if (prepared && !committed) assetResources.discard([prepared.image.url, prepared.mask.url]);
      if (!signal.aborted) setSaving(false);
    }
  }

  return {
    open, active, size,
    controls: {
      modelSelection: composerModelSelection(settings),
      onModelSelectionChange: (selection: ImagePromptModelSelection) => {
        if (!saving) setSettings(current => ({ ...current, ...changeComposerSettings(current, { selection }) }));
      },
      aspectRatio: settings.composer.ratio,
      aspectRatioChoices: composerAspectRatios(settings),
      onAspectRatioChange: (ratio: string) => {
        if (!saving) setSettings(current => ({ ...current, ...changeComposerSettings(current, { ratio }) }));
      },
    },
    editor: active && source && size ? <ImageInpaintEditor source={source} size={size} saving={saving} error={error}
      generationOptions={(prompt, quantity) => <ImageGenerationSettings className="image-inpaint-draft-options" inpaintOnly referenceCount={1}
        data={{ ...settings, composer: { ...settings.composer, prompt, quantity }, locked: saving }}
        onChange={patch => setSettings(current => ({ ...current, ...patch }))} />}
      onSubmit={(prompt, strokes, quantity) => void submit(prompt, strokes, quantity)} onCancel={close}
      onError={() => { close(); setError('无法显示重绘图片，请重试。'); }} /> : null,
    error: !active && error ? <button className="nodrag nopan" type="button" role="alert" onClick={() => setError('')}>{error}</button> : null,
  };
}
