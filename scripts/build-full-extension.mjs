import { build } from "esbuild";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = process.argv[2];
if (!configPath)
  throw Error(
    "Usage: npm run build:full-extension -- /path/to/deployment.json [output-directory]",
  );
const configuration = JSON.parse(await readFile(resolve(configPath), "utf8"));
if (
  !["dev", "internal", "prod"].includes(configuration.channel) ||
  !Array.isArray(configuration.nativeHosts) ||
  !configuration.nativeHosts.length ||
  configuration.nativeHosts.some(
    (host) => typeof host !== "string" || !host.length,
  ) ||
  typeof configuration.sidePanelEnabled !== "boolean" ||
  typeof configuration.features?.sdkKey !== "string" ||
  !configuration.features.sdkKey ||
  typeof configuration.features?.api !== "string" ||
  typeof configuration.telemetryDsn !== "string" ||
  typeof configuration.siteStatusUrl !== "string" ||
  !Array.isArray(configuration.defaultAllowedPages) ||
  configuration.defaultAllowedPages.some((page) => typeof page !== "string")
) {
  throw Error("Invalid full extension deployment configuration");
}
// Project configuration is embedded into public extension code. Reject unknown
// fields so accidental provider credentials are not silently bundled.
const keys = [
  "channel",
  "nativeHosts",
  "sidePanelEnabled",
  "features",
  "telemetryDsn",
  "siteStatusUrl",
  "defaultAllowedPages",
];
if (
  Object.keys(configuration).some((key) => !keys.includes(key)) ||
  Object.keys(configuration.features).some(
    (key) => !["sdkKey", "api"].includes(key),
  )
)
  throw Error("Unknown deployment configuration field");
const extraOrigins = [
  configuration.features.api,
  configuration.siteStatusUrl,
  configuration.telemetryDsn,
]
  .filter(Boolean)
  .map((value) => {
    const url = new URL(value);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw Error("Deployment endpoints require HTTPS or local loopback HTTP");
    return url.origin;
  });
const source =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  join(
    homedir(),
    "Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0",
  );
const bytes = await readFile(join(source, "manifest.json"));
if (
  createHash("sha256").update(bytes).digest("hex") !==
  "c91430ccc93fec16c51e13db3d4e562eafc29749e7a65b8c6152c56dcea05b4a"
)
  throw Error("Installed manifest changed");
const manifest = JSON.parse(bytes.toString("utf8"));
const nativeManifest = JSON.parse(
  await readFile(
    join(root, "packages/browser-extension/native-manifest.json"),
    "utf8",
  ),
);
manifest.name = "Core CUA Full";
manifest.minimum_chrome_version = "120";
manifest.description =
  "Restored browser, sidebar and kernel services with explicit deployment configuration.";
manifest.key = nativeManifest.key;
delete manifest.update_url;
manifest.content_security_policy.extension_pages =
  manifest.content_security_policy.extension_pages.replace(
    /connect-src ([^;]*);/,
    (_match, values) =>
      `connect-src ${[...new Set([...values.split(" "), ...extraOrigins])].join(" ")};`,
  );
const destination = resolve(
  process.argv[3] ??
    join(root, "packages/browser-extension/dist/full-extension"),
);
for (const script of [
  "build-reconstructed-content.mjs",
  "build-reconstructed-kernel.mjs",
  "build-reconstructed-pages.mjs",
]) {
  execFileSync(process.execPath, [join(root, "scripts", script)], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CORE_CUA_PAGE_TELEMETRY_DSN: configuration.telemetryDsn,
    },
  });
}
await mkdir(destination, { recursive: true });
await cp(
  join(root, "packages/browser-extension/dist/content-scripts"),
  join(destination, "content-scripts"),
  { recursive: true },
);
await cp(join(root, "packages/browser-extension/dist/kernel"), destination, {
  recursive: true,
});
await cp(
  join(root, "packages/browser-extension/dist/pages"),
  join(destination, "pages"),
  { recursive: true },
);
for (const file of ["codex-work-sidepanel.html", "microphone-permission.html"])
  await cp(join(destination, "pages", file), join(destination, file));
await cp(join(source, "images"), join(destination, "images"), {
  recursive: true,
});
await build({
  absWorkingDir: root,
  entryPoints: ["packages/browser-extension/src/full_background_entry.ts"],
  outfile: join(destination, "background.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  legalComments: "eof",
  define: { CORE_CUA_FULL_CONFIGURATION: JSON.stringify(configuration) },
});
await writeFile(
  join(destination, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Full extension bundle: ${destination}`);
