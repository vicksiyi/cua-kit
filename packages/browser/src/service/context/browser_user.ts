import { readTabContext, type TabReader } from "./tab_context";
export interface BrowserUserProvider {
  getUserTabs(): Promise<unknown>;
  claimUserTab(tabId: number): Promise<unknown>;
  executeTabRead(request: {
    tabId: number;
    expectedUrl: string;
    read: Parameters<TabReader>[0];
  }): Promise<unknown>;
}
/** Original service lg; distinct from the client BrowserUser API. */
export class ServiceBrowserUser {
  api: BrowserUserProvider;
  captureTabPdfToLibrary:
    | ((request: {
        tabId: number;
        expectedUrl: string;
      }) => Promise<Record<string, unknown> | null | undefined>)
    | undefined;
  constructor(
    api: BrowserUserProvider,
    captureTabPdfToLibrary?: ServiceBrowserUser["captureTabPdfToLibrary"],
  ) {
    this.api = api;
    this.captureTabPdfToLibrary = captureTabPdfToLibrary;
  }
  async openTabs() {
    return await this.api.getUserTabs();
  }
  async getTabContext(tabId: number, expectedUrl: string) {
    const captured = await this.captureTabPdfToLibrary?.({
      tabId,
      expectedUrl,
    });
    return captured != null
      ? {
          kind: "library_file",
          ...captured,
          mimeType: "application/pdf",
          url: expectedUrl,
        }
      : await readTabContext({
          expectedUrl,
          read: (read) => this.api.executeTabRead({ tabId, expectedUrl, read }),
        });
  }
  async claimTab(tabId: number) {
    return await this.api.claimUserTab(tabId);
  }
}
