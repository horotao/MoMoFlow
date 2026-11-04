import { NodeFrame, NodeTitle } from './NodeFrame';
import { NodePort, NodePortAdd } from './NodePort';
import { nodePortY } from './nodeLayout';
import { LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useReactFlow, useNodes, useEdges, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';

import { isFileNode } from './fileAsset';
import { fileAssets } from './fileCollection';
import { textVariableCount, variableHandleId, variableIndex } from './textVariables';
import type { Editor } from '@tiptap/react';
import { TextPromptEditor } from './TextPromptEditor';
import { TextNodeMenu } from './TextNodeMenu';
import { TextDisplaySelect } from './TextDisplaySelect';
import type { AppNode, TextNode as TextNodeType } from './types';

function TextNodeIcon({ name }: { name: 'more' | 'chevron' }) {
  return (
    <span className={`text-node-icon text-node-icon-${name}`} aria-hidden="true">
      <img className="text-node-icon-light" src={`/text-node/${name}-light.svg`} alt="" draggable={false} />
      <img className="text-node-icon-dark" src={`/text-node/${name}-dark.svg`} alt="" draggable={false} />
    </span>
  );
}

export function TextNode({ id, data, isConnectable }: NodeProps<TextNodeType>) {
  const { updateNodeData } = useReactFlow<AppNode>();

  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const cancelRename = useRef(false);
  useEffect(() => { if (renaming) { renameRef.current?.focus(); renameRef.current?.select(); } }, [renaming]);
  const nodes = useNodes<AppNode>();
  const edges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const node = nodes.find((item) => item.id === id)!;
  const variableCount = textVariableCount(node, edges);
  const displayMode = data.displayMode ?? 'source-value';
  const inputs = edges.filter((edge) => edge.target === id);
  const outputConnected = edges.some((edge) => edge.source === id);
  const editorRef = useRef<Editor | null>(null);
  const connectedVariables = inputs.slice().sort((a, b) => variableIndex(a.targetHandle) - variableIndex(b.targetHandle));

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, variableCount, updateNodeInternals]);

  return (
    <NodeFrame kind="text" minHeight={nodePortY(variableCount) + 30}>
      <header className="text-node-header">
        <NodeTitle type="PROMPT">
          {renaming ? <input ref={renameRef} className="text-node-rename nodrag nopan" aria-label="节点名称"
            value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (!cancelRename.current && title.trim()) updateNodeData(id, { label: title.trim() });
              setRenaming(false);
            }} onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') { cancelRename.current = true; event.currentTarget.blur(); }
            }} /> : <span>{data.label || '提示词'}</span>}
          {data.locked && <LockKeyhole size={12} aria-label="已锁定" />}
        </NodeTitle>
        <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => {
          cancelRename.current = false; setTitle(data.label || '提示词'); setRenaming(true);
        }}><TextNodeIcon name="more" /></TextNodeMenu>
      </header>
      <div className="node-frame-card">
      <div className="text-node-content">
        <TextPromptEditor id={id} data={data} editorRef={editorRef}
          handles={connectedVariables.map((edge) => variableHandleId(variableIndex(edge.targetHandle)))} />
      </div>
      <NodePortAdd index={variableCount} label="添加变量" disabled={data.locked} onClick={() => {
          updateNodeData(id, { variableCount: variableCount + 1 });
          editorRef.current?.chain().focus().insertContent([
            { type: 'promptVariable', attrs: { handleId: variableHandleId(variableCount), ownerId: id } },
            { type: 'text', text: ' ' },
          ]).run();
        }} />
      <footer className="text-node-footer">
        {variableCount > 0 && <TextDisplaySelect value={displayMode} onChange={(mode) => updateNodeData(id, { displayMode: mode })}>
          <TextNodeIcon name="chevron" />
        </TextDisplaySelect>}
      </footer>
      </div>
      {Array.from({ length: variableCount }, (_, index) => {
        const connected = inputs.some((edge) => variableIndex(edge.targetHandle) === index);
        const invalid = inputs.some((edge) => {
          const source = nodes.find((node) => node.id === edge.source);
          return variableIndex(edge.targetHandle) === index && source && isFileNode(source) && fileAssets(source.data).length > 0;
        });
        return (
          <NodePort key={variableHandleId(index)} id={variableHandleId(index)} direction="target" kind="variable"
            label={`变量 ${index + 1}`} index={index} connected={connected} invalid={Boolean(invalid)} isConnectable={isConnectable && !data.locked} />
        );
      })}
      <NodePort direction="source" kind="text" label="提示词输出" connected={outputConnected} isConnectable={isConnectable && !data.locked} />
    </NodeFrame>
  );
}
