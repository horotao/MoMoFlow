import { useWorkflowExecution } from './useWorkflowExecution';
import { ExecutionProblem, isModelNode } from '../nodes/executionGraph';
import { apimartExtMarkupError } from '../nodes/sunburst';
import { composerModelId } from '../nodes/imageComposerSettings';
import { klingImageModel } from '../nodes/klingImage';
import { useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { TaskManager } from './TaskManager';
import { useModelTaskStore } from './useModelTasks';
import { isCanvasImageNode, isCanvasTextNode, isNodeLocked, isSunburstNode } from '../nodes/types';
import type { AppNode } from '../nodes/types';
import { imageModelBranches } from '../nodes/imageModelBranches';
import { startCanvasTextRun } from '../nodes/canvasTextRun';
import { canvasRunSelectionEvent, generationNodes, maxSelectionGenerationNodes, runGenerationSelection, selectedGenerationNodes } from '../nodes/selectionGeneration';
import { AnimatedToastStack, type ToastInput } from './ui/AnimatedToastStack';
import { useAnimatedToastStack } from './ui/useAnimatedToastStack';

const executionToastLabels = { dismiss: '关闭通知' };
const executionToastClassNames = { description: 'line-clamp-none wrap-anywhere' };

function executionErrorToast(error: unknown, title: string): ToastInput {
  const reason = error instanceof ExecutionProblem ? error.reason : error instanceof Error ? error.message : undefined;
  const unsupportedMarkup = reason === apimartExtMarkupError;
  return {
    id: `${title}:${reason ?? ''}`,
    title: unsupportedMarkup ? '当前模型不支持标注' : title,
    description: unsupportedMarkup
      ? 'APIMart 的 GPT Image 2.6 EXT 无法读取标注。请改用标准版或 OpenAI 官方渠道。'
      : reason || '未能获取具体原因，请重试。',
    status: 'error',
  };
}

export function DescriberPanel({ onImageGenerated }: { onImageGenerated?: (prompt: string) => Promise<void> }) {
  const { setNodes, setEdges, getNodes, getEdges, getNode, getNodesBounds, setCenter } = useReactFlow<AppNode>();
  const taskStore = useModelTaskStore();
  const execution = useWorkflowExecution(onImageGenerated);
  const { toasts, showToast, dismissToast, clearToasts } = useAnimatedToastStack({ limit: 4 });
  const focusNode = useCallback((id: string) => {
    if (!getNodes().some(node => node.id === id)) return;
    const { x, y, width, height } = getNodesBounds([id]);
    setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id })));
    void setCenter(x + width / 2, y + height / 2, { zoom: .8, duration: 300 });
  }, [getNodes, getNodesBounds, setNodes, setCenter]);
  const runImage = useCallback((ids: string[], existingImagesOnly = false) => {
    const node = ids.length === 1 ? getNode(ids[0]) : undefined;
    const quantity = (node && isSunburstNode(node) ? node.data.composer?.quantity : undefined) ?? taskStore.getRuns();
    const branches = node && isCanvasImageNode(node) && isModelNode(node) && !isNodeLocked(node)
      ? imageModelBranches(node, getNodes(), getEdges(), id => getNodesBounds([id])) : undefined;
    if (!node || !branches) return execution.current?.run(ids, quantity, undefined, { existingImagesOnly });
    return execution.current?.run(ids, quantity, undefined, {
      existingImagesOnly,
      additions: {
        sourceId: node.id, graph: branches,
        publish: () => flushSync(() => {
          setNodes(current => [...current, ...branches.nodes]);
          setEdges(current => [...current, ...branches.edges]);
        }),
      },
    });
  }, [execution, getNode, getNodes, getEdges, getNodesBounds, setNodes, setEdges, taskStore]);
  useEffect(() => {
    const run = (event: Event) => {
      const detail = (event as CustomEvent<string | string[]>).detail;
      const ids = Array.isArray(detail) ? detail : [detail];
      try {
        void runImage(ids);
        clearToasts();
      } catch (error) {
        showToast(executionErrorToast(error, '无法运行模型'));
        if (error instanceof ExecutionProblem) focusNode(getNode(error.nodeId) ? error.nodeId : ids[0]);
      }
    };
    window.addEventListener('describer-run', run);
    window.addEventListener('sunburst-run', run);
    return () => { window.removeEventListener('describer-run', run); window.removeEventListener('sunburst-run', run); };
  }, [getNode, runImage, focusNode, showToast, clearToasts]);
  useEffect(() => {
    const selectedRuns = new Map<string, Promise<boolean>>();
    let disposed = false;
    const runSelection = (event: Event) => {
      const ids = (event as CustomEvent<string[] | undefined>).detail;
      const nodes = getNodes();
      const targets = ids ? generationNodes(nodes.filter(node => ids.includes(node.id))) : selectedGenerationNodes(nodes);
      if (!targets.length || targets.length > maxSelectionGenerationNodes) return;
      if (targets.every(node => selectedRuns.has(node.id))) return;
      clearToasts();
      void runGenerationSelection(targets.map(node => node.id), getEdges(), async id => {
        const node = getNode(id);
        if (disposed || !node || node.hidden || isNodeLocked(node)) return false;
        try {
          if (isCanvasTextNode(node)) return Boolean(await startCanvasTextRun(id));
          if (!isModelNode(node)) return false;
          return Boolean(await runImage([id], true));
        } catch (error) {
          showToast(executionErrorToast(error, '无法运行所选节点'));
          return false;
        }
      }, selectedRuns);
    };
    window.addEventListener(canvasRunSelectionEvent, runSelection);
    return () => {
      disposed = true;
      window.removeEventListener(canvasRunSelectionEvent, runSelection);
    };
  }, [getNodes, getEdges, getNode, runImage, clearToasts, showToast]);
  return <>
    <TaskManager
      onRetry={(task) => {
        const node = getNodes().find((item) => item.id === task.nodeId);
        if (!node || !isModelNode(node) || node.data.locked) return;
        try {
          const count = isCanvasImageNode(node) && composerModelId(node.data) === klingImageModel
            ? task.klingImageRequest?.count ?? node.data.composer.quantity : 1;
          void execution.current?.run([task.nodeId], count, task.seedreamGroup?.imageId);
          clearToasts();
        } catch (error) { showToast(executionErrorToast(error, '无法重试任务')); }
      }}
      onFocus={focusNode} />
    <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="top-center" placement="fixed"
      labels={executionToastLabels} classNames={executionToastClassNames} />
  </>;
}
