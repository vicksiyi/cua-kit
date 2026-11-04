# @core/browser-desktop

Readable TypeScript package corresponding to the installed `@oai/browser-desktop` exports:

- `@core/browser-desktop`: `setupBrowserRuntime`.
- `@core/browser-desktop/service`: `handleRpc`, `classifyError`.

Build from the repository root with `npm run build:reconstruction`. Source imports are extensionless; emitted ESM uses Node-compatible suffixes. The service owns one module-lifetime dispatcher and obtains privileged capabilities from the NodeREPL host. It is not a standalone browser or native-app server.

The environment documentation bundle is statically extracted from the installed desktop service with `node scripts/extract-desktop-documentation.mjs`. `CUA_VENDOR_ROOT` optionally specifies the directory containing the original packages. Extraction uses Acorn and only decodes literal data; it does not evaluate the original runtime. The bundle includes default documentation and codex-app, cloud, orbit and training environments. Package references are mapped from @oai to @core.

The restored implementation delegates to @core/browser, which reuses upstream dependencies including Playwright, Zod, classic-level, ZXing, markdown-it, FormatJS, Statsig and Sentry. Desktop and CUA-embedded original bundles have different hashes and some differing metadata; representative client-call equivalence and exact environment-document equality do not establish whole-bundle equivalence.

Accessibility still needs the separate WASM asset. Supply `CUA_BROWSER_ACCESSIBILITY_WASM_SOURCE=/absolute/path/browser-accessibility.wasm.br` at build time, or set the original host environment `BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH` to an absolute asset path. The proprietary binary is not included. A compatible external NodeREPL host, browser transport and native provider remain separate prerequisites. Tests use synthetic host capabilities; they do not establish full standalone operation.
