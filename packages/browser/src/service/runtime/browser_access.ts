import { createPublicKey, randomBytes, verify } from "node:crypto";
import { BrowserRpcPeer, type BrowserRpcTransport } from "./rpc_peer";
import { codexTurnMetadata } from "../preferences/request_context";
export const browserAccessMethod = "browser/access";
export const browserAccessDomain = "codex.browserAccess.v1";
export interface BrowserAccessRequest {
  executorId: any;
  sessionId: any;
  turnId: any;
  nonce: string;
}
export class BrowserAccessClient extends BrowserRpcPeer {
  read(request: BrowserAccessRequest) {
    return this.sendRequest(browserAccessMethod, request);
  }
}
export interface BrowserAccessDependencies {
  connect(path: string): Promise<BrowserRpcTransport>;
  randomBytes?: (size: number) => Buffer;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}
/** Original H6/uce/Gx. Verifies signature and the exact serialized grant; failed turns remain cached. */
export function createBrowserAccessVerifier(deps: BrowserAccessDependencies) {
  async function verifyAccess(runtime: any, request: BrowserAccessRequest) {
    const pipe = runtime.env.BROWSER_USE_ACCESS_PIPE_PATH,
      identity = runtime.env.BROWSER_USE_ACCESS_VERIFYING_IDENTITY;
    if (!pipe || !identity)
      throw Error("The browser access host is unavailable");
    const publicKey = createPublicKey({
      key: Buffer.from(identity, "base64"),
      type: "spki",
      format: "der",
    });
    const transport = await deps.connect(pipe);
    const timer = (deps.setTimeout ?? setTimeout)(() => {
      transport.close?.();
    }, 10000);
    try {
      const response = await new BrowserAccessClient(transport).read(request);
      if (
        typeof response?.payload !== "string" ||
        typeof response.signature !== "string" ||
        !verify(
          null,
          Buffer.from(response.payload),
          publicKey,
          Buffer.from(response.signature, "base64"),
        )
      )
        throw Error("Cannot authenticate the browser access response");
      if (
        response.payload !==
        JSON.stringify({ domain: browserAccessDomain, request, allowed: true })
      )
        throw Error("Local browser use is disabled in Work settings");
    } finally {
      (deps.clearTimeout ?? clearTimeout)(timer);
      await transport.close?.();
    }
  }
  function createAssertion(runtime: any) {
    const executorId = runtime.env.BROWSER_USE_ACCESS_EXECUTOR_ID;
    let lastTurn: string | undefined, pending: Promise<void> | undefined;
    return async () => {
      if (executorId == null) return;
      const metadata = codexTurnMetadata(runtime);
      if (!metadata?.session_id || !metadata.turn_id)
        throw Error("Cannot verify browser access without the current turn");
      const key = JSON.stringify([metadata.session_id, metadata.turn_id]);
      if (key !== lastTurn) {
        lastTurn = key;
        pending = verifyAccess(runtime, {
          executorId,
          sessionId: metadata.session_id,
          turnId: metadata.turn_id,
          nonce: (deps.randomBytes ?? randomBytes)(32).toString("hex"),
        });
      }
      await pending;
    };
  }
  return { verifyAccess, createAssertion };
}
