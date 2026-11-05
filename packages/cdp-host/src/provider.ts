import { prepareCdpEvent } from "./event-forwarding";
import {
  validateFinalizedTabs,
  partitionFinalizedTabs,
} from "@core/browser-extension/sessionFinalization";
/** Independent provider for the restored BrowserApi wire contract. */
import type { BrowserContext, Page } from "playwright";
import type { CdpConnection, CdpEvent } from "./connection";
import { createNetworkPolicyPredicate } from "@core/browser-extension/networkPolicy";
import {
  validateCdpCommand,
  filterCdpResult,
} from "@core/browser-extension/cdpSecurity";
type Tab = {
  id: number;
  targetId: string;
  sessionId?: string;
  owner?: string;
  origin?: "agent" | "user";
  mark?: "handoff" | "deliverable";
  allowed?: (url: string) => boolean;
};
export class CdpProvider {
  private nextTab = 0;
  private endedTurns = new Set<string>();
  private turnKey(request: any) {
    if (
      typeof request.session_id !== "string" ||
      !request.session_id ||
      typeof request.turn_id !== "string" ||
      !request.turn_id
    )
      throw Error("CDP requires session_id and turn_id");
    return JSON.stringify([request.session_id, request.turn_id]);
  }
  private activeTurn(request: any) {
    const key = this.turnKey(request);
    if (this.endedTurns.has(key)) throw Error("CDP turn has already ended");
    return key;
  }
  private tabs = new Map<number, Tab>();
  private sessionTabs = new Map<string, Tab>();
  private stop: () => void;
  private nestedTargets = new Map<
    string,
    { sessionId: string; tab: Tab; parentSessionId: string }
  >();
  private pageTargets = new WeakMap<Page, Promise<string>>();
  constructor(
    private cdp: CdpConnection,
    private notify: (method: string, params: unknown) => void,
    private context: BrowserContext,
  ) {
    this.stop = cdp.onEvent((event) => {
      void this.event(event).catch((error) => {
        console.error(
          "CDP event handler failed:",
          event.method,
          error instanceof Error ? error.message : "unknown error",
        );
        cdp.close();
      });
    });
  }
  async installNetworkRouting() {
    // Context-level interception covers child frames and newly opened pages too.
    // Unclaimed pages have no policy and cannot send network requests.
    await this.context.route("**/*", async (route) => {
      try {
        const page = route.request().frame().page();
        const pending = this.pageTargets.get(page);
        if (!pending) {
          await route.abort("blockedbyclient");
          return;
        }
        const targetId = await pending;
        const tab = [...this.tabs.values()].find(
          (tab) => tab.targetId === targetId,
        );
        if (tab?.allowed?.(route.request().url()) === true)
          await route.continue();
        else await route.abort("blockedbyclient");
      } catch (error) {
        console.error("CDP routing failure", String(error));
        await route.abort("blockedbyclient").catch(() => {});
      }
    });
    // WebSocket routing lacks the originating frame in this provider. Fail closed
    // until per-page routing is implemented instead of silently bypassing policy.
    await this.context.routeWebSocket("**/*", (socket) => socket.close());
  }
  private async pageTarget(page: Page) {
    let pending = this.pageTargets.get(page);
    if (!pending) {
      pending = (async () => {
        const session = await this.context.newCDPSession(page);
        try {
          return (await session.send("Target.getTargetInfo")).targetInfo
            .targetId;
        } finally {
          await session.detach();
        }
      })();
      this.pageTargets.set(page, pending);
    }
    return pending;
  }
  private async refresh() {
    await Promise.all(
      this.context.pages().map((page) => this.pageTarget(page)),
    );
    const { targetInfos } = await this.cdp.send("Target.getTargets");
    const live = new Set<string>();
    for (const target of targetInfos) {
      if (target.type !== "page") continue;
      live.add(target.targetId);
      if (
        ![...this.tabs.values()].some((tab) => tab.targetId === target.targetId)
      )
        this.tabs.set(++this.nextTab, {
          id: this.nextTab,
          targetId: target.targetId,
        });
    }
    for (const [id, tab] of this.tabs)
      if (!live.has(tab.targetId)) {
        this.tabs.delete(id);
        if (tab.sessionId) this.sessionTabs.delete(tab.sessionId);
      }
    return targetInfos;
  }
  private tab(id: number) {
    const tab = this.tabs.get(id);
    if (!tab) throw Error("Unknown CDP tab");
    return tab;
  }
  private own(request: any, tab: Tab) {
    this.activeTurn(request);
    if (typeof request.session_id !== "string" || !request.session_id)
      throw Error("CDP requires session_id");
    if (tab.owner && tab.owner !== request.session_id)
      throw Error("CDP tab belongs to another session");
    tab.owner = request.session_id;
  }
  private async event(event: CdpEvent) {
    const tab = event.sessionId
      ? this.sessionTabs.get(event.sessionId)
      : undefined;
    if (!tab) return;
    if (event.method === "Fetch.requestPaused") {
      const allowed = tab.allowed?.(event.params.request.url) === true;
      await this.cdp.send(
        allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
        {
          requestId: event.params.requestId,
          ...(allowed ? {} : { errorReason: "BlockedByClient" }),
        },
        event.sessionId,
      );
      return;
    }
    if (event.method === "Target.attachedToTarget") {
      const { sessionId, targetInfo } = event.params;
      this.sessionTabs.set(sessionId, tab);
      this.nestedTargets.set(targetInfo.targetId, {
        sessionId,
        tab,
        parentSessionId: event.sessionId!,
      });
      await this.cdp.send(
        "Fetch.enable",
        { patterns: [{ urlPattern: "*", requestStage: "Request" }] },
        sessionId,
      );
      if (event.params.waitingForDebugger)
        await this.cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId);
    }
    if (event.method === "Target.detachedFromTarget") {
      this.sessionTabs.delete(event.params.sessionId);
      for (const [target, entry] of this.nestedTargets)
        if (entry.sessionId === event.params.sessionId)
          this.nestedTargets.delete(target);
    }
    const forwarded = prepareCdpEvent(event);
    if (!forwarded) return;
    this.notify("onCDPEvent", {
      source: {
        tabId: tab.id,
        ...(event.sessionId !== tab.sessionId
          ? { sessionId: event.sessionId }
          : {}),
      },
      method: forwarded.method,
      params: forwarded.params,
    });
  }
  private names = new Map<string, string>();
  nameSession(request: any) {
    this.activeTurn(request);
    if (
      typeof request.session_id !== "string" ||
      typeof request.name !== "string"
    )
      throw Error("Invalid session name");
    this.names.set(request.session_id, request.name);
  }
  async finalizeTabs(request: any) {
    this.activeTurn(request);
    if (typeof request.session_id !== "string" || !request.session_id)
      throw Error("CDP requires session_id");
    if (!Array.isArray(request.keep))
      throw Error("finalizeTabs requires a keep array");
    const owned = [...this.tabs.values()].filter(
      (tab) => tab.owner === request.session_id,
    );
    const marks = validateFinalizedTabs(
      request.keep,
      new Set(owned.map((tab) => tab.id)),
    );
    for (const tab of owned)
      tab.mark = marks.get(tab.id) as "handoff" | "deliverable" | undefined;
    await this.turnEnded(request);
  }
  async markTab(request: any) {
    const tab = this.tab(request.tabId);
    this.own(request, tab);
    validateFinalizedTabs(
      [{ tabId: tab.id, status: request.status }],
      new Set([tab.id]),
    );
    tab.mark = request.status;
  }
  async turnEnded(request: any) {
    const key = this.turnKey(request);
    if (this.endedTurns.has(key)) return;
    if (typeof request.session_id !== "string" || !request.session_id)
      throw Error("CDP requires session_id");
    const owned = [...this.tabs.values()].filter(
      (tab) => tab.owner === request.session_id,
    );
    const groups = partitionFinalizedTabs(
      owned.map((tab) => ({
        tabId: tab.id,
        origin: tab.origin,
        mark: tab.mark,
      })),
    );
    for (const tab of owned) {
      if (tab.sessionId) await this.detach({ ...request, tabId: tab.id });
      if (groups.close.includes(tab.id)) {
        await this.cdp.send("Target.closeTarget", { targetId: tab.targetId });
        this.tabs.delete(tab.id);
      } else if (!groups.handoff.includes(tab.id)) {
        tab.owner = undefined;
        tab.origin = "user";
        tab.mark = undefined;
      }
    }
    this.endedTurns.add(key);
  }

  ping() {
    return "pong";
  }
  async getInfo() {
    return {
      type: "cdp",
      family: "chrome",
      name: "Core CDP Chromium",
      version: (await this.cdp.send("Browser.getVersion")).product,
      capabilities: { browser: [], tab: [] },
      apiSupportOverrides: { "Tab.ax": false },
      metadata: { provider: "core-cdp-host" },
    };
  }
  async getTabs() {
    const infos = await this.refresh();
    return [...this.tabs.values()].map((tab) => {
      const target = infos.find(
        (target: any) => target.targetId === tab.targetId,
      );
      return { id: tab.id, url: target.url, title: target.title, windowId: 1 };
    });
  }
  getUserTabs() {
    return this.getTabs();
  }
  async claimUserTab(request: any) {
    await this.refresh();
    const tab = this.tab(request.tabId);
    this.own(request, tab);
    tab.origin ??= "user";
    return (await this.getTabs()).find((value) => value.id === tab.id);
  }
  async createTab(request: any) {
    this.activeTurn(request);
    if (typeof request.session_id !== "string" || !request.session_id)
      throw Error("CDP requires session_id");
    const page = await this.context.newPage();
    const targetId = await this.pageTarget(page);
    await this.refresh();
    const tab = [...this.tabs.values()].find(
      (tab) => tab.targetId === targetId,
    )!;
    this.own(request, tab);
    tab.origin = "agent";
    return (await this.getTabs()).find((value) => value.id === tab.id);
  }
  async attach(request: any) {
    const tab = this.tab(request.tabId);
    this.own(request, tab);
    if (
      !request.networkPolicy ||
      !Array.isArray(request.networkPolicy.constraints)
    )
      throw Error("CDP attach requires explicit network constraints");
    const allowed = createNetworkPolicyPredicate(
      request.networkPolicy.constraints,
    );
    const { targetInfo } = await this.cdp.send("Target.getTargetInfo", {
      targetId: tab.targetId,
    });
    if (targetInfo.url !== "about:blank" && !allowed(targetInfo.url))
      throw Error("Current CDP page is outside network policy");
    if (!tab.sessionId) {
      const { sessionId } = await this.cdp.send("Target.attachToTarget", {
        targetId: tab.targetId,
        flatten: true,
      });
      tab.sessionId = sessionId;
      this.sessionTabs.set(sessionId, tab);
    }
    tab.allowed = allowed;
    await this.cdp.send(
      "Fetch.enable",
      { patterns: [{ urlPattern: "*", requestStage: "Request" }] },
      tab.sessionId,
    );
  }
  async attachBrowserUseNetworkPolicy(request: any) {
    await this.attach({ ...request, networkPolicy: request.policy });
  }
  async executeCdp(request: any) {
    const tab = this.tab(request.target?.tabId);
    this.own(request, tab);
    if (!tab.sessionId || !tab.allowed)
      throw Error("CDP tab is not attached with a network policy");
    const nested = request.target.targetId
      ? this.nestedTargets.get(request.target.targetId)
      : undefined;
    if (request.target.targetId && nested?.tab !== tab)
      throw Error("Unknown or unowned CDP target");
    const targetSession =
      request.target.sessionId ?? nested?.sessionId ?? tab.sessionId;
    if (
      this.sessionTabs.get(targetSession) !== tab ||
      (nested && nested.sessionId !== targetSession)
    )
      throw Error("Unsupported or unowned nested CDP target");
    if (
      request.method.startsWith("Fetch.") ||
      [
        "Browser.close",
        "Target.createTarget",
        "Target.attachToTarget",
        "Target.detachFromTarget",
        "Target.closeTarget",
      ].includes(request.method)
    )
      throw Error(
        "CDP provider lifecycle method is not exposed to page commands",
      );
    validateCdpCommand(request.method, request.commandParams);
    return filterCdpResult(
      request.method,
      await this.cdp.send(
        request.method,
        request.method === "Target.setAutoAttach" &&
          request.commandParams?.autoAttach
          ? { ...request.commandParams, waitForDebuggerOnStart: true }
          : request.commandParams,
        targetSession,
        request.timeoutMs,
      ),
    );
  }
  async attachTarget(request: any) {
    const tab = this.tab(request.tabId);
    this.own(request, tab);
    if (this.nestedTargets.get(request.targetId)?.tab !== tab)
      throw Error("Target has not been observed under the owned tab");
  }
  async detachTarget(request: any) {
    const tab = this.tab(request.tabId);
    this.own(request, tab);
    const entry = this.nestedTargets.get(request.targetId);
    if (!entry) return;
    if (entry.tab !== tab) throw Error("Target belongs to another tab");
    await this.cdp.send(
      "Target.detachFromTarget",
      {
        sessionId: entry.sessionId,
      },
      entry.parentSessionId,
    );
    this.sessionTabs.delete(entry.sessionId);
    this.nestedTargets.delete(request.targetId);
  }
  async getCommittedTabUrl(request: any) {
    const tab = this.tab(request.tabId);
    this.own(request, tab);
    return (
      await this.cdp.send("Target.getTargetInfo", { targetId: tab.targetId })
    ).targetInfo.url;
  }
  async focusTab(request: any) {
    const tab = this.tab(request.tabId);
    this.own(request, tab);
    await this.cdp.send("Target.activateTarget", { targetId: tab.targetId });
    return true;
  }
  async detach(request: any) {
    const tab = this.tab(request.tabId);
    this.own(request, tab);
    if (tab.sessionId) {
      await this.cdp.send("Target.detachFromTarget", {
        sessionId: tab.sessionId,
      });
      this.sessionTabs.delete(tab.sessionId);
      for (const [id, entry] of this.nestedTargets)
        if (entry.tab === tab) {
          this.sessionTabs.delete(entry.sessionId);
          this.nestedTargets.delete(id);
        }
      tab.sessionId = undefined;
    }
    tab.allowed = undefined;
  }
  close() {
    this.stop();
  }
}
