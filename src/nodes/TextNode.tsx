import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';

import type { AppNode, TextNode as TextNodeType } from './types';

export function TextNode({ id, data }: NodeProps<TextNodeType>) {
  const { updateNodeData } = useReactFlow<AppNode>();

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className="text-node-content">
        <div className="text-node-measure" aria-hidden="true">
          {`${data.text || '点击输入文字'}\u200b`}
        </div>
        <textarea
          className="text-node-editor nodrag nopan nowheel"
          aria-label="文本节点内容"
          placeholder="点击输入文字"
          value={data.text}
          rows={1}
          spellCheck={false}
          onChange={(event) => updateNodeData(id, { text: event.target.value })}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
