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

左侧 Dock 采用 Figma 的 50 × 338 布局，选择与抓手连接画布工具状态；文件、搜索暂作展示，更多菜单提供 API 设置。加号、空白画布右键和拖线后的推荐入口共用 `NodeAddMenu`：主菜单 232 × 500，子菜单 232 × 411，较小窗口内自动避让边缘。Dock 选中按钮为 16px 圆角与浅底，菜单悬停高亮为 8px 圆角与浅底。视频、音频及其他尚未实现的条目仅展示，不创建节点。子菜单悬停 220ms 打开，离开菜单 360ms 关闭，斜向移动使用左右兼容的三角安全区，最多保护 1200ms；支持搜索、方向键和 Escape。图标保存在 `public/canvas-menu/`，不依赖临时 Figma 链接。

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

左侧 Dock 的“更多 → API 设置”支持 OpenAI、APIMart 与 DeepSeek，按渠道保存 Base URL 与 API Key。Seedream 和 Nano Banana 复用 APIMart 配置，图像描述使用 DeepSeek。清空当前渠道的 Key 后保存，本地开发服务会使用 `.env.local` 中的对应默认 Key。保存的配置在下一次模型请求开始时生效，密钥独立于画布与工作流数据保存。

“测试连接”检查当前填写的配置。OpenAI / DeepSeek 读取模型列表，APIMart 读取令牌余额。连接检查不创建生成任务。取消弹窗或修改输入会中止本次检查。

BYOK Base URL 支持公开 HTTPS 网关。服务端校验并固定 DNS 解析结果，阻止本机或内网目标及重定向。

## DeepSeek 图片反推提示词

在线上或本地的「更多 → API 设置」中保存 DeepSeek Key。默认地址为 `https://api.deepseek.com`。浏览器用 `purpose=user_data` 将原图直传到 [Files API](https://api-docs.deepseek.com/zh-cn/guides/files_api/)，设置上传后 1 小时过期。`/api/describer` 的请求体只包含按顺序排列的文件 ID 与系统指令。自定义 DeepSeek 地址需同时兼容 Files API、浏览器跨域上传和对话补全。

添加 File 节点并上传 JPEG / PNG / GIF / WebP 图片，将输出连接到 Image Describer 的 Image 输入。模型选择 `deepseek-flash`，按需调整 System Instructions，然后点击 Run selected。提示词会写入节点并可传递到下游。多个输入按端口编号排列，一次最多 14 张，直传单张不超过 64 MiB、合计不超过 200 MiB。旧节点需手动切换 DeepSeek 模型。

在本机通过 `npm run dev` 或 `npm run preview` 运行且浏览器未配置用户 Key 时，可使用 `.env.local` 中的 `DEEPSEEK_API_KEY` 走原有内联图片路径。该密钥仅在 Vite 服务端读取。单独部署 `dist/` 不包含 API 服务。

Tasks 显示实际排队、运行、成功或失败状态。每次 Run 都可能计费，取消会中断等待但不能保证服务商停止计费；失败不会自动重试。Retry 使用当前节点输入，并沿用面板 Runs 数量。

`npm test` 使用 Node.js 内置测试运行器，覆盖图像请求格式、输入校验、缺少密钥及跨域拒绝；这些测试不会调用真实模型。真实效果测试需要有效密钥和余额。

接口依据：https://api-docs.deepseek.com/zh-cn/guides/vision/

### Vercel 部署（BYOK）

仓库根目录的 `vercel.json` 同时构建 Vite 前端与 `api/[...path].ts` 模型接口。使用 `vercel deploy --environment preview` 发布预览；安装使用 `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci`，跳过未使用的 Node.js CUDA 二进制下载，不影响浏览器 WebGPU 蒙版推理；运行时使用 Node.js 24。接口复用本地请求校验、模型处理及 BYOK 网关校验。

线上仅使用用户在「更多 → API 设置」中填写的 API Key，不读取服务端默认密钥；连接测试同样需要填写 Key。`.vercelignore` 排除本地环境文件，部署时不要上传 `.env.local` 或配置共享模型密钥。接口仅接受 Vercel 提供的部署域名及对应 HTTPS Origin，用户配置仍保存在各自浏览器中。

函数最长运行 300 秒，平台请求和响应大小限制为 4.5 MB（包括图片的 Base64 编码）。APIMart 图片由浏览器直传和直下，DeepSeek 图片由浏览器直传；仅传输 URL 或文件 ID 的函数请求可避开图片大小限制。仍以内联方式传输的其他渠道图片可能被平台拒绝。当前部署不包含账户系统、共享额度或云端工作流同步。自动检查不调用真实模型；部署后的路由检查也不能替代真实模型验收。

## GPT Image 2.6（OpenAI / APIMart）

在已忽略的 `.env.local` 配置所需渠道的密钥：OpenAI 官方使用 `OPENAI_API_KEY`，APIMart 使用 `APIMART_API_KEY`，然后重启 `npm run dev`。默认密钥由本地服务读取，OpenAI 图片接口为 `/api/sunburst`，APIMart 使用异步图片接口。两个渠道也支持 `npm run preview`，单独发布 `dist/` 不提供后端。

左侧 Image → Image Models 中点击或拖入 **GPT Image 2.6 Sunburst**。将 Prompt 或 Image Describer 文本输出连接到 Prompt；可选连接 File 图片或其他 Sunburst 的 Result 到 Image。没有图片时使用所选渠道的 `/images/generations`，有图片时使用 `/images/edits`（服务端以 multipart/form-data 上传 `image[]` 文件，可选 `mask` 文件；文生图仍为 JSON）。参考图按 Image 端口顺序排列，最多 16 张；生成节点的输出是当前选中的结果。

Mask 必须连接一张带透明区域的 PNG，并与第一张参考图尺寸一致；透明区域表示要编辑的部分。支持 PNG / JPEG / WebP 输入，每张不超过 32 MiB，全部输入合计不超过 46 MiB。浏览器会读取连接的图片后传给本地服务。

选中 GPT Image 2.6 节点后，右侧可选择 **OpenAI 官方 / APIMart**，并设置模型版本（Sunburst / Flare）、画质、背景、宽高比、分辨率、输出格式。新节点默认 APIMart GPT Image 2.6 EXT，未保存渠道的旧节点使用 OpenAI。此前选用 ZenMux 的旧节点打开时会迁到 APIMart GPT Image 2.6 标准版，以保留自定义尺寸、SVG、背景和栅格蒙版。渠道随节点保存、复制与撤销/重做，每次运行将渠道加入任务快照。服务端使用任务所属渠道的密钥。OpenAI 使用 `https://api.openai.com/v1` 和 `gpt-image-2.6-sunburst` / `gpt-image-2.6-flare`。画质选项为自动（auto）、低（low）、中（medium）、高（high）、超高（xhigh）、最高（max）。默认 medium / auto / Auto / png。尺寸依据 [OpenAI 官方图像文档](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options)：提供 Auto、14 种常用比例（含 16:9、9:16、4:3、3:4、21:9）与 Custom 宽高。分辨率可选自动、1K、2K、4K 或自定义；选择预设后，切换比例保留分辨率档位。1K 保留旧比例尺寸；2K 长边不超过 2048，4K 长边不超过 3840 且总像素不超过 8,294,400，所有预设严格保持比例与 16 像素对齐。例如 2K 正方形为 2048×2048、2K 16:9 为 2048×1152、4K 16:9 为 3840×2160、4K 9:16 为 2160×3840，4K 正方形受像素上限限制为 2880×2880（不支持 4096×4096）。自动或非预设自定义尺寸切换档位时使用正方形，可再改宽高比。分辨率与画质互相独立：提高画质不会自动增大尺寸。自定义尺寸的宽高必须为 16 的倍数、比例在 1:3–3:1 之间、边长不超过 3840、总像素在 655,360–8,294,400 之间；官方将超过 2560×1440 总像素的尺寸列为实验分辨率。尺寸字符串原样传递给所选渠道，服务商实际接受情况尚需真实生成验证。选择透明背景时自动切换到 PNG；透明背景下选择 JPEG 会将背景改为 opaque。

参数行悬停后点击 Set as input，会创建与 Model Name 共用样式的紧凑下拉参数节点，保留当前值并自动连线。所有下拉参数节点选中后统一显示 Options 单选列表，可编辑选项并 Add another item；宽高比与分辨率统一保存为 `size` 的 `宽x高`，不会向 API 发送单独的 `resolution` 参数。暴露尺寸时，宽高比与分辨率控件同时禁用；参数节点包含各档尺寸预设，生成节点本身仍支持 Custom 宽高输入。旧的文本参数连接继续可用。

Run Model 和 Run selected 使用共享 Tasks 队列及 Runs 次数。每次运行保存输入快照，同一节点的多次运行依次提交，重复点击不会重复提交运行中的节点。结果追加到节点，支持切换、下载、全屏查看和下游连接，也会出现在 Assets。锁定节点不能修改参数或运行。

请求不自动重试。取消或五分钟超时会停止等待，但已提交的请求仍可能计费；手动 Retry 会按当前参数和 Runs 重新提交。费用由所选渠道实际用量决定，界面不模拟余额或固定 credits。画布、渠道选择及生成图片通过 IndexedDB 保存并在刷新后恢复。

APIMart：在 API 设置中保存 APIMart 的 Base URL（默认 `https://api.apimart.ai/v1`）与 Key，或在 `.env.local` 配置 `APIMART_API_KEY`。依据 [Ext 生成文档](https://docs.apimart.ai/cn/api-reference/images/gpt-image-2.6-ext/generation)，模型固定为 `gpt-image-2.6-ext`，`version` 传 `sunburst` / `flare`，`n: 1`，`nsfw_check: false`。画质支持六档；尺寸只接受自动与 1:1、3:2、2:3、4:3、3:4、5:4、4:5、16:9、9:16、21:9，分辨率单独传 `1k` / `2k` / `4k`，不传像素宽高。复杂度可选自动（省略参数）、低、中、高。输出提供 PNG / JPEG / WebP / GIF；文档明确警告暂不支持 SVG，因此该渠道不提供 SVG。GIF 仅支持文生图且比例须为自动。APIMart 不提供背景和 Mask 控件，也不发送 `background`、`moderation`、`mask`、`markup` 或 `markup_url`；已有 Mask 连线保留禁用端口供断开，并在运行前报错，切换渠道不删除原有连线。

APIMart 参考图编辑：单张不超过 20 MiB，支持 PNG / JPEG / WebP；1K 可额外使用 GIF。浏览器先读取并校验全部本地素材，使用 API 设置中的用户 Key 直接按顺序通过 [图片上传接口](https://docs.apimart.ai/cn/api-reference/uploads/images) `POST /uploads/images?retention_days=3` 上传带文件名的 multipart `file`，直接取顶层 `url`，应用 API 只接收 URL 与参数，再用 `image_urls` 提交 `/images/generations`（不走 `/images/edits`）。GPT Image 2.6 的 PNG Mask 同样先上传并以 `mask_url` 发送（上传上限 30 MiB）；上传前保留尺寸及透明通道校验。输入二进制不经过 Vercel 函数，避免 4.5 MB 请求限制，不压缩、不缩小原图。所有文件先通过格式、大小和上传像素限制检查；上传失败、取消或超时均不提交生成、不自动重试，也不回退大体积 Base64。上传接口需允许浏览器跨域和 Authorization。仅本地未填写 BYOK、使用 `.env.local` 默认 Key 时保留旧的服务端处理路径，服务端 Key 不下发浏览器。上传采用显式 3 天保存档，费用及额度按账户设置执行。生成提交返回任务号，浏览器每 4 秒通过本地 `/api/apimart/task` 查询已有任务，服务端固定请求 `GET /v1/tasks/{task_id}?language=zh`（[任务查询文档](https://docs.apimart.ai/cn/api-reference/tasks/status)），保留中文失败原因；排队和处理中继续轮询，完成后下载结果，服务商返回 `cancelled` 时任务及依赖分支显示已取消。查询超时继续查同一任务，本地取消会停止查询；生成不会自动重提或切换渠道。完成后服务端只返回结果 URL、格式、任务号及过期时间（如有）；浏览器直接从 CDN 下载，不携带 API Key、Cookie 或来源页面信息，校验格式、32 MiB 大小上限及 SVG 内容后转为本地素材供预览、下载与持久化。CDN 需允许跨域读取；下载失败保留任务号，不自动重提生成。`/tests/apimart-provider.html` 使用隔离存储与受控响应验证渠道差异、外部参数、保存恢复和异步任务，不调用真实服务。

SVG 输出：GPT Image 2.6 的 Sunburst / Flare 可选择 SVG，使用 `/images/generations`，每个任务 `n: 1`。OpenAI 请求同时显式传入 `svg.model: gpt-6.1-terra` 编写矢量内容，顶层 Flare / Sunburst 负责参考图；PNG/JPEG/WebP 请求省略该参数。参考图片或蒙版连接会在运行前报错，避免提交不支持的编辑请求。服务端与客户端使用 `saxes` 解析 XML，拒绝内嵌位图、脚本、动画、外部资源和格式不符的结果；通过校验后以 `image/svg+xml` 保留原始 UTF-8 XML，预览、下载和 IndexedDB 保存不转 PNG。下载得到真正的 `.svg` 文件。SVG 不可直接作为模型的栅格参考图。接口与约束见 [官方 SVG 文档](https://developers.openai.com/api/docs/guides/image-generation#generate-svg-output)。自动验收使用模拟响应；此前以 OpenAI Flare / low / 1024×1024、SVG 编写模型 gpt-6.1-sol 完成一次真实 SVG 验证，返回 HTTP 200 和纯 `<rect>` / `<circle>` 矢量内容（无内嵌位图）；切换到 gpt-6.1-terra 后尚未再次执行真实生图。

验证：`npm test`、`npm run lint`、`npm run build`。Node.js 内置测试还覆盖 Sunburst 剪切粘贴后的名称、当前图片和未完成尺寸恢复，以及运行前的尺寸校验。测试使用受控响应，不消耗模型额度。接口依据：[OpenAI Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst)、[OpenAI 图像生成与编辑](https://developers.openai.com/api/docs/guides/image-generation)。

## 画布本地保存

画布会在编辑后自动保存到当前浏览器的 IndexedDB（`momoflow-canvas`），暂时隐藏常驻保存状态，仅保存失败时显示提示和重试入口。画布左上角的常驻标题、右上角的常驻任务入口及小地图也暂时移除；选中节点后的设置和任务入口保留。画布背景为 `#151515`，圆点为 `#3f3f3f`。再次打开同一地址时，会恢复节点、文本和参数、连线、节点位置、画布缩放/平移及主题。上传文件和生成结果的 Blob 内容一并保存；外部链接仍按链接引用，不会自动下载。清空画布也会保存，同时清理不再使用的本地素材。

启动时先完成读取，再显示可编辑画布。恢复后的内容作为比较基准；首次打开、节点选中和尺寸测量不会触发保存或更新版本。实际内容变化才经过短暂合并后串行保存，素材与画布一起提交；存储空间不足等错误会显示重试入口。读取失败时不会用空画布覆盖已有数据。仅打开另一个标签页不会阻断原页面保存；多个标签页实际编辑发生保存冲突时，旧页面会提示先保留本页改动，再重新打开。保存过程中继续编辑或撤销，会在当前写入完成后接着保存最新内容。运行中的任务和撤销历史不跨页面恢复，也不会自动重新提交模型请求。

数据仅属于当前浏览器和当前网站地址（包含端口），不是云端备份；清除网站数据、使用无痕模式或换浏览器/地址都会影响可用性。关闭页面前可确认状态为“已保存到此浏览器”。

持久化单元测试使用现有 Node.js 内置测试运行器，位于 `src/persistence/*.test.ts`，已纳入 `npm test`。浏览器验收应覆盖编辑后刷新、关闭重开、素材预览、拖动/连线/缩放、清空后重开，以及保存失败时旧数据保留与重试。

本地素材的临时 URL 由统一资源管理器回收：当前画布、100 步撤销/重做历史、正在导入/保存/下载/预览的素材、排队和运行中的任务，以及最近一次在应用内剪切节点/复制链接的剪贴板内容仍会保留引用。历史淘汰或新编辑丢弃重做分支后，不再被引用的素材会撤销临时 URL；被删除或锁定的节点不会保留未能写入的新素材。资源回收不会删除仍可恢复的 IndexedDB 文件内容，也不缩减撤销容量。最近一次本地剪贴板引用在下一次应用内成功写入剪贴板时替换；不主动读取系统剪贴板。

`src/nodes/assetResources.test.ts` 使用同一 Node.js 测试命令，覆盖共享资源、异步导入、历史引用、任务/保存引用、StrictMode 清理重建及剪贴板失败保护。浏览器验收还包括删除图片后撤销/重做、超过 100 步后释放旧图片、废弃重做分支、保存过程中退出画布，以及释放临时 URL 后从 IndexedDB 恢复图片。

`src/persistence/workflowSignature.test.ts` 验证恢复初始化与临时 UI 状态不触发保存，以及文本、连线、位置、参数、素材和视图变化仍可触发保存，随 `npm test` 运行。多标签页浏览器验收包括无修改打开/选中不改写版本、原页面继续自动保存、真实编辑冲突保护、保存中撤销及失败重试。


## Seedream 5.5（APIMart）

菜单中的 Seedance 2.0 占位已替换为 Seedream 5.5，复用 Jimeng 图标。按[指定文档](https://docs.apimart.ai/cn/api-reference/images/seedream-5-5/generation)使用 `seedream-5-5`，默认 1.5K、PNG、自动背景、`nsfw_check: false`、无水印；可切换 2K / JPEG，透明背景须使用 PNG。宽高比默认自动，可选 1:1、4:3、3:4、16:9、9:16、3:2、2:3、21:9、2:1、1:2，以及精确像素。精确宽高须为正整数，总像素 921,600–4,624,220，比例 1:16–16:1，无 16 倍数限制。宽高停止输入 250ms 后会自动调整为符合限制的整数尺寸，尽量保持比例；按 Enter 或离开尺寸输入区也可立即确认；精确尺寸模式不传分辨率档位。不提供 1K 和图层拆分。

接入 Prompt 后可文生图，可选连接最多 10 张参考图；单张 30 MiB、合计 46 MiB。复用 APIMart API 设置或 `APIMART_API_KEY`，浏览器先通过相同的 APIMart 直传流程取得参考图 URL，再通过 `/api/apimart/seedream` 仅提交 URL 与参数并查询任务；本地只使用环境变量 Key 时保留 Data URI 兼容路径。失败不自动重新提交，取消停止本地等待；结果支持预览、下载、下游及保存恢复。模拟验收页为 `/tests/seedream.html`，不调用真实模型。

## Nano Banana 2.1（APIMart）

在图片分类或搜索中添加 **Nano Banana**，连接 `Prompt` 后运行文生图。编辑图片时连接 `Image`，应用会先通过 APIMart 图片文件接口上传附件，取得公网 URL 后再提交 `image_urls`。参考图支持 PNG、JPEG、WebP，最多 14 张，单张 20 MiB，合计 46 MiB。[APIMart 图片上传](https://docs.apimart.ai/cn/api-reference/uploads/images)

复用 API 设置中的 APIMart Key，或在本地开发和预览时使用 `APIMART_API_KEY`。固定模型为 `gemini-nano-banana-2.1`，支持自动比例及 14 种固定比例，分辨率可选 1K、2K、4K。应用按任务编号查询结果，拿到图片 URL 后下载并保存到工作流。PNG/JPEG 选择在浏览器处理，相同格式保留原始字节。[APIMart 模型文档](https://docs.apimart.ai/cn/api-reference/images/gemini-nano-banana-2.1/generation)

旧工作流中的 Ideogram 节点仍可查看和使用已保存的图片。该模型已下线。
