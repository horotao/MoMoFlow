# 节点索引与开发约定

本目录包含自定义节点组件、节点数据类型，以及文本解析、文件处理和模型运行等配套逻辑。本文记录节点用途、输入输出与开发入口；项目启动、环境变量和服务接入说明见[项目 README](../../README.md)，通用开发要求见 [AGENTS.md](../../AGENTS.md)。

## 现有节点

以下节点类型已在 [index.ts](./index.ts) 的 `nodeTypes` 中注册。`initialNodes` 当前为空，默认不预置节点。

| 显示名称 / 用途 | 类型标识 | 组件文件 | 输入与输出 |
| --- | --- | --- | --- |
| Prompt：编辑文本、组合上游变量 | `text` | [TextNode.tsx](./TextNode.tsx) | 变量输入 `variable-1` 起；输出解析后的文本 |
| Import / File：导入、预览和管理文件集合 | `file` | [FileNode.tsx](./FileNode.tsx) | 无输入端口；通过 `file` 端口输出文件，端口类型随集合内容变化 |
| Image Describer：根据图片生成可继续编辑的文本 | `image-describer` | [ImageDescriberNode.tsx](./ImageDescriberNode.tsx) | 图片输入 `image-0` 起；可暴露 `model`、`instructions` 文本输入；输出 `data.text` |
| Model Name / 参数选项：提供一个可选的文本值 | `model-input` | [ImageDescriberNode.tsx](./ImageDescriberNode.tsx) 中的 `ModelInputNode` | 输出当前 `data.model`；`options` 输入仅展示，不能连接 |
| GPT Image 2.5 Sunburst：生成或编辑图片 | `sunburst` | [SunburstNode.tsx](./SunburstNode.tsx) | `prompt`、`image-0` 起、`mask` 及暴露的参数输入；`result` 输出当前选中的结果图片 |
| Color palette：制作最多十色色板 | `color-palette` | [ColorPaletteNode.tsx](./ColorPaletteNode.tsx) | 无输入；`image`（Image）输出纯色条 PNG，`text`（Text）输出按顺序以 `*` 连接的 HEX 色值 |
| Compositor：图片、文本与矢量图层合成 | `compositor` | [CompositorNode.tsx](./compositor/CompositorNode.tsx) | `background`、`layer-1` 起的动态图片输入；`result`（Output）输出实际合成 PNG；独立图层编辑器见[使用与架构](../../docs/compositor.md) |
| Color correction：本地图片调色 | `color-correction` | [ColorCorrectionNode.tsx](./ColorCorrectionNode.tsx) | 单图片输入 `file`（File）；`result` 输出调色后的 PNG |
| Levels：本地图片色阶 | `levels` | [LevelsNode.tsx](./LevelsNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸 PNG |
| Compare：双图片对比 | `compare` | [CompareNode.tsx](./CompareNode.tsx) | `input-1` / `input-2`（Input 1 / Input 2）；`output-1` / `output-2`（Output 1 / Output 2）分别透传对应输入 |
| Resize：本地调整图片宽高 | `resize` | [ResizeNode.tsx](./ResizeNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出指定尺寸 PNG |
| Rotate and flip：本地旋转与镜像 | `rotate-flip` | [RotateFlipNode.tsx](./RotateFlipNode.tsx) | 单图片输入 `image`（Input）；`result`（Result）输出旋转后的原分辨率 PNG |
| Invert：本地图片 / 遮罩反选 | `invert` | [InvertNode.tsx](./InvertNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸反色 PNG |
| Blur：本地图片模糊 | `blur` | [BlurNode.tsx](./BlurNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸 PNG |
| Crop：本地裁剪图片 | `crop` | [CropNode.tsx](./CropNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出裁剪后的 PNG |
| Painter：在图片或空白画布上绘制 | `painter` | [PainterNode.tsx](./PainterNode.tsx) | 单图片输入 `image`；`result` 输出合成图片，`mask` 输出黑底白色绘制区域 |
| Preview：查看上游图片与遮罩 | `preview` | [PreviewNode.tsx](./PreviewNode.tsx) | 单图片输入 `file`，无输出；实时显示上游图片 |
| Position Logger：显示节点坐标的示例节点 | `position-logger` | [PositionLoggerNode.tsx](./PositionLoggerNode.tsx) | 左侧输入、右侧输出；不执行模型任务 |

节点库的名称、分类和创建数据在 [libraryCatalog.ts](../components/libraryCatalog.ts) 中维护。只有提供 `nodeType` 的条目才能通过 `createLibraryNode` 创建节点；目录中的展示卡片不等于已实现的节点，不应为占位卡片生成替代节点。

Compositor 文本、形状及钢笔交互与验证入口见 [合成编辑器文档](../../docs/compositor.md)。锚点在不同缩放下保持固定命中区，可越界调整及插入曲线点；交互草稿按帧更新，提交仍复用工作流历史与持久化。

Compositor 输出解析在每次读取中按节点与输出端口复用校验结果，环路检查独立跟踪当前路径；缓存不跨编辑、撤销或恢复复用。`compositorResolution.test.ts` 随 `npm test` 检查共享上游、输出端口区分、失效和环路；浏览器验证页同时运行 Enter 键回归。

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

- 连接规则由 `connectionRules.ts` 的 `canConnect` 统一校验，`App.tsx` 的 `isValidConnection` 和推荐菜单创建入口共用：拒绝自连接、环路、涉及锁定节点的连接和连接到 `model-input` 的输入。同一个文本变量输入或描述器、Sunburst、Compositor、Painter、Crop、Color correction、Blur、Invert、Levels、Resize、Preview 输入端口只能连接一条边。
- 将输入或输出把手拖到空白画布会打开可搜索的推荐菜单，按方向和端口类型筛选已实现节点；选中后才创建节点并连接正确端口，创建与连线作为一次撤销记录。Escape、点击外部或移动画布关闭菜单，取消不修改图数据。落在已有节点上仍使用普通连接规则。
- 从图片/遮罩输入反向选择 Import 时，允许先创建并连接空 File，之后由用户添加图片；该特例只适用于本次新建的 Import，运行前仍必须通过已有图片校验。推荐 Image Describer 的 System Instructions 时会同时暴露该输入。未知或不兼容的媒体输出不推荐文本节点。
- Prompt 的变量端口从 `variable-1` 开始，图片端口从 `image-0` 开始。沿用 `variableHandleId`、`variableIndex` 等辅助函数，避免混用编号。端口数量或位置变化后调用 `useUpdateNodeInternals`，使连线位置跟随更新。
- 连接期间，文本值通过 `resolveTextValue` 从当前图数据动态解析，不持续复制到下游节点数据中。参数从外部输入切回 **Use local value** 时例外：Image Describer 会将当前解析值写回本地参数并移除对应连线；Sunburst 也会保存当前有效参数值，校验失败时保留原本地值。具体入口见 [DescriberPanel.tsx](../components/DescriberPanel.tsx) 和 [SunburstSettings.tsx](../components/SunburstSettings.tsx)。
- Prompt 连接到已有素材的 File 时会显示类型不兼容；连接空 File 时不显示该错误。两种情况下 File 都解析为空文本，不会转换成提示词内容；这与模型节点在连接时直接拒绝错误输入的行为不同。
- Image Describer、Sunburst、Painter、Crop、Blur、Invert、Levels 和 Color correction 的图片输入接受纯图片 File 集合、Sunburst 结果、Painter、Crop、Blur、Invert、Levels 或 Color correction 输出。Painter、Crop、Blur、Invert、Levels 和 Color correction 使用集合的第一张图片作为底图。`imageOutput` 对 File 返回集合中的图片，对 Sunburst 只返回当前选中结果（没有有效选中项时取最后一张），对 Crop、Blur、Invert、Levels 和 Color correction 返回当前有效的处理结果；对 Painter 按 `sourceHandle` 区分 Result 与 Mask，并在上游或绘制内容变化后拒绝尚未更新的输出。不要将 File 的预览选中项误当作唯一输出。
- Sunburst 的 Prompt 和暴露参数接受 `text`、`image-describer`、`model-input` 的文本输出；Image Describer 的模型与指令输入也接受这些类型。Sunburst、Painter、Crop、Blur、Invert、Levels 和 Color correction 图片输出可连到 Sunburst 的图片/遮罩输入、Image Describer 的图片输入或 Painter / Crop / Blur / Invert / Levels 的 Image 输入，以及 Color correction / Preview 的 File 输入。
- `model-input` 同时用于模型名称和 Sunburst 参数选项，`parameter` 标识参数用途，`options` 保存可选文本。Options 输入端口尚未实现，继续保持不可连接。
- 从 Sunburst 暴露的参数输入反向选择 Model Name 时，复用 `sunburstParameterData`，按目标参数的当前本地值初始化名称、值和选项（保留自定义尺寸）；普通模型名称节点仍使用原默认值。
- 对支持锁定的节点，数据更新、拖动、删除、连线和运行入口都需考虑 `locked`，异步结果写回前再次检查。节点内的编辑与点击控件按交互需要使用 `nodrag`、`nopan`、`nowheel`，避免与画布手势冲突。

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

界面依次为 Channel / Reset、Histogram、Inputs 和 Outputs。RGB、R、G、B 各自保存独立的输入黑点、Gamma、输入白点与输出黑白点；在线性色彩空间先应用单通道、再应用 RGB 总调整，最后编码回 sRGB。输入范围 0–255，黑点不大于白点（相同值产生阈值效果）；Gamma 为 0.1–10（默认 1），大于 1 提亮中间调；输出范围 0–255，可反向或设为同值。Reset 重置全部通道参数。直方图以相同纵轴比例叠加原图（75%）和调整结果（25%），拖动时随预览更新；RGB 使用 0.299R + 0.587G + 0.114B 的亮度分布，R/G/B 显示对应颜色分布，透明像素按 alpha 加权。256 列像素绘图保持阶梯轮廓。

Gamma 滑块采用对数位置映射，向右增大并提亮；黑白点变动时中点随输入范围定位。滑块支持指针拖动及方向键，Shift 加速、Home / End 到边界；数字框 Enter / 失焦提交、Escape 取消。每次拖动只记录一次撤销；512 边长的独立线程提供拖动预览，松开后用原尺寸处理得到 PNG，再从相同像素生成最终预览。下载等待准确结果。保留透明度、原图比较、尺寸显示和 Preview 实时联动；换图、取消、锁定后拒绝迟到的结果，下游不能读取过期输出。

支持重命名、锁定、副本、剪切粘贴、撤销重做及 IndexedDB 素材恢复；独立副本保留底图。数据及像素算法见 `levels.ts`，处理线程和请求合并见 `levels.worker.ts` / `levelsRender.ts`。`levels.test.ts`、`levelsRender.test.ts` 使用现有 Node.js 内置测试运行器，随 `npm test` 验证像素映射、透明度、直方图、连线约束、输出失效、素材保存和请求取消。

## Invert 反选约定

Invert 位于 Tools → Editing 和图片连接推荐菜单。Input（`image`）接收上游图片或 Painter 的黑白 Mask，图片集合取第一张；Output（`result`）输出原尺寸 PNG，可连接 Preview、其他图片处理节点、Sunburst 图片/遮罩输入和 Image Describer。在浏览器本地按 `255 − RGB` 反色，黑白遮罩互换黑白，保留灰度软边与透明通道；普通彩色图片输出反色图片，不强制二值化。

Invert Output 接入 Sunburst Mask 时，仅在请求准备阶段将完全不透明的遮罩按亮度转换为透明 PNG：白色为透明编辑区域，黑色为不透明保护区域，灰色保留部分透明的软边。已有透明区域的遮罩沿用原透明通道。转换不改变 Invert 素材、预览、下载或其他下游图片输入；原图仍须另接 Sunburst Image，遮罩仍须与第一张原图尺寸一致且存在透明区域。`sunburstRun.ts` 在任务快照中标记转换方式，`sunburstClient.ts` 在本地完成转换和校验，不向服务端发送该标记；`invert.test.ts` 和 `sunburstClient.test.ts` 随 `npm test` 验证这条路径、软边、取消及已有透明遮罩兼容性。

图片按原比例展示，无需额外参数或运行按钮。悬停或键盘聚焦时，左上角显示隐藏效果按钮：点击切换原图，再点击恢复反选；此对比仅影响当前预览，不改变 Output 和下载内容。右上角下载反选 PNG，左下角显示原始像素尺寸。未连接或上游未就绪时显示棋盘格，处理完成前禁用下载；输入变化、断开或删除后不显示或传递旧结果，导出回写前检查当前连接和锁定状态。

支持重命名、锁定、副本、剪切粘贴、撤销重做及 IndexedDB 保存恢复；独立副本保留输入底图，派生结果不增加撤销步骤。核心像素算法和数据在 `invert.ts`，界面与导出在 `InvertNode.tsx`。`invert.test.ts` 随 `npm test` 验证黑白/灰度/透明像素、Painter Mask 输入、连线限制、链式失效和素材恢复。

## Blur 模糊约定

Blur 位于 Tools → Editing 和图片连接推荐菜单。Input（`image`）接收一张上游图片，集合取第一张；Output（`result`）输出原尺寸 PNG，可连接 Preview、Painter、Crop、Color correction、Blur、Sunburst 和 Image Describer。类型为 Box / Gaussian，Size 为 1–100 的整数，初始 Gaussian / 50；Size 1 保持原图。图片悬停显示按住查看原图、下载和尺寸。

本地后台线程处理图片，不调用模型。Box 使用可分离均值滤波；Gaussian 使用按高斯函数采样、截断至 4σ 并归一化的可分离卷积（σ = (Size − 1) / 3），不再使用 Box 近似。Size 控制模糊强度，不承诺与 Weavy 内部算法逐像素一致。预乘透明度后滤波，边界使用最近边缘像素，避免透明区域的隐藏颜色渗入。Gaussian 拖动时在独立线程的最长边 512 像素底图上进行高斯卷积，并按比例缩放 σ；原尺寸任务不会阻塞这条交互队列。Box 保持最长边 1024 的拖动预览。连到 Preview 时同步显示；松开后从同一份原尺寸处理像素生成最终预览和 PNG，下载在最终结果就绪后才启用。Gaussian 输出版本变化会使旧近似结果失效并重新计算。

数字输入失焦或 Enter 提交，Escape 取消；一次滑块拖动只提交一个撤销步骤。取消、换图或锁定使旧处理帧失效；导出尚未完成时禁用下载，下游不读取过期结果。支持锁定、重命名、副本、剪切粘贴、撤销重做与 IndexedDB 保存恢复，独立副本保留底图。算法与数据在 [blur.ts](./blur.ts)，线程在 [blur.worker.ts](./blur.worker.ts)，排队与实时预览在 `blurRender.ts` 和 `blurLivePreview.ts`。`blur.test.ts` 与 `blurRender.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 验证像素、透明边缘、连线、失效输出、素材恢复和请求合并。

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

预览按第一张可用图片比例布局，两张图等比例居中；仅一路可用时显示该图，无输入时显示棋盘格。左右端口分别位于 89 / 149px，每个输入只允许一条图片连线；支持两路连接同一来源，拒绝环路、锁定节点及非图片输入。两个输出分别透传原始图片，保留原生尺寸、透明度和资源标识，不导出对比拼图；模式、拖动与临时预览不改变输出。

模式和分割位置参与撤销重做与工作流保存。副本、剪切粘贴保存两路输入快照；已有连线优先于快照，上游暂不可用时不返回旧快照。支持重命名、锁定和删除，素材生命周期与 IndexedDB 复用现有机制。无模型请求或付费调用。

`compare.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 验证双输出、断开重连、递归、连接规则、剪贴板校验和素材映射。启动 `npm run dev` 后打开 `/tests/compare.html`，可在隔离画布检查 Slider / Toggle、撤销重做、主题、连线和缩放；该页使用独立测试数据库，不访问用户工作流。
