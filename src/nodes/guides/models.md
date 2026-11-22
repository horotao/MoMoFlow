# Image 生成模型与渠道

在 Image 内输入提示词，按需连接上游 Image 作为参考图。工具栏提供模型与比例选择，选中单个 Image 后，右侧显示可折叠的「生成选项」浮层。浮层与工具栏共用模型和比例；按模型显示分辨率、背景、画质及 PNG / JPEG 输出，不展示审核、水印等低频参数。费用由实际 API 渠道结算。

工具栏与生成选项共用比例列表：自动、1:1，横向 3:1 / 21:9 / 2:1 / 16:9 / 3:2 / 4:3 / 5:4，纵向 4:5 / 3:4 / 2:3 / 9:16 / 1:2 / 9:21 / 1:3。两处按模型与渠道筛选；APIMart EXT 不展示 2:1、1:2、3:1、1:3、9:21，标准版与 OpenAI 可选全部。切换到不支持当前比例的模型或渠道时恢复自动比例。OpenAI 的 9:21 与其他比例使用同一套精确比例尺寸预设，1K / 2K / 4K 分别为 768×1792、864×2016、1632×3808。

节点内的生成按钮使用当前提示词、参考图、参数和数量提交任务。当前执行入口接入 GPT Image 2.6、Seedream 5.5 和 Nano Banana 2.1；选择器内其他模型、自动选择或多模型模式仍由运行前校验提示不支持。Seedream 与 Nano Banana 的设置分别保存在 `composer.modelSettings`，切换模型后保留；GPT Image 沿用节点已有设置，官方渠道将比例和分辨率转换为像素尺寸。OpenAI 的比例为「自动」时仍可选择 1K / 2K / 4K，此操作同时将比例设为 1:1；选择固定比例后可独立调整分辨率，重新选择自动比例则恢复自动尺寸。APIMart 支持自动比例与分辨率独立选择。

GPT Image 的生成选项提供「渠道商」，可切换 OpenAI 官方与 APIMart。切换时同步转换尺寸并保留分辨率，随节点保存且可撤销；运行时只使用所选渠道的接口与凭据，不自动回退。新建 Image 的初始配置为 APIMart、EXT、Sunburst、1:1、1K、中等画质、PNG；切换到 APIMart 时默认使用 EXT，已有项目保存的标准版选择保留。Seedream 与 Nano Banana 继续使用原有 APIMart 接口，不展示此切换项。渠道凭据在左侧「更多 → API 设置」配置。

用户修改工具栏或生成选项中的模型、渠道、比例、分辨率、背景、画质、输出格式，以及生成数量时，同步将生成偏好保存到当前浏览器的本地存储。之后通过各创建入口添加 Image，使用最近一次修改的参数，并保留各模型的高级设置；刷新或切换项目后仍生效。仅查看、选中或恢复已有节点不覆盖偏好。新节点的提示词为空，不复制图片、连线、锁定或其他画布状态。旧预设可从已有 API 尺寸恢复比例；存储不可用或预设损坏时回退到初始配置，不影响节点创建和编辑。

连入参考图片的节点按[参考图比例规则](shared-ui.md)同步比例与 API 尺寸，此时参考图匹配优先于新建预设。分辨率、渠道、画质等仍沿用节点设置；自动匹配不写回全局生成偏好。修改自动跟随节点的其他高级参数时，也保留上次手动选择的默认比例；只有手动改比例才更新该偏好。

[CanvasImageNode](../CanvasImageNode.tsx) 将界面状态接入画布，[执行图](../executionGraph.ts) 校验输入，[工作流执行器](../workflowExecution.ts) 调度生成。结果追加到节点，可切换、下载及用于下游 Image。任务错误和手动重试通过任务队列反馈。

队列名称使用本次任务的实际模型快照，区分 GPT Image 2.6 Sunburst／Flare／EXT、Seedream 5.5 和 Nano Banana 2.1，不使用 Image 的存储类型或自定义节点名称。排队时即显示所选模型，运行和结束后保持一致；之后切换节点模型不改写已有任务。Seedream 分组任务继续附带「原图 N/M」。

## Text 模型

Text 支持 `gpt-6.2-sol`（GPT-6.2 Sol）、`gpt-6.1-terra`（GPT-6.1 Terra）及 `gpt-6-luna`（GPT-6 Luna）。三者均通过 OpenAI Responses API 接收文本与 PNG／JPEG／WebP 图片、输出流式文本；按右侧思考强度发送 `reasoning.effort`，不发送不兼容的 `none`、温度或 Chat Completions 参数。每次最多 16 张参考图，文本合计最多 128000 字符，最多输出 16384 tokens（含推理 tokens），服务端超时 300 秒。不提供自动模型回退或自动重试。

接口返回真实文本增量，扫光仅表示请求仍在进行，不伪造字词或固定生成时间。TXT 和 MD 仅切换显示方式，不改变提交给模型的提示词或最终文本。[官方模型目录](https://developers.openai.com/api/docs/models) · [流式响应](https://developers.openai.com/api/docs/guides/streaming-responses)

Text 的数量控件支持每次 1–20 份，每份是一笔独立的模型请求，沿用当前 Key／Base URL；节点内最多三份同时执行。参考图只读取并编码一次，后续份数使用同一输入快照。结果逐份进入现有历史组件，具体失败、取消和保存规则见[Text 生成](workflow.md#text-生成)。

Text 右侧生成选项可选思考强度 `low`／`medium`／`high`／`xhigh`／`max`，直接发送为 Responses `reasoning.effort`。新建默认 `medium`，旧记录缺省保持 `low`；历史结果保存并恢复生成使用的强度。网络搜索与费用估算已接入。[思考强度参数](https://developers.openai.com/api/docs/guides/reasoning)

Text 模型菜单在名称旁显示静态预计时长：Sol、Terra 约 20 秒，Luna 约 10 秒。此数值用于界面参考，不是服务商承诺或实测基准；实际耗时随提示词、思考强度及输出长度变化。

右侧「网络搜索」使用「关闭／开启」下拉，默认关闭；开启后在同一个 OpenAI Responses 请求中传入 `tools: [{ type: 'web_search' }]`，由模型按问题决定是否搜索。关闭时不携带工具，不更换模型、Key 或 Base URL。设置保存在 `textComposer.webSearch`，整批生成使用启动时快照，历史记录保存并恢复当次开关。旧节点与旧历史缺省视为关闭。失败仍沿用原有错误处理，不自动重试、不退回无搜索生成。[OpenAI 网络搜索](https://developers.openai.com/api/docs/guides/tools-web-search?api-mode=responses)

服务端保留完成响应的 `url_citation` URL、标题与文本范围，过滤非 HTTP(S) 和无效范围；TXT 与 MD 都显示可点击行内来源链接。引用与原文一起保存在历史中，切换格式或刷新不丢失。上游 Text 作为提示词输入时把来源标记展开为包含真实 URL 的 Markdown 链接。

Text 费用通过 [textPricing](../textPricing.ts) 按 2026-11-21 官方美元标准单价计算。每百万 tokens 的输入／缓存读取／30 分钟写入／12 小时写入／输出：Sol 为 2／0.1／2.5／5／10，Terra 为 1／0.05／1.25／2.5／5，Luna 为 0.1／0.01／0.125／0.25／0.5；搜索为 $0.01／次。缓存写入为独立输入费率，不重复叠加普通输入；输出用量已含推理，不另加推理 tokens。搜索采用 `tool_usage.web_search.num_requests` 的可计费次数，不按输出中的搜索条目、打开网页或引用数量推断。

生成完成后保存 API 实际 `usage`、计费搜索次数、当时生效的费率、价格日期与金额，展示为「本次花费」。标准、Fast／Priority、Flex 分别按 1／2／0.5 倍模型费率；超过 272K 输入的非搜索请求，按全请求输入与缓存 2 倍、输出 1.5 倍计费。搜索多轮汇总超过该阈值时，无法从总用量判定各轮档位，保留用量而不伪造总金额。第三方 Base URL、未知档位、无有效用量、缺失搜索计费次数时，总金额保持未知；旧历史不追溯估价。金额为实际用量按官方公开价计算，未对账到组织账单，不含合同折扣与税费。来源：[模型目录](https://developers.openai.com/api/docs/models)、[定价](https://developers.openai.com/api/docs/pricing)、[Responses 用量](https://developers.openai.com/api/reference/resources/responses/methods/create)。

生成前「预计费用」是整批预估，包含当前文本（含上游引用 URL）、每张参考图约 1536 input tokens、每份 512 output tokens，以及思考强度对应的 128／768／3072／6144／12288 reasoning tokens。文本按 ASCII 约 4 字符／token、非 ASCII 约 1 字符／token并加 32 tokens 开销；开启搜索时，每份按 1 次搜索和约 2304 额外 input tokens 估算。不假定缓存命中；估算不是上限或报价，实际费用取决于真实用量。
