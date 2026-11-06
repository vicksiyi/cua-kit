# 当前验收边界（2026-11-06）

本页用于区分已运行的路径和未完成的还原工作，不是完成率。总体目标仍未完成。历史文档中的“未实现/已通过”可能对应不同版本，以下以本轮运行证据和实际源码为准。

| 路径 | 当前证据 | 不能据此声称 |
| --- | --- | --- |
| Rust supervisor → native 扩展 → MCP → 页面 | 本轮真实测试通过，约 9.4 秒；自有页面操作、截图、标签组、locator 光标及清理 | 任意公开网站、模型任务都稳定 |
| Rust supervisor → full 扩展 → MCP → 页面 | 本轮真实测试通过，约 23.9 秒，同样的操作验收 | 全扩展所有功能均已还原 |
| 显式 AX 模式 → MCP → 扩展 → AX/WASM → index click | 上一轮 CUA_TEST_AX=1 真实通过；观察编号后点击页面控件 | 默认 getAXState 一定走 AX；默认可走 DOM fallback |
| DOM/AX 的 SIWC 观察、身份、schema、命令注册 | 源码差分、真实 Chromium/WASM、注册链测试；生产 feature gate 保留 | 当前账号的 SIWC 登录已经可用 |
| SIWC authenticate → context → provider → Cookie/DOM | 独立 Chromium 中受控账号/grant/审批 fixture 成功；账号变化回滚通过 | 线上认证服务或真实账号登录已验收 |
| Rust → 原 Sky JS/还原 TS → Swift IPC | 本轮 12 项通过，包含协议、列表、策略、终止、剪贴板恢复、背压清理；6 项 opt-in 测试跳过 | 已取得屏幕/辅助功能权限、能实际操作应用 UI |
| Swift 显式/观察时后台启动 owned App | 单独启用启动专项，本轮 4 项通过；还原/安装包客户端 × 两种启动方式 | Skyshot 截图/AX 成功；权限错误不算观察成功 |
| 原生 macOS AX/截图/输入 | helper 当前报告 accessibility=false、screenRecording=false | 不能验收实际 UI 观察或输入效果 |

## 当前明确未完成

1. **原生 UI 验收**：当前 helper 权限不足；不能从应用发现/启动结果推断键鼠、AX、截图或粘贴效果。
2. **Native disableDiff**：SkyIPC.swift 校验 disableDiff 类型，但调用 SkyAppState.get 时未传入；get 本身也无该参数。当前没有还原原生增量树语义，不能宣称该选项已完整实现。JS 声明说明 true 应返回完整树；原生具体差分算法尚缺证据。
3. **真实认证联调**：SIWC 线上账号/grant/cookie 流程未验收；受控 fixture 不代表真实登录。
4. **整体源码版本审计**：当前 browser-service 的部分核心链路已更新 oracle，许多历史测试仍依赖旧压缩符号。没有全仓“全部测试绿”的证据；旧测试通过记录不能证明当前构建整体一致。
5. **原生语言/算法还原**：Rust/Swift 路径与语言边界已迁移一部分；仍有 native-host、supervisor、legacy exports 等差异。独立实现和协议兼容不能冒充原厂函数体还原，详见 LANGUAGE-MIGRATION-AUDIT.md 和 NATIVE-HOST-LANGUAGE-AUDIT.md。
6. **真实模型与公开网站稳定性**：曾观察 debugger detach、步数耗尽和最终回答与工具证据不一致，尚无覆盖性修复验收。本轮自有页面测试未解决这些问题。
7. **历史材料同步**：飞书旧架构文档、早期状态段落与全部源码变更尚未逐项同步。

## 本轮复现入口

```sh
native/macos/.build/debug/cua-helper --permissions
CUA_TEST_NATIVE_SKY_IPC=1 node --import tsx --test reconstruction/native-sky-ipc.test.ts reconstruction/native-deepseek-runtime.test.ts
CUA_TEST_NATIVE_APP_START=1 node --import tsx --test --test-name-pattern='owned App launch' reconstruction/native-sky-ipc.test.ts
CUA_RUNTIME_SUPERVISOR=rust CUA_TEST_MACOS_SANDBOX=1 CUA_TEST_RUST_RUNTIME=1 node --import tsx --test reconstruction/extension-native-controller.test.ts
```

测试的安装包客户端用于协议对照；不启动原厂 node_repl 服务。浏览器和 owned App 验收使用测试对象，未使用用户真实账号进行登录。日志保留本地，未纳入提交。

## 当前 AX 客户端 oracle 更新

`reconstruction/browser-ax.test.ts` 原先仍引用旧客户端压缩符号 Fl/$s/Ls。
重新读取当前安装的 browser-client.js 后，将 oracle 对齐到 Hl/zn/Gn，
并锁定 SHA256 `04d63754bb1134eae351c164e750c7a9b798de2757a734e7a62e14b63edf8de4`；
后续安装包变化会显式要求重新审计。还原侧直接导入 TS 源码，避免陈旧 dist 掩盖差异。

3 项差分测试通过：280 组观察/显示组合（7 种返回、5 种模式、2 种方法、4 种 diff 选项），
18 组操作参数及错误路径，以及两类命令的原始 payload/延迟解析行为。
当前 AxClient 行为与本次原构建一致，未为通过测试改写产品逻辑。
该验收只覆盖客户端协议与结果处理，不代表 native diff 算法或全部真实网站操作已完成。

## CUA keypress 长按链路修复

对照当前 browser-client Gl/Ss 和 browser-service TD/input.dispatchKeyPress，发现
`cua.keypress` 的 duration 在客户端、命令 schema、服务命令与 BrowserInput 四层遗漏。
现已按原实现接通：0..30 秒有限数校验、正时长请求超时为 ceil(duration*1000)+2000ms，
服务侧先授权再校验，正时长转毫秒传给已还原的 held-key dispatcher；0/未传仍保留剪贴板拦截。

`browser-input.test.ts` 现锁定当前客户端 SHA 并直接验证 TS 源码；
`browser-keypress-duration.test.ts` 对照当前服务命令与输入方法，并在真实 Chromium
自有页面上通过 CUAAPI → command.parse → service → BrowserInput → keyboard dispatcher → CDP
观察 keydown/keyup 和实际长按间隔。此测试不包含 MCP 或日常 Chrome 扩展连接。

## 长按取消与按键释放验收

`browser-held-key-cleanup.test.ts` 对照当前 browser-service 的 yc/U_/ka 及
原始 token、target、delay 辅助函数，24 种组合验证：成功、焦点检查失败、keydown 失败、
keyup 失败、keydown 期间取消、预先取消 × 受保护输入开关 × 主/子 frame。
错误优先级、逆序释放、所有 keyup 均尝试及取消前不发事件与当前原构建一致。
这组差分共享 key-map helpers，不能用来证明键位映射表与原构建一致。

真实 Chromium 自有页面另行验证 Control+Shift+A 长按期间取消，页面收到三次按下，
随后按 A/Shift/Control 顺序释放，最终 ctrlKey/shiftKey 都为 false。2 项测试通过。
该取消测试调用 keyboard dispatcher 的 AbortSignal；不代表公共 cua.keypress 或 MCP
已暴露/贯通取消参数，也未验收浏览器崩溃或进程强杀时的释放行为。本轮无产品逻辑改动。

## 输入/页面 schema 生成工具更新

`reconstruct-input-schemas.mjs` 已对齐当前 browser-client SHA；命令通过导出表定位，
不再复用旧的逐命令压缩符号。4 个输出文件全部完成提取与格式检查后才写入；
`--check` 只校验再生成结果是否一致，不写文件。未知安装包版本在写入前失败。

本轮生成 52 个命令 schema，保留 keypress.duration 及 DOM snapshot 的 snapshotId/siwc。
新增测试对比当前原构建的 payload/result 解析，同时验证版本变动不会修改输出。
导航 schema 新补 `prepare_accessibility?: true`，原构建只在请求此标记且 orbit+cdp
HTTP(S) 导航开始时触发 accessibility core 预加载；当前 tab.goto 和服务导航尚未接通
该预加载流程，本轮仅恢复参数契约，不声称该功能已完成。
