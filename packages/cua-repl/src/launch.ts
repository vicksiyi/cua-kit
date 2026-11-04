import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import process from "node:process";
import { load_instructions } from "./instructions";
/** Original launch contract. The NodeREPL executable remains an explicit external dependency. */
export async function launch(): Promise<void> {
  const executable = process.env.CUA_REPL_NODE_REPL_PATH;
  if (!executable || !isAbsolute(executable))
    throw new Error("CUA_REPL_NODE_REPL_PATH must name an absolute executable");
  const instructions = load_instructions(
    process.platform,
    process.env.CUA_REPL_BROWSER_ENV,
    process.env.CUA_REPL_BROWSER_GUIDANCE,
  );
  const configured = process.env.CUA_REPL_ENABLED_SURFACES;
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
  const services: Record<string, string> = {};
  const description = [instructions.description];
  if (surfaces.has("browser")) {
    services.browser = "@core/browser-desktop/service";
    description.push(instructions.browser);
  } else description.push(instructions.browser_disabled);
  if (surfaces.has("computer")) {
    services.sky = "@core/sky/service";
    description.push(instructions.computer);
  } else description.push(instructions.computer_disabled);
  description.push(instructions.output);
  if (
    surfaces.has("computer") &&
    process.env.SKY_ENABLE_AUDIO === "1" &&
    process.env.SKY_AUDIO_ATTACHMENTS === "1"
  )
    description.push(instructions.audio_attachments);
  const overrides = {
    server_instructions: instructions.server,
    tools: {
      js: {
        description: description.join("\n\n"),
        field_descriptions: { code: instructions.code },
      },
      js_reset: { description: instructions.reset },
    },
  };
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      CUA_REPL_ENABLED_SURFACES: [...surfaces].join(","),
      NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: [
        process.env.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST,
        "CUA_REPL_ENABLED_SURFACES",
        "CUA_REPL_BROWSER_ENV",
      ]
        .filter(Boolean)
        .join(","),
      NODE_REPL_TRUSTED_SERVICES:
        process.env.NODE_REPL_TRUSTED_SERVICES ?? JSON.stringify(services),
      NODE_REPL_JS_BANNER:
        process.env.NODE_REPL_JS_BANNER ??
        readFileSync(
          new URL(import.meta.resolve("#instructions/banner.js")),
          "utf8",
        ),
      NODE_REPL_TOOL_OVERRIDES: JSON.stringify(overrides),
    },
    stdio: "inherit",
  });
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const forward = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  for (const signal of signals) process.on(signal, forward);
  const [code, signal] = await once(child, "close").finally(() => {
    for (const signal of signals) process.off(signal, forward);
  });
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code != null && code >= 0 ? code : 1;
}
