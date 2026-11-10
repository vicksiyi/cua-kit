import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { WindowsDesktopClient } from "../packages/sky/src/targets/windows/desktop_client";
const root = process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const file = `${root}/sky/dist/project/cua/sky_js/src/targets/windows/desktop_client.js`;
const original = (await import(pathToFileURL(file).href)).WindowsDesktopClient;
const jpeg = "data:image/jpeg;base64,YWJj";
const failure = async (action: () => unknown) => {
 try { await action(); return null; } catch (e: any) { return { name: e.name, message: e.message, errors: e.errors?.map((x: Error)=>x.message) }; }
};
async function scenario(Client: any, mode: string) {
 const calls: any[] = [], ids = new Map<string,string>();
 const normalize = (value: any): any => {
  if (typeof value === "string" && /^[0-9a-f-]{36}$/.test(value)) { if (!ids.has(value)) ids.set(value, `id${ids.size}`); return ids.get(value); }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));
  return value;
 };
 let first = true;
 const client = new Client({
  async request(method: string, params: any, options: any) {
   calls.push([method,normalize(params),normalize(options)]);
   if (mode === "timeout-fatal" && method === "desktop_cancel") throw Error("cancel rejected");
   if (first && ((mode === "timeout" || mode === "timeout-fatal" || mode === "escape") && method === "desktop_click")) {
    first = false;
    throw Error(mode === "escape" ? "Computer Use was stopped by the user with the physical Escape key" : "computer-use request timed out: fixture");
   }
   if (first && mode === "drag-failure" && method === "desktop_move") { first = false; throw Error("move rejected"); }
   if (method === "desktop_get_screenshot") {
    if (first && mode === "bad-image") { first = false; return {url:"data:image/png;base64,YWJj"}; }
    return {url:jpeg};
   }
   return {};
  },
  async close() { calls.push(["transport.close"]); },
 });
 const results: any[] = [];
 try {
  if (mode === "normal") {
   const images = await client.get_screenshot();
   results.push(images.map((image: any)=>({bytes:Array.from(image.bytes),url:image.data_url,extension:image.filepath.endsWith(".jpg")})));
   // Check actual bytes and private temporary-file mode before close cleanup.
   for (const image of images) { assert.equal((await readFile(image.filepath)).toString(),"abc"); assert.equal((await stat(image.filepath)).mode & 0o777,0o600); }
   const point = {x:1,y:2};
   await Promise.all([client.click(point),client.scroll({direction:"down"}),client.move(point),client.type_text({text:"owned"}),client.press_key({key:"A"}),client.paste({text:"owned"})]);
   await client.drag({path:[point,{x:3,y:4}]});
   const handle = client.drag_handle();
   results.push(await failure(()=>handle.move_to(point)));
   await handle.start(point); results.push(await failure(()=>handle.start(point)));
   await handle.move_to({x:5,y:6}); await handle.end(); results.push(await failure(()=>handle.end()));
   results.push(await failure(()=>client.drag({path:[point]})));
   const close = client.close(); assert.equal(close,client.close()); await close;
   for (const image of images) await assert.rejects(stat(image.filepath));
   results.push(await failure(()=>client.move(point)));
  } else if (mode === "bad-image") {
   results.push(await failure(()=>client.get_screenshot()));
   results.push(await failure(()=>client.click({x:1,y:2})));
   await client.get_screenshot(); await client.click({x:1,y:2});
  } else if (mode === "drag-failure") {
   results.push(await failure(()=>client.drag({path:[{x:1,y:2},{x:3,y:4}]})));
   await client.click({x:1,y:2});
  } else {
   results.push(await failure(()=>client.click({x:1,y:2})));
   results.push(await failure(()=>client.move({x:3,y:4})));
  }
 } finally { results.push(await failure(()=>client.close())); }
 return {calls,results};
}
for (const mode of ["normal","bad-image","timeout","escape","drag-failure","timeout-fatal"]) {
 test(`Windows desktop ${mode} matches installed JS without native execution`, async () => {
  assert.deepEqual(await scenario(WindowsDesktopClient,mode),await scenario(original,mode));
 });
}

test("Windows desktop original file is version pinned", async () => { assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), "80bddcec7b3d7b5053067f63624a456a4a735eb54a98c0d643b524571a18a736"); });
