import { PlaywrightExecutionState } from "./execution_state";
import type { ExecutionOptions } from "./execution_state";
import type { CdpTarget } from "../cdp/dispatch_helpers";
export interface PlaywrightNode {
  target: CdpTarget;
  backendNodeId: number;
  frameId?: string;
}
/** Original oS/No: preserve exception description/text/value precedence. */
export function playwrightEvaluationError(response: any): Error | null {
  if (response.exceptionDetails == null) return null;
  const value = response.exceptionDetails.exception?.value,
    details =
      response.exceptionDetails.exception?.description ??
      response.exceptionDetails.text ??
      (value == null
        ? "Playwright selector evaluation failed."
        : String(value));
  return new Error(
    `Browser Use encountered an error interacting with this webpage: ${details}`,
  );
}
export function playwrightEvaluationValue(response: any): any {
  const error = playwrightEvaluationError(response);
  if (error != null) throw error;
  return response.result?.value;
}
/** Original ig node methods; injection remains an explicit abstract dependency until restored. */
export abstract class PlaywrightNodeExecution extends PlaywrightExecutionState {
  abstract ensurePlaywrightInjectedInTarget(
    target: CdpTarget,
    options: ExecutionOptions,
    frameId?: string,
  ): Promise<void>;
  async withPlaywrightNode<T>(
    node: PlaywrightNode,
    run: (objectId: string, contextId: number | undefined) => Promise<T>,
    options: ExecutionOptions = {},
  ): Promise<T> {
    if (node.frameId != null)
      await this.ensurePlaywrightInjectedInTarget(
        node.target,
        options,
        node.frameId,
      );
    const contextId =
      node.frameId == null
        ? undefined
        : (await this.playwrightFrameWorld(node.target, node.frameId, options))
            .executionContextId;
    const { object } = await this.callCdpTarget(
      node.target,
      "DOM.resolveNode",
      {
        backendNodeId: node.backendNodeId,
        ...(contextId == null ? {} : { executionContextId: contextId }),
      },
      options,
    );
    if (object.objectId == null)
      throw new Error("Playwright node has no document-bound handle");
    try {
      return await run(object.objectId, contextId);
    } finally {
      await this.releaseRuntimeObjects(node.target, [object.objectId], options);
    }
  }
  async releaseRuntimeObjects(
    target: CdpTarget,
    ids: (string | null | undefined)[],
    options: ExecutionOptions,
  ) {
    const cleanup = {
      deadlineMs: Date.now() + 100,
      preserveDebuggerOnTimeout: true,
      telemetryAttrs: options.telemetryAttrs,
      timeoutMs: 100,
    };
    for (const objectId of new Set(ids))
      if (objectId != null)
        await this.callCdpTarget(
          target,
          "Runtime.releaseObject",
          { objectId },
          cleanup,
        ).catch(() => {});
  }
  async evaluateOnPlaywrightNode<T>(
    node: PlaywrightNode,
    fn: (element: any, injected: any, arg: any) => T,
    options: ExecutionOptions & { arg?: unknown } = {},
  ) {
    return await this.withPlaywrightNode(
      node,
      async (objectId, contextId) => {
        const response = await this.callCdpTarget(
          node.target,
          "Runtime.callFunctionOn",
          {
            arguments: options.arg == null ? [] : [{ value: options.arg }],
            awaitPromise: true,
            functionDeclaration: `function (arg) {
            const __name = (target) => target;
            const injected = window.${PlaywrightNodeExecution.injectedConstant};
            if (!this.isConnected) throw new Error("Element is not connected");
            return (${fn.toString()})(this, injected, arg);
          }`,
            objectId,
            returnByValue: true,
            userGesture: true,
          },
          options,
        );
        try {
          return {
            executionContextId: contextId,
            result: playwrightEvaluationValue(response),
            target: node.target,
          };
        } finally {
          await this.releaseRuntimeObjects(
            node.target,
            [response.exceptionDetails?.exception?.objectId],
            options,
          );
        }
      },
      options,
    );
  }
  async frameIdForElementObject(
    target: CdpTarget,
    objectId: string,
    options: ExecutionOptions,
  ) {
    const response = await this.callCdpTarget(
      target,
      "Runtime.callFunctionOn",
      {
        functionDeclaration: `function () {
          try {
            return this.ownerDocument?.defaultView?.frameElement ?? null;
          } catch {
            return null;
          }
        }`,
        objectId,
        returnByValue: false,
      },
      options,
    );
    const frameObjectId = response.result?.objectId,
      exceptionObjectId = response.exceptionDetails?.exception?.objectId;
    try {
      if (response.exceptionDetails != null)
        playwrightEvaluationValue(response);
      if (frameObjectId == null) return;
      const { node } = await this.callCdpTarget(
        target,
        "DOM.describeNode",
        { objectId: frameObjectId },
        options,
      );
      return node.frameId as string | undefined;
    } finally {
      await this.releaseRuntimeObjects(
        target,
        [frameObjectId, exceptionObjectId],
        options,
      );
    }
  }
}
