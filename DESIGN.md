---
title: "MoMoFlow Design System"
description: "本文件定义 MoMoFlow 的视觉与排版基础规范。所有新增界面与重构样式应严格遵循以下 Token 与规则，存量组件按模块渐进迁移。"
documentation: "design/index.html"
markdown: "DESIGN.md"
---

## Typography

### Font Families

项目统一收敛为两套字体族，定义在 [src/index.css](src/index.css)：

| Role | CSS Token | Tailwind Class | Stack |
| --- | --- | --- | --- |
| UI / Body | `var(--font-ui)` | `font-sans` | `Inter, 'PingFang SC', 'Noto Sans SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Noto Sans SC Variable', sans-serif` |
| Mono / Code | `var(--font-mono-ui)` | `font-mono` | `GeistMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` |

- 禁止在组件 CSS 中自行声明新的 `@font-face` 或手写散装字体栈（如 `GeistSans`、`FloraAddNodeGeist`、`FullscreenGeistMono` 等历史旧值）。
- 禁止使用携带硬编码字体栈的 `font:` 简写（`font: inherit` 除外）。

---

### UI Scale

工作台、工具栏、菜单、弹窗、Inspector 与节点控件**仅允许使用以下 5 档**。不再引入其他任意 `text-[Npx]` 或零散 `font-size` / `line-height` 值。

| Role | Tailwind Class | CSS Tokens (Size / Line) | Size / Line (px) | Weight | 用途 |
| --- | --- | --- | --- | --- | --- |
| Title | `text-base font-medium tracking-tight` | `--type-title-size` / `--type-title-line` | `16 / 24` | `500` | 弹窗标题、面板主标题、大号输入 |
| Body / UI (default) | `text-sm` | `--type-body-size` / `--type-body-line` | `14 / 20` | `400` 或 `500` | 默认正文、菜单项、输入框、Prompt 文本 |
| Caption / Control | `text-xs` | `--type-caption-size` / `--type-caption-line` | `12 / 16` | `400` 或 `500` | 小按钮、表单标签、Tooltip、状态与错误提示 |
| Micro | `text-micro font-medium` | `--type-micro-size` / `--type-micro-line` | `11 / 16` | `500` | 徽章、快捷键、计数器、分组小标题 |
| Mono | `font-mono text-xs` | `--type-mono-size` / `--type-mono-line` | `12 / 16` | `400` 或 `500` | 仅用于 Markdown 代码（`<code>` / `<pre>`）与快捷键（`<kbd>`） |

---

### Document / Markdown Scale（仅限节点富文本内容）

Text 节点内的 Markdown 渲染独立于 UI Chrome，保持文档阅读比例：

| Role | CSS Tokens (Size / Line) | Size / Line (px) | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Doc H1 | `--type-doc-h1-size` / `--type-doc-h1-line` | `24 / 32` | `600` | `--tracking-tight` |
| Doc H2 | `--type-doc-h2-size` / `--type-doc-h2-line` | `18 / 28` | `600` | `--tracking-tight` |
| Doc Body | `--type-doc-body-size` / `--type-doc-body-line` | `14 / 24` | `400` | `--tracking-normal` |

---

### Canvas Exception（画布缩放特例）

- 节点顶部标题（如 `.canvas-image-node .image-node-heading`）需要根据 `--canvas-zoom` 做视觉尺寸反向补偿，允许基于 `--heading-px` 计算动态字号与行高，不归入普通静态 Scale。

---

### Typesetting（中英文排版开关）

| 场景 | CSS 规则 | 作用 |
| --- | --- | --- |
| 全局默认（`body`） | `text-autospace: normal;` `font-synthesis: none;` `-webkit-font-smoothing: antialiased;` | 中英文/数字自动微间距、禁用伪粗体、暗底浅字更清晰 |
| 短标题 / 弹窗标题 | `text-wrap: balance;` | 避免多行标题末尾落单字 |
| 长正文 / Text 节点 Markdown | `text-wrap: pretty;` `line-break: strict;` `hanging-punctuation: first allow-end last;` `overflow-wrap: break-word;` | 避免孤行与中文标点落行首、引号悬挂对齐、防止长 URL 撑破容器 |
| 单行 UI 控件（菜单/节点名/按钮） | `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`（`truncate`） | 严格单行省略，避免撑破工具栏高度 |
| 动态与表格数字 | `font-variant-numeric: tabular-nums;`（`tabular-nums`） | 数值刷新不抖动、上下列对齐 |

> 注意：`text-wrap: balance / pretty` 不全局作用于 `*`（避免画布重排开销）；`hanging-punctuation` 与 `text-wrap: balance` 不用于输入框与富文本编辑器，以免干扰光标定位。

### Rules

- **字重仅限 3 档**：
  - `400`（`--font-weight-regular` / `font-normal`）：正文、输入内容、次要说明。
  - `500`（`--font-weight-medium` / `font-medium`）：标签、按钮、控件文字、UI 标题。
  - `600`（`--font-weight-semibold` / `font-semibold`）：仅用于 Markdown 标题与强调（`strong`）。
  - 禁止使用 `575`、`700` 及以上字重，禁止使用 `!important` 强行覆盖字重。
- **行高与字号强绑定**：
  - 所有默认行高对齐 4px 基线网格（`16 / 20 / 24 / 28 / 32`）。
  - 组件中不要手写独立的小数或零散行高；单行紧凑标签/快捷键（如 `kbd`、徽章）如需严格贴合文字高度，仅允许使用 `line-height: 1`（`leading-none`），通过 `height` / `padding` 与 `flex` 控制居中。
- **字距（Tracking）**：
  - 标题（`Title`、`Doc H1/H2`）使用 `var(--tracking-tight)`（`tracking-tight`）；正文与常规控件保持 `normal`。
- **动态数字与 Mono 边界**：
  - 所有 UI 数值与动态数字（画布缩放百分比、视频时间码、任务进度、积分、尺寸读数）继续使用主字体 `Inter`（`--font-ui`）配合 `font-variant-numeric: tabular-nums`（`tabular-nums`），避免数值变化时抖动且保持设计工具的统一观感。
  - `Mono`（`--font-mono-ui`）严格限定在 Markdown 代码片段与快捷键 `<kbd>`，不用于常规 UI 数字。
- **废弃清单（新增代码禁止使用）**：
  - 废弃字号：`9px`、`10px`（收编至 `11px`）、`13px`（按层级收编至 `12px` 或 `14px`）、`15px`。
  - 废弃行高：`13.5px`、`15px`、`17px`、`17.5px`、`26px`、`27px`、`1.25`。
  - 废弃字重：`575`。

---

## Colors & Surfaces

MoMoFlow 暗色界面统一以**暖炭黑 / 暖沙灰**为基底，所有表面层级、文字对比度、边框与状态色收口至 [src/index.css](src/index.css) 中的语义 Token。

### Surfaces

| Role | CSS Token | Tailwind Class | Value | 用途 |
| --- | --- | --- | --- | --- |
| Canvas | `--canvas-background` | — | `#090908` | 无限画布最底层 |
| Background / Node | `--background` | `bg-background` | `#111110` | 节点卡片底面、基础页面底 |
| Card / Panel | `--card` / `--popover` | `bg-card` / `bg-popover` | `#191918` | 弹窗、侧边栏、实底面板 |
| Overlay (Glass) | `--surface-overlay` | — | `rgb(25 25 24 / 90%)` | 悬浮工具栏、下拉菜单、Tooltip（配毛玻璃） |
| Subtle Fill | `--surface-subtle` | — | `rgb(250 250 242 / 5%)` | 极弱分区底、空态槽位 |
| Muted Fill | `--muted` | `bg-muted` | `rgb(250 250 242 / 8%)` | 次级容器填充、代码底色 |
| Control / Hover | `--accent` | `bg-accent` | `rgb(250 250 242 / 14%)` | 控件浅填充与常规 Hover 态 |
| Strong Hover | `--surface-hover` | — | `rgb(251 251 239 / 17%)` | 强调 Hover / 按下态 |

### Text & Borders

| Role | CSS Token | Tailwind Class | Value | 用途 |
| --- | --- | --- | --- | --- |
| Text Primary | `--foreground` | `text-foreground` | `#eeeeec` | 主文字、高亮图标 |
| Text Secondary | `--muted-foreground` | `text-muted-foreground` | `#b5b3ad` | 次级文案、辅助说明、默认图标 |
| Text Subtle | `--foreground-subtle` | `text-foreground-subtle` | `#7c7b74` | 占位符、禁用态、极弱提示 |
| Primary Emphasis | `--primary` / `--primary-foreground` | `bg-primary text-primary-foreground` | `#eeeeec` / `#111110` | 主操作实心按钮、激活态反白 |
| Border (Hairline) | `--border` | `border-border` | `rgb(250 250 242 / 14%)` | 面板、节点、分割线细边框 |
| Border Strong / Ring | `--border-strong` / `--ring` | `border-border-strong` / `ring-ring` | `rgb(250 250 242 / 32%)` | 输入框聚焦、键盘焦点环、强描边 |

### Status Colors

| Role | CSS Token | Tailwind Class | Value | 用途 |
| --- | --- | --- | --- | --- |
| Success | `--success` | `text-success` | `#7bcfa0` | 连接成功、生成完成、导出成功 |
| Warning | `--warning` | `text-warning` | `#e1bc7c` | 排队提醒、非致命警告 |
| Destructive | `--destructive` | `text-destructive` | `#f19797` | 错误提示、危险操作、API 失败 |

### Elevation & Glass

| Role | CSS Token | Value | 用途 |
| --- | --- | --- | --- |
| Blur Small | `--blur-sm` | `8px` | 轻量遮罩、小型悬浮徽章 |
| Blur Default | `--blur-md` | `16px` | 悬浮工具栏、下拉菜单、Tooltip（主力） |
| Blur Large | `--blur-lg` | `24px` | 顶部栏、导航栏、大型侧边浮层 |
| Overlay Shadow | `--shadow-overlay` | `0 4px 6px -1px #00000059, 0 2px 4px -2px #0000004d` | 下拉菜单、悬浮面板统一投影 |

### Content Palette（内容标记域，独立于 UI Chrome）

- 节点颜色标签（[src/nodes/colorTags.ts](src/nodes/colorTags.ts)）与分组颜色（[src/nodes/CanvasGroupNode.tsx](src/nodes/CanvasGroupNode.tsx)）属于用户数据标记色，不混入 UI 系统色板。

### Rules

- **优先使用语义 Token**：禁止在新增样式里手写裸色值或重复拼写等价色（例如用 `var(--border)` 替代 `#fafaf223` / `rgb(250 250 242 / 13.7%)`，用 `var(--surface-overlay)` 替代 `#191918e6` / `rgb(25 25 24 / .9)`）。
- **前景与背景成对使用**：`bg-primary` 必须配 `text-primary-foreground`，禁止写死 `#fff` 或 `#000`。
- **统一暖炭黑色温**：新组件不再引入纯冷灰（如 `#262626`、`#303030`、`#383838`、`#666`、`#858585`、`#e4e4e4`）与重复的组件私有颜色前缀变量。
- **模糊与阴影收口**：毛玻璃仅允许 `8px / 16px / 24px` 三档，废弃 `10.8px`、`18px`、`20px`、`40px`。

---

## Radius & Control Sizes

圆角与控件高度统一对齐 **4px 栅格**，定义在 [src/index.css](src/index.css)。

### Radius

| Role | CSS Token | Tailwind Class | Value | 用途 |
| --- | --- | --- | --- | --- |
| XS | `--radius-xs` | `rounded-xs` | `4px` | 行内 `code`、`<kbd>`、极小徽章与微缩图 |
| SM | `--radius-sm` | `rounded-sm` | `8px` | 表单输入框、常规按钮、下拉菜单行 |
| MD | `--radius-md` | `rounded-md` | `12px` | 画布工具栏内按钮、节点内子控件、嵌套卡片 |
| LG | `--radius-lg` | `rounded-lg` | `16px` | 悬浮工具栏、下拉面板、节点卡片、Toast |
| XL | `--radius-xl` | `rounded-xl` | `24px` | 大弹窗、预览大卡 |
| Full | `--radius-full` | `rounded-full` | `9999px` | 圆形图标钮、药丸开关、徽章、滚动条 |

### Control Sizes

| Role | CSS Token | Value | 用途 |
| --- | --- | --- | --- |
| XS | `--control-xs` | `24px` | 行内微图标钮、清除/折叠小操作 |
| SM | `--control-sm` | `28px` | 紧凑按钮、Toast 按钮、弹窗关闭钮 |
| MD | `--control-md` | `32px` | 画布工具栏按钮、小型按钮、紧凑菜单项（画布主力） |
| LG | `--control-lg` | `36px` | 表单输入框、默认按钮、生成主按钮（表单主力） |
| XL | `--control-xl` | `40px` | 左侧 Dock 工具按钮、全屏关闭钮、大号按钮 |

### Rules

- **同心圆角原则**：嵌套容器满足 `外层圆角 = 内层圆角 + 内边距`（如悬浮工具栏 `16px` = 内部按钮 `12px` + `4px` padding）。
- **容器高度由内容撑开**：外层工具栏、弹窗头部与列表行由「内部控件高度 + padding」自然撑开，不再手写 `34.5px`、`42px`、`45px`、`51px` 等固定高度。
- **保留极小特例**：滑块轨道 `2px`、画布缩放标题 `calc(4 * var(--heading-px))`。
- **废弃清单（新增代码禁止使用）**：
  - 废弃圆角：`3px`、`5px`、`6px`、`7px`、`10px`、`14px`、`20px`（以及混用的 `50%` / `999px`，统一用 `var(--radius-full)`）。
  - 废弃高度：`22px`、`30px`、`34.5px`、`38px`、`42px`、`45px`、`46px`、`51px`、`53px`。

---

## Optical Alignment

按钮与图标按实际笔画边缘和视觉重心对齐，默认自动补偿定义在 [src/components/ui/button.tsx](src/components/ui/button.tsx)。

### Optical Padding（图文按钮）

图标自带内留白，单侧有图标时对该侧减 `2px` 或对文字侧加 `2px`：

| 场景 | 做法 |
| --- | --- |
| 左侧图标 + 文字 | `padding-inline: 12px 14px;` 或 `has-[>svg:first-child:not(:last-child)]:pl-3.5` |
| 文字 + 右侧图标 | `padding-inline: 18px 16px;` 或 `has-[>svg:last-child:not(:first-child)]:pr-3.5` |
| 固定宽图文按钮 | 文字侧补 `padding-inline: 0 2px;` |

### Optical Centring（纯图标按钮）

不对称图标按视觉重心反向 `translate` 微调：

| 图标 | 微调 |
| --- | --- |
| `Play ▶` | `14px`: `translateX(0.75px)` / `16px`: `translateX(1px)` / `32px`: `translateX(2px)` |
| `SquarePen` | `translate(0.5px, -0.5px)` |
| `Delete` | `translateY(-0.25px)` |

### Rules

- 通用按钮用 CSS `:has()` 或 props 自动补偿，不逐处手写；用 `:not(:last-child)` / `:not(:first-child)` 排除纯图标按钮。
- 需保持文字左对齐（如原位编辑标题）时，优先缩减图标侧 `2px`。
- 亚像素（`0.25px` / `0.5px`）在 HiDPI 屏有效，1x 屏易发虚，按尺寸取舍。
