import type { CdpTarget } from "../cdp/dispatch_helpers";
export const staleWebMcpRegistration =
  "WebMCP tool registration is stale. Call fetchTools() again.";
interface Frame {
  id: string;
  parentId?: string;
  loaderId?: string;
  name?: string;
  url: string;
  urlFragment?: string;
  secureContextType?: string;
  securityOrigin: string;
  securityOriginDetails?: { isLocalhost?: boolean };
}
interface FrameTree {
  frame: Frame;
  childFrames?: FrameTree[];
}
interface DiscoveryApi {
  getFrameTree(target: CdpTarget): Promise<{ frameTree: FrameTree }>;
  getTargets(): Promise<{
    targetInfos: {
      type: string;
      url?: unknown;
      tabId?: number;
      targetId: string;
    }[];
  }>;
  observe(target: CdpTarget): Promise<unknown>;
  getFrameOwner(target: CdpTarget, frameId: string): Promise<unknown>;
  attach(targetId: string): Promise<CdpTarget>;
}
/** Original Es sandbox host rule, used only after the original scheme check. */
function sandboxOrigin(url: URL) {
  return (
    (url.protocol === "codex-sandbox:" || url.protocol === "https:") &&
    [
      "web-sandbox.oaiusercontent.com",
      "staging-web-sandbox.oaiusercontent.com",
    ].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    ) &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}
/** Original uN. Traversal order and snapshot identity preserve the original registration boundary. */
export async function discoverWebMcpFrames(
  root: CdpTarget,
  api: DiscoveryApi,
  excludedFrameName?: string,
) {
  const { frameTree } = await api.getFrameTree(root),
    { targetInfos } = await api.getTargets();
  const remaining = new Set(
    targetInfos
      .filter(
        (info) =>
          (info.type === "iframe" ||
            (info.type === "other" && typeof info.url === "string")) &&
          (info.tabId == null || info.tabId === root.tabId),
      )
      .map((info) => info.targetId),
  );
  const targets = [{ target: root, frameTree }];
  const frames: {
    target: CdpTarget;
    frameId: string;
    origin: string;
    url: string;
    fileUrl?: string;
  }[] = [];
  const identities = new Map<string, string>();
  for (const entry of targets) {
    await api.observe(entry.target);
    const queue = [entry.frameTree];
    for (const { frame, childFrames } of queue) {
      if (excludedFrameName != null && frame.name === excludedFrameName)
        continue;
      identities.set(
        frame.id,
        JSON.stringify([
          frame.parentId,
          frame.loaderId,
          entry.target.sessionId,
          entry.target.targetId,
        ]),
      );
      if (
        (frame.secureContextType === "Secure" ||
          frame.secureContextType === "SecureLocalhost") &&
        ((frame.securityOrigin === "file://" &&
          frame.url.startsWith("file://")) ||
          frame.securityOrigin.startsWith("https://") ||
          (frame.securityOrigin.startsWith("codex-sandbox://") &&
            sandboxOrigin(new URL(frame.securityOrigin))) ||
          (frame.securityOrigin.startsWith("http://") &&
            frame.securityOriginDetails?.isLocalhost === true))
      ) {
        const file =
          frame.securityOrigin === "file://" ? new URL(frame.url) : undefined;
        if (file) {
          file.search = "";
          file.hash = "";
        }
        frames.push({
          target: entry.target,
          frameId: frame.id,
          origin: frame.securityOrigin,
          url: frame.url + (frame.urlFragment ?? ""),
          fileUrl: file?.href,
        });
      }
      if (childFrames != null) queue.push(...childFrames);
    }
    const owned = await Promise.all(
      [...remaining].map(async (id) => {
        try {
          await api.getFrameOwner(entry.target, id);
          return id;
        } catch (error) {
          const message = error instanceof Error ? error.message : error;
          if (
            typeof message === "string" &&
            /Frame with the given id (?:was not found|does not belong to the target)/.test(
              message,
            )
          )
            return null;
          throw error;
        }
      }),
    );
    for (const id of owned) {
      if (id == null) continue;
      remaining.delete(id);
      const target = await api.attach(id),
        tree = await api.getFrameTree(target);
      if (tree.frameTree.frame.id !== id)
        throw new Error(staleWebMcpRegistration);
      targets.push({ target, frameTree: tree.frameTree });
    }
  }
  return {
    frames,
    targets: targets.map((entry) => entry.target),
    snapshot: JSON.stringify(
      [...identities].sort(([a], [b]) => a.localeCompare(b)),
    ),
    pageUrl: frameTree.frame.url
      ? frameTree.frame.url + (frameTree.frame.urlFragment ?? "")
      : undefined,
  };
}
