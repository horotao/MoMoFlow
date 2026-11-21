# Image 工作流

Image 可先连线再运行。运行前检查节点的提示词、参考图、锁定状态和所选模型。执行器按依赖顺序准备输入，根据输入和输出记录判断是否可复用上游结果。

任务按节点记录进度，可取消或手动重试。结果随工作流保存，刷新后可继续选择已有图片；进行中的任务状态只在当前会话内维护。调度与重试见 [workflowExecution.ts](../workflowExecution.ts)，界面接入见 [useWorkflowExecution.ts](../../components/useWorkflowExecution.ts)。

## 旧项目迁移

[迁移逻辑](../../persistence/legacyImageMigration.ts)将旧 GPT Image、Seedream 和 Nano Banana 节点转成新版 Image，保留模型设置、结果、历史、位置和锁定。旧 Prompt 的可解析文本进入下游 Image 的提示词；独立的非空 Prompt 变为可编辑提示词的 Image。Prompt 的变量按迁移时的值展开。

旧 File 的图片进入新版 Image 的历史，保留当前图片和可用的参考图连线。新版 Image 每条连线输出当前选中的一张图。旧项目中的 Mask、标注连线、非图片媒体和无法映射的节点或端口保存在原始快照中。

第一次保存迁移后的项目时，[存储层](../../persistence/workflowStorage.ts)把迁移前的完整工作流和本地素材键登记到本项目 IndexedDB 的 `workflows/pre-image-migration`。备份和当前画布在同一事务中写入，后续自动保存和素材清理继续保护快照引用的 Blob。重新打开项目沿用已保存的新版工作流。
