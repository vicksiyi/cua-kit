import type { CdpTarget } from "../cdp/dispatch_helpers";
import type { AXTabState, AXFrame } from "./state_store";
import type { SnapshotDocument } from "./snapshot_metadata";
import { collectSnapshotMetadata, snapshotString } from "./snapshot_metadata";
import { frameDepth } from "./navigation_state";
import type { AXDocument, RawAXNode } from "./tree_conversion";
export interface AXFrameTree {
  frame: { id: string; parentId?: string; loaderId?: string; url?: string };
  childFrames?: AXFrameTree[];
}
export interface AXDOMSnapshot {
  strings: string[];
  documents: (SnapshotDocument & {
    frameId?: number;
    nodes: SnapshotDocument["nodes"] & {
      contentDocumentIndex?: { index: number[]; value: number[] };
    };
  })[];
}
export interface AXCaptureSession {
  target: CdpTarget;
  targetId: string;
  actionTargetId: string | null;
  frameTree: AXFrameTree;
  domSnapshot: AXDOMSnapshot;
  parentFrameId?: string;
}
export interface AXDocumentCollector {
  cdp: {
    callTarget(
      target: CdpTarget,
      method: string,
      params?: object,
      options?: object,
    ): Promise<any>;
    targetForFrameOrAttach(
      tabId: number,
      frameId: string,
      options?: object,
    ): Promise<CdpTarget | undefined>;
    targetIdForFrame(tabId: number, frameId: string): string | undefined;
  };
  enableAccessibility(
    state: AXTabState,
    target: CdpTarget,
    options?: object,
  ): Promise<void>;
  throwPendingError(tabId: number): void;
}
/** Original Kh.captureSessions, Kre/Xre: discover remote iframe sessions within the traversal deadline. */
export async function captureAXSessions(
  context: AXDocumentCollector,
  state: AXTabState,
  frameTree: AXFrameTree,
  domSnapshot: AXDOMSnapshot,
  warnings: string[],
): Promise<AXCaptureSession[]> {
  const sessions: AXCaptureSession[] = [
    {
      target: { tabId: state.tabId },
      targetId: `tab:${state.tabId}`,
      actionTargetId: null,
      frameTree,
      domSnapshot,
    },
  ];
  const seen = new Set([frameTree.frame.id]),
    deadline = Date.now() + 1000;
  for (const session of sessions)
    for (const document of session.domSnapshot.documents) {
      const parentFrameId =
          snapshotString(session.domSnapshot.strings, document.frameId) ||
          session.frameTree.frame.id,
        embedded = new Set(document.nodes.contentDocumentIndex?.index ?? []),
        names = document.nodes.nodeName ?? [];
      for (let index = 0; index < names.length; index++) {
        const name = snapshotString(session.domSnapshot.strings, names[index]);
        if ((name !== "IFRAME" && name !== "FRAME") || embedded.has(index))
          continue;
        const backendNodeId = document.nodes.backendNodeId?.[index];
        if (backendNodeId == null) continue;
        if (Date.now() >= deadline) {
          warnings.push(
            `Iframe in ${parentFrameId} accessibility unavailable: traversal deadline exceeded`,
          );
          return sessions;
        }
        const options = {
          deadlineMs: deadline,
          preserveDebuggerOnTimeout: true,
          timeoutMs: Math.min(500, deadline - Date.now()),
        };
        let frameId: string | undefined;
        try {
          const { node } = await context.cdp.callTarget(
            session.target,
            "DOM.describeNode",
            { backendNodeId },
            options,
          );
          frameId = node.frameId;
          if (frameId == null || seen.has(frameId)) continue;
          const target = await context.cdp.targetForFrameOrAttach(
            state.tabId,
            frameId,
            options,
          );
          if (target == null) throw new Error("Debugger target is unavailable");
          const { frameTree: childTree } = await context.cdp.callTarget(
            target,
            "Page.getFrameTree",
            undefined,
            options,
          );
          if (
            childTree.frame.id !== frameId ||
            (childTree.frame.parentId != null &&
              childTree.frame.parentId !== parentFrameId)
          )
            throw new Error("Debugger target does not match its parent frame");
          await context.enableAccessibility(state, target, options);
          const childSnapshot = await context.cdp.callTarget(
              target,
              "DOMSnapshot.captureSnapshot",
              {
                computedStyles: [],
                includePaintOrder: false,
                includeDOMRects: false,
              },
              options,
            ),
            targetId =
              context.cdp.targetIdForFrame(state.tabId, frameId) ??
              target.targetId ??
              frameId;
          seen.add(frameId);
          sessions.push({
            target,
            targetId,
            actionTargetId: targetId,
            parentFrameId,
            frameTree: childTree,
            domSnapshot: childSnapshot,
          });
        } catch (error) {
          warnings.push(
            `Iframe ${frameId ?? parentFrameId} accessibility unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  return sessions;
}
/** Original Kh.captureDocuments: root failures propagate; child failures produce ordered warnings. */
export async function captureAXDocuments(
  context: AXDocumentCollector,
  state: AXTabState,
  sessions: AXCaptureSession[],
  warnings: string[],
): Promise<(AXDocument & { frame: AXFrame })[]> {
  const roots = new Set(sessions.map((session) => session.frameTree.frame.id)),
    frames = new Map<string, AXFrame>(),
    owners = new Map<string, AXCaptureSession>();
  for (const session of sessions) {
    const visit = (tree: AXFrameTree, inheritedParent?: string) => {
      const frameId = tree.frame.id,
        parentFrameId =
          tree.frame.parentId ??
          frames.get(frameId)?.parentFrameId ??
          (frameId === session.frameTree.frame.id
            ? session.parentFrameId
            : inheritedParent);
      frames.set(frameId, {
        frameId,
        target: session.target,
        loaderId: tree.frame.loaderId,
        parentFrameId,
      });
      if (frameId !== session.frameTree.frame.id && roots.has(frameId)) return;
      owners.set(frameId, session);
      for (const child of tree.childFrames ?? []) visit(child, frameId);
    };
    visit(session.frameTree);
  }
  const ordered = [...frames.values()].sort(
    (a, b) => frameDepth(a, frames) - frameDepth(b, frames),
  );
  const captured = await Promise.all(
    ordered.map(async (frame) => {
      const session = owners.get(frame.frameId);
      if (session == null) return;
      try {
        const { nodes }: { nodes: RawAXNode[] } = await context.cdp.callTarget(
          session.target,
          "Accessibility.getFullAXTree",
          { frameId: frame.frameId },
        );
        const ids = new Set(
            nodes
              .map((node) => node.backendDOMNodeId)
              .filter((id): id is number => id != null),
          ),
          metadata = collectSnapshotMetadata(session.domSnapshot, ids);
        if (frame.parentFrameId != null) {
          const parent = frames.get(frame.parentFrameId);
          if (parent == null)
            throw new Error(
              `Parent frame ${frame.parentFrameId} has no debugger session`,
            );
          const owner = await context.cdp.callTarget(
            parent.target,
            "DOM.getFrameOwner",
            { frameId: frame.frameId },
          );
          frame.ownerBackendNodeId = owner.backendNodeId;
        }
        return {
          frame,
          targetId: session.targetId,
          actionTargetId: session.actionTargetId,
          nodes,
          metadata,
        };
      } catch (error) {
        if (frame.parentFrameId == null) throw error;
        return { frameId: frame.frameId, error };
      }
    }),
  );
  const documents: (AXDocument & { frame: AXFrame })[] = [];
  for (const document of captured) {
    if (document == null) continue;
    if ("error" in document) {
      warnings.push(
        `Iframe ${document.frameId} accessibility unavailable: ${document.error instanceof Error ? document.error.message : String(document.error)}`,
      );
      continue;
    }
    const frame = document.frame;
    if (frame.parentFrameId != null) {
      const parent = documents.find(
          (item) => item.frame.frameId === frame.parentFrameId,
        ),
        bounds =
          frame.ownerBackendNodeId == null
            ? undefined
            : parent?.metadata.get(frame.ownerBackendNodeId)?.bounds;
      if (bounds != null) frame.size = { width: bounds[2], height: bounds[3] };
    }
    documents.push(document);
  }
  context.throwPendingError(state.tabId);
  return documents;
}
