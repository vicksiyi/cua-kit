import { registerKernelOffscreen } from "./kernel_offscreen";

registerKernelOffscreen({
  runtime: chrome.runtime,
  document,
  window,
  MessageChannel,
});
