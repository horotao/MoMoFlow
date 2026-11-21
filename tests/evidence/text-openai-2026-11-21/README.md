# Text 接入 OpenAI · 2026-11-21

用户已确认复用现有 `.env.local` 的 `OPENAI_API_KEY`。仅检测与使用已有配置，没有创建、轮换或写入 Key，也没有把 Key 写入前端、截图或本记录。

官方资料与认证模型目录核对了三个实际 API 标识：

- GPT-6.2 Sol：`gpt-6.2-sol`
- GPT-6.1 Terra：`gpt-6.1-terra`
- GPT-6 Luna：`gpt-6-luna`

参考：[官方模型目录](https://developers.openai.com/api/docs/models)、[Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol)、[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)、[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[流式事件](https://developers.openai.com/api/docs/guides/streaming-responses)。

## 真实 API 检查

三个模型都通过本地实际 `/api/text` 路径访问 OpenAI Responses API。没有自动重试或模型回退。

| 模型 | 输入与结果 | 覆盖 |
| --- | --- | --- |
| GPT-6.2 Sol | 输入「请只输出四个字：连接成功」，结果「连接成功」。首个增量约 2.49 秒，完成约 2.55 秒。Response ID：`resp_05373df7953d1f02016b016aaeb99c87d1be9a094fc332bfcc`。 | 真实后端调用、认证、模型 ID、流式增量与完成确认。 |
| GPT-6 Luna | 同一测试输入，结果「连接成功」。首个增量约 2.38 秒，完成约 2.47 秒。Response ID：`resp_098dc5c50e3ef5ac016b016aaec4a087d19307cb4383f96c22`。 | 真实后端调用、认证、模型 ID、流式增量与完成确认。 |
| GPT-6.1 Terra | 实际主画布连接 64 × 64 红蓝测试图，输入「请识别参考图左右两半各是什么颜色，只用一句中文回答。」，结果「左半边是红色，右半边是蓝色。」 | 真实浏览器 → Text → 当前图片 → 后端 → OpenAI → 流式文本 → 节点保存。 |

测试图由代码生成，仅包含两块纯色，不含用户素材。图片随后通过原有替换图片操作保存为画布 Blob 素材，保持原连接；刷新后图片自然宽度仍为 64，模型保持 GPT-6.1 Terra、结果不变、MD 格式和 1 条输入连线恢复。

## 浏览器验证

在独立于用户 `127.0.0.1` 存储的 `http://localhost:5173/` 实际主画布中，新建本次验收项目。使用浏览器工具驱动指针、键盘、菜单与文件选择器，不使用隔离测试页代替验收，也没有安排人工实测。

- 新建 Text 默认 GPT-6.2 Sol；旧 GPT-4o 占位选择显示为 GPT-6.1 Terra。
- 模型菜单只列出请求的三个实际模型，保留共用搜索、置顶、键盘及选择结构。
- Terra 真正接收已连接图片，并给出正确颜色结果。
- 等待及输出期间保留块状光标与边框扫光，发送按钮可停止请求；显示文本来自真实增量，不再使用固定演示文本和定时假输出。
- 数量设为 2 后运行会在请求前提示当前只支持一份结果，已有真实结果保留；恢复到 1 后关闭提示。
- TXT／MD 切换和刷新恢复通过。没有重新提交模型请求来测试恢复。

截图：[三模型菜单](models.jpg)、[主画布 Terra 识图结果](terra-vision.jpg)。

## 自动检查与边界

`npm run check` 全部通过：290 项 Node.js 测试、ESLint、类型检查、生产构建、节点文档与补丁空白检查。新测试覆盖三个模型请求体、图片顺序、BYOK 隔离、开发与预览注册、SSE 的 UTF-8／CRLF／分片／多行边界、拒绝无效来源、HTTP 错误、服务商失败、不完整响应、错误模型、断流、浏览器断开后取消服务商连接和凭据脱敏。模拟响应测试不调用真实模型；真实调用范围单列如上。

支持单模型、单份生成；自动选择、多模型与批量生成在提交前提示不支持。Tools 等原占位图标保持占位。Text 请求不进入图像任务队列。线上路由已接入原有 BYOK 入口且不使用服务器默认 Key，但本轮没有提交、推送、部署或生产验证。流式增量不持久化，只有完成事件才保存结果；失败或停止保留上一次成功结果。
