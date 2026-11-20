# 生成状态

2026-11-20，在用户授权下实际运行 Flora 的 Seedream 5.5 节点一次，观察生成及完成过程后，在快照组件中还原。后续本地演示和核验没有再次调用模型，MoMoFlow 真实画布未改动。

## 复用

`ImagePromptNode` 新增 `generation` 和 `result` 参数。宿主决定开始、进度及结束；组件只负责表现，不自行发起请求。

```tsx
import type { ImagePromptGenerationState } from './components/image-prompt-node/ImagePromptGeneration';

const [generation, setGeneration] = useState<ImagePromptGenerationState | null>(null);

// 启动一次运行时设置；不要在每次 render 时重建开始时间。
setGeneration({ id: runId, startedAt: Date.now(), estimatedSeconds: 25 });

<ImagePromptNode
  generation={generation}
  onGenerate={handleGenerate}
  result={resultUrl ? <img src={resultUrl} alt="" /> : undefined}
/>

// 结果到达后，更新 resultUrl，并调用 setGeneration(null)。
```

每次运行使用新的 `id`。`startedAt` 是毫秒 Unix 时间，`estimatedSeconds` 是顶部显示的预计秒数。未提供开始时间时使用准备态，稍后补齐时间线会从当前绘制位置平滑衔接。可选 `progress` 接收 0–1 的明确视觉进度；未提供时按原站的估计时间线推进，上限为 95%。

生成中隐藏输入区、端点和工具栏，在顶部模型位置显示预计用时。内部填充和边缘扫光分层裁切，填充不会覆盖描边。完成后先补满，再移除生成层；不提供 `result` 时恢复原输入区，提供时显示结果内容。

## 已核对的参数

- 边缘：两个相隔 180° 的亮区；每 2.4 秒旋转 360°；初始方向 120°；每侧衰减 60°；暗区透明度 6.3%；描边宽 2 个画布单位。
- 填充：`#fafaf223`，从左向右；曲线 `cubic-bezier(.33, 1, .68, 1)`；时间线为预计时长的两倍，上限 95%。
- 准备阶段：60 秒内线性推进到 5%；时间线校正 280ms，保持当前绘制位置。
- 完成：300ms 补满，生成层保留 400ms；当前项生成完成时，结果图片以 400ms 淡入；历史切换使用独立的约 320ms 双图叠化，不重播生成完成淡入。

参数结合实际浏览器录像、当前页面颜色值和页面已加载渲染模块核对。扫光使用 CSS 合成动画，进度使用 WAAPI 的 `scaleX`，没有逐帧更新 React 状态。减少动态效果时停止旋转并静态显示阶段进度。

## 预览

在项目中运行 `npm run dev`，使用 `/tests/snapshots/image-prompt-node-2026-11-20-v1/tests/image-prompt-node.html`：

- `?generating`：持续显示生成状态；刷新重新开始。
- `?generating&elapsed=6`：从第 6 秒开始观察。
- `?generating&progress=.4`：明确的 40% 填充，扫光仍在循环。
- `?generating&fallback`：准备阶段。
- `?complete`：完成内容。
- 追加 `scale=.85` 或 `scale=1.5`：观察缩放；查询参数之间用 `&` 连接。

普通预览中输入提示词、点击发送，会模拟约 900ms 的请求准备和后续 25 秒运行，再展示完成内容。用于快速核验时可加 `?demoDuration=2`；加 `&returnToPrompt` 则在结束后返回输入态。演示图片 `tests/generation-preview.png` 是本次 Flora 生成结果的录像裁切，组件文件夹不依赖它。

## 记录与验证

[参考录像](evidence/generation-reference.mp4)是本次真实运行早期约 6.4 秒的片段，按捕获时间戳编码，不代表完整任务耗时。[本地还原录像](evidence/generation-local.gif)约 6 秒，循环播放仅用于查看录像。

浏览器输入事件模拟覆盖准备到生成的衔接、95% 停留、明确进度、完成及恢复输入、长文本保留、85% / 100% / 150% 缩放，以及动态切换减少动态效果。返回输入态后仍保留 746 字测试文本、669px 滚动高度和 368px 视口高度；原输入态各部位尺寸与字体已回归。真实调用仅发生在授权的 Flora 参考节点，本地组件没有真实模型或主画布集成。

自动检查使用项目统一入口 `npm run check`；浏览器场景单独运行。
