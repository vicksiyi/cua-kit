import { build } from "esbuild";
// Compile WXT's actual runtime with the same injected entrypoint/production flags.
await build({
  entryPoints: ["packages/browser-extension/src/codex_entry.ts"],
  outfile: "packages/browser-extension/dist/content-scripts/codex.js",
  bundle: true,
  format: "iife",
  globalName: "codex",
  platform: "browser",
  target: "chrome120",
  define: {
    "import.meta.env.ENTRYPOINT": '"codex"',
    "import.meta.env.MODE": '"production"',
  },
  footer: { js: "codex = codex.startup;" },
  legalComments: "eof",
});
