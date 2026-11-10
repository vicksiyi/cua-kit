import sys, math
from pathlib import Path
sys.path.insert(0,'/tmp/botmux-diagram-py')
from PIL import Image,ImageDraw,ImageFont
OUT=Path(__file__).parent
FONT='/Users/icezero/Library/Application Support/com.electron.lark.font_workaround/PingFang.ttc'
W=1800
ink='#152A43'; muted='#54657B'; blue='#215ECB'; green='#087F77'; orange='#A75B09'
def f(n):return ImageFont.truetype(FONT,n)
def txt(d,x,y,t,n=25,c=ink):d.multiline_text((x,y),t,font=f(n),fill=c,spacing=10)
def base(title,sub,h):
 im=Image.new('RGB',(W,h),'#F4F7FB');d=ImageDraw.Draw(im);txt(d,55,35,title,43);txt(d,57,100,sub,24,muted);return im,d
def box(d,x,y,w,h,title,body,c=blue):
 d.rounded_rectangle((x,y,x+w,y+h),18,fill='white',outline='#CCD8E7',width=2);d.rectangle((x+1,y+18,x+7,y+h-18),fill=c);txt(d,x+22,y+16,title,28,c);txt(d,x+22,y+65,body,24)
def arr(d,x,y,x2,y2,c=blue):
 d.line((x,y,x2,y2),fill=c,width=3);a=math.atan2(y2-y,x2-x);d.polygon([(x2,y2),(x2-14*math.cos(a-.45),y2-14*math.sin(a-.45)),(x2-14*math.cos(a+.45),y2-14*math.sin(a+.45))],fill=c)
im,d=base('01  当前 cua-kit 系统架构','当前仓库实现 · 默认独立 Rust 运行时 · 还原的 TS + 重建的 Rust / Swift，不代表完整官方源码',1880)
box(d,55,165,815,175,'调用侧｜可替换的 Agent','用户 prompt → AgentLoop → ModelAdapter → DeepSeek\nMcpToolClient + NodeReplTurnClient；终端 tool 日志\n本地 .env / artifacts/debug；凭据不传给 MCP')
box(d,920,165,825,175,'部署侧｜选择能力与后端','prepareRestoredRuntime → stage @core/* 包\n配置 browser / computer；默认 Rust，桌面默认 Swift\ninstalled 仅显式对照；CDP 是部署选项，不是自动降级')
arr(d,455,340,455,405);arr(d,1320,340,1320,405)
box(d,55,405,1690,185,'Rust MCP / Supervisor｜native/runtime-supervisor','MCP stdio：initialize / tools/list / tools/call / turn_ended；首次 js 惰性启动 workers\n进程管理、执行超时与取消、host callbacks、可信服务转发、原生管道；macOS sandbox 边界\n模型只提交 JS 工具参数；Rust 不承担模型规划或网页业务逻辑')
arr(d,455,570,455,635);arr(d,1320,570,1320,635)
box(d,55,635,815,210,'Node Kernel｜@core/node-repl + @core/cua','持久化 JS 会话；banner 初始化 cua\ncreate_browser_api / bind_tab / 应用绑定\ngetTab / getApp / getState / screenshot / actions\n文本、图片、错误 → MCP content')
box(d,920,635,825,210,'Trusted Worker｜@core/node-repl','trusted_service_request 经 Supervisor 转发\n加载 browser 服务 / @core/sky/service\n受控 host callbacks：native_pipe_request 等\n原生连接由宿主提供；不把所有权限交给 cell')
arr(d,870,745,920,745)
arr(d,1320,845,1320,900);arr(d,1320,900,340,900);arr(d,340,900,340,950);arr(d,1320,900,1460,900);arr(d,1460,900,1460,950);arr(d,900,900,900,950)
box(d,55,950,530,245,'A  日常 Chrome｜扩展链路','browser service / BrowserAPI RPC\n认证 Unix socket → Rust native host\nChrome Native Messaging\n扩展 BrowserSession：tab / origin / lease\nchrome.debugger → CDP → 页面',green)
box(d,635,950,530,245,'B  显式 CDP｜另一部署后端','@core/cdp-host + Playwright / CDP\n受管 Chromium：独立 profile\n或显式连接已有 CDP endpoint\n不等于复用日常 Chrome 登录态\n不因扩展缺失而静默切换',blue)
box(d,1215,950,530,245,'C  macOS｜桌面链路','@core/sky/service → Mac IPC\nRust 原生管道 → Swift helper\nGetSkyshot / PerformAction\n应用启动、AX 状态、截图、输入\n系统权限与应用策略独立检查',orange)
box(d,55,1260,815,225,'浏览器内部｜状态与动作分工','getAXState：后端支持 AX 则取 AX，否则 DOM snapshot\nDOM-only 页面没有可供原生点击使用的 AX 数字索引\ntab.playwright locator → 元素解析 / frame / CDP\ngetScreenshot → 截图后端；动作后重新观察验证',green)
box(d,920,1260,825,225,'为什么代码多｜跨进程与状态管理','模型协议 → MCP → kernel → trusted RPC → OS / Chrome\n授权、断连、超时、frame、tab 所有权、取消与清理\nDOM / AX / 像素是三种观察；并非同一套操作语义\n这些层支撑可靠性，不只是 screenshot / click 的包装')
box(d,55,1545,1690,235,'验收边界｜已通过局部真实链路，仍未达到完整功能对齐','已验证：日常 Chrome 受控表单、截图、跨源 iframe、同 tab 错误恢复；一次 DeepSeek 受控任务闭环\n已验证：Swift 受控应用启动 / 复用；尚未验收：真实桌面截图与输入（最近权限检查为 false）\n待解决：间歇 debugger detach、公开网页任务稳定性、剩余原生协议与源码一致性审计\n图中箭头表示已存在的实现路径；不表示每个路径或所有异常场景均通过端到端验收',orange)
im.save(OUT/'01-system.png')

def seq(title,sub,names,events,notes,out):
 h=310+len(events)*100+len(notes)*48+90
 im,d=base(title,sub,h);xs=[110+i*(1580/(len(names)-1)) for i in range(len(names))]
 for x,name in zip(xs,names):
  d.rounded_rectangle((x-100,160,x+100,250),12,fill='white',outline='#CCD8E7',width=2);txt(d,x-85,178,name,24,blue)
  for y in range(258,280+len(events)*100,18):d.line((x,y,x,y+9),fill='#BCCBDE',width=2)
 for i,(a,b,label) in enumerate(events):
  y=305+i*100
  if a==b:
   d.line((xs[a],y,xs[a]+45,y,xs[a]+45,y+27,xs[a],y+27),fill=blue,width=3);arr(d,xs[a]+25,y+27,xs[a],y+27)
   txt(d,xs[a]+12,y-36,label,23)
  else:
   arr(d,xs[a],y,xs[b],y,green if b<a else blue)
   tw=d.textbbox((0,0),label,font=f(23))[2];tx=max(50,min((xs[a]+xs[b]-tw)/2,W-tw-50));d.rectangle((tx-7,y-37,tx+tw+7,y-4),fill='#F4F7FB');txt(d,tx,y-37,label,23)
 y=320+len(events)*100
 for note in notes:txt(d,55,y,note,24,orange);y+=48
 im.save(OUT/out)
 lines=['sequenceDiagram']
 for i,name in enumerate(names): lines.append(f'    participant P{i} as '+name.replace('\n',' '))
 for a,b,label in events: lines.append(f'    P{a}->>P{b}: '+label)
 (OUT/Path(out).with_suffix('.mmd')).write_text('\n'.join(lines)+'\n')
seq('02  启动与 AgentLoop 时序','部署与预检发生在模型决策前；截图、状态与错误作为工具结果进入后续决策',
['用户 / Demo','AgentLoop\n+ DeepSeek','MCP / Rust','Kernel\nCUA API','Trusted /\n执行后端'],[
(0,2,'1  加载本地配置、选择后端、stage 包、连接 MCP'),
(2,0,'2  initialize → instructions / 工具能力'),
(0,2,'3  browser / computer 预检：js 读取 inventory'),
(2,3,'4  首次代码调用：启动 worker，banner 初始化 cua'),
(3,4,'5  查询可用浏览器 / 应用；返回初始状态'),
(4,0,'6  工具结果；初始观察加入 initialMessages'),
(0,1,'7  run(prompt, initialMessages)，读取 tools + instructions'),
(1,2,'8  模型给出 js 工具调用；同批工具顺序执行'),
(2,3,'9  执行持久化 cell：选 tab / app，读取状态或操作'),
(3,4,'10  trusted service RPC → 所选后端'),
(4,0,'11  如需授权：MCP elicitation → 宿主策略 / 终端确认'),
(0,4,'12  授权结果；拒绝 / 无能力时返回错误，不绕过'),
(4,1,'13  文本 / 图片 / 动作结果 / 错误，沿原链返回模型'),
(1,2,'14  未完成：继续工具调用；观察后验证目标'),
(1,2,'15  摘要分支可调用 js(completion_summary)，不执行代码'),
(1,2,'16  run 返回前：endTurn → turn_ended；成功 / 失败均清理'),
(1,0,'17  返回最终回答或错误；Demo finally 关闭连接与部署资源')],
['循环默认 12 轮；预算耗尽可生成进展摘要，但仍以失败结束。',
 'completion_summary 与 code 互斥；模型摘要与宿主生命周期 turn_ended 是两个机制。',
 '日志保留在被忽略的本地目录；凭据脱敏。预检通过不等于页面操作已成功。'],'02-agent-sequence.png')
seq('03  浏览器操作与桌面操作时序','展开执行后端；上半为日常 Chrome 扩展，下半为 Swift 桌面。两者不是隐式 fallback',
['Kernel\nCUA API','Trusted\nservice','Rust host /\n原生管道','Chrome 扩展\n或 Swift','页面 /\nmacOS'],[
(0,1,'1  cua.getTab / createBrowserTab → 浏览器服务选择与绑定'),
(1,2,'2  endpoint 发现 + 认证 socket；BrowserAPI RPC'),
(2,3,'3  Chrome Native Messaging → BrowserSession'),
(3,4,'4  tab / origin / debugger 状态检查；CDP 获取页面状态'),
(4,0,'5  AX 或 DOM snapshot → 初始状态 + 按需文档'),
(0,1,'6  tab.playwright.getByRole / getByLabel → fill / click'),
(1,3,'7  locator / frame 解析 → 经原管道发送 CDP 命令'),
(3,4,'8  chrome.debugger.sendCommand → 页面动作'),
(0,4,'9  再经同一链路请求状态 / screenshot，验证结果'),
(4,0,'10  观察 / 图片 / 错误返回；导航后重新取得状态'),
(0,1,'11  桌面分支：cua.getApp → Sky get_app_state'),
(1,2,'12  Mac IPC → native_pipe_request'),
(2,3,'13  Swift helper：GetSkyshot + 应用启动策略'),
(3,4,'14  未运行则按策略后台启动；已运行则复用'),
(4,0,'15  AX / 截图（需权限）；初始状态与文档返回'),
(0,3,'16  click / type 等 → Sky PerformAction，经相同 IPC 链'),
(3,4,'17  AX / 系统输入执行；重新观察验证')],
['连接提示：只有启用启动策略时才主动拉起 Chrome；扩展/host 未连通会阻止该浏览器路径。',
 '超时不是同一种错误：selector deadline 与 CDP command timeout 的清理行为不同。',
 '原生桌面步骤 15–17 是实现路径；当前完整截图 / 输入端到端验收仍未完成。'],'03-backend-sequence.png')
print(OUT)
