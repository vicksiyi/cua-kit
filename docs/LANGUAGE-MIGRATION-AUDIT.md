# Existing repository language-boundary audit

This audit includes existing implementation, not just newly written files. Original JavaScript remains readable TypeScript. Responsibilities evidenced in native Rust or Swift must move to those native layers. A TypeScript RPC binding or caller is not itself an incorrect language migration.

## Evidence and current findings

| Existing implementation | Evidence / boundary | Current native replacement | Remaining work |
| --- | --- | --- | --- |
| `packages/runtime-supervisor/src` (14 TS files) | `reconstruction/native-language-evidence.json` records Rust compiler/source-path evidence in installed `node_repl`; this is not recovered function source | `native/runtime-supervisor/src`: REPL/process lifecycle, native pipe, MCP, configuration, sandbox, native service | The production independent demo factory now launches Rust only; the old `independent` selector aliases Rust. TS supervisor implementations remain as direct test/reference consumers pending full retirement. The Node-to-NAPI worker bootstrap now lives in `native/runtime-supervisor/bindings/sandbox-bootstrap.ts`; production has no dependency on the legacy TS supervisor package. Its old bootstrap entry only forwards for test/reference compatibility; do not mechanically translate this binding. |
| Removed `packages/native-macos/src/paste-content.ts`; paste binding in `client.ts` | Original Sky JS forwards text/format to native service; legacy adapter performs formatting in TS | `native/macos/Sources/CuaHelper/PasteContent.swift`, `SkyAppState.swift`, `Clipboard.swift`, `Paste.swift` | Both new Sky and legacy `independent` adapter now delegate formatting and transaction to Swift. The legacy adapter sends raw text/format through `pasteFormatted`; its TS renderer has been deleted. Native formatting libraries are independently selected, not proven vendor dependencies. |
| `src/native/provider.ts`, `src/native/clipboard.ts`, `src/core/paste.ts` | Legacy root exports still expose native paste with TS format handling and clipboard transaction coordination | Swift Sky service owns the transaction in the new route | Root `MacApp.paste` now sends raw text/format via `pasteFormatted`; Swift owns formatting, editor validation, insertion verification and clipboard restoration. Shared caller queue remains for browser/native ordering. `NativeClipboard` low-level API still exists, and browser use of `src/core/paste.ts` remains legitimate TS. Public root API retirement is still pending. |
| `packages/native-macos/src/helper.ts`, `src/native/helper.ts` | TS transports for independently designed NDJSON native service | Original Sky protocol binding + Rust-owned Swift service | Retire obsolete transport with its consumers, not by replacing legitimate JS-side IPC bindings with Swift. |
| `packages/native-host/src` (14 TS files) | Original native ownership/language not fully established; some browser profile logic is evidenced in original JS | Partial native service/runtime infrastructure | Establish per-file provenance first; do not guess Rust or Swift from a package name. |
| Restored CUA/Sky/REPL/browser packages | Installed JS and declarations | Readable TS | Keep TS, preserve package boundaries and `@core/*`; review per-file provenance rather than treating a package label as proof. |
| AgentLoop, MCP client, demo/configuration/build scripts | Independently authored caller/deployment code | Not an original native component | Keep suitable implementation language unless native responsibilities have leaked into these callers. |

## Routing matters

`packages/agent-loop/src/restored-demo-runtime.ts` now normalizes the old `CUA_RUNTIME_SUPERVISOR=independent` selector to `rust`. The production factory no longer constructs a TS supervisor entry and no longer imports its options type. The installed native supervisor selection remains supported. The direct restored-demo entry now maps `CORE_CUA_NATIVE_BACKEND=independent` to `swift`, defaults computer deployments to Rust, and no longer replaces the original Sky binding with `@core/native-macos/service`. An explicitly conflicting installed supervisor is rejected before launch; explicit vendor deployments remain supported with the installed supervisor. This selector policy is independently authored deployment code, not recovered vendor logic.

Root CUA/desktop SDK exports still point at legacy `src` implementations; agent exports now delegate to the shared package. Default `demo`/`mcp` commands now use the restored runtime; the QuickJS routes have explicit `:legacy` names. The 25 legacy TS files require consumer migration, not indiscriminate deletion. The normal `--computer` and `--check-computer` CLI entries now also select Rust + original Sky + Swift; `--swift-computer` is an alias. Direct legacy adapter consumers and root public exports still require migration.

## Completion criteria

1. Record source-language evidence and classify each existing native-responsibility implementation.
2. Implement the responsibility in its evidenced language while keeping original JS-side API bindings in TS.
3. Verify native protocol contracts, failure/cancellation behavior, and observable effects with owned fixtures.
4. Switch callers and public entry points; remove obsolete branches only after compatibility checks.
5. Re-run the file inventory and review remaining TS native responsibilities. A file count is review scope, not completion percentage.

Current acceptance: Rust/Swift MCP inventory, explicit and GetSkyshot background owned-app launch/reuse plus IPC/lifecycle checks have evidence. Actual UI screenshot/input acceptance remains incomplete because the current execution context has neither Accessibility nor Screen Recording permission. Native audio and additional original service behavior also remain incomplete. Native bodies are independently reconstructed; binary language evidence does not prove original algorithm parity.

Reproduce the inventory:

```sh
python3 scripts/audit-language-boundaries.py > reconstruction/language-boundary-inventory.json
```

The inventory records implementation file hashes and review categories; it does not certify per-file provenance or native parity.

## Repository recheck — 2026-11-06

The existing repository is explicitly in scope for the user's language-alignment requirement, including legacy root exports, not only new packages. A fresh inventory finds 14 supervisor TS files, 6 desktop adapter TS files, 14 native-host TS files with unresolved provenance, and 25 root prototype TS files. These are review scopes, not counts of proven incorrect translations.

The initial recheck found `independent` and `rust` mapped to TS and Rust respectively. That production routing has now been corrected: both select Rust, and the factory TS branch is removed. Full removal of the legacy supervisor package and its direct test/reference consumers is still pending. Both `src/native/provider.ts` and `packages/native-macos/src/client.ts` now delegate paste to `pasteFormatted`; that responsibility has already moved to Swift and must not be reintroduced in TS.

For each remaining candidate, record the original artifact and language evidence, caller/server boundary, destination, reachable consumers, and acceptance result before retiring it. Original JS clients remain readable TS. Native source bodies unavailable in the installation must be described as independently implemented from observed contracts; matching a binary's language alone does not establish matching behavior.


The background launch required by macOS `getApp` is implemented in Swift `SkyAppState`/`Launch`, matching the original JS-to-native responsibility boundary. It was not added as a TS wrapper around a missing native behavior. Original documentation establishes the expected behavior; original native function bodies remain unavailable.


The normal runtime staging roots no longer include `@core/native-macos`. A deployment test verifies it is absent from the staged dependency graph and its service cannot resolve there, while original Sky/browser service exports and distinct dependency versions remain available. Legacy source packages and root public APIs remain in the repository for consumer migration; removing a staged root is not full package retirement.


Root agent compatibility exports (`src/agent/{contracts,loop,mcp-client,chat-model}.ts`) now delegate to the shared `@core/agent-loop` package instead of retaining duplicate implementations. This is caller-code consolidation, not a claim that AgentLoop is an original native component. The root CUA/desktop SDK and QuickJS MCP server remain legacy and still require migration.


The root `mcp` command now launches the restored runtime via the shared deployment factory; `mcp:legacy` names the retained QuickJS prototype explicitly. The standalone stdio entry is agent-neutral and does not instantiate a model. Root SDK exports and explicitly named legacy command consumers still need migration; this does not retire all QuickJS source consumers.


Public SDK audit found a separate contract gap: original `tinyskyAlt` installs global CUA inside nodeRepl, while the root prototype exposes `Cua.launch`. These cannot be renamed into compatibility. The deprecated prototype is now explicitly reachable under `/legacy` subpaths while original root paths remain for existing consumers. Installed entry hashes and a differential entry-initialization check are recorded in `public-api-boundary.json`; actual legacy consumer conversion remains pending.


### Legacy supervisor dependency cleanup

The independent runtime now reads both its executable and Node bootstrap from `native/runtime-supervisor/dist`. `@core/agent-loop` no longer depends on `@core/runtime-supervisor`. The canonical bootstrap remains TS because its job is Node `createRequire` / argv / dynamic import around the native sandbox addon; Rust still owns sandbox policy and process supervision. The old package contains 13 TS implementation review candidates and one compatibility forwarder, not 14 proven language mismatches.

The default reconstruction build no longer compiles legacy service files. `npm run build:legacy-runtime` opts into them for direct reference tests. This change retires their production deployment dependency, not their source or test consumers. Native original function bodies remain unavailable; the native implementations are contract reconstructions, not recovered source.

Validation for this cleanup: reconstruction build and agent-loop type check pass. The real isolated Chromium loop test passes through Rust, the relocated bootstrap, source CUA, page click/read, completion summary and final response (local deterministic model, not a new paid DeepSeek acceptance run). The legacy sandboxed CUA/native-host test also passes through the compatibility forwarder. This does not complete native desktop UI acceptance or retire all reference implementations.


### Default build boundary

`build:reconstruction` generates restored JS/TS packages and the native runtime's Node binding, without compiling `packages/runtime-supervisor` or `packages/native-macos`. `build:legacy-runtime` runs the same build with `--include-legacy`; `test:reconstruction` and the historical `test:sandbox` explicitly select it because they retain direct legacy comparison consumers. Native Rust MCP tests now reference the canonical native bootstrap directly. The normal CLI and native/browser acceptance commands continue using the default build.

Validation removed both legacy `dist` directories temporarily (restored afterwards), ran the default reconstruction build, verified neither legacy output was recreated, and ran the real isolated browser Loop plus the Rust/Sky/Swift native-inventory test. All five selected tests passed with no installed supervisor dependency in those routes. This proves the selected runtime paths do not depend on stale legacy build artifacts; it does not prove all legacy source consumers are retired or native UI effects are accepted.
