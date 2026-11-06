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
