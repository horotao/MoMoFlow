# 代码质量检查

统一入口为 `npm run check`。它复用现有 Node.js 测试、ESLint 和 Vite 构建，供开发者、Codex 和 GitHub Actions 使用，不引入 Husky、额外测试框架或重复的全局 Hook。

## 日常使用

```bash
nvm use         # 使用 .nvmrc 中的 Node.js 24；也可自行安装 Node.js 24
npm ci          # 首次安装或锁文件改变后执行，使用 package-lock.json
npm run check:quick
npm run check
```

`check:quick` 用于开发过程，包含 lint、类型、节点文档及补丁空白检查。它不能替代完整检查，也不写入完整检查的通过缓存。

`check` 每次手动调用和每次 CI 调用都完整运行；遇到首个失败返回非零退出码。完整检查里的 `build` 自带 `typecheck`，不再单独重复运行类型检查。检查结果和日志保存在已忽略的 `.codex/.quality/`，可随时删除以清除缓存与历史日志。

| 检查 | 范围 |
| --- | --- |
| `npm run lint` | 现有 ESLint 规则，覆盖仓库的 TS / TSX，包括质量脚本；警告也失败 |
| `npm test` | `src/nodes/*.test.ts`、`src/persistence/*.test.ts`、`server/*.test.ts`、`scripts/*.test.ts`，使用 Node.js 内置测试运行器 |
| `npm run typecheck` | 先使用原 `tsconfig.json` 检查前端，再用 `tsconfig.check.json` 检查服务端、浏览器夹具、质量脚本和 Vite 配置 |
| `npm run build` | 上述类型检查与 Vite 生产构建，包括 Worker 打包 |
| `npm run check:docs` | `nodeTypes` 注册项与节点 README 表格一致，且节点 README 和 `src/nodes/guides/*.md` 中链接的本地文件存在 |
| `npm run check:diff` | 工作区、暂存区、未跟踪文件的空白错误；CI 另检查指定提交范围 |

`tsconfig.check.json` 继承原有严格类型规则；工具和 Node.js 测试使用 ES2022 标准库以覆盖 `Error.cause` / `AggregateError`。前端仍由原配置单独检查。未改变现有 TypeScript 严格度，也没有使用 `@ts-ignore` 隐藏旧问题。

TypeScript 固定为本机原已使用的 `5.9.3`，并同步 `package-lock.json`。本地与 CI 使用相同的编译器版本。此项目继续以 npm 锁文件为准，未同步旧 pnpm 锁文件。

服务端测试使用本地受控响应及假凭据，不访问真实模型；自动检查不会运行图片生成。暂未设置覆盖率或构建体积的新门槛；Vite 已有的大包警告仍由构建输出提示。

## Codex 自动检查

配置位于 [.codex/hooks.json](../.codex/hooks.json)，只添加一个同步 `Stop` 命令 Hook，调用 [codex-quality-hook.ts](../scripts/codex-quality-hook.ts)。它在回合准备结束时运行，不对每次文件读取或工具调用重复执行整套构建。

1. 首次触发时运行完整检查；Plan 模式跳过检查，不产生构建输出。
2. 已完整通过且文件内容未变时复用结果。指纹包括 Git 跟踪文件、未跟踪文件、暂存区、文件删除、Node.js 版本及 npm 安装标记；忽略结果目录和本地环境变量文件。
3. 失败返回 Codex 支持的 `decision: block`，让当前任务续跑一次，提供失败项与日志路径。续跑后重新检查；仍失败则通过 `systemMessage` 告知，不无限循环。修复必须遵守用户的只读要求和任务范围。
4. 检查过程中若文件发生变化，不记为通过。即使 Hook 缓存命中，也不代表浏览器交互已验收。直接修改 `node_modules` 内部文件不属于缓存跟踪范围；此时手动运行 `npm run check`。

新 Hook 必须经 Codex 的官方信任流程后才会执行。在项目目录运行 `codex`，输入 `/hooks`，查看来源为本仓库 `.codex/hooks.json` 的 `Stop`，检查命令后信任它，再启动或恢复项目会话。修改 Hook 定义后可能需要重新信任。不要手写 `trusted_hash` 或使用跳过信任的启动参数。现有用户级状态通知 Hooks 与此配置并存；无需修改 `~/.codex/hooks.json` 或全局 `features`。

2026-10-25 核验：桌面版本为 `26.1021.22027`，内置运行时 `0.164.0-alpha.11.1`；独立 CLI 为 `0.162.1`。两者的 `codex features list` 均显示 `hooks stable true`。实际桌面运行时的 `hooks/list` 接口用于核对配置加载、错误与信任状态。配置依据 [OpenAI 官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)。这些版本是核验记录，升级后可重新核对，不能推断所有旧版或云端会话都支持同样机制。

Hook 属于开发辅助检查，可以被用户禁用，脚本启动错误也不保证阻断回合；可靠的共享检查入口仍是 `npm run check` 和 CI。

## GitHub Actions

[quality.yml](../.github/workflows/quality.yml) 在 PR、推送到 `main` 及手动触发时执行 `npm ci` 和 `npm run check`。Node.js 版本与本地一致，只使用 npm 锁文件；Actions 固定到已核对的提交版本。未使用需要密钥的 API，也没有定时任务。

CI 使用完整 Git 历史，PR 以目标分支基点、推送以事件的前一个提交为 `MOMOFLOW_DIFF_BASE`。因此干净检出中的已提交空白错误也能被检查。新分支的全零基点比较完整树；基点不存在则失败，不能当成检查通过。手动触发未提供基点时只做工作区检查，其余检查仍完整执行。

配置进入远端后才会触发 GitHub 工作流。需要禁止失败代码合并时，可由仓库管理员将 `quality` 设为 required status check；仓库内的 YAML 本身不会修改分支保护。

## 按修改范围补充浏览器验收

主画布进入或切换项目后，项目标题从上方、左侧工具栏从左方、左下导航与右下任务队列从下方同步滑入并淡入，起始位移为组件自身尺寸的 100%，持续 1500ms，曲线为 `cubic-bezier(0.4, 0, 0.2, 1)`，与 Flora 一致；减少动态效果时改为 150ms 的纯淡入。检查刷新和项目切换时同步开始，缩放、小地图开关、工具切换、菜单及任务队列展开时不重播，不影响节点、连线和画布坐标。

在独立浏览器存储中打开实际主画布。分别通过右键、左侧加号、右侧「+」和图片输入反向拖线创建 Image，核对创建坐标、端口、锁定、一次撤销和刷新恢复。打开混合版本工作流时，核对迁移后的提示词、Image 历史、模型参数、参考图连线和本地图片。缩放后等待自动保存，再刷新并检查新版画布与 IndexedDB 的原始快照。

节点界面需核对空态、有结果、悬停、选中、键盘菜单、工具栏尺寸和减少动态效果设置。另检查拖动、缩放、小地图以及项目切换。模型请求可用受控响应验收，记录是否调用了真实模型。

小地图展开时核对 186×105px 内区及上方居中的浮动缩放栏；覆盖地图与工具栏之间移动、移出隐藏、键盘聚焦、Esc 返回按钮，以及触屏控件常显。另核对点击定位、双轴拖动、滚轮缩放、快速反向开关和减少动态效果。

本地开发服务下，`/tests/node-add-menu.html` 检查创建入口，`/tests/canvas-layout.html` 检查排列与撤销，`/tests/canvas-projects.html` 检查项目保存和切换。`/tests/canvas-navigation.html` 和 `/tests/canvas-selection.html` 可独立复核视野及选择交互。浏览器测试页需单独运行。

主画布与 `/tests/canvas-navigation.html` 共用 `CanvasBackground`：底色 `#090908`，点色 `#FDF8EC5D`，100% 视图下点距 32px、点径 1px，顶部渐隐高度 128px。渐隐是独立覆盖层，位于节点和连线上方、画布工具栏下方；节点内部内容随节点一起渐隐，不拦截鼠标操作。背景仅在平移、缩放、尺寸或设备像素比变化时重绘；缩小时保留柔边并降低透明度。浏览器补验 50% / 100% 缩放、平移对齐、节点与连线进入顶部时一起渐隐、渐隐区内的节点拖动与连线穿透，以及 WebGL 上下文丢失时的 SVG 降级和恢复；无新增测试框架或模型调用。

新增节点除了通过注册表检查，还需按 [节点开发约定](../src/nodes/README.md) 核对端口、输出失效、素材引用、锁定、剪贴板、历史及 IndexedDB 恢复。检查器只能验证可确定的结构，不能代替语义审查。

小地图几何回归位于 `src/components/minimapGeometry.test.ts`，使用 Node.js 内置测试运行器，随 `npm test` / `npm run check` 执行；覆盖负坐标、空画布、极端缩放、点击坐标映射，以及中心聚焦切换、相邻节点切换缓冲和空白区域取消聚焦。动态交互在 `/tests/canvas-navigation.html` 验证，包括平移、缩放、小地图拖动与点击定位。视野中心附近的节点在小地图中放大至 1.2 倍，与小地图移动共用 220ms 过渡进度和缓动曲线；连续移动或切换目标时从当前显示状态继续过渡，中心点和定位坐标不变。切换焦点或移到空白区域时恢复原大小，小地图拖动期间锁定地图映射但仍允许焦点过渡，减少动态效果模式下直接切换。
