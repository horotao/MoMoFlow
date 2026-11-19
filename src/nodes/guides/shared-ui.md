# 节点外观与共享控件

修改节点标题、外框、端口、滑块或图片查看器时查阅。[返回节点索引](../README.md)

## 标题、图标与主题

画布节点的默认标题使用中文，自定义名称与导入文件名保持原样；模型品牌名（如 GPT Image 2.6）保留英文。标题与重命名框使用相同默认文案，界面字体通过 `--font-ui` 统一引用：全局字体栈优先使用 Inter、苹方及 Noto Sans SC 等中文回退字体；新版 `.node-frame` 在局部覆盖为 Inter / Noto Sans SC Variable，具体作用域见下方共享视觉约定。

节点标题与侧栏卡片共用 [nodeIcons.ts](../nodeIcons.ts) 中的共享图标映射（通用节点使用 Hugeicons Stroke Rounded）；使用该映射的标题通过 [NodeIcon.tsx](../NodeIcon.tsx) 渲染并保留各节点原有尺寸；部分节点直接使用 Hugeicons 或下文列出的 Figma 原始 SVG。修改节点图标时更新共享映射，避免两处显示不一致。Seedream 复用菜单原有的 Jimeng 品牌图标；Nano Banana 与 Ideogram 4.5 使用 [modelBrandIcons.ts](../modelBrandIcons.ts) 中从 Weavy 对应模型卡片同步的原始 SVG 路径；Nano Banana 保留品牌紫色，Ideogram 随主题文字颜色变化，节点库、标题与设置面板共用同一图标。Router 仍根据输入内容切换文本、图片 / 蒙版、视频、音频、3D 或文件图标，未连接时使用路由图标。

应用仅支持深色模式；不再提供浅色切换、制作或验收。历史画布中的浅色设置读取时按深色处理，重新保存时写入深色设置，节点、连线和素材内容不变。图片操作按钮为 24×24px、8px 圆角，默认透明，悬停背景按 Figma 使用 10% 白色（`rgba(255,255,255,0.1)`）。

## 外框、端口与选区

新版节点视觉基础位于 [shared/NodeFrame.tsx](../shared/NodeFrame.tsx) 和 [shared/nodeStyle.css](../shared/nodeStyle.css)：`NodeFrame` 与 `NodeHeader` 共用外框、标题栏、颜色和尺寸变量，各节点通过局部样式设置差异。[shared/NodePort.tsx](../shared/NodePort.tsx) 管理端口与标签布局，[shared/NodeOptionsMenu.tsx](../shared/NodeOptionsMenu.tsx) 和 [shared/NodeMenu.tsx](../shared/NodeMenu.tsx) 提供菜单外观、键盘导航与共用悬停高亮。

Text、图像描述、绘图、图片模型、文件导入及其他已接入的工具节点使用共享外框；四个图片模型与导入节点宽 456px、内边距 15px，保持 424px 图片内容宽度。四个图片模型直接共用 [SunburstNode.tsx](../SunburstNode.tsx) 导出的 `ImageGenerationNode` 的外框、端口、预览、画廊、悬停操作和运行按钮；模型品牌图标、输入数量、参数与运行逻辑仍由各自组件提供。图片迭代通过 `FileNode` 复用新版共享外框、端口和图库，保留迭代器专用内容与行为。共享外框内使用 Inter / Noto Sans SC Variable，字体覆盖限定在 `.node-frame` 内。

图像描述复用 Text 的外框、标题栏、更多菜单和文本内容区样式，宽 454px、内边距 14px，空状态高 403px；底部提供添加图片输入与运行模型，进度和取消复用图片模型的 `ModelRunButton`。Text 与图像描述的标题、更多、加号、运行、下拉箭头与文本端口使用 `public/node-style/` 中的 Figma 原始 SVG。GPT 与导入的图片操作图标、品牌图标、棋盘格和媒体端口使用 `public/image-node/` 中的 Figma 原始 SVG，作为设计还原的例外；节点库图标映射不变。

可运行图片模型的运行按钮固定为 98px 宽，「运行模型」沿用与图像描述节点相同的界面字体。运行时进度数字使用本地 DM Mono，填充与数字读取临时任务状态，仍支持取消；Figma 的循环动画仅是演示，不作为运行进度来源。空 Text 节点保留 `variable-1` 输入端口，添加变量后沿用相同端口；变量显示控件在存在变量时出现。`TextNodeMenu` 继续复用原有节点操作，`appearance="shared"` 只切换表现层。

用选择工具从画布空白处拖动时，和直角选框相交的节点即时高亮。松手后，多选外框与所选节点的整体边界相距 3 个屏幕像素。端口圆盘盖住经过的描边，整个圆盘可响应拖线。可从外框或框内空白处拖动整组，按 Esc 清除选中。灰白选框样式由主画布与 `/tests/canvas-selection.html` 共用。

反相、裁剪和模糊也使用新版共享外框、标题、更多菜单与图片端口，宽 456px、图片区域宽 424px。反相沿用预览节点的图片样式；裁剪保留选区与外侧拖动手柄，图片和遮罩单独裁切圆角；模糊复用色彩校正的参数行和 `NodeRangeInput` 滑条，类型与裁剪比例复用已有下拉菜单。图片处理、端口 ID 和保存数据不变。

## 单值滑块

所有单值参数滑块共用 [shared/NodeRangeInput.tsx](../shared/NodeRangeInput.tsx)，基于已验收的 [Arc Elastic Slider](https://uiarc.dev/components/elastic-slider) 接入边界拉伸回弹、拖动数值标签和双向参数的零点吸附。色彩校正、模糊、蒙版扩缩、混合、绘图参数、合成器的颜色面板与效果参数均复用它；绘图 / 调色板的颜色面板使用下述 beUI 专用滑块，色阶的多手柄轨道、图片对比的分隔线和二维选色区域保留专用交互。

`NodeRangeInput` 接收数值回调：`onValueStart` 开始草稿，`onValueChange` 实时更新，`onValueCommit` 松手或键盘调节时提交，`onValueCancel` 放弃草稿。`resetKey` 在换图或更换编辑对象时取消未完成手势。无草稿管线的连续控制只传 `onValueChange`，取消时恢复起始值。锁定须显式传入 `disabled`（原生 fieldset 不会禁用自定义滑块）。控件不写入工作流；数字输入、范围、步长和颜色渐变由使用处维护。方向键微调、Shift / PageUp / PageDown 大步调节、Home / End 到边界；键盘不播放位移，减少动态时去除拉伸和标签摆动。指针位置按实际轨道尺寸换算，兼容画布缩放；数字框失焦先完成提交，再开始拖动。验证入口为 `/tests/node-range-input.html`；`/tests/node-range-nodes.html` 另验真实色彩校正、模糊与蒙版扩缩的草稿、输出、下游预览、历史和锁定。沿用 React 浏览器断言，无新依赖。

## 文件导入与图片查看器

悬停时显示边缘阴影和工具栏的图片预览统一使用 [shared/imageOverlay.css](../shared/imageOverlay.css)。移入时上下渐变先淡入 80ms，顶部操作和底部尺寸随后淡入，整段移入为 500ms，工具栏沿边缘移动 2px。移出统一用 400ms，反向移动指针时从当前进度继续。键盘聚焦直接显示工具栏，触屏始终提供操作入口，减少动态效果时即时显隐。`/tests/image-hover-motion.html` 使用真实节点与本地浅色样图对照淡入顺序。

文件导入的单图和瀑布流图片可双击打开大图，单图区域使用节点的拖动光标，按住图片可直接移动未锁定节点；单击瀑布流图片只选择当前图片，图片从画布缩略图展开。文件导入、图片生成和预览节点的全屏按钮使用同一个图片查看器。查看器支持下载、缩放和翻页，键盘可用 Enter 或空格打开、方向键翻页。按 Esc 或点关闭按钮时，默认缩放下的大图会缩回可见的画布缩略图；关闭后焦点回到打开预览的位置。拖动缩略图到空白画布仍可拆分为独立文件节点。

## 媒体与文本节点测试入口

`/tests/media-node-style.html` 是 GPT、Nano Banana、Ideogram 与文件导入的独立浏览器验收入口，使用 React、真实 React Flow 及浏览器断言，覆盖外框尺寸、真实图片比例、双图/四图瀑布流、文件图片单击不展开与双击展开、键盘操作、全屏、等宽进度与取消。运行 `npm run dev` 后打开该页面；仅使用本地 Figma 示例素材，不读取用户画布或调用模型，类型检查包含在 `npm run check` 中。

`/tests/text-node-style.html` 是独立的 Text 样式与交互验收入口，使用真实画布与隔离存储，不调用模型、不读写用户工作流；检查尺寸、资源、编辑、变量三种显示、菜单和锁定。先运行 `npm run dev`，再在浏览器打开该页面；浏览器验收不由 `npm test` 执行，类型检查包含在 `npm run check` 中。
