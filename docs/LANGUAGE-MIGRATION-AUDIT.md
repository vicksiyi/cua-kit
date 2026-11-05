# Existing repository language-boundary audit

This audit includes existing implementation, not just newly written files. Original JavaScript remains readable TypeScript. Responsibilities evidenced in native Rust or Swift must move to those native layers. A TypeScript RPC binding or caller is not itself an incorrect language migration.

## Evidence and current findings

| Existing implementation | Evidence / boundary | Current native replacement | Remaining work |
| --- | --- | --- | --- |
| `packages/runtime-supervisor/src` (14 TS files) | `reconstruction/native-language-evidence.json` records Rust compiler/source-path evidence in installed `node_repl`; this is not recovered function source | `native/runtime-supervisor/src`: REPL/process lifecycle, native pipe, MCP, configuration, sandbox, native service | The production independent demo factory now launches Rust only; the old `independent` selector aliases Rust. TS supervisor implementations remain as direct test/reference consumers pending full retirement. The JS worker bootstrap remains a Node binding to the Rust sandbox addon; do not mechanically translate every file. |
| Removed `packages/native-macos/src/paste-content.ts`; paste binding in `client.ts` | Original Sky JS forwards text/format to native service; legacy adapter performs formatting in TS | `native/macos/Sources/CuaHelper/PasteContent.swift`, `SkyAppState.swift`, `Clipboard.swift`, `Paste.swift` | Both new Sky and legacy `independent` adapter now delegate formatting and transaction to Swift. The legacy adapter sends raw text/format through `pasteFormatted`; its TS renderer has been deleted. Native formatting libraries are independently selected, not proven vendor dependencies. |
| `src/native/provider.ts`, `src/native/clipboard.ts`, `src/core/paste.ts` | Legacy root exports still expose native paste with TS format handling and clipboard transaction coordination | Swift Sky service owns the transaction in the new route | Root `MacApp.paste` now sends raw text/format via `pasteFormatted`; Swift owns formatting, editor validation, insertion verification and clipboard restoration. Shared caller queue remains for browser/native ordering. `NativeClipboard` low-level API still exists, and browser use of `src/core/paste.ts` remains legitimate TS. Public root API retirement is still pending. |
| `packages/native-macos/src/helper.ts`, `src/native/helper.ts` | TS transports for independently designed NDJSON native service | Original Sky protocol binding + Rust-owned Swift service | Retire obsolete transport with its consumers, not by replacing legitimate JS-side IPC bindings with Swift. |
| `packages/native-host/src` (14 TS files) | Original native ownership/language not fully established; some browser profile logic is evidenced in original JS | Partial native service/runtime infrastructure | Establish per-file provenance first; do not guess Rust or Swift from a package name. |
| Restored CUA/Sky/REPL/browser packages | Installed JS and declarations | Readable TS | Keep TS, preserve package boundaries and `@core/*`; review per-file provenance rather than treating a package label as proof. |
| AgentLoop, MCP client, demo/configuration/build scripts | Independently authored caller/deployment code | Not an original native component | Keep suitable implementation language unless native responsibilities have leaked into these callers. |

## Routing matters

`packages/agent-loop/src/restored-demo-runtime.ts` now normalizes the old `CUA_RUNTIME_SUPERVISOR=independent` selector to `rust`. The production factory no longer constructs a TS supervisor entry and no longer imports its options type. The installed native supervisor selection remains supported. Separately, `CORE_CUA_NATIVE_BACKEND=independent` still replaces the Sky service with the legacy `@core/native-macos/service` adapter under the installed supervisor; `swift` uses Rust and the restored Sky protocol binding. Native backend and supervisor selectors are distinct migration concerns.

Root `package.json` exports still point at `dist/*` from legacy `src`, and `demo`/`mcp` still invoke those entries. The 25 legacy TS files require consumer migration, not indiscriminate deletion. `--swift-computer` is an explicit new-path entry, not proof that every old entry has changed.

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
