import { useWorkflowExecution } from './useWorkflowExecution';
import { ExecutionProblem, isModelNode } from '../nodes/executionGraph';
import { apimartExtMarkupError } from '../nodes/sunburst';
import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { TaskManager } from './TaskManager';
import { useModelTaskStore } from './useModelTasks';
import { isSunburstNode } from '../nodes/types';
import type { AppNode } from '../nodes/types';
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
  const { setNodes, getNodes, setCenter } = useReactFlow<AppNode>();
  const taskStore = useModelTaskStore();
  const execution = useWorkflowExecution(onImageGenerated);
  const { toasts, showToast, dismissToast, clearToasts } = useAnimatedToastStack({ limit: 4 });
  useEffect(() => {
    const run = (event: Event) => {
      const detail = (event as CustomEvent<string | string[]>).detail;
      const ids = Array.isArray(detail) ? detail : [detail];
      try {
        const node = ids.length === 1 ? getNodes().find(item => item.id === ids[0]) : undefined;
        const quantity = node && isSunburstNode(node) ? node.data.composer?.quantity : undefined;
        void execution.current?.run(ids, quantity ?? taskStore.getRuns());
        clearToasts();
      } catch (error) {
        showToast(executionErrorToast(error, '无法运行模型'));
        if (error instanceof ExecutionProblem) {
          const node = getNodes().find(item => item.id === error.nodeId);
          if (node) { setNodes(all => all.map(item => ({ ...item, selected: item.id === node.id }))); void setCenter(node.position.x + 230, node.position.y + 200, { zoom: .8, duration: 300 }); }
        }
      }
    };
    window.addEventListener('describer-run', run);
    window.addEventListener('sunburst-run', run);
    return () => { window.removeEventListener('describer-run', run); window.removeEventListener('sunburst-run', run); };
  }, [getNodes, taskStore, execution, setNodes, setCenter, showToast, clearToasts]);
  return <>
    <TaskManager sidebarOpen={false}
      onRetry={(task) => {
        const node = getNodes().find((item) => item.id === task.nodeId);
        if (!node || !isModelNode(node) || node.data.locked) return;
        try {
          void execution.current?.run([task.nodeId], 1, task.seedreamGroup?.imageId);
          clearToasts();
        } catch (error) { showToast(executionErrorToast(error, '无法重试任务')); }
      }}
      onFocus={(id) => {
        const node = getNodes().find((n) => n.id === id);
        if (!node) return;
        setNodes((all) => all.map((n) => ({ ...n, selected: n.id === id })));
        void setCenter(node.position.x + 230, node.position.y + 200, { zoom: 0.8, duration: 300 });
      }} />
    <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="top-center" placement="fixed"
      labels={executionToastLabels} classNames={executionToastClassNames} />
  </>;
}
