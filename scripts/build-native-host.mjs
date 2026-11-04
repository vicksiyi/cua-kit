import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
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
