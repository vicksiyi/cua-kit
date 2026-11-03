# RFC-0001 补充：从 getTab 到浏览器内核

状态：设计/源码分析，未实现；2026-11-03

此补充细化并修订 [RFC-0001](RFC-0001.md) 的浏览器模块与实施顺序。

## 范围修订：交付完整浏览器运行链路

本补充以用户最新要求为准：最终目标不是一层 MCP façade，而是具有具体 getTab、状态采集、点击、截图实现的完整代码体系。当前仓库仍只有设计文档；此前 Browser Provider 只写成一个盒子，粒度不足。本补充展开该盒子，作为 RFC-0001 的实现深度修订。

明确完成标准：即使不启动 MCP，直接通过 SDK 也能发现/绑定浏览器、取得页面状态、执行点击与输入、返回截图和刷新结果。MCP 只是一种接入方式。不得把核心方法实现为调用尚不存在的外部私有服务，也不得以 mock/stub 冒充后端完成。

以下“已观察”描述当前安装包的静态代码；“拟实现”是项目设计。尚未做逐分支动态验证，不能据此声称完全理解两兆字节 bundle 的全部行为。仍保留先 review 后开发的阶段约定。

## 源码分层：指定的两个文件之下还有什么

create_browser_api.js：浏览器选择、标签引用解析、枚举、精确匹配、claim、绑定和初始状态输出；并不直接实现浏览器协议。bind_tab.js：给底层 Tab 加上统一 getAXState/getScreenshot/click 等方法，按 AX 是否可用分流。setup_browser.js：调用 setupBrowserRuntime 并通过 decorateTab 注入 bind_tab。

browser-client.mjs：Browser/Tab/Ax 对象、参数 schema、命令编码和 transport.send；setupBrowserRuntime 通过 nodeRepl.rpc("browser", ...) 发 setup/execute/executeWithRecovery。服务返回 apiManifest、disabledMemberIds 等，客户端据此构造能力面。

browser-service.mjs：命令路由、浏览器实例及 session 管理、权限、AX 状态机、DOM/frame 收集、截图、几何定位、输入分派、导航与弹窗处理，以及宿主/浏览器后端连接。当前文件约 2 MB，不能把它视作普通 HTTP 转发器。

browser-accessibility.wasm.br：JS 调用其 revision_create/text/identity/is_value_settable 等导出函数，用于可访问性版本、文本和元素映射。WASM 内部实现语言和全部算法尚未确认；不能通过美化 JS 得到这部分源码。另见 zxing_reader.wasm，其用途本次未展开，不能据文件存在就把它列为基础点击依赖。

安装包有多个嵌套 browser-client 副本。读到的文件与实际 import/export 路径必须逐项对应；本轮以外层 browser-desktop 的 client/service 为主要深入分析对象，结合 tinysky_alt 中实际 import 路径。正式移植前需做模块解析与版本去重清单。

## getTab 的实际行为链与拟议模块

已观察链路：cua.getTab(reference, options) → 选择 browser → 加载 browser 文档 → browser.tabs.list() → 解析 string / mention / URL → 必要时 browser.user.openTabs() 补查 → 唯一匹配 → tabs.get 或 user.claimTab → 返回经 decorateTab 包装的 Tab → 首次 getAXState(disableDiffing=true)。

约束：URL 查找要求明确 browser；mention 核对 profile/browser、title、URL；无匹配、多个匹配、过期引用要失败，不能悄悄新建标签。特殊新标签页可以只返回元数据。getTab 还涉及资源归属，而不只是“找到一个 tabId”。

拟实现：BrowserRegistry 管实例与 profile；TabResolver 管三类 reference；TabOwnership 管 claim/释放与冲突；TabFactory 注入 observation/input/lifecycle 能力；DocumentationEmitter 管首次说明。对应代码不依赖 MCP，可供独立 SDK 调用。

## AX 状态：从 CDP 原始节点到模型可用编号

已观察：getAXState → tab.ax.get("state") → tab_ax_get_state（content=axState）→ service 的权限校验 → ax.capture → 等待导航/首帧/AX 稳定 → Page.getFrameTree + DOMSnapshot.captureSnapshot → 对各 frame 调 Accessibility.getFullAXTree → 合并 frame 和 DOM 元数据 → accessibilityCore.buildRevision(previous, snapshot, options) → 状态文本与 targets 映射。

Frame 会涉及独立 debugger session 和跨进程 iframe。状态记录 mainFrameId、loaderId、documentKey、navigation revision；capture 后还会校验来源，避免页面切换期间把旧观察提交为新状态。部分 iframe 失败可以产生 warnings；不能默默把残缺状态当成完整观察。

拟实现：FrameSessionManager、RawAxCollector、DomMetadataCollector、SnapshotNormalizer、ElementRegistry、AxTextRenderer、SnapshotDiff、CaptureCoordinator。初版以 TS 独立实现可读语义树、编号和差量，不要求复制厂商 WASM 的原始字节或编号算法。验收以含义、可操作性、过期保护和差量可重建为准。

关键接口设计：ElementRegistry 保存 snapshot-local numeric ID → identity → {frameId, backendNodeId, loaderId, targetSession}；跨导航失效；renderer 输出的数字必须与 registry 同版本。任何点击都必须能从输出编号反查到真实页面目标。

## click 的实际链：并非把编号直接丢给鼠标

已观察：tab.click(42) → bind_tab → tab.ax.click(42) → client 编码 tab_ax_action(kind=click,target=42) → browser RPC → service 路由与 actInFrame 权限 → ax.performAction → 按元素 identity 找 target → 验证 documentKey → 计算目标几何和命中点 → 必要时滚动并等待稳定 → CDP 鼠标输入 → 记录待完成导航/页面加载等待。

细节：可见代码检查覆盖与可点击性、DOM.scrollIntoViewIfNeeded、frame 对应的输入目标、modifier、clickCount 和按住时长。clickPoint 内部按 mouse move/down/up 顺序执行，取消或异常时尝试释放已按下按键/鼠标。部分 option/控件有专门处理，某些失败分支会采用 DOM 激活；因此“所有点击都是 mouse event”也不准确。

坐标分支：校验当前 viewport 范围，使用对应输入坐标空间。编号分支还需 backendNodeId/iframe/session 定位。inputPoint 与顶层 point 可能不同，不能简单取截图中心后无条件发送到主 frame。

拟实现：ActionDispatcher、ElementResolver、GeometryResolver、HitTester、ScrollSettler、InputExecutor、ModifierGuard、NavigationTracker、DialogAdapter。先实现明确支持的普通控件，特殊元素/跨 frame/长按逐项验收；不能用任意 element.click() 代替完整输入语义。

## 截图与输入的实际链

已观察截图：tab.getScreenshot() → 有 AX 时走 ax.get("screenshot") / tab_ax_get_state；没有 AX 时走 tab.screenshot() / tab_screenshot。客户端把服务返回的 base64 解码为 Uint8Array，再交给图像输出层。

service 可见 Page.captureScreenshot、viewport/fullPage/clip 与缩放处理，另有 Page.startScreencast/screencastFrame 路径及 frame ack/stop。不能宣称每次截图只走同一方法。AX 模式下还需把观察与当前 document/session 绑定；截图缺失与 AX 文本可用应分开报告。

已观察输入：typeText(index,text) 先通过 element target 与 focusNode 准备可编辑目标，再执行输入；null 代表当前焦点。paste 涉及剪贴板格式、互斥与 frame 焦点；pressKey 涉及组合键与长按。setValue/selectText/secondaryAction 也有各自语义，不能全都改写成输入字符串。

拟实现：ScreenshotService（capture/clip/scale/timeout/data decode）、FocusResolver、TextInput、ClipboardBridge、KeyDispatcher、SelectionAdapter。截图返回 bytes + mimeType + size + scale + snapshot/document 关联；不把 console.log(base64) 当作最终图像输出能力。

## 浏览器通信后端与外部边界

已观察 browser-client 的 RPC 依赖宿主 nodeRepl；service 初始化还依赖 privileged Node REPL capabilities，存在 nativePipe、browserContext、extension/profile 与权限相关模块。这里不是直接 import 到任意 Node 脚本就能运行。

拟实现需要两条完整后端：ManagedBrowserTransport（项目启动浏览器，CDP/Playwright 接入）与 ExtensionTransport（自研扩展、Native Messaging host、本地 broker、profile/tab 会话映射、事件与断线重连）。浏览器外部传输必须做 command ID / response / event / timeout / session multiplexing。

本轮已经证实 service 内存在 CDP 状态和输入实现；尚未对 Chrome 扩展源码、native messaging host 与 IAB 全部桥接协议逐一验证。因此不能把“看见 nativePipe 字符串”当成完整端到端扩展实现已经摸清。正式源码分析下一步要沿 BrowserContext/后端构造和 connection dispatcher 继续追踪。

Mac 原生应用仍需独立 AX/截图/输入 helper；浏览器 DOM/CDP 后端和 macOS 原生后端是两套具体实现。IAB/MCP Apps 由宿主提供的桥接作为单独兼容项，不能放在普通浏览器支持里含糊带过。

## 完整代码交付清单与验收修订

完整浏览器链路交付至少包含：SDK façade；browser/tab registry；reference resolver；claim/session manager；命令 schema + RPC transport；browser connection backend；CDP target/frame 管理；AX+DOM collector；文本/编号/diff engine；元素定位/几何/命中测试；动作/键盘/剪贴板；截图服务；导航/弹窗状态机；取消/权限/审计；文档与图像展示；扩展/native host；契约与集成测试。MCP adapter 只是其中一项。

验收一：纯 SDK 脚本完成 getTab → AX 文本 → 按编号点击 → 输入 → 截图 → 验证页面；没有 MCP 也可运行。验收二：受控浏览器与授权的现有标签分别完成同一业务测试。验收三：跨 iframe、导航过期、遮挡、滚动、缩放、权限拒绝、取消和断连结果可预测。

源码阅读交付：按入口建调用图、列出模块输入输出/副作用、记录对应路径与 hash、区分真实实现和尚未验证的推断。反混淆只能帮助理解 JS；TypeScript 类型需要重新设计并由测试约束。不得声称美化输出就是原始 TS。

实施顺序调整：先分析并实现一条真实的浏览器垂直链路（getTab/observe/click/screenshot），再扩展其余操作和现有标签后端，最后接 MCP 展示与宿主 lifecycle。底层可验证能力优先于包装层完整度。本轮仍是 review 材料，没有启动功能实现。

## 以构建产物与类型声明交叉还原

分析起点明确为本机 JavaScript 构建产物和 .d.ts：先用 types.d.ts/create_browser_api.d.ts/bind_tab.d.ts 建立公开类型图，再读对应 JS 的分支和副作用，随后追到 browser-client/service 的命令 schema、状态机与执行函数。外部标准与库只用于理解或替换具体依赖，不代替源码证据。

已核对类型：TabReference 是 tab ID、mention 或 URL 三选一；getTab 不新建页面；Tab 是原 BrowserTab 与统一 Target 的交集；click 支持编号或二维点；getScreenshot 返回字节；浏览器 typeText/pressKey/paste 带元素编号或 null。接口有可选能力，不能将缺失方法当作运行时错误后随意回退。

发现一个需要记录的版本/注释偏差：tinysky_alt/types.d.ts 的 Tab 输入注释写聚焦 250 ms，而本轮读取的外层 browser-service.mjs 的 H0 实现传 timeoutMs:3000。两者不能同时作为精确行为承诺，且安装包含多份嵌套依赖。须解析运行路径并做实验后再确定兼容值；这说明 .d.ts、注释、实现和实际运行结果必须交叉核对。

每个方法的分析产物固定为：声明签名 → 实际调用图 → 参数/返回/错误 → 状态与副作用 → 外部依赖 → 项目模块与接口 → 验证用例。覆盖范围逐步扩到 getTab、observe/AX、click、screenshot、typeText、scroll、生命周期与后端连接。此时输出是源码级设计，不宣称已经完成全量反混淆或编码。
