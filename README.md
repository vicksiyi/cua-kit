# Cua Kit

**当前方向：源码还原。** 按用户最新要求，直接从本机 unified-computer-use 相关混淆 JS / .d.ts 还原可读 TypeScript，按原包边界组织 `@core/*` workspace，源码 import 不带 `.js`。首批源码、来源映射与差分验证见 [reconstruction](reconstruction/README.md)。完整还原仍在进行，不能把旧独立实现视为原代码。

当前已接通浏览器客户端/服务、`@core/cua/tinyskyAlt`、`@core/sky` 与 `@core/sky/service` 的还原入口，Sky 使用 Mac/Linux/Windows 工厂。NodeREPL 嵌入 JavaScript 的 kernel 与 trusted-worker 入口也已还原，支持子进程中的多单元执行对照验证；原生 supervisor/MCP 生命周期尚未替代。已有真实 Chromium、临时子进程和模拟宿主集成验证；真实原生桌面服务、外部 NodeREPL/AX 资源的完整替代与全部任务验收仍未完成。最新验证与边界见 [IMPLEMENTATION-STATUS](docs/IMPLEMENTATION-STATUS.md)，下方阶段记录保留其当时状态。源码还原验证使用 `npm run check:reconstruction` 与 `npm run test:reconstruction`。

DeepSeek 调用侧 demo 已独立为 `@core/agent-loop`，支持替换模型与 MCP 服务，见 [运行说明](packages/agent-loop/README.md)。真实 DeepSeek → MCP → 还原 worker → 独立宿主 → 隔离 Chromium 已完成导航、点击与读取结果；确定性 MCP 测试另验证截图。当前已在 Chrome 扩展链路实测百度搜索并返回首条链接；App 自主操作仍待系统授权后的完整验收。

新增原安装版 Chrome 扩展源码入口：[`@core/browser-extension`](packages/browser-extension/README.md) 已还原 nativeMessaging 传输、重连及宿主请求处理。它与旧独立实现 `extensions/chrome` 区分；目前独立 native 版与完整 background/UI/kernel 版均可构建，完整版已通过临时 Chromium 的 MCP 操作与真实 DeepSeek 本地页面验证。完整生产认证仍未验收；不要将浏览器操作测试等同于账号、生产部署和全部 API 兼容验收。

## 当前运行路径（2026-11-06）

| 入口 | 后端与已验证范围 | 主要限制 |
| --- | --- | --- |
| `npm run demo -- "prompt"` / `demo:deepseek` | 已连接 Chrome 扩展；真实 DeepSeek 百度搜索已返回结果 | 要求扩展连接，网站验证和页面差异仍可能阻止任务 |
| `--cdp-browser "prompt"` | 无扩展临时 Chromium；真实点击、截图、读取与外网导航 | 本轮结束即关闭；百度搜索可能遇到人工验证码 |
| `--cdp-endpoint 'ws://127.0.0.1:PORT/devtools/browser/ID' "prompt"` | 连接已开启调试的浏览器；测试环境 MCP/DeepSeek 及已有标签页隔离通过 | 必须提供真实本地地址；不自动重启日常 Chrome |
| `--computer "prompt"` | Rust supervisor + 原 Sky 绑定 + Swift IPC；原生清单检查通过 | 当前 agent 的辅助功能与录屏权限未通过，完整真实 App 验收未完成 |

参数放在 `npm run demo --` 或 `npm run demo:deepseek --` 之后。通用 demo 可用 `CUA_MODEL_PROVIDER=openai-compatible` 配置其他兼容模型；DeepSeek 专用入口固定选择 DeepSeek。启动从项目 `.env` 读模型凭证；本地 debug 默认写入 `artifacts/debug/`，不提交 Git。终端会打印日志路径，关闭可设 `CUA_DEBUG=0`。详情见 [CDP 接入说明](packages/cdp-host/README.md) 和 [Agent demo](packages/agent-loop/README.md)。

[飞书当前架构与验收状态](https://my.feishu.cn/docx/YTspdmiproITEexFFNBcyHGtn2b#doxcn2cOz8MuLZR6O0hN43UuNCs) 已包含加载与调用时序图。浏览器默认仍依赖安装版原生 supervisor；电脑入口使用独立 Rust/Sky/Swift，全量替代与验收尚未完成。下面的阶段记录描述当时进展，当前状态以上表与 IMPLEMENTATION-STATUS 为准。

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

浏览器支持 AX 观察、元素引用、输入、点击、滚动、截图、导航与基本生命周期。SDK 必须由宿主提供 authorize 回调。旧 QuickJS MCP（`mcp:legacy`）使用 CUA_ALLOWED_ORIGINS 配置动作/读取授权；这不构成页面网络隔离。默认 `mcp` 已改接还原运行时，接入配置见 [Agent 接入文档](docs/AGENT-INTEGRATION.md#agent-neutral-stdio-mcp-entry)。

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

## Source reconstruction: security facade assembly

Restored complete yf facade over reconstructed authority, approval and site-status providers. Verifies WebMCP page-change invalidation, current/user-tab checks and history prompt projection. 238 tests pass with type checks. Production execution context, input/AX/Playwright service and native hosts remain incomplete.

## Source reconstruction: input class

Restored cg input class and quad/button/timeout/delay helpers, including click/drag cleanup and nested page-load waits. 242 tests pass with type checks. Keyboard dispatch, DOM-node targeting and closed-shadow checks remain explicit required dependencies; this class is not yet a standalone production input backend.

## Source reconstruction: DOM targeting

Restored DOM snapshot reference state, isolated evaluation cache/retry, frame coordinate transforms and node-point resolution. 247 tests pass with type checks. Snapshot generation, keyboard and closed-shadow input protection still need reconstruction/integration.

## Source reconstruction: keyboard mappings

Restored complete keyboard tables, shifted/alias identity, chord parsing, platform modifier masks and clipboard shortcut classification. 250 tests pass with type checks. Actual key-event dispatch and closed-shadow input protection remain pending.

## Source reconstruction: keyboard dispatch

Restored key-event class, held-key cleanup, Unicode text dispatch and input-target token propagation. 253 tests pass with type checks. Protected focus inspection remains an explicit dependency; production input assembly is still incomplete.

## Source reconstruction: input protection and assembly

Restored focus/closed-shadow/iframe pointer checks and assembled BrowserInput with real restored helpers. 256 tests pass with type checks. Isolated Chromium smoke confirms ordinary typing and protected keyboard/pointer rejection (`npx tsx reconstruction/input-browser-smoke.ts`); UI/page-load adapters in that smoke are fixtures. Full DOM snapshots and production execution context remain pending.

#### Reconstructed AX runtime resource

The readable TypeScript bridge still depends on the separate accessibility WASM binary. To assemble a locally available binary beside the compiled loader:

```sh
CUA_BROWSER_ACCESSIBILITY_WASM_SOURCE=/absolute/path/browser-accessibility.wasm.br npm run build:reconstruction
```

Uncompressed `.wasm` input is also accepted. The build validates its exports and places it in `packages/browser/dist/service/accessibility/`. The binary is not included in the repository. Without this build input, AX calls require a previously assembled asset or the original host runtime environment setting `BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH` pointing to an absolute local path. That runtime setting is also suitable when running TypeScript sources directly; it is read from the host runtime's environment, not implicitly from every caller's process environment.


本机交互入口：`npm run demo:deepseek`，按提示输入 prompt。
自动读取项目根目录 `.env` 中的 `DEEPSEEK_API_KEY`（已有环境变量优先）；没有配置时才隐藏输入 token。
`.env` 被 Git 忽略，勿提交；新机器可复制 `.env.example` 后填写自己的 token。
默认启用浏览器工具：`npm run demo:deepseek -- "访问百度 搜索 deepseek 给我返回第一条搜索结果"`。
仅验证模型与 JS 工具：`npm run demo:deepseek -- --js "请调用 js 计算 6 * 7"`。
终端显示工具参数、执行结果和最终回答；返回的截图保存为临时文件。
首次安装请运行 `npm run install:chrome`，然后在 `chrome://extensions` 启用开发者模式，加载 `packages/browser-extension/dist/native-extension`。安装命令注册独立宿主并在被忽略的 `.env` 中写入连接目录；扩展加载后 demo 自动发现连接。目前两条外部搜索指令仍未验收。

最新外部验证（2026-11-05）：隔离 Chromium 中，DeepSeek 已实际打开百度、填写搜索词并点击搜索；随后百度跳转验证码页面，尚未取得第一条结果。此前还出现过页面状态读取超时，未证明已修复。详见 [实际验证记录](reconstruction/baidu-live-verification.md)。这不代表日常 Chrome 已接通，也不代表两条搜索验收命令已通过。

排查外部网页等待可使用 `CORE_CUA_RUNTIME_DIAGNOSTICS=1 npm run demo:deepseek -- "你的任务"`，额外显示站点检查等请求的耗时与返回状态。Demo 对未指定超时的 JS 调用使用 60 秒，避免与观察到的底层 30 秒请求等待同时到期；显式指定的超时不变。诊断不改变权限判断，也不代表搜索验收通过。


### Check the installed Chrome connection without DeepSeek

```sh
npm run demo:deepseek -- --check-browser
```

This mode does not require a model token or prompt and does not create a model client.
It uses the same restored runtime, host discovery and CUA inventory as the demo,
prints tool logs when connected, and exits nonzero if no browser is available.
A successful inventory check proves discovery only; it does not certify navigation,
clicks, screenshots or search results. It does not execute a page action.
For the independent Chrome installation, load
`packages/browser-extension/dist/native-extension` through Chrome's extensions
page after `npm run install:chrome`. Keep Chrome running during the check.

The restored DeepSeek demo now forwards explicit HTTP(S)/ALL_PROXY/NO_PROXY settings to its MCP child. If none is explicitly set, it reads enabled macOS static HTTP/HTTPS system proxy settings; it does not approximate PAC rules. This fixed repeated 30-second site-status transport failures on the development machine without changing browser access policy. A real isolated-browser Baidu run then navigated, filled and submitted the query, but reached human verification, so returning the first search result remains unverified. A connected daily Chrome extension is still required; see `reconstruction/deepseek-browser-acceptance.json` for the bounded evidence.

### Interactive approval availability

Run the demo directly in an interactive terminal when an action requires new
approval. Both stdin and stderr must be terminals; redirecting stderr or running
with closed stdin disables the confirmation UI. The demo reports this at startup
and advertises no MCP elicitation capability in that case. Use the existing local
`artifacts/debug/` logs to inspect a run without redirecting its approval UI.
This does not automatically grant access to any site or application.


根目录旧 `Cua.launch` SDK 已标记 deprecated，现有使用者可通过 `@vicksiyi/cua-kit/legacy` 显式引用。原版 `tinyskyAlt` 是在 nodeRepl 中初始化全局 `cua` 的入口，不能把两者当作同一 API；新宿主通过还原 MCP 运行时接入，详见 [API 边界](docs/AGENT-INTEGRATION.md#restored-cua-api-versus-the-legacy-host-sdk)。旧 SDK 消费者仍在迁移中。
