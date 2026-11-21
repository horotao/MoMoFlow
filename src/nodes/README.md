# Image 节点开发约定

## 现有节点

| 节点 | 存储类型 | 组件 | 输入与输出 |
| --- | --- | --- | --- |
| Image | `sunburst` | [CanvasImageNode](CanvasImageNode.tsx) | 节点内填写提示词，最多接入 16 张参考图。`result` 输出当前选中的结果。 |

Image 使用 `data.composer` 保存提示词、生成数量、比例和模型选择。主画布只注册 Image，见[节点注册表](index.ts)。旧项目的数据迁移和原始快照保留规则见[工作流](guides/workflow.md)。

生成界面复用 [ImagePromptNode](../components/image-prompt-node/ImagePromptNode.tsx)，模型参数由[生成选项](../components/image-prompt-node/ImageGenerationOptions.tsx)编辑。

拖入画布的本地图片由 [ImportedCanvasImage](ImportedCanvasImage.tsx) 呈现，沿用 Image 的存储类型和 `result` 输出。导入图片用作其他 Image 的参考图。

## 新增或扩展节点

在 [types.ts](types.ts) 定义数据并在注册表接入组件。同步更新 [创建工厂](../components/libraryCatalog.ts)、[菜单](../components/add-node-menu/AddNodeMenu.tsx)、[连接规则](connectionRules.ts)、[端口推荐](connectionRecommendations.ts) 和工作流恢复条件。涉及运行输入或素材时，同时检查任务调度、资源引用与持久化。

## 验证与文档维护

创建与连接见[连接约定](guides/connections.md)，外观见[节点和工具栏](guides/shared-ui.md)，模型与运行见[图片生成](guides/models.md)和[工作流](guides/workflow.md)。自动检查运行 `npm run check`。在独立浏览器存储中的实际主画布核对创建、拖动、正反向连接、锁定、缩放、撤销及刷新恢复，详细说明见[代码质量检查](../../docs/code-quality.md)。
