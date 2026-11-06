# Native app policy: observed structure and remaining reconstruction

The standalone helper's `SkyAppPolicy.swift` reads `CORE_CUA_APP_POLICY`
and denies unlisted bundle IDs. That is a deployment choice, not an established
default of the original Computer Use implementation. Do not describe it as a
requirement that every Codex user manually maintains an app whitelist.

## Reproducible static evidence

Run `python3 scripts/audit-native-app-policy.py`. It checks the complete pinned
binary SHA-256 before resolving Swift relative metadata pointers. It does not
execute the installed service. Results are in
`reconstruction/native-app-policy-evidence.json`.

| Original type | Fields / enum cases recovered from metadata |
| --- | --- |
| `CodexAppServerComputerUsePolicyProvider` | `$defaultActor`, `ttl`, `timeout`, `cachedPolicy`, `cachedAt` |
| `ComputerUsePolicy` | `allowComputerUse`, `allowPersistentApproval`, `macos`, `configuredMacOS` |
| `AppAccess` | `allow`, `deny` |
| `MacOS` | `defaultAppAccess`, `bundleIDs` |

These names establish that the original data model has a default-app-access
field in addition to bundle-ID configuration, global enablement, and persistence
configuration. They do **not** establish the value of the default, the meaning
or collection type of `bundleIDs`, or precedence between the two macOS fields.
The provider's name and cache fields are evidence of additional implementation
to inspect, not proof of a particular app-server request or cache algorithm.

## Current request boundary

The reconstructed `packages/sky/src/targets/mac/computer-use-policy.ts` asks the
native client for `getAppPolicy`, stops on `denied` or `forbidden`, requests
approval for `allowed`, and invokes the operation only after approval. The
client uses `ComputerUseIPCAppPolicyRequest`. Local policy allowance, user
approval, and macOS Accessibility/Screen Recording grants remain distinct.

## Work still required

1. Recover provider construction, request transport, decoding, timeout, caching,
   and failure semantics from executable logic.
2. Recover policy evaluation: global switch, `macos` versus `configuredMacOS`,
   bundle-ID matching, default access, risk classification, and persistence.
3. Map installed-app resolution and launch to the policy evaluation order.
4. Implement the recovered native-language logic with tests derived from those
   branches, preserving the independent deployment's explicit policy boundary.
5. Verify real app operations separately; metadata inspection is not UI acceptance.

No application rules or defaults were changed by this investigation. Do not
implement guessed permissive defaults or treat automatic approval as permission
to override a denied policy result.
