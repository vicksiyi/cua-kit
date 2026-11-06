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

## 后续生命周期验收

最新 native（约 9.8 秒）与 full（约 15.8 秒）真实测试均通过，并增加以下断言：
- 图片有尺寸之外，祖先节点的 display / visibility / opacity 也必须证明它实际可见。
- 切到其它标签后光标状态与实际 opacity 均隐藏；切回原标签恢复。
- turnEnded 后重新激活原页，光标仍隐藏且 sessionId 清空。
- deliverable 标签保留但退出受管组；未标记的 Agent 标签关闭；用户原标签及原分组保持。

此处直接调用 moveMouse RPC 验证扩展生命周期，不证明所有模型生成的动作路径都会触发光标。

## 公共 locator 点击链路验收

进一步通过真实 MCP 执行 `liveTab.playwright.getByRole("button", {name:"Run action"}).click()`，随后在该动作所属会话尚未结束时检查扩展 overlay。该断言不调用 moveMouse，也不注入 cursor state：
- 页面 HTTP 服务实际收到按钮动作的随机标记。
- overlay sessionId 属于本次 MCP 会话，而非前面直接 RPC 测试会话。
- 光标坐标位于实际被点击按钮的 bounding rect 内。
- 活动标签中图片已加载，祖先 opacity / visibility / display 表明其可见。

native（约 10.2 秒）与 full（约 16.6 秒）两项真实测试通过。已将证明范围从“直接 moveMouse 可用”扩展至“公共 locator click 经 MCP 能驱动可见光标”；仍不等于所有输入类型、所有模型任务都完成验收。测试会主动激活受控目标标签以检查呈现，不修改产品的自动聚焦策略。

当前原构建 CDP input 类的 clickPoint 方法也先等待 ui.moveMouse，再发 CDP mouse move / down / up，与还原实现的调用顺序一致。

## 2026-11-07：后台建页与显式选中边界

再次核对安装包：`create_browser_api.js` 的 `createBrowserTab` 调用 `tabs.new()` 和导航，并未调用 `focusTab`；扩展 `za` 创建标签使用 `active: false`，`Ad` 创建窗口使用 `focused: false`。单独的 `focusTab` 才执行标签激活和窗口聚焦。`visible` 能力不能直接解释为 Chrome 标签激活。

因此保留原默认后台建页行为。后台未选中标签不会呈现可见光标；读取正文和截图也不等于执行指针移动。最近搜索任务的调用记录只有建页、截图和正文读取，无 click/hover/moveMouse，不能用该任务证明点击光标失效。

真实打包扩展验收增加独立断言：Agent 标签创建及分组后仍为 inactive；显式 `focusTab` 后变为 active。测试使用隔离 Chromium、项目 Rust supervisor 和本地受控页面，不执行原厂 native supervisor，不修改日常 Chrome 的标签。此前已有的公共 MCP locator 点击验收仍检查图片加载、祖先可见性及坐标落在按钮内。它证明受控页面中的扩展链路，不代表用户当前浏览器已重新加载最新扩展，也不代表模型必然产生指针动作。
