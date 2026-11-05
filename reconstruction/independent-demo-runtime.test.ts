import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {startCdpHost} from '../packages/cdp-host/src/host';

test('demo uses independent sandbox runtime, preserves bootstrap docs and executes real browser action without installed supervisor',{
 skip:process.platform!=='darwin'||process.env.CUA_TEST_MACOS_SANDBOX!=='1',timeout:90000,
},async t=>{
 const liveModel=process.env.CUA_LIVE_DEEPSEEK_TEST==='1';
 const marker=`observed-${randomUUID()}`;let submitted=false,modelCalls=0,origin='';
 const server=createServer(async(req,res)=>{
  if(req.url==='/model'){
   let body='';for await(const chunk of req)body+=chunk;
   const request=JSON.parse(body);modelCalls++;
   let message;
   if(modelCalls===1){
    assert.match(JSON.stringify(request.messages),/host-cua-bootstrap/);
    assert.match(JSON.stringify(request.messages),/createBrowserTab/);
    message={content:null,tool_calls:[{id:'real-action',type:'function',function:{name:'js',arguments:JSON.stringify({code:`var tab = await cua.createBrowserTab("1", ${JSON.stringify(origin)}, {sessionName:"Independent CLI test"});`,title:'Submit isolated fixture'})}}]};
   }else if(modelCalls===2){
    message={content:null,tool_calls:[{id:'submit-action',type:'function',function:{name:'js',arguments:JSON.stringify({code:'await tab.playwright.getByRole("button",{name:"Submit"}).click();',title:'Submit fixture form'})}}]};
   }else if(modelCalls===3){
    message={content:null,tool_calls:[{id:'read-result',type:'function',function:{name:'js',arguments:JSON.stringify({code:'await tab.getAXState();',title:'Read result after navigation'})}}]};
   }else{
    assert.equal(modelCalls,4);
    const last=request.messages.filter((m:any)=>m.role==='tool').at(-1);
    assert.match(JSON.stringify(last),new RegExp(marker));
    message={content:marker};
   }
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message}]}));return;
  }
  res.setHeader('Content-Type','text/html');
  if(new URL(req.url!, 'http://fixture.invalid').pathname==='/done'){submitted=true;res.end(`<p>${marker}</p>`);}
  else res.end('<h1>CLI fixture</h1><form action="/done"><button>Submit</button></form>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();return new Promise<void>(r=>server.close(()=>r()));});
 const address=server.address();assert(address&&typeof address!=='string');origin=`http://127.0.0.1:${address.port}`;
 const host=await startCdpHost({headless:true});t.after(()=>host.close());
 if(liveModel) loadEnvFile(resolve('.env'));
 const child=spawn(process.execPath,['--import','tsx','packages/agent-loop/src/restored-demo.ts',`Open ${origin} in the connected browser, click Submit, read the resulting page and return the exact result text.`],{
  cwd:resolve('.'),env:{PATH:process.env.PATH,HOME:process.env.HOME,CUA_RUNTIME_SUPERVISOR:'independent',
   CUA_NATIVE_SUPERVISOR_PATH:'/intentionally-not-installed',NODE_REPL_NODE_PATH:'/intentionally-not-installed',
   ...(liveModel ? {CUA_MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,CUA_MODEL:process.env.CUA_MODEL??'deepseek-flash'} : {CUA_MODEL_PROVIDER:'openai-compatible',CUA_MODEL_API_KEY:'local-model-fixture',CUA_MODEL:'fixture',CUA_MODEL_ENDPOINT:origin+'/model'}),
   CUA_AUTO_APPROVE_BROWSER_ORIGINS:origin,CUA_DEBUG:'0',
   CUA_MCP_ENV:JSON.stringify({CUA_REPL_ENABLED_SURFACES:'browser',CUA_REPL_BROWSER_ENV:'codex-app',BROWSER_USE_AVAILABLE_BACKENDS:'cdp',CORE_CUA_ENDPOINT_FILES:JSON.stringify([host.endpointFile])}),
  },stdio:['ignore','pipe','pipe'],
 });
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const status=await new Promise<number|null>((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 assert.equal(status,0,output);assert.equal(submitted,true);if(!liveModel)assert.equal(modelCalls,4);assert.match(output,new RegExp(marker));
 assert.match(output,/Independent sandboxed runtime supervisor selected/);
});
