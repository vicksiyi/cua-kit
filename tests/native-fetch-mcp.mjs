import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const project = fileURLToPath(new URL('../', import.meta.url));
for (const mode of ['', 'gaas-browser']) test(`native MCP entry fetch mode ${mode || 'default'}`, {timeout:20000}, async () => {
  const root = await mkdtemp(join(tmpdir(),'core-fetch-mcp-'));
  let requests = 0;
  const http = createServer((request,response) => {
    requests++;
    assert.equal(request.url, '/fixture');
    response.writeHead(200, {'content-type':'text/plain'});
    response.end('native MCP fixture');
  });
  const client = new Client({name:'owned-fetch-test',version:'1.0'});
  let transport;
  try {
    await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
    const url = `http://127.0.0.1:${http.address().port}/fixture`;
    const service = join(root,'service.mjs');
    await writeFile(service, `export async function handleRpc(){try{const r=await nodeRepl.fetch(${JSON.stringify(url)});return {status:r.status,body:await r.text()};}catch(error){return {error:error.message};}}`);
    const env = {HOME:root,TMPDIR:root,NODE_REPL_TRUSTED_RPC_ENABLED:'1',NODE_REPL_TRUSTED_SERVICES:JSON.stringify({fixture:service}),NODE_REPL_TRUSTED_CODE_PATHS:root};
    const worker = args=>({command:process.execPath,args,cwd:root,env});
    const config = join(root,'config.toml'), requirements=join(root,'requirements.toml');
    await Promise.all([writeFile(config,''),writeFile(requirements,'')]);
    const spec = join(root,'runtime.json');
    await writeFile(spec,JSON.stringify({
      kernel:worker(['--experimental-vm-modules',join(project,'packages/node-repl/dist/kernel.js'),'--session-id','fetch-mcp','--working-dir',root]),
      trusted:worker([join(project,'packages/node-repl/dist/trusted_worker.js'),root]),
      services:['fixture'],config:{config,requirements,working_directories:[root],toml_files:{}}
    }));
    transport = new StdioClientTransport({
      command:process.env.CUA_TEST_SUPERVISOR ?? resolve(project,'native/runtime-supervisor/target/debug/examples/mcp_stdio'),
      args:[spec],env:{HOME:root,TMPDIR:root,CODEX_CLI_PATH:join(root,'must-not-launch'),NODE_REPL_RUNTIME_MODE:mode},stderr:'pipe'
    });
    await client.connect(transport);
    const result = await client.callTool({name:'js',arguments:{code:"nodeRepl.write(JSON.stringify(await nodeRepl.rpc('fixture',{})))",timeout_ms:5000}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    const text = result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');
    if (mode === 'gaas-browser') {
      assert.match(text, /destination is not allowed in gaas-browser runtime mode/);
      assert.equal(requests,0);
    } else {
      assert.match(text, /native MCP fixture/);
      assert.match(text, /200/);
      assert.equal(requests,1);
    }
  } finally {
    await client.close();
    await transport?.close();
    http.closeAllConnections();
    await new Promise(resolve=>http.close(resolve));
    await rm(root,{recursive:true,force:true});
  }
});
