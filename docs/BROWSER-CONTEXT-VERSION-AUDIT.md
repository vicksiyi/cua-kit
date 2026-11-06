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
