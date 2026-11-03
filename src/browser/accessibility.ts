import type { CDPSession, Page } from 'playwright';
import type { AXElement } from '../core/types.js';
import { CuaError } from '../core/errors.js';

interface AXValue { value?: unknown }
interface RawAXNode {
  nodeId: string; parentId?: string; ignored: boolean;
  backendDOMNodeId?: number; role?: AXValue; name?: AXValue; value?: AXValue;
  properties?: { name: string; value: AXValue }[];
}
interface FrameTree { frame: { id: string; loaderId: string }; childFrames?: FrameTree[] }
export interface ElementBinding { backendNodeId: number; frameId: string; loaderId: string; cdp: CDPSession }
export interface Capture { elements: AXElement[]; bindings: Map<number, ElementBinding>; warnings: string[] }

/** IDs are monotonic within a target; old IDs are never recycled for different DOM nodes. */
export class AccessibilityCollector {
  private nextId = 1;
  private identities = new Map<string, number>();
  private sessions = new Map<string, CDPSession>();
  constructor(private page: Page, private cdp: CDPSession) {}

  async capture(): Promise<Capture> {
    const roots: { tree: FrameTree; cdp: CDPSession }[] = [];
    const warnings: string[] = [];
    const root = await this.cdp.send('Page.getFrameTree');
    roots.push({ tree: root.frameTree, cdp: this.cdp });
    // A separate CDP session is needed for out-of-process frames. Same-process
    // frames are collected from the main session's frame tree below.
    for (const frame of this.page.frames()) {
      if (frame === this.page.mainFrame()) continue;
      try {
        const session = await this.page.context().newCDPSession(frame);
        const { frameTree } = await session.send('Page.getFrameTree');
        const existing = this.sessions.get(frameTree.frame.id);
        if (existing) {
          await session.detach();
          roots.push({ tree: frameTree, cdp: existing });
        } else {
          this.sessions.set(frameTree.frame.id, session);
          await session.send('Accessibility.enable');
          roots.push({ tree: frameTree, cdp: session });
        }
      } catch (error) {
        // Playwright explicitly rejects newCDPSession for a same-process frame.
        if (!String(error).includes('does not have a separate CDP session')) {
          warnings.push(`Frame session unavailable: ${frame.url()}`);
        }
      }
    }
    const frameSessions = new Map<string, { tree: FrameTree; cdp: CDPSession }>();
    const visit = (tree: FrameTree, cdp: CDPSession) => {
      frameSessions.set(tree.frame.id, { tree, cdp });
      for (const child of tree.childFrames ?? []) visit(child, cdp);
    };
    for (const { tree, cdp } of roots) visit(tree, cdp);
    const elements: AXElement[] = [];
    const bindings = new Map<number, ElementBinding>();
    for (const { tree, cdp } of frameSessions.values()) {
      const { id: frameId, loaderId } = tree.frame;
      let nodes: RawAXNode[];
      try { nodes = (await cdp.send('Accessibility.getFullAXTree', { frameId })).nodes; }
      catch { warnings.push(`Accessibility unavailable for frame ${frameId}`); continue; }
      const ids = new Map<string, number>();
      for (const node of nodes) {
        if (node.ignored) continue;
        const identity = `${frameId}:${loaderId}:${node.backendDOMNodeId ?? node.nodeId}`;
        let id = this.identities.get(identity);
        if (id === undefined) { id = this.nextId++; this.identities.set(identity, id); }
        ids.set(node.nodeId, id);
      }
      for (const node of nodes) {
        const id = ids.get(node.nodeId);
        if (id === undefined) continue;
        const properties: AXElement['properties'] = {};
        for (const item of node.properties ?? []) {
          const value = item.value.value;
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') properties[item.name] = value;
        }
        elements.push({ id, role: String(node.role?.value ?? 'unknown'), name: String(node.name?.value ?? ''),
          ...(node.value?.value === undefined ? {} : { value: String(node.value.value) }),
          ...(node.parentId && ids.has(node.parentId) ? { parentId: ids.get(node.parentId)! } : {}), properties });
        if (node.backendDOMNodeId !== undefined) bindings.set(id, { backendNodeId: node.backendDOMNodeId, frameId, loaderId, cdp });
      }
    }
    return { elements, bindings, warnings };
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.sessions.values()].map(session => session.detach()));
    this.sessions.clear();
  }
}

export function renderAX(elements: AXElement[]): string {
  const byId = new Map(elements.map(element => [element.id, element]));
  return elements.map(element => {
    let depth = 0, current = element;
    const visited = new Set<number>();
    while (current.parentId && depth < 24 && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent; depth++;
    }
    const flags = Object.entries(element.properties).filter(([key]) => ['disabled', 'checked', 'expanded', 'selected', 'focused'].includes(key));
    return `${'  '.repeat(depth)}[${element.id}] ${element.role} ${JSON.stringify(element.name)}${element.value === undefined ? '' : ` value=${JSON.stringify(element.value)}`}${flags.map(([key, value]) => ` ${key}=${value}`).join('')}`;
  }).join('\n');
}

/** Execute against the captured backend node, never a broad text selector. */
export async function onElement<T>(binding: ElementBinding, body: string, args: unknown[] = []): Promise<T> {
  const { object } = await binding.cdp.send('DOM.resolveNode', { backendNodeId: binding.backendNodeId });
  if (!object.objectId) throw new CuaError('STALE_OBSERVATION', 'Element is no longer available.');
  try {
    const response = await binding.cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId, functionDeclaration: body,
      arguments: args.map(value => ({ value })), returnByValue: true, awaitPromise: true,
    });
    if (response.exceptionDetails) throw new CuaError('ELEMENT_NOT_INTERACTABLE', response.exceptionDetails.exception?.description ?? 'Element operation failed.');
    return response.result.value as T;
  } finally { await binding.cdp.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => undefined); }
}
