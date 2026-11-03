import { credentialUrl } from "./lease_events";
import type { LeaseCleanupCdp } from "./lease_cleanup";
export interface ContainmentCdp extends LeaseCleanupCdp {
  browserAuthNewTargetCheck(tabId: number): Promise<string>;
}
/** Original sJ, including the isolated-world page source. */
export async function hasNoCredentialServiceWorkers(
  cdp: ContainmentCdp,
  tabId: number,
  frameId: string,
) {
  try {
    const { executionContextId } = await cdp.call(
      tabId,
      "Page.createIsolatedWorld",
      { frameId, worldName: "browser-auth-saving-service-workers" },
    );
    const result = await cdp.call(tabId, "Runtime.evaluate", {
      expression:
        "(async () => { const container = navigator.serviceWorker; if (container == null) return true; if (container.controller != null || (await container.getRegistrations()).length !== 0) return false; return container.controller == null; })()",
      contextId: executionContextId,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.exceptionDetails == null && result.result.value === true;
  } catch {
    return false;
  }
}
/** Original Cf. Ordinary submission bypass is intentional original behavior. */
export async function isCredentialDocumentContained(
  cdp: ContainmentCdp,
  tabId: number,
  origin: string,
  rejected?: (reason: string) => void,
  ordinary = false,
) {
  if (ordinary) return true;
  const [{ frameTree }, { root }] = await Promise.all([
    cdp.call(tabId, "Page.getFrameTree", undefined),
    cdp.call(tabId, "DOM.getDocument", { depth: -1, pierce: true }),
  ]);
  if (credentialUrl(frameTree.frame.securityOrigin)?.origin !== origin) {
    rejected?.("frame_origin");
    return false;
  }
  if ((frameTree.childFrames?.length ?? 0) !== 0) {
    rejected?.("child_frames");
    return false;
  }
  function nested(node: any): boolean {
    return (
      ["iframe", "frame", "object", "embed"].includes(
        node.localName.toLowerCase(),
      ) ||
      [
        ...(node.children ?? []),
        ...(node.shadowRoots ?? []),
        ...(node.contentDocument == null ? [] : [node.contentDocument]),
      ].some(nested)
    );
  }
  if (nested(root)) {
    rejected?.("nested_document");
    return false;
  }
  const newTargets = await cdp.browserAuthNewTargetCheck(tabId);
  if (newTargets !== "contained") {
    rejected?.(newTargets === "error" ? "new_targets_error" : "new_targets");
    return false;
  }
  if (await hasNoCredentialServiceWorkers(cdp, tabId, frameTree.frame.id))
    return true;
  rejected?.("service_workers");
  return false;
}
