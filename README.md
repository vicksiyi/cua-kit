# Cua Kit

**当前方向：源码还原。** 按用户最新要求，直接从本机 unified-computer-use 相关混淆 JS / .d.ts 还原可读 TypeScript，按原包边界组织 `@core/*` workspace，源码 import 不带 `.js`。首批源码、来源映射与差分验证见 [reconstruction](reconstruction/README.md)。完整还原仍在进行，不能把旧独立实现视为原代码。

当前已接通 `@core/browser` 的 `setupBrowserRuntime` 客户端入口，覆盖原注册表、工厂、Browser/Tab、Playwright 与能力装配；235 项测试通过（含模型/MCP 接入验证）。该入口依赖宿主 `nodeRepl.rpc`，底层服务、Sky/cua-repl 和独立 MCP/AgentLoop demo 尚未完成。源码还原验证使用 `npm run check:reconstruction` 与 `npm run test:reconstruction`。

DeepSeek 调用侧 demo 已独立为 `@core/agent-loop`，支持替换模型与 MCP 服务，见 [运行说明](packages/agent-loop/README.md)。模型协议/MCP 回环测试通过，真实 DeepSeek 调用仍待本机凭据定位；这不表示还原后端已接通。

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

## Source reconstruction: credential observation

Restored shared credential observation state and C_ gate, including broker resumption, concurrent observation drain, protected-document tracking, navigation and manual-saving continuations. Differential tests compare installed source behavior and method descriptors. 216 tests pass with type checks; actual native credential broker and execution-context assembly remain pending.

## Source reconstruction: authority builder

Restored bf authority accumulation/execution, navigation URL policy and security-mode gate routing. Preserves concurrent policy/preparation and serial approvals, specialized denial wrapping and audit fields. 221 tests pass with type checks. Real approval providers and full security/context assembly remain pending.

## Source reconstruction: approval preparation

Restored shared elicitation/error/audit helpers and history, file-transfer and full-CDP approval preparation. 225 tests pass with type checks. Origin/asset/WebMCP approval orchestration and complete security/context assembly remain pending.

## Source reconstruction: asset and WebMCP approvals

Restored page-assets/cross-origin asset fetch and WebMCP approval preparation, including sanitized page metadata and original structural JSON validation. 228 tests pass with type checks. Origin review orchestration, full security facade and production host remain pending.

## Source reconstruction: origin approval

Restored origin policy checks and approval orchestration over the shared guardian cache: concurrent review sharing, post-review policy/cached-identity revalidation and retry behavior. 231 tests pass with type checks. Full security facade, site-status provider and production host/context remain pending.

## Source reconstruction: site status

Restored site-status request construction, backend selection, cache/inflight behavior and blocking audits. 235 tests pass with type checks. Tests inject fetch responses; no live safety backend integration or complete security facade is claimed.
