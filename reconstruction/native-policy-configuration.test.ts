import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {nativePolicyConfiguration} from '../packages/agent-loop/src/native-policy-configuration';
import {nativeAppServerPolicyContext} from '../packages/agent-loop/src/native-permissions';
import {readRuntimeEnvironment} from '../packages/agent-loop/src/restored-runtime';
import {prepareIndependentRuntime} from '../packages/agent-loop/src/independent-runtime';

test('policy source preserves defaults, precedence and explicit conflicts',async()=>{
 assert.deepEqual(nativePolicyConfiguration({}),{policy_source:'standalone',app_policy:{}});
 const env=await readRuntimeEnvironment({CORE_CUA_POLICY_SOURCE:'standalone',CODEX_CLI_PATH:'/ambient/cli',CUA_MCP_ENV:JSON.stringify({CORE_CUA_POLICY_SOURCE:'app-server',CODEX_CLI_PATH:''})});
 assert.deepEqual(nativePolicyConfiguration(env),{policy_source:'app-server',codex_cli_path:''});
 assert.deepEqual(nativePolicyConfiguration({CORE_CUA_POLICY_SOURCE:'app-server'}),{policy_source:'app-server'});
 assert.equal((await readRuntimeEnvironment({CORE_CUA_POLICY_SOURCE:'app-server'})).CORE_CUA_POLICY_SOURCE,'app-server');
 for(const value of ['', '{}', 'null']) assert.throws(()=>nativePolicyConfiguration({CORE_CUA_POLICY_SOURCE:'app-server',CORE_CUA_APP_POLICY:value}),/conflicts/);
 for(const value of ['null','[]','true']) assert.throws(()=>nativePolicyConfiguration({CORE_CUA_APP_POLICY:value}),/rule map/);
 assert.throws(()=>nativePolicyConfiguration({CORE_CUA_POLICY_SOURCE:'unknown'}),/must be/);
 assert.match(nativeAppServerPolicyContext(),/app-server provider/);
 assert.doesNotMatch(nativeAppServerPolicyContext(),/Unlisted apps are denied/);
});

test('production spec selects provider without leaking policy or CLI path into workers',{skip:process.platform!=='darwin'},async t=>{
 const root=await mkdtemp('/tmp/core-policy-spec-');t.after(()=>rm(root,{recursive:true,force:true}));
 const helper=join(root,'owned-helper');await writeFile(helper,'fixture');
 const runtime=await prepareIndependentRuntime({CUA_REPL_ENABLED_SURFACES:'computer',CORE_CUA_NATIVE_BACKEND:'swift',CORE_CUA_NATIVE_HELPER_PATH:helper,CORE_CUA_POLICY_SOURCE:'app-server',CODEX_CLI_PATH:'/fixture/cli',HOME:'/fixture/home',CODEX_HOME:'/fixture/config',PATH:'/fixture/bin',HTTPS_PROXY:'',DEEPSEEK_API_KEY:'fixture-model-secret'},root,'policy-spec');
 t.after(()=>runtime.dispose());
 const spec=JSON.parse(await readFile(runtime.args[0],'utf8'));
 assert.equal(spec.native_service.policy_source,'app-server');
 assert.equal(spec.native_service.codex_cli_path,'/fixture/cli');
 assert.equal(spec.native_service.app_server_environment.HOME,'/fixture/home');
 assert.equal(spec.native_service.app_server_environment.CODEX_HOME,'/fixture/config');
 assert.equal(spec.native_service.app_server_environment.PATH,'/fixture/bin');
 assert.equal(spec.native_service.app_server_environment.HTTPS_PROXY,'');
 assert.equal(spec.native_service.app_server_environment.CODEX_CLI_PATH,undefined);
 assert.equal(spec.native_service.app_server_environment.NODE_REPL_RUNTIME_MODE,undefined);
 assert.equal(Object.hasOwn(spec.native_service,'app_policy'),false);
 for(const worker of [spec.kernel,spec.trusted]) for(const key of ['CORE_CUA_POLICY_SOURCE','CORE_CUA_APP_POLICY','CODEX_CLI_PATH','DEEPSEEK_API_KEY','HOME','CODEX_HOME','PATH','HTTPS_PROXY']) assert.equal(worker.sandbox.worker_environment[key],undefined);
 assert.doesNotMatch(JSON.stringify(spec),/fixture-model-secret/);
});
