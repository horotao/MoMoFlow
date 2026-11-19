# 尺寸变换、合成与预览

调整裁剪、尺寸、旋转、图层合成、混合、对比或预览时查阅。[返回节点索引](../README.md)

## Crop 裁剪约定

Crop 位于 Tools → Editing，也出现在图片连接的推荐菜单中。Input 接收 Import、Sunburst、Painter、Color correction 或另一个 Crop 的图片；集合使用第一张图片。Output 输出原始分辨率下裁剪后的透明通道 PNG，不缩放图像、不运行模型或消耗额度。裁剪矩形以原图的归一化坐标保存，上游图片更换时保留相对选区。

图像上显示裁剪框、四角/四边拖动区域、三分辅助线和框外遮罩。拖动内部移动选区；拖动边角调整大小，选区不会超过原图边界。底部宽高比提供 21:9、16:9、4:3、3:2、1:1、2:3、3:4、9:16、9:21，选择后在整张原图中居中适配并锁定比例。尺寸中的宽/高是实际输出像素，失焦或 Enter 提交，Escape 取消；解锁时可独立修改，锁定时联动且限制在图片范围内。“重置”恢复整张原图并解除比例锁定。

每次拖动结束提交一次，可撤销/重做；Escape 或指针取消恢复拖动前状态。连接的 Preview 在拖动中显示本地裁剪帧，正式输出在松开后导出。临时帧不进入保存、历史或模型请求。上游断开、替换或选区尚未导出时不向下游提供旧结果，异步导出检查最新图结构以防止过期回写。复制/剪切保留底图快照，副本无需原连线即可编辑；底图、结果和选区随 IndexedDB 保存，锁定节点禁止编辑。

核心几何与剪贴板校验位于 [crop.ts](../crop.ts)，界面与导出位于 [CropNode.tsx](../CropNode.tsx)，实时预览位于 [cropLivePreview.ts](../cropLivePreview.ts)。`crop.test.ts` 使用现有 Node.js 测试运行器随 `npm test` 验证边界、比例、尺寸、输出失效、连接和素材恢复。

## Rotate and flip

入口位于 Tools → Editing，或从图像端口拖出后的兼容节点菜单。底部三个按钮从左到右为顺时针旋转 90°、水平镜像、垂直镜像，右侧 Reset 恢复 0° 并清除两种镜像。与 Weavy 一致，旋转按 0° / 90° / 180° / 270° 循环，镜像各自切换，最终先旋转再按输出图像的水平 / 垂直轴翻转；操作按钮的先后次序不改变这套组合规则。

接入图像后自动在本地处理，无需运行模型。90° / 270° 交换输出宽高；整数坐标变换保留透明通道，不裁切、不缩小导出。悬停显示下载和实际尺寸；预览与下载来自同一份原分辨率画布。支持 Import、Painter Result / Mask 及其他图像节点输入，并可连接 Preview、其他图像处理节点、Sunburst 和 Image Describer。参数、输入或连接变化会立即使旧结果失效，未完成的结果不可下载，过期异步任务不会覆盖新结果。

支持重命名、锁定、创建副本、剪切粘贴、逐次撤销重做与 IndexedDB 保存恢复；独立副本保留底图，派生图像不增加撤销步骤。设置、旋转矩阵和剪贴板校验见 `rotateFlip.ts`，界面与 PNG 导出见 `RotateFlipNode.tsx`。`rotateFlip.test.ts` 使用现有 Node.js 内置测试运行器，随 `npm test` 检查非正方形像素方向、组合顺序、连续操作、输出失效、连接约束和素材恢复。


## Resize

节点沿用共享外框、标题、更多菜单和图片端口；空节点为 456×542，预览为 424×424，悬停或选中显示 Image / Result 标签。底部为 W / H 标签与 70×26 输入框、比例锁定按钮和右侧 Reset；接图后预览按实际输出比例调整高度。

入口位于 Tools → Editing，也可通过图片端口的连接推荐菜单创建。W / H 显示输出像素尺寸，首次接入默认使用原图尺寸。默认锁定比例，首次调整时保存未取整的宽高比，后续修改任意一边均沿用该比例计算，避免连续缩小、放大产生取整误差；解锁后可独立修改宽高，图像拉伸到指定尺寸。重新锁定采用当前宽高比，Reset 清除之前保存的比例。锁定比例随撤销、复制粘贴和保存恢复保留；旧数据未记录比例时，以当前尺寸作为首次调整的基准。右侧 Reset 恢复当前输入原图的尺寸，并保留比例锁定状态；尚未手动设定尺寸或 Reset 后，上游尺寸变化会自动跟随原图。

输入在 Enter 或失焦时提交，Escape 取消，输入过程中不反复生成图片。尺寸为正整数，小数四舍五入；空输入恢复原值，无效或超限输入保留原值并提示。每边上限 16384 像素、总像素上限 64 × 1024²。没有图片时尺寸编辑和 Reset 禁用。每次操作独立撤销，比例按钮及 Reset 上的 Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z 透传画布，尺寸输入保留原生文本撤销。

每次从原始输入本地重采样，保留透明通道；预览最多 1024 像素长边，预览容器保持目标宽高比，位图填满容器以消除预览取整产生的边缘空隙；节点高度随比例变化。下载和下游收到的 PNG 使用实际目标尺寸。参数、输入或连接变化立即使旧输出失效，过期异步结果不会写回。接受所有现有图片输出，包括 Painter 的 Result / Mask；输出可连接 Preview、图片处理节点、Compositor、Sunburst 图片/遮罩和 Image Describer。支持重命名、锁定、独立副本、剪切粘贴和 IndexedDB 保存恢复，沿用项目现有历史及素材生命周期。

尺寸规则、输出版本与剪贴板校验见 `resize.ts`；`resize.test.ts` 随 `npm test` 覆盖比例、自定义尺寸、边界、连接、输出失效及素材映射，并检查连续小尺寸取整、宽高交替调整、重新锁定、Reset、旧数据和剪贴板中的比例恢复。浏览器回归沿用现有独立测试页机制：启动 `npm run dev` 后打开 `/tests/resize.html`，`tests/resize.test.tsx` 挂载真实 Resize / Preview / File 节点，自动验证宽高、PNG 分辨率与透明区域、下游预览、Reset、键盘撤销重做、非法输入、锁定、IndexedDB 保存恢复、断开重连、替换输入及 4K 输出；另覆盖 3840 × 2160 缩小后恢复的比例、保存与撤销后的比例、细长/扁宽预览铺满以及 100 × 300 不受高度限制。页面使用独立数据和测试数据库，不读取用户工作流，也可继续手动检查连线、拖动、缩放和主题。

## Compositor 合成约定

Compositor 位于 Tools → Editing。稳定的 Background / Layer 输入映射与内部堆叠顺序分开保存；上游图片更新保留已有图层参数，普通输入断开后清除对应画面。多个端口可使用同一上游。编辑器采用 Layers / Assets、Canvas、Properties 三栏；素材可预览、搜索和拖入画布，图层菜单与底部缩放菜单支持键盘操作。画布提供八向缩放、旋转及屏幕距离吸附辅助线，支持约束方向、中心缩放与手势取消。底部还提供文本、钢笔和矩形/椭圆/三角形/星形工具：文字可双击编辑，钢笔保存可编辑的锚点和 Bézier 控制柄，新增图层共用撤销与持久化，不新增输入端口。提供变换、重排、显示/锁定、尺寸/填充与有序的 Blur、Color correction、Invert、Levels 效果，复用现有像素算法。Levels 使用 Inputs 三手柄 / Outputs 双手柄和 RGB/R/G/B 通道，中间调复用对数 Gamma 映射。

Output 是当前文档与输入共同确定的原尺寸 PNG，可供所有现有图片消费者读取，Compositor 也接受这些图片节点的输出。连接仍待处理或结果版本过期时 `imageOutput` 拒绝旧输出。节点和编辑器共用同一合成帧；效果开关等离散操作先反馈快速预览，再替换为原尺寸帧，只有原尺寸结果发布到 Output；受限效果缓存复用最近的开关组合。松手提交历史，输出和素材按现有 IndexedDB / 资源引用机制保存。复制节点保留输入素材快照，普通断线不保留旧画面。Timeline 只保存基础开关和扩展结构，不执行视频处理。详细限制、快捷键、模块入口及浏览器像素检查见 [Compositor 文档](../../../docs/compositor.md)。

Compositor 文本、形状及钢笔交互与验证入口见 [合成编辑器文档](../../../docs/compositor.md)。锚点在不同缩放下保持固定命中区，可越界调整及插入曲线点；交互草稿按帧更新，提交仍复用工作流历史与持久化。

Compositor 输出解析在每次读取中按节点与输出端口复用校验结果，环路检查独立跟踪当前路径；缓存不跨编辑、撤销或恢复复用。`compositorResolution.test.ts` 随 `npm test` 检查共享上游、输出端口区分、失效和环路；浏览器验证页同时运行 Enter 键回归。

## Blend

从 Tools → Helpers 或搜索 Blend 添加。Back 是底图，Front 是前景；Opacity（0–100%，默认 100%）控制前景透明度，Mode 默认 Normal。模式按照 Weavy 分成六组：Normal；Darken / Multiply / Color Burn；Lighten / Add / Screen / Color Dodge；Overlay / Hard Light / Soft Light；Difference / Exclusion / Divide；Hue / Saturation / Color / Luminosity。节点宽 460px，底部单行模式选择和百分比透明度，菜单支持方向键、Home / End、Enter、Escape 和外部点击关闭。

当前支持静态图片文件，不合成视频、音频或任意文档。输出尺寸以 Back 为准，Front 缩放铺满 Back；仅接 Front 时使用 Front 尺寸。空端口视为透明图层，均为空时没有输出；已连接但无有效图片时等待上游。改变设置、断开或重连会使旧输出立即失效。Result 可连接 Preview（含下载）、后续图片处理和模型图片输入。

`blend.ts` 对齐 Weavy 的线性 RGB 混合与透明合成，包括 Add 的钳制顺序、Soft Light / Divide 边界、四种 HSL 模式和透明底图行为。读取输入时使用非预乘 ImageBitmap 与 float16 Canvas，避免低 alpha 颜色精度损失；浏览器需支持 float16 Canvas。实现和差异边界详见 [Blend 核验记录](../../../docs/blend-verification.md)。不引入第三方算法依赖。

Worker 使用有界任务队列；拖动时 512px 草稿，释放时原尺寸 PNG，预览和导出使用同一公式。拖动只提交一次撤销记录，Escape 取消，锁定禁止修改。支持独立副本素材快照、剪切粘贴、IndexedDB 恢复与资源回收。算法修订号会使旧 PNG 缓存失效。

`blend.test.ts`、`blendMath.test.ts` 和 `blendWeavy.test.ts` 随 `npm test` 检查模式、全部通道输入与 alpha 对、边界、连接、失效、剪贴板、素材映射，以及 108 张实际 Weavy PNG 的独立参照。原始参照和元数据保存在 `tests/fixtures/blend-weavy.*`。

启动 `npm run dev` 后访问 `/tests/blend.html`，执行真实 Worker / PNG、4K、历史、持久化和交互验收；使用独立数据库，不读取或改写用户画布。`/tests/blend-modes.html` 将 18 种模式 × 六档透明度的真实 Worker / PNG 与 Weavy 导出逐像素对照，另核对预览。2026-10-26 完整对照已通过，详细指标与允许的量化误差见上述核验记录；历史九模式与原生 Canvas 诊断不再代表当前算法。

## Compare

从 Tools → Helpers 或搜索 Compare 添加。Slider 左侧显示 Input 1，右侧显示 Input 2；使用 [beUI Before After Slider](https://beui.dev/components/motion/before-after-slider) 的本地适配组件 `shared/BeforeAfterSlider.tsx`，保留弯曲分割线、居中圆形手柄的悬停 / 按压反馈和两侧图片标签。拖动直接跟随指针，点击图片可平滑定位；裁切和分割线按节点本地尺寸同步计算，兼容画布缩放。松开时提交一次历史记录，Escape、窗口失焦、指针取消、丢失捕获、锁定和换图取消草稿；减少动态效果时去除弯曲、缩放和定位动画。画布内不播放首次提示扫动。Reset 恢复 50%，居中时禁用；方向键微调，Shift / PageUp / PageDown 加大步长，Home / End 到两端，Escape 取消拖动。Toggle 默认显示 Image 2，按住左上角眼睛（或 Space / Enter）显示 Image 1，松开、失焦或取消时恢复；与 Weavy 的按住预览行为一致。切换模式时分割线回到中间。

预览按第一张可用图片比例布局，两张图等比例居中；仅一路可用时显示该图，无输入时显示棋盘格。左右端口分别位于 89 / 149px，每个输入只允许一条图片连线；支持两路连接同一来源，拒绝环路、锁定节点及非图片输入。两个输出分别透传原始图片，保留原生尺寸、透明度、资源标识和素材上的灰度蒙版标识（包括 Painter / MasksExtractor 的 Mask、Invert 和 Matte Grow / Shrink 输出），不导出对比拼图；模式、拖动与临时预览不改变输出。

模式和分割位置参与撤销重做与工作流保存。副本、剪切粘贴保存两路输入快照；已有连线优先于快照，上游暂不可用时不返回旧快照。支持重命名、锁定和删除，素材生命周期与 IndexedDB 复用现有机制。无模型请求或付费调用。

`compare.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 验证双输出、断开重连、递归、连接规则、剪贴板校验和素材映射。启动 `npm run dev` 后打开 `/tests/compare.html`，可在隔离画布检查 Slider / Toggle、撤销重做、主题、连线和缩放；该页使用独立测试数据库，不访问用户工作流。

## Preview 预览约定

Preview 位于 Tools → Helpers，也出现在图片输出拖到空白处的推荐菜单中。`file` 输入接受纯图片 Import、Sunburst 当前结果、Painter Result / 黑白 Mask、Crop / Blur / Invert / Levels Output 或 Color correction Result，同一个输入只允许一条连线，不接受文本或视频。输入反向拖线可创建 Import、Sunburst、Crop、Blur、Invert、Levels、Color correction 或 Painter，并选择 Result / Mask。

图片按原始比例展示，悬停显示尺寸、下载和全屏入口；双击图片也可打开共用的 FileGallery。Painter 的 Result 和 Mask 通过 `painterLivePreview.ts` 同步绘制帧，按住鼠标绘制、擦除或拖动形状时实时更新，取消笔画时同步恢复。绘制中和正式图片尚未导出时，下载与全屏入口暂不可用。实时画面仅存在内存中，不写入节点数据、历史、存储或模型输入；每笔仍在松开后提交一次。Import 图片集合可翻页查看，翻页不改变上游输出。未连接或上游未就绪时仅显示棋盘格，不显示居中图标与文字；图片加载失败时显示错误提示。断开或删除上游后立即清空，不缓存旧输出。解析入口为 `preview.ts`，连接与失效行为由 `preview.test.ts` 随 `npm test` 验证。

Preview 不运行模型、不生成新的图片素材；节点、选中图片和连线随画布保存。支持重命名、锁定、复制粘贴、删除和撤销；复制或剪切得到的独立 Preview 不携带上游连线，需重新连接图片。主题、菜单、下载和全屏复用现有节点组件。
