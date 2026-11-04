import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WindowsComputerUseClientBase } from "../packages/sky/src/targets/windows/internal/computer_use_client_base";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const Original = (
  await import(
    pathToFileURL(
      `${root}/sky/dist/project/cua/sky_js/src/targets/windows/internal/computer_use_client_base.js`,
    ).href
  )
).WindowsComputerUseClientBase;
const window = { app: "fixture.exe", id: "2", title: "Fixture" };
async function outcome(run: () => unknown) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message, name: (e as Error).name };
  }
}
test("Windows base public operations match original request normalization and validation", async () => {
  const globals = globalThis as any,
    previous = globals.nodeRepl;
  globals.nodeRepl = {
    requestMeta: { session_id: "fixture", turn_id: "turn" },
  };
  try {
    const cases: [string, any][] = [
      ["activate_window", { window }],
      ["click", { window, x: 2.6, y: -2.6 }],
      ["click", { window, element: "0x10", click_count: 1.6 }],
      ["click", { window, elementIndex: 3, element_index: 4 }],
      [
        "scroll",
        { window, x: 1, y: 2, scrollX: 3.5, scrollY: -1.5, screenshotId: "s" },
      ],
      ["drag", { window, from_x: 1, from_y: 2, to_x: 3, to_y: 4 }],
      ["press_key", { window, key: " Ctrl + + A " }],
      ["type_text", { window, text: "" }],
      ["launch_app", { app: " fixture.exe " }],
      ["get_window", { id: "0x10" }],
      [
        "perform_secondary_action",
        { window, element_index: "3", action: " invoke " },
      ],
      ["set_value", { window, element_index: 0, value: "text" }],
    ];
    cases.push(
      ...[
        null,
        {},
        [],
        { app: "", id: 0 },
        { app: "x", id: -1 },
        { app: "x", id: "bad" },
      ].map((w) => ["activate_window", { window: w }] as [string, any]),
    );
    cases.push(
      ...[NaN, Infinity, "1", null].map(
        (x) => ["click", { window, x, y: 0 }] as [string, any],
      ),
    );
    cases.push(
      ["click", { window, element_index: -1 }],
      ["click", { window, x: 0, y: 0, click_count: 0 }],
      ["press_key", { window, key: " + " }],
      ["press_key", { window: null, key: " + " }],
      ["type_text", { window, text: 3 }],
      ["launch_app", null],
      ["get_window", []],
      ["get_window", { id: -1 }],
      ["set_value", { window, value: null }],
      ["perform_secondary_action", { window, action: "" }],
    );
    const run = async (C: any) => {
      const requests: any[] = [];
      const client = new C({
        transport: {
          close: async () => {},
          request: async (...args: any[]) => {
            requests.push(args);
            return args[0] === "get_window" ? { app: "fixture", id: 2 } : null;
          },
        },
      });
      const results = [];
      for (const [name, input] of cases)
        results.push(await outcome(() => client[name](input)));
      await client.close();
      results.push(await outcome(() => client.list_windows()));
      return { requests, results };
    };
    const expected = await run(Original),
      actual = await run(WindowsComputerUseClientBase);
    assert.deepEqual(actual, expected);
    assert.deepEqual(actual.requests[1][1], {
      window: { app: "fixture.exe", id: 2, title: "Fixture" },
      x: 3,
      y: -3,
      click_count: 1,
      mouse_button: "left",
    });
    assert.equal(actual.requests[2][0], "click_element");
    assert.equal(actual.requests[2][1].element_index, 16);
  } finally {
    globals.nodeRepl = previous;
  }
});
test("Windows state/list parsing and screenshot emission match original for valid and malformed responses", async () => {
  const globals = globalThis as any,
    previous = globals.nodeRepl,
    oldCodex = globals.codex;
  try {
    const stateCases = [
      null,
      {},
      [],
      { screenshots: [] },
      {
        screenshots: [
          { url: "data:image/png;base64,AA==", width: 2, id: "", zIndex: NaN },
        ],
        accessibility: {
          tree: "root",
          selected_text: "",
          selected_elements: ["a"],
        },
        window: { id: "3" },
      },
      { screenshots: [null] },
      { screenshots: [{ url: "" }] },
      { screenshots: [], accessibility: [] },
      { screenshots: [], accessibility: { tree: 2 } },
      { screenshots: [], accessibility: { tree: "x", selected_elements: [1] } },
      {
        screenshots: [],
        accessibility: { tree: "x", focused_element: 2, document_text: "doc" },
      },
    ];
    const run = async (C: any) => {
      const images: any[] = [],
        results: any[] = [];
      let reply: any;
      globals.nodeRepl = {
        emitImage: async (...args: any[]) => images.push(["node", ...args]),
      };
      globals.codex = {
        emitImage: async (...args: any[]) => images.push(["codex", ...args]),
      };
      const client = new C({
        transport: { close: async () => {}, request: async () => reply },
      });
      for (const raw of stateCases) {
        reply = raw;
        results.push(await outcome(() => client.get_window_state({ window })));
        results.push(
          await outcome(() =>
            client.get_window_state({
              window,
              include_screenshot: false,
              include_text: true,
            }),
          ),
        );
      }
      reply = { screenshots: [{ url: "fixture-url" }] };
      delete globals.nodeRepl.emitImage;
      results.push(await outcome(() => client.get_window_state({ window })));
      results.push(
        await outcome(() =>
          client.get_window_state({
            window,
            include_screenshot: false,
            include_text: false,
          }),
        ),
      );
      for (const raw of [
        null,
        {},
        [
          null,
          {
            id: "app",
            windows: [{ id: "1" }, { id: -1 }],
            isRunning: false,
            useCount: 2,
            displayName: "",
          },
          { id: " " },
          { id: 1 },
        ],
        [{ app: "x", id: "0x10" }, [], { app: "", id: 0 }],
      ]) {
        reply = raw;
        results.push(await outcome(() => client.list_apps()));
        results.push(await outcome(() => client.list_windows()));
        results.push(await outcome(() => client.get_window({ id: 0 })));
      }
      await client.close();
      return { results, images };
    };
    const expected = await run(Original),
      actual = await run(WindowsComputerUseClientBase);
    assert.deepEqual(actual, expected);
    assert.ok(actual.images.some((x: any) => x[0] === "codex"));
    assert.ok(actual.images.some((x: any) => x[0] === "node"));
  } finally {
    globals.nodeRepl = previous;
    globals.codex = oldCodex;
  }
});
test("Windows base turn-end deduplication, suspended timeout and audio lifecycle match original", async () => {
  const globals = globalThis as any,
    previous = globals.nodeRepl,
    audio = process.env.SKY_ENABLE_AUDIO;
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-windows-base-"));
  const file = path.join(dir, "fixture.wav");
  await writeFile(file, Buffer.from([1, 2, 3]));
  try {
    const run = async (C: any) => {
      const trace: any[] = [];
      let handler: any, release: (() => void) | undefined;
      process.env.SKY_ENABLE_AUDIO = "1";
      globals.nodeRepl = {
        requestMeta: { session_id: "s", turn_id: "t" },
        addTurnEndedHandler(value: any) {
          handler = value;
          trace.push(["register", value.timeoutMs]);
          return () => trace.push(["remove"]);
        },
        withSuspendedTimeout: async (fn: any) => {
          trace.push(["suspend"]);
          return fn();
        },
      };
      const client = new C({
        transport: {
          close: async () => {
            trace.push(["close"]);
          },
          request: async (method: string, params: any, options: any) => {
            trace.push([method, params, options]);
            if (method === "end_turn")
              await new Promise<void>((r) => {
                release = r;
              });
            return method === "stop_audio_recording"
              ? { filepath: file }
              : null;
          },
        },
      });
      await client.activate_window({ window });
      await handler.run({ session_id: "s", turn_id: "wrong" });
      const end = handler.run({ session_id: "s", turn_id: "t" });
      await handler.run({ session_id: "s", turn_id: "t" });
      release!();
      await end;
      await handler.run({ session_id: "s", turn_id: "t" });
      await client.start_audio_recording({ max_duration_ms: 500 });
      const recording = await client.stop_audio_recording();
      assert.deepEqual([...recording.bytes], [1, 2, 3]);
      assert.equal(recording.data_url, "data:audio/wav;base64,AQID");
      await client.close();
      await client.close();
      await handler.run({ session_id: "s", turn_id: "t" });
      const closed = await outcome(() => client.list_apps());
      process.env.SKY_ENABLE_AUDIO = "true";
      const noAudio = new C({
        transport: { close: async () => {}, request: async () => null },
      });
      assert.equal("start_audio_recording" in noAudio, false);
      assert.equal("stop_audio_recording" in noAudio, false);
      await noAudio.close();
      return { trace, closed };
    };
    const expected = await run(Original),
      actual = await run(WindowsComputerUseClientBase);
    assert.deepEqual(actual, expected);
    assert.equal(actual.trace.filter((x) => x[0] === "end_turn").length, 1);
  } finally {
    globals.nodeRepl = previous;
    if (audio === undefined) delete process.env.SKY_ENABLE_AUDIO;
    else process.env.SKY_ENABLE_AUDIO = audio;
    await rm(dir, { recursive: true, force: true });
  }
});

test("Windows turn-end failures remain retryable and old completion preserves a newer active turn", async () => {
  const globals = globalThis as any,
    previous = globals.nodeRepl;
  try {
    const run = async (C: any) => {
      let handler: any,
        fail = true,
        finish: (() => void) | undefined;
      const requests: any[] = [];
      globals.nodeRepl = {
        requestMeta: { session_id: "s", turn_id: "old" },
        addTurnEndedHandler(value: any) {
          handler = value;
          return () => {};
        },
      };
      const client = new C({
        transport: {
          close: async () => {},
          request: async (method: string, params: any, options: any) => {
            requests.push([method, options]);
            if (method === "end_turn") {
              if (fail) {
                fail = false;
                throw new Error("fixture end failure");
              }
              await new Promise<void>((resolve) => {
                finish = resolve;
              });
            }
            return [];
          },
        },
      });
      await client.list_windows();
      await assert.rejects(
        handler.run({ session_id: "s", turn_id: "old" }),
        /fixture end failure/,
      );
      const oldEnd = handler.run({ session_id: "s", turn_id: "old" });
      globals.nodeRepl.requestMeta = { session_id: "s", turn_id: "new" };
      await client.list_windows();
      finish!();
      await oldEnd;
      const newEnd = handler.run({ session_id: "s", turn_id: "new" });
      finish!();
      await newEnd;
      await client.close();
      return requests;
    };
    const expected = await run(Original),
      actual = await run(WindowsComputerUseClientBase);
    assert.deepEqual(actual, expected);
    assert.deepEqual(
      actual
        .filter((x) => x[0] === "end_turn")
        .map((x) => x[1].codexTurnMetadata.turn_id),
      ["old", "old", "new"],
    );
  } finally {
    globals.nodeRepl = previous;
  }
});
