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
React Flow CSS 通过 `src/index.css` 中的 `layer(base)` 在 Tailwind 之后加载，
现有画布样式也放在同一层，避免破坏 React Flow 深色主题的优先级。

验证命令：`npm run lint`、`npm run build`。手动检查拖动、坐标更新、双向拖线创建节点、
普通连线、主题切换、缩放及小地图。

## DeepSeek 图片反推提示词（本地测试）

复制 `.env.example` 为 `.env.local`，填写 `DEEPSEEK_API_KEY`，然后运行（或重启）`npm run dev`。密钥仅在 Vite 服务端读取，不能使用 `VITE_` 前缀或写进节点数据。

添加 File 节点并上传 JPEG / PNG / GIF / WebP 图片，将输出连接到 Image Describer 的 Image 输入。模型选择 `deepseek-flash`，按需调整 System Instructions，然后点击 Run selected。真实返回的提示词会写入节点，并可通过文本输出传递到下游。多个输入按端口编号排列；本地入口一次最多接受 14 张图片。旧节点需手动切换 DeepSeek 模型。

Tasks 显示实际排队、运行、成功或失败状态。每次 Run 都可能计费，取消会中断等待但不能保证服务商停止计费；失败不会自动重试。Retry 使用当前节点输入，并沿用面板 Runs 数量。

`npm test` 使用 Node.js 内置测试运行器，覆盖图像请求格式、输入校验、缺少密钥及跨域拒绝；这些测试不会调用真实模型。真实效果测试需要有效密钥和余额。

接口依据：https://api-docs.deepseek.com/zh-cn/guides/vision/

此入口用于 `npm run dev` 和 `npm run preview` 本地测试。单独部署 `dist/` 不包含 API 服务；生产部署需要独立后端、身份验证与用量限制。

## GPT Image 2.5 Sunburst（OpenAI / ZenMux）

在已忽略的 `.env.local` 配置所需渠道的密钥：OpenAI 官方使用 `OPENAI_API_KEY`，ZenMux 使用 `ZENMUX_API_KEY`，然后重启 `npm run dev`。密钥由本地服务读取，浏览器只请求 `/api/sunburst`。此接口同样支持 `npm run preview`，单独发布 `dist/` 不提供后端。

左侧 Image → Image Models 中点击或拖入 **GPT Image 2.5 Sunburst**。将 Prompt 或 Image Describer 文本输出连接到 Prompt；可选连接 File 图片或其他 Sunburst 的 Result 到 Image。没有图片时使用所选渠道的 `/images/generations`，有图片时使用 `/images/edits`（服务端以 multipart/form-data 上传 `image[]` 文件，可选 `mask` 文件；文生图仍为 JSON）。参考图按 Image 端口顺序排列，最多 16 张；生成节点的输出是当前选中的结果。

Mask 必须连接一张带透明区域的 PNG，并与第一张参考图尺寸一致；透明区域表示要编辑的部分。支持 PNG / JPEG / WebP 输入，每张不超过 32 MiB，全部输入合计不超过 46 MiB。浏览器会读取连接的图片后传给本地服务。

选中同一个 GPT Image 2.5 节点后，右侧可选择渠道商 **OpenAI 官方 / ZenMux**，并设置模型版本（固定 Sunburst）、画质、背景、宽高比、分辨率、输出格式。新节点及未保存渠道的旧节点默认 ZenMux；渠道随节点保存、复制与撤销/重做，每次运行将渠道加入任务快照。服务端只读取所选渠道的密钥，缺少密钥或请求失败不会切换到另一渠道。OpenAI 使用 `https://api.openai.com/v1` 和 `gpt-image-2.5-sunburst`，ZenMux 使用 `https://zenmux.ai/api/v1` 和 `openai/gpt-image-2.5-sunburst`。OpenAI 画质支持自动（auto）、低（low）、中（medium）、高（high）、超高（xhigh）、最高（max）；ZenMux 保留现有 auto / low / medium / high。切到 ZenMux 时，本地 xhigh / max 改为 high，可一并撤销；连接的画质参数保持原值，不支持时在运行前报错。暴露画质或反向创建参数节点时，选项按目标渠道初始化。默认 medium / auto / Auto / png。尺寸依据 [OpenAI 官方图像文档](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options)：提供 Auto、14 种常用比例（含 16:9、9:16、4:3、3:4、21:9）与 Custom 宽高。分辨率可选自动、1K、2K、4K 或自定义；选择预设后，切换比例保留分辨率档位。1K 保留旧比例尺寸；2K 长边不超过 2048，4K 长边不超过 3840 且总像素不超过 8,294,400，所有预设严格保持比例与 16 像素对齐。例如 2K 正方形为 2048×2048、2K 16:9 为 2048×1152、4K 16:9 为 3840×2160、4K 9:16 为 2160×3840，4K 正方形受像素上限限制为 2880×2880（不支持 4096×4096）。自动或非预设自定义尺寸切换档位时使用正方形，可再改宽高比。分辨率与画质互相独立：提高画质不会自动增大尺寸。自定义尺寸的宽高必须为 16 的倍数、比例在 1:3–3:1 之间、边长不超过 3840、总像素在 655,360–8,294,400 之间；官方将超过 2560×1440 总像素的尺寸列为实验分辨率。尺寸字符串原样传递给所选渠道，服务商实际接受情况尚需真实生成验证。选择透明背景时自动切换到 PNG；透明背景下选择 JPEG 会将背景改为 opaque。

参数行悬停后点击 Set as input，会创建与 Model Name 共用样式的紧凑下拉参数节点，保留当前值并自动连线。所有下拉参数节点选中后统一显示 Options 单选列表，可编辑选项并 Add another item；宽高比与分辨率统一保存为 `size` 的 `宽x高`，不会向 API 发送单独的 `resolution` 参数。暴露尺寸时，宽高比与分辨率控件同时禁用；参数节点包含各档尺寸预设，生成节点本身仍支持 Custom 宽高输入。旧的文本参数连接继续可用。

Run Model 和 Run selected 使用共享 Tasks 队列及 Runs 次数。每次运行保存输入快照，同一节点的多次运行依次提交，重复点击不会重复提交运行中的节点。结果追加到节点，支持切换、下载、全屏查看和下游连接，也会出现在 Assets。锁定节点不能修改参数或运行。

请求不自动重试。取消或五分钟超时会停止等待，但已提交的请求仍可能计费；手动 Retry 会按当前参数和 Runs 重新提交。费用由所选渠道实际用量决定，界面不模拟余额或固定 credits。画布、渠道选择及生成图片通过 IndexedDB 保存并在刷新后恢复。

验证：`npm test`、`npm run lint`、`npm run build`。Node.js 内置测试还覆盖 Sunburst 剪切粘贴后的名称、当前图片和未完成尺寸恢复，以及运行前的尺寸校验。测试使用受控响应，不消耗模型额度。接口依据：[OpenAI Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)、[OpenAI 图像生成与编辑](https://developers.openai.com/api/docs/guides/image-generation)、[生成图片](https://zenmux.ai/docs/zh/api/openai/generate-an-image.html)、[编辑图片](https://zenmux.ai/docs/zh/api/openai/create-image-edit.html)、[模型详情](https://zenmux.ai/openai/gpt-image-2.5-sunburst)。

## 画布本地保存

画布会在编辑后自动保存到当前浏览器的 IndexedDB（`momoflow-canvas`），左下角显示保存状态。再次打开同一地址时，会恢复节点、文本和参数、连线、节点位置、画布缩放/平移及主题。上传文件和生成结果的 Blob 内容一并保存；外部链接仍按链接引用，不会自动下载。清空画布也会保存，同时清理不再使用的本地素材。

启动时先完成读取，再显示可编辑画布。恢复后的内容作为比较基准；首次打开、节点选中和尺寸测量不会触发保存或更新版本。实际内容变化才经过短暂合并后串行保存，素材与画布一起提交；存储空间不足等错误会显示重试入口。读取失败时不会用空画布覆盖已有数据。仅打开另一个标签页不会阻断原页面保存；多个标签页实际编辑发生保存冲突时，旧页面会提示先保留本页改动，再重新打开。保存过程中继续编辑或撤销，会在当前写入完成后接着保存最新内容。运行中的任务和撤销历史不跨页面恢复，也不会自动重新提交模型请求。

数据仅属于当前浏览器和当前网站地址（包含端口），不是云端备份；清除网站数据、使用无痕模式或换浏览器/地址都会影响可用性。关闭页面前可确认状态为“已保存到此浏览器”。

持久化单元测试使用现有 Node.js 内置测试运行器，位于 `src/persistence/*.test.ts`，已纳入 `npm test`。浏览器验收应覆盖编辑后刷新、关闭重开、素材预览、拖动/连线/缩放、清空后重开，以及保存失败时旧数据保留与重试。

本地素材的临时 URL 由统一资源管理器回收：当前画布、100 步撤销/重做历史、正在导入/保存/下载/预览的素材、排队和运行中的任务，以及最近一次在应用内剪切节点/复制链接的剪贴板内容仍会保留引用。历史淘汰或新编辑丢弃重做分支后，不再被引用的素材会撤销临时 URL；被删除或锁定的节点不会保留未能写入的新素材。资源回收不会删除仍可恢复的 IndexedDB 文件内容，也不缩减撤销容量。最近一次本地剪贴板引用在下一次应用内成功写入剪贴板时替换；不主动读取系统剪贴板。

`src/nodes/assetResources.test.ts` 使用同一 Node.js 测试命令，覆盖共享资源、异步导入、历史引用、任务/保存引用、StrictMode 清理重建及剪贴板失败保护。浏览器验收还包括删除图片后撤销/重做、超过 100 步后释放旧图片、废弃重做分支、保存过程中退出画布，以及释放临时 URL 后从 IndexedDB 恢复图片。

`src/persistence/workflowSignature.test.ts` 验证恢复初始化与临时 UI 状态不触发保存，以及文本、连线、位置、参数、素材和视图变化仍可触发保存，随 `npm test` 运行。多标签页浏览器验收包括无修改打开/选中不改写版本、原页面继续自动保存、真实编辑冲突保护、保存中撤销及失败重试。


## Nano Banana 2.1（ZenMux 本地接入）

在左侧 **图片** 分类或搜索中添加 **Nano Banana 2.1**，将提示词节点接入 `Prompt`，可选将导入图片或生成结果接入 `Image`。右侧设置宽高比、1K/2K/4K 分辨率与 PNG/JPEG 格式，点击运行模型。输出格式在收到图片后由浏览器转换，不传上游 `outputMimeType`；相同格式保留原始字节，转换保持尺寸，JPEG 使用白底和 0.95 编码质量。参考图应用上限为 14 张，单张 20 MiB，总计 46 MiB。默认自动比例、1K、PNG；结果支持预览、下载及保存恢复。

复用 `.env.local` 中的 `ZENMUX_API_KEY`，密钥仅在服务端读取；浏览器请求 `/api/nano-banana`。开发和 `npm run preview` 均注册本地 API，单独发布 `dist/` 不提供后端。固定模型为 `google/gemini-nano-banana-2.1`。依据 [ZenMux Gemini 指南](https://zenmux.ai/docs/zh/guide/advanced/image-generation.html)，Banana 使用 Vertex AI `:generateContent`；参考图通过 `inlineData` 传入，图片从响应的 `candidates[].content.parts[].inlineData` 读取。参数说明见 [Generate Content](https://zenmux.ai/docs/zh/api/vertexai/generate-content.html#imageconfig-imageconfig-可选)。

运行次数沿用现有任务队列，取消或失败不会自动重新提交。`npm run check` 使用模拟响应；`/tests/nano-banana.html` 是隔离的浏览器验收页，不消耗模型额度。真实生成、模型参数接受情况和输出质量需单独验证。

## Ideogram 4.5（WaveSpeed）

在 `.env.local` 设置 `WAVESPEED_API_KEY` 后启动或重启 `npm run dev`。从图片分类或搜索添加 **Ideogram 4.5**，将提示词连接到 Prompt，选择比例、1K/2K、质量和提示词扩展后运行。连接 Image 原图后自动切换为图片编辑，使用独立的编辑质量、精度和尺寸设置。通过“添加参考图输入”可连接最多 4 张参考图；连接 Mask 时最多 3 张。Image 原图必须是单张图片。导入的黑白 Mask 以黑色标记修改区域、白色标记保留区域；Painter 等节点的蒙版会自动转换，Mask 尺寸必须与原图一致。使用 Mask 或高精度时，输出尺寸跟随原图。

依据 [WaveSpeed 模型文档](https://wavespeed.ai/docs/docs-api/ideogram-ai/ideogram-ai-ideogram-v4.5)，服务端通过 `/api/ideogram`（文生图）和 `/api/ideogram/edit`（[图片编辑](https://wavespeed.ai/docs/docs-api/ideogram-ai/ideogram-ai-ideogram-v4.5-edit)）提交并查询任务，密钥不进入浏览器。开发服务和 `npm run preview` 均支持；仅发布 `dist/` 不提供后端。提交只执行一次，查询临时错误会退避重试；取消或超时不保证供应商停止生成，重新调用前请检查 WaveSpeed History。图片下载到本地 Blob 并随工作流保存。编辑输入会按 [WaveSpeed 上传协议](https://wavespeed.ai/docs/upload-files-api) 在服务端换取上传凭证并上传文件，再向模型提交下载地址；文件会按供应商策略保存 7 天。单张输入最多 32 MiB、合计 46 MiB。`/tests/ideogram.html` 和 `/tests/ideogram-edit.html` 为不消耗模型额度的隔离浏览器验收页。
