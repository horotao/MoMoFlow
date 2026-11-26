import { useContext, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { CanvasHistoryContext } from '../components/useCanvasHistory';
import { useModelTaskStore } from '../components/useModelTasks';
import { selectedImageResult } from './annotationGraph';
import { assetResources } from './assetResources';
import { readCanvasImage } from './importCanvasImage';
import { syncImageReferenceRatios } from './imageReferenceRatio';
import { useNodeCommand } from './nodeCommands';
import { isActiveTask } from './taskQueue';
import { isCanvasImageNode, isNodeLocked, type AppNode } from './types';

export function useCanvasImageReplacement(id: string) {
  const { getNode, getEdges, setNodes } = useReactFlow<AppNode>();
  const tasks = useModelTaskStore();
  const history = useContext(CanvasHistoryContext);
  const input = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const busy = () => tasks.getSnapshot().some(task => task.nodeId === id && isActiveTask(task));
  useNodeCommand(id, 'replace', () => {
    if (!isNodeLocked(getNode(id)) && !pending.current && !busy()) input.current?.click();
  });
  const pendingUrl = useRef<string>();
  useEffect(() => () => { if (pendingUrl.current) assetResources.discard([pendingUrl.current]); }, []);
  const pickerElement = <>
    <input ref={input} hidden type="file" accept="image/*" aria-label="选择替换图片" onChange={async event => {
      const picker = event.currentTarget;
      const file = picker.files?.[0];
      picker.value = '';
      const original = getNode(id);
      if (!file || !original || !isCanvasImageNode(original) || isNodeLocked(original) || pending.current || busy()) return;
      const active = selectedImageResult(original);
      pending.current = true;
      setReplacing(true);
      setError('');
      try {
        const asset = await readCanvasImage(file);
        const node = getNode(id);
        if (input.current !== picker || picker.closest('[inert]') || !node || !isCanvasImageNode(node) || isNodeLocked(node)
          || busy() || selectedImageResult(node)?.url !== active?.url) {
          assetResources.discard([asset.url]);
          return;
        }
        history.endEditGroup();
        pendingUrl.current = asset.url;
        const busyNodes = new Set(tasks.getSnapshot().filter(isActiveTask).map(task => task.nodeId));
        const edges = getEdges();
        setNodes(current => {
          const next = current.map(item => {
            if (item.id !== id || !isCanvasImageNode(item)) return item;
            return { ...item, data: { ...item.data,
              label: item.data.imageSource === 'imported' && item.data.label === active?.name ? asset.name : item.data.label,
              results: active ? item.data.results?.map(result => result.id === active.id ? asset : result) : [asset],
              activeResultId: asset.id,
            } };
          });
          return syncImageReferenceRatios(next, edges, id, busyNodes);
        });
      } catch (cause) {
        if (input.current === picker) setError(cause instanceof Error ? cause.message : '无法替换图片。');
      } finally {
        pending.current = false;
        if (input.current === picker) setReplacing(false);
      }
    }} />
    {error && <button type="button" role="alert" className="nodrag" onClick={() => setError('')}>{error}</button>}
  </>;
  return { pickerElement, replacing };
}
