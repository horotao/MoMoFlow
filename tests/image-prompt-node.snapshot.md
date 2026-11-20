# Image Prompt 节点样式测试快照

保存日期：2026-11-20；版本：v1。

当前成果只保留在独立测试页，没有接入真实画布、节点注册或模型运行流程。

- 预览入口：[image-prompt-node.html](image-prompt-node.html)。运行 `npm run dev` 后打开 `/tests/image-prompt-node.html`。
- 固定快照：[image-prompt-node-2026-11-20-v1](snapshots/image-prompt-node-2026-11-20-v1/README.md)。以文件夹保存当时的 HTML、TSX、CSS、字体和图标、截图、文件校验值及恢复说明。
- 可继续编辑的文件：`tests/image-prompt-node.{html,tsx,css}` 和 `tests/image-prompt-assets/`。

本次保存包含节点默认、悬停和选中外观；左右端点图标与磁吸动效；顶部工具栏的延迟退场与过渡；空态提示文字扫光；长文本滚动、底部渐变和描边内侧圆角裁切；数量大于 1 时固定展开的发送按钮组；滚动条拖动抓手；底部按钮提示。

已通过 `npm run check`，并在独立测试页逐项进行浏览器交互核验。底部提示另核对了键盘聚焦、Escape 关闭及减少动态效果设置。这里记录的是样式原型结果，尚未做真实画布集成验收；发送、语音和润色等按钮没有接入实际服务。

恢复时先备份当前测试文件，再将快照文件夹里的 `tests/` 文件复制回项目对应位置。`public/canvas-menu/openai.svg` 是原有图标的副本，当前项目已有相同文件时无需覆盖。文件夹里的 `SHA256SUMS.json` 可用于核对内容，恢复操作不涉及 `src/`。
