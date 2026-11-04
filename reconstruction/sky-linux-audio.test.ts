import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cli } from "../packages/sky/src/core/cli";
import { create_audio_recording } from "../packages/sky/src/targets/linux/audio_recording";
import { create_client } from "../packages/sky/src/targets/linux/create_client";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/`;
const originalAudio = (
  await import(pathToFileURL(base + "targets/linux/audio_recording.js").href)
).create_audio_recording;
const originalFactory = (
  await import(pathToFileURL(base + "targets/linux/create_client.js").href)
).create_client;
const originalCli = (await import(pathToFileURL(base + "core/cli.js").href))
  .cli;
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { name: e.name, error: e.message };
  }
}
test("CLI preserves piped input, environment, output trimming and nonzero error policy with real subprocesses", async () => {
  for (const check of [true, false])
    for (const code of [0, 3]) {
      const args = [
        "-e",
        `let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{console.log(s+process.env.CUA_FIXTURE_VALUE+'  ');setTimeout(()=>{console.error('error  ');process.exit(${code})},20)})`,
      ];
      const options = {
        check,
        input: "input:",
        quiet: true,
        stdio: "pipe" as const,
        env: { CUA_FIXTURE_VALUE: "fixture" },
      };
      assert.deepEqual(
        await outcome(() => cli(process.execPath, args, options)),
        await outcome(() => originalCli(process.execPath, args, options)),
      );
    }
  assert.deepEqual(
    await outcome(() => cli("/nonexistent/cua-cli", [], { quiet: true })),
    await outcome(() =>
      originalCli("/nonexistent/cua-cli", [], { quiet: true }),
    ),
  );
});
test("Linux audio matches original startup state, synthetic ffmpeg handshake, stop and failure handling", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sky-audio-fixture-")),
    log = path.join(directory, "log");
  const keys = ["PATH", "TMPDIR", "CUA_AUDIO_MODE"],
    before = keys.map((k) => process.env[k]);
  const prefix = `#!${process.execPath}\nconst fs=require('node:fs');const mode=process.env.CUA_AUDIO_MODE;`;
  await writeFile(
    path.join(directory, "pactl"),
    prefix +
      `fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(['pactl',process.argv.slice(2)])+'\\n');if(mode==='pactl-error')process.exit(3);console.log(mode==='empty'?'':'fixture-sink');`,
    { mode: 0o700 },
  );
  await writeFile(
    path.join(directory, "ffmpeg"),
    prefix +
      `const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(['ffmpeg',args.slice(0,-1)])+'\\n');if(mode==='early'){process.stderr.write('early');process.exit(2);}const file=args.at(-1);fs.writeFileSync(file,Buffer.from([1,2,3,4]));setTimeout(()=>process.stderr.write('frame=1\\nprogress=continue\\n'),15);process.stdin.on('data',chunk=>{fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(['stdin',String(chunk)])+'\\n');process.exit(mode==='stop-error'?4:0);});`,
    { mode: 0o700 },
  );
  try {
    process.env.PATH = directory + path.delimiter + (before[0] ?? "");
    process.env.TMPDIR = directory;
    for (const mode of [
      "normal",
      "early",
      "stop-error",
      "empty",
      "pactl-error",
    ]) {
      async function run(factory: any) {
        process.env.CUA_AUDIO_MODE = mode;
        await writeFile(log, "");
        const waits: any[] = [];
        const api = factory({
          action_settler: {
            async wait() {
              waits.push("wait");
            },
          },
        });
        const results: any[] = [];
        results.push(await outcome(() => api.stop_audio_recording()));
        for (const duration of [99, 300001, 1.5])
          results.push(
            await outcome(() =>
              api.start_audio_recording({ max_duration_ms: duration }),
            ),
          );
        const starting = outcome(() =>
          api.start_audio_recording({ max_duration_ms: 100 }),
        );
        results.push(await outcome(() => api.start_audio_recording()));
        results.push(await starting);
        if (mode === "normal" || mode === "stop-error")
          results.push(await outcome(() => api.start_audio_recording()));
        const stopped = await outcome(() => api.stop_audio_recording());
        if ("value" in stopped && stopped.value) {
          assert.ok(stopped.value.filepath.startsWith(directory));
          stopped.value.filepath = "<file>";
        }
        results.push(stopped);
        results.push(await outcome(() => api.stop_audio_recording()));
        return { results, waits, log: await readFile(log, "utf8") };
      }
      assert.deepEqual(
        await run(create_audio_recording),
        await run(originalAudio),
        mode,
      );
    }
  } finally {
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
    await rm(directory, { recursive: true, force: true });
  }
});
test("Linux factory preserves complete method order and literal audio enable flag", () => {
  const prior = process.env.SKY_ENABLE_AUDIO;
  try {
    for (const value of [undefined, "0", "1", "true"]) {
      if (value === undefined) delete process.env.SKY_ENABLE_AUDIO;
      else process.env.SKY_ENABLE_AUDIO = value;
      const options = { target: "linux" as const, post_action_sleep_ms: 0 };
      const a = create_client(options),
        b = originalFactory(options);
      assert.deepEqual(Object.keys(a), Object.keys(b));
      assert.equal(a.target, b.target);
      assert.notEqual(
        a.get_window_state,
        create_client(options).get_window_state,
      );
    }
  } finally {
    if (prior === undefined) delete process.env.SKY_ENABLE_AUDIO;
    else process.env.SKY_ENABLE_AUDIO = prior;
  }
});
