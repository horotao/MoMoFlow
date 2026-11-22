# Prompt 真实生图与图片编辑

2026-11-22 在独立浏览器存储的实际本地主画布 `http://localhost:5173/` 验证，项目「Prompt 真实生图与编辑验收」，项目 ID `4ed521a3-67d2-4953-a8b4-66fe6423528b`。使用现有本地服务和凭据，APIMart / GPT Image 2.6 EXT（Sunburst），1:1、1K、中等画质、PNG，每次一份。

页面刷新后确认 fetch 为原生实现，上一轮模拟全局不存在。测试只包装 fetch 记录脱敏元数据，并原样调用和返回真实请求；未拦截、替换或伪造响应。没有打印或保存凭据。

第一次点击主画布 Image 的 Generate：Text 手写提示词接入 `prompt`，图片输入数为 0。真实任务 `task_01M80CQ9WTEN43SG4MZPTE1ESP` 返回 completed，生成 1024×1024 红色陶瓷茶壶，1,116,769 字节。Text 保持未生成状态，没有文本模型请求和历史。

将上述结果复制为导入图片节点「原始红色茶壶.png」，以 `result` → `image-0` 接入同一个 Image。Text 改成仅将茶壶改为深钴蓝色、保留造型与构图的编辑指令。第二次点击主画布 Generate：真实图片输入数为 1，任务 `task_01M80CSM207CQ1J0N4MEFP2J29` 返回 completed，输出 1024×1024 PNG、1,155,657 字节。画面可见茶壶从红色变为钴蓝色，形状与构图基本保留。

两次各只提交一次 `/api/apimart/images`，其余为同一任务的状态轮询。结果保存在同一个 Image 的两份历史中，第二份为当前项；Text 未自动运行。两条 Prompt / Image 输入连线均保留。详细请求、任务状态和持久化结果签名见 `real-requests-and-results.json`。

截图 `generation-main-canvas.jpg` 和 `edit-main-canvas.jpg` 均来自真实本地主画布。未修改产品代码，未提交或部署；本轮覆盖该渠道与模型的真实调用，不代表其他模型已真实验证。
