# cua-kit 的 DeepSeek Harness 插件

DSH 负责模型请求和 agent loop；本插件把仓库当前的 `packages/agent-loop/src/restored-mcp.ts` 接成 DSH 工具。调用链是：DSH → `cua_js` → MCP stdio → Rust supervisor → 还原 workers → Chrome / Swift 桌面服务。无需运行 `demo:deepseek`，也无需单独启动 MCP 进程，插件会启动和关闭它。

当前适配 **DSH `0.2.2-rc.3`**，依赖该版本导出的 `createMcpToolDefinition`。DSH 的插件 API 还在变化，因此暂时锁定此版本。当前独立 CUA runtime 要求 **macOS**；DSH 要求 **Node.js ≥24.9**。还需要 npm、Rust/Cargo 和 Xcode Command Line Tools（Swift）。

## 从本地仓库启动

以下命令在 cua-kit 根目录执行。先切到 Node 24（例如已安装 nvm 时用 `nvm install 24 && nvm use 24`），确认 `node -v`：

```bash
cd /absolute/path/to/cua-kit
npm ci
npm run build:reconstruction
npm run build:rust-runtime
npm run build:native
npm ci --prefix plugins/dsh-cua
npm run setup --prefix plugins/dsh-cua
```

`setup` 生成包含本机绝对路径的 `artifacts/dsh-cua.patch.yml`，此目录已被 Git 忽略。已有文件时不会覆盖；之后直接修改这个文件。首次 Swift/Rust 构建需要下载依赖，耗时较长。

先检查实际 MCP 链路（不调用模型、不访问网页、不打开应用、不点击界面、不触发系统授权）：

```bash
npm run smoke --prefix plugins/dsh-cua
```

启动 DSH：

```bash
npx @deepseek-ai/dsh@0.2.2-rc.3 web \
  --patch "$PWD/artifacts/dsh-cua.patch.yml" --no-open
```

打开终端显示的 Web 地址，默认是 `http://127.0.0.1:3080`。在 DSH 的模型设置中配置 DeepSeek 凭证并选择模型；已有可用 DSH 配置可以沿用。仓库 demo 使用的 `.env` 不会被插件读取。**模型密钥只交给 DSH，不放进 `runtimeEnvironment`。**

新建对话，先发送：

> 请调用 cua_js 计算 6 * 7，然后检查 CUA 的本机应用清单。不要打开应用，也不要访问网站。

插件默认启用浏览器和原生应用两种 surface。没有连接 Chrome 时，联合模式允许浏览器清单为空，原生应用清单仍可读取。列出应用不代表已经有操作权限。

## 接入 Chrome

若你现有的 `demo:deepseek` 已能操作 Chrome，使用它相同的 `CORE_CUA_HOST_DIRECTORY` 或 `CORE_CUA_ENDPOINT_FILES`，**显式写入插件配置**；插件不会读 demo `.env` 或自动复制环境中的策略。

在生成的 patch 中修改 `config`，例如：

```yaml
- insert:
    - id: cua-kit
      name: /absolute/path/to/cua-kit/plugins/dsh-cua/index.js
      config:
        repositoryPath: /absolute/path/to/cua-kit
        surfaces: browser,computer
        hostDirectory: /Users/your-name/.core-cua/endpoints
        runtimeEnvironment: {}
```

需要固定某个 endpoint 时，改用：

```yaml
        runtimeEnvironment:
          CORE_CUA_ENDPOINT_FILES: '["/absolute/private/core-cua-session/endpoint.json"]'
```

插件默认 `hostDirectory` 是 `~/.core-cua/endpoints`。Chrome 需正在运行且已加载项目的还原扩展、连上 Native Messaging host。首次安装走仓库现有的 `npm run install:chrome`，按其终端提示加载扩展；详细说明见 [`@core/browser-extension`](../../packages/browser-extension/README.md)。不要用旧的 `dist/chrome-extension` / `mcp:legacy` 配置。

浏览器模式只需修改 `surfaces: browser`。插件不会启动另一份 Chromium，也不会自动切换到 CDP。需要访问网页时，CUA 的原始确认请求会显示在 DSH 审批界面。网站安全检查和服务器策略仍然生效。

## 操作 macOS 应用

先由你在本机终端请求并授予系统权限：

```bash
npm run permissions:computer
npm run check:computer-permissions
```

在“系统设置 → 隐私与安全性”中授予辅助功能、屏幕录制等实际请求的权限。插件默认 `nativeAppPolicyMode: ask`：未显式配置 `CORE_CUA_APP_POLICY` 时，所有已安装应用都可以发起访问申请，包括 `com.openai.codex`；访问前会在 DSH 弹出确认，显示应用名称、bundle ID 和风险等级，由用户选择 Allow once 或 Reject。默认不会自动批准或永久记住授权。

生成的 patch 可以显式写成：

```yaml
        nativeAppPolicyMode: ask
        runtimeEnvironment: {}
```

这等价于为独立 Swift 后端配置以下默认规则。`allowed` 表示可以进入审批流程，真正读取或操作应用前仍需要用户批准：

```json
{"*":{"decision":"allowed","risk":"high","allowPersistentApproval":false}}
```

`*` 是未列出应用的默认规则，精确 bundle ID 规则优先，包含 `denied` 和 `forbidden`。如果需要默认拒绝，只允许 TextEdit 申请授权：

```yaml
        nativeAppPolicyMode: allowlist
        runtimeEnvironment:
          CORE_CUA_APP_POLICY: '{"com.apple.TextEdit":{"decision":"allowed","risk":"low","allowPersistentApproval":false}}'
```

保留现有的 `repositoryPath`、`surfaces` 等字段。显式提供的 `CORE_CUA_APP_POLICY` 始终优先，不会和默认规则合并：例如显式 `{}` 仍然拒绝全部应用。需要“默认可申请、个别禁止”时，在同一个 JSON 中提供 `*` 默认规则和对应应用的精确拒绝规则。

`CORE_CUA_POLICY_SOURCE: app-server` 继续使用其提供方的策略，不会注入本地默认规则或覆盖提供方的拒绝。未使用 DSH 插件的独立 MCP/demo 在没有任何规则时仍默认拒绝。错误中的 “organization's policy” 是通用文案，单凭它不能认定本机受组织管理。

原生应用操作仍需 DSH 单次审批和 macOS 权限。若 DSH 的权限模式禁止审批（approval policy 为 `never`），CUA 确认会被拒绝，需在 DSH 中选择允许询问的权限模式。更新这项原生策略实现后需要重新运行 `npm run build:native` 并重启 DSH；已有 MCP 进程保留其启动时的策略。

等待 DSH 授权不占用 JS 执行时间，也不占用插件的 `requestTimeoutMs`（默认 90 秒）。`approvalTimeoutMs` 单独限制每次工具调用中累计等待授权的时间，默认 300000 毫秒（5 分钟）；超时或停止生成会取消审批并关闭该会话的 MCP 进程。拒绝不会执行应用操作。修改等待时长时，在 patch 的 `config` 下添加 `approvalTimeoutMs: 600000`，然后重启 DSH。底层运行时也需要更新：`npm run build:rust-runtime`。

原生截图会包含目标应用在其他桌面或最小化的窗口，并继续按进程和窗口身份选择目标。`cua.getApp("com.openai.codex")` 已负责在必要时后台启动应用；不要调用未文档化的 `cua.computer.launch_app`，也不需要通过 Dock 猜测应用位置。

## 安装为 DSH 插件包（可选）

上面的绝对路径 patch 已可直接运行。需要在 DSH 插件列表中作为 bundle 管理时：

```bash
export CUA_KIT_ROOT="$PWD"
npx @deepseek-ai/dsh@0.2.2-rc.3 plugin --profile web add "$CUA_KIT_ROOT/plugins/dsh-cua"
npx @deepseek-ai/dsh@0.2.2-rc.3 web --no-open
```

使用 bundle 安装时不再同时传入 `artifacts/dsh-cua.patch.yml`，否则会重复注册工具。包通过 `dsh.bundle.patch` 声明插件层，直接分发 JS，无需编译插件。CUA 原生二进制和还原 workers 仍在原仓库；安装包不包含整个运行时，`CUA_KIT_ROOT` 必须指向已构建的仓库。自定义 bundle 配置时在该 profile 的用户 patch 中覆盖 `id: cua-kit` 的 `config`（需要写全要保留的字段）。

## 实现和验证

- `index.js`：DSH 插件、工具注册、系统说明、审批与会话事件。
- `src/connection.js`：MCP 客户端、每对话独立进程、串行调用、元数据和 `turn_ended`。
- `src/config.js`：配置 schema、显式 runtime 环境，过滤模型凭证。
- `scripts/smoke.js`：真实 runtime 与 DSH 官方适配器的接通检查。

每个 DSH 对话第一次使用工具时启动自己的 MCP 进程。同一进程中 JS 变量跨轮保留；重启 DSH、卸载插件、取消工具或传输异常后需要重新初始化变量与句柄。动作出错不会自动重放。插件卸载和对话释放时关闭子进程。每个已提交的 `turn/end` 排队发送一次清理；下一轮工具等待它完成。`turn_ended` 不向模型暴露。

插件把同一个会话 ID 用于宿主启动环境 `CUA_MCP_SESSION_ID` 和请求元数据。浏览器导航会读取按此 ID 授权的会话配置；只验证浏览器清单不能发现这条链路的配置错误。

工具名为 `cua_js`、`cua_js_reset` 等，保留 MCP 的输入 schema、初始化 instructions 和 `completion_summary` 独立分支。成功结果复用 DSH 官方适配器，保留原始 MCP 内容及 structuredContent；MCP `isError` 被记录为工具错误。截图通过 DSH attachment store 和当前模型的图片能力检查。文本模型无法直接看图时会得到明确说明；使用 AX/DOM 文本或在 DSH 配置可接收图片的模型。

只支持无需填写字段的 MCP form 确认；URL elicitation、需要输入字段的表单会取消。验证码或登录人工接管需要用户操作，不应伪报完成。浏览器策略明确拒绝后，同一轮的后续 CUA 动作被阻止。

测试：

```bash
npm run check --prefix plugins/dsh-cua
npm test --prefix plugins/dsh-cua
npm run smoke --prefix plugins/dsh-cua
# 显式使用已安装扩展的 Chrome，仅创建并关闭一个本地测试标签：
CUA_TEST_DSH_BROWSER=1 npm test --prefix plugins/dsh-cua
# 原生应用审批链路检查：使用不可执行的临时测试 App，自动拒绝，不打开真实应用：
CUA_TEST_DSH_APP_POLICY=1 npm test --prefix plugins/dsh-cua
```

协议测试启动真实 stdio MCP fixture，覆盖元数据、串行、会话隔离、审批、取消、策略拒绝和 DSH 官方错误/图片适配。smoke 检查真实 Rust/Swift 的 JS、原生应用清单、完成汇报和跨轮清理，不代表网页、应用点击或真实模型任务已经验收。

2026-11-18 实机验证：DSH 新会话中的真实 DeepSeek 模型通过 `cua_js` 打开 `https://example.com/`，读取标题与正文，点击真实的 Learn more 链接，跳转到 `https://www.iana.org/help/example-domains`，读取目标正文并返回两张截图。修复会话 ID 不一致问题后，此轮 9 次工具调用均成功；宿主对两个网站分别进行了单次审批。网页截图和验收日志保留在本地忽略的 `artifacts/` 与 DSH 会话存储中。另有显式启用的本地 Chrome 回归验证了输入、浏览器点击触发的表单提交、随机结果读取与截图；这不代表所有网站和原生 App 操作均已验收。

参考官方接口：[插件包与 profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)、[MCP 工具适配器](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/src/tools.ts)、[审批接口](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/approval.md)。适配源码检查点：`39163dd30f703a79079e2d2446545cff3c453738`，安装验证以 npm 的 `0.2.2-rc.3` 为准。
