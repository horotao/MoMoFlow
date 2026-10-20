# 节点索引与开发约定

本目录包含自定义节点组件、节点数据类型，以及文本解析、文件处理和模型运行等配套逻辑。本文记录节点用途、输入输出与开发入口；项目启动、环境变量和服务接入说明见[项目 README](../../README.md)，通用开发要求见 [AGENTS.md](../../AGENTS.md)。

## 现有节点

以下十种类型已在 [index.ts](./index.ts) 的 `nodeTypes` 中注册。`initialNodes` 当前为空，默认不预置节点。

| 显示名称 / 用途 | 类型标识 | 组件文件 | 输入与输出 |
| --- | --- | --- | --- |
| Prompt：编辑文本、组合上游变量 | `text` | [TextNode.tsx](./TextNode.tsx) | 变量输入 `variable-1` 起；输出解析后的文本 |
| Import / File：导入、预览和管理文件集合 | `file` | [FileNode.tsx](./FileNode.tsx) | 无输入端口；通过 `file` 端口输出文件，端口类型随集合内容变化 |
| Image Describer：根据图片生成可继续编辑的文本 | `image-describer` | [ImageDescriberNode.tsx](./ImageDescriberNode.tsx) | 图片输入 `image-0` 起；可暴露 `model`、`instructions` 文本输入；输出 `data.text` |
| Model Name / 参数选项：提供一个可选的文本值 | `model-input` | [ImageDescriberNode.tsx](./ImageDescriberNode.tsx) 中的 `ModelInputNode` | 输出当前 `data.model`；`options` 输入仅展示，不能连接 |
| GPT Image 2.5 Sunburst：生成或编辑图片 | `sunburst` | [SunburstNode.tsx](./SunburstNode.tsx) | `prompt`、`image-0` 起、`mask` 及暴露的参数输入；`result` 输出当前选中的结果图片 |
| Color correction：本地图片调色 | `color-correction` | [ColorCorrectionNode.tsx](./ColorCorrectionNode.tsx) | 单图片输入 `file`（File）；`result` 输出调色后的 PNG |
| Crop：本地裁剪图片 | `crop` | [CropNode.tsx](./CropNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出裁剪后的 PNG |
| Painter：在图片或空白画布上绘制 | `painter` | [PainterNode.tsx](./PainterNode.tsx) | 单图片输入 `image`；`result` 输出合成图片，`mask` 输出黑底白色绘制区域 |
| Preview：查看上游图片与遮罩 | `preview` | [PreviewNode.tsx](./PreviewNode.tsx) | 单图片输入 `file`，无输出；实时显示上游图片 |
| Position Logger：显示节点坐标的示例节点 | `position-logger` | [PositionLoggerNode.tsx](./PositionLoggerNode.tsx) | 左侧输入、右侧输出；不执行模型任务 |

节点库的名称、分类和创建数据在 [libraryCatalog.ts](../components/libraryCatalog.ts) 中维护。只有提供 `nodeType` 的条目才能通过 `createLibraryNode` 创建节点；目录中的展示卡片不等于已实现的节点，不应为占位卡片生成替代节点。

## 代码入口与职责

| 入口 | 职责 |
| --- | --- |
| [types.ts](./types.ts)、[index.ts](./index.ts) | 节点数据类型、`AppNode` 联合类型、类型判断，以及组件注册 |
| [defaults.ts](./defaults.ts)、[describer.ts](./describer.ts)、[sunburst.ts](./sunburst.ts) | 文本默认值、描述器配置、Sunburst 参数与校验；创建节点时由节点库等入口使用 |
| [App.tsx](../App.tsx) | 画布状态、推荐菜单与拖线创建节点、拖放和剪贴板入口，以及节点交互属性 |
| [connectionRules.ts](./connectionRules.ts)、[connectionRecommendations.ts](./connectionRecommendations.ts)、[ConnectionMenu.tsx](../components/ConnectionMenu.tsx) | 共用连接校验、按端口类型推荐节点，以及松手处的搜索菜单 |
| [TextPromptEditor.tsx](./TextPromptEditor.tsx)、[textDocument.ts](./textDocument.ts)、[textVariables.ts](./textVariables.ts) | 富文本编辑、文档转换、变量端口编号与上游文本解析；变量视图见 `PromptVariableView.tsx` |
| [fileAsset.ts](./fileAsset.ts)、[fileCollection.ts](./fileCollection.ts)、[fileMedia.ts](./fileMedia.ts) | 文件导入、集合与输出类型、拆分文件、媒体预览及下载 |
| [describerRun.ts](./describerRun.ts)、[sunburstRun.ts](./sunburstRun.ts) | 从画布解析输入、校验运行条件、建立任务输入快照；`imageOutput` 定义图片输出语义 |
| [describerClient.ts](./describerClient.ts)、[sunburstClient.ts](./sunburstClient.ts) | 浏览器请求与响应处理；服务端接入位于根目录 `server/` |
| [taskQueue.ts](./taskQueue.ts)、[DescriberPanel.tsx](../components/DescriberPanel.tsx)、[TaskManager.tsx](../components/TaskManager.tsx) | 任务状态与调度、实际请求和结果写回、任务列表及取消与重试 |
| [TextNodeMenu.tsx](./TextNodeMenu.tsx)、[cloneTextNode.ts](./cloneTextNode.ts)、[sunburstClipboard.ts](./sunburstClipboard.ts) | 节点菜单及现有类型的复制、粘贴与克隆处理 |
| [assetResources.ts](./assetResources.ts)、[workflowStorage.ts](../persistence/workflowStorage.ts)、[useWorkflowPersistence.ts](../persistence/useWorkflowPersistence.ts) | 素材引用生命周期、IndexedDB 保存恢复及自动保存；撤销历史见 [useCanvasHistory.ts](../components/useCanvasHistory.ts) |
| [index.css](../index.css)、[SunburstNode.css](./SunburstNode.css) | 共享节点样式、主题和 Sunburst 专用样式 |

## 输入输出与交互约定

- 连接规则由 `connectionRules.ts` 的 `canConnect` 统一校验，`App.tsx` 的 `isValidConnection` 和推荐菜单创建入口共用：拒绝自连接、环路、涉及锁定节点的连接和连接到 `model-input` 的输入。同一个文本变量输入或描述器、Sunburst、Painter、Crop、Color correction、Preview 输入端口只能连接一条边。
- 将输入或输出把手拖到空白画布会打开可搜索的推荐菜单，按方向和端口类型筛选已实现节点；选中后才创建节点并连接正确端口，创建与连线作为一次撤销记录。Escape、点击外部或移动画布关闭菜单，取消不修改图数据。落在已有节点上仍使用普通连接规则。
- 从图片/遮罩输入反向选择 Import 时，允许先创建并连接空 File，之后由用户添加图片；该特例只适用于本次新建的 Import，运行前仍必须通过已有图片校验。推荐 Image Describer 的 System Instructions 时会同时暴露该输入。未知或不兼容的媒体输出不推荐文本节点。
- Prompt 的变量端口从 `variable-1` 开始，图片端口从 `image-0` 开始。沿用 `variableHandleId`、`variableIndex` 等辅助函数，避免混用编号。端口数量或位置变化后调用 `useUpdateNodeInternals`，使连线位置跟随更新。
- 连接期间，文本值通过 `resolveTextValue` 从当前图数据动态解析，不持续复制到下游节点数据中。参数从外部输入切回 **Use local value** 时例外：Image Describer 会将当前解析值写回本地参数并移除对应连线；Sunburst 也会保存当前有效参数值，校验失败时保留原本地值。具体入口见 [DescriberPanel.tsx](../components/DescriberPanel.tsx) 和 [SunburstSettings.tsx](../components/SunburstSettings.tsx)。
- Prompt 连接到已有素材的 File 时会显示类型不兼容；连接空 File 时不显示该错误。两种情况下 File 都解析为空文本，不会转换成提示词内容；这与模型节点在连接时直接拒绝错误输入的行为不同。
- Image Describer、Sunburst、Painter、Crop 和 Color correction 的图片输入接受纯图片 File 集合、Sunburst 结果、Painter、Crop 或 Color correction 输出。Painter、Crop 和 Color correction 使用集合的第一张图片作为底图。`imageOutput` 对 File 返回集合中的图片，对 Sunburst 只返回当前选中结果（没有有效选中项时取最后一张），对 Crop 和 Color correction 返回当前有效的处理结果；对 Painter 按 `sourceHandle` 区分 Result 与 Mask，并在上游或绘制内容变化后拒绝尚未更新的输出。不要将 File 的预览选中项误当作唯一输出。
- Sunburst 的 Prompt 和暴露参数接受 `text`、`image-describer`、`model-input` 的文本输出；Image Describer 的模型与指令输入也接受这些类型。Sunburst、Painter、Crop 和 Color correction 图片输出可连到 Sunburst 的图片/遮罩输入、Image Describer 的图片输入或 Painter / Crop 的 Image 输入，以及 Color correction / Preview 的 File 输入。
- `model-input` 同时用于模型名称和 Sunburst 参数选项，`parameter` 标识参数用途，`options` 保存可选文本。Options 输入端口尚未实现，继续保持不可连接。
- 从 Sunburst 暴露的参数输入反向选择 Model Name 时，复用 `sunburstParameterData`，按目标参数的当前本地值初始化名称、值和选项（保留自定义尺寸）；普通模型名称节点仍使用原默认值。
- 对支持锁定的节点，数据更新、拖动、删除、连线和运行入口都需考虑 `locked`，异步结果写回前再次检查。节点内的编辑与点击控件按交互需要使用 `nodrag`、`nopan`、`nowheel`，避免与画布手势冲突。

## Preview 预览约定

Preview 位于 Tools → Helpers，也出现在图片输出拖到空白处的推荐菜单中。`file` 输入接受纯图片 Import、Sunburst 当前结果、Painter Result / 黑白 Mask、Crop Output 或 Color correction Result，同一个输入只允许一条连线，不接受文本或视频。输入反向拖线可创建 Import、Sunburst、Crop、Color correction 或 Painter，并选择 Result / Mask。

图片按原始比例展示，悬停显示尺寸、下载和全屏入口；双击图片也可打开共用的 FileGallery。Painter 的 Result 和 Mask 通过 `painterLivePreview.ts` 同步绘制帧，按住鼠标绘制、擦除或拖动形状时实时更新，取消笔画时同步恢复。绘制中和正式图片尚未导出时，下载与全屏入口暂不可用。实时画面仅存在内存中，不写入节点数据、历史、存储或模型输入；每笔仍在松开后提交一次。Import 图片集合可翻页查看，翻页不改变上游输出。未连接或上游未就绪时仅显示棋盘格，不显示居中图标与文字；图片加载失败时显示错误提示。断开或删除上游后立即清空，不缓存旧输出。解析入口为 `preview.ts`，连接与失效行为由 `preview.test.ts` 随 `npm test` 验证。

Preview 不运行模型、不生成新的图片素材；节点、选中图片和连线随画布保存。支持重命名、锁定、复制粘贴、删除和撤销；复制或剪切得到的独立 Preview 不携带上游连线，需重新连接图片。主题、菜单、下载和全屏复用现有节点组件。

## Color correction 调色约定

Color correction 位于 Tools → Editing，也出现在图片输入/输出的推荐菜单中。File 接受一张上游图片（集合取第一张），Result 输出原尺寸 PNG 并保留透明通道。在浏览器本地处理，不调用模型。曝光为 −5～5（步长 0.01），对比度、饱和度、色温、色调、高光、阴影为 −100～100（步长 1），默认均为 0。曝光在线性光空间处理，其余调节使用本地像素算法；界面参考 Weavy，不承诺与其内部算法逐像素一致。

滑块拖动实时更新节点和已连接的 Preview，松开后提交一次；Escape 或指针取消放弃当前拖动。数字输入失焦或 Enter 提交，Escape 取消；Reset 将七项全部归零。图片悬停/键盘聚焦显示左上角原图对比、右上角下载、左下角原始尺寸。按住对比按钮或在按钮上按住空格/Enter 暂时显示原图，松开恢复效果；对比不改变参数、Result 或下载内容。

后台线程按原尺寸完成调色，再从同一份像素生成最长边为 1024 的交互预览和原尺寸 PNG。拖动时只保留最新待处理参数，源图变化时终止旧线程；取消操作后的旧帧不会回写。导出未完成时禁用下载；上游变化、断开或参数变更时，下游不读取旧结果。实时预览仅在内存中，派生图片不增加撤销步骤。支持锁定、重命名、副本、剪切粘贴、撤销重做和 IndexedDB 恢复；复制/剪切保留输入底图快照。跨域图片需允许浏览器读取，失败时显示提示。

数据与像素算法见 [colorCorrection.ts](./colorCorrection.ts)，预览/导出见 [colorCorrectionRender.ts](./colorCorrectionRender.ts)，实时帧见 [colorCorrectionLivePreview.ts](./colorCorrectionLivePreview.ts)。`colorCorrection.test.ts` 随 `npm test` 验证七项调节方向、默认像素与透明通道、输出失效、连线、剪贴板及素材映射。

## Crop 裁剪约定

Crop 位于 Tools → Editing，也出现在图片连接的推荐菜单中。Input 接收 Import、Sunburst、Painter、Color correction 或另一个 Crop 的图片；集合使用第一张图片。Output 输出原始分辨率下裁剪后的透明通道 PNG，不缩放图像、不运行模型或消耗额度。裁剪矩形以原图的归一化坐标保存，上游图片更换时保留相对选区。

图像上显示裁剪框、四角/四边拖动区域、三分辅助线和框外遮罩。拖动内部移动选区；拖动边角调整大小，选区不会超过原图边界。底部 Aspect ratio 提供 21:9、16:9、4:3、3:2、1:1、2:3、3:4、9:16、9:21，选择后在整张原图中居中适配并锁定比例。Dimensions 的 W/H 是实际输出像素，失焦或 Enter 提交，Escape 取消；解锁时可独立修改，锁定时联动且限制在图片范围内。Reset 恢复整张原图并解除比例锁定。

每次拖动结束提交一次，可撤销/重做；Escape 或指针取消恢复拖动前状态。连接的 Preview 在拖动中显示本地裁剪帧，正式输出在松开后导出。临时帧不进入保存、历史或模型请求。上游断开、替换或选区尚未导出时不向下游提供旧结果，异步导出检查最新图结构以防止过期回写。复制/剪切保留底图快照，副本无需原连线即可编辑；底图、结果和选区随 IndexedDB 保存，锁定节点禁止编辑。

核心几何与剪贴板校验位于 [crop.ts](./crop.ts)，界面与导出位于 [CropNode.tsx](./CropNode.tsx)，实时预览位于 [cropLivePreview.ts](./cropLivePreview.ts)。`crop.test.ts` 使用现有 Node.js 测试运行器随 `npm test` 验证边界、比例、尺寸、输出失效、连接和素材恢复。

## Painter 绘制约定

Painter 在浏览器本地绘制，不运行模型或消耗额度。工具包含 Canvas、Brush、Shape 和 Eraser；Shape 提供 Rectangle、Ellipse、Triangle、Star。画笔支持颜色、透明度、大小和硬度，橡皮擦拥有独立参数；Reset 清除绘制层，保留底图和画布设置，可撤销。Canvas 可设置背景色、透明度和尺寸（1–8192），连接图片后尺寸由原图决定并禁用编辑。

笔画使用归一化坐标保存；预览、Result、黑白 Mask 和供 Sunburst 使用的透明 Mask 由同一绘制层生成，橡皮擦只移除绘制内容。白色 Mask 表示绘制区域，与笔画颜色无关；连接到 Sunburst 的 Mask 输入时使用对应的透明 PNG，保持现有 API 的透明区域编辑语义。输入缺失、导出未完成或上游变化时不可使用旧输出。源图片必须允许浏览器跨域读取。

每笔绘制在松开指针后提交一次，指针取消或 Escape 放弃当前笔画。派生输出更新不增加撤销步骤，笔画和 Reset 可通过画布撤销/重做。交互预览最长边限制为 1024 像素，导出仍使用原图完整尺寸。复制或剪切时保留底图快照，副本无需原来的连线也能继续编辑。笔画及输出素材随画布保存到 IndexedDB；素材收集、复制、锁定与恢复使用现有机制。绘制渲染位于 `painterRender.ts`，数据与剪贴板校验位于 `painter.ts`；`painter.test.ts` 验证端口、失效输出、透明 Mask 转换和素材映射，随 `npm test` 运行。

## 模型运行约定

Image Describer 运行前需要至少一张有效的上游图片和非空模型值；当前实际接入的描述模型为 `deepseek-flash`。图片按输入端口编号排序，生成文本写回 `data.text`。

Sunburst 运行前必须连接非空 Prompt，参考图片和 Mask 可选。连接了 Image 时，上游必须已有图片；使用 Mask 时还必须连接参考图片，且 Mask 只能提供一张图片。图片格式、尺寸及参数限制由 `sunburst.ts`、`sunburstClient.ts` 和服务端共同校验，不应只依赖界面限制。成功结果追加到 `results`，并更新 `activeResultId`。多张结果时，页码前的图标可切换单张预览与全部图片；全部视图复用 File Node 网格样式，点击缩略图选择输出结果，双击打开全屏。视图切换仅影响当前预览，不改变已选结果。下载按钮同样复用 File Node：单张视图下载当前图片，全部图片视图按当前排序将所有结果打包为 `images.zip`。

Sunburst 的 Order by 菜单复用 File Node 的 Date added / Name 排序，排序偏好保存在节点数据中；排序只改变预览顺序，不改变当前输出或原始结果顺序。全部视图中可将缩略图拖到空白画布，复用 `extractFileAsset` 将图片移至新的 File 节点；原节点至少保留一张结果，若移走当前输出则选中剩余的最新结果。创建与移出作为一次撤销记录，取消拖动、落在非画布区域、节点删除或锁定时不执行。

两类模型共用 `DescriberPanel` 的任务入口：先对本次选择的节点进行准备阶段校验，再统一入队；准备阶段出现错误时，本次任务均不入队。这不代表所有校验都在入队前完成：描述器的 1–14 张图片数量限制，以及图片格式、体积、Mask 尺寸和透明区域等检查，在入队后的客户端请求流程中执行，服务端还会进一步校验。某个任务在这些后续检查中失败，不会阻止其他节点的任务提交，也不会回滚已提交的请求。

任务保存运行时的输入快照，同一节点的多次运行按顺序处理，不同节点可并行；已有活动任务时阻止重复运行。

取消会中断本地请求等待，已取消任务的迟到结果不得写回。节点删除或锁定后也不得写入结果。失败不自动重试；手动 Retry 按当前节点输入、参数与面板 Runs 重新创建任务。取消或超时不代表服务商停止处理或计费，不能用模拟进度或固定费用代替实际调用结果。

密钥只在服务端读取，不放入节点数据或浏览器环境变量。纯前端验证和自动化测试不需要真实模型请求；需要验证真实生成时，应明确区分其结果和可能产生的费用。

## 新增或扩展节点

1. 在 `types.ts` 定义明确的数据类型，并扩展 `AppNode`；组件使用对应的 `NodeProps` 类型。组件名采用 PascalCase，节点类型标识采用 kebab-case，遵循现有 TypeScript 风格。
2. 在本目录创建组件，并在 `index.ts` 的 `nodeTypes` 注册。明确默认值来源；注册节点不代表需要加入 `initialNodes`。
3. 需要出现在节点库时，在 `libraryCatalog.ts` 添加条目和创建数据，并检查侧栏点击与拖入入口。按需检查 `App.tsx` 中拖线到空白处的创建逻辑，不能假定它自动支持新类型。
4. 定义稳定的输入输出端口 ID、允许连接的类型和单端口连接数量。按需扩展 `isValidConnection`、文本或图片解析逻辑，并验证动态端口布局。
5. 需要设置面板或模型运行时，接入对应面板、运行前校验、任务状态、取消与结果写回流程。复用现有任务机制，避免在组件中另建一套请求和状态管理。
6. 核对复制粘贴、克隆、删除、锁定与撤销重做。复用 `TextNodeMenu` 时，还需扩展其允许操作的节点类型判断，不能只挂载组件；菜单中的“保存节点”目前仍禁用，与画布自动保存是独立功能。需要持久化的数据放入节点数据；临时 UI 状态和请求控制器留在运行时。涉及新素材字段时，同时扩展素材引用收集与 `workflowStorage.ts` 的 `mapAssets`，验证保存恢复及资源释放。任务和撤销历史目前不跨刷新恢复，恢复画布也不会自动重发模型任务。
7. 为新增行为选择合适的验证，并在同一次改动中更新本文的节点索引和受影响约定。删除节点或更改已保存数据、类型标识、端口 ID 时，还需考虑旧画布和剪贴板内容的兼容处理。

## 验证与文档维护

按仓库要求运行 `npm test`、`npm run lint`、`npm run build`，并用 `git diff --check` 检查补丁。现有测试使用 Node.js 内置测试运行器，覆盖节点逻辑、持久化和服务端校验；测试使用受控输入或响应，不需要真实模型额度。新测试采用有明确含义的 `*.test.ts` 或 `*.test.tsx` 文件名，并确保测试命令实际能够运行它。

画布改动需手动验证节点拖动、坐标更新、新建连线、缩放和小地图；根据改动检查锁定、复制粘贴、撤销与刷新恢复。编辑器改动还需验证 Tab 建议、中文输入、撤销、粘贴和内联变量；模型流程改动需检查缺少输入、重复运行、取消、失败与结果写回。

新增、删除节点，或修改输入输出、运行条件、注册方式及本文已记录的开发约定时，同步更新相应内容。仅调整内部实现或样式且不影响描述时，无需更新。本文保留稳定约定和代码入口，不逐行复述实现，也不充当逐次变更日志；复杂节点需要更详细说明时，可另建文档并在此链接。
