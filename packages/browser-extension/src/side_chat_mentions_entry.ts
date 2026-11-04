import { ContentScriptContext } from "wxt/utils/content-script-context";
import { defineContentScript } from "wxt/utils/define-content-script";
import { installSideChatMentions } from "./side_chat_mentions";
const definition = defineContentScript({
  allFrames: true,
  matches: ["https://chatgpt.com/*"],
  includeGlobs: ["*surface=browser_side_chat*"],
  registration: "manifest",
  runAt: "document_start",
  world: "ISOLATED",
  main(context) {
    installSideChatMentions(context, { window, document, chrome });
  },
});
export const startup = (async () => {
  const { main, ...options } = definition;
  return await main(
    new ContentScriptContext("side-chat-tab-mentions", options),
  );
})();
