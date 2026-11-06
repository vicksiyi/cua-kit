import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nativeSupervisorEnvironment,nativeAppServerEnvironment} from '../packages/agent-loop/src/native-supervisor-environment';
import {readRuntimeEnvironment} from '../packages/agent-loop/src/restored-runtime';
import {prepareIndependentRuntime} from '../packages/agent-loop/src/independent-runtime';

test('host auth/routing settings preserve precedence, empty values and exclude model secrets',async()=>{
 const parent={HOME:'/fixture/home',PATH:'/fixture/bin',CODEX_HOME:'/fixture/auth',CODEX_CLI_PATH:'/fixture/codex',NODE_REPL_RUNTIME_MODE:'gaas-browser',HTTPS_PROXY:'http://127.0.0.1:9',DEEPSEEK_API_KEY:'fixture-secret',CUA_MCP_ENV:JSON.stringify({CODEX_CLI_PATH:'',NODE_REPL_RUNTIME_MODE:''})};
 const env=await readRuntimeEnvironment(parent);
 const host=nativeSupervisorEnvironment(env,'/fixture/temp');
 assert.equal(host.HOME,parent.HOME);
 assert.equal(host.PATH,parent.PATH);
 assert.equal(host.CODEX_HOME,parent.CODEX_HOME);
 assert.equal(host.CODEX_CLI_PATH,'');
 assert.equal(host.NODE_REPL_RUNTIME_MODE,'');
 assert.equal(host.TMPDIR,'/fixture/temp');
 assert.equal(host.HTTPS_PROXY,parent.HTTPS_PROXY);
 assert.equal(host.DEEPSEEK_API_KEY,undefined);
 assert.deepEqual(nativeSupervisorEnvironment({},'/fixture/temp'),{HOME:'/fixture/temp',TMPDIR:'/fixture/temp'});
});

test('prepared Rust host retains auth configuration while both sandbox workers remain isolated',{skip:process.platform!=='darwin'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'core-env-fixture-'));
 let runtime:Awaited<ReturnType<typeof prepareIndependentRuntime>>|undefined;
 try{
  const helper=join(root,'owned-helper');await writeFile(helper,'fixture');
  runtime=await prepareIndependentRuntime({CUA_REPL_ENABLED_SURFACES:'computer',CORE_CUA_NATIVE_BACKEND:'swift',CORE_CUA_NATIVE_HELPER_PATH:helper,HOME:root,CODEX_HOME:join(root,'auth'),CODEX_CLI_PATH:join(root,'codex'),PATH:'/fixture/bin',NODE_REPL_RUNTIME_MODE:'gaas-browser',DEEPSEEK_API_KEY:'fixture-secret',HTTPS_PROXY:'http://127.0.0.1:9'},root,'env-fixture');
  assert.equal(runtime.environment.HOME,root);
  assert.equal(runtime.environment.CODEX_HOME,join(root,'auth'));
  assert.equal(runtime.environment.NODE_REPL_RUNTIME_MODE,'gaas-browser');
  assert.equal(runtime.environment.DEEPSEEK_API_KEY,undefined);
  const spec=JSON.parse(await readFile(runtime.args[0],'utf8'));
  for(const worker of [spec.kernel,spec.trusted]){
   const env=worker.sandbox.worker_environment;
   for(const key of ['HOME','CODEX_HOME','CODEX_CLI_PATH','PATH','DEEPSEEK_API_KEY','HTTPS_PROXY']) assert.equal(env[key],undefined,key);
  }
 }finally{await runtime?.dispose();await rm(root,{recursive:true,force:true});}
});

test('policy provider environment carries host routing without model secrets or unrelated launch controls',()=>{
 const selected=nativeAppServerEnvironment({HOME:'/fixture/home',CODEX_HOME:'',PATH:'/fixture/bin',CODEX_CLI_PATH:'/fixture/cli',NODE_REPL_RUNTIME_MODE:'gaas-browser',HTTP_PROXY:'http://127.0.0.1:9',DEEPSEEK_API_KEY:'fixture-secret',CORE_CUA_APP_POLICY:'{}'},'/fixture/tmp');
 assert.deepEqual(selected,{HOME:'/fixture/home',TMPDIR:'/fixture/tmp',CODEX_HOME:'',PATH:'/fixture/bin',HTTP_PROXY:'http://127.0.0.1:9'});
 assert.deepEqual(nativeAppServerEnvironment({},'/fixture/tmp'),{HOME:'/fixture/tmp',TMPDIR:'/fixture/tmp'});
});
