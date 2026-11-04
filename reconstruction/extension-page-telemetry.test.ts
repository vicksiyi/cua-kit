import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import {
  createPageTelemetryInitializer,
  normalizeExtensionBuildChannel,
} from "../packages/browser-extension/src/page_telemetry";

const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = await readFile(`${root}/chunks/sentry-CVTEo7Wt.js`, "utf8");
assert.equal(
  createHash("sha256").update(source).digest("hex"),
  "b46098f854176ef7be734deb6f8eb75ddb3e8297c2f295f46e24e534fd9826ae",
);
const ast: any = parse(source, { ecmaVersion: "latest", sourceType: "module" });
const binding = (name: string) => {
  const node = ast.body.find(
    (n: any) => n.type === "FunctionDeclaration" && n.id.name === name,
  );
  return source.slice(node.start, node.end);
};
const originalChannel = new Function("sc", `${binding("oc")};return oc;`)(
  "prod",
);

test("page telemetry matches installed initialization, fallbacks and swallowed errors", async () => {
  for (const mode of [
    "manifest",
    "fetch",
    "manifest-throws",
    "fetch-throws",
    "json-throws",
    "sdk-throws",
  ]) {
    const run = async (original: boolean) => {
      const events: unknown[] = [];
      const runtime = {
        getManifest:
          mode === "fetch" || mode === "fetch-throws" || mode === "json-throws"
            ? undefined
            : () => {
                events.push("manifest");
                if (mode === "manifest-throws")
                  throw Error("manifest unavailable");
                return { version: "1.2.3" };
              },
        getURL(path: string) {
          events.push(["url", path]);
          return `chrome-extension://fixture/${path}`;
        },
      };
      const fetch = async (url: string) => {
        events.push(["fetch", url]);
        if (mode === "fetch-throws") throw Error("fetch failed");
        return {
          async json() {
            events.push("json");
            if (mode === "json-throws") throw Error("invalid json");
            return { version: "1.2.3" };
          },
        };
      };
      const initialize = (options: any) => {
        // Destination is deliberately deployment-owned, so compare all other
        // source options. No original SDK or external transport is executed.
        const { dsn, ...rest } = options;
        assert.equal(typeof dsn, "string");
        if (!original) assert.equal(dsn, "https://public@example.invalid/1");
        events.push(["init", rest]);
        if (mode === "sdk-throws") throw Error("SDK unavailable");
      };
      const start = original
        ? new Function(
            "chrome",
            "fetch",
            "rc",
            "oc",
            `${binding("ic")};return ic;`,
          )({ runtime }, fetch, initialize, originalChannel)
        : createPageTelemetryInitializer(
            { runtime, fetch },
            { dsn: "https://public@example.invalid/1" },
            initialize,
          );
      await start("microphone-permission");
      return events;
    };
    assert.deepEqual(await run(false), await run(true), mode);
  }
});

test("build channels match installed normalization and rejection", () => {
  for (const value of [
    undefined,
    null,
    1,
    {},
    "dev",
    "internal",
    "prod",
    "",
    "staging",
  ]) {
    const result = (fn: (v: unknown) => unknown) => {
      try {
        return { value: fn(value) };
      } catch (error) {
        return { error: String(error) };
      }
    };
    assert.deepEqual(
      result(normalizeExtensionBuildChannel),
      result(originalChannel),
    );
  }
});
