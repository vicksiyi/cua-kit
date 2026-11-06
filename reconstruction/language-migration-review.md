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

- Rust App Server: schema-2 validation and selection, complete load precedence, hello/status/ensure/restart, process/proxy lifecycle and original authorization. Environment resolution exists but is not connected to startup yet.
- Swift desktop: complete original state/diff semantics and real screenshot/input acceptance; native language selection alone does not validate effects.
- Remove remaining production consumers of prototype/TS-native alternatives, then retire references with compatibility tests retained as needed.
- For each migration record original artifact/hash and symbol/instruction evidence, target native module, caller path and verification. Binary evidence supports reconstruction, not a claim to recovered Rust/Swift source bodies.

## Reproducible checks

`python3 scripts/audit-language-boundaries.py` inventories implementation files with hashes and review categories; categories are review queues, not per-file parity proof. This checkpoint adds the legacy TS native-host lifecycle logger to the retirement queue.

`node --import tsx --test reconstruction/native-host-public-boundary.test.ts` checks that normal native-host client graphs exclude the TS server/router/main/logger while the legacy API remains explicit.

No credentials, personal desktop/browser data or installed registrations are needed for this review.
