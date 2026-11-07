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

## Assertion lifetime and release composition restored

AXEnablementAssertion now owns the acquired kind list and retained release
operation. Explicit disable marks the assertion disabled before cleanup;
reentrant disable and later deinit do not run it again. Implicit deinit also
cleans up once. The captured operation/resources remain retained after explicit
disable until the assertion itself is destroyed, matching the native fields.

releaseAXEnablementKinds restores 0x10070083c: traverse in acquisition order,
including duplicates; decrement shared accounting; only final release reports
and performs native cleanup. Electron/manual and enhanced-UI cleanup attempt
false writes through the existing encoder/provider setter, discard failures and
continue to later kinds. The concrete UIElement factory captures the original
app/root/shared tracker and creates this release lifetime, without acquiring or
enabling anything on its own.

VoiceOverPreferenceRelease restores the native third-kind release boundary
0x100705020..0x100705214. A running com.apple.VoiceOver app skips all preference
work. Otherwise create UserDefaults(suiteName: "com.apple.universalaccess"); a
missing suite returns without notification. Set false for voiceOverOnOffKey,
then construct NSDistributedNotificationCenter via init and post
com.apple.universalaccess.VoiceOverSettingsDidChange with nil object. Selectors
were checked at 0x101542c28/ac8, 0x1015430d0 and 0x1015420d8/b90; class binds
confirm NSUserDefaults and NSDistributedNotificationCenter. This is not a
request to stop VoiceOver or terminate its app. No system preference or
notification was changed during validation; tests supply isolated callbacks.

Injected checks cover multiple owners, duplicate/order handling, setter errors
followed by later releases, missing cleanup, explicit/reentrant/deinit release,
operation retention through cleanup and after explicit disable, plus running-
VoiceOver and missing-suite short circuits. Native build, provider-click self-
test and expanded pinned static audit pass.

Controller owner timing is now also located: activate() at 0x10007243c checks
its existing assertion; if absent, reads primaryWindow (0x100072474), calls
enableAccessibilityIfNeeded with fullUIContext tag 0 (0x10007249c), stores the
optional assertion, then starts WindowOrderingObserver (0x1000724d8). Do not
replace this with unconditional toggles around individual click/read calls.
Full acquisition policy, enhanced/VoiceOver enable operations, initialized-app
tracking and controller activation/deactivation integration remain outstanding.

## Locked desktop explains the current live-gate startup failure

A later read-only desktop query confirmed CGSSessionScreenIsLocked=true,
onConsole=true and loginDone=true, with com.apple.loginwindow as the frontmost
app. The fixture's native activation probe independently reported a regular
activation policy, inactive NSApplication/NSRunningApplication state and a false
return from NSRunningApplication.activate(options: []). The same results occurred
when LaunchServices launched the temporary fixture bundle. These observations
explain why the current foreground precondition cannot pass while locked; they
are not evidence for the cause of the user's earlier unlocked click incident.

The gate now calls CuaFixture --desktop-session-check before launching windows
or the helper, records only session-state booleans and fails with DESKTOP_LOCKED.
The verified locked run terminated at desktop-preflight with zero input cases.
It remains a failed/not-executed live acceptance, never a skipped green check.
The launcher uses NSWorkspace/LaunchServices and retains its owned child object
for graceful termination (force termination after a bounded grace period), with
only exact fixture executable copies accepted. A process inventory found zero
remaining owned temporary fixture processes after the previous attempts.

Unlocking is required for live frontend/backend acceptance. Code reconstruction
can proceed while locked; the goal is not complete or globally blocked by this
single verification prerequisite. Local reports remain gitignored.


## Acquisition-policy orchestration restored

AXEnablementAcquisition restores the operation body at
0x1007002a0..0x10070067c, with explicit native operation/initialization boundaries
and no no-op fallbacks. The outer PID/running-app/bundle lookup and native
operations still require integration; this is not automatic controller enabling.

Primary kind selection always queries manual-attribute support first. When
supported in fullUIContext, select Electron/manual. Otherwise select enhanced
UI for bundle identifiers starting with com.apple.iWork, exact
com.spotify.client, or fullUIContext. Other contexts/apps have no primary kind.
Native manual-support composition reuses uiElementIsAttributeSupported and its
existing cache/fresh-attribute policy.

VoiceOver preference eligibility at 0x1007019f8 uses exact Excel and Music IDs
in all contexts; exact Arc and Dia only in fullUIContext; and the Atlas prefix
in every context. The actual Swift imports were verified through chained-fixup
bindings: String.hasPrefix differs from _stringCompareWithSmolCheck equality.
These are source-specific application rules, not generic browser heuristics.

Acquisition appends each selected kind BEFORE incrementing its shared count.
Only the first holder invokes that native enable operation. A false enable
result rolls the count back, but does not delete the kind from the assertion's
list. VoiceOver selection follows the primary kind. This preserves the source's
possible missing-release report on later teardown of a rolled-back kind; it
does not invent a successful assertion or disable an already-enabled setting.

Initialization then evaluates changed || windowEligibility (lazy OR). If eligible,
a selected Electron kind permits initialization again even for a known app;
other kinds require absence from initialization history. Successful initialization
marks the app. This can happen even if no kind was selected, in which case no
assertion is returned. The final assertion factory runs only for nonempty kinds,
after initialization. Native windowEligibility and initializeApplication helpers
remain required dependencies, not guessed geometry/browser fallbacks.

AssertionTracker now also preserves initializedApplications as an array. Source
0x1007030f4 reports before appending; duplicate entries are retained. This history
outlives active-count entries and retains its app objects until tracker teardown.
It is not a Set or a flag reset by the last active assertion release.

Tests cover explicit bundle/context tables and prefix boundaries, support-read
ordering, failed enable rollback with retained kind list, independent VoiceOver
acquisition, repeated owners, Electron reinitialization, known non-Electron init
suppression, init failure/retry, initialization with no returned assertion, and
initialized-app retention. Native Swift build, provider-click self-test and
expanded pinned audit pass. No native enable/initialization, input or preference
operation was invoked by these injected tests.

Remaining native boundaries: enhanced-UI enabling, VoiceOver preference enabling,
window initialization eligibility, application initialization, shared tracker
creation and complete controller activate/deactivate ownership. Window cache,
notifications, coordinate-click integration and unlocked live acceptance also
remain outstanding; the full goal remains active.


## Enhanced UI and VoiceOver enable operations restored

The enhanced-UI operation (0x100701230..0x1007019f8) now preserves the
explicit-false attribute guard. Only exact Spotify marks the changed flag;
when inactive it temporarily enforces focus, polls activation for at most one
wall-clock second in 50 ms intervals, writes the attribute, and deactivates
and releases the enforcer. Other applications attempt the write without that
Spotify-specific focus or changed-flag behavior. Setter failures are ignored,
as in the pinned implementation.

VoiceOver preference enabling (0x100701b4c..0x100701e04) uses the universalaccess
UserDefaults suite, only changes an initially false voiceOverOnOffKey, and
posts VoiceOverSettingsDidChange. Exact Arc/Dia and the Atlas prefix additionally
start an unstructured task that sleeps 100 ms on ContinuousClock before writing
false. The delayed write posts no notification. Sleep failure/cancellation skips
that write; dropping the task handle does not cancel it. This differs from the
separate assertion-release helper and must not be replaced with its guards.

Both operations have injected checks for guards, ordering, failure behavior,
resource retention and timing. Task checks verify inherited task-local context
and cancellation propagation. Native Swift builds, provider-click self-test and
pinned binary audit pass. These checks send no input, change no real preference,
and post no distributed notification. Controller ownership and application
initialization remain to be connected, so this is not proof of working live clicks.

The user's later authorization cancellation followed earlier no-op operations.
It is not an explanation for those earlier failures, and a canceled action must
not be retried as if authorized. The current locked desktop is a separate live
verification prerequisite, not a retrospective diagnosis of the unlocked run.


## Application initialization operation boundary

Static inspection of 0x100701e04..0x1007020b4 and its condition thunk
0x100705a28 -> 0x100704f98 establishes a separate readiness criterion: absent
window returns false without delay or poll; an available window is retained
through a 100000-microsecond usleep, followed by pollUntilTrueSync(timeout: 1,
delay: 0.05). Its condition asks for a WebAreaUIElement descendant through
UIElementProtocol.descendant(ofType:passingTest:). Success returns true;
poll errors are reported and return false. Screenshot success is not a
substitute for this readiness check.

AXApplicationInitialization preserves this operation with explicit injected
polling and WebArea search boundaries, no successful no-op defaults. Checks cover
nil-window short circuit, exact timing arguments, window identity, repeated
condition calls and error ordering. The complete native descendant predicate,
traversal and polling implementation remain outstanding; this helper must not
be represented as automatic production initialization until those are composed.
