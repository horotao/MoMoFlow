# Text 输入缩略图与连线动效验收

2026-11-22，对照 Flora 项目 `ns783ydy5pmkn7bdt3nn68t8wd854k38` 的实际 Text 节点；本地主画布使用独立的 `http://localhost:5173/` 浏览器存储，未修改用户 `127.0.0.1` 项目。

## 参考与结果

- Flora 实际生成两次，观察生成前悬停显示、生成后顶部常显和连线反馈；用于移除验证的输入已恢复。`flora-before-hover.jpg`、`flora-generating.jpg`、`flora-reference-hover.jpg`、`flora-wire-frame-a.jpg` 和 `flora-wire-frame-b.jpg` 为实际截图。
- T 使用 Flora 的 Lucide Type 三段路径、16 单位图标，独立 SVG，透明背景。展开为 250ms ease-out，媒体缩放 0.8，移除按钮淡入为 150ms cubic-bezier(.4,0,.2,1)。本地复查无需再改这一部分样式。
- 本地新建并连入未生成 Text，生成前离开节点时 footer opacity=0，悬停后为 1；首次生成后参考区域移动到 surface body，未选中且鼠标离开时 opacity=1。临时验收节点已删除，主画布保留原三节点、两条输入连线。
- 本地 Text 与 Image 两路输入在下游生成期间均复用 Image 的 WorkflowEdge 径向流光。光点位置随帧变化，速度、形状、端口几何与原 Image 实现共用。`local-flow-0.jpg` 至 `local-flow-7.jpg` 为连续捕获帧。
- 两份生成时查看原历史项，两条入线继续播放；一份完成而另一份仍待完成时继续播放。全部完成或失败、主动取消及删除生成中的节点后，data-running 和 sweep 均清理。减少动态效果时 sweep 隐藏，连线静态提亮。
- 移除 Text 参考后仅对应连线减少，节点数不变；撤销恢复连线。缩放 55%→66%→55%、小地图展开与收起、实际拖线亦已操作。

## 验证边界

Flora 为实际生成观察。本地通过 CDP 拦截 `/api/text`，模拟成功、失败及悬而未决响应以确定性验证动画生命周期，未发起新的本地付费模型调用。模拟结果有明确的「模拟验收」前缀，当前主画布仍选中原真实生成结果。未提交或部署。

`browser-proof.json` 保存运行状态和显隐检查值；`local-final-idle.jpg` 显示鼠标离开后两类输入仍常显的最终主画布。完整自动检查另见 `.codex/text-input-wires-check.log`。
