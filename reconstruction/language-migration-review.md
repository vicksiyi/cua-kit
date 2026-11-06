# Existing implementation language review

Checkpoint: 2026-11-06. This review distinguishes source language evidence from runtime routing and behavioral parity. Neither a Rust file nor a passing browser fixture proves original implementation equivalence.

User constraint: restore installed JavaScript as readable TypeScript; retain the evidenced native language for other responsibilities. Apply this to existing code as well as new work. Preserve package boundaries with `@core` names and extensionless source imports.

| Existing code | Finding | Required disposition |
| --- | --- | --- |
| `packages/runtime-supervisor/src/session.ts`, MCP/config/pipe/deadline hosts | Independently authored TS implementations of native supervisor responsibilities remain in the repository. | Native replacement is `native/runtime-supervisor`. Production independent deployment rejects TS selection. Finish consumer/export retirement and native behavior verification before removing reference implementations. |
| `packages/native-host/src/server.ts`, `router.ts`, `main.ts`, `lifecycle_log.ts` | Legacy TS service implementation remains. | Rust host in `native/browser-extension-host` is the production replacement. Normal public clients exclude these modules; legacy imports/builds remain explicit. Audit original auth/app-server behavior separately. |
| `packages/native-macos/src/service.ts`, `client.ts`, `helper.ts`, `screenshot.ts` | Independent TS desktop adapter is retained; its presence is not proof that each operation was originally TS. | Default independent computer deployment selects Rust native service plus Swift helper and `@core/sky/service`. Review remaining adapter consumers and original Swift state semantics before retiring compatibility code. |
| `src/native/*`, `src/core/paste.ts`, `src/core/clipboard.ts`, root SDK | Prototype API remains reachable through public root/native exports as well as legacy aliases. | Consumer migration is still open. Deprecation and a legacy alias alone do not complete replacement. Preserve API distinctions between lower-level package API and worker convenience `cua`. |
| `packages/native-host/src/app_server_host_configuration.ts`, `chrome_profile.ts`, `macos_browser_app.ts` | Installed JS deployment/discovery evidence exists. | Retain readable TS. Do not move these to Rust merely because they deploy a native process. Schema-1 JS configuration generation differs from schema-2 native registry selection. |
| `native/runtime-supervisor/bindings/sandbox-bootstrap.ts`, native process caller bindings | Node/native bridge code, not automatically a replacement for a native service. | Retain JS/TS binding where appropriate. The legacy supervisor bootstrap only forwards to the native runtime's Node binding. |
| AgentLoop/model/MCP caller and deployment scripts | Core integration/demo code rather than recovered vendor implementation. | May remain TS; keep original-code claims separate from added integration behavior. |

## Outstanding native work

- Rust App Server: configuration, process lifecycle, WebSocket input/output and handshake, proxy listener/session/manager, and status/ensure/restart are implemented and connected to `NativeControl`. `codexRuntime/hello` is also implemented from pinned constant-field evidence, with a real framed stdio check. Release deployment and real browser/App Server acceptance remain open; source wiring alone does not prove runtime parity. Original authorization and remaining control/cleanup differences still require evidence-based review.
- Swift desktop: complete original state/diff semantics and real screenshot/input acceptance; native language selection alone does not validate effects.
- Remove remaining production consumers of prototype/TS-native alternatives, then retire references with compatibility tests retained as needed.
- For each migration record original artifact/hash and symbol/instruction evidence, target native module, caller path and verification. Binary evidence supports reconstruction, not a claim to recovered Rust/Swift source bodies.

## Reproducible checks

`python3 scripts/audit-language-boundaries.py` inventories implementation files with hashes and review categories; categories are review queues, not per-file parity proof. This checkpoint adds the legacy TS native-host lifecycle logger to the retirement queue.

`node --import tsx --test reconstruction/native-host-public-boundary.test.ts` checks that normal native-host client graphs exclude the TS server/router/main/logger while the legacy API remains explicit.

No credentials, personal desktop/browser data or installed registrations are needed for this review.

## Existing repository follow-up: public entry points

Rechecked package manifests and callers after the user clarified that existing implementations must also follow the original native language:

- `packages/runtime-supervisor/package.json` now exposes those reference services only under explicit `/legacy` subpaths. The old root and service imports fail resolution. The normal reconstruction build gates compilation behind `--include-legacy`; direct source comparison tests remain and still need retirement.
- `packages/native-macos/package.json` still exposes `src/index.ts` and `src/service.ts`. These require operation-level classification: keep native process clients/bindings, migrate native service semantics to the evidenced Rust/Swift layer. Do not rewrite every TS file merely because its package name contains native.
- Root `package.json` still exposes `.` and `./native` to prototype outputs. `src/index.ts` imports `MacProvider`/`MacApp` from `src/native/provider.ts`. Legacy aliases do not remove these original public routes.
- `@core/native-host` has an explicit legacy route and normal client graph exclusion test. This is a verified boundary improvement, not evidence that all original native host behavior has been restored.

For every remaining migration, require: original artifact/symbol language evidence → responsibility mapping → native implementation → real caller switch → behavior validation → retire the old service/export. Original JavaScript remains readable TypeScript; original language unknown stays explicitly unknown until evidence exists. Native binary symbols do not establish recovered source bodies.

## Acceptance rule for existing TS replacements

The existing repository is in scope, not only future additions. A native rewrite is complete only when the original responsibility has language evidence, its native replacement is implemented, actual callers and public exports select that replacement, and behavior has been verified. Keeping a TS replacement behind a legacy flag is an intermediate migration state, not completion. Preserve TS implementations evidenced as original JavaScript and necessary native-process bindings. Record unknown native source languages as unknown rather than selecting Rust or Swift by guesswork.

## Existing-code inventory refresh — 2026-11-06

Fresh file hashes were generated with `scripts/audit-language-boundaries.py`. Current queues: 13 legacy supervisor TS implementations, 5 legacy native-host service/reference files, 6 desktop adapter files, 25 root prototype files, and 10 native-host files awaiting per-file language provenance. These counts are review scope, not proven mistranslations. Three native-host deployment/discovery files have JS evidence and remain TS; the supervisor bootstrap forwarder and native process bindings are separate from native service implementations.

Priority for the existing-code migration is unchanged: retire remaining TS supervisor service exports/consumers; retire TS native-host server/router/main/logger consumers; classify desktop adapter and root prototype native responsibilities and move evidenced native behavior to Rust/Swift. Keep original JS APIs, IPC clients and Node bindings in TS. For uncertain original native bodies, state that the implementation is a contract reconstruction rather than claiming recovered source.

This refresh changes the audit record and inventory only. It does not claim that the remaining legacy source or public API migration is complete.

## Rust-only CDP consumer and explicit reference exports

The CDP sandbox acceptance consumer no longer builds or launches TS serveSandboxedStdio, even without CUA_TEST_RUST_RUNTIME. Removed its unused legacy worker/bootstrap/config composition and always launch the shared Rust factory. A real isolated Chromium test passes input, submit, random result observation, screenshot and cleanup with only CUA_TEST_MACOS_SANDBOX=1. Normal @core/runtime-supervisor root/service exports are removed; explicit /legacy exports retain comparison compatibility. Production packages/src contain no imports of this TS package. Remaining direct comparison tests and 13 service implementation files have not been deleted and are not declared fully migrated.

## Sandbox comparison consumer follow-up

`runtime-macos-sandbox.test.ts` now starts the Rust browser host through its process binding and uses the canonical native Node bootstrap; it no longer imports the TS native-host server. Its supervisor remains an explicit TS comparison consumer because its injected authenticated-fetch callback and session-level assertions have not all been migrated.

The real Rust rmcp stdio acceptance now verifies kernel denial of outside/peer scratch/config files and a trusted-worker configuration write persisted by Rust RPC. These checks pass on both EOF and SIGTERM cleanup variants. This moves acceptance evidence for those responsibilities to the native layer; it does not remove the remaining TS supervisor comparison implementation.
