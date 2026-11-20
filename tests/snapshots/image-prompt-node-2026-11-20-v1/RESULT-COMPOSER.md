# 生成后的编辑框

仅更新此组件快照；原始测试页、真实主画布和模型服务均未接入。

## 对照 Flora 的表现

- 图片出现后保留同一个提示词状态。未选中且移出节点时隐藏编辑框；悬停节点或选中后，以 150ms 淡入、上移 4px 显示。
- 面板在节点内侧，左右及底部各留 8px。宽 368px、圆角 16px、1px 描边；外层及内容层分别使用 30% 黑色背景。内容默认 50% 不透明度，悬停或聚焦面板后变为 100%，背后模糊到 24px。
- 面板内边距 8px，文本与按钮之间 8px。文字为 14px / 17.5px；一行文本时面板高 83.5px。长文本视口最高 72px，整体高 138px，右侧原生滚动条为 15px、细条使用 `#b5b3ad`。
- 按钮占独立的 40px 行，跟在文本后面。这里不使用空节点的 144px 底部渐变或滚动留白，文本和底部控件都处在描边内。
- 按钮提示、数量大于 1 后固定展开、文本光标及滚动条拖动抓手继续有效。
- 已有图片时再次生成，会隐藏当前大图、显示新进度，保留紧凑编辑框及可编辑状态。完成后图片淡入；已有结果可通过下方缩略图切换。

## 复用

`ImagePromptNode` 的 `result` 接受图片等 React 内容；`prompt` / `onPromptChange` 仍负责编辑文字，生成完成时不要清空提示词。再次生成期间继续传入上一次 `result`，由节点隐藏大图并保留紧凑编辑框。

可选的历史接口：

```tsx
<ImagePromptNode
  prompt={prompt}
  onPromptChange={setPrompt}
  result={<img src={currentImageUrl} alt="生成结果" />}
  generation={generation}
  variants={outputs.map(output => ({
    id: output.id,
    thumbnail: output.url ? <img src={output.url} alt="" /> : undefined,
  }))}
  activeVariant={activeIndex}
  onVariantChange={selectOutput}
  onGenerate={generate}
/>
```

宿主负责结果、历史、请求和选中索引；节点只显示内容和报告操作。切换结果时，宿主应一起切换图片、对应提示词及其生成状态。历史只有两项及以上时显示，待生成项不传缩略图。

历史项可传 `pending: true`，有待生成项时保持缩略图展开。默认、悬停与收起的尺寸、时间及验证记录见 [HISTORY.md](HISTORY.md)。

## 预览与验证

入口：`/tests/snapshots/image-prompt-node-2026-11-20-v1/tests/image-prompt-node.html`。

- `?complete`：带原提示词的结果态。
- `?complete&long`：30 行长提示词。
- `?complete&demoDuration=2`：点击发送后，快速模拟再次生成与结果历史。
- 追加 `&scale=.85` / `&scale=1.5`：缩放观察。

本地演示没有模型请求；所有历史缩略图复用同一张预览图片，仅用于核对状态。数量大于 1 时按数量追加模拟结果。

浏览器输入事件实测了隐藏、默认半透明、悬停与聚焦、1019 字符长文本、72px 滚动视口、滚动条抓手与滚动到底、数量 2 固定展开、再次生成到完成、旧结果切换、85% / 100% / 150% 缩放及减少动态效果。另回归空节点的 368px 视口、144px 尾部留白及 14px 字体。没有在主画布验收。

Flora 参考节点进行了一次已授权的真实再生成，验证新进度、底部编辑框保留及结果历史；成功结束后已恢复编辑框中的原提示词 `Beauty close-up, dewy, soft light`。本地演示仅模拟这些状态。

记录：[默认状态](evidence/result-resting.jpg)、[悬停状态](evidence/result-hover.jpg)、[长文本与历史](evidence/result-long.jpg)、[再次生成动图](evidence/result-regenerate-local.gif)、[参考页再次生成](evidence/result-regenerate-reference.jpg)。自动检查使用 `npm run check`，浏览器场景通过上述实际入口单独运行。
