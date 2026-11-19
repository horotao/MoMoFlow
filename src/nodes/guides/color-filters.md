# 色板、调色与滤镜

查找色板编辑、色阶、像素处理与滤镜输出约定。[返回节点索引](../README.md)

## Color palette 色板约定

Color palette 位于 Tools → Editing，新建时使用 Figma 的五种预设颜色：`#4ADE80`、`#FBBF24`、`#60A5FA`、`#C084FC`、`#222222`。节点采用双列色签列表，每项显示圆形色样和 HEX；加号位于下一个网格空位，满十色后隐藏。允许重复颜色，已保存的颜色与空色板按原数据恢复。点击色签打开选色弹窗；仅悬停或键盘聚焦当前色签时，在右侧显示六点排序手柄与删除按钮；触屏始终显示这两个操作。选中调色板不打开右侧参数栏；添加、HEX 编辑、选色、删除与排序均在节点内完成。

拖动时保持原顺序，以目标色签上方或下方的细线提示插入位置，落点同时识别双列的横向位置；其他色签变暗，松开后一次性排序，拖出列表取消。节点内使用原位反馈和预加载的透明图片抑制额外的浏览器拖拽预览。手柄支持方向键、Home / End；Escape 取消排序，锁定后禁止修改。共享标题栏、更多菜单与端口复用节点组件；Image / Text 端口随节点高度变化整体保持上下居中。

节点没有输入，Image（`image`）输出 1024 × 1024 的纯色横条 PNG，不包含 HEX 和编辑控件；Text（`text`）输出大写 HEX，以 `*` 连接，顺序与画布一致。Image 可连接所有图片消费者（包括 Compositor、Preview、Sunburst 和 Image Describer）；Text 可连接 Prompt 变量、Sunburst 文本输入和 Image Describer 文本参数。连接推荐按输出端口区分类型，反向创建也支持这两个端口。空色板无图片且文本为空；改色或排序后立即使旧图片失效，导出完成才提供新图片，迟到的结果不会覆盖新状态。

每次添加、删除、排序、HEX 提交或颜色选择手势各记录一次撤销；颜色选择器拖动时先在弹窗预览，松开提交。派生图片不增加撤销记录。支持重命名、锁定、副本、剪切粘贴和 IndexedDB 恢复；颜色顺序和 PNG 素材随画布保存，素材引用复用现有生命周期。数据与纯函数见 [colorPalette.ts](../colorPalette.ts)，颜色列表和弹窗见 `ColorPaletteColors.tsx` / `ColorPalettePicker.tsx`。`colorPalette.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 检查十色上限、排序、文本、输出失效、双端口连接、剪贴板校验和素材映射。

调色板与绘图的选色弹窗共用 [shared/NodeColorPicker.tsx](../shared/NodeColorPicker.tsx)，适配 [beUI Color Picker](https://beui.dev/components/motion/color-picker) 的色块展开、拖动放大取色提示、HEX / RGB / HSL 格式切换、屏幕取色与八个预设颜色；调色板始终输出不透明六位 HEX，不显示透明度控件。面板通过固定定位 Portal 避免节点裁切，并随画布缩放、平移与窗口变化更新位置；减少动态效果时禁用形变、放大提示与预设位移。选色弹窗的 HEX 在 Enter、失焦或点击外部关闭时提交合法值；无效值与 Escape 不产生修改。弹窗及滑块上的 Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z 操作画布历史，HEX 输入框保留原生文本撤销。浏览器回归测试在 `tests/color-palette-picker.test.tsx`，沿用项目现有的浏览器测试页方式，无新增测试依赖：运行 `npm run dev` 后打开 `/tests/color-palette-picker.html`，页面自动挂载真实节点、弹窗和画布历史并报告结果，并验证选中调色板与打开选色弹窗时不出现参数侧栏。覆盖外部关闭保存、HEX 规范化、取消、重复提交、弹窗/滑块撤销重做、文本撤销与中文输入保护，以及连续编辑的历史边界；另覆盖 53% / 100% / 150% 缩放下的合成拖拽事件、预览图片加载、取消、双列横向落点及上下半区插入线、落点排序、单步撤销重做；测试使用独立状态，不读写已保存的工作流。

节点内的色样保持静态布局，节点拖动与画布移动由 React Flow 直接更新。弹窗使用 `#282828` 深灰底色，仅作用于选色面板。展开与收回由 [shared/useColorPickerMorph.ts](../shared/useColorPickerMorph.ts) 在固定定位弹出层中完成，收回目标每帧读取色样的当前屏幕位置，视图更新不重启动画；中键持续平移时也能完成收回并显示节点色样，避免被按钮裁切或留下旧选色区。所有取色器共享当前打开对象，连续切色时旧面板收回、新面板展开；快速重开会打断并反转当前动画。`/tests/color-picker-motion.html`（入口 `color-picker-motion.test.tsx`）逐帧检查两种节点在三档缩放下的可见收回路径、原位置、退出清理、连续 / 快速 / 同批次切色及收回中重开；使用合成中键事件驱动真实 React Flow 平移，检查打开中开始平移、关闭后立即平移及松键前恢复色样，`?pan-only` 单独运行这些平移用例。支持 `?reduce-motion`，使用独立节点状态。`/tests/color-picker-node-drag.html`（入口 `color-picker-node-drag.test.tsx`）在 53% / 100% / 150% 视图下逐帧比较调色板和绘图色样与按钮的位置，检查面板收回后继续拖动，并提供真实鼠标拖动的偏移量检查；支持 `?reduce-motion`，使用独立节点状态，不读写保存的画布。

原生拖拽验收页为 `/tests/color-palette-native-drag.html`（入口 `tests/color-palette-native-drag.test.tsx`），同样通过 Vite 运行且不读写用户工作流。用真实鼠标在节点中拖动，页面检查可信 `dragstart`、透传原生 `setDragImage`、已加载的 1×1 透明图片和可信 `dragend`；`Broken canvas control` 使用旧实现作负例，必须失败，`Fixed image` 应通过。分别检查 53% / 100% / 150%，拖出及 Escape 取消后顺序/历史不变，落点后节点顺序更新且可单步撤销重做。原生预览使用预加载的离屏 `HTMLImageElement`，不可用没有布局的 canvas 替代。页面的 PASS 仅代表原生调用及图片有效，浏览器页面截图不包含系统拖拽图层；大色条是否消失仍必须用系统目视或能包含该图层的录屏对照确认，不得用合成事件或页面截图代替。

## Color correction 调色约定

Color correction 位于 Tools → Editing，也出现在图片输入/输出的推荐菜单中。File 接受一张上游图片（集合取第一张），Result 输出原尺寸 PNG 并保留透明通道。在浏览器本地处理，不调用模型。曝光为 −5～5（步长 0.01），对比度、饱和度、色温、色调、高光、阴影为 −100～100（步长 1），默认均为 0。曝光在线性光空间处理，其余调节使用本地像素算法；界面参考 Weavy，不承诺与其内部算法逐像素一致。

滑块拖动实时更新节点和已连接的 Preview，松开后提交一次；Escape 或指针取消放弃当前拖动。数字输入失焦或 Enter 提交，Escape 取消；Reset 将七项全部归零。图片悬停/键盘聚焦显示左上角原图对比、右上角下载、左下角原始尺寸。按住对比按钮或在按钮上按住空格/Enter 暂时显示原图，松开恢复效果；对比不改变参数、Result 或下载内容。

拖动时，后台线程在缓存的最长边 1024 像素底图上生成轻量预览；它是交互近似，细碎纹理可能与最终结果略有差异。松手或取消后按原尺寸调色，再从同一份像素生成精确预览和原尺寸 PNG；精确预览就绪前禁用下载。拖动时只保留最新待处理参数，源图变化时终止旧线程；取消操作后的旧帧不会回写。导出未完成时禁用下载；上游变化、断开或参数变更时，下游不读取旧结果。实时预览仅在内存中，派生图片不增加撤销步骤。支持锁定、重命名、副本、剪切粘贴、撤销重做和 IndexedDB 恢复；复制/剪切保留输入底图快照。跨域图片需允许浏览器读取，失败时显示提示。

数据与像素算法见 [colorCorrection.ts](../colorCorrection.ts)，预览/导出见 [colorCorrectionRender.ts](../colorCorrectionRender.ts)，实时帧见 [colorCorrectionLivePreview.ts](../colorCorrectionLivePreview.ts)。`colorCorrection.test.ts` 随 `npm test` 验证七项调节方向、默认像素与透明通道、输出失效、连线、剪贴板及素材映射。

节点复用新版共享外框、标题栏、更多菜单、图片端口和 `NodeRangeInput` 滑块。启动 `npm run dev` 后打开 `/tests/color-correction-node-style.html`，通过隔离画布验证空状态、七项调节、撤销重做、取消、重置、原图对比、输出像素与原尺寸、锁定及下游预览；该页不调用模型，浏览器验收不属于 `npm test`。

## Levels 色阶约定

Levels 位于 Tools → Editing 和图片连线推荐菜单。Input（`image`）接收上游图片，集合使用第一张；Output（`result`）输出原尺寸 PNG，可连接所有现有图片处理节点、Preview、Sunburst 和 Image Describer。全部计算在本地浏览器完成。

节点使用共享外框、标题、更多菜单和图片端口，宽度为 456，预览宽度为 424；接图后预览高度随图片实际宽高比调整，图片完整填满棋盘格区域，未接图时预览为 424×280、节点为 456×696。悬停或选中显示 Image / Result 端口名称。界面依次为通道 / Reset、带网格的全宽直方图、输入色阶手柄与数值、黑白渐变输出标尺与数值；通道菜单在选择框下方展开，显示 RGB、红、绿、蓝，内部仍使用 RGB/R/G/B。RGB、R、G、B 各自保存独立的输入黑点、Gamma、输入白点与输出黑白点；在线性色彩空间先应用单通道、再应用 RGB 总调整，最后编码回 sRGB。输入范围 0–255，黑点不大于白点（相同值产生阈值效果）；Gamma 为 0.1–10（默认 1），大于 1 提亮中间调；输出范围 0–255，可反向或设为同值。“重置”恢复全部通道参数。直方图以相同纵轴比例叠加原图（75%）和调整结果（25%），拖动时随预览更新；RGB 使用 0.299R + 0.587G + 0.114B 的亮度分布，R/G/B 显示对应颜色分布，透明像素按 alpha 加权。256 个直方图桶以细柱绘制，原图与结果共用纵轴比例。

Gamma 滑块采用对数位置映射，向右增大并提亮；黑白点变动时中点随输入范围定位。滑块支持指针拖动及方向键，Shift 加速、Home / End 到边界；数字框 Enter / 失焦提交、Escape 取消。每次拖动只记录一次撤销；512 边长的独立线程提供拖动预览，松开后用原尺寸处理得到 PNG，再从相同像素生成最终预览。下载等待准确结果。保留透明度、原图比较、尺寸显示和 Preview 实时联动；换图、取消、锁定后拒绝迟到的结果，下游不能读取过期输出。

支持重命名、锁定、副本、剪切粘贴、撤销重做及 IndexedDB 素材恢复；独立副本保留底图。数据及像素算法见 `levels.ts`，处理线程和请求合并见 `levels.worker.ts` / `levelsRender.ts`。`levels.test.ts`、`levelsRender.test.ts` 使用现有 Node.js 内置测试运行器，随 `npm test` 验证像素映射、透明度、直方图、连线约束、输出失效、素材保存和请求取消。`tests/levels-node-style.html` 是独立浏览器验收入口（启动 Vite 后访问），验证 Figma 尺寸、素材、通道菜单、真实图片输出、数值与键盘操作、撤销重做、锁定和下游预览；不调用模型。

## Invert 反选约定

Invert 位于 Tools → Editing 和图片连接推荐菜单。Input（`image`）接收上游图片或 Painter 的黑白 Mask，图片集合取第一张；Output（`result`）输出原尺寸 PNG，可连接 Preview、其他图片处理节点、Sunburst 图片/遮罩输入和 Image Describer。在浏览器本地按 `255 − RGB` 反色，黑白遮罩互换黑白，保留灰度软边与透明通道；普通彩色图片输出反色图片，不强制二值化。

Invert Output 接入 Sunburst Mask 时，仅在请求准备阶段将完全不透明的遮罩按亮度转换为透明 PNG：白色为透明编辑区域，黑色为不透明保护区域，灰色保留部分透明的软边。已有透明区域的遮罩沿用原透明通道。转换不改变 Invert 素材、预览、下载或其他下游图片输入；原图仍须另接 Sunburst Image，遮罩仍须与第一张原图尺寸一致且存在透明区域。`sunburstRun.ts` 在任务快照中标记转换方式，`sunburstClient.ts` 在本地完成转换和校验，不向服务端发送该标记；`invert.test.ts` 和 `sunburstClient.test.ts` 随 `npm test` 验证这条路径、软边、取消及已有透明遮罩兼容性。

图片按原比例展示，无需额外参数或运行按钮。悬停或键盘聚焦时，左上角显示隐藏效果按钮：点击切换原图，再点击恢复反选；此对比仅影响当前预览，不改变 Output 和下载内容。右上角下载反选 PNG，左下角显示原始像素尺寸。未连接或上游未就绪时显示棋盘格，处理完成前禁用下载；输入变化、断开或删除后不显示或传递旧结果，导出回写前检查当前连接和锁定状态。

支持重命名、锁定、副本、剪切粘贴、撤销重做及 IndexedDB 保存恢复；独立副本保留输入底图，派生结果不增加撤销步骤。核心像素算法和数据在 `invert.ts`，界面与导出在 `InvertNode.tsx`。`invert.test.ts` 随 `npm test` 验证黑白/灰度/透明像素、Painter Mask 输入、连线限制、链式失效和素材恢复。

## Blur 模糊约定

Blur 位于 Tools → Editing 和图片连接推荐菜单。Input（`image`）接收一张上游图片，集合取第一张；Output（`result`）输出原尺寸 PNG，可连接 Preview、Painter、Crop、Color correction、Blur、Sunburst 和 Image Describer。类型为 Box / Gaussian，Size 为 1–100 的整数，初始 Gaussian / 50；Size 1 保持原图。图片悬停显示按住查看原图、下载和尺寸。

本地后台线程处理图片，不调用模型。Box 使用可分离均值滤波；Gaussian 使用按高斯函数采样、截断至 4σ 并归一化的可分离卷积（σ = (Size − 1) / 3），不再使用 Box 近似。Size 控制模糊强度，不承诺与 Weavy 内部算法逐像素一致。预乘透明度后滤波，边界使用最近边缘像素，避免透明区域的隐藏颜色渗入。Gaussian 拖动时在独立线程的最长边 512 像素底图上进行高斯卷积，并按比例缩放 σ；原尺寸任务不会阻塞这条交互队列。Box 保持最长边 1024 的拖动预览。连到 Preview 时同步显示；松开后从同一份原尺寸处理像素生成最终预览和 PNG，下载在最终结果就绪后才启用。Gaussian 输出版本变化会使旧近似结果失效并重新计算。

数字输入失焦或 Enter 提交，Escape 取消；一次滑块拖动只提交一个撤销步骤。取消、换图或锁定使旧处理帧失效；导出尚未完成时禁用下载，下游不读取过期结果。支持锁定、重命名、副本、剪切粘贴、撤销重做与 IndexedDB 保存恢复，独立副本保留底图。算法与数据在 [blur.ts](../blur.ts)，线程在 [blur.worker.ts](../blur.worker.ts)，排队与实时预览在 `blurRender.ts` 和 `blurLivePreview.ts`。`blur.test.ts` 与 `blurRender.test.ts` 使用现有 Node.js 测试运行器，随 `npm test` 验证像素、透明边缘、连线、失效输出、素材恢复和请求合并。
