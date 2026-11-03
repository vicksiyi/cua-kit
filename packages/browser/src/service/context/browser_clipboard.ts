import { createClipboardClass } from "./clipboard";
import { createPageClipboardBridgeClass } from "./clipboard_bridge";
import { clipboardInstallationScript } from "./clipboard_page";
export const PageClipboardBridge = createPageClipboardBridgeClass(
  clipboardInstallationScript,
);
export const BrowserClipboard = createClipboardClass(PageClipboardBridge);
