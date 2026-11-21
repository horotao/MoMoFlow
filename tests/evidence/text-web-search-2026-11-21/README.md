# Text 网络搜索验收 · 2026-11-21

独立浏览器存储 `http://localhost:5173/` 的实际主画布，项目「Text 网络搜索验收」。未修改用户 `127.0.0.1` 项目数据。

## 参考与实现

- Flora 现有 Sonnet Text 的 Web Search 为 Disabled／Enabled 下拉，位于思考强度下方，40px 参数行、12px 间隔，菜单圆角 12px、选项高 40px。观察开启后恢复关闭，未运行 Flora 生成。见 `flora-reference.jpg`。
- 复用当前参数下拉组件，中文为「网络搜索：关闭／开启」，默认关闭。沿用悬停、勾选、焦点、菜单动效及减少动态效果规则。费用提示已包含可能的搜索工具费用。

## 真实模型调用

复用现有 OpenAI Key，每个模型各一笔真实请求，使用同一公开文档查询提示词与低思考强度：

| 模型 | HTTP | 可点击来源数 |
| --- | --- | --- |
| GPT-6.2 Sol | 200 | 2 |
| GPT-6.1 Terra | 200 | 2 |
| GPT-6 Luna | 200 | 1 |

`real-models.json` 记录页面实际输出与链接。三个模型均成功保存到历史，未重试、未使用模拟响应替代真实调用。这里只统计模型请求，搜索工具调用次数未计量。

## 浏览器覆盖

- `search-menu.jpg`：新建默认关闭与中文菜单；`real-search-txt.jpg`、`real-search-md.jpg`：Luna 实际结果的 TXT／MD 来源链接。
- 源链接含 HTTP(S) 地址、独立打开目标与安全 rel；实际点击 MD 来源在新标签页打开 OpenAI 官方文档，节点 style 未变化。TXT 还包含来源标题的 aria-label 与悬停标题。
- 开关设为关闭后刷新，仍为关闭，历史来源保留；切换 Sol 历史项自动恢复开启，并显示两个来源；Luna 历史显示一个来源。锁定时网络搜索不可编辑，解锁后恢复。
- 菜单实测 12px 圆角、两行各 40px，正常指针展开动画为 generation-option-in；Escape 关闭并回到「网络搜索」。模拟减少动态效果时 animation-name 为 none，已恢复系统媒体设置。
- 验收结束选中 Luna 完成历史项，网络搜索开启，MD 格式，无活动任务；来源标签页为临时验收页。

## 自动覆盖

请求默认不携带工具；开启时三个模型均发送 web_search。非法开关值在访问 provider 前拒绝。引用跨多个文本片段的索引、无效或危险 URL、重叠范围、Unicode、旧历史缺省关闭、来源向下游展开、整批设置与凭据快照均有测试。搜索服务拒绝时只提交一次，不自动改为无搜索请求。

本次 `npm run check` 的最终结果见 `.codex/text-web-search-check.log`。之前的 replaceAll 兼容性错误已按现有 TypeScript 目标改用正则 replace。
