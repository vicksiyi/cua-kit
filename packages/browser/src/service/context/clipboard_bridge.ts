import type { CdpTarget } from "../cdp/dispatch_helpers";
import type { FrameEvent } from "../cdp/frame_methods";
import type { ClipboardStore } from "./clipboard";
export interface ClipboardCdp {
  on(name: string, listener: (...args: any[]) => void): unknown;
  removeListener(name: string, listener: (...args: any[]) => void): unknown;
  addTabCleanupHandler(handler: (tabId: number) => Promise<void>): () => void;
  callTarget(target: CdpTarget, method: string, params: unknown): Promise<any>;
}
interface Installed {
  bindingName: string;
  identifier?: string;
  target: CdpTarget;
}
interface Installation {
  bindingName: string;
  invalidated: boolean;
  installation: Promise<Installed>;
  cleanup?: Promise<void>;
}
export function clipboardTargetKey(target: Partial<CdpTarget>) {
  return target.sessionId != null
    ? `${target.tabId}:session:${target.sessionId}`
    : target.targetId != null
      ? `${target.tabId}:target:${target.targetId}`
      : `${target.tabId}:`;
}
export function clipboardCleanupScript(binding: string) {
  return `globalThis.__browserUseClipboardBridge?.bindingName === ${JSON.stringify(binding)} && globalThis.__browserUseClipboardBridge.cleanup()`;
}
export function clipboardResponseScript(response: unknown) {
  return `globalThis.__browserUseClipboardBridge?.respond(${JSON.stringify(JSON.stringify(response))})`;
}
/** Original xg. The original IL page installer remains an explicit dependency until its body is reconstructed. */
export function createPageClipboardBridgeClass(
  installationScript: (binding: string) => string,
) {
  return class PageClipboardBridge {
    cdp: ClipboardCdp;
    clipboard: ClipboardStore;
    installations = new Map<string, Installation>();
    removeTabCleanupHandler: () => void;
    disposal: Promise<void> | undefined;
    constructor(cdp: ClipboardCdp, clipboard: ClipboardStore) {
      this.cdp = cdp;
      this.clipboard = clipboard;
      this.cdp.on("event", this.handleCdpEvent);
      this.cdp.on("tabDetached", this.handleTabDetached);
      this.removeTabCleanupHandler = this.cdp.addTabCleanupHandler(
        async (tabId) => {
          await this.cleanupTab(tabId);
        },
      );
    }
    async ensure(target: CdpTarget): Promise<void> {
      if (this.disposal != null)
        throw new Error("Browser Use clipboard bridge is disposed");
      const key = clipboardTargetKey(target);
      let state = this.installations.get(key);
      if (state == null) {
        const bindingName = `__browserUseClipboard_${crypto.randomUUID().replaceAll("-", "")}`;
        state = {
          bindingName,
          invalidated: false,
          installation: this.install(target, bindingName),
        };
        this.installations.set(key, state);
      }
      try {
        await state.installation;
      } catch (error) {
        if (state.cleanup == null && this.installations.get(key) === state)
          this.installations.delete(key);
        if (state.invalidated && this.disposal == null) {
          await state.cleanup;
          await this.ensure(target);
          return;
        }
        throw error;
      }
      if (this.disposal != null)
        throw new Error("Browser Use clipboard bridge is disposed");
      if (state.invalidated || state.cleanup != null) {
        await this.cleanupInstallation(key, state);
        await this.ensure(target);
        return;
      }
    }
    dispose() {
      if (this.disposal != null) return this.disposal;
      this.disposal = this.cleanup();
      this.cdp.removeListener("event", this.handleCdpEvent);
      this.cdp.removeListener("tabDetached", this.handleTabDetached);
      this.removeTabCleanupHandler();
      return this.disposal;
    }
    async cleanup() {
      await Promise.all(
        [...this.installations].map(([key, state]) =>
          this.cleanupInstallation(key, state),
        ),
      );
    }
    handleCdpEvent = (event: FrameEvent) => {
      if (event.method !== "Runtime.bindingCalled") return;
      const state = this.installations.get(clipboardTargetKey(event.source));
      if (
        state == null ||
        state.cleanup != null ||
        event.params.name !== state.bindingName
      )
        return;
      this.handleBindingCall(
        event.source as CdpTarget,
        event.params.executionContextId,
        event.params.payload,
      );
    };
    handleTabDetached = (tabId: number) => {
      for (const [key, state] of this.installations)
        if (key.startsWith(`${tabId}:`)) state.invalidated = true;
    };
    handleBindingCall(target: CdpTarget, contextId: number, payload: string) {
      let request;
      try {
        request = JSON.parse(payload);
      } catch {
        return;
      }
      if (
        request == null ||
        typeof request !== "object" ||
        !("id" in request) ||
        typeof request.id !== "number" ||
        !Number.isSafeInteger(request.id)
      )
        return;
      const id = request.id;
      let response;
      try {
        if (!("operation" in request))
          throw new Error("Clipboard request is missing an operation");
        switch (request.operation) {
          case "read":
            response = { id, items: this.clipboard.read(), ok: true };
            break;
          case "write":
            if (!("items" in request) || !Array.isArray(request.items))
              throw new Error("Clipboard write requires items");
            this.clipboard.write(request.items, "navigator.clipboard.write");
            response = { id, ok: true };
            break;
          default:
            throw new Error("Unsupported clipboard operation");
        }
      } catch (error) {
        response = {
          error: error instanceof Error ? error.message : String(error),
          id,
          ok: false,
        };
      }
      this.cdp
        .callTarget(target, "Runtime.evaluate", {
          contextId,
          expression: clipboardResponseScript(response),
          returnByValue: true,
        })
        .catch(() => {});
    }
    async install(target: CdpTarget, bindingName: string): Promise<Installed> {
      const source = installationScript(bindingName);
      let bound = false,
        identifier;
      try {
        await this.cdp.callTarget(target, "Runtime.addBinding", {
          name: bindingName,
        });
        bound = true;
        identifier = (
          await this.cdp.callTarget(
            target,
            "Page.addScriptToEvaluateOnNewDocument",
            { runImmediately: true, source },
          )
        ).identifier;
        if (
          (
            await this.cdp.callTarget(target, "Runtime.evaluate", {
              expression: `globalThis.__browserUseClipboardBridge?.bindingName === ${JSON.stringify(bindingName)}`,
              returnByValue: true,
            })
          ).result?.value !== true
        )
          throw new Error("Browser Use clipboard bridge installation failed");
        return identifier == null
          ? { bindingName, target }
          : { bindingName, identifier, target };
      } catch (error) {
        if (bound)
          await this.cleanupTarget(
            identifier == null
              ? { bindingName, target }
              : { bindingName, identifier, target },
          );
        throw error;
      }
    }
    async cleanupTab(tabId: number) {
      const matches = [...this.installations.entries()].filter(([key]) =>
        key.startsWith(`${tabId}:`),
      );
      await Promise.all(
        matches.map(([key, state]) => this.cleanupInstallation(key, state)),
      );
    }
    cleanupInstallation(key: string, state: Installation) {
      state.cleanup ??= state.installation
        .then(
          (installed) => this.cleanupTarget(installed),
          () => {},
        )
        .finally(() => {
          if (this.installations.get(key) === state)
            this.installations.delete(key);
        });
      return state.cleanup;
    }
    async cleanupTarget(installed: Installed) {
      const { bindingName, identifier, target } = installed;
      await this.cdp
        .callTarget(target, "Runtime.evaluate", {
          expression: clipboardCleanupScript(bindingName),
          returnByValue: true,
        })
        .catch(() => {});
      if (identifier != null)
        await this.cdp
          .callTarget(target, "Page.removeScriptToEvaluateOnNewDocument", {
            identifier,
          })
          .catch(() => {});
      await this.cdp
        .callTarget(target, "Runtime.removeBinding", { name: bindingName })
        .catch(() => {});
    }
  };
}
