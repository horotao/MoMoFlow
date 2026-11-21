# 模型节点与渠道

在 Image 内输入提示词，按需连接上游 Image 作为参考图。工具栏提供模型与比例选择，选中单个 Image 后，右侧显示可折叠的「生成选项」浮层，替代旧节点设置侧边栏。浮层与工具栏共用模型和比例；按模型显示分辨率、背景、画质及 PNG / JPEG 输出，不展示审核、水印等低频参数。费用由实际 API 渠道结算，界面不使用 Flora 的价格。

节点内的生成按钮使用当前提示词、参考图、参数和数量提交任务。当前执行入口接入 GPT Image 2.6、Seedream 5.5 和 Nano Banana 2.1；选择器内其他模型、自动选择或多模型模式仍由运行前校验提示不支持。Seedream 与 Nano Banana 的设置分别保存在 `composer.modelSettings`，切换模型后保留；GPT Image 沿用节点已有设置，官方渠道将比例和分辨率转换为像素尺寸。渠道凭据在左侧「更多 → API 设置」配置。

[CanvasImageNode](../CanvasImageNode.tsx) 将界面状态接入画布，[执行图](../executionGraph.ts) 校验输入，[工作流执行器](../workflowExecution.ts) 调度生成。结果追加到节点，可切换、下载及用于下游 Image。任务错误和手动重试通过任务队列反馈。
