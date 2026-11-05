import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {create_launch_environment} from '../packages/cua-repl/src/environment';
import {prepareIndependentRuntime} from '../packages/agent-loop/src/independent-runtime';
import {stageRuntimePackages} from '../packages/agent-loop/src/runtime-packages';

test('Rust initialize and tools/list consume original CUA environment descriptions',{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:15000},async()=>{
 const staged=await stageRuntimePackages([resolve('packages/sky')]);
 let runtime:Awaited<ReturnType<typeof prepareIndependentRuntime>>|undefined;
 const client=new Client({name:'tool-description-test',version:'1'});
 try{
  const env=create_launch_environment({env:{CUA_REPL_ENABLED_SURFACES:'computer',CORE_CUA_NATIVE_BACKEND:'swift'},instructions_directory:new URL('../packages/cua-repl/instructions/',import.meta.url),platform:'darwin'});
  const expected=JSON.parse(env.NODE_REPL_TOOL_OVERRIDES);
  const configured=Object.fromEntries(Object.entries(env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  runtime=await prepareIndependentRuntime(configured,staged.root,'tool-descriptions','rust');
  await client.connect(new StdioClientTransport({command:runtime.command,args:runtime.args,env:runtime.environment,stderr:'ignore'}));
  assert.equal(client.getInstructions(),expected.server_instructions);
  const listed=await client.listTools();
  for(const [name,settings] of Object.entries(expected.tools) as Array<[string,any]>){
   const tool=listed.tools.find(tool=>tool.name===name);assert.ok(tool);
   assert.equal(tool.description,settings.description);
   for(const [field,description] of Object.entries(settings.field_descriptions??{}))assert.equal((tool.inputSchema.properties![field] as any).description,description);
  }
  const js=listed.tools.find(tool=>tool.name==='js')!;
  assert.equal(js.inputSchema.additionalProperties,false);assert.deepEqual(js.inputSchema.required,['code']);
  assert.equal((js.inputSchema.properties!.title as any).maxLength,80);
  assert.equal((js.inputSchema.properties!.code as any).type,'string');
  assert.deepEqual(listed.tools.map(tool=>tool.name).sort(),['js','js_add_node_module_dir','js_reset','turn_ended'].sort());
  const invalid=await client.callTool({name:'js',arguments:{code:'1',inputSchema:{additionalProperties:true}}});assert.equal(invalid.isError,true);
 }finally{await client.close();await runtime?.dispose();await staged.dispose();}
});
