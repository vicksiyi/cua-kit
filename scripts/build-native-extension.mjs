import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = join(
  root,
  "packages/browser-extension/dist/native-extension",
);
await mkdir(destination, { recursive: true });
await cp(
  join(root, "packages/browser-extension/native-manifest.json"),
  join(destination, "manifest.json"),
);
await cp(
  join(root, "packages/browser-extension/dist/content-scripts"),
  join(destination, "content-scripts"),
  { recursive: true },
);
await build({
  absWorkingDir: root,
  entryPoints: ["packages/browser-extension/src/native_background_entry.ts"],
  outfile: join(destination, "background.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  legalComments: "eof",
});
