# 浏览器状态与动作：当前实现及验证边界

## 观察与旧引用

AX 读取之前，为每个可访问 frame 创建 CDP isolated world，安装 MutationObserver 并记录状态。读取结束和截图结束后重新比对；中途变化会拒绝结果，最多重试三次。记录包含 DOM 修订、输入框/textarea/select 的属性值、视口和滚动位置；开放 Shadow DOM 单独遍历和观察。追踪对象处于隔离世界，页面脚本不能直接覆盖它。元素操作也在相同隔离世界解析 backendNodeId。

`ElementRef` 绑定 targetId、snapshotId、elementId；动作前验证全部 frame 状态，失效返回 STALE_OBSERVATION。单纯数字 ID 是当前快照的快捷方式。记录中的表单属性仅用于内部一致性比对，不作为新日志字段导出。

这并非浏览器事务：读取后仍可能有竞态。闭合 Shadow DOM、CSSOM 动画、canvas/video 更新及所有可访问性语义变化并不能仅靠 DOM 修订完整覆盖。严格检查也可能让持续变化的页面反复要求观察，当前无“保证最新”的承诺。

## 坐标与 frame

坐标输入需要先获取截图。点击之前比对 frame 状态，并重新截图进行 PNG 字节比对；画面变化则拒绝旧坐标。该保守策略也会拒绝动画页面，后续需要可配置区域/稳定性契约，而不是忽略差异。

元素点击先滚动定位、计算局部点并检查元素命中；随后经 `DOM.getFrameOwner` 逐层取得父 iframe，转换边框、缩放与偏移，检查每层父页面的遮挡，最终通过主页面 CDP 发出输入。跨源不依赖 `window.parent.document` 访问。旋转/反射的 frame 显式报不支持，不能将简单缩放的测试推及任意变换。

## 取消与不确定动作

长按点击在 mouse-down 后收到取消，会立即进入 mouse-up 清理并抛 ACTION_OUTCOME_UNKNOWN。释放本身可能触发 click，因此取消不能解释为“没有操作”。调用方应重新观察，不自动再点一次。

当前未把这一取消契约推广到所有导航、拖拽或原生动作。CDP 断开时也无法保证清理事件送达。完整 ActionResult、追踪和所有动作的取消验收仍未完成。

## 自动化证据

`tests/staleness.test.ts` 由本地页面接收测试命令，覆盖 DOM 修改、input 属性修改、开放 shadow input 属性修改、canvas 像素变化及长按后取消。测试要求旧动作被拒绝，且取消后 mouse-up 的 click 副作用可在新观察中看到。

`tests/frames.test.ts` 使用 127.0.0.1 → localhost 的跨站 iframe，再嵌套子 frame；覆盖偏移、边框、1.2 倍缩放的实际点击以及父页面 overlay 拒绝。结合 `tests/browser.test.ts` 的普通 frame 测试，仅证明这些明确场景，不是任意 iframe 兼容性证明。

当前完整测试结果：7 passed、1 skipped（原生 AX 操作 fixture 尚无权限）。

## 高级输入增量

新增 `selectText(element,text,{prefix?,suffix?})`：在 input/textarea 的 value 或 DOM 文本内匹配精确子串；重名必须用前后文消歧，不擅自选择第一个。普通文本通过 Range，表单通过 setSelectionRange；选择后需重新观察或用 null 表示当前焦点输入。尚未实现 selectionType 扩展或闭合 Shadow DOM 文本跨节点选择。

`click` 支持 key 修饰键组合（Alt/Control/Meta/Shift，super 映射本机平台）；`pressKey` 支持 durationMs 和组合键，释放路径尝试清理全部按键。`drag(from,to,{steps?,durationMs?})` 基于新截图坐标，发出 mouse-down、插值 mouse-move、mouse-up。默认 20 步/300ms；取消后释放鼠标，结果不确定。这里只验证 pointer 拖动场景，HTML5 DataTransfer 的拖放协议尚未验收。

`tests/input.test.ts` 在真实 Chromium 验证重复文本消歧与替换、Shift 点击事件、按键保持和加号键、实际 pointer 拖动以及无截图时拒绝拖动。当前全套为 8 passed、1 native fixture skipped。粘贴仍未实现；insertText 不等价于剪贴板 paste，不能靠方法改名满足兼容要求。
