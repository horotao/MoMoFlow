# Flora「+ Add node」菜单参考采集

采集日期：2026-11-20。来源为当前已登录的 [Flora 项目页面](https://app.flora.ai/projects/ns783ydy5pmkn7bdt3nn68t8wd854k38) 的 Add Node 菜单，直接读取 DOM、计算样式和 SVG，并用真实鼠标悬停与数量输入核对。本文保留采集时的原始记录。后续已实现 [AddNodeMenu](../../components/add-node-menu/AddNodeMenu.tsx)，使用方式和验证范围见[快照说明](../../README.md)。

## 本次组件范围

保留搜索栏；第一组只保留 Text、Image、Video、Audio、3D；分割线后只保留 Import、Export。移除 Technique、Label、Note 和底部工具网格。菜单作为独立可复用组件，后续由快照演示入口挂载，不接入实际 MoMoFlow 画布。

| 选项 | 原版说明 | 快捷键 | 原版悬停数量控件 | 原始图标 |
| --- | --- | --- | --- | --- |
| Text | Generate and edit text | T | 有 | [text.svg](assets/text.svg) |
| Image | Generate and edit images | I | 有 | [image.svg](assets/image.svg) |
| Video | Generate and edit videos | V | 有 | [video.svg](assets/video.svg) |
| Audio | Generate and edit audio | A | 有 | [audio.svg](assets/audio.svg) |
| 3D | Import, view, and capture 3D models | 3 | 无 | [3d.svg](assets/3d.svg) |
| Import | Add media or PDFs from your computer | U | 无 | [import.svg](assets/import.svg) |
| Export | Push wired assets to a destination | X | 无 | [export.svg](assets/export.svg) |

3D 标题后有一个 6×6px 的绿色圆点，与标题间距 4px，颜色 `#71d083`。这是原页面的 New 标记。未来若给 3D 增加数量控件，应标明是产品扩展；原版没有此行为。

## 尺寸与布局

下列数值均为 CSS px，不能直接按 Retina 截图的物理像素使用。参考页面画布缩放为 85%，菜单本身仍按固定屏幕尺寸渲染。

| 部位 | 实测 |
| --- | --- |
| 外层面板 | 宽 352px，1px 边框，16px 圆角，内容裁切于圆角内 |
| 面板背景 | 半透明背景 + `backdrop-filter: blur(40px)` |
| 搜索栏 | 高 44px，左右 padding 12px，图标与输入框 gap 12px，底部 1px 分割线 |
| 搜索图标 | 14×14px；[search.svg](assets/search.svg) |
| 搜索输入 | 无边框、透明背景、padding 0；placeholder 为 Add nodes, actions, and tools |
| 清空按钮 | 24×24px，圆角 6px；空搜索时 invisible，仍预留位置；[close.svg](assets/close.svg) |
| 每组 | 四周 padding 4px；后续组顶部 1px 分割线 |
| 每行 | 高 48px，实际宽 342px，圆角 12px，左 padding 12px、右 padding 8px，gap 8px |
| 行内左侧 | `flex: 1; min-width: 0`；图标与文字 gap 8px，顶端对齐 |
| 图标容器 | 24×24px，圆角 8px，半透明填色，blur 40px |
| 行图标 | 14×14px，水平垂直居中 |
| 标题与说明 | 竖向连续排列，无额外 gap；合计高 31px，相对行顶端 8.5px |
| 文字截断 | `min-width: 0`、单行省略；数量控件出现时文字区收窄 |
| 快捷键 | 高 16px，最小宽 16px，左右 padding 4px，圆角 6px，居中 |
| 滚动区 | 搜索栏固定，下面列表独立 `overflow-y: auto`；面板高度受视口可用空间约束 |

原页面完整菜单在本次视口中高 695px，包含本次不保留的条目。按照同样的分组规则删减后，目标自然高度推算为 **399px**：外框 2 + 搜索 44 + 第一组 248 + 第二组 105。此值为推算，待组件实现后再实测。

菜单通过弹层定位；本次从左侧 Add Node 按钮打开时位于按钮右侧，面板左上角为视口坐标 `(62, 93)`。这不是组件应写死的位置。右键入口的最终锚点和视口避让需由宿主提供。

## 颜色、排版与阴影

| 用途 | 原页面值 |
| --- | --- |
| 主文字、行图标 | `#eeeeec` |
| 搜索图标、placeholder、快捷键文字、数量按钮 | `#b5b3ad` |
| 次要说明 | `#7c7b74` |
| 面板背景 | `#0000004d`，即 `rgba(0, 0, 0, .302)` |
| 边框、分割线、行悬停、图标底、快捷键底 | `#fafaf223`，即 `rgba(250, 250, 242, .137)` |
| 数量控件底 | `color-mix(in srgb, #191918 90%, transparent)` |
| 3D 新功能圆点 | `#71d083` |
| 聚焦描边 | `#b5b3ad`，1px inset ring |
| 禁用控件 | opacity `.5`，禁用鼠标事件 |

字体栈：`GeistSans, "GeistSans Fallback", ui-sans-serif, system-ui, sans-serif`。标题和搜索输入为 **14px / 17.5px，400**；说明为 **12px / 13.5px，400**；快捷键和数量为 **12px / 12px，400**；letter-spacing 为 normal。已有快照的 `components/image-prompt-node/assets/geist.woff2` 可作为后续复用候选，无需重复引入字体资源。

有效面板阴影：

```css
box-shadow:
  0 4px 6px -1px rgb(0 0 0 / .35),
  0 2px 4px -2px rgb(0 0 0 / .30);
```

截图顶部绿色光晕来自面板后方的画布内容透过半透明背景及模糊显示，不是菜单自身的绿色渐变装饰。

## 悬停数量控件

- Text、Image、Video、Audio 行悬停或带 `data-highlighted` 时，快捷键隐藏，同一行右侧显示 `− 1 +`；不是向右展开的数量子菜单。
- 行宽和高度不变，文字区域让出空间。行背景立即高亮，原行内联样式为 `transition: none`。
- 控件外壳宽 92px、高 32px，圆角 8px，padding 为 `4px 8px`。内部三个 24×24px 控件，彼此 gap 2px。
- 减号图标 10×10px，加号图标 12×12px；原始路径见 [minus.svg](assets/minus.svg)、[plus.svg](assets/plus.svg)。
- 数量是 `type="text"`、`inputmode="numeric"`、`role="spinbutton"`，居中；边框透明，圆角 8px。ARIA 标明 min 1、max 20、当前值。
- 默认 1，范围 1–20。实测点击加号变成 2，最小值禁用减号，输入 20 后加号禁用。修改数量不会创建节点，菜单仍打开。
- 每个类型单独记住当前数量：Image 设为 2 后切到 Text 显示 1，回到 Image 仍显示 2。离开该行恢复快捷键，数量留在该次菜单状态中。
- 原页面按 Tab 可进入数量输入；控件应独立处理事件，避免点加减号触发行选择。关闭菜单后的持久性、非法值规则和实际批量创建未在本轮验证。
- 原页面停留还会出现节点介绍与预览浮层；本轮只记录其存在，未把该浮层纳入数量控件，也未扩大当前七项菜单的组件范围。

## 图标来源与边界

`assets/` 中 11 个 SVG 来自此次页面 DOM 的原始路径，没有使用近似图标替代。导出时只去掉依赖原页面的 class 和无障碍属性，保留 viewBox、路径、描边和填充；显示颜色由宿主 `currentColor` 提供。Text、Image、3D、Import、Export、搜索、关闭、加减号为描边图标；Video 是带圆角连接的实心播放三角，Audio 为三条实心波形，不应换成通用视频机或麦克风图标。

本轮没有创建 Flora 节点、调用模型、修改真实画布或实现本地组件。数量核对后已恢复默认值并关闭参考菜单。后续组件验收应覆盖静止、悬停、数量边界、搜索、键盘操作及窄视口避让；本轮采集不能算组件验收。
