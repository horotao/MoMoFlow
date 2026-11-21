# 节点索引与开发约定

## 现有节点

| 节点 | 存储类型 | 组件 | 输入与输出 |
| --- | --- | --- | --- |
| Image | `sunburst` | [CanvasImageNode](CanvasImageNode.tsx) | 节点内填写提示词，最多接入 16 张参考图。`result` 输出当前选中的结果。 |
| Prompt（旧项目） | `text` | [TextNode](TextNode.tsx) | 恢复提示词、变量输入和文本输出。 |
| File（旧项目） | `file` | [FileNode](FileNode.tsx) | 恢复本地及远程素材，`file` 输出当前素材。 |
| Seedream 5.5（旧项目） | `seedream` | [SeedreamNode](SeedreamNode.tsx) | 恢复提示词输入、参考图与生成结果。 |
| Nano Banana 2.1（旧项目） | `nano-banana` | [NanoBananaNode](NanoBananaNode.tsx) | 恢复提示词输入、参考图与生成结果。 |

新版 Image 使用 `data.composer` 保存提示词、生成数量、比例和模型选择。旧版 GPT Image 同样使用 `sunburst` 存储类型，打开时由 [ImageNode](ImageNode.tsx) 判断并恢复旧版界面。旧节点保留原 ID、端口、位置、可用连线及本地素材。添加菜单继续提供新版 Image。当前画布无法呈现的已退役节点与所引用的本地素材仍保存在原项目中。注册表见 [index.ts](index.ts)，恢复逻辑见 [workflowStorage.ts](../persistence/workflowStorage.ts)。

## 新增或扩展节点

在 [types.ts](types.ts) 定义数据并在注册表接入组件。同步更新 [创建工厂](../components/libraryCatalog.ts)、[菜单](../components/add-node-menu/AddNodeMenu.tsx)、[连接规则](connectionRules.ts)、[端口推荐](connectionRecommendations.ts) 和工作流恢复条件。涉及运行输入或素材时，同时检查任务调度、资源引用与持久化。

## 验证与文档维护

创建与连接见[连接约定](guides/connections.md)，外观见[节点和工具栏](guides/shared-ui.md)，模型与运行见[图片生成](guides/models.md)和[工作流](guides/workflow.md)。自动检查运行 `npm run check`。在独立浏览器存储中的实际主画布核对创建、拖动、正反向连接、锁定、缩放、撤销及刷新恢复，详细说明见[代码质量检查](../../docs/code-quality.md)。
