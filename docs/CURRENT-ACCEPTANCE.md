# 当前验收边界（更新至 2026-11-08）

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
| 原生 macOS AX/截图/输入 | 2026-11-08 只读检查：accessibility=true、screenRecording=true；旧版 owned fixture 四种点击验收通过；新增生产窗口观察/注册表路径尚未真实验收 | 权限开启、组合检查或旧路径通过不能证明当前 Sky/MCP/DeepSeek 应用操作已修复 |

## 当前明确未完成

1. **原生 UI 验收**：当前 helper 的辅助功能与录屏权限均为 true，但 2026-11-08 桌面检查为 screenLocked=true、frontmostIsLoginWindow=true。旧版 owned fixture 前台/后台 × 索引/坐标点击成功，不覆盖随后接入的生产 Target 窗口观察、维护中的窗口注册表及 Sky/MCP/DeepSeek 链路；这些仍须解锁后的实际验收。不能从应用发现、启动、截图或离线组合检查推断点击效果。
2. **Native disableDiff**：SkyIPC.swift 校验 disableDiff 类型，但调用 SkyAppState.get 时未传入；get 本身也无该参数。当前没有还原原生增量树语义，不能宣称该选项已完整实现。JS 声明说明 true 应返回完整树；原生具体差分算法尚缺证据。
3. **真实认证联调**：SIWC 线上账号/grant/cookie 流程未验收；受控 fixture 不代表真实登录。
4. **整体源码版本审计**：当前 browser-service 的部分核心链路已更新 oracle，许多历史测试仍依赖旧压缩符号。没有全仓“全部测试绿”的证据；旧测试通过记录不能证明当前构建整体一致。
5. **原生语言/算法还原**：Rust/Swift 路径与语言边界已迁移一部分；仍有 native-host、supervisor、legacy exports 等差异。独立实现和协议兼容不能冒充原厂函数体还原，详见 LANGUAGE-MIGRATION-AUDIT.md 和 NATIVE-HOST-LANGUAGE-AUDIT.md。
6. **真实模型与公开网站稳定性**：曾观察 debugger detach、步数耗尽和最终回答与工具证据不一致，尚无覆盖性修复验收。本轮自有页面测试未解决这些问题。
7. **历史材料同步**：飞书旧架构文档、早期状态段落与全部源码变更尚未逐项同步。


## 当前构建的外层协议复核（2026-11-08）

运行当前 Swift helper，分别由还原 Sky 客户端与安装包 JS 客户端完成握手、应用清单读取，
并验证协商、截止时间、帧长度和未知操作错误：3 项通过、0 跳过。执行命令：

```sh
CUA_TEST_NATIVE_SKY_IPC=1 node --import tsx --test --test-name-pattern='handshake and app inventory|enforces negotiation' reconstruction/native-sky-ipc.test.ts
```

用例包含临时虚构应用的策略拒绝/无有效可执行文件的启动失败，未点击用户应用；
没有运行 opt-in 的真实 skyshot 或应用启动用例。这个结果说明当前外层客户端/Swift 协议仍可用，
不能证明 Target 窗口观察、真实截图点击或模型决策成功。

Swift 资源访问器已检查：默认运行入口直接使用 `.build/debug/cua-helper`，资源包
`CuaHelper_CuaHelper.bundle` 位于同一构建目录；当前没有发现默认入口遗漏复制资源的步骤。
这不是独立可分发安装包的验收。可见光标目前仍未接入生产输入。

## 最近原生集成证据与复现顺序

当前生产 Target 已在 private bind 与 Sky 状态入口准备 AppControllerWindowObservation，
在 AX enablement 后启动 ordering，在停用时释放 AX assertion 并停止 ordering。
坐标点击已读取维护中的窗口注册表，索引点击保留 WindowUIElementProtocol 包装。
这些是源码接通事实，不能替代真实效果验收。

2026-11-08 再次运行 `cua-helper --provider-click-self-test` 通过；该检查不发送真实输入。
`--window-observer-binding-check` 的五项只读符号解析已有通过记录，仍不证明原生通知回调、
窗口顺序恢复或真实输入成功。完整事件归属、源码证据及调度适配见
[NATIVE-MOUSE-WINDOW-INCIDENT.md](NATIVE-MOUSE-WINDOW-INCIDENT.md)。

用户确认事件顺序为：应用长期没有操作 → 用户取消授权。
因此之后的拒绝/取消不能作为之前点击无效的根因。排查必须比较取消之前的操作请求、
输入派发与实际界面变化；取消后的操作不得自动重试。

当前本地最新模型 JSONL 是 2026-11-07T11-11-49 的浏览器任务，终止于模型 HTTP 402；
它不是最近原生应用点击失败的直接证据，不能用它替代应用链路复现。

完整原生窗口 owner 的受控验收入口（尚待解锁后运行；不验证 ordering 或真实点击）：

```sh
native/macos/.build/debug/cua-helper --ax-notification-delivery-check --full-window-owner --allow-owned-ui
```

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
HTTP(S) 导航开始时触发 accessibility core 预加载。后续已补齐接线，见下方导航预加载验收；
这里的 schema 提取测试本身只证明参数契约。

## AX core 预加载生命周期还原

新增 `service/accessibility/core_loading.ts`，按当前原构建 lF/cF/Jh 还原
冻结环境对象限定、环境身份隔离、显式 WASM 路径排除、导航引用计数、取消、
正式初始化消费预加载 promise、预加载失败回退和正式初始化 promise 缓存。
`capture_manager` 的正式初始化已使用该状态机。后续 host 与导航触发接线见下方验收。

源码差分覆盖 8 类路径，真实 Chromium+AX/WASM snapshot 身份测试通过；
本轮未更改 credentialObservationGate 或放宽导航授权。

## 导航预加载接线与验收

已按当前源码接通：
- cua.createBrowserTab：新 tab 有 AX 能力且目标为 HTTP(S) 时，传 prepareAccessibility。
- Tab.goto：按选项追加 prepare_accessibility:true，缺省不追加。
- 导航命令：在 Page.navigate 的 beforeDispatch 阶段，仅 orbit+cdp+HTTP(S)+显式标记时
  布置预加载；主 frameStartedLoading 触发一次，导航失败释放引用。保留原有导航权限检查。
- browser host：读取部署目录的压缩 WASM，支持 AbortSignal，异步 Brotli 解压，
  交给已还原的预加载状态机；正式 AX 初始化消费缓存。

14 类导航场景与当前原构建差分通过；公共 goto、新建标签的 AX/URL 分支通过源码对照。
打包 host 实际加载 WASM 测试、构建及显式 AX 的 native 扩展 MCP 回归通过。
以上没有连接真实 orbit 服务：Chrome 扩展回归证明该路径未被新条件误触发，
不能替代真实 orbit+CDP 环境的预加载耗时与事件竞争验收。旧 credentialObservationGate
相关差异仍保留，未将此处的对照范围扩大为整个导航实现完全一致。

## 真实 Chromium 导航预加载组合验证

`browser-navigation-preload-live.test.ts` 用自有 HTTP 页面和 Chromium CDP 事件串联
Tab.goto → 参数解析 → 导航命令 → beforeDispatch/deadline helper → 真实 Page.navigate →
主 frameStartedLoading → 打包 host 预加载 → 正式 AX 初始化。
确认预加载只启动一次、早于 DOMContentLoaded，成功导航不取消，event/tabDetached
监听器在命令退出后清空，页面标题/URL 真实更新，正式 WASM 初始化成功。

该测试使用设置为 orbit/cdp 的 context fixture，以及 Playwright CDPSession 传输适配层；
不是生产 orbit 部署，也没有验证完整 CdpManager 附着/重试链。测试通过，产品逻辑未改动。

## Locator 批量读取审计

当前 read-all 客户端缓存和服务处理均已存在，本轮未发现该路径需要新增公开方法。
更新 `browser-playwright-collection.test.ts` 到当前客户端 SHA/符号，并直接测试 TS 源码，
避免陈旧 dist/旧压缩符号影响结论。选择器转义、缓存合并/首个超时、失败重试、
clear 与在途失败竞争、read-all schema 对照通过。

新增真实 Chromium read-all 对照：原 R2 与还原服务回调运行在真实 DOM 和注入 helper 上，
覆盖 10 种相对选择器/授权组合；password value 被过滤、普通 input value 保留、
缺失子元素返回 null、拒绝授权时未执行页面读取。共 5 项测试通过。
本轮没有修改产品逻辑，也没有将该服务专项视为完整 Agent/MCP 流程验收。

## AgentLoop 本地诊断补全

审阅本地一次 12 步耗尽日志：搜索页面已打开并读到候选结果，但经历选择器错误，
最后两步用于 completion_summary（先参数错误、后确认），未产生正常最终回答。
这份记录证明该次失败不能简单归因为浏览器未连接；不代表其他公开网页故障已解决。
未经验证的模型摘要仍不能作为任务完成证据。

发现 debug-log 的 Error 序列化丢失 cause、maxSteps 与 partialSummary；现补齐这些字段，
继续递归脱敏，并用祖先集合处理循环引用而不误删重复共享对象。9 项诊断/预算测试、
AgentLoop 类型检查通过。此处是独立 demo 的诊断改进，不声称原厂 AgentLoop 源码还原。
真实运行日志仍由 gitignore 排除，本次未上传日志、页面内容或凭证。

## 当前真实 DeepSeek → MCP → 扩展操作验收

使用 `CUA_LIVE_DEEPSEEK_TEST=1` 启用现有受控场景，在临时浏览器配置中运行
`extension-native-controller.test.ts` 的 native 扩展专项。真实模型读取项目本地配置，
经 Rust supervisor/MCP/扩展打开自有 HTTP 页面、点击 Run action、读取变化后的段落并回答。
测试约 19.4 秒通过：最终回答包含本次随机动作标记，HTTP fixture 独立确认按钮动作发生。

期间模型有一次未 await agent.browsers.get 就调用 nameSession 的 JavaScript 错误，
随后自行纠正并完成；没有据此修改原 API 的异步语义。completion_summary 本次以独立
summary-only 调用成功，之后产生正常最终回答，没有耗尽预算。该单次成功不代表
公开搜索网站稳定，也未证明此前所有步数耗尽问题已修复。

复现：
```sh
CUA_LIVE_DEEPSEEK_TEST=1 CUA_RUNTIME_SUPERVISOR=rust CUA_TEST_MACOS_SANDBOX=1 CUA_TEST_RUST_RUNTIME=1 node --import tsx --test --test-name-pattern='packaged native extension' reconstruction/extension-native-controller.test.ts
```
该入口会调用真实模型并使用本地 .env；运行日志仅保留本机，未上传页面/请求轨迹或凭证。

## 百度真实模型任务：当前拒绝边界

最新 CUA_LIVE_BAIDU_TEST=1/native 扩展运行约 11.7 秒失败：页面跳转涉及
https://wappass.baidu.com，受控测试的 origin allowlist 未授权该站点，浏览器观察被拒绝。
Agent 返回 blocked 并停止，没有取得可验收的搜索结果。此处是 fixture 的授权决定，
不能表述为真实用户点击了拒绝，也不能据此推断浏览器不能打开或该页面必然是 CAPTCHA。
没有为绕过拒绝而扩展 allowlist、换接口或重试该页面。

检查发现扩展测试失败处理曾直接通过 Playwright 再读页面并截图；已删除这条兜底诊断路径。
失败只使用既有 MCP/tool trace，浏览器关闭清理仍在 finally 中执行。
受控页面 native MCP 回归和 AgentLoop policy-stop 测试用于验证清理与停止行为；
不把它们当作此次百度搜索成功证据。

## 原生增量树静态证据补充

已新增 `NATIVE-AX-DIFF.md`、静态审计脚本和固定 hash 的 97 条 Swift 导出签名证据。
明确找到 AppController 的 disableAXDiffing/treeCache、SkyshotOperation 的 continuingFrom、
Revision 的 previousRevision/lineageRootRevision/differenceLines 及差分行预算接口。
这推进了原生职责和待实现结构的确认；不是函数体或差分规则恢复，disableDiff 仍未实现。
该历史检查时 helper 权限为 false；2026-11-08 权限已为 true，最新状态以本页开头为准。该历史轮次没有进行原生 UI 操作。
