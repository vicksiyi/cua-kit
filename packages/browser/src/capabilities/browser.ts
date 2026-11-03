import { BrowserCapability, defineBrowserCapability } from "./base";
import type { BrowserCapabilityOptions } from "./base";
import {
  ManagementCallCommand,
  ManagementAuditTrailCommand,
  VisibilityGetCommand,
  VisibilitySetCommand,
  ViewportResetCommand,
  ViewportSetCommand,
} from "../commands/browser_capabilities";
/** Original Lh. Dynamic namespaces are deliberately non-thenable and do not cache methods. */
export class ManagementBrowserCapability extends BrowserCapability {
  declare windows: Record<string, (...args: unknown[]) => Promise<unknown>>;
  declare tabs: Record<string, (...args: unknown[]) => Promise<unknown>>;
  declare tabGroups: Record<string, (...args: unknown[]) => Promise<unknown>>;
  declare bookmarks: Record<string, (...args: unknown[]) => Promise<unknown>>;
  constructor({
    browserId,
    documentation,
    info,
    transport,
  }: BrowserCapabilityOptions) {
    super(transport, browserId, documentation, info);
    this.windows = this.createNamespace("windows");
    this.tabs = this.createNamespace("tabs");
    this.tabGroups = this.createNamespace("tabGroups");
    this.bookmarks = this.createNamespace("bookmarks");
  }
  async getAuditTrail() {
    const response = await this.transport.send({
      command: ManagementAuditTrailCommand.create({
        browser_id: this.browserId,
      }),
    });
    return ManagementAuditTrailCommand.ResultSchema.parse(response);
  }
  async invoke(namespace: string, method: string, ...args: unknown[]) {
    const response = await this.transport.send({
      command: ManagementCallCommand.create({
        args,
        browser_id: this.browserId,
        method,
        namespace,
      }),
    });
    return ManagementCallCommand.ResultSchema.parse(response).value;
  }
  createNamespace(
    namespace: string,
  ): Record<string, (...args: unknown[]) => Promise<unknown>> {
    return new Proxy(
      {},
      {
        get: (_target, key) => {
          if (
            typeof key === "string" &&
            key !== "then" &&
            key !== "toJSON" &&
            !(key in Object.prototype)
          )
            return (...args: unknown[]) => this.invoke(namespace, key, ...args);
        },
      },
    );
  }
}
/** Original em. */
export class VisibilityBrowserCapability extends BrowserCapability {
  constructor({
    browserId,
    documentation,
    info,
    transport,
  }: BrowserCapabilityOptions) {
    super(transport, browserId, documentation, info);
  }
  async set(visible: boolean) {
    const response = await this.transport.send({
      command: VisibilitySetCommand.create({
        browser_id: this.browserId,
        visible,
      }),
    });
    VisibilitySetCommand.ResultSchema.parse(response);
  }
  async get() {
    const response = await this.transport.send({
      command: VisibilityGetCommand.create({ browser_id: this.browserId }),
    });
    return VisibilityGetCommand.ResultSchema.parse(response).visible;
  }
}
/** Original pm. */
export class ViewportBrowserCapability extends BrowserCapability {
  constructor({
    browserId,
    documentation,
    info,
    transport,
  }: BrowserCapabilityOptions) {
    super(transport, browserId, documentation, info);
  }
  async set(options: { height: number; width: number }) {
    const response = await this.transport.send({
      command: ViewportSetCommand.create({
        browser_id: this.browserId,
        ...options,
      }),
    });
    ViewportSetCommand.ResultSchema.parse(response);
  }
  async reset() {
    const response = await this.transport.send({
      command: ViewportResetCommand.create({ browser_id: this.browserId }),
    });
    ViewportResetCommand.ResultSchema.parse(response);
  }
}
// Original Bh/tm/bm/_m/ym; descriptions are preserved byte-for-byte.
export const managementBrowserCapabilityDefinition = defineBrowserCapability({
  capability: ManagementBrowserCapability,
  info: {
    id: "management",
    description:
      "Organize windows, tabs, tab groups, and bookmarks. Use only for user-requested browser organization.",
  },
});
export const visibilityBrowserCapabilityDefinition = defineBrowserCapability({
  capability: VisibilityBrowserCapability,
  info: {
    id: "visibility",
    description:
      "Use to show or hide the browser to the user, and to determine the browser's current visibility. Keep browser work in the background unless the user asks to see it or live viewing is useful. When the browser should be visible, call set(true).",
  },
});
export const viewportBrowserCapabilityDefinition = defineBrowserCapability({
  capability: ViewportBrowserCapability,
  info: {
    id: "viewport",
    description:
      "Controls an explicit browser viewport override for responsive or device-size testing. Use it when a task calls for specific dimensions or breakpoint validation; otherwise leave it unset so the browser uses its normal viewport. Reset temporary overrides before finishing unless the user asked to keep them.",
  },
});
export const browserCapabilityDefinitions = [
  managementBrowserCapabilityDefinition,
  visibilityBrowserCapabilityDefinition,
  viewportBrowserCapabilityDefinition,
];
export const browserCapabilityFactories = new Map(
  browserCapabilityDefinitions.map((definition) => [
    definition.id,
    definition.create,
  ]),
);
