import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createActionCallout,
  getActionBadge,
  normalizeActionBadgeLabel,
} from "../packages/browser-extension/src/action_callout";
const names = [
  "Rf",
  "ok",
  "ck",
  "uk",
  "dk",
  "hk",
  "fk",
  "dn",
  "hn",
  "pk",
  "mk",
  "gk",
  "Pf",
  "xf",
  "No",
];
test("action badges match original whitespace, truncation, initials and Unicode hashing", () => {
  const original = extensionBindings(names, {
    Of: Promise.resolve(),
    chrome: {},
  });
  for (const input of [
    undefined,
    null,
    4,
    "",
    "  \n ",
    " alpha  beta\tcharlie ",
    "abcdefghijklmnopqrstuvwxyz next",
    "中文标签测试",
    "😀🚀😀xyz",
    "ß",
    "a-b c_d 5",
    "a".repeat(23) + "😀",
  ]) {
    assert.equal(normalizeActionBadgeLabel(input), original.uk(input));
    assert.deepEqual(getActionBadge(input), original.dk(input));
  }
});
test("action callout preserves queued operations, seen versions and failure recovery", async () => {
  for (const mode of [
    "normal",
    "seen",
    "future",
    "string-version",
    "read-fails",
    "title-fails",
    "badge-fails",
    "write-fails",
    "manifest-fallback",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [];
      let seen: unknown =
        mode === "seen"
          ? 1
          : mode === "future"
            ? 2
            : mode === "string-version"
              ? "1"
              : undefined;
      let failed = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;
      async function call(kind: string, value: unknown) {
        trace.push([kind, value]);
        if (first) {
          first = false;
          await gate;
        }
        if (
          !failed &&
          ((mode === "read-fails" && kind === "get") ||
            (mode === "title-fails" && kind === "title") ||
            (mode === "badge-fails" && kind === "text") ||
            (mode === "write-fails" && kind === "set"))
        ) {
          failed = true;
          throw Error(mode);
        }
      }
      const chrome: any = {
        action: {
          setTitle: (v: unknown) => call("title", v),
          setBadgeBackgroundColor: (v: unknown) => call("color", v),
          setBadgeText: (v: unknown) => call("text", v),
        },
        runtime: {
          getManifest() {
            trace.push("manifest");
            return mode === "manifest-fallback"
              ? { name: "Extension" }
              : { name: "Extension", action: { default_title: "Default" } };
          },
        },
        storage: {
          local: {
            async get(key: string) {
              await call("get", key);
              return { [key]: seen };
            },
            async set(data: any) {
              await call("set", data);
              seen = data.lastSeenExtensionActionCalloutVersion;
            },
          },
        },
      };
      const original = upstream
        ? extensionBindings(names, { Of: Promise.resolve(), chrome })
        : undefined;
      const restored = upstream ? undefined : createActionCallout(chrome);
      const api = upstream
        ? { show: original.mk, clear: original.gk, setBadge: original.pk }
        : restored!;
      const outcomes: any[] = [];
      const record = (p: Promise<unknown>) =>
        p.then(
          () => outcomes.push("ok"),
          (e) => outcomes.push(e.message),
        );
      const pending = [
        record(api.show()),
        record(api.setBadge("Dev Build")),
        record(api.clear("Work Profile")),
        record(api.show()),
        record(api.clear()),
        record(api.setBadge(null)),
      ];
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(
        trace.length,
        1,
        "later operations must wait behind initial read",
      );
      release();
      await Promise.all(pending);
      outputs.push({ trace, outcomes, seen });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
