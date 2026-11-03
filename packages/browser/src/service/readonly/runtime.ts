import type { CdpTarget } from "../cdp/dispatch_helpers";
import type {
  ExecutionCdp,
  ExecutionOptions,
} from "../playwright/execution_state";
import type { PlaywrightService } from "../playwright/service";
import type { LocatorTiming } from "../playwright/retry";
import { isTerminalSelectorError } from "../playwright/retry";
import { isDestroyedExecutionContext } from "../playwright/injection";
import { LocatorError } from "../errors/locator_error";
import { readonlyExpression } from "./expression";
export interface ReadonlyRuntimeContext {
  cdp: ExecutionCdp;
  playwright: Pick<
    PlaywrightService,
    | "getReadonlyExecutionContext"
    | "invalidateReadonlyExecutionContext"
    | "resolvePlaywrightSelectorNode"
    | "installation"
  >;
  commandTiming: LocatorTiming;
}
export interface ReadonlyTarget {
  target: CdpTarget;
  frameId: string;
  backendNodeId?: number;
}
export interface PreparedReadonly {
  target: CdpTarget;
  frameId?: string;
  expression: string;
}
/** Original DF/zne/BF/CF/ag/$n/IF/Gne. */
export function readonlyResult(response: any): any {
  if (response.exceptionDetails != null)
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text ??
        "Runtime.evaluate failed",
    );
  const result = response.result;
  if (result != null)
    return result.unserializableValue != null
      ? readonlyUnserializable(result.unserializableValue)
      : result.value;
}
export function readonlyUnserializable(value: string) {
  switch (value) {
    case "-0":
      return -0;
    case "NaN":
    case "Infinity":
    case "-Infinity":
      return null;
  }
  return /^-?\d+n$/.test(value) ? value.slice(0, -1) : value;
}
export function readonlyFrameId(response: any): string {
  const id = response.frameTree.frame.id;
  if (!id) throw new Error("playwright.evaluate could not find a frame");
  return id;
}
export function readonlyTimeout(deadlineMs: number, timeoutMs: number) {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0)
    throw new Error("playwright.evaluate exceeded its deadline");
  return Math.max(1, Math.min(timeoutMs, remaining));
}
export function readonlyCleanupOptions() {
  return {
    deadlineMs: Date.now() + 100,
    telemetryAttrs: {
      "browser_use.cdp.eval.kind": "readonly_live_dom_cleanup",
    },
    timeoutMs: 100,
  };
}
export async function readonlyCdp(
  context: ReadonlyRuntimeContext,
  target: CdpTarget,
  method: string,
  params?: object,
  options?: ExecutionOptions,
): Promise<any> {
  return target.sessionId != null || target.targetId != null
    ? await context.cdp.callTarget!(target, method, params, options)
    : await context.cdp.call(target.tabId, method, params, options);
}
export function isWrongDocument(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).includes(
    "Node with given id does not belong to the document",
  );
}
export async function releaseReadonlyObjects(
  context: ReadonlyRuntimeContext,
  target: CdpTarget,
  ids: (string | null | undefined)[],
  options: ExecutionOptions,
) {
  for (const objectId of new Set(ids))
    if (objectId != null)
      await readonlyCdp(
        context,
        target,
        "Runtime.releaseObject",
        { objectId },
        options,
      ).catch(() => {});
}
export async function deleteReadonlyBinding(
  context: ReadonlyRuntimeContext,
  target: CdpTarget,
  contextId: number,
  name: string,
  options: ExecutionOptions,
) {
  await readonlyCdp(
    context,
    target,
    "Runtime.evaluate",
    {
      contextId,
      expression: `delete globalThis[${JSON.stringify(name)}]`,
      returnByValue: true,
    },
    options,
  ).catch(() => {});
}
let bindingSequence = 0;
/** Original $ne. */
export async function bindReadonlyNode(
  context: ReadonlyRuntimeContext,
  target: CdpTarget,
  backendNodeId: number,
  contextId: number,
  options: ExecutionOptions,
) {
  const { object } = await readonlyCdp(
      context,
      target,
      "DOM.resolveNode",
      { backendNodeId, executionContextId: contextId },
      options,
    ),
    objectId = object.objectId;
  if (objectId == null)
    throw new Error(
      "playwright.evaluate could not resolve the locator element",
    );
  const name = `__browserUseReadonlyElement${bindingSequence++}`;
  let exceptionId: string | undefined, cleanup: ExecutionOptions | undefined;
  try {
    const response = await readonlyCdp(
      context,
      target,
      "Runtime.callFunctionOn",
      {
        arguments: [{ value: name }],
        functionDeclaration: "function (name) { globalThis[name] = this; }",
        objectId,
        returnByValue: true,
      },
      options,
    );
    exceptionId = response.exceptionDetails?.exception?.objectId;
    readonlyResult(response);
    return name;
  } catch (error) {
    cleanup = readonlyCleanupOptions();
    await deleteReadonlyBinding(context, target, contextId, name, cleanup);
    throw error;
  } finally {
    await releaseReadonlyObjects(
      context,
      target,
      [objectId, exceptionId],
      cleanup ?? readonlyCleanupOptions(),
    );
  }
}
/** Original sS. */
export async function readonlyWorld(
  context: ReadonlyRuntimeContext,
  evaluationTarget: ReadonlyTarget,
  deadlineMs: number,
  timeoutMs: number,
) {
  const { target, frameId } = evaluationTarget;
  return await context.playwright.getReadonlyExecutionContext(
    target,
    frameId,
    async () => {
      const { executionContextId } = await readonlyCdp(
        context,
        target,
        "Page.createIsolatedWorld",
        {
          frameId,
          grantUniveralAccess: false,
          worldName: "browser-use-readonly-js",
        },
        {
          telemetryAttrs: { "browser_use.cdp.eval.kind": "readonly_js_world" },
          deadlineMs,
          timeoutMs,
        },
      );
      return executionContextId;
    },
  );
}
/** Original aS. */
export async function evaluateReadonlyInWorld(
  context: ReadonlyRuntimeContext,
  target: ReadonlyTarget,
  contextId: number,
  script: string,
  deadlineMs: number,
  timeoutMs: number,
  preparedExpression?: string,
) {
  const options = {
    deadlineMs,
    telemetryAttrs: { "browser_use.cdp.eval.kind": "readonly_live_dom" },
    timeoutMs,
  };
  if (preparedExpression != null)
    await readonlyCdp(
      context,
      target.target,
      "Runtime.evaluate",
      {
        ...context.playwright.installation,
        contextId,
        timeout: readonlyTimeout(deadlineMs, timeoutMs),
      },
      options,
    );
  const binding =
    target.backendNodeId == null
      ? undefined
      : await bindReadonlyNode(
          context,
          target.target,
          target.backendNodeId,
          contextId,
          options,
        );
  const expression =
    preparedExpression ??
    (binding == null
      ? readonlyExpression(script)
      : readonlyExpression(script, `rawWindow[${JSON.stringify(binding)}]`));
  try {
    return await readonlyCdp(
      context,
      target.target,
      "Runtime.evaluate",
      {
        awaitPromise: true,
        contextId,
        expression,
        returnByValue: true,
        timeout: readonlyTimeout(deadlineMs, timeoutMs),
      },
      options,
    );
  } finally {
    if (binding != null)
      await deleteReadonlyBinding(
        context,
        target.target,
        contextId,
        binding,
        readonlyCleanupOptions(),
      );
  }
}
/** Original Hne: one retry only for a thrown destroyed-context error. */
export async function evaluateReadonlyPage(
  context: ReadonlyRuntimeContext,
  tabId: number,
  script: string,
  deadlineMs: number,
  timeoutMs: number,
  prepared?: PreparedReadonly,
) {
  const target = prepared?.target ?? { tabId };
  const evaluationTarget = {
    frameId:
      prepared?.frameId ??
      readonlyFrameId(
        await readonlyCdp(context, target, "Page.getFrameTree", undefined, {
          telemetryAttrs: {
            "browser_use.cdp.eval.kind": "readonly_js_frame_tree",
          },
          deadlineMs,
          timeoutMs,
        }),
      ),
    target,
  };
  let world = await readonlyWorld(
      context,
      evaluationTarget,
      deadlineMs,
      timeoutMs,
    ),
    runtimeResult;
  try {
    runtimeResult = await evaluateReadonlyInWorld(
      context,
      evaluationTarget,
      world.executionContextId,
      script,
      deadlineMs,
      timeoutMs,
      prepared?.expression,
    );
  } catch (error) {
    if (!isDestroyedExecutionContext(error)) throw error;
    context.playwright.invalidateReadonlyExecutionContext(
      evaluationTarget.target,
      evaluationTarget.frameId,
      world,
    );
    world = await readonlyWorld(
      context,
      evaluationTarget,
      deadlineMs,
      timeoutMs,
    );
    runtimeResult = await evaluateReadonlyInWorld(
      context,
      evaluationTarget,
      world.executionContextId,
      script,
      deadlineMs,
      timeoutMs,
      prepared?.expression,
    );
  }
  return { evaluationTarget, runtimeResult };
}
/** Original Wne. Wrong-document invalidation is attempted once; context destruction may retry. */
export async function evaluateReadonlySelector(
  context: ReadonlyRuntimeContext,
  tabId: number,
  selector: string,
  script: string,
  deadlineMs: number,
  timeoutMs: number,
) {
  const tracker = context.commandTiming.startLocatorRetry();
  let wrongDocumentRetried = false;
  for (;;) {
    let target: ReadonlyTarget | undefined,
      world: { executionContextId: number } | undefined;
    try {
      const node = await context.playwright.resolvePlaywrightSelectorNode(
        tabId,
        selector,
        { deadlineMs, retry: false, timeoutMs },
      );
      target = {
        backendNodeId: node.backendNodeId,
        frameId:
          node.frameId ??
          readonlyFrameId(
            await readonlyCdp(
              context,
              node.target,
              "Page.getFrameTree",
              undefined,
              {
                telemetryAttrs: {
                  "browser_use.cdp.eval.kind": "readonly_js_frame_tree",
                },
                deadlineMs,
                timeoutMs,
              },
            ),
          ),
        target: node.target,
      };
      world = await readonlyWorld(context, target, deadlineMs, timeoutMs);
      const runtimeResult = await evaluateReadonlyInWorld(
        context,
        target,
        world.executionContextId,
        script,
        deadlineMs,
        timeoutMs,
      );
      tracker.finish("success");
      return { evaluationTarget: target, runtimeResult };
    } catch (error) {
      if (isTerminalSelectorError(error)) throw error;
      if (target != null && world != null) {
        const retryWrongDocument =
          !wrongDocumentRetried && isWrongDocument(error);
        if (isDestroyedExecutionContext(error) || retryWrongDocument) {
          context.playwright.invalidateReadonlyExecutionContext(
            target.target,
            target.frameId,
            world,
          );
          if (retryWrongDocument) wrongDocumentRetried = true;
        }
      }
      tracker.attemptFailed();
      if (Date.now() >= deadlineMs) {
        tracker.finish("timeout");
        const message = error instanceof Error ? error.message : String(error);
        throw new LocatorError(
          "locator_timeout",
          `Timed out after ${timeoutMs}ms evaluating selector ${selector}: ${message}`,
          { cause: error },
        );
      }
      await new Promise<void>((resolve) =>
        setTimeout(
          resolve,
          Math.max(1, Math.min(100, deadlineMs - Date.now())),
        ),
      );
    }
  }
}
