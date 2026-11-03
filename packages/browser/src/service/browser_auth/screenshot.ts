import { captureTabScreenshot } from "../commands/screenshot";
/** Original ZM. Auth screenshots use device scale and become unavailable on capture failure. */
export async function captureAuthScreenshot(params: any, context: any) {
  try {
    const screenshot = await captureTabScreenshot(
      { tab_id: params.tab_id },
      context,
      "device",
    );
    return {
      browserId: context.browserId,
      tabId: params.tab_id,
      pageUrl: params.origin,
      url: `data:image/jpeg;base64,${screenshot.data}`,
    };
  } catch {
    return undefined;
  }
}
