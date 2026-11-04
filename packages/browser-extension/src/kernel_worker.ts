import { createBrowserRpcPeerClass, type BrowserRpcTransport } from "@core/core/browserRpcPeer";
import { createKernelBrowserRuntime } from "@core/browser/kernelBrowserRuntime";
import { KernelAgentTransport } from "./kernel_frame_host";
import { serializeKernelError } from "./kernel_offscreen";
const RpcPeer = createBrowserRpcPeerClass(false);
/** Original worker up. */
export class KernelWorkerAgentClient extends RpcPeer {
  constructor(transport: BrowserRpcTransport) {
    super(transport);
    this.setup = this.setup.bind(this);
    this.execute = this.execute.bind(this);
    this.display = this.display.bind(this);
  }
  setup() { return this.sendRequest("setup"); }
  execute(command: unknown) { return this.sendRequest("execute", command); }
  display(value: unknown) { return this.sendRequest("display", value); }
}
export interface KernelWorkerScope {
  eval: typeof globalThis.eval;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  postMessage(value: unknown): void;
  nodeRepl?: { write(value: unknown): Promise<void> };
  display?: (value: unknown) => Promise<void>;
  setupBrowserRuntime?: () => Promise<unknown>;
}
/** Original pp. Successful script scopes are retained; failed new scopes are discarded. */
export function registerKernelWorker(scope: KernelWorkerScope) {
  let evaluator = { evaluate: scope.eval };
  let queue = Promise.resolve();
  scope.addEventListener("message", event => {
    if (event.data.type === "js-kernel:agent-port") {
      const port = event.ports[0];
      if (port == null) return;
      const agent = new KernelWorkerAgentClient(new KernelAgentTransport(port));
      const displayValue = async (value: unknown) => { await agent.display(value); };
      const displayImage = async (value: Uint8Array) => { await agent.display(value); };
      scope.nodeRepl = { write: displayValue };
      Object.assign(scope, { display: displayValue });
      scope.setupBrowserRuntime = async () => {
        const { apiManifest, disabledMemberIds } = await agent.setup() as any;
        return createKernelBrowserRuntime({ apiManifest, disabledMemberIds: new Set(disabledMemberIds),
          displayBridge: { displayImage, displayValue }, executeAgentCommand: command => agent.execute(command) });
      };
      return;
    }
    const { id, script } = event.data;
    queue = queue.then(async () => {
      try {
        let next = evaluator;
        await evaluator.evaluate(`(async function () {
arguments[0]({ evaluate(source) { return eval(source); } });
${script}
})`)((value: typeof evaluator) => { next = value; });
        evaluator = next;
        scope.postMessage({ id, ok: true });
      } catch (error) { scope.postMessage({ error: serializeKernelError(error), id, ok: false }); }
    });
  });
}
