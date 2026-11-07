# Native AX enablement: source evidence and remaining work

Status: source audit, tracker/manual-enable components and isolated diagnostics;
the complete production enablement lifecycle is not implemented. Do not treat this as the established cause of Multica's
unresponsive clicks or add unconditional accessibility flags as a workaround.

## Source boundaries

Pinned SkyComputerUseService SHA256:
b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862.
Only static disassembly was used; the vendor service was not executed.

- ApplicationUIElement.enableAccessibilityIfNeeded(window:for:),
  0x1007000cc..0x1007002a0, first attempts the application's AX PID. Failure
  returns nil, as does absence of a running app or its bundle identifier.
- The operation at 0x1007002a0 checks supported manualAccessibility and UI
  context, with bundle/context-specific enhanced behavior and a third kind.
  UIElementContextType is already restored in declaration order:
  fullUIContext=0, eventStreamContext=1, informationalContext=2 (internal tags).
  Do not implement this policy as enabling both attributes for every app.
- Attribute names are present at 0x101257cb0 (AXManualAccessibility) and
  0x101257cd0 (AXEnhancedUserInterface). The manual enable helper starts at
  0x100700d78; its actual AX setValue call is at 0x1007011e8.
- An AXEnablementAssertion retains operation/kinds and isEnabled. disable()
  0x1007007e4 clears isEnabled BEFORE cleanup (0x10070083c); deinit at
  0x100700c3c uses the same once-only guard and cleanup.
- Cleanup iterates acquired kinds, decrements shared app/kind accounting via
  0x1007036a8, and only performs kind-specific release when that operation says
  to do so. Acquisition uses 0x100703360. This is shared lifetime accounting,
  not an attribute toggle to repeat around every read/click.
- ComputerUseAppController has an axEnablementAssertion owner. Its acquisition,
  replacement, cancellation and teardown lifetimes must be restored together
  with the complete policy, accounting and native operations before integration.

## Local Multica evidence

A read-only query on the running ai.multica.desktop app reported successful
supported-attribute enumeration. Both AXManualAccessibility and
AXEnhancedUserInterface were advertised and readable, with false values.
The earlier abnormal tree was still reproducible: AXWindows contained one
entry equal to the AX application root; AXChildren contained two entries,
one equal to that root.

An isolated diagnostic captured the original AXManualAccessibility value,
set it true successfully, waited 150 ms, read only tree structure counts and
restored the original value. The tree still had the same self-reference counts.
Restoration succeeded and a follow-up attribute read verified the original
value. No clicks, keys, screenshots, app activation or model calls occurred.

This does not establish that enablement is irrelevant: only one attribute and
one short interval were tested, without the full native assertion policy. It
DOES contradict the claim that simply setting AXManualAccessibility=true
immediately fixes the observed tree. Keep the missing lifecycle as an alignment
gap; continue tracing the actual click/observation failure independently.

## Required continuation

Restore all policy branches and kind operations from the pinned source, shared
accounting and assertion ownership; cover partial acquisition, repeated owners,
release-once, cancellation and teardown. Then integrate with observation and
window registry ownership. Validate with live before/after effects rather than
using accepted AX/event dispatch as proof of a successful interaction.


## Shared assertion tracker and Electron helper restoration

AXEnablementAssertionTracker restores the shared (application, kind) dictionary
semantics at 0x100703360 and 0x1007036a8. Acquire stores count+1 before reporting
and returns true only when the previous count was zero. Release of a missing
or nonpositive count reports and returns false. A final release removes the key
(and its retained running-app object) and returns true; intermediate releases
store count-1 and return false. No global PID-only counter, negative debt or
extra lock is substituted. The native owner must serialize use as in the source.
The generic application key supports isolated tests; integration will supply
NSRunningApplication and preserve its equality instead of extracting a PID.

The Kind descriptor 0x1012cc788 and records 0x10132305c/68/74 establish order:
enableElectronAccessibility, enableEnhancedUserInterface,
enableVoiceOverOnPreference. The third kind is not another AX Boolean flag;
its policy/native operation remains pending.

ElectronAccessibilityEnablement restores manual helper 0x100700d78:
only an explicit false attribute value leads to a true-write attempt. Nil or
already-true returns false and leaves the caller's changed flag intact. Encoding
and setter failures are discarded; the attempted-write path still marks changed
and returns true (0x100701200..0x100701214). Therefore true is not verified AX
write success. The concrete UIElement composition reuses the existing cached/
uncached Bool reader and provider-aware encoder/setter, without cache mutation.

Tests cover multiple owners, independent apps/kinds, first/last transitions,
failed-acquisition rollback sequences, mismatched release/reacquisition and
retention through the last kind. The Electron helper checks nil/false/true reads,
existing changed state and setter failures. Native Swift build, provider-click
self-test and expanded pinned static audit pass. These components are not yet
called automatically by the app controller; policy, operations for other kinds,
assertion cleanup/owner lifetime and controller integration remain outstanding.

## Owned-window live acceptance gate

scripts/test-native-indexed-click.py --allow-owned-ui is an explicit opt-in
integration gate. It only binds PIDs from fixture processes it launches, builds
temporary uniquely identified fixture bundles, and targets their Save button
with alwaysSimulateClick=true. A successful case requires observing a unique
saved-text result, not merely a dispatched response. Its intended cases are a
foreground fixture and that same fixture behind a second owned active fixture.
The fixture now reports activation/resignation events for those preconditions.
The gate uses the compatibility NDJSON transport to reach the real Swift mouse
backend; it does not establish restored MCP/AgentLoop acceptance.

Two local attempts terminated at the foreground-fixture activation precondition:
READY was received but no active notification arrived within the bounded wait.
The second attempt used a temporary .app bundle. No mouseInput request was sent,
so neither result proves or disproves click delivery. All spawned processes were
terminated by their owned subprocess handles. Local reports/stderr remain under
gitignored artifacts/debug; no runtime report is part of the published changes.
Do not mark the live gate green or remove its activation check to conceal this.
