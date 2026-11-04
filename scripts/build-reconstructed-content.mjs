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

await build({
  entryPoints: ["packages/browser-extension/src/foreign_frame_entry.ts"],
  outfile:
    "packages/browser-extension/dist/content-scripts/foreign-frame-monitor.js",
  bundle: true,
  format: "iife",
  globalName: "foreignFrameMonitor",
  platform: "browser",
  target: "chrome120",
  define: {
    "import.meta.env.ENTRYPOINT": '"foreign-frame-monitor"',
    "import.meta.env.MODE": '"production"',
  },
  footer: { js: "foreignFrameMonitor = foreignFrameMonitor.startup;" },
  legalComments: "eof",
});

await build({
  entryPoints: ["packages/browser-extension/src/side_chat_mentions_entry.ts"],
  outfile:
    "packages/browser-extension/dist/content-scripts/side-chat-tab-mentions.js",
  bundle: true,
  format: "iife",
  globalName: "sideChatTabMentions",
  platform: "browser",
  target: "chrome120",
  define: {
    "import.meta.env.ENTRYPOINT": '"side-chat-tab-mentions"',
    "import.meta.env.MODE": '"production"',
  },
  footer: { js: "sideChatTabMentions = sideChatTabMentions.startup;" },
  legalComments: "eof",
});
