import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";

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

// The restored overlay references this runtime resource. Do not commit vendor
// image bytes: copy the installed asset only into the local generated bundle.
const source = process.env.CUA_EXTENSION_SOURCE_ROOT ?? join(homedir(),
  "Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0");
await mkdir(join(destination, "images"), { recursive: true });
await cp(join(source, "images/cursor-chat.png"), join(destination, "images/cursor-chat.png"));
