import * as commands from "./commands/tab_control";
import { GetTabCommand } from "./commands/tabs";
import { PlaywrightAPI } from "./playwright/api";
import { DomCUAAPI } from "./dom_cua";
import { CUAAPI } from "./cua";
import { AxClient } from "./ax";
import { ContentAPI } from "./content";
import { TabClipboardAPI } from "./clipboard";
import { TabDevAPI } from "./dev";
import {
  Capabilities,
  type TabCapability,
  type CapabilityInfo,
  type DocumentationApi,
} from "./capabilities/base";
import { tabCapabilityFactories } from "./capabilities/tab";
import {
  AlertDialog,
  BeforeUnloadDialog,
  ConfirmDialog,
  PromptDialog,
} from "./dialogs";
import type { ClientTransport } from "./runtime/function_agent_transport";
import { decodeBase64 } from "./runtime/base64";
export interface TabOptions {
  browserId: string;
  capabilities?: CapabilityInfo[];
  documentation: DocumentationApi;
  transport: ClientTransport;
  tabPayload?: { id?: string; [key: string]: unknown };
}
/** Original jh. Public members are assignments, not emitted field definitions. */
export class Tab {
  #browserId: string;
  #transport: ClientTransport;
  declare id: string;
  declare playwright: PlaywrightAPI;
  declare dom_cua: DomCUAAPI;
  declare cua: CUAAPI;
  declare ax: AxClient;
  declare content: ContentAPI;
  declare clipboard: TabClipboardAPI;
  declare dev: TabDevAPI;
  declare capabilities: Capabilities<TabCapability>;
  constructor({
    browserId,
    capabilities,
    documentation,
    transport,
    tabPayload = {},
  }: TabOptions) {
    if (!tabPayload.id) throw new Error("Tab requires an id");
    this.#browserId = browserId;
    this.#transport = transport;
    this.id = tabPayload.id;
    this.playwright = new PlaywrightAPI({
      browserId,
      tabId: this.id,
      transport: this.#transport,
    });
    this.dom_cua = new DomCUAAPI({
      browserId,
      tabId: this.id,
      transport: this.#transport,
    });
    this.cua = new CUAAPI({
      browserId,
      tabId: this.id,
      transport: this.#transport,
    });
    this.ax = new AxClient({
      browserId,
      tabId: this.id,
      transport: this.#transport,
    });
    this.content = new ContentAPI({
      browserId,
      tabId: this.id,
      transport: this.#transport,
    });
    this.clipboard = new TabClipboardAPI({
      browserId,
      tabId: this.id,
      transport: this.#transport,
    });
    this.dev = new TabDevAPI({
      browserId,
      tabId: this.id,
      transport: this.#transport,
    });
    // Read target id once before capability construction, matching the original helper invocation.
    const capabilityBrowserId = this.#browserId,
      capabilityTabId = this.id,
      capabilityTransport = this.#transport;
    const instances: Record<string, TabCapability> = {};
    for (const info of capabilities ?? []) {
      const create = tabCapabilityFactories.get(info.id);
      if (create != null)
        Object.assign(instances, {
          [info.id]: create({
            browserId: capabilityBrowserId,
            documentation,
            info,
            tabId: capabilityTabId,
            transport: capabilityTransport,
          }),
        });
    }
    this.capabilities = new Capabilities(instances);
  }
  async goto(url: string, options?: { prepareAccessibility?: boolean }) {
    if (!url) throw new Error("tab.goto requires a url");
    this.#requireTransport();
    if (!this.id) throw new Error("tab.goto requires a tab id");
    await this.#transport.send({
      command: commands.NavigateTab.create({
        browser_id: this.#browserId,
        tab_id: this.id,
        url,
        ...(options?.prepareAccessibility
          ? { prepare_accessibility: true as const }
          : {}),
      }),
    });
  }
  async markHandoff() {
    await this.#mark("handoff");
  }
  async markDeliverable() {
    await this.#mark("deliverable");
  }
  async requestManualHandoff() {
    return this.requestUserTakeover();
  }
  async requestUserTakeover(
    reason?: "authentication" | "captcha" | "user_requested" | "other",
  ) {
    await this.#transport.send({
      command: commands.ManualHandoff.create({
        browser_id: this.#browserId,
        tab_id: this.id,
        reason,
      }),
    });
  }
  async back() {
    this.#requireTransport();
    await this.#transport.send({
      command: commands.NavigateTabBack.create({
        browser_id: this.#browserId,
        tab_id: this.id,
      }),
    });
  }
  async forward() {
    this.#requireTransport();
    await this.#transport.send({
      command: commands.NavigateTabForward.create({
        browser_id: this.#browserId,
        tab_id: this.id,
      }),
    });
  }
  async reload() {
    this.#requireTransport();
    await this.#transport.send({
      command: commands.NavigateTabReload.create({
        browser_id: this.#browserId,
        tab_id: this.id,
      }),
    });
  }
  async close() {
    this.#requireTransport();
    await this.#transport.send({
      command: commands.CloseTab.create({
        browser_id: this.#browserId,
        tab_id: this.id,
      }),
    });
  }
  async screenshot(
    options: {
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
    } = {},
  ) {
    this.#requireTransport();
    const payload: {
      browser_id: string;
      tab_id: string;
      fullPage?: boolean;
      cropX?: number;
      cropY?: number;
      cropWidth?: number;
      cropHeight?: number;
    } = {
      browser_id: this.#browserId,
      tab_id: this.id,
      fullPage: options.fullPage,
    };
    if (options.clip) {
      const { x, y, width, height } = options.clip;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof width !== "number" ||
        typeof height !== "number"
      )
        throw new Error("tab.screenshot clip requires x, y, width, and height");
      payload.cropX = x;
      payload.cropY = y;
      payload.cropWidth = width;
      payload.cropHeight = height;
    }
    const result = await this.#transport.send({
      command: commands.TabScreenshot.create(payload),
    });
    return decodeBase64(result.data);
  }
  async title() {
    return (await this.#get()).title;
  }
  async url() {
    return (await this.#get()).url;
  }
  async getJsDialog() {
    this.#requireTransport();
    const dialog = (
      await this.#transport.send({
        command: commands.TabGetJsDialog.create({
          browser_id: this.#browserId,
          tab_id: this.id,
        }),
      })
    ).dialog;
    if (dialog != null) {
      const options = {
        browserId: this.#browserId,
        dialogId: dialog.id,
        tabId: this.id,
        transport: this.#transport,
      };
      switch (dialog.type) {
        case "alert":
          return new AlertDialog(options);
        case "beforeunload":
          return new BeforeUnloadDialog(options);
        case "confirm":
          return new ConfirmDialog(options);
        case "prompt":
          return new PromptDialog(options);
      }
    }
  }
  async #mark(status: "handoff" | "deliverable") {
    this.#requireTransport();
    await this.#transport.send({
      command: commands.MarkTab.create({
        browser_id: this.#browserId,
        tab_id: this.id,
        status,
      }),
    });
  }
  #requireTransport() {
    if (!this.#transport) throw new Error("Tab is not bound to a transport");
  }
  async #get() {
    this.#requireTransport();
    return await this.#transport.send({
      command: GetTabCommand.create({
        browser_id: this.#browserId,
        tab_id: this.id,
      }),
    });
  }
}
