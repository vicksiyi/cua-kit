import { TabCapability, defineTabCapability } from "./base";
import type { TabCapabilityOptions } from "./base";
import { PageAssetsBundle, PageAssetsList } from "../commands/page_assets";
/** Original mh. The client parses results, but does not parse bundle payload before send. */
export class PageAssetsTabCapability extends TabCapability {
  constructor({
    browserId,
    documentation,
    info,
    tabId,
    transport,
  }: TabCapabilityOptions) {
    super(transport, browserId, tabId, documentation, info);
  }
  async list() {
    const response = await this.transport.send({
      command: PageAssetsList.create({
        browser_id: this.browserId,
        tab_id: this.tabId,
      }),
    });
    return PageAssetsList.ResultSchema.parse(response);
  }
  async bundle(options: {
    assetIds?: string[];
    inventoryId: string;
    kinds?: Array<"font" | "image" | "stylesheet" | "video">;
  }) {
    const response = await this.transport.send({
      command: PageAssetsBundle.create({
        ...options,
        browser_id: this.browserId,
        tab_id: this.tabId,
      }),
    });
    return PageAssetsBundle.ResultSchema.parse(response);
  }
}
export const pageAssetsTabCapabilityDefinition = defineTabCapability({
  capability: PageAssetsTabCapability,
  info: {
    id: "pageAssets",
    description:
      "List assets already observed in the current page state and bundle selected assets into a temporary local artifact.",
  },
});
