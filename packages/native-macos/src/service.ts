/** Explicit independent deployment service; never falls back to the vendor IPC. */
import { isAbsolute } from "node:path";
import { NativeHelper } from "./helper";
import { createNativeMacClient } from "./client";
import { createSkyService, type SkyServiceRequest } from "@core/sky/serviceFactory";
const host = (globalThis as any).nodeRepl;
const helperPath = host?.env?.CORE_CUA_NATIVE_HELPER_PATH ?? process.env.CORE_CUA_NATIVE_HELPER_PATH;
if (typeof helperPath !== "string" || !isAbsolute(helperPath))
  throw new Error("CORE_CUA_NATIVE_HELPER_PATH must be an absolute independent helper executable");
let pending: Promise<ReturnType<typeof createSkyService>> | undefined;
async function connect() {
  const {helper} = await NativeHelper.connect(helperPath);
  const client = createNativeMacClient(helper, async ({app,operation,effect}) => {
    if (typeof host?.createElicitation !== "function") throw new Error("Native app access requires host approval support");
    const response = await host.createElicitation({
      message: `Allow independent Computer Use to ${effect === "read" ? "read" : "operate"} ${app.name} (${app.bundleId})?`,
      meta: {codex_approval_kind:"mcp_tool_call",connector_id:"core-native-macos",connector_name:"Independent Computer Use",tool_name:operation,tool_params:{app:app.bundleId,pid:app.pid}},
    });
    if (response?.action !== "accept") throw new Error("Native app operation was not approved");
  });
  return createSkyService(() => client);
}
export async function handleRpc(request: SkyServiceRequest) {
  return (await (pending ??= connect())).handleRpc(request);
}
