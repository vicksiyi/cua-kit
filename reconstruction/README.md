# Source reconstruction / 源码还原

当前目标是读取本机混淆 JavaScript 与声明文件，将原来的代码结构、调用顺序、分支、错误与参数转发还原成可读 TypeScript。原先 `src/` 的独立实现保留作历史参考，不能作为“原代码还原”的交付。

用户指定：TS 源码相对 import 不带 `.js`；保留分包关系，命名空间从 `@oai` 改为 `@core`。原始包名与路径记录在 `source-map.json`。

| 原始包 | 当前 workspace | 当前状态 |
|---|---|---|
| @oai/cua 0.2.6 | @core/cua | CUA 与 core 共 21 个运行模块已还原 |
| @oai/cua-repl 0.1.2 | @core/cua-repl | 包边界已建立，尚未还原实现 |
| @oai/sky 0.7.13 | @core/sky | 包边界已建立，尚未还原实现 |
| @oai/browser-desktop 0.1.1 | @core/browser-desktop | 包边界已建立，尚未还原实现 |
| @oai/browser | @core/browser | 在原声明文件中明确引用，运行代码内嵌；独立 manifest/版本与完整声明尚未定位 |

第一批还原：`create_browser_api`、`bind_tab`、`tab_reference`、`duration_seconds`、`get_browser_tabs`、`core/display`。原始对外 exports 已归档；未完成的 package entrypoint 不提前声明为可运行，当前并非完整可安装替代品。

**最新状态：** `@core/browser` 根入口现在导出 `setupBrowserRuntime`，与安装包 browser-client.js 的实际导出一致。98 项验证通过；需要可信宿主的 `nodeRepl.rpc`，不代表已经实现独立浏览器后端。以下增量章节记录各阶段历史状态，以末尾最新章节为准。

## 验证

```bash
npm ci
npm run check:reconstruction
npm run test:reconstruction
```

构建使用 TypeScript 的 Bundler 解析模式；源代码保持无扩展名。构建脚本仅为输出 ESM 的相对路径补 `.js`，跨包引用保留 `@core/xxx`。差分测试执行**构建后的 JS**，与安装包原 JS 使用相同 mock provider 输入，比较调用顺序、参数、返回值和异常，包括同步抛错/异步拒绝区别。

原包位置默认 `/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai`；可设置 `CUA_VENDOR_ROOT`。来源 SHA-256 用于标识本次研究版本。测试覆盖多组 browser API 场景，以及 AX 与 DOM fallback 两条 bind_tab 路径；不是完整语义等价证明，也未完成真实宿主端到端验证。

原 `@oai/browser` / `@oai/sky` 的完整依赖类型未装配。保留原 `.d.ts` 并仅改 namespace；少数外部边界暂用明确注释的 `any`/结构类型，`skipLibCheck` 开启。当前类型检查通过不代表所有依赖类型已还原。最终须恢复这些类型与完整 package exports，再验证宿主链路。

## 后续顺序

1. `create_tinysky_alt` / bootstrap / documentation / setup_browser，接通原 public exports。
2. browser-client 命令和 browser-service 内部 AX tree、element ID、frame、hit test、输入、截图的逐模块还原；保持原后端调用契约。
3. cua-repl 与 sky 的执行、传输和原生宿主边界；无法从 JS 获得的二进制实现明确列出。
4. 在还原后的原协议上接入 MCP client + AgentLoop demo，调用侧仍作为独立应用，不侵入核心包。

不会为了通过测试把未读到的原逻辑替换为自写后端。若需宿主替代实现，另行标识为替代实现，不能称为原代码还原。

## 初始化与文档增量

新增还原 `create_bootstrap_emitter`、`create_documentation`、`read_documentation`、`setup_browser`、`get_browsers`，累计 11 个运行模块。文档资源按原字节复制到 @core/cua/docs，并记录原文件哈希。初始化总入口及 native binders 仍未完成，因此 public exports 仍未接通。

当前 8 项验证通过，包括 browser facade 差分、bootstrap 串行/重试/请求身份缓存差分、环境/确认策略选择差分、实际文档读取字节对比、runtime 装配参数及部分 inventory 失败处理、来源哈希。仍不是所有行为的形式化等价证明。

## 三平台绑定层增量

新增 `bind_mac_app`、`bind_linux_app`、`bind_windows_app` 与 `screenshot_bytes`、`positive_pixels`、`one_screenshot`、`require_plain_text`，累计 18 个运行模块。还原的是原始 Sky 调用适配器，不是旧目录下自写的 Swift helper。

保留原行为差异：macOS durationMs 转秒，Linux 时间原样传毫秒；Linux 观察始终使用原始 window 并跟随 modal，动作使用最近返回的 window；Windows 观察更新 window、清空/更新截图区域，按区域 ID 校验坐标输入；Windows 截图由 Sky 输出而非重复 emitImage，并拒绝截图 emit:false。

当前 12 项测试通过。三个平台均对原 JS 比较单图、多图、缺图、观察失败、参数映射、同步/异步错误；截图字节测试比较 data URL、实际临时文件 URL 和失败路径。测试使用原模块配合同一 mock computer，不代表 Windows/Linux 原生系统运行已验收，也不代表底层 Sky 已还原。

## 联合清单与跨包依赖增量

新增原 `get_apps`、`get_state` 和 `oai_js_core/src/UnreachableCaseError` 的可读 TS，累计 21 个运行模块。原生/浏览器请求并行执行，Promise.allSettled 保留可用的一侧，并按原顺序汇总错误；Linux App 字段转换保留原逻辑。

原构建产物以相对目录引用独立的 `oai_js_core`，没有找到它的独立 package manifest。此目录显式映射为 workspace `@core/core`，并记录该命名是本项目映射而非已核实的原 npm 包名。CUA 通过 `@core/core/UnreachableCaseError` 引用，构建先生成 core，再生成 cua；不把跨模块 helper 复制回 CUA 包。

当前 14 项验证通过；新增原生平台清单、未知平台错误、11 种联合清单配置/故障组合的差分验证。完整初始化入口和原浏览器/Sky 实现仍未接通。

## 浏览器 AX 客户端与命令协议增量

已下探实际导入的 `oai_js_browser/dist/skill/scripts/browser-client.js`，还原 bundle 内的 `Fl` 为 `@core/browser/ax` 的 AxClient，并还原 Command（原 `_`）和 AX state/action schema。新增 3 个业务模块，累计 24 个；第三方校验器不计入还原模块数量。

```mermaid
sequenceDiagram
  participant C as @core/cua bind_tab
  participant A as @core/browser AxClient (原 Fl)
  participant S as AX command schema
  participant T as FunctionAgentTransport（已还原）
  participant B as RPC / Browser service（待还原）
  C->>A: get(state/screenshot/both) 或 click/paste/pressKey
  A->>S: 创建 tab_ax_get_state / tab_ax_action
  S-->>A: Command（保留原始 payload）
  A->>T: send({command})
  T->>S: toJSON()（保留原 payload）
  T->>B: executeAgentCommand(raw + client_timeout_ms)
  B-->>A: state / base64 data / screenshot_unavailable
  A-->>C: 文本、Uint8Array 或组合结果
```

命令构造本身不提前 parse，toJSON 保留原 payload，FunctionAgentTransport 本身不 parse（此前图示的 parse 箭头已依据原 xm 源码修正）；AX get 不展示，write 才调用 display。截图使用原 atob 路径解码，保持缺图、非法 base64 与 both 分支的错误语义。

校验库是原 bundle 内的第三方 Zod 实现。为避免用不同 npm 版本改变验证行为，以 `scripts/extract-bundled-validator.mjs` 提取原实现、仅格式化并添加导出，保留在 vendor；该文件使用 ts-nocheck，未冒称已完成其类型还原。业务 AxClient/schema/Command 是手工可读 TS。`browser-bundle-segments.json` 记录 Acorn UTF-16 位置及原符号，source-map 记录原 bundle SHA-256。

当前 17 项验证通过。测试给原 bundle 增加仅用于测试的导出，直接调用原 Fl 及原 schema，与构建后代码比较 capture 模式、返回缺失、显示顺序、base64 错误、18 类动作/参数场景、验证错误及原始/已解析 payload。此处仍仅是客户端协议层；真实 AX 收集、几何命中、CDP 点击与截图服务端尚待还原，没有把 RPC 编码误称为底层功能完成。

## Transport、展示与集合增量

新增 6 个可读 TS 模块：FunctionAgentTransport、display、Agent/Browsers/Documentation、Tabs，以及 browser inventory / tabs 命令 schema；累计 30 个业务文件。文件数量是本项目拆分计数，不代表原 bundle 内隐藏的源文件数量或完整度比例。包边界保持 @core/browser；bundle 内类的原文件路径不可得，文件分组在来源映射中明确标为推定。

- FunctionAgentTransport（xm）只调用 command.toJSON，不调用 parse；client_timeout_ms 始终覆盖 payload 同名字段，非正数变 undefined，Infinity 按原实现保留。空响应只拒绝 null/undefined。
- 返回带合法 string[] side_effects 时逐条 await 展示，再去掉该字段；数组类型不合法时原样返回，不擅自丢弃字段或抛错。展示失败停止后续副作用与返回。
- display（u/h/m）处理图片、原始值、包装对象、JSON fallback 和 UTF-16 字符截断。图片输出失败转为 error value；displayValue 失败直接传播，保持原 catch 边界。
- Browsers/Agent（il/nl）保留原 factory 注入、onBrowserUsed 时机和 transport 身份；此 Agent 是浏览器 API 容器，不是调用侧 LLM AgentLoop。
- Tabs（ol）的 new/get/selected/list 不额外解析结果。content 会主动 parse，且校验发生在空 urls 返回 [] 之前；空列表带无效 contentType/timeout 仍抛错。

25 项差分测试全部通过，新增链路直接串起还原的 AxClient、FunctionAgentTransport、display，再与原 bundle 三者组合比较；collection factory、raw payload、schema 错误、通知次序也直接比较原实现。RPC 仍为 fixture，**没有验证真实浏览器动作**。

当前下一层是 jm（manifest 过滤/实例包装）、fm/jh（Browser/Tab）和 Im（nodeRepl RPC、恢复错误），之后进入 browser-service。setupBrowserRuntime 和完整包入口尚未接通；不把已还原的 transport 回调误称为独立可用的浏览器后端。

构建后语义补充：原本只在 constructor 中赋值的 Command、FunctionAgentTransport、Agent 字段使用 TS declare，避免 TypeScript 额外生成 class field 定义而绕过继承的 setter；新增与原构造器的差分测试。

## Manifest 代理与 recovery 协议增量

新增 4 个业务文件，累计 34 个：`runtime/api_view`、`errors/browser_security_error`、`errors/credential_recovery_error`、`runtime/browser_service_executor`。对应原 jm/pl、r/a/i/s/n/o/c、d/l、Im 的具体逻辑。不是完整 jm/Im 入口已经完成：api_view 的原词法依赖 p（类型注册表）与 jh（Tab）暂作为显式内部参数，executor 是从 Im 提取的执行闭包，尚待完整 Browser/Tab 装配。

代理保留跨 view 的 proxy→raw WeakMap 和每次 view 新建的 raw→proxy WeakMap；方法包装缓存按属性键保存，已包装的方法即使原属性替换仍沿用旧函数。返回的数组和 Promise 递归包装，但普通结果对象不递归包装；输入参数中的普通对象/数组递归解包。原对象作为 Reflect.get/Reflect.apply 的 receiver，保持 private field/getter 的 this。禁用成员同时影响 get/has/ownKeys/descriptor；不增加 delete/set trap，不修复原有 Proxy invariant 异常。Tab 在缓存建立后装饰。browser override 可以覆盖默认 unsupportedByDefaultIn，但不能恢复全局 disabledMemberIds。

错误协议保留 16 种 security reason 的原消息、decisionSource、retryable、cause；recovery 解析验证 command/phase/reason/next_action/security_reason 的组合，非法输入返回 undefined，输出只保留协议字段。Error 的 details 冻结，但构造器本身不强制先解析。executor 严格以版本数字 1 选择 executeWithRecovery，否则沿用 execute；只接受 ok===true 或 ok===false 的对应包络。Orbit 的消息文本替换也逐字保留，不改变原 error 身份和冻结 details。

**当前 33 项差分测试通过。** 代理使用原 jm 和原类 prototype 比较缓存、属性描述符、装饰、禁用与异常；recovery 遍历 reason/action/security 组合。executor 与原 setupBrowserRuntime 实际调用后的 RPC 选择、返回和错误直接比较，RPC 使用 fixture；尚未接入真实服务或 credential 流程。

下一步完成 Browser/Tab 与能力注册表，然后让完整 runtime 入口使用这些已还原模块，再逐层下探 browser-service。全量类型、原 public exports、cua-repl/Sky 和独立调用 demo 仍是未完成项。

## Browser 能力、用户标签页与 Tab 服务增量

新增 10 个业务文件，累计 44 个（项目拆分文件数，不表示全量完成比例）：能力基类/定义/集合、management/visibility/viewport 与注册表、BrowserUser、内容导出/剪贴板/日志 API、相应 schema，以及共用的原 dl base64 解码。现有 AxClient 改为引用同一个原解码 helper，未改变解码规则。

- Gl/Hl/Ql/Yl/Xl 保留原 info 引用、文档路径与定义工厂的静态 info 覆盖顺序。集合保留普通对象属性查找，未改成 Map 或自有属性限定。
- Management 的 windows/tabs/tabGroups/bookmarks 是动态 Proxy；排除 then、toJSON、Object.prototype 成员和 symbol，方法不缓存。invoke/getAuditTrail 保留原返回 schema 校验和字段裁剪。Visibility/Viewport 也保留返回校验；Viewport 的参数展开顺序允许原有 browser_id 覆盖行为。
- BrowserUser 保留字符串 id 与对象 id 的不同处理：空字符串抛错，对象中的空 id 原样传递。getTabContext 解析 library_file/text/document 三种结果，document 用 atob 转 Uint8Array；openTabs/claimTab 不增添结果解析。
- ContentAPI、TabClipboardAPI、TabDevAPI 沿用原 client 层协议。剪贴板 read/write 只做原字段转换和顶层检查，不把 schema 校验提前；text/base64 恰有一个的要求保留在原 schema。日志 warning→warn、字段省略、正整数 limit 和错误顺序与原代码比较。

**当前 44 项差分测试通过。** 新增浏览器能力、用户标签页和 Tab 服务验证；覆盖注册描述/引用身份、命名空间、参数覆盖、audit schema、文档解码、剪贴板双数据字段与空项、日志错误。测试使用原 bundle 与相同 fixture transport，没有实际操作用户浏览器、系统剪贴板或导出文件。

Browser 层三种能力注册表已还原；Tab 的其他能力注册表、CUA/DOM-CUA/Playwright、Tab/Browser 完整实例与 runtime 装配仍未完成。之后还需 browser-service、Sky/cua-repl、完整类型/exports 和独立 MCP/AgentLoop demo。

## 坐标/DOM 输入、对话框与 Tab 开发能力增量

新增 8 个业务文件，累计 52 个：CUAAPI、DomCUAAPI、对话框对象、CDP/botDetection 能力及 schema、输入与 Tab 控制 schema。其中特别区分 2 个 schema 文件由原 AST 表达式提取、展开词法名称并添加推定 payload 类型，其余为手工还原；不是把格式化的整个 bundle 冒称为 TypeScript 业务还原。

`node scripts/reconstruct-input-schemas.mjs` 可重建输入与 Tab 控制 schema。原 validator 表达式、字段顺序、错误消息和共享 schema 身份不变，生成文件是可读 namespace/字段名而非原混淆标识符。`source-map.json` 为这两个文件记录独立的生成状态与脚本，完整 source hash 仍验证安装包版本。

- CUAAPI（Bl）保留 typeof 坐标检查、keys/keypress 的不同参数映射、空键/空拖拽路径错误；媒体下载同时转发服务端 timeout_ms 和 transport timeoutMs。
- DomCUAAPI（ql/Dl/Ll）保留 node_id 原 schema 的首条错误、必填/可选节点差异，以及 scroll/type 的参数解构行为。get_visible_dom 原样返回，不新增结果解析。
- 对话框（vh/xh/kh/Sh/Th）保留 dismiss、Confirm.accept、Prompt.accept 和字符串校验；不擅自给 Alert/BeforeUnload 添加 accept。导航、截图裁剪、handoff 与 dialog schema 已还原，完整 Tab 方法装配仍待完成。
- CDP（Su/ju/Iu）保留 target 字段转换、原始命令返回、事件结果校验；正数事件等待的客户端 timeout 为原值+2000ms，0/未指定不加客户端 timeout。botDetection（cu）发送前 parse，覆盖调用参数中的 browser_id/tab_id，并按原 schema 校验结果。

**当前 52 项差分测试通过，类型检查通过。** 新增输入映射/校验、DOM 错误、下载 timeout、对话框操作、25 种输入/Tab 控制命令 schema，以及 CDP/报告能力的组合验证。所有比较执行原 bundle 对应类/命令；transport 是 fixture，没有实际点击、下载、CDP 调试或用户接管。

剩余主要客户端依赖：Playwright、browserAuth/pageAssets/webMCP 三类 Tab 能力，然后完成 Tab/Browser/完整 runtime 入口。之后仍需 browser-service、Sky/cua-repl、类型/exports、调用侧 demo 与真实端到端验收。

## 页面资产、WebMCP、认证 schema 与 Playwright helper 增量

新增 7 个手工还原业务文件，累计 59 个（含此前 2 个 AST schema 生成文件）：pageAssets/webMCP 客户端和命令 schema、browserAuth 完整命令与诊断 schema、对象判定和 Playwright evaluate/error helper。api_view 现在复用原 pl 的独立还原，保持同一套普通对象判定。

PageAssets 保留 bundle 参数展开后覆盖 target id、list/bundle 返回解析；没有增加客户端 payload 校验。WebMCP 保留 descriptor 投影、原 description JSON 排列、同 call_name 后项覆盖、冻结工具快照、工具别名 trim、旧快照的 registration_id 和调用参数省略规则。调用只发送原有字段，未擅自把 schema 中的 tool_origin 加进客户端命令。

browserAuth 的 schema 已完整还原（字段/选项/密码专用请求约束、诊断与事件上下限），但 BrowserAuthTabCapability.request 和 locator 身份校验尚未接通：原 Vu 依赖真正的 PlaywrightLocator（kl）及它的私有 selector 访问器，不能用形似对象代替。Playwright 的普通对象/RegExp/错误判断、参数序列化、脚本构造、动作错误分类和坐标校验已还原，为完整 locator 做准备。

**当前 61 项差分测试通过。** 覆盖页面资产、工具快照/描述/调用、认证 schema，以及跨 realm RegExp、getter/proxy 失败、JSON 序列化顺序、evaluate 脚本与错误分类。业务自定义错误逐字比较；源变量重命名会改变 V8 自动生成的 TypeError 中的变量标签及 stack 位置。测试对两处已知标签差异（point/t 与 name/e.trim）做精确归一化，不把任意错误文字忽略掉，也不宣称 stack 字节等价。

这些仍是客户端层验证，未执行实际认证、网页工具或文件下载。下一步完成 PlaywrightLocator / FrameLocator / API，再接 browserAuth 和五类 Tab 能力注册表，完成 Tab/Browser/runtime 装配；底层 service、Sky/cua-repl、完整类型/exports 与独立 demo 仍需推进。

## Playwright 选择器与集合读取缓存

新增 3 个手工还原模块（累计 62 个业务文件，含 2 个 AST schema 文件）：selectors、CollectionReadCache 和 PlaywrightLocatorReadAll 命令/schema。对应原 Tl/jl/Il/Cl/Rl/Pl/El/Al/Ml、Sl、Yc。

选择器保留文本与属性不同的转义、正则 unicode/unicodeSets 分支、跨 realm RegExp 判断、exact 标记及原来的有限参数校验。集合缓存按 relativeSelector 共享 Promise；index 和 timeout 不进入 key，首次调用的 timeout 控制共享请求。失败删除 key，clear 不取消在途请求；旧请求失败会删除 clear 后同 key 的新缓存，忠实保留原竞态。结果不隐式执行 schema.parse。

**65 项差分测试通过，类型检查通过。** 新增选择器、并发共享/超时、失败重试、clear 与在途失败竞态、命令/结果 schema 验证。未接入真实浏览器；完整 PlaywrightLocator、FrameLocator、API 与 browserAuth 装配仍待完成。上述文件是实际依赖的还原，不代表完整 Playwright 已交付。

## Playwright 客户端与 browserAuth 接通

本轮新增 9 个业务文件：PlaywrightLocator、FrameLocator、PlaywrightAPI、Download、FileChooser、BrowserAuthTabCapability、五类 Tab 能力注册表，以及 locator/page 两个命令 schema 文件。累计 71 个业务文件，其中 4 个 schema 文件由原 AST 提取并补充可读名称与推定类型；其余为逐方法还原。新增 schema 同样由 `scripts/reconstruct-input-schemas.mjs` 再生成。

Locator 保留点击/输入/selectOption/check/等待/下载、单项与集合读取、evaluate、链式定位、and/or/filter、目标身份检查及 collection cache 传播。动作成功清缓存，waitFor 不清缓存；直接过滤集合根与过滤相对子选择器采用不同缓存规则。动作失败后请求 1000ms DOM 诊断，诊断失败退回原上下文错误。

Page API 保留 URL/load 等待、timeout+2000、download 默认 120000ms、waitForEvent 内部 rejection handler，以及 expectNavigation 先启动等待、再以 Promise.then 调用 action 的顺序。下载与文件选择对象保留原字段映射、参数检查和异常包装；elementScreenshot 保留原 atob 字节解码。FrameLocator 逐层插入 enter-frame 选择器。

browserAuth 现在使用真实 PlaywrightLocator 的私有 selector 访问器，拒绝形似对象及跨 browser/tab 的 locator，保留字段省略与 serialize → command.parse → send → result.parse 顺序。CDP、botDetection、browserAuth、pageAssets、webMCP 按原顺序注册。

**80 项测试通过，类型检查通过。** 新测试直接实例化原 bundle 类作差分比较，覆盖动作/读取/缓存/链式选择、局部错误、认证参数与身份、页面/事件/导航时序、27 组命令 schema、公开方法顺序和 arity。诊断回调经可读 TS 重写后，Function.toString 的文本会改变；对此执行两份实际脚本并比较 DOM 诊断结果与最终错误，不宣称其序列化脚本文本相同。自定义错误逐字比较，原生 TypeError 变量名称与 stack 位置差异仍适用此前说明。

本轮是完整 Playwright 客户端类的还原，不是底层 Playwright 服务已交付。尚未进行真实认证、网页输入、下载或文件上传。下一步装配 Tab/Browser 与完整 create/setup runtime，再继续 browser-service、Sky/cua-repl、声明与 exports、独立 MCP/AgentLoop demo 和真实端到端验证。

## Tab 与 Browser 装配

新增 Tab、Browser 和 browser_session 命令/schema，累计 74 个业务文件（4 个 AST schema 文件）。Tab 按原顺序创建 Playwright、DOM/CUA、AX、Content、Clipboard、Dev 与 capability 对象；Browser 创建 Documentation、browser capabilities、Tabs 和 BrowserUser，两个 tab 工厂入口共用原配置。

保留了原实现的目标身份差异：Tab 自身方法读取当前 public id，已经构造的子 API 固定为初始 id；Browser.history 使用私有初始 id，而 documentation/nameSession 读取 public browserId。构造器仍为赋值语义，继承 setter 会被触发；未改成 TS emitted public field definitions。

截图 clip 仅检查 typeof number（保留 NaN/Infinity 的原行为），数据按 atob 解码；对话框按实际 type 创建，未知/缺失返回 undefined。handoff、导航和读取保留各自 transport 检查位置。history 保留 options→queries→limit→from→to 的验证顺序、日期转换与可选字段省略，session name 按原 trim。

**86 项差分测试与类型检查通过。** 新增 Tab 路由、子 API 绑定、截图/对话框、构造/transport 错误优先级、Browser 工厂与能力装配、history、继承 setter/成员顺序、3 类命令 schema 对比。测试执行原 bundle 的 jh/fm；仍使用 fixture transport，没有真实浏览器操作。

下一步还原完整 runtime registry、jm 工厂与 setupBrowserRuntime 接线，再导出可运行客户端入口。当前尚未完成完整 runtime，也未完成底层 service、Sky/cua-repl、完整类型/exports、独立 MCP/AgentLoop demo 或端到端验收。


## Runtime 注册表、工厂与根入口

新增 7 个文件（累计 81 个业务文件）：原 p/b 的运行类型和命令注册表、RuntimeConfig schema、generateRequestId、BrowserRuntimeFactory（jm）、setupBrowserRuntime（Im）和根导出。注册表保留 key 顺序、普通对象原型及不可配置的只读 getter；AX 命令补齐原命名空间的 schema/type 元数据。

工厂接通已还原的 API proxy：manifest 决定 runtime class，按浏览器类型和 overrides 过滤成员，global disabled 不能被 override 重新开启；Tab 装饰、方法缓存、跨 view 参数解包沿用原实现。createBrowser 保留实例箭头字段绑定，createAgent 使用真实 FunctionAgentTransport。此处 Agent 是浏览器 API 容器，不是 LLM AgentLoop。

setupBrowserRuntime 检查可信 nodeRepl.rpc，提取方法后以原 receiver 语义发出 browser setup/execute/executeWithRecovery。仅 credentialRecoveryErrorVersion 严格等于 1 时走恢复 envelope；Orbit 环境只改变指定错误后缀，不修改 setup 请求中的显式 environment。显示桥使用 host.emitImage 和 console.log，截断阈值 100000。

构建后可使用 `import { setupBrowserRuntime } from "@core/browser"`，包根仅导出安装包实际导出的运行时函数。原包完整声明与其它 workspace 的 public exports 尚未完成；不把客户端入口接通等同于全套独立产品已可用。

**94 项差分测试与类型检查通过。** 新增注册表键/descriptor/构造类型可用性、ID 格式、工厂过滤与装饰、setup→Browser→Tab→AX→browserAuth 的组合调用、Locator proxy 解包、严格恢复分支、Orbit 错误映射、宿主失败及包根导出。组合测试中的宿主 RPC 是明确的 fixture，没有实际点击、认证或观察用户桌面。

接下来进入 browser-service 的协议入口和命令分发，继续读取其实际实现；还需完成 CUA 初始化、Sky/cua-repl、完整类型/exports、独立调用 demo 与真实端到端验证。不会把旧独立后端接到这里冒充原实现。

## browser-service RPC 与错误边界

开始读取实际嵌入的 `browser-service.mjs`（1578397 字节，SHA-256 `bc9f10f913da912bd0cd17a22432a605526c5d3a01d6be43eea0ac2e0284bfb0`）。新增 5 个还原模块：RPC dispatcher、内部/公开错误分类、服务端 security/recovery/locator 错误类。service 错误类保留独立身份，不复用 client 类；即使 name/details 相同，也不能改变原 instanceof 捕获范围。

原 handleRpc 通过 own property descriptor 查找方法，拒绝继承方法；setup 仅允许四种环境，并立即替换共享 runtime Promise。并发 setup 各自返回已开始的初始化结果，后续 execute 使用最新 Promise。初始化失败不会自动恢复旧 runtime。executeWithRecovery 只捕获服务端 xs 类，其他错误按原身份抛出。

dispatcher 的 createHostRuntime / initializeRuntime / withSpan 明确对应尚待还原的 mH / p6 / mn；这是实际分发状态机的依赖边界，不是已实现后端或生产 fallback。目前没有导出伪装可用的 `@core/browser/service` 入口。源码显示 p6 内部还包含 context/session 生命周期、文档门禁、按 browser API 缓存执行上下文、Tab reclaim、下载 setup 同步、认证边界、AX WASM 初始化及实际命令表分发；这些仍待逐项还原。

**98 项验证通过。** 服务测试从原 bundle AST 提取指定表达式并执行，避免导入完整服务时启动无关原生/遥测依赖。覆盖四环境、拒绝非自身方法、初始化并发/失败、错误类别与身份、恢复 envelope；另将已还原客户端连到 dispatcher fixture，验证服务端错误经序列化后成为不同身份的客户端恢复错误。没有执行真实服务命令或网页操作。

`node scripts/extract-browser-service-segments.mjs` 生成 `browser-service-segments.json`，记录源哈希与 UTF-16 位置（不是字节 offset），用于导航与溯源；生产代码不读取安装包。下一步进入 p6 调度和其具体依赖，完整 backend、Sky/cua-repl 与调用 demo 仍未交付。
