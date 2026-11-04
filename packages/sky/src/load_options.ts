import { readFileSync } from "node:fs";
/** Original config precedence; configuration JSON is deliberately not normalized or validated. */
export function load_options(): {
  target: "linux" | "mac" | "windows";
  [option: string]: unknown;
} {
  const key = "OAI_SKY_CONFIG_PATH",
    configured = process.env[key]?.trim();
  if (configured) return JSON.parse(readFileSync(configured, "utf8"));
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
