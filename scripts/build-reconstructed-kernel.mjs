import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
const outdir = "packages/browser-extension/dist/kernel";
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: {
    "js-kernel-offscreen": "packages/browser-extension/src/kernel_offscreen_entry.ts",
    "js-kernel-host": "packages/browser-extension/src/kernel_frame_host_entry.ts",
    "js-kernel": "packages/browser-extension/src/kernel_sandbox_entry.ts",
  }, outdir, bundle: true, platform: "browser", format: "esm",
});
for (const name of ["js-kernel-offscreen", "js-kernel-host", "js-kernel"]) await writeFile(`${outdir}/${name}.html`,
  `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="./${name}.js"></script></body></html>\n`);
