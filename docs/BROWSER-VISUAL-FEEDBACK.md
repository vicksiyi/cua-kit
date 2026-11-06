# 标签组与 Agent 光标：当前实现和修复

## 光标缺失的两个实现缺口

1. 原扩展后台启动函数 `dR` 在 heartbeat 前执行 `await hi.initialize()`。`hi` 是 ObservedTabs 实例，不是 telemetry。独立 native 启动漏了该调用；full startup 的抽象误命名为 initializeTelemetry，实际绑定也只初始化 telemetry。结果 observedTabs 集合为空，overlay 把所有标签判为不可见，moveMouse 不发布可见光标。
2. native 扩展 bundle 没有复制 `images/cursor-chat.png`，manifest 也没有声明它为页面可访问资源。即使 cursor state 正确，也无法加载该图像。

修复：两个启动路径初始化 ObservedTabs，full startup 将原厂调用明确命名为 initializeObservedTabs；独立部署的 telemetry 仍在部署入口初始化。native 打包从本机安装包复制所需图片，并只声明该资源。图片只存在本地忽略的生成目录，不提交原厂图片到仓库。

光标是页面 overlay 中的 Agent 指针，不是 macOS 系统鼠标。当前可见标签由 ObservedTabs 定义为各窗口 active 标签，不要求窗口一定处于系统前台。

## 标签组语义

原源码 BrowserSession.createTab 会调用 ensureAgentTabGroup；claimChildTab 同样尝试加入受管组。claimUserTab 仅接管与追踪已有页面，不调用分组。因此“操作已有标签但没有新增组”本身符合原实现。turnEnded 之后会根据 tab 的来源与 mark 做保留、交接、关闭或释放，不能以会话结束后的外观判断运行中是否分组。

本次没有为所有已有用户标签强制分组，也没有在 CDP 独立浏览器后端模拟扩展标签组。

## 验收

真实打包扩展测试 `reconstruction/extension-native-controller.test.ts` 新增：
- 接管已有测试页后 groupId 保持不变。
- 将测试页置于 active，调用实际 RPC moveMouse；在扩展 isolated world 读取真实 cursor state，并通过 Chrome 的 closed-shadow-root 访问检查图片已加载、naturalWidth > 0 且具有渲染尺寸。
- 新建 Agent 标签后，通过 chrome.tabs / chrome.tabGroups 验证真实组标题。
- 随后继续原 MCP 真实页面操作验收与清理。

native 打包端到端测试通过（约 9.3 秒）；扩展 TypeScript 检查通过；startup/assembly 两项测试通过。full 打包端到端测试也通过（约 17.4 秒），包含同样的真实光标与标签组断言。

## 生效

本地 native 扩展生成目录已更新。正在运行的日常 Chrome 不会自动替换已加载的 service worker，需要在 chrome://extensions 对 Core CUA 点击“重新加载”。然后新开一轮任务；旧页面上残留的 content script 可通过刷新页面更新。
