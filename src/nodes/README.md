# 节点开发约定

## 现有节点

| 节点 | 存储类型 | 组件 | 输入与输出 |
| --- | --- | --- | --- |
| Text | `text` | [CanvasTextNode](CanvasTextNode.tsx) | `text` 接收上游文本，`image-0` 至 `image-15` 接收图片；`text` 输出当前选中的已完成文本，可点击正文编辑并同步到下游；尚未生成时直接输出手写提示词。接入 GPT-6.2 Sol、GPT-6.1 Terra、GPT-6 Luna 和 APIMart 的 DeepSeek V4.1 Flash。GPT 模型可开启网络搜索并显示可点击来源。连入文本和图片时显示共用参考缩略图，每次可生成 1–20 份流式结果并进入历史；支持 @ 提及画布图片并自动连接；其余辅助图标为占位。 |
| Image | `sunburst` | [CanvasImageNode](CanvasImageNode.tsx) | `prompt` 接收 Text，替代节点内提示词；最多接入 16 张参考图。`result` 输出当前选中的结果。局部重绘版本固定使用保存的原图与蒙版，输出沿用 `result`。 |
| Video | `video` | [CanvasVideoNode](CanvasVideoNode.tsx) | 生成节点接收 Prompt、最多 9 张 Image 和 3 段 Video，经右侧 `video` 端口输出。Seedance 和 MiniMax 可切换首尾帧模式，用两个独立图片端口指定起止画面。接入 APIMart Seedance 2.5 Flash、Kling V4 Flash 和 MiniMax H3；选中节点后可调整生成选项，原始 MP4 下载完成后即随工作流保存，预览失败时可重试预览或下载原片。导入 MP4 节点仅提供视频输出。 |
| Audio | `audio` | [CanvasMediaPlaceholder](CanvasMediaPlaceholder.tsx) | 音频占位节点，无端口或运行操作。 |
| 群组 | `canvas-group` | [CanvasGroupNode](CanvasGroupNode.tsx) | 通过多选工具栏创建画布框，成员保留原有端口和连接。群组无输入或输出。 |

Image 使用 `data.composer` 保存提示词、生成数量、比例和模型选择。Text 使用 `data.textComposer` 保存提示词、TXT／MD、数量、模型选择、思考强度和网络搜索开关，`data.text` 保存当前选中的完成结果；`data.textHistory` 保存历次成功输出及其提示词、模型、搜索设置、来源引用、实际用量与计费快照，`activeTextResultId` 保存当前项。新 Text 与历史 Prompt 通过 `textComposer` 区分，刷新与混合迁移保留 Text 及其连接。运行过程不持久化；删除、切换项目或刷新会停止接收当前生成；完成的文本结果和模型记录会保存。

主画布注册 Image、Text、Video、Audio 和群组，见[节点注册表](index.ts)。旧项目的数据迁移和原始快照保留规则见[工作流](guides/workflow.md)。

新建 Image 默认使用 APIMart EXT、Sunburst 和 1:1。用户修改生成参数后，各创建入口通过[生成偏好](../components/imageNodePresets.ts)沿用当前浏览器的上次设置，详见[图片生成](guides/models.md)。

生成界面复用 [ImagePromptNode](../components/image-prompt-node/ImagePromptNode.tsx)，[图片检查器](../components/image-prompt-node/ImageInspector.tsx) 在图片信息下方展示[生成选项](../components/image-prompt-node/ImageGenerationOptions.tsx)。素材元信息规则见[节点和工具栏](guides/shared-ui.md)。

拖入画布的本地图片和从剪贴板粘贴的图片均由 [ImportedCanvasImage](ImportedCanvasImage.tsx) 呈现，沿用 Image 的存储类型和 `result` 输出。导入图片用作其他 Image 的参考图。

## 新增或扩展节点

在 [types.ts](types.ts) 定义数据并在注册表接入组件。同步更新 [创建工厂](../components/libraryCatalog.ts)、[菜单](../components/add-node-menu/AddNodeMenu.tsx)、[连接规则](connectionRules.ts)、[端口推荐](connectionRecommendations.ts) 和工作流恢复条件。涉及运行输入或素材时，同时检查任务调度、资源引用与持久化。

## 验证与文档维护

创建与连接见[连接约定](guides/connections.md)，外观见[节点和工具栏](guides/shared-ui.md)，模型与运行见[图片生成](guides/models.md)和[工作流](guides/workflow.md)。自动检查运行 `npm run check`。在独立浏览器存储中的实际主画布核对创建、拖动、正反向连接、锁定、缩放、撤销及刷新恢复，详细说明见[代码质量检查](../../docs/code-quality.md)。

Image 与 Text 的提示词支持 [@ 提及画布图片](guides/shared-ui.md#提及画布图片)，胶囊偏移和来源 ID 随 composer 保存，选择操作与真实图片连线一起撤销。请求中按模型实际图片输入顺序将胶囊序列化为 `image 1`、`image 2` 等，Kling V4 Image 使用 `@Image1`、`@Image2` 等，编辑器保留原名称。
