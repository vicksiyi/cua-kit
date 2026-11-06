# 浏览器 DOM / AX 观察与当前部署

`cua` 的 `getAXState()` 是兼容入口：当底层 tab.ax 不可用时，调用 playwright.domSnapshot；tab.ax 可用时，调用 AX/WASM 捕获。不能仅从方法名或一次通用 MCP 绿测判断用了哪一条链路。

当前原构建的 API manifest 默认不公开 Tab.ax。handshake 按后端、显式 BROWSER_USE_TINYSKY_ENABLED、部署环境和 feature gate 生成 apiSupportOverrides；provider 明确关闭 Tab.ax 时不会被开关覆盖。显式开启 AX 后原逻辑还会隐藏 Tab.cua/Tab.dom_cua。这里保留这些规则，不默认启用 AX。

## Demo 配置位置

现有 demo 从 CUA_MCP_ENV 读取 MCP 配置。若已有该 JSON，在其中添加 `"BROWSER_USE_TINYSKY_ENABLED":"1"`，保留其他字段。仅在 shell 顶层设置同名变量不会自动透传。

对于没有自定义 MCP 配置的浏览器 demo，可将下列配置写入项目本地、被 git 忽略的 .env（模型凭据仍放原有模型字段）：

```dotenv
CUA_MCP_ENV={"NODE_REPL_DISABLE_ANALYTICS":"1","CUA_REPL_ENABLED_SURFACES":"browser","CUA_REPL_BROWSER_ENV":"codex-app","BROWSER_USE_AVAILABLE_BACKENDS":"chrome","BROWSER_USE_TINYSKY_ENABLED":"1"}
```

之后仍使用原 `npm run demo:deepseek -- "你的浏览器操作任务"`。这个设置改变页面观察/操作 API，不替代浏览器扩展连接，不自动批准操作，也不保证特定网站或模型任务成功。设置为 `"0"` 显式关闭；删除字段回到默认 feature/backend 策略。

## 已验证的范围

- 真实 Chromium + AX WASM：主页面/iframe 捕获、快照身份更替与过期引用拒绝。
- 显式 AX 模式的 MCP → Rust supervisor → trusted service → native extension：观察得到按钮编号后执行 liveTab.click(index)，页面动作成功；随后 locator 点击、截图和光标验证通过。
- 开关仅传入 trusted browser worker，未加入 kernel/untrusted 环境；模型凭据不会被传入。
- WASI 初始化需要 /dev/null；独立 Rust 部署仅给该 literal 设备权限，沙箱仍拒绝外部文件、子进程和网络。

重复受控端到端验证（需要本机已构建对应产物）：

```sh
CUA_TEST_AX=1 CUA_RUNTIME_SUPERVISOR=rust CUA_TEST_MACOS_SANDBOX=1 CUA_TEST_RUST_RUNTIME=1 \
node --import tsx --test --test-name-pattern='packaged native extension' reconstruction/extension-native-controller.test.ts
```

此命令使用临时浏览器 profile 和自有测试页，不读取日常 Chrome 登录态。当前证据不等于任意公开网站、DeepSeek 推理策略或 macOS 原生应用 AX 全部验收。
