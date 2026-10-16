import { Fragment, useEffect, useRef } from 'react';
import { Handle, Position, useReactFlow, useNodes, useEdges, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';

import { textVariableCount, variableHandleId, variableIndex } from './textVariables';
import type { Editor } from '@tiptap/react';
import { TextPromptEditor } from './TextPromptEditor';
import { TextDisplaySelect } from './TextDisplaySelect';
import type { AppNode, TextNode as TextNodeType } from './types';

function TextNodeIcon({ name }: { name: 'text' | 'more' | 'add' | 'chevron' | 'port' | 'port-connected' }) {
  return (
    <span className={`text-node-icon text-node-icon-${name}`} aria-hidden="true">
      <img className="text-node-icon-light" src={`/text-node/${name}-light.svg`} alt="" draggable={false} />
      <img className="text-node-icon-dark" src={`/text-node/${name}-dark.svg`} alt="" draggable={false} />
    </span>
  );
}

export function TextNode({ id, data, isConnectable }: NodeProps<TextNodeType>) {
  const { updateNodeData } = useReactFlow<AppNode>();

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
    <>
      <header className="text-node-header">
        <div className="text-node-title"><TextNodeIcon name="text" /><span>Prompt</span></div>
        <button className="text-node-button nodrag nopan" type="button" aria-label="更多选项（暂未开放）" title="更多选项（暂未开放）" aria-disabled="true">
          <TextNodeIcon name="more" />
        </button>
      </header>
      <div className="text-node-content">
        <TextPromptEditor id={id} data={data} editorRef={editorRef}
          handles={connectedVariables.map((edge) => variableHandleId(variableIndex(edge.targetHandle)))} />
      </div>
      <footer className="text-node-footer">
        <button className="text-node-button text-node-add nodrag nopan" type="button" title="添加变量" onClick={() => {
          updateNodeData(id, { variableCount: variableCount + 1 });
          editorRef.current?.chain().focus().insertContent([
            { type: 'promptVariable', attrs: { handleId: variableHandleId(variableCount), ownerId: id } },
            { type: 'text', text: ' ' },
          ]).run();
        }}>
          <TextNodeIcon name="add" />添加变量
        </button>
        {variableCount > 0 && <TextDisplaySelect value={displayMode} onChange={(mode) => updateNodeData(id, { displayMode: mode })}>
          <TextNodeIcon name="chevron" />
        </TextDisplaySelect>}
      </footer>
      {Array.from({ length: variableCount }, (_, index) => {
        const connected = inputs.some((edge) => variableIndex(edge.targetHandle) === index);
        return (
          <Fragment key={variableHandleId(index)}>
            <span className="text-node-port-label text-node-port-label-input" style={{ top: 66 + index * 60 }}>Variable {index + 1}</span>
            <Handle className="text-node-port" id={variableHandleId(index)} type="target" position={Position.Left}
              style={{ top: 89 + index * 60 }} isConnectable={isConnectable && !connected} aria-label={`Variable ${index + 1}`}>
              <TextNodeIcon name={connected ? 'port-connected' : 'port'} />
            </Handle>
          </Fragment>
        );
      })}
      <span className="text-node-port-label text-node-port-label-output">Prompt</span>
      <Handle className="text-node-port" type="source" position={Position.Right} isConnectable={isConnectable}>
        <TextNodeIcon name={outputConnected ? 'port-connected' : 'port'} />
      </Handle>
    </>
  );
}
