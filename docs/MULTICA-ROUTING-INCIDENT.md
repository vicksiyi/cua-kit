# Multica 请求误路由：本地运行记录核查

核查日期：2026-11-06。仅记录必要的诊断结论；原始调试日志仍保留在本机忽略目录，不随文档发布。

## 已证实的两次失败

本地日志时间为 UTC。

| 请求时间 | 请求目标 | 启用能力 | 实际操作 |
| --- | --- | --- | --- |
| 11:58:51 | 打开 Multica 查看 issue | browser=true，computer=false | 创建 multica.ai 网页，随后访问 app.multica.ai 和登录页面 |
| 12:00:05 | 打开 Multica 应用 | browser=true，computer=false | 创建 multica.com 网页；返回的是域名出售页面，随后仍调用完成摘要 |

两次预检均走 host-browser-preflight / host-browser-inventory，返回 apps=[]。这只表示该部署没有提供应用清单，不能推断 Multica 没有安装。两次都没有调用 cua.getApp。

直接原因是部署仅暴露浏览器能力，模型又把本机应用请求替换成了网站。第二次还有未经观察确认就猜测域名、把错误目标报告为完成的问题。日志没有记录当时完整 shell 参数，不能进一步断言是用户显式传入 --browser，还是当时的默认部署造成。

## 当前代码与历史记录的区别

- scripts/run-deepseek.sh：macOS 无显式后端参数时默认 unified；显式 CDP/managed-browser 后端默认 browser。该规则是 demo 宿主部署策略，不是从 CUA 还原的自然语言分类器。
- packages/agent-loop/src/surface-context.ts：向模型说明实际可用 surface；本机应用请求使用文档中的应用入口；能力不足时解释限制，不得擅自换成网站。歧义名称应结合清单或澄清。
- docs/diagrams/current-detail/04-surface-selection.mmd：记录当前部署、清单、模型选择及调用链。

13:30:02 的另一次运行使用 browser=true、computer=true，仅要求检查清单，实际发现运行中的 Multica（ai.multica.desktop）。这证明统一模式可发现应用，不证明已经打开、观察或操作应用窗口。

14:37:07 的最新运行是公司网页调研，不是 Multica 请求。其上下文显示 AX/录屏权限为 true、允许应用列表为空；它不能用于证明两次历史误路由是应用策略拒绝导致的。应按同一 run 的问题、能力、工具调用和结果归因，不能用最新文件替代目标事件。

## 尚待完成的验收

1. 在明确允许的应用策略下，用真实 DeepSeek 重跑本机 Multica 请求，验证选择 getApp，且不创建替代网站。
2. 验证 getApp 实际取得正确应用的初始观察，后续读取 issue 有应用状态证据；发现进程不等于 UI 成功。
3. 保留 browser-only 场景：应用请求应说明能力不足，而不是报告网站任务完成。
4. 覆盖歧义名称、应用不存在、权限拒绝等分支，分别如实反馈；不增加产品名硬编码，也不绕过策略。

当前修正包含部署默认值和模型提示约束，但提示约束不能保证所有模型决策正确。尚无证据可以宣称本机 Multica 端到端已通过。
