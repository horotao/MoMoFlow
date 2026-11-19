# 模型节点与渠道

调整模型输入、参数侧栏、上传、渠道兼容或旧工作流迁移时查阅。[返回节点索引](../README.md)

## 模型运行约定

运行前按下文核对当前模型的输入与渠道限制。模型之间共用的依赖解析、结果复用和取消规则见[工作流执行约定](workflow.md#按依赖自动执行与结果复用)，标注原图与 Mask 的限制见[交互编辑](painting-masks.md#交互编辑)。

## 图像描述

Image Describer 运行前需要至少一张有效的上游图片和非空模型值；当前实际接入的描述模型为 `deepseek-flash`。图片按输入端口编号排序，生成文本写回 `data.text`。

使用 API 设置中的 DeepSeek Key 时，[describerClient.ts](../describerClient.ts) 先检查所有图片（JPEG、PNG、GIF、WebP，最多 14 张，单张 64 MiB，合计 200 MiB），再按顺序将原图直传到同一配置地址的 `/files`。文件在创建 1 小时后过期。上传完成后 `/api/describer` 只接收文件 ID 和系统指令，[deepseek.ts](../../../server/deepseek.ts) 用 `file` 内容块调用对话补全。上传失败或取消时不提交描述请求，也不回退内联图片。仅本机未配置用户 Key、使用 `.env.local` 默认 Key 时保留原内联路径。

## GPT Image 2.6

Sunburst 运行前必须连接非空 Prompt，栅格输出时参考图片和 Mask 可选。SVG 输出仅支持 Prompt 文生图，连接参考图片或 Mask 会在执行任何上游模型前报错；每个请求 n=1，OpenAI SVG 请求显式使用 `svg.model: gpt-6.1-terra` 编写矢量 XML，顶层模型仍为所选 Flare / Sunburst；栅格格式省略此参数。`vectorSvg.ts` 使用 saxes 解析并验证纯矢量 XML，拒绝内嵌位图、脚本、动画及外部资源。服务端和客户端均校验，结果使用 image/svg+xml Blob 和 .svg 名称，预览、原文件下载、ZIP 与 IndexedDB 保留原始矢量字节，不经 Canvas 栅格化。SVG 不能直接作为模型图片参考输入。连接了 Image 时，执行器会先准备所需上游，提交图片模型请求前必须取得有效图片；使用 Mask 时还必须连接参考图片，且 Mask 只能提供一张图片。图片格式、尺寸及参数限制由 `sunburst.ts`、`sunburstClient.ts` 和服务端共同校验，不应只依赖界面限制。成功结果追加到 `results`，并更新 `activeResultId`。多张结果时，页码前的图标可切换单张预览与全部图片；全部视图与文件导入共用 [shared/NodeImagePreview.tsx](../shared/NodeImagePreview.tsx) 的两列瀑布流（8px 内边距、4px 列距），点击缩略图选择输出结果，双击打开全屏。视图切换仅影响当前预览，不改变已选结果。下载按钮同样复用 File Node：单张视图下载当前图片，全部图片视图按当前排序将所有结果打包为 `images.zip`。

GPT Image 2.6 的 Sunburst / Flare 在 OpenAI 渠道的生图、编辑请求均由服务端显式附加 `moderation: 'low'`，新旧节点统一生效；画质、背景、尺寸及输出格式沿用原有设置。

Sunburst 的单张预览框在生成前即按有效宽高比调整高度，支持预设和自定义尺寸。节点宽度保持一致，高度随预览变化，并为输入端口保留最小空间。自动比例或无效的尺寸草稿使用当前结果的实际比例；无结果时使用正方形。已有结果在新比例内完整显示，尺寸调整不修改图片、下载或下游输出；全部图片视图保留网格布局。

Sunburst 的 Order by 菜单复用 File Node 的 Date added / Name 排序，排序偏好保存在节点数据中；排序只改变预览顺序，不改变当前输出或原始结果顺序。全部视图中可将缩略图拖到空白画布，复用 `extractFileAsset` 将图片移至新的 File 节点；原节点至少保留一张结果，若移走当前输出则选中剩余的最新结果。创建与移出作为一次撤销记录，取消拖动、落在非画布区域、节点删除或锁定时不执行。

## 渠道与尺寸

- Sunburst 的右侧渠道商提供 OpenAI 官方与 APIMart。打开旧画布或粘贴旧节点时，显式使用 ZenMux 的节点迁移到 APIMart GPT Image 2.6 标准版，保留原像素尺寸、背景、输出格式、结果及媒体和提示词连线。GPT Image 2.6、Nano Banana 和 Seedream 分别记住当前浏览器最近一次在右侧面板设定的有效生成参数，新建同类节点时沿用，跨画布和刷新保留。没有预设时，GPT Image 2.6 使用 APIMart GPT Image 2.6 EXT、Sunburst 版本和 medium（中）画质，Nano Banana 和 Seedream 使用各自的默认值。每个节点独立保存自己的参数；预设只记录本地生成参数，连线和结果随各自节点保存。未保存渠道的旧节点使用 OpenAI。渠道随节点保存、复制与撤销恢复，运行快照固定渠道，服务端使用该渠道的 API 设置或服务端默认配置。两个渠道提供 auto / low / medium / high / xhigh / max 六档画质。

- Sunburst 的 OpenAI 渠道将宽高比与 1K / 2K / 4K 分辨率预设统一编码到 `data.size`，不另存可能冲突的比例/分辨率状态。`sunburstSizePresets` 保持旧 1K 尺寸，按精确比例、16 像素对齐、3840 边长与 8,294,400 像素上限生成高分辨率；正方形最高 2880×2880。宽高比菜单提供自动和自定义。自动尺寸下没有选中的分辨率档位，自定义尺寸下隐藏分辨率。预览、执行快照、服务端与保存恢复均沿用实际尺寸。
- APIMart 渠道增加“渠道模型”选项（`channelModel`）：GPT Image 2.6 EXT / GPT Image 2.6；未保存该字段时继续使用 EXT。EXT 使用 `gpt-image-2.6-ext` 和 `version: sunburst / flare`，保留原有 10 种比例和 1K / 2K / 4K，输出格式可选 PNG / JPEG / GIF；不支持自定义尺寸、背景、审核强度或 Mask，GIF 仅文生图、比例为 auto，SVG 保持禁用。新款使用 `gpt-image-2.6-sunburst / flare`，不发送 `version`，支持 15 种比例或符合 OpenAI 同等限制的自定义像素尺寸、背景和静态编辑的 PNG `mask_url`；精确尺寸不发送 `resolution`。两款的复杂度固定为 auto、内容审核固定为 low，侧栏不再提供这两项控件或暴露输入；旧节点和直接请求中的对应值不会覆盖固定值。复杂度 auto 沿用接口默认值，不发送 `complexity`；新款显式发送 `moderation: low`，EXT 不支持该参数而不发送。两款均使用 `nsfw_check: false`、`n: 1`，参考图先按顺序上传 `/uploads/images?retention_days=3`，再向 `/images/generations` 发送 `image_urls`；新款的蒙版使用 PNG Data URL，沿用首图同尺寸、Alpha 透明区域可编辑的校验和白色亮度蒙版转换。已有不兼容连线保留禁用端口供断开或切回，运行前拒绝无效组合。参考图单张最多 20 MiB；EXT 仅 1K 接受 GIF 参考图，新款各档接受 GIF 参考图。
- APIMart 新款支持参考图生成 GIF / SVG，两者均禁用 Mask。GIF 侧栏提供 `frameCount`（2–16，默认 9），请求使用 `frame_count`；尺寸为 auto（512×512）或自定义单帧像素，不接受比例名，不发送分辨率。按帧数校验 4×2 / 3×3 / 4×3 / 4×4 拼图的 3840 单边、8,294,400 总像素和 3:1 比例限制。SVG 侧栏提供 `svgModel`（默认 `gpt-6-luna`，可选 `gpt-6.1-sol`）和 `svgEffort`；请求使用必填 `svg.model` 及可选 `svg.reasoning.effort`。Luna 支持 none / low / medium / high / xhigh / max，Sol 不支持 none，两者不提供 minimal；自动时省略 reasoning，切换模型会将不兼容的本地 effort 复位为自动。浏览器直接下载结果并校验 SVG，保留原始矢量文件。渠道模型、帧数和 SVG 参数会冻结进任务及复用签名，并随保存、复制与撤销恢复。OpenAI 的原有参数和 SVG 写作模型不变。
- APIMart BYOK 参考图由浏览器直传 `POST /v1/uploads/images?retention_days=3`（multipart `file`），读取顶层 `url`；新款的 PNG Mask 经透明度及尺寸校验后同样直传（上传上限 30 MiB）。全部文件在首次上传前校验，保持图片顺序和原始字节；应用 API 仅接收 HTTPS URL 和参数，不承载二进制。上传失败、超时或取消不生成、不自动重试、不回退 Base64。上传域名来自本次 API 配置快照，禁止重定向、Cookie 和 Referer；服务商需允许浏览器跨域认证。仅本地环境变量默认 Key 模式保留旧路径，不暴露服务端密钥。`/api/apimart/images` 返回任务号，`/api/apimart/task` 只查询并返回 `imageUrl`、格式、任务号及可用的过期时间，不下载图片或编码 Base64；浏览器从 CDN 无凭据下载原始字节，校验 MIME、32 MiB 上限及 SVG 内容后创建本地 Blob 素材，继续由 IndexedDB 保存，工作流不依赖临时链接。下载失败保留任务号且不重新生成；CDN 必须允许跨域读取。每 4 秒以 `GET /v1/tasks/{task_id}?language=zh` 查询已有任务，保留中文失败原因；支持 pending / processing / completed / failed / cancelled，远程 cancelled 同步为本地已取消并停止依赖分支。超时继续查询，不重新创建生成，本地取消停止查询。API 设置支持 APIMart BYOK（默认 `https://api.apimart.ai/v1`）及 `APIMART_API_KEY`，连接测试仅查询 `/balance`。自动测试和 `/tests/apimart-provider.html` 均使用受控响应，覆盖 EXT 回归、新款蒙版、自定义尺寸、GIF 帧数、SVG effort、保存恢复和锁定；未调用真实模型。

## 参数侧栏与旧画布

- GPT Image 2.6 参数侧栏最多 300px 宽并撑满画布高度，标题与运行区固定，参数列表独立滚动。下拉框使用 beUI Select 的展开动效，模型版本、分辨率和输出格式用分段控件。所有生成参数都在侧栏本地编辑。渠道和版本继续在运行前校验。运行次数复用 `NodeRangeInput`，仍使用原有的共享次数状态与执行入口。
- GPT Image 2.6 的输出格式不再提供 WebP，新节点若读到旧的 WebP 预设会改用 PNG。已有节点的 WebP 值仍能运行，侧栏标为旧设置，已有 WebP 图片仍能查看和下载。各渠道原有的 GIF、SVG、自定义尺寸和其它参数规则保留。Seedream 5.5 与 Nano Banana 复用同一套侧栏样式、下拉、分段控件和运行次数滑块。两者通过 APIMart 运行，侧栏标题下直接显示模型参数。图像描述和模型选项沿用原有侧栏样式。
- `/tests/right-sidebars.html` 是五类共享参数侧栏及调色板无侧栏行为的独立浏览器验收入口（React / React Flow，`npm run dev` 后打开），使用隔离 IndexedDB 并拦截真实模型请求。可通过页面按钮切换节点，检查标题、滚动、32px 控件、下拉菜单、expose、模型选项和运行区域，以及选中调色板不打开侧栏；原有 Nano Banana 和调色板浏览器验收入口继续用于功能回归。
- `/tests/sunburst-sidebar.html` 是这次侧栏的独立浏览器验收页（React 与现有浏览器测试入口），运行 `npm run dev` 后打开，可检查满高、等宽、键盘操作、本地参数、自定义尺寸和短窗口滚动；隔离 IndexedDB 且拦截真实模型请求。`sunburstRun.test.ts` 和 `connectionRecommendations.test.ts` 随 `npm test` 验证渠道和版本的运行校验及已退役参数端口的连接拒绝。
- 旧画布加载时移除 GPT Image 2.6、Seedream 5.5 和 Nano Banana 的参数端口标记和参数连线。可解析且通过校验的参数组合会转为节点本地设置，校验失败时保留原本地设置。来源节点、提示词、参考图、蒙版和历史结果保留。

## Seedream 5.5（APIMart）

替换 Dock / 右键菜单中的 Seedance 2.0 占位入口，归入图像分类；搜索和拖线推荐同样可创建。依据[接入文档](https://docs.apimart.ai/cn/api-reference/images/seedream-5-5/generation)，模型为 `seedream-5-5`。

[seedream.ts](../seedream.ts) 定义分辨率 1.5K / 2K、JPEG / PNG、内容审核与水印；默认 1.5K、PNG、自动背景、审核关闭、水印关闭。宽高比默认自动，保留原有只发送分辨率档位的行为；可选 1:1、4:3、3:4、16:9、9:16、3:2、2:3、21:9、2:1、1:2，选择比例时同时发送 `size` 和 `resolution`。精确像素在同一菜单中切换，输入正整数宽高，总像素须为 921,600–4,624,220、比例为 1:16–16:1，不要求 16 的倍数。宽高编辑使用本地草稿；停止输入 250ms 后自动取整并校正，不要求失焦或回车。连续输入会重置等待，清空输入及中文合成期间不启动自动校正；离开整个尺寸输入区或按 Enter 仍立即确认，优先等比缩放，超出比例范围时调整至最近的允许比例，再选择符合面积和比例限制的整数尺寸。合法尺寸不变，清空或非正数恢复该边上次提交的数值；校正作为一次参数修改参与撤销，锁定、撤销、切换模式及切换节点会清理草稿和待执行的校正，不触发模型运行。运行前和 API 入口仍严格校验。精确像素只发送 `size`，侧栏隐藏分辨率并保留之前的档位。旧画布缺少 `size` 时按自动恢复，未生成图片时预览随比例或精确尺寸变化，已有结果继续按实际尺寸显示。背景可选自动、透明、不透明，文生图和图生图均支持透明；透明背景必须使用 PNG。切换透明背景时将本地输出格式改为 PNG。不支持 `layer_decomposition` 和 Mask；提示词优化使用默认标准模式。六个参数均在侧栏本地编辑。

必须连接非空提示词（每个请求最多 32000 字符）；参考图片按端口顺序展开集合。运行时补入提示词内有效标注的原图。同一原图的标注合在一个请求中；涉及多张标注原图时，按标注在提示词里首次出现的顺序分组，每个请求只发送对应原图、包含该图标注的指令和单独成段的公共文字，手动图片端口不参与这次分组运行。不同原图的指令可用逗号、句号或换行分隔，无法区分归属的语句在提交前提示调整。只有一张标注原图时，沿用图片端口的参考图顺序，同一标注原图只补入一次；多图请求为坐标加上实际输入图号。每个请求最多 10 张参考图，单张 30 MiB，合计 46 MiB。支持文档列出的 JPEG / PNG / WebP / BMP / TIFF / GIF / HEIC / HEIF，读取与尺寸校验仍受浏览器解码能力限制。参考图总像素不超过 3600 万，按宽高乘积判断，不限制单边 6000 像素。每组计入所选运行次数，成功图片依次存入同一个节点图库。每组独立显示任务状态，任务重试只运行原图对应的一组。结果原始字节、实际尺寸、下游选图输出、复制、锁定、撤销及保存恢复复用图片生成节点约定。

[seedreamRun.ts](../seedreamRun.ts) 建立不可变任务快照，[seedreamClient.ts](../seedreamClient.ts) 校验全部参考图后复用 [apimartUpload.ts](../apimartUpload.ts) 浏览器直传，取得 URL 后请求 `/api/apimart/seedream`。服务端 [seedream.ts](../../../server/seedream.ts) 先校验参数，再由现有 [apimart.ts](../../../server/apimart.ts) 异步接口提交一次；参考图使用 `image_urls` HTTPS URL，避免 Vercel 请求体限制；仅本地无 BYOK、使用环境变量默认 Key 时保留 Data URI 兼容路径。复用 API 设置中的 APIMart BYOK 配置或 `APIMART_API_KEY`，开发和预览均可运行。每 4 秒查询相同任务，查询超时继续等待；失败保留任务编号且不自动重新提交，取消停止本地等待，不代表供应商任务已撤回。

`seedream.test.ts`、`seedreamClient.test.ts` 和 `server/seedream.test.ts` 随 `npm test` / `npm run check` 执行。独立浏览器入口 `/tests/seedream.html` 使用隔离数据库和模拟响应，覆盖参数、端口、生成、下游、失败、取消、锁定、撤销与保存恢复，不调用真实模型。自动检查、浏览器模拟验收与真实付费生图是独立结果。

## Nano Banana

模型固定为 APIMart 的 `gemini-nano-banana-2.1`。必须连接非空提示词（最多 32000 字符），参考图按端口顺序展开，最多 14 张。支持 PNG、JPEG、WebP，单张最多 20 MiB、合计 46 MiB。已连但无结果的图片输入阻止运行。右侧支持自动比例与 14 种固定比例、1K / 2K / 4K 和 PNG / JPEG，保留原参数及端口 ID。

[nanoBananaRun.ts](../nanoBananaRun.ts) 建立运行快照。[nanoBananaClient.ts](../nanoBananaClient.ts) 使用 APIMart 用户 Key 直传参考图并提交 URL；本地服务使用环境变量 Key 时，在服务端上传 multipart 文件。上传成功后以 `image_urls` 提交 `POST /v1/images/generations`，固定 `n: 1`。浏览器每 4 秒查询任务；完成后从 CDN 下载结果并保存为本地图片素材。选择的输出格式由浏览器处理。上传或生成失败时保留已有结果，取消停止本地等待。[生成接口](https://docs.apimart.ai/cn/api-reference/images/gemini-nano-banana-2.1/generation) · [上传接口](https://docs.apimart.ai/cn/api-reference/uploads/images)

`/tests/nano-banana.html` 使用隔离数据库与模拟响应，覆盖文生图、参考图上传、结果查询、图片格式、取消、失败、撤销和保存恢复。

## 旧工作流中的 Ideogram 4.5

保留 `ideogram` 类型及原有输入端口用于恢复旧工作流。模型已下线，节点显示已保存的结果，支持预览、提取、下载及下游复用。节点库、搜索、拖线创建和运行入口已移除。

## API 设置

默认密钥由服务端环境变量读取。左侧 Dock 的“更多 → API 设置”可按渠道保存 BYOK 地址和 Key 到当前浏览器；请求开始时读取对应渠道配置，仅传给本地 API，由服务端发往该地址。清空 Key 并保存会删除当前渠道覆盖，恢复默认服务端 Key 和地址。密钥不放入节点数据、任务快照或工作流导出。纯前端验证和自动化测试不需要真实模型请求；需要验证真实生成时，应明确区分其结果和可能产生的费用。
