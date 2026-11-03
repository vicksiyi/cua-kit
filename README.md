# Cua Kit

**当前方向：源码还原。** 按用户最新要求，直接从本机 unified-computer-use 相关混淆 JS / .d.ts 还原可读 TypeScript，按原包边界组织 `@core/*` workspace，源码 import 不带 `.js`。首批源码、来源映射与差分验证见 [reconstruction](reconstruction/README.md)。完整还原仍在进行，不能把旧独立实现视为原代码。

当前已接通 `@core/browser` 的 `setupBrowserRuntime` 客户端入口，覆盖原注册表、工厂、Browser/Tab、Playwright 与能力装配；167 项差分测试通过。该入口依赖宿主 `nodeRepl.rpc`，底层服务、Sky/cua-repl 和独立 MCP/AgentLoop demo 尚未完成。源码还原验证使用 `npm run check:reconstruction` 与 `npm run test:reconstruction`。

下面是此前独立实现的历史说明：

独立 TypeScript Cua SDK、持久 JavaScript 运行时和 MCP 服务。已实现第一条受控 Chromium 链路；原生 macOS helper 已有初步实现、尚待权限下的动作验收；现有 Chrome 扩展已打通真实传输与共享 SDK，完整兼容仍在验证中。

- [架构 RFC](docs/RFC-0001.md) · [源码行为分析](docs/SOURCE-DEEP-DIVE.md)
- [Agent 调用架构、接口与 demo](docs/AGENT-INTEGRATION.md)
- [现有 Chrome 扩展接入](docs/CHROME-EXTENSION.md)
- [持久运行时、取消与额度](docs/RUNTIME-LIFECYCLE.md)
- [浏览器状态、frame 与取消验证](docs/BROWSER-CORRECTNESS.md)
- [原生 macOS 构建与验收](docs/NATIVE-MACOS.md)
- [实现状态与完整目标](docs/IMPLEMENTATION-STATUS.md)
- [飞书架构评审文档](https://my.feishu.cn/docx/YTspdmiproITEexFFNBcyHGtn2b)

```bash
npm ci
npx playwright install chromium
npm test
```

`npm test` 构建并测试真实浏览器、持久 QuickJS、MCP stdio 和模型适配器闭环。真实模型 demo 的环境变量与命令见调用侧文档。

浏览器支持 AX 观察、元素引用、输入、点击、滚动、截图、导航与基本生命周期。SDK 必须由宿主提供 authorize 回调。MCP 进程使用 CUA_ALLOWED_ORIGINS 配置动作/读取授权；这不构成页面网络隔离。

旧 `src/` 是独立编写的实现；新 `packages/` 是依据本机安装包构建产物还原的代码，来源与改写记录另行标注。仓库不含运行时二进制或凭证。同名接口不代表已通过 unified-computer-use 全量兼容测试。RFC 中早期“设计阶段”描述是历史基线，以实现状态文档为准。

Browser clipboard paste: [host adapter, sequence diagram and verification limits](docs/CLIPBOARD.md). For managed macOS Chromium, configure `nativeHelperPath` and `headless:false`; MCP/demo uses `CUA_NATIVE_HELPER_PATH` plus `CUA_HEADLESS=false`.
