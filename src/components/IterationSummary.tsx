import { useEdges, useNodes } from '@xyflow/react';
import type { AppNode } from '../nodes/types';
import { ExecutionProblem, workflowIterations } from '../nodes/executionGraph';
import { IteratorWarning } from './IteratorWarning';
import { useModelRuns } from './useModelTasks';

export function IterationSummary({ nodeId }: { nodeId: string }) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const [runs] = useModelRuns();
  try {
    const iterations = workflowIterations({ nodes, edges }, nodeId);
    if (!iterations[0]) return null;
    const image = iterations[0].kind === 'image';
    return <div className="text-iteration-summary" aria-label={image ? '图片迭代批量任务' : '文本迭代批量任务'}><span>{image ? '图片迭代' : '文本迭代'} · {iterations.length} {image ? '张' : '条'}</span><span>{iterations.length * runs} 个任务{runs > 1 ? `（每${image ? '张' : '条'} ${runs} 次）` : ''}</span></div>;
  } catch (error) {
    const source = error instanceof ExecutionProblem ? nodes.find(node => node.id === error.nodeId) : undefined;
    const prefix = source ? `${source.data.label || source.type}：` : '';
    const message = error instanceof Error ? error.message : '请检查迭代列表。';
    return <IteratorWarning message={prefix && message.startsWith(prefix) ? message.slice(prefix.length) : message} />;
  }
}
