/** Shared deployment of restored workers; no model or AgentLoop dependency. */
import { randomUUID } from "node:crypto";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { create_launch_environment } from "@core/cua-repl";
import { selectRuntime } from "./runtime-selection";
import { verifyNativeSupervisor } from "./native-supervisor";
import { prepareIndependentRuntime } from "./independent-runtime";
import { configureIndependentBrowser } from "./independent-browser";
import {
  stageRuntimePackages,
  restoredPackageSources,
} from "./runtime-packages";
import { withHostProxy } from "./system-proxy";

export async function readRuntimeEnvironment(
  parent: NodeJS.ProcessEnv = process.env,
) {
  const configured: unknown = JSON.parse(parent.CUA_MCP_ENV ?? "{}");
  if (
    !configured ||
    typeof configured !== "object" ||
    Array.isArray(configured) ||
    !Object.values(configured).every((value) => typeof value === "string")
  )
    throw new Error("CUA_MCP_ENV must be a JSON string map");
  if (
    Object.keys(configured).some((key) => /(?:DEEPSEEK|CUA_MODEL)/i.test(key))
  )
    throw new Error(
      "Model credentials/configuration must not be forwarded to the MCP server.",
    );
  const env = await withHostProxy(
    { ...configured } as Record<string, string>,
    parent,
  );
  for (const key of [
    "CUA_NATIVE_SUPERVISOR_PATH",
    "NODE_REPL_NODE_PATH",
    "CORE_CUA_ENDPOINT_FILES",
    "CORE_CUA_HOST_DIRECTORY",
    "CORE_CUA_RUNTIME_DIAGNOSTICS",
    "CORE_CUA_NATIVE_BACKEND",
    "CORE_CUA_NATIVE_HELPER_PATH",
    "CORE_CUA_APP_POLICY",
  ])
    if (env[key] === undefined && parent[key] !== undefined)
      env[key] = parent[key]!;
  return env;
}

export async function prepareRestoredRuntime(
  environment: Record<string, string>,
  requestedSupervisor?: string,
  sessionId: string = randomUUID(),
) {
  const selection = selectRuntime(environment, requestedSupervisor);
  let env = selection.environment;
  if (selection.supervisor === "installed") {
    if (!env.CUA_NATIVE_SUPERVISOR_PATH)
      throw new Error(
        "Set CUA_NATIVE_SUPERVISOR_PATH for the installed runtime",
      );
    await verifyNativeSupervisor(env.CUA_NATIVE_SUPERVISOR_PATH);
  }
  if (env.CUA_REPL_ENABLED_SURFACES !== undefined) {
    const built = create_launch_environment({
      env,
      instructions_directory: new URL(
        "../instructions/",
        import.meta.resolve("@core/cua-repl"),
      ),
      platform: process.platform,
    });
    env = Object.fromEntries(
      Object.entries(built).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }
  if (
    env.CUA_REPL_ENABLED_SURFACES?.split(",").some(
      (surface) => surface.trim() === "browser",
    )
  )
    env = await configureIndependentBrowser(env);
  const staged = await stageRuntimePackages(restoredPackageSources());
  let independent:
    Awaited<ReturnType<typeof prepareIndependentRuntime>> | undefined;
  const dispose = async () => {
    try {
      await independent?.dispose();
    } finally {
      await staged.dispose();
    }
  };
  try {
    env.NODE_REPL_NODE_MODULE_DIRS = [
      staged.root,
      env.NODE_REPL_NODE_MODULE_DIRS,
    ]
      .filter(Boolean)
      .join(delimiter);
    env.NODE_REPL_TRUSTED_CODE_PATHS = [
      staged.root,
      env.NODE_REPL_TRUSTED_CODE_PATHS,
    ]
      .filter(Boolean)
      .join(delimiter);
    if (selection.supervisor === "rust")
      independent = await prepareIndependentRuntime(
        env,
        staged.root,
        sessionId,
        "rust",
      );
    return {
      supervisor: selection.supervisor,
      surfaces: env.CUA_REPL_ENABLED_SURFACES,
      stagedRoot: staged.root,
      command: independent?.command ?? process.execPath,
      args: independent?.args ?? [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(new URL("./native-supervisor.ts", import.meta.url)),
      ],
      environment: independent?.environment ?? env,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
