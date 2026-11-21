# Image 图片生成

在 Image 内输入提示词，按需连接上游 Image 作为参考图。工具栏提供模型与比例选择，节点内的生成按钮使用当前提示词、参考图、比例和数量提交任务。模型选择器中与实际请求相匹配的选项由运行前校验决定。当前 Image 执行入口接入 GPT Image 2.6，渠道凭据在左侧「更多 → API 设置」配置。

[CanvasImageNode](../CanvasImageNode.tsx) 将界面状态接入画布，[执行图](../executionGraph.ts) 校验输入，[工作流执行器](../workflowExecution.ts) 调度生成。结果追加到节点，可切换、下载及用于下游 Image。任务错误和手动重试通过任务队列反馈。
