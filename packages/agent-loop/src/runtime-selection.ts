/** Caller deployment policy, not recovered vendor selection logic. */
export function selectRuntime(
  environment: Record<string, string>,
  requestedSupervisor?: string,
): { environment: Record<string, string>; supervisor: "installed" | "rust" } {
  const env = { ...environment };
  const computer = env.CUA_REPL_ENABLED_SURFACES?.split(",").some(
    (surface) => surface.trim() === "computer",
  );
  // Retain the old name without retaining the TS Sky service replacement.
  if (env.CORE_CUA_NATIVE_BACKEND === "independent")
    env.CORE_CUA_NATIVE_BACKEND = "swift";
  if (computer && env.CORE_CUA_NATIVE_BACKEND === undefined)
    env.CORE_CUA_NATIVE_BACKEND = "swift";
  const backend = env.CORE_CUA_NATIVE_BACKEND;
  if (backend !== undefined && backend !== "swift" && backend !== "vendor")
    throw new Error(
      "CORE_CUA_NATIVE_BACKEND must be independent, swift or vendor",
    );
  if (backend === "swift" && !computer)
    throw new Error("Swift native backend requires computer surface");
  const selected =
    requestedSupervisor === "independent" ? "rust" : requestedSupervisor;
  const supervisor = selected ?? (backend === "swift" ? "rust" : "installed");
  if (supervisor !== "rust" && supervisor !== "installed")
    throw new Error(
      "CUA_RUNTIME_SUPERVISOR must be installed, independent or rust",
    );
  if (backend === "swift" && supervisor !== "rust")
    throw new Error(
      "Swift native backend requires CUA_RUNTIME_SUPERVISOR=rust; the legacy TS desktop service has been retired from this entry",
    );
  if (computer && backend === "vendor" && supervisor === "rust")
    throw new Error(
      "Vendor native backend requires CUA_RUNTIME_SUPERVISOR=installed",
    );
  if (backend === "swift" && env.NODE_REPL_TRUSTED_SERVICES !== undefined) {
    const services = JSON.parse(env.NODE_REPL_TRUSTED_SERVICES);
    if (!services || typeof services !== "object" || Array.isArray(services))
      throw new Error("NODE_REPL_TRUSTED_SERVICES must be a service map");
    if (services.sky !== undefined && services.sky !== "@core/sky/service")
      throw new Error(
        "Swift native backend requires the original @core/sky/service binding",
      );
  }
  return { environment: env, supervisor };
}
