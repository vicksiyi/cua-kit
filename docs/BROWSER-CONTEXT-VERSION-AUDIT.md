# 当前 BrowserContext 与旧还原版本的差异

依据：当前安装包 browser-service 的固定 SHA-256（见 reconstruction/service-source.ts 及对应差分测试）。通过 acquireAuthority/localize/dispose 方法集合定位上下文类，当前混淆名 lb；旧版上下文 ob 不能继续直接作为 oracle。

## 本次补齐

当前原构建上下文有 cloudSiwcUserId getter，以及 getSiwcAccountContext、issueSiwcBrowserGrant、installSiwcBrowserGrantCookie 三个转发方法。本地此前缺少它们，现按原字段与调用顺序补齐：

- 仅 CDP 后端读取 runtime.gaas.browserConfig.user_id；extension / iab 不发送云用户标识。
- 通过现有 api.sendSessionRequest 转发，保留 tabId、expectedAccount、grant。
- 不复制或改写 account/grant，不吞掉 provider 拒绝，也不添加重试。

两个源码差分测试通过，覆盖三个后端、缺失/null/空/正常 user_id 及 provider 拒绝。Browser TypeScript 检查通过。只用 fixture 数据验证转发，没有调用真实登录服务、创建实际 grant 或安装 cookie。

这只补齐上下文接口，不代表 SIWC 登录能力端到端可用。能力发现、浏览器 feature gate、服务端支持与原有授权仍需联调。

## 明确未完成的迁移

1. 当前原构建 BrowserContext 不再创建 credentialObservationGate，也没有 removeCredentialNavigationListeners；本地旧版上下文、scheduler、导航和观察接口仍使用它。不能只删截图包装就推导出完整权限对齐。
2. 当前 supportsTabCapability 通过有效能力过滤器 Ea，包含运行时禁用列表及 browser_use_siwc_enabled 的浏览器特定 feature gate；本地仍直接看 getInfo 的原始 capabilities。尚需还原 browser-specific feature client 生命周期再统一能力发现/文档/执行检查。
3. 当前 acquireAuthority → BrowserSecurity 仍存在；credential gate 消失不意味着没有权限检查，也不能仅根据字段缺失推断完整授权模型已迁移到何处。

下一步应以同一固定版本连续审计 feature client、有效能力过滤和调度入口，不混用旧别名或把不相干的测试通过当作全量一致性证据。

## 后续完成：按浏览器隔离的 feature client 与有效能力

上面第 2 项已推进：
- 新增 browser_feature_clients，对照当前 XB/YB/JB：按 userID、email、backend、family、caller variant 隔离；同 key 共享初始化 Promise；初始化失败移除并 shutdown；只有 Ready client 才检查 gate。
- 组装到 browserTelemetry，等待基础初始化和 caller identity，再预热目标浏览器 client；没有身份或禁用 ambient network 时不创建新 browser client。
- 新增 effectiveBrowserCapabilities，对照当前 Ea：过滤运行时禁用列表；SIWC 仅在对应 browser-specific gate 启用时出现。未就绪或没有 gate 的情况不开放。
- browserDetails 依当前构建改为异步；文档调用方等待其结果。supportsTabCapability 与 handoff 的能力读取也使用有效能力，而不是原始 provider 列表。

5 项针对性测试通过，覆盖原构建差分、调用身份隔离、失败清理、禁用列表、SIWC gating、provider 错误、异步文档组装及真实 telemetry 组装（fake Statsig / fixture identity，无网络凭据）。另有原 SIWC forwarding 两项测试通过。重建与 Browser TypeScript 检查通过；真实 native 扩展 MCP 表单操作、截图、locator 驱动光标回归通过（约 9.2 秒）。

未完成项仍包括：真实 SIWC 账号流程、旧 credential guard 与调度器整体验证，以及其它旧版 feature/telemetry 方法的版本迁移；本次不声称整个授权系统完成对齐。底层 Statsig 使用已有第三方库，没有重写该库。

## 命令执行边界的回归

刷新 `browser-service-webmcp-command.test.ts` 的旧符号（旧 BA 现已是 schema，不能再当作模型门函数；当前 invoke 命令为 Lh），并固定构建哈希。四项通过：
- 模型限制、支持能力检查与审批参数投影的源码差分。
- invoke/list 的授权、会话目录元数据替换与失效检查顺序。
- 已组装的 list → approve → invoke 路径在真实受控 Chromium 页面修改 DOM。
- 使用真实 BrowserContext.supportsTabCapability：provider 声明 webmcp 但运行时禁用它时，invoke 在页面读取、审批与 CDP 派发前拒绝；不会只在文档中隐藏。

这里证明 WebMCP 命令已有的支持检查正确接入有效能力过滤，不意味着新增了所有命令通用的 capability 拦截器。原 runtime_policies.assertCommandSupported 本身只覆盖特定下载组合，不能把它误称为通用权限检查。

## SIWC 客户端协议恢复（尚未注册为可用能力）

已新增 commands/siwc.ts 与 capabilities/tab_siwc.ts：还原 detect/authenticate 的 payload、结果 union、候选数量规则、AX/DOM target 约束，以及客户端调用顺序。authenticate 在发送前 parse，并以当前实例的 browser/tab id 覆盖外部同名字段；detect 与 authenticate 都原样返回 transport 结果，不擅自多做结果解析。

两项测试通过：schema 对照当前原构建、客户端验证与派发边界；Browser TypeScript 检查通过。没有发生真实登录、grant 请求或 cookie 安装。

当前没有把该类加入 tabCapabilityDefinitions，也没有注册未完成的服务端命令。剩余工作明确为：
- 注入脚本的 siwcDetect/siwcDocumentId/siwcRef/isSiwcControl；
- detect 的会话与 document generation 校验；
- authenticate 的绑定 selector、页面/账户反复校验、原生用户授权与 permission 持久化；
- grant、cookie、单次点击的完整编排及各失败状态；
- 完成后再一起接入命令注册、能力注册、文档与端到端验收。

上下文方法和客户端类型存在，不代表以上服务端流程已完成。

## 后续恢复：注入检测与页面一致性

已按当前 PF 还原 SIWC 注入 helper，并接入 Playwright 的正常首次注入：识别显式标记和 ChatGPT 按钮/链接，保留 rendered/hidden 区分，拒绝断开节点和 closed shadow 控件；refs 绑定当前 aria snapshot，snapshot 对象变化时 document generation 变化。

已恢复 Co/Dc/bN/Pv 的只读观察和页面身份检查：检测结果绑定 session、tab 和 document generation；generation 变化返回 page_changed；读取失败返回 observation_unavailable；提交页面使用 frame id、loader id、origin 和包含 fragment 的 URL 校验。

验证：真实 Chromium DOM 对照当前 PF 的候选、可见性、shadow、ref 和 generation 行为通过；两个 service helper 差分测试通过；重建与 Browser TypeScript 检查通过；真实 native 扩展 MCP 页面点击、截图、光标回归通过（约 8.9 秒）。本次没有发起登录、授权或 cookie 操作。detect/authenticate 对外服务命令注册仍待完整编排完成。

## 后续恢复：SIWC 检测授权与点击前校验

从同一 hash 的 `yN/Ja/mte/uw` 恢复检测命令及自包含页面 readiness 函数。检测先检查 capability，再对观察前后各自的当前 URL 做 observeContent 授权；第二次拒绝不会返回已观察内容。点击前检查 control、visible、enabled，滚动后等待一帧并重新检查和 hit-test；自动模式要求唯一候选且 ref 相同。账号比较保留 accountKey、authLifetimeId、authOrigin、pageOrigin 四字段。

新增 3 项源码差分测试通过：包含 capability 缺失、前后授权拒绝、观察失败、无效 tab；readiness 的 8 种情况 × scroll/automatic 组合；逐项账号身份变化。Browser TypeScript 检查通过。这些是命令/页面算法边界测试，不代表真实登录流程验收。检测命令尚未加入公共注册表；完整 authenticate、偏好存储、原生 grant/cookie 编排仍未接通。

## 后续恢复：SIWC 授权偏好存储

从当前 `pu.getSiwcPermission/handleSiwcPromptResult` 以及 `Yoe/Cg/du/xS/jL` 恢复 SIWC 资源。表名为 `siwc`，键为精确 `JSON.stringify([accountKey, origin])`；不做通配符转义、去空白或域名模式匹配。SIWC 无 never_ask 模式，缺少显式 persist 时不默认记住决定；读全局和会话表均要求 refresh snapshot。保留原本的拒绝优先级及持久化策略。

验证：存储/匹配源码差分及实际 Preferences 会话授权、跨账号隔离、全局拒绝优先、cancel 不写入、强制刷新测试通过；Browser TypeScript 与重建通过。测试使用内存配置，无真实账号或授权写入。

本轮真实 native 扩展 MCP 浏览器操作回归通过（约 8.8 秒），包含 locator 点击和光标检查。完整 SIWC authenticate 编排与公开注册仍待完成，不宣称登录能力已可用。

## 后续恢复：authenticate 服务编排

恢复同一构建 `gN` 的完整服务命令处理器。保留 capability/authority 检查在阶段异常捕获之外；自动/显式 DOM/AX 目标解析；绑定 selector 后的 committed-page 验证；账号 origin 核对；用户授权 metadata 与持久化选择；grant 前、cookie 前、click 前页面检查及账号复查；各阶段对应失败状态。仅最终 click 完成后返回 initiated，该状态不等于登录已完成。

新增差分测试覆盖 27 种场景，比对原函数与还原实现的结果和完整有序副作用轨迹，涵盖成功、无候选、多候选、过期引用、无效 ref、授权拒绝/取消、账号变化、页面变化、grant/cookie/follow/click 异常。总计本轮 8 项 SIWC 编排/检测/偏好/观察测试通过，Browser TypeScript 和重建通过。测试依赖受控 context，未执行真实账号登录。下一阶段仍需公共 catalog/capability 注册与真实 service/provider 集成验证。
