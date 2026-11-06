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

- Rust App Server: configuration and typed errors, child spawn/stop/wait, runtime-state reuse, ensure-started composition, stdout replay/forwarding, WebSocket output and EOF cleanup now exist with targeted tests. These modules are not yet connected to the production control dispatcher. Remaining work: WebSocket input and handshake, full proxy session/manager integration, hello/status/ensure/restart dispatch and original authorization.
- Swift desktop: complete original state/diff semantics and real screenshot/input acceptance; native language selection alone does not validate effects.
- Remove remaining production consumers of prototype/TS-native alternatives, then retire references with compatibility tests retained as needed.
- For each migration record original artifact/hash and symbol/instruction evidence, target native module, caller path and verification. Binary evidence supports reconstruction, not a claim to recovered Rust/Swift source bodies.

## Reproducible checks

`python3 scripts/audit-language-boundaries.py` inventories implementation files with hashes and review categories; categories are review queues, not per-file parity proof. This checkpoint adds the legacy TS native-host lifecycle logger to the retirement queue.

`node --import tsx --test reconstruction/native-host-public-boundary.test.ts` checks that normal native-host client graphs exclude the TS server/router/main/logger while the legacy API remains explicit.

No credentials, personal desktop/browser data or installed registrations are needed for this review.

## Existing repository follow-up: public entry points

Rechecked package manifests and callers after the user clarified that existing implementations must also follow the original native language:

- `packages/runtime-supervisor/package.json` still exposes TS `session`, MCP, stdio, pipe/config and sandbox host entry points. The default reconstruction build gates their compilation behind `--include-legacy`, but public exports still need consumer-by-consumer migration; build gating alone is not retirement.
- `packages/native-macos/package.json` still exposes `src/index.ts` and `src/service.ts`. These require operation-level classification: keep native process clients/bindings, migrate native service semantics to the evidenced Rust/Swift layer. Do not rewrite every TS file merely because its package name contains native.
- Root `package.json` still exposes `.` and `./native` to prototype outputs. `src/index.ts` imports `MacProvider`/`MacApp` from `src/native/provider.ts`. Legacy aliases do not remove these original public routes.
- `@core/native-host` has an explicit legacy route and normal client graph exclusion test. This is a verified boundary improvement, not evidence that all original native host behavior has been restored.

For every remaining migration, require: original artifact/symbol language evidence → responsibility mapping → native implementation → real caller switch → behavior validation → retire the old service/export. Original JavaScript remains readable TypeScript; original language unknown stays explicitly unknown until evidence exists. Native binary symbols do not establish recovered source bodies.

## Acceptance rule for existing TS replacements

The existing repository is in scope, not only future additions. A native rewrite is complete only when the original responsibility has language evidence, its native replacement is implemented, actual callers and public exports select that replacement, and behavior has been verified. Keeping a TS replacement behind a legacy flag is an intermediate migration state, not completion. Preserve TS implementations evidenced as original JavaScript and necessary native-process bindings. Record unknown native source languages as unknown rather than selecting Rust or Swift by guesswork.
