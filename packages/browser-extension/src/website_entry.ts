import { ContentScriptContext } from "wxt/utils/content-script-context";
import { defineContentScript } from "wxt/utils/define-content-script";
import { installWebsiteContent } from "./website_content";
const definition = defineContentScript({
  allFrames: false,
  matches: ["https://chatgpt.com/*"],
  registration: "manifest",
  runAt: "document_start",
  main(context) {
    installWebsiteContent(context, {
      window,
      document,
      navigator,
      chrome,
      setTimeout,
      clearTimeout,
    });
  },
});
export const startup = (async () => {
  const { main, ...options } = definition;
  return await main(new ContentScriptContext("chatgpt-website", options));
})();
