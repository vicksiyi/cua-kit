# Source reconstruction / 源码还原

当前目标是读取本机混淆 JavaScript 与声明文件，将原来的代码结构、调用顺序、分支、错误与参数转发还原成可读 TypeScript。原先 `src/` 的独立实现保留作历史参考，不能作为“原代码还原”的交付。

用户指定：TS 源码相对 import 不带 `.js`；保留分包关系，命名空间从 `@oai` 改为 `@core`。原始包名与路径记录在 `source-map.json`。

| 原始包 | 当前 workspace | 当前状态 |
|---|---|---|
| @oai/cua 0.2.6 | @core/cua | 首批 6 个运行模块已还原 |
| @oai/cua-repl 0.1.2 | @core/cua-repl | 包边界已建立，尚未还原实现 |
| @oai/sky 0.7.13 | @core/sky | 包边界已建立，尚未还原实现 |
| @oai/browser-desktop 0.1.1 | @core/browser-desktop | 包边界已建立，尚未还原实现 |
| @oai/browser | @core/browser | 在原声明文件中明确引用，运行代码内嵌；独立 manifest/版本与完整声明尚未定位 |

本轮还原：`create_browser_api`、`bind_tab`、`tab_reference`、`duration_seconds`、`get_browser_tabs`、`core/display`。原始对外 exports 已归档；未完成的 package entrypoint 不提前声明为可运行，当前并非完整可安装替代品。

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
2. browser-client 内部 AX tree、element ID、frame、hit test、输入、截图的逐模块还原；保持原后端调用契约。
3. cua-repl 与 sky 的执行、传输和原生宿主边界；无法从 JS 获得的二进制实现明确列出。
4. 在还原后的原协议上接入 MCP client + AgentLoop demo，调用侧仍作为独立应用，不侵入核心包。

不会为了通过测试把未读到的原逻辑替换为自写后端。若需宿主替代实现，另行标识为替代实现，不能称为原代码还原。
