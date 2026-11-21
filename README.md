![](https://github.com/xyflow/web/blob/main/assets/codesandbox-header-ts.png?raw=true)

# React Flow starter (Vite + TS)

MoMoFlow 的统一质量检查入口为 `npm run check`，开发时可用 `npm run check:quick`。
本地和 CI 使用 `.nvmrc` 指定的 Node.js 24；检查覆盖范围、Codex Hook 启用与浏览器验收说明见 [代码质量检查](docs/code-quality.md)。

We've put together this template to serve as a starting point for folks
interested in React Flow. You can use this both as a base for your own React
Flow applications, or for small experiments or bug reports.

**TypeScript not your thing?** We also have a vanilla JavaScript starter template,
just for you!

## Getting up and running

You can get this template without forking/cloning the repo using `degit`:

```bash
npx degit xyflow/vite-react-flow-template your-app-name
```

The template contains mostly the minimum dependencies to get up and running, but
also includes eslint and some additional rules to help you write React code that
is less likely to run into issues:

```bash
npm install # or `pnpm install` or `yarn install`
```

Vite is a great development server and build tool that we recommend our users to
use. You can start a development server with:

```bash
npm run dev
```

While the development server is running, changes you make to the code will be
automatically reflected in the browser!

## Things to try:

- Create a new custom node inside `src/nodes/` (don't forget to export it from `src/nodes/index.ts`).
- Change how things look by [overriding some of the built-in classes](https://reactflow.dev/learn/customization/theming#overriding-built-in-classes).
- Add a layouting library to [position your nodes automatically](https://reactflow.dev/learn/layouting/layouting)

## Resources

Links:

- [React Flow - Docs](https://reactflow.dev)
- [React Flow - Discord](https://discord.com/invite/Bqt6xrs)

Learn:

- [React Flow – Custom Nodes](https://reactflow.dev/learn/customization/custom-nodes)
- [React Flow – Layouting](https://reactflow.dev/learn/layouting/layouting)

## UI 组件配置

项目保留 React 18，已配置 Tailwind CSS 4、shadcn/ui（neutral 主题）和 React Flow UI。
此次依赖安装使用 npm，以 `package-lock.json` 为准；原有 pnpm 锁文件未同步。

界面字体统一使用 `src/index.css` 的 `--font-ui`：英文为随项目提供的 Inter，macOS 中文优先使用苹方（PingFang SC），Windows 中文使用 Noto Sans SC／思源黑体。`@fontsource-variable/noto-sans-sc` 提供随应用构建的字体分片，未安装字体时按需加载，无需访问外部字体服务。新增界面样式请复用 `var(--font-ui)` 或继承字体。侧边栏使用中文名称，并保留原英文名称的搜索匹配。

底部 Dock 已移除，选择与抓手使用左侧 Dock 或 V / H；撤销与重做使用 Ctrl / ⌘ Z 和 Ctrl / ⌘ Shift Z，画布缩放仍支持滚轮与触控板。

左侧加号、空白画布右键和拖线后的创建入口共用 Image 菜单。选择与抓手工具支持 V / H，更多菜单提供 API 设置和网格对齐。

画布与左侧 Dock 的颜色参考 FLORA 深色外观：画布底色 `#090908`，Dock 使用 90% 不透明的 `#191918`，图标区分暖灰默认态与灰白选中态。点阵在 100% 缩放下间隔 32px、直径 1px，随画布一起缩放；网格对齐沿用同一套间距。

左下角缩放工具栏和小地图沿用 FLORA 的暖灰边框、文字与交互状态色，使用 30% 不透明的黑色背景。缩放工具栏距画布边缘 8px，采用 16px 外圆角、32px 按钮和 4px 内边距；比例仍可直接输入，小地图保留点击定位、拖动与滚轮缩放。

小地图展开后内区为 186×105px，缩放工具栏居中悬浮在上方，间隔 8px。桌面端悬停地图或工具栏时显示控件，离开后隐藏；键盘聚焦时保持显示，触屏上始终显示。小地图可用方向键平移视野，Esc 收起并把焦点返回展开按钮。

- `components.json`：shadcn 配置，`@/` 映射到 `src/`。
- `src/index.css`：Tailwind、React Flow 样式、主题变量和现有画布样式。
- `src/lib/utils.ts`：组件共用的 `cn()` 样式合并工具。
- `src/components/base-node.tsx`：React Flow UI 官方 Base Node 及其标题、内容、页脚组件。
- `src/components/ui/button.tsx`：shadcn Button，保留 React 18 的 `forwardRef` 接口，阴影类适配 Tailwind 4。
- 用 [AnimatedToastStack](src/components/ui/AnimatedToastStack.tsx) 显示通知，用 [useAnimatedToastStack](src/components/ui/useAnimatedToastStack.ts) 管理通知。将 `toasts` 和 `dismissToast` 分别传给组件的 `toasts` 和 `onDismiss`，需要反馈时调用 `showToast({ status, title, description })`。画布的模型运行通知使用 `position="top-center"` 和 `placement="fixed"`，标题简述结果，描述说明原因或下一步。[beUI 组件示例](https://beui.dev/components/motion/animated-toast-stack)

组件源码已添加，可在新节点和界面中按需使用；现有节点外观和连接交互保持不变。
画布的深浅色按钮同时切换根元素的 `dark` 类，使后续 shadcn 组件使用同一主题。

继续添加组件：

```bash
npx shadcn@latest add https://ui.reactflow.dev/labeled-handle
npx shadcn@latest add dialog
```

添加后需核对 React 18 兼容性，尤其是引用传递应使用 `forwardRef`，不能直接采用仅适用于 React 19 的 ref 参数写法。
React Flow CSS 通过 `src/index.css` 中的 `layer(base)` 在 Tailwind 之后加载，
现有画布样式也放在同一层，避免破坏 React Flow 深色主题的优先级。

验证命令：`npm run lint`、`npm run build`。手动检查拖动、坐标更新、双向拖线创建节点、
普通连线、主题切换、缩放及小地图。

## BYOK API 设置

左侧 Dock 的“更多 → API 设置”支持 OpenAI、APIMart 与 DeepSeek，按渠道保存 Base URL 与 API Key。清空当前渠道的 Key 后保存，本地开发服务会使用 `.env.local` 中的对应默认 Key。保存的配置在下一次模型请求开始时生效，密钥独立于画布与工作流数据保存。

“测试连接”检查当前填写的配置。OpenAI / DeepSeek 读取模型列表，APIMart 读取令牌余额。连接检查不创建生成任务。取消弹窗或修改输入会中止本次检查。

BYOK Base URL 支持公开 HTTPS 网关。服务端校验并固定 DNS 解析结果，阻止本机或内网目标及重定向。

### Vercel 部署（BYOK）

仓库根目录的 `vercel.json` 同时构建 Vite 前端与 `api/[...path].ts` 模型接口。使用 `vercel deploy --environment preview` 发布预览；安装使用 `npm ci`；运行时使用 Node.js 24。接口复用本地请求校验、模型处理及 BYOK 网关校验。

线上仅使用用户在「更多 → API 设置」中填写的 API Key，不读取服务端默认密钥；连接测试同样需要填写 Key。`.vercelignore` 排除本地环境文件，部署时不要上传 `.env.local` 或配置共享模型密钥。接口仅接受 Vercel 提供的部署域名及对应 HTTPS Origin，用户配置仍保存在各自浏览器中。

函数最长运行 300 秒，平台请求和响应大小限制为 4.5 MB（包括图片的 Base64 编码）。APIMart 图片由浏览器直传和直下；仅传输 URL 的函数请求可避开图片大小限制。仍以内联方式传输的其他渠道图片可能被平台拒绝。当前部署不包含账户系统、共享额度或云端工作流同步。自动检查不调用真实模型；部署后的路由检查也不能替代真实模型验收。

## Image 画布

空白处右键、左侧「添加节点」和拖线快捷创建均提供新版 Image。节点支持内置提示词、图片参考、历史结果、下载和锁定。节点接口与测试入口见[节点开发约定](src/nodes/README.md)。

## 画布本地保存

项目名称、节点内容、结果图片、连线和视野保存在当前浏览器的 IndexedDB。打开旧项目时，把可映射的提示词、图片、模型结果及连线迁到新版 Image。第一次保存时在项目数据库中保留迁移前的原始快照和本地素材，详见[旧项目迁移](src/nodes/guides/workflow.md#旧项目迁移)。项目列表支持切换、创建、重命名与删除。未命名项目可从首次成功生成图片的提示词自动命名，手动标题优先。不同项目单独保存。

### 画布自动整理

在主画布选中至少两个未锁定节点后按 `Shift + L`（Mac / Windows 相同）。按连通关系划分工作流，每组在原来的区域附近独立从左到右排列；单独的孤立节点保持原位，组间重叠时仅作最小必要避让；只调整选中节点的位置，不移动未选中或锁定的节点，也不改变连线、内容和视口。没有选中节点时不整理整张画布。开启网格对齐时，整理位置沿用当前网格。

一次撤销可恢复整组位置，重复整理不会新增无意义的历史记录。输入文字、输入法组合、菜单/弹窗和拖动过程中不会触发。该功能只有快捷键，没有按钮或菜单入口。自动检查包含 `canvasLayout.test.ts`；浏览器验收页为 `/tests/canvas-layout.html`，使用独立存储且不调用模型。
