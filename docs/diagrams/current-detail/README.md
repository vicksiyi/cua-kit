# cua-kit 当前实现：系统架构与时序

本图依据当前本地仓库实现，区分还原的 JS→TS 与独立重建的 Rust / Swift。不是对 Codex 全部内部实现的声明。架构图箭头表示已有路径，并不代表所有功能已通过端到端验收。

## 阅读顺序

1. `01-system.png` / `.mmd`：模块、语言、进程边界与三条后端路径。
2. `02-agent-sequence.png` / `.mmd`：部署、预检、模型决策、授权、工具回传与清理。
3. `03-backend-sequence.png` / `.mmd`：浏览器与桌面实际动作路径。

时序图跨多层的长箭头代表经过已有 RPC 链路的逻辑请求/返回，不表示进程之间另建直连。第二张第 8–14 步是可重复的决策循环；授权是条件分支。第三张第 11 步以后是桌面独立分支，不是在浏览器失败后自动执行。

## 代码索引

- `packages/agent-loop/src/demo.ts`：预检、日志、授权处理、模型与 MCP 装配。
- `packages/agent-loop/src/loop.ts`：模型循环与 turn 生命周期。
- `packages/agent-loop/src/runtime-selection.ts`：调用侧部署策略；不能当作原厂选择逻辑。
- `packages/agent-loop/src/restored-runtime.ts`：staging、默认运行时及可信服务配置。
- `packages/agent-loop/src/independent-browser.ts`：endpoint 发现、可选启动 Chrome、服务映射。
- `native/runtime-supervisor/examples/mcp_stdio.rs`：Rust MCP 入口。
- `packages/node-repl/src/kernel.ts`、`trusted_worker.ts`、`native_pipe_bridge.ts`：执行、可信服务与原生管道。
- `packages/cua/src/tinysky_alt/create_browser_api.ts`、`bind_tab.ts`：浏览器 API、状态与动作绑定。
- `packages/native-host/src/browser_connector.ts`：浏览器 endpoint / pipe 认证。
- `packages/browser-extension/src/browser_session.ts`、`debugger_runtime.ts`：扩展会话、CDP、超时与 detach。
- `packages/cdp-host`：显式 CDP 后端。
- `packages/sky`、`native/macos`：Sky 接口与 Swift 原生实现。
- `reconstruction/runtime-cdp-sandbox.test.ts`：受控真实浏览器表单、iframe、恢复路径验收。

## 已验证与缺口

已验证的局部真实链路包括日常 Chrome 受控表单、截图、跨源 iframe、同 tab JS 错误和 selector timeout 后恢复，以及一次带真实 DeepSeek 的受控任务闭环。跨源 iframe 不等于已经证明 OOPIF 全覆盖。

Swift 受控应用启动和复用已有真实测试；桌面截图与输入尚未完成真实验收，最近检查的 Accessibility / Screen Recording 权限为 false。间歇 debugger detach、公开站点任务稳定性与原生协议完整一致性仍有缺口。

默认浏览器运行时已经切换为 Rust。旧 `current-runtime-loading.mmd` 中“browser 默认 installed”的描述已过时，本次图采用当前 `runtime-selection.ts`。本次只生成设计说明，没有修改执行逻辑或重新执行端到端验收。

## 关键语义

- 扩展链路、显式 CDP、桌面链路是不同能力/部署路径，不是三段自动 fallback。
- getAXState 在 DOM-only 后端返回 DOM snapshot；没有可用于原生 AX 操作的数字索引，应使用对应 locator API。
- 截图、DOM、AX 是不同观察方式；命令成功不等于任务完成，需重新观察结果。
- completion_summary 属于工具调用分支；turn_ended 是宿主生命周期。后者在 run 返回前执行，Demo 最后关闭连接。
- 受管 Chromium 独立 profile 不携带日常 Chrome 登录态；外接已有 CDP endpoint 另行选择。
- 本地日志不应进入 GitHub，模型密钥不传给 MCP 服务。

## 当前应用 / 浏览器选择流程（补充）

`04-surface-selection.mmd` 是当前代码对应的选择时序图（尚未生成 PNG）。前三张 PNG 是此前快照，不能据其推断当前默认模式。新图依据 `scripts/run-deepseek.sh`、`demo.ts`、`unified-preflight.ts`、`surface-context.ts` 和 `browser-startup-tools.ts`；不是原厂全部宿主流程的还原声明。

macOS CLI 默认 unified，同时开放 browser / computer；显式 browser、CDP / managed browser 参数只开放 browser。unified 预检读取两类清单，不会主动启动 Chrome；模型处理网页需求时才可能使用宿主提供的 `prepare_browser`。这个工具属于 Demo 编排，不是 CUA API。纯 JS 模式不注入 cua，也不启动浏览器或原生应用服务。

判断包含两个层次：部署层决定模型能够调用什么；模型结合 prompt、文档和实时清单决定调用哪个入口。不存在硬编码的产品名到浏览器/应用映射。`打开本机 Multica` 应选择原生应用入口；缺少能力或授权时应说明限制，不能自行替换成 Multica 网站。应用清单发现、应用进程启动、应用 UI 观察和输入是不同验收项。

最近已有默认 unified 实测只证明真实 DeepSeek 能从清单识别 Multica；当次允许列表为空且 AX/录屏权限不足，没有验证打开并操作 Multica。当前图中的路径表示接线及条件，不能替代真实 UI 验收。
