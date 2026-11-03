import { defineCommand } from "./define_command";
import { inputTimeout } from "../input/input";
interface Snapshot {
  full: string;
  iframeRefs: string[];
  iframeDepths: Record<string, number>;
}
interface SnapshotContext {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(id: number): Promise<unknown> };
  isIabBackend?: boolean;
  playwright: {
    executionPolicy: { documentOnly?: boolean };
    evaluateOnPlaywrightPage(
      id: string | number,
      fn: (helper: any) => Snapshot,
      options: { timeoutMs: number },
    ): Promise<Snapshot>;
    evaluateOnPlaywrightSelector(
      id: string | number,
      selector: string,
      fn: (element: any, helper: any) => Snapshot,
      options: {
        deadlineMs?: number;
        retry: boolean;
        scrollFrameIntoView: boolean;
        timeoutMs: number;
      },
    ): Promise<Snapshot>;
  };
}
const enterFrame = " >> internal:control=enter-frame >> ";
/** Original e2; callbacks remain self-contained for page serialization. */
export const PlaywrightDomSnapshotCommand = defineCommand(
  "playwright_dom_snapshot",
  async (
    payload: { tab_id: string | number; timeout_ms?: number },
    context: SnapshotContext,
  ) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    const timeout = inputTimeout(payload);
    const snapshot = await context.playwright.evaluateOnPlaywrightPage(
      payload.tab_id,
      (helper) => {
        const root = document.body || document.documentElement;
        if (!root) return { full: "", iframeDepths: {}, iframeRefs: [] };
        const snapshot = helper.incrementalAriaSnapshot(root, { mode: "ai" });
        let full = snapshot.full;
        const iframeRefs = snapshot.iframeRefs.filter((ref: string) => {
          if (!(ref in snapshot.iframeDepths)) return false;
          try {
            const [frame] = helper.querySelectorAll(
              helper.parseSelector(`aria-ref=${ref}`),
              root,
            );
            if (frame == null) return false;
            const id = frame.getAttribute("id"),
              name = frame.getAttribute("name");
            const attributes = [
              ...(id ? [`[id=${JSON.stringify(id)}]`] : []),
              ...(name ? [`[name=${JSON.stringify(name)}]`] : []),
            ].join(" ");
            if (attributes)
              full = full.replace(
                /^([ \t]*- iframe(?: [^\r\n]*)?) \[ref=([^\]\r\n]+)\]/gm,
                (line: string, prefix: string, nodeRef: string) =>
                  nodeRef === ref
                    ? `${prefix} ${attributes} [ref=${ref}]`
                    : line,
              );
            return (
              frame.getAttribute("aria-hidden") !== "true" &&
              helper.elementState(frame, "visible").matches === true
            );
          } catch {
            return false;
          }
        });
        return { ...snapshot, full, iframeRefs };
      },
      { timeoutMs: timeout },
    );
    if (context.playwright.executionPolicy.documentOnly)
      return { dom_snapshot: normalizeSnapshot(snapshot.full) };
    const deadline = context.isIabBackend ? Date.now() + 1000 : undefined;
    const full = await expandSnapshotFrames(
      context,
      payload.tab_id,
      snapshot,
      timeout,
      undefined,
      deadline,
    );
    return { dom_snapshot: normalizeSnapshot(full) };
  },
);
/** Original t2, preserving concurrent child reads and original output ordering. */
export async function expandSnapshotFrames(
  context: SnapshotContext,
  tabId: string | number,
  snapshot: Snapshot,
  timeout: number,
  parent?: string,
  deadline?: number,
): Promise<string> {
  const refs = snapshot.iframeRefs.filter(
    (ref) => ref in snapshot.iframeDepths,
  );
  if (!refs.length || (deadline != null && Date.now() >= deadline))
    return snapshot.full;
  const children = new Map(
    await Promise.all(
      refs.map(
        async (ref) =>
          [
            ref,
            await readSnapshotFrame(
              context,
              tabId,
              ref,
              timeout,
              parent,
              deadline,
            ),
          ] as const,
      ),
    ),
  );
  const lines: string[] = [];
  for (const line of snapshot.full.split("\n")) {
    const ref = snapshotFrameRef(line);
    if (!ref) {
      lines.push(line);
      continue;
    }
    const child = children.get(ref);
    if (!child) {
      lines.push(line);
      continue;
    }
    const indent = line.match(/^ */)?.[0] ?? "";
    lines.push(line.endsWith(":") ? line : `${line}:`);
    lines.push(
      ...child.split("\n").map((childLine) => `${indent}  ${childLine}`),
    );
  }
  return lines.join("\n");
}
/** Original Gte. A failing child frame does not fail the parent snapshot. */
async function readSnapshotFrame(
  context: SnapshotContext,
  tabId: string | number,
  ref: string,
  timeout: number,
  parent?: string,
  deadline?: number,
): Promise<string | null> {
  try {
    const selector = parent
      ? `${parent}${enterFrame}aria-ref=${ref}`
      : `aria-ref=${ref}`;
    if (deadline != null && Date.now() >= deadline) return null;
    const frameTimeout =
      deadline == null
        ? timeout
        : Math.max(1, Math.min(timeout, 500, deadline - Date.now()));
    const snapshot = await context.playwright.evaluateOnPlaywrightSelector(
      tabId,
      `${selector}${enterFrame}body`,
      (root, helper) => {
        const snapshot = helper.incrementalAriaSnapshot(root, { mode: "ai" });
        let full = snapshot.full;
        const iframeRefs = snapshot.iframeRefs.filter((ref: string) => {
          if (!(ref in snapshot.iframeDepths)) return false;
          try {
            const [frame] = helper.querySelectorAll(
              helper.parseSelector(`aria-ref=${ref}`),
              root,
            );
            if (frame == null) return false;
            const id = frame.getAttribute("id"),
              name = frame.getAttribute("name");
            const attributes = [
              ...(id ? [`[id=${JSON.stringify(id)}]`] : []),
              ...(name ? [`[name=${JSON.stringify(name)}]`] : []),
            ].join(" ");
            if (attributes)
              full = full.replace(
                /^([ \t]*- iframe(?: [^\r\n]*)?) \[ref=([^\]\r\n]+)\]/gm,
                (line: string, prefix: string, nodeRef: string) =>
                  nodeRef === ref
                    ? `${prefix} ${attributes} [ref=${ref}]`
                    : line,
              );
            return (
              frame.getAttribute("aria-hidden") !== "true" &&
              helper.elementState(frame, "visible").matches === true
            );
          } catch {
            return false;
          }
        });
        return { ...snapshot, full, iframeRefs };
      },
      {
        ...(deadline == null ? {} : { deadlineMs: deadline }),
        retry: false,
        scrollFrameIntoView: false,
        timeoutMs: frameTimeout,
      },
    );
    return await expandSnapshotFrames(
      context,
      tabId,
      snapshot,
      timeout,
      selector,
      deadline,
    );
  } catch {
    return null;
  }
}
/** Original Vte. */
export function snapshotFrameRef(line: string) {
  return line.trimStart().startsWith("- iframe")
    ? (line.match(/\[ref=([^\]]+)\]/)?.[1] ?? null)
    : null;
}
interface SnapshotNode {
  line: string;
  children: SnapshotNode[];
}
interface IndentedNode extends SnapshotNode {
  indent: number;
  children: IndentedNode[];
}
/** Original ZN/zte/QN/r2/n2/Kte/Xte/Yte. */
export function normalizeSnapshot(text: string): string {
  if (
    !text.startsWith("- ") &&
    !text.includes("\n- ") &&
    !text.includes("\n  - ")
  )
    return text;
  const root: IndentedNode = { children: [], indent: -1, line: "" };
  const stack = [root];
  const last = () => {
    const node = stack.at(-1);
    if (node == null)
      throw new Error("Expected snapshot stack to be non-empty");
    return node;
  };
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const node: IndentedNode = {
      children: [],
      indent,
      line: line.slice(indent),
    };
    while (stack.length > 1 && indent <= last().indent) stack.pop();
    last().children.push(node);
    stack.push(node);
  }
  function clean(node: SnapshotNode): SnapshotNode[] {
    const children = node.children.flatMap(clean);
    const line = node.line
      .replace(/ \[ref=[^\]]+\]/g, "")
      .replace(/ \[cursor=[^\]]+\]/g, "");
    return /^- img(?: \[[^\]]+\])*:?$/.test(line)
      ? []
      : /^- (generic|listitem|group)(?: \[[^\]]+\])*:?$/.test(line)
        ? children
        : [{ children, line }];
  }
  function render(nodes: SnapshotNode[], depth = 0): string {
    const lines: string[] = [],
      indent = "  ".repeat(depth);
    for (const node of nodes) {
      lines.push(indent + node.line);
      const children = render(node.children, depth + 1);
      if (children !== "") lines.push(children);
    }
    return lines.join("\n");
  }
  return render(root.children.flatMap(clean));
}
