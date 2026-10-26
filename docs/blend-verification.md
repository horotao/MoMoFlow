# Blend 与 Weavy 的合成效果核验

核验日期：2026-10-26。目标是当前 Weavy 的实际输出，不是所有软件共用的抽象“Photoshop 模式”。不同软件的工作色彩空间、透明图层处理和模式变体会改变结果。

## 证据与覆盖

- 在 [Weavy 工作流](https://app.weavy.ai/flow/8nU8k0wmQLW5sxuQ6ZoW9D) 实测全部 18 种模式，每种使用 0%、1%、25%、50%、63%、100% 节点透明度。
- 两张经用户批准上传的 144×144 测试 PNG，包含 256 对颜色和 81 对像素 alpha，覆盖黑、白、灰、原色、近边界颜色及全透明、低透明度、半透明、不透明像素。每个输出有 20,736 像素。
- 通过 Preview 的 Download image 获取 108 张实际 RGBA PNG；没有把已叠加棋盘格的预览当作透明图片参照。原始 RGBA 压缩保存在 `tests/fixtures/blend-weavy.rgba.bin`，布局、来源、日期及 SHA-256 见旁边的 JSON。
- 检查浏览器实际加载的渲染模块中可读的混合 shader，交叉确认工作空间、模式公式与透明合成顺序。实现为独立 TypeScript，没有将第三方二进制或整份 shader 加入仓库。
- 另采集原工作流 768×1376 照片的同一组 108 个预览，用于观察真实图像效果。它的输入来自 8 位预览，不能还原上游 Color correction 的全部内部精度，因此只作为补充诊断，不作为严格金标准。

## 采用的兼容行为

1. sRGB 输入先转换为线性 RGB，混合与节点透明度均在线性 RGB 中计算，最后转换回 sRGB。
2. Add 在透明度合成后才钳制到可显示范围；Soft Light 的提亮分支使用平方根变体。
3. Color Burn 的 Front=0 返回 0，Color Dodge 的 Front=1 返回 1；Divide 使用 `Back / max(Front, 0.0001)`，因此黑除以黑为黑。
4. Hue、Saturation、Color、Luminosity 使用线性 RGB 上的 HSL 分量。当前 Weavy 的饱和度分母始终为 `2-max-min`，暗部也如此；这不是标准 HSL 的暗部分支，代码明确保留此兼容行为。
5. Weavy 先以底图颜色计算混合色，再以 source-over 合成这层颜色。它没有 W3C 混合公式中的“仅前景覆盖区域直接保留前景原色”项。因此透明底图上的 Multiply 等模式也可能变暗。这是实测兼容行为，并非通用 Canvas 规范要求。
6. 读取输入时保留非预乘颜色，内部 Canvas 使用 float16 存储，防止极低 alpha 像素先量化成 8 位预乘颜色后，在 Burn、Dodge、Divide 等模式中被放大。合成计算仍使用 JavaScript 数值，输出数据为 RGBA8。浏览器不支持 float16 Canvas 时提示更新，不静默输出失真的结果。Canvas 配置定义见 [HTML 标准](https://html.spec.whatwg.org/multipage/canvas.html#canvasrenderingcontext2dsettings)。
7. 输出修订号更新为 `blend-v2-weavy-linear`，旧算法缓存立即失效并重新生成。

## 独立参照结果

`/tests/blend-modes.html` 通过与产品相同的 Image → ImageBitmap → Worker → PNG 路径完成 108 组对照，共 2,239,488 像素。18 种模式全部通过。

颜色误差以 `abs(RGB实际×alpha实际 - RGB参照×alpha参照) / 255` 衡量，单位为 8 位色阶。这样衡量像素对显示结果的贡献，不把完全透明像素中不可见的 RGB 当作严重视觉差异。alpha 另行检查。

| 指标 | 实测 | 上限 |
| --- | ---: | ---: |
| 全部输出平均颜色误差 | 0.0406 / 255 | — |
| 最差单张输出平均颜色误差 | 0.1085 / 255 以下 | 0.12 / 255 |
| 单通道最大颜色误差 | 6 / 255（Divide 边界） | 6.01 / 255 |
| alpha 最大误差 | 1 / 255 | 1 / 255 |
| PNG 与 Worker 预览最大颜色误差 | 0.938 / 255 以下 | 1 / 255 |
| PNG 与 Worker 预览 alpha 误差 | 0 | 0 |

差异没有做到逐字节为零：Weavy GPU 存储、PNG 量化以及浏览器浮点 Canvas 的取整路径会留下小差别。检查同时约束均值与最差像素，避免平均值掩盖边界错误。照片预览另存在输入精度丢失，特别是近白色 HSL 边界，不能用它宣称逐像素完全一致。

完整数值见 `artifacts/blend/weavy-worker-audit-20261026.json`，浏览器结果截图为同名 PNG；照片诊断见 `weavy-opaque-audit-20261026.json`，前后视觉对照见 `weavy-comparison-20261026.png`。旧的 2026-10-25 九模式记录保留为历史证据，不代表当前实现状态。

节点浏览器验收 33 项通过，包括 4K 原尺寸 PNG、撤销重做、保存恢复、队列、连接与锁定；另实际操作验证拖动及坐标、重新连线、缩放、小地图、明暗主题、模式键盘选择和 50% 透明度输入。记录见 `artifacts/blend/blend-acceptance-20261026.json`。`npm run check` 的 253 项测试、lint、类型检查、构建、文档与补丁检查均通过。

Weavy 工作流中保留了两个测试 Import、一个 Blend 和一个 Preview，便于复查；测试素材为 `back-alpha.png` / `front-alpha.png`。原有 Blend 已恢复为 Luminosity、100%，原有 Color correction 的 Exposure 为 2.43。

## 复验命令

- `npm test`：包含逐通道穷举、全部 alpha 对、模式边界、输出失效以及 18 项独立 Weavy 导出金标准测试。金标准文件不由本地公式生成。
- `npm run dev` 后打开 `/tests/blend-modes.html`：真实 Worker、108 张 PNG 与预览；页面自动运行并显示逐模式结果。
- `/tests/blend.html`：节点控件、队列、原尺寸和 4K PNG、撤销重做、IndexedDB、连接与锁定。使用独立测试数据库。
- `npm run check`：项目完整质量检查。它不会运行上述浏览器页面，需要分别验收。

本次参照覆盖静态 sRGB PNG 与现有照片工作流，不保证 HDR、广色域 ICC、不同缩放采样器或 Weavy 后续版本的输出完全相同。未调用模型或付费生成服务。
