import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ElementIds } from "../packages/sky/src/targets/linux/element_ids";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/targets/linux/`;
const names = [
  "activate_window",
  "clipboard_write",
  "drag",
  "key_down",
  "key_up",
  "launch_app",
  "move",
  "move_relative",
  "press_key",
  "click",
  "perform_secondary_action",
  "scroll",
  "type_text",
  "clipboard_read",
  "type_characters",
  "clipboard_release",
  "list_apps",
  "list_windows",
  "get_screenshot",
  "get_window_state",
  "drag_handle",
];
const original: any = {},
  restored: any = {};
for (const name of names) {
  original[name] = await import(pathToFileURL(base + name + ".js").href);
  restored[name] = await import(
    "../packages/sky/src/targets/linux/" + name + ".ts"
  );
}
const originalCommand = (
  await import(pathToFileURL(base + "sky_linux.js").href)
).sky_linux;
const restoredCommand = (
  await import("../packages/sky/src/targets/linux/sky_linux")
).sky_linux;
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { name: e.name, error: e.message };
  }
}
test("Linux adapters match original wait/resolve/defer order and actual helper payloads", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sky-adapters-")),
    shot = path.join(directory, "shot.jpg"),
    log = path.join(directory, "requests.jsonl");
  const prior = process.env.OAI_SKY_LINUX_BIN;
  await writeFile(shot, Buffer.from([1, 2, 255]));
  try {
    for (const fail of [false, true]) {
      const binary = path.join(directory, fail ? "fail" : "normal");
      const program = `#!${process.execPath}\nconst fs=require('node:fs'),rl=require('node:readline');rl.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');if(r.command==='quit'){send({id:r.id,ok:true,output:true});setTimeout(()=>process.exit(0),1);return;}fs.appendFileSync(${JSON.stringify(log)},line+'\\n');if(${fail}||r.input?.fail){send({id:r.id,ok:false,error:'synthetic failure'});return;}let output={input:r.input};if(r.command==='get_screenshot')output=[{filepath:${JSON.stringify(shot)}}];if(r.command==='get_window_state')output={window:{id:1},ax_tree:{id:'native:root',role:'window',children:[{id:'native:a',role:'button',name:'go',children:[]}]},screenshots:[{filepath:${JSON.stringify(shot)}}],ax_tree_source:'at_spi'};if(r.command==='list_apps'||r.command==='list_windows')output=[{id:'fixture'}];send({id:r.id,ok:true,output});});`;
      await writeFile(binary, program, { mode: 0o700 });
      process.env.OAI_SKY_LINUX_BIN = binary;
      async function run(modules: any, command: any) {
        await writeFile(log, "");
        const events: any[] = [],
          ids = new ElementIds();
        const options: any = {
          target: "linux",
          post_action_sleep_ms: 0,
          action_settler: {
            async wait() {
              events.push("wait");
            },
            defer() {
              events.push("defer");
            },
          },
          element_ids: {
            assign(...args: any[]) {
              events.push(["assign", args[2]]);
              return (ids.assign as any)(...args);
            },
            resolve(input: any) {
              events.push(["resolve", input.element_id]);
              return ids.resolve(input);
            },
          },
        };
        const outputs: any[] = [];
        outputs.push(
          await outcome(() =>
            modules.get_window_state.create_get_window_state(options)({
              window: { id: 1 },
              query: " filtered ",
            }),
          ),
        );
        for (const name of names.filter(
          (n) => n !== "drag_handle" && n !== "get_window_state",
        )) {
          const invoke = modules[name]["create_" + name](options);
          outputs.push(
            await outcome(() =>
              invoke({
                window: { id: 1 },
                element_id: fail ? "native:a" : "1",
                key: "a",
                path: [
                  { x: 1, y: 2 },
                  { x: 2, y: 3 },
                ],
                text: "text",
                x: 1,
                y: 2,
              }),
            ),
          );
        }
        const handle = modules.drag_handle.create_drag_handle(options)();
        for (const [name, args] of [
          ["move_to", { x: 1, y: 2 }],
          ["end", undefined],
          ["start", { x: 1, y: 2, fail: true }],
          ["start", { x: 1, y: 2 }],
          ["start", { x: 1, y: 2 }],
          ["move_to", { x: 2, y: 3 }],
          ["end", undefined],
          ["end", undefined],
        ] as any[])
          outputs.push(await outcome(() => handle[name](args)));
        await command("quit", { options });
        const requests = (await readFile(log, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        return {
          events,
          requests,
          outputs: JSON.stringify(outputs),
          treeText: outputs[0].value?.ax_tree.to_string(),
        };
      }
      assert.deepEqual(
        await run(restored, restoredCommand),
        await run(original, originalCommand),
      );
    }
  } finally {
    if (prior === undefined) delete process.env.OAI_SKY_LINUX_BIN;
    else process.env.OAI_SKY_LINUX_BIN = prior;
    await rm(directory, { recursive: true, force: true });
  }
});
test("Linux screenshot loader preserves byte slices, MIME and read failures", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sky-shot-")),
    file = path.join(directory, "fixture");
  await writeFile(file, Buffer.from([9, 8, 7]));
  try {
    for (const shots of [
      [],
      [{ filepath: file }],
      [{ filepath: file }, { filepath: path.join(directory, "missing") }],
    ])
      assert.deepEqual(
        await outcome(() => restored.get_screenshot.load_screenshots(shots)),
        await outcome(() => original.get_screenshot.load_screenshots(shots)),
      );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
