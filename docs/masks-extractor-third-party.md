# Masks Extractor 第三方说明

浏览器分割使用 Hugging Face Transformers.js（Apache-2.0）及其 ONNX Runtime 依赖。依赖版本固定在 `package.json` / `package-lock.json`，按 npm 锁文件安装，不引入服务端推理。实现参考以下公开接口与演示；模型文件运行时下载，不提交到仓库。

- Transformers.js: https://github.com/huggingface/transformers.js ，版权与 Apache-2.0 许可证见该仓库及安装包 LICENSE。
- 浏览器交互与特征缓存示例: https://github.com/huggingface/transformers.js-examples/tree/main/segment-anything-webgpu ，Apache-2.0。项目中的节点、选区合并、取消、持久化和导出适配为本仓库实现。
- SlimSAM ONNX 权重: https://huggingface.co/Xenova/slimsam-77-uniform ，模型卡标注 Apache-2.0；使用 FP16 编码器和解码器，固定 revision `d827ef0`。
- SlimSAM 原项目: https://github.com/czg1225/SlimSAM 。模型下载、缓存和 GPU 初始化与推理性能取决于浏览器、设备及网络。

参考 Weavy Masks Extractor 的端口布局、Image / Mask 视图和 Shift 添加 / Alt+Shift 减去交互；并未假设 Weavy 使用同一个模型，也不宣称分割结果逐像素一致。节点图标依照本次读取的参考界面 SVG 对齐。
