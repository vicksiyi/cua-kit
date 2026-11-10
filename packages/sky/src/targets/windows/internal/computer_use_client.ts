import { WindowsDesktopClient } from "../desktop_client";
import { package_bin } from "../../../core/package_bin";
import {
  WindowsComputerUseClientBase,
  type WindowsComputerUseTransport,
} from "./computer_use_client_base";
import {
  WindowsHelperTransport,
  type HelperTransportOptions,
} from "./helper_transport";
import { WindowsNativePipeTransport } from "./native_pipe_transport";
export type WindowsComputerUseClientOptions = {
  helperArgs?: string[];
  helperCommand?: string;
  helperPath?: string;
  timeoutMs?: number;
  transport?: WindowsComputerUseTransport;
};
const shared = new Map<
  string,
  { refCount: number; transport: WindowsHelperTransport }
>();
function choose(options: WindowsComputerUseClientOptions): {
  sharedTransportKey: string | null;
  transport: WindowsComputerUseTransport;
} {
  if (options.transport != null)
    return { sharedTransportKey: null, transport: options.transport };
  const host = (globalThis as any).nodeRepl;
  if (host?.env?.SKY_CUA_NATIVE_PIPE === "1")
    return {
      sharedTransportKey: null,
      transport: new WindowsNativePipeTransport(host, options.timeoutMs),
    };
  const settings: HelperTransportOptions = {
    helperArgs:
      options.helperCommand == null
        ? [...(options.helperArgs ?? []), "--parent-pid", String(process.pid)]
        : (options.helperArgs ?? []),
    helperCommand:
      options.helperCommand ??
      options.helperPath ??
      package_bin({
        relative_path: [
          "bin",
          "windows",
          process.arch === "arm64"
            ? "codex-computer-use-arm64.exe"
            : "codex-computer-use.exe",
        ],
        env_var_override: "OAI_SKY_WINDOWS_BIN",
      }),
    timeoutMs: options.timeoutMs,
  };
  const key = JSON.stringify(settings);
  let entry = shared.get(key);
  if (entry == null) {
    entry = { refCount: 0, transport: new WindowsHelperTransport(settings) };
    shared.set(key, entry);
  }
  entry.refCount += 1;
  return { sharedTransportKey: key, transport: entry.transport };
}
export class WindowsComputerUseClient extends WindowsComputerUseClientBase {
  static createDesktopClient(options: WindowsComputerUseClientOptions) {
    const host = (globalThis as any).nodeRepl;
    if (host?.env?.SKY_CUA_NATIVE_PIPE === "1")
      throw new Error("Windows desktop sessions require the direct Swift helper transport");
    return new WindowsDesktopClient(options.transport ?? new WindowsHelperTransport({
      helperCommand: options.helperCommand ?? options.helperPath ?? package_bin({
        relative_path: ["bin", "windows", "swift", process.arch === "arm64" ? "arm64" : "x64", "codex-computer-use-swift.exe"],
        env_var_override: "OAI_SKY_WINDOWS_BIN",
      }),
      helperArgs: options.helperCommand == null
        ? [...(options.helperArgs ?? []), "--parent-pid", String(process.pid)]
        : options.helperArgs,
      timeoutMs: options.timeoutMs,
      desktopSession: true,
      helperEnv: { SKY_WINDOWS_FULL_DESKTOP: "1" },
      preserveHelperOnTimeout: true,
    }));
  }
  #sharedKey: string | null;
  constructor(options: WindowsComputerUseClientOptions = {}) {
    const selected = choose(options);
    super({ transport: selected.transport });
    this.#sharedKey = selected.sharedTransportKey;
  }
  protected override async closeTransport() {
    const key = this.#sharedKey;
    if (key == null) {
      await super.closeTransport();
      return;
    }
    const entry = shared.get(key);
    if (entry != null) {
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        shared.delete(key);
        await super.closeTransport();
      }
    }
  }
}
Object.freeze(WindowsComputerUseClient);
