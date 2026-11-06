/** Compare actual installed JS helpers without executing installation or launching apps. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createAppServerHostConfiguration, createPluginAppServerHostConfiguration,
  writeAppServerHostConfiguration,
} from "../packages/native-host/src/app_server_host_configuration";
const artifact = "/Applications/ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/chrome/scripts/installManifest.mjs";
const code = await readFile(artifact, "utf8");
// Exact artifact guard is filled from the source inspected for this restoration.
const expectedHash = "2a1daeb3a0de6f66efe13ae757a0ef20f383ef044420b460424d9402c4eb589e";
assert.equal(createHash("sha256").update(code).digest("hex"), expectedHash, "Re-audit changed source before relying on private helper names");
const original = await import(`data:text/javascript;base64,${Buffer.from(code + "\nexport { J as create, v as plugin, Z as write };\n").toString("base64")}`);
const paths = {codexCliPath:"/fixture/codex", nodePath:"/fixture/node", nodeReplPath:"/fixture/repl"};
function outcome(fn: () => unknown) { try {return {value:fn()};}catch(error) {return {error:(error as Error).message};} }

test("schema-1 host configuration matches installed JS defaults, validation and override semantics", () => {
  const cases: unknown[] = [paths, {...paths,channel:null,browserClientPath:null},
    {...paths,channel:" dev ",nodePath:" node ",proxyHost:" localhost "},
    {...paths,channel:"",browserClientPath:"/fixture/client"},
    {...paths,nodePath:" "}, {...paths,nodeReplPath:undefined}, {...paths,codexCliPath:42},
    ...[0,65535,65536,-1,0.5,NaN,Infinity,null,"123",undefined].map(proxyPort=>({...paths,proxyPort})),
    ...["", " ", null, 123].map(proxyHost=>({...paths,proxyHost})),
  ];
  for(const value of cases) assert.deepEqual(outcome(()=>createAppServerHostConfiguration(value as any)),outcome(()=>original.create(value)));
  for(const override of [{}, {browserClientPath:undefined}, {browserClientPath:null}, {browserClientPath:"/override/client"}]) {
    const value={...paths,...override};
    assert.deepEqual(createPluginAppServerHostConfiguration("/fixture/plugin",value),original.plugin("/fixture/plugin",value));
  }
});

test("configuration writer matches installed JS bytes and adjacent location in an owned fixture", async t => {
  const root = await mkdtemp("/tmp/cua-host-config-"); t.after(()=>rm(root,{recursive:true,force:true}));
  const config = createPluginAppServerHostConfiguration("/fixture/plugin",paths);
  const options={appServerHostConfig:config,extensionHostPath:join(root,"nested","native-host")};
  const expectedPath = await original.write(options);
  const expected = await readFile(expectedPath,"utf8");
  await rm(expectedPath);
  const actualPath = await writeAppServerHostConfiguration(options);
  assert.equal(actualPath,expectedPath);
  assert.equal(await readFile(actualPath,"utf8"),expected);
});
