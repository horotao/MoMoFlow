# Image 工作流

Image 可先连线再运行。运行前检查节点的提示词、参考图、锁定状态和所选模型。执行器按依赖顺序准备输入，根据输入和输出记录判断是否可复用上游结果。

任务按节点记录进度，可取消或手动重试。结果随工作流保存，刷新后可继续选择已有图片；进行中的任务状态只在当前会话内维护。调度与重试见 [workflowExecution.ts](../workflowExecution.ts)，界面接入见 [useWorkflowExecution.ts](../../components/useWorkflowExecution.ts)。
