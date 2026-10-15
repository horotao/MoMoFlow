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
