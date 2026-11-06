import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
// The old Node host is built only for explicit compatibility/reference use.
if (process.argv.includes("--include-legacy")) {
  await build({
    absWorkingDir: root,
    entryPoints: ["packages/native-host/src/main.ts"],
    outfile: "packages/native-host/dist/main.mjs",
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    alias: {
      "@core/browser/nativePipe": `${root}packages/browser/src/service/runtime/native_pipe.ts`,
    },
  });
}

// Trusted service composition is independently authored; restored browser commands stay external.
await build({
  absWorkingDir: root,
  entryPoints: {
    "browser-service": "packages/native-host/src/browser_service.ts",
    "browser-connector": "packages/native-host/src/browser_connector.ts",
  },
  outdir: "packages/native-host/dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  packages: "external",
  format: "esm",
  platform: "node",
  target: "node22",
});

await build({
  absWorkingDir: root,
  entryPoints: ["packages/native-host/src/install_cli.ts"],
  outfile: "packages/native-host/dist/install.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
});
