# Image Prompt 节点组件快照 v1

保存于 2026-11-20，已在快照内拆分为可复用的 React 组件。原始独立测试页和真实画布均未改动。

## 文件

- [ImagePromptNode.tsx](components/image-prompt-node/ImagePromptNode.tsx)：完整节点，包含默认工具栏、输入区、底部操作、端点动效和提示。
- [ImagePromptToolbar.tsx](components/image-prompt-node/ImagePromptToolbar.tsx)：可独立使用的顶部工具栏。
- [ImagePromptGeneration.tsx](components/image-prompt-node/ImagePromptGeneration.tsx)：节点已引用的生成扫光、进度填充与完成衔接；详见[生成状态说明](GENERATION.md)。
- 生成后的底部编辑框、长文本及再次生成：见[结果编辑框说明](RESULT-COMPOSER.md)。
- [ImagePromptHistory.tsx](components/image-prompt-node/ImagePromptHistory.tsx)：底部缩略图的默认堆叠、悬停展开与选中切换；见[缩略图动效说明](HISTORY.md)。
- [ImageConnections.tsx](components/image-connections/ImageConnections.tsx)：白色虚线拖线、兼容端口吸附、灰色已连接线及悬停端口反馈；见[连线说明](CONNECTIONS.md)。
- `components/image-prompt-node/`：组件所需的局部 CSS、字体、图标及内部 Hook；复用时整文件夹复制。
- [演示入口](tests/image-prompt-node.tsx)：页面挂载、点阵背景和居中布局，仅用于预览。导入组件不会自动挂载页面。
- `evidence/`：浏览器核验截图；`SHA256SUMS.json`：本快照的文件校验值。

## 预览

在 MoMoFlow 项目运行 `npm run dev`，打开：

- 节点：`/tests/snapshots/image-prompt-node-2026-11-20-v1/tests/image-prompt-node.html`
- 单独工具栏：上述地址加 `?toolbar`
- 非受控节点：上述地址加 `?uncontrolled`
- 添加节点菜单：上述地址加 `?addnode` 可直接预览；关闭后通过右键空白处打开，默认节点预览也支持此入口。
- 持续生成态：上述地址加 `?generating`；加 `&elapsed=6` 可从第 6 秒开始观察。
- 完成态：上述地址加 `?complete`。缩放观察可追加 `scale=.85` 或 `scale=1.5`，查询参数之间用 `&` 连接。
- 连线：上述地址加 `?connections`，左侧完成图片可连接右侧 Image 的图片输入；加 `&wired` 直接显示已连线状态。原单节点入口保持可用。

默认演示由父页面管理提示词、数量、选中和锁定状态，用于验证组件回调。页面不读写真实画布，不调用模型。

输入提示词后点击发送可运行约 26 秒的本地生成演示，不发送模型请求。生成状态的 API、颜色、时间参数、预览和本轮验证记录见 [GENERATION.md](GENERATION.md)。

## 复用节点

依赖现有的 `react`、`react-dom` 和 `@radix-ui/react-tooltip`，没有新增依赖。图标、字体和 CSS 均通过组件内的相对路径引用，不依赖项目 `public/`。

```tsx
import { ImagePromptNode } from './components/image-prompt-node/ImagePromptNode';

<ImagePromptNode />
```

不传状态参数时组件自行管理状态。需要由父组件保存时，使用对应的受控参数和回调：

```tsx
<ImagePromptNode
  prompt={prompt}
  onPromptChange={setPrompt}
  quantity={quantity}
  onQuantityChange={setQuantity}
  selected={selected}
  onSelectedChange={setSelected}
  locked={locked}
  onLockedChange={setLocked}
  onGenerate={({ prompt, quantity }) => handleGenerate(prompt, quantity)}
/>
```

同一实例使用期间保持受控或非受控模式一致。非受控初值可使用 `defaultPrompt`、`defaultQuantity`、`defaultSelected`、`defaultLocked`；数量范围为 1–20 的整数。

标题、模型名、比例和建议文字分别由 `title`、`modelLabel`、`aspectRatio`、`suggestion` 设置。`onMention`、`onDictate`、`onEnhance`、`onPromptInput`、`onImageInput`、`onAddConnectedNode` 只向父组件报告操作，默认没有外部服务或画布行为。点击组件之外取消选中由父容器处理，演示入口中有示例。

节点默认包含已还原的工具栏及出现/退出动效。传 `toolbar={null}` 可隐藏；传 `toolbar={<ImagePromptToolbar ... />}` 可替换为自行配置的工具栏。

## 单独复用工具栏

```tsx
import { ImagePromptToolbar } from './components/image-prompt-node/ImagePromptToolbar';

<ImagePromptToolbar
  modelLabel="GPT Image 2.6 Sunburst"
  defaultAspectRatio="1:1"
  locked={locked}
  onLockedChange={setLocked}
  onToolsClick={handleToolsClick}
/>
```

工具栏内置 Flora 模型选择和画面比例菜单，状态支持受控或非受控使用，不发起模型请求。支持模型、比例、工具、标签和下载按钮回调；已移除添加到素材与评论入口及对应回调。下载按钮紧邻色板（标签）按钮，中间和右侧没有分割线；下载默认禁用，由 `downloadDisabled` 配置。独立使用时由宿主决定位置与显隐；放入节点时沿用节点的悬停与选中动效。

组件 CSS 仅限定在节点、工具栏、模型菜单和提示的类名内，不重置宿主页面的 `body`、全局按钮或背景。复制时保留整个组件文件夹及资源，不要只复制 TSX。

## 已保留的表现

384px 节点、左右端点及磁吸动效、顶部工具栏过渡、建议文字扫光、长文本滚动和底部渐变、描边内侧裁切、数量大于 1 时固定展开、滚动条拖动抓手、底部按钮提示及减少动态效果。

这是可复用的样式组件快照，包含独立的前端连线原型，尚未接入真实画布连接协议、持久化或模型服务。

## 本轮验证

浏览器通过实际 DOM 与输入事件模拟，对照原始测试页核对了节点、标题、卡片、输入区、建议文字、工具栏、底部操作与左右端点的尺寸、字体、内边距和边框；复验了受控及非受控输入、Tab 建议、数量固定展开、锁定回调、工具栏进出、长文本滚动与裁切、抓手光标、提示与减少动态效果。独立工具栏页面没有挂载节点，锁定回调仍可使用，组件没有重置页面字体或背景。

组件预览见 [节点截图](evidence/components-node.jpg) 和 [独立工具栏截图](evidence/components-toolbar.jpg)。自动检查入口为项目的 `npm run check`；这里的浏览器场景单独运行，没有进行真实画布或真实模型验收。

## 模型二级菜单（2026-11-20）

点击工具栏最左侧模型按钮打开菜单。复刻 Flora 原页面的 384px 面板、搜索、开关、置顶与推荐分组、模型行、预计耗时和能力图标；按要求移除了花朵费用标记。列表只展示 Nano Banana 2 / 2.1 / Pro、GPT Image 2.6 Sunburst 与 Seedream 5.5；图标从参考页面原始 SVG 导出，Google、OpenAI 与 ByteDance 品牌图标也来自该页面，没有新增图标库或替代素材。对应文件是 `ImagePromptModelMenu.tsx`、`imagePromptModels.ts` 和 `image-prompt-model-menu.css`。

模型名和耗时沿用参考页面，菜单提示与模型说明已翻译为中文，仅用于组件样式演示，并非 MoMoFlow 渠道能力、价格或实时估算。自动选择和多模型开关目前只管理组件状态，不运行自动路由或并行生成。

`ImagePromptToolbar` 与默认节点均支持 `modelSelection` / `onModelSelectionChange`，结构为 `{ modelIds, autoSelect, multiple }`。非受控初值使用 `defaultModelSelection`，默认选择 `gpt-image-2-6`。ID 列表见 `imagePromptModels.ts`。选择后默认同步按钮和节点标题旁的模型信息；显式传入 `modelLabel` 时以宿主提供的展示文字为准。置顶保留于工具栏实例内，刷新后恢复初始状态。菜单通过 portal 定位到按钮旁，靠近视口边缘时调整位置并独立滚动。锁定时禁用模型选择。

浏览器输入事件核对了搜索及无结果状态、清空、键盘方向键与 Enter 选择、单选关闭与焦点返回、多选保留菜单、自动选择与多选互斥、置顶切换、Escape 与点击外部关闭，以及节点内模型信息同步和锁定。另在 360px 视口及减少动态效果设置下核对了面板边界和列表滚动。检查在此组件预览入口进行，未接入实际主画布或调用真实模型。

## 信息图标提示

模型菜单中的「自动选择模型」「使用多个模型」「已置顶模型」「推荐模型」信息图标提供中文提示，由 `ImagePromptInfoTip.tsx` 复用项目已有 Radix Tooltip 实现。提示使用原页面相同的半透明背景、12px 圆角、12px 字号和淡入淡出；保留原版信息图标。鼠标悬停或键盘聚焦显示，提示通过 portal 避免被菜单裁切，接近视口边缘时自动避让。Escape 先关闭提示，再次按下关闭菜单。提示图标与开关是独立控件，点击图标不会切换设置；点击设置文字或开关仍可切换。减少动态效果时取消提示动画。

本轮在组件预览中核对了悬停、键盘聚焦、中文提示、Escape 和开关隔离；没有涉及实际画布或真实模型调用。

## 添加节点菜单

独立组件位于 [AddNodeMenu.tsx](components/add-node-menu/AddNodeMenu.tsx)，样式、11 个原始 SVG 和字体均包含在 `components/add-node-menu/`，复用时复制整个文件夹。按 Flora 实际页面还原 352px 宽、16px 圆角、48px 选项行、半透明黑底及背景模糊；界面已翻译为中文，仅保留文本、图片、视频、音频、3D，分割线下为导入、导出。搜索提示、无结果提示、数量控件标签和演示回调文字也使用中文，原始图标和快捷键不变。原始参数见[采集资料](tests/flora-add-node-reference/README.md)。

```tsx
import { AddNodeMenu } from './components/add-node-menu/AddNodeMenu';

// position 是右键位置的视口坐标；关闭时卸载菜单。
{position && <AddNodeMenu
  position={position}
  onSelect={({ type, quantity }) => handleAdd(type, quantity)}
  onClose={restoreFocus => {
    setPosition(null);
    if (restoreFocus) canvasRef.current?.focus();
  }}
/>}
```

`onSelect` 返回 `{ type, quantity }`，type 为 `text | image | video | audio | 3d | import | export`。Text、Image、Video、Audio 在悬停或键盘聚焦时显示 1–20 的数量控件，分别记住该次打开期间的数量；3D、Import、Export 沿用原版无数量控件，返回数量 1。点击加减或编辑数量不会触发行选择。触屏环境直接显示数量控件。搜索按标题及说明过滤，支持清空及无结果状态。

支持方向键、Home / End、Enter / 空格、七个字母或数字快捷键、Escape、点击外部关闭和焦点返回；搜索输入中按键用于正常输入。选项上按右方向键进入数量，输入中上下键增减、Home / End 到边界、左方向键返回选项。弹层使用 portal 和屏幕坐标，独立于节点缩放，自动避让视口边缘并允许列表内部滚动。没有添加额外进出动画。

演示入口由 [AddNodeMenuPreview.tsx](tests/AddNodeMenuPreview.tsx) 挂载：通过右键空白处打开，没有可见的添加按钮；打开、右键定位、关闭和回调由宿主管理，选择后左下角显示中文类型与数量，Escape 或选择后焦点返回画布预览。组件只报告创建请求，尚未接入真实画布或实现其他六类节点；不读写画布存储，不发送模型请求。没有复刻节点介绍预览浮层或第二套右键菜单。

本轮在独立浏览器存储的快照预览中核对了实际尺寸、七项范围、原始图标、悬停数量、加减与输入边界、各行独立状态、搜索与无结果、清空、键盘选择、关闭与焦点返回、右键定位、窄视口滚动及缩放不影响菜单尺寸。浏览器检查使用实际 DOM 与输入事件模拟，未进行真实主画布、生产或真实模型验收。预览截图见[悬停数量状态](evidence/add-node-menu-hover.jpg)。

中文化后另核对了中文搜索及无结果提示、数量控件、中文类型回调、右键重新打开、点击外部关闭和焦点返回画布。中文输入法组合输入期间按 Enter 不触发行选择；字母快捷键与英文类型搜索仍保留。

## 画面比例菜单

点击工具栏比例按钮打开，按 Flora 原页面复刻 224px 宽、16px 圆角、40px 选项行及四个分组：自动、正方形（1:1）、横向（21:9、16:9、4:3、3:2）、纵向（2:3、3:4、9:16）。自动图标直接导出原页面 SVG，其他比例矩形沿用原页面的尺寸、圆角和缩放方式；没有替换图标。菜单空间充足时高 498px，空间不足时独立滚动并避让视口边界。

`ImagePromptToolbar` 和默认 `ImagePromptNode` 均支持 `aspectRatio` / `onAspectRatioChange` 受控用法，非受控初值使用 `defaultAspectRatio`（默认 `1:1`）。自动比例值为 `auto`，显示「自动」。选择后回写按钮、关闭菜单并返回焦点；再次打开会定位到已选项。支持方向键、Home / End、Enter / 空格、Escape 与点击外部关闭；Tab / Shift+Tab 关闭菜单并移到相邻工具栏按钮。模型和比例菜单互斥打开。锁定时禁用比例入口。组件仅报告比例选择，尚未对接模型运行参数或调整节点尺寸。

实现位于 `ImagePromptAspectRatioMenu.tsx`、`imagePromptAspectRatios.ts` 和 `image-prompt-aspect-ratio-menu.css`。在独立工具栏和节点预览中核对了几何尺寸、比例回写、选中恢复、键盘操作、自动比例、滚动、菜单互斥、360px 窄屏边界和锁定；没有调用真实模型或改动实际主画布。
