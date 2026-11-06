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
This component is **not yet wired into production**: native transport and full
target classification must be recovered first. The parser and access predicate are restored below. The current
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

The parser keeps requirements and configured rule maps separate. Access is
evaluated by the recovered predicate below; parsing alone does not grant access
or override deployment policy. The extracted parser uses a local `ParseError.invalidResponse` instead
of claiming the full original JSON-RPC error representation is restored.

Tests cover absent/null envelopes, all eight global-flag combinations, strict
Bool versus NSNumber handling, malformed later flags after an earlier false,
invalid dictionaries/access values, separate conflicting rule maps, exact key
spelling, empty bundle keys, and actual JSONSerialization boolean bridging.

## Recovered app access decision

`0x1000a7860..<0x1000a79e0` first checks `allowComputerUse`. If false, it
returns false immediately. Otherwise, it looks up the supplied bundle ID in
the requirements `macos.bundleIDs` dictionary, falling back to that layer's
`defaultAppAccess`. Deny stops evaluation. The configured layer then performs
the same lookup/default operation. It too must allow the app.

There is no cross-layer override: an explicit allow in one layer cannot undo
a deny in the other. An explicit entry *can* override its own layer's default.
Matching uses the ordinary Swift string dictionary lookup, without additional
case-folding, prefix, wildcard, or whitespace handling in this predicate.
`allowPersistentApproval` does not participate in this access predicate.

At `0x100191c60..<0x100191c98`, a failed predicate becomes `denied`.
Only after it succeeds does the caller invoke
`SystemSoftware.BundleIdentifiers.isForbiddenComputerUseTarget`; true becomes
`forbidden`, false becomes `allowed`. The extracted decision method takes that
classifier as a dependency; a separate overload now uses the normal classifier
restored below.

Tests now cover 72 combinations of global enablement, both defaults and both
optional overrides, plus both forbidden-classifier outcomes and call ordering.
They also check exact key matching and that a literal wildcard-looking key
does not match arbitrary bundle IDs. This is not real-app operation acceptance.

## Normal forbidden-target classification

`0x1002570c0..<0x1002572d4` checks four static arrays in order; its predicate
thunks call string equality at `0x100194fc8..<0x10019501c`. These are exact
Swift string comparisons, not bundle-prefix matching. The static audit now
decodes each array and emits all 24 identifiers in the evidence JSON:

| Array address | Contents |
| --- | --- |
| `0x1015588a0` | 11 terminal application identifiers |
| `0x101558978` | 5 Codex application identifiers |
| `0x1015589f0` | 5 ChatGPT application identifiers |
| `0x101558c70` | UserNotificationCenter, LocalAuthenticationRemoteService, SecurityAgent |

`NativeForbiddenTargets.swift` restores this normal branch and the policy
overload composes it after the two-layer access check. Tests cover every
identifier plus case, whitespace, and suffix mismatches; policy denial still
takes precedence over forbidden classification.

The original function also has a process-preference override branch before
these arrays. This component does not read, change, or expose that override.
It therefore claims only the normal classification branch, not full parity
for every original process configuration. No current app rules were modified.

## Recovered risk and approval metadata

`0x100191eec..<0x100192130` classifies risk independently of the previously
computed allowed/denied/forbidden decision. It checks the terminal array,
then the elevated-risk array at `0x1015587c8` (11 identifiers), then, only if
both miss, `Bundle.supportsHTTPScheme` when a bundle exists. Any match yields
high risk and the original warning subtitle; otherwise risk is low with nil
subtitle. The elevated-risk array includes ScreenContinuity and password/keychain
applications and is decoded in the static evidence JSON.

The existing recovered `BundleWebClassification.swift` is reused. Its HTTP
predicate checks `CFBundleURLTypes` as an entire `[[String: Any]]` array, each
`CFBundleURLSchemes` as `[String]`, and exact `http` membership. It does not
infer this capability from app names, Electron classification, or `https` alone.

The result copies `allowPersistentApproval` from policy byte 1 at
`0x100192020`, writing it at result offset `0x50` at `0x10019207c`.
This branch does not add a high-risk persistence veto. This field describes
permitted approval choices, **not** a stored approval or an automatic approval.

`NativePolicyApprovalMetadata.swift` restores these fields with a lazy bundle
predicate and a concrete optional-Bundle overload. Tests cover all 22 terminal
and elevated-risk IDs, both persistence settings, probe short-circuiting,
missing bundles, exact scheme handling, and unmatched ID suffixes. It is not
yet wired to the standalone production policy or approval storage.

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
2. Finish complete target descriptor construction and approval persistence
   storage/integration. Risk and persistence-choice metadata, the two-layer
   access predicate, and normal forbidden-target branch are now restored; the
   original process-preference override remains outside this component.
3. Map installed-app resolution and launch to the policy evaluation order.
4. Implement the recovered native-language logic with tests derived from those
   branches, preserving the independent deployment's explicit policy boundary.
5. Verify real app operations separately; metadata inspection is not UI acceptance.

No application rules or defaults were changed by this investigation. Do not
implement guessed permissive defaults or treat automatic approval as permission
to override a denied policy result.

## Target descriptor and result composition

`ApplicationTarget.init(bundleIdentifier:bundleURL:)` at
`0x100261e30..<0x100261f10` retains the bundle ID and normalizes the URL with
`resolvingSymlinksInPath()` followed by `standardizedFileURL`. The identifier
helper at `0x100264a14..<0x100264b8c` normalizes again, obtains
`path(percentEncoded: false)`, and removes trailing `/` while the string count
is greater than one. The root `/` is preserved. This is path identity, not the
bundle identifier. `NativeApplicationTarget.swift` restores these operations.

The result branch at `0x100191c2c..<0x100192130` evaluates access and forbidden
classification **before** constructing `Bundle(url:)`. It chooses the first
String value from `CFBundleDisplayName` and `CFBundleName`; wrong types fall
through, but an empty String is accepted. When neither is a String, it uses
`bundleURL.deletingPathExtension().lastPathComponent`. The canonical identifier
is copied into the result's app path. Risk classification and persistence
metadata follow descriptor construction, including for denied applications.

`NativeAppPolicyResult.swift` composes these recovered components. Its
`ipcObject` is a standalone dictionary projection matching the observed Sky
client contract, not a claim to have reconstructed the original wire encoder.
Tests exercise real temporary symlinks, Unicode and spaces in paths, root path
preservation, display-name fallback and empty names, lazy evaluation order,
JSON projection, concrete Bundle fallback and denied/high-risk results.

These components do not launch an app, grant approval, or replace the current
`SkyAppPolicy` deployment policy. Native policy transport, application
resolution and production wiring still require reconstruction and validation.

## Application resolution control flow

`NSWorkspace.resolveApplicationTarget(for:)` (`0x10026222c..<0x1002624b8`)
first probes the input as a bundle path. If that fails, it enumerates targets
by bundle identifier and passes a nonempty result to the candidate selector.
Only an empty list proceeds to `SAIApplicationPathForName`, followed by another
bundle path probe. A failed name/path lookup throws the not-found error. A
selector error propagates; it does not trigger name fallback.

`resolveApplicationTargetPreferringRunningApplication(for:)`
(`0x100262c10..<0x100262e34`) also probes the path first, then tries running
targets by bundle ID. A nonempty running list goes through the same selector.
An empty list calls the ordinary resolver, including a second path probe.

The path helper (`0x1002624b8..<0x1002626a8`) uses `Bundle(path:)` and its
`bundleIdentifier`; it does not check for an absolute prefix or `.app` suffix.
The ObjC selector references at `0x101542ab8` and `0x101542740` decode to
`initWithPath:` and `bundleIdentifier`. The successful branch constructs a
file URL and the normalized ApplicationTarget.

`SAIApplicationPathForName` (`0x100244ac8..<0x100244b34`) is Objective-C. Its
selector stubs resolve to `sharedWorkspace` (`0x101543e20`) and
`fullPathForApplication:` (`0x101543d38`). It is restored in an Objective-C
`.m` file, not translated into TypeScript. It does not launch the app.

`NativeApplicationResolution.swift` restores the two control-flow methods
and concrete Bundle path probe. Enumeration remains an injected dependency; candidate selection is now
restored below: the original enumeration includes running candidates
and additional URL processing; the original selector rejects ambiguity rather
than blindly selecting the first app. The remaining enumeration helpers must be fully recovered
before replacing `Launch.swift`. Tests verify fallback order, selector error
propagation, and a real temporary `.bundle` path accepted by Foundation.
The lookup-error descriptions are restored below.

## Candidate selection and lookup errors

The shared selector (`0x100262934..<0x100262b64`) has three outcomes: an
empty list throws the not-found case, exactly one target returns unchanged,
and multiple targets throw ambiguity. The multiple branch maps each target's
canonical `identifier`, sorts that String array and stores it in the error.
The selector itself does not deduplicate identical identifiers. Its sort helper
at `0x10026353c` calls the Swift String comparison implementation through
`0x101152ff4` / GOT `0x101467f90`, rather than a localized filename comparator.

The description getter (`0x1002632d0..<0x100263414`) emits:

- `Invalid app: <reference>`
- `Ambiguous app identifier '<reference>'. Multiple apps share this bundle identifier: <paths joined by comma-space>. Use an app name or full app path instead.`

The separator is the small String literal `0x202c` (comma-space); its join
call resolves via GOT `0x101466148` to Swift `joined(separator:)`. Error text
constants are at `0x10124ae20`, `0x10124ae40` and `0x10124ae70`.
`NativeApplicationResolution` now uses the reconstructed selector by default.
Tests cover zero/one/multiple entries, duplicate entries, sorted error paths
and exact descriptions, and running-target ambiguity propagating without
installed or name fallback. This does not complete native enumeration or
change the current production launch/authorization path.

## System enumeration and production resolution integration

`applicationTargets(withBundleIdentifier:)` (`0x1002626a8..<0x100262934`)
queries `NSWorkspace.urlsForApplications(withBundleIdentifier:)` first, then
calls the running-target enumerator. It maps those targets to bundle URLs,
appends the installed URLs, and validates/deduplicates the resulting stream.
The output order therefore favors running targets even though the installed
query executes first. Running candidates are validated a second time during
the merged pass, rather than simply concatenating previously trusted targets.

The running enumerator (`0x100264e58..<0x100265228`) obtains
`NSRunningApplication.runningApplications(withBundleIdentifier:)`, compactMaps
`bundleURL`, and applies the same candidate validation with its own seen set.
Validation (`0x100263040..<0x1002632d0`) constructs a normalized target, reads
`Bundle(url:).bundleIdentifier`, compares it to the requested ID with Swift
String equality, then inserts the target identifier into a String set. A
missing/mismatched bundle ID or duplicate identifier drops the candidate.
Rejected entries do not occupy the set. Each duplicate is revalidated before
its set insertion, preserving the original read ordering.

`NativeApplicationEnumeration` restores these operations and
`NativeApplicationResolution.system()` binds them to AppKit plus the ObjC
name bridge. `resolveInstalledApp` now uses the ordinary resolver: the original
policy entry calls that variant at `0x100191b2c`, not the running-preferred
variant. The standalone host keeps its `TARGET_NOT_FOUND` error-code mapping
and result dictionary, while preserving native error descriptions. Existing
policy rules and approval checks are unchanged.

Validation includes real temporary bundles with matching, mismatched and absent
IDs, symlink duplicates, query/read ordering, rejection-before-dedup behavior,
and a production helper RPC test of direct/symlink paths and not-found errors.
The RPC test launches no app and proves resolution only. Full desktop actions,
policy transport, approvals and end-to-end AgentLoop acceptance remain separate
requirements. Earlier sections describing pending enumeration or pending
resolution integration are superseded by this section.

## Executable policy-fetch orchestration

`NativeAppPolicyFetch.swift` restores the provider's request sequence from
`0x1000aa444..<0x1000aab28` against an injected connection protocol:

1. Construct connection with the supplied timeout and `disablePlugins: false`.
2. Request `initialize` with `clientInfo` and capabilities
   `{ experimentalApi: true, optOutNotificationMethods: [] }`.
3. Request `configRequirements/read` with nil params.
4. Request `config/read` with `{ includeLayers: false }`.
5. Parse the two response envelopes, then close and return.

The empty opt-out array at `0x1000aa608` loads GOT `0x101468918`, bound to
`__swiftEmptyArrayStorage`; it is not a missing field or a subscription list.
The initialize response payload is discarded after a successful request.
There is no extra initialized notification in this provider sequence.

Connection creation errors propagate before reading client identity. Once a
connection exists, request and parse failures all close it and propagate. The
implementation uses `defer` for this shared cleanup. Tests verify exact methods,
payload shapes, nil parameters, all three request failure positions, invalid
policy responses, connection creation failure and original error identity.

The connection protocol is an explicit reconstruction seam. These tests use
a local fake connection and make no Codex/DeepSeek request. Concrete native
process transport and its request reader remain incomplete; this code does
not switch the helper's active policy source or change approval rules.

## JSON-RPC message decoding boundary

The decoding continuation of `nextMessage(timeout:method:)` at
`0x100dd0740..<0x100dd0958` returns nil when the optional line is absent.
Otherwise it converts the String to data and invokes
`JSONObjectWithData:options:error:` (selector reference `0x101543cb0`), passing
options zero. A Foundation parse error propagates; successful values must cast
to `[String: Any]` or the invalid-response branch throws. This stage neither
unwraps `result` nor validates IDs or JSON-RPC version.

`NativeJSONRPCMessageDecoder` restores that decoding boundary. Tests cover EOF,
empty dictionaries, Unicode and null values, whitespace/CRLF, arrays, blank
lines, malformed JSON and scalar fragments. Foundation errors remain distinct
from non-dictionary container errors. The local error enum represents only
this branch, not the complete native JSON-RPC error type.

Static metadata identifies the original private line buffer as an actor with
`lines`, `waiter`, `terminalError`, and `finished` state. Its initialization at
`0x100db9d3c` starts with an empty array, absent waiter/error and false finished
flag. This establishes structure, not its complete enqueue/cancellation rules.
The actor reader, timeout race, framing, response dispatch and process lifecycle
are still pending; the decoder alone does not establish a working connection.

## Connection close lifecycle

`close()` (`0x100dd0958..<0x100dd0bdc`) first acquires the unfair lock protecting
the closed Bool. An already-closed connection unlocks and returns. Otherwise
it marks closed and unlocks **before** resource cleanup:

1. Close the input pipe's writing handle, ignoring a thrown close error.
2. Cancel the reader task.
3. Terminate the process only when `isRunning` is true.
4. Start an asynchronous task that awaits the reader's completion and then
   closes the output pipe's reading handle, ignoring that close error too.

The deferred cleanup at `0x100dd0bdc..<0x100dd0d9c` awaits a nonthrowing Task's
value. Imports at `0x101469578` and `0x101469598` bind to `Task.cancel()` and
`Task<Success, Never>.value`. Selector references identify writing/reading
handles (`0x1015429e0`, `0x1015429d8`), `closeAndReturnError:` (`0x101542128`),
`isRunning` (`0x101542b10`) and `terminate` (`0x101542e40`). There is no synchronous
process-exit wait or immediate output-handle close in this method.

`NativeJSONRPCConnectionCleanup` implements that lifecycle with
`OSAllocatedUnfairLock<Bool>` and Foundation Pipe/Process plus Task bindings.
Injected callbacks are a host test seam. Tests race 128 close callers for each
combination of running/stopped process and throwing/nonthrowing handle-close
operations; cleanup occurs once and output close waits for reader completion.
This component is not yet attached to a complete reconstructed connection.
Line buffering, timeout handling, request dispatch and process launch remain
incomplete; no real application process was terminated by these tests.

## Line-buffer actor: verified state transitions, reconstruction pending

The descriptor at `0x1012e48c8` resolves to `JSONRPCLineBuffer` and field
metadata at `0x10133ea68` confirms `$defaultActor`, `lines`, `waiter`,
`terminalError`, `finished`. The audit now verifies these fields directly.
The method descriptor at `0x1012e4974` resolves to `0x100dd1be8`; the async
entry pointer `0x10120d0a8` resolves to `0x100dd1e30`; the descriptor at
`0x1012e4984` resolves to `0x100dd2ba0`. These are private symbols, so operation
names below describe observed behavior rather than recovered public names.

The finish operation (`0x100dd1be8..<0x100dd1e30`) is first-finish-wins. If
already finished it returns. Otherwise it stores the supplied optional terminal
error, sets finished, takes and clears the waiter, and resumes that waiter with
the supplied error or nil. It does **not** clear queued lines.

The immediate part of next (`0x100dd1e90..<0x100dd1fac`) has a significant
priority order:

1. Return and remove the first queued line if any remain.
2. Otherwise throw the stored terminal error if present.
3. Otherwise return nil when finished.
4. Otherwise proceed to asynchronous waiter registration and cancellation.

Thus a terminal error does not discard already-buffered messages, and the
error wins over clean EOF only once the queue is drained. A generic stream
replacement that checks finished/error before the queue would diverge.

The pending path uses an identity-bearing waiter, a task cancellation handler
and a separate actor operation at `0x100dd2ba0` that conditionally clears and
resumes the waiter with CancellationError. Registration/cancellation race
behavior and the producer's enqueue path still need complete tracing before
implementing the actor; the audit hashes these ranges without claiming their
full semantics are restored. This evidence changes the implementation plan:
preserve explicit queued/terminal/waiter state rather than substituting an
unverified AsyncStream policy. No production behavior changes in this audit.

## Implemented line-buffer actor

Further tracing located enqueue in the connection reader, inlined at
`0x100dcd874..<0x100dcda24`. A finished buffer drops incoming lines. Otherwise
it checks the waiter: absent waiter appends to `lines`; present waiter is
cleared before resuming it with the incoming String. No line-content filtering
or queue size cap occurs in this branch.

`nextLine()` creates a UUID only when it must suspend. Its checked continuation
registration at `0x100dd236c..<0x100dd248c` stores the UUID/continuation pair.
The surrounding operation installs a cancellation handler that schedules an
actor operation. That operation (`0x100dd2ba0..<0x100dd329c`) compares the
request ID with the current waiter, clearing/resuming with CancellationError
only on a match. It neither finishes the buffer nor replaces the terminal
error. A cancellation arriving after delivery cannot cancel a newer waiter.
There is no added eager cancellation check ahead of the queued/error/EOF
branches in the restored implementation.

`NativeJSONRPCLineBuffer.swift` now implements this actor, including the
previously documented finish and queue-priority rules. It retains a single
waiter, matching the original storage; upstream consumer serialization is
required, rather than inventing support for multiple simultaneous pending
readers. The internal `pendingWaiterID` property is a host diagnostic for race
tests, not a claimed original API.

Tests cover FIFO and empty strings, queue draining before errors, first finish
winning, repeated terminal errors, append-after-finish, direct delivery, clean
and error finish waking waiters, cancellation followed by further reads, stale
cancellation IDs and cancellation requested before registration. Swift build
and the executable tests pass. The earlier pending actor notes are superseded
by this implementation; byte framing, timed nextMessage orchestration, request
dispatch and process creation still remain to complete the connection.

## Foundation pipe reader integration

The native reader at `0x100dcd480..<0x100dcdbec` uses Foundation, rather than a
custom byte splitter. Calls at `0x100dcd5e4`, `0x100dcd614` and `0x100dcd634`
resolve respectively to FileHandle `bytes`, AsyncSequence<UInt8> `lines`, and
`AsyncLineSequence.makeAsyncIterator`. GOT bindings are `0x1014638b0`,
`0x101463848`, `0x101462a98`; iterator next uses `0x101462aa8`.
The clean completion branch calls finish(nil) at `0x100dcd814`; the failure
branch supplies the thrown error at `0x100dcdba4`.

`NativeJSONRPCPipeReader.read(_:into:)` now connects `handle.bytes.lines` to
the reconstructed line-buffer actor. It forwards lines unchanged, finishes
on EOF, and stores the original read error on failure. Task creation and
handle ownership remain in the connection layer. Its generic consume method
is a test seam for injecting an AsyncSequence failure. Foundation controls
Unicode, newline, blank-line and trailing-line behavior; decoder unit tests
for an explicitly supplied blank String do not imply that every blank byte
line reaches that decoder through Foundation.

Executable tests use owned real Pipe instances and compare framing against an
independent direct Foundation reader, including Unicode, CRLF, blank input
lines and a final line without newline. A second real pipe verifies the chain
from bytes through buffered lines to JSON dictionaries and EOF. A failing
sequence proves queued data survives before the identical error is rethrown.
Swift build and these tests pass. No vendor process or model request is used.
Timed nextMessage handling, request matching and process creation still remain
before a complete native policy connection can be claimed.
