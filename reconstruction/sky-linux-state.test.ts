import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { ElementIds } from "../packages/sky/src/targets/linux/element_ids";
import { ActionSettler } from "../packages/sky/src/targets/linux/action_settler";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/targets/linux/`;
const OriginalIds = (await import(pathToFileURL(base + "element_ids.js").href))
  .ElementIds;
const OriginalSettler = (
  await import(pathToFileURL(base + "action_settler.js").href)
).ActionSettler;
function outcome(fn: () => any) {
  try {
    return { value: fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
test("Linux IDs preserve per-window stability, filtered retention and stale reference rejection", () => {
  function run(Type: any) {
    const ids = new Type(),
      trace: any[] = [];
    const tree = (names: string[]) => ({
      id: "root",
      role: "window",
      children: names.map((id) => ({ id, role: "button", children: [] })),
    });
    const assign = (window: number, names: string[], filtered: boolean) => {
      const value = tree(names);
      ids.assign(value, { id: window }, filtered);
      trace.push(structuredClone(value));
    };
    const resolve = (window: number | undefined, id: any) => {
      const input = {
        window: window === undefined ? undefined : { id: window },
        element_id: id,
        extra: 7,
      };
      const result = outcome(() => ids.resolve(input));
      trace.push({ result, same: "value" in result && result.value === input });
    };
    assign(1, ["native:a", "native:b", "native:a"], false);
    for (const id of [
      "0",
      "1",
      "2",
      "3",
      "native:a",
      "-1",
      "1.5",
      "01",
      "",
      undefined,
    ])
      resolve(1, id);
    assign(2, ["native:a"], false);
    resolve(2, "1");
    resolve(2, "4");
    resolve(undefined, "1");
    assign(1, ["native:c"], true);
    resolve(1, "1");
    resolve(1, "2");
    assign(1, ["native:c"], false);
    resolve(1, "1");
    resolve(1, "2");
    assign(1, ["native:a", "native:c"], false);
    resolve(1, "1");
    return trace;
  }
  assert.deepEqual(run(ElementIds), run(OriginalIds));
});
test("Linux settling preserves options, non-shortening deadlines and extensions during wait", async () => {
  for (const delay of [undefined, 0, -10, 15, NaN]) {
    async function run(Type: any) {
      let now = 100;
      const sleeps: number[] = [];
      let calls = 0;
      const options = { post_action_sleep_ms: delay };
      let settler: any;
      settler = new Type(options, {
        now: () => now,
        sleep: async (ms: number) => {
          sleeps.push(ms);
          now += ms;
          if (++calls === 1) {
            options.post_action_sleep_ms = 7;
            settler.defer();
          }
        },
      });
      await settler.wait();
      settler.defer();
      now += 2;
      options.post_action_sleep_ms = 0;
      settler.defer();
      await settler.wait();
      options.post_action_sleep_ms = 3;
      settler.defer();
      await settler.wait();
      return { now, sleeps };
    }
    assert.deepEqual(await run(ActionSettler), await run(OriginalSettler));
  }
});
test("Linux settling propagates failed sleep and permits retry without discarding deadline", async () => {
  async function run(Type: any) {
    let now = 0,
      fail = true;
    const events: any[] = [];
    const settler = new Type(
      {},
      {
        now: () => now,
        sleep: async (ms: number) => {
          events.push(ms);
          if (fail) {
            fail = false;
            throw Error("interrupted");
          }
          now += ms;
        },
      },
    );
    settler.defer();
    try {
      await settler.wait();
    } catch (e: any) {
      events.push(e.message);
    }
    await settler.wait();
    return events;
  }
  assert.deepEqual(await run(ActionSettler), await run(OriginalSettler));
});
