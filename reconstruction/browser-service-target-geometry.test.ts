import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { inspectTargetGeometry } from "../packages/browser/src/service/accessibility/target_geometry";
import { callElementFunction } from "../packages/browser/src/service/accessibility/element_execution";
import {
  hitTestElement,
  hitTestFrameOwner,
} from "../packages/browser/src/service/accessibility/hit_test";
// li also uses b5 when no viewport size is supplied.
const source = originalServiceBindings(["gp", "b5", "li", "Wv"], {
  Oo: callElementFunction,
  Mre: hitTestElement,
  Ore: hitTestFrameOwner,
});
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
test("AX geometry matches original across same-target, remote-target and nested frame mappings", async () => {
  for (const backend of [false, true])
    for (const mode of [
      "root",
      "same",
      "remote",
      "nested",
      "missing-frame",
      "missing-parent",
      "missing-owner",
      "empty",
      "bad-owner",
      "bad-content",
      "covered",
      "owner-covered",
      "fallback",
      "no-size",
    ]) {
      async function run(fn: typeof inspectTargetGeometry) {
        const trace: any[] = [];
        const root = { frameId: "root", target: { tabId: 1 } };
        const child: any = {
          frameId: "child",
          target: {
            tabId: 1,
            ...(mode === "same" ? {} : { sessionId: "child" }),
          },
          parentFrameId: "root",
          ownerBackendNodeId: 2,
          size: { width: 100, height: 100 },
        };
        if (mode === "missing-parent") child.parentFrameId = "missing";
        if (mode === "missing-owner") delete child.ownerBackendNodeId;
        if (mode === "no-size") delete child.size;
        const frames = new Map<string, any>([
          ["root", root],
          ["child", child],
        ]);
        const target: any = {
          id: 5,
          backendNodeId: 1,
          target: mode === "root" ? root.target : child.target,
          frameId: mode === "root" ? "root" : "child",
        };
        if (mode === "nested") {
          frames.set("middle", {
            frameId: "middle",
            target: { tabId: 1, sessionId: "middle" },
            parentFrameId: "root",
            ownerBackendNodeId: 3,
            size: { width: 400, height: 400 },
          });
          child.parentFrameId = "middle";
        }
        const context: any = {
          isIabBackend: backend,
          ax: {
            frameForId(tab: number, id: string) {
              trace.push(["frame", tab, id]);
              return mode === "missing-frame" ? undefined : frames.get(id);
            },
          },
          cdp: {
            async callTarget(target: any, method: string, params: any) {
              trace.push([
                target,
                method,
                {
                  ...params,
                  functionDeclaration: params.functionDeclaration
                    ? "PAGE_FUNCTION"
                    : undefined,
                },
              ]);
              const node = params.backendNodeId;
              if (method === "DOM.getContentQuads")
                return {
                  quads:
                    (mode === "empty" && node === 1) ||
                    (mode === "bad-owner" && node !== 1)
                      ? []
                      : [[10, 20, 210, 20, 210, 220, 10, 220]],
                };
              if (method === "DOM.getBoxModel")
                return {
                  model: {
                    border:
                      mode === "bad-owner"
                        ? []
                        : [10, 20, 210, 20, 210, 220, 10, 220],
                    content:
                      mode === "bad-content"
                        ? []
                        : [12, 22, 208, 22, 208, 218, 12, 218],
                  },
                };
              if (method === "DOM.resolveNode")
                return { object: { objectId: String(node) } };
              if (method === "Runtime.releaseObject") return {};
              return {
                result: {
                  value:
                    params.objectId === "1"
                      ? {
                          point: { x: 50, y: 40 },
                          viewportSize: { width: 100, height: 100 },
                          hitsTarget: !["covered", "fallback"].includes(mode),
                          hitTag: "DIV",
                          fallbackPoint:
                            mode === "fallback" ? { x: 25, y: 30 } : null,
                        }
                      : {
                          hitsTarget: mode !== "owner-covered",
                          hitTag: "IFRAME",
                          viewportSize: { width: 600, height: 400 },
                        },
                },
              };
            },
          },
        };
        return { result: await outcome(() => fn(context, 1, target)), trace };
      }
      assert.deepEqual(
        await run(inspectTargetGeometry),
        await run(source.Wv),
        `${backend}:${mode}`,
      );
    }
});
