import { useWorkflowExecution } from './useWorkflowExecution';
import { ExecutionProblem, isModelNode } from '../nodes/executionGraph';
import { SeedreamSettings } from './SeedreamSettings';
import { seedreamName } from '../nodes/seedream';
import { NanoBananaSettings } from './NanoBananaSettings';
import { nanoBananaName } from '../nodes/nanoBanana';
import { SunburstSettings } from './SunburstSettings';
import { GptRunCount } from './GptRunCount';
import { apimartExtMarkupError, sunburstName, sunburstProviderLabels } from '../nodes/sunburst';
import { useEffect, type KeyboardEventHandler, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { useNodes, useReactFlow } from '@xyflow/react';
import { TaskManager } from './TaskManager';
import { isActiveTask } from '../nodes/taskQueue';
import { useModelRuns, useModelTasks, useModelTaskStore } from './useModelTasks';
import { isImageGeneratorNode, isSunburstNode, isNanoBananaNode, isSeedreamNode } from '../nodes/types';
import type { AppNode } from '../nodes/types';
import { nodeSettingsSpring } from '../lib/springs';
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

function NodeSettingsSidebar({ children, label, onKeyDown, imageModel = false }: {
  children: ReactNode; label: string; onKeyDown: KeyboardEventHandler<HTMLElement>; imageModel?: boolean;
}) {
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();
  const closed = reduceMotion ? { opacity: 0 } : { x: '100%' };
  return <motion.aside
    className={`describer-panel node-settings-panel is-open nodrag nopan nowheel${imageModel ? ' image-model-settings' : ''}`}
    aria-label={label}
    data-settings-select-host=""
    initial={closed}
    animate={reduceMotion ? { opacity: 1 } : { x: '0%' }}
    exit={closed}
    transition={reduceMotion ? { duration: 0.2, ease: [0.16, 1, 0.3, 1] } : nodeSettingsSpring}
    {...(!isPresent ? { inert: '' } : {})}
    onKeyDown={onKeyDown}
  >{children}</motion.aside>;
}

export function DescriberPanel({ onImageGenerated }: { onImageGenerated?: (prompt: string) => Promise<void> }) {
  const nodes = useNodes<AppNode>();
  const { setNodes, getNodes, setCenter } = useReactFlow<AppNode>();
  const runnable = nodes.filter((node) => isModelNode(node) && node.selected && !node.data.locked);
  const selectedImage = nodes.find((node) => isImageGeneratorNode(node) && node.selected);
  const providerName = selectedImage && isSunburstNode(selectedImage) ? sunburstProviderLabels[selectedImage.data.provider ?? 'openai'] : 'APIMart';
  const panelOpen = Boolean(selectedImage);
  const tasks = useModelTasks();
  const taskStore = useModelTaskStore();
  const execution = useWorkflowExecution(onImageGenerated);
  const [runs, setRuns] = useModelRuns();
  const { toasts, showToast, dismissToast, clearToasts } = useAnimatedToastStack({ limit: 4 });
  useEffect(() => {
    const run = (event: Event) => {
      const detail = (event as CustomEvent<string | string[]>).detail;
      const ids = Array.isArray(detail) ? detail : [detail];
      try {
        void execution.current?.run(ids, taskStore.getRuns());
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
    {/* Presence retains the last settings and full-height shell until the exit finishes. */}
    <AnimatePresence initial={false}>
      {selectedImage && <NodeSettingsSidebar key="node-settings" imageModel label={`${selectedImage.type === 'seedream' ? seedreamName : selectedImage.type === 'nano-banana' ? nanoBananaName : sunburstName} 设置`} onKeyDown={(e) => e.stopPropagation()}>
        {isSunburstNode(selectedImage) && <SunburstSettings key={selectedImage.id} node={selectedImage} />}
        {isSeedreamNode(selectedImage) && <SeedreamSettings key={selectedImage.id} node={selectedImage} />}
        {isNanoBananaNode(selectedImage) && <NanoBananaSettings key={selectedImage.id} node={selectedImage} />}
        <div className="describer-panel-bottom">
          <GptRunCount value={runs} disabled={!runnable.length} onChange={setRuns} />
          <div className="sunburst-cost"><span>总费用</span><span>按实际用量计费</span></div>
          <button disabled={!runnable.length || runnable.some(node => tasks.some(task => task.nodeId === node.id && isActiveTask(task)))} className="describer-primary" title={`通过 ${providerName} 运行图片模型`} onClick={() => window.dispatchEvent(new CustomEvent('describer-run', { detail: getNodes().filter((node) => isModelNode(node) && node.selected && !node.data.locked).map((node) => node.id) }))}>
            <img src="/gpt-sidebar/settings-run.svg" width={22} height={22} alt="" />
            运行选中节点
          </button>
        </div>
      </NodeSettingsSidebar>}
    </AnimatePresence>
    <TaskManager sidebarOpen={panelOpen}
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
