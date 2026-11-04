import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createKernelScopeRegistry,
  createKernelOutputWriter,
} from "../packages/browser-extension/src/kernel_scope";

test("kernel scope registry matches original duplicate, abort, dispose and reuse behavior", () => {
  for (const aborted of [false, true]) {
    const results = [];
    for (const restored of [false, true]) {
      const source = extensionBindings(["Hg", "Le"], { Dr: new Map() });
      const registry = restored
        ? createKernelScopeRegistry()
        : { begin: source.Hg, get: source.Le };
      const trace: any[] = [];
      const attempt = (fn: Function) => {
        try {
          fn();
        } catch (error: any) {
          trace.push(["error", error?.message ?? error]);
        }
      };
      const abort = new AbortController();
      if (aborted) abort.abort("caller-cancelled");
      attempt(() => registry.get("a"));
      const client = {},
        chatApi = {},
        onPdfUploaded = () => {};
      const first = registry.begin(
        "a",
        client,
        abort.signal,
        chatApi,
        onPdfUploaded,
      );
      attempt(() => registry.begin("a", {}, new AbortController().signal, {}));
      attempt(() => {
        const scope = registry.get("a");
        assert.equal(scope.client, client);
        assert.equal(scope.chatApi, chatApi);
        assert.equal(scope.onPdfUploaded, onPdfUploaded);
        assert.equal(scope.content, first.content);
        scope.content.push({ type: "text", text: "output" });
        scope.disposalSignal.addEventListener("abort", () => {
          trace.push(["dispose", scope.disposalSignal.reason.message]);
          attempt(() => registry.begin("a", {}, abort.signal, {}));
          assert.equal(registry.get("a"), scope);
        });
      });
      first.dispose();
      first.dispose();
      attempt(() => registry.get("a"));
      const second = registry.begin(
        "a",
        client,
        new AbortController().signal,
        chatApi,
      );
      first.dispose();
      assert.equal(registry.get("a").content, second.content);
      second.dispose();
      const otherAbort = new AbortController();
      const other = registry.begin("b", client, otherAbort.signal, chatApi);
      otherAbort.abort(new Error("later-cancel"));
      attempt(() => registry.get("b"));
      other.dispose();
      results.push({ trace, content: first.content });
    }
    assert.deepEqual(results[1], results[0]);
  }
});

test("kernel output methods match source serialization and scope lookup ordering", () => {
  const traces = [];
  for (const restored of [false, true]) {
    const content: any[] = [],
      trace: any[] = [];
    let active = true;
    const get = (id: string) => {
      trace.push(["lookup", id]);
      if (!active) throw Error("inactive");
      return { content };
    };
    const Source = extensionBindings(["Ds"], { Le: get }).Ds;
    const writer = restored
      ? createKernelOutputWriter("scope", get)
      : new Source("scope");
    const cycle: any = {};
    cycle.self = cycle;
    for (const value of [
      "text",
      { a: 1 },
      undefined,
      Symbol("s"),
      () => {},
      1n,
      cycle,
      {
        toJSON() {
          trace.push(["serialize"]);
          return 3;
        },
      },
    ]) {
      try {
        writer.displayValue(value);
      } catch (error: any) {
        trace.push(["error", error.name]);
      }
    }
    writer.displayImage("fixture-base64");
    active = false;
    for (const value of [
      {
        toJSON() {
          trace.push(["inactive-serialize"]);
          return 4;
        },
      },
      1n,
    ]) {
      try {
        writer.displayValue(value);
      } catch (error: any) {
        trace.push(["inactive-error", error.name]);
      }
    }
    traces.push({ content, trace });
  }
  assert.deepEqual(traces[1], traces[0]);
});
