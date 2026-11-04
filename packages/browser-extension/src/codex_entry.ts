import { ContentScriptContext } from "wxt/utils/content-script-context";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createCodexContent } from "./codex_content";

const content = createCodexContent({
  document,
  window,
  chrome,
  HTMLDivElement,
  MutationObserver,
  setTimeout,
});
const definition = defineContentScript({
  cssInjectionMode: "manifest",
  matchAboutBlank: true,
  matches: ["<all_urls>"],
  registration: "runtime",
  runAt: "document_start",
  main() {
    content.initialize();
  },
});
// Original Kn constructs the context but main deliberately does not consume it.
// Do not add automatic overlay/message cleanup on invalidation: the source has none.
export const startup = (async () => {
  try {
    const { main, ...options } = definition;
    return await main(new ContentScriptContext("codex", options));
  } catch (error) {
    // Original production Xn.error is a no-op and then rethrows the startup error.
    throw error;
  }
})();
