# 可替换的调用侧：MCP Client + AgentLoop

当前入口使用 `packages/agent-loop`，公共类型见
[`contracts.ts`](../packages/agent-loop/src/contracts.ts)。旧 `src/agent`、QuickJS
和 `npm run demo` 是早期独立实现，不代表当前还原的 CUA 运行路径。

模型、AgentLoop、MCP 客户端和浏览器执行层可以分别替换。模型凭证只交给
ModelAdapter，不能传入 MCP 子进程、worker 环境或网页。

## 协议与生命周期

```mermaid
sequenceDiagram
    actor User
    participant Host as Agent宿主
    participant Model as ModelAdapter
    participant MCP as MCP客户端/服务端
    participant Workers as Kernel + Trusted Worker
    participant Browser as 浏览器后端
    User->>Host: 用户问题
    Host->>MCP: initialize / tools/list
    MCP-->>Host: 工具定义与JSON Schema
    Host->>MCP: CUA初始化（如果服务端未自动初始化）
    MCP->>Workers: import @core/cua/tinyskyAlt
    Workers-->>Host: API文档、工具输出
    Host->>MCP: getState / inventory
    MCP-->>Host: 当前浏览器状态
    loop 在决策预算内
        Host->>Model: 问题、初始化文档、历史观察、工具定义
        Model-->>Host: ToolCall或回答
        Host->>MCP: tools/call + 宿主request metadata
        MCP->>Workers: 执行与权限检查
        Workers->>Browser: 导航 / 输入 / 点击 / 截图
        Browser-->>Host: text/image或错误
    end
    opt 预算耗尽且启用摘要
        Host->>Model: 已有证据，无可用工具
        Model-->>Host: 进展摘要（不是成功判定）
    end
    Host->>MCP: turn_ended（宿主发起）
    MCP-->>Host: 清理完成或失败
    Host-->>User: 回答，或明确的未完成状态
    Host->>MCP: close / 释放宿主资源
```

| 边界 | 当前契约 | 接入要求 |
|---|---|---|
| ModelAdapter | `decide({system,messages,tools,signal})` | 返回文本或带 ID、名称、JSON 参数的 toolCalls |
| ToolClient | `listTools / callTool / endTurn? / close` | 保留 text/image、isError，按顺序执行动作 |
| MCP | stdio `tools/list`、`tools/call`、form elicitation | stdout 只承载协议，stderr 承载诊断 |
| 会话元数据 | `_meta["x-codex-turn-metadata"]` | session_id/turn_id 由宿主维护，不由模型参数授权 |
| 生命周期 | `NodeReplTurnClient` | 从模型工具表隐藏 turn_ended；成功、失败、取消都清理 |
| 浏览器 | 扩展、临时 CDP、明确 endpoint 的已有 CDP | 以真实 inventory 为准；不要把接口存在当作能力可用 |

### 初始化输出必须进入模型上下文

显式导入 `@core/cua/tinyskyAlt` 时会立即输出核心 API 文档，随后会缓存文档。
只把后续 `getState()` 输出交给模型会漏掉这份文档。把初始化调用及其完整结果
作为匹配 callId 的 assistant/tool 消息保留，再添加后续观察。本项目可用
`AgentRunOptions.initialMessages` 传入这些消息。

独立 supervisor 将 worker 的 `output`、`named_outputs`、媒体内容映射成 MCP
content。不要丢掉带标签的文本：CUA 的文档和页面状态使用这一通道。图片保持
独立 image 内容，不能只保留终端显示的截图路径。当前 ToolClient 支持 text/image；
其他内容类型显式报错，不静默忽略。

页面和工具文本属于不可信证据。初始化 API 文档描述调用方式，但网页文字不能
授予权限或改变宿主约束。终端的展示截断也不等于模型上下文截断。

### 授权、错误和清理

只有具备真实确认 UI 的客户端才声明 elicitation capability。非交互运行不能
自动接受新的 origin 请求；当前 demo 会报告此限制。`endTurn()` 不继承已经取消
的动作 signal，以便完成清理；动作失败和清理失败同时出现时保留两个错误。

默认预算 12 轮。通用 AgentLoop 默认耗尽即抛 `AgentStepBudgetError`。demo 启用
`summarizeOnExhaustion`，至多增加一轮禁用工具的摘要请求，仍以未完成、非零状态
退出。`partialSummary` 是模型生成的文字，不是可靠的完成判定。

## 运行与验收

本地 `.env` 配置 `DEEPSEEK_API_KEY`，不提交 GitHub。运行当前 demo：

```sh
npm run demo:deepseek -- --cdp-browser '打开 https://example.com 并概括页面'
```

扩展模式的普通 prompt 入口在连接目录存在但为空时，会请求 macOS 打开 Google Chrome，并最多等待 15 秒以发现扩展宿主；超时后给出明确诊断，不自动换用另一浏览器的登录环境。`--check-browser` 仍仅检查，不启动浏览器。发现描述文件只是第一步，后续仍需 MCP 浏览器预检通过。

扩展模式省略 `--cdp-browser`；接管已暴露调试端口的现有浏览器使用
`--cdp-endpoint <本地浏览器WebSocket地址>`。这些模式默认仍使用安装包 supervisor，
不是独立 supervisor 的部署入口。完整后端边界见 [README](../README.md)。

独立 supervisor 的受控实机验收：

```sh
npm run test:sandbox
# 可选：消耗真实 DeepSeek API 配额，使用本地 .env
CUA_TEST_MACOS_SANDBOX=1 CUA_LIVE_DEEPSEEK_TEST=1 node --import tsx --test reconstruction/runtime-cdp-sandbox.test.ts
```

第二条运行真实模型 → 独立 MCP supervisor → OS 沙箱内还原 workers → Chromium，
模型自行填写随机查询、提交、截图并读取仅在结果页出现的随机标记。HTTP 服务端
独立确认实际提交值。当前一次验收为 4 轮、0 工具错误；这不证明所有任务稳定，
也不代表外部网站认证、原生桌面权限、独立 supervisor 默认部署已完成。

日志留在本地 `artifacts/debug/`，凭证脱敏、图片不写入 base64，文件和 `.env`
均被 Git 忽略。日志可能包含页面内容，不自动上传。替换 Agent 时仍需自行制定
上下文/图片预算、结果验收和人工确认界面。


## 选择 Rust supervisor（浏览器实验入口）

```sh
npm run build:rust-runtime
CUA_RUNTIME_SUPERVISOR=rust npm run demo:deepseek -- --cdp-browser --check-browser
CUA_RUNTIME_SUPERVISOR=rust npm run demo:deepseek -- --cdp-browser '打开 https://example.com 并概括页面'
```

本地 `.env` 继续提供 DeepSeek 凭证。Rust 选项绕过安装包 supervisor；未设置时默认
仍为 installed。CDP 模式启动独立浏览器，不共享日常 Chrome 登录态，也不是原厂
缺扩展时的自动回退方案。来源授权仍通过已有确认流程处理。

受控 Rust + DeepSeek 端到端验收：

```sh
CUA_TEST_MACOS_SANDBOX=1 CUA_TEST_RUST_RUNTIME=1 CUA_LIVE_DEEPSEEK_TEST=1 node --import tsx --test reconstruction/runtime-cdp-sandbox.test.ts
```

此测试使用隔离 Chromium 和本地随机表单，验证输入、提交、结果及截图。本次通过
为 5 轮、0 工具错误。任意外部网站、日常 Chrome 扩展和原生 App 尚未由此验收。


Rust 浏览器回归入口（临时配置，不操作日常 Chrome）：

```sh
npm run test:rust-browser
# 可选：使用本地 .env，消耗真实模型 API 配额
CUA_LIVE_DEEPSEEK_TEST=1 npm run test:rust-browser
```

包含隔离 CDP、Native Messaging 扩展、完整打包扩展三种部署。扩展场景用随机
结果和本地服务端点击记录双重核验；最近真实模型测试曾先误用 accessibility
点击，收到不支持提示后改用 Playwright 完成。任务成功不代表没有工具调用错误。


浏览器输入能力：原版 `bind_tab` 会保留 `click` 等包装方法，即使底层 `tab.ax`
不可用。因此方法存在不代表支持 AX 输入，`getAXState()` 也可能仅返回 DOM
快照。调用侧现在明确提示检查能力与真实索引、缺少 AX 时使用 Playwright。
这是 demo 提示，不修改还原 API；实际模型仍可能选错方法并从错误中恢复。

### Tool-provider initialization guidance reaches AgentLoop

`ToolClient` now has optional `getInstructions(): string | undefined`, a provider-neutral string contract. `McpToolClient` reads it from the upstream SDK's initialize result; NodeREPL-turn and debug adapters preserve it. AgentLoop snapshots this guidance once per run and includes it in normal model context and optional exhausted-budget summaries alongside host context. Tool results remain in the evidence messages and cannot become system guidance through this path. Existing clients without the optional method keep their previous behavior; invalid values fail before a model request while still running turn cleanup.

Twenty caller regression tests pass. The real MCP stdio + local mock-model integration checks that initialization instructions appear in both actual model HTTP requests. Additional tests cover adapter forwarding, guidance snapshotting, exclusion of tool/page text from system context, summary tools staying disabled, and cleanup after invalid metadata. This changes independently authored caller integration, not a reconstruction claim about the original Codex agent.

The native `NODE_REPL_JS_COMPLETION_SUMMARY` contract remains unfinished. Its source instruction requires a separate js call containing only `completion_summary` after the observed CUA outcome; this must not be conflated with AgentLoop's optional budget-exhaustion summary or host `turn_ended` cleanup.
