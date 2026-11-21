# Text 输入参考常显与 T 图标修正

用户纠正：生成后的顶部输入参考应当常显。上一次新增的 hover visibility 规则不符合此约定；同时，内联 SVG 误用了 `.image-node-icon` 蒙版样式，继承 `background: currentColor` 后显示成实色方块。

本次移除该隐藏规则，将描边 SVG 改为独立样式。生成前的底部参考仍随操作栏显示；生成中及已有输出时的顶部参考常显。展开、缩放、移除按钮、Image 场景及运行逻辑未变。

在独立存储实际主画布 `http://localhost:5173/` 项目「Text 未生成输入流程验收」复验：节点未选中、未 hover、未 focus 时，参考视口 opacity=1、visibility=visible。SVG 背景 rgba(0,0,0,0)，截图可见描边 T。hover 仍展开，媒体 scale=.8；移出后缩略图仍可见。未调用模型。

`always-visible.jpg` 为完整主画布，`node-closeup.jpg` 为节点区域截图。
