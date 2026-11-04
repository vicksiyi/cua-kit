import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const source =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  join(
    homedir(),
    "Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0",
  );
const destination = join(root, "packages/browser-extension/dist/pages");
const resources = {
  "codex-work-sidepanel.html":
    "b7bc735d6e33eef5d25f543c28883708ec8032bafa65ba93b790c489f2a8c19c",
  "microphone-permission.html":
    "4feda16497547669baf612b77a4e581bac08791531713329553b1130abd28083",
  "assets/codex-work-sidepanel-5HNvaIW9.css":
    "c3f7a41da3b4b4fd559e5450b999044b1b86fe6e0df58c9e0441a36943b8fb77",
  "assets/microphone-permission-BQ71LL-a.css":
    "a0e34f193e41cd001bd40dafc5d86335947160c55f2183c12463edd3e947f47f",
};
// Validate every original resource before writing any deployment output.
const contents = await Promise.all(
  Object.entries(resources).map(async ([path, sha]) => {
    const bytes = await readFile(join(source, path));
    if (createHash("sha256").update(bytes).digest("hex") !== sha)
      throw Error(`Source resource changed: ${path}`);
    return [path, bytes];
  }),
);
await mkdir(join(destination, "assets"), { recursive: true });
for (const [path, bytes] of contents) {
  const content = path.endsWith(".html")
    ? bytes
        .toString("utf8")
        .replace(/\s*<link rel="modulepreload"[^>]*>/g, "")
        .replace(
          "/chunks/codex-work-sidepanel-Cy6MdlEo.js",
          "/pages/side-panel.js",
        )
        .replace(
          "/chunks/microphone-permission-CfXjp0JX.js",
          "/pages/media-permission.js",
        )
        .replaceAll("/assets/", "/pages/assets/")
    : bytes;
  await writeFile(join(destination, path), content);
}
await build({
  absWorkingDir: root,
  entryPoints: {
    "side-panel": "packages/browser-extension/src/side_panel_entry.ts",
    "media-permission":
      "packages/browser-extension/src/media_permission_entry.ts",
  },
  outdir: destination,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  legalComments: "eof",
  // Empty DSN disables Sentry delivery. Never inherit an unrelated service key.
  define: {
    CORE_CUA_PAGE_TELEMETRY_DSN: JSON.stringify(
      process.env.CORE_CUA_PAGE_TELEMETRY_DSN ?? "",
    ),
  },
});
console.log(`Reconstructed page resources: ${destination}`);
