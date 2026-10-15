# Repository Guidelines

## 项目结构与模块组织

本项目使用 React 18、TypeScript、Vite 和 React Flow（`@xyflow/react`）。`src/main.tsx` 负责挂载应用，`src/App.tsx` 管理画布节点、连线及连接交互。全局样式位于 `src/index.css`，静态资源放在 `public/`，生产构建输出到 `dist/`。

自定义节点组件放在 `src/nodes/`，共享节点类型定义在 `types.ts`，节点注册和初始数据位于 `index.ts`。新增节点时，应在 `nodeTypes` 中注册，并扩展 `AppNode` 联合类型。连线定义与注册位于 `src/edges/index.ts`。

## 构建、检查与开发命令

- `npm install`：安装项目依赖。
- `npm run dev`：启动 Vite 开发服务器，修改代码后自动更新页面。
- `npm run build`：执行 TypeScript 类型检查并生成生产构建。
- `npm run lint`：使用 ESLint 检查 TypeScript 文件；出现警告也会失败。
- `npm run preview`：在本地预览生产构建，需先运行构建命令。

仓库同时包含 npm 和 pnpm 锁文件。修改依赖时应与所使用的包管理器保持一致，避免无关的锁文件变动。

## 代码风格与命名约定

遵循现有源码风格：使用两个空格缩进，TypeScript 字符串使用单引号，语句末尾加分号，多行结构保留尾随逗号。React 组件及其文件名使用 PascalCase，例如 `PositionLoggerNode.tsx`；变量和回调函数使用 camelCase；节点类型标识使用 kebab-case，例如 `position-logger`。

项目启用了 TypeScript 严格模式。为节点数据声明明确类型，并在适当位置使用仅类型导入。ESLint 检查 TypeScript、React Hooks 规则及 React Refresh 兼容性；目前未配置独立的代码格式化工具。

## 测试指南

目前未配置自动化测试框架、测试脚本或覆盖率门槛。提交前运行 `npm run lint` 和 `npm run build`。涉及画布的修改还应手动验证节点拖动、坐标更新、新建连线、缩放控件及小地图，并在拉取请求中说明检查结果。

如果引入自动化测试，应同步说明测试框架和运行命令，测试文件使用有明确含义的名称，并以 `*.test.ts` 或 `*.test.tsx` 结尾。

## 提交与拉取请求指南

当前目录无法读取 Git 历史，因此尚不能确认已有的提交信息约定。建议使用简短、以动作开头的提交标题，例如“添加自定义图片节点”，每次提交聚焦一个明确的改动。

拉取请求应说明修改内容、目的和验证结果，并关联相关问题。涉及画布外观或交互变化时，附上截图或简短录屏。不要提交 `node_modules/`、生成的 `dist/` 目录或密钥等敏感信息。
