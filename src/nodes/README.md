# 节点索引与开发约定

新增或扩展节点从[接入步骤](#新增或扩展节点)开始。修改已有节点可按任务选文档，或在[节点表](#现有节点)中按名称查找组件、端口和约定。

| 开发任务 | 阅读入口 |
| --- | --- |
| 添加节点、改菜单或连线 | [节点创建、端口与连接](guides/connections.md) · <a name="输入输出与交互约定"></a>[输入输出与交互约定](guides/connections.md#输入输出与交互约定) · <a name="代码入口与职责"></a>[代码入口与职责](guides/connections.md#代码入口与职责) |
| 改节点外观与交互 | [节点外观与共享控件](guides/shared-ui.md) |
| 改批处理或任务调度 | [路由、迭代与工作流执行](guides/workflow.md) · <a name="按依赖自动执行与结果复用"></a>[按依赖自动执行与结果复用](guides/workflow.md#按依赖自动执行与结果复用) |
| 接入或调整模型 | [模型节点与渠道](guides/models.md) · <a name="模型运行约定"></a>[模型运行约定](guides/models.md#模型运行约定) |
| 改色板、像素算法 | [色板、调色与滤镜](guides/color-filters.md) |
| 改图片尺寸、图层或预览 | [尺寸变换、合成与预览](guides/image-tools.md) |
| 改绘图、蒙版或标注 | [绘图、蒙版与交互编辑](guides/painting-masks.md) |

## 现有节点

以下节点类型已在 [index.ts](./index.ts) 的 `nodeTypes` 中注册。`initialNodes` 当前为空，默认不预置节点。

| 节点 / 开发约定 | 类型标识 | 组件文件 | 输入与输出 |
| --- | --- | --- | --- |
| <a name="router"></a>[路由（Router）](guides/workflow.md#router) | `router` | [RouterNode.tsx](./RouterNode.tsx) | 单输入 `input`（Input）；`output`（Output）原样透传，可连接多个下游 |
| <a name="text-iterator-文本迭代约定"></a>[文本迭代（Text Iterator）](guides/workflow.md#text-iterator-文本迭代约定) | `text-iterator` | [TextIteratorNode.tsx](./TextIteratorNode.tsx) | `input` 接收文本或 JSON 文本数组；`text` 为逐项文本输出，后续模型按条目分别运行 |
| <a name="image-iterator-图片迭代约定"></a>[图片迭代（Image Iterator）](guides/workflow.md#image-iterator-图片迭代约定) | `image-iterator` | [ImageIteratorNode.tsx](./ImageIteratorNode.tsx) | 无输入端口；`file` 为逐张图片输出，后续模型按图片分别运行 |
| [提示词（Prompt）](guides/connections.md#输入解析与锁定) | `text` | [TextNode.tsx](./TextNode.tsx) | 变量输入 `variable-1` 起；输出解析后的文本 |
| <a name="交互编辑"></a>[导入 / 文件（Import / File）](guides/shared-ui.md#文件导入与图片查看器) | `file` | [FileNode.tsx](./FileNode.tsx) | 无输入端口；通过 `file` 端口输出文件，支持在当前图片上[交互编辑](guides/painting-masks.md#交互编辑) |
| [图像描述（Image Describer）](guides/models.md#图像描述) | `image-describer` | [ImageDescriberNode.tsx](./ImageDescriberNode.tsx) | 图片输入 `image-0` 起；可暴露 `model`、`instructions` 文本输入；输出 `data.text` |
| [模型名称 / 参数选项（Model Name）](guides/connections.md#输入解析与锁定) | `model-input` | [ImageDescriberNode.tsx](./ImageDescriberNode.tsx) 中的 `ModelInputNode` | 输出当前 `data.model`；`options` 输入仅展示，不能连接 |
| [GPT Image 2.6](guides/models.md#gpt-image-26) | `sunburst` | [SunburstNode.tsx](./SunburstNode.tsx) | `prompt`（OpenAI 官方和 APIMart 标准版支持交互编辑标注）、`image-0` 起及受渠道和格式限制的 `mask`；`result` 输出当前选中的结果图片 |
| <a name="旧工作流中的-ideogram-45"></a>[Ideogram 4.5](guides/models.md#旧工作流中的-ideogram-45) | `ideogram` | [IdeogramNode.tsx](./IdeogramNode.tsx) | 保留存量输入端口及连线；`result` 输出已保存的选中图片 |
| <a name="nano-banana"></a>[Nano Banana](guides/models.md#nano-banana) | `nano-banana` | [NanoBananaNode.tsx](./NanoBananaNode.tsx) | 必需的 `prompt`、可选的 `image-0` 起的参考图输入；`result` 输出选中图片 |
| <a name="seedream-55apimart"></a>[Seedream 5.5](guides/models.md#seedream-55apimart) | `seedream` | [SeedreamNode.tsx](./SeedreamNode.tsx) | 必需的 `prompt`、可选的 `image-0` 起的参考图输入；`result` 输出选中图片 |
| <a name="color-palette-色板约定"></a>[调色板（Color palette）](guides/color-filters.md#color-palette-色板约定) | `color-palette` | [ColorPaletteNode.tsx](./ColorPaletteNode.tsx) | 无输入；`image`（Image）输出纯色条 PNG，`text`（Text）输出按顺序以 `*` 连接的 HEX 色值 |
| <a name="compositor-合成约定"></a>[合成器（Compositor）](guides/image-tools.md#compositor-合成约定) | `compositor` | [CompositorNode.tsx](./compositor/CompositorNode.tsx) | `background`、`layer-1` 起的动态图片输入；`result`（Output）输出实际合成 PNG；独立图层编辑器见[使用与架构](../../docs/compositor.md) |
| <a name="color-correction-调色约定"></a>[色彩校正（Color correction）](guides/color-filters.md#color-correction-调色约定) | `color-correction` | [ColorCorrectionNode.tsx](./ColorCorrectionNode.tsx) | 单图片输入 `file`（File）；`result` 输出调色后的 PNG |
| <a name="levels-色阶约定"></a>[色阶（Levels）](guides/color-filters.md#levels-色阶约定) | `levels` | [LevelsNode.tsx](./LevelsNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸 PNG |
| <a name="blend"></a>[混合（Blend）](guides/image-tools.md#blend) | `blend` | [BlendNode.tsx](./BlendNode.tsx) | `back`（Back）、`front`（Front）图片输入；`result`（Result）输出合成 PNG |
| <a name="compare"></a>[对比（Compare）](guides/image-tools.md#compare) | `compare` | [CompareNode.tsx](./CompareNode.tsx) | `input-1` / `input-2`（Input 1 / Input 2）；`output-1` / `output-2`（Output 1 / Output 2）分别透传对应输入 |
| <a name="resize"></a>[调整尺寸（Resize）](guides/image-tools.md#resize) | `resize` | [ResizeNode.tsx](./ResizeNode.tsx) | 单图片输入 `image`（Image）；`result`（Result）输出指定尺寸 PNG |
| <a name="rotate-and-flip"></a>[旋转与翻转（Rotate and flip）](guides/image-tools.md#rotate-and-flip) | `rotate-flip` | [RotateFlipNode.tsx](./RotateFlipNode.tsx) | 单图片输入 `image`（Input）；`result`（Result）输出旋转后的原分辨率 PNG |
| <a name="invert-反选约定"></a>[反相（Invert）](guides/color-filters.md#invert-反选约定) | `invert` | [InvertNode.tsx](./InvertNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸反色 PNG |
| <a name="blur-模糊约定"></a>[模糊（Blur）](guides/color-filters.md#blur-模糊约定) | `blur` | [BlurNode.tsx](./BlurNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出原尺寸 PNG |
| <a name="crop-裁剪约定"></a>[裁剪（Crop）](guides/image-tools.md#crop-裁剪约定) | `crop` | [CropNode.tsx](./CropNode.tsx) | 单图片输入 `image`（Input）；`result`（Output）输出裁剪后的 PNG |
| <a name="painter-绘制约定"></a>[绘图（Painter）](guides/painting-masks.md#painter-绘制约定) | `painter` | [PainterNode.tsx](./PainterNode.tsx) | 单图片输入 `image`；`result` 输出合成图片，`mask` 输出黑底白色绘制区域 |
| <a name="matte-grow--shrink-蒙版扩张与收缩约定"></a>[蒙版扩张 / 收缩（Matte Grow / Shrink）](guides/painting-masks.md#matte-grow--shrink-蒙版扩张与收缩约定) | `matte-grow-shrink` | [MatteGrowShrinkNode.tsx](./MatteGrowShrinkNode.tsx) | `image`（Input）接收图片或黑白蒙版；`result`（Output）输出原尺寸灰度蒙版 PNG |
| <a name="masks-extractor"></a>[蒙版提取（Masks Extractor）](guides/painting-masks.md#masks-extractor) | `masks-extractor` | [MasksExtractorNode.tsx](./MasksExtractorNode.tsx) | 单图片输入 `image`；`result`（Image With Alpha）输出透明抠图，`mask`（Mask）输出黑白蒙版 |
| <a name="preview-预览约定"></a>[预览（Preview）](guides/image-tools.md#preview-预览约定) | `preview` | [PreviewNode.tsx](./PreviewNode.tsx) | 单图片输入 `file`，无输出；实时显示上游图片 |
| [坐标记录（Position Logger）](guides/connections.md#创建菜单) | `position-logger` | [PositionLoggerNode.tsx](./PositionLoggerNode.tsx) | 左侧输入、右侧输出；不执行模型任务 |

## 新增或扩展节点

1. 在 `types.ts` 定义明确的数据类型，并扩展 `AppNode`；组件使用对应的 `NodeProps` 类型。组件名采用 PascalCase，节点类型标识采用 kebab-case，遵循现有 TypeScript 风格。
2. 在本目录创建组件，并在 `index.ts` 的 `nodeTypes` 注册。明确默认值来源；注册节点不代表需要加入 `initialNodes`。
3. 需要出现在节点库时，在 `src/components/libraryCatalog.ts` 添加条目及 `createLibraryNode()` 创建数据，在 `src/components/nodeMenuCatalog.ts` 维护分组和搜索入口；检查 Dock、空白右键及拖线推荐菜单。拖线推荐还需核对 `connectionRecommendations.ts` 的兼容端口，不能假定注册后自动支持新类型。
4. 定义稳定的输入输出端口 ID、允许连接的类型和单端口连接数量。按需扩展 `connectionRules.ts` 的统一校验和文本或图片解析逻辑，并验证动态端口布局。
5. 需要设置面板或模型运行时，接入对应面板、运行前校验、任务状态、取消与结果写回流程。复用现有任务机制，避免在组件中另建一套请求和状态管理。
6. 核对复制粘贴、克隆、删除、锁定与撤销重做。复用 `TextNodeMenu` 时，还需扩展其允许操作的节点类型判断，不能只挂载组件；菜单中的“保存节点”目前仍禁用，与画布自动保存是独立功能。需要持久化的数据放入节点数据；临时 UI 状态和请求控制器留在运行时。涉及新素材字段时，同时扩展素材引用收集与 `workflowStorage.ts` 的 `mapAssets`，验证保存恢复及资源释放。任务和撤销历史目前不跨刷新恢复，恢复画布也不会自动重发模型任务。
7. 同步更新本页索引及受影响的专题。删除节点或改变类型标识、端口 ID、持久化数据时，核对旧画布和剪贴板的兼容性。

## 验证与文档维护

自动检查和正式画布验收按[项目约定](../../AGENTS.md)执行。新增测试接入实际运行入口，浏览器测试页须单独打开，详见[质量检查](../../docs/code-quality.md#按修改范围补充浏览器验收)。

编辑器改动需验证 Tab 建议、中文输入、撤销、粘贴和内联变量。模型流程改动需检查缺少输入、重复运行、取消、失败和结果写回。

新增、删除或更改节点接口时，同步更新节点表和对应专题。表中每个注册类型保留一行。只改实现或样式且现有描述仍准确时，无需改文档。

项目启动、环境变量与服务接入见[项目 README](../../README.md)。
