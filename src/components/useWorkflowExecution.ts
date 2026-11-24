import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import type { AppNode, FileAsset } from '../nodes/types';
import { WorkflowExecution, aborted } from '../nodes/workflowExecution';
import { readExecutionAsset } from '../nodes/executionAssets';
import { assetResources, nodeAssetUrls } from '../nodes/assetResources';
import { requestSunburst } from '../nodes/sunburstClient';
import { requestSeedream } from '../nodes/seedreamClient';
import { requestNanoBanana } from '../nodes/nanoBananaClient';
import { requestKlingImage } from '../nodes/klingImageClient';
import { advanceEstimatedProgress } from '../nodes/taskQueue';
import { useModelTaskStore } from './useModelTasks';

export function useWorkflowExecution(onImageGenerated?: (prompt: string) => Promise<void>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const store = useModelTaskStore();
  const engine = useRef<WorkflowExecution>();
  useLayoutEffect(() => {
    const instance = new WorkflowExecution({ nodes: getNodes(), edges: getEdges() }, store, {
      onImageGenerated,
      patch: (id, data, publishImmediately) => {
        // Other selected nodes may read this result as soon as execution resolves.
        if (publishImmediately) flushSync(() => updateNodeData(id, data));
        else updateNodeData(id, data);
      },
      retain: graph => assetResources.retain(nodeAssetUrls(graph.nodes)),
      discard: assets => assetResources.discard(assets.map(asset => asset.url)),
      verify: async (assets, signal) => {
        for (const asset of assets) {
          await readExecutionAsset(asset.url, signal);
        }
      },
      snapshot: async (sources, signal) => {
        const assets = new Map<string, FileAsset>();
        const urls: string[] = [];
        const originals = new Map<string, FileAsset>();
        for (const asset of sources) if (/^https?:/.test(asset.url)) originals.set(asset.url, asset);
        try {
          for (const [url, original] of originals) {
            const { blob, contentHash } = await readExecutionAsset(url, signal, true);
            aborted(signal);
            const local = assetResources.create(blob); urls.push(local);
            assets.set(url, { ...original, url: local, contentHash });
          }
          const release = assetResources.retain(urls);
          return { assets, release: () => { release(); assetResources.discard(urls); } };
        } catch (error) { assetResources.discard(urls); throw error; }
      },
      request: (task, signal) => {
        if (task.klingImageRequest) return requestKlingImage(task.klingImageRequest, signal);
        if (task.seedreamRequest) return requestSeedream(task.seedreamRequest, signal);
        if (task.nanoBananaRequest) return requestNanoBanana(task.nanoBananaRequest, signal);
        if (task.imageRequest) return requestSunburst(task.imageRequest, signal);
        return Promise.reject(new Error('任务缺少图像请求。'));
      },
    });
    engine.current = instance;
    return () => { instance.dispose(); engine.current = undefined; };
  }, [getNodes, getEdges, updateNodeData, store, onImageGenerated]);
  useLayoutEffect(() => { engine.current?.observe({ nodes, edges }); }, [nodes, edges]);
  useEffect(() => {
    const timer = setInterval(() => store.update(tasks => advanceEstimatedProgress(tasks, Date.now())), 200);
    return () => clearInterval(timer);
  }, [store]);
  return engine;
}
