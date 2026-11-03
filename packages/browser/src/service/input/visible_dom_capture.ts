import {
  domState,
  intersectClips,
  relativeClip,
  type Clip,
  type DomFrame,
} from "./dom_state";
import {
  childFrameTimeout,
  remainingDomTimeout,
  mainFrameKey,
  type createVisibleDomFrameReader,
  type VisibleFrameElement,
} from "./visible_dom_frame";
import { inputTimeout } from "./input";
import { positiveTabId } from "../tab_id";
import { defineCommand } from "../commands/define_command";
import type { CdpTarget } from "../cdp/dispatch_helpers";
type FrameReader = ReturnType<typeof createVisibleDomFrameReader>;
type FrameCdp = Parameters<FrameReader["capture"]>[0];
interface Cdp extends FrameCdp {
  call(...args: any[]): Promise<any>;
  targetForFrameOrAttach(
    tabId: number,
    frameId: string,
    options: { deadlineMs?: number; timeoutMs?: number },
    metadata: { url?: string },
  ): Promise<CdpTarget | null>;
}
interface Reviewer {
  capturedFrameIds: Set<string>;
  nextNodeId: number;
}
interface Output {
  chars: number;
  lines: string[];
  reviewer?: Reviewer;
}
interface CaptureOptions {
  credentialFrameId?: string;
  reviewer?: Reviewer;
  timeoutMs?: number;
}
interface FrameOptions {
  cdp: Cdp;
  childFrameDeadline: number;
  deadlineMs?: number;
  frameReference: DomFrame;
  maxChars?: number;
  maxElements?: number;
  output: Output;
  tabId: number;
  viewportClip?: Clip;
  useRequestDeadline?: boolean;
}
interface ChildrenOptions extends Omit<FrameOptions, "viewportClip"> {
  childFrames: VisibleFrameElement[];
  prioritizedFrameId?: string;
  viewportClip: Clip;
}
/** Original j_: both limits must leave capacity. */
export function visibleDomHasCapacity(output: Output) {
  return output.lines.length < 200 && output.chars < 20000;
}
/** Original ED/q_/TD/xD/SD, over the shared node state and explicit actual frame reader. */
export function createVisibleDomCapture(reader: FrameReader, state = domState) {
  async function captureFrame(
    options: FrameOptions,
  ): Promise<{
    childFrames: VisibleFrameElement[];
    frame: DomFrame;
    viewportClip: Clip | null;
  } | null> {
    if (
      options.output.lines.length >= 200 ||
      options.output.chars >= 20000 ||
      (options.frameReference.parentFrameId != null &&
        Date.now() >= options.childFrameDeadline)
    )
      return null;
    const frame = options.frameReference;
    if (options.output.reviewer == null)
      state.registerFrame(options.tabId, frame);
    const elements = Math.min(
      200 - options.output.lines.length,
      options.maxElements ?? 200,
    );
    const chars = Math.min(
      20000 - options.output.chars,
      options.maxChars ?? 20000,
    );
    const elementLimit = options.output.lines.length + elements;
    const charLimit = options.output.chars + chars;
    const capture = await reader
      .capture(
        options.cdp,
        frame,
        chars,
        elements,
        options.viewportClip,
        options.output.reviewer != null,
        frame.parentFrameId == null || options.useRequestDeadline === true
          ? remainingDomTimeout(options.deadlineMs)
          : childFrameTimeout(options.childFrameDeadline),
      )
      .catch((error) => {
        if (frame.parentFrameId != null) return null;
        throw error;
      });
    if (capture == null) return null;
    const clip =
      options.viewportClip == null
        ? capture.viewport
        : intersectClips(options.viewportClip, capture.viewport);
    if (clip == null) return { childFrames: [], frame, viewportClip: clip };
    for (const item of capture.items) {
      if (
        options.output.lines.length >= elementLimit ||
        options.output.chars >= charLimit
      )
        break;
      const nodeId =
        options.output.reviewer == null
          ? state.registerNode(options.tabId, frame, item.ref, clip)
          : String(options.output.reviewer.nextNodeId++);
      const line = item.line.replace(
        `node_id=${item.ref}`,
        `node_id=${nodeId}`,
      );
      const size = line.length + (options.output.lines.length === 0 ? 0 : 1);
      if (options.output.chars + size > charLimit) break;
      options.output.lines.push(line);
      options.output.chars += size;
      options.output.reviewer?.capturedFrameIds.add(frame.frameId);
    }
    return { childFrames: capture.frameElements, frame, viewportClip: clip };
  }
  async function captureChildren(options: ChildrenOptions): Promise<void> {
    if (visibleDomHasCapacity(options.output))
      for (const child of options.childFrames) {
        if (
          !visibleDomHasCapacity(options.output) ||
          Date.now() >= options.childFrameDeadline
        )
          break;
        const clip = relativeClip(child.rect, options.viewportClip);
        if (clip == null) continue;
        const frameId = await reader
          .frameId(
            options.cdp,
            options.frameReference,
            child.ref,
            childFrameTimeout(options.childFrameDeadline),
            options.output.reviewer != null,
          )
          .catch(() => null);
        if (frameId == null || frameId === options.prioritizedFrameId) continue;
        const target =
          (await options.cdp
            .targetForFrameOrAttach(
              options.tabId,
              frameId,
              { timeoutMs: childFrameTimeout(options.childFrameDeadline) },
              child.url == null ? {} : { url: child.url },
            )
            .catch(() => null)) ?? options.frameReference.target;
        const capture = await captureFrame({
          cdp: options.cdp,
          childFrameDeadline: options.childFrameDeadline,
          frameReference: {
            frameId,
            parentFrameId: options.frameReference.frameId,
            size: child.size,
            target,
          },
          output: options.output,
          tabId: options.tabId,
          viewportClip: clip,
        });
        if (capture?.viewportClip != null)
          await captureChildren({
            childFrames: capture.childFrames,
            cdp: options.cdp,
            childFrameDeadline: options.childFrameDeadline,
            frameReference: capture.frame,
            output: options.output,
            prioritizedFrameId: options.prioritizedFrameId,
            tabId: options.tabId,
            viewportClip: capture.viewportClip,
          });
      }
  }
  async function capture(
    tabId: number,
    cdp: Cdp,
    options: CaptureOptions = {},
  ) {
    state.bind(cdp);
    const deadline =
      options.timeoutMs == null ? undefined : Date.now() + options.timeoutMs;
    const { frameTree } = await cdp.call(
      tabId,
      "Page.getFrameTree",
      undefined,
      deadline == null
        ? {}
        : { deadlineMs: deadline, timeoutMs: options.timeoutMs },
    );
    const frameKey = mainFrameKey(frameTree.frame);
    if (options.reviewer == null) state.beginSnapshot(tabId, frameKey);
    const credentialFrame =
      options.credentialFrameId === frameTree.frame.id
        ? undefined
        : options.credentialFrameId;
    const output: Output = {
      chars: 0,
      lines: [],
      ...(options.reviewer == null ? {} : { reviewer: options.reviewer }),
    };
    const root = await captureFrame({
      cdp,
      childFrameDeadline: Date.now() + 1000,
      deadlineMs: deadline,
      frameReference: {
        frameId: frameTree.frame.id,
        loaderId: frameTree.frame.loaderId,
        target: { tabId },
      },
      ...(credentialFrame == null ? {} : { maxChars: 15000, maxElements: 150 }),
      output,
      tabId,
      viewportClip: undefined,
    });
    if (root?.viewportClip == null || !visibleDomHasCapacity(output))
      return output.lines.join("\n");
    let prioritizedFrameId: string | undefined;
    if (
      credentialFrame != null &&
      (deadline == null || Date.now() < deadline)
    ) {
      const child = await reader.findFrame(
        cdp,
        root.frame,
        root.childFrames,
        credentialFrame,
        deadline,
        output.reviewer != null,
      );
      const clip =
        child == null ? null : relativeClip(child.rect, root.viewportClip);
      if (child != null && clip != null) {
        const target = (await cdp
          .targetForFrameOrAttach(
            tabId,
            credentialFrame,
            { deadlineMs: deadline, timeoutMs: remainingDomTimeout(deadline) },
            child.url == null ? {} : { url: child.url },
          )
          .catch(() => null)) ?? { tabId };
        if (
          (
            await captureFrame({
              cdp,
              childFrameDeadline: deadline ?? Infinity,
              deadlineMs: deadline,
              frameReference: {
                frameId: credentialFrame,
                parentFrameId: frameTree.frame.id,
                size: child.size,
                target,
              },
              output,
              tabId,
              useRequestDeadline: true,
              viewportClip: clip,
            })
          )?.viewportClip != null
        )
          prioritizedFrameId = credentialFrame;
      }
    }
    const childDeadline = Math.min(Date.now() + 1000, deadline ?? Infinity);
    await captureChildren({
      childFrames: root.childFrames,
      cdp,
      childFrameDeadline: childDeadline,
      frameReference: root.frame,
      output,
      prioritizedFrameId,
      tabId,
      viewportClip: root.viewportClip,
    });
    return output.lines.join("\n");
  }
  async function review(
    payload: { tab_id: unknown; timeout_ms?: number },
    context: { cdp: Cdp },
    credentialFrameId: string,
    capturedFrameIds = new Set<string>(),
  ) {
    return await capture(positiveTabId(payload.tab_id), context.cdp, {
      credentialFrameId,
      reviewer: { capturedFrameIds, nextNodeId: 1 },
      timeoutMs: inputTimeout(payload),
    });
  }
  const command = defineCommand(
    "dom_cua_get_visible_dom",
    async (
      payload: { tab_id: unknown },
      context: {
        cdp: Cdp;
        acquireAuthority(): {
          observeContent(url: unknown): { assert(): Promise<unknown> };
        };
        security: { currentTabUrl(tabId: number): Promise<unknown> };
      },
    ) => {
      const tabId = positiveTabId(payload.tab_id);
      await context
        .acquireAuthority()
        .observeContent(await context.security.currentTabUrl(tabId))
        .assert();
      return await capture(tabId, context.cdp);
    },
  );
  return { capture, captureFrame, captureChildren, review, command };
}
