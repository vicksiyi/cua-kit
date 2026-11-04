import { registerAssembledKernelFrameHost } from "./kernel_host_assembly";
// Original TU platform projection; telemetry initialization is a separate entry concern.
const platform = navigator.platform.startsWith("Mac") ? "darwin" : navigator.platform.startsWith("Win") ? "win32" : "linux";
registerAssembledKernelFrameHost({ window, document, runtime: chrome.runtime, MessageChannel }, { platform, locks: navigator.locks });
