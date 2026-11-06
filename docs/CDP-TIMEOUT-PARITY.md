# CDP 超时与主动 detach：源码核对

核对依据：`reconstruction/extension-source.ts` 固定 SHA-256 的本机扩展构建；只提取所需绑定执行，不运行扩展启动体。使用同一依赖故障注入，比较原构建的 BrowserSession 与还原 TS 的返回值、异常与完整调用顺序。

## 已确认的会话层行为

| 情况 | stopLoading | detachAfterTimeout |
| --- | --- | --- |
| Page.navigate 发生 CDP command timeout | 原 target，1000ms；失败忽略 | 有数字 tabId 且 preserve 不严格等于 true 时调用 |
| Runtime.evaluate 发生 CDP command timeout | 不调用 | 同上 |
| target 只有 targetId，无 tabId | 导航超时仍调用 | 不调用 |
| target 同时有 tabId 与子 sessionId | 导航超时仍调用 | 仍按 tabId 调用 |
| preserveDebuggerOnTimeout 为布尔 true | 导航超时仍调用 | 不调用 |
| preserveDebuggerOnTimeout 为字符串 "true" | 导航超时仍调用 | 不豁免 |
| 普通 Detached while handling command 异常 | 不调用 | 不主动调用 |

原构建会等待 detachAfterTimeout；如果该依赖自身抛错，会替代原始 timeout 向外传播。此项是会话层依赖边界测试，不代表真实 Chrome detach 必然会传播该错误。底层 debugger runtime 另有自身的异常处理。

## 本次验证

`node --import tsx --test reconstruction/extension-browser-session.test.ts`：12 项通过。新增矩阵含 24 个 method/target/preserve 组合、4 个清理失败组合及普通断连异常。比较的是实际提取的原构建方法，未在真实 Chrome 中人为制造 command timeout。

`node --test reconstruction/browser-wire-trace.test.mjs`：4 项通过。wire trace 新增固定分类 `cdp-command-timeout`，仅匹配 CDP command deadline 格式；不输出原始错误、selector、URL、token 或 CDP expression。分类只用于诊断，不控制重试或授权。

## 对实际断连问题的意义与限制

元素定位等待超时与底层 CDP 命令超时是不同层次。前者不能据此判定 debugger 已被主动断开；后者在上述条件下确实进入主动 detach 路径。此前同 tab 的 selector timeout 后恢复成功，也不能证明底层 CDP 超时后会保留连接。

后续真实失败应按同一 connection + RPC id 关联 `executeCdp` 请求、`cdp-command-timeout` 响应和 detach 通知；通知与响应到达顺序可能受调度影响。该类别是错误格式提示，不是独立的根因证明。

本次未修改恢复策略，也没有把间歇断连宣称修复。用户侧日志仍保留本地，不进入 GitHub。
