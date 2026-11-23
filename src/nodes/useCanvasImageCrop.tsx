import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { ImageCropEditor } from '../components/image-prompt-node/ImageCropEditor';
import { canvasImageSize, hasImageDimensions } from './canvasImageGeometry';
import { cropImageAsset, sameCrop } from './imageCrop';
import { assetResources } from './assetResources';
import { measureAsset } from './fileMedia';
import { isCanvasImageNode, isNodeLocked, type AppNode, type FileAsset, type ImageCropRect } from './types';

export function requestImageCrop(id: string) {
  window.dispatchEvent(new CustomEvent('canvas-crop-image', { detail: id }));
}

export function useCanvasImageCrop(id: string, asset?: FileAsset, disabled = false) {
  const { getNode, updateNodeData, setNodes } = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const [session, setSession] = useState<{ asset: FileAsset; source: FileAsset }>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const operation = useRef(0);
  const pending = useRef<string>();
  const mounted = useRef(true);
  const restoreFocus = useRef(false);
  const valid = Boolean(session && asset?.url === session.asset.url && !disabled);
  useEffect(() => {
    const guard = operation;
    mounted.current = true;
    return () => { mounted.current = false; guard.current++; if (pending.current) assetResources.discard([pending.current]); };
  }, []);
  const open = useCallback(async () => {
    if (!asset || disabled) return;
    const token = ++operation.current;
    setError('');
    const source = await measureAsset(asset.crop?.source ?? asset);
    const node = getNode(id);
    if (!mounted.current || token !== operation.current || !node || isNodeLocked(node)) return;
    if (!hasImageDimensions(source)) { setError('无法读取原图，请重试。'); return; }
    setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id })));
    setSession({ asset, source });
  }, [asset, disabled, getNode, id, setNodes]);
  useEffect(() => {
    const request = (event: Event) => { if ((event as CustomEvent).detail === id) void open(); };
    window.addEventListener('canvas-crop-image', request);
    return () => window.removeEventListener('canvas-crop-image', request);
  }, [id, open]);
  useEffect(() => { internals(id); }, [id, internals, valid, session?.source.width, session?.source.height]);
  useEffect(() => {
    if (session && !valid) { operation.current++; setSession(undefined); setSaving(false); }
  }, [session, valid]);
  useEffect(() => {
    if (pending.current === asset?.url) pending.current = undefined;
  }, [asset?.url]);
  useLayoutEffect(() => {
    if (session || !restoreFocus.current) return;
    restoreFocus.current = false;
    // The inspector remounts when its asset changes; the node toolbar stays mounted.
    const target = document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .image-node-tools-label`);
    target?.focus({ preventScroll: true });
  }, [id, session]);
  function close() {
    operation.current++;
    restoreFocus.current = true;
    setSession(undefined); setSaving(false);
  }
  async function apply(rect: ImageCropRect) {
    if (!session || saving) return;
    const initial = session.asset.crop?.rect ?? { x: 0, y: 0, width: session.source.width!, height: session.source.height! };
    if (sameCrop(rect, initial)) { close(); return; }
    const token = ++operation.current;
    setSaving(true); setError('');
    try {
      const cropped = await cropImageAsset(session.asset, rect);
      const node = getNode(id);
      if (!mounted.current || token !== operation.current || !node || !isCanvasImageNode(node) || isNodeLocked(node)
        || !node.data.results?.some(item => item.id === session.asset.id && item.url === session.asset.url)) {
        if (cropped.url !== session.source.url) assetResources.discard([cropped.url]);
        return;
      }
      pending.current = cropped.url !== session.source.url ? cropped.url : undefined;
      updateNodeData(id, { results: node.data.results.map(item => item.id === session.asset.id ? cropped : item) });
      close();
    } catch (cause) {
      if (mounted.current && token === operation.current) { setSaving(false); setError(cause instanceof Error ? cause.message : '裁剪失败，请重试。'); }
    }
  }
  return {
    open, active: valid, size: valid ? canvasImageSize('auto', session!.source) : undefined,
    editor: valid ? <ImageCropEditor source={session!.source} initial={session!.asset.crop?.rect} saving={saving}
      onApply={rect => void apply(rect)} onCancel={close} onError={() => { close(); setError('无法读取原图，请重试。'); }} /> : null,
    error: error ? <button className="nodrag nopan" type="button" role="alert" onClick={() => setError('')}>{error}</button> : null,
  };
}
