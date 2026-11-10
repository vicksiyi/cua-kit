import { readFileSync } from "node:fs";
/** Preserve raw config values except the current desktop API/target constraint. */
export function load_options(): {
  target: "linux" | "mac" | "windows";
  [option: string]: unknown;
} {
  const key = "OAI_SKY_CONFIG_PATH",
    configured = process.env[key]?.trim();
  if (configured) {
    const options = JSON.parse(readFileSync(configured, "utf8"));
    if ("api" in options && (options.api !== "desktop" || options.target !== "windows")) {
      throw new Error("Sky api must be 'desktop' with target 'windows', or omitted");
    }
    return options;
  }
  switch (process.platform) {
    case "darwin":
      return { target: "mac" };
    case "linux":
      return { target: "linux" };
    case "win32":
      return { target: "windows" };
    default:
      throw new Error(
        `${key} missing, unhandled process.platform=${process.platform}`,
      );
  }
}
