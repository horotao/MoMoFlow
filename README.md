![](https://github.com/xyflow/web/blob/main/assets/codesandbox-header-ts.png?raw=true)

# React Flow starter (Vite + TS)

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

- `components.json`：shadcn 配置，`@/` 映射到 `src/`。
- `src/index.css`：Tailwind、React Flow 样式、主题变量和现有画布样式。
- `src/lib/utils.ts`：组件共用的 `cn()` 样式合并工具。
- `src/components/base-node.tsx`：React Flow UI 官方 Base Node 及其标题、内容、页脚组件。
- `src/components/ui/button.tsx`：shadcn Button，保留 React 18 的 `forwardRef` 接口，阴影类适配 Tailwind 4。

组件源码已添加，可在新节点和界面中按需使用；现有节点外观和连接交互保持不变。
画布的深浅色按钮同时切换根元素的 `dark` 类，使后续 shadcn 组件使用同一主题。

继续添加组件：

```bash
npx shadcn@latest add https://ui.reactflow.dev/labeled-handle
npx shadcn@latest add dialog
```

添加后需核对 React 18 兼容性，尤其是引用传递应使用 `forwardRef`，不能直接采用仅适用于 React 19 的 ref 参数写法。
不要覆盖现有 DevTools。React Flow CSS 通过 `src/index.css` 中的 `layer(base)` 在 Tailwind 之后加载，
现有画布样式也放在同一层，避免破坏 React Flow 深色主题的优先级。

验证命令：`npm run lint`、`npm run build`。手动检查拖动、坐标更新、双向拖线创建节点、
普通连线、主题切换、缩放、小地图及 DevTools。

## DeepSeek 图片反推提示词（本地测试）

复制 `.env.example` 为 `.env.local`，填写 `DEEPSEEK_API_KEY`，然后运行（或重启）`npm run dev`。密钥仅在 Vite 服务端读取，不能使用 `VITE_` 前缀或写进节点数据。

添加 File 节点并上传 JPEG / PNG / GIF / WebP 图片，将输出连接到 Image Describer 的 Image 输入。模型选择 `deepseek-flash`，按需调整 System Instructions，然后点击 Run selected。真实返回的提示词会写入节点，并可通过文本输出传递到下游。多个输入按端口编号排列；本地入口一次最多接受 14 张图片。旧节点需手动切换 DeepSeek 模型。

Tasks 显示实际排队、运行、成功或失败状态。每次 Run 都可能计费，取消会中断等待但不能保证服务商停止计费；失败不会自动重试。Retry 使用当前节点输入，并沿用面板 Runs 数量。

`npm test` 使用 Node.js 内置测试运行器，覆盖图像请求格式、输入校验、缺少密钥及跨域拒绝；这些测试不会调用真实模型。真实效果测试需要有效密钥和余额。

接口依据：https://api-docs.deepseek.com/zh-cn/guides/vision/

此入口用于 `npm run dev` 和 `npm run preview` 本地测试。单独部署 `dist/` 不包含 API 服务；生产部署需要独立后端、身份验证与用量限制。

## GPT Image 2.5 Sunburst（ZenMux 本地接入）

在已忽略的 `.env.local` 配置 `ZENMUX_API_KEY`，重启 `npm run dev`。密钥由本地服务读取，浏览器只请求 `/api/sunburst`。此接口同样支持 `npm run preview`，单独发布 `dist/` 不提供后端。

左侧 Image → Image Models 中点击或拖入 **GPT Image 2.5 Sunburst**。将 Prompt 或 Image Describer 文本输出连接到 Prompt；可选连接 File 图片或其他 Sunburst 的 Result 到 Image。没有图片时使用 ZenMux `/images/generations`，有图片时使用 `/images/edits`（服务端以 multipart/form-data 上传 `image[]` 文件，可选 `mask` 文件；文生图仍为 JSON）。参考图按 Image 端口顺序排列，最多 16 张；生成节点的输出是当前选中的结果。

Mask 必须连接一张带透明区域的 PNG，并与第一张参考图尺寸一致；透明区域表示要编辑的部分。支持 PNG / JPEG / WebP 输入，每张不超过 32 MiB，全部输入合计不超过 46 MiB。浏览器会读取连接的图片后传给本地服务。

选中节点后，右侧显示 Variant（固定 Sunburst）、Quality、Background、Aspect Ratio、Output Format。默认 medium / auto / Auto / png。尺寸依据 [OpenAI 官方图像文档](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options)：提供 Auto、14 种常用比例（含 16:9、9:16、4:3、3:4、21:9）与 Custom 宽高。自定义尺寸的宽高必须为 16 的倍数、比例在 1:3–3:1 之间、边长不超过 3840、总像素在 655,360–8,294,400 之间；超过 2560×1440 总像素标记为实验分辨率。尺寸字符串原样传递给 ZenMux，服务商实际接受情况尚需真实生成验证。选择透明背景时自动切换到 PNG；透明背景下选择 JPEG 会将背景改为 opaque。

参数行悬停后点击 Set as input，会创建与 Model Name 共用样式的紧凑下拉参数节点，保留当前值并自动连线。所有下拉参数节点选中后统一显示 Options 单选列表，可编辑选项并 Add another item；Aspect Ratio 的自定义尺寸用 `宽x高` 选项保存，生成节点本身仍支持 Custom 宽高输入。旧的文本参数连接继续可用。

Run Model 和 Run selected 使用共享 Tasks 队列及 Runs 次数。每次运行保存输入快照，同一节点的多次运行依次提交，重复点击不会重复提交运行中的节点。结果追加到节点，支持切换、下载、全屏查看和下游连接，也会出现在 Assets。锁定节点不能修改参数或运行。

请求不自动重试。取消或五分钟超时会停止等待，但已提交的请求仍可能计费；手动 Retry 会按当前参数和 Runs 重新提交。费用由 ZenMux 实际用量决定，界面不模拟余额或固定 credits。画布与图片沿用本项目当前页面会话生命周期，刷新前请下载需要保留的结果。

验证：`npm test`、`npm run lint`、`npm run build`。Node.js 内置测试还覆盖 Sunburst 剪切粘贴后的名称、当前图片和未完成尺寸恢复，以及运行前的尺寸校验。测试使用受控响应，不消耗模型额度。接口依据：[生成图片](https://zenmux.ai/docs/zh/api/openai/generate-an-image.html)、[编辑图片](https://zenmux.ai/docs/zh/api/openai/create-image-edit.html)、[模型详情](https://zenmux.ai/openai/gpt-image-2.5-sunburst)。
