import test from "node:test";
import path from "node:path";
import { originalServiceBindings } from "./service-source";
import assert from "node:assert/strict";
import { createBrowserServiceConnector } from "../packages/native-host/src/browser_connector";
import { parseEndpointFiles } from "../packages/native-host/src/endpoint_configuration";
import { listBackendPipes } from "../packages/browser/src/service/runtime/browser_discovery";
import { unifiedPreflight } from "../packages/agent-loop/src/unified-preflight";
import { prepareRestoredRuntime } from "../packages/agent-loop/src/restored-runtime";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";

test("explicit empty browser endpoints never discover or connect ambient pipes", async () => {
  assert.throws(() => parseEndpointFiles("[]"), /nonempty/);
  assert.deepEqual(parseEndpointFiles("[]", {allowEmpty:true}), []);
  for (const invalid of [undefined, "null", "{}", '[""]'])
    assert.throws(() => parseEndpointFiles(invalid, {allowEmpty:true}));
  const connector = await createBrowserServiceConnector([]);
  assert.equal(connector.environment.BROWSER_USE_BACKEND_PATHS, "");
  assert.deepEqual(await listBackendPipes({env:connector.environment,platform:"darwin"}, async () => {
    throw Error("Must not scan ambient host directories");
  }), []);
  await assert.rejects(connector.host.getNativePipeBridge().createConnection("/tmp/unregistered.sock"), /outside/);
});

test("installed discovery also treats explicit empty paths as zero backends", async () => {
  const original = originalServiceBindings(["Xle"], {
    bb: path,
    Jle: () => { throw Error("unexpected Windows ambient discovery"); },
    Yle: () => { throw Error("unexpected macOS ambient discovery"); },
  }).Xle;
  for (const platform of ["darwin", "win32"]) {
    const runtime = {platform, env:{BROWSER_USE_BACKEND_PATHS:""}};
    assert.deepEqual(await original(runtime), []);
    assert.deepEqual(await listBackendPipes(runtime), []);
  }
});

test("unified inventory retains independent surface errors but stops on tool errors or denial", async () => {
  const observation = {content:[{type:"text" as const,text:JSON.stringify({apps:[{name:"Fixture"}],browsers:[],errors:["Browsers: unavailable"]})}]};
  const tools = {listTools:async()=>[],callTool:async()=>observation,close:async()=>{}};
  const messages = await unifiedPreflight(tools);
  assert.equal((messages[1] as any).result, observation);
  for (const extra of [{isError:true},{stopReason:{kind:"authorization" as const,message:"Denied"}}])
    await assert.rejects(unifiedPreflight({...tools,callTool:async()=>({...observation,...extra})}), /inventory failed/);
});

test("real Rust + Swift runtime retains app inventory with explicitly zero browser endpoints", {
  skip: process.platform !== "darwin" || process.env.CUA_TEST_NATIVE_SKY_IPC !== "1", timeout:60000,
}, async () => {
  const runtime = await prepareRestoredRuntime({
    CUA_REPL_ENABLED_SURFACES:"browser,computer", CUA_REPL_BROWSER_ENV:"codex-app",
    CORE_CUA_NATIVE_BACKEND:"swift", CORE_CUA_ENDPOINT_FILES:"[]",
    BROWSER_USE_AVAILABLE_BACKENDS:"chrome", NODE_REPL_DISABLE_ANALYTICS:"1",
  }, "rust", "unified-empty-test");
  try {
    const client = await McpToolClient.connect({command:runtime.command,args:runtime.args,env:runtime.environment,stderr:"pipe"}, {requestMeta:()=>({"x-codex-turn-metadata":{session_id:"unified-empty-test",turn_id:"inventory"}})});
    try {
      await unifiedPreflight(client);
      const result = await client.callTool({id:"verify-inventory",name:"js",arguments:{code:'{ const inventory = await cua.getState({emit:false}); nodeRepl.write(JSON.stringify({browsers:inventory.browsers.length,apps:inventory.apps.length,errors:inventory.errors ?? [],getApp:typeof cua.getApp,getTab:typeof cua.getTab})); }'}});
      assert.notEqual(result.isError, true, JSON.stringify(result));
      const value = result.content.flatMap(item => {
        if(item.type!=="text")return [];
        try{return [JSON.parse(item.text)];}catch{return [];}
      }).find(item=>typeof item.browsers==="number");
      assert(value, JSON.stringify(result));
      assert.equal(value.browsers,0);
      assert(value.apps>0);
      assert.deepEqual(value.errors,[]);
      assert.equal(value.getApp,"function");assert.equal(value.getTab,"function");
    } finally { await client.close(); }
  } finally { await runtime.dispose(); }
});
