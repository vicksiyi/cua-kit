import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { startMediaPermissionPage } from "../packages/browser-extension/src/media_permission_page";
import {
  browserFamilies,
  identifyBrowserFamily,
} from "../packages/browser-extension/src/browser_platform";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = await readFile(
  `${root}/chunks/microphone-permission-CfXjp0JX.js`,
  "utf8",
);
assert.equal(
  createHash("sha256").update(source).digest("hex"),
  "a0ecddd54e3c7643f3304b51440381a4b1c5ccc43a845ab3b1486403b1d02616",
);
const ast: any = parse(source, { ecmaVersion: "latest", sourceType: "module" });
const start = ast.body.find(
  (node: any) => node.type === "FunctionDeclaration" && node.id.name === "d",
).start;
// Execute the inspected theme/startup/request tail only; do not initialize bundled
// React or real Sentry, and never touch real navigator.mediaDevices in this test.
const original = new Function(
  "window",
  "document",
  "navigator",
  "I",
  "O",
  "M",
  "b",
  source.slice(start),
);
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
test("permission page matches original constraints, themes, failure UI, retry and immediate track stop", async () => {
  for (const search of [
    "",
    "?camera=1",
    "?camera=1&microphone=0",
    "?microphone=0",
    "?camera=0&microphone=1",
  ])
    for (const mode of [
      "success",
      "deny-retry",
      "stop-throws",
      "legacy-theme",
      "missing-theme",
      "throws-theme",
      "missing-root",
    ]) {
      async function scenario(restored: boolean) {
        const trace: any[] = [];
        let click: Function | undefined, change: Function | undefined;
        const ids = [
          "allow-microphone",
          "permission-help",
          "status",
          "browser-name",
          "permission-title",
          "permission-description",
        ];
        const nodes: any = Object.fromEntries(
          ids.map((id) => [
            id,
            {
              id,
              textContent:
                id === "allow-microphone"
                  ? "Allow microphone access"
                  : id === "permission-title"
                    ? "Allow microphone access"
                    : "",
              hidden: false,
              disabled: false,
              addEventListener(name: string, fn: Function) {
                trace.push(["listener", name]);
                click = fn;
              },
              replaceChildren(...children: any[]) {
                trace.push([
                  "children",
                  ...children.map((child) =>
                    typeof child === "string" ? child : { id: child.id },
                  ),
                ]);
              },
            },
          ]),
        );
        const document: any = {
          title: "ChatGPT microphone access",
          documentElement: {
            style: {},
            setAttribute(key: string, value: string) {
              trace.push(["attribute", key, value]);
            },
          },
          querySelector(selector: string) {
            return mode === "missing-root" && selector === "#status"
              ? null
              : nodes[selector.slice(1)];
          },
        };
        const media: any = {
          matches: true,
          addEventListener(name: string, fn: Function) {
            trace.push(["theme-listener", name]);
            change = fn;
          },
          addListener(fn: Function) {
            trace.push(["legacy-theme-listener"]);
            change = fn;
          },
        };
        if (mode === "legacy-theme") delete media.addEventListener;
        const window: any = {
          location: { search },
          matchMedia: (query: string) => {
            trace.push(["media-query", query]);
            if (mode === "throws-theme") throw Error("unavailable");
            return media;
          },
        };
        if (mode === "missing-theme") delete window.matchMedia;
        const pending: Array<{ resolve: Function; reject: Function }> = [];
        const navigator: any = {
          userAgent: "Chrome/130 Edg/130",
          mediaDevices: {
            getUserMedia(constraints: any) {
              trace.push(["getUserMedia", constraints]);
              return new Promise((resolve, reject) =>
                pending.push({ resolve, reject }),
              );
            },
          },
        };
        const telemetry = (entry: string) => trace.push(["telemetry", entry]);
        const snapshot = () =>
          trace.push({
            title: document.title,
            theme: document.documentElement.style.colorScheme,
            nodes: Object.fromEntries(
              Object.entries(nodes).map(([key, node]: any) => [
                key,
                {
                  text: node.textContent,
                  hidden: node.hidden,
                  disabled: node.disabled,
                },
              ]),
            ),
          });
        try {
          if (restored)
            startMediaPermissionPage({
              document,
              window,
              navigator,
              initializeTelemetry: telemetry,
            });
          else
            original(
              window,
              document,
              navigator,
              true,
              telemetry,
              browserFamilies,
              identifyBrowserFamily,
            );
        } catch (error) {
          trace.push(["error", (error as Error).message]);
        }
        snapshot();
        change?.({ matches: false });
        const stream = {
          getTracks: () => [
            {
              stop() {
                trace.push("stop-one");
                if (mode === "stop-throws") throw Error("stop");
              },
            },
            {
              stop() {
                trace.push("stop-two");
              },
            },
          ],
        };
        if (pending[0]) {
          if (mode === "deny-retry") pending[0].reject(Error("denied"));
          else pending[0].resolve(stream);
          await flush();
          snapshot();
        }
        if (mode === "deny-retry") {
          click?.();
          snapshot();
          pending[1].resolve(stream);
          await flush();
          snapshot();
        }
        return trace;
      }
      assert.deepEqual(
        await scenario(true),
        await scenario(false),
        `${search} ${mode}`,
      );
    }
});
