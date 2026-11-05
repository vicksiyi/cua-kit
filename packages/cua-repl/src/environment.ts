import { readFileSync } from "node:fs";
import { load_instructions } from "./instructions";
/** Readable restoration of the installed environment.js contract. */
export function create_launch_environment({
  env: environment,
  instructions_directory,
  platform,
}: {
  env: NodeJS.ProcessEnv;
  instructions_directory: URL;
  platform: NodeJS.Platform;
}) {
  const instructions = load_instructions(
    instructions_directory,
    platform,
    environment.CUA_REPL_BROWSER_ENV,
    environment.CUA_REPL_BROWSER_GUIDANCE,
  );
  const configured = environment.CUA_REPL_ENABLED_SURFACES;
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
    environment.SKY_ENABLE_AUDIO === "1" &&
    environment.NODE_REPL_ENABLE_AUDIO === "1"
  )
    description.push(instructions.audio);
  const overrides = {
    server_instructions: instructions.server,
    tools: {
      js: {
        description: description.join("\n\n"),
        field_descriptions: {
          code: instructions.code,
          title: instructions.title,
        },
      },
      js_reset: { description: instructions.reset },
    },
  };
  return {
    ...environment,
    CUA_REPL_ENABLED_SURFACES: [...surfaces].join(","),
    NODE_REPL_JS_COMPLETION_SUMMARY:
      surfaces.size > 0
        ? JSON.stringify({
            instructions: instructions.task_completion,
            description: instructions.completion_summary,
          })
        : undefined,
    NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: [
      environment.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST,
      "CUA_REPL_ENABLED_SURFACES",
      "CUA_REPL_BROWSER_ENV",
    ]
      .filter(Boolean)
      .join(","),
    NODE_REPL_TRUSTED_SERVICES:
      environment.NODE_REPL_TRUSTED_SERVICES ?? JSON.stringify(services),
    NODE_REPL_JS_BANNER:
      environment.NODE_REPL_JS_BANNER ??
      readFileSync(new URL("banner.js", instructions_directory), "utf8"),
    NODE_REPL_TOOL_OVERRIDES: JSON.stringify(overrides),
  };
}
