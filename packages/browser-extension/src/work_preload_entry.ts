import { defineContentScript } from "wxt/utils/define-content-script";
import { installWorkPreload } from "./work_preload";
const definition = defineContentScript({
  allFrames: true,
  matches: ["https://chatgpt.com/*"],
  registration: "manifest",
  runAt: "document_start",
  world: "MAIN",
  main() {
    installWorkPreload({ window, navigator });
  },
});
// Original MAIN-world wrapper does not construct a ContentScriptContext.
export const startup = (async () => await (definition.main as () => void)())();
