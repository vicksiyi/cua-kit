import { create_tinysky_alt } from "./create_tinysky_alt";
import type { NodeReplGlobals } from "../types";
const configured = (globalThis as NodeReplGlobals).nodeRepl?.env
  ?.CUA_REPL_ENABLED_SURFACES;
if (configured === undefined)
  throw new Error("CUA_REPL_ENABLED_SURFACES is required");
const surfaces = new Set(
  configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
for (const surface of surfaces)
  if (!["browser", "computer"].includes(surface))
    throw new Error(`unknown CUA_REPL_ENABLED_SURFACES surface=${surface}`);
const cua = await create_tinysky_alt({
  browser: surfaces.has("browser"),
  computer: surfaces.has("computer"),
});
Object.assign(cua, { initialize: cua.getState });
Reflect.set(globalThis, "cua", cua);

export type * from "./types";
