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
The provider's name and cache fields alone do not prove a particular app-server
request or cache algorithm. The executable branches below provide that evidence.

## Recovered provider execution

`0x1000a7cbc..<0x1000a81f0` implements the actor-isolated cache/refresh path.
It captures `Date()` before checking the cache. A cached policy and timestamp
are used only when `now.timeIntervalSince(cachedAt) < 900`; the exact 900-second
boundary refreshes. The comparison's Double literal is `0x408c200000000000`.
The Date imports were resolved through GOT bindings at `0x101463298`
(`timeIntervalSince`), `0x1014633a0` (`Date.init`), and `0x1014633a8` (metadata).

A miss calls the fetch routine with a 30-second argument at `0x1000a7f40`.
Success stores the new policy and the **pre-request** timestamp. Failure returns
the error without replacing the previous cache or returning stale policy.
The actor awaits the request; this branch does not add in-flight coalescing.

`0x1000aa444..<0x1000aab28` creates a
`CodexAppServerJSONRPCConnection(timeout: 30, disablePlugins: false)`, then:

1. Sends `initialize` with current client info and capabilities including
   `experimentalApi: true` and `optOutNotificationMethods`.
2. Sends `configRequirements/read` with nil params.
3. Sends `config/read` with `includeLayers: false`.
4. Passes the two responses to parsing at `0x1000a98f0`.
5. Closes the connection on success, request errors, and parsing errors.

`NativeAppPolicyCache.swift` restores the cache branch using an injected clock
and loader and a generic payload. Those are host extraction seams, not original
API names. Tests cover cache hit, expiry boundary, failed refresh, retained old
cache after failure, request-start timestamps, and backwards clock changes.
This component is **not yet wired into production**: native transport and access
evaluation must be recovered first. The response parser is now restored below. The current
standalone policy remains enforced unchanged.

## Recovered response parser

`NativeComputerUsePolicy.swift` restores `0x1000a98f0..<0x1000aa444` and its
three helpers at `0x1000a90f4`, `0x1000a924c`, and `0x1000a93d4`.
The `requirements` envelope key must exist (NSNull is accepted); `config` must
exist and be a dictionary. Nested optional dictionaries accept missing/null as
empty, but reject non-dictionaries. Optional booleans accept missing/null as
true, but otherwise require **CFBoolean type identity** followed by a Bool cast.
Integer or string coercion is not permitted.

| Result | Response source |
| --- | --- |
| `allowComputerUse` | AND of `requirements.allowBrowserAndComputerUse`, `requirements.featureRequirements.computer_use`, `config.features.computer_use` |
| `allowPersistentApproval` | `requirements.computerUse.allowPersistentApproval` |
| `macos.defaultAppAccess` | `requirements.computerUse.defaultAppAccess` |
| `macos.bundleIDs` | `requirements.computerUse.macos.bundleIds` |
| `configuredMacOS.defaultAppAccess` | `config.computer_use.default_app_access` |
| `configuredMacOS.bundleIDs` | `config.computer_use.macos.bundle_ids` |

Every boolean is parsed before computing the conjunction, so an early false
does not suppress later malformed-field errors. Access defaults to `allow` for
missing/null; non-null access values must be exactly `allow` or `deny`. Both
enum lookup tables (`0x10154d7c0`, `0x10154d818`) reference these strings in that
order at `0x10123fa41`. Bundle maps default to empty; each entry must contain an
access string (null entries are rejected). Keys are retained without invented
case normalization, trimming, wildcard matching, or nonempty validation.

The parser keeps requirements and configured rule maps separate. It does not
establish which rule wins for an app, grant access, or override deployment
policy. The extracted parser uses a local `ParseError.invalidResponse` instead
of claiming the full original JSON-RPC error representation is restored.

Tests cover absent/null envelopes, all eight global-flag combinations, strict
Bool versus NSNumber handling, malformed later flags after an earlier false,
invalid dictionaries/access values, separate conflicting rule maps, exact key
spelling, empty bundle keys, and actual JSONSerialization boolean bridging.

## Current request boundary

The reconstructed `packages/sky/src/targets/mac/computer-use-policy.ts` asks the
native client for `getAppPolicy`, stops on `denied` or `forbidden`, requests
approval for `allowed`, and invokes the operation only after approval. The
client uses `ComputerUseIPCAppPolicyRequest`. Local policy allowance, user
approval, and macOS Accessibility/Screen Recording grants remain distinct.

## Work still required

1. Implement the concrete native connection integration and original error
   representation. Cache timing, parser, request sequence, and cleanup are
   evidenced; the complete original provider is not implemented yet.
2. Recover app policy evaluation: `macos` versus `configuredMacOS` precedence,
   bundle-ID matching, risk classification, and persistence application.
3. Map installed-app resolution and launch to the policy evaluation order.
4. Implement the recovered native-language logic with tests derived from those
   branches, preserving the independent deployment's explicit policy boundary.
5. Verify real app operations separately; metadata inspection is not UI acceptance.

No application rules or defaults were changed by this investigation. Do not
implement guessed permissive defaults or treat automatic approval as permission
to override a denied policy result.
