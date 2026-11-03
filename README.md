# Cua Kit

独立 TypeScript Cua SDK、持久 JavaScript 运行时和 MCP 服务。已实现第一条受控 Chromium 链路；原生 macOS 与现有浏览器扩展仍在开发范围内，尚未实现。

- [架构 RFC](docs/RFC-0001.md) · [源码行为分析](docs/SOURCE-DEEP-DIVE.md)
- [Agent 调用架构、接口与 demo](docs/AGENT-INTEGRATION.md)
- [实现状态与完整目标](docs/IMPLEMENTATION-STATUS.md)
- [飞书架构评审文档](https://my.feishu.cn/docx/YTspdmiproITEexFFNBcyHGtn2b)

```bash
npm ci
npx playwright install chromium
npm test
```

`npm test` 构建并测试真实浏览器、持久 QuickJS、MCP stdio 和模型适配器闭环。真实模型 demo 的环境变量与命令见调用侧文档。

浏览器支持 AX 观察、元素引用、输入、点击、滚动、截图、导航与基本生命周期。SDK 必须由宿主提供 authorize 回调。MCP 进程使用 CUA_ALLOWED_ORIGINS 配置动作/读取授权；这不构成页面网络隔离。

本仓库包含独立编写的实现，不包含 OpenAI 私有源码副本、运行时二进制或凭证。同名接口不代表已通过 unified-computer-use 全量兼容测试。RFC 中早期“设计阶段”描述是历史基线，以实现状态文档为准。
