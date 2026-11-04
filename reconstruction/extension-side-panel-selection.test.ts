import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { runInNewContext } from "node:vm";
import {
  observeSidePanelSelection,
  removeSidePanelSelectionObserver,
} from "../packages/browser-extension/src/side_panel_selection";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = await readFile(
  `${root}/chunks/codex-work-sidepanel-Cy6MdlEo.js`,
  "utf8",
);
const hash = createHash("sha256").update(source).digest("hex");
const body: any = (
  parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any
).body;
const original = (name: string) => {
  const node = body.find(
    (n: any) => n.type === "FunctionDeclaration" && n.id.name === name,
  );
  return source.slice(node.start, node.end);
};
function events() {
  const listeners = new Map<string, Set<Function>>();
  return {
    addEventListener(name: string, fn: Function) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeEventListener(name: string, fn: Function) {
      listeners.get(name)?.delete(fn);
    },
    emit(name: string, value?: unknown) {
      for (const fn of [...(listeners.get(name) ?? [])]) fn(value);
    },
    count() {
      return [...listeners.values()].reduce((n, set) => n + set.size, 0);
    },
  };
}
test("serialized sidepanel selection observer matches source generations, recovery and cleanup", () => {
  assert.equal(
    hash,
    "3c34166181949c77a2123425bb7dc95d913af693b319c5559cc02416e965ad7b",
  );
  for (const mode of ["none", "event", "polling"])
    for (const broken of [false, true]) {
      function scenario(restored: boolean) {
        let selection = "",
          focused = true,
          nextTimer = 0;
        const trace: any[] = [],
          timers = new Map<number, Function>();
        const frame = events(),
          doc = {
            ...events(),
            hasFocus: () => focused,
            querySelectorAll: () => [{ contentDocument: frame }],
          };
        const win = {
          ...events(),
          getSelection: () => ({ toString: () => selection }),
        };
        const context: any = {
          location: { href: "https://fixture.invalid/" },
          document: doc,
          window: win,
          HTMLIFrameElement: class {},
          chrome: {
            runtime: {
              sendMessage: (message: unknown) => {
                trace.push(message);
                if (broken) throw Error("disconnected");
                return Promise.resolve();
              },
            },
          },
          setTimeout: (fn: Function) => {
            timers.set(++nextTimer, fn);
            return nextTimer;
          },
          clearTimeout: (id: number) => timers.delete(id),
          __name: (fn: Function) => fn,
        };
        const api = runInNewContext(
          `({observe:(${restored ? observeSidePanelSelection.toString() : original("Ee")}),remove:(${restored ? removeSidePanelSelectionObserver.toString() : original("et")})})`,
          context,
        );
        const read = (id = "a", recovery?: unknown) =>
          trace.push(api.observe(context.location.href, id, mode, recovery));
        trace.push(api.observe("https://different.invalid/", "a", mode));
        read();
        selection = "hello";
        read();
        read();
        selection = "";
        focused = false;
        read();
        focused = true;
        read();
        const snapshot = api.observe(context.location.href, "a", mode);
        read("a", {
          captureGeneration: snapshot.captureGeneration + 1,
          selectedText: "stale",
        });
        read("a", {
          captureGeneration: snapshot.captureGeneration,
          selectedText: "recovered",
        });
        selection = "changed";
        doc.emit(mode === "none" ? "selectionchange" : "keyup");
        for (const [id, fn] of [...timers]) {
          timers.delete(id);
          fn();
        }
        read("a", { captureGeneration: 0, selectedText: "stale after event" });
        selection = "x".repeat(80001);
        read("b");
        trace.push({
          doc: doc.count(),
          frame: frame.count(),
          window: win.count(),
        });
        api.remove("a");
        trace.push(Boolean(context.__codexSideChatSelectionObserver));
        api.remove("b");
        trace.push({
          doc: doc.count(),
          frame: frame.count(),
          window: win.count(),
          timers: timers.size,
          observer: Boolean(context.__codexSideChatSelectionObserver),
        });
        return JSON.parse(JSON.stringify(trace));
      }
      assert.deepEqual(
        scenario(true),
        scenario(false),
        `${mode}, broken=${broken}`,
      );
    }
});
