# Repository Guidelines

## 项目结构与模块组织

本项目使用 React 18、TypeScript、Vite 和 React Flow（`@xyflow/react`）。`src/main.tsx` 负责挂载应用，`src/App.tsx` 管理画布节点、连线及连接交互。全局样式位于 `src/index.css`，静态资源放在 `public/`，生产构建输出到 `dist/`。

自定义节点组件放在 `src/nodes/`，共享节点类型定义在 `types.ts`，节点注册和初始数据位于 `index.ts`。新增节点时，应在 `nodeTypes` 中注册，并扩展 `AppNode` 联合类型。连线定义与注册位于 `src/edges/index.ts`。

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

## 测试指南

使用 Node.js 内置测试运行器验证节点逻辑、文本编辑、持久化、服务端校验及质量检查机制，运行 `npm test`（需要 Node.js 22.6+，本地与 CI 使用 `.nvmrc` 指定的 Node.js 24）。尚未设置覆盖率门槛。完成代码修改及提交前运行 `npm run check`；检查后没有再修改文件时，不必重复执行其中的单项命令。涉及画布的修改还应手动验证节点拖动、坐标更新、新建连线、缩放控件及小地图；编辑器修改还需验证 Tab 建议、中文输入、撤销、粘贴及内联变量，并在拉取请求中说明检查结果。

项目级 Codex Stop Hook 复用同一套检查，仅缓存完全通过且文件未变的结果；首次使用需在 Codex 官方 `/hooks` 界面信任该项目 Hook。失败最多触发一次自动续跑，不得修改规则绕过失败，也不能将范围外的已有问题当作本次修改。`tests/*.html` 是独立的浏览器验收入口，`npm test` 不运行这些页面。自动检查不调用真实模型，不需要 API 密钥。详细覆盖范围、Hook 启用及 CI 说明见 [docs/code-quality.md](docs/code-quality.md)。

如果引入自动化测试，应同步说明测试框架和运行命令，测试文件使用有明确含义的名称，并以 `*.test.ts` 或 `*.test.tsx` 结尾。

## 提交与拉取请求指南

当前目录无法读取 Git 历史，因此尚不能确认已有的提交信息约定。建议使用简短、以动作开头的提交标题，例如“添加自定义图片节点”，每次提交聚焦一个明确的改动。

拉取请求应说明修改内容、目的和验证结果，并关联相关问题。涉及画布外观或交互变化时，附上截图或简短录屏。不要提交 `node_modules/`、生成的 `dist/` 目录或密钥等敏感信息。
