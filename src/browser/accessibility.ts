import type { CdpChannel as CDPSession, BrowserDriver as Page } from './driver.js';
import type { AXElement } from '../core/types.js';
import { FrameRevisions, type FrameStamp } from './stamp.js';
import { CuaError } from '../core/errors.js';

interface AXValue { value?: unknown }
interface RawAXNode {
  nodeId: string; parentId?: string; ignored: boolean;
  backendDOMNodeId?: number; role?: AXValue; name?: AXValue; value?: AXValue;
  properties?: { name: string; value: AXValue }[];
}
interface FrameTree { frame: { id: string; loaderId: string; parentId?: string }; childFrames?: FrameTree[] }
export interface ElementBinding { backendNodeId: number; frameId: string; loaderId: string; cdp: CDPSession; contextId?: number }
export interface Capture { elements: AXElement[]; bindings: Map<number, ElementBinding>; warnings: string[]; stamps: FrameStamp[] }

/** IDs are monotonic within a target; old IDs are never recycled for different DOM nodes. */
export class AccessibilityCollector {
  readonly revisions = new FrameRevisions();
  private nextId = 1;
  private identities = new Map<string, number>();
  private contextIds = new Map<string, number>();
  private frames = new Map<string, { tree: FrameTree; cdp: CDPSession; parentId?: string }>();
  private sessions = new Map<string, CDPSession>();
  constructor(private page: Page, private cdp: CDPSession) {}

  async capture(): Promise<Capture> {
    await this.page.prepareFrames?.();
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
    const frameSessions = new Map<string, { tree: FrameTree; cdp: CDPSession; parentId?: string }>();
    const visit = (tree: FrameTree, cdp: CDPSession, parentId?: string) => {
      const previous = frameSessions.get(tree.frame.id);
      frameSessions.set(tree.frame.id, { tree, cdp, parentId: parentId ?? tree.frame.parentId ?? previous?.parentId });
      for (const child of tree.childFrames ?? []) visit(child, cdp, tree.frame.id);
    };
    for (const { tree, cdp } of roots) visit(tree, cdp);
    this.frames = frameSessions;
    const stamps: FrameStamp[] = [];
    // Install revision observers before reading any accessibility trees.
    for (const [frameId, { cdp }] of frameSessions) stamps.push(await this.revisions.capture(frameId, cdp));
    this.contextIds = new Map(stamps.map(stamp => [stamp.frameId, stamp.contextId]));
    const liveFrames = new Set(frameSessions.keys());
    for (const [frameId, session] of this.sessions) if (!liveFrames.has(frameId)) { await session.detach().catch(() => undefined); this.sessions.delete(frameId); }
    const liveIdentities = new Set<string>();
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
        liveIdentities.add(identity);
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
        if (node.backendDOMNodeId !== undefined) bindings.set(id, { backendNodeId: node.backendDOMNodeId, frameId, loaderId, cdp, contextId: this.contextIds.get(frameId) });
      }
    }
    for (const identity of this.identities.keys()) if (!liveIdentities.has(identity)) this.identities.delete(identity);
    await this.revisions.verify(stamps);
    return { elements, bindings, warnings, stamps };
  }

  async toMainFramePoint(frameId: string, point: { x: number; y: number }): Promise<{ x: number; y: number }> {
    let current = this.frames.get(frameId);
    const visited = new Set<string>();
    while (current?.parentId) {
      if (visited.has(current.tree.frame.id)) throw new CuaError('STALE_OBSERVATION', 'Frame hierarchy is inconsistent.');
      visited.add(current.tree.frame.id);
      const parent = this.frames.get(current.parentId);
      if (!parent) throw new CuaError('STALE_OBSERVATION', 'Parent frame disappeared.');
      const owner = await parent.cdp.send('DOM.getFrameOwner', { frameId: current.tree.frame.id });
      point = await onElement({ backendNodeId: owner.backendNodeId, frameId: parent.tree.frame.id, loaderId: parent.tree.frame.loaderId, cdp: parent.cdp, contextId: this.contextIds.get(parent.tree.frame.id) }, `function (point) {
        const r = this.getBoundingClientRect(), style = getComputedStyle(this);
        if (!this.isConnected || !r.width || !r.height) throw new Error('Frame has no visible bounds');
        if (style.transform !== 'none') {
          const matrix = new DOMMatrixReadOnly(style.transform);
          if (!matrix.is2D || matrix.b || matrix.c || matrix.a <= 0 || matrix.d <= 0) throw new Error('Rotated or reflected frames are not supported');
        }
        const sx = r.width / this.offsetWidth, sy = r.height / this.offsetHeight;
        const x = r.left + (point.x + this.clientLeft) * sx;
        const y = r.top + (point.y + this.clientTop) * sy;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) throw new Error('Frame point is outside parent viewport');
        if (this.getRootNode().elementFromPoint(x,y) !== this) throw new Error('Frame is covered');
        return { x, y };
      }`, [point]);
      current = parent;
    }
    if (!current || current.cdp !== this.cdp) throw new CuaError('STALE_OBSERVATION', 'Cannot resolve frame point to main target.');
    return point;
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
  const { object } = await binding.cdp.send('DOM.resolveNode', { backendNodeId: binding.backendNodeId, ...(binding.contextId === undefined ? {} : { executionContextId: binding.contextId }) });
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
