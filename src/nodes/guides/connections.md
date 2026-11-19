# 节点创建、端口与连接

调整节点库、快捷创建、拖线推荐或输入解析时查阅。[返回节点索引](../README.md)

## 创建菜单

侧边栏、画布右键创建与拖线推荐共用 `NodeAddMenu`，以 `libraryItemLabel` 为基础显示名称，Figma 菜单中的 Resize 显示为“调节尺寸”；GPT Image 2.6 与 Nano Banana 的节点标题、设置面板和任务列表复用对应模型的名称常量，保持一致。菜单搜索同时匹配中文和原英文，端口说明仅翻译显示，不改变连接标识。拖线入口仍由 `connectionRecommendations` 按兼容端口筛选，同一节点的多个端口保持独立选择身份；提交前再次校验。新增节点入口或调整分组时同步维护 `nodeMenuCatalog.ts`，创建数据仍由 `createLibraryNode()` 提供。

GPT Image 2.6、Nano Banana 和 Seedream 5.5 在 Dock 与空白画布右键菜单的二级菜单中依次提供「模型节点」「文生图」和「图生图」。「模型节点」只创建模型，输入端口供手动连接。「文生图」和「图生图」都在模型左侧创建空白提示词节点，接到模型的 `prompt` 输入。「图生图」还在提示词下方创建空白导入节点，将其 `file` 输出预接至模型的 `image-0` 输入。GPT Image 在所选渠道和输出格式不支持参考图时为新节点使用 PNG。创建后选中模型并打开对应设置侧栏，节点超出可视区域时调整画布视野。拖线创建时，如果已有连线接入提示词输入，则直接使用上游提示词。一次创建产生的节点和连线可一起撤销或重做。

通过 Dock、空白右键或拖线菜单新建节点时，共享 `NodeFrame` 从 94% 轻弹至正常大小，复用 `spring.slow`；未连线节点以自身中心为支点，拖线新建则以连接端口为支点并配合连线回弹、端口涟漪。减少动态效果时保留淡入。临时状态由 `src/edges/connectionEffects.ts` 管理，不写入节点、连线或历史；撤销、重做和恢复不重播。`NodeEntrance` 等待节点测量后启动，拖线场景使用未缩放的端口布局坐标固定线头，完成或被指针打断后刷新 React Flow 测量。文本节点在拖线创建事务内初始化变量文档，确保新节点与连线可一起撤销。

侧边栏、Dock 与画布右键添加菜单隐藏坐标记录（`position-logger`）和模型名称（`model-input`）入口，包括分类列表、搜索及快速访问；节点注册、已有节点与 `createLibraryNode()` 保持可用。两个节点复用 250px 宽的新版共享外框、标题、更多菜单与端口；坐标记录分行显示 X / Y 并随拖动更新，模型名称保留参数选项及不可连接的 `options` 输入。

节点库的名称、分类和创建数据在 [libraryCatalog.ts](../../components/libraryCatalog.ts) 中维护。只有提供 `nodeType` 的条目才能通过 `createLibraryNode` 创建节点；目录中的展示卡片不等于已实现的节点，不应为占位卡片生成替代节点。

## 输入输出与交互约定

- 连接规则由 `connectionRules.ts` 的 `canConnect` 统一校验，`App.tsx` 的 `isValidConnection` 和推荐菜单创建入口共用：拒绝自连接、环路、涉及锁定节点的连接和连接到 `model-input` 的输入。同一个文本变量输入或描述器、生成器、图像工具、Preview、Router 输入端口只保留一条边；将兼容的新输出拖到已连接的输入端口时，直接替换该端口的旧连线，保留其他端口与下游分支。校验与提交共用 `withoutReplacedInput`，只在有效连接提交时替换，取消或无效连接保留原图；替换可一次撤销/重做，重复连接同一输出不产生修改。
- 主画布连线使用 [MagneticEdge.tsx](../../edges/MagneticEdge.tsx) 与 [MagneticConnectionPreview.tsx](../../edges/MagneticConnectionPreview.tsx)，和磁吸实验页共享融球、回弹及端口反馈实现。正式默认值集中在 [magneticTypes.ts](../../edges/magneticTypes.ts)：100% 视图下吸附范围 86px、线宽 2px、拖线小球使用起始端口的已连接圆心半径（文本端口 2.5px、媒体 / Router / 调色板端口 3px）、刚性 50%、回弹力度与范围 100%、涟漪羽化 1px、速度 1×；调参滑块保留在实验页。低于 100% 时，吸附距离、融球与涟漪随视图等比例缩小（50% 时吸附距离为 43px），100% 以上保持原屏幕大小上限；拖线两端的小球始终随端口一起缩放，使尺寸与连接后的圆心一致。选中的连线使用 3px 描边，线宽仍保持屏幕像素粗细。静止曲率沿用主画布的 0.25；拖线预览直接读取起始端口作用域内的颜色变量，线身、起点小球、前端小球和磁场同色；起点小球固定在起拖端口中心，与前端小球共用端口的 `--node-port-dot-radius` 和缩放规则，仅在连接预览期间显示；输入端口反向拖线也沿用该端口颜色，悬停目标不会改变取色。Router 按透传类型动态取色，旧 File 媒体端口读取其 `--file-port`；已连接线保留原有类型颜色。成功吸附后小球沿松手时的实际半径缩入端口、线身回弹并展开柔光涟漪；180 屏幕像素内的邻线沿整条线身轻弹，随距离衰减。反馈由 [connectionEffects.ts](../../edges/connectionEffects.ts) 独立管理，不写入节点、边、历史或工作流；撤销/重做清理反馈，恢复工作流不重播。端口效果通过实际 handle bounds 定位，兼容共享及旧节点；手势清理由 [useConnectionGesture.ts](../../edges/useConnectionGesture.ts) 管理：Escape、失焦与触摸取消同步结束拖动和自动平移，并清理待完成的点击连接；下一次拖动或点击连接都重新开始。拖动中缩放或平移时刷新命中，预览与提交均按当前缩放校验吸附距离，避免使用起拖时的范围误替换输入。无效连接、锁定限制与输入替换仍遵守原连接规则，减少动态效果时跳过位移并使用短暂原位确认。
- 拖动单个或多个节点时，已连接的线身按 `/tests/node-wire-spring.html` 默认 45% 力度拉伸，松手后带阻尼回弹。线头跟随实际端口，力度计算使用当前缩放比例。弹簧仅用于拖动反馈，减少动态效果时关闭，撤销、重做、键盘移动和恢复工作流不会触发。`/tests/magnetic-canvas.html` 用隔离画布验证这一交互。
- 将输入或输出把手拖到空白画布会打开可搜索的推荐菜单，按方向和端口类型筛选已实现节点；选中后才创建节点并连接正确端口，创建与连线作为一次撤销记录；从已连接的输入反向创建新节点时同样替换旧连接。Escape、点击外部或移动画布关闭菜单，取消不修改图数据。落在已有节点上仍使用普通连接规则。
- 右键单击空白画布打开同一快捷创建菜单，显示菜单目录中开放创建的节点，不按端口筛选；`model-input` 与 `position-logger` 保持隐藏，展示占位条目不创建节点；选择后在右键对应的画布坐标创建并选中节点，图像模型按所选模式附加输入节点与连线。搜索、键盘选择和关闭方式与拖线菜单一致；选择工具和手形工具均支持，右键拖动画布仍用于平移。
- 从图片/遮罩输入反向选择 Import 时，允许先创建并连接空 File，之后由用户添加图片；该特例只适用于本次新建的 Import，运行前仍必须通过已有图片校验。推荐 Image Describer 的 System Instructions 时会同时暴露该输入。未知或不兼容的媒体输出不推荐文本节点。

## 输入解析与锁定

- Prompt 的变量端口从 `variable-1` 开始，图片端口从 `image-0` 开始。沿用 `variableHandleId`、`variableIndex` 等辅助函数，避免混用编号。端口数量或位置变化后调用 `useUpdateNodeInternals`，使连线位置跟随更新。
- 连接期间，文本值通过 `resolveTextValue` 从当前图数据动态解析，不持续复制到下游节点数据中。参数从外部输入切回 **Use local value** 时例外：Image Describer 会将当前解析值写回本地参数并移除对应连线。具体入口见 [DescriberPanel.tsx](../../components/DescriberPanel.tsx)。
- Prompt 连接到已有素材的 File 时会显示类型不兼容；连接空 File 时不显示该错误。两种情况下 File 都解析为空文本，不会转换成提示词内容；这与模型节点在连接时直接拒绝错误输入的行为不同。
- Image Describer、Sunburst、Painter、Crop、Blur、Invert、Levels 和 Color correction 的图片输入接受纯图片 File 集合、Sunburst 结果、Painter、Crop、Blur、Invert、Levels 或 Color correction 输出。Painter、Crop、Blur、Invert、Levels 和 Color correction 使用集合的第一张图片作为底图。`imageOutput` 对 File 返回集合中的图片，对 Sunburst 只返回当前选中结果（没有有效选中项时取最后一张），对 Crop、Blur、Invert、Levels 和 Color correction 返回当前有效的处理结果；对 Painter 按 `sourceHandle` 区分 Result 与 Mask，并在上游或绘制内容变化后拒绝尚未更新的输出。不要将 File 的预览选中项误当作唯一输出。
- Sunburst 的 Prompt 接受 `text`、`image-describer`、`model-input` 的文本输出；Image Describer 的模型与指令输入也接受这些类型。Sunburst、Painter、Crop、Blur、Invert、Levels 和 Color correction 图片输出可连到 Sunburst 的图片/遮罩输入、Image Describer 的图片输入或 Painter / Crop / Blur / Invert / Levels 的 Image 输入，以及 Color correction / Preview 的 File 输入。
- `model-input` 用于模型名称和支持外部输入的节点参数，`parameter` 标识参数用途，`options` 保存可选文本。Options 输入端口尚未实现，继续保持不可连接。
- 对支持锁定的节点，数据更新、拖动、删除、连线和运行入口都需考虑 `locked`，异步结果写回前再次检查。节点内的编辑与点击控件按交互需要使用 `nodrag`、`nopan`、`nowheel`，避免与画布手势冲突。

## 代码入口与职责

| 入口 | 职责 |
| --- | --- |
| [types.ts](../types.ts)、[index.ts](../index.ts) | 节点数据类型、`AppNode` 联合类型、类型判断，以及组件注册 |
| [defaults.ts](../defaults.ts)、[describer.ts](../describer.ts)、[sunburst.ts](../sunburst.ts) | 文本默认值、描述器配置、Sunburst 参数与校验；创建节点时由节点库等入口使用 |
| [App.tsx](../../App.tsx) | 画布状态、右键与拖线创建节点菜单、拖放和剪贴板入口，以及节点交互属性 |
| [connectionRules.ts](../connectionRules.ts)、[connectionRecommendations.ts](../connectionRecommendations.ts)、[NodeAddMenu.tsx](../../components/NodeAddMenu.tsx)、[nodeMenuCatalog.ts](../../components/nodeMenuCatalog.ts) | 共用连接校验、按端口类型推荐节点，以及 Dock、右键和拖线共用的级联搜索菜单；`ConnectionMenu` 作为兼容导出入口 |
| [TextPromptEditor.tsx](../TextPromptEditor.tsx)、[textDocument.ts](../textDocument.ts)、[textVariables.ts](../textVariables.ts) | 富文本编辑、文档转换、变量端口编号与上游文本解析；变量视图见 `PromptVariableView.tsx` |
| [fileAsset.ts](../fileAsset.ts)、[fileCollection.ts](../fileCollection.ts)、[fileMedia.ts](../fileMedia.ts) | 文件导入、集合与输出类型、拆分文件、媒体预览及下载 |
| [describerRun.ts](../describerRun.ts)、[sunburstRun.ts](../sunburstRun.ts) | 从画布解析输入、校验运行条件、建立任务输入快照；`imageOutput` 定义图片输出语义 |
| [describerClient.ts](../describerClient.ts)、[sunburstClient.ts](../sunburstClient.ts) | 浏览器请求与响应处理；服务端接入位于根目录 `server/` |
| [workflowExecution.ts](../workflowExecution.ts)、[executionGraph.ts](../executionGraph.ts)、[useWorkflowExecution.ts](../../components/useWorkflowExecution.ts) | 按依赖准备输入、校验与执行、结果复用、取消和结果写回 |
| [taskQueue.ts](../taskQueue.ts)、[DescriberPanel.tsx](../../components/DescriberPanel.tsx)、[TaskManager.tsx](../../components/TaskManager.tsx) | 任务队列、运行入口与设置展示，以及任务列表、取消和重试界面 |
| [ModelRunButton.tsx](../../components/ModelRunButton.tsx)、[useModelTasks.ts](../../components/useModelTasks.ts)、[ModelTasksProvider.tsx](../../components/ModelTasksProvider.tsx) | 节点和任务面板共享临时运行状态，显示启动、旋转圆环、百分比和取消操作；不写入画布历史或持久化 |
| [TextNodeMenu.tsx](../TextNodeMenu.tsx)、[cloneTextNode.ts](../cloneTextNode.ts)、[sunburstClipboard.ts](../sunburstClipboard.ts) | 节点菜单及现有类型的复制、粘贴与克隆处理 |
| [assetResources.ts](../assetResources.ts)、[workflowStorage.ts](../../persistence/workflowStorage.ts)、[useWorkflowPersistence.ts](../../persistence/useWorkflowPersistence.ts) | 素材引用生命周期、IndexedDB 保存恢复及自动保存；撤销历史见 [useCanvasHistory.ts](../../components/useCanvasHistory.ts) |
| [shared/NodeFrame.tsx](../shared/NodeFrame.tsx)、[shared/NodePort.tsx](../shared/NodePort.tsx)、[shared/nodeStyle.css](../shared/nodeStyle.css)、[shared/mediaNodeStyle.css](../shared/mediaNodeStyle.css) | 共享外框、标题、端口与媒体节点视觉基础 |
| [NodeSettingsSection.tsx](../../components/NodeSettingsSection.tsx)、[ParameterField.tsx](../../components/ParameterField.tsx)、[NodeSettingsSidebar.css](../../components/NodeSettingsSidebar.css) | 设置面板分组、参数行及共用样式 |
| [index.css](../../index.css)、[SunburstNode.css](../SunburstNode.css) | 全局基础样式、兼容样式及 Sunburst 专用样式 |
