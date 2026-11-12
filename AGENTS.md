# Repository Guidelines

## 项目结构与模块组织

本项目使用 React 18、TypeScript、Vite 和 React Flow（`@xyflow/react`）。`src/main.tsx` 负责挂载应用，`src/App.tsx` 管理画布节点、连线及连接交互。全局样式位于 `src/index.css`，静态资源放在 `public/`，生产构建输出到 `dist/`。

自定义节点组件放在 `src/nodes/`，共享节点类型定义在 `src/nodes/types.ts`，节点注册和初始数据位于 `src/nodes/index.ts`。新增节点时，应在 `nodeTypes` 中注册，并扩展 `AppNode` 联合类型。连线定义与注册位于 `src/edges/index.ts`。节点库名称、分类与默认创建数据在 `src/components/libraryCatalog.ts` 中维护，菜单创建复用 `createLibraryNode()`；新增入口或调整菜单分组时同步维护 `src/components/nodeMenuCatalog.ts`。展示占位条目不等于已实现的节点。

`src/components/` 放置画布导航、项目菜单、设置面板和任务管理等共享界面；`src/persistence/` 管理项目与工作流保存恢复；`server/` 处理模型服务接入与请求校验；`tests/` 提供独立浏览器验收页面及配套代码。

节点索引与开发约定见 [src/nodes/README.md](src/nodes/README.md)。新增、删除节点，或修改节点的输入输出、运行条件、注册方式时，必须在同一次改动中同步更新该文档；仅调整内部实现或样式且不影响文档描述时，无需更新。修改其他已记录的开发约定时，也应同步维护对应说明。

## 构建、检查与开发命令

- `npm install`：安装项目依赖。
- `npm run dev`：启动 Vite 开发服务器，修改代码后自动更新页面。
- `npm run build`：执行 TypeScript 类型检查并生成生产构建。
- `npm run lint`：使用 ESLint 检查 TypeScript 文件；出现警告也会失败。
- `npm run typecheck`：检查前端、服务端、浏览器测试页、质量脚本和 Vite 配置的类型。
- `npm run check:quick`：开发中执行 lint、类型、节点文档和补丁空白检查。
- `npm run check`：完成修改或提交前的统一入口，依次执行 lint、测试、含类型检查的构建、节点文档和补丁检查。
- `npm run preview`：在本地预览生产构建，需先运行构建命令。

仓库同时包含 npm 和 pnpm 锁文件。修改依赖时应与所使用的包管理器保持一致，避免无关的锁文件变动。

## 代码风格与命名约定

遵循现有源码风格：使用两个空格缩进，TypeScript 字符串使用单引号，语句末尾加分号，多行结构保留尾随逗号。React 组件及其文件名使用 PascalCase，例如 `PositionLoggerNode.tsx`；变量和回调函数使用 camelCase；节点类型标识使用 kebab-case，例如 `position-logger`。

项目启用了 TypeScript 严格模式。为节点数据声明明确类型，并在适当位置使用仅类型导入。ESLint 检查 TypeScript、React Hooks 规则及 React Refresh 兼容性；目前未配置独立的代码格式化工具。

## 节点视觉与交互约定

修改节点界面前，先阅读 [src/nodes/README.md](src/nodes/README.md) 中相关节点和共享视觉约定。应用仅支持深色模式；具体尺寸、颜色、字体和图标来源以该文档及现有共享实现为准，不在此重复维护。

节点外框、标题、端口和菜单优先复用 `src/nodes/shared/` 中的 `NodeFrame`、`NodeHeader`、`NodePort`、`NodeMenu` 和 `NodeOptionsMenu`；单值参数滑块复用 `NodeRangeInput`，多手柄或二维控件保留专用交互。设置面板优先复用现有 `NodeSettingsSection`、`ParameterField` 和 `NodeSettingsSidebar.css`。节点标题与节点库图标维护共享映射 `src/nodes/nodeIcons.ts`，保留文档记录的品牌与 Figma 原始 SVG 例外。

单个节点的样式调整应限定作用范围，避免通过全局选择器影响其他节点；修改共享组件或样式时，检查其他使用者。视觉调整应保留端口 ID、输入输出及连接规则、模型运行与图像处理逻辑，以及锁定、撤销和保存恢复行为。节点中的输入、拖动、滚动等操作应与画布手势正确隔离。

## 测试指南

使用 Node.js 内置测试运行器验证节点逻辑、文本编辑、持久化、服务端校验及质量检查机制，运行 `npm test`（需要 Node.js 22.6+，本地与 CI 使用 `.nvmrc` 指定的 Node.js 24）。尚未设置覆盖率门槛。完成代码修改及提交前运行 `npm run check`；检查后没有再修改文件时，不必重复执行其中的单项命令。涉及画布的修改还应手动验证节点拖动、坐标更新、新建连线、缩放控件及小地图；编辑器修改还需验证 Tab 建议、中文输入、撤销、粘贴及内联变量，并在拉取请求中说明检查结果。

节点视觉修改还应按影响范围验证悬停、选中、锁定、菜单开关与键盘操作、端口标签、不同画布缩放比例，以及空态和有内容状态。修改共享控件时选取有代表性的使用节点做回归；涉及动效时检查减少动态效果设置。浏览器验收使用独立存储或隔离测试页，避免改动用户保存的画布。

项目级 Codex Stop Hook 复用同一套检查，仅缓存完全通过且文件未变的结果；首次使用需在 Codex 官方 `/hooks` 界面信任该项目 Hook。失败最多触发一次自动续跑，不得修改规则绕过失败，也不能将范围外的已有问题当作本次修改。`tests/*.html` 是独立的浏览器验收入口，`npm test` 不运行这些页面。自动检查不调用真实模型，不需要 API 密钥。详细覆盖范围、Hook 启用及 CI 说明见 [docs/code-quality.md](docs/code-quality.md)。

新增测试应使用有明确含义的 `*.test.ts` 或 `*.test.tsx` 文件名，并接入对应运行入口；当前 `npm test` 仅匹配 `package.json` 中指定目录的 `*.test.ts`，不会自动运行所有测试文件或浏览器 TSX 测试。引入新测试框架或入口时同步说明运行命令。报告验证结果时分别说明自动检查、浏览器验收和真实模型调用；模拟响应通过不代表真实模型已验收。

## 提交与拉取请求指南

沿用近期中文动作式提交风格，使用简短、以动作开头的提交标题，例如“添加自定义图片节点”，每次提交聚焦一个明确的改动。

拉取请求应说明修改内容、目的和验证结果，并关联相关问题。涉及画布外观或交互变化时，附上截图或简短录屏。不要提交 `node_modules/`、生成的 `dist/` 目录或密钥等敏感信息。
