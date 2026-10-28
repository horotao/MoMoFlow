# 节点索引与开发约定

本目录包含自定义节点组件、节点数据类型，以及文本解析、文件处理和模型运行等配套逻辑。本文记录节点用途、输入输出与开发入口；项目启动、环境变量和服务接入说明见[项目 README](../../README.md)，通用开发要求见 [AGENTS.md](../../AGENTS.md)。

## 现有节点

以下节点类型已在 [index.ts](./index.ts) 的 `nodeTypes` 中注册。`initialNodes` 当前为空，默认不预置节点。

| 显示名称 / 用途 | 类型标识 | 组件文件 | 输入与输出 |
| --- | --- | --- | --- |
| 路由（Router）：整理连线、统一更换上游 | `router` | [RouterNode.tsx](./RouterNode.tsx) | 单输入 `input`（Input）；`output`（Output）原样透传，可连接多个下游 |
| 文本迭代（Text Iterator）：批量执行文本列表 | `text-iterator` | [TextIteratorNode.tsx](./TextIteratorNode.tsx) | `input` 接收文本或 JSON 文本数组；`text` 为逐项文本输出，后续模型按条目分别运行 |
| 图片迭代（Image Iterator）：批量执行图片列表 | `image-iterator` | [ImageIteratorNode.tsx](./ImageIteratorNode.tsx) | 无输入端口；`file` 为逐张图片输出，后续模型按图片分别运行 |
| 提示词（Prompt）：编辑文本、组合上游变量 | `text` | [TextNode.tsx](./TextNode.tsx) | 变量输入 `variable-1` 起；输出解析后的文本 |
| 导入 / 文件（Import / File）：导入、预览和管理文件集合 | `file` | [FileNode.tsx](./FileNode.tsx) | 无输入端口；通过 `file` 端口输出文件，端口类型随集合内容变化 |
| 图像描述（Image Describer）：根据图片生成可继续编辑的文本 | `image-describer` | [ImageDescriberNode.tsx](./ImageDescriberNode.tsx) | 图片输入 `image-0` 起；可暴露 `model`、`instructions` 文本输入；输出 `data.text` |
| 模型名称 / 参数选项（Model Name）：提供一个可选的文本值 | `model-input` | [ImageDescriberNode.tsx](./ImageDescriberNode.tsx) 中的 `ModelInputNode` | 输出当前 `data.model`；`options` 输入仅展示，不能连接 |
| GPT Image 2.5：生成或编辑图片 | `sunburst` | [SunburstNode.tsx](./SunburstNode.tsx) | `prompt`、`image-0` 起、`mask` 及暴露的参数输入；`result` 输出当前选中的结果图片 |
| Ideogram 4.5：生成或编辑图片 | `ideogram` | [IdeogramNode.tsx](./IdeogramNode.tsx) | 必需的 `prompt`；`image-0` 原图、`image-1` 起参考图、`mask` 及暴露的生成/编辑参数输入；`result` 输出选中图片 |
| Nano Banana：生成或编辑图片 | `nano-banana` | [NanoBananaNode.tsx](./NanoBananaNode.tsx) | 必需的 `prompt`、可选的 `image-0` 起与暴露的 `aspectRatio` / `imageSize` / `outputFormat` 输入；`result` 输出选中图片 |
| 调色板（Color palette）：制作最多十色色板 | `color-palette` | [ColorPaletteNode.tsx](./ColorPaletteNode.tsx) | 无输入；`image`（Image）输出纯色条 PNG，`text`（Text）输出按顺序以 `*` 连接的 HEX 色值 |
| 合成器（Compositor）：图片、文本与矢量图层合成 | `compositor` | [CompositorNode.tsx](./compositor/CompositorNode.tsx) | `background`、`layer-1` 起的动态图片输入；`result`（Output）输出实际合成 PNG；独立图层编辑器见[使用与架构](../../docs/compositor.md) |
| 色彩校正（Color correction）：本地图片调色 | `color-correction` | [ColorCorrectionNode.tsx](./ColorCorrectionNode.tsx) | 单图片输入 `file`（File）；`result` 输出调色后的 PNG |
| 色阶（Levels）：本地图片色阶 | `levels` | [LevelsNode.tsx](./LevelsNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸 PNG |
| 混合（Blend）：双图片混合 | `blend` | [BlendNode.tsx](./BlendNode.tsx) | `back`（Back）、`front`（Front）图片输入；`result`（Result）输出合成 PNG |
| 对比（Compare）：双图片对比 | `compare` | [CompareNode.tsx](./CompareNode.tsx) | `input-1` / `input-2`（Input 1 / Input 2）；`output-1` / `output-2`（Output 1 / Output 2）分别透传对应输入 |
| 调整尺寸（Resize）：本地调整图片宽高 | `resize` | [ResizeNode.tsx](./ResizeNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出指定尺寸 PNG |
| 旋转与翻转（Rotate and flip）：本地旋转与镜像 | `rotate-flip` | [RotateFlipNode.tsx](./RotateFlipNode.tsx) | 单图片输入 `image`（Input）；`result`（Result）输出旋转后的原分辨率 PNG |
| 反相（Invert）：本地图片 / 遮罩反选 | `invert` | [InvertNode.tsx](./InvertNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸反色 PNG |
| 模糊（Blur）：本地图片模糊 | `blur` | [BlurNode.tsx](./BlurNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸 PNG |
| 裁剪（Crop）：本地裁剪图片 | `crop` | [CropNode.tsx](./CropNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出裁剪后的 PNG |
| 绘图（Painter）：在图片或空白画布上绘制 | `painter` | [PainterNode.tsx](./PainterNode.tsx) | 单图片输入 `image`；`result` 输出合成图片，`mask` 输出黑底白色绘制区域 |
| 蒙版扩张 / 收缩（Matte Grow / Shrink）：调整蒙版边缘 | `matte-grow-shrink` | [MatteGrowShrinkNode.tsx](./MatteGrowShrinkNode.tsx) | `image`（Input）接收图片或黑白蒙版；`result`（Output）输出原尺寸灰度蒙版 PNG |
| 蒙版提取（Masks Extractor）：点击物体生成蒙版 | `masks-extractor` | [MasksExtractorNode.tsx](./MasksExtractorNode.tsx) | 单图片输入 `image`；`result`（Image With Alpha）输出透明抠图，`mask`（Mask）输出黑白蒙版 |
| 预览（Preview）：查看上游图片与遮罩 | `preview` | [PreviewNode.tsx](./PreviewNode.tsx) | 单图片输入 `file`，无输出；实时显示上游图片 |
| 坐标记录（Position Logger）：显示节点坐标的示例节点 | `position-logger` | [PositionLoggerNode.tsx](./PositionLoggerNode.tsx) | 左侧输入、右侧输出；不执行模型任务 |

画布节点的默认标题使用中文，自定义名称与导入文件名保持原样；模型品牌名（如 GPT Image 2.5）保留英文。标题与重命名框使用相同默认文案，界面字体复用全局 `--font-ui`（英文 Inter、macOS 中文苹方、Windows 中文 Noto Sans SC）。

侧边栏、画布右键创建与拖线推荐菜单共用 `libraryItemLabel` 显示名称；GPT Image 2.5 与 Nano Banana 的节点标题、设置面板和任务列表复用对应模型的名称常量，保持一致。菜单搜索同时匹配中文和原英文，端口说明仅翻译显示，不改变连接标识。

侧边栏隐藏坐标记录（`position-logger`）和模型名称（`model-input`）入口，包括工具列表、搜索及快速访问；节点注册、已有节点和其他创建入口保持可用。

节点库的名称、分类和创建数据在 [libraryCatalog.ts](../components/libraryCatalog.ts) 中维护。只有提供 `nodeType` 的条目才能通过 `createLibraryNode` 创建节点；目录中的展示卡片不等于已实现的节点，不应为占位卡片生成替代节点。

节点标题与侧栏卡片共用 [nodeIcons.ts](./nodeIcons.ts) 中的共享图标映射（通用节点使用 Hugeicons Stroke Rounded）；标题通过 [NodeIcon.tsx](./NodeIcon.tsx) 渲染并保留各节点原有尺寸。修改节点图标时更新共享映射，避免两处显示不一致。Nano Banana 与 Ideogram 4.5 使用 [modelBrandIcons.ts](./modelBrandIcons.ts) 中从 Weavy 对应模型卡片同步的原始 SVG 路径；Nano Banana 保留品牌紫色，Ideogram 随主题文字颜色变化，节点库、标题与设置面板共用同一图标。Router 仍根据输入内容切换文本、图片 / 蒙版、视频、音频、3D 或文件图标，未连接时使用路由图标。

Compositor 文本、形状及钢笔交互与验证入口见 [合成编辑器文档](../../docs/compositor.md)。锚点在不同缩放下保持固定命中区，可越界调整及插入曲线点；交互草稿按帧更新，提交仍复用工作流历史与持久化。

Compositor 输出解析在每次读取中按节点与输出端口复用校验结果，环路检查独立跟踪当前路径；缓存不跨编辑、撤销或恢复复用。`compositorResolution.test.ts` 随 `npm test` 检查共享上游、输出端口区分、失效和环路；浏览器验证页同时运行 Enter 键回归。

## 代码入口与职责

| 入口 | 职责 |
| --- | --- |
| [types.ts](./types.ts)、[index.ts](./index.ts) | 节点数据类型、`AppNode` 联合类型、类型判断，以及组件注册 |
| [defaults.ts](./defaults.ts)、[describer.ts](./describer.ts)、[sunburst.ts](./sunburst.ts) | 文本默认值、描述器配置、Sunburst 参数与校验；创建节点时由节点库等入口使用 |
| [App.tsx](../App.tsx) | 画布状态、右键与拖线创建节点菜单、拖放和剪贴板入口，以及节点交互属性 |
| [connectionRules.ts](./connectionRules.ts)、[connectionRecommendations.ts](./connectionRecommendations.ts)、[ConnectionMenu.tsx](../components/ConnectionMenu.tsx) | 共用连接校验、按端口类型推荐节点，以及右键和拖线共用的搜索菜单 |
| [TextPromptEditor.tsx](./TextPromptEditor.tsx)、[textDocument.ts](./textDocument.ts)、[textVariables.ts](./textVariables.ts) | 富文本编辑、文档转换、变量端口编号与上游文本解析；变量视图见 `PromptVariableView.tsx` |
| [fileAsset.ts](./fileAsset.ts)、[fileCollection.ts](./fileCollection.ts)、[fileMedia.ts](./fileMedia.ts) | 文件导入、集合与输出类型、拆分文件、媒体预览及下载 |
| [describerRun.ts](./describerRun.ts)、[sunburstRun.ts](./sunburstRun.ts) | 从画布解析输入、校验运行条件、建立任务输入快照；`imageOutput` 定义图片输出语义 |
| [describerClient.ts](./describerClient.ts)、[sunburstClient.ts](./sunburstClient.ts) | 浏览器请求与响应处理；服务端接入位于根目录 `server/` |
| [taskQueue.ts](./taskQueue.ts)、[DescriberPanel.tsx](../components/DescriberPanel.tsx)、[TaskManager.tsx](../components/TaskManager.tsx) | 任务状态与调度、实际请求和结果写回、任务列表及取消与重试 |
| [ModelRunButton.tsx](../components/ModelRunButton.tsx)、[useModelTasks.ts](../components/useModelTasks.ts)、[ModelTasksProvider.tsx](../components/ModelTasksProvider.tsx) | 节点和任务面板共享临时运行状态，显示启动、旋转圆环、百分比和取消操作；不写入画布历史或持久化 |
| [TextNodeMenu.tsx](./TextNodeMenu.tsx)、[cloneTextNode.ts](./cloneTextNode.ts)、[sunburstClipboard.ts](./sunburstClipboard.ts) | 节点菜单及现有类型的复制、粘贴与克隆处理 |
| [assetResources.ts](./assetResources.ts)、[workflowStorage.ts](../persistence/workflowStorage.ts)、[useWorkflowPersistence.ts](../persistence/useWorkflowPersistence.ts) | 素材引用生命周期、IndexedDB 保存恢复及自动保存；撤销历史见 [useCanvasHistory.ts](../components/useCanvasHistory.ts) |
| [index.css](../index.css)、[SunburstNode.css](./SunburstNode.css) | 共享节点样式、主题和 Sunburst 专用样式 |

## 输入输出与交互约定

- 连接规则由 `connectionRules.ts` 的 `canConnect` 统一校验，`App.tsx` 的 `isValidConnection` 和推荐菜单创建入口共用：拒绝自连接、环路、涉及锁定节点的连接和连接到 `model-input` 的输入。同一个文本变量输入或描述器、生成器、图像工具、Preview、Router 输入端口只保留一条边；将兼容的新输出拖到已连接的输入端口时，直接替换该端口的旧连线，保留其他端口与下游分支。校验与提交共用 `withoutReplacedInput`，只在有效连接提交时替换，取消或无效连接保留原图；替换可一次撤销/重做，重复连接同一输出不产生修改。
- 将输入或输出把手拖到空白画布会打开可搜索的推荐菜单，按方向和端口类型筛选已实现节点；选中后才创建节点并连接正确端口，创建与连线作为一次撤销记录；从已连接的输入反向创建新节点时同样替换旧连接。Escape、点击外部或移动画布关闭菜单，取消不修改图数据。落在已有节点上仍使用普通连接规则。
- 右键单击空白画布打开同一快捷创建菜单，显示节点库中全部已实现节点，不按端口筛选；选择后在右键对应的画布坐标创建并选中节点，不附加连线。搜索、键盘选择和关闭方式与拖线菜单一致；选择工具和手形工具均支持，右键拖动画布仍用于平移。
- 从图片/遮罩输入反向选择 Import 时，允许先创建并连接空 File，之后由用户添加图片；该特例只适用于本次新建的 Import，运行前仍必须通过已有图片校验。推荐 Image Describer 的 System Instructions 时会同时暴露该输入。未知或不兼容的媒体输出不推荐文本节点。
- Prompt 的变量端口从 `variable-1` 开始，图片端口从 `image-0` 开始。沿用 `variableHandleId`、`variableIndex` 等辅助函数，避免混用编号。端口数量或位置变化后调用 `useUpdateNodeInternals`，使连线位置跟随更新。
- 连接期间，文本值通过 `resolveTextValue` 从当前图数据动态解析，不持续复制到下游节点数据中。参数从外部输入切回 **Use local value** 时例外：Image Describer 会将当前解析值写回本地参数并移除对应连线；Sunburst 也会保存当前有效参数值，校验失败时保留原本地值。具体入口见 [DescriberPanel.tsx](../components/DescriberPanel.tsx) 和 [SunburstSettings.tsx](../components/SunburstSettings.tsx)。
- Prompt 连接到已有素材的 File 时会显示类型不兼容；连接空 File 时不显示该错误。两种情况下 File 都解析为空文本，不会转换成提示词内容；这与模型节点在连接时直接拒绝错误输入的行为不同。
- Image Describer、Sunburst、Painter、Crop、Blur、Invert、Levels 和 Color correction 的图片输入接受纯图片 File 集合、Sunburst 结果、Painter、Crop、Blur、Invert、Levels 或 Color correction 输出。Painter、Crop、Blur、Invert、Levels 和 Color correction 使用集合的第一张图片作为底图。`imageOutput` 对 File 返回集合中的图片，对 Sunburst 只返回当前选中结果（没有有效选中项时取最后一张），对 Crop、Blur、Invert、Levels 和 Color correction 返回当前有效的处理结果；对 Painter 按 `sourceHandle` 区分 Result 与 Mask，并在上游或绘制内容变化后拒绝尚未更新的输出。不要将 File 的预览选中项误当作唯一输出。
- Sunburst 的 Prompt 和暴露参数接受 `text`、`image-describer`、`model-input` 的文本输出；Image Describer 的模型与指令输入也接受这些类型。Sunburst、Painter、Crop、Blur、Invert、Levels 和 Color correction 图片输出可连到 Sunburst 的图片/遮罩输入、Image Describer 的图片输入或 Painter / Crop / Blur / Invert / Levels 的 Image 输入，以及 Color correction / Preview 的 File 输入。
- `model-input` 同时用于模型名称和 Sunburst 参数选项，`parameter` 标识参数用途，`options` 保存可选文本。Options 输入端口尚未实现，继续保持不可连接。
- 从 Sunburst 暴露的参数输入反向选择 Model Name 时，复用 `sunburstParameterData`，按目标参数的当前本地值初始化名称、值和选项（保留自定义尺寸）；普通模型名称节点仍使用原默认值。
- 对支持锁定的节点，数据更新、拖动、删除、连线和运行入口都需考虑 `locked`，异步结果写回前再次检查。节点内的编辑与点击控件按交互需要使用 `nodrag`、`nopan`、`nowheel`，避免与画布手势冲突。
- Sunburst 和 Image Describer 运行时将运行按钮替换为 Weavy 样式的 32px 进度框：启动状态、每秒一圈的圆环、百分比与取消按钮。现有接口没有进度回传，百分比明确标注为预估，平滑趋近 95% 后等待真实响应；只有成功响应和结果写回后才完成。节点取消操作停止该节点的运行与排队任务，不影响其他节点；任务面板仍可单独取消一项。运行结束或失败后恢复运行按钮，失败详情保留在任务列表。减少动态效果时圆环改为 4 秒四步旋转。
- `taskQueue.test.ts` 随 `npm test` 验证预估进度不提前完成、不倒退、不推进终态；`/tests/model-run-progress.html` 使用真实节点、调度与本地受控响应验证动画、完成、失败、并发取消隔离和迟到结果保护，不调用真实模型，不读写用户工作流。

## Text Iterator 文本迭代约定

文本迭代位于工具 → 迭代器，搜索支持中文及 Text Iterator。节点参考 Weavy 的紧凑列表：460px 宽、标题计数 `n/50`、文本/数组输入、紫色文本输出和添加条目。默认一条空文本，最多 50 条；文本可换行，条目使用稳定 ID，支持删除、拖放排序及排序按钮的上下键、Home / End。新增条目聚焦输入框，中文输入与文本编辑保留原生按键行为；锁定后不能编辑、排序、增删、拖动或新建连接。菜单、独立副本、剪切粘贴、撤销重做和 IndexedDB 保存恢复复用画布机制。

输入连接存在时显示上游内容并只读，本地条目仍保留，断开后恢复。普通文本（包括换行）是一条；显式 JSON 字符串数组逐项展开，空列表、非文本成员、空白条目、超过 50 条或每条超过 32000 字符都给出明确错误。异常输入不阻止重命名、锁定、解锁或删除；只有创建副本和剪切等需要内容快照的操作才解析输入，并直接报告输入错误。当前没有新增独立 Array 节点或 CSV 列导入界面，可以在 Prompt 中提供 JSON 数组。动态模型生成的列表需先运行并设为手动文本，批量开始前确定实际条数。同一个目标依赖多个独立迭代器时拒绝运行，避免隐式进行组合；互相依赖的多选批量节点需只选择最终目标。

空列表或未填写的条目会在下游模型和设置面板的批量摘要区域显示提示：顶部分隔线、圆形感叹号和暖红色文字，支持换行及深浅主题。补齐或删除空条目后自动恢复正常摘要；提示中不显示内部节点类型名称，运行前的校验规则保持一致。文本迭代节点自身保留紧凑列表布局，上游文本数组解析失败时使用相同的提示样式。

连接到 GPT Image 2.5、Nano Banana、Ideogram 4.5 的 Prompt 或暴露文本参数，以及图像描述的文本指令时，每个条目创建独立任务。可经过 Router、Prompt 内联变量及后续模型/图像处理链。执行器为每条创建独立图快照和依赖输出，支持已有的四任务并发限制；原始画布条目不会被临时值覆盖。模型节点、设置面板与运行入口共用临时运行次数状态，不写入撤销或持久化；切换选择后任务数仍与执行一致。运行次数作用于每条文本，`3 条 × 2 次` 为 6 个目标任务。运行前校验全部已知文本与参数；重复文本仍是独立目标任务。

每项失败不会重试或阻止其他条目，任务面板保留条目编号与原始提示词。单项重试只创建该条目的一个新任务，原条目被修改/删除后要求重新检查列表。依赖运行中的上游模型时按迭代器、条目 ID 和文本匹配结果，重复文本、乱序完成或单项失败不会混用其他条目。已完成的上游图片按 `generation.iteration` 从历史结果中恢复对应条目，并继续校验当前请求输入；输入已变或缺少对应记录时重新生成，不回退到其他条目的封面。不同条目即使请求内容相同，也不共享同一个上游模型请求。只有实际依赖迭代器的共享上游任务附带条目信息，无关共享上游仍按普通任务重试。取消单项不影响其他条目；节点取消停止整批。运行中修改文本、顺序、输入连接或锁定节点会中止受影响任务，迟到结果不会写回。成功结果追加到同一模型的现有结果列表，`generation.iteration` 保留来源条目，结果仍使用已有的画廊、下载和选中输出行为。

依赖批量多选检查同时查看上游和下游的运行计划；即使上游已有固定图片或手动描述，使下游自身不再展开迭代，也不能同时选择该批量上游和下游运行。重命名输入框在中文合成期间忽略 Enter / Escape，合成结束后才提交或取消。

`textIterator.test.ts` 和 `workflowExecution.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 验证数据、连接、数组、各模型的独立请求、重复运行、并发依赖按条目隔离、共享上游重试、失败、取消与单项重试。浏览器入口为 `/tests/text-iterator.html`（`npm run dev`），使用独立存储与拦截后的本地模拟响应，不访问真实模型或用户已保存画布；验证列表编辑、排序、锁定、副本、异常输入下菜单操作、上限、运行次数与实际请求数量一致、实际任务界面和保存恢复。浏览器验收与自动门禁是两层独立检查。

## Image Iterator 图片迭代约定

图片迭代位于工具 → 迭代器，支持中文及 Image Iterator 搜索。参考 Weavy 的 460px 文件卡片：空态为棋盘格、多选上传和图片链接；多图默认双列缩略图，可切换单图、前后浏览、按添加时间或名称排序，底部添加更多图片。右键图片可下载当前图片、下载全部、设为封面和复制图片；节点菜单提供清空、重命名、锁定、副本、剪切和删除。仅接受图片，最多 50 张；没有输入端口，绿色 `file` 输出可在列表为空时预先连接。没有图片时，下游显示共用的迭代警告并阻止运行。

`ImageIteratorNode` 复用 `FileNode` 的导入、预览、图库和主题；`imageIterator.ts` 负责图片列表与剪贴板校验。当前封面只用于画布预览，不改变批量范围。运行时 `workflowIterations` 按列表的显示顺序生成稳定图片身份，`iterationGraph` 为每个任务投影成只含对应图片的文件节点，原始列表保持不变。支持图像描述、GPT Image 2.5、Nano Banana、Ideogram，以及 Router / 本地图片处理 / 后续模型链；同一张图片的多个依赖共享本轮结果，跨图片和并发批次按身份匹配，不混用其他图片。与文本迭代共用运行次数，`3 张 × 2 次` 创建 6 个目标任务；同一目标只允许一个迭代器，多个图片列表或图片与文本列表同时汇入时先报错，不隐式组合请求。

单张失败不影响其他图片；单张重试只运行对应图片，图片已删除或内容身份已变则拒绝重试。任务面板和成功结果记录图片序号、名称与来源身份。远程图片按本项建立快照，一张链接失败不阻断其他项。切换封面或网格/单图不会取消任务；增删、清空、有效顺序变化或锁定会中止受影响任务，迟到结果不写回。清空还会废弃尚未完成的导入。列表、排序、封面、结果和图片二进制随 IndexedDB 保存；素材同时由画布、历史和剪贴板保留，清空可单步撤销/重做，副本独立修改。

本地图像处理的并发共享同时匹配内容指纹与实际输入素材 ID，避免内容相同的不同图片复用绑定了其他素材的 `outputRevision`。同一图片的多个下游仍共享处理；与迭代器无关的图片分支也保持共享。`workflowExecution.test.ts` 覆盖相同/不同链接、相同内容、多目标与多次运行；`/tests/workflow-execution.html` 使用真实 Invert PNG 导出验证两项均完成、结果归属和像素，不调用真实模型。

`imageIterator.test.ts` 和 `workflowExecution.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` / `npm run check` 验证数据、连接、逐图投影、各模型、重复运行、并发匹配、失败重试、取消和素材恢复。运行 `npm run dev` 后访问 `/tests/image-iterator.html`，浏览器页使用真实画布、独立 IndexedDB 和本地模拟响应，验证上传/拖放、单图/网格、排序、右键菜单、清空撤销、锁定、副本、剪切粘贴、数量、请求与保存恢复；不读取用户画布、不调用真实模型。该浏览器页需单独运行，不包含在 `npm test` 中。

## Color palette 色板约定

Color palette 位于 Tools → Editing，默认是棋盘格和居中的 Select color；点击节点打开右侧 Color palette 设置。最多添加 10 种颜色，允许重复。侧栏可添加白色初始色、输入 HEX（支持三位或六位）、打开颜色选择器、删除和拖动排序；节点内可直接改色、删除和排序，未满十色时可在顶部、底部和色条交界处插入。色条始终等高并显示 HEX，悬停当前色条才显示拖动和删除控件，不改变其他颜色。拖动时保持原顺序，以细线提示插入位置，节点内其他色条变暗；松开后一次性排序，拖出列表取消。拖动手柄也支持方向键、Home / End；Escape 取消排序，锁定后禁止修改。

节点内拖动时，当前色条及拖动、删除图标保持完整亮度；其余色条背景与文字分别以 100ms 过渡到 16% 不透明度，衬底为节点底色。使用原位色条和插入线提供反馈，禁用浏览器额外生成的浮动拖拽图像，避免它忽略画布缩放而变大；侧栏仍使用原生拖拽预览。放开或取消后恢复；启用减少动态效果时跳过过渡。

节点没有输入，Image（`image`）输出 1024 × 1024 的纯色横条 PNG，不包含 HEX 和编辑控件；Text（`text`）输出大写 HEX，以 `*` 连接，顺序与画布一致。Image 可连接所有图片消费者（包括 Compositor、Preview、Sunburst 和 Image Describer）；Text 可连接 Prompt 变量、Sunburst 文本输入和 Image Describer 文本参数。连接推荐按输出端口区分类型，反向创建也支持这两个端口。空色板无图片且文本为空；改色或排序后立即使旧图片失效，导出完成才提供新图片，迟到的结果不会覆盖新状态。

每次添加、删除、排序、HEX 提交或颜色选择手势各记录一次撤销；颜色选择器拖动时先在弹窗预览，松开提交。派生图片不增加撤销记录。支持重命名、锁定、副本、剪切粘贴和 IndexedDB 恢复；颜色顺序和 PNG 素材随画布保存，素材引用复用现有生命周期。数据与纯函数见 [colorPalette.ts](./colorPalette.ts)，颜色列表和弹窗见 `ColorPaletteColors.tsx` / `ColorPalettePicker.tsx`。`colorPalette.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 检查十色上限、排序、文本、输出失效、双端口连接、剪贴板校验和素材映射。

选色弹窗的 HEX 在 Enter、失焦或点击外部关闭时提交合法值；无效值与 Escape 不产生修改。弹窗及滑块上的 Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z 操作画布历史，HEX 输入框保留原生文本撤销。浏览器回归测试在 `tests/color-palette-picker.test.tsx`，沿用项目现有的浏览器测试页方式，无新增测试依赖：运行 `npm run dev` 后打开 `/tests/color-palette-picker.html`，页面自动挂载真实节点、侧栏、弹窗和画布历史并报告结果。覆盖外部关闭保存、HEX 规范化、取消、重复提交、弹窗/滑块撤销重做、文本撤销与中文输入保护，以及连续编辑的历史边界；另覆盖 53% / 100% / 150% 缩放下的合成拖拽事件、预览图片加载、取消、落点排序、单步撤销重做与侧栏同步；测试使用独立状态，不读写已保存的工作流。

原生拖拽验收页为 `/tests/color-palette-native-drag.html`（入口 `tests/color-palette-native-drag.test.tsx`），同样通过 Vite 运行且不读写用户工作流。用真实鼠标在节点中拖动，页面检查可信 `dragstart`、透传原生 `setDragImage`、已加载的 1×1 透明图片和可信 `dragend`；`Broken canvas control` 使用旧实现作负例，必须失败，`Fixed image` 应通过。分别检查 53% / 100% / 150%，拖出及 Escape 取消后顺序/历史不变，落点后节点和侧栏同步且可单步撤销重做。原生预览使用预加载的离屏 `HTMLImageElement`，不可用没有布局的 canvas 替代。页面的 PASS 仅代表原生调用及图片有效，浏览器页面截图不包含系统拖拽图层；大色条是否消失仍必须用系统目视或能包含该图层的录屏对照确认，不得用合成事件或页面截图代替。

## Compositor 合成约定

Compositor 位于 Tools → Editing。稳定的 Background / Layer 输入映射与内部堆叠顺序分开保存；上游图片更新保留已有图层参数，普通输入断开后清除对应画面。多个端口可使用同一上游。编辑器采用 Layers / Assets、Canvas、Properties 三栏；素材可预览、搜索和拖入画布，图层菜单与底部缩放菜单支持键盘操作。画布提供八向缩放、旋转及屏幕距离吸附辅助线，支持约束方向、中心缩放与手势取消。底部还提供文本、钢笔和矩形/椭圆/三角形/星形工具：文字可双击编辑，钢笔保存可编辑的锚点和 Bézier 控制柄，新增图层共用撤销与持久化，不新增输入端口。提供变换、重排、显示/锁定、尺寸/填充与有序的 Blur、Color correction、Invert、Levels 效果，复用现有像素算法。Levels 使用 Inputs 三手柄 / Outputs 双手柄和 RGB/R/G/B 通道，中间调复用对数 Gamma 映射。

Output 是当前文档与输入共同确定的原尺寸 PNG，可供所有现有图片消费者读取，Compositor 也接受这些图片节点的输出。连接仍待处理或结果版本过期时 `imageOutput` 拒绝旧输出。节点和编辑器共用同一合成帧；效果开关等离散操作先反馈快速预览，再替换为原尺寸帧，只有原尺寸结果发布到 Output；受限效果缓存复用最近的开关组合。松手提交历史，输出和素材按现有 IndexedDB / 资源引用机制保存。复制节点保留输入素材快照，普通断线不保留旧画面。Timeline 只保存基础开关和扩展结构，不执行视频处理。详细限制、快捷键、模块入口及浏览器像素检查见 [Compositor 文档](../../docs/compositor.md)。

## Preview 预览约定

Preview 位于 Tools → Helpers，也出现在图片输出拖到空白处的推荐菜单中。`file` 输入接受纯图片 Import、Sunburst 当前结果、Painter Result / 黑白 Mask、Crop / Blur / Invert / Levels Output 或 Color correction Result，同一个输入只允许一条连线，不接受文本或视频。输入反向拖线可创建 Import、Sunburst、Crop、Blur、Invert、Levels、Color correction 或 Painter，并选择 Result / Mask。

图片按原始比例展示，悬停显示尺寸、下载和全屏入口；双击图片也可打开共用的 FileGallery。Painter 的 Result 和 Mask 通过 `painterLivePreview.ts` 同步绘制帧，按住鼠标绘制、擦除或拖动形状时实时更新，取消笔画时同步恢复。绘制中和正式图片尚未导出时，下载与全屏入口暂不可用。实时画面仅存在内存中，不写入节点数据、历史、存储或模型输入；每笔仍在松开后提交一次。Import 图片集合可翻页查看，翻页不改变上游输出。未连接或上游未就绪时仅显示棋盘格，不显示居中图标与文字；图片加载失败时显示错误提示。断开或删除上游后立即清空，不缓存旧输出。解析入口为 `preview.ts`，连接与失效行为由 `preview.test.ts` 随 `npm test` 验证。

Preview 不运行模型、不生成新的图片素材；节点、选中图片和连线随画布保存。支持重命名、锁定、复制粘贴、删除和撤销；复制或剪切得到的独立 Preview 不携带上游连线，需重新连接图片。主题、菜单、下载和全屏复用现有节点组件。

## Color correction 调色约定

Color correction 位于 Tools → Editing，也出现在图片输入/输出的推荐菜单中。File 接受一张上游图片（集合取第一张），Result 输出原尺寸 PNG 并保留透明通道。在浏览器本地处理，不调用模型。曝光为 −5～5（步长 0.01），对比度、饱和度、色温、色调、高光、阴影为 −100～100（步长 1），默认均为 0。曝光在线性光空间处理，其余调节使用本地像素算法；界面参考 Weavy，不承诺与其内部算法逐像素一致。

滑块拖动实时更新节点和已连接的 Preview，松开后提交一次；Escape 或指针取消放弃当前拖动。数字输入失焦或 Enter 提交，Escape 取消；Reset 将七项全部归零。图片悬停/键盘聚焦显示左上角原图对比、右上角下载、左下角原始尺寸。按住对比按钮或在按钮上按住空格/Enter 暂时显示原图，松开恢复效果；对比不改变参数、Result 或下载内容。

拖动时，后台线程在缓存的最长边 1024 像素底图上生成轻量预览；它是交互近似，细碎纹理可能与最终结果略有差异。松手或取消后按原尺寸调色，再从同一份像素生成精确预览和原尺寸 PNG；精确预览就绪前禁用下载。拖动时只保留最新待处理参数，源图变化时终止旧线程；取消操作后的旧帧不会回写。导出未完成时禁用下载；上游变化、断开或参数变更时，下游不读取旧结果。实时预览仅在内存中，派生图片不增加撤销步骤。支持锁定、重命名、副本、剪切粘贴、撤销重做和 IndexedDB 恢复；复制/剪切保留输入底图快照。跨域图片需允许浏览器读取，失败时显示提示。

数据与像素算法见 [colorCorrection.ts](./colorCorrection.ts)，预览/导出见 [colorCorrectionRender.ts](./colorCorrectionRender.ts)，实时帧见 [colorCorrectionLivePreview.ts](./colorCorrectionLivePreview.ts)。`colorCorrection.test.ts` 随 `npm test` 验证七项调节方向、默认像素与透明通道、输出失效、连线、剪贴板及素材映射。

## Levels 色阶约定

Levels 位于 Tools → Editing 和图片连线推荐菜单。Input（`image`）接收上游图片，集合使用第一张；Output（`result`）输出原尺寸 PNG，可连接所有现有图片处理节点、Preview、Sunburst 和 Image Describer。全部计算在本地浏览器完成。

界面依次为通道 / 重置、直方图、输入色阶和输出色阶；通道显示 RGB、红色、绿色、蓝色，内部仍使用 RGB/R/G/B。RGB、R、G、B 各自保存独立的输入黑点、Gamma、输入白点与输出黑白点；在线性色彩空间先应用单通道、再应用 RGB 总调整，最后编码回 sRGB。输入范围 0–255，黑点不大于白点（相同值产生阈值效果）；Gamma 为 0.1–10（默认 1），大于 1 提亮中间调；输出范围 0–255，可反向或设为同值。“重置”恢复全部通道参数。直方图以相同纵轴比例叠加原图（75%）和调整结果（25%），拖动时随预览更新；RGB 使用 0.299R + 0.587G + 0.114B 的亮度分布，R/G/B 显示对应颜色分布，透明像素按 alpha 加权。256 列像素绘图保持阶梯轮廓。

Gamma 滑块采用对数位置映射，向右增大并提亮；黑白点变动时中点随输入范围定位。滑块支持指针拖动及方向键，Shift 加速、Home / End 到边界；数字框 Enter / 失焦提交、Escape 取消。每次拖动只记录一次撤销；512 边长的独立线程提供拖动预览，松开后用原尺寸处理得到 PNG，再从相同像素生成最终预览。下载等待准确结果。保留透明度、原图比较、尺寸显示和 Preview 实时联动；换图、取消、锁定后拒绝迟到的结果，下游不能读取过期输出。

支持重命名、锁定、副本、剪切粘贴、撤销重做及 IndexedDB 素材恢复；独立副本保留底图。数据及像素算法见 `levels.ts`，处理线程和请求合并见 `levels.worker.ts` / `levelsRender.ts`。`levels.test.ts`、`levelsRender.test.ts` 使用现有 Node.js 内置测试运行器，随 `npm test` 验证像素映射、透明度、直方图、连线约束、输出失效、素材保存和请求取消。

## Invert 反选约定

Invert 位于 Tools → Editing 和图片连接推荐菜单。Input（`image`）接收上游图片或 Painter 的黑白 Mask，图片集合取第一张；Output（`result`）输出原尺寸 PNG，可连接 Preview、其他图片处理节点、Sunburst 图片/遮罩输入和 Image Describer。在浏览器本地按 `255 − RGB` 反色，黑白遮罩互换黑白，保留灰度软边与透明通道；普通彩色图片输出反色图片，不强制二值化。

Invert Output 接入 Sunburst Mask 时，仅在请求准备阶段将完全不透明的遮罩按亮度转换为透明 PNG：白色为透明编辑区域，黑色为不透明保护区域，灰色保留部分透明的软边。已有透明区域的遮罩沿用原透明通道。转换不改变 Invert 素材、预览、下载或其他下游图片输入；原图仍须另接 Sunburst Image，遮罩仍须与第一张原图尺寸一致且存在透明区域。`sunburstRun.ts` 在任务快照中标记转换方式，`sunburstClient.ts` 在本地完成转换和校验，不向服务端发送该标记；`invert.test.ts` 和 `sunburstClient.test.ts` 随 `npm test` 验证这条路径、软边、取消及已有透明遮罩兼容性。

图片按原比例展示，无需额外参数或运行按钮。悬停或键盘聚焦时，左上角显示隐藏效果按钮：点击切换原图，再点击恢复反选；此对比仅影响当前预览，不改变 Output 和下载内容。右上角下载反选 PNG，左下角显示原始像素尺寸。未连接或上游未就绪时显示棋盘格，处理完成前禁用下载；输入变化、断开或删除后不显示或传递旧结果，导出回写前检查当前连接和锁定状态。

支持重命名、锁定、副本、剪切粘贴、撤销重做及 IndexedDB 保存恢复；独立副本保留输入底图，派生结果不增加撤销步骤。核心像素算法和数据在 `invert.ts`，界面与导出在 `InvertNode.tsx`。`invert.test.ts` 随 `npm test` 验证黑白/灰度/透明像素、Painter Mask 输入、连线限制、链式失效和素材恢复。

## Matte Grow / Shrink 蒙版扩张与收缩约定

位于 Tools → Matte，中文名称“蒙版扩张 / 收缩”，支持中文及英文搜索、右键创建和拖线推荐。只有一个“尺寸”（Size）参数，范围 −100～100，整数步进，默认 0；正值扩张白色选区，负值收缩，绝对值为原图像素半径。0 保持原有灰度蒙版。Input（`image`）接受图片与 Painter / Masks Extractor 的 Mask，集合取第一张；Output（`result`）为原尺寸不透明灰度 PNG，端口及连线使用 Mask 颜色。经 Router 连接 Preview 或 Sunburst Mask 时保留蒙版语义；结果素材携带 `maskMode: luminance` 标识，经过 Compare 任一路透传、独立副本或保存恢复后仍可用于 Sunburst Mask。旧的 Matte 输出读取时补充该标识，普通图片不受影响。Sunburst 将白色区域转换为可编辑区域，蒙版处理本身不调用模型。

像素处理采用方形邻域的灰度最大值 / 最小值滤波，保留软蒙版灰度；透明输入先合成到黑底并转换为亮度，边界延用最近像素。后台线程使用滑动极值队列，处理量随像素数量增长，不随尺寸参数增大。交互和范围参考 Weavy，未承诺内部算法逐像素一致。拖动时使用独立线程的最长边 1024 像素预览，并同步连接的 Preview；松开后从原图生成最终预览与 PNG。原图对比、下载与分辨率沿用图像工具的悬停布局。

数字输入失焦或 Enter 提交，Escape 取消；切换滑块时先完成数字提交，再开始拖动。滑块一次拖动只记录一次撤销，聚焦时支持 Cmd/Ctrl+Z 撤销及 Cmd/Ctrl+Shift+Z 重做；数字框保留原生文本撤销。Escape、失焦、锁定或换图取消未提交操作。旧结果在参数或输入变化后立即失效；异步回写复核当前图，下载等待最终输出。支持重命名、锁定、复制 / 剪切粘贴、独立副本、撤销重做和 IndexedDB 保存恢复，派生 PNG 不增加历史步骤。算法与数据在 [matteGrowShrink.ts](./matteGrowShrink.ts)，线程和排队分别在 `matteGrowShrink.worker.ts`、`matteGrowShrinkRender.ts`。`matteGrowShrink.test.ts`、`matteGrowShrinkRender.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 验证像素、边界、透明与灰度、连接与失效、素材恢复和排队。独立浏览器入口 `tests/matte-grow-shrink.html` 检查双向变化、4K、数字框切换滑块、快捷历史、拖动取消、锁定、断连及持久化，并验证 Compare 两路输出转换后的实际透明蒙版面积；拦截模型 API，不读取用户工作流，也不调用模型。

## Blur 模糊约定

Blur 位于 Tools → Editing 和图片连接推荐菜单。Input（`image`）接收一张上游图片，集合取第一张；Output（`result`）输出原尺寸 PNG，可连接 Preview、Painter、Crop、Color correction、Blur、Sunburst 和 Image Describer。类型为 Box / Gaussian，Size 为 1–100 的整数，初始 Gaussian / 50；Size 1 保持原图。图片悬停显示按住查看原图、下载和尺寸。

本地后台线程处理图片，不调用模型。Box 使用可分离均值滤波；Gaussian 使用按高斯函数采样、截断至 4σ 并归一化的可分离卷积（σ = (Size − 1) / 3），不再使用 Box 近似。Size 控制模糊强度，不承诺与 Weavy 内部算法逐像素一致。预乘透明度后滤波，边界使用最近边缘像素，避免透明区域的隐藏颜色渗入。Gaussian 拖动时在独立线程的最长边 512 像素底图上进行高斯卷积，并按比例缩放 σ；原尺寸任务不会阻塞这条交互队列。Box 保持最长边 1024 的拖动预览。连到 Preview 时同步显示；松开后从同一份原尺寸处理像素生成最终预览和 PNG，下载在最终结果就绪后才启用。Gaussian 输出版本变化会使旧近似结果失效并重新计算。

数字输入失焦或 Enter 提交，Escape 取消；一次滑块拖动只提交一个撤销步骤。取消、换图或锁定使旧处理帧失效；导出尚未完成时禁用下载，下游不读取过期结果。支持锁定、重命名、副本、剪切粘贴、撤销重做与 IndexedDB 保存恢复，独立副本保留底图。算法与数据在 [blur.ts](./blur.ts)，线程在 [blur.worker.ts](./blur.worker.ts)，排队与实时预览在 `blurRender.ts` 和 `blurLivePreview.ts`。`blur.test.ts` 与 `blurRender.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 验证像素、透明边缘、连线、失效输出、素材恢复和请求合并。

## Crop 裁剪约定

Crop 位于 Tools → Editing，也出现在图片连接的推荐菜单中。Input 接收 Import、Sunburst、Painter、Color correction 或另一个 Crop 的图片；集合使用第一张图片。Output 输出原始分辨率下裁剪后的透明通道 PNG，不缩放图像、不运行模型或消耗额度。裁剪矩形以原图的归一化坐标保存，上游图片更换时保留相对选区。

图像上显示裁剪框、四角/四边拖动区域、三分辅助线和框外遮罩。拖动内部移动选区；拖动边角调整大小，选区不会超过原图边界。底部宽高比提供 21:9、16:9、4:3、3:2、1:1、2:3、3:4、9:16、9:21，选择后在整张原图中居中适配并锁定比例。尺寸中的宽/高是实际输出像素，失焦或 Enter 提交，Escape 取消；解锁时可独立修改，锁定时联动且限制在图片范围内。“重置”恢复整张原图并解除比例锁定。

每次拖动结束提交一次，可撤销/重做；Escape 或指针取消恢复拖动前状态。连接的 Preview 在拖动中显示本地裁剪帧，正式输出在松开后导出。临时帧不进入保存、历史或模型请求。上游断开、替换或选区尚未导出时不向下游提供旧结果，异步导出检查最新图结构以防止过期回写。复制/剪切保留底图快照，副本无需原连线即可编辑；底图、结果和选区随 IndexedDB 保存，锁定节点禁止编辑。

核心几何与剪贴板校验位于 [crop.ts](./crop.ts)，界面与导出位于 [CropNode.tsx](./CropNode.tsx)，实时预览位于 [cropLivePreview.ts](./cropLivePreview.ts)。`crop.test.ts` 使用现有 Node.js 测试运行器随 `npm test` 验证边界、比例、尺寸、输出失效、连接和素材恢复。

## Painter 绘制约定

Painter 在浏览器本地绘制，不运行模型或消耗额度。工具包含画布、画笔、形状和橡皮擦；形状提供矩形、椭圆、三角形、星形。画笔支持颜色、透明度、大小和硬度，橡皮擦拥有独立参数；“重置”清除绘制层，保留底图和画布设置，可撤销。画布可设置背景色、透明度和尺寸（1–8192），连接图片后尺寸由原图决定并禁用编辑。

笔画使用归一化坐标保存；预览、Result、黑白 Mask 和供 Sunburst 使用的透明 Mask 由同一绘制层生成，橡皮擦只移除绘制内容。白色 Mask 表示绘制区域，与笔画颜色无关；连接到 Sunburst 的 Mask 输入时使用对应的透明 PNG，保持现有 API 的透明区域编辑语义。输入缺失、导出未完成或上游变化时不可使用旧输出。源图片必须允许浏览器跨域读取。

每笔绘制在松开指针后提交一次，指针取消或 Escape 放弃当前笔画。派生输出更新不增加撤销步骤，笔画和重置可通过画布撤销/重做。交互预览最长边限制为 1024 像素，导出仍使用原图完整尺寸。复制或剪切时保留底图快照，副本无需原来的连线也能继续编辑。笔画及输出素材随画布保存到 IndexedDB；素材收集、复制、锁定与恢复使用现有机制。绘制渲染位于 `painterRender.ts`，数据与剪贴板校验位于 `painter.ts`；`painter.test.ts` 验证端口、失效输出、透明 Mask 转换和素材映射，随 `npm test` 运行。

## 模型运行约定

Image Describer 运行前需要至少一张有效的上游图片和非空模型值；当前实际接入的描述模型为 `deepseek-flash`。图片按输入端口编号排序，生成文本写回 `data.text`。

Sunburst 运行前必须连接非空 Prompt，参考图片和 Mask 可选。连接了 Image 时，上游必须已有图片；使用 Mask 时还必须连接参考图片，且 Mask 只能提供一张图片。图片格式、尺寸及参数限制由 `sunburst.ts`、`sunburstClient.ts` 和服务端共同校验，不应只依赖界面限制。成功结果追加到 `results`，并更新 `activeResultId`。多张结果时，页码前的图标可切换单张预览与全部图片；全部视图复用 File Node 网格样式，点击缩略图选择输出结果，双击打开全屏。视图切换仅影响当前预览，不改变已选结果。下载按钮同样复用 File Node：单张视图下载当前图片，全部图片视图按当前排序将所有结果打包为 `images.zip`。

Sunburst 的单张预览框在生成前即按有效宽高比调整高度，支持预设、自定义尺寸及外接参数（含 Router）。节点宽度保持一致，高度随预览变化，并为输入端口保留最小空间。自动比例或无效的尺寸草稿使用当前结果的实际比例；无结果时使用正方形。已有结果在新比例内完整显示，尺寸调整不修改图片、下载或下游输出；全部图片视图保留网格布局。

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

按仓库要求运行 `npm run check`，统一执行测试、lint、含类型检查的构建、节点文档和补丁空白检查。`npm run check:docs` 会核对本页节点索引与 `nodeTypes` 注册表及本页的本地链接；端口语义、运行条件和持久化约定仍需人工同步审查。现有测试使用 Node.js 内置测试运行器，覆盖节点逻辑、持久化和服务端校验；测试使用受控输入或响应，不需要真实模型额度。新测试采用有明确含义的 `*.test.ts` 或 `*.test.tsx` 文件名，并确保测试命令实际能够运行它；浏览器 `tests/*.test.tsx` 通过相应 HTML 页面执行，不属于 `npm test`。机制与验收入口见[代码质量检查](../../docs/code-quality.md)。

画布改动需手动验证节点拖动、坐标更新、新建连线、缩放和小地图；根据改动检查锁定、复制粘贴、撤销与刷新恢复。编辑器改动还需验证 Tab 建议、中文输入、撤销、粘贴和内联变量；模型流程改动需检查缺少输入、重复运行、取消、失败与结果写回。

新增、删除节点，或修改输入输出、运行条件、注册方式及本文已记录的开发约定时，同步更新相应内容。仅调整内部实现或样式且不影响描述时，无需更新。本文保留稳定约定和代码入口，不逐行复述实现，也不充当逐次变更日志；复杂节点需要更详细说明时，可另建文档并在此链接。

## Rotate and flip

入口位于 Tools → Editing，或从图像端口拖出后的兼容节点菜单。底部三个按钮从左到右为顺时针旋转 90°、水平镜像、垂直镜像，右侧 Reset 恢复 0° 并清除两种镜像。与 Weavy 一致，旋转按 0° / 90° / 180° / 270° 循环，镜像各自切换，最终先旋转再按输出图像的水平 / 垂直轴翻转；操作按钮的先后次序不改变这套组合规则。

接入图像后自动在本地处理，无需运行模型。90° / 270° 交换输出宽高；整数坐标变换保留透明通道，不裁切、不缩小导出。悬停显示下载和实际尺寸；预览与下载来自同一份原分辨率画布。支持 Import、Painter Result / Mask 及其他图像节点输入，并可连接 Preview、其他图像处理节点、Sunburst 和 Image Describer。参数、输入或连接变化会立即使旧结果失效，未完成的结果不可下载，过期异步任务不会覆盖新结果。

支持重命名、锁定、创建副本、剪切粘贴、逐次撤销重做与 IndexedDB 保存恢复；独立副本保留底图，派生图像不增加撤销步骤。设置、旋转矩阵和剪贴板校验见 `rotateFlip.ts`，界面与 PNG 导出见 `RotateFlipNode.tsx`。`rotateFlip.test.ts` 使用现有 Node.js 内置测试运行器，随 `npm test` 检查非正方形像素方向、组合顺序、连续操作、输出失效、连接约束和素材恢复。


## Resize

入口位于 Tools → Editing，也可通过图片端口的连接推荐菜单创建。W / H 显示输出像素尺寸，首次接入默认使用原图尺寸。默认锁定比例，首次调整时保存未取整的宽高比，后续修改任意一边均沿用该比例计算，避免连续缩小、放大产生取整误差；解锁后可独立修改宽高，图像拉伸到指定尺寸。重新锁定采用当前宽高比，Reset 清除之前保存的比例。锁定比例随撤销、复制粘贴和保存恢复保留；旧数据未记录比例时，以当前尺寸作为首次调整的基准。右侧 Reset 恢复当前输入原图的尺寸，并保留比例锁定状态；尚未手动设定尺寸或 Reset 后，上游尺寸变化会自动跟随原图。

输入在 Enter 或失焦时提交，Escape 取消，输入过程中不反复生成图片。尺寸为正整数，小数四舍五入；空输入恢复原值，无效或超限输入保留原值并提示。每边上限 16384 像素、总像素上限 64 × 1024²。没有图片时尺寸编辑和 Reset 禁用。每次操作独立撤销，比例按钮及 Reset 上的 Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z 透传画布，尺寸输入保留原生文本撤销。

每次从原始输入本地重采样，保留透明通道；预览最多 1024 像素长边，预览容器保持目标宽高比，位图填满容器以消除预览取整产生的边缘空隙；节点高度随比例变化。下载和下游收到的 PNG 使用实际目标尺寸。参数、输入或连接变化立即使旧输出失效，过期异步结果不会写回。接受所有现有图片输出，包括 Painter 的 Result / Mask；输出可连接 Preview、图片处理节点、Compositor、Sunburst 图片/遮罩和 Image Describer。支持重命名、锁定、独立副本、剪切粘贴和 IndexedDB 保存恢复，沿用项目现有历史及素材生命周期。

尺寸规则、输出版本与剪贴板校验见 `resize.ts`；`resize.test.ts` 随 `npm test` 覆盖比例、自定义尺寸、边界、连接、输出失效及素材映射，并检查连续小尺寸取整、宽高交替调整、重新锁定、Reset、旧数据和剪贴板中的比例恢复。浏览器回归沿用现有独立测试页机制：启动 `npm run dev` 后打开 `/tests/resize.html`，`tests/resize.test.tsx` 挂载真实 Resize / Preview / File 节点，自动验证宽高、PNG 分辨率与透明区域、下游预览、Reset、键盘撤销重做、非法输入、锁定、IndexedDB 保存恢复、断开重连、替换输入及 4K 输出；另覆盖 3840 × 2160 缩小后恢复的比例、保存与撤销后的比例、细长/扁宽预览铺满以及 100 × 300 不受高度限制。页面使用独立数据和测试数据库，不读取用户工作流，也可继续手动检查连线、拖动、缩放和主题。


## Compare

从 Tools → Helpers 或搜索 Compare 添加。Slider 左侧显示 Input 1，右侧显示 Input 2；拖动分割线实时对比，松开时提交一次历史记录。Reset 恢复 50%，居中时禁用；方向键微调，Shift 加大步长，Home / End 到两端，Escape 取消拖动。Toggle 默认显示 Image 2，按住左上角眼睛（或 Space / Enter）显示 Image 1，松开、失焦或取消时恢复；与 Weavy 的按住预览行为一致。切换模式时分割线回到中间。

预览按第一张可用图片比例布局，两张图等比例居中；仅一路可用时显示该图，无输入时显示棋盘格。左右端口分别位于 89 / 149px，每个输入只允许一条图片连线；支持两路连接同一来源，拒绝环路、锁定节点及非图片输入。两个输出分别透传原始图片，保留原生尺寸、透明度、资源标识和素材上的灰度蒙版标识（包括 Painter / MasksExtractor 的 Mask、Invert 和 Matte Grow / Shrink 输出），不导出对比拼图；模式、拖动与临时预览不改变输出。

模式和分割位置参与撤销重做与工作流保存。副本、剪切粘贴保存两路输入快照；已有连线优先于快照，上游暂不可用时不返回旧快照。支持重命名、锁定和删除，素材生命周期与 IndexedDB 复用现有机制。无模型请求或付费调用。

`compare.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 验证双输出、断开重连、递归、连接规则、剪贴板校验和素材映射。启动 `npm run dev` 后打开 `/tests/compare.html`，可在隔离画布检查 Slider / Toggle、撤销重做、主题、连线和缩放；该页使用独立测试数据库，不访问用户工作流。

## Blend

从 Tools → Helpers 或搜索 Blend 添加。Back 是底图，Front 是前景；Opacity（0–100%，默认 100%）控制前景透明度，Mode 默认 Normal。模式按照 Weavy 分成六组：Normal；Darken / Multiply / Color Burn；Lighten / Add / Screen / Color Dodge；Overlay / Hard Light / Soft Light；Difference / Exclusion / Divide；Hue / Saturation / Color / Luminosity。节点宽 460px，底部单行模式选择和百分比透明度，菜单支持方向键、Home / End、Enter、Escape 和外部点击关闭。

当前支持静态图片文件，不合成视频、音频或任意文档。输出尺寸以 Back 为准，Front 缩放铺满 Back；仅接 Front 时使用 Front 尺寸。空端口视为透明图层，均为空时没有输出；已连接但无有效图片时等待上游。改变设置、断开或重连会使旧输出立即失效。Result 可连接 Preview（含下载）、后续图片处理和模型图片输入。

`blend.ts` 对齐 Weavy 的线性 RGB 混合与透明合成，包括 Add 的钳制顺序、Soft Light / Divide 边界、四种 HSL 模式和透明底图行为。读取输入时使用非预乘 ImageBitmap 与 float16 Canvas，避免低 alpha 颜色精度损失；浏览器需支持 float16 Canvas。实现和差异边界详见 [Blend 核验记录](../../docs/blend-verification.md)。不引入第三方算法依赖。

Worker 使用有界任务队列；拖动时 512px 草稿，释放时原尺寸 PNG，预览和导出使用同一公式。拖动只提交一次撤销记录，Escape 取消，锁定禁止修改。支持独立副本素材快照、剪切粘贴、IndexedDB 恢复与资源回收。算法修订号会使旧 PNG 缓存失效。

`blend.test.ts`、`blendMath.test.ts` 和 `blendWeavy.test.ts` 随 `npm test` 检查模式、全部通道输入与 alpha 对、边界、连接、失效、剪贴板、素材映射，以及 108 张实际 Weavy PNG 的独立参照。原始参照和元数据保存在 `tests/fixtures/blend-weavy.*`。

启动 `npm run dev` 后访问 `/tests/blend.html`，执行真实 Worker / PNG、4K、历史、持久化和交互验收；使用独立数据库，不读取或改写用户画布。`/tests/blend-modes.html` 将 18 种模式 × 六档透明度的真实 Worker / PNG 与 Weavy 导出逐像素对照，另核对预览。2026-10-26 完整对照已通过，详细指标与允许的量化误差见上述核验记录；历史九模式与原生 Canvas 诊断不再代表当前算法。


## Router

从 Tools → Helpers、搜索 Router 或拖线到空白处的推荐菜单添加；双击可连接的输出端口也会在其右侧创建并连接一个 Router，已有分支保留。默认尺寸 250 × 62，单行图标、名称和菜单，左右居中的 Input / Output；端口颜色与图标跟随输入类型，空节点使用中性色，兼容浅色和深色主题。

Router 直接从当前图解析来源，不保存文本或素材副本，不运行模型。Input 只保留一条连线，拖入新来源会替换旧线并保留所有下游分支，替换前校验整个 Router 链的消费者；不允许用文本替换仍连接图片输入的来源，反向亦然。Output 可连接多个兼容输入，也可继续连接 Router。空 Router 可以先连接下游，之后接入的来源必须匹配下游要求；推荐菜单随输入和下游约束筛选。环路、自连接、无效端口和涉及锁定节点的新连接会被拒绝。

文本、图片集合、各节点的具体输出端口保持原语义：File 传递整个图片集合，Sunburst 传递选中结果，色板区分 Image / Text，Painter 区分 Result / Mask。Router 后的 Sunburst Mask 仍使用 Painter 的透明遮罩或 Invert 的亮度转换。断开或上游失效后没有旧值残留，Preview 的绘制和调色实时预览也能穿过 Router 链。视频、音频和 3D File 可以接入 Router 并继续中转，能否连接其他节点仍由已有消费者支持范围决定。

支持重命名、锁定、副本、剪切粘贴、撤销重做和 IndexedDB 保存恢复；单独复制 Router 不复制上游内容和连线。创建并连接、替换输入各算一次撤销。数据解析及快捷创建在 `router.ts`；`router.test.ts` 使用现有 Node.js 测试运行器随 `npm test` 验证透传、集合、分支、替换、环路、类型限制、遮罩和保存恢复。浏览器验收入口为 `/tests/router.html`（`tests/router.test.tsx`），运行 `npm run dev` 后打开，使用独立数据库和真实画布检查菜单、文本 / 图片透传、历史与持久化，也可手动检查拖动、连线、缩放和小地图。


## Nano Banana

模型固定为 `google/gemini-nano-banana-2.1`，从图片分类、搜索、画布右键或拖线推荐创建。必须连接非空提示词（最多 32000 字符）；参考图可选，按端口顺序展开文件集合，应用最多接收 14 张，每张 20 MiB、合计 46 MiB。已连但无结果的图片输入阻止运行，未连接的图片端口可留空。

参数由 [nanoBanana.ts](./nanoBanana.ts) 校验，默认自动比例、1K、PNG。支持常用 8 种比例、1K/2K/4K、PNG/JPEG，自动比例省略上游 `aspectRatio`。当前模型接口拒绝 `outputMimeType`，所以 `imageConfig` 仅传宽高比和分辨率；输出格式在客户端收到图片后转换，相同格式保留原始字节，转换保持尺寸，JPEG 使用白底和 0.95 编码质量。右侧可将三个参数暴露为文本输入；不提供 OpenAI 的画质、透明背景、自定义像素尺寸或 Mask 控件。

[nanoBananaRun.ts](./nanoBananaRun.ts) 建立运行快照，[nanoBananaClient.ts](./nanoBananaClient.ts) 将本地参考图转换为 base64，请求 `/api/nano-banana`。服务端使用 ZenMux Vertex AI `:generateContent`、`contents[].parts[].inlineData` 与 `generationConfig.imageConfig`；Google Banana 的具体协议见 [Gemini 指南](https://zenmux.ai/docs/zh/guide/advanced/image-generation.html) 和 [Generate Content 参数](https://zenmux.ai/docs/zh/api/vertexai/generate-content.html)。用户提供的 [Generate Images 页面](https://zenmux.ai/docs/zh/api/vertexai/generate-images.html) 中 `:predict` 示例是另一种图片接口。

与 Sunburst 共用结果画廊和任务队列：同一节点多次运行按序，不同节点可以并发；保留响应中的全部最终图片，忽略推理图片；文本回复、内容拦截或损坏图片作为失败处理。结果支持选中输出、下载、全屏、拆分为文件、复制、剪切粘贴、锁定、撤销重做和 IndexedDB 素材恢复。取消或失败不自动重试，不切换模型。

`nanoBanana.test.ts`、`nanoBananaClient.test.ts` 和 `server/nanoBanana.test.ts` 使用既有 Node.js 测试运行器，随 `npm test` / `npm run check` 执行。独立浏览器验收入口 `/tests/nano-banana.html` 使用隔离数据库与模拟响应，验证参数、引用图、结果、多图预览、取消、失败、撤销及保存恢复，不调用真实模型。真实供应商支持情况、输出质量及费用仍需单独生图验证。

## Masks Extractor

蒙版提取位于 Tools → Matte（蒙版），支持右键创建及图片端口拖到空白处的推荐菜单。`image` 输入只接收图片，集合取第一张；可通过 Router 中转。`result`（Image With Alpha）和 `mask`（Mask）输出原图尺寸 PNG，前者保留原图透明度并抠出选区，后者为黑底白色选区。两者可连接 Preview、图片处理和模型图片输入；Mask 连到 Sunburst Mask 时在请求准备阶段按亮度转换为透明编辑区，与现有 Invert 蒙版语义一致，白色可编辑、黑色受保护，不改变节点导出文件。

单击替换选区，Shift + 单击添加独立物体，Alt + Shift + 单击减去区域；也可使用选择 / 添加 / 减去按钮。每次模型返回的区域与当前蒙版执行并集或差集，不把多个物体简单当作同一次点提示。首次点选后支持悬停预览；预览不进入历史或下游输出。Image / Mask 切换、清空、重新计算、下载及节点菜单均支持键盘；Escape 取消推理，画布撤销快捷键可从节点控件透传。每次确认选区或清空产生一个撤销步骤，派生 PNG 不产生额外步骤。

浏览器推理由 [masksInference.worker.ts](./masksInference.worker.ts) 中的 Transformers.js 3.5.0 和 `Xenova/slimsam-77-uniform` FP16（固定模型 revision `d827ef0`）完成，不调用付费模型、不上传输入图像。仅在首次实际点选时加载 Worker / 模型；FP16 权重约 20.75 MB，另有推理运行库。模型默认下载自 Hugging Face，使用 `transformers-cache` Cache Storage；同源缓存可在刷新后复用，但清除网站数据、存储被回收或更换域名后需重下。首次下载显示进度，失败可通过再次点击重试。需支持 WebGPU 和 shader-f16；不支持时给出明确提示，无隐式服务端或更大模型回退。

Worker 串行执行，最多保留一张图片的特征，模型闲置两分钟后释放内存，磁盘缓存继续保留。同一点的点击复用该节点最近一次悬停结果或正在进行的推理，避免重复提交；换图、换点、失败或重新计算会使候选缓存失效。只对最高评分候选执行尺寸恢复和二值化，保留原来的选区判定。交互分割最长边为 1024，输出恢复原图尺寸；恢复尺寸不会增加模型边缘精度。选区采用压缩游程保存于节点数据，刷新、复制、剪切粘贴后无需重新推理即可恢复输出；素材 URL 沿用现有 IndexedDB 与引用回收机制。输入变化或断开时旧输出立即失效，取消、撤销、锁定、删除节点后未完成任务不得覆盖当前选区。恢复原输入可以恢复其既有选区。

[masksExtractor.test.ts](./masksExtractor.test.ts) 随 `npm test` 验证合并/减去、压缩校验、缩放坐标、连线、Router、Sunburst 转换、失效及素材映射。`/tests/masks-extractor.html` 使用隔离画布和独立数据库，以受控分割结果验证真实组件、PNG、4K、撤销、恢复、锁定、取消、换图竞态、重新计算和副本，不下载模型；页面的“使用真实模型”按钮另行运行 SlimSAM / WebGPU，“检查模型缓存”可在刷新后读取权重文件数量和大小。实际下载与模型质量不属于自动测试的通过结论。依赖与模型出处见 [第三方说明](../../docs/masks-extractor-third-party.md)。

## Ideogram 4.5 约定

同一个节点根据 `image-0` 是否连线切换模式：无原图使用 WaveSpeed `ideogram-ai/ideogram-v4.5` 文生图；有原图使用 `ideogram-ai/ideogram-v4.5/edit` 编辑。必须连接非空提示词（最多 10000 个 Unicode 字符）。`image-0` 必须恰好一张待编辑原图；`image-1`～`image-4` 为参考图，按端口顺序展开集合，最多 4 张，使用 Mask 时最多 3 张。已连接却无结果、仅接参考图/Mask 未接原图均阻止运行。旧节点的 `imageInputs: 0` 显示为一个原图端口。结果可传给 Preview、Router 及现有图像节点。

[ideogram.ts](./ideogram.ts) 校验文生图的 7 种比例、1K/2K、低/中/高质量和提示词扩展开关；默认 1:1、1K、中质量、扩展开启。请求始终显式发送扩展布尔值。编辑使用独立的 `editQuality`（极低/低/中/高）、`editPrecision`（标准/高）和 `editSize`（跟随原图或自定义），默认中/标准/跟随原图。各模式保留自己的设置，并支持暴露为文本参数；非当前模式的已暴露输入保留且标记停用。编辑自定义宽高须为 256–4992 的 32 倍数，总像素不超过 4194304、比例不超过 6:1。使用 Mask 或高精度时请求强制跟随原图，保留已保存尺寸以供之后切回。

Mask 必须恰好一张且与原图尺寸一致。[ideogramEditClient.ts](./ideogramEditClient.ts) 和 [ideogramMask.ts](./ideogramMask.ts) 将输入转换为不透明黑白 PNG：直接导入的黑白图按黑色修改、白色保留；应用的亮度蒙版（含 Invert、Matte、MasksExtractor）按白色修改转换；有透明通道的蒙版按透明区域修改转换。Painter 直接或经 Router 连接时使用 `alphaMask`。`imageOutput` 为 Painter / MasksExtractor 的黑白 Mask、Invert 和 Matte 输出补充 `maskMode: luminance`，旧输出同样兼容；经 Compare 任一路、多级透传或独立快照保存恢复后仍保留白色编辑语义，不改变素材像素。普通导入的黑白图不会自动添加该标记。以 128 为阈值二值化，不支持软蒙版；必须同时有修改与保留区域。转换仅影响提交数据，不改变画布素材。

[ideogramRun.ts](./ideogramRun.ts) 建立参数和图片快照，任务资源引用保留原图、参考图及蒙版 Blob。[ideogramClient.ts](./ideogramClient.ts) 按模式请求 `/api/ideogram` 或 `/api/ideogram/edit`，将结果 URL 立即读入受管理的 Blob，保留原始格式和尺寸，支持下载、下游、撤销和 IndexedDB 保存。结果图库、选中结果、拆分与剪贴板复用生图节点约定；[ideogramClipboard.ts](./ideogramClipboard.ts) 恢复时清除外部参数连接状态。

服务端 [ideogram.ts](../../server/ideogram.ts) 仅从 `WAVESPEED_API_KEY` 读取密钥。编辑支持 PNG/JPEG/WebP 输入，单张最多 32 MiB、合计 46 MiB；所有参数和文件大小先校验，再按 [上传协议](https://wavespeed.ai/docs/upload-files-api) 向固定 `/media/uploads` 获取凭证，使用返回的 URL/headers PUT 原始字节，PUT 不携带 API 密钥。上传地址、签名和上游错误正文不返回客户端。上传失败不提交模型任务；供应商默认保留上传文件 7 天。

按 [文生图](https://wavespeed.ai/docs/docs-api/ideogram-ai/ideogram-ai-ideogram-v4.5) 和 [Edit 文档](https://wavespeed.ai/docs/docs-api/ideogram-ai/ideogram-ai-ideogram-v4.5-edit) 提交一次，通过 Task ID 查询固定结果接口，每次至少间隔 2 秒；仅 GET 的网络错误、429 和 5xx 退避重试并遵守 Retry-After。completed 读取 outputs，failed/cancelled/timeout/deleted 停止查询。上传和生成总等待最多 5 分钟，取消只停止本地等待，不代表撤销供应商任务或退款；提交后失败保留 Task ID（已取得时），提示先查看 WaveSpeed History，绝不自动重新提交。

`ideogram.test.ts`、`ideogramEdit.test.ts`、`ideogramClient.test.ts`、`server/ideogram.test.ts` 使用既有 Node.js 测试运行器，随 `npm test` / `npm run check` 执行。`/tests/ideogram.html` 和 `/tests/ideogram-edit.html` 使用隔离数据库和模拟响应验证生成/编辑切换、参数、Mask 转换、结果、取消、失败、撤销与保存恢复；编辑验收还比较真实 Painter 渲染、Compare 两路以及独立快照恢复后提交的完整 Mask 像素，不调用真实模型。

## 按依赖自动执行与结果复用

点击模型节点或“运行选中节点”时，目标模型强制运行，上游按实际使用的端口准备。`executionGraph.ts` 定义依赖、生成条件指纹、输出有效性和执行前检查；`workflowExecution.ts` 管理运行身份、共享任务、取消和写回；`useWorkflowExecution.ts` 提供请求与素材适配。`DescriberPanel` 只触发运行和展示设置、任务。描述器、GPT Image 2.5、Nano Banana、Ideogram 共用此机制。

互不依赖的分支可并发；汇合节点在必需上游成功后才组装请求。Text 只追踪实际引用的富文本变量（旧文本仍按原规则拼接全部输入）；Router 保留原端口语义，Compare 只追踪所用一路，Ideogram 只追踪当前模式的参数。执行前检查整条必要依赖链，缺图、无连接、无选区、已知不匹配的选区和环路都先定位到问题节点，不提交模型请求。依赖运行后才能确定的错误在下一节点提交前检查。

成功记录与结果同时写入：描述保存 `generation`，生图每张 `FileAsset` 保存自己的 `generation`，包含版本、实际请求输入指纹和输出标识。记录随 IndexedDB 与撤销历史恢复；进度、等待、取消和运行身份仅保留在临时 store。输入指纹排除临时 Blob URL，使用本地不可变素材 ID（有内容哈希时优先使用）；生成图片的派生缓存指纹包含所选结果 ID 与内容身份；远程内容哈希变化时重算下游本地输出，内容相同而临时 Blob URL 改变时仍可复用。远程 URL 仅对本次实际使用的端口、原始素材及确认复用的当前结果读取独立快照并计算 SHA-256，实际请求使用该快照；跳过未选中的历史结果、Compare 未使用的一路及被连接覆盖的备用素材。可重建的旧结果读取失败时自动更新，必需原始素材读取失败则停止提交。重复上传同一文件仍可保守地重新计算。未改变的上游复用，目标 Runs 为 N 时上游准备一次、目标独立执行 N 次；某次目标请求失败不跳过其余排队次数，取消或依赖失效则停止剩余运行；互有依赖的多选暂不允许 Runs > 1。

输入变化与结果复用由系统内部记录和判断，节点卡片及右侧设置面板不展示来源记录、手动复用或固定结果的提示与按钮。手动编辑描述后自动保留文字，换图时内部追踪来源变化，运行下游继续使用手动文字；主动运行描述节点会替换手动结果并恢复自动更新。历史数据中已固定的结果仍作为素材用于下游；切换历史图片会改变下游输入。旧的自动结果没有生成记录时视为不可确认复用，点击下游运行后自动重跑所需上游，成功后使用新结果继续下游，并记录生成条件供后续复用。更新失败保留旧结果供查看，但不把旧结果当作成功继续下游；不会在打开画布时自动调用模型。锁定不等于固定：有效结果可读取，需要更新的锁定节点会阻止流程。单节点复制不复制上游连接，已有结果仍保留；自动结果是否可复用按新连接重新核验。

每轮拥有独立取消身份。输入、连接、输出选择或相关手动内容变化时终止受影响运行；A → B → 撤销回 A 也不会恢复已取消请求。迟到响应不得写回或继续下游。失败不自动重试；取消只释放本轮消费者，共享上游仍有其他消费者时继续。已提交请求的计费取决于供应商。刷新不会自动恢复未完成的模型任务。

`executionLocal.ts` 在节点预览之外生成正式本地输出，复用现有 Worker、Canvas 算法及 revision 规则；正式 Worker 与可替换的预览队列隔离，空返回作为失败，取消和超时有明确终态。支持 Resize、Crop、Rotate/Flip、Invert、Blur、Levels、Color correction、Matte、Blend、Compositor、Color palette、Painter 及已有选区的 Masks Extractor；不会替用户选择区域或触发分割模型。已有效且可读取的本地输出直接复用；本地缓存失效时从现有输入自动重算一次，失败则停止下游，不循环重试。原始文件缺失、用户取消或节点锁定时不进行自动重建。

`workflowExecution.test.ts` 随 `npm test` 验证分支汇合、复用、端口依赖、取消、共享任务、Runs、保存恢复和失败。浏览器入口 `/tests/workflow-execution.html` 使用真实 React Flow、运行入口、Worker、撤销历史和独立 IndexedDB，拦截所有模型 API 并阻止外部请求。额外验收包含：本地失效缓存自动重算、无关远程图片不读取、远程旧结果失效自动更新、必需原图失效阻止模型请求；旧描述和旧图片自动更新、后续复用；手动描述后换图；A → B → 撤销回 A 的迟到响应；目标 Runs = 3；缺少必要选区时零模型提交；预览任务被替换后正式输出不误报成功、不无限等待。`/tests/model-run-progress.html` 继续检查独立分支并发、进度和取消。检查均不消耗真实模型额度。

自动执行的补充边界：各运行保存自己接受的上游模型输出，其他并发运行更新同一节点时不替换本次输入。开始执行前检查已知提示词、静态参数和必要连接；来自待运行节点的动态文本在准备好后再校验。Painter Mask 直连或经过 Router 接入 GPT Image / Ideogram 时，按实际请求的 alpha PNG 校验缓存，缺失或无法读取则自动重新导出；Compare 保持原来的可见图片输出语义。模型请求超时从取得并发名额后开始计时，排队期间仍可取消。每张资源读取设 30 秒期限，包含响应体和远程内容指纹计算，超时中止读取并结束等待；原图读取失败不会提交模型请求。

这些边界由 `workflowExecution.test.ts`、`executionAssets.test.ts` 随 `npm test` 验证（包括虚拟时钟下的排队、取消和迟到返回）。`tests/workflow-boundaries.test.ts` 由 `/tests/workflow-execution.html` 调用，使用隔离的执行器、模拟模型返回、原生 Painter 导出与资源读取检查并发、提前校验、蒙版恢复和超时；另以真实 Resize 像素验证远程生成内容更新、相同内容复用，以及 Runs 中单次失败后的剩余次数执行；不读取或改动用户保存的画布，不调用真实模型。
