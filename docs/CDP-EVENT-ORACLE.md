# 当前构建的 CDP 事件 / screencast 对照

`reconstruction/browser-service-cdp-events.test.ts` 已改为直接导入还原 TS，并以完整方法集合定位当前构建的 CDP 类；不再使用过时的 qh 类别名。辅助函数绑定受到 browser-service SHA-256 固定检查约束。

五项测试通过，覆盖事件等待的过滤、取消、超时、失败清理；每 tab 的 screencast 串行化与跨 tab 并发；会话退役、10 秒过期和条目上限；截图算法与真实还原 event wait / ownership 方法组合。原构建代码只提取选定函数执行，不运行整个服务启动。

截图集成中的当前原构建函数 Wi 是 capture 算法，本测试 fixture 没有配置 credential observation gate。因此通过不能证明授权或 credential gate 的一致性，这仍需独立核对。不能使用原旧 Ui 名字继续作为 oracle；当前构建中 Ui 已是无关字符分类函数。

另一次真实 DeepSeek 受控页任务完成表单提交、结果读取和截图，3 次模型决策内结束；但最终回答额外声称没有提供 fixtureTab，这与宿主实际提供的引用矛盾。此次证据只支持实际页面动作成功，不支持最终自然语言说明全部准确。该回答一致性问题仍需处理，未计为完整用户体验验收。
