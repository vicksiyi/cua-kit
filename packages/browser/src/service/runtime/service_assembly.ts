import { browserPerformanceSpan } from "./performance_span";
import {
  assembleBrowserHost,
  type BrowserHostAssemblyOptions,
} from "./host_assembly";
import {
  assembleCommandRuntime,
  type CommandRuntimeAssemblyOptions,
} from "./command_runtime_assembly";
import {
  createServiceRpcDispatcher,
  type ServiceDispatcherDependencies,
} from "../rpc_dispatch";
export interface BrowserServiceAssemblyOptions {
  host?: BrowserHostAssemblyOptions;
  runtime: CommandRuntimeAssemblyOptions;
  withSpan?: ServiceDispatcherDependencies<any>["withSpan"];
}
/** Connect restored mH host, p6 runtime and iy/hH/Gut dispatcher in one module lifetime.
 * The privileged bridge remains a host capability; this does not replace it with an unrestricted socket backend. */
export function assembleBrowserService(options: BrowserServiceAssemblyOptions) {
  const host = assembleBrowserHost(options.host);
  const runtime = assembleCommandRuntime(options.runtime);
  const handleRpc = createServiceRpcDispatcher({
    createHostRuntime: host.createHost,
    initializeRuntime: runtime.createRuntime,
    withSpan: options.withSpan ?? browserPerformanceSpan.withSpan,
  });
  return { handleRpc, dispose: runtime.dispose };
}
