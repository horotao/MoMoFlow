import { useId, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { isCanvasTextNode, type AppNode, type CanvasText, type TextGenerationResult } from '../../nodes/types';
import { deepSeekFlashModel, deepSeekReasoningEfforts, estimateCanvasTextCost, isTextReasoningEffort, textHistory, textModelEffort, textModelSelection, textReasoningEfforts } from '../../nodes/textGeneration';
import { useVisibleCanvasText } from '../../nodes/visibleCanvasText';
import { readTextBilling, textBillingDescription, textCostLabel } from '../../nodes/textPricing';
import { imageDateLabel } from '../../nodes/imageMetadata';
import { TextModelPicker } from './TextModelPicker';
import { textModels } from './textModels';
import { ImagePromptIcon } from './ImagePromptIcon';
import { ImagePromptInfoTip } from './ImagePromptInfoTip';
import { GenerationOptionsPanel } from './GenerationOptionsPanel';
import { GenerationOptionSelect } from './GenerationOptionSelect';
import './image-inspector.css';
import './text-inspector.css';

export function TextInspector() {
  const selectedId = useStore(state => {
    const selected = state.nodes.filter(node => node.selected);
    return selected.length === 1 && isCanvasTextNode(selected[0] as AppNode) ? selected[0].id : null;
  });
  const data = useStore(state => selectedId ? state.nodeLookup.get(selectedId)?.data : undefined) as CanvasText['data'] | undefined;
  const history = data ? textHistory(data) : [];
  const active = history.find(result => result.id === data?.activeTextResultId) ?? history[history.length - 1];
  const result = useVisibleCanvasText(selectedId, active);
  if (!selectedId || !data) return null;
  return <aside className="image-inspector text-inspector nodrag nopan nowheel" aria-label="文本检查器" data-has-text={Boolean(result)}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onWheel={event => event.stopPropagation()} onKeyDown={event => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') event.stopPropagation();
    }}>
    <TextInformation key={selectedId} nodeId={selectedId} data={data} result={result} />
    <TextGenerationOptions key={`options-${selectedId}`} nodeId={selectedId} data={data} />
  </aside>;
}

function TextInformation({ nodeId, data, result }: { nodeId: string; data: CanvasText['data']; result?: TextGenerationResult }) {
  const [expanded, setExpanded] = useState(true);
  const { updateNodeData } = useReactFlow<AppNode>();
  const id = useId();
  const name = data.label || 'Text';
  const snapshot = readTextBilling(result?.billing);
  const billing = snapshot?.model === result?.model ? snapshot : undefined;
  const billDescription = textBillingDescription(billing);
  const rows = result ? [
    ['模型', textModels.find(model => model.id === result.model)?.name ?? result.model],
    ['字符数', String(result.text.length)], ['创建时间', result.createdAt > 0 ? imageDateLabel(result.createdAt) : '—'],
    ['本次花费', textCostLabel(billing?.totalUsd)], ['创建者', '—'],
  ] : [];
  return <section className="image-information text-information" aria-label="文本信息">
    <header><input key={name} aria-label="文本节点名称" defaultValue={name} title={name} disabled={data.locked} maxLength={256}
      onBlur={event => {
        const label = event.target.value.trim() || 'Text';
        event.currentTarget.value = label;
        if (!data.locked && label !== name) updateNodeData(nodeId, { label });
      }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); if (event.key === 'Escape') event.currentTarget.value = name; event.currentTarget.blur(); } }} />
      <button type="button" className="image-information-toggle" aria-label="文本信息" disabled={!result}
        aria-expanded={Boolean(result) && expanded} aria-controls={result ? id : undefined}
        onClick={() => setExpanded(!expanded)}><ImagePromptIcon name="metadata-info" /></button></header>
    {result && expanded && <dl id={id}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={label === '本次花费' ? billDescription : value}>{value}</dd></div>)}</dl>}
    {result && <footer><DropdownMenu.Root modal={false}><DropdownMenu.Trigger asChild>
      <button type="button" className="image-information-more" aria-label="更多文本操作"><ImagePromptIcon name="metadata-more" /></button>
    </DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="image-information-menu nodrag nopan nowheel" align="end" sideOffset={6}
      onKeyDown={event => event.stopPropagation()} onEscapeKeyDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      <DropdownMenu.Item disabled><span className="image-information-menu-icon"><ImagePromptIcon name="metadata-save" /></span><span>保存到素材库</span><kbd>2</kbd></DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></footer>}
  </section>;
}

function TextGenerationOptions({ nodeId, data }: { nodeId: string; data: CanvasText['data'] }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const estimatedUsd = useStore(state => estimateCanvasTextCost(nodeId, state.nodes as AppNode[], state.edges));
  const composer = data.textComposer;
  const selection = textModelSelection(composer.selection);
  const modelId = !selection.autoSelect && selection.modelIds.length === 1 ? selection.modelIds[0] : undefined;
  const luna = modelId === 'gpt-6-luna';
  const deepSeek = modelId === deepSeekFlashModel;
  const effort = composer.reasoningEffort ?? 'low';
  const costBasis = deepSeek ? 'APIMart 公布的 Gold 基准价' : 'OpenAI 官方标准价';
  return <GenerationOptionsPanel label="生成选项" className="text-generation-options">
    <TextModelPicker appearance="inspector" selection={selection} locked={data.locked}
      onChange={selection => { if (!data.locked) updateNodeData(nodeId, { textComposer: { ...composer, selection } }); }} />
    <div className="generation-option-row"><span>思考强度</span><GenerationOptionSelect label="思考强度"
      value={deepSeek ? textModelEffort(deepSeekFlashModel, effort) : effort}
      choices={deepSeek ? deepSeekReasoningEfforts : luna ? ['none', ...textReasoningEfforts] : textReasoningEfforts}
      labels={deepSeek ? ['低', '高', '最高'] : [...(luna ? ['无'] : []), '低', '中', '高', '超高', '最高']} disabledChoices={['none']}
      disabled={data.locked} onChange={reasoningEffort => {
        if (!data.locked && isTextReasoningEffort(reasoningEffort)) updateNodeData(nodeId, { textComposer: { ...composer, reasoningEffort } });
      }} /></div>
    {!deepSeek && <div className="generation-option-row"><span>网络搜索</span><GenerationOptionSelect label="网络搜索"
      value={composer.webSearch ? 'enabled' : 'disabled'} choices={['disabled', 'enabled']} labels={['关闭', '开启']} disabled={data.locked}
      onChange={value => { if (!data.locked) updateNodeData(nodeId, { textComposer: { ...composer, webSearch: value === 'enabled' } }); }} /></div>}
    <div className="generation-options-cost"><span>预计费用<ImagePromptInfoTip label="文本生成费用">{`整批 ${composer.quantity} 份的美元估算，按${costBasis}计算。输入含上游文字与参考图的近似 token，预估每份输出 512 tokens，并按思考强度计入推理预算。${deepSeek ? '实际费用会随账户费率、缓存命中及输出长度变化。' : '开启搜索时按每份 1 次搜索及近似搜索内容估算。实际输出长度、搜索次数和缓存命中会影响费用，自定义渠道价格与税费可能不同。'}`}</ImagePromptInfoTip></span><span>{textCostLabel(estimatedUsd, true)}</span></div>
  </GenerationOptionsPanel>;
}
