# Text 混合输入缩略图验收 · 2026-11-21

在独立浏览器存储 `http://localhost:5173/` 的实际主画布，项目「Text 参考缩略图验收」验证，未改用户 `127.0.0.1` 的画布。通过节点菜单创建两个 Text，正常连线接入文本与图片。图片通过应用现有节点粘贴格式导入本地 `tests/fixtures/image-node-1.png`／`image-node-2.png`，不上传外部服务。

## 结果

- 混合输入顺序为 Text、Image。Text 为灰色 T 图标和上游节点名／Text，Image 使用上游当前选中图片。两者均直接使用 `ImagePromptReferences`，没有新建独立缩略图控件。
- 悬停 Text 的稳定展开尺寸：卡片 132 × 40px，文字区域 80px，媒体缩放 0.8、250ms 过渡；图标 16px、灰底 rgb(56,56,52)。`final-mixed-hover.jpg` 为完整主画布，`reference-closeup.jpg` 为同一状态的局部截图。
- `main-canvas-55.jpg`、`mixed-hover.jpg` 记录 55% 缩放及连线上下文；最后恢复 100%，节点拖动与缩略图内操作互不干扰。小地图显示 3 个节点。
- 改名为「西瓜雨伞公交站新名称」后，接收节点立即同步名称。图片历史从第 1 项切到第 2 项后，预览同步为 image-node-2.png。
- 指针移除 Text 只删除对应输入边，保留 Image 和节点位置；聚焦画布后撤销恢复。键盘移除 Text 后焦点回到节点，可立即撤销。指针移除 Image 后保留 Text，撤销恢复两条连接。刷新后两种预览和连接仍存在。
- 锁定时仍可展开 Text 查看，没有移除按钮；解锁恢复。减少动态效果下过渡为 0s，结束已恢复系统媒体设置。预览内滚轮前后 viewport transform 不变。

## 生成与共享回归

临时拦截 `/api/text`，分别模拟上游与接收节点完成，未调用付费模型。接收节点的请求确实包含上游文本和一张当前选中图片；等待期间及完成后均显示两个预览，见 `generating.jpg`。结束已清除拦截，无活动任务。

通过 Image 输出拖线建立临时下游 Image，验证原有 Image 预览名称、图片 URL 与显示正常，见 `image-regression.jpg`；之后通过正常画布删除操作清理临时节点。结束保留 3 节点、2 连线，接收 Text 选中且未锁定。

自动测试覆盖输入预览顺序与执行顺序一致、上游改名和图片历史变化、不修改输入边、缺失输出的占位状态。最终 `npm run check` 结果见 `.codex/text-references-check.log`。
