import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { invoke, create_drag_handle } from "../packages/sky/src/sky_service_rpc";
const root = process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const file = `${root}/sky/dist/project/cua/sky_js/src/sky_service_rpc.js`;
const original = await import(pathToFileURL(file).href);
test("shared RPC current oracle is pinned", async () => {
 assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), "87b037bfa736500f6700824099d569cb8add10140c66ad6039e6d21f3f5c2f7d");
});
test("shared RPC preserves request receiver, media bytes, nullish and falsy values", async () => {
 const media = { filepath: "fixture", data_url: "data:image/png;base64,YWJj" };
 for (const [request, value, target] of [
  [{type:"execute",method:"get_screenshot"},[media],"mac"],
  [{type:"execute",method:"get_screenshot"},[{...media,data_url:"missing-comma"}],"windows_desktop"],
  [{type:"execute",method:"stop_audio_recording"},media,"mac"],
  [{type:"execute",method:"get_window_state"},{ax_tree:{id:"1",role:"button",name:"go",children:[]},screenshots:[media]},"linux"],
  ...[null,undefined,false,0,""].map(value => [{type:"setup"},value,"mac"]),
 ] as any[]) {
  async function run(fn: any) {
   const runtime = { async rpc(service: string, passed: unknown) { assert.equal(this, runtime); assert.equal(service,"sky"); assert.equal(passed,request); return structuredClone(value); } };
   return fn(runtime,request,target);
  }
  assert.deepEqual(await run(invoke),await run(original.invoke));
 }
});
test("shared RPC preserves missing host and provider rejection", async () => {
 for (const fn of [invoke,original.invoke]) {
  await assert.rejects(fn(undefined,{type:"setup"}), /trusted Node REPL Sky service/);
  const error = new Error("owned rejection");
  await assert.rejects(fn({rpc:async()=>{throw error;}},{type:"setup"}), e=>e===error);
 }
});
test("drag handles keep one UUID and ordered start/move/end payloads", async () => {
 async function run(factory: any) {
  const calls: any[] = [];
  const handle = factory(async (request: any) => { calls.push(request); return calls.length; });
  assert.equal(await handle.start({x:1,y:2}),1);
  assert.equal(await handle.move_to({x:3,y:4}),2);
  assert.equal(await handle.end(),3);
  assert.equal(new Set(calls.map(x=>x.handle_id)).size,1);
  assert.match(calls[0].handle_id,/^[0-9a-f-]{36}$/);
  return calls.map(({handle_id,...rest})=>rest);
 }
 assert.deepEqual(await run(create_drag_handle),await run(original.create_drag_handle));
});
