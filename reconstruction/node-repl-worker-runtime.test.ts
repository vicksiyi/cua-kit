import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
const exec = promisify(execFile);
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
async function variants(run: (entry: string) => Promise<any>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-worker-runtime-"));
  try {
    await writeFile(
      path.join(dir, "worker-runtime.cjs"),
      files["worker-runtime.js"].replace(
        "./realmChecks.js",
        "./realmChecks.cjs",
      ),
    );
    await writeFile(path.join(dir, "realmChecks.cjs"), files["realmChecks.js"]);
    const results = [];
    for (const entry of [
      pathToFileURL(path.join(dir, "worker-runtime.cjs")).href,
      new URL("../packages/node-repl/dist/worker_runtime.js", import.meta.url)
        .href,
    ])
      results.push(await run(entry));
    assert.deepEqual(results[1], results[0]);
    return results[1];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const setup = String.raw`
import assert from 'node:assert/strict';
const lib=await import(process.env.WORKER_ENTRY);
const runtime=lib.createWorkerRuntime({audioEnabled:true,cwd:'/fixture',env:{SAMPLE:'yes'},homeDir:'/fixture/home',tmpDir:'/fixture/tmp'});
`;
test("worker runtime preserves metadata freezing, error kinds, output and background draining", async () => {
  const result = await variants(async (entry) => {
    const code =
      setup +
      String.raw`
 const source={nested:{value:1}}, config={nested:{value:1}};
 const state=runtime.createExecState({id:'fallback',exec_id:'run',request_meta:source,gaas_browser_config:config,form_elicitation_supported:true});
 source.nested.value=2;assert.equal(state.requestMeta.nested.value,1);assert.ok(Object.isFrozen(state.requestMeta.nested));assert.ok(Object.isFrozen(config));assert.equal(Object.isFrozen(config.nested),false);
 const override=runtime.createExecState({id:'a'},{id:'b',responseMeta:{x:1}});assert.equal(override.id,'b');
 const getterError=new Error('fixture');Object.defineProperty(getterError,'name',{get(){throw new Error('must not call getter');}});
 const proxy=new Proxy(new Error('fixture'),{get(){throw new Error('must not call proxy');}});
 const errors=[new SyntaxError('x'),new ReferenceError('x'),new TypeError('x'),Object.assign(new Error('x'),{code:'MODULE_NOT_FOUND'}),getterError,proxy,'plain'];
 const kinds=errors.map(error=>runtime.getErrorKind(error));assert.deepEqual(kinds,['syntax_error','reference_error','type_error','import_error','unknown','unknown','unknown']);
 const tagged=new Error('fixture');assert.equal(runtime.withErrorKind(tagged,'custom'),tagged);assert.equal(runtime.getErrorKind(tagged),'custom');assert.deepEqual(Object.keys(tagged),[]);
 const fallback=[];const original={log:(...args)=>fallback.push(args)};const consoleProxy=runtime.createConsole(original);consoleProxy.log('outside');
 runtime.execContext.activate('run');
 await runtime.execContext.run(state,async()=>{assert.equal(runtime.nodeRepl.requestMeta,state.requestMeta);runtime.nodeRepl.write({a:1},'item');consoleProxy.warn('inside',2);assert.throws(()=>runtime.nodeRepl.write('x',''),/nonempty string/);
 const rejected=new Error('unobserved');lib.trackExecBackgroundOperation(state,Promise.reject(rejected));await assert.rejects(runtime.drainExecBackgroundTasks(state),error=>error===rejected);assert.equal(runtime.getErrorKind(rejected),'unhandled_rejection');
 const observed=lib.trackExecBackgroundOperation(state,Promise.reject(new Error('observed')));await observed.catch(()=>{});await runtime.drainExecBackgroundTasks(state);
 const first=Promise.resolve().then(()=>{lib.trackExecBackgroundOperation(state,Promise.resolve(2));return 1;});lib.trackExecBackgroundOperation(state,first);await runtime.drainExecBackgroundTasks(state);assert.equal(state.pendingBackgroundTasks.size,0);
 });
 runtime.execContext.clear('run');assert.equal(runtime.nodeRepl.requestMeta,null);assert.throws(()=>runtime.nodeRepl.write('late'),/context not found/);await assert.rejects(Promise.resolve(runtime.nodeRepl.emitImage('data:image/png;base64,AA==')),/context not found/);
 runtime.send({kinds,fallback,events:state.outputEvents,settleUnknown:runtime.settle({id:'none',ok:true})});
 `;
    const result = await exec(
      process.execPath,
      ["--input-type=module", "-e", code],
      { env: { ...process.env, WORKER_ENTRY: entry }, timeout: 10000 },
    );
    return JSON.parse(result.stdout);
  });
  assert.equal(result.events[0].item_id, "item");
  assert.equal(result.settleUnknown, false);
});
test("worker JSONL bridge handles split UTF-8, media responses, CRLF, invalid frames and EOF", async () => {
  const result = await variants(
    (entry) =>
      new Promise<any>((resolve, reject) => {
        const code =
          setup +
          String.raw`
 setInterval(()=>{},1000);
 runtime.listen(async message=>{
 if(message.type==='run'){
 const state=runtime.createExecState({id:'exec',request_meta:{value:message.value}});runtime.execContext.activate('exec');
 await runtime.execContext.run(state,async()=>{
 runtime.nodeRepl.write(message.value,'utf8');
 const image=runtime.nodeRepl.emitImage(new Uint8Array([137,80,78,71,13,10,26,10]));await image;
 await runtime.nodeRepl.emitAudio('data:audio/wav;base64,AQID');
 const bad=runtime.nodeRepl.emitImage('data:image/png;base64,AA==');await assert.rejects(Promise.resolve(bad),/fixture rejected/);
 await runtime.drainExecBackgroundTasks(state);
 runtime.send({type:'done',events:state.outputEvents,pending:runtime.pendingRequests.size});
 });
 }else runtime.settle(message);
 });
 `;
        const child = spawn(
          process.execPath,
          ["--input-type=module", "-e", code],
          {
            env: { ...process.env, WORKER_ENTRY: entry },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        let stdout = "",
          stderr = "",
          done: any;
        const messages: any[] = [];
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("worker fixture timeout " + stderr));
        }, 8000);
        child.stderr.on("data", (b) => (stderr += b));
        child.on("error", reject);
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
          let end;
          while ((end = stdout.indexOf("\n")) >= 0) {
            const line = stdout.slice(0, end);
            stdout = stdout.slice(end + 1);
            const message = JSON.parse(line);
            messages.push(message);
            if (
              message.type === "emit_image" ||
              message.type === "emit_audio"
            ) {
              const reply =
                JSON.stringify({
                  id: message.id,
                  ok: !message.id.endsWith("image-1"),
                  error: "fixture rejected",
                }) + "\r\n";
              child.stdin.write(reply.slice(0, 4));
              child.stdin.write(reply.slice(4));
            }
            if (message.type === "done") {
              done = message;
              child.stdin.end();
            }
          }
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          try {
            assert.equal(code, 0, stderr);
            assert.ok(done);
            assert.equal(done.pending, 0);
            assert.equal(done.events[0].text, "中文🙂");
            resolve(messages);
          } catch (error) {
            reject(error);
          }
        });
        const input = Buffer.from(
          "  \r\ninvalid-json\n" +
            JSON.stringify({ type: "run", value: "中文🙂" }) +
            "\r\n",
        );
        const split = input.indexOf(Buffer.from("中")) + 1;
        child.stdin.write(input.subarray(0, split));
        child.stdin.write(input.subarray(split));
      }),
  );
  assert.deepEqual(
    result.map((m: any) => m.type),
    ["emit_image", "emit_audio", "emit_image", "done"],
  );
});
test("worker stdout EPIPE exits cleanly while other stream errors remain fatal", async () => {
  for (const errorCode of ["EPIPE", "OTHER"])
    await variants(async (entry) => {
      const child = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          setup +
            `process.stdout.emit('error',Object.assign(new Error('fixture stream error'),{code:${JSON.stringify(errorCode)}}));`,
        ],
        {
          env: { ...process.env, WORKER_ENTRY: entry },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stderr = "";
      child.stderr.on("data", (b) => (stderr += b));
      const [code] = await once(child, "close");
      assert.equal(code, errorCode === "EPIPE" ? 0 : 1);
      if (errorCode === "OTHER") assert.match(stderr, /fixture stream error/);
      return code;
    });
});
