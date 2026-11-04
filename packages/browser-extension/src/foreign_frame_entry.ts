import { ContentScriptContext } from "wxt/utils/content-script-context";
import { defineContentScript } from "wxt/utils/define-content-script";
import { installForeignFrameMonitor } from "./foreign_frame_dom";
const definition = defineContentScript({
  matchAboutBlank: true,
  matches: ["<all_urls>"],
  registration: "runtime",
  runAt: "document_start",
  main() {
    installForeignFrameMonitor();
  },
});
export const startup = (async () => {
  try {
    const { main, ...options } = definition;
    return await main(
      new ContentScriptContext("foreign-frame-monitor", options),
    );
  } catch (error) {
    throw error;
  }
})();
