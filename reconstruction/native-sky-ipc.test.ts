import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync,spawnSync} from 'node:child_process';
import {connect, type Socket} from 'node:net';
import {once} from 'node:events';
import {mkdtemp,realpath,access,rm,chmod,mkdir,writeFile,readdir,copyFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MacComputerUseClient} from '../packages/sky/src/targets/mac/client';
import {encodeMessageFrame,decodeMessageFrames} from '../packages/sky/src/targets/mac/native-pipe';
const helper=resolve('native/macos/.build/debug/cua-helper');
async function fixture(t:any, policy:Record<string,unknown> = {}, extraEnvironment:NodeJS.ProcessEnv = {}) {
 const root=await realpath(await mkdtemp('/tmp/core-sky-ipc-'));await chmod(root,0o700);
 const path=join(root,'ipc.sock');
 const child=spawn(helper,['--sky-socket',path],{env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',CORE_CUA_APP_POLICY:JSON.stringify(policy),...extraEnvironment},stdio:['ignore','ignore','pipe']});
 let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 const exited=once(child,'exit');
 const sockets:Socket[]=[];
 t.after(async()=>{for(const socket of sockets)socket.destroy();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;await rm(root,{recursive:true,force:true});});
 for(let n=0;;n++) {try{await access(path);break;}catch{assert.ok(n<100&&child.exitCode===null,stderr);await new Promise(r=>setTimeout(r,10));}}
 const open=async()=>{const socket=connect(path);sockets.push(socket);await once(socket,'connect');return socket;};
 return {root,path,child,exited,open};
}
async function appFixture(root:string, identifier:string) {
 const path=join(root,identifier+'.app');await mkdir(join(path,'Contents'),{recursive:true});
 await writeFile(join(path,'Contents','Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleName</key><string>Policy Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
 return path;
}
const policyRules={
 'com.core.fixture.allowed':{decision:'allowed',risk:'low',allowPersistentApproval:true},
 'com.core.fixture.forbidden':{decision:'forbidden',risk:'high',allowPersistentApproval:false,warningSubtitle:'Fixture rule'},
};
test('standalone wildcard policy is a fallback and exact denied or forbidden rules win', {skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:10000}, async t=>{
 const f=await fixture(t,{
  '*':{decision:'allowed',risk:'high',allowPersistentApproval:false},
  'com.core.fixture.denied':{decision:'denied',risk:'low',allowPersistentApproval:false},
  'com.core.fixture.forbidden':{decision:'forbidden',risk:'high',allowPersistentApproval:false},
  'com.core.fixture.exact':{decision:'allowed',risk:'low',allowPersistentApproval:true},
 });
 const before=(globalThis as any).nodeRepl;
 (globalThis as any).nodeRepl={env:{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:f.path},nativePipe:{createConnection:f.open}};
 try{
  const client=new MacComputerUseClient();
  for(const [id,decision,risk,persistent] of [
   ['com.core.fixture.unlisted','allowed','high',false],
   ['com.openai.codex','allowed','high',false],
   ['com.core.fixture.denied','denied','low',false],
   ['com.core.fixture.forbidden','forbidden','high',false],
   ['com.core.fixture.exact','allowed','low',true],
  ] as const){
   const path=await appFixture(f.root,id);
   const policy=await client.getAppPolicy(path);
   assert.equal(policy.decision,decision);
   assert.equal(policy.target.risk,risk);
   assert.equal(policy.allowPersistentApproval,persistent);
  }
 }finally{(globalThis as any).nodeRepl=before;}
});
for(const source of ['restored','installed'] as const) test(`Swift IPC accepts ${source} Sky client handshake and app inventory`,{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:10000},async t=>{
 const f=await fixture(t,policyRules);
 const before=(globalThis as any).nodeRepl;
 (globalThis as any).nodeRepl={env:{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:f.path},nativePipe:{createConnection:f.open},requestMeta:{'x-codex-turn-metadata':{session_id:'fixture',turn_id:'one'}}};
 try{
  const Client=source==='restored'?MacComputerUseClient:(await import(pathToFileURL('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/targets/mac/client.js').href)).MacComputerUseClient;
  const client=new Client();
  // Invalid requests exercise audio routing without starting system capture.
  await assert.rejects(client.stopAudioRecording(),(error:any)=>error.code===-32602);
  for(const duration of [0,99,300001,100.5,true,'100']) {
   await assert.rejects(client.startAudioRecording({maxDurationMilliseconds:duration}),(error:any)=>error.code===-32602);
  }
  assert.equal((await readdir(f.root)).some(name=>name.startsWith('audio-')),false);
  const apps=await client.listApps();
  assert.ok(Array.isArray(apps));for(const app of apps){assert.equal(typeof app.isRunning,'boolean');assert.ok(app.displayName===undefined||typeof app.displayName==='string');}
  for(const [identifier,decision] of [['com.core.fixture.allowed','allowed'],['com.core.fixture.forbidden','forbidden'],['com.core.fixture.unconfigured','denied']]) {
   const path=await appFixture(f.root,identifier);const policy=await client.getAppPolicy(path);
   assert.equal(policy.decision,decision);assert.equal(policy.target.bundleIdentifier,identifier);
   assert.equal(await realpath(policy.target.appPath),await realpath(path));
   assert.equal(policy.allowPersistentApproval,decision==='allowed');
   assert.equal(policy.target.risk,decision==='allowed'?'low':'high');
   if(decision==='forbidden')assert.equal(policy.target.warningSubtitle,'Fixture rule');
  }
  await assert.rejects(client.getAppPolicy('/nonexistent/core-policy.app'),(error:any)=>error.code===-10010&&error.message==='/nonexistent/core-policy.app');
  for(const [method,args] of [
   ['setValue',{value:'hello'}],['selectText',{text:'hello',selection:'cursor_after'}],['performSecondaryAction',{action:'focus'}],['typeText',{text:'hi 🌍'}],['pressKey',{key:'Super+a',duration:0.125}],['click',{mouseButton:'middle',clickCount:2,duration:0.125}],['scroll',{direction:' R ',pages:0.5}],['drag',{fromX:1.5,fromY:2,toX:30,toY:40.5}],['paste',{text:'hello 🌍',format:'text'}],['paste',{text:'**hello**',format:'md'}],['paste',{text:'<b>hello</b>',format:'html'}],
  ] as const){
   await assert.rejects(client[method]({app:join(f.root,'com.core.fixture.allowed.app'),elementIndex:1,...args}),(error:any)=>error.code===-10011&&error.message===join(f.root,'com.core.fixture.allowed.app'));
   await assert.rejects(client[method]({app:join(f.root,'com.core.fixture.forbidden.app'),elementIndex:1,...args}),(error:any)=>error.code===-10006&&error.message==='com.core.fixture.forbidden');
  }
  await assert.rejects(client.paste({app:join(f.root,'com.core.fixture.allowed.app'),text:'x',format:'rtf'}),(error:any)=>error.code===-32602);
  await assert.rejects(client.scroll({app:join(f.root,'com.core.fixture.allowed.app'),x:12.5,y:24,direction:'down',pages:1}),(error:any)=>error.code===-10011);
  await assert.rejects(client.click({app:join(f.root,'com.core.fixture.allowed.app'),x:12.5,y:24,mouseButton:'right'}),(error:any)=>error.code===-10011);
  await assert.rejects(client.click({app:join(f.root,'com.core.fixture.allowed.app'),x:12.5,y:24,clickCount:1.5}),(error:any)=>error.code===-32602);
  await assert.rejects(client.pressKey({app:join(f.root,'com.core.fixture.allowed.app'),key:'a',duration:-1}),(error:any)=>error.code===-32602);
  await assert.rejects(client.selectText({app:join(f.root,'com.core.fixture.allowed.app'),elementIndex:1,text:'hello',selection:'invalid'}),(error:any)=>error.code===-32602);
  await assert.rejects(client.startApp('/nonexistent/core-start.app'),(error:any)=>error.code===-10010&&error.message==='/nonexistent/core-start.app');
  await assert.rejects(client.startApp(join(f.root,'com.core.fixture.forbidden.app')),(error:any)=>error.code===-10006&&error.message==='com.core.fixture.forbidden');
  await assert.rejects(client.getAppState('com.example.not-running'),(error:any)=>error.code===-10010&&error.message==='com.example.not-running');
  // Resolvable bundle without an executable now reaches the native launch failure.
  await assert.rejects(client.getAppState(join(f.root,'com.core.fixture.allowed.app')),(error:any)=>error.code===-10005);
  await assert.rejects(client.getAppState(join(f.root,'com.core.fixture.forbidden.app')),(error:any)=>error.code===-10006&&error.message==='com.core.fixture.forbidden');
 }finally{(globalThis as any).nodeRepl=before;}
});
test('Swift IPC enforces negotiation, deadlines, frame limits and unknown-operation errors',{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:10000},async t=>{
 const f=await fixture(t);const socket=await f.open();let buffer=Buffer.alloc(0);
 const pending:Array<(value:any)=>void>=[];
 socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);const decoded=decodeMessageFrames(buffer);buffer=decoded.remainingData;for(const body of decoded.messages)pending.shift()!(JSON.parse(body));});
 const send=async(value:any)=>{const response=new Promise<any>(r=>pending.push(r));const frame=encodeMessageFrame(JSON.stringify(value));socket.write(frame.subarray(0,2));socket.write(frame.subarray(2));return response;};
 const request={id:1,jsonrpc:'2.0',method:'request',params:{clientApiVersion:'CodexComputerUseIPC-5',deadlineUnixMilliseconds:Date.now()+5000,requestType:'ComputerUseIPCListAppsRequest',request:{}}};
 assert.equal((await send(request)).error.code,-32600);
 assert.equal((await send({id:2,jsonrpc:'2.0',method:'ping',params:{clientApiVersion:'wrong'}})).error.code,-10013);
 assert.equal((await send({id:3,jsonrpc:'2.0',method:'ping',params:{clientApiVersion:'CodexComputerUseIPC-5'}})).result.serverApiVersion,'CodexComputerUseIPC-5');
 assert.equal((await send({...request,id:4,params:{...request.params,deadlineUnixMilliseconds:0}})).error.code,-32602);
 assert.ok(Array.isArray((await send({...request,id:5})).result));
 const malformed={...request,id:6,params:{...request.params,requestType:'ComputerUseIPCAppGetSkyshotRequest',request:{app:'fixture',disableDiff:1}}};
 assert.equal((await send(malformed)).error.code,-32602);
 assert.equal((await send({...malformed,id:7,params:{...malformed.params,requestType:'ComputerUseIPCAppStartRequest',request:{app:''}}})).error.code,-32602);
 const scrollApp=await appFixture(f.root,'com.core.fixture.allowed');
 // Default-denied fixture must reject actions even when their target is syntactically valid.
 const scrollRequest={...request,id:8,params:{...request.params,requestType:'ComputerUseIPCAppPerformActionRequest',request:{app:scrollApp,action:{scroll:{at:{elementID:{_0:'1'}},direction:'down',pages:1}}}}};
 assert.equal((await send(scrollRequest)).error.code,-10006);
 const closed=once(socket,'close');const oversized=Buffer.alloc(4);oversized.writeUInt32LE(8388609);socket.write(oversized);await closed;
 const [code]=await f.exited;assert.equal(code,1);
});

test('restored CUA app inventory traverses Rust sandbox and original Sky service into Swift IPC',{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:30000},async t=>{
 const root=await realpath(await mkdtemp('/tmp/core-owned-sky-'));await chmod(root,0o700);
 t.after(()=>rm(root,{recursive:true,force:true}));
 const f={root};
 const {stageRuntimePackages}=await import('../packages/agent-loop/src/runtime-packages');
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
 const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
 const staged=await stageRuntimePackages([resolve('packages/sky'),resolve('packages/cua')]);t.after(()=>staged.dispose());
 const {prepareIndependentRuntime}=await import('../packages/agent-loop/src/independent-runtime');
 const runtime=await prepareIndependentRuntime({CUA_REPL_ENABLED_SURFACES:'computer',CORE_CUA_NATIVE_BACKEND:'swift',CORE_CUA_APP_POLICY:JSON.stringify(policyRules)},staged.root,'sky-ipc','rust');
 t.after(()=>runtime.dispose());
 const runtimeSpec=JSON.parse(await readFile(runtime.args[0],'utf8'));const nativeRoot=runtimeSpec.native_service.directory;
 assert.ok(runtimeSpec.trusted.sandbox.read_directories.includes(nativeRoot),'Only trusted Sky code can read native audio artifacts');
 assert.ok(!runtimeSpec.kernel.sandbox.read_directories.includes(nativeRoot),'Kernel must not receive the native artifact read grant');
 const transport=new StdioClientTransport({command:runtime.command,args:runtime.args,env:runtime.environment,stderr:'pipe'});
 const {ElicitRequestSchema}=await import('@modelcontextprotocol/sdk/types.js');
 const mcp=new Client({name:'native-owner-test',version:'1.0'},{capabilities:{elicitation:{form:{}}}});
 let approvalCount=0;let approvalAction:'accept'|'decline'='decline';
 mcp.setRequestHandler(ElicitRequestSchema,request=>{approvalCount++;assert.match(request.params.message,/Policy Fixture/);assert.equal(request.params._meta?.riskLevel,'low');assert.deepEqual(request.params._meta?.persist,['session','always']);assert.deepEqual(request.params._meta?.tool_params,{app:'com.core.fixture.allowed'});return {action:approvalAction};});
 await mcp.connect(transport);
 const policyApp=await appFixture(root,'com.core.fixture.allowed');
 const children=()=>execFileSync('/bin/ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number)).filter(([,parent])=>parent===transport.pid).map(([pid])=>pid);
 const gone=(pids:number[])=>{for(const pid of pids)assert.throws(()=>process.kill(pid,0),(error:any)=>error.code==='ESRCH');};
 const inventory=async()=>{
  const setup=await mcp.callTool({name:'js',arguments:{code:'await import("@core/cua/tinyskyAlt");'}});assert.equal(setup.isError,false,JSON.stringify(setup));
  const result=await mcp.callTool({name:'js',arguments:{code:'{const state=await cua.getState({emit:false});nodeRepl.write(JSON.stringify({appCount:state.apps.length,browserCount:state.browsers.length}));}'}});assert.equal(result.isError,false,JSON.stringify(result));
  const body=(result.content as any[]).filter(item=>item.type==='text').map(item=>item.text).join('\n');assert.match(body,/"appCount":\d+/);assert.match(body,/"browserCount":0/);
 };
 let active:number[]=[];
 try {
  await inventory();
  const denied=await mcp.callTool({name:'js',arguments:{code:`await cua.getApp(${JSON.stringify(policyApp)});`}});
  assert.equal(denied.isError,true);assert.match(JSON.stringify(denied),/not approved/);assert.equal(approvalCount,1);
  for(const [identifier,reason] of [['com.core.fixture.forbidden','safety reasons'],['com.core.fixture.unconfigured',"organization's policy"]]) {
   const path=await appFixture(root,identifier);
   const blocked=await mcp.callTool({name:'js',arguments:{code:`await cua.getApp(${JSON.stringify(path)});`}});
   assert.equal(blocked.isError,true);assert.ok(JSON.stringify(blocked).includes(reason));assert.equal(approvalCount,1,'Blocked policies must not request approval');
  }
  approvalAction='accept';
  const accepted=await mcp.callTool({name:'js',arguments:{code:`await cua.getApp(${JSON.stringify(policyApp)});`}});
  assert.equal(accepted.isError,true);assert.match(JSON.stringify(accepted),/Native request failed/);assert.equal(approvalCount,2);
  const first=children();assert.equal(first.length,3,'Rust owns kernel, trusted worker and Swift service');
  assert.equal((await readdir(nativeRoot)).filter(name=>name.startsWith('sky-')).length,1);
  const reset=await mcp.callTool({name:'js_reset',arguments:{}});assert.equal(Boolean(reset.isError),false);gone(first);
  assert.equal((await readdir(nativeRoot)).filter(name=>name.startsWith('sky-')).length,0);
  await inventory();active=children();assert.equal(active.length,3);assert.ok(active.every(pid=>!first.includes(pid)));
 } finally {await mcp.close();}
 gone(active);
 assert.equal((await readdir(nativeRoot)).filter(name=>name.startsWith('sky-')).length,0,'Closing MCP removes the owned service socket directory');
});

for(const source of ['restored','installed'] as const) test(`live owned App skyshot through ${source} Sky client`,{skip:process.env.CUA_TEST_NATIVE_SKYSHOT!=='1',timeout:30000},async t=>{
 assert.equal(process.platform,'darwin');
 const checked=spawnSync(helper,['--permissions'],{encoding:'utf8'});
 assert.ifError(checked.error);
 const permissions=JSON.parse(checked.stdout);
 assert.ok(permissions.accessibility&&permissions.screenRecording,'Real skyshot gate requires Accessibility and Screen Recording; no permission dialog or app launch was attempted');
 const identifier='com.core.fixture.skyshot';
 const f=await fixture(t,{[identifier]:{decision:'allowed',risk:'low',allowPersistentApproval:false}});
 const app=await appFixture(f.root,identifier);
 await mkdir(join(app,'Contents','MacOS'));
 const executable=join(app,'Contents','MacOS','CuaFixture');
 await copyFile(resolve('native/macos/.build/debug/CuaFixture'),executable);await chmod(executable,0o700);
 await writeFile(join(app,'Contents','Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleExecutable</key><string>CuaFixture</string><key>CFBundleName</key><string>Skyshot Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
 const child=spawn(executable,['--acceptance'],{stdio:['ignore','pipe','pipe']});child.stderr.resume();
 const exited=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;});
 let output='';child.stdout.on('data',chunk=>output+=chunk);
 for(let attempt=0;!output.includes('READY');attempt++){assert.ok(attempt<200&&child.exitCode===null,'Owned fixture did not become ready');await new Promise(r=>setTimeout(r,25));}
 const before=(globalThis as any).nodeRepl;
 (globalThis as any).nodeRepl={env:{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:f.path},nativePipe:{createConnection:f.open}};
 try {
  const Client=source==='restored'?MacComputerUseClient:(await import(pathToFileURL('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/targets/mac/client.js').href)).MacComputerUseClient;
  const client=new Client();
  for(const disableDiff of [true,false]) {
   const state=await client.getAppState({app,disableDiff});
   assert.equal(state.app.bundleIdentifier,identifier);assert.equal(state.app.pid,child.pid);
   assert.match(state.skyshot.text,/Save fixture/);assert.equal(state.skyshot.screenshot.mimeType,'image/png');
   assert.match(state.skyshot.screenshot.url,/^data:image\/png;base64,/);
   const bytes=Buffer.from(state.skyshot.screenshot.url.split(',')[1],'base64');assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(bytes.length>100);
  }
  const refresh=async()=>await client.getAppState({app,disableDiff:true});
  const field=(state:any)=>{const line=state.skyshot.text.split('\n').find((line:string)=>line.includes('AXTextField')&&line.includes('Fixture name'));assert.ok(line,'Native field missing');return Number(/^\[(\d+)\]/.exec(line)![1]);};
  const initial=await refresh();const elementIndex=field(initial);
  await client.setValue({app,elementIndex,value:'native 🌍 selection'});
  await assert.rejects(client.setValue({app,elementIndex,value:'stale'}),(error:any)=>error.code===-10011);
  const changed=await refresh();assert.match(changed.skyshot.text,/native 🌍 selection/);
  await client.selectText({app,elementIndex:field(changed),text:'🌍',selection:'text'});
  const selected=await refresh();const selectedLine=selected.skyshot.text.split('\n').find((line:string)=>line.includes('AXTextField')&&line.includes('Fixture name'));assert.match(selectedLine,/"selectionLength":2/);
  await client.performSecondaryAction({app,elementIndex:field(selected),action:'focus'});
  const focused=await refresh();const focusedLine=focused.skyshot.text.split('\n').find((line:string)=>line.includes('AXTextField')&&line.includes('Fixture name'));assert.match(focusedLine,/"AXFocused":true/);
  await client.pressKey({app,key:'Super+a',duration:0.01});await refresh();
  await client.typeText({app,text:'keyboard 🌍 result'});
  let typed:any;
  for(let attempt=0;attempt<20;attempt++){typed=await refresh();if(typed.skyshot.text.includes('keyboard 🌍 result'))break;await new Promise(r=>setTimeout(r,25));}
  const typedLine=typed.skyshot.text.split('\n').find((line:string)=>line.includes('AXTextField')&&line.includes('Fixture name'));assert.match(typedLine,/keyboard 🌍 result/);
  const buttonLine=typed.skyshot.text.split('\n').find((line:string)=>line.includes('AXButton')&&line.includes('Save fixture'));assert.ok(buttonLine);
  await client.click({app,elementIndex:Number(/^\[(\d+)\]/.exec(buttonLine)![1])});
  let saved:any;for(let attempt=0;attempt<20;attempt++){saved=await refresh();if(saved.skyshot.text.includes('Saved keyboard 🌍 result'))break;await new Promise(r=>setTimeout(r,25));}
  assert.match(saved.skyshot.text,/Saved keyboard 🌍 result/);
  await client.performSecondaryAction({app,elementIndex:field(saved),action:'focus'});await refresh();
  await client.pressKey({app,key:'Super+a'});await refresh();
  await client.paste({app,text:'pasted 🌍 fixture',format:'text'});
  saved=await refresh();const pastedLine=saved.skyshot.text.split('\n').find((line:string)=>line.includes('AXTextField')&&line.includes('Fixture name'));assert.match(pastedLine,/pasted 🌍 fixture/);
  const scrollLine=saved.skyshot.text.split('\n').find((line:string)=>line.includes('AXScrollArea')&&line.includes('Fixture scroll area'));assert.ok(scrollLine);
  const offsets=()=>output.split('\n').flatMap(line=>{try{const event=JSON.parse(line);return event.event==='scroll'?[event.offsetY]:[];}catch{return [];}});
  const beforeScroll=offsets().at(-1)??0;
  await client.scroll({app,elementIndex:Number(/^\[(\d+)\]/.exec(scrollLine)![1]),direction:'down',pages:0.5});
  for(let attempt=0;!offsets().some(value=>value>beforeScroll);attempt++){assert.ok(attempt<100,'Owned NSScrollView did not scroll');await new Promise(r=>setTimeout(r,25));}
  const dragState=await refresh();
  const png=Buffer.from(dragState.skyshot.screenshot.url.split(',')[1],'base64');
  // CuaFixture acceptance layout: 600-point content width; pad center is 350 points above bottom.
  const scale=png.readUInt32BE(16)/600, padY=png.readUInt32BE(20)-350*scale;
  await client.drag({app,fromX:50*scale,fromY:padY,toX:150*scale,toY:padY});
  const dragFinished=()=>output.split('\n').some(line=>{try{const event=JSON.parse(line);return event.event==='pad-up'&&event.moves>0;}catch{return false;}});
  for(let attempt=0;!dragFinished();attempt++){assert.ok(attempt<100,'Owned gesture pad did not receive drag and release');await new Promise(r=>setTimeout(r,25));}

 }finally{(globalThis as any).nodeRepl=before;}
});

for(const launchMode of ['explicit','skyshot'] as const) for(const source of ['restored','installed'] as const) test(`${launchMode} owned App launch through ${source} Sky client`,{skip:process.env.CUA_TEST_NATIVE_APP_START!=='1',timeout:30000},async t=>{
 assert.equal(process.platform,'darwin');
 const identifier=`com.core.fixture.start.t${Date.now()}${source}${launchMode}`;
 const f=await fixture(t,{[identifier]:{decision:'allowed',risk:'low',allowPersistentApproval:false}});
 const app=await appFixture(f.root,identifier);
 await mkdir(join(app,'Contents','MacOS'));
 await copyFile(resolve('native/macos/.build/debug/CuaFixture'),join(app,'Contents','MacOS','CuaFixture'));
 await chmod(join(app,'Contents','MacOS','CuaFixture'),0o700);
 await writeFile(join(app,'Contents','Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleExecutable</key><string>CuaFixture</string><key>CFBundleName</key><string>Owned Launch Fixture</string>${launchMode==='skyshot'?'<key>CoreFixtureBackground</key><true/>':''}<key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
 const before=(globalThis as any).nodeRepl;
 (globalThis as any).nodeRepl={env:{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:f.path},nativePipe:{createConnection:f.open}};
 try {
  const Client=source==='restored'?MacComputerUseClient:(await import(pathToFileURL('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/targets/mac/client.js').href)).MacComputerUseClient;
  const client=new Client();
  const checked=spawnSync(helper,['--permissions'],{encoding:'utf8'});assert.ifError(checked.error);
  const permissions=JSON.parse(checked.stdout);
  const observe=async()=>{
   if(!permissions.accessibility||!permissions.screenRecording){
    await assert.rejects(client.getAppState(app),(error:any)=>error.code===-10009);
    return undefined;
   }
   const state=await client.getAppState(app);assert.equal(state.app.bundleIdentifier,identifier);return state;
  };
  assert.equal((await client.listApps()).filter((entry:any)=>entry.bundleIdentifier===identifier).length,0);
  const started=launchMode==='explicit'?await client.startApp(app):await observe();
  if(started){assert.equal(started.app.bundleIdentifier,identifier);assert.ok(started.app.pid>0);process.kill(started.app.pid,0);}
  const apps=await client.listApps();const actual=apps.filter((entry:any)=>entry.bundleIdentifier===identifier);
  assert.equal(actual.length,1);assert.equal(await realpath(actual[0].appPath),await realpath(app));assert.equal(actual[0].isRunning,true);
  if(launchMode==='skyshot')assert.equal(actual[0].isFrontmost,false,'Background getApp launch must not activate the fixture');
  // PID is omitted from original listApps; use our helper inventory for owned PID only.
  const ownedPid=()=>{
   const result=spawnSync(helper,[],{input:JSON.stringify({id:'owned-pid',method:'listApps',params:{}})+'\n',encoding:'utf8'});
   assert.equal(result.status,0);const entries=JSON.parse(result.stdout).result.apps.filter((entry:any)=>entry.bundleId===identifier);
   assert.equal(entries.length,1);return entries[0].pid;
  };
  const pid=ownedPid();
  await observe();assert.equal(ownedPid(),pid,'Repeated skyshot must reuse the running fixture');
  if(launchMode==='explicit')assert.equal((await client.startApp({app})).app.pid,pid);
  else assert.equal((await client.listApps()).find((entry:any)=>entry.bundleIdentifier===identifier).isFrontmost,false);

 } finally {
  (globalThis as any).nodeRepl=before;
  // Only terminate our uniquely identified temporary fixture, even if launch timed out.
  const inventory=spawnSync(helper,[],{input:JSON.stringify({id:'cleanup',method:'listApps',params:{}})+'\n',encoding:'utf8'});
  assert.ifError(inventory.error);assert.equal(inventory.status,0);
  const owned=JSON.parse(inventory.stdout).result.apps.filter((entry:any)=>entry.bundleId===identifier);
  for(const entry of owned){assert.equal(await realpath(entry.path),await realpath(app));try{process.kill(entry.pid,'SIGTERM');}catch(error:any){if(error.code!=='ESRCH')throw error;}}
  for(const entry of owned){for(let attempt=0;;attempt++){try{process.kill(entry.pid,0);}catch(error:any){assert.equal(error.code,'ESRCH');break;}assert.ok(attempt<200,'Owned fixture did not retire');await new Promise(r=>setTimeout(r,25));}}
 }
});

for(const signal of ['SIGTERM','SIGINT'] as const)test(`native ${signal} restores an active named clipboard transaction`,{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:5000},async t=>{
 const child=spawn(helper,['--paste-termination-fixture'],{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
 const exited=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;});
 for(let n=0;!stdout.includes('pasteTerminationReady');n++){assert.ok(n<200&&child.exitCode===null,stderr||'No readiness');await new Promise(r=>setTimeout(r,10));}
 child.kill(signal);const [code,bySignal]=await exited;assert.equal(code,0,stderr);assert.equal(bySignal,null);assert.match(stdout,/"pasteTerminationRestored":true/);
});
for(const phase of ['accept','partial-header','partial-body'] as const)test(`native SIGTERM retires socket blocked in ${phase}`,{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:5000},async t=>{
 const f=await fixture(t);
 if(phase!=='accept'){const socket=await f.open();socket.write(phase==='partial-header'?Buffer.from([1]):Buffer.from([10,0,0,0,123]));}
 f.child.kill('SIGTERM');const [code,signal]=await f.exited;assert.equal(code,0);assert.equal(signal,null);await assert.rejects(access(f.path));
});

for(const signal of ['SIGTERM','SIGINT'] as const)test(`native ${signal} cancels a proven backpressured socket writer`,{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:5000},async t=>{
 const child=spawn(helper,['--socket-backpressure-fixture'],{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
 const exited=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;});
 for(let n=0;!stdout.includes('socketBackpressureReady');n++){assert.ok(n<200&&child.exitCode===null,stderr||'No backpressure readiness');await new Promise(r=>setTimeout(r,10));}
 child.kill(signal);const [code,bySignal]=await exited;assert.equal(code,0,stderr);assert.equal(bySignal,null);assert.match(stdout,/"socketBackpressureCancelled":true/);
});

test('Swift IPC app-server policy bootstrap uses owned peer and caches policies', {skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:15000}, async t=>{
 const peerRoot=await realpath(await mkdtemp('/tmp/core-policy-peer-'));
 t.after(()=>rm(peerRoot,{recursive:true,force:true}));
 const script=join(peerRoot,'peer'), log=join(peerRoot,'methods.jsonl');
 await writeFile(script,`#!${process.execPath}
const fs=require('node:fs');
const assert=require('node:assert/strict');
const readline=require('node:readline');
assert.deepEqual(process.argv.slice(2),['app-server','--listen','stdio://']);
readline.createInterface({input:process.stdin}).on('line',line=>{
 const req=JSON.parse(line); fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(req.method)+'\\n');
 if(process.env.CUA_TEST_POLICY_PEER_ERROR==='1') {
  process.stdout.write(JSON.stringify({id:req.id,error:{message:'fixture policy unavailable'}})+'\\n'); return;
 }
 let result={};
 if(req.method==='initialize') {
  assert.equal(req.params.clientInfo.name,'core-computer-use');
  assert.deepEqual(req.params.capabilities,{experimentalApi:true,optOutNotificationMethods:[]});
 } else if(req.method==='configRequirements/read') {
  assert.equal(req.params,undefined);
  result={requirements:{computerUse:{defaultAppAccess:'deny',macos:{bundleIds:{'com.core.fixture.allowed':'allow','com.apple.Terminal':'allow'}}}}};
 } else if(req.method==='config/read') {
  assert.deepEqual(req.params,{includeLayers:false}); result={config:{}};
 } else throw Error('unexpected method');
 process.stdout.write(JSON.stringify({id:req.id,result})+'\\n');
});
`,{mode:0o700});
 const f=await fixture(t,{}, {CORE_CUA_APP_POLICY:undefined,CORE_CUA_POLICY_SOURCE:'app-server',CODEX_CLI_PATH:script});
 const before=(globalThis as any).nodeRepl;
 (globalThis as any).nodeRepl={env:{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:f.path},nativePipe:{createConnection:f.open},requestMeta:{'x-codex-turn-metadata':{session_id:'fixture',turn_id:'provider'}}};
 try {
  const client=new MacComputerUseClient();
  await assert.rejects(client.getAppPolicy('/nonexistent/core-provider.app'),(error:any)=>error.code===-10010&&error.message==='/nonexistent/core-provider.app');
  await assert.rejects(access(log)); // Failed resolution must not start the peer.
  for(const [identifier,expected] of [['com.core.fixture.allowed','allowed'],['com.core.fixture.other','denied'],['com.apple.Terminal','forbidden']]) {
   const path=await appFixture(f.root,identifier);
   const policy=await client.getAppPolicy(path);
   assert.equal(policy.decision,expected);assert.equal(policy.target.bundleIdentifier,identifier);
  }
  assert.deepEqual((await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line)),['initialize','configRequirements/read','config/read']);
  const failed=await fixture(t,{}, {CORE_CUA_APP_POLICY:undefined,CORE_CUA_POLICY_SOURCE:'app-server',CODEX_CLI_PATH:script,CUA_TEST_POLICY_PEER_ERROR:'1'});
  (globalThis as any).nodeRepl={env:{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:failed.path},nativePipe:{createConnection:failed.open},requestMeta:{'x-codex-turn-metadata':{session_id:'fixture',turn_id:'provider-error'}}};
  const failedClient=new MacComputerUseClient();
  const failedApp=await appFixture(failed.root,'com.core.fixture.allowed');
  for(let n=0;n<2;n++) await assert.rejects(failedClient.getAppPolicy(failedApp),(error:any)=>error.code===-10005);
  assert.deepEqual((await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line)),['initialize','configRequirements/read','config/read','initialize','initialize']);
 } finally {(globalThis as any).nodeRepl=before;}
});

test('Swift IPC bootstrap rejects conflicting or unknown policy sources', {skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1'},()=>{
 for(const extra of [{CORE_CUA_POLICY_SOURCE:'unknown'}, {CORE_CUA_POLICY_SOURCE:'app-server',CORE_CUA_APP_POLICY:'{}'}]) {
  const child=spawnSync(helper,['--sky-socket','/tmp/not-created-policy.sock'],{env:{PATH:'/usr/bin:/bin',...extra},encoding:'utf8',timeout:3000});
  assert.notEqual(child.status,0);assert.equal(child.signal,null);
  assert.match(child.stderr,/CORE_CUA_POLICY_SOURCE/);
 }
});
