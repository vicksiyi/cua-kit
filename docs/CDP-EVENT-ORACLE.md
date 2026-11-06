# 当前构建的 CDP 事件 / screencast 对照

`reconstruction/browser-service-cdp-events.test.ts` 已改为直接导入还原 TS，并以完整方法集合定位当前构建的 CDP 类；不再使用过时的 qh 类别名。辅助函数绑定受到 browser-service SHA-256 固定检查约束。

五项测试通过，覆盖事件等待的过滤、取消、超时、失败清理；每 tab 的 screencast 串行化与跨 tab 并发；会话退役、10 秒过期和条目上限；截图算法与真实还原 event wait / ownership 方法组合。原构建代码只提取选定函数执行，不运行整个服务启动。

截图集成中的当前原构建函数 Wi 是 capture 算法，本测试 fixture 没有配置 credential observation gate。因此通过不能证明授权或 credential gate 的一致性，这仍需独立核对。不能使用原旧 Ui 名字继续作为 oracle；当前构建中 Ui 已是无关字符分类函数。

另一次真实 DeepSeek 受控页任务完成表单提交、结果读取和截图，3 次模型决策内结束；但最终回答额外声称没有提供 fixtureTab，这与宿主实际提供的引用矛盾。此次证据只支持实际页面动作成功，不支持最终自然语言说明全部准确。该回答一致性问题仍需处理，未计为完整用户体验验收。

## 截图命令与当前构建的完整分支对照

`reconstruction/browser-service-screenshot.test.ts` 也已迁移到当前安装包的绑定与直接 TS 导入。四项测试通过，其中前三项对照当前构建，最后一项单独保护旧版遗留的本地 credential observation guard：

- 普通视口 / device 模式、整页与裁剪；DPR 异常回退、非法 tab id、无效页面尺寸和空截图。
- screencast 帧过期确认、事件过滤、start/stop/ack 失败清理与 captureScreenshot 回退。
- 公开 tab_screenshot 命令的 authority → 当前 URL → observeContent.assert 顺序；拒绝时不进入截图。
- 当前构建的 Wi 已直接执行 capture 算法；原旧 Ui 已是无关函数。当前文件中没有 credentialObservationGate 字段，而本地旧版 wrapper 仍存在。这是明确未完成的版本迁移差异，不能把新增测试通过当作整个授权系统已对齐。

本次未删除本地权限检查。更改 credential gate 需要连同 context、navigation、scheduler 的完整权限生命周期一起审计，不能只为截图差分变绿就移除。测试将核心算法一致性与该额外 guard 分开陈述，避免掩盖差异。
