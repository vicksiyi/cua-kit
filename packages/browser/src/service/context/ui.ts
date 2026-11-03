export interface MouseProvider {
  moveMouse(request: {
    tabId: number;
    waitForArrival?: false;
    x: number;
    y: number;
  }): Promise<unknown>;
}
/** Original bg; cursor movement is best effort, including synchronous provider failures. */
export class BrowserUi {
  api: MouseProvider;
  constructor(api: MouseProvider) {
    this.api = api;
  }
  async moveMouse(
    tabId: number,
    x: number,
    y: number,
    options: { waitForArrival?: boolean } = {},
  ) {
    try {
      const pending = this.api.moveMouse({
        tabId,
        ...(options.waitForArrival === false
          ? { waitForArrival: false as const }
          : {}),
        x,
        y,
      });
      if (options.waitForArrival === false) {
        pending.catch(() => {});
        return;
      }
      await pending;
    } catch {}
  }
}
