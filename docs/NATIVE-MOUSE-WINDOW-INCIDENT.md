# Native mouse dispatch without a target window

2026-11-07: latest Multica run successfully observed the app and issued multiple
indexed and coordinate clicks. The resulting observations remained on Inbox.
`dispatched` only confirmed event submission, not UI acceptance. This run is not
explained by a model service outage.

The production helper constructed raw CGEvents and posted to a PID without an
AppKit window number, window-under-pointer fields, or window-local position.
That is an established implementation gap and a plausible cause of dropped
clicks; a successful live Multica retest is still required to establish that it
fully explains the incident.

Static evidence in the installed pinned SkyComputerUseService:
`SynthesizedEvent.mouseEvent` at 0x1007547d4 constructs an NSEvent and obtains its
CGEvent; +228 sets flags, +240 global location, +256 button, +272 subtype 3,
+288..+320 window fields 91/92, +324..+500 converts into window-local coordinates
and calls WindowServerSPI.setWindowLocation. The binary was not executed.

The helper now uses NSEvent construction and supplies those fields. Indexed
clicks resolve AXWindow, its window ID and frame; coordinate clicks use the
validated captured window. No arbitrary focused-window fallback is used.
CGEventSetWindowLocation is dynamically resolved; absence produces an explicit
unsupported-capability error before dispatch. Returned dispatch metadata includes
windowId and the global point for subsequent debugging. AXPress selection,
snapshot validation and application access policy remain in force.

Validation: Swift build, native --self-test (including negative-screen origin,
window fields, both coordinate orientations, and Retina point conversion), and
--provider-click-self-test pass. The local execution context reports Accessibility
and Screen Recording false; no external-app click was attempted. No model loop
was run. Run the same demo from the user's already-authorized terminal to complete
live acceptance, then inspect its local debug log and actual page transition.

Not restored by this patch: full SyntheticAppFocusEnforcer / VirtualCursor;
keyboard, drag and scroll event parity; complete native event dispatch machinery.
The existing screenshot coordinate convention is unchanged by this patch.

## Dispatch timestamp follow-up

Further static inspection found `SynthesizedEvent.send(to:delay:)` stamps each
individual event immediately before posting (setTimestamp call at 0x100753970,
postToPid at 0x10075397c). NSEvent construction uses timestamp zero; retaining
that timestamp during dispatch is a fidelity gap. A shared dispatch boundary now
refreshes each event's timestamp using monotonic uptime nanoseconds. Mouse,
keyboard, drag and scroll call this boundary. The release event is stamped after
the awaited hold, including cancellation cleanup, not when the pair was created.

The regression injects a deterministic clock and post callback: down at 100,
release at 250, for both normal and cancelled waits. It posts no real OS input.
Build, input, held-input, drag and provider-click checks pass. Static call sites
are pinned by scripts/audit-native-mouse-dispatch.py. This does not yet reproduce
the entire source send-loop timing, focus machinery or click-event counter.

## Click sequence counter

The getter at 0x1007547b8 returns and then increments a process counter, initially
zero at 0x101574978. The click builder at 0x100755a4c allocates one number per
click and reuses it for down/up (x24 at 0x100755bbc and 0x10075628c). The separate
click count is x25, starting at one within each request. Previously both fields
used the per-request click index, restarting the event number at every command.

The helper now shares a checked Int64 counter through SynthesizedEvent; an NSLock
is host synchronization, not claimed source behavior. Regression verifies two
clicks followed by a separate command: event numbers [n,n,n+1,n+1,n+2,n+2], click
counts [1,1,2,2,1,1]. Input, held-input and provider-click checks pass. Static audit
pins the initializer and both down/up argument sites. Drag numbering and complete
source event construction remain separate work; this is not full parity.

## Scroll construction audit (partial)

The source scroll factory at 0x100754a60 creates a HID-system-source pixel event
with wheelCount=1, deltaY as wheel1, deltaX as wheel2. A readable Swift factory now
captures this construction, global location and window-local conversion. Native
scroll also optionally sets a dynamically resolved window field before fields
91/92; that extra field is not restored yet.

Two direct CoreGraphics observations constrain integration:
- With wheelCount=1, horizontal page-scroll regression failed. The existing
  two-axis demo page-distance adapter therefore remains until higher-level native
  callers are traced. The source factory is not misrepresented as its replacement.
- Wheel events read back zero for mouse fields 91/92 after setting them, whereas
  CGEventGetWindowLocation returns the supplied local point. Merely applying the
  mouse-window helper does not demonstrate successful scroll-window targeting.

The production adapter now supplies the observed window context and local point;
full wheel-event window routing remains unverified and incomplete. Regression
covers global/local coordinate preservation, source vertical delta, and the
existing four-direction page-distance behavior. No live app scroll was tested.

## 08:56 run: wire decoding forced synthetic clicks

The latest local run started at 08:56 UTC. Model calls continued normally;
getApp initially timed out while waiting for terminal approval. After acceptance,
indexed clicks on task links and later coordinate clicks returned without a tool
error, while heading observations stayed on Inbox. The final double-click was
cancelled by the user and must not be counted as an executed click.

A concrete routing defect was found in decodeSkyElementAction: omitted duration
was materialized as zero. The restored JS client sends an optional duration and
JSON omits undefined. The restored native preparation only permits AXPress/AXPick
when holdDuration is nil. Thus the adapter systematically disabled AX actions for
ordinary clicks, even though the model requested no hold. This defect lay between
the previously tested decoder and the previously tested click-routing component.

The decoder now preserves absence. Explicit zero remains present (and preserves
the source's synthetic-input selection). Added a cross-component regression for
omitted, zero and nonzero durations. Build and sky-action, provider-click, input,
held-input checks pass. This restores eligibility, not unconditional AXPress:
web-view hit testing may still choose synthetic input as in the source.

Remaining incident limits: actual Multica acceptance is not yet demonstrated;
background focus enforcement is still absent; the log does not record the chosen
native route; the running helper's binary fingerprint is not in the run log.
Rebuilding the executable does not replace an already running process. A fresh
CLI run is required to test this fix. Approval waiting/countdown behavior is a
separate observed issue and was not changed or bypassed here.

## Default click timing

Static Duration storage at 0x1011950e0 encodes 50 milliseconds. The click dispatch
flow at 0x1007b2f40 checks event type; for a non-final down event it chooses the
larger of the requested hold and this default (Duration.< import at GOT
0x101468848, selection at 0x1007b300c). Other non-final events use the default
interval. Previously the helper sent ordinary synthetic down/up with no wait.

Synthetic click pairs now hold for at least 50 ms, preserve longer requested
holds, and wait the default interval between repeated pairs. Omitted duration
remains absent for AX routing; the timing fallback is applied only when posting
synthetic events. Native default constant and max-selection instruction are
pinned in the audit. Build, held-input, sky-action and provider-click checks pass.
This corrects timing evidence, without claiming a live Multica acceptance result.

## Synthetic activation decision recovered

ApplicationUIElement.syntheticallyActivateIfNeededForSendingClick at
0x1006fc140..0x1006fc708 differs from unconditional foreground activation:
- Without an enforcer, read AX PID and return NSRunningApplication.isActive
  (false for missing app); propagate the PID read error. No activation occurs.
- With an enforcer, first return true if applicationBelievesItHasFocus is true.
- Otherwise held-key input requires safe enforcement.
- Coordinate input requires enforcement if inside a WebView or if clicking the
  target may cause selection.
- Otherwise Catalyst apps require enforcement for selection-sensitive targets
  or membership in the source's role set.
- Return false when no condition applies; successful enforcement returns true,
  and failures propagate.

The orchestration is restored in ApplicationClickActivation.swift using explicit
dependencies. The duplicated selection read is preserved when coordinate input
falls through into Catalyst handling. Tests cover 256 input combinations and
read order. It is not wired to production until the actual state owner, role-set
adapter and safe enforcement operation are restored. No fake enforcer or generic
activate() substitutes for those missing components. This step explains another
real gap but does not establish successful background Multica input.

## Activation notification primitives

Recovered notifyAppActivated (0x100754408 -> 0x100730374) and
notifyAppDeactivated (0x100754420). Activation constructs AppKit-defined event
subtype 1, window number, zero timestamp/location/data fields, and flags 0xc0000
only for nonzero window IDs. If and only if window ID is nonzero and both bounds
and activation point exist, it appends left-down and left-up events with fixed
numbers 1/2, clickCount 1, subtype 3, global location and UNFLIPPED window-local
location. These activation events do not use the ordinary click counter.
Deactivation constructs subtype 2 with window zero and empty flags.

Eight presence combinations and the notification/click metadata are checked by
--self-test, without posting OS events. Build and checks pass. Source call sites
are pinned. These primitives remain outside production until focus state,
notifications, enforcement ownership and restoration are connected; they are
not a claim that synthetic focus or Multica interaction is complete.

## Window key-focus notification primitives

The source does not use AppKit activation subtype 1/2 for key-focus changes.
Its processNotification initializer at 0x10072f560 sets event type 21; initializers
0x10072f6b0 and 0x10072f6e8 set key-focus taken=0x4000 and returned=0x8000.
The common builder (0x100754554) constructs an otherEvent with zero flags, window,
time, location and data fields. The returned subtype is signed Int16(-32768),
not a positive out-of-range conversion.

Restored both event constructors and verified their round trip through NSEvent
on this host. Build and --self-test pass. The static audit pins all three constant
instructions. Tests do not post events or alter focus. The original optional
constant guards have present values in this pinned build; local construction
still fails explicitly if the API cannot produce an event. Integration with the
enforcer's state transitions and cleanup remains outstanding.

## Focus cleanup state transition

Static inspection of 0x100745848 confirms cleanup sends deactivation only when
`applicationBelievesItIsActive && !applicationIsActive`. Its snapshot getter
(0x1007409dc -> 0x10074a2e0) reads the three state bytes. After successful send
(0x100745a8c -> 0x100754280), mutation at 0x100746350 clears only bytes 0 and 1
(`strh wzr, [x0]`), preserving actual active state. Failed sends do not mutate.

`SyntheticApplicationFocusState` extracts this transition. Checks cover all
8 state combinations, repeated cleanup and send failure. It is not connected
to production dispatch: event-tap and observer ownership, actual/synthetic focus
updates and safe-enforce lifecycle remain missing. Do not report the Multica
incident resolved based on these pure-state checks.


## Focus enforcement branch restoration

`enforceActiveState(for:)` (0x100740f70) branches on the belief snapshot, not
on actual frontmost state: if focus is already believed held it returns without
reading the supplied window. If active but unfocused, it sends only process
key-focus-returned, then sets byte 1 (0x10074ad34 -> 0x100746338). Otherwise it
calls the activation helper (0x1007414c8), then sets both belief bytes to true
(0x100746344). All paths preserve byte 2, actual active state. Failed sends leave
state unchanged. `SyntheticApplicationFocusState.enforceActiveState` now
preserves these decisions and lazy callback evaluation. Eight combinations,
idempotence and failure preservation pass provider-click checks; Swift build
passes. Static audit pins the send call sites and all three state writes.

The activation helper reads optional window activationPoint before windowID;
missing activationPoint or a thrown windowID read falls back to windowless
activation. With a readable ID it reads frame and calls the existing activation
builder (0x100730374). Safe enforcement wraps this with additional foreground
checks and asynchronous handling, still to be restored. This extracted state
component remains outside the production event-tap lifecycle; it does not yet
resolve the observed Multica click failure.


## Window activation composition and safe-enforce scope

`SyntheticActivationWindow` supplies the three lazy window reads from
0x1007414c8; `syntheticWindowActivationEvent` preserves point -> ID -> frame
order, nil-point short circuit, and ID-error fallback to windowless activation.
The state component now composes this builder and key-focus notifications with
an injected event sender. Tests inspect actual CG/NSEvent payloads and read order
for point/ID-error/frame combinations, plus no-window and repeated enforcement.
Build and provider-click checks pass without posting any OS event.

Further static inspection of safelyEnforceActiveState reveals the other-frontmost
application branch creates two EventTap instances and starts monitoring at
0x100741df4 and 0x100741eb0. It obtains WindowServer main connection at
0x100741f18, disables updates at 0x100741f20, then calls enforceActiveState at
0x100741f28. Success/error cleanup has reenableUpdate call sites, including
0x100742b40, 0x100742c34 and 0x100742ed4. Exact callback filtering and async
restoration are not yet fully decoded. The simple state composition is therefore
not a substitute for this scope and remains unconnected to production clicks.


## Safe-enforcement event callbacks

Decoded the two callback bodies via 0x10074a260 -> 0x100744fe4/0x100745044
and 0x10074a28c -> 0x100745330. The former timestamps every observed event,
sets temporary flags 0x0101 for type 20 or AppKit subtype 1, sets byte 0 for
type 19 or AppKit subtype 2, and consumes those events. AppKit subtypes 22/23
are consumed without changing flags. Other events pass through. These temporary
flags are not the enforcer's application belief state. Raw subtype field is 83;
conversion to Int16 is exact, so overflowing values must not alias subtype 1/2.

The second callback reads source PID (41); own-helper events pass through without
reading target PID. For other sources it reads target PID (40). Events addressed
to the synthetic target are posted to the saved foreground application's PID
and consumed, with the original timestamp. Other targets pass through. Source
PID conversions are checked Int32 conversions; local implementation retains
that behavior. Neither callback is a global input capture feature: they belong
to the scoped safe-enforcement operation.

Restored in SafeActivationEventCallbacks.swift with real CGEvent adapters and
injected posting for tests. Build/provider checks validate event identity,
source/target routing, lazy destination reads, subtype boundaries, timestamp
preservation and accumulated flags without posting OS input. Static audit pins
constant initializers and the native getter/post call sites. Installation and
teardown of the EventTap instances, synchronization and wait/restoration loop
remain outstanding; production clicks do not yet use these callbacks.


## Dedicated run-loop ownership

Restored RunLoopTask and nested RunLoopThread from 0x10077e63c..0x10077edd0.
The task configures name/QoS/context and starts its thread; deinit cancels it.
Thread main publishes its run loop under a lock, checks cancellation, invokes
and clears configuration, installs a no-op default-mode source, and runs until
cancelled. On exit it invalidates the keepalive source and clears the stored
loop. Cancel calls super first, snapshots the loop under lock, schedules
CFRunLoopStop on common modes and wakes it. The source's imported mode symbols
are resolved in Mach-O fixups (0x1014649f8 common, 0x101464a00 default).
The local lock is NSLock; the native storage uses os_unfair_lock. Both protect
only loop publication/snapshot; this is not a claim of identical storage ABI.

Build and provider checks pass with an actual dedicated thread executing a
scheduled block, releasing its context after task deallocation, and cancelling
before startup. No event taps or desktop input are installed by these tests.
EventTap start/stop inspection also confirms idempotent-start guard, per-PID vs
global creation, weak-owner callback context and dedicated RunLoopTask ownership.
The actual EventTap class remains to be restored and connected.


## EventTap lifecycle implementation

Implemented EventTap from 0x100732798..0x10073387c. Start is ignored when a
monitoring task already exists, without replacing its handler. A failed create
returns with no monitoring task and allows retry. Location dispatch chooses
CGEvent.tapCreate or tapCreateForPid. Successful create installs a common-mode
Mach-port source on RunLoopTask, with a context retaining a weak owner box.
Options.rawValue == 1 selects background QoS; otherwise userInteractive (native
constants 9 and 33). Stop disables and invalidates the port before releasing
the run-loop task; deinit performs the same cleanup.

Callback dispatch preserves special events: timeout may reenable if configured;
user-input disable only passes through, without reenabling or invoking the
user handler. Other events delegate to the handler, whose nil suppresses them.
The native logging strings are hashed; diagnostic log formatting is not copied.
The static AsyncStream events convenience API is still outside this change.

Swift build and provider checks pass. Tests use an injected driver with local
CFMachPorts, not OS event taps: create failure/retry, duplicate start, callback
suppression, disabled-event distinction, stop idempotence, restart and deinit
ordering are covered. Production safe-enforcement scope still needs its masks,
shared-state synchronization, update suppression and async restoration wired;
real-app acceptance remains unverified.


## Target-side restoration observation

Safe enforcement installs an additional callback in the enforcer (0x100745468),
separate from its two temporary EventTaps. The callback body at 0x10074553c
updates the same observation record's timestamp and first flag for type 20,
returning false. Type 19 or AppKit subtype 2 sets first flag plus byte 2 and
returns true. Appearance subtypes 22/23 return true without flag writes; other
events return false. Subtypes are exact Int16 conversions. The record therefore
has THREE byte flags plus timestamp, confirmed by snapshot at 0x1007457e0.

SafeActivationObservedEvents now includes targetResignObserved (byte 2), the
target callback predicate and beginForegroundRestoration. Reset at 0x1007421c4
clears bytes 1/2 but preserves byte 0 and writes the new time. Foreground tap
writes preserve byte 2. Tests exercise cross-callback sequencing, selective reset,
overflow subtype behavior and differing type-20 results. This expands
the prior two-byte callback extraction; the full async wait is still pending.

Further loop evidence: it checks frontmost PID, can reactivate the saved app,
examines AXFrontmost and window ordering, and may raise its prior focused window.
It has distinct one/two-second bounds and a quiet-period check; exact complete
branch composition is not yet restored. Neither a fixed sleep nor setting all
flags true would preserve this behavior.


## Restoration completion gate and timing

Decoded 0x100742968..0x1007429fc into safeActivationRestorationDecision.
Once previous-app foreground and prior window checks reach this gate, required
paired notifications mean foreground byte 1 AND target byte 2. If absent, poll
until the two-second bound. Otherwise a required quiet period compares a fresh
time read to lastEventTime; no time read occurs when the gate doesn't need it.
Completion is checked before timeout, so completed restoration at the boundary
succeeds. ARM's timeout comparison treats unordered as timeout; local code uses
`!(elapsed < timeout)` to preserve that detail.

Pinned doubles: reactivation threshold 0.05 at 0x10115b8d8; quiet period 0.1 at
0x101159db8. Poll Duration immediate 0x2386f26fc10000 is 10^16 attoseconds=10ms.
The extracted gate receives the prior branch's paired/quiet requirements rather
than guessing their derivation. Full async loop and error-type mapping are not
yet connected. Tests cover missing acknowledgments, quiet-period boundary,
frontmost mismatch, lazy clock reads and completion before timeout.


## Safe-activation scope and failure precedence

Restored withSafeActivationRestoration with explicit injected scope operations.
Order: start foreground tap -> start target tap -> install enforcer observer ->
disable updates -> enforce -> restore. All exits after disabling run cleanup:
reenable updates -> clear observer -> stop target tap -> stop foreground tap.
Source ignores update API return codes, so these dependencies are nonthrowing.

The native enforcement error is saved at async frame+0x238; restoration still
runs. At 0x100742bf0 and 0x100741fc0, an existing enforcement error takes
precedence over a restoration timeout/cancellation; success of restoration also
rethrows a saved enforcement error. Local implementation preserves this rule
instead of returning early after enforcement failure. The restore closure owns
post-enforcement observation timestamp setup and the still-pending async loop.

Build/provider checks pass for all four enforcement/restoration success/failure
combinations, with an actual suspension between setup and cleanup; an explicit
CancellationError path verifies cleanup and cancellation propagation. Static
pins cover start/disable/enforce/reenable/stop call sites. This is scope
orchestration, not an implemented WindowServer SPI adapter or full restoration
loop. Production app clicks remain outside it until those dependencies are wired.


## WindowServer symbol binding

Recovered the 13-slot primary function batch at 0x10026c044 and separate lazy
update symbol requests at 0x10026df84/0x10026e010. Persisted exact image hashes,
prioritized symbol hashes, salts and source VAs in
reconstruction/native-windowserver-symbol-evidence.json, and generated readable
WindowServerSPISymbolRequest. Reused the existing restored SoftLink rather than
introducing a guessed dlsym lookup or substitute screen-update mechanism.

A standalone local probe linked our SoftLink and resolved every primary slot;
slot 0 resolved to _SLSMainConnectionID. Independent requests resolved to
_SLSDisableUpdate and _SLSReenableUpdate. Other primary slots include connection
notifications, window geometry, event window location, key-focus/front-process
APIs and window levels. These other APIs are not yet exposed by this wrapper.
The probe only resolves addresses/names; it does not invoke the resolved APIs.

WindowServerSPI implements the three source signatures (optional OpaquePointer
connection; CGError update return) and lazy binding, trapping on an unavailable
required symbol like the pinned source. Swift build and provider checks pass.
Production safe activation still needs to capture one connection, pair update
calls through its scope, and compose the complete restoration loop. No live
window update suppression or real-app interaction was tested here.


## Concrete safe-activation resources (not yet production input)

SafeActivationNativeResources now composes two process EventTaps, a locked
observation store, the temporary target observer, and WindowServer update scope.
The saved application's tap watches raw event types 13/20/19 (initializer
0x100746164); the target's keyboard tap watches 10/11/12 (static array
0x101571410, pinned by audit-native-mouse-dispatch.py). Both use head placement
and default options. Observation times use ProcessInfo.systemUptime, matching
the native NSProcessInfo processInfo/systemUptime selector pair, not wall time.

The update scope captures one connection and reuses it for disable/reenable.
Callbacks retain only the observation store and input dependencies, avoiding
a resources -> EventTap -> retained handler -> resources cycle. Provider tests
use local Mach ports and an injected update driver: exact masks/PIDs, observer
installation/removal, same-connection cleanup even when disable returns a
failure code, and object deallocation all pass. Swift build and pinned static
audit pass. Tests do not install system input taps or suppress screen updates.

The practical incident remains unresolved: Target.mouseInput in Mouse.swift
still dispatches synthetic events without a SyntheticAppFocusEnforcer or
VirtualCursor instance. These resource objects have no production caller yet.
The full foreground/window restoration loop and enforcer ownership must be
completed before integration; only then can a real Multica click and a changed
post-click UI observation validate the repair. The latest available debug log
remains 2026-11-07T08-56-03-778Z; no newer user run was available for comparison.


## Foreground restoration loop and window ordering

Restored the other-foreground-application loop as
restoreSafeActivationForeground with explicit native-operation dependencies.
It resets observation quiet time after enforcement, records system uptime,
checks cancellation, and polls with the source 10ms Duration. While the target
is frontmost, it attempts saved-application activation at intervals >=50ms,
clears only the acknowledgment pair before each attempt, and enforces the
2-second timeout. A third foreground app (or none) throws instead of switching
it away. Activation failure is separate from timeout.

When the saved application is frontmost, an existing enforcement error skips
the target AX-frontmost read; otherwise that read determines whether final
verification can begin before the one-second threshold. Window-order repair
runs first. The source enumerates options 0x11 and searches only target-owned
windows preceding the saved window at the same layer (0x10074265c..7426d4).
restoreSafeActivationWindowOrder preserves this condition and raises the saved
AX window when supplied; absence of an AX handle does not erase the obstruction
signal. Obstruction resets quiet time and delays progress below one second.
The final gate rechecks actual foreground PID, acknowledgment pair after an
activation, and 100ms of quiet when enforcement failed, activation occurred,
or observed transition byte 0 is set. Completion precedes timeout testing.

SafeActivationNativeResources.enforceAndRestore now composes the scope and
restoration loop. Native lifetime ownership and the adapter for saved/target
application operations still need integration into SyntheticAppFocusEnforcer;
public error mapping is not yet supplied (the loop has internal typed errors).
This does not yet connect Mouse.swift or implement the no-previous-app branch.

Validation: Swift build, provider-click checks, and pinned source audit pass.
Tests cover immediate completion, paired acknowledgment/quiet waiting,
activation failure, foreground takeover, failed enforcement skipping AX,
missing acknowledgments timing out, window obstruction/layer/ordering,
cancellation, and concrete-resource cleanup preserving the original enforcement
error. All use controlled clocks/ports/operations; no real app click or system
screen-update suppression was performed. Multica acceptance remains pending.


## Latest run after execution connection recovery

Inspected local debug run 2026-11-07T09-58-59-582Z. Indexed clicks 42/33
and coordinate clicks returned observations without a tool error; sequence 73
still shows AXHeading 收件箱. Multiple preceding elicitation results are accept.
Only sequence 78 is cancel; its tool result 79 is the not-approved error.
The model's final claim that subsequent clicks were all blocked by approval
is therefore unsupported. Preserve the cancellation; diagnose the earlier
accepted input path independently. This run still does not prove native app
input acceptance. The proposed focus-state edit during the tool outage never
landed; it was reconstructed only after connection recovery.

Added native initialization/activation/frontmost state mutations and click-tap
transition selection from 0x100746270. Full enforcer lifecycle, target callback,
focus-steal prevention and production Mouse.swift integration remain pending.


## Target process focus observation composition

SyntheticFocusStateStore restores the locked state mutation wrapper, including
click-monitor start/stop selection after successful mutation and no reconciliation
after a throwing mutation. Accepted activation events update both belief bytes;
frontmost tracking updates actual-active only. SyntheticFocusActivationFilter
runs the temporary suppression callback under its own lock before mutation;
suppressed events do not change state. Raw types 20/19 and AppKit 13 subtype 1/2
map to active/inactive. Native subtype conversion is exact Int16.

SyntheticFocusTargetMonitor owns the target process EventTap and composes this
filter/store, with injected click-monitor lifecycle hooks. Its handler retains
the filter, not the monitor, avoiding a monitor/tap callback cycle. The full
enforcer still needs real click monitoring, frontmost tracker ownership,
SystemFocusStealPreventer and safe-enforce branch composition before Mouse.swift
integration. This component alone does not repair production clicks.

The activation-filter test initially assumed CGEvent field 83 retained 65537;
macOS truncated that subtype. Removed that invalid test construction. The
corrected filter/store tests and Swift build passed before monitor composition.


## Click-monitor dependencies and session ownership

Recovered the single leftMouseDown event array at 0x101572270 and packed
placement/options (0,1) at 0x1011921b0. Click monitoring uses annotated-session
location 2 and listen-only options. The external-click callback ignores helper
input and events already routed to the target, reads optional event-window
field 51 (initializer 0x100731140), looks up that window's owner, and normally
activates the target only when ownership matches. It always passes the event.

Window lookup uses the native CFArrayCreate with nonretaining pointer-sized
window ID entries, followed by CGWindowListCreateDescriptionFromArray, rather
than enumerating all windows. The adapter extracts owner PID only; it does not
claim to restore the entire native CGWindow parser. Activation uses
NSRunningApplication.activate(options: []). Static audit pins the event array,
packed options and field initializer. Source checked numeric conversions remain.

SyntheticFocusMonitoringSession owns target and optional click monitors through
a slot captured by state lifecycle callbacks. It applies initial state before
starting target observation, and exposes enforce/deactivate through the locked
mutation wrapper. Event sending is injected; the full native send transport,
frontmost tracker, focus-steal preventer, safely-enforce branch selection and
production input integration remain pending. Tests use local Mach ports and
injected send operations, with no real application activation or input tap.


## Frontmost tracker audit for enforcer integration

Pinned init 0x100740660 calls SystemFrontmostApplicationTracker with
excludeCurrentApp=false. Tracker init 0x100785018 allocates distinct observer
and current-app locks, seeds current app before registering workspace activation
notifications, and stores a weak-self notification handler. Native import binding
0x101464688 is AppKit/NSWorkspaceDidActivateApplicationNotification.

Update entry 0x100785248 mutates current app under its lock via 0x1007858fc;
it releases that lock before observer delivery. The false-exclusion branch at
0x100785ab0 selects the supplied application directly; the true-exclusion branch
has substantial alternative-application resolution and must not be approximated
by simply dropping the helper PID. The enforcer uses the false branch, so its
integration can preserve this behavior without inventing exclusion fallback.
Remaining audit: deduplication/observer snapshot ordering, notification payload
extraction, and teardown registration removal before implementing the tracker.

The monitoring session now composes the other-foreground restoration scope
with the target activation filter and the same locked enforcement state.
A controlled-clock integration test confirms resign events are suppressed during
restoration (synthetic-active belief preserved), then processed normally after
cleanup. Swift build and provider-click checks pass. Production Mouse.swift
still does not use this session; actual Multica input remains unverified.


## Inclusive frontmost notification implementation

InclusiveFrontmostApplicationTracker implements the false-exclusion branch.
Initializer selector at 0x101543090 rebases to menuBarOwningApplication, not
frontmostApplication. Notification payload key import at 0x101464680 is
NSWorkspaceApplicationKey; notification import 0x101464688 is the activation
notification. A weak registration handler reads/casts the application payload;
deinit removes the stored registration. No missing-payload fallback is invented.

FrontmostApplicationObservationStore deduplicates equal applications, stores
current state under one lock, then snapshots observers under another lock and
delivers outside locks. Removal uses observer identity. Session registration
updates actual-active via the target monitor, retains tracker/observer, and
removes the observer on replacement/destruction. Initial focus beliefs still
come from the enforcer initialization inputs, not a synthetic observer replay.

Swift build and provider-click checks pass, including invalid/missing payload,
duplicate notification, tracker deallocation, and removing an observer during
snapshot delivery. Tests use an isolated NotificationCenter and current app
identity only; no OS focus/input was changed. Full exclusion branch,
focus-steal preventer and production input integration remain incomplete.


## Initial key-focus ownership is not just foreground PID

Audited native helper 0x100750594 called by initial state mutation 0x10074a1e0.
When SystemFocusStealPreventer already exists, it reads a PID from its locked
state. Otherwise 0x10074ffcc calls ApplicationRegistrySPI.getKeyFocusProcess
(0x10026d800) and getProcessPID (0x10026d7fc). A present result is passed through
0x10075027c before target comparison; that function performs additional ownership
resolution and cannot be replaced by the raw query PID. Only the missing-query
branch falls back to workspace frontmostApplication PID, or zero if absent.

Pinned these calls in audit-native-mouse-dispatch.py. This evidence rules out
seeding key-focus belief from NSRunningApplication.isActive or the inclusive
tracker alone. Next work must reconstruct the ownership resolution and the
preventer's cached-state semantics before supplying production initialization.
No guessed system adapter or behavior change was introduced for this query.


## Special focus-owner branch evidence

Resolved selector 0x101542870 -> 0x10136777b as activationPolicy.
At 0x1007502f0, policy raw value 2 selects AX-based resolution; missing
NSRunningApplication or other policies return the supplied PID directly.
Before that policy check, a separate optional-PID query at 0x10075246c can
select a special resolver 0x10075128c when it equals the supplied PID.
Do not infer this special process identity from the function's redacted name.

AX resolution 0x1007513e4 reads ApplicationUIElement.focusedUIElement if no
explicit element was supplied (0x100751484), then extracts its AX PID through
0x1007526d0 (0x1007514ec). Further fallback below 0x100751838 includes
application PID extraction and running-app inspection; those branches remain
unmapped. Evidence does not justify replacing this with parent-process lookup.
Initial-state selection is implemented/tested with injected native resolution;
its system adapters are still pending and production clicks remain unverified.


## Special process identity: ViewBridgeAuxiliary

Audited 0x10075246c: it constructs a filter with name ViewBridgeAuxiliary and
options 1, calls runningProcessesWithFilter:, takes the first result and reads
its pid. Missing/empty results produce an absent optional PID. Selector rebases:
0x101542aa8 -> 0x10136a956 initWithName:options:;
0x101542c30 -> 0x10136c8f8 runningProcessesWithFilter:;
0x101543de8 -> 0x101367df6 pid. Classrefs are local ObjC classes at
0x101546b40 and 0x101546b90; class identity still needs recovery before a
matching process-query adapter is implemented. Do not replace the query with
a shell-name search: matching semantics/options are not yet mapped.

This identifies the equality branch in 0x10075027c as ViewBridge auxiliary
focus handling. The focused-element fallback should preserve its cross-process
AX ownership semantics; PID-parent guessing would diverge from this source.


## Initial focus selection implementation status

initialSyntheticFocusState now preserves cached/query/resolve/workspace order
through explicit native dependencies. selectKeyFocusOwnerPID preserves
ViewBridge equality priority, policy=2 resolution, and ordinary/missing-app PID
passthrough. viewBridgeAuxiliaryFocusPID reuses the existing RunningProcess
Objective-C package's SAIRunningProcessFilter and first matching pid; no process
enumerator was reimplemented. Swift build and provider-click tests pass for
lazy branch selection and bypass of irrelevant readers. Special owner resolvers,
ApplicationRegistry bindings and preventer cache adapter remain pending.


## ViewBridge result carries two process identities

0x10075128c constructs an application AX wrapper with the current tree
transaction, then invokes 0x100752874 followed by 0x1007531b0. It packs the
first result's low PID into return x0 low32 and the second result into the upper
payload/tag. Thus the full focus-owner result contains more information than
the selected owner PID currently exposed by KeyFocusOwnerSelection.

Second query 0x1007531b0 independently rereads focusedUIElement, extracts
actualPID (not pid) via the existing throwing-getter adapter 0x1007526d0, then
checks that process's running-app activationPolicy against 2. A missing AX
focus, getter failure or other policy takes explicit nil-result branches. An absent
running-app object preserves the PID (0x10075329c -> 0x1007532bc); this distinction
was confirmed in the follow-up audit. First query 0x100752874 also reads focusedUIElement and follows the
focusedUIElement attribute further; it is not equivalent to the second query.
The production resolver must preserve their independent reads and both PID
identities, rather than reuse one cached element or collapse the native result
shape. Full result enum tags and fallback branches remain under audit.


## Distinguish retry exhaustion from activity gate

Further audit of 0x100752874 shows stale-activity failure jumps directly to
common owner resolution at 0x100753034 with a nil element. Exhausting retries
instead reaches 0x100753010 and checks a static optional PID at 0x101574960
before common resolution. This is a cached PID, not a cached UIElement. Added
ViewBridgeFocusAcquisition to retain element/activityTooOld/retriesExhausted;
the optional-only acquisition projection must not drive full fallback selection.
Remaining audit: writes/validity of that static cached PID and final resolver
behavior when no element is present. No production fallback was guessed.


## Activity cache writer and acquisition composition

Located writes at synthesizedActionWasPerformed 0x100745f14: systemUptime is
stored to 0x101574958 and target PID/present tag to 0x101574960. These are the
recent synthesized-action time/PID, not arbitrary AX observation timestamps.
SyntheticFocusActivity preserves process-wide defaults (time zero, PID nil)
and session exposes the source-named recording operation. Production dispatch
has not yet been wired to call it at the audited native timing.

resolveViewBridgePrimaryFocusPID composes acquisition, activity gate and
exhaustion fallback with separate time/PID cache reads. Tests update the cache
mid-retry and verify the final PID is fresh, stale activity bypasses cached PID,
and immediate focus avoids clock/retry/cache reads. Swift build and
provider-click checks pass. UIElementFocusedValue reuses the existing exact AX
element/cache/transaction pipeline; the second ViewBridge actual-PID query now
has a concrete AX/AppKit overload. Primary retry-read adapter, common owner
resolver result shape and production integration remain incomplete.


## Common owner resolver element/window stages

FocusedElementOwnerSelection preserves the element-stage distinction: an
existing running app with policy !=2 resolves directly; missing app or policy2
continues to restricted resolution. A throwing element PID read reports the
error and enters missing-element fallback. RestrictedFocusOwnerSelection
rechecks application AX PID, then window PID, requiring an existing non-policy2
running app for either direct success. FocusOwnerWindowSelection prefers
focusedWindow; only absence triggers mainWindow, never a failed PID read.

RestrictedFocusOwnerSystem composes these stages with current-transaction
UIElement construction, existing AX cache/element decoding and provider-aware
PID reads. UIElementFocusedValue supplies concrete primary-query retry reads;
each retry repeats the read instead of caching a prior element result.
FocusOwnerMissingElementFallback preserves the skip flag: ViewBridge skips
application-owner mapping, while other callers try it before workspace fallback
(or zero). The application-owner mapping helper at 0x100751c50 is not yet
restored, so the concrete common resolver still requires this final dependency.

Swift build/provider-click checks pass for the new branch selections and
existing focus/monitor composition. No live system input was posted; production
Mouse.swift remains outside this complete-controller reconstruction.


## Localized-name ownership mapping and common system path

Selector rebases confirm helper 0x100751c50 reads localizedName and workspace
runningApplications. Its parser 0x100752244 requires both parenthesis characters,
skips trailing closing parentheses, then extracts after the last opening one;
no whitespace normalization is added. Candidate localized names must equal the
extracted owner name, and policy2 candidates are excluded. Exactly one match is
accepted; zero/multiple candidates return nil, with no PID/order tie breaker.
FocusOwnerLocalizedName and FocusOwnerApplicationMatch restore these stages.

CommonFocusOwnerSystem now composes focused element acquisition (including a
fresh read when no explicit element exists), element/application/window owner
selection, optional name-based application mapping, and workspace PID fallback.
The ViewBridge path sets skipApplicationOwner=true, then performs the separate
actual-PID query after primary acquisition/resolution. ViewBridgeFocusIdentities
preserves both identities; it does not claim native enum tag/wire parity.

Swift build/provider-click checks pass for the matching/parser examples and
existing focus selections. No live AX acceptance test was performed. Registry
key-focus bindings, preventer lifetime/cache and complete controller/input
integration remain pending before actual Multica click acceptance.


## ApplicationRegistry native boundaries and status selection

ApplicationRegistrySPI wrappers 0x10026d7fc/26d800 call system GetProcessPID
and shared primary-symbol slot 7 (_SLPSGetKeyFocusProcess), respectively. Reused
WindowServerSPI's exact restored symbol batch. GetProcessPID is unavailable to
Swift in the SDK, so a typed Objective-C/C wrapper in RunningProcess calls that
same C API; no Swift-only ABI declaration remains.

queryRegistryKeyFocusPID zero-initializes PSN/flag/PID and executes focus query
then PID conversion even on query failure. For pidStatus=-600, focusStatus=0,
flag=false, a present ViewBridge PID whose NSRunningApplication is absent is
returned. Otherwise both statuses must be zero; failures report statuses and
return nil. This preserves the unusual source fallback instead of treating all
conversion failures as no focus.

Swift build and provider-click checks pass for status/flag combinations and
query ordering. A real read-only GetProcessPID(kCurrentProcess) call returned
this helper's PID, verifying the C bridge ABI. Private key-focus SPI invocation
has not yet been exercised; query selection tests inject native boundaries.
Full preventer state/lifecycle and production app input remain pending.


## Live read-only key-focus probe

Added cua-helper --key-focus-query-check, which invokes only registry focus/PID
queries and reports a JSON result. First execution in this agent environment
returned focusStatus=1003, pidStatus=-600, keyFocusPID=null. This is direct
runtime evidence, not a mocked boundary test. It does not identify the cause
of 1003 or establish an accessibility permission failure. No input/activation
was posted. Under the source selection rules, this missing query result causes
workspace fallback unless a preventer cache already supplies the owner.

KeyFocusOwnerSystem composes registry results with ordinary/restricted/
ViewBridge identities and initial state selection. It preserves source PID and
ViewBridge secondary actual PID in a semantic enum; packed native encoding is
not exposed. Preventer cache remains an explicit dependency. The diagnostic
result does not prove real app input acceptance; full preventer/controller and
production input integration are still incomplete.


## Preventer registration keyboard resource

Audited record tap constructor 0x10074b1cc. Despite nearby mouseEventTaps
property names, this constructor watches keyboard event types 10/11/12, from
static array 0x101571558. It targets the registered process, uses placement=1
(tailAppendEventTap), options=0, as packed at 0x1011727f0. This differs from the
head placement used by the temporary safe-activation keyboard tap. Callback
thunk 0x100750c70 forwards to 0x10074f7f4 with weak preventer context, helper PID,
and captured metadata; its routing/suppression logic still needs reconstruction.
Static audit pins the event list and packed configuration. Do not substitute
the safe-activation keyboard router: their contexts/order are distinct.

FocusStealRegistrationStore preserves append/first-match-removal behavior and
empty-list transition. Swift build/provider-click checks passed for duplicate
registrations and missing/last removal. It does not itself prevent focus theft;
record taps, singleton initialization and cached focus state remain incomplete.


## User clarification and newer accepted-click evidence (2026-11-07)

The user intentionally cancelled authorization after observing repeated no-op
clicks. Cancellation is a stopping action, not an explanation for earlier
authorized input failures. Preserve that cancellation boundary.

Local run 2026-11-07T11-08-26-398Z (d9155aa6) independently reproduces the
problem without any cancellation: getApp succeeds; app.click(42) at request
16 receives accept at sequences 18/20 and a non-error result at 21; app.click(33)
at request 24 receives accept at 26/28 and a non-error result at 29. Both
observations still show AXFocused=false. That field alone does not prove which
focus mechanism failed, and successful tool return does not prove input delivery.

Production mouseInput.simulate still dispatches down/up directly through
dispatchNativeEvent. SyntheticFocusMonitoringSession is referenced by component
checks but not by this production input path. Thus reconstructed focus components
are not an end-to-end fix. Next acceptance must include production controller
integration and a before/after observable UI change on a permitted harmless
Multica action; component checks alone cannot close this incident.


## Persistent keyboard routing callback reconstruction

Restored FocusStealKeyboardMonitor and its locked routing state from
0x10074f7f4/0x10074f8e4. A released weak owner or helper-origin event passes
through. Under the state lock, native tag 2 passes through; otherwise a matching
destination (state+0x18) is reposted unchanged to state+0x24 and consumed.
Nonmatching destinations pass through. Posting keeps the original timestamp.
The semantic route projection intentionally leaves native state production
unimplemented rather than guessing which app should receive keyboard input.

Injected tap checks verify tail/default keyboard-only configuration, helper
bypass, destination mismatch, all three keyboard types, current route changes,
event identity/timestamp retention, weak owner lifetime and cleanup. Swift build
and provider-click checks pass. These checks install no OS event tap and post no
real input. The monitor is not yet wired to the production focus controller;
Multica acceptance remains outstanding.


## System process notification and returned-focus state audit

The preventer owns an annotated-session tap (location 2), tail-append placement,
default options, mask 1<<21. Callback thunk 0x100750ca4 dispatches to
0x10074c724, rather than the per-registration keyboard callback. It reads CPS
subtype from private field 64 (initializer 0x100731170), not window subtype
field 83. Focus-related PID is private field 73 (initializer 0x1007311d0).
Key-focus-changed subtype is unsigned 0xf102; new-front is 2. Taken/returned
notifications use 0x4000/0x8000. Changed/new-front handling is gated by the
captured ViewBridge destination PID; taken/returned paths precede that gate.
Full notification dispatch/state production remains to be integrated.

Restored the concrete returned-focus state mutation from 0x10074cbd0:
pass if route tag is absent, byte state+0x29 is already set, or destination
is not route recipient (state+0x24). Otherwise set byte+0x29 and consume
that notification. This does not clear the route. Route replacement resets
the suppression flag. Component checks cover mismatching destination, first
vs repeated notification, keyboard routing after suppression and route removal.
Swift build, provider-click checks and pinned binary audit pass. No real input
was sent; production controller integration and Multica UI acceptance remain
unfulfilled.


## Taken-focus route producer

Restored the concrete taken-focus route mutation at 0x10074c8d0..0x10074c95c.
While holding the system-state lock, resolve incoming focus PID (field 73)
to its logical owner, then query whether that owner is registered. Predicate
0x10074bd20 returns true only for a registered owner differing from the previous
owner PID; its ordinary/restricted branches differ in logging but have the same
Boolean condition. It does the registration read before the owner comparison.

On true, consume the notification and set the route to intercept the physical
incoming focus PID and repost to the notification destination (field 40).
On false, return the original event and clear any stale route. Both paths reset
returned-focus suppression. Tests cover differing physical/logical PIDs, read
order, registered same-owner acceptance, unregistered acceptance, route reuse
and suppression reset. Build and provider-click checks pass with injected
callbacks, without actual input. Previous-owner storage, full changed/new-front
notification handling and production controller ownership remain incomplete.


## Registered transition selection and real AX diagnostic

Restored per-record gained/lost selection from 0x10074d374..0x10074d3d4.
It compares previous/current logical owners and excludes a present intercepted
logical owner (route state+0x1c/+0x20). The taken-focus producer now preserves
this identity alongside the physical intercepted PID and recipient PID.
Exhaustive small relation checks and producer-to-selector checks pass. Full
callback task execution and the remainder of changed-focus handling are still
missing; selection alone is not a production callback implementation.

Revalidated actual environment permissions: helper --permissions reports
accessibility=true and screenRecording=true, requested=false. This supersedes
earlier environment-only TCC=false observations. No dialogs were requested.

New read-only operator entry:

    native/macos/.build/debug/cua-helper --app-observation-check ai.multica.desktop

It outputs roles/counts and equality facts, not application content/titles.
Current Multica is running, inactive, not hidden. AXChildren succeeds with
roles [AXApplication, AXMenuBar]; its AXApplication child equals the root.
AXWindows succeeds with one reference whose role is AXApplication and which
also equals the root. Ordinary traversal therefore legitimately skips that
cycle and yields menus only. A separate direct system Swift probe reproduced
the raw role/equality results; provider decoding preserves the original roles.
WindowServer independently lists an actual window. This is an observed AX
inconsistency, not proof of its cause, and does not explain every older click
failure. No real click or application activation was performed in these checks.

Swift build, provider-click checks, pinned static audit and live read-only
diagnostic pass. Production focus controller integration and a harmless
before/after Multica UI click acceptance remain required.


## Registered callback scheduling

Restored asynchronous callback scheduling for selected records. Source call
0x10074dcf4 invokes swift_task_create; TaskPriority metadata/rawValue binds
resolve through GOT 0x101469490/488 and actor executor through 0x1014693c0.
The gained path operation resolves through 0x101195058 -> 0x100750fb0 ->
0x10074ec78/0x10074ec90; lost through 0x101195030 -> 0x100750e20 ->
0x10074ecdc/0x10074ecf4. Bodies call optional handlers and return true when
absent. Neither a synchronous inline callback under state lock nor a promise
of task completion in registration order matches this source.

FocusStealRegistrationCallbacks uses an unstructured Swift Task, preserving
inherited task context, and reports a missing handler separately. Unchanged
selection creates no task. Tests await actual tasks and cover gained/lost,
missing-handler reporting and result semantics. Build/provider-click checks
and static audit pass. This restores the scheduling boundary, not the full
changed-focus state update, native runtime flag layout or production controller
integration. Live Multica click acceptance is still outstanding.


## Registered dispatch composition

Composed state-locked transition selection with a single registration snapshot
and unstructured task scheduling. The registration-list lock is released by
the snapshot provider before iteration; the system-state lock remains held
through selection/enqueue. Duplicates are not deduplicated, and removal after
snapshot acquisition cannot alter that delivery batch. No task is awaited
under the system-state lock. Build/provider-click checks pass for duplicate
records, removal after snapshot and intercepted-owner exclusion with actual
async callback tasks.

This composes callback payloads only. Native captured records also retain tap
resources and menu-suppression fields, so full registration-resource lifetime
parity, history mutation, changed/new-front processing and production controller
integration are still required. No actual UI input was sent in these tests.


## Focus owner initialization and history

Restored the initial-owner selection at 0x10074b920..0x10074b9a8. It uses
the existing registry key-focus query and rich owner resolver on success.
Query absence falls back to NSWorkspace.frontmostApplication PID or zero,
as an ordinary identity, without calling the rich resolver a second time.
Selector refs 0x101543e20/0x101542688/0x101542168 resolve to sharedWorkspace,
frontmostApplication and processIdentifier.

FocusStealOwnershipHistory preserves complete identities: changed-focus entry
0x10074d23c..0x10074d270 copies current into previous, then writes the new
identity, before registration snapshot and callbacks. There is no same-owner-PID
deduplication at that boundary. Initial previous sentinel is represented as
semantic nil; native packed sentinel/tag bytes are not exposed. Tests preserve
restricted source PID and ViewBridge actual-focused PID across equal logical
owner transitions, plus query/fallback selection. Swift build, provider-click
checks and static audit pass. This is the history value layer; enclosing
system-state lifecycle, remaining changed/new-front effects and production
controller integration remain incomplete.


## Shared ownership/route lock composition

The routing-state owner now requires an explicit initial rich focus identity.
It owns FocusStealOwnershipHistory under the same lock as the keyboard route
and returned-focus flag. Taken-focus handling compares against the saved
current identity inside that lock, rather than accepting a separate previous
PID from the caller.

recordOwnerAndSchedule records history before snapshot acquisition and
callback enqueue while holding that same state lock. Tests now exercise real
state transitions and inspect saved current/previous owners in addition to
callback delivery. Swift build/provider-click checks pass. This composes the
prefix of changed-focus handling; later route/resource effects, complete system
notification entry points and production controller integration remain pending.
There is no new claim of live click acceptance.


## Physical focus route progress

Restored route progress/retention at 0x10074dd78..0x10074e0e4 and clearing
at 0x10074e6f8. Native route tag 0 becomes 1 the first time the intercepted
physical PID is observed; repeated observations retain tag 1. Focus on the
recipient PID also retains the route. Any other physical PID clears route
payload and returned-focus flag (tag 2). Logical owner PID is not a substitute
for these physical endpoints.

recordOwnerAndSchedule now requires the physical focus PID independently
of the rich logical identity. It selects/enqueues registration callbacks before
updating route progress, matching the source ordering. Its result exposes tasks
and the semantic route observation for the remaining changed-focus stages.
Tests cover no route, both endpoints, repeated intercepted focus, third-PID
clearing, reset flags and physical/logical PID separation. Build/provider-click
checks and static audit pass. Later notification/resource effects and
production controller integration are still incomplete; no live click result
is claimed.


## System key-focus release primitive

Changed-focus handling calls 0x10074f130, which reads private event field 71
(initializer 0x1007311b8), performs a checked UInt32 conversion, and calls
ApplicationRegistrySPI.releaseKeyFocus(withID:) at 0x10026d860. It returns true
only for status zero; unavailable field or failed status reports and returns
false. It does not synthesize or post a replacement event at this boundary.

Added the typed C-function binding via existing primary WindowServer symbol
batch slot 8. Source slot-table base is 0x10155b510; release wrapper tails
through 0x10155b550. Reused the existing SoftLink machinery.
SystemKeyFocusRelease composes field reading, checked conversion, binding and
failure reporting. The actual system release call was not invoked during tests.

Initial fixture attempted to write field 71 into a generic CGEvent and failed
an ID assertion: a direct read-only Swift probe confirmed writing 123 reads
back 0 for that generic event. Corrected the fixture to inject field reads,
while preserving actual CGEvent field access in production. Checks cover absent
field (no read/call), IDs 0/123/UInt32.max, success/failure statuses, one release
call and timestamp preservation. Build/provider-click checks and static audit
pass. Private focus-release behavior on real notification events, its full
conditional selection, remaining notification resources and production click
controller integration still need verification.


## Direct release selection in changed-focus processing

Restored the direct release action after route progress, gated at
0x10074e2b0..0x10074e2c8. Only the first intercepted physical focus observation
(tag 0 -> 1) reaches this direct call. Repeated intercepted focus, recipient
focus, absent route and cleared route do not use this path. The preceding
ViewBridge-specific alternative is separate; first/repeated intercepted-focus
flags bypass that alternative before the direct-release gate.

The state operation takes an explicit release dependency, invokes it under the
same state lock after progress advances, and preserves its success/failure as
an optional result. Failure does not undo progress or cause automatic retries
on repeated notifications. Tests cover success and failure followed by repeated
notifications with no second release. Build/provider-click checks and static
audit pass with injected release operations only. ViewBridge compensation,
result-dependent previous identity metadata, system notification resources and
production click integration remain unfinished.


## ViewBridge compensation eligibility

Restored eligibility at 0x10074e288..0x10074e3ec. Both prior/current identities
must be ViewBridge; current logical owner must be registered and differ from
the prior owner. First/repeated intercepted physical-focus observations skip
this alternative. Registration is queried before owner PID comparison, using
a fresh source boundary rather than reusing the earlier callback snapshot.

Layout evidence: ordinary identity flags are 0, prohibited/restricted flags
0x8000, and ViewBridge flags 0x8100 plus the optional actual-PID absence bit.
ViewBridge constructor 0x10075139c..0x1007513b0 packs logical owner and actual
PID separately. The eligibility uses case membership, independent of actual
PID presence. No packed encoding is added to the external protocol.

State results now explicitly indicate when later ViewBridge focused-element
inspection is required. Matrix checks cover prior type, equal/different owners,
actual PID presence, all route observations, registration status and lazy
registration reads; state composition also exercises the flag. Build,
provider-click checks and static audit pass. Concrete focused-element/process
containment compensation is still unimplemented, along with remaining system
notification resource lifecycle and production click controller integration.
No live click acceptance is claimed.


## ViewBridge key-focus refresh operation body

Restored operation body 0x10074eda0..0x10074f060: construct a process
notification with key-focus-taken subtype, refresh its timestamp and post to
the captured previous owner PID; only then construct key-focus-returned and
refresh/post it to the same PID. It is not NSRunningApplication.activate.
ViewBridgeKeyFocusRefresh reuses existing SynthesizedEvent key-focus constructors
and dispatchNativeEvent instead of reimplementing either.

Checks use actual NSEvent/CGEvent construction with injected posting. They
verify type 21, subtype order 0x4000/0x8000, same recipient and fresh timestamps.
Injected construction failures verify no post when the first fails, and one
already-posted event when the second fails. Build/provider-click checks and
static audit pass without sending real input.

The operation body deliberately does not claim the enclosing task's complete
error/context policy or process classification. Repository search found no
complete UIElement.ProcessType.containingElement implementation; that concrete
classification/containment prerequisite still needs restoration. It is required
for selecting this refresh versus focus release. Full notification resources,
production controller integration and real Multica click acceptance remain open.


## ProcessType classification and containing-element search

Recovered enum field descriptor 0x101323fa4: regularApp, viewService,
nonEventHandlingProcess (native tags 0/1/2). Classifier 0x10078e4c4 returns
nonEventHandlingProcess for missing NSRunningApplication or unfinished launch.
For finished applications, prohibited activation policy 2 means viewService,
otherwise regularApp. It reads activationPolicy before isFinishedLaunching;
selector 0x101543070 -> 0x10136afc8 confirms the latter property.

Restored UIElement.ProcessType and containingProcessElement from 0x10078e178.
It reuses the existing parentChain, including self, depth 300 and parent
lookahead. For each node it reads actualPID, reports/skips PID failures,
classifies that PID and returns the first requested type. Empty sets still
traverse/classify, and repeated PIDs are not cached/deduplicated. Concrete
UIElement wiring reuses provider-aware actualPID and parent readers.
The ViewBridge call site set at 0x1015722a0 contains tags [1,0], confirming
viewService/regularApp selection.

Checks cover all launch/policy combinations, missing app, lazy property reads,
PID error continuation, first match and parent lookahead, and 301 visited nodes
for the inclusive depth cap even with an empty type set. Build/provider-click
checks and static audit pass. These are component checks; concrete ViewBridge
compensation composition, system notification lifecycle, production click
controller integration and live Multica acceptance remain required.


## Concrete ViewBridge compensation composition

Composed the eligible branch from 0x10074e3f0..0x10074ec50. It reads the
previous logical owner's focused element, searches containment for exactly
regularApp/viewService, then freshly checks previous-owner registration.
Missing focus/containment or a registered previous owner ends compensation.
For regularApp it releases the current notification's focus ID. For viewService
it schedules the taken/returned refresh to the previous logical owner PID,
not to the containing element's PID.

ViewBridgeFocusCompensation provides both dependency-injected control flow and
concrete AX/AppKit composition, reusing focused-element, containing-process and
release primitives. The state owner now invokes this compensation dependency
under its shared lock when eligibility passes and preserves its release result.
The result now distinguishes attempted compensation from pending inspection.
Matrix checks verify lazy call order, both process cases, registration and
release success/failure. Build/provider-click checks and static audit pass.
All release/post actions were injected in checks; none changed actual UI.

The enclosing refresh task lifecycle/error policy, release-dependent history
metadata, complete system notification tap dispatch/resources and production
input-controller integration remain open. No end-to-end Multica fix is claimed.


## ViewBridge release-result metadata

Restored byte state+0x16, initialized zero at 0x10074b9e4 and conditionally
written at 0x10074e600..0x10074e618. The mask test requires flags containing
0x8100, so both ViewBridge actual-PID-present and actual-PID-absent identities
qualify. Ordinary/restricted identities leave this byte untouched.

History exposes this semantic byte as lastViewBridgeFocusReleaseSucceeded
without claiming its full downstream purpose. The shared state writes the
selected compensation/direct release result, or false when neither release
path runs, only for current ViewBridge identities. Tests cover initial false,
true/false results, both actual PID variants, preservation across other types
and reset on a ViewBridge transition with no release. Build/provider-click
checks and static audit pass. No live system release was performed.
Complete refresh-task/error handling, system notification resources/lifecycle,
production controller integration and Multica UI acceptance remain required.


## System notification tap configuration correction

Corrected the earlier head/listen-only description in the system-notification
section. At 0x10074bc6c x8 is set to 1; 0x10074bc84 stores that 64-bit value
at EventTap+0x30, encoding placement=1 and options=0. Source EventTap creation
0x100732ae0 loads w1/w2 from +0x30/+0x34 as placement/options. Therefore the
system notification tap is tailAppendEventTap/defaultTap, location 2, mask
1<<21. It can suppress events; listenOnly would ignore suppression results.
This correction is pinned in the audit before implementing that tap. No
production system-notification tap has yet been installed by this restoration.


## New-front state callback

Restored 0x10074f3c0's state behavior. It reads optional private field 73
inside the state lock and clears the route only if that physical PID matches
the intercepted physical endpoint. Unlike changed-focus processing, recipient
or third-PID new-front notifications do not clear the route. Missing field
skips that clear. It then suppresses the notification if the last ViewBridge
release-result byte is true, without resetting the byte.

This method assumes the outer callback already passed the captured ViewBridge
destination gate; it must not be applied indiscriminately to all application
new-front notifications. Tests cover absent field, both endpoints, differing
logical owner, matching clear, suppressed output and preserved release byte.
Build/provider-click checks and static audit pass without OS event taps/input.
Outer system-notification dispatch, tap/resource ownership, refresh task policy
and production click-controller integration remain pending.


## System notification routing and monitor resources

Restored outer routing 0x10074c724: checked destination PID, unsigned UInt16
CPS subtype read, taken first then returned for any destination. Only after
those comparisons does captured ViewBridge PID gate the second subtype read
and changed/new-front handlers. Changed always returns original event after
its handler; other handlers may suppress. Missing optional constants preserve
Swift optional equality (including nil==nil), and missing focus field skips
taken/changed handling. New-front field reading remains inside its state handler.

SystemFocusNotificationMonitor uses annotated session location 2, tail/default
and mask 1<<21. Its owner is weak, captured ViewBridge PID fixed at construction;
a released owner passes events without further processing. Deinit stops the tap.
It reuses existing EventTap/RunLoopTask resources.

Routing checks cover destination gates, handler priority, original-event
retention, second-read changes, absent constants and absent focus field.
Monitor checks cover actual callback invocation, weak lifetime and cleanup
using an injected local Mach port. Build/provider-click checks and static audit
pass; no OS tap was installed and no UI input sent. The complete preventer
owner still must compose these resources with registration/per-process taps,
refresh task policy and production input controller. Multica acceptance remains
unverified.


## Refresh task creation boundary

Audited 0x1006ffa48, called by compensation at 0x10074eac0. It creates
one unstructured throwing task with inherited context flags 0x1c00. Its
swift_task_create sites 0x1006ffc28/0x1006ffc84 are mutually exclusive paths
that join at 0x1006ffc88; they are not two sequential tasks. The caller releases
the returned task handle without awaiting. The operation's construction error
remains in the task result; this helper introduces no retry/catch policy.

Added scheduleViewBridgeKeyFocusRefresh using Swift Task<Void, Error> and
existing refresh operation body. Tests await actual tasks, verify TaskLocal
inheritance and recipient PID, and verify a thrown construction failure
propagates with exactly one operation invocation. Build/provider-click checks
and static audit pass without real event posting. A complete preventer owner
still needs to wire task scheduling, state routing, registration tap lifetime
and notification resources to production input. Multica click acceptance
remains outstanding.


## Registration callback resource lifetime

Source gained/lost task contexts copy the complete registration payload at
0x10074d82c..0x10074d844 and 0x10074db14..0x10074db2c. A callback-only
projection would drop tap/menu-tap references too early when unregistering
while a task still owns the snapshot.

FocusStealRegistrationCallbacks now accepts an explicit immutable resource
lease and keeps the entire snapshot alive through callback/missing-handler
reporting. The lease performs only ARC retention/release; tasks do not mutate
its resources. Actual task checks unregister the record and drop the original
resource owner inside the callback, assert the resource remains alive there,
and verify release after completion/context cleanup. Both present/missing
handler cases pass. Swift build/provider-click checks and static audit pass.
The first build needed an explicit Sendable closure type in the test fixture;
no runtime workaround was added. No real OS tap/input was used in checks.

The full registration record/resource constructor, singleton lifecycle and
production controller still must supply those leases and compose the restored
monitors/state. Live Multica acceptance remains outstanding.


## Concrete registration record resources

Restored DisallowedThiefProcess payload construction at
0x1007504d4..0x1007504f0 as FocusStealRegistration: PID, optional lost/gained
handlers, one per-process keyboard monitor, optional mouse-event taps initially
nil, and menu-dismissal suppression initially false. Keyboard construction
reuses FocusStealKeyboardMonitor. Callback snapshots lease this record's
keyboard and any current mouse taps, preserving resources across later removal
or replacement of the live record. Menu resource mutations remain a future
enclosing-list-lock responsibility.

Integration checks construct two same-PID registrations with independent local
Mach ports, remove the first match, retain its tap through a callback snapshot,
remove the remaining record, then release the snapshot and verify both taps
are invalidated exactly once. Missing removal and last-empty transition are
also checked. Swift build/provider-click checks and static audit pass without
real event taps/input. Full preventer owner/singleton lifecycle, menu behavior
and production controller integration remain incomplete. Multica acceptance
has not been established.


## Per-instance focus prevention owner and cancellation boundary

SystemFocusStealPreventer now composes registration records, shared routing
state, the system notification monitor and the optional ViewBridge keyboard
monitor. Source 0x10074ba24 skips the latter when no ViewBridge PID exists;
0x10074ca50 resolves changed-owner identity before acquiring the state lock.
The system dependency resolves the current UIElement transaction at each call,
rather than retaining a constructor-time transaction cache.

Swift build and provider-click self-tests pass. Injected event callbacks cover
focus taken, unchanged-event keyboard forwarding, one-shot focus returned,
changed-owner release, new-front cleanup, duplicate registration removal and
resource teardown. No real event taps, posting or application activation were
performed by these checks.

User cancellation followed repeated ineffective operations and was intentional.
It is not evidence that cancellation caused the preceding no-op clicks. Respect
cancellation; do not retry through it. The static singleton/menu lifecycle and
production input controller integration remain outstanding, and successful
Multica interaction has not yet been demonstrated.


## Preventer singleton ownership reconstruction

FocusStealPreventerLifecycle restores the singleton ownership branch at
0x10075044c: lazy construction, reuse on subsequent registrations and duplicate
registration preservation. Stop at 0x10074af90 retains its selected instance
through list unlocking; last removal clears the singleton inside the list
lock at 0x10074b4ac. The implementation uses withExtendedLifetime to preserve
this destruction boundary. A missing PID does not discard the owner.

Focus queries at 0x100750594 use the existing locked state when available,
and the registry/rich-resolution/workspace initialization path otherwise.
No singleton lock is invented beyond the source's registration/state locks.
The lifecycle exposes an injectable factory; production controller wiring and
menu suppression remain outstanding. Tests use only local Mach ports.

Validation: Swift build and provider-click composition checks passed with
shared-owner reuse, duplicate removal, last-owner destruction, lazy recreation
and cached-versus-fresh focus query assertions. Static callsite audit passed.
These checks do not establish successful production application clicking.


## Menu dismissal suppression resource lifecycle

Restored constructor 0x10074b4c8, first-record mutations 0x10074b6f8 /
0x10074b7cc, and callback 0x10074fc14. A start with an existing shared
preventer constructs a target process tap and, when supplied, a separate
menu-process tap, even if both PIDs match. These are head/default taps for
CGEventTypes [1,2,6,3,4,7,25,26,27], pinned from static array 0x101572220.
Tap creation precedes list locking and happens even if the requested record
is missing; only the first matching record receives the taps and enabled bit.
Stop clears only that first record's taps/bit under the existing list lock.
With no shared owner the lifecycle API returns without construction.

Callbacks weakly reference the preventer, snapshot full registration records
under lock and accept any matching enabled record, then release the lock before
window lookup. Field 51 is converted to UInt32 with the existing checked helper,
and the existing WindowServer lookup supplies the owner. Unknown windows pass;
target/menu-owned windows pass; other owned windows are suppressed. There is
no helper-PID bypass or alternate activation in this source callback.

Implementation reuses EventTap, syntheticFocusWindowOwnerPID and the existing
registration callback resource leases. Tests use local Mach ports and injected
window lookup, covering masks/order, equal target/menu PIDs, unknown windows,
first-record replacement/removal and create-then-discard for missing records.
Production controller integration and real application clicking remain unverified.


## Enclosing synthetic focus enforcer lifecycle

Restored SyntheticAppFocusEnforcer initialization 0x100740624 and teardown
0x100740e14 by composing the existing monitoring session and shared preventer
lifecycle. The inclusive frontmost tracker is created first. Registration of
weak lost/gained callbacks precedes the active-state read, and the key-focus
query occurs during the initial state mutation, before starting the target tap.
The frontmost observer is attached last and receives no initial replay. Lost
and gained callbacks change only the key-focus belief byte (0x1007409e0 and
0x100746338); the state store still reconciles click monitoring under its lock.
Teardown removes the frontmost observer, unregisters prevention, then releases
the session's remaining taps. No automatic deactivation/input is added to deinit.

The source app controller lazily constructs/reuses its enforcer at 0x100071fb8;
our production Target controller has not yet adopted that lifecycle. Safe
activation branch selection and click integration therefore remain outstanding.
This enforcer exposes current state, enforce/deactivate, action bookkeeping and
menu suppression, while reusing the existing implementations for each behavior.
Tests inject event tap drivers, isolated notification centers and event sends;
no real focus changes or posted input are exercised.

Validation: Swift build, full provider-click composition self-test and pinned
static callsite audit pass. The added lifecycle check asserts initialization
order, no observer replay, simulated enforcement and release of all four
created resources on teardown. Real Multica click acceptance remains pending.


## Safe enforcement foreground branch selection

Restored 0x10074195c..0x100741a14: capture the current workspace frontmost
application once. If missing, or its raw process identifier equals the target,
enforce directly without constructing restoration resources or querying AX.
Otherwise retain the saved application across the asynchronous restoration
branch. No early cached-focus check is inserted before foreground capture.
SyntheticAppFocusEnforcer now connects this selector to the existing monitoring
session's safe-enforcement/restoration scope, with a lazy restoration-driver
factory for the other-application branch only. Concrete native driver capture
and production Target ownership remain outstanding.

Swift build and provider-click checks pass. Added tests assert single capture,
PID query skipping for nil, direct/restoration error propagation, no cross-branch
fallback, and retention of the original saved application across later changes.
This is dependency-injected validation, not real focus restoration or clicking.


## Saved foreground application's focused-window capture

Static source 0x100741b60..0x100741cc8 captures the focused window once,
retains its AX wrapper and tries its WindowServer ID. Missing focused window
skips the ID read. A throwing ID lookup is discarded and produces nil ID while
the AX window reference remains retained. Zero remains a valid UInt32 ID.
There is no fallback to any other visible window. SafeActivationSavedWindow
implements this payload and systemSafeActivationSavedWindow reuses AX provider
windowID, transaction-aware UIElement element-value decoding and AXFocusedWindow.
The source getter at 0x100718904 is pinned separately. Concrete restoration
driver capture and production input integration are still pending.

Tests exercise missing focus, skipped ID reads, failed ID retention/release,
and successful zero/max IDs without querying or changing actual window state.

The captured payload also feeds systemSafeActivationWindowOrder, reusing the
existing on-screen window ordering check and AXRaise. Swift build, provider-click
self-test and static callsite audit pass; no live raise was performed.


## Native restoration driver boundaries and AXFrontmost

UIElement.booleanValue reuses the typed cache policy, existing Bool decoder
(0x10070fc2c), unsupported-attribute handling and provider-aware reads. False
is a valid cached value. Cached decode mismatch falls through to uncached;
uncached mismatch honors the supplied ignore flag, while other AX failures
are reported once and converted to nil. Source restoration reads AXFrontmost
(0x1007422e0), discards failed cached decoding then ignores raw type mismatch
(0x100742484 passes 1 to the Bool decoder), and treats absence as false.

systemSafeActivationRestorationDriver connects current workspace PID, saved
NSRunningApplication.activate(options: []), fresh target-wrapper AXFrontmost
and the captured-window order restoration to the existing timed/cancellable
loop. No new polling/retry policy is introduced. The caller still must capture
the saved application's AX wrapper using resolvingProcessIdentifier semantics;
that process fallback and production Target integration remain incomplete.

Tests cover cached true/false, raw values, absent values, read/decode errors,
ignored mismatch, unsupported attributes, lazy target construction on every
query, and no-ID window restoration skipping native queries. Tests do not call
actual application activation or raise windows.

Validation: Swift build, provider-click self-test and pinned native static audit
pass. This establishes driver boundary composition, not live click acceptance.


## Running application PID resolution and outstanding direct-branch wait

Restored resolvingProcessIdentifier at 0x100260b44. Positive raw PID returns
immediately without querying termination/path. Otherwise a terminated app or
missing executable URL returns -1. A nil-name executable-path filter with
options=1 reuses the existing Objective-C SAIRunningProcess implementation.
Exactly one candidate returns its PID, with no deduplication, first-match or
additional PID validation; absent/empty/multiple results return -1.

The enforcer's native restoration overload now constructs the saved AX wrapper
using this resolver, captures the focused window, and supplies the native
restoration driver. Fresh target wrappers use the current transaction cache.
Build and provider-click checks pass, including lazy read order, termination,
missing path, nil/empty/duplicate/multiple matches and a read-only current-app
positive-PID check. No real activation or process scan is invoked by the tests.

Correction to the earlier foreground-branch section: nil/same-PID foreground
selection is only the initial branch, not the complete direct path. Following
successful enforcement, 0x100741a94 constructs a target AX wrapper and
0x100741ca0 awaits waitUntilAppBelievesItIsFrontmost(timeout: 0.25). This
nonthrowing wait has additional AX/fallback behavior at 0x10070e1b8 and is
not implemented yet. The selector currently returns after direct enforcement;
production input must not claim parity until this continuation is restored.
No real application clicking has been verified.


## Direct enforcement's bounded AXFrontmost continuation

Restored waitUntilAppBelievesItIsFrontmost from 0x10070e1b8. The apparent
extra AX branches are cached/unsupported attribute handling, not a browser or
activation fallback. It reuses a captured target UIElement, tests monotonic
elapsed <= timeout before each read, returns on AXFrontmost=true, otherwise
sleeps 0.1 seconds. Absent/false values keep polling. Sleep failure, including
cancellation, returns from this nonthrowing wait (0x10070f2c4); no busy retry
or extra event dispatch is introduced.

The nil/same-foreground selector now calls its async wait only after successful
direct enforcement. Native wiring constructs a target AX wrapper after that
enforcement and passes timeout 0.25, matching 0x100741a94..0x100741ca0.
The other-foreground restoration branch does not use this direct wait.
Tests exercise inclusive deadline reads, expired deadline skipping reads,
true short circuit, repeated nil, sleep cancellation, and selector ordering
including thrown enforcement skipping its wait. Real application input and
production Target integration remain outstanding.

Validation: Swift build and provider-click self-test pass. Static tail-branch
pin was checked against the vendor instruction bytes; no live wait/click ran.


## Production Target ownership and system factory

Target now owns an optional SyntheticAppFocusEnforcer and exposes lazy
activateFocusEnforcer creation/reuse, matching app controller 0x100071fb8.
Construction alone does not enforce focus or send events. Target destruction
releases its owner and unregisters shared prevention via the restored enforcer
deinit. FocusStealPreventerLifecycle.system composes the native registry,
ViewBridge, current-transaction resolver and real event tap boundaries; each
system enforcer creates its own inclusive frontmost tracker and reads the
target application's actual active flag after registering prevention.

The ownership test creates a Target for the current process, supplies a factory
with nil-port drivers and an isolated notification center, verifies no eager
construction, one factory invocation across repeated access, retention until
Target destruction and release of both enforcer/preventer afterward. No actual
taps, activation or input are performed. Swift build/provider-click tests pass.

Mouse.swift does not call activateFocusEnforcer yet. Click preparation still
needs source-compatible window activation data and remaining application-click
composition before switching from its nil-context path. This change establishes
production ownership and native construction, not a completed click fix.


## Activation-point nested optional fidelity correction

Source 0x100741578 requests value<Optional<CGPoint>>, whose accessor returns
T?, so the result is CGPoint??. Symbolic type at 0x10129edec references
CGPoint's descriptor 0x1012cc0bc and appends Sg. The outer availability flag
is read at stack+0x49; inner point absence at +0x48 is forwarded separately
to the activation-event constructor at 0x100741798. The attribute comes from
AppKit NSAccessibilityActivationPointAttribute (bind at 0x101464410).

SyntheticActivationWindow previously collapsed these two cases. It now keeps
CGPoint??: outer nil takes windowless activation; .some(nil) still reads the
window ID and frame and sends a window-targeted notification without synthetic
activation clicks. Point decoding reuses the existing CF dispatch with an
Optional<CGPoint> target and preserves optional nil unpacking. The UIElement
adapter reuses typed AXActivationPoint, AX windowID and frame readers without
substituting a guessed center point.

Tests check missing versus decoded-nil payloads, retained window number, lazy
ID/frame ordering, valid cached point decoding, optional-nil unpacking and
strict malformed-value reporting. Production click preparation remains pending.

Validation: Swift build, provider-click self-test and static audit pass. The
existing test fixture now explicitly constructs outer .none; implicit Swift
optional promotion had instead produced .some(nil). No live activation ran.


## Concrete application click focus preparation

ApplicationClickFocusComposition now wires the reconstructed generic synthetic
click and accessibility-action focus preparers to UIElement/provider selection
capabilities, the enforcer's cached key-focus belief, window activation context
and native safe-enforcement method. Catalyst reads the exact private attribute
_AXExhibitsMacCatalystBehavior (0x100715974 / 0x10079cab8) through the existing
Bool accessor, with absence returning false. The extra role comparison at
0x1006fc548..0x1006fc5b8 is menuButton equality, not a broader role whitelist.

The adapters preserve no-enforcer and already-focused short circuits; they
reuse the provider-aware action environment and current transaction, with no
new process/path heuristics or activation fallback. Injected tests cover cached
Catalyst values, no-enforcer active/probe behavior, and already-focused paths
skipping further app/AX reads and event sends. Mouse.swift has not switched
to these contexts yet: the caller must also honor the synthetic preparation
result in its source-compatible event dispatch. Real clicking is unverified.

Validation: Swift build, provider-click composition checks and pinned source
audit pass. These adapters remain independent of the production mouse sender.


## Production nil-enforcer mouse flags consume preparation result

Source sendClick selects event flags from the preparation Bool. The false path
at 0x1006fcd28 supplies callerFlags | 0x100000 to the click constructor
(0x1006fcd74 / 0x1006fcd7c); the prepared continuation at 0x1006fd658 /
0x1006fd6a0 uses the caller flags unchanged. Existing command flags are never
removed. ApplicationClickEventFlags restores this mapping.

Mouse.swift now consumes the existing nil-enforcer branch's real active query:
provider-aware root.pid, NSRunningApplication lookup, then isActive if present
(false when absent), matching 0x1006fc95c..0x1006fca34. It applies the selected
flags before constructing all down/up pairs and retains existing snapshot,
identity, hold and deadline handling. No additional root-cache construction,
forced activation or input is introduced during preparation. This is an actual
production sender correction, but enforcer creation/preparation remains pending.

Tests check both preparation states with empty, shift, command and alternate/
control input flags, then inspect every event in a double-click batch. These
checks construct CG events without posting them. Real application behavior and
complete sendClick/cursor/held-key/drag lifecycle remain unverified.

Validation: Swift build, provider-click checks and pinned native static audit
pass. The production change has not yet been validated with a live app click.


## Production indexed AX-click focus context integration

Mouse.swift's accessibility-action branch now lazily obtains the Target-owned
enforcer and provides the clicked element's real containing AX window through
SyntheticActivationWindow. The restored application/action preparer selects
whether safe enforcement is needed; activation events use existing native
dispatch with identity, cancellation and deadline checks before every post.
VirtualCursor remains nil. Simulated and coordinate mouse dispatch still use
the existing nil-enforcer path and are not yet claimed aligned.

The host's snapshot contract requires a separate adaptation: successful focus
preparation can intentionally change AXFocused. After this operation actually
posts focus events, its subsequent AX-action validation permits only that
property to differ. Snapshot ID, AX object identity, count/order and all other
observed data remain checked. Without posted focus events, comparison remains
strict. InputSnapshotComparison centralizes the focused-field-only comparison;
this is a host protocol adaptation, not a vendor snapshot API.

Tests cover strict focus rejection, permitted focus change/removal, and continued
rejection of name, enabled, selected and frame changes. Existing enforcer/native
composition tests cover the dependencies, but full production live AX clicking
and screenshots before/after remain unverified. The production deadline helper
now checks Task cancellation too, including after the nonthrowing direct wait.

Validation: Swift build and provider-click composition checks pass. No actual
application activation, tap installation or AX action was exercised by checks.


## Indexed simulated clicks use native focus preparation

Mouse.swift now passes the indexed element and the click preparer's original
inside-WebView result through the simulated-click continuation. That path
obtains the Target-owned enforcer, derives activation context from the real
containing AX window, calls prepareSyntheticClickFocus with clickingByCoordinate
=false, and uses its Bool to select the event flags. Shared focus-event dispatch
checks cancellation/identity/deadline before posting. Post-preparation snapshot
validation uses the same narrowly scoped AXFocused allowance as the AX action
branch, only when focus events were actually sent.

Coordinate-only clicks retain the prior nil-enforcer branch until hit-element
and accessibility-window resolution is restored; no synthetic element/window
is invented from a screenshot rectangle. Cursor/held-key/drag/full sender
lifecycle and live Multica acceptance remain outstanding. Swift build and
provider-click checks pass, without real input or native tap installation.

A repository reuse audit also found resolvingApplicationProcessIdentifier and
SystemRunningApplicationLookup already implemented the exact native process
resolution. The later duplicate RunningApplicationProcessIdentifier implementation
was removed, enforcer capture now uses systemResolvedProcessIdentifier, and
the new edge-case tests exercise the original shared implementation instead.


## Coordinate mouse target's window selection and hit-test boundaries

Restored target(forMouseEventAt:with:) boundaries 0x100705c44..0x100705e1c.
An empty AX-window list throws its no-windows case before reading frames or
hit testing. Otherwise the source selector 0x100705e5c returns the first AX
window in caller order with a nonnil frame containing the point; it does not
sort or substitute the focused window. No match throws a point-bearing error.
Only then is the application AX root hit-tested. Successful nil is preserved.

The source wrapper at 0x100707390 catches only UIElementError.axError(-25201),
AXError.illegalArgument, and returns nil. Other UIElement errors and unrelated
errors propagate. MouseEventWindowSelection restores the selection, selective
error handling and delegation to the subsequent target/PID/window resolver.
It intentionally does not replace that resolver with a screenshot rectangle
or assume that an AX hit's process is the app process.

Tests cover order/lazy frame reads, first-match selection, empty/no-match
gating, successful nil hits, the exact suppressed AX error, other AX and
unrelated errors, and target-construction error propagation. Full source
target resolver (including out-of-process windows) and coordinate production
integration remain outstanding; no live clicks or AX hit tests ran.

Validation: Swift build, provider-click checks and pinned static audit pass.
This selection layer is not yet called by the coordinate production sender.


## Out-of-process effective mouse target selection

Restored outOfProcessTarget(for:appPID:) 0x100706df0..0x100706fa0 by reusing
UIElement.ProcessType.containingElement with its source regularApp/viewService
set (static array 0x101571590, bytes [1,0]). A missing container reports once
and returns nil. A first regular app returns nil immediately, without looking
for a later foreign service. A service whose PID equals the application also
returns nil. Otherwise return that container's PID and effective element, not
the original hit element. Existing parent traversal, actual-PID reads/errors
and process classification remain the shared implementation.

Tests cover requested types, missing reporting, regular-app termination, same
PID service, foreign service payload and stopping traversal at the first regular
app. Source guard/callsite/static-array pins accompany the implementation.
Window-ID resolution and the enclosing MouseEventTarget routing remain pending;
coordinate production clicks have not yet adopted this selector.


## Out-of-process effective target's window ID

The outOfProcessTargetWindow wrapper (0x100706864) now composes the selector
with the ID search at 0x100706fa4. Search begins at the selected effective
element, uses the shared inclusive parent chain/depth 300, and returns the
first successful AX window ID, including zero. The per-node ID reader at
0x1007072b4 converts only UIElementError.axError(illegalArgument) into absence;
other errors propagate immediately. A missing ID on a window or sheet stops
the search and produces the same semantic no-windows error as exhaustion.
Role reads preserve the source's window-then-sheet short circuit.

Tests cover a skipped illegal-argument node followed by ID zero, lookahead
ordering, role-read counts, early window/sheet boundaries, other AX error
propagation and the exact 301 inclusive traversal limit. The enclosing complete
MouseEventTarget still needs native/window-server fallback and final payload
assembly before coordinate production integration. No live input is exercised.

Validation: Swift build, provider-click self-tests and pinned native static
audit pass for effective-process selection and ID search. Live coordinate
click acceptance and full target routing remain unproven.


## Complete mouse target resolver's initial routing seed

Restored the prefix at 0x100705fe4..0x100706214 as an explicit internal
MouseEventRoutingSeed. Read app PID first, then the containing AX window's
actual PID. If they differ, read that window's ID and bypass hit children and
bundle lookup. Otherwise a present hit contributes its first child, falling
back to the original hit only for an empty children list. Child order is kept;
there is no role filter or alternate-candidate retry in this prefix.

A missing hit reads the app bundle identifier and the source
com.openai.atlas prefix requests the AX-window-ID fallback. This remains a
source-specific case, not a generic browser categorization. The intermediate
no-hit case deliberately defers actual ID lookup to its later branch so the
source's swallowed-ID-error behavior can be restored there. WindowServer
lookup/system-wide hit testing and final bounds/flipped-coordinate assembly
remain outstanding. This seed is not a final MouseEventTarget or a production
coordinate-click fallback.

Tests assert read order, foreign PID short circuit, first-child and empty-child
behavior, lazy bundle-prefix matching and PID-error propagation before later
reads. No live AX or input is invoked.

Validation: Swift build, provider-click self-test and pinned static audit pass.
The full routing/coordinate integration and live behavior remain unverified.


## AppKit-backed WindowServer point lookup boundary

CGWindow.window(at:belowWindowID:) 0x10025ba5c..0x10025bc94 uses NSScreen
order and NSMouseInRect(flipped:false) to select a screen. It reads the selected
screen frame again, transforms y to frame.height - point.y (without adding an
origin offset), and invokes NSWindow.windowNumber(at:belowWindowWithWindowNumber:).
The resulting Int is checked as UInt32 before window description lookup. No
matching screen returns nil without calling AppKit window-number or description
lookups. A missing description does not retry with another screen.

MouseWindowAtPoint restores this orchestration and systemMouseWindowNumber
uses the actual AppKit class method, rather than inventing a private SPI or
scanning rectangles from CGWindowList. Complete native description decoding
remains a later dependency. Tests inject screen frames, window-number and
description callbacks; they cover screen/read order, second-frame-read effects,
nonzero screen origins, below-window preservation, zero/max IDs, empty/no-match
screens and no retry after missing description. Swift build, provider-click
checks and static source audit pass. No live window-number lookup or click ran.


## Native window description read/decode composition

Restored shared description boundary 0x10025c904: window ID zero skips the
CoreGraphics call, a numeric pointer-sized ID is placed in a nonretaining
CFArray, and CGWindowListCreateDescriptionFromArray supplies the first row.
Missing/empty rows produce nil. syntheticFocusWindowOwnerPID now reuses this
shared boundary while retaining its owner-only extraction policy.

NativeWindowDescription restores the source payload decoder 0x10025c488:
mandatory forced UInt32 window number; owner PID cast to Int32 or -1; bounds
decoded by CGRect(dictionaryRepresentation:) or zero; Int32 layer or zero;
optional window/owner names; optional onscreen Bool. Exact CoreGraphics keys
were confirmed through bind entries 0x101464c00..0x101464c30. No new geometry
heuristic or window enumeration is introduced. systemNativeWindow composes
this with the restored AppKit point lookup.

Tests use supplied rows and callbacks to check ID-zero gating, the exact CFArray
entry, first-row selection, absent rows, metadata defaults, malformed optional
metadata, CGRect decoding and NSNumber bridging. No live CoreGraphics window
lookup, activation or input is invoked. Full mouse-routing assembly and
coordinate production integration still remain outstanding.

Validation: native Swift build, provider-click self-test and pinned static audit pass.
This validates the window-description component, not live Multica clicking.

## Complete mouse-event target resolver composition

Restored target(forMouseEventAt:axWindowAtPoint:axElementAtPoint:)
0x100705f84..0x100706864 as MouseEventTarget and resolveMouseEventTarget.
The original app PID is read once. The earlier routing seed is now consumed by
an actual complete resolver, with native AX/AppKit/CoreGraphics composition in
UIElementMouseEventTarget:

- Same-process AX hits use the first child only for initial out-of-process
  discovery, while preserving the original hit for the final target. If no
  foreign target is selected, try the hit's window ID. Only that first ID read
  swallows errors. A missing/different actual PID selects the first matching
  ancestor (including self, depth 300); its ID error propagates immediately.
  With no usable hit ID, the original AX window ID is required.
- An original AX window owned by another PID, or a discovered foreign view
  service, supplies a pending fallback PID/window ID. Native window-at-point
  is queried, followed by the original AX window ID even when the native
  lookup returned nil. That AX error takes precedence over fallback errors.
- A matching native/AX window ID permits a fresh system-wide AX hit test.
  All errors from this hit test propagate, including illegalArgument; only
  the separate app-root hit-test wrapper suppresses illegalArgument. A new
  system-wide hit replaces the old element and undergoes fresh foreign
  target discovery without the initial first-child transformation.
- A final foreign target uses its destination ID's native window bounds. A
  failed/mismatched/nil system-wide hit instead consumes the pending fallback
  and clears the original element. Both retain the original accessibility
  window. A missing native description raises unableToFindWindowID(id);
  absence of a pending fallback raises noWindows.
- The Atlas-prefix no-hit exception selects the original AX-window route.
  Other no-hit applications go through native lookup/system-wide discovery;
  no screenshot/focused-window substitute is invented.
- AX-backed targets use the original AX window frame or CGRect.zero. Final
  targets initialize windowUsesFlippedCoordinates=false (store at 0x100706808,
  confirmed by the property getter at 0x100705c20). Existing production
  MouseWindow's true default is a remaining integration discrepancy, not
  silently changed before caller routing and event construction are aligned.

CGWindow.window(for:) 0x10025b818 is verified to delegate to the same native
description helper 0x10025c904, so the concrete resolver reuses that boundary.
The optional actual-PID helper 0x10074ad50 logs an AX failure and returns nil;
the concrete composition preserves that behavior via the existing error sink.

Injected checks exercise original-hit preservation, child-only discovery,
ancestor correction/error/depth behavior, foreign fallback clearing, destination
bounds, original AX-window retention, matching/mismatched native window IDs,
system-wide replacement, foreign replacement, Atlas-prefix behavior, missing
native windows and error precedence. Tests do not post events, create taps,
activate apps, or perform live window queries.

At the resolver-only stage, production Mouse.swift still used its older
target/window construction and coordinate focus path. The resolver is now available as a concrete native
composition, but wiring it into sendClick, completing that lifecycle and live
Multica acceptance remain required. Passing resolver checks does not establish
that the reported app-click problem is fixed.

Validation: native Swift build, provider-click self-test (including system-wide
illegalArgument propagation) and the expanded pinned static audit pass.


## Indexed simulated clicks now consume the native resolver

The following integration supersedes the resolver-only status above. Source
UIElementProtocol.click continuation 0x1007b1f94 calls the complete target
resolver with its supplied containing AX window and original element. The
indexed simulated-click branch in Mouse.swift now does the same after current
snapshot validation. It consumes the resolved target's PID, element, original
accessibility window, ID, bounds and flipped-coordinate value:

- Build the event window from the resolved metadata rather than reading a
  second window from the indexed element. The native false flipped value now
  reaches event-local coordinate construction for this branch.
- Prepare focus using the resolved element (which can be nil/replaced), keeping
  the original accessibility-window activation context. Synthesized sendClick
  uses coordinate-sending activation policy, including web/selection checks;
  passing clickingByCoordinate=false here had incorrectly skipped those
  conditions for indexed simulated clicks.
- Post down/up events to the resolved destination PID, matching source
  0x1006fceb0/0x1006fcf44, rather than always using the app controller PID.
  Focus-preparation events still belong to the original application's enforcer.
- Return targetPid in the dispatched result to distinguish the resolved event
  destination from the original app. Cancellation/deadline/identity/snapshot
  validation and held-button release behavior remain in force.

The resolver checks also construct unsent CGEvents from the resolved window
and verify both event window fields. The existing native input self-test
checks AppKit window number, global location and window-local coordinates for
both flipped values on non-origin windows. Swift build, provider-click checks,
native input self-test and expanded static audit pass. No events were posted.

Coordinate-only clicks still use the older captured-window route and active-app
probe; source orderedWindows/controller context and complete sendClick scope
remain to be integrated. AX-action and synthetic-event delivery to Multica still
need harmless live verification. This is not a claim that real app clicks work.

## Window ordering and registry boundaries restored

OrderedMouseWindows restores orderedWindows() 0x100082100..0x1000823f4:
obtain the controller's window dictionary first, query CGWindowListCreate with
options 0x11 and relative ID zero, and compact-map that native ID order through
the captured dictionary. Unknown IDs are skipped; there is no focused-window,
screenshot-window or AX-array-order fallback. A nil native list yields no
ordered windows. Duplicate native IDs are not deduplicated.

The C list holds numeric pointer-sized window IDs, not CFNumber objects.
Swift's SDK importer marks CGWindowListCreate unavailable, so the native adapter
binds that same exported C symbol with its C calling convention and consumes
the retained CFArray. It does not substitute CopyWindowInfo. An isolated
read-only executable using this production adapter returned 43 nonzero window
IDs (43 entries total); no window titles, images or input were requested.

Also restored registry operations used by the controller:

- Registration 0x100085730 discards a failing window-ID read, inserts successful
  zero IDs too, overwrites an existing key, and refreshes observed IDs even on
  replacement.
- Getter pruning 0x100086068/filter 0x10008548c retains windows only when their
  throwing AX ID read succeeds and returns nonzero. Witnesses for window, menu
  and sheet all forward to 0x10072dd08, which reads the native AX window ID.
  It does not compare that ID with the stored key, inspect geometry or query
  WindowServer. Only a changed count replaces the dictionary and notifies the
  WindowOrderingObserver.

Injected checks cover snapshot-before-native-read ordering, unknown/offscreen
IDs, duplicates, nil lists, actual numeric CFArray format, zero/max IDs,
registration errors/replacement, pruning errors/zero IDs and observer update
conditions. Native build, provider-click checks and pinned static audit pass.
The read-only C-boundary check is separate from injected checks.

The current Target still lacks the original controller's full window registry
initialization, AX-notification registration and WindowOrderingObserver owner.
These restored operations are not yet a replacement for that owner. Pure
coordinate clicks remain on the older capture-based route pending that
integration; this section does not claim they have been fixed.


## Correction: Atlas branch is a prefix test

The earlier interpretation of the Atlas literal as exact equality was wrong.
The call at 0x1007061e0 reaches stub 0x101150b34, whose GOT entry 0x101466488
binds libswiftCore._$sSS9hasPrefixySbSSF (String.hasPrefix). This is distinct
from stub 0x101152ff4/GOT 0x101467f90, which binds
_stringCompareWithSmolCheck(_:_:expecting:) for equality comparisons.

MouseEventRoutingSeed now uses hasPrefix, so com.openai.atlas.beta and other
strings starting with that exact prefix take the AX-window route too. A
substring later in the bundle identifier, a case-changed prefix, a shorter
identifier, or a missing identifier do not. Resolver checks cover both the seed
and the final beta no-hit route without WindowServer lookup.

The static audit now resolves DYLD_CHAINED_IMPORT records from this pinned
Mach-O's chained-fixups table and verifies the actual imported symbol names,
rather than relying on the nearby literal and a call instruction alone. Native
build, provider-click self-test and expanded static audit pass. This correction
also informs AX enablement's iWork-prefix and exact Spotify/Excel/Arc/Dia/Music
comparisons; it is not evidence for Multica's earlier click failure.


## Coordinate simulation connected to native target routing

Coordinate mouseInput previously used the captured screenshot's window as its
destination and only probed app activity. It now retains screenshot identity,
geometry and pixel validation, then resolves the live AX window/hit element,
foreign PID and native event window through the same restored resolver used by
indexed simulated clicks. Focus preparation is shared, including the enforcer,
original accessibility window, event flags and resolved destination PID. Capture
metadata is no longer treated as a substitute event target.

The coordinate caller snapshots currently available AX windows into an ID map
before reading WindowServer ordering with restored onScreenMouseWindowIDs and
orderedMouseWindows. AX array order is not a stacking-order fallback. Full
notification-driven controller registry ownership remains outstanding; this
per-call snapshot does not claim parity for registry history/AX notifications.

Owned live acceptance now includes screenshot pixel coordinate clicks in
addition to indexed clicks. Both foreground cases and both cases after a second
owned application becomes active pass: each produces the expected distinct
Saved marker in the target's observed AX tree. The real helper NDJSON path is
used. Screenshot PNGs and runtime report data are not published. Native build
and provider-click component checks pass. This verifies owned-fixture input;
it does not establish Multica, MCP/DeepSeek, drag/cursor or complete sendClick
lifecycle acceptance.


## Window ordering task ownership restored

WindowOrderingObserverTaskStore mirrors lock-protected observedWindowIDs,
main task and menu task storage from 0x100787f70. start (0x100789008,
0x100789058) creates the main task only when absent. stop (0x100788060)
and deinit cancel/clear the main task before canceling/clearing the menu task,
inside the same unfair lock. menuDidClose (0x100788fac) only cancels/clears
the menu task. Task.cancel is verified through its actual imported binding.
Observed IDs preserve array order and duplicates; replacement does not restart
a task. Injected checks cover repeated start/stop, restart, menu-only cleanup,
resource release and destruction order. Native build, provider-click checks and
expanded pinned static audit pass; these checks start no real observer task.

This task store is not yet connected as a complete production observer. Static
inspection of the main async entry establishes SystemSoftware.CGWindow.EventStream
and its AsyncIterator as the event source (0x1007891f0, 0x100789214,
0x1007893bc), so an invented periodic AX/window poll would not reproduce it.
The event stream adapter, event filters, ordering reactions, menuDidOpen task
and full observer/controller composition still require restoration.


## WindowServer event vocabulary and SPI bindings

WindowServerEvent restores all 21 declaration cases and UInt32 raw values
from field descriptor 0x10131bb78 and raw table 0x10116c6bc: the 800..816
window events and 1325..1328 workspace events. Unknown raw values remain nil.
The expanded pinned audit checks every reflected name and value, rather than
inferring event meanings from nearby strings.

WindowServerSPI now reuses the existing source SoftLink primary binding array
for registerConnectionNotifyProc (slot 1, 0x10026bb5c),
removeConnectionNotifyProc (slot 2, 0x10026bc50), and
requestNotificationsForWindows (slot 3, 0x10026bbe0). The C callback ABI is
(UInt32, pointer?, UInt32, context?) -> Void. Register/remove return CGError;
window subscription takes a UInt32 pointer/count and returns Void. No alternate
AX notifications or polling implementation was substituted. Required missing
symbols retain the source's trap behavior.

Enum checks use only static values. No real notify registration, subscription
or removal occurs in this verification. Callback context retention, observer
registration order/cleanup and AsyncStream iteration remain to be restored and
integrated before claiming production WindowOrderingObserver completion.


## CGWindow.Observer registration and destruction ordering

CGWindowObserverRegistration restores the registration tail at
0x1002599f4..0x100259b00 and resource teardown at 0x100258580..0x100258680.
It first registers its callback registry entry, then reads the main connection
once, registers each requested event in input order, and requests notifications
for the original window-ID array with checked UInt32 count. Duplicate events,
duplicate/zero window IDs and empty arrays are preserved. CGError results are
ignored and do not suppress later registration or window subscription.

On destruction it removes/releases the callback registry entry first, reads
the current main connection again, then removes every event in original order.
No registration rollback, skipped empty subscription or unregister-error throw
was introduced. Injected checks exercise these orderings, failed CGError results,
context identity and empty/duplicate inputs without registering real callbacks.

This is a registration resource component, not the full CGWindow.Observer.
Initial window-description mapping, callback-ID registry, raw event payload
interpretation and AsyncStream ownership remain explicit required work. The
component has no default fake callback source and is not yet used to claim a
production ordering observer.


## Callback registry identity and retained resources

CGWindowCallbackRegistry restores the locked registry's checked UInt counter
and dictionary insertion/removal boundaries. The singleton initializer starts
its counter at zero (0x100258990); registration increments and stores it before
inserting the retained entry, returning the new ID (0x1002587b0). IDs begin at
one and are not reused after removal. Overflow retains the source's trap behavior.

Removal (0x100258860) returns the removed optional entry, rather than destroying
it under the registry lock. This matches the observer caller unlocking before
releasing the handler and initial window-description map. Missing keys return
nil. The generic entry is an explicit seam for that still-pending concrete data.
Checks cover monotonic identity, missing/zero IDs, retained entries, ownership
transfer and destruction that safely reacquires the registry lock. They do not
register a native callback. Callback payload interpretation and full event-stream
composition remain outstanding.


## Native raw callback and concrete observer connected

CGWindowNotification restores trampoline 0x1002589ac and callback body
0x10025a964: unknown events, nil data and nil callback context are dropped;
the first payload UInt32 is a window ID and context bits are the callback ID.
The source trampoline discards the length argument. It snapshots/retains the
registry entry while locked, then unlocks before live window lookup or handler
execution. Contrary to a tentative earlier code comment, this path does not
mutate the registry's initial window map during event delivery.

Live NativeWindowDescription lookup takes precedence. If it is unavailable,
use the initial description for that ID; if both are unavailable, drop the event.
This allows termination/ordered-out notifications to retain useful descriptions.
The handler runs outside the registry lock and may unregister itself. Tests
cover invalid/nil guards, fresh-over-initial preference, initial fallback, missing
entry/window drops and handler reentry into registry removal.

NativeCGWindowObserver now snapshots initial descriptions for supplied IDs,
registers its concrete handler/map entry and composes the existing SPI wrappers
with CGWindowObserverRegistration. Its lifetime therefore owns actual native
registration and cleanup, ready for the remaining AsyncStream adapter. Injected
verification does not construct this concrete observer or register live callbacks.
Full ordering reactions/menu tasks/controller integration remain outstanding.


## CGWindow.EventStream AsyncSequence composition

CGWindowEventStream restores value configuration windowIDs/events/bufferingPolicy
and per-iterator stream/observer/iterator storage, verified through both source
field descriptors. Each makeAsyncIterator creates its own standard Swift
AsyncStream pair, constructs its iterator, and subscribes a NativeCGWindowObserver.
The observer callback captures the continuation and yields the window/event tuple;
the source ignores yield results. Merely creating the sequence starts no native
subscription. next forwards to the standard AsyncStream iterator.

The observer is retained by iterator lifetime. No invented onTermination closure
releases it immediately when next returns nil; cancellation and buffering behavior
come from Swift AsyncStream. The native specialization now composes the restored
concrete observer/SPI/registry chain. Buffering policy is required explicitly until
source call-site policies are supplied, avoiding a guessed default.

Injected checks verify lazy creation, independent subscriptions, bufferingNewest
retention of the final two events, tuple forwarding, observer retention across
iterator copies, release after final copy disposal, and cancellation of an empty
stream task. They perform no live WindowServer subscription. Full ordering response
logic/menu tasks and production controller integration remain outstanding.


## Ordering subscription policy and restoration eligibility

The main ordering subscription reads current observed IDs, subscribes only to
WindowServerEvent.didChangeOrder, and uses bufferingNewest(1). This is verified
from the static event-array count/tag and the actual imported bufferingNewest
enum-case metadata, rather than guessing Swift enum tag meanings. The shared
orderingWindowEventStream factory now preserves those call-site choices.

The event reaction begins by taking the current observed-ID list and ignoring
an event window not present in it. It then reads the foreground application,
ignores a window owned by that foreground PID, and asks only for that other
application's focused AX window. Missing foreground/focused window ends the
reaction; primaryWindow's main/last fallbacks do not apply here. The restored
windowOrderingRestorationContext isolates this selection boundary while retaining
its selected application/window for later restoration operations.

Injected tests cover short-circuit order at every guard and the one-event,
newest-one subscription behavior. Native build, component checks and expanded
static audit pass. Subsequent native restoration behavior in the same source
function is still being analyzed; the guard helper is not yet presented as a
complete ordering response or connected to production controller observation.


## Scoped AXRaise observer and atomic change guard

The restoration action creates a temporary observer over a snapshot of on-screen
window IDs for workspaceAddWindow (raw enum declaration tag 17). Its callback
sets a ManagedAtomic<Bool> using a release store; the pre-AXRaise decision reads
with acquire ordering. If already changed, AXRaise is skipped. Otherwise the
raise is attempted; errors are reported without skipping the subsequent settle
wait. The observer stays alive through the final ContinuousClock 5 ms sleep,
including cleanup when sleep throws/cancels. This is a distinct scope from the
main didChangeOrder subscription, whose newest-one buffer is unchanged.

WindowOrderingRaiseScope restores those resource/ordering boundaries. The
existing resolved swift-atomics 1.3.1 dependency is now explicitly declared and
used as Atomics, matching the source ManagedAtomic implementation rather than
inventing lock-based replacements. Injected checks cover immediate notification,
normal raise, reported raise failure, sleep failure and observer lifetime.
These checks register no live notifications and perform no actual AXRaise.
The full source action helper/controller owner remains to be composed before
claiming production ordering-restoration parity.


## Native ordering restoration action composition

Further inspection confirms helper 0x100733c14 is the specialized full action
dispatcher: it preserves menu-role preparation, disclosure/scroll branches and
the final AXUIElement.perform call. The ordering path passes the source raise
action to this helper. The restored composition therefore reuses
UIElement.perform(action: .raise); it does not replace it with a direct raw
AXUIElementPerformAction call or duplicate the existing dispatcher.

WindowOrderingRestoration now connects event-window eligibility, current
foreground application selection, resolved-process AX application construction,
focused-window selection, temporary workspaceAddWindow observer and scoped raise.
No main/last-window fallback is introduced. Raise errors are reported by the
scope; settle sleep errors/cancellation propagate to the main loop's owner.
Injected orchestration checks verify selection gates and error propagation.
This native action method is ready for the main event-loop composition but is
not yet called by a complete production ordering observer. No native raise or
notification subscription was performed by these checks.


## Main event loop subscription updates and error behavior

WindowOrderingEventLoop restores weak owner lookup before subscription and
before each event. The source retains its owner through handling/comparison,
then releases it before the idle next() await. Task cancellation stops the
outer loop; a handler CancellationError exits without logging. Other errors
are reported and follow the same membership comparison as successful handling.
The CancellationError metadata and Task.isCancelled imports are pinned.

After handling, it compares Set(subscribedIDs) with Set(current observed IDs).
Array reordering and duplicate count changes preserve the existing subscription.
A membership change disposes the old iterator/stream/observer first, then reads
current IDs again for a new subscription. The source does not synthesize an
event when the property is set, or rebuild immediately just because its array
order changed. Normal stream exhaustion also returns to the outer loop.

Injected checks verify old-observer destruction before replacement, error
continuation, cancellation cleanup, duplicate/order-only updates and an absent
weak owner. This connects the previously restored subscription policy and event
stream into the main loop boundary. Full concrete observer/menu/controller
composition and live event acceptance are still outstanding.


## Menu-open task selection and replacement

openWindowOrderingMenu restores menuDidOpen 0x100788190..0x1007884ac.
Every invocation first cancels/clears the prior menu task, even if later guards
fail. It then snapshots observed IDs in a separate lock scope, resolves each
window's current owner PID and builds a Set of owners. Duplicate observed IDs
still cause separate native window lookups. Missing windows are ignored; -1 is
not silently excluded from an otherwise present owner value.

Only a nonempty owner set and an available foreground application whose PID is
outside that set create a menu task. Its PID is read again for task capture,
matching the source. The task stores that PID and the original ID array. Creation
and assignment occur under the state lock; no main-task-active guard is added.
The prior cancellation and selection lookups are not held inside one lock.

Injected checks cover cancellation on every early exit, unchanged main task,
duplicate lookup ordering, two PID reads on success, current-ID changes during
unlocked lookup and preserved captured IDs. The concrete menu task body remains
to be restored before production menu observer composition.


## Menu task ordering polling and single raise

The menu task is a distinct short polling routine, not a second CGWindow event
subscription. It builds the captured foreground PID's AX application and reads
its focused window and throwing window ID once. Missing focused window or ID
error ends the task; no primary-window fallback is used.

runWindowOrderingMenuTask restores twenty iterations of ContinuousClock 5ms
sleep followed by current on-screen ordering. Missing focused ID in that ordering
continues polling. If any originally observed window's first index precedes the
focused window's first index, it attempts the full raise action once and exits,
including when the action throws. Sleep errors/cancellation end the task quietly.
The source routine has this native twenty-attempt bound; it is unrelated to the
removed AgentLoop step cap. No new foreground PID recheck was invented inside
this routine; the PID/window captured by menuDidOpen determine its scope.

The concrete native method composes existing AX window selection, WindowServer
ordering and full UIElement action dispatch. Injected checks verify one-time
focus selection, sleep-before-ordering, watched-versus-unrelated window ordering,
raise failure exit, twenty missing-window attempts, absent/failed AX selection
and cancellation. No real AXRaise or desktop notification is used by these tests.
Production observer/controller composition and live menu acceptance remain.


## Concrete ordering observer composed

WindowOrderingObserver now connects the lock-protected task store, weak-owner
main loop, didChangeOrder AsyncStream/Observer, foreground restoration, menu-open
selection and short menu polling task. start preserves a single owned main task;
stop/deinit cancel both tasks; menu close only cancels the menu task. Task bodies
capture their parent observer weakly for the main loop, and capture menu PID/IDs
without retaining the parent for menu work. No automatic task-slot clearing on
normal task completion was added, matching source ownership until stop/close.

NativeWindowOrderingObserver supplies the real WindowServer observer, focused
AX-window restoration and native menu task dependencies. Its explicit initializer
is available, but production Target integration still requires controller window
registration and AX menu notification ownership. Merely constructing it starts
no native subscription.

A composed injected check starts the real Task lifecycle against a fake native
observer, delivers a change through AsyncStream, verifies restoration dispatch,
then drops the parent and requires observer cleanup. A bounded test deadline
prevents a retention-cycle regression from hanging verification. No real desktop
subscription, raise or menu operation occurs in that check. Live native event
acceptance and full production controller parity remain unproven.


## Controller window registry ownership

MouseWindowRegistry now owns the controller dictionary and composes the restored
registration, pruning and native ordering helpers. Source registration at
0x100085730 reads the throwing AX window ID before beginning dictionary mutation,
ends mutation access, then publishes observed IDs to the ordering observer. This
is a plain controller dictionary, distinct from the observer's unfair-locked task
state; no extra registry lock was introduced. The owner must serialize access.

Successful zero IDs are inserted and later pruned by the getter. Replacement at
an existing key still publishes observed IDs. Pruning only publishes when the
map count changes; a successful changed nonzero AX ID does not rewrite its stored
key. The complete map is captured before native ordering is queried, so a window
registered during that query appears only in a later ordering read.

Ownership checks exercise replacement, zero-ID pruning, unchanged getter reads,
stored-key preservation and registration after a map snapshot. AX notification
registration and production controller ownership remain to be connected; this
registry does not invent a periodic refresh in place of native notifications.


## AX notification identity and registration accounting

AXNotification restores distinct CFString identity/hash semantics with the
window-created, focused-window, destroyed and menu names needed by controller
integration. Menu name construction is checked against the pinned native small
string initializers. This initial constant surface does not claim every original
AXNotification convenience constant has been restored.

Registration at 0x1006ecab8 always calls AXObserverAddNotification first. Its
explicit ignoringErrors list is checked before success/duplicate handling: an
ignored result returns without recording a target, even when .success itself is
in that list. Otherwise success and notificationAlreadyRegistered (-25209) both
record the target in notification -> Set<Element>; other errors throw
UIElementError.axError. Existing records do not suppress another native add call.

AXNotificationRegistrationTargets composes this policy and the source plain map.
Checks cover repeat native calls, set membership, ignored success/duplicate/
unsupported results and error propagation without installing any real AX
notification. AXObserver creation uses AXObserverCreateWithInfoCallback in the
source; callback context, removal and RunLoopTask monitoring still require
restoration before production notification ownership can be declared complete.


## AX notification removal accounting

Removal at 0x1006ed1a0 calls AXObserverRemoveNotification before changing
the target map. Only success and notificationNotRegistered (-25210) remove
the target; other errors propagate and preserve the record. Empty sets remain
in the dictionary, including successful direct removal of an unseen pair.
Removing an entire notification snapshots its registered set first. Array
overloads preserve order and duplicates, stop at the first error and retain
earlier successful changes without rollback.

Injected provider checks cover successful/already-absent removal, failed removal
record preservation, retained empty sets, empty bulk removal and ordered batch
failure. The Swift build and provider checks pass. No native notification was
installed by these checks. Callback context and RunLoop monitoring, followed by
production controller ownership, remain outstanding.


## AX callback context ownership evidence

The lazy context constructor at 0x1006ec998 retains its AXObserver and uses
swift_weakAssign for the owner (0x1006ec9e8). Callback forwarding at
0x1006ed670 first rejects a missing refcon or absent bridged info dictionary,
then loads the weak owner strongly at 0x1006ed6e4 for synchronous delivery.
The delivered event uses the callback's observer, element, notification and info;
it does not substitute the context's retained observer for the callback argument.
AXNotificationCallbackContext restores this ownership and delivery gate, with
checks for missing context/info, owner release, observer retention and release.
It is a component for the pending concrete C callback, not production integration.

Monitoring evidence now identifies an important startup barrier: configuration
at 0x1006ed390 synchronously dispatches a no-op to DispatchQueue.main before
CFRunLoopAddSource (0x1006ed460), using kCFRunLoopDefaultMode. These identities
are verified from imported bindings at 0x101469058 and 0x101464a00. stopMonitoring at
0x1006ed4a0 removes the source from an available thread RunLoop, clears the
source, then releases its RunLoopTask; deinit invokes stopMonitoring first.
Do not replace this lifecycle with polling or claim that the callback-context
checks exercise native event delivery.


## Concrete AX observer composition

AXNotificationObserver now composes native AXObserverCreateWithInfoCallback,
the previously checked registration/removal accounting, a lazy retained-observer /
weak-owner context, and RunLoopTask. Callback events preserve the observer passed
by the native callback alongside element, notification and bridged info.
Native AX creation errors propagate as UIElementError.axError; successful creation
without an observer throws a separate initialization error rather than unwrapping.

startMonitoring is idempotent while its task exists. It obtains the native source,
retains callback context on the thread, uses the source thread name and requested
QoS, executes the main-queue startup barrier and installs in default mode.
stopMonitoring snapshots the thread RunLoop through its existing lock, removes
an available source, clears the source, then releases the task. It does not
unregister individual notifications or invalidate the AX source as an invented
cleanup step. RunLoopTask exposes its existing locked RunLoop for this operation.

This concrete object still needs controller ownership and real AX event-delivery
acceptance. Compilation and existing injected checks alone do not prove that
production application operations receive window/menu notifications.


## Callback info type correction and controller subscription discovery

The original NotificationEvent.info getter symbol explicitly declares
[String: AnyObject]?. The concrete observer now uses that type and conditional
NSDictionary bridging, rather than permitting AnyHashable keys. Checks verify
nil rejection, acceptance of an empty dictionary, valid string-key contents and
rejection of NSNumber keys. The imported Foundation conditional bridge is pinned
at 0x101463730. Build and provider checks pass after this correction.

Controller initializer disassembly at 0x10006d660..0x10006d7a4 identifies six
root subscriptions: windowCreated, menuOpened, menuClosed, sheetCreated,
windowMoved and windowResized. This is stronger evidence than assuming the
initial five notification constants matched the controller's root list.
The callback also removes/registers uiElementDestroyed on individual elements
and calls WindowOrderingObserver.menuDidOpen/menuDidClose. Exact event branches
and controller callbacks are still being reconstructed before production wiring.
The static dump is /tmp/cua-controller-init-full.asm; no vendor process ran.


## Root notification configuration and monitoring constructor

AppControllerAXNotifications preserves the source six-notification order and
userInitiated QoS (raw 25 at 0x10006d790). Constants for sheetCreated, windowMoved
and windowResized now use their native SDK names. The observer monitoring
constructor mirrors 0x1006ec20c: create observer, register in array order, then
start monitoring. Registration failure propagates before monitoring starts.
The root list and QoS are checked and source call sites are pinned in the audit.
This configuration is not yet installed on Target; event callback semantics and
actual native notification-delivery acceptance remain required.

The callback branch at 0x10006db84 constructs a window wrapper on windowCreated
and registers it through 0x100085730. uiElementDestroyed at 0x10006dcbc attempts
native unregistration and swallows that branch's error. menuClosed invokes
WindowOrderingObserver.menuDidClose before clearing other controller state.
Do not infer that destruction directly erases the window dictionary: its actual
window getter prunes invalid AX IDs. More menu-state handling remains to map.


## Menu-open readiness and registration ordering

The menu-open callback at 0x10006dd30 first wraps and records the menu, then
polls its windowID for up to 0.25 seconds at 0.01-second intervals. The delay
is decoded from 0x10116b0a8; the condition at 0x10006ea6c returns nil on an AX
windowID error but accepts a successful zero ID. Polling failure is swallowed.
It then calls menu-window registration (0x1000858c0), followed by the ordering
observer's menuDidOpen. Registration rereads the windowID rather than reusing
the polling result, inserts into the shared window map and updates observed IDs.

prepareAppControllerMenuOpen restores this sequence using the existing Date
polling helper and injectable boundaries. Checks cover exact order, timing,
zero-ID acceptance and continuation after a timeout. The concrete controller
still needs its menu state, notification callback and window registry connected;
this helper alone does not start native listeners or send input.


## Menu-close window removal

The callback filters a snapshot of the shared window map by each value's raw
AX element equality with the closing menu element (0x1000862e0). It collects
matching stored keys and removes them individually, publishing current observed
window IDs after each removal. It does not reread AX window IDs, remove every
menu indiscriminately or batch the observer update into one final publication.
MouseWindowRegistry.removeWindows(matching:) restores that mutation boundary.
Checks verify multiple matching records, preserved nonmatching records, stored
key use after an AX ID changes, zero AX-ID reads during removal, per-removal
updates and no update when no identity matches. Menu close also first cancels
the ordering menu task and clears two separately locked controller state slots;
those state owners still need reconstruction before full callback integration.


## Controller menu state ownership

Symbols at 0x1000477e8 and 0x100047824 identify two independent
OSAllocatedUnfairLock optional slots: currentlyOpenedMenu and
currentlyFocusedMenuBarItem. AppControllerMenuState restores separate storage,
reads and assignment. Its menuDidClose sequence first calls the ordering
observer, clears opened menu under its lock, then focused menu-bar item under
its lock, then invokes matching-window removal outside both locks.
Checks verify the ordering callback sees the previous state, removal sees both
slots cleared, independent assignment and callback re-entry without a held lock.

The callback trampoline 0x10008a3fc directly forwards to 0x10006da8c; it does
not introduce a main-queue hop. Production Target is MainActor-isolated, so its
integration requires an explicit ownership decision rather than assuming the
native callback is already running on the main thread. The original dictionary
has no extra lock, while these two menu slots have their own native locks.
This outstanding concurrency boundary must be resolved during controller wiring.


## Real native AX monitoring lifecycle check

`cua-helper --ax-notification-lifecycle-check` creates a real AXObserver for
its own process and starts the actual RunLoopTask. It waits for the native AX
source to appear in default mode, verifies repeat start retains the same RunLoop,
stops and verifies source removal, repeats stop, then restarts and verifies a new
RunLoop and final source removal. It passed on this machine after a successful
Swift build; the process was externally bounded to 15 seconds. Existing provider
composition checks and the pinned static audit also pass.

This check registers no AX notifications and sends no UI input. It proves native
observer creation and source/task start-stop behavior including the main-queue
barrier, not real event delivery, Target wiring or successful application clicks.
The internal monitoringRunLoop accessor exposes the existing locked snapshot for
lifecycle observation; it does not change production start/stop behavior.


## Real owned-window AX event delivery acceptance

`cua-helper --ax-notification-delivery-check --allow-owned-ui` passed on this
machine with the desktop unlocked. It starts the exact sibling CuaFixture as
its own child, subscribes to windowMoved on that child application root, starts
the concrete observer and waits for a native callback whose element PID matches
the child. The fixture moves only its own window by one point on a timer. No
mouse or keyboard event is sent. The check then removes the native subscription,
stops monitoring and terminates its owned child. The invocation was bounded to
20 seconds in an isolated process group, with group cleanup after completion.

This proves actual native AXObserverAddNotification -> RunLoop -> info callback
-> bridge -> weak-owner handler delivery for a windowMoved event. It is stronger
than the earlier no-subscription lifecycle check, but does not cover every
notification type, Target integration, MCP/DeepSeek or arbitrary app clicks.
The flag requires explicit --allow-owned-ui; no existing app PID can be supplied.
Swift build, provider component checks and the pinned static audit also pass.


## Full root subscriptions and move/resize refresh behavior

The real owned-window delivery check now registers all six controller root
notifications, then unregisters all six after receiving the owned windowMoved
event. It passed on an unlocked desktop with a 20-second process bound and
owned-process cleanup. This verifies native acceptance of the full root list
and continued event delivery, not delivery of each of the six event types.
Registration failure diagnostics retain the last native error.

The source move/resize branch at 0x10006e944 republishes the current stored
window keys through observedWindowIDs.setter at 0x10006ea38. It does not prune
invalid windows or reread AX IDs in that branch. MouseWindowRegistry now exposes
republishObservedWindowIDs for this exact operation. Checks verify keys retain
their stored identity after the AX ID changes and publication performs no AX
read. This operation still awaits production callback integration; no new
click success is implied by the notification acceptance result.


## Initial primary-window and descendant-sheet traversal

Controller initialization calls application.primaryWindow at 0x10006cc34, then
registers that window at 0x10006ccc0. It begins with that window's children,
removes the first queued child (memmove at 0x10006ce0c), tests AXSheet role and
performs sheet registration when matched. Every visited child's children are
appended afterward (0x10006d21c..0x10006d224), including descendants of sheets.
This is a breadth-first traversal below the selected primary window; it is not
an eager registration of every entry in the application's AXWindows array.

registerAppControllerInitialWindows restores that orchestration with injected
window/sheet operations. Checks cover absent primary short-circuit, primary
registration before traversal, FIFO ordering, duplicate preservation and nested
sheet traversal. Sheet-specific registration internals and production lifecycle
ownership remain outstanding; this traversal alone does not populate Target.


## Resolved sheet-window insertion

Further disassembly shows 0x100085a68 is the specialized dictionary insertion
operation for a SheetUIElement value, not an additional AX lookup or a separate
sheet observer policy. The caller already reads raw AX windowID at
0x10006cf58, skips insertion on read failure and passes the resolved key into
the helper at 0x10006d080. Existing keys are replaced; absent keys are inserted.
The caller later updates the observed key array.

MouseWindowRegistry now supports registration with an already-resolved window
ID. The ordinary registration path still reads once and delegates to this
operation, preserving publication after mutation. Checks cover no extra AX read,
replacement publication, zero-ID insertion and stored-key lookup. Production
initialization still needs to compose this with the descendant scan and its
publication boundaries; this overload is not itself full Target integration.


## Menu-specific native window ID resolution

MenuUIElement.windowID delegates to 0x100725a5c. It first reads actualPID,
then raw AX windowID, then lists native windows with options raw 18
(optionOnScreenAboveWindow plus excludeDesktopElements), relative to that AX ID.
It returns the first window in native order with the same owner PID and layer
101 or 24. No match throws a distinct menu-window error; it does not fall back
to the raw AX ID. Successful raw zero is still passed to the list operation.
CGWindow.allWindows at 0x10025b8e8 calls CGWindowListCopyWindowInfo.

resolveMenuWindowID and systemMenuWindowID restore this lookup. Checks cover
lookup order/options, foreign PID rejection, ordinary-layer rejection, first
matching window selection, missing-match failure and PID error short-circuit.
Production menu wrappers still need to use this path when the full controller
is connected. Treating a menu's raw AX ID as its dispatch window would be a
behavioral mismatch, even if basic fixture-window clicks succeed.


## Window protocol witness boundary: raw and menu-specific paths

Additional protocol metadata inspection changes the planned wrapper declaration:
WindowUIElementProtocol at 0x1012cc9c0 has one generic signature constraint and
three witness requirements: a base conformance plus two getter slots. Declaring
it as just UIElementProtocol plus one windowID getter would lose a source slot.
The named extension windowID getter at 0x10072cea8 forwards through witness
+16. In both WindowUIElement and MenuUIElement tables that slot reaches
0x10072dd08, which reads the raw AX windowID. The +24 slot reaches the same raw
helper for WindowUIElement, but MenuUIElement reaches 0x1007259c8 and then its
special native-menu resolution at 0x100725a5c.

Therefore raw protocol forwarding and concrete menu lookup must remain distinct;
replacing every window-ID access with systemMenuWindowID would also be wrong.
The exact source naming/contract for both getter requirements remains to be
recovered before declaring the wrapper protocol. The witness table pointers,
forwarding instructions and call targets are now pinned by the static audit.
No speculative one-getter protocol or wrapper conformance was introduced.


## Reconstructed two-getter window protocol contract

WindowUIElementProtocol now explicitly preserves both throwing UInt32 getters
and inherits the complete UIElementProtocol contract. The first is named
rawWindowID as a descriptive reconstruction name; the binary does not provide
its private spelling. Its default reads axElement.windowID, matching the common
raw witness. windowID defaults to forwarding through rawWindowID, matching the
named extension's witness call, while concrete menu implementations can override
it with menu-level native resolution. No unrelated UIElement is declared to be
a window merely to satisfy this contract. Concrete wrappers and controller use
remain outstanding; preserving the two operations avoids collapsing an observed
source distinction while allowing implementation to proceed without inventing
an assertion about an unavailable private symbol name.


## Concrete window-wrapper storage and construction

WindowUIElement, SheetUIElement and MenuUIElement now have their native AX
reference plus immutable UIElementCache storage and their respective static
roles. Source WindowUIElement.init at 0x100724de0 tail-branches to the shared
Menu/Sheet initializer at 0x100721e3c, which acquires the current transaction and
calls the existing cache constructor at 0x10076589c. Reconstruction reuses
UIElement(element:) for that same provider-aware transaction/cache construction;
it does not introduce a second cache or direct AX attribute-reading subsystem.

Ordinary window/sheet ID access uses raw AX windowID; menu storage exposes both
raw ID and the recovered native-menu resolver. A scoped-transaction check covers
original AX identity, prefetched-cache propagation and restoration of TaskLocal
state. These types intentionally do not yet declare full UIElementProtocol /
WindowUIElementProtocol conformance: their complete inherited getter/action
witnesses still need to be restored before registry/Target integration.


## Restoring cached getters to the protocol extension

The symbol table identifies cached role, subrole and text getters as
UIElementProtocol extensions, rather than UIElement-only methods. Reconstruction
now declares cachedStringValue, cached role/subrole, roleDescription, help,
identifier, placeholderValue, title, description, value and valueDescription on
the protocol extension. They continue to read the same immutable cache and use
the same decoder; no fresh AX request or wrapper-to-UIElement conversion is
introduced. Existing concrete stored properties, such as transformed captured
values, retain their concrete witnesses.

This moves the implementation toward native shared protocol behavior so window
wrappers can inherit the actual cache logic. The remaining inherited getters
and full action behavior still need the same treatment before concrete window
conformances are complete. Cache/getter regression coverage is in the existing
provider composition checks; this refactor is not application input acceptance.


## Shared typed values, support checks and enabled state

The protocol-extension restoration now also covers cached Bool/URL, flattened
role, descriptive-attribute classification, isEnabled, the focusability helper,
known-unsupported attribute checks, the String cached/uncached pipeline and the
Bool scalar pipeline. Each operation continues to use the original lazy cache
accesses, provider reads, decoders and supplied error reporter. The cached
Bool/URL extension is split from titleTargetIdentities because its collection
read dependency is still being restored; no unsupported forwarding shim was
added for that remaining path.

These methods are now available through the native UIElementProtocol boundary,
which is required for window-like concrete conformers to inherit them. Remaining
collection/state/presentation getters and action witnesses still prevent claiming
complete window conformance or production application acceptance.


## Shared collection getters for window conformers

The existing [UIElement] collection accessor, provider-aware collection/children
reads, array count, visible-child selection and partial-array accessor now live
on UIElementProtocol. Their decoder target remains the existing [UIElement]
specialization; the change does not claim the entire original generic decoder
surface has been reconstructed. Cached empty arrays remain hits, strict fresh
read errors retain their existing reporting, maxCount applies only to fresh
partial-array reads and construction still consults the current transaction.

The titleTargetIdentities helper can therefore also live on UIElementProtocol,
returning original AX references in source order. Existing provider composition
checks cover cache/fresh-read policy, subset descriptors, child selection and
transaction construction. Remaining state/presentation and action witnesses
are still required for concrete window-type conformance and Target wiring.


## Shared selection, disclosure and typed error reporting

Provider capability checks, focused/selected cache state, Catalyst traits reads,
disclosure state/toggle composition and explicit action-list composition now
use UIElementProtocol extensions. The public default isSelected and
titleTargetIdentities getters also use that boundary. Their shared attribute
error reporter preserves NativeLogger.logger(for: Self.self), so future window
conformers report under their concrete type instead of a forwarded UIElement.
The existing UIElement action dispatcher continues using the same inherited
reporter; no AX action routing was replaced by a simpler implementation.

Cache-first selection semantics, missing-vs-malformed AXSelected distinctions,
traits fallback, support-and-settable checks and decoder error handling remain
unchanged. Full perform(action:) and web-view ancestry composition are still
concrete and require further restoration before full window conformance.


## Protocol-existential parent chain and web ancestry

The source generic isInsideWebView getter at 0x1007ab2c4 calls the generic
parentChain with depth 300 and includingSelf=true. Its yielded nodes retain
UIElementProtocol existential identity; they are not all rebuilt as concrete
UIElement snapshots before traversal. The provider parent chain now preserves
that existential root and returns decoded parent UIElements as protocol values.
This avoids a fresh AX/cache construction for the initial wrapper and lets
its own role/cache witnesses participate.

The shared element-value decoder and provider parent read now live on the
protocol extension, as does provider web-ancestry composition and its public
default getter. Existing parent-chain behavior still resolves the next parent
before yielding, preserves the original depth semantics and retains the Atlas
bundle-prefix fallback. Explicit system-transaction helper overloads remain
concrete where their existing callers require concrete UIElement sequences.
Full generic action dispatch and scrollbar dependencies remain outstanding.


## Concrete window protocol conformance and full action dispatch

The scrollbar value decoder and provider scrollbar composition now live on
UIElementProtocol. The full perform(action:) default also uses that extension,
retaining menu-ancestor preparation, disclosure toggling, scrollbar-page routing,
provider-aware native action fallback and concrete-type error reporting.
UIElement's own conformance now supplies only its static nil role and inherits
the shared dispatcher.

WindowUIElement, SheetUIElement and MenuUIElement now declare
WindowUIElementProtocol conformance and satisfy its full inherited contract
through the recovered shared defaults and their stored cache/reference. Mock
provider checks exercise all three through window-protocol existentials,
verify AX identity, cache-derived instance role (distinct from static type role),
enabled/presentation defaults and full press dispatch. No native input is sent.
Production registry/controller wiring and real application acceptance remain
outstanding; compiler conformance and mocked actions do not prove those paths.


## Controller notification routing composition

The recovered callback routes windowCreated to registration, application-attention
clearing and the window-created focus branch; sheetCreated registers then clears
attention. Destruction attempts subscription removal with swallowed errors before
ending menu-dismissal suppression. Menu-open and menu-close enter their distinct
state handlers, with close ending suppression after state/window cleanup.
Move/resize republishes stored IDs and returns without ending suppression.
Unrecognized notifications have no effect.

The shared routing function keeps concrete wrappers, attention SPI, focus and
menu-state boundaries injected. It is an orchestration component, not a claim
that those effects are already wired to production Target. In particular the
native callback's thread ownership must still be reconciled with Target's
MainActor ownership. Branch-order checks cover every route and cleanup after
subscription-removal failure without native input.


## Application attention native binding

The source setApplicationDesiresAttention wrapper at 0x10026d924 uses an
independent lazy, required SoftLink request, not one of the previously restored
primary WindowServer slots. ApplicationAttentionSPI now preserves the extracted
image list (30 encoded words), single symbol request (two words), original salt
and C ABI (ProcessSerialNumber pointer plus Bool -> Int32). Missing required
binding traps like the original; it does not silently substitute an AppKit
request-for-attention operation with different behavior.

The source controller passes false after successful process resolution and
ignores the setter status. Native binding invocation and controller-side process
resolution still require validation/integration; this new wrapper is not called
by production Target yet and no application attention was changed by this work.


## Controller attention clearing composition

ApplicationRegistrySPI.getProcessForPID at 0x10026d7f8 directly tails to the
public Carbon GetProcessForPID function. Reconstruction adds that call to the
existing Objective-C RunningProcess bridge alongside GetProcessPID, keeping the
original native API rather than replacing it with a TypeScript process model.
clearAppControllerAttention composes the callback policy: zero-initialize PSN,
attempt application AX pid, resolve PSN, and only on noErr set attention=false.
AX PID failures and PSN errors skip the setter; setter failures are ignored.

Injected checks cover PID failure, lookup failure, original zero-initialized
PSN, pointer output reuse, false attention value and ignored setter status.
The native composition is ready for the controller callback, but has not yet
been invoked on a user application or wired into production Target.


## Control Center window-created focus branch

The window-created callback's extra focus handling applies only to the exact
bundle ID com.apple.controlcenter. If its existing AX observer is present it
attempts uiElementDestroyed registration for the created window and ignores
registration failure. It then reads the created window's actualPID; a thrown
read becomes nil. Finally the existing focus enforcer, if present, starts menu
dismissal suppression using that optional PID. No observer or focus enforcer
is constructed by this branch, and a missing observer does not skip the PID read.

prepareAppControllerWindowCreatedFocus restores this sequencing with explicit
optional observer registration and an enforcer boundary. Checks cover exact
bundle matching, ignored subscription failure, missing observer and PID failure
continuing with nil. It is not invoked on the real Control Center by these checks;
production callback composition remains required.


## Concrete window/menu ownership composition

AppControllerWindows now composes the restored window-protocol existentials,
MouseWindowRegistry, separate menu state, initial primary/sheet traversal and
menu open/close operations. Ordinary window/sheet registration and pruning use rawWindowID. Explicit menu
registration uses the separate menu-resolved windowID path. Initial
sheet registration passes the previously resolved AX ID into the registry.
Menu open records/waits/registers before notifying ordering; menu close notifies
ordering, clears menu state and removes records matching the native AX element.
Observed-ID and ordering-menu effects are explicit injected owner callbacks.

Composition checks use complete window-protocol test conformers to verify
resolved registration keys versus raw pruning IDs, preserved stored keys,
matching-identity removal, per-removal ID publication, state clearing and native
ordering duplicate preservation. They send no UI input. The owner must still
serialize registry access: this class does not invent a dictionary lock or claim
that Target/MainActor and AX callback thread ownership are already reconciled.
Actual Target wiring and application clicking acceptance remain outstanding.


## Real window-record composition acceptance expansion (pending unlocked run)

The owned-window notification check now creates AppControllerWindows, constructs
and registers a real WindowUIElement from its owned callback element, then routes
windowMoved through dispatchAppControllerWindowEvent. It requires at least two
ID publications and exactly one nonzero native window ID. Registry access stays
on the single AX callback thread; the async test only reads separately locked
acceptance counters. Attention/focus effects are deliberately not exercised by
this notification/record acceptance case, and it is not production Target wiring.

Current preflight reports screenLocked=true and frontmostIsLoginWindow=true.
The expanded live check has therefore not been run successfully yet; earlier
AX-delivery success does not prove this new composition. The check now refuses
to launch its owned fixture when the desktop is locked. Compilation/component
verification can proceed independently while unlocked UI acceptance remains
pending. No user-app action or canceled operation was retried.


## Concrete AX event handler composition

AppControllerAXEventHandler now connects notification routing to
AppControllerWindows, native attention clearing, existing AX observer subscription
removal/Control Center registration and the existing SyntheticAppFocusEnforcer.
Menu open completes state/window/ordering preparation before reading menu actualPID
and starting suppression. Destruction and menu close stop existing suppression;
geometry/unknown events do not touch observer or focus-enforcer lookups.
Control Center observer lookup occurs only after exact bundle matching.

The handler receives resource lookup closures, so it uses current resources and
does not create or directly own observers/enforcers. Lookup closures must weakly
capture their controller when production ownership is connected.
Checks cover geometry publication, unknown-event no-op, destroyed-resource lookup
and menu-close resource sequencing with absent optional resources. They invoke no
native attention setter or UI input. Owner serialization, production Target wiring
and unlocked real composition acceptance remain outstanding.


## Native controller window-observation resource owner

AppControllerWindowObservation now composes NativeWindowOrderingObserver,
AppControllerWindows, AppControllerAXEventHandler and the concrete six-root-
notification AX observer. Initial window/sheet registration precedes AX monitor
construction, matching the recovered controller initializer. Native AX monitoring
starts during construction; activateOrdering is separate so callers can preserve
AX-enable-before-ordering-start semantics. Deactivation stops ordering without
inventing root-notification re-registration for each action.

Callback closures and event-handler observer lookup capture the observation
owner weakly. Window state callbacks retain the ordering observer, so deinit
explicitly stops it before stopping AX monitoring. This owner does not acquire
an accessibility assertion or create a focus enforcer; those remain controller
lifecycle responsibilities. The external enforcer lookup must capture its
controller weakly when integration is performed.

This is not yet connected to production Target. Native callback delivery remains
synchronous on the AX thread, while existing Target operations use MainActor.
That serialization boundary must be resolved before calling window dictionary
operations from both domains. The resource owner has only been compiled at this
stage; current locked-desktop state prevents live owner acceptance. Earlier
component/event-delivery tests do not prove the new combined owner.


## Ordinary registration versus explicit menu registration correction

Re-reading 0x100085730 confirms ordinary registration directly reads raw AX
windowID at 0x1000857b8. The separate menu helper at 0x1000858c0 calls the
concrete MenuUIElement.windowID. Pruning at 0x100085574 calls protocol witness
+16, the raw getter. AppControllerWindows now keeps ordinary register and private
registerMenu distinct instead of using the overridable windowID for both.
This fixes a composition discrepancy discovered before production integration.

Updated composition checks intentionally give ordinary test windows different
raw and overridden IDs and require registration to use raw IDs, including raw
zero followed by pruning. Menu-open still uses the concrete menu resolver for
both readiness and its separate registration path. Build/component/static checks
are required after this correction; locked live acceptance remains pending.


## Observation owner early-callback and release checks

The resource owner now exposes explicit construction seams for initial-window
setup and AX observer construction, while default construction retains the native
path. Checks inject only those boundaries, allocate a real unsubscribed AXObserver
for the helper's own process and deliver menuClosed from inside the factory,
before assignment of windowObserver. The handler is already installed: it clears
the seeded menu state and performs the optional focus lookup in order.

After the owner is released, its externally retained callback must not retain or
revive it and must not perform another focus lookup. The check also leaves the
native observer retained independently, demonstrating that it is the weak owner
boundary that prevents continued controller access. No AX subscription, monitoring,
UI event or attention change is involved. Native production construction and
MainActor integration remain separate acceptance requirements.


## Explicit owner-executor delivery boundary

The observation owner now accepts a deliverEvent boundary, defaulting to the
source synchronous call on the AX callback thread. An integration adapter may
supply its owner's serial executor (such as Target's MainActor queue) without
silently changing the native default. Both the retained native callback and
queued operation capture the observation owner weakly; queued work retains the
native event payload but must not keep a released controller alive.

Checks inject a controlled executor: a callback during construction queues work
without changing menu state, delivery after construction clears it, and owner
release before a later queued delivery skips all controller access. A separate
factory-throw case verifies error propagation, release of seeded window state
and inert retained callbacks after failed construction. These checks allocate
only an unsubscribed observer for the helper's own PID and send no UI input.

The boundary makes Target serialization explicit but does not itself wire Target.
Any production adapter must use the same executor for dictionary reads/writes
and event handling, preserve FIFO delivery, and document its scheduling difference
from the original synchronous native callback. Unlocked native owner/application
acceptance remains outstanding.


## Production Sky state activation omission fixed

Inspection of SkyAppState.get found a real entry-point difference: private
native bind already called Target.activateAccessibility before observations,
but the Sky/MCP path constructed/reused Target and went directly to capture.
SkyAppState.get now invokes the same idempotent AX enablement acquisition before
invalidation/capture. This happens after policy evaluation, application identity
resolution and accessibility/screen-capture permission checks, so it does not
move activation ahead of authorization or launch resolution.

Existing Target acquisition/refcount/ownership checks cover its idempotent
assertion lifetime and failure behavior; the Swift build verifies Sky composition.
The specific Sky/MCP live application path still requires unlocked end-to-end
acceptance. This omission could affect native interaction preparation but is not
proof that it caused every previously observed click failure. Production window
observation ownership remains to be integrated separately.


## Sky cached Target retirement after AX activation parity

Now that Sky state reads acquire AX enablement, cache retirement explicitly
calls deactivateAccessibility and invalidates input state before removing a
Target. This applies to explicit application start, terminated cached apps and
replacement after PID/launch identity changes. It preserves the existing policy,
launch and deadline ordering; it does not add an input retry.

Explicit deactivation matters when an in-flight observation still holds the old
Target across await: removing the cache reference alone would postpone ARC and
assertion release. Existing Target lifecycle checks verify deactivation releases
the assertion while the Target itself remains alive and is idempotent. The
retirement helper is a Sky adapter lifecycle correction; production window
observation ownership and live Sky application acceptance remain outstanding.


## Production Target observation ownership integration

Target now lazily prepares AppControllerWindowObservation before private bind and
Sky state activation. Preparation is idempotent, propagates construction failure
and stores only a successfully constructed owner. Sky caches newly created
Targets after preparation succeeds. AX activation then starts ordering (including
repeated activation calls); deactivation releases the AX assertion before stopping
ordering. The native root observer remains controller-owned until destruction.

Because Target is MainActor-isolated, its adapter explicitly delivers AX events
FIFO through DispatchQueue.main. Focus-enforcer lookups use MainActor.assumeIsolated
inside that delivered handler. This is a documented scheduling adaptation to the
existing adapter, not a claim that the original callback runs on MainActor; the
native owner's default synchronous AX-thread delivery remains unchanged. No extra
window dictionary lock was added. Initial registration occurs on Target's actor,
and subsequent event mutation uses the same serial domain.

Injected ownership checks cover failed preparation leaving nil, successful owner
reuse, retained ownership and release with Target. They create no subscriptions or
ordering task. Full production native subscription/order restoration and live Sky
application clicking have not been accepted on the locked desktop. Mouse target
selection still needs to consume the maintained window registry instead of its
older per-action AXWindows reconstruction; that is an outstanding integration step.


## Production coordinate mouse selection uses maintained window records

Coordinate mouse input now reads Target's maintained AppControllerWindows through
its original native stacking-order helper. It no longer rebuilds an AXWindows
map for each click or silently substitutes that array when observation ownership
is absent. Indexed input wraps the containing native window as WindowUIElement.
MouseEventTarget retains the WindowUIElementProtocol existential through target
resolution and synthetic activation preparation, including a MenuUIElement.

The native resolver dependencies are shared between the previous concrete test
entry and the protocol-window entry; the latter uses the raw window-ID witness
for routing. Menu-specific ID resolution still belongs to explicit menu window
registration. Geometry and activation-point accessors now live on the protocol
extension with the same provider/cache/error policies, so type preservation does
not introduce an extra UIElement reconstruction/cache read.

A mock-provider case passes a MenuUIElement through the concrete native resolver
in the Atlas no-hit branch, verifies original wrapper identity, raw dispatch ID
and cached bounds without native input. Existing source branch/window-selection
checks continue to cover ordering and PID routing. This production integration
still requires unlocked real click, background-window and Sky/DeepSeek acceptance;
previous fixture success predates the new maintained-registry selection path.


## Read-only native observer binding acceptance

`cua-helper --window-observer-binding-check` now resolves, without invoking,
WindowServer main connection, register/remove notification callbacks, window
subscription request and the application attention binding. All five resolved
successfully on the current machine, including while the desktop is locked.
The diagnostic returns only named availability booleans and a readOnly flag;
production required-binding failure behavior is unchanged.

This verifies runtime symbol resolution beyond pinned binary/static checks.
It does not verify callback ABI execution, real WindowServer notification
registration, ordering restoration or successful clicks. Those still require
unlocked owned-window acceptance. The attention request is resolved once and
shared by its typed callable and this diagnostic, with no setter invocation.
Build, provider composition checks and the static audit pass after the change.


## Full native window owner acceptance entry (2026-11-08, pending unlocked run)

The existing real AX delivery check can now opt into `--full-window-owner`.
It launches only its sibling owned fixture, waits for that child's AX windows,
constructs the actual AppControllerWindowObservation with its default native
observer factory and initial registry discovery, and uses Target's main-queue
serial delivery adapter. It requires an event to finish delivery, exactly one
nonzero initial native window ID retained after delivery, no reported discovery
errors, and owner release without a retain cycle. Fixture termination remains
in the existing cleanup path. No mouse/keyboard input or user application is used.

Ordering is intentionally not activated by this diagnostic; it does not prove
WindowServer notification registration, ordering restoration, Target activation,
Sky/MCP/DeepSeek execution or visible clicking. The original component delivery
check remains available without the new flag.

Command: `native/macos/.build/debug/cua-helper --ax-notification-delivery-check --full-window-owner --allow-owned-ui`.
Swift build and provider composition checks pass. Running this command on the
current locked desktop exits 1 before launching a fixture, explicitly reporting
that acceptance was not run. Full owner live acceptance is therefore pending,
not passed. This adds the missing runnable verification path without retrying
any canceled user operation.


## Concrete focused menu-bar item storage (2026-11-08)

The pinned source declares `_currentlyFocusedMenuBarItem` as a separately locked
`MenuBarItemUIElement?`, not `UIElement?` (initializer symbol 0x100047824).
MenuBarItem's exported AX/cache getters are 0x100724dac/0x100724db0;
its initializer shares 0x100724de0 -> 0x100721e3c with other native wrappers.
Static role initialization 0x1007229cc loads UIElementRole.menuBarItem at
0x1015cae90 and stores it in 0x1015ca7c8. The static audit now pins those role
address instructions in addition to the already pinned common constructor branch.

MenuBarItemUIElement now retains AX reference and transaction-aware UIElementCache,
conforms to the shared inherited UIElementProtocol, and declares .menuBarItem.
Production Target's observation owner and its full-owner acceptance entry now
specialize the focused slot with that concrete type. Generic component tests
remain generic. Provider checks verify transaction cache propagation, identity,
static role, slot storage and close clearing. Swift build, provider composition
checks and pinned static audit pass without real input.

This restores the controller storage type, not the entire MenuBarItem API:
items/copyItem/useSelectionForFindItem and the controller logic that discovers
and sets the focused menu-bar item still require separate source recovery.
No evidence ties this storage difference to the user's previous click failure.
The current locked desktop still prevents full-owner/live clicking acceptance.


## Menu-bar item child collection recovery (2026-11-08)

Static items getter 0x100722ae0 calls the shared UIElement child-array reader at
0x100724514, checks count and takes only the first direct child (0x100722bb0..bc4).
It then reads that child's AXChildren and decodes MenuItemUIElement arrays;
cached decode uses strict=false (0x100722c48), fresh decode strict=true
(0x100722d6c), with failures logged through UIElement's logger and empty output.
There is no sibling traversal, recursive search or role filtering after decode.

MenuItemUIElement's storage initializer shares 0x100721e3c; its static role
initializer 0x100721db8 loads .menuItem. The new Swift wrapper retains the AX
reference and provider/transaction cache, with shared inherited protocol behavior.
MenuBarItemUIElement.items now follows the recovered two-level lookup. The
existing collection decoder/reader is generalized over the output wrapper type;
UIElement callers keep their previous signatures and default target. CF kind
checks, cached empty hits, per-element compact mapping, strict outer conversion,
ignored AX statuses and failure reporting remain in the same shared functions.
First-level reporting uses MenuBarItem's logger; second-level reporting uses the
first child's UIElement logger as in the pinned instructions.

Transaction-backed checks cover duplicate child items, preserved output cache,
exact first-child selection despite a populated second sibling, empty first menu,
and absent menu. They use only cached synthetic AX references and send no input.
Static audit pins the first-child extraction, strict decode call and MenuItem role
initialization. This does not restore copyItem/useSelectionForFindItem or controller
focused-item discovery, nor prove real application clicking.

Swift build, provider composition checks and the pinned static audit pass after this recovery.


## Native copy-item selection recovery (2026-11-08)

MenuBarItem.copyItem getter 0x100723014 invokes items then helper 0x100723070.
The helper first scans direct items for exact cmdChar "C" and cmdModifiers 0;
it does not use lowercase matching, enabled state, title or recursive discovery
in this first pass. Only after no shortcut matches does it scan cached titles for
the first exact English "Copy". If that item's child items are empty, return the
item; otherwise recursively search those child items and immediately return that
result, including nil. Do not continue to later "Copy" siblings after recursion
fails. Evidence: uppercase compare 0x100723704, zero-modifier branch 0x1007239d4,
Copy literal 0x100723e94 and recursive call 0x100724020. All are now statically pinned.

MenuItem.items at 0x100721e50 tail-calls the same collection body as MenuBarItem,
so the recovered two-level lookup is now shared. MenuItem.cmdChar and cmdModifiers
use the existing cached-first, supported-attribute and strict uncached decoding
policy with String and Int respectively; failures report using MenuItem's logger.
The fallback title remains cache-only. No localized-title heuristics, traversal
caps or new fallback actions are added.

Injected checks verify shortcut precedence over an earlier English fallback,
first shortcut, uppercase/modifier requirements, missing modifiers, no match,
no traversal into an unrelated submenu, recursive Copy selection and immediate
nil from the first Copy submenu. Swift build, provider checks and static audit
pass. These are source/behavior tests without real input; application clicking,
focused-item discovery and useSelectionForFindItem are still incomplete.


## Use-selection-for-find lookup recovery (2026-11-08)

Getter 0x100724088 calls MenuBarItem.items, then scans only that direct array for
cached title equal to the exact English string "Use Selection for Find" at
0x101256ab0. It returns the first match. There is no cmdChar/modifier check,
localized-title matching, enabled-state read, fresh title query or submenu search.
The implementation now uses shared items and cached title getters with precisely
that selection. The static audit pins its call/literal setup and string comparison.

Transaction-backed checks invoke the actual getter and verify first match,
case-sensitive rejection followed by a later match, and nil for other/localized
titles. Swift build, provider checks and pinned static audit pass. These are
cache-backed checks without UI input.

Call-site inspection finds no production call to copyItem or
useSelectionForFindItem in the current helper yet. This restores the native
accessors, not their higher-level controller action integration. That integration
must follow source evidence rather than adding an arbitrary keyboard or menu
fallback. Focused-menu-item discovery and true Sky/MCP/DeepSeek app operations
remain incomplete; the new lookup does not establish that clicking is repaired.


## Native virtual cursor contract audit (2026-11-08)

Production mouseInput still passes cursorPress:nil. This is an explicit remaining
parity gap, separate from whether AX or CG input actually operates the app.
The pinned native VirtualCursor descriptor 0x1012cd810 has a class layout constraint
and four requirements: Bool isPressed getter/setter/modify and asynchronous
throwing press(count:). ComputerUseCursor's table 0x10146f030 maps these to
0x100093f18/0x100093f60/0x100093fac and async witness 0x10115f120; the modify
witness calls ComputerUseCursor.isPressed.modify at 0x100090be4.

The native Swift protocol and no-count convenience are now restored.
Convenience 0x1007c1cc4 loads witness slot +32 and delegates exactly once with
count=1. It obtains MainActor metadata/shared (stubs 0x101151050/0x101151044,
imports _$sScMMa / _$sScM6sharedScMvgZ) and resumes on that executor after await.
It adds no input events, timing, state reset, retry or error suppression.
Static audit pins descriptor requirements, witness entries and count dispatch.
Build and provider checks pass, including existential state access and thrown
press propagation without retry/state mutation by the convenience method.

This is not a visible cursor implementation or production integration.
Original ComputerUseCursor owns an AppKit Window, Style, motion configuration,
activity/fade state and async move/press methods. Its resource bundle contains
Assets.car rather than loose cursor PNGs; exact rendering asset choice still
requires recovery. No synthetic overlay or unrelated image was substituted.
Concrete drawing/animation/attachment, lifetime and click integration remain
outstanding. Desktop remains locked; no real input was attempted this turn.


## Default software cursor view and original asset recovery (2026-11-08)

Pinned Style.current global 0x101550720 initially references closure 0x10009b570,
which constructs SoftwareCursorStyle. This is evidence for the initial default;
Style.current is writable, so it does not prove no runtime override exists.
SoftwareCursorStyle.makeView 0x10009bf40 returns its cached NSImageView if present;
otherwise loads named SoftwareCursor from its module bundle, falls back to an
empty NSImage, sets image.size to 20x23 points, sets imageView.image and frame at
zero origin with that size, stores and returns the view. No new window or input
is created by makeView. The base Style.makeView traps as unimplemented; it is not
the default drawing implementation.

assetutil identifies SoftwareCursor in Package_ComputerUse.bundle Assets.car
(and the same rendition in Package_SlimCore), 200x230 RGB/sRGB with alpha.
The original was exported through Bundle.image(forResource:) and AppKit bitmap
PNG encoding without redraw or resize. The exported file and provenance metadata
are now owned build resources; runtime image loading uses Bundle.module and no
longer requires the installed vendor app for this component. Asset provenance
records catalog digest, exported SHA256, dimensions and pinned native build.

SoftwareCursorStyle currently restores the makeView portion only; base Style
properties, animation and window lifecycle are still missing. The view checks
verify actual resource decoding, 200x230 pixels, 20x23-point image/frame and view
identity reuse, without presenting any window. Static pins cover initial factory
and size instructions. This is not yet an on-screen cursor or click integration.

Swift build, provider/resource view checks and pinned static audit pass for this component.


## Native cursor style state/default recovery (2026-11-08)

Base Style's native storage is now shared with SoftwareCursorStyle: velocities
zero, isPressed=false, activityState=.idle, isAttached=true, Angle.zero,
scootStretchXScale=1, scootStretchScale=1, scootStretchPivotX=0.5 and zero
stretch/tilt angles. Source initializer 0x10009be9c zeroes the storage and loads
four doubles (0,1,1,0.5) from 0x10115bed0. ActivityState reflection descriptor
0x1013162e8 records idle/loading/paused. Writable current is a MainActor factory,
initially constructing a fresh software style; software getter also constructs
fresh instances. The recovery uses standalone Swift names for the native nested
Style/ActivityState until the full ComputerUseCursor owner is restored.

SoftwareCursorStyle overrides hotSpot with (4,4) exactly as 0x10009bf34 and
inherits stored style state. There are no SoftwareCursorStyle state overrides
that swap the image or apply an extra pressed-state transform. Such behavior is
not added speculatively. The native base hotSpot and makeView both trap with the
same "makeView has not been implemented" message; concrete software overrides
both. Source constants/hotspot are statically pinned.

Checks cover defaults, fresh software factory identity, replacing/restoring the
current factory, and the concrete hotspot alongside existing resource/view checks.
This recovers style storage, not animation, drawing of alternate Fog style,
window management, cursor positioning or live input integration.

Swift build, provider/resource view checks and static audit pass after style recovery.


## Cursor Window constructor evidence before implementation (2026-11-08)

Static constructor 0x1000940c0 initializes its animation/motion bookkeeping,
retains style/configuration, then calls NSWindow super with zero CGRect,
styleMask=0 (borderless), backing=2 (buffered), defer=true. It sets title
"Software Cursor", collectionBehavior raw 0x40048, isReleasedWhenClosed=false,
ignoresMouseEvents=true. It creates an NSViewController, asks the supplied style
for makeView, sets that view's wantsLayer=true, assigns controller.view and
window.contentViewController, sets clear background and delegate=self. Then it
subscribes through NSWorkspace.shared.notificationCenter, with object=nil.
The destructor removes that observer from the same workspace notification center.
The override constrainFrameRect:toScreen: at 0x1000946b0 is a single ret: no screen
clamping is performed. These constants and that override are now statically pinned.

No setLevel: or setOpaque: call exists in this constructor. A fixed floating
level or an invented opaque flag must not be added as if recovered here. Window
level reasons, active-space/occlusion callbacks and motion ownership require
separate recovery before the actual subclass is connected. The known configuration
is recorded here rather than shipping a partially subscribed window with guessed
callback behavior. No cursor window has been created or presented by this audit.


## Cursor corresponding-window eligibility recovery (2026-11-08)

Window callback helper 0x10009b03c reads optional correspondingWindowID
(field-offset symbol 0x1015507c8). Nil returns true without querying windows.
A present value calls NSWindow.windowNumbersWithOptions: with raw option 1,
then compares NSNumber.unsignedIntValue to the stored UInt32. Nil/empty list
or no match returns false; no special rejection of ID zero is present.
The current SDK NSWindow.h defines option 1 as AllApplications, while AllSpaces
is 1<<4. Thus this checks visible windows on the current space, not every space.

The native Swift composition now calls NSWindow.windowNumbers(options:
.allApplications), sharing an injected eligibility function that preserves
NSNumber unsigned conversion and nil short-circuit. Checks cover absent ID without
query, nil/empty/missing lists, match, zero and signed NSNumber conversion.
Static pins cover optional branch, option 1 and UInt32 comparison. This helper is
not yet connected to a concrete cursor window; callbacks, reset/animation and
level-reason behavior continue to require recovery. No on-screen cursor or UI
input is produced by these component checks.

Swift build, provider checks and pinned static audit pass for this helper.


## Cursor window visibility orchestration recovery (2026-11-08)

Helper 0x10009b1a8 first reads wantsToBeVisible, then (only when true) queries
corresponding-window presence. Either false path resets motion/visibility state
through 0x10009b30c before checking isVisible, then invokes superclass orderOut
only if currently visible. It does not query target IDs or overlay reasons there.
When allowed, it rereads correspondingWindowID: nil invokes orderFront(nil).
For a present ID, either of two stored overlay-level reason bytes also invokes
orderFront, with short-circuit evaluation. Otherwise it looks up the CGWindow,
sets its own level from the target's signed Int32 level if found, and always
orders above that ID (orderingMode=1), even if lookup yields no window.
The level field is verified by CGWindow.level getter 0x10025bcb4 (offset 0x28).

The injected Swift orchestration now preserves these exact branch/read/action
orders, without hardcoded floating level or retry. Tests cover both hide paths,
already-hidden state, nil target ID, each overlay reason with short-circuit,
known level and missing CGWindow level. Static audit pins wants/eligibility,
overlay branches and above-order arguments. The reset and superclass boundaries
are dependencies because concrete native window/animation ownership is not yet
restored. The helper has no production caller yet and does not display a window.

Swift build, provider checks and static audit pass after visibility orchestration recovery.


## Native motion-reset animation phase recovery (2026-11-08)

Animation.AnimationState descriptor 0x1012cd8a0 / field records 0x101324424
has cases ready, retargeted, running, ended in declaration order. Tag 3 checked
by native cursor reset is ended, not canceled. The Swift enum is now restored
in a separate native Animation target matching the source module boundary;
it adds no invented RawRepresentable contract or replacement animation engine.

Reset phase 0x10009b364..0x10009b468 stops a present motion-progress animation
immediately only if not ended, then clears ownership regardless. A present
position animation first has its update callback cleared (release, never invoke).
The controller then rereads its position animation because callback destruction
can change that slot; if the current animation exists and is not ended it is
stopped immediately, then ownership is always cleared. The injected Swift phase
preserves that reread and does not stop a captured old value after replacement.

Checks exercise all progress states, ended/nil position, unconditional slot clears
and replacement during callback clearing. Reflection case order, ended branch,
callback clear and slot reread are statically pinned. Full reset additionally
clears overlay reasons, resets scoot animations, drops interaction/completion
handlers, clears timing state and zeros velocity; those phases are not yet wired.
No concrete cursor window/animation resources are created by this component.

Swift build, provider checks and pinned static audit pass for the motion-reset phase.


## Cursor reset outer sequencing recovery (2026-11-08)

Native Window reset 0x10009b30c snapshots its two overlay-reason bytes, preserves
the first and clears the second. If the first was false and the second true,
setLevel(0) happens before animation reset. It then resets motion progress/position,
resets scoot animations, releases next-interaction handler, releases completion
handler, clears timing-satisfied state, and sets style velocityX then velocityY
to zero. Callback release is not callback invocation. Only when reason1 was true
does it reread wantsToBeVisible, then corresponding-window presence; both true
cause a visibility update. These are short-circuit reads after all reset phases.

The outer injected Swift sequencing now preserves the order and delegates the
previously recovered motion reset and still-pending scoot reset to explicit
boundaries. A second reset after reason1 clearing must not reset window level or
reenter visibility evaluation. Checks cover all combinations of reason flags,
wants/presence and a consecutive reset. Static audit pins reason preservation,
clear and final visibility gating. Concrete window, callbacks and native animation
ownership are still not connected; this is not production cursor availability.

Swift build, provider checks and pinned static audit pass after outer reset recovery.


## InterpolatableAnimation stop semantics recovery (2026-11-08)

Source stop(immediately:) 0x1007c606c has two branches. Immediate stop first
sets state to .ended using the original state setter (which runs its change
notification), then rereads the event handler. A present handler receives
.finished(currentValue); with no handler the current value is not read. There is
no existing-ended guard inside stop itself. Non-immediate stop reads current value
and retargets to that value; it does not immediately assign ended or call finished.

The Animation module now contains the recovered injected stop body and event
payload enum. Reflection descriptor 0x1012cdb98 / fields 0x1013245b8 records
valueChanged(oldValue:newValue:), finished(Value), retargeted(fromValue:toValue:).
Standalone event naming is temporary until the generic native owner is restored.
State setter and retarget remain explicit boundaries; their full algorithms are
not replaced by invented timer or spring implementations.

Checks exercise handler replacement during state change, state-before-callback
ordering, lazy value access with nil handler, and non-immediate retarget-only
behavior. Static pins cover event case names and stop branches. This also supports
the earlier source finding that reset must clear position's handler before stop,
since immediate stop otherwise emits a finished event. Concrete animations and
production cursor integration remain outstanding.

Swift build, provider checks and pinned static audit pass for the stop semantics.


## Animation state setter/stop composition (2026-11-08)

Setter 0x1007c580c reads old state, writes the requested state unconditionally,
then invokes observer 0x1007c5f0c. The observer reads current state and exits if
equal to old; only changes reach the lazily initialized shared coordinator and
forward current state with the animation identity. The recovered injected setter
preserves write-before-notify and unchanged-state suppression. It does not infer
that .ended simply removes a timer: coordinator bookkeeping is a separate body.

A composition check joins the real restored setter and stop helpers. First
running->ended produces write/coordinator notification/finished; a second
ended->ended produces write/finished only. This guards against adding a blanket
ended guard to stop or emitting duplicate coordinator notifications. Other state
transitions also notify after storage reflects the new state. Static pins cover
the write and observer equality guard. Shared-coordinator initialization,
registration maps and native driver callbacks remain to be recovered; this helper
is not a fully implemented InterpolatableAnimation class or visible cursor.

Swift build, provider composition checks and pinned static audit pass after setter recovery.


## Coordinator transaction-completion state forwarding (2026-11-08)

Source coordinator helper 0x1007c8f68 reads an animation's UUID (metadata import
_$s10Foundation4UUIDVMa), looks up animationToTransactionID at offset 0x20,
then transactionCompletionHandlers at offset 0x28. Exported initialization
symbols confirm [UUID:UUID] and [UUID:(AnimationState)->Void]. Missing either
entry returns without cleanup. A found completion is retained, dictionary read
access ends, then callback receives the current state. Only afterward does
(state | 2) == 3 remove the completion: .retargeted and .ended, not .ready or
.running. It does not remove animationToTransactionID in this body.

The Animation module's injected forwarding preserves the UUID relationship,
callback-before-removal and no cleanup on missing handler. Reentrant callback
replacement is removed too on terminal state, matching the original fresh
post-callback dictionary mutation; no compare-and-remove identity check is added.
Tests cover all states, nil mapping, nil completion and replacement during the
callback. The static audit pins callback/terminal-branch ordering. Driver
registration/removal and the complete coordinator owner remain outstanding;
this routine must not be described as deregistering an animation driver.

Swift build, provider checks and pinned static audit pass for transaction completion forwarding.


## Coordinator driver-source removal sequencing (2026-11-08)

Exported remove(driverSource:) at 0x1007cadac uses the source object's identity
as driverHandlers key. Missing entry returns. A found handler is retained after
dictionary read access ends, then invalidated through 0x1007ca4dc. Only after
that callback returns does it remove the current entry by key, then release the
old retained handler and the removed entry in that order. It does not remove
first, hold a dictionary inout access during invalidation, or conditionally keep
a replacement installed by reentrant invalidation.

The injected Swift removal preserves ObjectIdentifier lookup, callback outside
dictionary access, fresh key removal and explicit lifetime ordering. A resource
check replaces the entry during invalidation and verifies old-handler release
occurs after removal but before replacement release. Missing source is a no-op.
Static pins cover invalidate-before-removal. Handler invalidation's full running
animation and driver cleanup is a separate body still being recovered; this
routine does not substitute for a complete coordinator or animation driver.

Swift build, provider lifetime/composition checks and pinned static audit pass for driver removal.


## Driver handler stop-all body and naming correction (2026-11-08)

Full body 0x1007ca4dc..<0x1007ca940 does not directly invalidate the driver or
invoke onInvalidation. It snapshots UUID keys of runningAnimations, then for each
key rereads the dictionary. A missing snapshotted key returns from the entire
operation, not continue. A found animation receives stop(immediately:true)
without an ended-state guard, then the current entry for that UUID is removed.
Stopping can replace that entry or remove another snapshot key; fresh removal
and early exit preserve those effects. Newly added keys are outside the snapshot.
Dictionary access ends before calling the animation. The snapshot/retained value
outlives each callback and removal; no sorting, deduplication or retries are added.

This body is now restored as the injected Animation helper. The previously named
removeAnimationDriver invalidate dependency is corrected to stopAnimations;
older incident paragraphs used "invalidation" as a provisional description of
this unnamed callee and must not be read as evidence for a direct driver API call.
Tests verify replacement removal, newly added keys remaining, and immediate
termination when another snapshotted key was removed during stop. Static pins
cover missing-key return and boolean true dispatch. Complete source driver
lifecycle, handler ownership and coordinator composition still remain unfinished.

Swift build, provider checks and pinned static audit pass for handler stop-all behavior.


## Native Animation protocol and update composition (2026-11-08)

Descriptor 0x1012cd860 has five requirements and permits value conformers:
UUID id, AnimationState state, stop(immediately:), reset(), performTick(with:).
InterpolatableAnimation witness entries 0x1014a03d8+8 map to UUID copy, state
read, stop at 0x1007c606c, reset's virtual slot and tick at 0x1007c61b8.
The no-argument stop extension 0x1007c1f04 forwards immediately=true.
The Swift protocol now preserves this contract without an AnyObject constraint.

AnimationUpdate descriptor 0x1012cd958 / fields 0x1013244dc defines timestamp,
duration, targetTimestamp (Double). The three-value initializer preserves inputs;
the two-value initializer computes targetTimestamp=timestamp+duration, and
targetRunningTime(from:) returns nil for absent start, otherwise target-start.
No zero clamping or finite-value validation is introduced. Arithmetic is pinned
at 0x1007c2b90/0x1007c2ba8.

The handler stop-all loop now has a concrete existential protocol composition
that invokes stop(immediately:true). A contract fixture runs tick, stop convenience,
reset and registry draining through the actual restored protocol, checking identity,
state, update payload and registry removal. Its animation implementation is a
fixture; the generic InterpolatableAnimation engine is still incomplete. DriverSource,
coordinator ownership, timing/physics and the production cursor window remain open.

Swift build, provider protocol/composition checks and pinned static audit pass.


## Reset witness and native reset body confirmation (2026-11-08)

The previous protocol reset mapping is now confirmed by class metadata rather
than the remaining-method inference: class vtable header 0x1012cda80 has offset
19 words and 34 methods; reset descriptor 0x1012cdb70 is index 29, giving slot
(19+29)*8 = 0x180 used by the protocol witness. Its relative implementation
points to exported reset 0x1007c5b14. All are statically pinned.

That body clears the optional startTime (metadata field-offset word 18), then
tail-calls the common state setter with .ready. Descriptor fields are id, _value,
_targetValue, eventHandler, state, _initialValue, startTime; vector base word 12
plus index 6 confirms the startTime slot. Reset does not change current/target/
initial value or clear eventHandler here. The recovered reset helper is now used
in the existing native Animation protocol fixture with the real state setter;
checks verify the coordinator observes ready only after startTime is nil and
existing tick evidence remains untouched. The fixture remains a fixture,
not the complete generic InterpolatableAnimation engine.

Swift build, provider protocol/composition checks and pinned static audit pass after reset recovery.


## Tick entry and natural completion sequencing (2026-11-08)

performTick 0x1007c61b8 reads state once. Every state except running calls the
initialization virtual method with update.timestamp, including an explicit tick
on ended. It then always uses the common setter for running and invokes the
interpolation kernel with the full AnimationUpdate. A projected value goes through
the value-change path; nil enters natural completion 0x1007c5bbc. No ended guard,
frame-count cap or invented interpolation kernel is added by the recovered entry.

Natural completion first applies projected target through the value-change path
(closure 0x1007c78b4 -> 0x1007c6374, which reads $targetValue). It then rereads the
handler; if present, reads current targetValue and emits finished. Only afterward
is state set to ended. This differs from immediate stop, which sets ended before
finished. Reentrant value/handler changes therefore require fresh handler/target
reads. No-handler completion skips the final target read but still assigns ended.

The Animation module now restores both injected bodies. Checks cover all four
entry states with value/nil results, exact update forwarding, handler replacement,
late target read and callback-before-ended. The native Animation protocol fixture
now calls the restored tick entry instead of merely recording a tick. It still
uses a fixture interpolation result: SIMD conversion, physics and the concrete
InterpolatableAnimation owner remain outstanding. Static pins cover tick branches
and natural-completion state order; production cursor/input is not enabled yet.

Swift build, provider flow/composition checks and pinned static audit pass for tick/finish recovery.


## Shared animation value-change wrapper recovery (2026-11-08)

Body 0x1007c591c reads old value, runs the supplied nonthrowing mutation, then
reads new value, regardless of event handler availability. Only afterward does
it obtain the current handler. With a handler it evaluates Equatable.== using
new first / old second (import _$sSQ2eeoiySbx_xtFZTj); equal values suppress the
event. Unequal values emit valueChanged(oldValue:newValue:). No handler means
no equality evaluation, but mutation and both value reads still occur. No !=
overload, reference-identity comparison or numeric tolerance is substituted.

This common body is now restored in Animation. It is consumed by the native
protocol fixture's tick apply-value boundary, so a nil handler still updates
its value. Checks record read/mutate/handler/equality/callback order, handler
replacement during mutation, unchanged value and nil-handler equality suppression,
including new-before-old operands. Source instructions are statically pinned.
Concrete SIMD storage and value-wrapper initialization remain unimplemented;
this does not enable the production cursor or establish app clicking success.

Swift build, provider value-flow/composition checks and pinned static audit pass.


## Native driver base/source contract and actual clock boundary (2026-11-08)

AnimationDriverSource descriptor 0x1012cdec0 is class-constrained with one
makeAnimationDriver()->AnimationDriver requirement. Native NSView/NSWindow/
NSScreen witnesses call a common factory at 0x1007d7de0; the NSWindow closure
uses AppKit displayLinkWithTarget:selector:, not a synthetic periodic timer.
This confirms the system display-link boundary for subsequent restoration.

The Animation module now defines the source protocol and native AnimationDriver
base. Its descriptor has no superclass reference: this is a plain Swift class,
not an NSObject subclass. Source base stores optional @MainActor @Sendable frameCallback and mutable
isActive=false. Its start/stop method descriptors 0x1012cdea8/0x1012cdeb0 both
point to a single ret at 0x100009888: they do not change isActive, create a timer
or clear callback. Concrete DisplayLinkAnimationDriver overrides provide scheduling.
The base is therefore not presented as an active clock. Its ownership/defaults,
factory result identity, manual MainActor frame payload delivery and unchanged
base start/stop behavior are checked without a display link or UI window.

Initial-value investigation also confirms the start routine stores startTime,
reads current value and writes _initialValue via metadata field word 17 (0x88),
using SIMDValue rather than replacing the current value. That storage path still
requires the SIMD wrapper recovery. Neither this driver contract nor the partial
start evidence enables production cursor movement; concrete display-link lifetime,
coordinator and cursor ownership remain pending.

Swift build, provider driver-contract checks and pinned static audit pass after base/source recovery.


## Concrete AppKit display-link driver and partial live acceptance (2026-11-08)

DisplayLinkAnimationDriver now owns a real CADisplayLink constructed with its
selector target. NSWindow, NSView and NSScreen implement the recovered factory
contract through their system displayLink(target:selector:) API. The public Swift
factory closure is a reconstruction seam for the source's private generic factory;
AppKit adapters require MainActor explicitly rather than dispatching silently.
Start (0x1007d790c) checks inactive, sets active and adds to RunLoop.current in
common mode. Stop (0x1007d757c) checks active, clears active then invalidates;
it retains the invalidated link and does not recreate one on later start.
Deinit asserts MainActor and invalidates only when active, as the native body.
Frame delivery (0x1007d79c4) checks callback first, then reads link.timestamp,
duration and targetTimestamp directly. It adds no separate isActive guard,
retiming, frame filtering or timer fallback. Static guards/common-mode are pinned.

New CLI `cua-helper --display-link-lifecycle-check` creates no window or input.
It creates a screen-based link, calls start twice and stop twice, pumps the current
RunLoop for bounded acceptance, checks post-stop silence and verifies driver release.
The current real result is:
`{"finiteFrameReceived":false,"frames":0,"mainRunLoop":true,"mainThread":true,"noWindowsOrInput":true,"startStopReleasePassed":true}`.
The command exits 1 because real frame delivery is not accepted. Resources did
activate, stop and release; callbacks produced zero frames. Desktop is locked,
but this observation alone does not establish that lock caused the zero frames.
No user application was touched or canceled action retried. The diagnostic reports
resources and frame availability separately so this cannot become a false pass.
Concrete interpolation/coordinator ownership and production cursor remain unfinished.

Swift build, provider regression checks and pinned static audit pass; native frame acceptance remains incomplete as reported.


## Authorization chronology correction from the actual Multica run (2026-11-08)

User clarification: authorization was canceled because preceding operations had
already failed to visibly act. Re-read local run ending e4781aae (2026-11-07
11:09:29 UTC); do not publish the runtime log or user app content.
At 11:10:01.034 a click(42) request began; both subsequent approvals were accept,
and its tool result reported no error at 11:10:06.410. Further accepted indexed
and coordinate click attempts returned observations with the same Inbox heading.
Those results prove calls/approvals and repeated observations, not event delivery
or successful navigation. At 11:11:29.709, only the later step 18 approval was
cancel. Its subsequent denial explains that step alone; it cannot explain the
preceding accepted calls with no visible navigation. Earlier initialization also
reported AX -25204 and a screenshot/state race, which are separate observations.
Keep the unresolved incident classified as accepted actions without verified UI
effect. Do not retry the canceled step. Production window targeting, focus and
native event delivery still need current-build acceptance; cursor animation unit
checks are not evidence of click success.


### Current execution-path revalidation after chronology correction

Re-ran the current helper provider-click composition checks and pinned native
mouse-dispatch static audit: both exit 0. Read-only CuaFixture desktop-session
check still reports screenLocked=true and frontmostIsLoginWindow=true; no input
was attempted. Inspected production dispatchNativeEvent: timestamps are refreshed
immediately before CGEvent.postToPid. That API has no delivery acknowledgement;
a returned `outcome: dispatched` establishes posting, not receipt by the target
application. Indexed AX action return likewise does not establish UI navigation.
The current test passes therefore do not close this incident. Next live acceptance
must use the current maintained-window-registry build against owned foreground
and background fixture cases and verify fixture-received input plus changed state,
then separately verify the full MCP/agent application path.


## Independent AppKit clock control (2026-11-08)

Built scripts/display-link-system-control.swift independently of Animation and
CuaHelper. It uses an NSObject selector receiver and AppKit NSScreen displayLink,
common RunLoop mode, a bounded one-second wait, and creates no windows or input.
Both without and with NSApplication.finishLaunching() report frames=0,
main=true, maximumFPS=60 in the current locked session. Thus merely adding
finishLaunching does not fix frame delivery under these observed conditions;
zero frames also occurs without the reconstructed class. This does not prove
lock is the cause, nor establish that the driver is otherwise correct.
Static selector decoding additionally confirms original factory selector
`displayLinkDidFire` has no colon/sender argument. Pinned audit now checks the
selector string; the restored zero-argument callback matches it. Do not invent
an argument or a timer fallback as a presumed fix. Native frame acceptance and
production cursor/app click acceptance remain unresolved.


## Numeric protocol dependency restoration (2026-11-08)

Recovered Animation.ApproximatelyEquatable from descriptor 0x1012ce2f0:
Comparable inheritance, associated Epsilon:SIMDScalar, and the instance method
isAlmostEqual(to:tolerance:). Descriptor signature count is 2 and requirement
count is 4 (base conformance, associated conformance, associated type, method).
The native name record is Epsilon. Added the exact protocol contract without
invented default tolerance, scalar conformances, or a replacement physics kernel.
This is a dependency of native AnimatableScalar/AnimatableVector, which in turn
constrain SIMDRepresentable and SIMDValue storage. Those concrete dependencies
still require restoration before production InterpolatableAnimation ownership.
Swift build and pinned descriptor/selector audit pass. This protocol addition
alone neither produces cursor animation nor proves application clicking.


## Third-party animation candidate audit: Motion is not a drop-in (2026-11-08)

Checked upstream b3ll/Motion at c9a57f9d2b9d0a1e1b905753175e75a422d381d5,
Sources/Motion/Protocols/SIMDRepresentable.swift (retrieved through GitHub API;
git clone failed with HTTP2 framing error and is terminal).
Primary source: https://github.com/b3ll/Motion/blob/c9a57f9d2b9d0a1e1b905753175e75a422d381d5/Sources/Motion/Protocols/SIMDRepresentable.swift
Its protocol inherits Comparable, uses SupportedSIMD/SupportedScalar and maps
scalar Float/Double to two-lane SIMD. The pinned CUA protocol inherits Equatable,
uses AnimatableVector/AnimatableScalar and has a native Animation.SIMD1 scalar
representation. Thus matching SIMDRepresentable names do not justify importing
Motion as the original implementation. No dependency was added or source copied.
Potential common ancestry remains an inference, not established provenance.
Further descriptor recovery also finds SIMDRepresentable has six witness
requirements (base conformance, associated conformance/type, init, instance
conversion, static getter) and AnimatableScalar has twelve additional static
requirements beyond its six inherited conformances. Omitting those would create
an incompatible reconstruction; full numeric protocol recovery is still open.


## Double SIMD length witness restoration (2026-11-08)

Inspected Double:AnimatableScalar witness table 0x1014a1270 and its twelve
static-method entries. Confirmed concrete length and lengthSquared overloads,
rather than guessing transcendental functions from Motion's unrelated protocol.
Restored 2/3/4-lane overloads through system simd.length/length_squared and 8-lane
through the original pairwise two-lane reduction order (0+4, 2+6, then pairwise
sum, and sqrt only for length). SIMD does not expose an 8-lane length overload,
so this path keeps SIMD2 arithmetic rather than inventing scalar accumulation.
Pinned native length2 0x1007de868 and squared-length2 0x1007de948 instructions.
Checks cover known 2/3/4/8-dimensional norms, zero, NaN and the native unscaled
square reduction overflowing for very large inputs. Build and static audit pass.
Native larger-vector bodies explicitly narrow Double to Float/Float16 before
reductions; those overloads and the complete scalar/vector protocols remain
unrestored. No production cursor integration or live click claim follows.


## High-dimensional Double norms restored (2026-11-08)

Added the remaining Double 16/32-lane length and lengthSquared overloads.
Native 16-lane conversion at 0x1007de914 narrows to Float before squared
arithmetic, reduces four SIMD4 blocks in the observed grouping, and takes
Float sqrt before widening for length. Native 32-lane conversion at 0x1007ded6c
uses round-to-odd Double-to-Float followed by half conversion, preserving direct
Double-to-Float16 rounding. Restored Float16(Double) lanes then half-precision
SIMD8 operations and the source reduction order; sqrt remains half-precision
before widening. No overflow-safe/scaled norm or precision improvement was added.
Checks distinguish this from a generic Double norm: 16-lane Float square overflow,
32-lane half square overflow, sqrt(2) = 1.4140625 after half rounding, ordinary
all-one inputs, and NaN. Build, provider checks and pinned conversion/reduction
audit pass. Complete AnimatableScalar declaration and concrete conformances,
SIMDValue storage and the interpolation/cursor production path remain open.


## Float vector norm witnesses restored (2026-11-08)

Restored Float length/lengthSquared overloads for SIMD2/3/4/8/16/32. System SIMD
is reused for its exposed small-vector norms. Larger vectors retain the original
pairwise grouping. Unlike Double16, Float16-lane input needs no narrowing;
Float32-lane input narrows to half before multiplication, accumulation and sqrt,
then widens to Float. Static bodies 0x1007de398, 0x1007de41c and conversion
0x1007dedf0 support these paths. Checks cover ordinary norms, half overflow and
rounded sqrt(2), NaN, and unscaled Float overflow. Swift build and pinned audit
pass. This restores concrete operations, not yet the complete AnimatableScalar
protocol/conformances or the production interpolation/cursor chain.


## Numeric contracts and SIMD storage core (2026-11-08)

Recovered mutually constrained SIMDRepresentable, AnimatableVector and
AnimatableScalar declarations from the pinned descriptors. Representable inherits
Equatable, requires a self-representable SIMDType, init/conversion and static zero.
Scalar inherits six protocols and has twelve static norm methods. Vector inherits
ApproximatelyEquatable, SIMDRepresentable, SIMD and constrains Scalar; its two
methods are magnitude()/magnitudeSquared(), confirmed by SIMD2 witnesses
0x1007df9f8/0x1007dfa00 -> bodies 0x1007df998/0x1007df9c8, which dispatch scalar
witness offsets 0x38 and 0x60 respectively. No arbitrary extra same-type
constraint was added to Epsilon.

Added SIMDValue core property-wrapper storage: retain SIMD representation,
reconstruct wrapped values on get, convert wrapped assignments, direct projected
get/set, wrapped zero initialization and explicit simdValue initialization.
Native accessor bodies 0x1007e5038..0x1007e52f0 establish conversion/copy paths.
Concrete scalar/vector conformances (including native SIMD1) are not installed;
wrapper runtime acceptance, modify-accessor behavior, equality/comparable/codable
conformances remain pending. Build proves these generic contracts typecheck and
existing provider suite stays green; it does not prove live storage round trips
or production animation/cursor integration. Pinned protocol-layout audit passes.


## SIMDValue comparison layer (2026-11-08)

Native equality 0x1007e5640 explicitly reads left wrappedValue, then right
wrappedValue, then calls Value's Equatable witness. Conditional Comparable body
0x1007e5740 uses the same reconstruction order and Value's less-than witness.
Restored explicit implementations rather than synthesized equality over simdValue;
custom represented values need not share vector equality/ordering semantics.
Pinned all six native getter/comparison call destinations. Swift build, static
audit and existing provider checks pass. Since concrete numeric conformances
remain unfinished, this is compile/static validation only for the new generic
comparison paths; custom-value runtime round-trip/ordering acceptance is pending.
No change to application input success claims.


## SIMDValue single-value Codable (2026-11-08)

Decoded imported stubs in native init(from:) 0x1007e5850 and encode(to:)
0x1007e59ec. They are Decoder.singleValueContainer, generic container.decode,
Encoder.singleValueContainer, generic container.encode. Decode converts Value
through simdRepresentation; encode reconstructs wrappedValue, preserving Value's
serialization rather than inventing keyed SIMD storage. Added conditional Codable
requiring Value:Codable for both sides, matching native conditional descriptors;
no weaker independent Decodable-only or Encodable-only API was introduced.
Swift build, pinned import audit and existing provider suite pass. Concrete
wrapper JSON round-trip/error acceptance remains pending numeric conformances;
this is not claimed as end-to-end cursor or app-input validation.


## SIMD1 standard storage core (2026-11-08)

Restored native SIMD1<Scalar:SIMDScalar> using Scalar.SIMD2Storage, logical
scalarCount=1 and public storage access. Default initializer invokes standard
storage init; scalar initializer sets lane zero only. Native getter 0x1007e2e94
and setter 0x1007e3150 delegate to Swift.SIMDStorage subscript without introducing
a separate logical-count precondition. Therefore lane 1 remains storage-accessible
although indices exposes only 0. Reused standard Swift SIMD defaults for normal
SIMD behaviors rather than implementing arithmetic/hash/encoding from scratch.
Build, provider checks and pinned count/delegation audit pass. Runtime checks
cover initialization, mutation/modify, two-lane storage access, copy independence,
logical indices, and default logical equality. Native animation conformances,
approximate comparison and scalar adapters remain pending; no production cursor
or application-input success is established by these storage checks.


## SIMD1 magnitude and identity conversion (2026-11-08)

Recovered magnitude/magnitudeSquared bodies 0x1007e448c/0x1007e4574: read
storage lane zero, invoke Scalar Numeric.magnitude; squared result multiplies
that magnitude by itself. Decoded imported stubs as Numeric.magnitude and
Numeric.*. Restored these exact witness operations, not a two-lane vector norm
or a generic abs replacement. Also restored SIMDRepresentable identity conversion
for Self == SIMDType (native copy body 0x1007e4474 and identity initializer).
Build, pinned call audit and existing provider regression pass. New conditional
methods still require concrete AnimatableScalar conformances before runtime
acceptance; base SIMD1 storage acceptance from the previous section remains a
separate check. Production cursor and real application input remain incomplete.


## Native FloatingPoint approximate equality (2026-11-08)

Recovered generic isAlmostEqual(to:tolerance:) at 0x1007ec6b4 and nonfinite
rescaling at 0x1007ec958. Finite path compares abs(self-other) strictly below
max(abs(self),abs(other),leastNormalMagnitude)*tolerance. There is no added
finite-equality shortcut or tolerance validation. Nonfinite path rejects NaN,
compares two infinities by equality, swaps operands if only other is infinite,
and otherwise compares signed 2^greatestFiniteExponent to the finite operand
scaled by exponent -1. Pinned literal records and strict comparison calls.
Runtime checks cover strict threshold, zero/NaN tolerance, NaN, equal/opposite
infinities, max-finite/infinity symmetry, zero/infinity, subnormals, Float and
Float16. Swift build, provider suite and pinned audit pass. Scalar conformances
and production interpolation remain unfinished; these arithmetic checks do not
establish cursor or app-click acceptance.


## Vector comparison and first concrete SIMDValue acceptance (2026-11-08)

Recovered AnimatableVector.< as lane-wise less-than plus all-mask reduction.
Shared mask helper 0x1007e13a0 folds signed masks using generic max through
0x1007e175c/0x1007e18dc: true=-1, false=0, so any false makes the result false.
Approximate comparison 0x1007e03b0 forms delta, zero-delta, generic max of the
whole two vectors, then inclusive lane-wise <= against repeated tolerance and
all-mask reduction. This differs from the scalar relative test; keep whole-vector
Comparable.max rather than substituting per-lane abs. Full-vector mixed-sign
acceptance awaits multi-lane conformances, which are not yet restored.

Added Float/Double AnimatableScalar/SIMDRepresentable/ApproximatelyEquatable
conformances with native SIMD1 representations, and conditional SIMD1 animation
conformances. Existing norm overloads satisfy scalar static witnesses. Core
SIMDValue now has its first concrete runtime acceptance: Double wrapped/projected
mutations (including modify), zero, Comparable, JSON scalar encoding/decoding,
malformed-data error propagation. A custom normalized represented Value with
unequal stored vectors but equal reconstructed values confirms equality must use
wrappedValue. Also checked actual SIMD1 magnitude, inclusive vector tolerance,
strict ordering equality boundary and Float scalar conversion.
Swift build, provider suite and pinned vector-mask/comparison audit pass. Native
Float16 and multi-lane conformances, complete InterpolatableAnimation/coordinator,
real display-link frames and production cursor/app-input acceptance remain open.


## Multi-lane SIMD concrete acceptance (2026-11-08)

Added original conditional animation conformances for standard SIMD2/3/4/8/16/32
where Scalar:AnimatableScalar. Their magnitude and squared methods dispatch the
corresponding scalar norm witness; standard storage/arithmetic remains reused.
Runtime checks now exercise all six widths with Float/Double, all-lane strict
ordering (including equal and opposite-direction lanes), inclusive tolerance,
nonfinite delta behavior, projected vector mutation and vector SIMDValue JSON
round trip. Explicit mixed-sign tests retain the source whole-vector max:
(1,-100) versus zero at tolerance 1 returns false, reversed (-1,100) returns true.
The installed Swift max implementation chooses y when y>=x, and Comparable.>=
defaults to !(y<x); this explains the incomparable-vector tie behavior. It is not
replaced by per-lane abs or scalar relative comparison. This is reconstructed
behavior validated against recovered calls and standard-library source, not a
live execution of the vendor binary.
Swift build and provider checks pass. Float16 concrete conformance, CoreGraphics
adapters, complete InterpolatableAnimation/coordinator/driver ownership and cursor
production integration remain outstanding. No new user-app input was attempted.


## CoreGraphics coordinate representations (2026-11-08)

Restored CGFloat -> SIMD1<Double>, CGPoint/CGSize -> SIMD2<Double> and
CGRect -> SIMD4<Double> in native x,y,width,height order. Initializers preserve
negative sizes; no standardization or clipping is inserted. Original machine
shuffle bodies and source conformance descriptors support these mappings.
CGPoint.isAlmostEqual is scalar-relative comparison of x then y with short
circuiting, not its SIMD2 representation's vector absolute tolerance method.
No Comparable/ApproximatelyEquatable conformance was invented for point/size/rect.
Runtime checks cover signed coordinate/size round trips, lane order, CGPoint
SIMDValue projected mutation and JSON round trip, relative tolerance, zero
tolerance, and infinity. Swift build, provider suite and pinned shuffle audit
pass. This enables coordinate storage for subsequent interpolation recovery;
production cursor ownership, animation kernels and real app input still remain.


## Target mutation/retarget event composition (2026-11-08)

Recovered target setter 0x1007c6580: snapshot previous wrapped target, mutate
SIMDValue storage, then call observer 0x1007c5d3c outside storage access. Observer
first requires running state, compares previous==current (old operand first),
sets retargeted, then freshly reads handler and target for event(from:previous,
to:current). Nil handler skips final target read; unchanged/nonrunning targets
still get stored but do not notify. State notification may synchronously replace
handler/target; final event must observe those changes.
Added changeInterpolatableAnimationTarget helper preserving this ordering.
Composition checks use real SIMDValue<CGPoint>, cover all states, no-change and
reentrant target replacement. Build, provider suite and pinned call audit pass.
This recovers a concrete setter component; full InterpolatableAnimation storage
owner, initialization, kernel, coordinator integration and cursor use remain
unfinished. No claim of a production animation or app-click pass is made.


## Initial capture with real coordinate storage (2026-11-08)

Recovered start routine 0x1007c5b34: write startTime first, read wrapped current
value, write _initialValue through SIMDValue, with no event/state change inside
this routine. Added startInterpolatableAnimation preserving these boundaries.
Composed it with restored tick and real SIMDValue<CGPoint>: first tick captures
current/time, running ticks preserve initial/time, retargeted tick recaptures the
new current/time before state transitions to running. Checks verify observable
order and actual initial storage values. Kernel output in this check remains an
injected projection; it is not an implemented native interpolation kernel.
Swift build, provider checks and pinned getter/storage-call audit pass. Full
owner initialization, kernels, coordinator/driver lifetime and production cursor
remain unfinished; this composition test does not establish real app clicking.


## Bezier kernel timing and SIMD projection stages (2026-11-08)

Inspected native Bezier kernel 0x1007c307c. It saves AnimationUpdate d2
(targetTimestamp), requires duration>0 (native traps otherwise), yields nil for
missing start/out-of-range elapsed, accepts elapsed==duration, normalizes by
duration and applies native lower/upper selection. This maps inf/inf ratio to
zero; no extra finite filter was introduced. Restored bezierAnimationProgress.
Restored actual SIMD projection after the curve solve as separate subtract,
multiply and add stages. Kept curve solve/epsilon as explicitly unfinished,
rather than presenting an injected factor as a complete Bezier kernel.
Runtime checks cover start/mid/end/outside/nil/NaN timing, infinite-duration edge,
actual CGPoint and Float projection, and overflowing subtraction at factor zero
(no endpoint shortcut). Build, provider checks and pinned timing audit pass.
Native curve solve, complete animation owner and production cursor remain open.


## Bezier polynomial storage and evaluation (2026-11-08)

Recovered BezierFunction's ten fields from descriptor 0x1012ce070: x1,x2,y1,y2,
cx,cy,bx,by,ax,ay. Constructor 0x1007d7ecc computes c=3*p1,
b=3*(p2-p1)-c, a=1-c-b for both axes. Evaluation bodies 0x1007d83ac/
0x1007d851c use Horner order ((a*t+b)*t+c)*t. Added the actual generic struct
with immutable controls/coefficient storage and synthesized Hashable, retaining
unclamped/extrapolated t and control coordinates. Curve inversion and preset
constructors remain absent, explicitly not represented as a finished solver.
Independent Bernstein-form checks cover interior points, endpoints, extrapolation,
Float identity-axis symmetry and NaN. Build, provider suite and native field-layout
audit pass. Full solver/epsilon and production animation integration remain open.


## Bezier inverse parameter solver (2026-11-08)

Recovered shared solveForT at 0x1007d8be4, selected by x/y adapters
0x1007d8bbc/0x1007d8bd0. Start t at input; up to eight Newton attempts test
strict absolute residual against epsilon, break below derivative magnitude 1e-6,
otherwise subtract residual/slope. Fallback resets t to input and bounds to 0/1,
returns bounds for outside inputs, then bisects using (upper-lower)*0.5+lower.
Native uses no extra epsilon validation or stagnation/iteration cap; none was
invented. Recovered derivative body 0x1007d868c confirms (3*a*t+2*b)*t+c.
Added x/y solveForT methods sharing this implementation. Positive-epsilon tests
verify inversion residuals across the interval, Float, and flat x=t^3 requiring
derivative-threshold fallback. Build, provider suite and pinned count/threshold
audit pass. Deliberately did not execute zero-epsilon potentially nonterminating
cases. solve(x/y) composition, preset curves, kernel epsilon and complete native
animation/cursor integration remain open.


## Real Bezier curve-to-projection composition (2026-11-08)

Recovered solve(x) as solveForT(x) followed by evaluateCurveY, and solve(y) as
solveForT(y) followed by evaluateCurveX (0x1007d832c/0x1007d92f8 adapters).
Preset bodies 0x1007d96b0..0x1007d996c use y1=0,y2=1 and x pairs linear(0,1),
easeIn(.42,1), easeOut(0,.58), easeInOut(.42,.58); pinned both stored constants.
Kernel epsilon helper 0x1007c3920 converts fixed 0.0001 to the scalar type,
independent of duration. Added interpolateBezierAnimationValue composing actual
target-time progress, scalar curve solve with that epsilon and SIMD projection.
No injected curve result is used in these new tests.
Checks exercise known easeIn midpoint, inverse y mapping, 21 real coordinate
samples with endpoints/monotonic progression, and nil after duration. Timestamp
and duration in update intentionally differ from targetTimestamp to detect wrong
clock-field use. Swift build, provider suite and fixed-constant audit pass.
Complete BezierAnimation/InterpolatableAnimation owners, coordinator/driver
lifetime, real clock delivery and production cursor/app-input validation remain
unfinished; numerical kernel composition alone does not prove visible movement.


## BezierParameters configuration storage (2026-11-08)

Recovered configuration descriptors 0x1012ce0ac/0x1012ce0c8 and constructors
0x1007dae28/0x1007dae6c. Added immutable curve/duration storage and Curve cases
custom(BezierFunction<Double>), linear, easeIn, easeOut, easeInOut in native order.
Both constructors preserve duration unchanged; positivity enforcement remains
at interpolation, not silently inserted in configuration initialization.
The custom initializer selects the custom enum payload. Hashable follows native
conformances. Build, existing provider suite and field/case-layout audit pass.
Native debugDescription/SwiftUI adapter, generic custom-curve conversion and
complete animation owner construction are still pending; configuration storage
alone is not claimed as an accepted animation lifecycle.


## Configuration-to-generic-curve resolution (2026-11-08)

Recovered constructor helper 0x1007c2c6c. It resolves a Double curve, reads four
control coordinates, converts each to the animation vector's scalar type via
four FloatingPoint conversion calls, then invokes BezierFunction.init again.
It does not copy/narrow the cached six Double coefficients. Duration is stored
unchanged afterward. Added resolveBezierAnimationParameters as an explicit
reconstruction entry returning the resolved curve/duration; this tuple is a seam,
not a claim that the vendor exposes this API or stores the same public type.
Checks cover custom Double->Float recomputation, all four preset configurations
through actual interpolation, and unchanged negative duration before kernel
validation. Build, provider suite and pinned conversion/constructor-call audit
pass. Full animation storage ownership, native coordinator/clock wiring and
production cursor/application-click acceptance remain pending.


## Base owner lifecycle audit before concrete class recovery (2026-11-08)

Read all 34 InterpolatableAnimation method descriptors at 0x1012cda88. The
last two slots are concrete defaults, not abstract traps: slot32 -> 0x1007c6408
returns false (completion predicate), slot33 -> 0x1007c6410 constructs nil for
the SIMD projection optional. Source base therefore must not be given invented
linear interpolation or fatalError bodies merely to make the class compile.
Base deinit 0x1007c4ec8 destroys UUID, value/target SIMDValue, eventHandler and
initial SIMDValue storage; it does not call stop, emit finished, or register a
coordinator cleanup. ARC handles those resources without a synthetic stop.
Pinned default method targets/false body in audit; audit passes. This removes
an incorrect abstract-class assumption from the recovery plan. Full state-setter
coordinator linkage and owner initialization still need source-backed composition
before the concrete owner is ready. No runtime production behavior changed.


## Native driver frame algorithm (2026-11-08)

Recovered weak frame callback 0x1007c9f38 and handler body 0x1007c9fb4. Decoded
Objective-C selectors as CATransaction begin/setDisableActions:/commit. Frame
snapshots animation values, not keys; already-ended objects are removed by ID
without ticking, others tick then are removed if ended. Mutations do not add
new objects to that frame's snapshot or prevent an already-snapshotted removed
object from ticking. After transaction commit, read live registry emptiness;
if empty stop driver, then freshly read/invoke onInvalidation (so stop may replace
it). No active-state guard or extra one-shot invalidation flag is present.
Added performAnimationDriverFrame using actual CATransaction suppression and
restored Animation protocol. Checks cover ended-before/after tick cleanup,
stop-before-fresh-invalidation order, snapshot removal/addition reentrancy and
nonempty driver preservation. Build, provider suite and selector audit pass.
Driver handler ownership/registration and its weak callback wiring are not yet
implemented; these manually supplied-frame checks do not establish real display
frames, cursor movement or production app-input success.


## Driver activation and weak-frame callback (2026-11-08)

Traced callback thunk 0x1007cbd34 -> weak-owner dispatch 0x1007c9f38 and found
installation in registration tail 0x1007c94bc..0x1007c9568, not the handler
constructor. It first reads driver.isActive; active skips registry lookup. If
inactive but empty, no binding/start. Otherwise it installs a weak handler
callback before calling driver.start. Capturing a strong owner here would leak
handler -> driver -> callback -> handler. Native handler deinit 0x1007ca944
only releases driver/onInvalidation/registry, with no added stop or callback clear.
Added activateAnimationDriver with original guards and weak lifetime semantics.
Checks verify empty skip, callback-before-start, active short circuit (including
no callback replacement), live frame forwarding, owner release and safe late
callback after release. Build, provider suite and pinned activation-tail audit
pass. Handler storage/registration and coordinator owner still pending; manual
frame forwarding is not acceptance of real display-link frames or app input.


## Non-delayed animation registration branch (2026-11-08)

Read registration 0x1007c91c4 and immediate branch 0x1007c93cc..0x1007c94bc.
Ended animation removes its UUID key; ready/retargeted/running insert or replace
the animation at its own UUID. Both branches then enter guarded activation.
No reset, stop, tick or automatic state normalization is performed at this point.
Added registerImmediateAnimation with those operations outside dictionary access
closures, allowing shared owner composition later. Checks cover all four states,
replacement/removal and activation observing the updated registry; prohibited
reset/stop/tick calls fail the test. Build, provider suite and pinned branch audit
pass. Positive Duration selects an asynchronous task before this branch; its
sleep/cancellation behavior has not been recovered and is not approximated here.
Full handler/coordinator storage wiring and real frame/input acceptance remain
unfinished.


## Delayed registration resume semantics (2026-11-08)

Recovered sleep continuation 0x1007c96c8 and main-actor resume 0x1007c9764.
Error branch releases the error then switches through 0x1007cbfc8, which directly
branches to the SAME resume body. Therefore sleep errors are discarded, not an
unconditional early return. Resume loads weak handler first, then checks
Task.isCancelled, then calls registration with Duration.zero. Released handler
or actual cancellation skips registration. Do not conflate thrown CancellationError
with the task's cancellation flag or invent a retained owner across sleep.
Added resumeDelayedAnimationRegistration with injected sleeper/weak loader;
task creation and clock binding remain outside this recovered component.
Checks cover success/zero delay, non-cancellation error continuing, genuinely
cancelled child task skipping registration, and owner release during sleep.
Build, provider suite and pinned error-alias/cancel/zero-delay audit pass.
Full scheduled-task construction and concrete handler/coordinator storage remain
pending; this test does not establish system-frame or app-input acceptance.


### Continuous clock delayed-registration task (2026-11-08)

Resolved native stubs 0x1011524fc to ContinuousClock metadata and
0x1011533d8 to Clock.continuous. Async record 0x101197218 points to
0x1007cafa0. The restored scheduling entry now creates an unstructured
MainActor task, weakly captures its owner, retains the animation and sleeps
on ContinuousClock before the already-restored error/cancellation continuation.
It stores no task handle and returns registration with zero delay.
A real one-millisecond clock check verifies asynchronous registration, elapsed
clock duration, animation identity and zero-delay forwarding. Swift build,
provider checks and pinned mouse audit pass. This component has not yet been
connected to a concrete production animation handler; it does not establish
visible cursor animation or successful app clicks. Read-only desktop check
still reports screenLocked=true, so no actual user-app click was attempted.


### Concrete animation driver-handler ownership (2026-11-08)

Added AnimationCoordinator.AnimationDriverHandler with the three native fields:
driver, onInvalidation and runningAnimations. Native ivar symbols identify all
three; deinit 0x1007ca944 releases exactly these fields without stop/clear calls.
The owner now composes recovered registration 0x1007c91c4, activation tail
0x1007c94bc, frame loop 0x1007c9fb4 and stop loop 0x1007ca4dc. Positive
registration delay uses the continuous-clock weak-owner task; other delays use
the immediate branch. Frame callback holds the handler weakly. Registry values
and keys are snapshotted only in the respective recovered loops, preserving
reentrant callbacks and fresh invalidation lookup.

The outer coordinator remains incomplete: no shared singleton, driver-source
lookup or transaction maps are claimed here. The handler is not yet wired into
production cursor motion. Ownership checks cover multiple animation ticks,
ended pruning, immediate stop, restart, invalidation after stop, and release
without synthetic stop or late callback activity. Real app click and display
frame acceptance remain separate outstanding work.

Validation: Swift build and provider composition checks passed, including the
new concrete handler ownership checks; pinned native dispatch audit passed.
Changes remain local and no runtime logs or secrets were published.


### Interpolatable animation owner restoration in progress (2026-11-08)

Added the seven-field generic owner and connected recovered start/reset/tick,
value-change wrapper, retarget, natural finish and immediate/non-immediate stop.
The base interpolation returns nil as in 0x1007c6410. Coordinator shared storage
and synchronous completion forwarding now exist, but transaction registration
and driver-source lookup remain missing. The restoredValue initializer is an
explicit reconstruction seam for native inline subclass field initialization,
not a claimed recovered public base initializer. Calls that change animation
state must execute on MainActor, preserving synchronous notification order.

Projected-target behavior was initially suspected to be incomplete. Direct
follow-up disassembly disproved that suspicion: the native projected setter
also bypasses the wrapped property observer. See the correction below.
The new owner is not production cursor integration. No real display frame or
application click success is inferred from its lifecycle checks.

Validation: Swift build, concrete Double owner lifecycle checks and existing
provider checks passed; pinned native dispatch audit passed. Tests verify
retarget recaptures current value/time, value/target/finish event ordering,
reset retaining current value, and nil base interpolation reaching completion.
Projected-target parity remains explicitly incomplete. Changes are local.


### Projected target observer correction (2026-11-08)

Read $targetValue.setter 0x1007c54f0, its dispatch helper 0x1007c54fc and
storage body 0x1007c6910..0x1007c69e8. The body copies the SIMD vector,
gets backing storage, calls SIMDValue.projectedValue.setter at 0x1007c69c8,
ends access and returns. It does not call the wrapped-target observer.
Thus synthesizing projected writes that bypass targetValue.didSet matches
this source behavior. Do not add retarget notifications to that path.
The prior report of a projected-target parity gap is withdrawn.
Tests now contrast projected assignment and lane modification (state remains
running, no event) with wrapped assignment (retargeted, one event).
Pinned branch targets and storage-body return bytes are audited.

Validation: Swift build, projected assignment/lane modification versus wrapped
assignment checks, full provider suite and pinned static audit passed. No live
app click was performed and this is not a click-success acceptance result.


### Concrete Bezier animation owner (2026-11-08)

Read constructor 0x1007c2f1c -> 0x1007c3ab0. It resolves scalar curve/duration
at 0x1007c3b2c, then initializes inherited storage via 0x1007c6754.
That base initializer zero-initializes wrappers and then sets current value and
initial value from the initial argument (0x1007c6808/0x1007c6810), followed by
target (0x1007c6818). Corrected restored base initialValue, previously left zero,
to retain the supplied initial value before the first tick.

Added BezierAnimation<Value> with resolved scalar curve/duration and actual
interpolate override using the recovered timing/curve/SIMD kernel. Tests use
CGPoint state/events: midpoint, inclusive endpoint still running, later frame
finishing, exact final target, and completion callback before ended. Swift build,
provider checks and pinned constructor-call audit pass.

This restores constructor and frame interpolation, not every native subclass
method: parameter updates/retarget capability methods still require their own
source audit. Coordinator registration/transactions and production cursor remain
incomplete. No real display-link frame or app click success is claimed. Local
changes only; no runtime logs/secrets published.


### Descriptor-based Bezier parameter replacement (2026-11-08)

Field records 0x101324ac4 and 0x10132490c establish AnimationDescriptor cases
bezier/spring and SpringParameters fields response/dampingFraction. Added these
native data types with Hashable payloads. Spring response initializer stores its
arguments unchanged; stiffness initializer 0x1007dbcc0 computes 2*pi/sqrt(k)
for finite k and zero for nonfinite k, retaining negative/zero behavior. Presets,
duration/bounce conversion and Spring physics are not claimed restored.

Added descriptive restored updateParameters method: base 0x1007c6408 returns
false; Bezier body 0x1007c2f80 returns false for spring payload, otherwise
converts/resolves and replaces its scalar parameter tuple. It does not reset
startTime, state, current or initial values. Method spelling is a reconstruction
name because native implementation symbol is redacted. Parameter rejection and
replacement tests distinguish unchanged duration from changed interpolation.
This does not establish production cursor or app click behavior.

Validation: Swift build, provider suite (including descriptor rejection and
replacement, base false return and spring stiffness edge cases), and pinned
field-record audit passed. Changes remain local; full goal incomplete.


### Coordinator driver-source cache and removal (2026-11-08)

Read native registration segment 0x1007c8c68..0x1007c8dfc and invalidation
thunk 0x1007cbd28 -> 0x1007cad04. Cache hit reuses the handler; a miss invokes
the source factory, initializes driver/empty registry/nil invalidation, installs
invalidation, and stores the handler under ObjectIdentifier(source). The callback
weakly captures coordinator and strongly retains source. On invocation it removes
the current source key, without comparing handler identity or stopping animations.
Added descriptive extracted handler(for:) with these semantics and wired the
native remove(driverSource:) through the recovered stop-before-fresh-key-removal
helper. Renamed animation-to-transaction storage to its native field spelling.
Public coordinator construction is a test/restoration seam; native production
uses shared. Complete transaction-aware registration remains unimplemented.

Checks cover cache reuse, source separation, factory recreation after removal,
stop before removal, old invalidation removing a replacement, weak coordinator
lifetime and strong source lifetime. The source is retained by its callback,
not leaked by a permanent coordinator cycle. These are ownership tests and do
not establish real display frames, visible cursor or app click delivery.

Validation: Swift build and full provider suite passed with new cache/ownership
checks; pinned invalidation branch audit passed. All changes remain local.


### Native transaction storage and priorities (2026-11-08)

Read field record 0x101324b08: priority, delay, completion, id, driverSource,
descriptor. Constructor 0x1007eb58c creates UUID, uses unowned source initialization
at 0x1007eb618, stores supplied optional descriptor and priority/delay/completion.
Added Transaction struct with the same field ownership and mutability boundaries.
Priority constants at 0x1011987c8..0x1011987e0 are 250/500/750/1000, not ordinal
0..3. Priority comparison uses raw Int; no validation/clamping introduced.
Coordinator now holds its previously missing transactions array, giving four
native stored collections; transaction execution/selection/registration remains
pending. Transaction.perform and description adapters are not claimed restored.

Swift build, provider suite and pinned field/constant/unowned-init audit passed.
Tests check source identity while alive, UUID uniqueness and copy preservation,
value-copy mutations, completion callback and no source lifetime extension.
Tests deliberately do not access expired unowned storage. None establish actual
app input delivery or visible cursor; changes remain local.


### Transaction.perform and throwing stack behavior (2026-11-08)

Read 0x1007eb6a4 -> shared coordinator 0x1007caa1c. The coordinator stores
optional completion by transaction UUID, appends a transaction copy, invokes
the synchronous throwing body, and removes the live last transaction only on
success. Instruction 0x1007cac24 CBNZ x21 targets epilogue 0x1007cac84,
bypassing removal when Swift error register is populated. Restored this literal
behavior rather than adding defer cleanup. Consequently a caught inner error
can leave the inner transaction on stack; a successful outer body then pops
that live last entry, leaving the outer entry. This is source behavior, not a
recommended cleanup design. It remains relevant for transaction selection.

Added public Transaction.perform delegating to shared coordinator, plus the
recovered execution composition helper used by coordinator and bounded tests.
Build, provider suite and pinned error-branch audit pass. Tests cover return
values, nested successful stack order, propagated error, caught nested error
and actual public perform nesting. Complete animation registration/selection
remains pending; no app click, real display frame or visible cursor claim.
Changes remain local; logs and secrets were not published.


### Coordinator animation registration chain (2026-11-08)

Read registration 0x1007c89c8: accesses shared.transactions, copies last entry
using count-1 at 0x1007c8b6c, and checks explicit source before transaction
fallback. This method does not scan priority or apply descriptor parameters.
No source returns without handler creation. It resolves/caches handler, maps
animation UUID to last transaction UUID when present, and invokes handler
registration with the supplied delay at 0x1007c8f00. Added this actual register
entry, connecting transaction -> source cache -> handler -> state completion.

Build, provider suite and pinned last-index/source-branch audit pass. Integration
checks use shared coordinator with nested high-outer/low-inner transactions:
inner source wins, running/ended complete inner transaction, explicit source
wins while retaining outer completion mapping, and no-source registration leaves
animation ready. Callbacks are manually driven with a test driver, not a real
CADisplayLink. No native user app input, visible cursor, real frame or model-loop
acceptance is inferred. Descriptor-based factories/selection elsewhere, Spring
animation, cursor production integration and broader CUA scope remain pending.


### Observable wrapper initialization order (2026-11-08)

Re-read base storage initializer 0x1007c6754. Calls at 0x1007c679c,
0x1007c67b4 and 0x1007c67e8 initialize wrappers from Value.zero, then current,
initial and target assignments occur. Direct final-value wrapper initialization
omitted these conversions. Changed restoration to use declaration-synthesized
SIMDValue.init() followed by wrapped writes; target assignment uses the recovered
old-target snapshot path even though ready state suppresses retarget events.

A custom SIMDRepresentable records zero access, representation conversion and
wrapped reconstruction. Initial test failed because explicitly zeroing again
in the initializer duplicated the three declaration-synthesized initializations.
Removed the duplicate writes; exact trace now matches three zero conversions,
current/initial writes, old-target reconstruction and target write. Final Swift
build, full provider suite and pinned zero-initialization-call audit pass.
Read-only session check still screenLocked=true; no real app click attempted.
This is source-fidelity progress, not production click/cursor acceptance.


### Spring duration/bounce and presets (2026-11-08)

Read 0x1007dbbd8..0x1007dbd40 and duration initializer 0x1007dc264.
The duration initializer branches to smooth(duration:extraBounce:), then common
conversion 0x1007dbcf0. Response retains supplied duration. Bounce <= -1 yields
infinite damping; negative bounce yields 1/(1+bounce); zero yields one; positive
bounce yields 1-min(bounce,1), preserving NaN. No duration validation added.
Presets have response 0.5 and damping 1/0.85/0.7 for smooth/snappy/bouncy.
Parameterized snappy adds 0.15 to extraBounce and bouncy adds 0.3 before the same
conversion; smooth uses extraBounce directly.

Build, full provider suite and pinned conversion aliases passed. Checks cover
preset equivalence, negative duration, negative/zero/positive bounce boundaries,
NaN/infinities/signed zero and extraBounce offsets. These are native parameter
semantics; Spring simulation, native cursor integration and real app-click
acceptance remain incomplete. All changes remain local.


### Spring simulation identity and stiffness kernel (2026-11-08)

SpringAnimation descriptor 0x1012cdbd4 has one field simulation. Following
metadata accessor 0x1007e6c10 identifies Configuration descriptor 0x1012ce44c;
its parent 0x1012ce488 is VelocityVerletSimulation. Configuration field record
0x101324a78 contains response, stiffness, drag, dt, idleVelocityThreshold.
Constructor 0x1007e7b64 stores dt bits 0x3f71111111111111 (1/240 seconds).
Default threshold candidate 28800 is passed as a converted scalar; its final
selection is still being audited, so no threshold implementation is claimed.

Recovered helper 0x1007e8940: response > zero computes frequency = Scalar(2*pi)
/ response, then frequency*frequency; nonpositive/NaN response returns infinity.
Added scalar kernel and tests for exact normalized frequency, positive infinity,
nonpositive/NaN, overflow and Float conversion-before-arithmetic. Build, provider
suite and descriptor/name/numerator audit pass. Drag, integration steps, idle
criteria and complete simulation remain pending. Disassembler labels mentioning
unrelated RealModule symbols are not evidence of a dependency at that instruction;
no third-party arithmetic code was reimplemented on that basis.
No real app click/cursor/display-frame acceptance; changes remain local.


### Velocity Verlet drag coefficient (2026-11-08)

Read helper 0x1007e8b5c..0x1007e8d50. Dynamic import 0x101150408 is
FloatingPoint.squareRoot; 0x1011513c8 is Numeric multiplication. The function
roots its stiffness argument, multiplies by generic integer literal 2 (literal
record resolved from 0x1007e8cd4), then by dampingFraction. No clamp/finite test.
Added velocityVerletDrag with identical association and scalar precision.
Build, full provider suite and pinned sqrt/multiply/literal audit pass. Checks
cover finite result, negative damping, negative stiffness, infinity*zero NaN,
signed zero and Float arithmetic. Configuration assembly, simulation integration,
idle criteria and SpringAnimation are still outstanding; this helper alone does
not move a cursor or prove click delivery. All changes remain local.


### Velocity Verlet configuration assembly (2026-11-08)

Completed read through 0x1007e7e88. Constructor stores dt = 1/240 Double,
converts response and dampingFraction to Vector.Scalar, computes stiffness,
then invokes Swift.min(stiffness, Scalar(28800)) at 0x1007e7d68. Drag uses the
bounded stiffness at 0x1007e7d8c. Thus 28800 is a stiffness ceiling, not a default
idle threshold. Optional idleVelocityThreshold is copied if present; absent
value uses Double literal 0.06 at 0x1007e7dc8 before scalar conversion.
Added nested VelocityVerletSimulation.Configuration with these five fields and
order. Outer simulation state/integration is explicitly not yet implemented.

Build, full provider suite and pinned coefficient/min/drag/default-literal audit
pass. Tests cover normal coefficients, response nonpositive/NaN/overflow cap,
positive infinity yielding zero stiffness, explicit negative/NaN threshold retained,
and Float conversion. This config is not yet production SpringAnimation/cursor
integration and does not prove native app clicks or real display frames.
Changes remain local.


### Velocity Verlet state ownership/reset (2026-11-08)

Field record 0x101324a38 of descriptor 0x1012ce488 contains exactly
configuration, time, velocity, force. Memberwise initializer 0x1007e7eb4 copies
configuration, supplied Double time and two vectors. Reset 0x1007e7f84 writes
zero to velocity and force only, leaving time/configuration untouched. Added
these actual stored fields, initializer and reset. No position field introduced.

Build, provider suite and four-field descriptor audit pass. State tests verify
initial vectors/time, reset preserving config/time, value-copy independence,
configuration dt mutation and repeated reset preserving the changed dt.
Time advance function located at 0x1007e8048 calls step 0x1007e8d54; its full
loop and step integration remain next work. No SpringAnimation production input
or real display/cursor acceptance is inferred; changes remain local.


### Velocity Verlet time advancement (2026-11-08)

Read 0x1007e8048..0x1007e80f0. If target-time > 1, native stores target +
Double(bitPattern:0xbf91111111111111), i.e. target-1/60. It then steps while
time < target, reloads live dt after each physical step, and adds it to time.
The final step may overshoot target. Added this time loop with explicit injected
physical-step boundary; actual integration at 0x1007e8d54 is still pending.
No iteration cap or invalid-dt validation invented. Nonpositive/nonprogressing
dt can nonterminate in the original; bounded tests use positive progressing dt.

Build, provider suite and pinned step/backedge audit pass. Checks distinguish
exact-one-second gap from long-gap clamp, backward/equal targets, last-step
overshoot, live dt changes and NaN/infinite times without stepping. No actual
cursor motion, real display frame or application input acceptance is claimed.
Changes remain local.


### Velocity Verlet first half-kick stage (2026-11-08)

Read physical-step 0x1007e8d54, including generic SIMD lane loops. Resolved
SIMDStorage init/scalarCount/getter/setter imports rather than mistaking each
loop for a separate operation. Stage 0x1007e9404..0x1007e9758 loads Double dt,
multiplies by 0.5 in Double, converts to Scalar, multiplies force by broadcast
halfStep, then adds velocity. Added velocityVerletHalfKick preserving association.
Tests include a Float-range case where converting dt before halving would
spuriously overflow, as well as finite vector and infinity*zero behavior.
This is the first physical stage only; position update, recomputed force and
final velocity write are not yet connected to the real time loop.

Validation: Swift build, full provider suite and pinned scalar-conversion/
multiply/add-call audit passed. Local only; no real cursor/input acceptance.


### Velocity Verlet drift stage (2026-11-08)

Tracked full-dt conversion 0x1007e97b4, lane multiplication 0x1007e9934,
addition 0x1007e9a64 and position assignment 0x1007e9ad0. Native computes
position + halfStepVelocity * broadcast(Scalar(dt)) in that order. Position is
an external inout argument, not an additional simulation stored field. Added
velocityVerletDrift, preserving full-dt conversion and separate multiply/add.

Build, provider suite and pinned conversion/multiply/add audit pass. Checks
compose the restored half-kick with drift, verify dyadic no-force interval
composition and backwards displacement, and retain Float overflow/zero*infinity
NaN behavior. New force/final velocity stages and actual time-loop integration
are still pending; this helper is not production cursor or app click acceptance.
Changes remain local.


### Connected Velocity Verlet physical step (2026-11-08)

Tracked force stage 0x1007e9ad4..0x1007ea138 through generic lane loops.
Negation at 0x1007e9b10 applies to configuration.drag before broadcast; damping
multiplies the saved half-step velocity. Subtraction at 0x1007e9dc4 forms
target-position using external target and updated position; stiffness product
at 0x1007e9f98 precedes damping+spring addition 0x1007ea0bc. New force is
written back before force*half-dt (0x1007ea2cc) plus half-velocity (0x1007ea3ec).

Added force kernel and connected Simulation.step and advance to the restored
half-kick/drift/force/final-half-kick path. step does not advance stored time;
advance uses the recovered time loop. Build, provider suite and pinned operation
sequence audit pass. Integration tests independently compare an undamped scalar
oscillator embedded in SIMD2 against cosine over one second (fixed-step error
allowance), plus force arithmetic, equilibrium and first-step zero-force state.
This connects physical integration, but idle/logical completion, SpringAnimation
and production cursor remain pending. No real display frames or app-click success
are inferred. Local changes only.


### Spring logical completion is timing-based (2026-11-08)

Read public getter 0x1007c7988..0x1007c7b60. Missing startTime returns whether
state equals ended. Present startTime loads simulation.time, subtracts startTime
in Double, converts elapsed to vector Scalar, copies configuration.response,
and calls Comparable >= at 0x1007c7b3c. It does not inspect velocity, force,
position error or current state on this branch. Added recovered predicate.

Build, provider suite and pinned conversion/comparison audit pass. Checks cover
all nil-start states, inclusive response boundary, state independence with start,
NaN comparisons and Float rounding before comparison. This predicate is logical
completion, not physical idle detection. Simulation idle and SpringAnimation
ownership/render completion remain unfinished, as do production cursor and real
app input acceptance. Local changes only.


### Physical idle early motion gate (2026-11-08)

Read 0x1007e80f4 through the early exit 0x1007e84d4. Vector witness slot
+0x30 computes magnitudeSquared on velocity, then force. Swift.max import at
0x1007e847c selects motionSquared; threshold is multiplied by itself, and >
at 0x1007e84c8 returns false from the full idle predicate when exceeded.
Added this exact early gate and Simulation.exceedsMotionThreshold. A false
value here is not a full idle result: remaining position test still follows.

Build, provider suite and pinned max/multiply/comparison audit pass. Checks
cover Pythagorean norm, strict boundary, force independently exceeding threshold,
negative threshold squaring, and live simulation composition. Position portion
contains a 0.01 literal but its complete dataflow is not yet asserted; no guessed
position tolerance has been implemented. SpringAnimation and real app/cursor
acceptance remain pending. Local changes only.


### Complete physical idle position branch (2026-11-08)

Tracked stack operands through 0x1007e84d8..0x1007e8914 and caller
0x1007c83d4..0x1007c83e4 (updated value, target, simulation copy). Literal
0.01 is broadcast and multiplied by target. Separate subtraction forms target
minus updated position; its operand reload at 0x1007e86f4 must not be confused
with the earlier scaled-target temporary. Native computes scaled-target squared
magnitude, converts scalar representation, tests > zero, and only then rejects
when difference squared magnitude > that tolerance. Thus no absolute floor is
present: zero/NaN relative tolerance bypasses position rejection after the motion
gate passes. Added full predicate and Simulation.isIdle with this source behavior.
Tests explicitly retain zero-target and NaN comparison behavior; no hypothetical
numerical cleanup or generic distance<0.01 replacement was added.

Validation: Swift build, full provider suite and pinned position-literal/operation
audit pass. Tests cover near/far relative position, motion rejection at exact
target, zero/NaN edge behavior and actual simulation composition. SpringAnimation
owner and production cursor remain pending; no real display/input acceptance.


### Concrete SpringAnimation owner integration (2026-11-08)

Read constructor body 0x1007c85e0, start 0x1007c81ac, interpolate 0x1007c8270,
reset 0x1007c7f10, setSpring 0x1007c7fd0 and descriptor replacement branch.
Constructor builds Configuration then state(time:0, velocity:zero, force:zero),
then initializes base. Start writes simulation.time before inherited start.
Reset clears vectors before inherited reset. setSpring replaces configuration
while preserving idle threshold, time and vectors. Matching spring descriptor
updates parameters; other payload returns false. Interpolation copies current
and target projected vectors, advances to update.targetTimestamp, copies the
simulation for idle checking, and yields nil when idle (inherited finish then
applies exact target); otherwise returns advanced position.

Added SpringAnimation<Value> connecting these paths and timing-based logical
completion. Build, provider suite and pinned constructor/start/reset/frame call
audit pass. Bounded CGPoint regression produces multiple value changes, reaches
exact target and one finish event while state still running, then verifies ended,
logical completion, parameter-update preservation, reset and nil-start state.
No full native cursor owner or real display-link acceptance is implied. Production
cursor input path and real application click verification remain incomplete.
All changes remain local.


### Descriptor factory through driver completion (2026-11-08)

Read AnimationDescriptor.makeAnimation 0x1007ea778..0x1007ea928. Bezier
branch calls constructor 0x1007c3b78; spring branch constructs absent optional
idle threshold and calls 0x1007c8844. Added public makeAnimation(from:to:)
with matching concrete subclasses and forwarded initial/target values.

Build, full provider suite and pinned factory call audit pass. New integration
checks run BOTH descriptors through factory -> Transaction.perform -> shared
coordinator.register -> source/handler -> driver callback -> multiple animation
frames -> exact target and ended -> driver stop/invalidation. Both completion
streams are running, ended. Driver frames are explicitly manually supplied by
a test driver; real CADisplayLink frame delivery and native cursor window remain
separate unfinished acceptance. No actual app click or model-loop success inferred.
Local changes only.


### Production cursor animation ownership types (2026-11-08)

Located Cursor.Window nominal descriptor 0x1012bdb78 via __swift5_types rather
than treating ObjC ivar names as complete type information. Field record
0x10131631c has 22 stored fields. Decoded symbolic type references for six
animation fields: cursorMotionProgressAnimation, cursorScootBaseRotationAnimation,
cursorScootAxisAnimation, cursorScootStretchAnimation and cursorScootRotationAnimation
are Optional<SpringAnimation<CGFloat>>; cursorScootPositionAnimation is
Optional<SpringAnimation<CGPoint>>. All resolve indirect slot 0x101461638 to
SpringAnimation descriptor 0x1012cdbd4; CGPoint slot 0x101461958 resolves to
0x1012bceac; CGFloat slot 0x101468d88 imports its nominal descriptor.

Pinned this complete type-reference chain in static audit; it passes. This
changes production integration direction: retain concrete SpringAnimation owners,
not generic interpolation boxes or independent Bezier motion substitutes.
Updated CURRENT-ACCEPTANCE to reflect now-tested animation/coordinator objects,
while retaining missing production window, input and real frame acceptance.
No production cursor owner was added in this evidence-only turn; next work is
Window motion/configuration wiring with these verified concrete field types.


### Cursor motion configuration and live defaults (2026-11-08)

MotionConfiguration descriptor 0x1012bd97c uses field record 0x1013160b0 with
30 mutable fields. Constructor symbol identifies CGFloat versus Double and
candidateCount:Int. Live initializer 0x10008fac4 stores clickAngle -44 and
candidateCount 20, then copies contiguous constant data 0x10115bdf0..0x10115bed0
into remaining fields. Restored ComputerUseCursorMotionConfiguration with native
field order/types, Equatable and static live defaults. Includes original unusual
path constants without rounding or substituting Spring preset parameters.

Swift build, existing provider suite and pinned 28-Double constant-table/field
count audit pass. This is configuration data, not motion planning or a live
Window. Production cursor window, six animation owners, event callbacks and
Mouse binding remain incomplete; real input and display-frame acceptance not
claimed. All changes remain local.


### Cursor window designated initializer appearance phase (2026-11-08)

The exported ObjC initWithContentRect... at 0x10009b544 is an unimplemented
initializer trap, not the native construction path. ComputerUseCursor.init calls
private Window designated initializer 0x1000940c0. It invokes superclass init
with zero content rect, borderless mask, buffered backing and defer=true, then
sets title Software Cursor, collectionBehavior raw 0x40048, releasedWhenClosed
false, ignoresMouseEvents true, creates NSViewController, sets style.makeView()
wantsLayer true, attaches controller and clear background. Added recovered
appearance-phase function with this exact ordering. Delegate and workspace
notification setup follow and are not yet claimed implemented by this function.

Swift build and pinned appearance-selector audit pass. This reversible setup
function is not yet called by a production Window owner; no UI was shown and
no app input sent. Full window ownership/notifications, motion and Mouse binding
remain outstanding. Local changes only.


### Cursor window delegate/workspace observer ownership (2026-11-08)

Resolved selectors in designated initializer 0x1000943c8..0x100094448:
setDelegate:self, NSWorkspace.sharedWorkspace.notificationCenter,
addObserver:self selector:activeSpaceDidChange: name:NSWorkspaceActiveSpaceDidChange
object:nil. Native deinit 0x100094498 removes observer from the same workspace
center before super deinit, without additional delegate clearing/driver stop
in this phase. Added install/remove functions using these exact public AppKit
APIs; concrete callback selector remains supplied by the future Window owner.

Swift build and pinned selector/notification-symbol audit pass. This is not a
live subscription acceptance: no Window was instantiated or shown, and these
functions are not yet production-bound. Complete owner/callback wiring, motion
and Mouse integration remain outstanding; app click/display acceptance unproven.
Local changes only.


### Real AppKit observer delivery/removal check (2026-11-08)

Read-only desktop check remains locked. Added standalone owned offscreen
NSWindow regression scripts/check-cursor-window-notifications.swift, compiling
against the actual restored CursorWindowNotifications.swift functions. It creates
NSApplication with prohibited activation policy and an unshown borderless zero
rect test window, installs self delegate/workspace selector observer, posts the
workspace notification in-process, verifies exactly one callback, removes the
observer, posts again and verifies no additional callback. Window stays invisible
and is closed without ordering, activation or user input.

Compilation and execution passed. This upgrades notification delivery/removal
from static-only evidence to actual AppKit behavior with an owned test window.
It does not implement the original Window callback body or production cursor,
and does not prove any app click, real display frame or model-loop operation.
The temporary harness initially lacked MainActor isolation and failed compilation;
the persistent @MainActor main harness compiled and ran successfully. Local only.


### Actual AppKit appearance-phase verification (2026-11-08)

Extended the owned offscreen harness to compile the unchanged restored
CursorWindowAppearance.swift alongside CursorWindowNotifications.swift. A fixture
style supplies a stable NSView and records makeView calls; it intentionally does
not claim production SoftwareCursorStyle image rendering. Actual AppKit window
assertions pass: Software Cursor title, raw collection behavior 0x40048 retained,
releasedWhenClosed=false, ignoresMouseEvents=true, one style view creation,
layer-backed view/controller identity and clear background. Delegate plus actual
in-process notification delivery/removal still pass, window never becomes visible.

Reproduction:
`swiftc native/macos/Sources/CuaHelper/CursorWindowAppearance.swift native/macos/Sources/CuaHelper/CursorWindowNotifications.swift scripts/check-cursor-window-notifications.swift -o /tmp/cua-window-notification-check/check`
then `/tmp/cua-window-notification-check/check`.
Compilation/execution exit 0. This strengthens appearance/notification evidence;
it neither implements the full native Window owner nor demonstrates real display
frames, software cursor motion or user-app click delivery. No ordering, activation
or input occurred. All changes remain local.


### Typed cursor animation storage reset composition (2026-11-08)

Added extracted CursorWindowAnimationStorage protocol for six audited native
fields with concrete SpringAnimation<CGFloat>/SpringAnimation<CGPoint> types.
It introduces no alternate stored registry. resetMotionAnimations now binds the
existing recovered reset component to live owner fields and actual stop/event
behavior, preserving fresh reads after progress completion and position callback
release. The protocol is an extraction seam; concrete native Window is pending.

Swift build, full provider suite and pinned type/reset audit pass. New integration
check uses real SpringAnimation instances: progress.finished replaces position,
the replacement handler is cleared before stop, old position remains ready,
replacement ends, fields clear, and repeated reset emits nothing more. Other
scoot animation reset remains separate pending source recovery. No actual Window,
cursor motion, display frame or app input delivery is claimed. Local only.


### Scoot field reset initial interpretation — corrected below (2026-11-08)

Read reset-scoot helper 0x10009a280, four field-clear phases ending
0x10009a670. The initial reading incorrectly treated the initially loaded animation as the
stop destination. Follow-up inspection found explicit field reloads after handler
release in all four phases; the corrected implementation and audit follow below. Added per-field typed
stopAndClearCursorScootAnimation preserving this difference. It is not the full
reset-scoot function: source interleaves scalar/style restoration between fields,
so no guessed all-fields batch reset has been added.

Swift build, provider suite and pinned four immediate-stop calls pass. Real
SpringAnimation regression releases a captured probe while clearing handler;
probe replaces owner field. That original-ended/replacement-ready assertion encoded the incorrect reading;
it has been replaced by original-ready/replacement-ended as required by the
explicit native reload. Current field still clears and no old callback fires. Concrete Window/style sequencing
and production binding remain pending. No app input/display acceptance; local only.


### Correction: all four scoot phases reload after handler release (2026-11-08)

Full instruction review found ldr x20,[x19,index] at 0x10009a3e0, 0x10009a488,
0x10009a538 and 0x10009a614, immediately after releasing the original callback
and before checking animation state. The previous retained-original interpretation
was wrong. Corrected helper scopes handler clearing, then reloads the live field
and stops that replacement if present/non-ended, then clears live field. Test
now requires original.ready and replacement.ended after deinit-triggered replacement.
Pinned all four reload register operands in addition to the stop call targets.

Corrected Swift build, full provider suite and reload/static audit all pass.
No current production Window or user-app input acceptance is claimed.


### Interleaved scoot animation/scalar reset phase (2026-11-08)

Restored phase 0x10009a394..0x10009a670 as CursorScootResetStorage composition:
base-animation stop/clear then base offset=0; axis stop/clear then axis=0;
stretch stop/clear then X scale=1, scale=1, pivot read from live motionConfiguration;
rotation stop/clear then rotation offset=0. It deliberately does not batch all
stops before scalar writes or cache pivot before releasing stretch callback.
No new stored registry introduced; protocol is an extraction boundary for the
future concrete Window. Dirty-state preflight and Style-application phase still
surround this phase and remain pending, so this is not complete resetScoot.

Swift build, provider suite and existing pinned stop/reload audit pass. New real
Spring callback-release probes observe previous scalar resets and mutate pivot
configuration during stretch callback release; final pivot uses changed 0.8,
scales normalize and actual animations end/fields clear. No production Window,
visible cursor, real frames or app click delivery claimed. Local only.


### Scoot reset Style-dirty preflight (2026-11-08)

Read 0x10009a2b0..0x10009a390 and fallback 0x10009a830. Checks axis,
baseRotation, stretch, rotation animation presence in that order, then absolute
base/rotation offsets, deviations of two scales from one and pivot from current
configuration with strict >0.001. It does not check stored axis rotation in this
scalar preflight. Clean scalar branch compares Style.scootTiltAngle to Angle.zero
using SwiftUI Angle equality. The resulting flag gates Style writes after reset;
it does not skip animation/scalar cleanup. Added lazy typed preflight extension.

Swift build, provider suite and pinned epsilon/Angle equality call audit pass.
Checks cover clean/tilted style, ignored axis scalar, exact epsilon and nextUp,
and no tilt getter invocation when an earlier animation/scalar already requires
reset. Complete Style-write phase and concrete production Window remain pending;
no cursor display/input acceptance claimed. Local only.

### 用户补充与授权时间线复核（2026-11-08）

用户明确说明：因为此前一直没有实际操作效果，才拒绝后续授权以停止运行。重新读取 e4781aae 的原始 JSONL：step 6/7/8/10/12/13/15/16 的点击阶段均出现 accept；step 13 返回的 AXHeading 仍为“收件箱”；直到 step 18 的 2026-11-07T11:11:29.709Z 才首次出现 cancel。该取消只解释最后一次请求停止，不能解释此前获准点击无效。也不能仅凭 accept 或工具正常返回推定目标应用已收到并处理输入。后续验收必须分别记录授权、事件派发和目标状态变化；不重试被取消的请求。执行连接已验证，但不构成应用点击修复验收。

### Scoot 重置 Style 阶段接合（2026-11-08，本地）

静态读取原版 0x10009a688..0x10009a800 与 CGPoint.length 0x10025feb8：角度通过 sincos、平方和开方归一化、atan2、度/弧度转换重算，不能普遍简化为零（360° 输入会产生 -2π）。常量 0x10116b0e0/e8/f8 与长度操作分组已加入二进制审计。新增 CursorScootStyleResetStorage 将已有 preflight、动画字段清理和 Style 写入接合：preflight 为 false 仍清理字段；四个动画按原顺序清理；pivot 保留 stretch 阶段读取的值，防止 rotation handler 释放时改配置；后续每次 Style 写入重新读取当前 Style。补充样式 setter 更换 Style、干净 preflight 跳过写样式、角度绕回/NaN 的回归检查。

此接口仍是原版 Window 依赖的提取边界，生产 Cursor Window 尚未完整接入；本改动不证明真实点击有效，也不提供事件处理确认。最新点击排查仍需区分授权、派发和目标状态改变。

验证：Swift 构建通过（/tmp/cua-scoot-style-reset-build.log），provider-click-self-test 全套通过（/tmp/cua-scoot-style-reset-self-test.json），原版二进制静态审计通过（/tmp/cua-scoot-style-reset-audit.json）。未运行真实用户应用点击；不将这些结果作为生产点击验收。

### 原版 windowDidChangeScreen 回调（2026-11-08，本地）

静态复核 0x10009ae94：读取 window.screen；非 nil 直接返回；nil 分支记录日志后跳转到外层 reset 0x10009b30c。新增 CursorWindowScreenChange.swift 保留该判断，日志沿用本项目 core.cua 分类。二进制审计增加 screen selector、nil 分支和 reset 跳转地址验证。

扩展 scripts/check-cursor-window-notifications.swift：真实 NSWindow 子类实现 delegate 方法，通过受控 screen getter 分别验证 nil 时 reset 一次、关联实际 NSScreen 时不 reset。测试窗口未 order、未激活、未输入；此检查证明回调分支而非真实显示器变化通知交付，样式仍为 fixture。编译入口需同时包含 CursorWindowAppearance.swift、CursorWindowNotifications.swift、CursorWindowScreenChange.swift。

结果：离屏 AppKit 检查通过，Swift helper 构建通过（/tmp/cua-window-screen-change-build.log），静态审计通过（/tmp/cua-window-screen-change-audit.json），git diff --check 通过。当前桌面只读检查仍为 screenLocked=true/frontmostIsLoginWindow=true；没有真实应用点击验收，未证明先前无效点击根因。生产 Window owner 尚未完成，新增回调仍待该 owner 接入。目标保持未完成。

### 外层 Window reset 接合真实动画与字段（2026-11-08，本地）

读取原版字段 record 0x101316558 和 descriptor 0x1012be2cc，恢复 OverlayWindowLevelReasons 两个 Bool 字段名 appMonitor、petLaunch。原先 reason0/reason1 对应这两个字段，reset 只清 petLaunch。两个运动回调的 symbolic typeref 同为 0x10128bea4 的 yycSg，即 (() -> Void)?；已增加静态审计，避免以猜测类型接入。

新增 CursorWindowResetStorage：与现有 CursorScootStyleResetStorage、六个具体 SpringAnimation 字段共用同一个 owner，将 resetCursorWindow 外层流程接合至真实动画 stop、scoot Style 恢复、handler 释放、timing 标志清理、实时 style 速度清零以及 visibility 更新。没有引入重复动画注册表。新增组合回归：真实 progress SpringAnimation finished 回调、两个 closure 捕获对象释放的可观察顺序、petLaunch 清理、速度归零、重复 reset 无额外可见性更新。

验证：完整 Swift 构建通过（/tmp/cua-window-reset-storage-build.log）、provider-click-self-test 通过（/tmp/cua-window-reset-storage-self-test.json）、二进制静态审计通过（/tmp/cua-window-reset-storage-audit.json）。这证明提取边界下同一 owner 的组合流程；仍不等于已恢复生产 NSWindow 子类、AppMonitor、运动计划和实际光标显示，也不证明真实应用点击修复。所有改动保留本地，目标未完成。

### AppMonitor 元数据审计：不能把字段名称当作可恢复实现（2026-11-08）

本轮原计划以 AppMonitor 为生产窗口前置依赖。读取实际二进制后获得不同证据：Window.appMonitor 的类型 descriptor 为 0x1012be200，field record 0x1013164f4，七字段依次 application、axObserver、runningApplication、cursorWindow、activeObserver、appIsActive、menusOpen。cursorWindow 的 typeref 以 SgXw 结尾，表示 weak Optional；activeObserver 为 NSKeyValueObservation?（间接 descriptor slot 0x101462ef8 的导入符号证实），不能误写成 NotificationCenter token。

该构建的类 metadata 0x101550da8，0x88..0x118 共 19 个方法槽全部绑定 _swift_deletedMethodError，最后 0x120/0x128/0x130 三槽为零；对应 descriptor 方法相对入口也为零。objc class_ro 的 method list 为空。这证明这些元数据槽本身没有可翻译的方法体，不能凭字段名臆造完整监视逻辑，也不能把它当作已恢复代码。此证据不排除其他位置存在静态优化/内联路径，尚需沿 Window 实际赋值/使用点查证；不推断所有版本都禁用 AppMonitor。

新增以上字段顺序、deletedMethod 绑定、尾槽和 KVO 类型的机器审计；python3 scripts/audit-native-mouse-dispatch.py 通过（/tmp/cua-app-monitor-metadata-audit.json），git diff --check 通过。本轮未修改 Swift、未运行真实应用输入。后续顺序调整为先核对 Window 的实际 AppMonitor 使用点，再决定是否有原版可恢复行为，避免把未经证实的 AppMonitor 重写当作生产光标接入必需前置条件。生产点击问题仍未验收，完整目标未完成。

### AppMonitor 静态调用路径已找到，修正前轮推断边界（2026-11-08）

沿 Window.appMonitor ivar 0x1015507d0 的相邻 ADRP/LDR 引用扫描 __text，匹配三处：0x100093d70、0x1000940dc、0x100094610。逐处反汇编分别为 setCorrespondingApplication 的替换赋值、Window 初始化置 nil、字段析构释放。扫描只覆盖相邻 ADRP/LDR 形式，不作为完整无引用证明。

关键：setCorrespondingApplication 在 0x100093d6c **直接调用 0x10009c188**，返回值随后写入 Window.appMonitor。因此 AppMonitor 方法体确实存在；前轮发现的 deleted 动态方法槽不代表静态函数缺失。已修改审计注释，增加直接调用及字段赋值指令验证，避免把前轮未完成的静态追踪当作不存在实现的结论。

静态构造体 0x10009c188..0x10009c568 已完整保存至 /tmp/cua-app-monitor-implementation.asm（连同后续回调到 0x10009cd20）：
- NSRunningApplication(processIdentifier:) 若 nil，清理部分初始化对象并返回 nil。
- 保存 application 和 runningApplication，cursorWindow 使用 weak 引用。
- 构造 AXNotificationObserver，监听 focusedWindowChanged、menuOpened、menuClosed，qos 原值25。观察器构造失败的 error 被释放，继续保留 monitor；不把观察器失败写成整个构造失败。
- 创建 NSKeyValueObservation，options 原值1；随后显式读取当前 active 值并写 appIsActive（不能据此误用 .initial 取代显式初始化）。
- 若 cursorWindow 仍存在，初始 overlay 原因为 appIsActive || menusOpen > 0，通过 0x10009a880 更新。
- 0x10009a880 仅 appMonitor 原因变化时更新；与 petLaunch 合并管理层级，从没有任一原因到有原因时走 WindowServer 层级设置与 NSWindow level102，反向且 petLaunch=false 时恢复 level0，最后更新可见性。具体 SPI 及 callback 主线程调度仍需继续还原，不能仅用上面的摘要替代实现。

机器审计通过（/tmp/cua-app-monitor-static-calls-audit.json）。本轮的结果改变了下一步：恢复已有的静态构造/通知回调，而非创建假定缺失的 AppMonitor。未进行真实应用输入，目标仍未完成。

### AppMonitor overlay 切换与真实 SPI thunk（2026-11-08，本地）

新增 CursorWindowOverlay.swift：根据原版 0x10009a880，先比较旧 appMonitor reason，值相同则完全返回；变化时先写字段，再根据旧 appMonitor/petLaunch 判断首次提升或最终降级，最后 updateVisibility。petLaunch 存在时 appMonitor true/false 切换不抢夺层级所有权。补入 promoteCursorWindowOverlay(NSWindow)：正 windowNumber 时读取 CGWindowLevelForKey 原始 key15、调用 WindowServerSPI.setWindowLevel，忽略返回的 CGError，再设置 AppKit level102；非正 windowNumber 跳过 SPI 仍设置102；正值超出 UInt32 与原版一样陷阱，不静默截断。

WindowServerSPI 新增原版 0x10026ccf8 的 primary binding slot12（global 0x10155b570）包装，Swift 参数 level/window/connection 转为 C connection/window/level。未自行替换成公开 API；仍用已有 SoftLink 原版哈希符号解析。静态审计验证 thunk 的 slot、寄存器参数重排、原版 level key15/level102。

同一 owner 组合检查新增 overlay 首次提升、重复启用无副作用、petLaunch 持有期间 appMonitor 切换不降级、最终失去所有权降级的顺序验证。完整 Swift 构建、provider-click-self-test、二进制静态审计通过（/tmp/cua-overlay-build.log、/tmp/cua-overlay-self-test.json、/tmp/cua-overlay-audit.json）。这些检查没有调用真实 WindowServer setWindowLevel；promote 函数真实层级效果待生产 owner 与桌面验收。AppMonitor 的 AX/KVO 初始化、通知回调仍未完整恢复，点击问题仍未宣称解决。

### AppMonitor AX/KVO 事件体恢复（2026-11-08，本地）

新增 CursorAppMonitorEvents.swift，提取 0x10009e7f0 AX 通知体与 0x10009c9cc active 更新体；与生产 observer 注册及线程切换分开（后者尚未接入，不能宣称真实通知已可用）。CursorAppMonitorEventStorage 使用原始 appIsActive、menusOpen 和实时 cursorWindow；窗口协议对应真实的可见性、关联 ID 和 overlay 更新接口。

行为：focusedWindowChanged 先读取 primaryWindow 和 windowID；nil 或读取 error 时直接返回，保留旧关联；成功后才取 cursorWindow，且只有 isVisible 时写 wantsToBeVisible=true、对应窗口 ID，再 updateVisibility。menuOpened/Closed 分别用 Swift checked +1/-1，没有擅自把负数钳制为零；计数先写回，再按 appIsActive || menusOpen>0 更新实时窗口 overlay。未知通知不读取主窗口、不更新状态。active 变化先写 appIsActive，再向实时窗口更新 overlay。

组合检查覆盖菜单关闭先到导致负数、连续菜单/激活交错、未知事件、主窗口 nil/抛错保留旧值、不可见窗口不改变关联、可见窗口更新、weak 窗口释放后事件继续维护监视状态。静态审计固定 checked 算术指令、主窗口/窗口 ID 调用、isVisible selector 和 overlay/visibility 调用。完整 Swift 构建、provider-click-self-test、二进制审计通过（/tmp/cua-app-monitor-events-build.log、/tmp/cua-app-monitor-events-self-test.json、/tmp/cua-app-monitor-events-audit.json）。没有实际应用输入和真实 AX/KVO delivery 验收；生产 AppMonitor 的 observer 生命周期、MainActor hop 和 Window owner 仍待还原接入。

### 具体 CursorAppMonitor 生命周期接入（2026-11-08，本地）

新增 CursorAppMonitor.swift，使用实际 UIElement、NSRunningApplication、AXNotificationObserver 和 NSKeyValueObservation，七个字段对应原版。init 通过 NSRunningApplication(processIdentifier:) 判断存在，弱持有 cursorWindow；AX observer 监控 focusedWindowChanged/menuOpened/menuClosed，ignoringErrors=[]、qos.userInitiated（原值25）；try? 保留原版 AX 初始化失败仍继续 KVO 的行为。KVO options.new（原值1），注册后显式读取 isActive 初始化，不替换为 .initial。

回调先 weak-load self，再创建持有 self 的 MainActor Task；避免将 weak-load 延后到 actor hop 后改变生命周期。AX 事件接入既有 primaryWindowValue/AX windowID 读取和上一轮的事件体；KVO 新值为 nil 时落 false。deinit 顺序 stop AX monitoring，再 invalidate KVO。代码尚未被生产 Cursor Window 持有，尚未执行真实 AX/KVO delivery 和 teardown 验收；仅构建不能证明这些运行行为完成。

完整 Swift 构建通过（/tmp/cua-app-monitor-lifecycle-build.log），既有 provider-click-self-test 通过（/tmp/cua-app-monitor-lifecycle-self-test.json；覆盖事件体而非新构造器真实通知交付），静态审计通过（/tmp/cua-app-monitor-lifecycle-audit.json；新增空忽略列表、qos25、KVO options1、析构调用顺序）。生产光标 Window、移动与 press 对象接入及真实点击验收仍未完成。

### 具体 ComputerUseCursorWindow 与真实离屏检查（2026-11-08，本地）

新增 ComputerUseCursorWindow:NSWindow，承载原版22个字段，包括具体 SpringAnimation、CursorAppMonitor?、两个回调、Style、MotionConfiguration 与 overlay reasons。初始化按原版 zeroRect/borderless/buffered/defer=true，接入真实 SoftwareCursorStyle、外观配置、delegate、workspace activeSpace 通知。接合对应窗口存在性、真实 NativeWindowDescription.level、order(.above,relativeTo:)、AppMonitor overlay、外层 reset、screen-loss reset。静态复核 visibility 的 selector 为 orderFront:，因此使用 orderFront(nil)，不使用 orderFrontRegardless。constrainFrameRect 原版为直接 ret，保留传入 frame。

新增只读/离屏命令 cua-helper --cursor-window-owned-check：创建真实具体窗口与打包 SoftwareCursor 图像，核对字段初值和配置 pivot 覆盖；手工发布 workspace 通知后，真实 SpringAnimation 停止且速度清零；不存在PID的 CursorAppMonitor 构造返回nil。窗口从未 order/激活/发送输入。结果 /tmp/cua-concrete-window-owned-check.json：concreteCursorWindow、softwareCursorImage、workspaceNotificationReset、missingProcessMonitor=true；realApplicationClickVerified=false。windowReleasedImmediately=false：AppKit autorelease 生命周期尚未单独验收，不声称已释放或泄漏。

完整 Swift 构建、上述真实离屏检查、provider-click-self-test 和二进制静态审计通过（/tmp/cua-concrete-window-build.log、/tmp/cua-concrete-window-self-test.json、/tmp/cua-concrete-window-audit.json）。限制：此具体 owner 仍未安装到 Target 输入路径；运动计划/press 渲染/occlusion callback 未完整恢复；appMonitor 字段存在，但 setCorrespondingApplication 的创建替换路径仍待接入。真实应用点击和光标显示仍未验收，目标未完成。

### setCorrespondingApplication 入口接合（2026-11-08，本地）

完整反汇编 0x100093cd4..0x100093da4：先写 cursor owner 的 correspondingApplicationPID（包括 Optional.some 标记），保留当时的 window 作为最终 appMonitor 赋值目标；构造 ApplicationUIElement(pid:)，再次读 owner.window 作为新 monitor 的弱关联窗口；无论新 monitor 是否 nil，都写回之前保留的目标并释放旧 monitor。没有相同 PID 直接返回分支。

新增 CursorCorrespondingApplicationStorage 将此行为绑定实际 ComputerUseCursorWindow 与 CursorAppMonitor，避免把 correspondingApplicationPID 错存至 NSWindow 的22字段。ApplicationUIElement(pid:) 静态源 0x10071795c 调 AXUIElementCreateApplication，随后调用同一个 0x10076589c 缓存构造器；因此使用已恢复的 UIElement(element:) 构造相同 cache 边界，而非自己建立另一套缓存。

真实 owned window 检查增加一个 owner 调用这个入口，以不存在PID验证 PID保留、monitor=nil、窗口保持未显示；输出 correspondingApplicationEntry=true（/tmp/cua-corresponding-application-owned-check.json）。完整 Swift 构建与二进制审计通过（/tmp/cua-corresponding-application-build.log、/tmp/cua-corresponding-application-audit.json）。该项只验证构造失败路径；真实有效应用的 AX/KVO 交付、旧 monitor 替换释放仍须验收。完整 cursor owner 构造与移动/press 尚未恢复，Target 输入路径未安装这个对象，真实点击未验收。

### 真实 owned window / own-process AppMonitor 生命周期（2026-11-08）

将 --cursor-window-owned-check 置于显式 autoreleasepool，排空后检查 weak window=nil；随后再次发布 workspace 通知无悬挂回调崩溃。原先 windowReleasedImmediately=false 确认为此检查中 AppKit 延迟释放，不能作为泄漏结论；新输出 windowReleasedAfterAutoreleasePool=true。

增加通过 setCorrespondingApplication(pid:getpid()) 监控本 helper 进程：实际 CursorAppMonitor 构造成功，持有实际 NSKeyValueObservation，runningApplication PID 正确；随后绑定不存在PID替换清空 monitor，排空 autoreleasepool 后 weak monitor=nil。输出 ownProcessMonitorCreatedAndReleased=true。检查未 order窗口、未激活、未合成输入、未访问其他应用；不证明 AX 注册必定成功（原版容许失败）、真实通知交付或实际应用点击。

完整 Swift 构建与实际离屏检查通过（/tmp/cua-window-lifecycle-build.log、/tmp/cua-window-lifecycle-owned-check.json）。生产输入路径仍未安装具体光标 owner，运动/press/occlusion 仍需还原，目标未完成。

### 具体窗口遮挡回调恢复（2026-11-08，本地）

完整核对原版 0x10009ac00..0x10009ae88，新增 CursorWindowOcclusion.swift 并接入 ComputerUseCursorWindow.windowDidChangeOcclusionState。隐藏或 occlusionState 原值恰为2时只调用 Style hook；有 appMonitor/petLaunch overlay 或缺对应窗口 ID 时同样直接 hook。其他情况查询 NSWindow.windowNumbers(.allApplications) 的 NSNumber 编号列表，先找本窗口（保持每次比较重新读取 windowNumber），再找对应窗口；仅 ownIndex>=targetIndex 时恢复 wantsToBeVisible/对应ID 并 updateVisibility。所有退出路径最后重新读取当前 Style 执行 windowVisibilityDidChange。Style 原版默认实现0x100009888为ret，新增同名默认无操作方法。

回归覆盖两种窗口顺序、任一编号缺失、重复编号使用第一个匹配以及隐藏路径不触发后续查询；原版 selector/状态2/Style no-op/visibility调用已加入静态审计。完整 Swift 构建、provider-click-self-test、实际 owned window 生命周期检查及静态审计通过（/tmp/cua-window-occlusion-*.json/log）。更新 CURRENT-ACCEPTANCE 明确区分已恢复的具体窗口与尚缺的完整 cursor owner/运动/press/Mouse接入；不再笼统标为“没有具体窗口”。没有真实窗口遮挡通知交付或实际点击验收；目标仍未完成。

### 具体 cursor press(count:) 时序恢复（2026-11-08，本地）

完整静态追踪 0x1000912fc 的 async 状态机到按压循环：进入 MainActor 后只检查一次 window.isVisible；不可见直接返回（即使 count<0），可见负 count 陷阱，零次返回。每次读取实时 Style 设置 isPressed=true，先等待 cursorPressAnimationTime，再等待 defaultClickDuration，之后重新读取实时 Style 设置false；仅非最后一次按压再等待 cursorPressAnimationTime。前者原版 Duration 存储0x1011950d0为5e16 attoseconds，即50ms；后者本项目已恢复为50ms。

新增 animateCursorPress 与 SynthesizedEvent.cursorPressAnimationTime。注入 sleep/setter 只是提取边界，尚未安装至完整 ComputerUseCursor/VirtualCursor。状态机 sleep 失败直接传播error，先于后续false setter退出；没有自行新增defer复位改变原版错误路径。按压是样式状态而非 CGEvent 输入，不能用本项通过证明点击成功。

回归覆盖2次按压四次setter/五次等待、不可见负数、可见零次、取消传播及后续setter未执行；静态审计固定Duration存储、两个时长addressor与false setter。完整Swift构建、provider-click-self-test、静态审计通过（/tmp/cua-concrete-press-build.log、/tmp/cua-concrete-press-self-test.json、/tmp/cua-concrete-press-audit.json）。生产光标owner、移动和Mouse接入仍待完成，真实应用输入未验收。

### VirtualCursor 与实时 Style 按压属性接合（2026-11-08，本地）

反汇编 0x100090b50/getter 与 0x100090b98/setter：每次从 cursor owner.style 读取对象，分别调用 Style vtable 0xe0/0xe8，没有独立 isPressed owner 标记、相同值去重或窗口可见性条件。新增 StyledVirtualCursor 边界继承 VirtualCursor，要求真实 style/window 字段，默认属性直接委托 Style；默认 press(count:) 将上一轮时序接入实际 ContinuousClock.sleep。窗口自身仍不被错误地声明为 VirtualCursor。

真实 owned check 的 cursor owner 同时符合对应应用绑定和 StyledVirtualCursor，验证读写原 Style、替换 Style 后属性立即读取新对象。按压回归增加等待期间替换 Style：true写旧Style，后续false写新Style，旧Style维持true，与源代码实时字段语义一致；没有自行持有旧Style并在其上清理。此行为属于还原，不代表完整软件光标视觉动画已恢复。

完整 Swift 构建、provider-click-self-test、真实 owned window 检查与二进制getter/setter审计通过（/tmp/cua-styled-virtual-cursor-*）。仍缺完整 ComputerUseCursor 具体owner构造与环境注册、移动计划、生产Mouse接入及真实点击/可见光标验收；不得因接口和组合检查通过而标记总目标完成。

### cursor owner 的弱注册表（2026-11-08，本地）

核对原版初始化全局环境：0x100090468 经 NSHashTable.weakObjectsHashTable 构造；cursor init 0x100091114 调 addObject: 注册自身。新增 CursorOwnerRegistry<Owner> 保留 Foundation 弱哈希表语义，不使用强数组或额外按ID去重表；后续实际 ComputerUseCursor 将持有单个共享实例。该提取类本身尚不是生产共享 registry。

真实 owned check 增加注册同一 owner 两次只有一个成员，退出 autoreleasepool 后 owner weak=nil 且 registry.all 为空，验证注册表不延长对象生命周期。完整 Swift 构建、离屏真实对象检查和静态审计通过（/tmp/cua-cursor-owner-registry-build.log、/tmp/cua-cursor-owner-registry-owned-check.json、/tmp/cua-cursor-owner-registry-audit.json）。

另确认 cursor owner init 订阅的是 NotificationCenter.default、NSWindowDidMoveNotification、object=自己的 window、selector windowDidMove:；与 Window 本身的 NSWorkspace activeSpaceDidChange 订阅不同，不能沿用后一注册函数。owner deinit 从默认 center 移除自身。windowDidMove 回调体和完整 owner 仍待接合；真实点击路径没有安装该owner，目标未完成。

### owner windowDidMove 通知链路（2026-11-08，本地）

核对 ObjC wrapper0x100093e94实际调用体0x100093da4：先 weak-load delegate 并调用 witness+0x20，随后通过 NotificationCenter.default 发布 computerUseCursorLocationDidChange，object为cursor owner；此回调不读取窗口坐标，不应臆造一次几何更新。通知字符串来自0x100090060的初始化器。

新增 CursorOwnerNotifications.swift：按原版 default center、NSWindow.didMove、object=owner.window 注册selector，默认center移除observer，delegate之后发location通知。owned check中的NSObject cursor owner接合此注册/回调：手工发布窗口移动通知后观察到delegate→location notification顺序；移除订阅后再次发布不再调用；weak registry和排空后的owner/window/monitor释放检查保持通过。该检查不移动窗口，不证明真实物理移动通知交付，delegate使用提取回调边界而非宣称已恢复完整原版Delegate协议。

完整Swift构建、真实owned通知组合检查及二进制静态审计通过（/tmp/cua-owner-notification-build.log、/tmp/cua-owner-notification-owned-check.json、/tmp/cua-owner-notification-audit.json）。完整cursor owner、移动规划、生产Mouse接入与真实操作验收仍未完成。

### 具体 ComputerUseCursor owner 构造接合（2026-11-08，本地）

新增 ComputerUseCursor:NSObject，按原版8字段承载 delegate/targetWindowID/isMoving/shouldFadeOut/window/correspondingApplicationPID/style/activityState。初始化从 Style 读取初始activityState，再创建具体Window，super.init之后进入共享弱registry并注册自己的窗口移动通知。接入 StyledVirtualCursor 与对应应用绑定；activityState先写owner存储再转发Style，isAttached直接委托Style，与已核查属性路径一致。

Delegate 暂以 ComputerUseCursorMovementDelegate 提取已恢复的移动通知要求；原版Delegate metadata有4个要求，其余接口及原名尚待运动/附着路径恢复，**该接口不宣称完整源码等价**。移动、隐藏/淡出行为及原版所有API仍不完整，因此此具体owner尚未安装到Target生产Mouse路径。

真实owned检查新增实际ComputerUseCursor构造、静态all注册、8字段初值、activity/pressed/attached转发、真实default通知调用弱delegate、delegate释放以及autoreleasepool后owner释放/共享registry清空。完整Swift构建、owned运行检查、provider-click-self-test和静态字段顺序/Style setter审计通过（/tmp/cua-concrete-owner-*）。本项证明具体owner这些生命周期路径已接合，不证明可见移动、按压渲染或真实应用点击。目标未完成。

### owner/window 字段可变性校正（2026-11-08，本地）

重新读取Swift FieldRecord flags：cursor owner全部8字段均为0x2(IsVar)，Window22字段中仅motionConfiguration为0，其余为0x2。修正新装配对象：ComputerUseCursor.window改为var（此前误设let），ComputerUseCursorWindow.motionConfiguration改为let（此前误设var）。style保持var，原版允许运行期间替换；不能仅凭缺少导出setter误判为let。MotionConfiguration自身结构体字段可变与Window持有它为let是不同层级。

审计增加全部30个存储字段flags验证，固定此来源事实。Swift完整构建、真实owned生命周期检查、provider-click-self-test和静态审计通过（/tmp/cua-cursor-field-mutability-*）。此为存储语义校正，不构成实际输入修复；完整delegate/移动/生产Mouse接入及真实点击验收仍未完成。

### isVisible / hotspotScreenPoint 接合（2026-11-08，本地）

核对0x100090a2c与0x100090a54，ComputerUseCursor新增isVisible委托当前window，以及hotspotScreenPoint。后者先保留当前window；读取frame.origin、window.style.hotSpot.x、再次读取frame.height、再次读取window.style.hotSpot.y，然后转换AppKit点至CG点。不能使用owner.style替代window.style（二者字段可分别替换），也不能把不同次属性读取折叠为一次快照。

继续核对NSScreen.convertPointToCGCoordinates（0x10101dca4）：zeroScreen（0x100261878）取screens中第一个frame包含(0,0)的屏幕，而非NSScreen.main或frame.origin==zero；使用该屏frame.maxY翻转Y，缺屏以0翻转。新增CursorHotspotScreenPoint提取此数学与读取顺序并在具体owner接合。回归通过动态frame/hotspot值验证读取顺序、偏移屏幕maxY及缺屏回退；不是物理多屏验收。

完整Swift构建、provider-click-self-test、实际owned生命周期检查和静态调用审计通过（/tmp/cua-cursor-hotspot-*）。本轮补齐只读几何，不包含移动、显示或真实点击验收。生产Mouse仍未使用该cursor，目标未完成。

### owner show(aboveWindowID:) 接合（2026-11-08，本地）

确认 targetWindowID.setter 0x100090800 与 shouldFadeOut.setter 0x10009099c 都只写各自字段，没有隐藏/重置/窗口关联副作用。新增具体owner.show（0x100093008）：保留当前window，设置wantsToBeVisible=true与correspondingWindowID，调用updateVisibility，之后默认center发布位置通知，object=self。不写owner.targetWindowID，也不启用petLaunch/appMonitor；Window的另一show辅助体0x10009a950带petLaunch参数，不能将其行为混入此公开owner方法。

真实owned检查先确认UInt32.max窗口编号不存在，再调用show(aboveWindowID:.max)：实际窗口保持隐藏、意图为true、关联ID为max，owner.targetWindowID及overlay理由不变，位置通知仍发出一次。没有执行可见窗口order/输入。完整Swift构建、owned运行、provider-click-self-test、静态审计通过（/tmp/cua-cursor-show-*）。可见show及移动、淡出/隐藏、完整delegate、Mouse接入仍待完成；真实操作目标未达成。

### owner windowID / center / activity predicates（2026-11-08，本地）

新增windowID、center、isLoading、isPaused。windowID原版0x1000906d4先读windowNumber判断>=1，再重新读取并checked转UInt32；第一次非正返回nil，第二次值为0仍返回some(0)，不静默截断越界。center原版0x100090758先将window.frame通过zeroScreen.maxY转换，再调用CGRectGetMidX/MidY；矩形转换用原始size.height，保留符号/运算顺序。isLoading/isPaused读取owner.activityState标签1/2；直接修改Style.activityState不反向更新owner。

回归验证窗口编号重读和非正短路、偏移屏幕/缺屏中心点，实际owned owner验证Style与owner状态分离及setter转发。完整Swift构建、provider-click-self-test、owned运行检查、二进制审计通过（/tmp/cua-observed-state-*）。只读状态补齐不等于移动/点击链路验收；生产Mouse接入、移动/隐藏/淡出及完整delegate仍待完成。

### owner orderOut async 控制流提取（2026-11-08，本地）

静态追踪0x1000930dc：进入时捕获可见性用于日志，实际分支在等待delegate的第一个async requirement（witness+0x10）后重新读当前window.isVisible。两条分支都清wantsToBeVisible并reset当前window；可见分支await Window异步隐藏0x100095a6c，不可见分支直接super.orderOut(nil)。之后重新weak-load当前delegate，调用witness+0x18，再发布computerUseCursorDidHideNotification（不是location通知）。

新增orderOutCursor提取已确认的编排顺序，以hideAnimated依赖保留尚待还原的动画体；未把未完成淡出替换成直接隐藏，也未将此helper冒充完整owner.orderOut实现。回归使用真实Task.yield跨越await，验证delegate等待期间由不可见变可见会走动画分支，动画等待后使用替换的delegate；不可见分支仍prepare→immediate→delegate→notification。完整Swift构建、provider-click-self-test及静态分支/调用审计通过（/tmp/cua-order-out-flow-*）。Window异步隐藏的具体动画和完整delegate接口仍待恢复；目标未完成。

### Window 异步隐藏机制证据（2026-11-08）

继续沿0x100095a6c追到0x100095e2c：构造checked continuation（0x101152cb8实际导入withCheckedContinuation；0x101151ef0是OS版本检查，并非Task创建）。隐藏准备从contentViewController.view.layer安装/更新GraphicsSupport.LayerFilter.GaussianBlur，半径7，creatingIfNeeded=true；另调用0x100095858配置filters.gaussianBlur.inputRadius相关动画，再通过NSAnimationContext.runAnimationGroup:completionHandler:执行。不能用单次alpha赋值/睡眠或公开CIFilter替代整段并称之为原版。

完成回调0x10009e278：先向捕获的window发送orderOut:nil，再setAlphaValue:1，调用0x100095580的滤镜恢复辅助体，最后执行continuation resume回调。恢复辅助体的具体filter保留/删除策略尚待继续追踪，不能擅自清空全部layer.filters。GaussianBlur还带hardEdges/normalizeEdges两个Optional Bool，相关类型/私有CAFilter适配未完全恢复。

本轮新增原版动画组selector、blur7/alpha1常量及关键滤镜/恢复调用机器审计，执行通过（/tmp/cua-window-hide-mechanism-audit.json）。新证据明确下一步必须恢复GraphicsSupport filter与动画配置依赖，再接入完整orderOut；本轮没有运行真实显示/输入，没有宣称淡出已实现。目标未完成。

### 隐藏完成的 GaussianBlur 清理语义（2026-11-08，本地）

追踪0x100095580剩余分支确认：读取layerFilters，使用动态类型cast查找GaussianBlur，stable removeAll式压缩过滤所有GaussianBlur，保留其余滤镜身份和顺序，再写回layerFilters。已有layer即使没有匹配或滤镜数组为空也写回；content controller/layer缺失则不写。不是清空全部filters，也不是只删第一个blur。

新增resetCursorBlurFilters提取这个清理阶段；readFilters的nil边界仅代表缺少layer，isGaussianBlur仍等待真实GraphicsSupport/CAFilter类型适配，未用CIFilter字符串判定代替原版动态类型。回归验证重复blur、非blur身份/稳定顺序、原数组共享不变、无匹配/空数组仍写、缺layer无副作用。Swift完整构建、provider-click-self-test和二进制getter/dynamicCast/setter审计通过（/tmp/cua-blur-filter-reset-*）。滤镜具体适配、blur半径动画与真实Window异步隐藏尚未全部恢复；输入目标未完成。

### GraphicsSupport LayerFilter.Property / GaussianBlur 存储（2026-11-08，本地）

原版GaussianBlur descriptor0x1012ebf4c/fieldrecord0x101347d48有_radius、_hardEdges、_normalizeEdges三个Property包装字段。原版Property.erased getter将Value装入Any（即使Value是Optional.none，也保留外层Any.some）；setter对Any?到Value条件转换，失败保持原值。projectedValue getter返回当前Property的类型擦除副本；setter强转同一Property<Value>，不是随意读newValue.erased再赋值。

新增原模块GraphicsSupport target（Swift）及LayerFilter命名空间、ErasableProperty、Property<Value>与GaussianBlur三个包装字段/显式初始化器。没有把Native的Swift数据逻辑移至TS，也没有擅自替换成CIFilter。GaussianBlur的FilterConvertible/Keys/CAFilter适配仍未实现，当前只能作为已恢复的数据部分使用；默认参数未核实，初始化器要求显式传三个参数。

回归验证半径写入、错误类型/非可选nil忽略、Optional Bool设置与nil清除、Optional.none保留Any装箱、同类型projection替换和NaN/负半径不钳制。完整Swift构建、provider-click-self-test与包装字段/动态castflags静态审计通过（/tmp/cua-layer-filter-property-*）。具体滤镜接入和完整隐藏/移动输入目标仍未完成。

### GaussianBlur.Keys 与 projected WritableKeyPath（2026-11-08，本地）

读取Keys fieldrecord0x101347d7c确认case声明顺序inputRadius/inputHardEdges/inputNormalizeEdges；rawValue getter0x10102d3fc对应同名输入键。property(for:)0x10102dca0索引表0x101513680，三个keypath分别0x101230618/0x1012305f0/0x1012305c8；解析component getter相对指针，准确落到$radius/$hardEdges/$normalizeEdges getter，避免凭同名字符串猜映射。

新增GaussianBlurKeys.swift，合成String/CaseIterable枚举与三个projected WritableKeyPath。回归通过keyPath.erased写半径、Bool与Optional nil，验证具体GaussianBlur字段变化；不接受未知“radius”作为Keys rawValue。Swift完整构建、provider-click-self-test和case/keypath/getter机器审计通过（/tmp/cua-gaussian-keys-*）。FilterConvertible、原版Name及CAFilter转换尚未全部接合，具体滤镜动画与生产点击仍未验收。

### FilterConvertible 协议契约与GaussianBlur默认构造（2026-11-08，本地）

读取协议descriptor0x1012ec080：3个generic requirements，6个witness requirements（两个associated conformance、Keys associatedtype、static name、init、实例property(for:)）；same-type typeref把Keys.RawValue约束到SS(String)。恢复LayerFilter.FilterConvertible协议和实例name→Self.name转发。GaussianBlur符合该协议，static name返回原版枚举tag1对应gaussianBlur；默认init0x10102dc94为radius0和两个Optional Bool.nil。

新增LayerFilter.Name七case，按descriptor0x1012ec0ec/fieldrecord0x101347f28声明顺序colorSaturate、gaussianBlur、luminanceCurveMap、luminanceToAlpha、variableBlur、sdrNormalize、alphaThreshold。Name.filterType()仍待其他具体滤镜类型恢复，不用默认GaussianBlur兜底。makeFilterInstance/populated(from:)是协议扩展行为，尚待CAFilter适配，不伪装为已实现的协议必需项。

泛型FilterConvertible构造/Keys/name/default参数回归通过，完整Swift构建与二进制协议计数/flags/字段/default常量审计通过（/tmp/cua-filter-convertible-*）。CAFilter实例化、CALayer适配和完整淡出动画仍缺，输入目标未完成。

### FilterConvertible 参数写入与Objective-C桥接（2026-11-08，本地）

追踪makeFilterInstance0x10102b32c后半：创建对象失败或不能转NSObject即nil；成功后按Keys.allCases依次取projected property.erased，调用Swift _bridgeAnythingToObjectiveC再发送setValue:forKey:。erased本身nil时向ObjC写nil；若Value是Optional.none但被Any装箱，则桥接为NSNull，不能擅自跳过该字段。原版桥接导入slot0x101467f88和selector0x1015432e8已机器验证。

新增makeFilterInstance(using:)提取实际参数应用阶段，factory依赖显式代替尚待恢复的CAFilter lookup，不宣称原版零参数入口已实现。使用真实NSObject派生fixture捕获setValue调用，验证工厂名称、返回对象身份、三个键顺序、CGFloat/Bool NSNumber桥接、Optional.none→NSNull及工厂nil传播。完整Swift构建、provider-click-self-test、静态审计通过（/tmp/cua-filter-instance-parameters-*）。实际CAFilter构造、CALayer存取和动画尚未全部接合，生产输入目标未完成。

### CAFilter 工厂 selector 的实际解析（2026-11-08，本地）

从原版类名编码数组解出 CAFilter；原版 0x101030b2c 枚举类方法，以 SoftLink.hash 对方法名与 salt 求值，再沿 superclass 查找。恢复 GraphicsSupport/MethodSelectors.swift，依赖已有 SoftLink，使用原始 hash 0x51575c7f8a81acb0 与 salt。在本机真实 CAFilter 元类方法表上解析结果是 filterWithName:，不能用猜测的 filterWithType: 替代。此检查只查方法表，未调用工厂、创建或应用滤镜。

完整 Swift 构建、provider-click-self-test、静态审计、git diff --check 通过，产物位于 /tmp/cua-filter-method-selector-build.log、/tmp/cua-filter-selector-self-test.json、/tmp/cua-filter-selector-audit.json。底层工厂函数绑定与生产动画接合仍未完成；这些检查不证明应用点击有效。

用户再次澄清拒绝授权是为了停止之前长期无效的操作。此前已获准操作的失败须独立诊断，取消仅解释后续停止，不作为前序点击无效的根因；不得把执行连接恢复或辅助模块回归通过当成真实应用操作修复。

### 生产点击路由诊断（2026-11-08，本地）

当前 CGSession 只读检查仍为 screenLocked=1、frontmost=com.apple.loginwindow，未发送输入。检查生产链路发现 SkyAppState.perform 的原版 void 响应会丢弃 mouseInput 返回值，因此只向返回值增加字段不能保证 agent-loop 日志记录到路由。保持 Sky wire schema 不变，为生产 Mouse 的 AX 与合成事件两条成功派发路径增加显式 opt-in 本地 JSONL 写入。

设置 CUA_NATIVE_INPUT_LOG 为已存在目录中的绝对文件路径，例如 /Users/icezero/work/cua-kit/artifacts/debug/native-input.jsonl，之后启动 demo。记录 route、PID、合成事件的窗口/坐标/焦点准备信息与 targetResponseVerified=false，不记录 AX 文本、截图、输入文本或凭据。未设置则不写文件；首次创建权限0600；文件写入失败不改变已派发动作结果，避免误导调用方重试。artifacts/debug/native-input.jsonl 经 git check-ignore 确认为忽略文件。此为独立诊断扩展，不宣称原版有该日志功能。

完整 Swift 构建通过；独立实际文件检查覆盖默认关闭、两条 JSONL 追加、JSON解析、0600权限及无效目录写入失败非致命。构建日志 /tmp/cua-input-routing-diagnostics-build.log，测试工具 /tmp/cua-input-diagnostic-check/check。真实目标响应仍未验证，添加诊断不等于修复点击。

### 诊断配置贯通 Rust→Swift 的环境边界（2026-11-08，本地）

核查发现上节只实现 Swift 开关仍不足：readRuntimeEnvironment 不导入此键，Rust NativeService 又通过 env_clear 启动 helper。现在显式导入 CUA_NATIVE_INPUT_LOG，并仅把它写入 native_service.input_log_path；Rust 校验绝对 UTF-8 路径且无 NUL 后传给 Swift。不会传入 kernel/trusted worker、Rust host 的一般环境或 app-server policy provider。两种 policy_source 均支持，未设置保持原环境不变，原版 Sky 空响应协议不变。

TS 三项回归通过，覆盖 parent 配置导入、生成 spec、两个 worker 与 host 环境隔离。Rust 六项 NativeService 测试通过，包含实际启动自有 Node helper 捕获 env_clear 后的完整进程环境，验证显式路径到达子进程；首次测试因未设置 CUA_TEST_NODE 失败，补齐测试 Node 路径后全通过。release supervisor 已重新构建部署至 native/runtime-supervisor/dist/core-runtime-supervisor。日志 /tmp/cua-input-log-forwarding-{ts,rust,build}.log。README 与 .env.example 已补说明；无需修改或展示用户 .env 内容。

此修复解决诊断配置未到达 helper，不是实际点击成功证明。锁屏下未操作任何用户应用，真实输入验收仍未完成。

### 原版 CAFilter 工厂实际接通（2026-11-08，本地）

继续静态追踪 0x10103092c 与 0x10102a728：原版使用 SoftLink.lookUpBatchSymbolPointers，三个镜像 hash 为 02efd67f50396e76/023f5c33484e6a09/0201ae547159d0ad，一个 symbol request 内依次 c01ddf872290b0ce/bd275f37e7008392，salt 位于 0x1012812e0。独立运行已有 SoftLink 对本机镜像做解析，第一候选真实名称为 _objc_msgSend；其名称+salt 的 sipHash 亦精确匹配第一 hash。未执行供应商二进制。

新增 GraphicsSupport/LayerFilterFactory.swift，缓存 CAFilter 类、实际方法表查到的 filterWithName: 与必需函数绑定。按原版保持 class/selector 缺失返回 nil，required function 缺失触发 precondition；以 (class, selector, NSString name) 调用，转换 NSObject 后复用已恢复的 Keys.allCases 参数写入。新增原版零参数 makeFilterInstance()，原参数测试 seam 仍保留，但不再代替生产工厂。

真实平台对象回归通过：GaussianBlur(radius:7, hardEdges:true, normalizeEdges:false) 创建两个不同 CAFilter 对象，检查具体类与三个实际 KVC 参数；默认 GaussianBlur 的 Optional nil 桥接亦能成功创建。没有附着 CALayer、显示窗口或发送输入。完整 Swift 构建、provider-click-self-test、镜像/符号数组/salt 静态审计、git diff --check 通过，文件 /tmp/cua-platform-filter-factory-{build.log,self-test.json,audit.json}。CALayer.layerFilters 双向转换、淡出动画与生产 Mouse 光标接入仍待完成，应用操作成功未验收。

### 滤镜参数的原版反向读取（2026-11-08，本地）

静态读取 FilterConvertible.populated(from:) 0x10102af34..0x10102b32c：先复制 receiver（0x10102b0d0 后 value witness copy），再按 Keys.allCases 顺序查询 NSObject；selector slot 0x1015431d0 实际为 valueForKeyPath:，不是 valueForKey:。返回 nil 分支直接进入下一键，不清除原参数；非 nil 经过 _bridgeAnyObjectToAny，修改 projected writable keypath 的 ErasableProperty.erased，类型接受规则仍由 Property<Value> 的条件转换决定。未创建默认 Self 替换 receiver。

新增 GraphicsSupport/FilterPopulation.swift，实现实例方法 populated(from:)->Self。真实 CAFilter GaussianBlur 写入7/true/false后读回，三个参数一致；NSObject fixture 验证 KVC-path 调用顺序、缺失项与错误类型保留原值、接收对象原值不变。完整 Swift 构建、provider-click-self-test、KVC-path selector 与桥接导入静态审计、git diff --check 通过，日志 /tmp/cua-filter-population-{build.log,self-test.json,audit.json}。没有操作用户应用。CALayer.layerFilters 对所有原版类型的识别/转换与光标生产接合尚未完成，不能以此声称点击修复。

### CALayer 滤镜集合的写入阶段（2026-11-08，本地）

静态读取 CALayer.layerFilters.setter 0x10102a564..0x10102a728：顺序调用每个 existential 的 makeFilterInstance；工厂 nil 跳过，成功对象追加，最后无论输入是否为空都发送 setFilters:。已恢复为显式提取函数 CALayer.setLayerFilters(_:)；完整原版 layerFilters 读写属性尚未提供，避免仅支持 GaussianBlur 的 getter 静默丢失其余原版类型。getter 0x10102ab28..0x10102ae78 调用 filters、对象 description，匹配七种 Name，再 filterType().init().populated(from:)；具体 selector slots 已机器验证，不能用猜测的 name/type 属性替换 description。

真实离屏 CALayer 回归：写入半径7/3/7的三项实际 CAFilter，顺序与重复项保留、两个相同参数对象身份独立；写入空集合后 filters 为非 nil 空数组。完整 Swift 构建、provider-click-self-test、setFilters:/filters/description selector 静态审计、git diff --check 通过，日志 /tmp/cua-layer-filter-application-{build.log,self-test.json,audit.json}。没有显示窗口或发送用户应用输入。其余六种类型、完整 getter/modify、动画和生产 Mouse 光标接合仍未完成。

### 七种原版滤镜与完整 CALayer.layerFilters（2026-11-08，本地）

从 field descriptors 核对其余六种类型与 Keys 声明顺序：ColorSaturate(amount:CGFloat/inputAmount)、LuminanceCurveMap(inputValues:[CGFloat]?,inputAmount:CGFloat?)、LuminanceToAlpha(inputPremultipliedValues:Bool?)、VariableBlur(radius:CGFloat,normalizeEdges:Bool?,inputFade:Bool?,inputSourceSublayerName:String?)、SDRNormalize(无字段)、AlphaThreshold(amount:CGFloat,color:CGColor?)。默认构造由原版 init 机器码确认：CGFloat amount/radius0，其余 Optional nil，不按滤镜行业常见默认值猜测 amount1。SDRNormalize 的 associated Keys 实际是 LayerFilter.EmptyKeys；其 init(rawValue:) 恒 nil，allCases 类型 EmptyCollection，而不是凭空造空 enum。property(for:) witness 原版 fatalError，正常路径不会调用。

新增 AdditionalLayerFilters.swift、LayerFilters.swift，恢复 Name.filterType() 的七种精确映射，CALayer.layerFilters getter 调用实际对象 description 匹配 Name，未知对象跳过，已知对象 default init 后 populated(from:)；setter 复用已恢复的顺序工厂写入，Swift computed property 支持原位数组修改的标准 writeback。没有用只支持 GaussianBlur 的默认兜底。

真实离屏 CALayer 写入七种 CAFilter 后全部读回，顺序与具体类型一致，验证 CGFloat、可选 Bool/String、CGFloat 数组、CGColor 参数；七种默认构造/工厂均成功；未知 NSObject/字符串过滤、EmptyKeys nil、空集合替换均通过。完整 Swift 构建、provider-click-self-test、字段/Keys/default 指令静态审计、git diff --check 通过（/tmp/cua-all-layer-filters-{build.log,self-test.json,audit.json}）。光标淡出、updateFilter、完整生产 owner/Mouse 接合仍未完成；未显示窗口或操作用户应用，真实点击未验收。

### CALayer.updateFilter 的原版分支（2026-11-08，本地）

读取 0x10102bc88..0x10102c128 及 predicate 0x10102c3ec：按 Swift concrete type 的条件 dynamicCast 匹配，不比较 Name 或对象描述。非 nil 参数先查 firstIndex；找到仅替换首项，后续同类型不动；不存在时仅 creatingIfNeeded=true 才追加，false 不做 setter。nil 参数忽略创建标志，稳定移除所有同类型值并写回，即便没有命中。原版搜索与写回之间再次读取 computed layerFilters，保留这个 fresh getter，而不是缓存一次数组近似全部分支。

新增 GraphicsSupport/LayerFilterUpdate.swift。真实离屏 CALayer 回归验证重复 GaussianBlur 只更新第一项、第二项半径保留、缺失项不创建时原 CAFilter 对象身份不变、允许创建时追加、nil 一次移除全部同类型且保留其他类型顺序。完整 Swift 构建、provider-click-self-test、关键 cast/getter 调用指令审计、git diff --check 通过；日志 /tmp/cua-layer-filter-update-{build.log,self-test.json,audit.json}。动画 completion/实际光标移动和生产 Mouse 接合仍缺，未操作用户应用，真实应用点击未验收。

### 实际光标窗口的滤镜动画辅助方法（2026-11-08，本地）

读取 0x100095858、0x100096870 与 0x10009e278：模糊 CABasicAnimation keyPath 为 filters.gaussianBlur.inputRadius，存储键 cursorBlurTransition；时长实际来自 0x10116b0f0 的 Double 0.44，两处都以 kCAMediaTimingFunctionEaseInEaseOut 创建 timing function。alpha helper 先设置 NSAnimationContext.duration/timingFunction，再调用 window.animator().alphaValue。hide completion 的已知顺序为 orderOut(nil)→alphaValue1→清理 GaussianBlur→resume；完整 async hide 尚未接入。

新增 CursorWindowFilterAnimation.swift，将三个已恢复辅助方法接到具体 ComputerUseCursorWindow：resetBlurFilters 实际读取 contentViewController.view.layer.layerFilters 并移除全部 GaussianBlur；animateBlurTransition 创建原版 keyPath/from/to/duration/timing 后加入现有 layer；animateAlphaValue 配置 context 与 animator。没有创建不存在的 content layer，没有隐式显示或激活窗口。

扩展实际 --cursor-window-owned-check：自有隐藏窗口的真实 layer 创建两个 GaussianBlur 和一个 ColorSaturate；取回已添加 CABasicAnimation 检查 keyPath/from0/to7/duration0.44/timing存在；reset后仅保留 ColorSaturate且参数0.75，空集合也非nil写回。完整 Swift 构建、provider-click-self-test、自有窗口检查、时长/timing/selector静态审计通过（/tmp/cua-window-filter-animation-*）。检查未order窗口、未发送输入；alpha helper 的可见动画与完整异步hide尚未运行验收，不能宣称生产光标或应用点击已修好。

### 原版 async fadeOut 接合及未通过的运行验收（2026-11-08，本地）

恢复 CursorWindowFadeOut.swift：checked continuation 等待 NSAnimationContext.runAnimationGroup 的 completion；先安装GaussianBlur7并加0→7过渡，动画组配置alpha0；completion按原版orderOut(nil)→alpha1→resetBlurFilters→resume顺序。没有用sleep、超时完成或取消检查代替系统回调；Swift标准checked continuation承担当前系统的actor隔离支持，原版也在macOS15/variant18分支选择对应标准库重载。

新增 --cursor-window-fade-owned-check（不显示窗口、不发送输入），实际测试尚未通过：外部subprocess 5秒超时并终止自有进程；stderr证明已构建隐藏窗口并停在首次fadeOut的await，未收到completion。一次15秒测试同样超时。尝试直接从MainActor启动NSApp.run的宿主会阻塞测试Task，已撤销该宿主变动；最终仍是普通async入口。独立同步AppKit对照：空NSAnimationContext组能回调；加入真实隐藏NSWindow.animator().alphaValue后3秒内也未回调。因此不能仅归因于CUA代码或MainActor，当前锁屏/隐藏窗口的动画回调条件仍须进一步验证。原版fadeOut由可见分支调用，隐藏窗口测试不能替代可见动画验收。

完整Swift构建、provider-click-self-test、既有原版fadeout关键调用/参数静态审计通过；运行验收记录明确失败 /tmp/cua-window-fade-owned.json，构建/审计/内部回归 /tmp/cua-window-fade-*.log/json。尚未把fadeOut接入生产Mouse，也未宣称光标或应用点击修复；该诊断入口目前应由外部有界超时运行，避免无界等待。

### 具体光标 owner.orderOut 与隐藏分支验收（2026-11-08，本地）

恢复 ComputerUseCursor.orderOut()：await 当前弱delegate的willHide；之后fresh window.isVisible；取当前window清wantsToBeVisible并reset。可见分支在reset后重新加载owner.window等待fadeOut；隐藏分支对reset时保留的窗口调用super.orderOut(nil)，不能被reset回调替换owner.window误导。随后fresh弱delegate.didHide，再发送原版computerUseCursorDidHide通知（原始字符串地址0x101242a50）。Delegate目前只恢复四项中的三项，两个隐藏回调使用明确的可读重建名称，不宣称原始拼写或第四项已恢复。

新增 --cursor-owner-hide-owned-check，自有未显示窗口实际调用owner.orderOut，willHide内Task.yield并替换弱delegate，验证只调用新delegate.didHide；动画reset在didHide前完成，通知在didHide后发送；nil delegate再次隐藏仍发送通知。该真实隐藏分支在不到1秒完成，没有进入可见动画。完整构建、provider-click-self-test、自有owner检查、既有window lifecycle检查及原版隐藏通知静态审计通过（/tmp/cua-owner-order-out-*）。未发送输入或显示窗口；可见fadeOut回调仍未验收，生产Mouse与移动/完整delegate仍未接合。

### 隐藏时 reset 重入替换窗口与诊断有界失败（2026-11-08，本地）

扩展自有真实 owner 隐藏检查：progress animation 的 finished 回调在 reset 中替换 cursor.window。验证旧 preparedWindow 清wants并reset，新window保持自身wants=true且仍隐藏，owner最终指向新window，隐藏通知正常发出。该场景对应原版隐藏分支保留preparedWindow调用super，而不是reset后误操作新owner.window。

为 --cursor-window-fade-owned-check 增加独立全局队列5秒watchdog，仅终止诊断进程并以exit1与ownedFadeCheckTimedOut JSON明确报告失败；不触碰生产fadeOut，不恢复continuation、不返回伪成功。实测诊断5秒后非零退出并包含失败标记，外部8秒上限未触发。当前可见淡出仍未验收，timeout明确保留。

Swift完整构建、自有owner重入检查、provider-click-self-test、二进制审计和git diff --check通过；诊断watchdog的失败报告契约通过。证据 /tmp/cua-owner-reentrant-hide-* 和 /tmp/cua-owned-fade-watchdog.json。没有显示窗口或发送输入，整体目标未完成。

### move 入口第四项 delegate 与 ownership 准备（2026-11-08，本地）

静态追踪 0x100091f24 的 move：入口保存CGPoint、aboveWindowID、relativeToWindow、nextInteractionTiming、animated、fadeIn、isDelegate。0x100092000 在isDelegate=true时跳过ownership阶段；否则先把targetWindowID设为relativeToWindow ? aboveWindowID : nil，随后在Delegate witness +8发起异步调用，参数为cursor、原始point、原始aboveWindowID及animated。callback返回后0x10009242c才写isMoving=true。至此四项delegate的调用形状已恢复：异步willMove、异步willHide、同步didHide、同步didMove；原始方法名仍redacted，当前名称为可读重建名称。

将原先误限于movement的协议更名ComputerUseCursorDelegate，新增具体owner的prepareMoveOwnership提取阶段，不提供假move入口、不声称完成坐标转换/移动/淡入。真实隐藏owner回归：willMove内检查targetWindowID已写而isMoving未写，Task.yield后仍未写，返回后isMoving=true；isDelegate=true保持旧targetWindowID/isMoving且不触发callback；relativeToWindow=false在无delegate时清targetWindowID并置isMoving。

完整Swift构建、provider-click-self-test、具体owner检查、window生命周期检查及witness/分支/isMoving写入指令审计通过（/tmp/cua-move-ownership-*），git diff --check通过。未显示窗口或发送输入；完整move/淡入、生产Mouse、可见动画和真实应用操作仍未完成。

### move 前置外观与 Window 坐标阶段定位（2026-11-08，本地）

继续追踪move continuation thunk0x10009ccd0→0x100092c48→Window move0x1000946b4。确认坐标/热点换算位于Window内部，并带有当前运动/相对窗口/既有位置分支，不能用简单setFrameOrigin代替完整move。

已恢复owner前置外观阶段0x100092134..0x100092224：先读取原window可见性；仅当隐藏且(animated||fadeIn)时重新取当前window、alpha置0，并在现有contentViewController.view.layer上updateFilter(GaussianBlur(radius7,nil,nil),creatingIfNeeded:true)。初始可见性作为后续move所需快照返回。独立提取为prepareMoveAppearance，不提供假完整move，不order窗口或创建缺失图层。

实际隐藏owner回归验证两个标志均false时alpha0.8与旧CAFilter身份保留；animated=true/fadeIn=false时alpha0并追加blur7且保留ColorSaturate；animated=false/fadeIn=true同样准备alpha0且窗口仍隐藏。完整Swift构建、provider-click-self-test、owner检查及alpha0/blur7/updateFilter指令审计通过（/tmp/cua-move-appearance-*），git diff --check通过。Window运动、相对坐标分支、淡入完成与生产Mouse仍缺，真实应用输入未验收。

### 光标目标绝对 origin 的热点换算（2026-11-08，本地）

追踪Window move0x100094898..0x100094950及NSScreen.convertPointFromCGCoordinates0x10101dd38（尾调同一ToCG实现）：以zeroScreen.frame.maxY翻转点y，zeroScreen缺失用0；减去此前captured frame的CGRectGetHeight；分别重新读取当前style.hotSpot.x、hotSpot.y。目标origin为x减hotspotX，y翻转后减capturedHeight再加hotspotY。原版不是将左上坐标直接传给NSWindow，也不缩放/夹紧点。相对窗口转换与初始运动origin选择发生在后续阶段，不能混为这个绝对目标。

新增CursorMoveOrigin.swift，包含该几何提取与具体Window.absoluteMoveTargetOrigin绑定（frame先捕获，screen与hotspot按原版读取）。回归将已有hotspotScreenPoint观测结果反向还原窗口origin，覆盖负坐标、非零屏幕origin与无屏幕；额外动态hotspot检查x/y必须分两次读取，验证screen→hotspot→hotspot顺序。完整Swift构建、provider-click-self-test、CG转换/CGRectGetHeight/双hotspot访问指令审计、git diff --check通过（/tmp/cua-move-origin-*）。完整move仍缺后续相对坐标、动画和completion，未移动窗口或发送输入。

### move 初始绝对 origin 的选择（2026-11-08，本地）

从0x100094974..0x100094a28确认previous-hotspot共享Optional CGPoint先被读取，其坐标已为AppKit screen坐标；有值时无论后续visible/animated选择如何都分别读取style.hotSpot.x/y，减去captured window高度得到previous origin。随后无条件fresh window.frame。初始origin优先级：此前visible→fresh frame.origin；隐藏且animated且previous存在→previous origin；否则→本次target origin。相对窗口坐标换算和已有运动currentInterpolatedOrigin覆盖位于后续，不混入该阶段。共享previous值的完整写入生命周期尚待恢复，没有伪造owner缓存或默认值。

新增CursorMoveInitialOrigin.swift提取该有证据的选择阶段。八种visibility/animated/previous存在性组合均验证，特别是有previous时即便结果不采用它仍按原版读取两次hotspot，所有分支均fresh frame一次。使用captured高度23而fresh高度99验证高度来自正确快照。完整Swift构建、provider-click-self-test、双hotspot/条件选择指令审计、git diff --check通过（/tmp/cua-move-initial-origin-*）。相对坐标、运动reset/动画接合仍未完成；未操作窗口或应用，真实输入未验收。

### 相对窗口 origin 与中断动画起点接合（2026-11-08，本地）

读取0x100094a2c..0x100094ac4与NSScreen矩形转换0x10101dbfc：将对应CGWindow.frame转换为AppKit origin，使用zeroScreen.maxY-(raw origin.y+raw signed size.height)，相对初始/目标点各减该origin。初始换算后，只要progress或scootPosition animation对象存在（不检查ended状态），改用currentInterpolatedOrigin。保存这个初始点，调用具体Window reset，然后重新写currentInterpolatedOrigin；目标换算在reset之后再次获取screen，不能缓存第一次转换跨越回调。

新增CursorMoveOrigins.swift，具体Window.prepareMoveOrigins负责以上真实字段/reset接合，返回initial/target供尚待恢复的运动阶段使用；对应窗口查找仍由未来完整move调用方提供，不凭空增加窗口选择兜底。实际隐藏Window检查让progress.finished回调在reset时把currentInterpolatedOrigin改999；方法最终正确恢复此前12/34，且screen读取顺序为screen→reset→screen，第二次屏幕高度1200用于target换算。无相对窗口时不查询screen，绝对负坐标保留。

完整Swift构建、provider-click-self-test、实际window生命周期/重入检查、双矩形转换/reset/load-store指令审计、git diff --check通过（/tmp/cua-move-relative-origins-*）。未order窗口或发送输入。完整运动、对应窗口查找及共享previous位置生命周期、动画completion和生产Mouse接合仍未完成。

### 移动时窗口关联与临时 overlay 原因（2026-11-08，本地）

静态读取Window关联helper0x10009a950：先wantsToBeVisible=true，再写原始Optional correspondingWindowID；temporaryOverlay=true时设置petLaunch位，仅原appMonitor/petLaunch均false才调用原level SPI提升（同CGWindowLevelForKey15/NSWindow102）；false不主动清旧petLaunch。无论是否promote最后都进入updateVisibility。调用方0x100094b18的temporaryOverlay判定属于move后续编排，还未用猜测接入。

新增CursorMoveWindowAssociation.swift，恢复上述顺序并绑定到实际ComputerUseCursorWindow与已有promoteCursorWindowOverlay/updateVisibility。抽取分支检查覆盖appMonitor/旧petLaunch/请求三种布尔的八组合，明确promote前新reason已写入、false保留原reason、所有路径visibility在最后。此处为组合层测试，不声称系统窗口层级提升已实际验收。

完整Swift构建、provider-click-self-test、原版关联调用/level SPI/visibility尾调审计、git diff --check通过（/tmp/cua-move-association-*）。完整move调用链、动画与生产输入仍未完成；本轮未order窗口、未发送事件。

### 临时overlay判定及非动画路径清理（2026-11-08，本地）

恢复0x100094ae4..0x100094b04传给关联helper的条件：此前隐藏、animated=true、previous hotspot存在且initialAbsolute与targetAbsolute至少一个分量不等，才请求temporary overlay。不能在所有move中一律置顶。恢复0x100094bb4..0x100094bf8非动画处理路径的清理：petLaunch不存在则完全不触碰level/visibility；存在则先清petLaunch，仅无AppMonitor原因时level0，再updateVisibility。该代码位置在即时位置写入之前，不是统一的移动结束回调。

CursorMoveWindowAssociation.swift新增判定函数与具体Window.clearTemporaryMoveOverlay绑定，复用原窗口level setter/visibility。回归覆盖坐标相等、单轴不同与各必要条件缺失，以及四种overlay原因组合，验证原AppMonitor所有权保留及清reason→降级→visibility顺序。完整Swift构建、provider-click-self-test、清bit/visibility调用机器审计、git diff --check通过（/tmp/cua-move-overlay-restoration-*）。完整Window.move仍未接合，未移动窗口或发送输入，真实应用操作未验收。

### move 共享 continuation 恢复状态（2026-11-08，本地）

追踪0x100092cfc..0x100092e74与两个callback0x100092ea0/0x100092f24：两个回调共享Bool resumed，先置true再resume，避免交互提前许可和运动完成重复恢复同一continuation。nextInteraction callback不依赖owner；完成callback先weak-load owner，nil则连resume也跳过，非nil时尝试resume，随后仅非isDelegate移动清isMoving。提前允许交互不会提前把isMoving清false。

新增CursorMoveCompletion.swift，为未来实际Window运动绑定两个callback提供共享状态（内部可读提取类型，不冒充原版公开API）。实际隐藏owner检查验证interactionReady重复调用只恢复一次、稍后movementCompleted才清isMoving；委托完成保留isMoving；nil owner完成不恢复，但独立interactionReady仍能恢复。完整Swift构建、provider-click-self-test、owner检查、weak-load/resume/isMoving写入审计及git diff --check通过（/tmp/cua-move-completion-*）。首次新增审计误写callsite为mov指令地址，改为原始bl地址0x100092fc0后通过。

进一步源码显示所谓即时分支仍经过曲线/方向规划，并非简单setFrameOrigin后立刻完成。因此本轮未以快捷替代实现整条分支。完整运动规划/动画与生产Mouse仍缺，未操作用户应用。

### CursorNextInteractionTiming 与 closeEnough 条件（2026-11-08，本地）

读取descriptor0x1012bdb40/fieldrecord0x1013162c0：两个无payload case按顺序closeEnough、finished，Hashable；CloseEnoughConfiguration descriptor0x1012bdb24含CGFloat progressThreshold/distanceThreshold。原版default静态位模式0x10115efd0和getter常量均为0.995/3.157，不能把finished与closeEnough合并或随意改阈值。

通过两处实际默认常量xref定位运动tick0x1000978f8与0x100097d7c：必须progress>=0.995且distance<=3.157且尚未满足，才先置cursorMotionDidSatisfyNextInteractionTiming=true、调用nextInteractionTimingHandler，然后清live handler slot。NaN progress由B.LT排除，NaN distance由B.HI排除；两条件为AND，不是OR。回调重入替换的新handler也会被后续清除，保持原版行为。

新增CursorNextInteractionTiming.swift，恢复嵌套数据类型及具体Window.updateCloseEnoughInteraction提取阶段。实际隐藏Window测试覆盖阈值前一ULP/后一ULP、NaN、两个边界相等、一旦满足只调用一次、callback内检查flag已写及替换handler随后被清。完整Swift构建、provider-click-self-test、owned-window检查与descriptor/default/分支静态审计通过（/tmp/cua-next-interaction-*），git diff --check通过。未把提取阶段伪装成已接通的完整运动tick，完整轨迹规划/动画/生产Mouse仍缺。

### progress motion 的 finished 清理阶段（2026-11-08，本地）

读取0x100097c48..0x100097d74：finished先调用当前nextInteractionTimingHandler；随后清live progress animation和live interaction handler；再捕获此时的motion completion并清slot；timingSatisfied重置false；清临时overlay（保留AppMonitor原因）；重新加载style分别velocityX/Y置0；最后调用已捕获completion。交互callback内新装的progress/interaction会被后续清除，但新装的completion会被采用；最终completion内装入的新handler不再被清除。不能把所有回调先缓存或用统一defer清理替代这些顺序。

新增CursorProgressMotionFinish.swift绑定具体Window字段。真实隐藏Window检查让interaction callback替换progress和completion，验证采用新completion、在其调用前各slot/flag与速度已清理、没有把被清的ready替换动画stop成ended；最终completion装入future handler能保留并随后调用。完整Swift构建、provider-click-self-test、owned-window检查、四个原版清slot/flag指令审计及git diff --check通过（/tmp/cua-progress-motion-finish-*）。完整tick/轨迹规划与生产输入仍未接通，未显示窗口或发送输入。

### 直线运动 tick 的投影进度与 envelope（2026-11-08，本地）

恢复0x100097490..0x10009753c：direction=target-start，lengthSquared=dx²+dy²；小于0.001（注意是平方长度）或该比较unordered时progress1。其余以dot(direction,position-start)/lengthSquared作投影进度并限定0..1；position导致NaN时保留NaN，不能统一isFinite兜底。envelope为min(progress/0.22,1)*pow(max(1-progress,0),0.62)再限定0..1，显式比较保留原FCSEL的NaN语义。

新增CursorLinearMotionSample.swift，返回progress/envelope（可读提取名称，不宣称原版类型名）。回归覆盖垂直偏移不改变投影、平移不变、起点之前/终点之后钳制、极短路径以及position NaN和path NaN的不同处理。首次构建遇到CGPoint重载下.nan类型歧义，改为CGFloat.nan后完整Swift构建通过；provider-click-self-test、原版常量/pow调用/比较分支审计、git diff --check通过（/tmp/cua-linear-motion-sample-*）。完整motion tick的窗口位置/方向/速度更新及轨迹规划仍未接合，未操作窗口或发送事件。

### 运动方向角与 scoot reset 的共同数学（2026-11-08，本地）

恢复motion方向0x100097bb0..0x100097c2c：CGPoint.length实际为sqrt(x*x+y*y)（0x10025feb8），长度<0.001返回Angle.zero；否则归一化，atan2(-y,x)*57.29577951308232+90，减motionConfiguration.clickAngle，再乘0.017453292519943295。不换成hypot，不统一归一到0..360，不对NaN/overflow添加原版不存在的兜底。

新增CursorMotionAngle.swift；已有cursorScootResetAngle在保留其sincos输入构造后复用相同数学，避免同一规则维护两份。回归覆盖四个轴向、正负角（包括224/-46而不是另行wrap）、阈值两侧、NaN及长度平方overflow行为；既有scoot reset角度/窗口状态回归仍通过。完整Swift构建、provider-click-self-test、自有window检查、度/弧度常量与length/atan2调用审计、git diff --check通过（/tmp/cua-motion-angle-*）。该计算尚未代替缺失的完整motion tick，实际生产移动与应用输入仍未验收。

### motion tick 的实际隐藏窗口位置写回（2026-11-08，本地）

读取0x100097a8c..0x100097b6c（直线tick同阶段0x100097580..0x10009762c）：先把未舍入相对点写currentInterpolatedOrigin，若有对应窗口则加转换后的AppKit origin，再调用CGPoint.rounded→CGSize.rounded，其机器指令为FRINTA（nearest ties away from zero），setFrameOrigin后调用独立0x10009aa1c关联阶段。不能舍入缓存中的相对点或使用ties-to-even。

新增CursorMotionFrameOrigin.swift，绑定具体Window.setFrameOrigin并保留afterMove显式依赖，后续完整关联阶段尚未恢复，不以空实现伪装。实际自有隐藏Window测试：relative0.5/-0.5加窗口origin后写101/400，缓存仍保留0.5/-0.5；afterMove观察到实际frame已更新；无对应窗口时不查询screen，负半点-1.5/-2.5写-2/-3。窗口始终isVisible=false，无order/激活/鼠标键盘事件。

完整Swift构建、provider-click-self-test、真实owned-window检查、rounding/关联调用/setFrameOrigin selector静态审计、git diff --check通过（/tmp/cua-motion-frame-origin-*）。已验证的仅是自有隐藏窗口的位置写回，不能推导出可见光标动画或真实应用点击成功；完整tick/轨迹与生产Mouse尚未接合。

### 每帧移动后 temporary overlay 的窗口命中检查（2026-11-08，本地）

恢复0x10009aa1c..0x10009abf0：无petLaunch直接返回；否则从absolute origin依次读style.hotSpot.x、fresh frame.height、fresh hotSpot.y，构造AppKit热点点，再以自身windowNumber为below参数调用NSWindow.windowNumber(at:belowWindowWithWindowNumber:)。命中值checked UInt32（保留原版负值/越界trap），随后fresh对应窗口ID和overlay原因。仅当前petLaunch仍存在且对应ID非nil并等于hit时清petLaunch；无AppMonitor才level0；命中后都updateVisibility。未命中也按原版回写同样reasons，不以矩形扫描替代AppKit API。

新增CursorMovingWindowAssociation.swift并把applyMotionFrameOrigin的默认afterMove接到具体窗口检查，显式fixture override仍可用。回归覆盖目标nil/命中/未命中、AppMonitor保留、独立hotspot两次读取与无临时原因跳过geometry；实际owned-window位置/lifecycle回归仍通过。完整Swift构建、provider-click-self-test、owned-window检查、实际AppKit selector/visibility尾调审计、git diff --check通过（/tmp/cua-moving-window-association-*）。命中测试使用注入结果，没有将其称为真实桌面窗口命中验收。完整轨迹/tick/生产Mouse及真实应用点击仍未完成。

### 轨迹终点方向混合（2026-11-08，本地）

读取0x100097f14..0x100098054，确认该helper不是速度setter，而是给角度计算使用的归一化方向。terminal方向来自sin/cos(clickAngle*pi/180)，当前方向长度<0.001时以terminal兜底；进度限定0..1，NaN进度按原FCSEL选择1；以terminalTangentBlendStart（MotionConfiguration field29，live0.99）归一化余段并作1-(1-clampedRelative)^3三次幂混合，混合后再次normalize，极短结果兜底(1,0)。NaN向量不加额外有限值兜底，保持乘法/比较传播。

新增CursorTerminalDirection.swift，复用现有motion configuration，保留原版sqrt长度和显式比较顺序。回归验证中段保持当前切线、0.995时的三次幂权重、终点点击方向、零向量fallback、NaN进度与反向早期切线。完整Swift构建、provider-click-self-test、pi/sincos/pow/field偏移静态审计和git diff --check通过（/tmp/cua-terminal-direction-*）。完整曲线规划/tick速度写入/生产Mouse仍未完成，本轮未操作应用。

### 多段三次贝塞尔轨迹取样（2026-11-08，本地）

恢复0x100095238..0x1000953e4及导数helper0x10009df30：路径保存start与48字节segment数组（endpoint/control1/control2各CGPoint）；进度乘segmentCount确定段，段起点为前段endpoint。p>=1或unordered(NaN)选择最后段t1，负值含-Infinity选首段t0；中间整数边界选择后段t0。返回cubic位置与local t导数，导数不乘总段数，后续速度阶段才做该缩放。空路径仍precondition失败，不补造直线兜底。

新增CursorCubicPath.swift作为可读提取类型。回归覆盖非共线控制点的端点/中点/导数（防止错误退化成线性插值）、两段不同方向的段边界与未缩放导数、区间外/Infinity/NaN。首次测试构建因-.infinity重载类型歧义失败，显式CGFloat后完整构建通过；provider-click-self-test、segment步长/导数常量/调用静态审计、git diff --check通过（/tmp/cua-cubic-path-*）。路径候选生成与评分仍待恢复，不能将采样器当成已实现完整轨迹动画；未移动窗口或发送输入。

### 用户取消的因果顺序澄清（2026-11-08）

用户补充：因为此前持续没有操作效果，才拒绝后续授权以停止运行。重新读取 e4781aae 本地日志确认：步骤6、7、8、10、12、13、15之前均有 accept，工具结果未标记 isError；步骤16两次 accept 后工具结果仍报 /Applications/Multica.app；直到步骤18（2026-11-07T11:11:29.709Z）才出现 cancel。因此取消只能解释步骤18被阻止，不能解释此前已授权点击无效果，也不能据此建议自动批准作为修复。

MCP工具结果未标记错误只表示调用返回，不证明应用接收输入或界面发生变化。生产 Mouse 的 cursorPress 仍为 nil，光标链路缺失与应用输入无效果必须分别验收；可见光标缺失本身不能证明 CGEvent 未发送。继续以原生输入路由、目标PID/窗口、焦点准备及操作前后状态为排查证据。执行连接已通过 pwd/git status 验证，该验证不代表点击已修复。

### Source path bounds restoration (2026-11-08)

Restored 0x10009d3a8 in CursorPathBounds.swift. With a corresponding CGWindow, perform screen conversion and return zero origin with raw signed size. Otherwise inspect screens in inventory order, checking both endpoints per screen. If neither endpoint is found, union all frames starting from CGRect.null. Verified imported binding 0x101464b98 is _CGRectNull; an empty inventory returns null. Tests cover screen precedence, union, empty inventory, signed window sizes and lazy screen reads. Initial build required awaiting the MainActor test; corrected build and provider-click-self-test passed. Static audit passed. Full trajectory planning, movement integration and production Mouse cursor remain incomplete; this is not proof of real application input success.

Enabled CUA_NATIVE_INPUT_LOG in the ignored, untracked local .env without displaying or changing credentials. Destination: artifacts/debug/native-input.jsonl, effective after demo restart. No native log existed at inspection. No user application input was sent this turn.

### Straight-distance planner branch (2026-11-08)

Inspected 0x100098058..0x1000982e8. Configuration offset +0x38 is straightPathDistanceThreshold (live 10). Distance <= threshold enters the one-segment branch; unordered distance/threshold does not. CGPoint.distance at 0x10025fef4 tail-calls hypot; this differs from direction length's sqrt sum. Controls are start+(target-start)/3 and start+(target-start)*(2/3), preserving division versus multiplication order and the exact constant. Added CursorStraightPath.swift as an extracted branch returning nil for the still-missing long-distance planner, rather than inventing a straight fallback for every move. Tests cover exact threshold, nextUp, coincident points, nonzero origins, control coordinates, NaN and huge finite inputs. Swift build and provider-click-self-test passed (/tmp/cua-straight-path-*). Static instruction pins added. No user input or visible cursor movement performed; full planner and production integration remain incomplete.

### Initial long-distance path candidates (2026-11-08)

Read 0x10009d6bc..0x10009db00. The first candidate uses click direction (sin(angle*pi/180), cos(angle*pi/180)), start/end handle lengths based on hypot endpoint distance and configuration startHandle/endpointHandle. Each handle is limited by 640 and distance*0.9, with a floor of 48; the original comparison order has distinct NaN behavior and is preserved. The second candidate scales the same handles by 0.65. Neither uses the displacement direction for its two controls. Constants 0.9/0.65 were verified in the pinned image and added to static audit.

Added CursorPathSeeds.swift as the first two candidates only, in source order. Checks cover minimum/relative cap/absolute cap, controls and second-seed scale, plus NaN handle behavior. Full Swift build, provider-click-self-test and static audit passed (/tmp/cua-path-seeds-*). Later arc candidates, path ranking and production movement integration remain missing. No vendor executable was launched, no user application input sent, no real click success claimed.

### Arc candidate construction (2026-11-08)

Read the remaining generator 0x10009dae0..0x10009df30. Added CursorPathCandidates.swift: two single-segment seeds followed by 18 two-segment paths, nested arc scales (0.55,0.8,1.05), tangent scales (0.65,1,1.35), positive then negative join. Arc amplitude uses distance*arcSize bounded 50..520; tangent length uses distance*arcFlow bounded 38..440. Normal orientation follows the cross product with the configured click direction. Join is endpoint midpoint plus/minus normal offset plus 0.16 times the first handle displacement; preserve multiplication before adding origins to avoid cancellation introduced by subtracting control coordinates. Shared handle calculation extracted from CursorPathSeeds.swift. Two-segment controls preserve source start/end controls and use symmetric join tangent offsets.

Generator returns the prefix limited by nonnegative candidateCount; zero returns empty, values above 20 return all 20, negatives retain a precondition failure. This matches the native negative trap and prefix tail. Candidate curves now feed the existing sampler in regression checks. Tests validate count, seed order, opposite joins, endpoints, matching local join tangents and truncation. Swift build, provider-click-self-test, static grid/constant audit and diff checks passed (/tmp/cua-path-candidates-*). Candidate ranking, complete motion state and production Mouse integration remain absent; no visible movement or user input performed.

### Path measurement before ranking (2026-11-08)

Restored 0x100098ab8..0x100098da4 as CursorPathMetrics.swift. Each segment is sampled at t=1/24 through 24/24, carrying angle history across joins. Polyline length uses hypot. Inset bounds membership starts with path.start and short-circuits permanently false after an outside sample. Segment displacement sqrt length must exceed 0.01 to update angle; smaller or unordered displacement skips angle processing. Wrapped angle deltas accumulate squared sum, maximum absolute turn, and absolute sum. Empty segment arrays return zero metrics with initial-point membership.

Regression uses an axis-aligned two-segment right-angle path: length48, maximum/absolute turn pi/2, squared sum (pi/2)^2; also tests inset rejection and empty input. Full Swift build, provider-click-self-test, constant static audit and diff checks passed (/tmp/cua-path-metrics-*). Weighted scoring, candidate selection, full motion and production Mouse integration remain incomplete. No visible window or user input action was performed.

### Weighted candidate score (2026-11-08)

Restored 0x10009849c..0x1000985e0 as CursorPathScore.swift. Score = measured length + 320*max(length/max(endpoint distance,1)-1,0) + 140*squaredTurnSum + 180*maximumTurn + 18*absoluteTurnSum + alignment penalty + outside penalty45. Alignment uses normalized endpoint displacement, dot with (sin,cos) configured click direction; clamp((-0.08-dot)/0.92,0,1)*90. Source normalization length uses sqrt sum, distance denominator uses hypot. Preserved distinct NaN behavior: unordered excess becomes0, unordered alignment becomes full90, FMAXNM distance denominator chooses1 for NaN. Addition order follows assembly.

Tests independently check a straight path baseline100, opposite direction190, combined weighted terms1457 and NaN configured angle190. Swift build, provider-click-self-test, static constant audit and diff checks passed (/tmp/cua-path-score-*). Inspected later selection: it first collects in-bounds candidates and uses that pool if nonempty, then minimum score with strict replacement (same-score preserves first). Selection implementation remains pending, as do full movement and production input integration. No user application action performed.

### Joined geometric planning stages (2026-11-08)

Added CursorPathPlanner.swift following 0x100098650..0x100098ab8: filter measured candidates for in-bounds membership; use the filtered pool if nonempty, otherwise the original pool. Start with the first candidate and replace only for a strictly smaller score. Equal and unordered comparisons preserve the incumbent, including a first NaN score. Verified 0x10009d324 is a path copy helper rather than additional geometry. Empty long-distance candidates retain precondition failure, matching native empty-input trap. Short-distance selection bypasses candidate generation entirely.

planCursorPath now composes short-distance branching, candidate construction, measurement, weighted scoring and selection into one geometric function. Tests cover empty selection, inside precedence despite higher score, all-outside fallback, NaN incumbent, short-distance bypass with candidateCount0, and long-distance endpoint/minimum-score consistency. Swift build, provider-click-self-test, static selection-branch pins and diff checks passed (/tmp/cua-path-planner-*). This does not start animation or mutate cursor/window/interaction state. Full movement integration, display-link behavior, production Mouse and real application input remain unverified/incomplete. No user input performed.

### Progress tick style velocity (2026-11-08)

Restored 0x100097e0c..0x100097edc as CursorProgressVelocity.swift. Read scalar spring velocity, multiply by segment count, then each local-t derivative component. If sqrt(vx*vx+vy*vy)>0 use the result; zero or unordered uses current relative position minus previously captured relative position, without dt division. The window style is loaded independently for velocityX and velocityY writes. Added concrete ComputerUseCursorWindow.updateProgressVelocity binding, retaining an extracted pure calculation and style-write seam.

Checks cover positive/negative progress speed, count scaling, zero speed/count positional fallback, NaN derivative fallback, and independent style reloads. Full Swift build, provider-click-self-test, static instruction audit and diff checks passed (/tmp/cua-progress-velocity-*). This remains a recovered stage; complete tick/spring installation and production Mouse integration are not yet implemented. No actual animation or user application input was run.

### Composed progress-animation frame (2026-11-08)

Added ComputerUseCursorWindow.applyProgressMotionFrame following 0x1000979c4: sample the path, resolve corresponding window, capture previous interpolated position, write actual window origin/association, optionally update captured style angle from terminal-blended tangent. Finished events invoke the recovered finish cleanup and return before velocity reads. Other events run closeEnough interaction checks before reading live progress velocity, then write recovered style velocities. Installer supplies animation phase, velocity reader, window lookup and the recovered path angle flag; this method does not start an animation or install itself into production Mouse.

Actual own hidden-window regression checks relative position before interaction callback, phase order lookup/move/interaction/velocity, resulting style velocity60/0, then finished move/interaction/completion with zero velocities visible to completion and no velocity read. Window remains hidden; only its own frame is changed. Swift build, provider-click-self-test, existing native static audit and diff checks passed (/tmp/cua-progress-frame-*). Full movement startup/spring installation, display-link runtime and real user application input remain incomplete/unverified.

### Progress spring preparation and timing mode (2026-11-08)

Read 0x100096938 startup. Native first selects bounds and branches at scootDistanceThreshold; its long-movement branch plans/measures the path, initializes angle if enabled, derives response at 0x100098da8, then creates SpringAnimation<CGFloat>(response, configured damping, initial0,target1,idleVelocityThreshold0.01). Storage order at 0x100096b04..0x100096b90 is animation, next-interaction handler, completion handler, then timing flag from mode. The finished enum case sets satisfied true to suppress early interaction; finishProgressMotion still invokes the handler. CloseEnough starts false and clears handler after early dispatch.

Added prepareProgressAnimation with externally supplied response, preserving this recovered storage stage without guessing the unfinished response formula or starting a different animation. Own hidden-window tests cover ready state, identity/value/target, finished suppression and completion callbacks, plus closeEnough early callback exactly once and subsequent completion. Swift build, provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-progress-preparation-*). Event installation, native driver enqueue, response complexity calculation, scoot path and production Mouse integration still remain; this is not a functioning visible movement claim. No user application input performed.

### Geometry-derived spring response (2026-11-08)

Recovered 0x100098da8..0x100099300 in CursorSpringResponse.swift. Normalize length (length-180)/760, excess ratio/0.55, total turn/4.39822971502571 and squared turn/1.25 to 0..1. Complexity is 0.42*excess+0.38*totalTurn+0.2*squaredTurn, saturated then weighted0.12. Base0.42 plus0.22*lengthTerm, reverse-direction penalty0.28, and joined-path additive0.04; multiply configured scaler and joined-path factor0.9, then configured min/max. Native join optional flag is represented by segmentCount>1 for the recovered generator's single/two-segment curves. This is not a general equivalence for arbitrary malformed native path records. Numeric saturation preserves high selection on unordered input and final response cap behavior.

Independent expected-value checks: simple straight0.378, reverse0.63, joined0.3726, saturated complexity0.684, zero-scaler minimum and NaN-scaler maximum. Constants pinned by static audit. This helper is not yet wired into a fully installed animation; production Mouse and actual application input remain unverified. No user input or vendor executable launch.

Verification: Swift build, provider-click-self-test, static audit and git diff --check passed (/tmp/cua-spring-response-*).

### Progress animation event binding (2026-11-08)

Resolved installed thunk0x10009e0e0 to0x10009721c. It weak-loads window then animation, checks the live progress slot is nonnil and identical, and only then forwards to0x1000979c4. Added bindProgressEvents with weak window/animation captures, identical-slot gate, valueChanged/finished mapping and ignored retargeted events. The handler invokes the composed frame method and reads captured animation velocity at the original late phase.

Own hidden-window checks manually invoke the installed handler: retarget causes no move, value0.5 writes relative15/0, replacement makes old finished events inert, current finished clears slot and later events remain inert. Initial regression incorrectly asserted immediate NSWindow deallocation after dropping a local reference; AppKit retention/autorelease invalidates that assumption. Removed that unsupported assertion, retained functional gates, and do not claim runtime deallocation was proven. Corrected Swift build/provider-click-self-test, static weak/identity gate audit and diff checks passed (/tmp/cua-progress-binding-*). Real driver enqueue, complete move startup/scoot and production input remain incomplete. Only own hidden test window moved; no user application input.

### Driven progress integration with deterministic frames (2026-11-08)

Inspected native Animation.start(afterDelay:drivenBy:) at0x1007c1f18: forwards to shared coordinator with explicit source. Restored this public extension; original window startup tail0x1000970e8 calls it with NSWindow source. Existing NSWindow AnimationDriverSource creates the DisplayLink driver, not a timer substitute.

Added integrated regression using a deterministic test driver and real own hidden NSWindow: plan300/200, measure, derive response, prepare0-to1 spring, bind native-gated events, register through restored start API, advance at240Hz until driver stops. Asserts multiple actual window writes, final target, ended animation, exactly one interaction and completion, cleared live slot, zero final velocities and hidden visibility. This exercises the real spring/coordinator/frame/callback pipeline with injected frame production; it does NOT verify native DisplayLink delivery or user-app clicks. Swift build, provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-driven-progress-*). Complete native window move entry, short-distance scoot, visible driver runtime and production Mouse remain incomplete.

### Initial path angle with SlimCore transaction (2026-11-08)

Inspected startup0x100096a24..0x100096a84 and angle writer0x100097124: sample path at0, conditionally write current style angle from unblended local tangent inside SlimCore.withAnimationDisabled(true). Inspected0x101022ecc and resolved three imported stubs: SwiftUI.Transaction.animation.setter, disablesAnimations.setter, SwiftUI.withTransaction. Native true branch constructs transaction with nil animation and disablesAnimations=true; false invokes body directly.

Added separate Swift SlimCore target with generic rethrowing withAnimationDisabled, preserving module/language rather than substituting CoreAnimation or TS. Added prepareInitialMotionAngle: unconditional sampling, conditional disabled-animation style write using the recovered direction angle calculation. Own hidden-window checks false preserves7degrees, true writes134degrees for horizontal tangent/live clickAngle-44, and no progress animation/window visibility is started. Swift build, provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-initial-angle-*). Full startup composition, short-distance path and production Mouse still incomplete; no user app input or visible window operation.

### Long progress startup composition (2026-11-08)

Added startPathProgressMotion to compose native long-branch stages0x1000969d8..0x100096d08: path planning, metrics, initial disabled-animation angle, derived response, progress spring storage, weak/identity-gated event binding, then driver enqueue. Default enqueue calls animation.start(afterDelay:.zero,drivenBy:self). Confirmed original delay getter stub0x10115375c resolves Swift.Duration.zero. Explicit enqueue seam is MainActor to match coordinator/UI ownership; first build exposed the missing closure actor annotation, corrected before verification.

Integrated driven regression now calls this concrete startup method, checking live animation/handlers and initialized angle before enqueue, then deterministic driver frames through final position and callback cleanup. Corrected Swift build, provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-progress-startup-*). Production default NSWindow driver exists but this test injects its frame source. Outer bounds/ownership/scoot selection, full owner move and production Mouse remain incomplete; no visible cursor/user application input is claimed.

### Scoot initial geometry and degree offset (2026-11-08)

Read short-distance branch0x100096d0c..0x100096eb0. Direction is displacement normalized by sqrt sum, with raw configured (sin,cos) click direction fallback below0.001. Compute reset angle using the existing source-exact direction angle math, convert it back to degrees, subtract from current style.angle converted to degrees, then repeatedly wrap to[-180,180]. Store cursorScootBaseRotationOffset in degrees. Added CursorScootGeometry.swift pure extraction plus actual window field binding. No replacement by zero or a radian-valued offset.

Checks cover horizontal direction, normalized negative3/4 direction, coincident fallback,450deg->90,-181deg->179 and actual hidden-window field write45. Swift build, provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-scoot-geometry-*). Scoot spring installation/tick, complete outer move, production Mouse and real application input remain incomplete. No visible window or input actions performed.

### Scoot position spring preparation (2026-11-08)

Restored0x100096eb4..0x100096f90 as prepareScootPositionAnimation. Creates SpringAnimation<CGPoint> using configured scootPositionResponse, scootPositionDampingFraction and scootPositionSettleVelocity, with supplied initial/target points. Writes the dedicated scoot slot, shared interaction handler, shared completion handler and finished-mode satisfied flag in native order. Does not conflate scalar progress spring with point position spring or stop the replaced object where source only releases its reference.

Own hidden-window checks ready value/target, exact slot identity, absence of progress animation, finished suppression, replacement leaving retained old ready animation untouched, closeEnough callback and stored completion closure. Completion closure is explicitly invoked only to check storage, not claimed as real finished animation cleanup. Full Swift build/provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-scoot-preparation-*). Event binding/tick/style auxiliary springs and outermove remain incomplete. No real user app input/visible cursor test performed.

### Scoot finished cleanup (2026-11-08)

Restored0x10009771c..0x1000978dc as finishScootMotion: invoke live interaction handler; clear live scoot position animation and interaction slot; capture then-current completion and clear it; reset satisfied flag; write exact target to interpolated storage and converted/rounded NSWindow frame; clear temporary overlay; reset auxiliary scoot animations; reload style for velocityX/Y zero; invoke captured completion. Does not reuse progress completion because the native paths clear different animation slots and scoot additionally snaps target/resets auxiliary state. No extra per-frame association callback added to final snap.

Own hidden-window reentrant test replaces position animation and completion inside interaction callback. Confirms replacement is cleared without stop, updated completion adopted, target10.5/-2.5 converts/rounds to111/398, progress slot untouched, velocities cleared before completion. Corrected the test's arithmetic expectation before execution. Swift build, provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-scoot-finish-*). Complete scoot frame/auxiliary dynamics, outer move and production Mouse remain incomplete. Only own hidden-window position changed; no user app input.

### Scoot stretch axis and pivot folding (2026-11-08)

Restored0x100099300..0x1000993e4 as cursorScootAxisGeometry. If sqrt(dx*dx+dy*dy)<0.001 or unordered, return axis0 and configured scootStretchPivotX. Otherwise atan2(dy,dx) converted to degrees, pivot starts1. While angle<=-90 add180 and toggle pivot; while angle>90 subtract180 and toggle pivot. The range is(-90,90], including asymmetric vertical direction pivots, not[-90,90]. This is a pure calculation used before auxiliary axis/stretch animation updates; no instantaneous substitute writes introduced.

Checks cover four axes, negative diagonal, zero and NaN fallback. Swift build/provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-scoot-axis-*). Auxiliary spring dynamics and full scoot frame composition remain missing; production Mouse/real user application input still incomplete. No window or input action performed this turn apart from existing hidden-window regression fixtures.

### Scoot per-frame deformation targets (2026-11-08)

Restored0x100097658..0x1000976c4 as cursorScootShapeTargets. Compression scale=1-scootSquashYAmount*(envelope*(1-scootStretchMin)); xScale=1+envelope*scootStretchXAmount; pivot=envelope*axisPivot+(1-envelope)*configuredPivot. Tilt direction scalar=0.75*direction.x+0.62*direction.y, clamp[-1,1] preserving NaN, multiply rotationMax then envelope. Confirmed0.62 comes from the previously saved pow exponent constant at0x100097518, not an unknown config field.

Inspected0x100099bb4: xScale and pivot are written directly, while compression uses the auxiliary stretch spring. This extracted target calculator does not replace those dynamics with instantaneous transforms. Tests cover idle, peak(.82,1.38,pivot1,tilt57), half-envelope vertical tilt23.56, negative saturation-76 and NaN propagation. Swift build/provider-click-self-test, existing native audit and diff checks passed (/tmp/cua-scoot-shape-*). Auxiliary spring update helpers, complete scoot tick and production Mouse remain missing; no visible cursor/application input verification.

### Auxiliary stretch spring lifecycle (2026-11-08)

Restored0x100099bb4..0x100099f6c as updateScootStretch. Write style xScale, cached xScale, fresh style pivot, cached pivot in native order before reading animation slot. Existing non-ended animation (including ready) receives wrapped targetValue update only. Missing/ended creates scalar spring from current cached scale with configured response/damping and idle threshold0.01, stores it, installs weak owner/animation identity-gated events and enqueues with window source. Updated/finished values clamp to configured minimum and1, preserving NaN behavior, write cache then fresh style. Finished event does not clear the slot; the next update rebuilds based on ended state.

Hidden-window tests inject enqueue and manually deliver events: initial state, reuse without reenqueue, ended rebuild, old-event rejection, lower/upper clamps, direct x/pivot storage, NaN propagation. Full Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-stretch-animation-*). This tests lifecycle/event binding, not real display frames. Axis/base/tilt auxiliary dynamics, full scoot frame and production Mouse remain incomplete; no user application input.

### Auxiliary tilt spring and orientation composition (2026-11-08)

Restored0x100099f70..0x10009a27c as updateScootTilt: non-ended scalar animation retargeted; absent/ended rebuilt from cached degree offset with configured rotation response/damping and0.01 idle threshold. Weak/identity-gated valueChanged and finished events cache degree value and call refreshScootOrientation; no extra clamp or finished slot clearing. Restored common orientation helper0x1000993e8: capture style, compute configured reset angle, add degree base offset converted to radians using actual Angle.animatableData getter/setter (resolved imports0x10114fd9c/da8), write captured style angle, then reload style and write tilt angle in radians.

Hidden-window checks creation, reuse without reenqueue, degree30 style write, base15 composition, unbounded finished120, ended rebuild starting120 and rejected stale callback. Swift build/provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-scoot-tilt-*). Base rotation/axis auxiliary dynamics and full scoot event composition still missing; production Mouse/visible display-link and application click verification remain incomplete. No user application input.

### Base rotation and axis auxiliary springs (2026-11-08)

Restored0x100099570 and0x100099804 with separate updateScootBaseRotation/updateScootAxis methods. Both capture cached current degree value, wrap requested-current into[-180,180], and target current+wrappedDelta. Existing non-ended spring retargets; absent/ended creates scalar spring from captured current with respective base/axis response/damping and0.01 idle threshold, weak/identity event guards and window-driven enqueue. Base events update cached base offset then common orientation composition. Axis events update cached axis rotation then fresh style.scootStretchAngle converted to radians. Neither finished callback clears its animation slot.

Own hidden-window tests170 to-170 selects190, event190 writes degree caches and styles, target0 from190 selects360, non-ended reuse does not enqueue, ended objects rebuild, and stale events cannot overwrite new state. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-scoot-angle-springs-*). All four auxiliary update methods now exist, but complete scoot frame/event/startup assembly and production Mouse remain incomplete. No user application input or real display-frame proof.

### Scoot frame and position event composition (2026-11-08)

Composed0x100097410 in applyScootMotionFrame: projection/envelope, corresponding window resolution, position/association writeback, axis geometry/update, shape targets, stretch update, tilt update, fresh style velocityX/Y zero, then finished snap/reset or closeEnough threshold. Added bindScootEvents following0x100097308: weak window/animation load and live scoot slot identity gate before forwarding updated/finished positions; retarget ignored. Auxiliary updates use their own default window-driven enqueue, with explicit test injection.

Hidden-window regression manually emits position events: midpoint writes15/0 and enqueues axis/stretch/tilt in order; target reuses auxiliaries and fires interaction once; finished clears position and auxiliary slots, calls completion once and leaves final30/0. Later stale position event is ignored. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-scoot-frame-*). Driver/source injection and manual events validate composition, not real DisplayLink frames. Scoot startup/outer move/production Mouse and real application input remain incomplete.

### Driven scoot startup integration (2026-11-08)

Composed native short branch0x100096d0c..0x1000970e8 in startScootMotion: prepare direction/base offset; create/store point spring and interaction slots; install weak identity-gated position callback; request base rotation target0; derive/request axis target; enqueue point spring after those auxiliary registrations. Default each animation is zero-delay NSWindow-driven. Explicit test enqueue seams share a deterministic source, without substituting the production source.

Integrated hidden-window test drives real coordinator/spring/frame logic at240Hz to20/10. Verifies initial enqueue order auxiliary/auxiliary/position, multiple position writes, exact endpoint, once-only interaction/completion, cleared position and all auxiliary slots, inactive driver and hidden visibility. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-scoot-startup-*). Both selected motion branches now have composed startup, but shared threshold selection, outer visibility/ownership/origin lifecycle, complete owner.move and production Mouse integration remain incomplete. Simulated frames do not prove live DisplayLink or actual application click success. No user app input.

### Shared short/long motion startup selection (2026-11-08)

Restored0x100096938 entry in startCursorMotion: compute planning bounds before distance test; capture configured scootDistanceThreshold and compare hypot endpoint distance<=threshold; equal uses scoot, unordered comparison uses progress. Pass prepared relative endpoints and corresponding window resolver to composed startup branches. This threshold is independent of straightPathDistanceThreshold inside path planning. Both recovered generated path forms enable the source angle update stage.

Hidden-window enqueue tests set scoot threshold10 and compare exactly10 versus nextUp: first selects two scalar auxiliaries then point spring, second selects scalar progress only; bounds read first in both, no frame delivered before enqueue checks. Explicit reset afterward may invoke native progress finished callback, so fixture records such writes rather than falsely asserting reset cannot move its hidden window. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-motion-startup-*). Outer visibility/relative ownership/previous hotspot lifecycle and full owner.move/production Mouse still incomplete. No real DisplayLink/visible cursor/application click proof.

### Correction: shared point is hosted pet location (2026-11-08)

Scanned pinned text ADRP+ADD references to0x101550708: reader0x100094974, clear0x1001f0638, writer0x1001f62fc. LLDB identifies writer entry as RemoteHostedPIPContentPublisher.setPetLocationWithX(_:y:available:withReply:). Its MainActor body selects supplied coordinates when available, otherwise nil, stores before replying nil error. Lifecycle path clears it. This disproves the earlier provisional description as previous cursor hotspot/history: cursor movement must not overwrite this shared state. Earlier incident entries using previousHotspot terminology are superseded by this correction.

Added HostedPetLocation state/body and clear, explicitly not claiming the full XPC/task wrapper is implemented. Renamed extracted initial-origin and temporary-overlay inputs to petLocation/petLocationExists; retained existing geometry/branch behavior. Tests verify available/unavailable, state visible before reply, lifecycle clear and initial-origin calculation consuming the location without modifying it. Full Swift build/provider-click-self-test, existing static audit and diff checks passed (/tmp/cua-pet-location-*). This changes the next outer-move integration to read external pet state rather than inventing cursor completion writes. Production Mouse/real app input remain incomplete.

### Immediate positioning and final direction (2026-11-08)

Restored0x100094bb4..0x100094e80 as completeImmediateMove: clear temporary overlay, setFrameOrigin with unrounded absolute target, then select bounds/plan relative path and optionally set captured style angle from sampled terminal-blended tangent at1, interaction callback followed by completion. Does not overwrite currentInterpolatedOrigin (outer reset/origin stage owns it), does not enqueue spring or call per-frame association. Outer decision to choose this branch remains separate.

Initial own-window test incorrectly expected NSWindow.frame.origin to equal the fractional argument; AppKit may align the supplied coordinate itself. Corrected fixture to record the exact setter argument while still calling the real own hidden window, verifying no extra rounding in our branch, bounds after position, preserved interpolated cache, final configured angle and callback order. Corrected Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-immediate-move-*). This tests branch behavior; full outer decision/lifecycle and production Mouse/real application input remain incomplete.

### Endpoint window-hit motion suppression (2026-11-08)

Restored0x1000953e4..0x10009557c as cursorMoveEndpointsMissWindow and actual NSWindow binding. Missing corresponding ID returns false without geometry reads. Otherwise each supplied absolute origin becomes hotspot using fresh hotspot.x, fresh frame.height, fresh hotspot.y. Call NSWindow.windowNumber(at:belowWindowWithWindowNumber:0), compare Int to captured UInt32 target. First hit match returns false without second geometry; otherwise second mismatch returns true. No UInt32 trap conversion introduced for the returned signed window number.

Tests cover nil target lazy return, first hit match short-circuit, second hit match, both miss, exact point14/44 then108/230 and two fresh hotspot/frame sequences. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-endpoint-hit-*). Concrete desktop hit binding has not been exercised against real windows; outer move integrates additional animated/visible/screen/same-origin gates later. Production Mouse and real app clicking remain incomplete.

### Outer animation eligibility gates (2026-11-08)

Restored0x100094b44..0x100094bb0 in cursorMoveShouldAnimate and actual window binding. Resolve selectors0x101542518=isVisible and0x101542c40=screen. After visibility association, requested animated=false returns immediately; otherwise fresh isVisible then screen presence, then hidden-before-and-equal-endpoints suppresses animation, finally call endpoint window-hit helper. Previously-visible equal-endpoint moves still reach hit checking. All gate reads remain lazy and ordered.

Regression validates gate combinations and exact visible/screen/hit read sequence, including skipping later queries. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-animation-decision-*). This does not prove actual NSWindow visibility/screen or hit-test runtime; full window move/origin/association composition and owner/Mouse integration remain incomplete. No user application input or visible cursor operation.

### Animated branch appearance restoration (2026-11-08)

Restored0x100094eb4..0x100094f64 as prepareAnimatedMoveAppearance. If the window was already visible, skip this phase entirely. Otherwise set alphaValue1, then query contentViewController/view/layer; if present update GaussianBlur(radius0,hardEdges:nil,normalizeEdges:nil), creating if needed. No await, animation-group completion barrier or extra explicit blur transition is present at this source stage. Subsequent native code proceeds directly to motion startup after logging.

Own hidden-window checks previously-visible preserves alpha0/blur7; previously-hidden restores alpha1/blur0; nil content controller still restores alpha1 without showing window. Full Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-animated-appearance-*). This does not prove a visible fade animation and does not resolve the separately observed hidden fadeOut completion issue. Full outer window/owner move and production Mouse remain incomplete; no user application input.

### Window move geometry composition (2026-11-08)

Added prepareWindowMoveGeometry following0x100094828..0x100094ac4: updateConstraintsIfNeeded/displayIfNeeded, capture visibility and frame, convert CG target with fresh style hotspot reads, conditionally resolve relative CGWindow only when relativeToWindow and ID present, snapshot external HostedPetLocation, choose initial absolute origin, then prepare relative origins/reset old motion. Returns all snapshots needed by subsequent association/decision/startup rather than prematurely ordering window. Resolved selector0x101542e60=updateConstraintsIfNeeded and0x101542458=displayIfNeeded.

Hidden-window regression consumes pet50/60 without modifying it, skips resolver for absolute motion despite ID, verifies initial46x/target96x and cached relative initial, then relative nonanimated lookup7 with frame10/20/300/400 gives x-10/y-580 and equal relative start/target. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-window-move-geometry-*). Full move association, branch decision dispatch and owner integration remain to be composed; production Mouse/real visible input still unverified. No user app input.

### Concrete window move composition (2026-11-08)

Added ComputerUseCursorWindow.move(to:aboveWindowID:relativeToWindow:animated:timing:interaction:completion:) following0x1000946b4. Composes geometry/reset; initial absolute positioning only when previously hidden; temporary pet overlay calculation and association; reconstruct interrupted relative initial origin for hit checking; separate original initial absolute for same-origin gate; immediate positioning/final direction/callbacks or appearance restoration/shared motion startup. Bool returns whether motion started, not application input success. Relative animation callbacks requery window frame only when initial relative window record existed, matching source nil-record short circuit. Default environment uses real AppKit association/hit/visibility/screen and NSWindow animation drivers; explicit environment boundary injection keeps tests hidden.

Integrated hidden-window test calls the actual move method: immediate returnsfalse with association/interaction/completion; animated pet-origin case returnstrue with association/scalar enqueue and deterministic frames to converted target, exactly one interaction/completion, cleared progress slot and stopped driver. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-window-move-*). Environment injection does not verify actual window ordering/hit/DisplayLink. Owner move delegation/continuation and production Mouse still need integration, and real user-app clicking remains unverified. No user application input/visible window ordering performed.

### Owner window-move continuation stage (2026-11-08)

Restored0x100092c48 as moveWindowAndWaitForInteraction, capturing the current window, shared CursorMoveCompletion resumed flag and separate interaction/completion callbacks around concrete Window.move. Await returns on the first permitted interaction/completion, while motion completion separately clears owner.isMoving only for nondelegate calls. Window return Bool is saved after its call returns, matching source output flag write. This is an extracted owner stage; surrounding delegation/appearance/fade logic is not claimed complete.

Integrated hidden-window immediate-path async regression exercises both callbacks against one checked continuation without double resume: nondelegate clears isMoving, delegated call preserves it, both reportfalse and enqueue no springs. Swift build/provider-click-self-test, existing audit and diff checks passed (/tmp/cua-owner-window-await-*). Earlier separate tests cover shared state early-ready versus later completion, but full animated async owner lifecycle and real DisplayLink/Mouse/app input remain unverified. No user application input.

### User clarification: cancellation followed ineffective input (2026-11-08)

The user explicitly confirms they withheld authorization only after repeated operations produced no visible application effect. Cancellation explains termination of subsequent work, not the earlier accepted-but-ineffective clicks. Do not classify this incident as resolved by authorization changes or replay a denied action. Execution connectivity was revalidated separately; it is not application-input acceptance.

Latest existing owned-fixture artifact native-indexed-click-20261107T160921Z-b73c3cf5.json reports savedTextObserved=true for foreground/background indexed and coordinate cases, but scope is owned-fixture-only. Production Mouse.swift still supplies cursorPress:nil, and dispatch diagnostics explicitly set targetResponseVerified=false. Neither fixture success nor a dispatched result establishes that Multica consumed the intended input. Remaining acceptance must correlate actual model tool arguments, selected window/element, native input diagnostics and observable target-app state change.

### First-show fade-in reconstruction (2026-11-08)

Static inspection of pinned fadeIn entry0x1000960f4, continuation body0x1000965d0, alpha closure0x10009e190 and completion0x10009e1f8 confirms: alpha0; install GaussianBlur radius0; explicit blur7-to0; NSAnimationContext alpha1; completion removes GaussianBlur before resuming. No window ordering, orderOut or extra alpha restoration belongs to this phase. Implemented CursorWindowFadeIn.swift using checked continuation and the existing native animation helpers. Added static call-edge pins for preparation, blur transition, alpha closure and completion.

Own hidden-window phase regression verifies model blur0 versus explicit presentation7-to0, preserved nonblur filter, duration0.44, cleanup before callback, no visibility/alpha mutation at completion and missing-content-controller behavior. Initial test build used an unavailable no-argument window initializer; corrected to designated style/configuration initializer. Corrected full Swift build, provider-click-self-test (plain-text success, not JSON), pinned static audit and git diff checks passed (/tmp/cua-fade-in-*). Completion is manually delivered in phase checks; actual NSAnimationContext completion timing is not proven. Owner full move composition, production cursorPress integration and actual target-app input acceptance remain incomplete. No user-app input was attempted.

### Full owner move composition and finish notification (2026-11-08)

Restored public ComputerUseCursor.move(to:aboveWindowID:relativeToWindow:nextInteractionTiming:animated:fadeIn:isDelegate:) entry0x100091f24 by composing existing ownership/delegate prefix, appearance snapshot, concrete window-move continuation and post-await first-show fade gate0x100092a5c. The fade gate is !started && (animated || fadeIn) && !wasVisible. It reloads the current owner window before awaiting fadeIn. Completion notification resolves through initializer0x10009002c to literal computerUseCursorDidFinishMove at0x101242aa0, not computerUseCursorLocationDidChange. It posts on both fade/no-fade exits. Notification denotes completion of this async invocation; early interaction threshold can return before the motion completion clears isMoving.

Added exact notification constant and native entry, all16 fade-gate combinations and own hidden-window integrated owner regression. Nondelegate checks target assignment before delegate, isMoving before association, cleared state before finish notification and exact delegate/associate/finish order. Delegate invocation skips ownership/delegate updates and preserves existing target/isMoving. Full Swift build/provider-click-self-test and pinned audit/diff checks passed (/tmp/cua-owner-move-*). Initial static literal check used30 instead of31 bytes including terminator; corrected after reading exact bytes. Added tail-call and literal pins. Tests keep association hidden; no real AppKit fade completion/DisplayLink or user-app input acceptance is proven. Production cursorPress remains nil and full press/Mouse integration is outstanding.

### Application-controller cursor ownership (2026-11-08)

Revalidated current tree: CursorPress.swift, StyledVirtualCursor and VirtualCursor already implement the recovered press loop/protocol. Earlier statements that press itself still needed restoration were too broad; missing production ownership/positioning/wiring is the relevant boundary. Press changes style and cannot itself prove application event delivery.

Static inspection createVirtualCursorIfNeeded0x10006ecd8..0x10006eeec confirms cached return; otherwise call current style factory, create owner with live configuration, publish into controller slot before corresponding PID/window monitor setup. Recovered factory does not assign a new delegate. Added Target.virtualCursor and AppControllerVirtualCursor.swift factory composing existing setCorrespondingApplication. Optional make/bind boundaries support own hidden fixtures; defaults call actual owner/monitor construction. No eager creation or production mouse changes introduced before the remaining positionElement flow is traced.

Regression calls real factory with current style counter and injected monitor binding. Verifies one creation/bind, PID, owner/style identity, slot publication before bind and reentrant cached lookup, repeated lookup skips factories, no window shown. Full Swift build/provider-click-self-test/static audit/diff checks passed (/tmp/cua-controller-cursor-*). Audit pins owner constructor, application construction, monitor constructor and positionElement's factory call. These checks do not exercise actual PID monitor success or app input. Production mouseInput cursorPress:nil and source-equivalent positionElement integration remain outstanding.

### positionElement geometry-before-cursor prefix (2026-11-08)

Pinned positionElement0x1000735b8 calls UIElementProtocol.clickablePoint(scrollToVisible:true) at0x10007364c, capturing optional point and didScroll. Before lazy cursor creation, source0x1000736e0 exits on missing point, source0x1000736ec exits on optional timing tag2, then evaluates computerUseCursor feature flag. Early return extracts didScroll from result payload, not a cursor/input-success Bool. This contrasts with existing production no-argument clickablePoint which explicitly requests false. Native scrolling implementation is not yet wired/restored; do not replace it with unconditional AXScrollToVisible or claim prefix alone fixes offscreen input.

Added prepareElementCursorPosition returning geometry/timing eligibility and didScroll, with explicit async geometry and feature boundaries. It always requests true before gates, propagates geometry errors even with nil timing, and reads feature only after point/timing exist. This is an extracted prefix, not the full controller positionElement method. All16 combinations plus suspension/error propagation passed provider-click-self-test; Swift build, static true-argument/feature-call pins and diff checks passed (/tmp/cua-position-prefix-*). Subsequent controller window selection, movement/focus and original scroll implementation remain to be connected before production Mouse integration or real-app acceptance. No user application input performed.

### Native scroll ancestor planning and execution (2026-11-08)

Traced clickablePoint's scroll call to UIElementProtocol.scrollToVisible(frame:)0x10079f380. Ancestor collection calls boundary helper0x1007a0654 (window/sheet/menu/popover), considers AXScrollToVisible action, then cell writable scrollToVisible attribute, and independently scroll-area frame handling. A prior action/attribute request suppresses higher action/attribute requests until crossing a scroll area. Source rereads scroll-area role for carry-state calculation. Operations are prepended, not appended:0x1007a3880 receives range0..<0/replacementCount1 and moves trailing48-byte elements. Thus outer containers execute before inner elements.

Added generic collector and executor in UIElementScrollToVisible.swift. Executor accumulates frame-helper Bool without skipping later operations; action/attribute success sets requested. Actual operation errors propagate; only final geometry polling errors are ignored, matching0x10079fd6c..fd78. Native frame adjustment, poll condition/timing binding and actual UIElement ancestor reads are still pending; closures represent those boundaries rather than fake AXScrollToVisible-only fallback.

Regression verifies nested plan frame4/attribute3/frame2/action0, final poll and suppressed poll error, boundary short circuit, all-false frame helpers, operation error stopping subsequent work. Swift build/provider-click-self-test/pinned static calls/diff checks passed (/tmp/cua-scroll-plan-*). No real scroll, user-app input or production Mouse change occurred. Full source-equivalent scroll wiring remains necessary before positionElement integration.

### Scroll carry-state correction and fresh-center polling (2026-11-08)

Further traced0x10079f7c0: carry-state reset calls existing uiElementClipsChildren0x1007a04d4, not an isolated scrollArea comparison. That shared helper includes a group exposing page-scroll actions. Corrected collector to receive clipsChildren separately from isScrollArea (only the latter adds a frame operation). Earlier scroll-plan entry's reset description is superseded. Added regression where a clipping group resets suppression without itself generating a frame operation, allowing an outer cell attribute request.

Restored final poll condition0x1007a19e0: uncached AXFrame read, uncached clipping-frame read, then CGRectContainsPoint of the CURRENT element center. Missing element frame short-circuits clipping read; missing clip returnsfalse. Poll sites use timeout0.5 and pinned constant0x10116b2e0=0.025 seconds. Added UIElement.pollScrollCenterVisible binding using existing uncached attribute/clipping and wall-clock synchronous polling; executor already ignores only final poll errors. Tests cover fresh flags/read laziness, missing clip, center visible even when whole element is not contained, and outside center. Swift build/provider-click-self-test/static pins/diff checks passed (/tmp/cua-scroll-visibility-*).

Static scroll-frame helper0x1007a08d8 additionally shows invalid/infinite/empty target/missing container/already-contained guards, scrollbar lookup/normalization and native value writes, still under reconstruction. No actual scrolling or target application input was performed; these additions do not establish production Mouse success.

### Scrollbar axis normalization (2026-11-08)

Resolved native axis tuple key paths: first height/minY/maxY, then width/minX/maxX. Min/height accessors via chained slots0x101461c30/28/20 point at0x10075424c/248/244, which tail-call CGRectGetHeight/MinY/MinX; remaining maxY/width/maxX keypath relative accessors0x10119690c/964/9b4 resolve to0x1007a1ad4/d8/dc. This establishes the register meanings before extracting arithmetic, rather than guessing axes from register names.

Added scrollBarPositionForVisibleTarget following per-axis containment0x1007a0f0c and calculation0x1007a153c..16cc. Skip contained axis or nonpositive/unordered contentSize-viewportSize. Small targets center using half(sum of target edges minus viewport edges). Oversize targets align leading overflow first, otherwise trailing overflow. Existing normalized value clamps0..1 before multiplying range; missing value infers offset from viewportMin-contentMin clamped to range. Add delta, clamp resulting offset, divide by range. Explicit comparisons preserve native NaN propagation for unavailable/NaN numeric-value scenarios rather than adding a new validation policy.

Regression validates independent expected results0.675/0.3/0.4375/0.6875, missing-value inferred0.8, clamping, nonpositive/unordered range, contained axis and NaN behavior. Swift build/provider-click-self-test/static keypath/arithmetic pins/diff checks passed (/tmp/cua-scrollbar-position-*). AX scrollbar selection/enabled/content geometry/value reads and native writes still need composition with this kernel. No actual scroll or application input performed; production acceptance remains outstanding.

### Scrollbar provider-aware value writer and frame guards (2026-11-08)

Traced frame helper0x1007a1738 to native ScrollBar setter0x1007290bc: encode CGFloat using shared Any-to-AX encoder0x1006ea3e4, then provider-aware AXUIElement.setValue0x1006f74e4 for AXValue; setter adds no clamp/support-query/cache mutation. Added ScrollBarUIElement.setValue composing existing uiElementSetValue and actual AXUIElement provider-aware witness by default. Explicit write boundary tests encoded values without sending input. Frame prefix0x1007a0970..0x1007a0a00 restored as prepareScrollFrameAdjustment: infinite/empty target, missing viewport or already-contained target returnsnil with lazy viewport read.

Regression verifies numeric bridge of-0.25/0.5/1.25/NaN without setter clamping, exact attribute/element identity, write error propagation, invalid frame lazy exit, missing/containing/partial viewport. Initial fixture incorrectly used no-argument UIElementCache initializer; corrected to explicit fields. Corrected full Swift build/provider-click-self-test/static call pins/diff checks passed (/tmp/cua-scrollbar-write-*).

Frame helper still needs scrollbar enabled reads, content geometry helper0x1007a1ae0 and numeric current-value handling composed. Source also calls generic range clamp0x1007a3308 between normalized arithmetic and setter; its unordered semantics must be audited before claiming full end-to-end numeric parity. No production scroll or user-app input was performed; production Mouse integration and target-app response acceptance remain outstanding.

### Final normalized clamp and axis application composition (2026-11-08)

Resolved0x1007a3308 import stubs0x101153330/348 via chained GOT slots0x101468228/238 to Swift.max and Swift.min. Arguments are max(value,0) followed by min(intermediate,1). Own Swift CGFloat check confirms NaN remains NaN in this argument order; no invented NaN-to-zero policy. Added clampScrollBarPosition and applyScrollBarPosition composing overflow gate, deferred content geometry, deferred current value, recovered arithmetic, exact final clamp and throwing write. Geometry/value reads remain after overflow gate but before range guard, matching source ordering; the arithmetic helper remains independently usable.

Regression covers final finite/infinite/NaN clamp, contained-axis lazy read suppression, content/value/write order, zero range still reading geometry/value, expected0.675 calculation, missing-value0.8 and write failure propagation. Full Swift build/provider-click-self-test/static imported-symbol and call-edge pins/diff checks passed (/tmp/cua-scrollbar-application-*). No actual scrollbar read/write was performed. Source content-geometry helper0x1007a1ae0 is a substantial child-tree walk and remains under reconstruction; do not substitute a simplistic child union before auditing its role/attribute branches. Production scroll/Mouse integration and actual target-app acceptance remain incomplete.

### Scroll content subtree traversal (2026-11-08)

Recovered content-geometry helper0x1007a1ae0..0x1007a3308 high-level traversal from inlined cached/AX reads. Initialize pending with root children, bounds CGRect.null, visitedSet. PopLast, skip scrollBar before visited insertion, skip duplicate nodes, obtain frame through AXFrame with position/size fallback, union only nonempty frames. Then fresh role reads stop descent into scrollArea, or group with page-scroll actions; other nodes append children, preserving LIFO. Confirmed group predicate0x10079d420 builds page-action set, not an unrelated role/property test. Root's own frame is excluded; nested scrolling container contributes its frame but not its descendants.

Added uiElementScrollContentFrame and concrete UIElement.scrollContentFrame using existing provider frameValue/childrenValue/hasScrollAction; no substitute raw AX traversal or custom depth cap. Regression validates exact LIFO frame/children reads, cyclic/duplicate ordinary group, scrollbar subtree exclusion, nested scrollArea/group exclusion, ordinary group descent, empty result CGRect.null and missing-frame continued descent. Swift build/provider-click-self-test/static call pins/diff checks passed (/tmp/cua-scroll-content-*). Actual live AX tree execution and original reader diagnostic-log parity are not established by these injected-node regressions. Full enabled/value/axis composition and production Mouse integration remain incomplete. No application input was performed.

### Dual-axis scroll-frame composition (2026-11-08)

Revalidated enabled Bool? source0x1007a0dac..dd8 /0x1007a14a0: explicitfalse skips axis, absent/tag2 continues. Added adjustUIElementScrollFrame composing target/container guards, vertical-then-horizontal scrollbar lookup, lazy enabled check, per-axis overflow, fresh content geometry per overflowing axis, current-value read, recovered normalization/final clamp and throwing write. Missing scrollbar/disabled bar skip without later reads; a successful vertical write does not skip horizontal; write error propagates before next axis. Concrete AX readers are still explicit boundaries, not silently replaced by optional casts.

Integrated regression validates exact two-axis viewport/bar/enabled/content/value/write order and0.675 result each axis; disabled vertical with horizontal inferred0.8; invalid target skips all readers; first-axis write error stops horizontal lookup. Full Swift build/provider-click-self-test/existing pinned audit/diff checks passed (/tmp/cua-scroll-frame-adjustment-*). This tests composition, not live scrollbar interaction. Scalar current-value provider accessor and concrete frame/ancestor execution wiring remain pending before production positionElement/Mouse input acceptance. No user-app action was performed.

### Concrete AX scroll-frame composition and NSNumber accessor (2026-11-08)

Pinned current-value decoder wrapper0x100713e78 supplies NSNumber class through imported slot0x10151ee98 and calls generic CF-first decoder0x1007144d0. Added decodeAXNumber preserving AXUIElement/marker/range/AXValue/CFArray branches before ordinary NSNumber bridging. Added UIElementProtocol.numberValue composing existing cached lookup, known-unsupported policy, uncached provider read and reporting behavior, analogous to recovered Boolean accessor. Cached decode miss falls through; throwing uncached mismatch reports once/nil; ignoring mismatch returnsnil silently.

Added UIElement.scrollFrameToVisible concrete binding: provider-aware viewport frame, typed vertical/horizontal scrollbar lookup, cached/uncached Boolean enabled, recovered content subtree geometry, NSNumber current AXValue to CGFloat, and provider-aware scrollbar setter. Defaults call actual native APIs; helper alone does not perform its own final geometry polling (outer scrollToVisible owns that stage).

Regression verifies numeric bridge, valid cache prevents AX read, invalid cached type falls through to fresh numeric result, strict uncached mismatch reports once, ignore mode suppresses mismatch. Existing dual-axis composition regressions also pass. Full Swift build/provider-click-self-test/static NSNumber import/decoder call pins/diff checks passed (/tmp/cua-scroll-frame-composition-*). Live AX scrollbar behavior still unverified; ancestor-plan concrete execution and scrolling clickablePoint/controller positioning/production Mouse wiring remain outstanding. No user application input performed.

### Concrete ancestor scroll and scrolling clickablePoint entries (2026-11-08)

Static isAttributeSettable0x1007b029c directly invokes provider-aware AX settable query and suppresses errors tofalse, without supported-attribute preflight/report. Added exact protocol helper. Resolved scroll attribute initializer0x10079c850 to literal AXScrollToVisible. Added UIElement.scrollToVisible(frame:reportError:) binding recovered ancestor collector to actual role/action/parent/settable getters, action dispatch, Boolean scroll attribute write, concrete dual-axis helper and best-effort fresh-center polling. No synthetic coordinate fallback or arbitrary scroll retry budget added.

Added clickablePoint(scrollToVisible:reportError:) composing chess preferred point, frame-before-scroll, concrete scroll operation, fresh frame/clipping rereads and didScroll. Existing no-argument provider clickablePoint now delegates explicitlyfalse, preserving source semantics. Updated stale no-argument system-entry comment. Controller positionElement can now requesttrue instead of fabricating a scroll result, but is not yet wired.

Integrated regression executes a frame/action plan that changes geometry, then verifies poll followed by fresh frame/clip reads, post-scroll center30/40 and didScrolltrue. Full existing clickable-point regressions also pass. Initial composition build failed inference around nonexistent .cell convenience property; fixed explicit generic operation type and AXCell role value. Corrected Swift build/provider-click-self-test/static settable audit/diff checks passed (/tmp/cua-scroll-entry-*). No live scrolling/application input attempted; real AX flow remains unverified. Production controller positioning and Mouse cursor connection are still outstanding.

### Controller element-position orchestration (2026-11-08)

Confirmed native positionElement ends0x1000743bc, returning original didScroll after move/fade/finish notification. Subsequent async entry0x1000746a8 belongs to a separate operation; do not incorrectly append its focus/tree work to positionElement. Source reads axTree.systemSelection's window ID only after lazy cursor creation. Inlined owner move uses relativeToWindow=true, requested timing/animation, fadeIn=false and isDelegate=false.

Added positionElementCursor orchestration and Target.positionElement adapter: real scrolling clickablePoint, lazy feature gate, lazy per-controller cursor construction, caller-supplied observation selection lookup, composed owner.move await, return preserved didScroll. Selected-window closure deliberately represents the original tree selection boundary; no heuristic focused/hit-window substitution introduced. The original RefetchableSkyshotAXTree object is not reconstructed by this adapter, and production Mouse callers are not yet wired.

Integrated own hidden-window regression calls actual owner.move and validates geometry/feature/cursor/selection/move order, selected target7 and moving-state transitions, preserved didScrolltrue, nil timing skipping feature/cursor/selection and disabled feature returning didScrollfalse. No real window ordering or animation performed. Full Swift build/provider-click-self-test/static relative/fade/inlined-window-call pins/diff checks passed (/tmp/cua-element-position-*). Actual selection lifecycle, real DisplayLink/fade and target application input acceptance remain outstanding.

### Typed application/window selection storage (2026-11-08)

Inspected SystemSelection accessors0x10023cbac/cbf0/cc34: selection stores applicationWindow reference, windowRevision reference and optional invalidationMonitor. ApplicationWindow.id0x10077f1b8 reads CGWindow's stored window number; it does not resolve current AX focus. Source ApplicationWindow designated initializer0x10077f394 stores CGWindow payload, WindowUIElement and ApplicationUIElement. Symbol accessors confirm cgWindow/axWindow mutable, axApplication getter-only.

Added ApplicationUIElement typed wrapper with existing shared provider/cache construction (PID constructor creates AX application handle then shared wrapper), plus ApplicationWindow concrete reference owner of NativeWindowDescription/typed AX window/typed AX application and computedid. NativeWindowDescription already reconstructs CGWindow logical payload. This adds the designated-storage path only; failable AX-window/window-ID resolution constructors, full SystemSelection/invalidation monitor and observation publication are not claimed implemented.

Regression uses own AX handles with explicit caches and no native reads: shared ApplicationWindow reference sees CG payload replacement ID7-to9, AX-window replacement while application identity remains stable. Full Swift build/provider-click-self-test/static ID-load pin/diff checks passed (/tmp/cua-application-window-*). This does not prove live selection lifecycle or app input; production Mouse still not connected to the reconstructed cursor.

### AX window resolution stages and constructor boundary (2026-11-08)

Traced ApplicationWindow AX initializer0x10077f1e8 to resolver0x10071f47c. AX windowID errors are suppressed; missing direct CG description continues fallback. Ordinary fallback0x10071fe90 onward filters source-order candidates by applicationPID and exact CGRectEqualToRect. If fewer than2 matches, return first regardless of title. Otherwise filter nonnil CG window name by exact AX title; no title matches returnsnil. If multiple title matches remain, emit ambiguity diagnostic then returnfirst (not a terminal ambiguity error). This differs from demo capture selection's tolerance/strict rejection; existing capture policy is not silently reused or changed.

Added resolveAXWindowDescription ID-first stage, matchAXWindowDescription ordinary candidate selection and failable ApplicationWindow AX constructor with mandatory full-resolver dependency. No ID-only default hides still-missing fallback behavior. Original resolver also contains scrollArea/Finder desktop handling, geometry/title/app resolution and candidate enumeration, still to compose.

Regression verifies direct lookup laziness, ID error fallback, missing result, unique geometry despite title mismatch, title narrowing, stable duplicate first with ambiguitycount2, missing title match, PID mismatch and exact0.1-frame mismatch. Swift build/provider-click-self-test/static calls/diff checks passed (/tmp/cua-window-resolution-*). No live AX window resolution or application input performed; selection lifecycle and production Mouse integration remain outstanding.

### Desktop/ordinary window fallback composition (2026-11-08)

Resolved source desktop path: for scrollArea, get application PID and running application bundle; Finder searches on-screen windows for first same-PID level-key18 match (CGWindow.isDesktopLevel source0x10025bcc4). If none, continue ordinary resolution. Ordinary path requires nonempty frame and a cached nonnil title before reading application PID (failure defaults0). Default candidate helper0x10071f2dc enumerates options0x11 (on-screen/exclude desktop), rejects level>=key8 and current process, then performs recovered exact matching. Missing cached title is terminal for this path even if a unique geometry match would otherwise exist; do not fabricate an empty title for absence.

Added resolveAXWindowDescriptionFallback, real WindowUIElement.applicationWindowDescription composed with ID-first lookup, provider frame reads, cached title, running-app identity and CG enumeration; ApplicationWindow gets a concrete failable AX-window constructor overload. Existing injected full-resolver overload remains for regression boundaries. Logger wording is readable reconstruction, not an exact original obfuscated diagnostic string.

Regression validates Finder desktop early return without frame/title reads, ordinary PID-error0 fallback and exact frame/title/PID/enumeration order, missing-title skipping PID/enumeration. Swift build/provider-click-self-test/static enumeration/level/own-process pins/diff checks passed (/tmp/cua-window-fallback-*). These injected cases do not verify live desktop selection or original diagnostics. Other throwing window-ID/CG-only constructors, SystemSelection invalidation/publication and production Mouse remain outstanding. No user-app input performed.

### Native tree invalidation monitor (2026-11-08)

Traced UIElementTreeInvalidationMonitor init0x10076ae48, event body0x10076b1e0 and deinit0x10076b518. State is OSAllocatedUnfairLock of layoutChanged=false and empty Set<AXUIElement>. Constructor resolves app PID, constructs observer, registers layoutChanged then uiElementDestroyed on application with empty ignored-errors arrays, starts utility QoS(raw17), stores optional observer. Any setup failure is suppressed, leaves state alive and observernil; registration failure does not start monitoring. Event closure captures state lock rather than monitor owner. Layout notification latchestrue; destroyed inserts element. Teardown stops observer before releasing it.

Added concrete monitor and generic setup boundary for regression, using existing AXNotificationObserver/OSAllocatedUnfairLock. Original verbose per-event logging is not reproduced exactly. Tests verify subscription/QoS order, setup failure stops subsequent startup, PID failure yields nilobserver with initialized state, destroyed-set deduplication, layout latch and unrelated-event state preservation. Full Swift build/provider-click-self-test/static call/QoS pins/diff checks passed (/tmp/cua-tree-invalidation-*). No actual native subscription delivery or monitor teardown timing acceptance attempted. SystemSelection/refetchable tree publication and production Mouse remain incomplete; no user-app input performed.

### Observation selection owner storage (2026-11-08)

Previous turn revalidated execution and cancellation chronology but made no implementation progress. Revalidated current source and advanced the missing observation-window boundary. Static SystemSelection accessors0x10023cbac/cbf0/cc34 read offsets0/8/16 with setters/modify; reconstructed as a value struct containing mutable ApplicationWindow, UIElementTreeRevision<TransformedUIElement> and optional invalidation monitor references. It is not a reference-class snapshot or a substitute focused-window lookup.

RefetchableSkyshotAXTree init0x10022e5e4 merely stores that selection and immutable diffing flag, despite its throwing signature. Added this concrete storage owner and applicationWindow getter0x10022e5a0 that resolves the current selection on every access. Added Target.positionElement overload accepting this owner and deferring its actual selection-window ID read through existing position orchestration. No observers, AX fetching or focus inference invented in the constructor. Refetch methods and throwing invalidationMonitor getter remain unimplemented; storage restoration is explicitly partial.

Regression verifies copied selection field replacement does not change original fields; shared window payload mutations remain visible through retained references; replacing owner selection changes subsequent window/revision lookup; both diffing flag values preserved. Swift build, full provider-click self-test, pinned static audit and diff whitespace checks passed (/tmp/cua-selection-storage-*). This does not establish live observation publication or app input acceptance: production Mouse still has cursorPress:nil, and real app state changes remain unverified. No user-app input or canceled-action replay performed.

### Refetch decision and validity policy (2026-11-08)

Previous goal turn made implementation progress in selection storage. Revalidated it and inspected native refetchElementIfNeeded0x10022e910..0x10022ed10. Source first requires monitor, copies layoutChanged plus destroyedElements under one lock, unlocks before expensive work, and does not reset either field. layoutChanged short-circuits identity reads; otherwise tests target AX identity membership. Invalidated paths call separate helper0x10022ee20 with ignoreValueChange, without the validateElement check used on unchanged paths. Unchanged paths only query AXRole when validateElement=true and only raw AXError -25202 (invalidUIElement) fails; other role-read errors do not force refresh/failure. Return wrapping occurs last.

Added resolveRefetchableElement with explicit state/error/refetch/wrapper boundaries rather than inventing unfinished source refetch algorithms or original error case names. Added concrete monitor invalidationStateSnapshot copying both fields in one lock. Regression covers all16 layout/destroyed/validate/ignore combinations, lazy getter ordering, invalidUIElement versus cannotComplete/attributeUnsupported/success, state/error and refresh/error propagation, and immutable snapshot versus persistent live latches. Full Swift build/provider self-test/static branch/field/error pins/diff checks passed (/tmp/cua-refetch-resolution-*). Concrete RefetchableUIElement, missing-monitor error mapping, refresh lookup/diff helper and production interaction wiring remain incomplete. No actual application input was performed, so this is not a repair acceptance claim.

### Refetched element attribute comparison (2026-11-08)

Previous goal turn progressed invalidation policy. Revalidated current state, inspected refresh helper0x10022ee20 calling comparison0x10022f734, and recovered full comparison body through0x10023018c. Existing protocol audit maps AccessibilityNode witness slots, including placeholderValue0xd8; direct UIElementProtocol subrole slot0x38 must not be confused with AccessibilityNode roleDescription0x38.

Added refetchableElementMatches over actual UIElementProtocol conformers: compare candidate then prior role, subrole, roleDescription, title, value (read both even if ignoreValueChange), valueDescription, description, placeholderValue, help, identifier and optionalURL. A value mismatch is permitted only when ignoreValueChange=true; other attributes remain required. All earlier comparisons short-circuit. URL uses Foundation Equatable; nil versus nonnil differs. This comparison does not compare AX identity or selected/enabled/focused flags, and is not itself a candidate-search algorithm.

Regression uses explicit AX caches without fresh native reads; verifies each of11 individual field mismatches/missing values, ignore-value scope, missing versus empty title, different identity with matching attributes, unchanged comparison despite enabled/focus-only changes. Swift build, provider self-test, new comparison-slot/error-branch pins and inherited protocol mapping audit passed (/tmp/cua-refetch-match-*); diff whitespace check passed. Actual refresh tree generation/path lookup, error mapping, RefetchableUIElement and production Mouse wiring remain outstanding. No target-app operation or denied-action replay was performed. These checks do not prove the reported real app click failure fixed.

### Recovery orchestration and full-window matching (2026-11-08)

Previous turn progressed comparison recovery. Revalidated it and inspected0x10022ee20..0x10022f734 plus0x100230190. Initial progress wording anticipated path lookup; source instead reconstructs the same concrete conformer from its AX handle and compares observed attributes. On equality return freshly constructed element without reading old selection or refetching tree. On mismatch search old selection with ignoreValueChange=false, require exactly one match, then invoke refetchTree once and search returned selection with caller's ignoreValueChange. Zero new matches and multiple new matches are distinct failures; neither picks the first candidate nor retries. Source error payload values are old-nonunique1, refreshed-none4, refreshed-multiple2; original enum/wire names remain unmapped.

Added recoverRefetchableElement preserving this orchestration, with explicit reconstruction/refetch/wrapping/error-map dependencies until those concrete implementations are recovered. Added SystemSelection.elementsMatching over actual windowRevision.tree, using the existing full iterator/comparator, preserving all duplicates/order. Verified tree field offset by comparing0x10023029c to named UIElementTreeRevision.tree getter0x100654904, both metadata0x68. It does not search focusTree or use coordinate/focus/path guesses.

Regression covers fresh fast exit, both ignore flags across old/new counts0/1/2, strict old-lookup flag, operation order, missing/ambiguity distinctions and refetch error propagation. Actual transformed-element selection tests verify full-tree match, excluded focus-only match and duplicate retention. Initial generic test compilation inferred Never from failure-only closures; added explicit Int result annotations. Corrected full Swift build/provider self-test/pinned static audit/diff checks passed (/tmp/cua-refetch-recovery-*). Concrete tree capture/diff/publication, error mapping and RefetchableUIElement/production Mouse remain incomplete. No actual target application input occurred and real click success is not claimed.

### Refetchable element reference owner and post-write refresh (2026-11-08)

Previous turn progressed recovery orchestration. Revalidated it and inspected RefetchableUIElement constructor0x1002313d0 through generic storage0x1002322c0, accessors0x100231484/1538, refresh0x100231604 and setter0x1002316ec. Source owner contains mutable UIElementProtocol existential and immutable strong tree reference; AX/cache getters delegate to current underlying value. refetchIfNeeded resolves through containing tree, then replaces only element with returned wrapper.element, after successful resolution. setValue calls underlying protocol witness first, skips refresh on error, otherwise calls refetchIfNeeded(validateElement:true,ignoreValueChange:true). Post-write refresh failure propagates without undoing successful underlying write. Raw AX initializer0x1002317a4 traps with Unimplemented; do not fabricate a usable default construction there.

Added RefetchableUIElement concrete storage owner, delegated AX/cache accessors, refetch replacement and post-write sequencing with explicit resolver dependency. Full UIElementProtocol conformance/default tree resolver is deferred rather than silently invoking an incomplete tree capture or using stale input. Constructor/owner semantics match source; explicit resolver parameter is a temporary integration boundary and not claimed as public API parity. No fake raw AX initializer provided.

Regression verifies all validate/ignore flags, shared wrapper identity, changed AX/cache forwarding, containingTree stays original even if resolver returns a wrapper from another owner, write-before-refresh flags/order, write error skipping refresh and refresh error preserving original reference after successful write. Injected probe conforms to actual UIElementProtocol and records the real delegated setter call without performing app input. Swift build/provider self-test/pinned storage/delegation/error/flag audit/diff checks passed (/tmp/cua-refetch-wrapper-*). Tree capture/diff/publication, concrete resolver, full wrapper conformance and production Mouse wiring remain unverified/incomplete; reported target-app click failure is not accepted as fixed.

### Capture tree cache prerequisite (2026-11-08)

Previous goal turn progressed refetchable wrapper storage/write behavior. Revalidated state and inspected full native refetchTree0x1002305ec..0x100231298. It calls ApplicationUIElement.focusedUIElementContext (errors propagate), then includes capture/extraction work with TransformedUIElement.TreeCache, AX enablement, focused element handling and monitor creation, publishing selection only near0x100231210. Full capture is not restored by simply assigning a synthetic selection or plugging in a demo window lookup. Focus-context handling also remains missing; no default capture callback was invented.

Restored actual TransformedUIElement.TreeCache value prerequisite from initializer0x10076c9f8..0x10076ca58 and getters0x10076d2a8/d2b4/d2e4: immutable full tree, complete UIElementTreeTransaction value, same strong invalidation-monitor reference. The adjacent large withSubtreeTransaction body starts0x10076ca5c and is not part of its constructor. No cache TTL, automatic refresh or fresh-transaction substitution added.

Integrated regression uses an existing provider-prefetched transaction: reuse through cached transaction makes ordinary UIElement construction see captured AXButton role and role frequency with no second hierarchy read; scoped TaskLocal restores after exit; later destroyed-element event remains visible through retained monitor. Swift build/provider self-test/pinned field offset/monitor storage audit/diff checks passed (/tmp/cua-tree-cache-storage-*). Cache type is implemented, not yet consumed by a complete refetchTree/capture routine. Default resolver, full wrapper protocol conformance and production Mouse remain incomplete; no live target-app interaction or click repair acceptance claimed.

### Typed application primary-window entry (2026-11-08)

Previous goal turn progressed TreeCache storage. Revalidated source and inspected ApplicationUIElement.focusedUIElementContext0x1007861d0: it first requires primaryWindow and throws when none. Focus-cache/fresh-attribute/error/context assembly is a separate missing dependency; no fabricated default FocusedUIElementContext added.

Revalidated primaryWindow0x1007161c4: focusedWindow first, mainWindow second, windows.last fallback. Array address at0x100716224 is base+count*32 (header32 plus last index*32), not windows.first. Existing applicationPrimaryWindow helper already implemented this rule and is reused. Added ApplicationUIElement focusedWindow/mainWindow/windows/primaryWindow typed getters, CF-first WindowUIElement decoder and cached/uncached window accessor. Focused getter supplies WindowUIElement metadata at0x1007189e4 and calls generic decoder0x100712f84 with lenient cached decoding; existing strict uncached value machinery preserves errors/support checks. No AXRole preflight inferred from static Window role; construction uses original WindowUIElement initializer/current transaction.

Regression validates lazy focused/main/final-last ordering, nil/one/multiple windows, cached window avoiding native reads, malformed cache falling through to fresh read, strict uncached mismatch reporting and known-unsupported skipping read. Build initially failed from a colliding existing test name; restored existing actor test name/call and gave new typed-accessor check a distinct name. Known-unsupported test uses nonempty supported-set excluding attribute (empty means unknown in original policy). Corrected Swift build/provider self-test/static selection/decode pins/diff checks passed (/tmp/cua-primary-window-*). FocusedUIElementContext itself, full capture/refetch, default resolver and production Mouse still incomplete. No live app input or repair acceptance claimed.

### Focused context owner, constructor and original error names (2026-11-08)

Previous turn progressed typed application windows. Revalidated source, inspected context construction0x100787560..0x1007876f8 and getters0x100786814..0x1007869c4, then parsed Swift reflection descriptors0x1012cd2d0/0x1012cd2ec. Context stores exactly optional UIElement plus ApplicationWindow reference; app/window/cgWindow are computed via shared owner, not separately captured snapshots. Nested Error cases exactly noAppNameMatch(String), noFrontmostApp, noWindowsAvailable, cgWindowNotFound, invalidProcessIdentifier. Reflection confirms only first case has payload SS; no fabricated enum names needed here. Payload constants at0x101159da0 (0,1) and0x10115bf00 (0,2) match missing-window versus missing-CG branches.

Added FocusedUIElementContext storage/computed accessors and concrete constructor resolving window CG description via already restored AX resolver, throwing original cgWindowNotFound on absence, then building ApplicationWindow. Explicit resolver overload supports regression; normal reportError overload invokes the real resolver. Optional focused element remains nil when supplied nil; it is not synthesized from window/application. This restores construction, not yet ApplicationUIElement.focusedUIElementContext focus lookup/error flow or frontmost/app-name constructors.

Regression checks one CG resolution, original AX app/window/element handles, shared-owner changes observed by copied context, nil focused element, and exact cgWindowNotFound error. Full Swift build/provider self-test/new reflection field/case/payload pins/existing static audit/diff checks passed (/tmp/cua-focused-context-storage-*). No user-app input performed. Full focus lookup, capture/refetch/default resolver and production Mouse integration remain pending; reported click issue remains unverified.

### Application focused-context entry composition (2026-11-08)

Previous goal turn progressed actual context storage/construction. Revalidated native ApplicationUIElement.focusedUIElementContext0x1007861d0..0x1007867d4 against existing shared cached/uncached attribute readers: primaryWindow first; missing window throws original noWindowsAvailable without reading focused element. AXFocusedUIElement cached decode is lenient (0x1007862f4), fresh decode strict (0x100786500), known-unsupported skips read, and fresh read/decode failures are logged then treated as absent focus. It then always resolves/constructs FocusedUIElementContext with optional focused element, propagating CG-window construction failure. Do not turn a focused-attribute read error into noWindowsAvailable or suppress cgWindowNotFound.

Added actual ApplicationUIElement.focusedUIElement getter and focusedUIElementContext() composition using typed primaryWindow, original provider/current-transaction element construction, shared accessor/reporting, and real window-description resolver. Explicit read/resolve overload keeps deterministic regression separate without replacing default native calls. This connects concrete implementations already restored; it is not a callback-only substitute for default focus lookup. For-window/frontmost/app-name context entry points remain separate pending work.

Regression verifies no-window laziness, focus present/nil across CG resolution success/failure, exact phase window→focus→CG, correct original errors, and a real shared accessor provider cannotComplete error reported once while context succeeds with nil focus. Full Swift build/provider self-test/static primary-window/decoder/construction call pins/diff checks passed (/tmp/cua-app-focused-context-*). No live target-app operation attempted. Capture/extraction/refetch publication and default RefetchableUIElement resolver/production Mouse cursor integration remain unfinished, so application-click repair is not claimed.

### Extraction cache/monitor/transaction preparation (2026-11-08)

Previous goal turn progressed the default application focus-context entry. Revalidated it and inspected full SystemSelectionExtractor.extract0x100238110..0x100238b88. Recovered preparation0x100238440..0x1002387ac: if supplied cache exists, get first top-level cached tree element's AX reference then current root AX reference and compare via native static AX equality0x1006fabe8 (which branches to provider-aware0x1006fb9ac). Empty/mismatched first root discards cache; no search among later roots, no cache invalidation-state reset/extra state check added. Only fullUIContext has output monitor (reuse validated cache monitor or create). Other context modes set monitor nil. Always read isWebShaped next, even with usable cache; reuse its complete transaction or prefetch root additionalAttributes=[] with existing max-count policy (eventStream+web20, otherwise100).

Added prepareSelectionTreeCapture composing these real types, provider equality, concrete monitor constructor and root.subtreeTransaction defaults. Web classification remains explicit because the application's original classifier is still a missing extraction dependency; later transformation/revision/capture are not replaced with this preparation result. Reused existing skyshotAXMaxChildCount rather than adding a second policy.

Regression uses actual captured TransformedUIElement and full tree-cache/transaction values: all context/web combinations with valid, absent, empty and foreign-first-root cache. Foreign-first case contains a later matching root to establish it cannot salvage cache by scanning. Verifies lazy factories, monitor-before-web-before-prefetch order, no monitor outside full context, cached transaction reuse and20/100 prefetch counts. Swift build/full provider self-test/pinned equality/monitor/prefetch calls and field/context/limit instructions/diff checks passed (/tmp/cua-selection-tree-preparation-*). Additional mismatch regression warranted one rebuild after first successful run. No real app input performed; full extractor/refetch publication and production Mouse integration remain pending and click success unverified.

### Default application web classification and status recheck (2026-11-08)

Previous turn progressed extraction preparation. Revalidated original classifier0x10071e484..0x10071e608: suppress AX PID error, resolve NSRunningApplication by PID, require bundleURL, construct Bundle(url:), then short-circuit supportsHTTPScheme/isElectronApp/isChromiumApp. Missing process/URL/bundle returnsfalse; no bundle-name or identifier guesses. Verified original selector slots101542c18 runningApplicationWithProcessIdentifier:,1015421e8 bundleURL,101542ad0 initWithURL:.

Added ApplicationUIElement.isWebShaped over existing exact bundle predicates, with a dependency boundary preserving PID/URL/bundle failure laziness. Extraction preparation now defaults to this real classifier; explicit callback remains for tests. Regression verifies every early exit, classifierfalse and normal success. Full Swift build/provider self-test/static PID/classification calls/diff checks passed (/tmp/cua-app-web-classification-*).

User requested current progress. Rechecked production Mouse cursorPress:nil and RefetchableSkyshotAXTree's still storage-only body before reporting. No credible overall completion percentage is established; controlled browser evidence and recent isolated native restoration do not establish real DeepSeek→MCP→app click success. Full extraction/revision/refetch publication, concrete resolver/protocol integration, production input/cursor, real frame/window/multiwindow acceptance and actual app E2E remain outstanding. Goal remains active, not complete. No target-app input performed this turn.

### Extraction root, enablement and focus scope (2026-11-08)

Previous goal turn progressed default app classifier and rechecked status. Revalidated extraction prefix0x10023820c..0x10023842c: snapshot window/app, use explicit axTreeRootElement or typed context.window, preserve context.element unless performAccessibilityEnablement=true returns a nonnil assertion, then reread app.focusedUIElement (nil replaces previous focus too). No focus read when flagfalse/acquisitionnil. Window used by enablement is still context.window, independent of override tree root.

Added withSelectionCaptureContext and a default MainActor adapter invoking actual app enablement plus focused getter. Added ApplicationUIElement typed-window enableAccessibilityIfNeeded overload composing existing UIElement operation with original caches and shared NativeAXEnablementTracker; no fresh tracker or cache reconstruction. Returned assertion held across work. Further source inspection found explicit virtual disable at0x10023897c (error) and0x100238af0 (normal), metadata0x101573388 resolves0x1007007e4 disable. Corrected first draft's ARC-only lifetime to explicit defer disable, retaining withExtendedLifetime through work. This distinction matters when external owner retains assertion.

Regression covers enable flag/acquisition/new-focus combinations, override root, default typed window root, unchanged original context, read order, cleanup on thrown work, and externally retained assertion disabled exactly once before its later release. Full Swift build/provider self-test/static root/enable/focus gates/disable metadata pins/diff checks passed (/tmp/cua-selection-context-*). Injected assertions do not enable real app accessibility. Later tree transformation/revision and complete extractor/refetch/default resolver/production Mouse integration remain outstanding; no actual target-app operation was performed or claimed fixed.

### Joined extraction transaction scope (2026-11-08)

Previous goal turn progressed root/enablement/focus scope. Revalidated source: transformation-context init0x100238870 occurs before UIElementTreeTransaction.perform0x10023890c. Later tree/revision work runs in that transaction, using its supplied root (which may be the cached transaction root rather than caller's original wrapper). On error, perform restores outer TaskLocal before extraction disables its assertion. Transformation construction itself may fail before transaction entry, but still requires assertion cleanup.

Added withSelectionExtractionTransaction joining existing context/enablement scope, actual cache validation/monitor/prefetch preparation, pre-transaction transformation construction and transaction.perform. It passes actual transaction root, selected focus, preparation and transformation result to the remaining extraction work. Transformation and full tree/revision algorithm remain explicit required callbacks, not fabricated defaults, so this is integration of recovered phases, not a complete SystemSelectionExtractor implementation.

Integrated regression installs a distinct outer transaction and supplies inner transaction root with different cached supported attributes. Verifies transformation sees outer scope, work sees inner/root, and successful/throwing work plus transformation failure all restore outer state before explicit assertion disable; exit restores preexisting scope. Checks full ordered enable/focus/monitor/web/prefetch/context/work/disable trace. Swift build/provider self-test/new transformation-init/transaction-perform pins/static audit/diff checks passed (/tmp/cua-extraction-transaction-*). No user app input or full capture/refetch/production click acceptance performed. Goal remains active with complete extraction/revision/default resolver and Mouse integration outstanding.

### Native transformation-context default constructor (2026-11-08)

Previous turn progressed joined extraction transaction scope. Revalidated transformation constructor0x100758398..0x10075875c: Catalyst getter0x100715974, two independent web-classification calls0x10071e484, conditional first-child Chrome-node probe0x100758cb4 and independent frame helper0x1007575ac. Existing UIElement.windowHasChromeNodeForInitialization already composes the same raw partial-array/read-supported-attributes probe; source0x100758d00 asks first immediate AX child only, regardless of cache or role. Reuse that implementation, not browser-name guessing or recursive search.

Moved shared Catalyst and Chrome-node helpers from UIElement to UIElementProtocol so ApplicationUIElement/WindowUIElement use them directly without reconstructing caches. Added typed ApplicationUIElement.isCatalystApp and UIElementTransformationContext initializer invoking actual app/window getters over the recovered generic initializer; preserves two web reads and optional window frame even without app. Existing generic dependency constructor remains for exact order testing. URL configuration behavior unchanged.

New concrete regressions cover absent application/window defaults, cached Catalyst attribute without AX read, and typed cached AXFrame with absent app (frame still included). Existing generic context-order/Chrome probe/AX-enable/focus regressions remain passing after helper generalization. Full Swift build/provider self-test/new getter call pins/static audit/diff checks passed (/tmp/cua-native-transformation-context-*). The complete tree/revision work callback and production extractor/refetch/Mouse still remain incomplete; no actual user-app action or successful-click acceptance claimed.

### Inner extraction discovery and Electron selection focus fallback (2026-11-08)

Previous turn progressed native transformation-context defaults. Revalidated and traced transaction work thunk23d714→240700→23ce1c→23aa2c (body ends23bfbc). Inner work includes Electron focus fallback, tree.add, menu bar, focusTree, URL compaction/trim and append/root revision selection. Tree.add7664dc delegates768994→769a74; do not mistake the small public forwarding thunk for the recursive builder. Builder still needs separate restoration, including original visible-child subset handling.

Recovered fallback23ae08..23aeb0: retain supplied focus without app classification/search; only missing focus plus isElectronApp searches descendants of context WindowUIElement (not override tree root), of WebArea type. Predicate23bfbc..23c064 is not always true: selectedTextRange exists with length>0 OR selectedTextMarkerRange exists. Positive range short-circuits marker read; zero/negative/absent range falls through. Range location is not tested. Neither arbitrary first WebArea nor pointer focus guessed.

Added extractionWebAreaHasSelection and resolveSelectionExtractionFocus, plus concrete app/window adapter retaining explicit hasSelectedText dependency until native selected-range readers are restored. Added actual ApplicationUIElement.isElectronApp via existing PID→running-app.bundleURL→Bundle pipeline; renamed helper applicationBundleMatches to reflect shared non-web-specific resolution. Existing web classification unchanged.

Regression verifies existing-focus/non-Electron laziness, Electron search success/nil, positive/zero/negative/absent ranges, marker fallback and positive-range short circuit (including invalid location with positive length, matching source). Swift build/provider self-test/new thunk/builder/Electron/selection-reader call pins/branch pins/static audit/diff checks passed (/tmp/cua-extraction-focus-*). Native selected-range getters, complete inner builder/pipeline/revisions and full production capture/refetch/click integration remain pending. No user-app input performed; fallback restoration is not a verified cause/fix for Multica clicking.

### Concrete selected-range accessors and default Electron predicate (2026-11-08)

Previous turn progressed Electron selection fallback with explicit predicate. Revalidated native selectedTextRange78ebe0 and selectedTextMarkerRange78e994: both call value<T>(ignoringTypeMismatch:false), specializing CFRange and UITextMarkerRange respectively. Reused existing decodeAXRange/decodeAXMarkerRange rather than rebuilding marker encodings or relying on raw casts.

Added UIElementProtocol selectedTextRangeValue/selectedTextMarkerRangeValue plus native properties, composed with original cached lenient decode, cache-miss fallthrough, known-unsupported guard, strict uncached decoding, provider read and once-per-error reporting. Private shared selection accessor avoids duplicating machinery while retaining complete AXPartialValue at the established decoder boundary. Added concrete default resolveSelectionExtractionFocus using real properties in recovered selection predicate. Explicit selected-text injection remains for tests, not as the only implementation.

Regression validates cached CFRange without read, malformed cache recovered by fresh value, strict malformed fresh value reporting once, provider cannotComplete reporting/nil, native AXTextMarkerRange encoding/decoding from existing UITextMarkerRange, and positive cached range skipping marker getter. Initial test used .value on concrete marker encoder output (actual return is AXTextMarkerRange); corrected direct encoder result. Corrected Swift build/provider self-test/property generic-call/strictness pins/static audit/diff checks passed (/tmp/cua-selected-ranges-*). No actual user-app input performed. Full tree builder/pipeline/revisions, complete extractor/refetch/default resolver and production Mouse integration remain pending; no click acceptance claim.

### Recursive builder visit/filter/path rules (2026-11-08)

Previous turn progressed concrete selection readers. Revalidated recursive tree builder769a74..76a244. Source calls Foundation IndexPath.count at769c88 and checks signed count<201 at769c8c/c90 before reading AX identity/inserting into its shared visited set at769dc8. This is path component count, not UIElementTraversalCursor.depth (count-1). Duplicate insertion returnsfalse and skips construction. Added beginUIElementTreeVisit with lazy identity/depth diagnostic boundary and shared inout set; preserves original guard without inventing an agent round budget.

Source child loop76a06c..76a12c invokes filter(originalIndex,child) first, skips rejected children, and appends the original index only for accepted recursion. Added enumerateFilteredTreeChildren preserving duplicates at enumeration stage and uncompressed source paths. It does not combine filtering with identity deduplication: those are distinct stages. Other builder capture, transformed-element creation, visible-child subset, recursion and item append still require complete composition.

Regression verifies accepted path counts0/1/199/200, rejected201/202 without identity access, duplicate identity skipped without altering visited count, original filter order and retained paths[5,7,0]/[5,7,2]/[5,7,3] after rejecting index1 (duplicate child values retain separate callback paths). Full Swift build/provider self-test/pinned Foundation count/appending imports and branch/index instructions/static audit/diff checks passed (/tmp/cua-tree-build-traversal-*). No native app input performed and helpers do not establish complete builder/extractor or production click acceptance. Goal remains active.

### Visible-child threshold dispatch and concrete count/partial reads (2026-11-08)

Previous turn progressed builder visit/filter rules. Revalidated native visibleChildrenIfChildrenExceedsThreshold7a41e0..7a44f4. Missing/nonpositive childCount returnsnil. EventStream+web: count<500 positional filter(max0,includeAllVisibleItemRanges=true,context.windowFrame); >=500 log/nil regardless threshold. Other modes: count<=threshold invokes partialArrayValue(AXChildren,maxCount:nil), suppressing errors; count>threshold selects visible attribute, and if present returns visibleElementsCalculatingSubset(attribute,max0) directly (nil final). If attribute absent, count<500 positional filter(max100,includeAll=false,clipping:nil), otherwise separate log/nil. No global500 cap or unconditional truncation.

Added selectTreeChildren policy preserving opaque result/subset descriptor and nil/empty semantics. Added source-bound UIElementProtocol entry with real childCount (try? count, per source7b0468), visible-attribute selector and partial array reader. Factored existing selector from uiElementChildrenPreferringVisible; reused fresh support/count order, preserving selected empty collection behavior. Positional and visible-subset calculation methods remain mandatory explicit dependencies until their bodies are recovered; no fabricated empty fallback.

Regression covers explicit missing/negative/zero counts, threshold equality/excess, event/web combinations,499/500 boundaries,500 below ordinary threshold1000 still partial path, attribute-selected nil finality, exact position arguments, distinct limit reasons and swallowed partial-read error. Existing visible-selector tests pass after refactor. Corrected Swift build/full provider self-test/new childCount/selector/subset/partial/position call pins/context/limit instructions/static audit/diff checks passed (/tmp/cua-visible-threshold-*). No native app input performed. Complete geometry/subset methods, builder composition, revision/extractor/refetch/production Mouse remain incomplete; target-app clicks are not accepted as fixed.


## 2026-11-08：Mouse 的可选光标按压接线

复核当前安装包静态反汇编 `/tmp/cua-click-entry.asm`：
`0x1007b1220..0x1007b1280` 检查传入的可选 VirtualCursor；非 nil 时调用
`VirtualCursor.press()`（`0x1007c1cc4`），nil 时直接进入后续焦点准备。
这是单次 convenience press，并非向 count 参数照搬点击次数。

生产 `Mouse.swift` 的 AX 动作分支原先固定传入 nil，现将 Target 已有的
`virtualCursor` 传入 `executePreparedUIElementClick`。后者明确使用 MainActor
和 VirtualCursor 协议，直接 `try await virtualCursor?.press()`，保留源码顺序：
web 命中/模拟分流 → 可选 press → 焦点准备 → AX action。没有在此额外创建光标。
press 出错会向上传播，不继续焦点准备或 AX action。

新增五条组合检查：有光标的 AX 路径（press(count:1) 在 focus 前）、nil 光标、
直接模拟、web 命中后模拟以及 press 抛错短路。均通过；未发送真实用户应用输入。
Swift build 37.64 秒成功，provider-click-self-test 成功，既有静态源码审计及
`git diff --check` 通过。日志位于 `/tmp/cua-click-cursor-wiring-*`，仅保留本地。

边界：Target 的光标创建/定位尚未在完整生产操作入口贯通，本次不能证明光标
真实显示、动画交付或应用响应。截图成功但点击无效的主问题仍待端到端定位和验收。


## 2026-11-08：原生 Mouse 失败边界的本地诊断

只读复核当前 helper：accessibility=true、screenRecording=true；CuaFixture
`--desktop-session-check` 返回 screenLocked=true、frontmostIsLoginWindow=true。
未运行真实输入，不把锁屏解释为历史已授权操作无效的原因。

发现旧日志仅在 Mouse 已成功派发时写入，validateSnapshot/坐标解析/焦点准备等
提前抛错没有对应记录。现在在 mouseInput 外包裹本地诊断边界：
`native.input.attempt` 后跟 completed 或 failed，使用同一 UUID attemptId，保留
snapshotId、elementId、是否坐标输入及应用 PID；失败仅记录 Failure.code，取消为
CANCELLED，其余为 NATIVE_INPUT_ERROR。成功仍返回原结果，失败仍抛出原错误，
不重试，不新增输入，也不改变 Sky Perform 的 void 响应。原有 dispatched 记录保留。
不复制动作文本、错误消息或完整结果；开关仍为 CUA_NATIVE_INPUT_LOG。
这是独立调试功能，非声称原版包含相同日志协议。

新检查使用注入记录器验证成功/失败各执行一次、关联 ID 相同、错误原样抛出、
不复制错误消息与结果任意字段。Swift build、provider-click-self-test、既有静态审计、
git diff --check 通过，日志 `/tmp/cua-mouse-diagnostic-boundary-*`。未做真实应用输入。

此边界从 Target.mouseInput 开始：策略拒绝、Sky 层缺失 observation、根本没有调用
Mouse 等上游失败不会产生 attempt，必须结合 agent-loop JSONL 排查。completed 只代表
函数完成，不代表目标应用响应；仍需后续观察确认界面变化。当前无新的用户应用失败
运行记录，不能据诊断补充宣称点击根因已定位或修复。


## 2026-11-08：实际 RefetchableSkyshotAXTree 接入失效决策

重新核对 `/tmp/cua-refetch-element-body.asm`：`0x10022e9c0` 在 monitor 为 nil 时
进入抛错支路，不能把缺少监视器当成空状态。未失效且请求校验时，
`0x10022ec50` 调用 AXUIElementRef.value(for: AXRole)，绕过 UIElementCache；
`0x10022eca4..ecb0` 仅比较 -25202（invalidUIElement），其他读取错误继续包装。
布局失效或被记录销毁的元素进入单独 refetch 分支，不先执行普通 role 校验。

RefetchableSkyshotAXTree 现提供具体 refetchElementIfNeeded 接线：从当前
systemSelection 取真实 monitor，原子读取状态，委托现有还原决策，默认直接从
AXUIElement provider 读 role，并将结果包装到同一个 containingTree。缺少 monitor
和 invalidElement 的原错误映射，以及完整 refetch body，仍要求调用方明确提供，
不制造猜测的默认行为。此入口尚未替换生产 Target 的全量 snapshot 校验。

新增检查：nil monitor 必须抛错且不触发 provider/refetch；真实 monitor 状态和
validate 标记四种组合；cannotComplete 继续包装；invalidUIElement 抛原错误；
返回包装保留同一 tree。使用缓存/本地 AX 引用及注入 provider，不发送实际输入。

最终 Swift build 24.50 秒成功，provider-click-self-test、既有静态源码审计及 git diff --check 通过。构建中发现并修正新文件缺少 ApplicationServices 导入，以及当前属性类型无静态 .role 的编译问题，最终使用 UIElementAttribute("AXRole")。日志 /tmp/cua-concrete-refetch-resolution-*。完整 refetchTree/错误映射/生产协议连接及真实应用操作仍未完成。


## 2026-11-08：恢复 RefetchableSkyshotAXTree 原生错误枚举

静态读取 Mach-O，不执行安装包。错误对象 metadata `0x10147a168` 的 descriptor
为 `0x1012c16f4`，字段描述符为 `0x10131a818`：枚举有一个 payload case、
五个 empty case。字段记录逐项解析得到：invalidElementID(Int)、
noInvalidationMonitorProvided、elementAmbiguousBeforeRefetch、
elementAmbiguousAfterRefetch、elementNoLongerValid、elementNoLongerValidAfterRefetch。
payload 的 mangled type 是 Si，不是 String。名字读取路径和枚举布局已加入
hash-pinned audit-native-mouse-dispatch.py；不能仅依靠附近的字符串猜测类型。

对照构造分支的 empty-case tag：nil monitor 写0；AXRole invalidUIElement写3；
旧匹配不唯一在0x10022f4c0写1；新匹配为空在0x10022f5c0写4；
新匹配不唯一在0x10022f684写2。与反射 case 顺序一致。

新增具体嵌套 Error 枚举；tree.refetchElementIfNeeded 默认使用原版无监视器/失效错误，
recoverRefetchableElement 默认把各查找失败映射为对应原版错误，保留显式注入供组合测试。
不增加猜测的 RPC 错误码或文案，未将错误序列化映射声称为已完成。
新增默认无 monitor 错误与三个匹配错误检查。Swift build 29.26秒、自检、扩展后的
静态反射/指令审计和 git diff --check 通过；日志 /tmp/cua-refetch-native-errors-*。
完整树提取/刷新、生产协议连接、实际应用输入仍未验收。


## 2026-11-08：按显示编号进入 RefetchableSkyshotAXTree

静态反汇编 `/tmp/cua-refetch-index-entry.asm`（0x10022e6b4..0x10022e910）
确认：读取当前 systemSelection.windowRevision 后调用 item(for:)（0x10022e7a8），
缺少 item 则抛 invalidElementID，原编号作为 Int payload 写入0x10022e820；
有 item 时调用协议元素版 refetchElementIfNeeded（0x10022e8c4），传入 caller 的
validateElement 和固定 ignoreValueChange=false（0x10022e8b8）。不先刷新树，
不先检查 monitor，也不将编号换算为数组偏移。

新增对应 Int 重载，使用实际 revision 的编号表和 Item.element，再接到上一轮的
实际 monitor/原始 AXRole 校验入口。仍要求完整 refetch body 明确提供，不假装已经
恢复整棵树重新提取。生产 Target 的旧节点数组入口尚未替换。

新增检查使用真实根 revision/渲染表：根编号0可定位，-1/1/Int.max 在监视器缺失
时仍先返回原始 invalidElementID；有效0在无 monitor 时报原错误；有 monitor 时
validate=false/true 分别不读/读一次role；布局失效直接刷新并确认 ignoreValueChange=false。
静态审计增加两处原调用目标和三处参数/错误 payload 指令校验。

验证：Swift build 37.63秒、provider-click-self-test、扩展后的静态审计及 git diff --check 通过。日志 /tmp/cua-indexed-refetch-*。未运行真实应用输入；编号入口接通不证明完整生产操作已经可用。


## 2026-11-08：具体树对象组合原生元素恢复 helper

复核0x10022ee20..0x10022f734，尤其0x10022efd0..eff4：先取得原元素动态协议
witness 的 AX 引用，再通过同一 concrete type 的 init(element:) 重建。不是统一转成
UIElement，也不是直接比较旧缓存和旧缓存。之后0x10022f024进行属性比较，命中则
返回新包装；不命中才执行已恢复的旧观察唯一性、refetchTree、新观察唯一性流程。

新增 RefetchableSkyshotAXTree.recoverElement，组合实际动态构造、协议属性匹配、
当前 SystemSelection.elementsMatching 和原生错误映射，两个返回分支都保留同一
containingTree。匹配函数从不必要的两个泛型参数改为原版使用的协议 existential，
避免调用方持有 any UIElementProtocol 时无法组合；比较顺序和忽略值逻辑保持不变。

完整 refetchTree 重新提取与发布仍是明确传入的依赖。本次不在 recovery helper
额外发布 selection，不能用空 selection/猜测实现替代原版提取，也未替换生产 Target。
新增受控协议元素检查：实际动态构造返回同类型新实例；属性相同时完全跳过树提取，
保留同一 AX 引用、tree owner 和当前 revision，覆盖 ignoreValueChange 的两个值。

验证：修正 existential 比较入口后 Swift build 35.10秒成功；provider-click-self-test（含现有属性比较、匹配失败/刷新分支检查和新增具体组合）通过；hash-pinned静态审计和 git diff --check 通过。日志 /tmp/cua-concrete-recovery-*。新增组合只直接验收同属性快速路径，不能声称完整 extractor/生产应用链路通过。


## 2026-11-08：刷新后发布 SystemSelection 的顺序

静态核对 refetchTree 尾部0x1002311f0..0x10023123c，调用0x1002324a4；
新反汇编 `/tmp/cua-refetch-publication.asm` 确认其读取 SystemSelection metadata
value-witness表 offset0x18（assignWithCopy），目的为树对象当前 selection，
随后从已存 selection 复制返回值。提取失败分支退出，不经过这次赋值。

新增 refetchTree(extract:) 仅恢复这一发布边界：先调用显式完整提取依赖，成功后
替换 systemSelection，再返回当前存储。recoverElement 改为接收 extractSelection，
由自身调用此发布入口，避免外部忘记发布。匹配新候选发生在发布之后；后续查找
失败不会自动回滚到旧 selection。这里未实现或声称实现完整 extractor 函数体。

新增受控检查：提取抛错时保留旧 revision；成功只提取一次，提取期间仍见旧状态，
之后存储/返回新 revision 与 window。源码审计增加 assignWithCopy 的调用和操作数
校验。未发送真实应用输入，生产 Target 尚未接入完整原生提取/刷新链路。

验证：Swift build 36.06秒、provider-click-self-test、扩展静态审计和 git diff --check 通过，日志 /tmp/cua-refetch-publication-*。完整原版提取工作仍未完成，不以发布边界的组合通过替代应用实际操作验收。


## 2026-11-08：追加 revision 的真实依赖重新定位

本轮是静态恢复研究和审计更新，未新增产品函数。重新核对提取器
0x10023badc（差分 flag）与0x10023bae0（旧 revision）两个门：任一不满足走
root0x10076b838，否则 appending0x10076b6f4。不能用“始终生成root”替代差分。

新反汇编 `/tmp/cua-revision-append-context.asm` 与
`/tmp/cua-revision-append-core.asm` 显示 appending 调用通用0x100655d5c；
该函数 render 新全树 → 构造 UIElementRenderDifference0x10063cc70 →
buffer0x1006413c0 → 每个 Change.inheritElementID0x10063f3b8 →
可选 focus render → 新 revision 构造。完整 buffer/匹配算法尚未实现；当前
UIElementRenderDifference.swift 只有存储和Change/继承ID，不足以生成追加版本。

进一步定位实际 iterator：makeIterator0x10063cc7c；next0x10063ccc8..0x10063ce50。
其 next 使用两条 Deque：有待输出 Change 时先 popFirst 返回；否则从待处理项
队列 popFirst，调用0x10063f960生成一批Change，append(contentsOf:)到输出队列，
若批次为空继续下个待处理项。第三方 DequeModule 确实出现在原构建；本仓库
Package.swift 已依赖 swift-collections 1.6.0/DequeModule，应直接复用，不能重写
一个自行猜测的队列/树diff实现。下一核心为0x10063f960的匹配/入队逻辑和buffer。

扩展hash-pinned静态审计，锁定提取器两分支指令、append→difference/buffer/继承
调用及 iterator→Deque/pop/append/helper 调用，执行通过。git diff --check通过。
未修改Swift，未重新跑无关构建，未实际输入用户应用；完整提取/差分/生产操作仍未完成。


## 2026-11-08：同级匹配 helper 全体定位及已有代码纠正

新静态反汇编 `/tmp/cua-difference-matching-full.asm` 确定核心 helper 完整范围
0x10063f960..0x10064094c，不能仅用已匹配节点的 emission 代替整个 diff。
通过 Mach-O chained imports 解码实际调用，确认包含 Array count/subscript/dropFirst、
Dictionary.removeValue/values、Set.contains、enumerated 与 lazy map 等处理。
相同前缀分支比较 ID、调用0x1006409e4；后续还有字典匹配和剩余项处理，未完整恢复。
不从函数名或相似算法猜测为LCS，也不引入不同第三方diff替代。

复核0x1006409e4..0x100640bb8（`/tmp/cua-difference-match-emission.asm`）：
任一边有子节点即将(old.childCursors,new.childCursors)追加到Deque，然后只比较text；
相同输出Change.none，不同输出Change.update；不在此继承编号。
现仓库 **已有** UIElementMatchedRenderChange.swift 及组合检查（包括Unicode等价文本/
不同detail不触发update）。前一节“只有存储”的表述不够完整，应为：已有存储、
Change、编号继承及匹配节点emission，缺少外层同级匹配/iterator/buffer。

本轮起初按Difference文件名检索漏掉上述独立文件，导致短暂重复声明；编译发现后
撤回重复文件和重复测试，保留既有实现。未把重复实现计入进度。审计增加该helper
的子游标/Deque入队调用，并直接验证文本比较stub绑定的Swift字符串等价函数。
下一步应从0x10063f960完整同级匹配分支继续，而不是重写已存在的emission。

撤回重复声明后Swift build 32.34秒、自检、扩展静态审计及git diff --check通过。日志 /tmp/cua-difference-emission-*。本轮有效产出为完整helper/真实依赖定位、已有模块边界纠正和审计增强，未新增产品操作能力，未实际点击应用。


## 2026-11-08：还原双队列差分调度

复核0x10063f794返回两个Deque值；0x10063ccc8..0x10063ce50的next先检查
输出队列，已有Change时直接popFirst，不提前展开下个待处理pair；输出为空时
popFirst一个(old cursors,new cursors)pair，经匹配helper生成批次append到输出，
空批次继续处理剩余pair。待处理pair也为空时返回nil。队列是值语义。

新增UIElementRenderDifferenceIterator.swift，直接复用DequeModule，实现显式
(old,new)游标数组初始化和next(matching:)调度；matcher0x10063f960仍为必填依赖。
不添加假默认匹配器，不声称Sequence/IteratorProtocol或完整buffer已恢复。
未重新实现已有matchedChange，不改变其文本比较或子游标入队行为。

调度检查覆盖：批次完全排空后才取下个pair、空批次在同一次next内跳过、后入队
子pair排在现有pair之后、拷贝后独立消费、空根pair仍执行一次matcher、耗尽后不再
调用matcher。该检查直接验证调度，不证明尚未恢复的匹配算法。

验证：Swift build31.39秒、provider-click-self-test、既有hash-pinned静态审计及git diff --check通过。日志 /tmp/cua-difference-scheduler-*。未发送实际应用输入，完整匹配/buffer/追加revision及生产点击仍未完成。


## 2026-11-08：恢复同级匹配的相同身份前缀

核对完整helper0x10063f960中的0x10063fd58..0x10063feb4：对两个数组最多比较
min(counts)个位置，读取每个render的id并通过Equatable witness比较；首次身份
不同就退出前缀循环，不因为后面又有相同id继续消耗。相同id即调用已恢复的
matchedChange(offset:index,new,old,pending:)，即使text变化也继续前缀匹配。
初始结果数组reserveCapacity使用max(counts)。随后源代码才dropFirst(consumed)
并进入剩余项字典分支，不能把剩余部分假设成简单zip或remove+insert。

新增UIElementRenderDifferencePrefix.swift，返回实际消耗量和Change批次，复用
现有matchedChange及真实Deque子树入队。仍未作为完整默认matcher暴露；剩余
字典分支不填占位实现。新增检查覆盖文本变化仍消耗、首次id不匹配即停止、
不提前处理后面的相同id子树、空数组及不等长度数组、Change offset保持原位置。
静态审计增加原版id相等/已匹配emission/结果append三处调用。

验证：Swift build33.29秒、provider-click-self-test、扩展静态审计及git diff --check通过，日志 /tmp/cua-difference-prefix-*。未实际操作应用；完整matcher/buffer/追加revision和生产端到端仍未完成。


## 2026-11-08：剩余游标身份字典

完整静态反汇编 `/tmp/cua-difference-residual-map.asm` 确认helper
0x100645420..0x1006457ac：空Dictionary初始化，按ArraySlice.count预留容量，
对slice.enumerated()逐项取cursor.item.id，offset=显式传入前缀消耗量+枚举offset，
再通过Dictionary.subscript.setter赋值。0x100645720用带溢出检查的Int加法。
字典value为(offset,cursor)，同id后项覆盖前项；不是uniqueKeys构造或重复检测失败。

新增UIElementRenderDifferenceResidualMap.swift，恢复上述实际行为，包括保持
cursor/path原值、独立于ArraySlice.startIndex的offset参数、普通Int溢出语义。
新增检查：重复id保留最后实例/偏移、空slice、非零slice起点、显式offset与path
不同、负offset仍按内部Int规则相加（外部输入校验不在此helper）。

审计锁定字典构造/reserve/enumerated/next/subscript.setter调用，解析setter的真实
chained import为_$sSDyq_Sgxcis，并验证offset加法指令。此helper未替代完整剩余
节点匹配/删改顺序；默认matcher、buffer和追加revision仍待继续恢复。

验证：Swift build38.78秒、自检、扩展静态审计及git diff --check通过。日志 /tmp/cua-difference-residual-map-*。未发送实际用户应用输入；完整生产操作目标保持未完成。


## 2026-11-08：保留集合之后的剩余匹配/输出

继续逐分支核对0x100640300..0x1006408c4：按新游标原顺序枚举，offset为
前缀消耗量+枚举index；先从旧身份字典removeValue，再检查可选Set。如果缺少
旧项输出insert；如果Set为nil跳过gate，有Set时只有contains(identity)才走
matchedChange，否则也输出insert。被gate拒绝的旧项已经移除，不再生成remove。
最终按Dictionary.Values原迭代输出剩余旧项的remove，offset使用其存储旧位置，
不添加自行排序。Set构造helper0x1006378e4的具体算法仍未恢复，不能默认全部保留。

新增matchResidualSiblings，retainedIdentities为必须明确传入的可选值，不设置
猜测默认值。复用已恢复字典与matchedChange；没有自行实现未确认的移动策略。
检查覆盖重排后的none/update、新增及旧位置remove、空Set拒绝后不再remove、
同一新身份第二次出现时旧项已被消费所以insert。保留集合算法尚未接入，此函数
不被当作完整默认matcher，不能据这些检查证明完整diff语义。

新证据还定位到：identity→旧offset查询在0x100640bb8..0x100640ce8，返回Int?；
0x1006378e4再调用637a10/637d50/637e50/6381a4。后续应继续核查这条保留集合链。
静态审计追加removeValue/Set.contains/matchedChange/Dictionary.Values/append调用。

验证：Swift build33.01秒、自检、扩展静态审计及git diff --check通过；日志 /tmp/cua-difference-residual-match-*。本轮未实际点击用户应用，保留集合算法/buffer/追加revision/完整提取/生产验收仍未完成。


## 2026-11-08：保留集合的有序预检

静态链0x1006378e4先调用0x100637a10；返回true则0x10063791c将返回值设为0
并直接退出（nil Set），不调用乱序算法。0x100637a10..0x100637c48遍历identity
对应的Int? offset：缺少旧offset则继续；previous从-1开始，必须previous<offset，
否则立刻false；完全耗尽才true。不能把相等偏移当作有序，也不将缺失offset替换为0。

新增UIElementRenderDifferenceRetention.swift恢复该路径。乱序处理仍是必填
unordered依赖，不把nil“跳过gate”当成所有输入的默认捷径。检查覆盖空输入、
全缺失、混合缺失、递增、逆序、重复、-1哨兵、nil Set与空Set区别；乱序回调
只调用一次，原序列/旧字典保持传入。完整乱序求解仍未恢复。

审计增加预检/乱序算法/集合生成调用，验证nil返回、-1哨兵和严格b.lt指令。
Swift build34.16秒、自检、扩展静态审计与git diff --check通过；日志
/tmp/cua-difference-retention-preflight-*。未实际输入应用，完整生产目标未完成。


## 2026-11-08：恢复乱序身份保留求解

静态追踪0x1006378e4：预检未通过才compactMap（import _$sSTsE10compactMap...）
identity与旧Int? offset，缺失项丢弃。0x100637e50..0x1006381a4逆序遍历映射数组，
将offset取负，通过升序tails的lower_bound（tail<value推进low，否则收缩high）
计算每个位置的后缀长度，返回长度数组及tails.count。这里是严格递增，不使用
upper_bound；Int.min取负保留原版溢出语义。

0x1006381a4..0x100638504从前向后选择：remaining从tails.count开始，previous=-1，
只有remaining>0、offset>previous、suffixLength>=remaining才插入identity到Set，
更新previous并remaining-=1。因此同长度解采用输入中最早可行项，不能用任意
LIS回溯或排序Set来替代。返回空Set和预检返回nil仍是不同分支。

新增UIElementRenderDifferenceRetentionSolver.swift，并作为retainedIdentities的
默认乱序依赖，保留显式注入供预检组合检查。独立穷举子序列oracle验证4个身份
全部24种排列、加入缺失身份的24种排列、空/缺失/重复身份等；比较最大严格递增
子序列且优先输入位置最早的选择结果。该oracle不是执行原二进制的运行时差分。

Swift build32.67秒、自检、扩展静态审计与git diff --check通过；日志
/tmp/cua-retention-solver-*。首次审计错将Set.insert调用地址写成相邻load地址，
已根据反汇编修正到0x1006384a0后通过。接下来可连接默认matcher/iterator/buffer；
本轮尚未完成这些组合，未发送实际应用输入，生产点击目标仍未完成。


## 2026-11-08：默认 matcher / Sequence 完成组合

复核根游标生成0x10064b230的enumerated/map链和makeIterator0x10063cc7c→
0x10063f794；新的makeIterator使用零基根位置构造游标，将(old,new)根批次交给
已有双Deque调度。UIElementRenderDifference现在符合Sequence，Iterator符合
IteratorProtocol，next()直接调用实际matchSiblings，不再要求外部注入matcher。

matchSiblings按原顺序组合：相同身份前缀 → 剩余旧身份字典（仅构造一次）→
新身份顺序预检/乱序保留集合 → 按新序列消费旧记录/输出 → 剩余旧记录remove。
把残余emission抽为共享函数，避免默认匹配为计算保留集合而重复构造字典，
保留显式retainedIdentities测试入口。未新增root/diff fallback或重试。

新增直接Array(Difference)检查真实嵌套render引用：同一根批次的none/update先输出，
之后子节点update，子路径为[0,0]；重排遵循最早可行身份保留策略；空树/全移除
分支通过。这是Swift还原侧完整组合检查，不是原厂二进制动态差分。

首次编译发现Sequence.min/max遮蔽Swift全局函数，已明确改为Swift.min/max；
最终Swift build15.57秒、自检、既有hash-pinned静态审计与git diff --check通过。
日志/tmp/cua-default-difference-*。buffer、追加revision/完整extractor/生产Target
入口及真实应用输入仍未完成，本轮没有发送实际用户应用操作。


## 2026-11-08：buffer 构造与缓存语义

静态buffer()0x1006413c0..0x100641478保留old/new两个render数组，调用Array(sequence)
生成changes，最后返回old/new/changes/false。反射descriptor0x1012c9848、字段表
0x101321578确认三个字段：difference（let，flags0）、changes（var，flags2）、
changesSortedDepthFirst（var，flags2）。不是只有Change数组，也不自动按深度排序。

新增UIElementRenderDifferenceBuffer及实际buffer()入口，调用上一轮已组合的默认
Sequence一次性物化。检查验证之后向共享新render追加子节点，重遍difference会看到
新变化而已生成changes保持原长度；changes中的节点仍共享原引用，可继承旧编号。
buffer值拷贝后修改changes数组/排序标记不改变原值，空difference产生空changes。

sortChangesDepthFirst和对应DepthFirstOrder尚未恢复，不将可写排序标记当作排序功能。
新增审计校验字段名/数量及Array构造调用、初始false指令。Swift build31.97秒、自检、
扩展静态审计与git diff --check通过，日志/tmp/cua-difference-buffer-*。未实际输入应用；
追加revision/完整提取/生产Target/真实点击仍未完成。


## 2026-11-08：差分路径与深度优先排序

静态Change.path0x10063efd4..0x10063f1a4：none/update取new.path，insert取new.path，
remove取old.path，不使用render.sourcePath或payload的offset生成路径。
DepthFirstOrder构造0x10063f1a4..0x10063f3b8先取上述path，再设置优先级：
none0/remove1/insert2/update3。比较0x10063d220调用Foundation.IndexPath.compare，
不同路径按其比较结果，同路径才比较Int优先级；并非枚举tag顺序。

新增UIElementRenderDifferenceDepthOrder.swift恢复path/key/比较及buffer排序。
operationOrder是可读重建字段名，不宣称已恢复原字段名称。排序入口0x1006411dc
若changesSortedDepthFirst=true直接返回，否则执行标准库sort并置true；空changes
也置true，外部改变changes不自动重置标记。没有加入自定义排序或自动失效规则。

检查覆盖不同old/new游标、无关sourcePath/offset、同路径四种操作顺序、父/子/兄弟
路径次序、已排序标记短路和空buffer。审计锁定IndexPath.compare真实import、排序
调用及显式优先级指令。Swift build38.00秒、自检、扩展静态审计及git diff --check
通过，日志/tmp/cua-difference-depth-sort-*。未实际输入应用，追加版本/完整提取/
生产Target与真实应用操作验收仍未完成。


## 2026-11-08：追加 revision、编号继承和版本链

反射descriptor0x1012c9be8、字段表0x101321890确认8字段：lineageID/tree/renderTree/
focusTree/focusRenderTree/ids/changes/previousRevision，补齐此前遗漏的changes。
复核appending0x100655d5c：render新全树→构造difference.buffer→遍历changes继承
none/update旧编号→可选焦点render→构造新revision。此处不调用深度排序，不为
新全树整体setElementIDs，否则会覆盖继承编号。constructor0x100654b9c的表构建
继续使用既有makeRevisionTable分配空编号和合并焦点路径。

constructor0x100655230优先previousRevision的lineageID，再考虑显式ID/新UUID；
追加入口传入当前self作为previous，因此新版本沿用lineage并保持引用链。新增
appending(render:)和两个context overload，context由全树/焦点render共用。
根版本changes=[]、previous=nil保持原行为；追加版本存储真实buffer.changes。

受控TransformedUIElement树检查覆盖：更新节点保留0、新节点编号1、焦点重用0、
编号查找取焦点标题、旧版本不变、两级previous链回到根；焦点render抛错前已继承
的主树ID不回滚，不发布一个半成品revision。Swift build32.51秒、自检、扩展反射/
静态审计及git diff --check通过；日志/tmp/cua-revision-append-*。

仍缺提取器的完整树构建/转换以及生产Target接线，不能据追加版本组合通过声称
真实应用点击已修复。本轮未发送实际用户应用输入。


## 2026-11-08：提取器 root/appending 选择阶段

重新核对inner extractor的两个gate：0x10023badc检查isAXTreeDiffingEnabled，
0x10023bae0检查previousRevision。只有同时满足才调用appending0x10076b6f4；
否则调用root0x10076b838，不因为已有旧revision就强制追加。

新增makeSelectionTreeRevision，直接调用已恢复的类型化context root/appending，
传递真实full/focus tree和同一个inout transformation context。新增检查使用实际
TransformedUIElement和原生render(with:)而非假render，覆盖diffing×previous四种
组合，验证有差分且有旧版才保留previous/lineageRoot，其他分支新root、changes为空；
焦点树传递和非空实际render也验证通过。

这是提取器版本阶段的具体组合入口，完整SystemSelectionExtractor的树构建/转换
仍未实现到可替换生产Target，不把该函数说成完整提取器。Swift build32.17秒、自检、
既有hash-pinned静态审计与git diff --check通过；日志
/tmp/cua-extraction-revision-choice-*。本轮未实际点击应用，目标仍未完成。


## 2026-11-08：树级 URL 再修剪

提取器0x10023b794比较URL配置，配置变化才调用0x10075b044对full/focus tree
trimURLs。当前仓库已有TransformedUIString.trimURLs，但缺少树级入口。本轮恢复
0x10075b050..0x10075b338：逐item先更新transformedString中的URL；只有返回changed
才更新element.value为description；informationalContext且attributedString非nil时
保留原value。然后递归subtree；独立的focusedElement快照不在此函数中修改。
无URL变化时不借机重建value，树items写回沿用既有缓存失效机制。

新增UIElementTreeTrimURLs.swift，直接复用已恢复的字符串修剪与URLshortener。
检查覆盖full/informational×有无attributedString四组合、父子递归、focus快照不变、
无变化时保留sentinel value。静态审计增加字符串修剪/description/递归调用和tag2
分支指令。Swift build32.44秒、自检、扩展审计与git diff --check通过，日志
/tmp/cua-tree-url-trim-*。配置测量/临时切换/恢复及完整提取器仍需继续组合，
本轮未实际操作用户应用，生产点击目标未完成。


## 2026-11-08：URL测量/配置变化/树重剪阶段组合

复核0x10023b500..0x10023b904：保存原配置→reset→一次transform/测量→compact并
累加totalLength→reset→比较原/最终配置→若不同则依次trim full/focus tree。
0x10023b6e0..b6f4加载的是压缩后的当前配置，0x10023b8e0..b904写回相同配置，
不是恢复进入阶段前的配置。后续渲染仍使用最终配置。

新增withSelectionTreeURLCompaction，复用现有shortenURLsIfNeeded（一次body、
throw跳过后续compaction/accounting）与树trimURLs。transform仍明确提供，完整
转换pipeline未偷偷替换为简化实现。返回修改后的full/focus树，保留最终配置。

检查验证body一次、totalLength累加、body明确修改配置后两树重剪/值与当前转换文本
一致、throw保留totalLength且不运行后续compact。最初测试错误假设单条长URL必然
压缩配置，自检失败；复核已有trimUIElementURL发现超总预算先计入省略号，因此
测量可能仍低于限额。撤回该测试假设，未为通过测试修改产品shortener。当前配置
变化检查由transform明确修改includeQuery触发，不宣称是自然预算压缩的端到端验收。

最终Swift build29.52秒、自检、既有扩展静态审计及git diff --check通过；日志
/tmp/cua-extraction-url-compaction-*。未实际操作应用；完整树构建/转换pipeline、
生产Target接线及真实应用点击仍未完成。


## 2026-11-08：转换后 URL 登记接入压缩阶段

完整静态读取helper0x10023c344..0x10023cbac，文件
/tmp/cua-extraction-transform-full.asm。确认先为full/focus分别读取
MacUIElementTreeTransformation.defaultPipeline并调用transformed(for:using:in:)；
两次getter不能缓存成只求值一次。随后各自深度遍历，调用accessibilityDescription
（0x10023c8bc、0x10023cacc），立即release返回String，没有String.count求和。
目的在于共享context登记URL，再由外层shortener compact进行测量/accounting。

新增registerSelectionTreeURLs，并在withSelectionTreeURLCompaction中transform
返回后、compact之前直接调用。复用实际node.accessibilityDescription与树Sequence，
先主树再焦点树，不遍历独立focusedElement捕获，不改树的字段。检查真实父子节点
两种URL、焦点重复URL被shortener唯一测量、独立focus捕获的URL排除、树值不变。
此前compaction组合检查也重新通过。

原默认pipeline的应用host组合仍缺具体入口：现有Mac dispatch依赖rebuild/provider
标题/所属app等，不以空回调冒充。下一步应继续核对0x100766558及其绑定函数。
扩展审计锁定上述6处getter/transform/description调用。Swift build38.55秒、自检、
静态审计及git diff --check通过，日志/tmp/cua-extraction-url-registration-*。
本轮未实际操作用户应用，完整生产目标未完成。


## 2026-11-08：Mac transformed(for:using:in:) 遍历/dispatch 组合

静态读取0x100766558..0x1007665f0及thunk0x100767f74..0x100767f88，文件
/tmp/cua-mac-tree-transform-binding.asm和/tmp/cua-mac-transform-dispatch-entry.asm。
包装器转入通用transformed0x100651398，闭包context设为0；thunk只读规则tag并
传item/context到0x1007595fc。for: application参数未捕获，不能凭其名字假设它
是所有节点的所属应用，也不能用这个参数顶替日历节点自己的PID/bundle解析。

新增类型化树transformed(for:using:in:...)，复用实际通用遍历及Mac规则dispatch，
保留原应用参数行为；rebuild、providerTitle、owningBundleIdentifier等仍为明确
host依赖，不提供空默认回调。此前“应用绑定”的说法应细化为这些节点/provider
依赖，而非包装器捕获应用。默认pipeline全量host绑定仍未恢复。

实际链接转换规则组合检查：URL节点变staticText、value使用shortened URL、原树
与独立focus捕获保持原值，URL登记进入共享context；其他必填回调在此fixture中
不应被使用，以precondition防止悄悄依赖。此检查不代表全defaultPipeline已验收。
审计锁定无捕获参数及两处尾跳转。Swift build32.44秒、自检、扩展静态审计与
 git diff --check通过；日志/tmp/cua-mac-transform-composition-*。未实际操作应用。


## 2026-11-08：节点所属应用默认解析接入 Mac dispatch

核对Calendar分支0x1007599e0..0x100759a2c：通过helper0x100751a9c读取当前节点
的AX PID；该helper调用AXUIElementRef.pid0x1006f9d8c，失败记录错误并返回nil。
成功后调用NSRunningApplication(processIdentifier:).bundleIdentifier；app或bundle ID
缺失则转换不变。不使用tree wrapper的for: app参数，不补应用名/路径猜测。

新增TransformedUIElement.owningApplicationBundleIdentifier和可注入解析核心；
Mac rule dispatch与树wrapper的owningBundleIdentifier改为可省略。仅在Calendar
结构/role条件通过后求值默认解析，PID错误交给现有显式reportAttributeError。
若调用方提供解析器，其nil结果是最终结果，不再fallback到默认查询。原helper
具体日志分类/文案未在这里宣称完全一致。

检查覆盖PID抛错短路且报告一次、lookup只调用一次、nil/Calendar/其他bundle原样
返回；现有Calendar结构惰性检查与其他组合一起重新通过。默认实际NSRunningApplication
查询未用真实Calendar窗口做端到端验收。Swift build38.31秒、自检、扩展静态审计
及git diff --check通过，日志/tmp/cua-node-owning-app-*。rebuild/providerTitle等
其余host绑定、完整提取及生产点击仍未完成；本轮未操作用户应用。

## 2026-11-08：provider 原始标题默认回调

静态核对 0x10075a944：读取当前树事务，构造 provider cache，读取缓存 AXTitle；
不是转换节点的展示标题。Mac dispatch 与树转换包装器现默认使用
macTransformationProviderTitle，显式回调（包括返回 nil）仍具有最终决定权。
事务缓存检查覆盖 NSString 标题、空字符串和 NSNumber 类型不匹配。
Swift build 32.11 秒、自检、静态审计通过；日志 /tmp/cua-provider-title-*。
这没有完成 rebuild/renderNode 默认绑定、完整提取或生产 Target 集成；未进行真实应用点击。

## 2026-11-08：Mac 转换节点渲染默认绑定

静态读取 0x10075ab6c..0x10075abf4（/tmp/cua-mac-transform-render-callback.asm）：
回调以 TransformedUIElement 的 AccessibilityNode conformance 和相同 inout 转换
context 调用 accessibilityDescription，调用点 0x10075abd8 -> 0x100625d58。
新增 macTransformationRenderNode，并作为 Mac dispatch/树转换包装器的默认 renderNode，
显式传入回调仍可覆盖。未替换成展示标题，也未新建隔离的 URL 上下文。

真实 TransformedUIElement fixture 比较渲染文本、短链配置及 URL 登记后测量值；
Swift 构建32.00秒、provider-click-self-test、固定二进制静态审计、diff检查通过。
日志 /tmp/cua-transform-render-*。首次构建暴露测试使用不存在的无参构造及 totalLength
属性，已改用实际构造和 compactConfigurationIfNeeded 测量；产品 API 未为测试扩充。
rebuild/full extractor 与生产刷新组合仍未完成；本轮没有真实应用操作验收。

## 2026-11-08：重建回调进入真实 provider builder 的证据

读取 /tmp/cua-transform-rebuild-callback.asm、-core.asm、-forward.asm、-body.asm。
原回调 0x10075a858 读取传入 item 的四个字，创建空 IndexPath 和独立初始集合，
0x10075a904 调入 0x10076aba0 -> 0x100768a84 -> 0x100768ad8。
因此不能用保留/复制现有转换后 subtree 来充当默认 rebuild，也不能直接递归应用
转换规则来替代 provider 树构建。

共用 builder 在 0x100768d34 检查 path.count <201，之后经过 identity 集合检查
helper0x1006ede20；0x100768ea0 读取树事务 TaskLocal，再调用 provider cache
构建0x10076589c及 TransformedUIElement 构造路径0x10075e160。
后续可见子项获取0x10071b8c8、迭代递归和最终附加0x10076881c仍需继续逐项恢复。
这些 helper 的完整语义未仅凭地址推定；重建默认参数继续保持必填。

静态审计新增7处BL、专用尾跳转与depth guard指令约束，固定安装包hash审计通过；
日志 /tmp/cua-transform-rebuild-audit.json。本轮只读安装包、未运行原厂服务、
未发送应用输入。没有将静态调用链确认作为实际点击问题修复。

## 2026-11-08：builder 最终附加与集合去重审计

0x10076881c 构造 Item，保留 element/subtree/availableSubset，最后通过
0x10076892c -> UIElementTree.items.setter0x10064fb6c 发布追加数组。
新增 appendBuiltElement 复用此语义及已有 setter 缓存失效机制，不重置目标树
focusedElement，不丢弃子树的 focusedElement。该步骤尚未组成完整 recursive builder。
实际 TransformedUIElement fixture 验证追加前缓存的 false 谓词在追加后重新求值、
节点及子树焦点保留、目标焦点保留。nil subset 用例未覆盖非空 subset 的集成。

静态核对0x1006ede20，原 identity 插入确实经 CFHash/CFEqual（0x1006edef4 /
0x1006edf4c），不应重新实现哈希表；现有 Set<AXUIElement> 路线保持。
证据 /tmp/cua-builder-identity-insert.asm、/tmp/cua-builder-final-append.asm。
Swift build32.31秒、自检、扩展静态审计和diff检查通过，日志
/tmp/cua-builder-append-*。本轮未发送应用输入，生产点击问题仍未完成验收。

## 2026-11-08：纠正 builder 默认 children 阈值入口

前段将 0x10071b8c8 简称“可见子项获取”不准确。实际这是默认阈值 thunk，
调用0x1007a44ec，后者仅 mov w0,#100;ret；builder0x100769070取默认阈值，
随后0x100769080间接调用才读取子项。0x1007a44ec显示的 Protobuf 标记是合并常量
函数的符号标记，不能当作此处调用 Protobuf 功能的证据。

visibleChildrenIfChildrenExceedsThreshold 现补齐默认参数100，显式阈值仍保留。
审计新增thunk调用与常量返回指令验证。Swift build21.03秒、自检、静态审计、
diff检查通过；日志 /tmp/cua-builder-default-threshold-*。
实际获取函数/position筛选与visible subset映射仍需恢复，完整递归构建及真实点击
尚未验收；本轮没有操作用户应用。

## 2026-11-08：可见子集解析的最终 fallback

核对0x1007a5158..0x1007a546c：前部候选探测失败后，最终fallback在0x1007a53c0
调用0x1007a46fc选择完整属性；支持visibleRows优先rows，否则支持visibleChildren
选择children，否则nil。这里仅判断支持集合，不读visible count；不能复用还原的
preferredVisibleAttribute（后者会探测count）。count错误/nil、非正、>=500、完整数量
<=当前可见数量均返回nil，满足条件才调用0x1007a55b8读取。

新增uiElementFullAttributeForVisibleSubset/uiElementVisibleSubsetFallback，保持惰性
读取和空结果/nil区别；未把它冒充完整0x1007a5158，也未提供尚未恢复的前部探测。
边界fixture覆盖0/1/499/500、相等数量、属性优先级及无属性不读取。
构建32.13秒、自检、固定二进制审计、diff检查通过，日志
/tmp/cua-visible-subset-fallback-*。实际属性读取0x1007a55b8的完整cache/fresh逻辑、
前部候选逻辑、最终索引映射仍待恢复及组合；未进行真实用户应用操作。

## 2026-11-08：完整元素集合的缓存/实时读取

根据 /tmp/cua-visible-subset-fallback.asm 的0x1007a55b8恢复
uiElementCompleteCollectionValue和UIElementProtocol.completeElementCollectionValue。
缓存无subset限制或descriptor.isComplete时，执行宽松数组解码；解码错误/nil是最终
结果，不再尝试实时读取。缓存不存在或availableRanges非nil（包括空数组、覆盖完整
计数的range）才调用严格uncachedValue，错误由现有报告边界处理；保留nil与[]区别。
因此不复用把nil折成[]的普通elementCollectionValue，也不复用接受不完整cache的
partialArrayValue。完整读取组合复用现有AX decoder/provider transaction构造。

fixture覆盖nil/complete/empty ranges/full-cover ranges、缓存解码抛错、缓存缺失，
验证fresh是否调用和空数组保留。Swift build32.78秒、自检、扩展静态审计和diff检查
通过，日志 /tmp/cua-complete-collection-*。完整可见集合候选逻辑与索引映射仍待组合；
本轮未进行用户应用点击，当前生产应用操作仍未验收。

## 2026-11-08：可见集合候选与fallback组合

0x1007a4638候选数组固定为AXRows、AXChildren，不先检查supported或count。
0x1007a5158逐个读取缓存并宽松解码，错误/nil跳过；临时Set用于包含所有visible
identity的判断（0x100763150），成功返回原始candidate数组0x1007a5438，保持顺序
与重复项，不返回Set。candidate不检查partial descriptor；两者失败后才调用已恢复
的完整属性/count fallback。新增resolveVisibleCollection和provider具体组合。

进一步核对0x10076ff6c以8字节步长读取candidate、构造AX identity set，而visible
输入以32字节UIElement步长提取AX identity。因而具体完整集合读取更正为
completeAXElementCollectionValue返回[AXUIElement]，不额外构造UIElement/provider
cache；上一段completeElementCollectionValue的命名/包装在此更正。首次草稿返回Set
会丢顺序/重复，已在最终实现和测试中纠正，未发布该草稿。

测试包含rows不包含visible后读children、首个空candidate接受空visible、重复项
保留、解码错误继续、fallback只在候选失败时执行。最终增量构建15.03秒、自检、
静态审计、diff检查通过，日志/tmp/cua-visible-collection-*。仍缺可见数组与完整数组
到subset索引映射及递归builder集成；本轮未进行真实应用输入验收。

## 2026-11-08：可见identity到完整集合闭区间

0x1007a5034调用0x1007a70b0，以完整AX数组及可见identity Set生成连续区间。
0x1007a7148/0x1007a71a8做membership，匹配run关闭时写start..<(end)对应的
inclusive端点start/end-1，尾run也保留；消费者0x1007a5908对upper加1再切片。
新增uiElementVisibleIndexRanges返回ClosedRange，按完整集合位置而非visible顺序。
相同identity重复出现的各位置都参与，不用identity->单一index字典覆盖。
证据/tmp/cua-visible-index-ranges.asm及/tmp/cua-visible-subset-mapping.asm。

检查非连续、重复、全匹配、空集合及256种可见组合：展开区间恰好覆盖匹配位置，
区间互不相邻（相邻本应合并）。构建32.68秒、自检、静态审计和diff检查通过；
日志/tmp/cua-visible-index-ranges-*。后续区间选择、provider子集构造与builder仍需
组合，不能将当前区间函数单独视为完整可见子集实现或真实点击验收。

## 2026-11-08：可见区间向邻接元素扩展

读取 /tmp/cua-visible-range-selection.asm 的0x1007a546c..0x1007a55b8。
目标count<=0、已达目标或完整数组为空则原样返回；否则以当前闭区间为中心，
首轮向左、再交替左右；某侧达边界则向另一侧补，全部覆盖后停止。
新增expandUIElementVisibleRange，未改成简单对称分配或右侧优先；不缩短已有span。
只接收原builder产生的有效区间，不新加偏离原算法的无效索引自动修正。

显式验证居中、左右边界、目标超总数、不扩展；枚举总数1...10全部有效区间及目标
0...12，覆盖/界限/长度不变量通过。Swift build32.25秒、自检、静态审计和diff检查
通过；日志/tmp/cua-visible-range-expansion-*。排序选择入口0x1007a56f4尚待恢复，
不可把本函数单独当作完整visible subset。生产builder与真实点击仍未验收。

## 2026-11-08：最大可见区间选择及并列语义

读取/tmp/cua-visible-range-sort.asm、-order-core.asm、-insertion.asm。
0x1007a56f4的非负limit先取min，0返回[]；limit<count/10走0x1007a5dec有序
缓冲，否则升序稳定排序后取suffix。0x1007a66c4比较inclusive count，仅严格更小
时移动，故并列保留输入顺序，suffix保留较后出现的并列区间。小限额路径新span
小于首项则跳过，否则upper-bound插入并淘汰最小首项，与同一并列策略一致。
0x1007a5dc4只是COW复制回调，不是排序比较器；不据其符号位置猜比较规则。

新增selectUIElementVisibleRanges，保留两条分支，复用Swift排序而非重写标准库。
显式并列/空/limit0检查；100个不同位置和7种长度的span，limit0...105逐项与独立
(size,originalOffset)排名基准一致。构建38.56秒、自检、静态审计和diff检查通过，
日志/tmp/cua-visible-range-selection-*。完整子集构造与生产builder仍未组合完成，
本轮未发送用户应用输入；真实点击验收仍未完成。

## 2026-11-08：可见子集的选择/扩展/provider组合及映射纠正

组合0x1007a4ee8：partialArrayValue(maxCount:500)错误/nil返回nil；完整集合缺失、
没有匹配run或最大run数量小于partial数组数量时，原array/descriptor不变。
否则选最大run、按请求扩展、从完整AX数组创建UIElement；覆盖全数组时descriptor
为nil，其余为完整count及转换后的半开availableRange。新增provider方法
visibleElementsCalculatingSubset及共享buildUIElementVisibleSubset。

重要纠正：0x1007a46fc的输入是传入的visible属性，不是supportedAttributes集合。
解析0x10114f0ac的导入符号确认是CoreFoundation._CFObject.==；据此将之前错误的
Set输入改为属性相等映射（VisibleRows->Rows，VisibleChildren->Children），相关
provider组合/测试同步修正。旧段落关于“支持集合优先级”的解释由本段替代。

组合检查覆盖分散run不足而保留原partial、扩展到部分/全部、nil完整集合和空匹配。
构建32.78秒、自检、静态审计与diff检查通过；日志
/tmp/cua-visible-subset-composition-*。尚未接入默认children阈值的回调与位置筛选，
也未完成完整recursive builder/真实应用点击验收。未执行用户应用输入。

## 2026-11-08：默认children的visible subset分支接通

新增无需visibleSubset回调的visibleChildrenIfChildrenExceedsThreshold重载，复用
已有阈值选择，将选中属性/minimum直接传给实际visibleElementsCalculatingSubset，
错误使用现有provider报告方法；显式override重载保持不变，选中分支返回nil后不另
fallback。位置筛选仍为必填，未放入空实现。

复核原0x1007a42e0 ->0x1007a4ee8审计已覆盖。构建27.05秒、现有分支边界/组合
自检、固定版本静态审计和diff检查通过，日志/tmp/cua-default-visible-subset-*。
本轮未新建无价值的重载镜像测试，也未用真实用户应用验证该新默认路径。

继续只读0x1007a4844入口，证据/tmp/cua-position-visible-filter.asm：先调用完整
AX集合读取0x1007a55b8，随后读取frame、可选裁剪交集以及子项属性值；几何判定、
缺frame路径、inset值及includeAllVisibleItemRanges组合尚待完整核对，不依据片段
推定全部语义。下一步恢复此位置筛选后才能去掉余下children回调。完整生产点击
仍未验收，本轮未发送用户应用输入。

## 2026-11-08：位置可见性几何核心

完整读取0x1007a4844..0x1007a4ee8，证据/tmp/cua-position-visible-full.asm。
parent.frame缺失=>CGRect.zero，存在clip则CGRectIntersection；子frame缺失/解码
失败同样归零。0x1007a4b44/48加载1.0，CGRectInset(viewport,1,1)之后调用
CGRectIntersectsRect，而非直接使用父窗口边界或通过非空frame判断可见。

新增uiElementPositionVisibility复用CoreGraphics交集/inset/intersects，保留系统的
空/负宽高边界语义，不自行标准化。fixture检查内部、外部、1点边缘被排除、nil子
frame、clip排除、缺父frame不以clip替代和空数组。构建39.37秒、自检、静态审计
和diff检查通过，日志/tmp/cua-position-visibility-*。
此核心尚未接上child AXFrame新鲜读取和可见run选择/完整子集构造，默认position
回调仍必填；完整生产点击验收未完成，本轮未发送用户应用输入。

## 2026-11-08：位置筛选provider与默认children组合

根据/tmp/cua-position-visible-full.asm恢复allChildrenFilteringVisibleElementsByPosition：
完整AXChildren读取后，读取父frame，直接新读各child AXFrame（不使用旧cache，不
补position/size），宽松解码缺失/错误为nil，再使用此前恢复的几何核心。
0x1007a4bd0..0x1007a4d0c将bool mask分连续闭区间；无区间返回nil。
includeAllVisibleItemRanges=true保留所有区间、不扩展；false选最大（并列靠后）
再按minimum扩展。切片后重建UIElement；部分覆盖descriptor保留完整count/半开
ranges，全覆盖nil。新增buildUIElementPositionSubset及provider方法，并补无需
reader回调的默认children重载；显式覆盖入口仍保留。

组合检查验证分离区间全部保留、all模式忽略minimum、并列取后段并扩展、无可见
nil和扩展全覆盖descriptor=nil。构建31.90秒、自检、静态审计、diff检查通过；
日志/tmp/cua-position-subset-*。这些检查不包含真实AXFrame值/窗口通知的现场验收，
也未将默认children接进尚待恢复的完整递归builder。真实应用点击仍未验收。

## 2026-11-08：递归树构建的provider组合

根据/tmp/cua-recursive-add-full.asm新增TransformedUIElement树addRecursively：
复用path<201/共享AX identity Set守卫，UIElement(element:)从当前transaction重建
provider cache，捕获TransformedUIElement，使用实际默认children选择，过滤原始
child index后递归，最终appendBuiltElement携带children subset。
关键调用点769ec0/cache、769f08/capture、769ff4/children、76a12c/recursion、
76a1d0/append已加入固定版本审计。当前入口仍显式接收path、visited、filter及
诊断回调；不能将它当作所有add/rebuild overload已恢复。

使用两个虚构PID的AX identity、实际TaskLocal transaction/cache和AXChildren数据
构成root->[child,child]、child->[root]，验证实际provider组合输出root/单个child、
循环不追加、共享visited正确。不会对这些identity发送输入，也不启动用户应用。
构建38.78秒、自检、静态审计、diff检查通过，日志/tmp/cua-recursive-build-*。
尚须核对递归parent role/context及各入口参数默认值、rebuild/root/focus/menuBar
包装器，再接完整extractor及生产刷新。真实应用点击验收仍未完成。

## 2026-11-08：递归重建入口的过滤/深度组合检查

继续读取0x100769250及其body，证据/tmp/cua-recursive-parent-role.asm和
/tmp/cua-recursive-parent-body.asm。该递归specialization仍执行实际cache/capture、
children、过滤、递归与append；追加4处调用审计。父节点角色/参数的最终逐字段
映射仍需继续核对，本轮未因此修改已接入的parentRole传递，也不宣称此项已完成。

实际事务fixture补充：root的两个重复child全部被filter拒绝时，filter依次收到原始
index0/1，child不进入visited，输出root但无children。path201入口报告一次、树及
visited仍空，filter/捕获错误回调不执行。此前循环去重fixture继续通过。
构建30.10秒、自检、静态审计及diff检查通过；日志
/tmp/cua-recursive-build-boundaries-*。本轮为组合验证/静态证据进展，未改变生产
调用路径；root/rebuild/focus/menuBar与完整extractor、实际点击验收仍未完成。

## 2026-11-08：递归父角色传递的值语义验证

将constructor0x10075e160的x4/x5保存与后续使用关联：x5为转换context，x4是
optional parent role，0x10075e820加载并传入0x100762be4 Chromium值判断。
递归0x10076a0ec读取当前capture的role字段，传给下一层；维持实际父节点role，
不能替换为AXParent读取或调用方传入的固定应用/角色。

实际事务fixture改为AXDateField->[AXIncrementor,同一AXIncrementor]，incrementor
缓存AXValue="5"并回指root。eventStream+isChromium=true时，递归capture的child
isValueSettable=false；相同provider/上下文以parentRole=nil独立capture为true。
此差异验证parent角色确实穿过实际递归/provider/capture值判断，原去重、过滤、深度
检查仍通过；没有测试或发送真实setValue。
构建30.02秒、自检、扩展静态审计、diff检查通过，日志
/tmp/cua-recursive-parent-value-*。root/rebuild/focus/menuBar包装器及生产提取/刷新
仍未完成，真实应用点击验收未完成。

## 2026-11-08：协议根add包装器及visited生命周期

静态读取/tmp/cua-tree-root-add.asm：0x1007664dc打开UIElementProtocol存在类型，
转0x100768994；后者复制source值、从空集合初始化visited，并调用0x100769a74。
新add(_:context:filter:currentPath:parentRole:...)包装器按每次调用创建独立Set，
递归addRecursively改为接受具体UIElementProtocol泛型源，避免预先强制转换导致
深度守卫前读取源属性。path/filter/parentRole仍显式，不猜默认参数。

实际事务root/child循环fixture连续add相同root两次，输出两个root且各自只有一个
child，证明visited在单次递归共享、跨add不残留；原父角色值判断/深度/过滤检查
继续通过。构建36.62秒、自检、静态审计和diff检查通过；日志
/tmp/cua-root-tree-add-*。root默认参数、rebuild/focus/menuBar包装与extractor组合
仍需恢复，未进行真实用户应用操作或生产点击验收。

## 2026-11-08：extractor根add的默认参数

复核/tmp/cua-extract-inner-full.asm 23afe0构造空IndexPath，23aff0..23b014传入
nil closure context、nil parent role；过滤函数23d79c仅mov w0,#1;ret。
根add现默认currentPath=IndexPath()、parentRole=nil、filter恒true，与这一实际
extractor调用一致。这里依据调用点恢复便利默认，不宣称已找到所有公开default
argument thunk。显式参数继续支持其他原版入口。

重复根add事务fixture改用省略参数的调用，验证仍输出两个root、各自child单次去重，
其他递归/父角色/深度检查继续通过。构建30.04秒、自检、固定hash审计和diff检查
通过，日志/tmp/cua-root-add-defaults-*。尚未连接rebuild/focus/menuBar及完整生产
extractor/刷新，本轮未执行用户应用输入，真实点击验收仍未完成。

## 2026-11-08：Mac转换规则的实际rebuild绑定

依据已审计0x10075a858提取item前部UIElement并进入provider builder、空path/
nil parent/fresh visited，新增macTransformationRebuild。Mac树transformed增加
无需外部rebuild实现的重载，将规则回调绑定到实际tree.add，诊断回调仍显式传入，
不以无操作/复制旧subtree冒充。此前override重载保留。

实际事务组合：取已捕获且parentRole=DateField的Incrementor item，手工写旧转换
标题，调用新rebuild；输出标题重新为缓存nil、isValueSettable因parentRole=nil变
true，并重新构造捕获时为空的root子树，证明不是复用旧node/subtree。保留循环
去重。此检查直接调用rebuild helper，尚未覆盖所有实际规则触发条件/defaultPipeline。
构建30.62秒、自检、固定二进制审计、diff检查通过；日志
/tmp/cua-mac-rebuild-composition-*。focus/menuBar与完整extractor/生产刷新仍需
连接；本轮未进行真实应用输入或点击验收。

## 2026-11-08：focus候选属性顺序与共用缓存选择

读取/tmp/cua-focus-tree-body.asm、/tmp/cua-focus-candidate-search.asm及
/tmp/cua-focus-selection-attributes.asm。原focusTree(context:)先调用候选发现
0x1007674b0，后者0x100767524调用0x1007666ec；此helper按Rows/Cells/Children
固定顺序过滤传入的缓存supported set，不新读取支持属性。部分结果随后经原tree
identity table/item定位并进入通用focusTree(selectedItems:)；具体所有分支尚待恢复。

现抽取uiElementSupportedSelectionAttributes，将既有点击选择能力getter改为复用
该实现，避免focus恢复时复制另一套次序/支持判断。检查三属性无序集合输出固定顺序、
无关属性排除及空支持，原选择相关组合仍通过。新增3处focus路径静态审计。
构建38.67秒、自检、固定版本审计、diff检查通过，日志
/tmp/cua-focus-selection-attributes-*。本轮未完整实现focusTree(context:)，不得用
已存在的focusTree(selectedItems:)冒充候选发现/定位；生产点击仍未验收。

## 2026-11-08：focus选择属性的首个正count规则

继续读取/tmp/cua-focus-candidate-body.asm和/tmp/cua-focus-candidate-result.asm。
0x1007674b0先探测所支持选择属性的count：缓存读取/CFArrayGetCount，缺缓存则
原生AXUIElementGetAttributeValueCount；count>=1即退出属性循环，之后才解码该
属性的选中集合。后续解码失败不能退回属性循环重新选择。

新增uiElementFocusSelectionAttribute，仅恢复此属性选择阶段，复用已有ordered
support helper及hasCount。fixture验证count抛错继续、首个positive短路、nil/负/零
全部继续及空support不求count。缓存/原生count具体组合、后续解码与identity原树
定位仍待恢复，不以该helper冒充完整候选函数。
构建32.64秒、自检、3处新静态调用审计、diff检查通过；日志
/tmp/cua-focus-positive-selection-*。未发送真实应用输入，完整生产点击验收未完成。

## 2026-11-08：focus选中数组读取组合

读取/tmp/cua-focus-candidate-result.asm：选定属性后0x100767c64用宽松decoder
0x100712f2c解码缓存，nil/失败才进入同属性uncached分支0x100767ce0，再于
0x100767d74宽松解码；成功的空数组为最终结果。结果是UIElement数组（focus
consumer32字节步长），不同于此前完整可见集合的原始AX identity数组。

新增UIElement.selectedElementsForFocus，复用已有count、属性缓存优先组合、
AX错误/unsupported处理和实际UIElement数组decoder。共享阶段helper确保read
仅针对首个正count属性，不因nil/空再探下一属性。测试覆盖nil、空、重复值的结果
及无positive不读取。此轮测试验证控制流，尚未用真实provider缓存/原生读取
fixture覆盖此新增具体方法；不宣称完整focusTree恢复。
构建33.11秒、自检、静态审计、diff检查通过，日志/tmp/cua-focus-selection-read-*。
后续原树identity定位、focus结果分支及extractor仍待连接；真实应用点击未验收。

## 2026-11-08：focus选中数组的具体provider缓存验证

补充上一轮未覆盖的UIElement.selectedElementsForFocus实际组合：使用虚构PID
AXidentity、真实UIElementCache及TaskLocal transaction，不调用用户应用输入。
Rows缓存[child,child]保留两项，解码时构造的UIElement均读到当前事务Title；
Rows partial descriptor.count=2但raw=[]时返回[]，不被有值Cells替换；Rows非数组
导致count=0时才选择Cells，读取两项。报告错误回调在这些fixture中不应执行。

这些测试直接运行具体provider方法，不再仅是阶段helper。构建39.21秒、自检、
既有固定版本审计及diff检查通过；日志/tmp/cua-focus-provider-cache-*。
本轮没有修改产品逻辑；uncached原生读取失败/通知现场不在该缓存fixture覆盖内。
原树定位与完整focus/context提取仍待恢复，完整生产应用点击验收仍未完成。

## 2026-11-08：focus选中identity的原树定位阶段

核对/tmp/cua-focus-tree-body.asm 766d78/table ->766d9c/identity index ->766de8/item。
missing identity或missing Item立即停止循环，随后767008比较已定位数量与原selected
数量；不相等进入后续fallback，不能compactMap丢失项后当成功。
新增itemsForFocusSelection返回完整[Item]?作为此阶段的全量成功标记，缺失nil、
空输入[]，原树表/Item实现复用，保留selected顺序和重复，不重新capture已有节点。
此helper不等同完整focusTree(context:)，fallback与结果树构造仍需组合。

真实TransformedUIElement树fixture检查child/parent/child顺序、原title、子集
descriptor、完整父subtree、missing identity失败及空选择，原focused snapshot不变。
构建32.56秒、自检、3处静态调用审计、diff检查通过；日志
/tmp/cua-focus-item-resolution-*。未执行真实用户应用输入，生产点击验收仍未完成。

## 2026-11-08：focus定位成功后的leaf投影

核对/tmp/cua-focus-tree-body.asm 767024..7671bc：全量identity定位成功后，并非
把原Items直接挂入focus树，而是逐项构造新Item，清空subtree及其focused snapshot、
移除subset metadata；仅保留捕获element。subset常量101159da0为(0,1)，与已恢复
optional descriptor nil存储一致。之后调用通用focusTree(selectedItems:)。

新增focusTreeForResolvedSelection，保留输入顺序/重复element，按原版构造leaf。
此阶段与上一轮itemsForFocusSelection职责不同：定位阶段保留原Item，投影阶段才
去掉其后代。fixture验证parent选中项的后代被去除、所有subset=nil、重复保留、
root focused snapshot保留、原树未修改、无focus返回nil。
构建30.56秒、自检、静态审计及diff检查通过，日志
/tmp/cua-resolved-focus-tree-*。定位失败的fallback及完整focusTree(context:)仍未
组合，生产提取/刷新及真实应用点击验收仍未完成。本轮未发送用户应用输入。

## 2026-11-08：focus原树定位失败的全选择重建

从/tmp/cua-focus-tree-body.asm 7671e0及/tmp/cua-focus-tree-final.asm确认：数量
不匹配时销毁部分matches、记录一次warning，然后对全部selected sources重建。
767374构造空path，767380新空visited，7673a4 parentRole=nil，7673a8进入
unfiltered provider builder；每个source单独构建，之后76740c将新Items挂到focus。
和全量定位成功不同，fallback保留新建subtree，不作leaf投影。

新增focusTree(forSelection:context:...)阶段组合：nil选择用空selectedItems、全量
定位成功走leaf投影、缺失走上述全部重建；warning仍显式回调，非空壳。
实际transaction fixture原树items为空但有focus snapshot，selected[root,root]
触发一次failure报告、输出两个root且各有child；原空tree不变。新建父role与
单项visited沿用已恢复root add，循环去重测试继续通过。
构建37.13秒、自检、静态审计、diff检查通过，日志/tmp/cua-focus-fallback-*。
尚需把focus snapshot的provider选择读取接入完整focusTree(context:)入口，并完成
menuBar/extractor/生产刷新；本轮未执行用户应用输入，真实点击仍未验收。

## 2026-11-08：focusTree(context:)入口组合

接通已恢复的focus snapshot provider选择读取、identity原树定位、成功leaf投影与
失败全量重建。入口无focusedElement立即nil，不重新查全局focus；有focus时从
其捕获的UIElement/cache读取selectedElementsForFocus，再交给前一轮阶段组合。
诊断回调显式传递，尚未声称日志默认分类/文案全量对齐。

真实TransformedUIElement树+UIElementCache+TaskLocal事务fixture调用新入口：
provider选择[child,child]，原树定位后两项title均为原tree的"stored child"，而非
新建provider的title；重复保留、subtree和subset清空。之前fallback递归组合检查
仍通过。构建30.41秒、自检、固定版本审计与diff检查通过，日志/tmp/cua-focus-entry-*。
该入口尚未连接完整extractor，native通知/实时选择错误及全defaultPipeline均未
现场验收。仍缺menuBar、提取/生产刷新组合；真实应用点击验收未完成。

## 2026-11-08：menuBar immediate item过滤

读取/tmp/cua-menu-bar-build.asm、-body.asm。原addMenuBarWithImmediateItems
通过724ef4获取typed items，76825c在读title前无条件跳过index0。缓存Title宽松
解码，缺失/错误title保留；7685ec构造小字符串"Debug"，768628导入符号解为
Foundation.StringProtocol.contains，匹配区分大小写。不能把"debug"都过滤，也不能
据方法名把全部子菜单递归展开。

新增immediateMenuBarItems过滤核心，检查首项不读title、Debug/MyDebugger过滤、
lowercase debug/空/nil保留。构建32.71秒、自检、3处静态调用审计和diff检查通过，
日志/tmp/cua-menu-bar-filter-*。完整菜单包装类型、逐项capture/append、根capture
尚需组合；原循环title与capture交错的顺序不能被未来批量过滤再捕获替代。
未进行用户应用输入或生产点击验收，完整目标未完成。

## 2026-11-08：菜单栏逐项capture与根追加组合

新增forEachImmediateMenuBarItem，过滤后立即visit，原过滤数组helper改为复用。
新增addMenuBarWithImmediateItems(_:items:context:...)阶段组合，显式typed items
输入；每个保留项从当前transaction重建UIElement并capture(parentRole:nil)，创建
空subtree/subset=nil叶节点，然后重建capture菜单栏root并append。不能先批量读取
所有title再capture，也不递归展开子菜单。typed MenuBar/items getter仍待恢复。

trace检查title1/capture1/title2(过滤)/title3/capture3交错顺序；实际事务fixture
首项Apple跳过、Debug跳过、File从provider旧title重建为事务"fresh File"，只产生
一个叶节点，root/child均无subset。构建32.68秒、自检、5处新静态调用审计、diff
检查通过，日志/tmp/cua-menu-bar-composition-*。完整菜单入口/提取刷新与真实应用
点击仍未验收，本轮无用户应用输入。

## 2026-11-08：typed MenuBar/items入口

符号确认724de0实际为MenuBarUIElement.init(element:)，并非此前MenuBarItem文件
注释所写，已纠正文档注释。新增MenuBarUIElement存储/共享provider构造与itemsValue，
读取AXChildren，缓存与实时宽松解码均使用typed MenuBarItem initializer，nil/失败
返回[]，缓存[]最终。source724fd4/7250d4都以flag0调713e4c，故不直接套用fresh
strict的普通elementCollectionValue。items便捷getter使用现有provider错误报告。
新增typed addMenuBarWithImmediateItems重载连接实际items读取与前轮逐项capture。

事务fixture验证typed children重复保留、typed add首项跳过后保留一项、缓存空数组
不读取实时值，原捕获/过滤检查仍通过。构建30.63秒、自检、静态审计及diff检查
通过，日志/tmp/cua-menu-bar-typed-*。未验证原生live读取错误/通知路径；应用menuBar
属性获取、完整extractor及生产刷新仍需连接，真实应用点击未验收。

## 2026-11-08：ApplicationUIElement.menuBar属性获取

读取/tmp/cua-application-menu-bar.asm：原718d48读取AXMenuBar，缓存decoder flag0
(718e48)，fresh decoder flag1(718f70)，通过同一typed MenuBar initializer构造。
缓存nil/解码失败再进入known-unsupported/fresh处理，错误沿既有日志边界转换nil。
新增menuBarValue及menuBar便捷getter；把已有decodeAXUIElement的共享type dispatch
泛化到UIElementProtocol目标，保留所有CF/marker/array分支及原UIElement调用兼容，
避免为MenuBar另写简化的裸CF类型判断。

实际事务fixture通过缓存AXMenuBar引用生成typed MenuBar，其cache读到事务AXRole；
已知不支持AXMenuBar的provider返回nil且错误回调不执行。原parent/element解码组合
一并自检通过。构建36.85秒、自检、静态审计、diff检查通过；日志
/tmp/cua-app-menu-bar-*。未覆盖现场AX读取错误/通知，完整extractor及生产刷新尚未
连接，真实应用点击验收未完成。本轮未进行用户应用输入。

## 2026-11-08：提取器菜单栏条件与读取顺序

核对 extract inner 23b0c8..23b138：先比较 root provider identity 与入口保存的
x4 identity，不匹配直接跳过 AXMenuBar；匹配后先读取 Application.menuBar，取得
非 nil 菜单后才判断 context tag2（informational）并跳过 append。因此不能用
includesMenuBar 提前挡住属性读取。新增 withSelectionExtractionMenuBar 阶段，显式
接收匹配结果，保留 read-before-context-gate 顺序。入口 x4 的具体来源尚未追清，
未擅自命名为 app/window identity，也未接入生产提取器。

新增全部三种 context × 匹配/不匹配 × 属性存在/缺失的12组顺序检查；完整 Swift
构建、provider-click-self-test、固定二进制新增3处调用审计及 diff 检查通过。
日志 /tmp/cua-menu-extraction-gate-*。本次无真实应用输入，未证明应用点击修复；
下一步仍需追踪 scope identity、焦点附加与完整提取器生产连接。

## 2026-11-08：菜单栏范围确认为应用 identity，连接实际属性与树构建

静态追踪新文件 /tmp/cua-extract-transaction-thunk.asm、-forward.asm、-body.asm：
23d714→240700→23ce1c→23aa2c。outer238344保存应用首字x22到frame+10；
2387dc/e8保留该对象并写frame+58；2388a0/a4写闭包capture+18；24070c的x2
读取capture+18；23ce50保存、23d114/11c保留、23d18c送入inner x4。
结合outer238374..3a4 Application.enableAccessibility及transform context参数布局，
确认菜单gate比较的是提取root与应用AX identity，而非window identity。

新增addSelectionExtractionMenuBar，将实际AX identity比较、Application.menuBarValue
及typed addMenuBarWithImmediateItems连接起来，保留上一轮read-before-context-gate。
实际事务fixture验证匹配时追加菜单root、不匹配时不追加；此前12组顺序检查保留。
Swift构建、自检、增加3处forward调用审计及diff检查通过，日志/tmp/cua-menu-app-scope-*。
完整extractor仍未连接该入口；后续焦点附加、版本构造和生产刷新仍需组合。无真实
应用输入，不能将此结果视为应用点击修复或完整目标完成。

## 2026-11-08：提取焦点附加的缺失行为

静态读取 /tmp/cua-extract-focus-attachment.asm 及 -tail.asm：inner23b174/178
焦点nil直接跳过，非nil23b1d0→23dc7c。专用helper23dd38生成原tree table，
23dd98取匹配item，再将element写focusedElement并返回；缺失23de20..de9c同时
清空原focus并返回nil，extractor23b214/218对nil走诊断分支。不存在额外捕获新
focus或将缺失focus插入主树的逻辑。

新增attachSelectionExtractionFocus复用现有provider/table setter，保留无输入
focus时不清除已有focus、存在但不匹配时清除并report一次。真实树fixture验证nil
保持、匹配使用stored child捕获值、缺失清除/只报告一次、树结构及原副本不变。
Swift构建、自检、4处新静态调用审计及diff检查通过，日志
/tmp/cua-extract-focus-attachment-*。诊断文案尚未全量恢复，该阶段仍未接入完整
生产extractor；真实应用点击与光标仍未验收，本轮无用户应用输入。

## 2026-11-08：主树/菜单/焦点树阶段组合

核对inner23aef0分支：cache tree不存在时23af30..23b014初始化空树并add(root)，
存在时23b038..b084复制缓存树；两条分支都汇合23b094菜单gate，再到焦点附加和
23b470 focusTree。故不能推测复用缓存就应跳过菜单阶段或额外按identity去重。

新增buildSelectionExtractionTrees连接实际add、菜单、焦点附加和focusTree，返回
主树与可选焦点树。缓存验证与Electron焦点解析明确仍属上游，转换/revision属下游。
实际事务fixture验证无缓存构建根后追加菜单、复用缓存仍执行菜单阶段且不修改原缓存
副本；无focus时focusTree=nil。Swift构建、自检、固定版本审计和diff检查通过，
日志/tmp/cua-extraction-trees-*。该组合尚未连接事务入口及完整SystemSelection生产
发布，真实用户应用点击仍未验收；本轮未发送输入。

## 2026-11-08：事务内主树/焦点树提取组合

新增withSelectionExtractionTrees，复用withSelectionExtractionTransaction，按原顺序
在transaction外prepare transformation，在transaction内解析Electron fallback焦点、
复用验证后的cache/build主树、菜单/焦点附加及focusTree，再在同一transaction和AX
assertion作用域内执行调用者continuation。避免将后续render/revision移到transaction
结束、enablement disable之后。具体SystemSelection生成仍待接入，入口不冒充完整extract。

组合fixture使用实际TreeCache与inner事务：不调用新建monitor/transaction工厂；context
构造前current=nil，continuation读取inner current并得到focusTree，结束恢复current后
disable。顺序enable/context/work/disable，结果23。完整Swift构建、provider自检、
固定版本审计及diff检查通过，日志/tmp/cua-extraction-tree-transaction-*。该fixture
未覆盖现场Electron搜索或真实应用输入；生产点击、光标及最终发布仍未验收。

## 2026-11-08：修正转换前URL accounting重置遗漏

核对inner23b500..23b538，原版保存configuration后明确调用URLShortener.reset，
再进入23c344转换/URL注册。本仓withSelectionTreeURLCompaction此前缺少这个入口
reset，会把之前捕获/焦点阶段积累的URL带入新一轮统计。现按原顺序补齐；保留原有
成功后的compaction/trim及抛错时不执行尾部compaction行为。

测试先植入stale URL，在成功与抛错的transform入口用真实shortener测量均为0，
原有配置/totalLength和结果trim检查通过。Swift构建、自检、reset调用固定版本审计、
diff检查通过，日志/tmp/cua-extraction-url-entry-reset-*。截图判定helper23eb1c
已定位到end23f630，复杂谓词尚未完整还原；不据方法位置猜测其策略。生产最终发布
及真实应用点击仍未验收，本轮无输入。

## 2026-11-08：截图谓词完整静态边界与常量提取

前轮截图判定只截取到函数前部，本轮保存完整23eb1c..23f630反汇编到
/tmp/cua-extract-screenshot-full.asm，未执行原厂二进制。确认该谓词不是简单的
“始终截图”或“浏览器/应用二选一”：23ecc4读bundleID，匹配四项静态列表时返回
false；否则枚举主树全部节点，count<=9返回true。较大树继续筛选image角色、
roleDescription="image"或subrole="AXTextAttachment"，对候选实时读取AXSize，
宽高均严格大于100时返回true（23f184..23f1bc）。后半还有MobileSMS、button及
"Sticker"判断，并读取_actionDescriptions参与后续集合逻辑；集合helper语义尚需
进一步追踪，不声称完整谓词已还原。

从Mach-O静态Swift String数据按小字符串/静态长字符串布局读取并锁定：
0x10154ef38起四项分别inc.software.app、inc.software.development.app、
com.openai.sky.app、com.openai.sky.development.app；0x10154efa0起两项分别
Add to Photos Library、Quick Look。新增固定版本审计直接验证这些内容，防止只凭
附近字符串推测。审计及diff检查通过，日志/tmp/cua-extraction-screenshot-constants-audit.json。
本轮无Swift逻辑变更、未重复构建、无用户应用输入。后续应追踪动作集合helper后组合
截图谓词，再连接selection；真实点击和完整目标仍未完成。

## 2026-11-08：完整截图需求谓词实现

继续追踪23df50→23e100：按较小set迭代、对另一个set进行String hash/probe，
仅命中时设置结果bit并增加count（23e2dc..e310），再23da5c构造结果。确认是交集，
并非差集。23f590把实时actionDescriptions的description列转Set；与Add to Photos
Library/Quick Look集合交集非空即返回true。MobileSMS候选是button且identifier
为Sticker：原23f2e4/ecload d8/d0；单独读取有名identifier.getter75d170，其75d17c
确实load d0，不能把此字段误判为title。新增对应静态反汇编文件/tmp/cua-screenshot-*
和5处调用审计。

新增selectionExtractionNeedsScreenshot泛型核心及实际tree/application包装，保持
排除bundle→枚举全树→<=9→批量筛图片→实时尺寸严格>100→再次读取bundle→
MobileSMS批量筛Sticker→逐个读动作描述求交的顺序。使用现有Swift Set、provider
sizeValue和actionDescriptions，不重写第三方/标准库集合算法。测试覆盖9/10阈值、
100边界与NaN、两类动作/重复/大小写、排除时不枚举以及两次bundle读取状态变化。
Swift构建、自检、固定版本审计与diff检查通过，日志/tmp/cua-extraction-screenshot-*。
尚未接入最终selection截图标志，也未验证现场AXSize/动作获取；无真实应用输入，
点击与完整目标仍未完成。

## 2026-11-08：截图上下文字段接入及短路参数来源纠正

本轮起初拟将23b474短路解释为alwaysIncludeScreenshot；继续逐级追踪后证据否定
此解释，相关未完成接线已撤掉。实际来源outer2386f4 Application.isWebShaped，
2386f8/23870c保存结果frame+8，2388ec送capture+88，转发至inner stack+50。
进一步读取240774引用的nominal descriptor1012c1824，名称确为
FocusedUIElementAccessibilityInfo，field descriptor10131aa64五项为windowRevision、
copyMenuItemIsEnabled、webAreaURL、contextType、screenshotNeededForContext。
23b4a4写的是最后一字段。新增直接验证类型/字段名称的固定版本审计。

树组合结果增加screenshotNeededForContext；在focusTree之后计算
prepared.isWebShaped || selectionExtractionNeedsScreenshot，保留web=true时不访问
谓词，并从实际preparation传入第一次web分类结果，不拿context初始化的独立web
查询替代。alwaysIncludeScreenshot仍是另一参数，尚未接入此阶段。测试覆盖短路、
false时谓词只调用一次及实际小树组合标志；构建、自检、静态审计和diff检查通过，
日志/tmp/cua-extraction-screenshot-context-*。此前flag-build是中间构建，不能作为
最终实现验收。完整FocusedUIElementAccessibilityInfo/selection发布尚未组合，真实
应用点击仍未验收，本轮无输入。

## 2026-11-08：webAreaURL提取并加入树阶段结果

读取完整helper23c064..23c344（/tmp/cua-extract-web-url.asm）：实际主树Iterator
逐项判断webArea role，取captured URL；nil继续next，不因遇到首个WebArea而停止。
非nil直接返回。无provider URL新查询、不查独立focusedElement快照、也不遍历额外
focusTree。调用点23b4b8位于截图标志写入之后、URL reset/转换之前。

新增selectionExtractionWebAreaURL并按此顺序加入SelectionExtractionTrees.webAreaURL。
树fixture验证非web节点URL忽略、前web nil继续、嵌套先序URL优先、独立focus URL不作
fallback和空树nil。Swift构建32.81秒、自检、5处新调用静态审计及diff检查通过，
日志/tmp/cua-extraction-web-url-*。尚未组合全部FocusedUIElementAccessibilityInfo
及SystemSelection生产发布；本轮无真实输入，应用点击仍未验收。

## 2026-11-08：树转换与URL压缩组合入口

复核/tmp/cua-extraction-transform-full.asm，23c578/23c62c分别获取Mac defaultPipeline。
新增transformSelectionExtractionTrees：一次withSelectionTreeURLCompaction内先转换
主树，再转换非nil焦点树，然后由已有helper注册URL并按配置变化trim。保留捕获阶段
screenshotNeededForContext和webAreaURL，不在转换后重新推导它们。实际host重载每次
转换都读取defaultPipeline，调用已有concrete transformed/rebuild，不引入备用算法。

组合检查验证两次转换共用同一inout context、主/焦点顺序、结果独立、输入副本不变、
上下文元数据保留；首转换抛错时不运行第二次。Swift构建、自检、静态审计及diff检查
通过，日志/tmp/cua-extraction-transform-composition-*。该fixture用显式转换callback
验证组合语义，不能证明整套Mac defaultPipeline已在现场应用验收；完整生产发布、
实际应用点击与光标仍未完成，本轮无用户输入。

## 2026-11-08：五字段AccessibilityInfo与版本封装组合

新增FocusedUIElementAccessibilityInfo，字段与已审计nominal/field descriptor一致：
windowRevision、copyMenuItemIsEnabled、webAreaURL、contextType、screenshotNeededForContext。
新增makeSelectionAccessibilityInfo消费已转换树，在同一inout context调用实际
makeSelectionTreeRevision，保留转换前捕获的URL/截图标志。Copy标志按inner23ad9c
初始false，该函数仅代表inner阶段，不宣称外层菜单查询/后处理已经还原。

扩展转换组合fixture，实际render/root编号后检查主树title与上下文元数据，再生成
启用diff的appending版本验证previous引用，禁用diff生成新root验证无previous。
Swift构建30.62秒、自检、固定版本审计和diff检查通过，日志
/tmp/cua-extraction-accessibility-info-*。完整outer extractor、最终SystemSelection
发布及生产refetch连接仍未完成；无用户应用输入，不能证明应用点击修复。

## 2026-11-08：事务→实际Mac默认管线→渲染版本→AccessibilityInfo组合

新增finishSelectionExtractionAccessibilityInfo：以本轮局部totalLength=0进入实际
transformSelectionExtractionTrees(host)，随后同一inout context进入实际revision
root/appending与五字段封装；不另造renderer，不在转换后重算捕获元数据。
该入口须在withSelectionExtractionTrees的continuation内调用，外层SystemSelection
及菜单后处理仍不包含在此阶段。

扩展事务组合fixture，在实际TreeCache/inner transaction下调用上述入口，运行完整
Mac默认管线、URL accounting、实际render/root编号，再校验contextType、URL与
截图元数据保留及root无previous。返回后仍为同一inner current，作用域结束才恢复
current并disable。Swift构建、自检、静态审计及diff检查通过，日志
/tmp/cua-extraction-accessibility-pipeline-*。这覆盖该fixture输入的实际默认管线
组合，不能证明所有转换规则或真实应用树均正确；仍无用户应用输入，生产点击、
光标及最终selection发布未验收。

## 2026-11-08：SystemSelection遗漏的三字段恢复与封装

读取23d1fc..23d360（/tmp/cua-extract-selection-publication.asm），发现旧SystemSelection
仅三字段的注释/实现不完整。23d6c4 accessor指向nominal1012c17a8；直接解析
field descriptor10131a984得到六项applicationWindow/windowRevision/invalidationMonitor/
url/contextType/screenshotNeededForContext。23d244..248写前三引用，23d260写context，
23d28c复制URL，23d2a8写截图标志；Copy标志在23d1dc被重置且不是selection字段。

补齐SystemSelection的后三字段及AccessibilityInfo初始化入口，保留既有三参数
构造调用默认值兼容；新封装显式传入真实元数据。增加类型/六字段静态审计。扩展
实际事务/默认转换/版本fixture，验证封装保留window/revision/monitor引用与URL、
context、截图标志，副本修改不影响原selection。Swift构建、自检、审计及diff检查
通过，日志/tmp/cua-system-selection-fields-*。更新CURRENT-ACCEPTANCE最新内部组合
边界。外层alwaysIncludeScreenshot后处理、完整生产extract/refetch及真实点击仍未
完成，本轮无用户应用输入。

## 2026-11-08：shouldUseFullSkyshot URL规则

静态读取23d37c..23d3ec及有名shouldUseFullSkyshot(for:)23d3f0，后者直接跳转
23f630..23f998。导入解析确认23f6f0为Foundation.URL.host，23d488为Swift Regex
_regexString/version构造；静态101248b50保存docs.google域名匹配表达式。helper按
host匹配，nil host返回false，Regex错误按无匹配处理。新增shouldUseFullSkyshot使用
Foundation URL.host及Swift Regex，未写手工域名后缀算法。

测试覆盖普通/大小写/子域、多级TLD、无host、非边界前缀、含数字或连字符尾缀、
仅路径包含域名、缺少TLD。构建、自检、3处调用与静态regex文本审计、diff检查通过，
日志/tmp/cua-full-skyshot-url-*。未运行原厂helper做动态差分，也未据函数名把
alwaysIncludeScreenshot全参数路径宣称恢复。最终调用门控仍需和两个Bool参数及
web-shape捕获逐项对齐后接入；本轮只恢复URL helper，无真实应用输入，点击仍未验收。

## 2026-11-08：正则原生literal编译表示核对

上一轮通过公开Regex(String)实现同一模式，但原构建调用的是internal
Regex.init(_regexString:version:)。直接从普通业务源码调用此internal入口会编译失败，
不为此增加ABI桥接。改用Swift原生regex literal，由编译器生成同一入口。

独立编译/tmp/cua-regex-literal-oracle.swift，emit-silgen确认生成_regexString/version，
再读取自编译Mach-O中的regex字符串，与固定vendor101248b50逐字节比较相同。
独立运行literal与之前String模式的6个host样例结果一致，未执行vendor程序。
产品helper改为原生literal，去掉运行时try! Regex构造。Swift构建、自检、固定版本
审计及diff检查通过，日志/tmp/cua-full-skyshot-regex-literal-*。这证实模式编译表示，
仍不证明完整URL helper/外层门控动态差分或真实截图/点击流程已验收。

## 2026-11-08：纠正Bool转发重排造成的截图门控错误

本节取代此前“截图上下文字段接入及短路参数来源纠正”中将inner短路标志认定为
isWebShaped的结论。此前遗漏23ce1c对栈参数的重排，虽同为fp+50，属于不同函数
栈帧，不能直接视为同一输入。完整链：outer w6(always)→frame30→capture70→
240728/sp28→body fp38→saved-ac→23d14c/154写inner incomingSP40→inner fp50。
web则outer2386f4结果→frame8→capture88→240734/sp40→body fp50/23d1ac，控制
23d2b0的最终URL规则。新增9处固定指令审计锁定这两条不同转发链。

修正树组合截图短路参数为alwaysIncludeScreenshot，事务入口显式传递，不再错误
使用prepared.isWebShaped。新增makeExtractedSystemSelection：先按六字段封装，
仅web=true且URL匹配shouldUseFullSkyshot时提升截图需求，其他情况保留原标志。

组合fixture验证web true/false、匹配URL、nil URL、已有截图true不被清除；内部always
短路及false时谓词仅调用一次检查仍通过。最终Swift构建、自检、固定版本审计及diff
检查通过，日志/tmp/cua-screenshot-flag-routing-*。构建完成后仅修正了一处过时注释。
尚未连接完整生产extractor/refetch；本轮无用户应用输入，点击问题未验收。

## 2026-11-08：单入口内部SystemSelection提取组合

新增extractSystemSelection，将已有capture/enablement、缓存验证与事务、focus解析、
主/焦点树、always截图短路、URL提取、实际Mac默认转换、URL accounting、root/append
渲染版本、六字段封装和web URL后处理按顺序连接。后续转换和封装仍在同一事务及
AX assertion作用域内；沿用prepared monitor/web分类而非额外重查。host依赖、诊断
与context构造仍显式，不以无日志默认值掩盖尚未接线的生产边界。

实际cached-tree fixture直接调用该单入口，验证最终window/monitor引用、context、
强制截图及新root，context准备在事务前，disable在事务恢复之后。Swift构建、自检、
固定版本审计及diff检查通过，日志/tmp/cua-system-selection-extraction-*。该用例
以已有缓存树开始，未验证现场AX全树采集、Electron搜索、生产refetch/Target默认接入
及真实应用输入。完整目标和点击问题仍未完成，不能把此内部单入口称为现场修复。

## 2026-11-08：refetch上下文/参数准备与发布接口

重新读取原有名refetchTree2305ec..231260（/tmp/cua-refetch-tree-complete.asm）。
230760从当前selection.applicationWindow.axApplication取fresh focused context；
2307d8/e8将TreeCache标记nil，2307ec读取旧revision。inlined extract使用fullUI tag0、
AX enablement、nil额外root、always截图false（230e9c）、实例diff标志（230ea4），
新状态最终才发布。当前Target/main.swift.collect仍是旧Node数组采集，未接新提取器，
因此不能据此前内部fixture声称生产路径已修复。

新增RefetchTreeExtraction请求和refetchTree(readContext:extract:)重载，显式携带
上述固定配置，fresh context成功后读取旧revision并调用原有成功后赋值发布边界。
检查请求参数/引用、context→extract顺序、成功替换selection，以及context错误不进入
extract/不替换selection。Swift构建、自检、3处调用静态审计及diff检查通过，日志
/tmp/cua-refetch-extraction-request-*。具体生产host依赖和extractSystemSelection
绑定仍需接线，现场AX树与真实点击仍未验收；本轮无用户应用输入。

## 2026-11-08：refetch原生host绑定

新增MainActor refetchTree诊断重载：复用实际Application.focusedUIElementContext、
Application.enableAccessibilityIfNeeded/focusedUIElement、原生transformation context
构造及extractSystemSelection，按RefetchTreeExtraction固定配置调用，不再要求调用者
提供整个extract函数。reportError显式写any Swift.Error，避免嵌套RefetchableSkyshotAXTree.Error
遮蔽协议Error造成类型不兼容；首次构建发现此问题，修正后重建通过。

新增MainActor负向fixture：虚构app且缓存明确不支持窗口属性，直接调用新host绑定，
得到noWindowsAvailable；不进入后续诊断/提取，不改变已有window/revision。完整Swift
构建、provider自检、固定版本审计及diff检查通过，日志/tmp/cua-refetch-native-binding-*。
该新增用例只验失败边界，不证明真实窗口/AX采集或enablement执行成功。Target旧Node
采集/输入路径还未切换，真实应用点击和完整目标仍未完成，本轮无用户应用输入。

## 2026-11-08：失效判断→具体元素恢复→包装器更新组合

新增refetchElementIfNeeded(...extractSelection:)重载，连接已有实际invalidation/
validation决策与recoverElement同类型重建/属性匹配/歧义检测/提取发布算法；新增
RefetchableUIElement.refetchIfNeeded(...extractSelection:)沿原更新边界只替换element，
保留owner及containingTree。未添加任意错误重试，也未改变匹配属性或忽略值语义。

组合检查：无失效不做role验证/不提取，包装器可正常更新；layout失效时跳过raw role
验证并执行实际RefetchReconstructionProbe动态类型重建，属性匹配则不提取整树，
revision保持同引用。Swift构建、自检、固定版本审计及diff检查通过，日志
/tmp/cua-element-extraction-binding-*。该fixture覆盖匹配后的快速返回，缺失/歧义
分支保留已有检查，但新增host直连/真实AX变化尚未验收。Target仍未切换该路径，
本轮无用户应用输入，应用点击和完整目标未完成。

## 2026-11-08：按rendered ID刷新及写后刷新入口

扩展RefetchableElementExtraction：整数ID入口复用当前revision的item(for:)再连接
实际recoverElement，不把ID当数组下标；RefetchableUIElement.setValue增加实际恢复
组合入口，先执行底层write，成功后refetch(validate=true,ignoreValueChange=true)。
不回滚已完成写入、不重试失败写入，保留现有resolver重载。

组合检查新增有效rendered ID在两种validate配置下返回同一tree owner；写后无monitor
时返回noInvalidationMonitorProvided，写已发生且wrapper元素保持；底层write错误直接
传播而不进入提取。fake writer未发送真实AX输入。Swift构建、自检、静态审计及diff
检查通过，日志/tmp/cua-indexed-write-extraction-*。extractSelection仍由调用处提供，
完整native recovery默认绑定/Target切换和真实点击未验收，目标仍未完成。

## 2026-11-08：生产输入适配器去除ID=数组位置假设

检查main.collect使用result.count+1、action/Mouse/MouseWindow/Scroll使用nodes[id-1]
与id>0门控；而恢复的原生render编号从0开始，diff继承可能产生空缺。直接切换提取器
而不迁移此处会错误定位或拒绝合法ID。新增observedNode(for:in:)按Node.data.id查找，
接入AX action、索引点击点/实际点击、mouseWindow以及两条滚动祖先遍历。保留旧连续
1-based观察兼容，未改变当前collect输出或允许未知ID。此为本项目transport适配修正，
不冒充原厂Node序列实现。

fixture使用逆序[42,0]，验证实际identity、0/稀疏ID、缺失/负数及旧[1,2]兼容。
Swift构建、自检、固定版本审计及diff检查通过，日志/tmp/cua-observed-id-lookup-*；
搜索确认上述输入路径不再用id-1索引。尚未验收公开schema/client是否允许0，也未
接入新观察/生产refetch。此缺口是迁移前置问题，不据此断言既有1-based观察点击
失败的根因已找到或修复。本轮无用户应用输入，真实点击仍未验收。

## 2026-11-08：零起始ID的客户端与Sky协议门控修正

继续检查发现两处额外阻塞：native-macos client click/scroll用<=0拒绝0；Swift
SkyElementAction对pointer与setValue/selectText/secondary都用>0。修改为非负整数，
保留JS safe integer、坐标互斥、当前观察成员判断和Swift canonical decimal string
校验；未放宽未知/负数或"00"等编码。bind_mac_app与provider成员查询原本不依赖
数组位置，无需另写转换。

新增app binding→native client→fake transport用例，观察ID0/42分别点击、滚动、
setValue，确认原ID透传，负数仍拒绝。18项native-macos-client测试全部通过，原生
TS配置typecheck通过。Sky action自检新增0/42与负数/非规范字符串检查；Swift构建、
Sky action/provider自检、静态审计与diff检查通过，日志/tmp/cua-zero-id-*。测试未
派发用户应用输入，不能证明新观察/生产refetch已接入或点击修复；目标仍未完成。

## 2026-11-08：渲染revision到观察transport节点的投影

新增selectionObservedNodes适配本项目Node transport，遍历full render及focus render，
用每个elementID经revision.item(for:)解析实际source binding，不重新遍历AX，也不以
render位置代替sourcePath。相同ID只输出一次，focus-only ID可输出；无source binding
显式失败。字段从captured TransformedUIElement取得，geometry保留显式host callback，
secure字段不输出value。此为本项目transport适配，未声称原厂也导出相同Node schema。

实际revision fixture：主树隐藏祖先、可见深层secure child及独立focus-only节点，
render/root分配ID后投影。验证ID0映射深层child而非隐藏祖先、focus-only控件可达、
无虚构parent、secure value省略、frame callback次数与输出、每个ID回查一致。Swift
构建、自检、静态审计及diff检查通过，日志/tmp/cua-selection-observation-projection-*。
投影尚未接入Target.observe；生产输入失效校验仍用旧collect，不能直接切换一处
observe而不同时迁移validation。真实应用点击/目标仍未完成，本轮无用户应用输入。

## 2026-11-08：生产collect切换新提取器；首次现场验收未通过

Target新增selectionTree，collect默认改为实际Application.focusedUIElementContext→
extractSystemSelection→selectionObservedNodes，保留previous revision作diff，成功后
保存新selection owner。observe、输入validateSnapshot和截图前后校验都调用同一
collect，避免只改observe而校验仍按旧AX遍历/1-based ID运行。旧3000/80/5秒遍历
被替换为已恢复的原生捕获边界。transport投影补selectedRange callback，沿用现有
selectionStart/selectionLength字段，不重新实现range解码。诊断记录明确是adapter
logger/warnings，尚未声称原版日志文案全量还原。

Swift构建41.86秒、provider自检、静态审计及diff检查通过，日志
/tmp/cua-target-selection-collection-*。随后实际运行owned App完整验收，首个观察/
截图请求15秒超时，passed=[]，非跳过；helper被客户端退役，测试owned进程已清理。
证据/tmp/cua-target-selection-live-evidence.json及-test.log。不能据构建/selftest宣称
生产切换成功。两项权限只读确认均true；独立CuaFixture --desktop-session-check
确认screenLocked=true、frontmostIsLoginWindow=true。锁屏是现场输入/截图验收阻碍，
但尚无阶段计时证据把这次timeout唯一归因于锁屏。

补充只读实机路径：新构建--app-observation-check com.apple.finder成功返回roles/
counts、无遍历warning（/tmp/cua-target-selection-desktop-check.json），不读取/输出
用户文本或截图，不证明owned App与真实点击。新默认已接入但应用点击仍未验收，
后续需阶段诊断及解锁桌面后的owned验收。完整目标未完成。

## 2026-11-08：本地观察阶段日志定位到bind初始化停滞

新增NativeObservationDiagnostic同步/异步阶段计时（分别命名避免Swift异步上下文的
重载选择歧义），沿用CUA_NATIVE_INPUT_LOG本地0600日志。记录阶段、started/completed/
failed、PID、耗时与错误码，不记录AX文本、图片、参数/异常正文。接入bind窗口观察/
AX启用、focused-context、extract-selection、project-observation、observe/screenshot/
revalidate。NativeHelper原来固定子进程env丢弃日志路径，现只额外透传绝对诊断路径，
仍不继承模型token或任意环境；19项客户端测试和native TS typecheck通过。

Swift最终构建、provider自检、静态审计、diff检查通过，日志/tmp/cua-observation-phase-*。
两次独立owned复测均超时且passed=[]，owned/helper进程按测试finally清理。第一轮仅
观察阶段埋点无日志，说明不能继续将该超时称为observe/截图阶段失败。补bind埋点后
/tmp/cua-owned-bind-phases.jsonl只有bind-window-observation started，无completed，
也未进入bind-accessibility。这将本次停滞范围缩小到prepareWindowObservation，早于
新collect，否定把该次超时直接归因于新树提取。仍需细分windows.initialize与AX通知
observer构造/注册；没有证据直接断言是main.sync死锁（RunLoopTask.start不等待线程
配置）。桌面仍锁屏；尚无实际截图或输入完成，应用点击未验收。

## 2026-11-08：初始窗口遍历停滞实机定位；锁屏快速失败修复

细分bind owner日志：ordering owner约0.26ms完成，停在bind-initial-windows。
针对本次测试子树中确认为owned的helper采样1秒（/tmp/cua-bind-owner-helper.sample.txt），
main thread主要在registerAppControllerInitialWindows children callback及UIElement缓存/
AX读取，未到AXNotificationObserver，不支持此前可能的通知main.sync死锁猜测。
owned测试15秒后失败且finally清理，采样未触碰vendor二进制或其他进程。

独立只读System AX probe绕开项目decoder，针对自己启动的fixture：77个唯一元素、
1次重复、1个self child，roles仅application/menu族，无正常窗口角色。该探测证实
当前锁屏桌面提供异常循环AX图，但未证明所有超时只有这个根因。重新静态查看原
初始化06cc34..06d274仍是队列children展开，没有据此擅自改原算法为visited去重。

新增requireUnlockedNativeDesktop，CGSession明确locked时在bind初始化、Target.validate
和WindowServer截图枚举前返回SCREEN_LOCKED；未知状态不当作locked。Sky投影沿已有
原生client/server错误契约-10020，TS错误类型补齐。构建、自检、固定版本审计、diff
检查通过；19项客户端测试及TS typecheck通过。复测owned验收从15秒无响应变为约154ms
明确SCREEN_LOCKED，passed=[]，测试仍失败而非伪造通过，日志/tmp/cua-locked-fast-failure-*。
本次修复锁屏失败边界，未证明解锁后的树采集/真实点击。完整目标仍未完成。

## 2026-11-08：锁屏错误wire/client投影验证及输入剩余边界

扩展独立SkyRPCFailureTests，验证SCREEN_LOCKED→-10020→NativeIPCClientError.screenLocked，
且消息逐字保留；原有AX错误码及其他host错误分类检查同时执行。
node --import tsx --test reconstruction/native-sky-error-projection.test.ts通过，
diff检查通过，日志/tmp/cua-screen-locked-wire-tests.log。此用例编译/运行本项目
Swift单元程序，不连接用户应用，不运行vendor原生程序。

复核生产Mouse：collect已接新selection，但索引点击仍从Node AX引用新建UIElement，
不是直接使用RefetchableUIElement；activationWindow/simulate/clickablePoint还限定
UIElement类型，原protocol wrapper完整委托仍需还原。不能只把类型改成any protocol
就声称具有原版刷新语义，也不能将复制cache视为全部Transformed状态保留。下一步
应按原版wrapper协议/初始化关系继续接入。桌面锁屏下真实点击仍未验收，目标未完成。

## 2026-11-08：RefetchableUIElement 协议委托边界固定审计

静态读取 pinned Mach-O 的 0x10147a080 witness table，新增自动校验13槽位、
subrole/isInsideWebView/actions/actionDescriptions 到 UIElementProtocol 默认实现的
直接分支、perform(action:) 默认实现调用、通用 AX hash 调用，以及成功写入后
refetch(true,true) 的实参和调用。原 raw-AX 初始化 witness 终止于 fatal trap，
不能自行给 wrapper 发明 tree owner，也不能把所有属性都直接转发给 transformed
对象：两者均不符合原版协议委托。perform 的 witness 本身不追加刷新。

python3 scripts/audit-native-mouse-dispatch.py 通过，输出本地
/tmp/cua-refetch-witness-audit.json；git diff --check 通过。未执行原厂二进制，
未发送用户应用输入。本轮固定了后续实现必须遵循的委托证据，没有改生产点击，
仍需解决同步协议 setter 与当前 MainActor 原生提取绑定，再接实际元素刷新。

## 2026-11-08：同步刷新提取与生产 enablement owner 分离

RefetchTreeNativeExtraction 现有 MainActor 入口保留，转调新增显式 enable 回调的同步
入口；实际上下文读取、完整树提取、成功发布仍走相同实现。只有生产共享 tracker
绑定需要 actor，提取算法本身无需因此同步切换队列。未使用 main.sync、
assumeIsolated 或自行创建 tracker；也未改变原树引用/字段来携带额外 resolver。
这使后续协议 setter 集成能明确处理 owner/线程边界，但还没有默认 wrapper setter
或生产点击闭环。Swift build、provider-click-self-test 与 diff 检查通过，本地日志
/tmp/cua-refetch-enable-binding-{build,self-test}.log。没有发送真实输入。

## 2026-11-08：应用 enablement 显式 tracker 入口

ApplicationUIElement 增加与底层 UIElement 相同的同步 enablement 组合入口，显式接收
长生命周期 tracker 与诊断回调；原 MainActor 便利方法仍绑定同一个生产 singleton，
转调此入口。AX 引用与 cache 的转换只有一处，未新增全局锁、每次新建 tracker 或
跨队列同步调用。这样上一轮同步原生提取入口的 enable 回调可接真实操作而不必复制
包装逻辑；生产 wrapper 默认 setter 仍未接入。

非 actor 的 runAXEnablementApplicationGuardChecks 新增具体 ApplicationUIElement
入口检查：虚构不存在 PID 时返回 nil，不能触发获取/释放、初始化或错误回调；未向
真实应用写入属性。Swift build、provider-click-self-test 与 diff 检查通过，日志
/tmp/cua-explicit-enablement-owner-{build,self-test}.log。此项不证明真实点击。

## 2026-11-08：原生 refetchTree 默认提取入口

新增 MainActor refetchTree() 默认入口，复用完整原生提取/成功发布与生产 enablement
owner。新增 NativeSelectionExtractionDiagnostics 本地 host 诊断适配，不输出焦点元素、
样式正文或 selection；字符串不是原版日志逐字还原。首次构建发现 attribute error
报告原来是 UIElement 的成员而非全局函数，已改为独立类型级错误报告，再构建通过。

现有 native binding 检查增加无参入口失败路径：虚构应用无窗口时抛出原上下文错误，
不替换 selection revision/applicationWindow。Swift build、provider-click-self-test、
diff 检查通过；日志/tmp/cua-default-native-refetch-{build,self-test}.log。默认树提取
已具备入口，wrapper 协议 setter/生产索引点击仍需接入，未发送真实应用输入。

## 2026-11-08：默认原生元素恢复入口与单次发布

新增 extractRefetchSelection 纯提取组合，保留上下文先读、前版本后读的原顺序；
refetchTree(readContext:extract:) 在原 publication 边界调用它。原生具体提取改为
extractNativeSelection，默认/显式报告的 refetchTree 负责发布。这样 recovery 提供
extractSelection 时无需嵌套调用会发布的 refetchTree，避免重复存储 selection。

新增 MainActor 默认 ID/element refetchElementIfNeeded 与 wrapper.refetchIfNeeded
入口，接已有 monitor 检查、动态类型重建、属性匹配、完整提取与唯一候选恢复。
未改变 wrapper 存储、未创建额外 tracker、未跨线程同步。协议 setter 与生产 Mouse
仍未切换，不能称完整协议 conformance 已还原。

检查新增：纯提取成功返回 replacement 但不发布；默认 ID 42 错误优先于 monitor；
默认元素和 wrapper 缺 monitor 时抛原错误，保留 owner/revision/element。Swift build、
provider-click-self-test 与 diff 检查通过，日志
/tmp/cua-native-element-recovery-{build,self-test}.log。未发送真实应用输入。

## 2026-11-08：clipping 属性读取支持协议元素

生产 Mouse 的几何链仍限定普通 UIElement。先将不依赖具体类型的 AXFrame 与
clippingParent 两组读取方法移至 UIElementProtocol，保留 AXFrame-only、cached/
uncached、严格解码及事务初始化原逻辑；不把 wrapper 转成普通 UIElement，不复制
cache。hasScrollAction/完整 clipping walk 仍限定普通元素，未冒称几何链全部迁移。

通过 any UIElementProtocol 具体非 UIElement probe 检查 cached/uncached 两模式下
已知不支持 frame/parent 时返回 nil，不能触发 AX 读取或新元素构造。Swift build、
provider-click-self-test、diff 检查通过，日志/tmp/cua-protocol-clipping-*。
未发送真实输入；生产 Mouse 与默认 wrapper 协议 setter 仍需继续接入。

## 2026-11-08：协议裁剪遍历与动作读取

actions(in:reportError:) 读取组合移至 UIElementProtocol，实际 performAction 的具体
环境回调暂保留 UIElement。hasScrollAction 与 provider/system-environment 两条
clippingFrame 遍历现可接受协议对象；遍历根使用 existential，parent 按原逻辑构造
普通 UIElement，根的具体 cache/属性不被抹成新普通元素。原边界/深度行为未变。

非 UIElement 的 protocol probe 验证 scroll action 重复项只读一次，并走原 Set
交集判断；两种 clipping 遍历、cached/uncached 模式均在已知不支持 frame 时停止，
禁止额外 provider 读取。Swift build、provider-click-self-test 与 diff 检查通过，
日志/tmp/cua-protocol-clipping-walk-*。clickablePoint、web hit-test、focus preparation
仍有限定具体类型的后续连接；生产 Mouse 未切换、真实点击未验收。

## 2026-11-08：默认取点与 Web 命中支持协议元素

将 injectable clickablePoint composition、provider chessPreferredPoint、默认不滚动
clickablePoint、webClickHitsTarget 移至 UIElementProtocol。Web 命中遍历使用 existential
根/父元素，继续通过 provider AX equality 比较；不将目标转成新 UIElement。
默认取点仍显式 scrollToVisible=false，无 frame 时抛 elementHasNoFrame。

首次自检在原有 nestedPoint 断言失败：默认入口改调 system/environment composition
会在 clippingParent 使用 systemElement 初始化，从而丢失 mock/provider 的父窗口
属性。已恢复默认 provider 路径的父初始化，直接复用原 uiElementClickablePoint
控制流及 provider clippingFrame，未修改既有断言迎合回归。再次构建、自检通过。
新非 UIElement existential probe 确认默认取点缺 frame 时传播原错误。diff检查通过，
日志/tmp/cua-protocol-default-point-*。这些不证明生产 Mouse 或真实应用点击完成；
焦点准备、默认协议 setter、生产元素绑定仍待接入。

## 2026-11-08：焦点准备接受协议目标

将 supportedSelectionAttributes/isSelectable/clickingMayCauseSelection 组合移至
UIElementProtocol，保留原协议算法的缓存属性顺序、300层 parent lookahead 与菜单
排除。根使用 existential；事务式 parentValue 读取也移至协议，仍返回原普通父元素，
systemParentChain 的具体序列接口保持原状。首次构建暴露 parentValue 仍限定具体
类型，已一并解除该限制后重建。

应用 prepareSyntheticClickFocus/prepareAccessibilityClickFocus 现接受协议目标，
仍使用原焦点状态机与 callback 顺序。新增非 UIElement probe 的选择能力探测，
以及协议 app+目标的无 enforcer 路径：仅执行一次对应 active probe，不发送事件。
Swift build、provider-click-self-test、diff 检查通过，日志/tmp/cua-protocol-focus-*。
尚未完成 RefetchableUIElement 默认 setter/协议 conformance 和生产 Mouse 切换，
不把这些无输入检查称作实际应用点击修复。

## 2026-11-08：RefetchableUIElement 协议 conformance 与默认 setter

wrapper 现 conform UIElementProtocol，static role 为可变 optional；AX/cache 委托与
owner initializer 保持，raw-AX initializer 按原 witness fatalError("Unimplemented")。
其他属性、perform/action dispatcher、AX identity/hash 使用既有协议默认实现，未发明
对象身份或把所有 transformed 字段直接转发。setter 先底层写入、成功后默认
refetch(true,true)，错误传播、无 rollback。

线程桥接明确为本 helper 的 host adapter（不是原版算法还原）：生产请求由 MainActor
串行处理，协议 setter 同步，写入前检查主线程，不符合则 INVALID_STATE；随后
MainActor.assumeIsolated 验证已有执行上下文。没有 main.sync、自动切队列或新建
tracker。外部任意线程调用不在这个 adapter 的契约内，后续独立 host 需显式适配。

MainActor 组合检查通过协议 existential 调用默认 setter：成功写一次后缺 monitor
错误传播；底层写拒绝优先传播，不开始刷新。另验证 id/相同 AX 的 equality/hash、
static role 初值。Swift build、provider-click-self-test、diff 检查通过，日志
/tmp/cua-refetch-protocol-*。未操作用户应用；生产 Mouse 仍待切换默认树元素绑定，
不能把 wrapper conformance 当作真实点击成功。

## 2026-11-08：生产 AX action 绑定可刷新 selection

Target.action 在原 snapshot/ID 校验后使用 selectionTree.refetchElementIfNeeded(id,
validateElement:true)，不再从 transport Node 的 AX 引用创建普通 UIElement。
press、setValue、secondary focus/advertised action 使用 wrapper 协议；selectText
仍为已有 raw-AX transport 操作，但引用取自已恢复的元素。defer 前移到 recovery
之前：恢复可能发布新树，恢复或后续动作失败均清除旧 transport snapshot。

生产 Mouse 仍受合成目标 resolver 的 UIElement 泛型限制，本轮未用 cache 复制或
raw-AX 重建假装完成迁移。Swift build、provider-click-self-test 与 diff检查通过，
日志/tmp/cua-action-refetch-binding-*；这些是组合/编译证据，不是实际 action 成功。
只读桌面复核仍 screenLocked=true、frontmostIsLoginWindow=true，未尝试绕过锁屏或
发送用户应用输入。默认 wrapper 已有测试，完整生产 UI action 尚待解锁验收。

## 2026-11-08：生产 Mouse 索引点击保留可刷新元素

合成目标解析 Element 改为 any UIElementProtocol；out-of-process target/window 与
ProcessType containingElement 增加协议路径，保留原 PID/父遍历/WindowServer 选择。
Mouse 的 activationWindow、simulate 及目标结构接受协议对象。索引入口按 selectionTree
ID 取得 RefetchableUIElement，恢复失败清空旧 snapshot；不再从 Node AX 引用创建
普通 UIElement。已有动作、Web 命中、焦点准备、可选 cursor 与合成事件顺序保留。

新增受控 provider 路由：输入 RefetchableUIElement，返回 target.element 与原 wrapper
引用完全相同，保留 MenuUIElement window 类型、PID7/window42。该测试未派发事件，
既有 provider click 全套也通过。Swift build、provider-click-self-test、diff 检查通过，
日志/tmp/cua-protocol-mouse-target-*。生产 action 与 Mouse 的元素绑定已接通；整体
snapshot 严格校验/collect owner 生命周期、真实 UI 输入和模型整链仍需继续复核。
不把编译与受控路由通过等同于用户应用点击成功。

## 2026-11-08：输入/截图复核不再隐式发布新 owner

复核发现 validateSnapshot 每次 collect 都创建并发布新 selectionTree，而 Mouse 已
解析的 wrapper 仍持有旧 owner；即使随后 whole-snapshot 比较失败，也已经隐式替换
当前 selection。此为本 transport adapter 的生命周期问题，不是已证明的用户点击
原始根因。

collect 增加 publishSelection（默认 true），输入前校验和截图后复核显式 false。
因此普通 observe 继续发布观察；校验仍执行完整新采集/投影/对比，却不替换已发布
owner。恢复流程需要时通过原 refetchTree publication 更新 wrapper 所属树。没有
删去快照/坐标校验，也没有擅自把所有观察都合并为同一 owner。

Swift build、provider-click-self-test、diff 检查通过；调用点复核确认两处 revalidate
为 false，observe 保持默认。日志/tmp/cua-readonly-revalidation-*。provider自检不
覆盖真实 collect 的系统回调，尚缺解锁后完整生命周期验收，不能声称实机修复完成。

## 2026-11-08：默认 setter 线程拒绝边界运行验证

核查错误链：原生 recovery enum 目前经私有兼容 stdio 返回 NATIVE_ERROR（保留 case
文本），Sky socket 的未知原生错误按已有 generic server contract 投影；没有依据
便未发明原厂专用数字错误码。发现新 host setter 的 INVALID_STATE 尚缺 TS 类型，
补入 native-macos ErrorCode；未改变 socket 既有 generic host mapping。

默认 setter 线程契约新增真实 detached task 检查：明确不在主线程调用协议 setter，
得到 INVALID_STATE，writer 计数仍为先前1次，证明拒绝发生在底层写入之前。主 actor
成功写入/刷新错误的原检查仍通过。Swift build、provider-click-self-test、native TS
noEmit、diff检查通过，日志/tmp/cua-refetch-thread-contract-*。这些只验证 host 调用
边界，不能推断 UI 输入成功或原厂有同样的线程拒绝错误。完整目标未完成。

## 2026-11-08：显式滚动取点与 positionElement 的协议接入

scrollToVisible、scrollFrameToVisible、pollScrollCenterVisible 及显式可滚动取点现可
接受协议根元素；scroll operation 保留根的协议 setter/perform witness，普通父元素
仍按原 parent API 构造。scrollContentFrame 将初始 children 读取与后续去重遍历分开，
使根不必与 child 同型；只有后代参与 Hashable 去重，遍历顺序/嵌套容器停止规则不变。
Target.positionElement 两个入口现接受协议对象，仍按 axTree 的实际 windowID定位。

新增非 UIElement probe 验证空 content frame 为 CGRect.null，以及显式 scroll=false/
true 缺 frame 时均抛原 geometry error；没有发送动作或轮事件。既有滚动组合/光标
定位检查继续通过。Swift build、provider-click-self-test、diff 检查通过，日志
/tmp/cua-protocol-scroll-position-*。这仅恢复协议组合；独立 scrollInput 的 page-distance
策略、Mouse 对 positionElement/可见光标的生产调用仍需源码追踪，不冒称已对齐。

## 2026-11-08：prepareToInteract 定位前缀与滚动后重取

静态读取原 prepareToInteract0x100072e44..0x1000735b8（本地反汇编
/tmp/cua-prepare-interact-body.asm）。确认0x72f7c 首次按 ID refetch(validate=true)，
准备既有/新建 focus enforcer 后，positionElement flag 为 true 才 tail-call0x735b8；
其 didScroll 保存到c3，0x733378 判断为 true 才在0x733388 对原 ID 再次 refetch(true)。
定位不滚动时保留首次 wrapper，不能无条件重建或一直使用滚动前元素。

新增 prepareInteractionElement 前缀组合，故意未冒称包括后续 actualPID/focus 检查。
四种 flag/didScroll 组合验证resolve/enforcer/position/可选再次resolve的顺序与返回；
position抛错直接传播，不重取。静态审计新增两lookup调用、true实参、position tail
branch和didScroll条件分支 pins。Swift build、provider-click-self-test、静态审计、
diff检查通过，日志/tmp/cua-prepare-interaction-prefix-*。未接生产定位/未发真实输入；
下一步需查0x733430 actualPID及0x733458 helper后再组合完整 prepareToInteract。

## 2026-11-08：prepareToInteract 尾部实际进程检查

静态追踪0x733430 actualPID →0x733458 helper0x86fc4。该 helper 并非激活/焦点
操作：NSRunningApplication(pid) →bundleIdentifier →systemSecurityBundleIdentifiers
成员检查，命中则抛原 controller error，缺 app/bundle 返回。静态数组0x101558c70
三项与现有 NativeForbiddenTargets.systemAuthentication 一致；并非整个 forbidden list。
未绕过系统认证限制，也不向安全应用发送输入。

新增 prepareInteraction 完整顺序组合（前缀后对最终元素 validateProcess），与懒惰
进程分类 helper validateInteractionProcess。检查滚动重取后验证最新元素、验证拒绝
传播，缺 app/bundle 不读 security list，以及三项均进入拒绝回调。尚未猜测/恢复原
controller error 的数值投影或将此组合接生产；拒绝回调由具体 host 提供。

Swift build、provider-click-self-test、静态调用/数组审计与 diff 检查通过，日志
/tmp/cua-prepare-interaction-process-*。新反汇编仅静态读取，无 vendor 执行或用户
应用输入。下一步可绑定真实 actualPID/应用分类，并核对外层调用 timing/position参数。

## 2026-11-08：具体 Target.prepareToInteract 绑定

新增 Target.prepareToInteract 返回原形态(tree, protocol element)：取当前 selectionTree，
按ID恢复/验证→lazy activateFocusEnforcer→按调用者 flag/timing/animation 定位→滚动
后重取→最新元素 actualPID→实际进程 bundle 的系统认证分类检查。定位复用已还原
positionElement/真实 owner.windowID；不自行猜测当前 click timing 或 cursor feature值。
缺selection先抛本host STALE_OBSERVATION；系统认证拒绝暂用本host PERMISSION_DENIED，
未声称与vendor controller error numeric投影相同。

新增具体入口缺selection检查：在任何 feature callback、focus enforcer/cursor 创建
之前失败，未派发事件。既有泛型顺序/重取/进程分类检查继续通过。Swift build、provider
自检、diff检查通过，日志/tmp/cua-native-prepare-interaction-*。该真实组件绑定已可用，
但生产Mouse仍待核对外层调用的position/timing/animate配置后接入，未宣称可见光标完成。

## 2026-11-08：原版外层操作的 prepareToInteract 参数核对

静态扫描找到五个直接 tail-call0x72e44，并对四个有明确操作名的调用者反汇编：
- click(elementID)0x75070：timing=closeEnough(tag0)，position=true，animate 来自调用者。
- performSecondaryAction0x770ac：timing=finished(tag1)，position=true，animate=true。
- setValue0x78fe8：timing=closeEnough，position=true，animate=true。
- selectText0x7c4e8：timing=nil(tag2)，position=false，animate=true（定位被跳过）。

这否定了给所有 indexed 操作使用同一定位/光标策略的做法，也说明 selectText 不应
为了显示光标自动滚动。可选 timing 解释结合已还原 enum field order closeEnough/
finished 及既有 Optional case路径；未将 bool推断成 timing。

静态审计新增这些实参原始指令、四个tail分支及click animate传递 load，运行通过，
日志/tmp/cua-interaction-caller-configuration-audit.json；反汇编
/tmp/cua-prepare-interaction-callers.asm。只读源码证据，不执行vendor。生产尚未接定位：
cursor feature gate 的本host绑定仍需明确，不能直接硬编码厂商远程flag的结果。

## 2026-11-08：光标 feature 元数据与正常覆盖解析

继续静态读取 FeatureFlag.computerUseCursor addressor0xfbd254，实际静态对象
0x10150be80：key=feature/computerUseCursor，description=Enable the virtual cursor
in Computer Use.，default byte+0x20=true。isEnabled0xfbbfe0→0xfbf9e8 包含测试
override/cache分支与正常store读Any再cast Bool分支；缺值/非Bool保留default。
此前笼统称“远程flag”没有依据，本次证据纠正：正常读取并不必然依赖远程服务。

SlimCore 新增部分 FeatureFlag storage/正常解析与 computerUseCursor registry entry；
明确尚未恢复原版全局测试override/cache owner及完整flag列表。NativeCursorFeatureGate
为自有helper绑定UserDefaults.standard，不跨域读取/修改ChatGPT偏好。隔离随机suite
测试缺值true、Bool false/true、字符串false保留defaulttrue，结束清除suite。

Swift build、provider自检、静态对象/默认byte审计、diff检查通过，日志
/tmp/cua-cursor-feature-default-*。这使生产caller可以绑定已知默认与本地覆盖；尚未
将定位接Mouse，也未证明真实窗口/帧交付或可见光标。目标未完成。

## 2026-11-08：生产 Mouse 接入定位/光标准备

索引点击现调用真实 Target.prepareToInteract(closeEnough, position=true)，animateCursor
从私有host参数读取、未提供时本host默认true；feature 使用已审计默认true的本进程
UserDefaults覆盖。恢复后传入协议item进入既有点击状态机，可选 virtualCursor 此时可由
定位阶段创建并移到 selection.windowID。实际鼠标/AX派发没有被光标动画替代。

host适配新增 didPositionScroll 元数据回调：自身滚动成功并完成原版按ID重取/进程校验
后，从preparedTree刷新本次输入nodes基线并清空旧capturedWindow。仍检查当前owner
未被其他操作替换，后续 fresh snapshot 校验保留；整个indexed分支任何退出均清除旧
输入snapshot。定位前后检查deadline/cancellation。定位新增metadata-only诊断阶段
position-element，沿用本地CUA_NATIVE_INPUT_LOG，不记录AX内容/图片。

Swift build、provider-click-self-test、diff检查通过，日志
/tmp/cua-production-position-click-*。只读桌面仍锁屏/loginwindow，未派发真实输入。
当前实机动画帧交付/定位等待是否正常、滚动后baseline的系统行为、应用实际点击均
仍待解锁验收；setValue/secondary等操作的各自prepare参数尚未接入。不能声称用户
可见光标已验证或整体目标完成。

## 2026-11-08：setValue/secondary/selectText 生产准备接入

Target.action 改为 async，私有stdio handle与SkyAppState两调用者均await。setValue
调用 prepareToInteract(closeEnough,true,true)，secondary 调用(finished,true,true)，
selectText 调用(nil,false,true)，来自已审计原callers。私有compat press保持原AX动作
路径，未将其冒充原版完整click。必需字符串在可能滚动前校验；准备后核查原snapshot/
owner仍一致，并检查取消/期限；任何退出由既有defer退役snapshot。

没有为这些操作伪造额外snapshot观察；最终setValue/secondary仍经wrapper协议，
selectText继续旧raw AX text-selection adapter（具体内容算法还未全量对齐）。光标
feature使用本进程store绑定。无法由本轮编译推断系统scrollbar写入/帧交付成功。

Swift build、provider-click-self-test、diff检查通过；当前Swift helper的还原/安装包
Sky客户端握手/清单和协议约束3测试通过、0跳过，日志
/tmp/cua-production-position-actions-{build,self-test,ipc-test}.log。IPC用例不点击应用。
真实桌面任务仍待解锁验收，完整目标未完成。

## 2026-11-08：移动等待边界复核及验收文档纠偏

复核现有 owner.move/moveWindowAndWaitForInteraction：等待 interaction/completion
共享一次性 resume 状态，运动完成的弱owner检查顺序与既有静态恢复一致。当前这些
已检查函数没有本地超时/取消resume；不能仅因怀疑挂起就擅自加定时“完成”或自动
重试输入。生产caller已有取消/期限前后检查，但不能把它说成能中断任意动画await。
真实帧交付仍须解锁验收；若挂起应结合position-element started/completed日志定位。
本轮没有声称已排除完整原厂运行时的其他取消机制。

CURRENT-ACCEPTANCE 顶部重写为当前真实接线状态，去除内部提取/wrapper/Mouse/
光标创建“尚未接入”的过期描述，同时明确这些仍非实机成功。disableDiff条目改为
“内部revision/diff已部分还原，公共选项尚未贯通”，避免把已做算法描述成全部未做。
保留scrollInput、text-selection、完整FeatureFlag owner/registry等缺口。文档diff
检查通过，无新生产输入、无修改动画取消语义。后续应处理公共选项接线与实机证据。

## 2026-11-08：disableDiff 贯通到捕获 revision

静态完整查看 updateSkyshot：disable输入保存5e9，0x6fd48 BIC(controllerFlag,disable)
传入capture配置；0x70a34重新读原controllerFlag并存入新refetchable owner。一次禁用
不能永久关闭后续恢复diff。新增7条原指令pins，审计通过。

SkyIPC校验后传布尔值到SkyAppState.get，再到observeWithScreenshot→observe→collect；
捕获提取isAXTreeDiffingEnabled=!disableDiff，已有revision builder在false时走root。
发布owner的全局能力仍true；readonly revalidation使用正常capture，不重写owner。
默认省略false保留。尚未恢复原版LLM/event-stream增量描述与预算回退；当前公开text
依旧完整observation adapter，不用字符串差分伪造原版效果。

Swift build、provider-click-self-test、静态审计、3项真实helper协议测试（0跳过）和
diff检查通过，日志/tmp/cua-disable-diff-wiring-*。既有内部revision四组合检查覆盖
root/appending分支；协议检查含非Bool拒绝。缺少真实UI disableDiff往返及原版输出
验收，不把接线视为完整选项行为完成。同步两份验收文档的历史矛盾提示。

## 2026-11-08：SystemSelection.llmDescription 焦点前缀

静态读取0x238b88：先读窗口title/appName并在nil时Unknown；焦点部分先尝试完整树
focusedElement的selectedText0x238d6c，非nil（包括空字符串）直接选中文本分支，不读
focusRenderTree。仅nil时对可选focusRenderTree渲染lines，indent为tab、options来自调用者。
此后还有mode/feature/baseline/差分预算与最终拼接，尚未恢复，不把前缀当完整描述。

新增 SelectionDescriptionFocus 懒惰前缀组合及SystemSelection binding；selectedText
具体getter尚缺，要求显式readSelectedText，未用AXValue冒充。覆盖空/非空选中文本
不读focus lines，以及nil/空/多行focus顺序。新增selectedText/lines调用及tab常量
pins。Swift build、provider自检、静态审计和diff检查通过，日志
/tmp/cua-selection-description-focus-*；公开observationText未替换，目标仍未完成。

## 2026-11-08：UIElementProtocol.selectedText getter

静态读0x78e7f0..0x78e994，纠正先前“范围/marker回退待查”的泛称：getter先value<String>
AXSelectedText(ignoringTypeMismatch=false)，非空才返回；否则selectedTextMarkerRange，
再parameterizedValue<String>(AXStringForTextMarkerRange)，try?错误吞为nil，空字符串也
归nil。没有CFRange/AXValue切片fallback。参数化generic入口0x7aecec先编码参数、取
axElement，再调用AX parameterizedValue，没有另加supported preflight。

新增UIElementSelectedText helper及协议默认属性，复用已有字符串缓存/范围decode/
动态参数编码/provider参数化读取与严格String decode。descriptionFocus增加默认
binding，保留显式reader用于受控检查。覆盖非空/空白/Unicode优先且不读marker，
nil/空的marker回退、marker缺失、空/非空结果、抛错吞nil；另用协议真实cached getter
和不存在PID检查空/非空缓存行为，无系统读取。新增4条call及strict-bool pins。

最终Swift build、provider-click-self-test、静态审计、diff检查通过，日志
/tmp/cua-selected-text-getter-*。未替换公开完整观察文本；最终description模式/差分预算
和实机选中文本仍未验收，目标保持未完成。

## 2026-11-08：LLMDescriptionMode 类型与差分基线

原nominal0x1012c17ec/fields0x10131a9ec为两case：difference、fullTree；首case的
symbolic type ref0x101293502指向DifferenceBaseline0x1012c1808，tuple label为from。
其parent是SystemSelection，fields0x10131aa14依次initial、previous。因此原形态
为difference(from: DifferenceBaseline)，不是三个plain case。新增固定字段与类型
引用审计，运行通过。

恢复两个嵌套enum与revision.descriptionDifferenceBaseline。根据0x238f44..fbc：
fullTree不用baseline；diff需previousRevision；previous用直接上版，initial沿上版
previous引用回溯首版，不比较lineage字符串。检查root/append四组合，另外构造三代
revision确认initial与previous得到不同对象。完整differenceLines/预算/最终拼接仍待
还原；公开observationText未替换。

最终Swift build、provider-click-self-test、静态审计、diff检查通过，日志
/tmp/cua-description-baseline-*。没有真实应用输入或整体差分输出验收。

## 2026-11-08：differenceLines 前置 renderTreeSnapshot

differenceLines0x629630先对baseline/current分别renderTreeSnapshot，任一抛错即nil；
不能直接把现有raw render差分buffer当完整differenceLines。继续静态读取snapshot
wrapper0x654804与constructor0x641478..0x64191c，确认使用swift-collections Deque
按广度优先展开，父索引是输出数组index，任一render.elementID缺失抛空struct error，
未见重复ID拒绝。revision把lineageID作为subjectID。

新增UIElementRenderTreeSnapshot(subjectID,isFocus,renders)与Render(id,text,detailText,
parentIndex)、空UIElementRenderTreeSnapshotError；字段均经descriptor复核。snapshot
constructor实际复用已有Deque第三方包，保留空detail字符串、重复ID和原排序；
renderTreeSnapshot wrapper接当前revision。Codable/renderTree反向构建未冒称还原。

受控检查两root/多层树的BFS顺序与父index、空树/subject、重复ID、空detail和深层
缺ID抛错。Swift build、provider-click-self-test、元数据/Deque调用静态审计、diff检查
通过，日志/tmp/cua-render-snapshot-*。尚未形成完整differenceLines/预算与公开文本，
无真实应用输入，目标仍未完成。

## 2026-11-08：snapshot.renderTree 反向构建

静态读入口0x63cc64→helper0x645930..d48：按renders顺序新建Int render，id与
non-nil elementID均为snapshot.id，文本/detail照搬，sourcePath初始化nil；先把node
加入flat数组，再按parentIndex直接访问父节点children追加。nil parent计数为roots。
尾部dropLast(total-rootCount)提取最初rootCount个节点，而非filter(nil parent)；这
依赖构造器BFS输出。保留原Array越界语义，未按ID去重/归一化坏snapshot。

新增renderTree方法，受控多root/多层snapshot往返一致，重复ID创建独立节点，空树/
focus/detail/sourcePath检查通过；额外非BFS输入检查保留原前缀假设而非擅自修正。
新增tail-call与root-slice helper调用pins。Swift build、provider自检、静态审计和
 diff检查通过，日志/tmp/cua-snapshot-render-tree-*。仍未替代differenceLines正文/
预算和公开LLM文本，无真实用户应用输入，目标未完成。

## 2026-11-08：differenceLines snapshot/rebuild 前置组合

恢复prefix顺序：baseline.renderTreeSnapshot→baseline snapshot.renderTree→current.
renderTreeSnapshot→current snapshot.renderTree。任一snapshot抛错返回nil，不返回[]，
也不继续后续阶段；不额外比较subject/lineage字符串。新增generic preparation与
revision.differenceLineTrees具体组合，仍明确不是完整differenceLines实现。

检查成功及baseline/current两处失败的准确调用顺序，验证失败后不继续rebuild；
内部root/appending四组合使用实际revision snapshot/rebuild，比对父/当前root编号。
新增两处rebuild静态call pins。Swift build、provider-click-self-test、静态审计和
 diff检查通过，日志/tmp/cua-difference-line-tree-preparation-*。下一步继续实际差分
遍历/预算规则，公开完整observationText未替换，无用户应用输入，目标未完成。

## 2026-11-08：删除编号区间摘要

完整differenceLines正文0x629968..62b8dc已取静态反汇编，预算/遍历仍需逐段恢复。
其中0x62b70c调用helper0x62cac8已读完整：输入Array<Int>经0x636c24构造Set<Int>
（绑定符号 _$sSh15minimumCapacityShyxGSi_tcfC 直接复核），再转数组排序，合并相邻
整数；单项输出整数，连续段ASCII连字符，段间逗号空格。外层非空才拼
Removed element IDs: 前缀；未用整棵树/文本字符数去猜预算。

新增removedElementIDRanges/removedElementIDSummary，直接复用Swift Set与sort。
检查空、单项、乱序重复、连续/离散、负数以及Int边界；Int.max仅在末段，不引入
额外迭代溢出规避或错误吞掉逻辑。新增Set import、调用与字面量pins。Swift build、
provider-click-self-test、静态审计、diff检查通过，日志/tmp/cua-removed-id-summary-*。
此为摘要格式子步骤，不是完整differenceLines/删除预算实现；公开输出未替换，
无用户应用输入，目标未完成。

## 2026-11-08：差分 fullTreeLineCount 计数来源

继续跟踪budget：0x629a20将计数置0，逐render pop后0x629a54/58加1；0x62a0a0/a4
把总数装入后续剩余预算槽。它不是text字节数、换行字符数或预设常量。后续会减去
已消费的遍历量，并有difference/removedElementSummary不同回调；这些拒绝分支尚未
全量组合，未据此猜一个百分比/固定阈值。

新增differenceFullTreeLineCount，复用Deque计render节点。受控多层树5节点、空树、
空文本/内嵌换行及重复节点引用（按遍历entry分别计数）通过；没有引入visited去重。
新增计数初始化/加一/预算种子原始指令pins。Swift build、provider自检、静态审计及
 diff检查通过，日志/tmp/cua-difference-full-tree-count-*。完整差分预算与公开输出
仍未完成，无用户应用输入，目标保持未完成。

## 2026-11-08 — differenceLines budget traversal seed

Restored `DifferenceBudgetTraversal.swift` from the hash-pinned native helper
0x10062b8dc. Change tag order is none/insert/update/remove, matching the existing
field descriptor. None produces an empty Deque and zero initial cost; update
produces an empty Deque and cost one. Insert/remove enqueue their cursor's render
with zero initial cost, except option bits 2/3 suppress that subtree and charge
one directly. This enqueues the root, not just children. The normal path calls
0x100636088 with the cursor's first stored render pointer. The ordinary return
at 0x10062bb98 is zero; the suppressed/update return at 0x10062bc14 is one.

Added controlled checks over all four changes and all combinations of subtree
suppression, checking queue reference identity and initial cost. Swift build,
provider-click-self-test, hash-pinned static audit and git diff --check passed.
Build log: /tmp/cua-difference-budget-seed-build.log. No application input sent.

This is only the traversal seed. Queue consumption, exceeded-budget callbacks,
removal-summary accounting and final description publication remain incomplete;
this helper is not yet wired into a finished differenceLines implementation.
It does not repair or validate real application clicking or visible cursor frames.

## 2026-11-08 — difference budget prefix consumption

Continued from the traversal seed using the native differenceLines body:
0x10062a380 compares initial cost with remaining budget; 0x10062a448..470
removes the last Deque element using head + count - 1 (not popFirst), children
are appended in stored order, 0x10062a40c increments once per node, and
0x10062a420 stops at equality. Restored this as countDifferenceBudgetPrefix,
retaining pending work and initial charge instead of returning an invented
boolean success. This distinction matters: exactly exhausting an empty queue
is not the same as reaching the budget with unvisited nodes. Later native
code additionally handles removal IDs and callbacks; that is still pending.

Controlled checks cover zero/exact/under/over budget, a branching tree whose
last child has a descendant, retained queue order and precharged input. They
would distinguish FIFO from the observed LIFO traversal. Swift build passed
(31.98s; /tmp/cua-budget-prefix-build.log), provider-click-self-test passed,
static pinned instruction audit passed and git diff --check passed. No real
application input or model request was issued. Full differenceLines/public
text integration and real application click acceptance remain incomplete.

## 2026-11-08 — difference budget decision and callback

Added Change.consumeDifferenceBudget, composing the recovered seed and bounded
traversal. Native 0x10062a358 bypasses all budget work when ignore is true.
0x10062a7ec..7f8 rejects only nonempty pending work with count equal to remaining,
not an invented >= test. The callback at 0x10062b7b4..7c0 sends the original
full-tree count with case tag 0 (.difference), then the caller returns nil.
A rejection leaves remaining unchanged. Otherwise the native second traversal
0x10062a7fc..abfc drains/counts remaining nodes without another budget test
(increment at 0x10062abcc), then 0x10062ac04 debits count. Preserved that second
phase explicitly. Negative remaining values are not clamped.

Checks distinguish exact-fit from unvisited work at equality, validate callback
payload and single invocation, precharged zero-budget update and ignored budget
without debit/callback. Latest build passed in 15.58s, provider checks passed,
static audit passed and diff whitespace check passed. Logs remain local at
/tmp/cua-budget-consumption-build.log and /tmp/cua-budget-consumption-audit.json.
No real input was dispatched. Removal summary callback, finished differenceLines
formatting and public observation integration still remain; these controlled
checks do not establish native app clicking or visible cursor success.

## 2026-11-08 — removal summary budget boundary

Resolved the previously unknown w26 at 0x10062ad2c: it is the accumulated
summarized-removal flag. Initialized false at0x10062a088, preserved via
x24 at0x10062a144, set true for Change.remove tag3 at0x10062a274,
then carried back after ordinary changes via stack+0x10 and0x10062ac9c.
The final check at0x10062ad18..ad50 requires summary option enabled,
that flag true, and remaining < 1. It invokes removedElementSummary with
original full-tree count. This check does not inspect ignoreDifferenceLineBudget
and does not debit budget. Restored as checkRemovalSummaryBudget without
inventing an extra ignore bypass or using the number of removed IDs as cost.

Controlled checks exhaust all option/flag combinations and remaining -1/0/1/2,
including exact callback case/payload. Build passed (30.86s), provider checks
passed, static instruction audit passed, git diff --check passed. Logs local:
/tmp/cua-removal-summary-budget-build.log and audit.json with same prefix.
Removal classification/summary formatting still need full differenceLines
composition; this helper is not a claim that production diff text is complete.
Real application input, visible cursor and model-driven app acceptance remain
unverified. No real UI input was issued in this turn.

## 2026-11-08 — composed difference classification and budgeting

Added prepareDifferenceLineChanges composing the previously restored budget
helpers in input Sequence order, without eagerly materializing the iterator.
Native0x10062a194 gates summary classification; tag3 removals are diverted,
append to the removal buffer and bypass ordinary per-change budget handling
(0x10062a270..27c). Other changes consume budget and append in order. The final
summary budget check runs after iteration. A failed ordinary/summary check
returns nil, preserving the distinction from successful empty changes.

Controlled mixed-change classification and final summary rejection checks passed,
as did ignore-budget/no-summary classification. Swift build, provider checks,
static pinned audit and git diff --check passed. Logs under
/tmp/cua-difference-classification-{build.log,audit.json}. This composes budget
preparation, not final line formatting; the new helper is not yet wired into
public observation text. Real application input/cursor validation remains open.

## 2026-11-08 — difference single-render line formatting

Inspected Change.lines0x10062c538..62cac8 and specialized render.line0x10062d190.
None emits an empty string array. Update selects the new cursor, reads path count
minus one and prepends '~' at0x10062c738 to the formatted render line. Suppressed
insertion/removal select new/old respectively and prepend '+'/'-' at0x10062c8fc
and0x10062c980. Markers have no extra space and precede indentation. Added shared
rootDifferenceLine for these single-render primitives; it does not implement or
pretend to replace the normal subtree-expansion paths.

Checks cover all change markers, none, nonzero path depth versus unrelated offset,
new versus old cursor, ID omission and present-empty detail spacing. Build,
provider checks, hash-pinned audit and whitespace check passed. Logs:
/tmp/cua-difference-root-line-{build.log,audit.json}. Full Change.lines subtree
traversal/map closures0x10062da28/0x100637020/0x100636ffc remain to inspect and
compose; public diff output is still incomplete. No real application input sent.

## 2026-11-08 — Change.lines subtree expansion

Restored Change.lines using DequeModule and shared single-render formatting.
Native0x10062da28 creates a local cursor with path[0]; map traversal0x10062d318
pops tail at0x10062d4c8..514, appends child cursors from0x10062f9c8 (forward
index enumeration) before emitting each mapped result. Thus siblings are emitted
in reverse stored order; this was preserved rather than normalized. Map helper
0x1006366a0 adds original cursor depth to local cursor depth. Actual closures
are0x100637020 ('+') and0x100636ffc ('-'); corrected prior note's incorrect
page-offset addresses, verified with disassembly of the actual trampolines.
None yields [], update emits only new root, suppression emits only root.

Added a branching inserted subtree check distinguishing sibling order and
relative versus absolute indentation, plus subtree-suppression output. Build,
provider checks, pinned audit and whitespace check passed. Logs remain local:
/tmp/cua-change-lines-build.log and /tmp/cua-change-lines-audit.json. The final
revision-level differenceLines/removal-summary composition and public observation
text still remain; no real application input or cursor acceptance was performed.

## 2026-11-08 — removed change element IDs

Restored removedElementIDs on Change from summary formatting path
0x10062b194..b644. It initializes a root cursor, pops the tail, appends
forward child cursors through0x10062f9c8 and collects nonnil element IDs.
The optional discriminant branch0x10062b3a8 preserves zero as a valid ID;
collection does not deduplicate (Set/sort occurs in removedElementIDRanges).
The summary traversal has no withoutRemovalSubtree option gate, unlike ordinary
Change.lines; descendants therefore remain part of the summary.

Branching-tree order, nonremoval empty result, duplicate/zero IDs and composition
with range formatting checks passed. Swift build, provider checks, static audit
and whitespace check passed. Logs local at /tmp/cua-removed-change-ids-build.log
and /tmp/cua-removed-change-ids-audit.json. Final revision-level composition,
public text integration and real application input acceptance remain open.

## 2026-11-08 — final line/summary formatting stage

Added formatPreparedDifferenceLines for already ordered ordinary changes and
summarized removals. Normal lines use tab indentation (0x10062b064..74).
The native final tail calls replacement helper0x100636c94 with range0..<0 at
0x10062b740..74c, inserting the one-line removed-ID summary at the beginning,
not appending it. Empty ID collections omit that summary. Checks cover mixed,
ordinary-only and summary-only outputs. Build, provider checks, static audit
and whitespace check passed. Logs local:/tmp/cua-format-difference-lines-*.

New integration finding:0x100629568 invokes an in-place sorting path via
0x10062fd28 before formatting. Its exact comparison remains under inspection;
therefore this new helper explicitly requires already ordered inputs and does
not guess an offset/path comparator or wire incomplete revision output into
production. Earlier budget-classification helpers describe iteration order,
not a claim that native final formatting retains that order unchanged.
Full revision-level integration, LLM description publication and real app input
validation are still unfinished. No UI input sent this turn.

## 2026-11-08 — native difference ordering key

Followed0x100629568 ->0x10062fd28 ->0x100631a5c sorting specialization.
0x100631e10..0x100632024 extracts new cursor for none/update/insert,
old cursor for remove, copies its IndexPath, and constructs a second Int rank:
none0 (0x100631f64), remove1 (0x100631ff8), insert2 (0x100631fd0),
update3 (0x100631fa8). Thus enum-tag ordering or offset-only sorting would
be wrong. Restored differenceOrderingKey; comparison direction, stable-tie
behavior and complete sorting integration remain under inspection. No guessed
comparator was introduced. Duplicate key construction is also present at
0x100632178..26c before compare call0x10114ef2c.

Rank/path checks, Swift build, provider checks, static audit and whitespace
check passed. Logs local:/tmp/cua-difference-order-key-{build.log,audit.json}.
Public diff output and real application operation validation remain incomplete.

## 2026-11-08 — ordered budgeted difference line composition

Resolved compare stub0x10114ef2c via imported slot0x101463678 to
Foundation.IndexPath.compare. Native insertion-sort specialization shifts a
candidate on orderedAscending(-1) at0x10063227c..280; equal paths compare
candidate rank < preceding rank at0x1006322fc..300. Equal rank does not shift.
Added precedesInDifference using Foundation's actual comparator and ascending
rank. Added renderBudgetedDifferenceLines composing sequence budgeting, standard
Swift stable sorting, Change.lines and prepended removal summary. Controlled
checks validate same-path rank ordering, strict equal-key behavior and a combined
summary/insert/update output. Build, provider checks, pinned import/instruction
audit and whitespace check passed. Logs:/tmp/cua-difference-ordered-lines-*.

This completes composition for a supplied Change sequence; the revision-level
snapshot/diff construction and LLM-description/public observation entry still
need integration/validation. It does not establish real application clicking,
visible cursor or model-driven operation success. No real UI input sent.

## 2026-11-08 — revision-level differenceLines entry

Added UIElementTreeRevision.differenceLines composing snapshot/rebuild,
UIElementRenderDifference<Int> iteration, current-tree node count, budget,
sorting and formatting. Native current rebuilt roots are x1->x23 at0x100629954,
stored stack+0x10 then used for full count; old roots stored at stack+0x0.
Both are converted to root cursors at0x100629fbc/fd4 before paired iteration.
The implementation recomputes ID-keyed differences from snapshots, rather than
reusing the appended revision's accessibility-identity changes. Snapshot failure
remains nil, successful unchanged output is []. Focus output remains separate.

Added unchanged revision integration checks across diff enabled/disabled and
previous revision present/absent. Build, provider checks, static audit and git
diff --check passed. Logs:/tmp/cua-revision-difference-lines-*.
This is the revision entry, not public LLM description integration. Changed-tree,
fallback and full description acceptance coverage must still be expanded;
current real application clicks/cursor remain unverified. No UI input sent.

## 2026-11-08 — changed revision integration checks

Expanded revision-level checks using actual root/appended revision constructors:
updated ID0 plus inserted ID1 returns ['~0 updated', '+1 added']; reducing the
next revision emits 'Removed element IDs: 1', including with ordinary removal
subtree suppression enabled. Temporarily removing the inserted render's element
ID makes snapshot construction fail and returns nil without a budget callback;
restored its ID before subsequent checks. These exercise snapshot/rebuild ->
ID-keyed iterator -> budget -> sorting -> text, beyond unchanged revisions.

Found the previously restored DepthFirstOrder already expresses the same
path/rank comparison independently audited in the sorting specialization. Updated
the new ordering-key/comparator helpers to delegate to that implementation rather
than maintaining duplicated rank switches/comparison code. Build, provider checks,
static audit and whitespace check passed. Logs:/tmp/cua-revision-difference-cases-*.
No real UI input/model requests sent. Public LLM-description integration and
native application click/cursor acceptance remain unfinished.

## 2026-11-08 — LLM description tree selection and fallback

Restored descriptionTreeLines on revisions with separate fullTree/difference
result cases. Native0x100238fe0 invokes differenceLines with selected previous or
initial baseline, caller's line options and removal-summary feature, while
ignoreDifferenceLineBudget is false (0x100238fd4). Missing previous revision or
nil difference output branches to full tree at0x1002391f8; rendering uses tab at
0x10023924c..26c. Empty successful difference takes a separate path at
0x10023902c and must not trigger full rendering. Preserved laziness using
selectionDescriptionTreeLines; summary enablement remains an explicit dependency,
not a guessed feature flag default.

Controlled empty-versus-nil lazy fallback and actual revision previous/no-previous
mode checks passed. Build, provider checks, static audit and whitespace check
passed; logs:/tmp/cua-description-tree-lines-*. Header/prose/selected-text/focus
composition, feature-owner binding and production public observation publication
remain to complete. No real application input was sent.

## 2026-11-08 — empty-difference presentation

Recovered empty successful diff branch beyond the earlier disassembly boundary:
0x100239420 references 'There has been no change in the accessibility tree for ',
appends the previously constructed Window: "title" string and '.' at0x100239458,
then calls the shared AccessibilityTreePresentation(body:focusedElement:selectedText:
selectedElements:) at0x10023949c. Added AccessibilityTreePresentation.unchanged,
reusing existing selection/focus precedence instead of discarding that context
when the render tree is unchanged. Tests check exact body/focused suffix and
selected-text precedence. Build, provider checks, static audit and whitespace
check passed; logs:/tmp/cua-unchanged-presentation-*.

Full nonempty-difference prose, feature-owner binding, application-specific suffix
and production publication remain to integrate. No real application input sent;
these text checks do not establish application click/cursor success.

## 2026-11-08 — nonempty difference presentation

Restored difference presentation prose from0x100239080..1f4: previous/initial
baseline introduction, Window: "title", removal-summary versus explicit-minus
legend, one newline and joined diff lines. Resolved imported0x10115060c to
Collection<String>.joined(separator:) and0x101150b58 to String(repeating:count:),
confirming one-newline separator construction rather than a guessed wrapper or
trailing newline. Reuse shared presentation for focused/selected content. Empty
lines delegate to separately recovered unchanged presentation.

Exact previous-diff body and empty initial-diff equivalence checks passed with
Swift build, provider checks, static audit and whitespace check. Logs local:
/tmp/cua-diff-presentation-*. Full feature-owner binding, SystemSelection assembly,
application-specific final suffix and production publication remain incomplete.
No real app input/model requests sent; click/cursor acceptance remains open.

## 2026-11-08 — focus-line presentation classification

Recovered the count-dependent focus assembly at0x100238e44..ec8. Exactly one
focus render line becomes focusedElement and clears selectedElements; zero
lines yields neither, and multiple lines become selectedElements with no single
focusedElement. Existing selectedText path already bypasses focus rendering.
Added SelectionDescriptionFocus.presentationContext to preserve this boundary.
Classification counts array entries, including an empty or multiline string;
it does not split embedded newlines or filter empty entries.

Expanded checks for nil/empty/single-empty/single-multiline/multiple focus lines
and selected text including present-empty. Build, provider checks, static audit
and whitespace check passed. Logs:/tmp/cua-focus-presentation-context-*.
Full SystemSelection description composition/feature binding/publication remain
pending. No real application input was dispatched.

## 2026-11-08 — common selection presentation composition

Added pure selectionDescriptionPresentation composing full-tree/difference
results with the recovered focus classification and existing presentation.
Optional metadata nil becomes Unknown; empty title/application strings remain
empty. Difference output uses its requested previous/initial baseline; fallback
full-tree output uses the full presentation constructor. The internal helper
rejects an inconsistent fullTree-mode/difference-result combination as a host
programming invariant, not a claimed original vendor error path.

Added full-tree nil-title/empty-app exact text check and empty-diff/selected-text
composition checks including present-empty text. Build, provider checks, static
audit and whitespace check passed. Logs:/tmp/cua-selection-description-presentation-*.
The pure stage does not read live AX, feature configuration or app-specific notes;
SystemSelection live binding and production observation publication remain open.
No UI inputs or model requests were sent.

## 2026-11-08 — ApplicationWindow appName binding

Inspected ApplicationWindow.appName0x10077f770..82c. Resolved selector slots
0x101542c18 to runningApplicationWithProcessIdentifier: and0x101542b28 to
localizedName. Native reads CG-window owner PID, resolves NSRunningApplication,
returns its nonnil localizedName, or falls back to cgWindow.ownerName. Empty
localizedName is retained. Restored the actual AppKit getter with an injected
localized-name reader for controlled checks; it does not use AX PID or an
invented bundle-name fallback.

PID selection, localized name, empty name and stored owner fallback checks passed;
Swift build, provider checks, static audit and whitespace check passed. Logs:
/tmp/cua-window-app-name-*. ApplicationWindow.title has additional AX/cache and
fallback logic beyond the CG title; that getter still needs full inspection
before live description metadata assembly. No UI input/model request sent.

## 2026-11-08 — ApplicationWindow title binding

Completed title getter inspection0x10077f830..fb98. CG name nonnil selects it
without reading AX, even if empty. CG nil uses cached AX title and swallows
conversion errors via the existing typed cache getter. A nonempty candidate
returns immediately; nil/empty reaches desktop specialization. isDesktopLevel
0x10025bcc4 compares level to CGWindowLevelForKey(18), not a guessed threshold.
For desktop-level windows, CG owner PID's NSRunningApplication.bundleIdentifier
must exactly equal com.apple.finder to replace the candidate with 'Desktop'.
Other windows preserve candidate nil versus empty. Restored live title getter
and pure dependency-injected selection helper.

Controlled checks cover lazy CG/AX paths, empty CG skipping AX, desktop Finder,
other app and nil/empty preservation. Build/provider/static audit/whitespace
checks passed. Logs:/tmp/cua-window-title-*. No real AX reads or user UI input
were required by these checks. Complete description binding/publication and
real application click/cursor validation remain unfinished.

## 2026-11-08 — SystemSelection presentation binding

Added SystemSelection.descriptionPresentation with live default metadata/selected
text readers. Reads title then appName, derives focus/selected context, selects
revision full/diff lines and composes the recovered presentation. Configuration
for summarized IDs and budget-event reporting remains explicit until native
feature/logging owner binding is restored. Reader seams allow controlled tests
without querying real app AX. A storage fixture verifies retained window identity,
metadata read ordering and assembled header. Build, provider checks, static audit
and whitespace check passed; logs:/tmp/cua-system-description-binding-*.

This is the complete presentation stage, not the final llmDescription string:
application-specific suffix, feature owner/budget logging and public observation
publication are still pending. The binding has not been real-UI validated and
no real application input/model request was sent in this turn.

## 2026-11-08 — application-specific final description note

Restored final string stage0x100239300..3b0 as selectionDescriptionText.
Only exact com.spotify.client bundle ID appends the original Spotify URL
presentation note. Missing/empty/differently cased/prefixed-other identifiers
leave text unchanged. The note follows the shared presentation (including its
selected-content context); it does not itself rewrite any URL or operate UI.
Controlled bundle-match/nonmatch and preserved-body checks passed, along with
Swift build, provider checks, static audit and whitespace check. Logs local:
/tmp/cua-description-app-note-*. Feature owner binding and SystemSelection final
string/publication are still to compose. No real app input was sent.

## 2026-11-08 — removed ID range feature flag

Resolved axTreeDiffingRemovedElementIDRanges addressor0x100fbd2cc to static
storage0x10150c060. Decoded key feature/axTreeDiffingRemovedElementIDRanges,
description 'Summarizes removed AX tree elements as consolidated ID ranges in
diff rendering.' and true default byte at0x10150c080. Added the actual metadata
to partial SlimCore.FeatureFlag registry and NativeDescriptionFeatureGate using
owned helper defaults, same explicit store boundary as cursor feature binding.
This does not implement the vendor global test override/cache owner.

Isolated UserDefaults suite checks cover absent/false/true/non-Bool values,
with fallback true for invalid type. Build, provider checks, pinned metadata
static audit and whitespace check passed. Logs:/tmp/cua-description-feature-*.
Final llmDescription binding and public publication remain pending. No app input.

## 2026-11-08 — SystemSelection final llmDescription entry

Added llmDescription composing live metadata, selected/focus context, revision
full/difference output, presentation and final application note. Feature timing
follows inspected source: fullTree bypasses the summary feature entirely;
difference reads it before baseline selection, then nonempty diff reads it again
for legend selection (0x100238ee8..f24 and0x100239064). Bundle identifier is read
from the window AX element only after presentation (0x100239300..314). Kept budget
event reporter explicit instead of inventing native analytics/logging behavior.
Controlled full-tree entry checks metadata order, final bundle lookup, no feature
read and exact equivalence with the presentation stage. Build/provider/static
and whitespace checks passed; logs:/tmp/cua-llm-description-*.

New entry is not yet the production SkyAppState observation text. Diff-entry
feature timing/changed output checks and publication protocol mapping still need
validation. Vendor global feature cache/test owner and native budget analytics
remain partial. No real UI input/model request sent; click/cursor unverified.

## 2026-11-08 — final diff-entry binding checks

Expanded llmDescription integration with real root/next/third revision objects
and an owned synthetic ApplicationWindow. Previous-diff mode with no previous
revision reads the summary feature once then renders a full tree; a nonempty
next revision reads twice and preserves the focused line; an unchanged third
revision reads once and emits only the unchanged body. The feature reader changes
false->true between calls, proving the legend uses the second read independently
of the first difference-generation read. Metadata precedes feature reads, final
bundle lookup is last. All external readers are controlled: no real AX lookup,
app input or model request is used.

Swift build/provider checks/static audit/whitespace check passed. Logs local:
/tmp/cua-llm-diff-binding-cases-*. Production SkyAppState output mapping and
real application click/cursor acceptance remain incomplete; these are description
integration checks only, not full end-to-end operation acceptance.

## 2026-11-08 — public SkyAppState description integration

Scanned pinned Mach-O direct BL references to llmDescription:0x100070ab8,
0x100071254,0x100174e5c,0x100233998. Inspected the two updateSkyshot continuation
callers: both use mode tag1(previous difference) and lineOptions0. Added pins.
Public SkyAppState.get now requests sourceDescription internally; Target.observe
renders its newly published selection via llmDescription with that mapping.
disableDiff still controls snapshot extraction, not an invented alternate mode.
Private compatibility observation retains its independently authored Node text.
Budget diagnostics record only case/count through own host logger, not vendor
analytics or selected/window content.

Build, provider checks, pinned audit, whitespace check and current helper protocol
checks passed (3 passed, 0 skipped; /tmp/cua-public-description-ipc.log). Latest
read-only session check still screenLocked=true/frontmostIsLoginWindow=true;
therefore the new public text plus screenshot path has not been real-UI accepted.
No application input/model request sent. Update CURRENT-ACCEPTANCE to distinguish
production wiring from controlled checks and still-missing real UI acceptance.

## 2026-11-08 — final description fallback acceptance cases

Added constructed revision integration for a one-node updated current tree plus
one summarized removal: ordinary update consumes the available count, summary
budget fails with removedElementSummary(fullTreeLineCount:1), and final
llmDescription returns complete current tree text. Only one feature read occurs;
no nonempty-diff legend is rendered after budget fallback. A separate current
snapshot missing an element ID falls back to full rendering without a budget
event; missing-ID node renders without an ID rather than producing empty diff.
The fixture restores the temporarily removed ID before subsequent checks.

Build/provider checks/static audit/whitespace check passed. Logs local:
/tmp/cua-description-fallback-*. These cover final description fallback and
metadata/text composition without real AX reads or input. Public screenshot/text
roundtrip, real application clicks and visible cursor remain unverified while
the desktop is locked. Overall source restoration remains incomplete.

## 2026-11-08 — description lineage reset/resume boundary

Reviewed Target.collect forwarding previous revision and extractor branch;
confirmed disabled diff starts a root, while later enabled capture appends to
that new root. Expanded controlled checks proving initial-baseline lookup after
resumption points to the replacement root rather than historical previous
lineage, and unchanged resumption yields a successful empty diff. Did not add a
guessed window-ID equality reset: original controller's window-switch ownership
still needs a separate source audit, not inference from extractor parameters.

Build/static audit/whitespace check passed. Provider self-test exited0 and passed,
but first run emitted an intermittent Objective-C weak-storage warning
(objc_storeWeak/objc_loadWeak mismatch). One immediate repeat passed without
warning; this is not a proven fix or root cause. Track native weak-owner lifetime
as a new diagnostic concern. Logs:/tmp/cua-description-lineage-reset-*.
No real app input sent. Public UI roundtrip/click/cursor acceptance remains open.

## 2026-11-08 — weak warning debugger investigation

Investigated only the owned cua-helper --provider-click-self-test executable,
not the vendor service. First LLDB objc_weak_error breakpoint resolved to a shared
ret implementation reported as _objc_warn_deprecated, and stopped during normal
Foundation initialization. That backtrace is not evidence of the observed weak
storage mismatch. Corrected the diagnostic by using a Python breakpoint callback
that requires a weak-related caller frame, excluding the shared top-level alias.
The owned test then completed with exit0 and passed, without reproducing the weak
warning. The subsequent 'thread backtrace all' command failed because the process
had already exited; LLDB command exit1 does not mean the owned test failed.

Local artifacts:/tmp/cua-owned-weak-debug.log,
/tmp/cua-owned-weak-filtered-debug.log and /tmp/cua_weak_diag.py. The filtered
run showed ordinary headless AppKit/main-bundle diagnostics but no weak mismatch.
No source lifetime fix is justified by this nonreproduction. Next investigations
must capture an actual weak mismatch stack or independently demonstrate a lifetime
fault; do not replace weak references with strong references speculatively.
Real application input/cursor acceptance remains open. No user UI input sent.

## 2026-11-08 — next fidelity gap: controller scroll coordinate path

Reviewed AppControllerWindowObservation/AX event dispatch and current input
retirement: invalidateInputState retires transport snapshots without clearing
selection revision. This is not itself proof of a cross-window defect; do not
add a speculative window-ID reset without source controller evidence.

Moved to the explicitly independent scrollInput page-distance policy. Located
native ComputerUseAppController.scroll(deltaX:Int,deltaY:Int) at0x100081a4c.
Its continuation0x100081a68 reads stored controller coordinate/scale/origin state,
scales then translates the stored point using actual CGAffineTransform APIs,
obtains orderedWindows at0x100081ba4 and resolves a MouseEventTarget using
ApplicationUIElement.target(forMouseEventAt:with:) at0x100081bd0. After process
validation helper0x1000877cc, it reloads both signed Int deltas from async slots
+0x1c8/+0x1d0 at0x100081bfc before entering the later dispatch stage. The existing
Scroll.swift instead computes viewport extent * pages and emits private-source
wheelCount2 chunks. These are different layers/algorithms; no claim of parity.

Next source work: trace the dispatch tail after0x100081c9c and map the stored
controller fields before implementing the replacement; do not infer delta axis
handling from the previously recovered one-wheel factory alone. Static vendor
inspection only, no vendor execution or real app input. Current public native
observation text is wired but real UI/cursor/click acceptance remains open.

## 2026-11-08 — controller scroll dispatch tail

Traced native tail:0x100081ca4 calls SynthesizedEvent.scroll with unchanged
signed deltaX/deltaY, resolved point and window metadata;0x100081d64 calls
SynthesizedEvent.send(to:delay:). Delay storage formed at0x100081d1c..34 is
0x2386f26fc10000 attoseconds with zero seconds/discriminant, i.e.10ms.
Restored dispatchControllerScroll as an injected construction/send composition,
retaining one event operation and order rather than the independent page chunks.
Targeting/process validation remain upstream and are not bypassed by this helper.

Rechecked existing SynthesizedEvent.scroll against0x100754a60: HID source,
pixel units, wheelCount1, wheel1=deltaY/wheel2=deltaX/wheel3=0. Dynamic window
field routing is still a documented gap; this turn does not change it or route
production scroll through an incomplete path. Controlled point/axis/PID/delay
and construction-before-send check passed. Build/provider/static/whitespace
checks passed; logs:/tmp/cua-controller-scroll-dispatch-*.
No event was actually posted. Full controller field mapping/send integration and
real scroll acceptance remain incomplete, as do real app click/cursor checks.

## 2026-11-08 — scroll window field51 recovered

Resolved the supposedly dynamic optional window field's initializer from native
scroll0x100754d18..20 to0x100731140. It stores raw CGEventField51 and present
optional tag0. Native scroll writes this field before91/92 at0x100754bb0..bc0.
Added field51 assignment to SynthesizedEvent.scroll before existing window/local
routing; corrected its stale 'unresolved dynamic field' comment. This recovers
one missing routing field without changing wheelCount1 or substituting the
independent production page-distance algorithm.

Added an actual allocated CGEvent field readback assertion for target window ID.
Swift build, native --self-test, pinned initializer audit and whitespace check
passed. --self-test constructs/reads events only, does not post them. Logs:
/tmp/cua-scroll-window-field-{build.log,audit.json}. Full controller delta send,
production scroll replacement and real window-target acceptance remain open;
field readback is not proof a live app accepts the wheel event.

## 2026-11-08 — SynthesizedEvent.send delay loop

Restored send(to:delay:) from0x1007537e8..0x100753af8. Existing
 dispatchNativeEvent refreshes timestamps immediately before postToPid; the loop
then optionally reads ContinuousClock.now, advances by delay and sleeps until
that deadline with nil tolerance, including after the final event. Nil delay
bypasses clock read/sleep. Imported stubs confirm ContinuousClock/Instant metadata,
Clock.continuous, Clock.now, Instant.advanced(by:) and Clock.sleep(until:tolerance:),
not wall-clock timing. No speculative pre-post cancellation check/retry is added.

Controlled two-event checks verify post->now->sleep order, final-event wait,
exact10ms deadline and nil-delay bypass. All posts/sleeps are injected; no OS
input or real delay is used. Build, provider checks, static audit and whitespace
check passed; logs:/tmp/cua-synthesized-send-*. Sleep-error/empty sequence coverage
and controller production binding still need completion. Real app acceptance open.

## 2026-11-08 — send empty/error/cancellation cases

Inspected native sleep continuation0x100753b1c..b9c: a sleep error branches
separately at0x100753b50 and forwards to error continuation0x100753df0;
normal completion resumes iteration through0x100753bb8. Added controlled send
checks for empty sequence (no post/clock/sleep), thrown wait error (first post
only, error preserved), and CancellationError on an explicitly present zero
delay (wait is still called and no second event posted). Nil and zero delay
therefore remain distinct; no retry or synthetic cleanup event is added.

Build/provider/static/whitespace checks passed. Logs local:
/tmp/cua-send-failure-cases-*. All event posting and waits injected; no actual
input or real sleep. Controller field mapping/production scroll integration and
real application scroll/click/cursor acceptance remain unfinished.

## 2026-11-08 — concrete scroll factory/send composition

Added concrete dispatchControllerScroll overload binding recovered
SynthesizedEvent.scroll to recovered send(to:delay:), preserving10ms per-event
delay and default fresh-timestamp posting. Posting/clock/wait injection remains
available for controlled checks. This overload does not perform target resolution
or process validation itself; these are upstream controller responsibilities.
It is not wired into the independent production page-distance adapter yet.

A controlled actual-CGEvent integration check verifies one scroll-wheel event,
negative-screen point, vertical signed delta, PID forwarding and one exact10ms
wait (including the last/only event). No event is posted and no real wait occurs.
Build/provider/static/whitespace checks passed. Logs local:
/tmp/cua-concrete-scroll-send-*. Remaining: controller state field mapping,
coordinate/target composition, public delta/page mapping and real scroll effect
acceptance; real application click/cursor checks also remain unfinished.

## 2026-11-08 — controller cursor coordinate fields and conversion

Resolved runtime field-offset symbols (their raw preinitialization values are
zero, not real field offsets):0x1015ca098 cursorPositionInScaledCoordinates,
0x1015ca088 scalingFactor,0x1015ca080 visibleRect. Thus the initial scroll target
point is stored integer cursor position scaled then translated by visibleRect
origin. Located the explicit CursorPosition.applying helper0x100082438..24dc,
which applies CGAffineTransform(scaleX:y:) then optional frame-origin translation.
Restored AppControllerCursorPosition value storage and conversion with actual
CoreGraphics transforms, without Y flip/clamp/frame standardization.

Checks cover negative coordinates, nil frame, fractional scale and negative-sized
frame to distinguish origin from minX/minY. Build/provider/static/whitespace
checks passed; logs:/tmp/cua-controller-position-*. Controller state capture,
complete target resolution/send binding and public scroll mapping remain pending.
No UI input/model request sent; real app acceptance remains unfinished.

## 2026-11-08 — scroll target/geometry preparation composition

Restored prepareControllerScrollTarget from0x100081a98..c78. Initial state reads
are cursorPosition, scalingFactor, visibleRect, followed by ordered windows,
target resolution and process validation. Native0x100081c00..08 rereads scale,
visible origin and integer cursor position after validation; event point is
recomputed instead of reusing target-selection point. The helper preserves that
boundary and source order with explicit dependencies. It does not implement or
bypass the native process validator itself.

Controlled check changes stored position between the two reads, verifies initial
target-resolution point versus final event point, retained target and complete
read/resolve/validate order. Build/provider/static/whitespace checks passed.
Logs:/tmp/cua-controller-scroll-target-*. Failure-path coverage, actual Target
state binding and public scroll mapping remain to complete. No app input sent.

## 2026-11-08 — scroll target failures and validator evidence

Added controlled preparation failures at orderedWindows, target resolve and
process validation. Each preserves the thrown error and stops before post-
validation geometry reads; later resolution/validation callbacks are not invoked
when an earlier stage fails. Empty ordered-window input reaches the resolver
unchanged, allowing its recovered fallback behavior rather than an invented
preflight rejection.

Inspected process validator0x1000877cc..7918: target PID -> runningApplication ->
bundleIdentifier -> BundleIdentifiers.systemSecurityBundleIdentifiers at
0x100087854, then rejection on membership. Missing app/bundle returns. This
matches the earlier recovered interaction-process validation structure, so the
same native validation policy can be reused when binding controller scroll;
no security-check bypass or alternative allowlist is added.

Build/provider/static/whitespace checks passed. Logs:/tmp/cua-scroll-target-failure-*.
No app input/model requests sent. Production binding/scroll mapping and real
application operation acceptance remain unfinished.

## 2026-11-08 — IPC pages-to-deltas helper

Confirmed restored TS client forwards at/direction/pages rather than converting
pages. Direct branch scan found native controller scroll callers0x100161190,
0x100161440,0x1001616f0, all invoking0x100165bcc first. That helper multiplies
pages*extent, FRINTA rounds ties away from zero, checked-converts to Int and maps
directions: up(0,+amount), down(0,-amount), left(-amount,0), right(+amount,0).
Direction tag mapping was independently checked against raw getter0x100082d2c.
Notably horizontal signs differ from the independent Scroll.swift adapter.
Restored AppControllerScrollDirection.deltas, leaving extent selection separate.

Controlled four-direction half-tie checks, sub-unit rounding-to-zero and signed
product check passed with build/provider/static/whitespace checks. Negative pages
are only a pure helper case; public protocol validation still rejects them.
Logs:/tmp/cua-scroll-page-deltas-*. Native callers have different extent paths
(one includes a100 floor); those must be fully mapped before production switch.
No app events posted; real scroll/click/cursor acceptance remains unfinished.

## 2026-11-08 — shared page extent arithmetic in all scroll branches

Read the remaining continuations 0x100161370 and 0x100161630 without executing
vendor code. Contrary to the earlier uncertainty, all three delta-conversion
branches apply the same floor: tags up/down select height, left/right width,
then ordered dimension<=100 selects100, otherwise dimension. Restored that
arithmetic in AppControllerScrollDirection.pageExtent(size:), with raw instruction
pins at 0x100161100, 0x1001613ac and 0x100161660. This does not establish where
each branch obtains its size; that provenance must still be traced before
replacing production scrollInput. No CGRect standardization or screen-size
substitution was added. Controlled tests cover both axes, negative/small/boundary
dimensions and NaN propagation (matching FCMP/FCSEL unordered behavior).

Swift build, provider composition checks, static pins and whitespace check passed.
Logs: /tmp/cua-scroll-page-extent-build.log and /tmp/cua-scroll-page-extent-audit.json.
No real app input or model request. Latest read-only desktop check remains locked;
real click/cursor/scroll acceptance and full source reconstruction remain incomplete.

## 2026-11-08 — element scroll page-size provenance

Static continuation0x100161200 calls UIElementProtocol.frame at161240, tests
optional tag at161244..248, then chooses present frame.size or lazily reads
controller.visibleRect.size. Stored width/height at frame708/710 feed both
1613f0 and1616a4 delta conversions; the split is clickablePoint absence/presence,
not a different page-size policy. The first conversion continuation1610bc
reads controller.visibleRect directly. Request-level target branch origins still
need tracing; this evidence does not alone prove public target dispatch parity.

Restored elementScrollPageSize with controlled nil/zero/negative-frame cases and
lazy read-order checks. Present empty/negative frames do not fall back; the
separate direction helper subsequently applies the100 floor. Static pins lock
optional branch/size transfer instructions. Also observed clickablePoint branch
converts screen point via (point-visibleRect.origin)/(scale>0 ? scale:1), checked
Int conversion, then awaits moveMouse timing tag1 before scroll. That conversion
and production element-target dispatch are not yet connected here.

Build/provider/static/whitespace checks passed; local logs /tmp/cua-scroll-element-size-*.
No real input or model requests. Overall goal and real native acceptance incomplete.

## 2026-11-08 — element scroll clickable-point coordinate conversion

Restored elementScrollCursorPosition from161470..16152c: scale>0 retains scale,
otherwise uses1 (including NaN); subtract visibleRect.origin then divide and
checked-convert each result to Int, truncating toward zero. Positive infinity
is not replaced by1. No CGRect standardization, minX/minY substitution or Y flip.
Controlled cases verify fractional negative truncation, negative-sized visible
rect preserving origin, zero/negative/NaN/negative-infinite scale fallback, and
positive-infinite scale. Nonfinite/out-of-range resulting coordinates retain
Swift Int conversion failure rather than inventing a recoverable native error.
Raw instructions for scale selection, subtraction/division and FCVTZS are pinned.

Build/provider/static/whitespace checks passed. Local logs:
/tmp/cua-scroll-cursor-conversion-*. No real events/model requests. The existing
production Scroll.swift still uses independent viewport ancestry/chunking policy;
this helper is not represented as its replacement or an actual app click fix.
Next integration requires tracing public target dispatch and binding controller
state/target resolution, including awaited cursor movement and error propagation.

## 2026-11-08 — compose element scroll branch

Added performElementScroll composition for161200..1616f0: capture element/fallback
size first, await clickablePoint, if present read scale then visibleRect, convert
and await moveMouse with finished timing (native tag1 at161594), then convert
pages using the previously captured size and call controller scroll once.
Missing clickablePoint skips geometry/movement and still scrolls. Point lookup
or movement failure propagates and prevents scroll; no retry/fallback post.
Controlled callbacks verify both point cases, lookup/movement errors, exact read
order, retained300px page extent despite later900px visibleRect, scaled position
and an actual asynchronous yield before movement completion. No CGEvents posted.

Build/provider/static/whitespace checks passed; /tmp/cua-element-scroll-composition-*.
The routine is not yet bound to the public production Target. Prefix disassembly
in /tmp/cua-scroll-request-prefix.asm shows additional request-context/skyshot
work upstream; request target dispatch must be resolved before replacing the
independent scrollInput. Real click/cursor/scroll acceptance remains incomplete.

## 2026-11-08 — scroll upstream interaction preparation found

Disassembly160000..160640 identifies an important upstream dependency omitted
from the standalone element-scroll routine: at16054c..1605b4 the request awaits
ComputerUseAppController.prepareToInteract, with elementID x21, timing tag1,
positionElement=true and animateCursor=true (w2/w3/w4 all1 at160580..588).
The continuation is161194, which on success transitions into161200, where frame
and clickablePoint are read. Thus production must prepare/refetch/position the
element before capturing its page size, not simply call the composed scroll
routine on a raw observed AX element. Existing Target.prepareToInteract already
provides the restored preparation mechanism; binding must retain its returned
protocol element/tree and normal error propagation. Pins now enforce parameter
instructions and branch target. Static audit passed; /tmp/cua-scroll-preparation-audit.json.

The nearby prefix also dispatches click/setValue/selectText; those are not proof
of scroll's coordinate-target entry. Exact request branch decoding before16054c,
coordinate movement, request-context and optional return skyshot still need
mapping. No product dispatch switched and no model/app input sent this turn.
This narrows the next integration step; real native acceptance remains pending.

## 2026-11-08 — successful scroll optional capture tail

Static1616f4 checks the scroll error before continuation161754. Success tests
frame byte51==1: true initializes nil optional TreeCache and calls updateSkyshot
at1617f4 with disableAXDiffing=false and skipScreenshot=false; false sets byte1
at controller+0x20 and builds an absent capture. This flag is consistent with
returnSkyshot passed by nearby action callers, but its exact public request
origin and controller+0x20 field meaning must still be traced. Do not rename
that byte to a speculative dirty-state property or fabricate a capture-on-error.
Raw branch/arguments/field-write pins passed: /tmp/cua-scroll-return-audit.json.

Current public SkyIPCAppPerformActionRequest returns NSNull after perform; separate
AppGetSkyshotRequest performs observation. Therefore the native optional-capture
tail must not be exposed as a new public return shape without verifying the
original request decoder/client. Existing schema unchanged. Corrected outdated
SkyAppState header claiming native bodies and incremental description unavailable;
restoration is partial and current llmDescription integration is documented.
Whitespace check passed. No runtime input/model request; overall acceptance and
production scroll replacement remain incomplete.

## 2026-11-08 — coordinate scroll composition

Request branch15e650 tests target tag bit0; coordinate path15f360 checks/converts
the two request Doubles directly to Int (truncation, without origin/scale), then
awaits moveMouse timing1 at15f44c..478. Continuation161040 resumes into1610bc on
success, which reads current visibleRect.size and converts pages. Element path
from15e668/160524 goes through previously audited prepareToInteract before frame
reading. Restored performCoordinateScroll preserving move completion before
visibleRect read, rather than capturing stale geometry before an await.
Controlled movement success/failure tests verify truncation, unchanged supplied
coordinates despite nonzero visibleRect origin, current width-based delta and
no geometry read/scroll on movement failure. Injected Task.yield exercises await
ordering; no native input. Static conversion/continuation/timing pins added.

Build/provider/static/whitespace passed; /tmp/cua-coordinate-scroll-*.
Standalone coordinate/element branches now have composed ordering, but upstream
public dispatch and live controller-state binding remain pending. Current
production Scroll.swift remains independent. No actual app-operation acceptance
or overall completion is claimed.

## 2026-11-08 — controller scroll composition and state-binding boundary

Added performControllerScroll composing restored preparation with asynchronous
send, retaining the resolved destination across process validation and late
geometry rereads. Controlled composition changes cursor position during validation
and verifies the retained destination receives the new transformed point, original
deltas, and exactly one awaited send. Preparation failures retain the previously
covered stop-before-send behavior. Initial build found a test-local name collision
with an existing controllerPosition case; renamed only the new local variable.

Current Target owns virtualCursor, selectionTree, capturedWindow and window
observation but does not yet own the original controller visibleRect/scalingFactor/
integer cursor state. Capture.swift's pointPixelScale describes screenshot pixels;
it is not established as the original controller scalingFactor. Binding these
blindly would silently change coordinates. Next source step must recover the
controller's state updates/moveMouse ownership before switching production scroll.

Final build/provider/static/whitespace checks passed; logs:
/tmp/cua-controller-scroll-composition-*. No actual app event or model request.
Production binding and real app-operation/cursor acceptance remain unfinished.

## 2026-11-08 — controller move position write precedes target lookup

Read moveMouse entry7e430..7e66c. Optional coordinate array nil selects(0,0);
present arrays read first two Ints (count<2 traps; extra entries unused here).
At7e4c4 controller.cursorPositionInScaledCoordinates is written before scale,
visibleRect, orderedWindows and ApplicationUIElement.target resolution. A failed
resolution returns the error without rolling back position. Thus storing position
only after a successful visual move would not match the original controller.
Added prepareControllerMouseMove for the typed-position stage (array decoding is
not claimed restored), preserving that write/read/resolve order and using existing
original affine conversion. Controlled nil/nonzero coordinate cases force resolve
failure and verify retained written state, point and read order. Static pins lock
nil initialization, state write and window/target calls. The later7e790 motion
path still needs full binding; this helper is not wired as production moveMouse.

Build/provider/static/whitespace passed; /tmp/cua-controller-move-state-*.
No real app events/model requests. VisibleRect/scalingFactor update ownership and
actual application input/cursor acceptance remain unresolved; goal stays active.

## 2026-11-08 — move target validation and cursor-owner tail

Static7e790 continuation validates the resolved MouseEventTarget via877cc at
7e7d8 before reading the window's ID or creating a virtual cursor (7e8d4).
Failures branch directly to error return. After cursor creation,7e8fc rereads
controller integer cursor position, scale and visibleRect.origin and applies the
two affine transforms again; it does not reuse the initial target-lookup point.
At7eacc..ad0 cursor.targetWindowID is assigned a present UInt32, followed by weak
delegate load/callback and cursor appearance/motion continuation. This sequence
is consistent with inlined existing ComputerUseCursor.move ownership code; it
must not be replaced by a generic screenshot point or assumed OS mouse event.
No focus-enforcer call was identified in this audited prefix; later callbacks/
actual input remain to trace before any claim about complete movement behavior.

Added static pins for validator-before-error-branch, cursor creation, present
window ID write and controller-state reread. Audit passed; log:
/tmp/cua-controller-move-tail-audit.json, disassembly /tmp/cua-controller-move-tail.asm.
No production mutation or runtime input. Next move composition must validate first,
create owner, reread geometry, then reuse the recovered owner.move path, preserving
its asynchronous delegate/appearance behavior. Overall goal remains incomplete.

## 2026-11-08 — resolved controller move composition

Added performResolvedControllerMouseMove: validate resolved process, read window
ID, create cursor, then reread position/scale/visibleRect and await supplied owner
movement. Generic seams preserve native order without pretending actor hops or
owner appearance are replaced. Controlled cases verify denial and window-read
failure stop before cursor creation; success changes stored position during
creation and sees that new value, retains present window ID0 and awaits movement.
Build/provider/static/whitespace passed; /tmp/cua-controller-move-tail-build.log
and /tmp/cua-controller-move-tail-composition-audit.json. No real app input.

Scanned pinned executable ADRP/LDR references to controller geometry field-offset
symbols:23 references, saved /tmp/cua-controller-geometry-field-refs.txt. Candidate
update block71988/71b04/71b28 disassembled into
/tmp/cua-controller-geometry-update.asm for the next provenance step. This is a
source lead, not proof that screenshot pointPixelScale matches controller scale.
Production state binding, actual visible cursor/click/scroll and overall source
coverage remain incomplete.

## 2026-11-08 — controller scaled geometry arithmetic recovered

Static71950 stores visibleRect, computes CGRectGetWidth/Height*pixelScale, then
branches on two packed flag bytes. Low byte false returns pixel dimensions and
controller scale1/pixelScale. Resize true normally fits pixel dimensions; second
byte true with pixelScale>1 first divides dimensions by pixelScale. Fit has no
upscale, longest bound2048 followed by shortest bound768, preserving multiplication
order; controller factor is inverse fit divided by pixelScale in pixel mode,
or (inverse fit*pixelScale)/pixelScale in point mode. Nonpositive working dimensions
produce size1x1 and the corresponding unmodified inverse-scale branch. Raw ordered
comparisons retained rather than introducing isFinite filtering or min/max changes.

Added appControllerScaledGeometry pure arithmetic; flag names describe observed
branches, not yet proven public option names. Controlled four flag combinations
at400x200, pixelScale2 distinguish800x400 factor0.5 from400x200 factor1; large
4000x2000 point-mode yields1536x768 and inverse0.384. Complete native arithmetic
range digest pinned. Build/provider/static/whitespace passed; local logs
/tmp/cua-controller-scaled-geometry-*. No app events/model requests.

This establishes why screenshot pixel scale cannot simply become controller
scalingFactor. Caller flag provenance, capture resizing and actual state storage
integration still need tracing before production switch; real app acceptance and
full goal remain incomplete.

## 2026-11-08 — geometry flags are Statsig screenshot configuration

Found exactly two direct geometry-helper calls,6f604 and6f84c. Both use
CGWindow.scale (25b86c), previously copied window CGRect and packed config from
220914. That config reads Statsig.DynamicConfig via
getConfigWithExposureLoggingDisabled separately for each key; defaults:
should_use_legacy_screenshot_sizing=false,
should_normalize_screenshot_to_point_resolution=true,
should_use_jpeg=true, jpeg_compression_quality=0.8 (validated optional0<q<=1).
Packed low byte is legacy sizing, next byte normalization, third JPEG; there is
no inversion before71950. Therefore the fitting branch reconstructed last turn
is specifically LEGACY sizing, not a generic always-enabled resize policy.
Renamed pure-helper arguments to the original semantics; arithmetic unchanged.
Do not claim production always caps screenshots at2048/768: with static defaults,
legacy=false takes raw pixel dimensions and controller factor1/CGWindow.scale.
Live Statsig overrides were not queried or reimplemented. Statsig is an original
third-party dependency; no replacement remote-config service invented here.

Pinned config function and both scale/helper call blocks. Build/provider/static/
whitespace checks passed; /tmp/cua-geometry-option-provenance-*. No real app input.
Exact copied rect field/capture transform and controller production state binding
remain pending. Earlier generic resize wording is superseded by this provenance.

## 2026-11-08 — visibleRect input is selected CGWindow.bounds

Confirmed SystemSoftware.CGWindow.bounds getter25bca8 loads CGRect from value
 offsets8/24. The selected ApplicationWindow's cgWindow copy starts frame598;
geometry caller loads5a0/5a8/5b0/5b8, exactly that bounds. It is not ScreenCaptureKit
filter.contentRect. Copy helper86728 uses CGWindow metadata/value witness, giving
independent type confirmation. Both callers use CGWindow.scale afterward. Added
bounds getter and caller-load instruction pins; static audit/whitespace passed
(/tmp/cua-capture-rect-provenance-audit.json). No product action/build needed.

Earlier71950 restoration can therefore consume selected cgWindow.bounds and
CGWindow.scale once the original scale getter and capture-update eligibility are
mapped. Current Capture.swift stores originalFrame and contentRect separately;
using contentRect as controller.visibleRect would lose the verified provenance.
The preceding path also has StageManager offscreen handling and a skip/error
branch around geometry update; do not infer all observations publish geometry.
Production state binding and actual native input acceptance remain unfinished.

## 2026-11-08 — CGWindow screen selection and scale restored

CGWindow.scale25b86c calls NSScreen.bestScreen(bounds, preferred:nil), returns
backingScaleFactor (ObjC selector resolved), and uses2 only when screen is nil.
BestScreen260e0c first honors an intersecting preferred screen; otherwise eagerly
maps every NSScreen.frame intersection area and2617bc picks first maximum.
Equal/zero areas retain the first screen; no positive-overlap filter, nearest-
screen fallback or main-screen shortcut. Empty list is nil. Restored generic
bestWindowScreen and concrete main-actor nativeWindowScale. Tests cover largest
overlap, preferred small overlap, equal overlap, completely offscreen first-screen
choice, empty list and preference short-circuit without reading screen inventory.

Body digests pinned; scale/screens selectors independently resolved. Build/provider/
static/whitespace passed: /tmp/cua-window-screen-scale-*. Tests used controlled
rectangles; no actual app input. The concrete scale function is available but
not yet connected to production capture/controller state. Source uses NSScreen
frames directly here; no invented screen-coordinate flip added. Capture-update
eligibility/public wiring and real application operation acceptance remain pending.

## 2026-11-08 — capture geometry update eligibility confirmed

updateSkyshot entry6ef74 stores skipScreenshot(w3) at async frame5ea. Both callers
read that byte before geometry, and6f5a8/6f7f0 first reject a nonnil menu-bar-item
selection, then6f5ac/6f7f4 reject skipScreenshot=true. Config220914 is still queried
before these guards. Skip branches return local size.zero via6f624/6f86c, do not
call71950, and do not clear or rewrite prior controller visibleRect/scale/size.
Thus observation-only/skip-screenshot captures must preserve the previous geometry
state; invalidating transport input and resetting controller geometry are distinct.
Menu item presence was traced through the retained selection existential and
MenuBarItemUIElement metadata6f434. StageManager continuation uses identical gates.

Added static pins for request-flag storage, both guards and zero-size returns;
audit and whitespace checks passed (/tmp/cua-geometry-update-eligibility-audit.json).
No product action, model request or actual input. Production geometry lifecycle
must preserve these conditions when connected; full capture pipeline and real
application-operation acceptance remain incomplete. No build rerun for audit-only
changes (last current-source build/provider checks passed previous turn).

## 2026-11-08 — ordered geometry writeback composition

Added updateAppControllerGeometry matching71950's externally visible mutation
sequence: write visibleRect, calculate recovered geometry, write scalingFactor,
write scaledScreenSize, return same size. Storage callbacks expose the order
without guessing controller initialization or silently adding transport invalidation.
Controlled callbacks inspect intermediate states: rect exists before factor,
size is still untouched during factor write, final returned size matches stored
size. The skipScreenshot/menu-item eligibility remains upstream; this wrapper
must not be called on skipped captures (their old state remains intact).

Build/provider/static/whitespace checks passed; /tmp/cua-controller-geometry-write-*.
No app input/model requests. Actual Target storage/capture binding and real input
acceptance remain incomplete; this composition is not a production click fix.

## 2026-11-08 — controller geometry state defaults recovered

Initializer6c9cc..6ca10 loads imported CGRectNull (resolved import slot101464b98),
not CGRect.zero. scalingFactor initialized0, scaledScreenSize zero and integer
cursor position(0,0). Added AppControllerGeometryState with these recovered
defaults and update backed by ordered geometry writeback. Controlled initial/null
checks and update verify bounds/scale/size change without resetting cursor state.
No finite/default1 substitution added to uninitialized geometry. Native initializer
range and CGRectNull import pinned. Build/provider/static/whitespace passed:
/tmp/cua-controller-geometry-state-*. No real app events/model requests.

State is available for controller binding, not yet attached to Target. Capturing,
transport invalidation, move and scroll still need integration around the source
skip/update rules; actual app/cursor acceptance and broader reconstruction remain
unfinished. The local struct does not claim original controller-wide layout/ARC.

## 2026-11-08 — capture geometry state transition

AppControllerGeometryState.prepareCapture now composes the audited capture gate
with state update: read sizing config regardless of skip, reject menu-item or
skipScreenshot geometry work with local zero output, otherwise read bounds then
pixel scale and update rect/factor/size. Four controlled combinations start with
nondefault stored geometry/cursor, verify skipped states remain byte-semantically
unchanged in these fields, and distinguish local zero output from retained screen
size. Normal update uses800x400 factor0.5 without resetting cursor. Config is an
injected source, not a newly invented Statsig service or live account configuration.

Build/provider/static/whitespace passed; /tmp/cua-capture-geometry-state-*.
Read-only desktop check still screenLocked=true/frontmostIsLoginWindow=true.
No app events/model requests. Production Target capture and controller-state
integration, screenshot content pipeline and actual application input remain
incomplete; controlled state transitions are not real interaction acceptance.

## 2026-11-08 — geometry result forwarded into screenshot operation

At6fe40..6fe58 the same menu-item/skipScreenshot guards precede loading helper
output from frameb88/b90 into stack38. At6ffc4..cc those two words are copied
into capture closure context with present optional tag0. AsyncLet entry6ffe8 uses
function pointer10115e450 (relative target86cb0). That thunk reads size words and
tag then forwards them x2/x3/x4 to2353ec alongside SkyshotOperation. This confirms
computed size is an actual screenshot-operation input, not merely output metadata.
The distinct asyncLet started6ff70 and this capture operation6ffe8 must be traced
to their eventual await/error cleanup before replacing current serial observation.
Actual pixel rounding/render/capture backend still not established by these calls.

Pinned guards/optional copy/thunk; static/whitespace passed, local log
/tmp/cua-skyshot-size-forward-audit.json. No product mutation, build or app input.
Current Capture.swift independently configures contentRect*pointPixelScale and PNG;
no claim that restored sizing/config/controller state is integrated yet. Next
source lead:2353ec (capture entry) and async function descriptor10115e418.
Overall real UI acceptance and full reconstruction remain incomplete.

## 2026-11-08 — screenshot route reaches original SlimCore buffer API

Followed optional-size thunk86cb0 ->2353ec ->233c38, which wraps capture in
OSSignposter interval Capture Screenshot. Descriptor10116a8a8 resolves237d08;
that closure forwards size/tag to234e1c. Its continuation calls original
SlimCore.ScreenshotImplementation.captureScreenshotBuffer atfb381c, with app title
(nil replaced Unknown), delay:nil, optional imageSize forwarded unchanged,
includedWindowIDs and crop/opaque/shadow flags. Window list composition and
context field meanings need further audit before specifying all flag semantics.
After successful buffer capture,233fc0 uses writeScreenshotToFile with encoding
from operation state. Thus the source is not merely SCScreenshotManager plus PNG
encoding as in the current independent Capture.swift.

Added argument-forwarding/buffer-call pins; static and whitespace checks passed,
/tmp/cua-screenshot-buffer-route-audit.json. No vendor code executed, no actual
capture/input/model request. Next underlying implementation entry isfb381c; this
route evidence does not establish its private backend, image rounding or cleanup.
Production replacement and full native app acceptance remain unfinished.

## 2026-11-08 — buffer pixel-dimension conversion

Followed buffer public entryfb381c through async descriptor10122bbc8 tofb7d08.
That path has logging/delay and further capture preparation. Atfb895c it calls
helperfb7c00 on supplied dimensions. Restored screenshotPixelDimensions: finite,
positive width/height, ceil both, reject rounded values above2^63, then checked
Int conversion. Exactly2^63 passes the native initial comparison but traps at
Int conversion; retained that source edge, not labeled recoverable nil. Controlled
cases cover subpixel ceil, fractional height, zero/negative/NaN/infinity and huge
finite rejection in either axis;9000 is allowed by this helper. No original8192,
32M-pixel or5MiB budget found in this helper; existing independent Capture.swift
budgets are a separate host behavior, not removed by this partial restoration.
Full helper body digest pinned. No production capture switch or real app input.

Final build/provider/static/whitespace checks passed; /tmp/cua-screenshot-pixel-dimensions-*.
Initial build rejected an integer literal through CGFloat's Int initializer;
corrected it to the exactly representable floating2^63 literal, arithmetic unchanged.
Next crop helperfb25bc disassembled /tmp/cua-screenshot-window-crop.asm; backend
capture/render and real application interaction acceptance remain incomplete.

## 2026-11-08 — accelerated screenshot backend identified

Read crop helperfb25bc through its actual capture tailfb27f8: requests
WindowServerCaptureOptions.ignoreGlobalClipShape, obtains WindowServerSPI.mainConnectionID,
then calls captureWindowImagesInRect(windowIDs, options, rect, connection) at26cf58.
Nil or empty image array returns nil; nonempty takes first image, not all-images
composition. Parentfb8920 invokes this helper with its selected rect/window list.
This is evidence of an accelerated WindowServer path, not proof that every source
capture uses it; the parent has alternate capture/size paths still under audit.
No equivalent WindowServer capture implementation found in current native sources.
Next source targets26cf58/26be2c/26bb1c must be read for real SPI symbol/signature/
error semantics rather than substituting SCScreenshotManager by assumption.

Pinned capture-tail block; static/whitespace passed, log
/tmp/cua-window-capture-backend-audit.json. No vendor code executed or app input.
Product backend unchanged, production screenshot/move/scroll binding and actual
application-operation acceptance remain unfinished.

## 2026-11-08 — WindowServer capture binding request recovered

26cf58 returns nil for missing lazy capture binding or empty window IDs; count
must fit signed31bits (otherwise trap), and forwards connection, contiguous UInt32
IDs, count, options and CGRect to the resolved function. Result is retained then
conditionally bridged to [CGImage], returning nil if conversion fails. There is
no automatic ScreenCaptureKit fallback inside this wrapper. ignoreGlobalClipShape
getter26be38 is0x800. Main connection wrapper already exists in current source.

26c7a4 loader uses a separate salted single-symbol request initialized26db24,
not one of primary functions[0..12]. Extended existing static extractor to recover
its image/symbol UInt64 arrays and salt into WindowServerSPISymbolRequest and
native-windowserver-symbol-evidence.json. No decoded symbol name is yet claimed:
next verify26da14 single-symbol lookup against existing SoftLink batch mechanism
before binding the native function. Wrapper/initializer/option getter bodies pinned.
Static/whitespace checks passed (/tmp/cua-windowserver-capture-symbol-audit.json).
No SPI called, no vendor code executed, no app input; concrete capture wrapper and
production backend integration remain unfinished.

## 2026-11-08 — WindowServer capture wrapper implemented

Confirmed single lookup26da14 explicitly constructs one symbol-request array and
calls SoftLink.lookUpBatchSymbolPointers248374. Reused existing restored SoftLink
rather than introducing dlsym-only lookup. Added separately lazy optional capture
binding and WindowServerCaptureOptions.ignoreGlobalClipShape0x800. Wrapper forwards
optional connection, contiguous UInt32 IDs (duplicates/order retained), checked
Int32 count, options and CGRect, then conditionally bridges autoreleased CFArray
to [CGImage]. Missing binding/empty IDs return nil; nil versus empty result stays
distinct. No automatic fallback added. C signature inferred from original ABI;
compilation does not prove live SPI ABI/ownership correctness, still requires
owned-window acceptance before production use.

Controlled injected capture checks cover nil binding, empty IDs without call,
argument values/order/count and nil/empty outputs. They do not initialize the
actual capture binding or invoke WindowServer. MainConnection existing binding
unchanged. Original single-symbol helper body digest pinned.

Build/provider/static/whitespace passed; /tmp/cua-windowserver-capture-wrapper-*.
No live capture/input/model request. Accelerated-path composition, alternate
screenshot backend, production state integration and actual app acceptance remain
incomplete; overall goal stays active.

## 2026-11-08 — accelerated capture composition

Added captureAcceleratedWindowScreenshot forfb27f8..fb28a4, composing existing
mainConnectionID and recovered captureWindowImagesInRect with ignoreGlobalClipShape.
Nil/empty image array returns nil; nonempty returns only first image. Concrete
CGImage overload binds actual wrappers but is not yet used by production Capture.
Injected cases verify connection-before-capture, exact rectangle/options/IDs and
nil/empty/single/multiple result behavior. The test does not invoke actual SPI or
assume window rect selection is restored. Original surrounding signpost/metrics
remain outside this capture-stage composition; alternate capture fallback and
parent orchestration still pending.

Build/provider/static/whitespace passed; /tmp/cua-accelerated-window-capture-*.
No real screenshot/input/model requests. Actual SPI binding/ABI/owned-window
capture acceptance, production integration and full app operation remain incomplete.

## 2026-11-08 — actual CFArray image bridge checks (corrected)

Extracted production windowCaptureImages matching native26cfdc. Initial test
incorrectly assumed Swift's conditional CFArray->[CGImage] bridge rejects NSString
entries; it failed at11737. The implementation was already the native cast, so
no new type-ID filter was inserted. Swift accepts the non-image CF objects under
this typed cast. Updated checks inspect CFTypeID without invoking image methods
on those objects. Empty and image identity/lifetime cases also remain covered.
Earlier message claiming all checks passed was sent prematurely; corrected in
chat immediately. Initial pass paragraph is superseded by this failure evidence.
Final verification is recorded below after observing actual process results.

Final current build succeeded (32.74s), provider-click-self-test actually observed
exit0/pass after correcting CGImage.typeID API spelling in the test. Static audit
and whitespace checks passed. Logs:/tmp/cua-window-capture-bridge-*. Controlled
nonimage CFTypeID acceptance, valid images, retained duplicated references and
empty array all passed. No real SPI or screen capture performed. Real return
ownership/ABI, production backend integration and actual app input still pending.

## 2026-11-08 — ScreenCaptureKit configuration branch recovered

Resolved ObjC class/selector references in the nonaccelerated buffer path:
SCStreamConfiguration init, ignoreShadowsSingleWindow=!includeWindowShadow,
ignoreShadowsDisplay=true, showsCursor=false, shouldBeOpaque=argument, then validated
width/height and optional sourceRect. Restored screenshotStreamConfiguration using
the actual framework type; controlled four shadow/opacity combinations verify
stored dimensions/rect and flags. SourceRect nil leaves framework default untouched.
Setter blocks pinned. Build/provider/static/whitespace actually observed passing;
/tmp/cua-screenshot-stream-configuration-*. No capture/input/model requests.

Clarification: parent accelerated result nil branchesfb8930->fb8d78 into an error
construction path, not demonstrated automatic ScreenCaptureKit fallback. These
are alternate upfront paths; exact selection predicate remains under audit. Do
not present the recovered SC configuration as fallback-on-failure behavior.
Current production screenshot has not switched to this configuration factory;
backend routing, capture invocation/cleanup and full native input remain incomplete.

## 2026-11-08 — SC capture uses system screenshot manager async bridge

Resolved signpost descriptor10122bf48->fbb8f0->fb5688. Bodyfb56c4 resolves actual
ObjC class SCScreenshotManager andfb5740 selector
captureImageWithFilter:configuration:completionHandler:. It passes prepared filter
and SCStreamConfiguration and awaits a throwing continuation. Completionfb581c
checks NSError first; error wins even if image exists, otherwise retains/resumes
with image; both absent traps. Current Capture.swift already calls the SDK async
SCScreenshotManager.captureImage(contentFilter:configuration:), so reuse that
system SDK rather than implementing a second callback bridge merely to duplicate
framework behavior. Filter/config construction, branch routing, surrounding logging,
state and encoding are separate remaining fidelity work; matching this one call
does not establish whole screenshot parity.

Pinned call/completion blocks; audit/whitespace passed, local log
/tmp/cua-sc-capture-sdk-route-audit.json. No product mutation or build necessary,
no real screenshot/input/model request. Actual native app acceptance and full
reconstruction remain incomplete.

## 2026-11-08 — offscreen selected window chooses accelerated route

Resolved selectorfb86dc as SCWindow.isOnScreen: a selected nonnil window with
false branchesfb86ec->fb8898. That branch captures windowID and frame and invokes
accelerated helperfb8920. An onscreen selected window later constructs
SCContentFilter.initWithDesktopIndependentWindow atfb8798. Source also has
cropToFirstWindow/first included-ID handling, display-including/excluding-window
filters and scale-dependent sizing; those full routes remain to reconstruct.
The accelerated path is therefore specifically an upfront offscreen selection
route here, not retry after SCScreenshotManager failure.

Material current gap: Capture.swift enumerates only onScreenWindowsOnly:true and
has no accelerated route. It cannot implement this original offscreen behavior.
Do not merely change enumeration to false while leaving filtering, pixel size and
failure handling unaligned. Next recover shareable-content acquisition and whole
window/display filter plan, then connect the already restored backend wrappers.
Pins/audit/whitespace passed (/tmp/cua-offscreen-capture-routing-audit.json).
No build/product mutation or actual capture/input. Full native acceptance pending.

## 2026-11-08 — screenshot single-window selection

Recoveredfb8340..fb84bc selects a single window only for exactly one included
windowID, using first match in shareable content. Missing explicitID returns nil,
never app-name fallback. Multiple IDs (including duplicates) skip single-window
selection and leave later display/crop routing to the parent. Only absent/empty
IDs use optional app-name matcherfb763c; nil app name performs no selection.
Added selectScreenshotWindow with controlled nil/empty/single-missing/multiple/
duplicate cases and lazy window/app callback checks. App-name matching body and
shareable-content acquisition are separate pending functions, not invented here.
Initial test build needed an explicit [Int] fixture type for generic ID conversion.
Native branch range pinned. Next acquisition descriptor10122bf30 resolvesfbb848.

Final build/provider/static/whitespace passed; /tmp/cua-screenshot-window-selection-*.
No user screen capture/input/model request. Concrete shareable-content/filter
routing, production integration and full native app acceptance remain incomplete.

## 2026-11-08 — shareable-content scope policy recovered

Descriptor10122bf30->fbb848->fb4a78 selects three actual SCShareableContent APIs.
Current-process flag true with macOS14.4 availability uses
getCurrentProcessShareableContentWithCompletionHandler; unsupported OS requests
getShareableContentWithCompletionHandler (all). Normal mode with nil included IDs
uses excludingDesktopWindows:true/onScreenWindowsOnly:true. Present ID list first
queries CGWindowListCreate options0x11, thenfb49d8 tests every requested ID is in
visible IDs; all present (including vacuous empty list) uses onscreen optimized
API, any missing requests all content, allowing offscreen IDs to be found.

Restored screenshotContentScope policy, with lazy reads and controlled OS/flag,
nil/empty/duplicates/partly absent cases. No forced onscreenOnly=false blanket
change: source deliberately optimizes only when it can. SDK callback orchestration
and originating current-process flag still need binding. Original predicate and
API argument blocks pinned. Build/provider/static/whitespace passed:
/tmp/cua-screenshot-content-scope-*. No actual screen enumeration/capture/input
or model requests. Production routing/full native acceptance remain incomplete.

## 2026-11-08 — concrete shareable-content SDK acquisition

Added screenshotShareableContent composing recovered scope policy with actual
SCShareableContent.currentProcess (macOS14.4+), excludingDesktopWindows(true,
onScreenWindowsOnly:true), and current SDK async APIs. Verified names/availability
from installed SCShareableContent.h rather than guessing callback wrappers.
Visible-ID query reuses existing onScreenMouseWindowIDs, which matches source
CGWindowListCreate0x11/relative0 and missing-list empty behavior. Current-process
selection uses runtime availability and avoids that visibility query.

Injected acquisition tests yield asynchronously, preserve selected scope/content,
and propagate the original error without retrying another scope. They do not
invoke system content enumeration. Concrete adapter is not yet used by production
Capture.swift: selected window/filter/geometry/accelerated branch must be composed
before replacing that path.

Build/provider/static/whitespace actually passed; /tmp/cua-screenshot-content-acquisition-*.
No real screen enumeration/capture/input/model requests. Full backend/state
production integration and actual native application acceptance remain unfinished.

## 2026-11-08 — app-name screenshot matcher evidence

Read fb763c through fb7bfc and its matcher fb723c through fb7638 without
running the vendor service. Candidate construction first filters isOnScreen,
then extracts owning-app data and window IDs/title. After fb7a70 calls fb723c,
the chosen record ID is resolved by a fresh traversal of content.windows;
first equal windowID wins, no surviving ID produces nil. This is distinct
from explicit-ID selection, which must not inherit app-name fallback.

Imported stubs prove 101150888 is String.lowercased and 101151da0 is
Foundation.trimmingCharacters(in:), not regex replacement. fbb808 is a
witness-table accessor, not a regex factory. Matcher normalizes requested
name, searches records with nonnil app names for normalized equality first;
a second traversal calls String.hasPrefix (101150b34), with request as
receiver and normalized candidate app name as prefix argument. Exact-match
pass therefore takes precedence over a preceding prefix candidate. The
CharacterSet factory and remaining matcher tail still need verification
before a concrete implementation is added; do not infer arbitrary fuzzy
matching or implement startsWith in the opposite direction.

Added whole-function SHA256 pins for these two source ranges. This evidence
changes the next implementation step; no production screenshot behavior
changed and no real screen capture/input/model request was performed.

## 2026-11-08 — complete app-name matcher restored

Resolved imported symbols: 10114dfa8 is CharacterSet.whitespacesAndNewlines;
1011509b4 is String.count; 101151e18 is Foundation StringProtocol.contains.
The full matcher has THREE passes, completing the previous partial evidence:
first normalized exact equality; then requested.hasPrefix(normalizedCandidate);
then, only when normalized requested.count >= 4, lowercasedCandidate.contains(requested).
Third-pass candidate is not trimmed. Count is Swift Character count, not bytes.
All passes skip nil application names and preserve original record order.
Empty normalized candidate remains eligible (no invented empty-string guard).

Added ScreenshotAppNameMatcher.swift preserving those passes and source language.
Standalone controlled checks cover exact-over-prefix precedence, both prefix
orientations, substring length gate, Unicode character count, nil and empty names.
Run with swiftc on that file and reconstruction/screenshot-app-name-matcher-check.swift.
This is not yet wired to concrete SCWindow candidate construction or Capture.swift;
no real app input was sent. Whole-function source pins already cover all three passes.

## 2026-11-08 — concrete ScreenCaptureKit app-name adapter

Decoded Objective-C selectors at fb7860/fb787c/fb795c as owningApplication,
applicationName and title. Added ScreenshotAppWindow.swift with concrete
SCShareableContent/SCWindow integration: eagerly filter on-screen windows,
skip nil owningApplication and empty normalized applicationName, retain ID,
normalized name and optional title, run the recovered three-pass matcher,
then freshly search content.windows for the first selected ID. This adapter
preserves the app-name route's on-screen filtering, which must not be confused
with explicit-ID capture supporting off-screen selection.

Swift build completed (22.46s), provider-click-self-test exited 0, static
source audit and git diff --check passed. Logs /tmp/cua-concrete-app-window-*.
The new adapter compiles against the actual SDK; it was not exercised on
user windows. Production Capture.swift still awaits complete filter/backend
routing integration. No actual screen capture/input/model request was sent.

## 2026-11-08 — concrete single-window selection composition

Added selectScreenshotWindow(in: SCShareableContent, includedWindowIDs:appName:)
composing the audited generic selector with the concrete app-name adapter.
Exactly-one-ID path uses all content windows (including offscreen when acquired);
nil/empty ID path invokes on-screen app matching. Missing explicit IDs and
multiple IDs remain nil, without implicit fallback. This deliberately returns
selection rather than manufacturing a capture plan for nil.

Read subsequent fb84bc..fb8804: source builds ID/window mapping before the
selected-window on-screen branch. Crop-to-first-window has an additional
first-included-ID lookup and an offscreen target at fb9274; display filter
branch starts fb8b64. Those must be recovered before production replacement.
Do not flatten crop-to-first into the single-window selection rule.

Build completed (27.02s), provider self-test, static audit and diff check passed;
/tmp/cua-selection-composition-*. No actual capture or application input.

## 2026-11-08 — screenshot display selection restored

Read fb8b64..fb8d78 and fb8f34..fb9274. Present-ID display route compact-maps
requested IDs to windows before selecting a display; crop-to-first may use the
first requested window frame, otherwise selected-window frames are unioned.
Display choice fb912c..fb9270 compares intersection width*height pairwise,
re-reading incumbent and candidate frames each time. Strictly greater overlap
replaces incumbent; equal/unordered areas keep first. Zero overlap does not
return nil when displays exist. This differs operationally from the eager
area materialization used by NSScreen.bestScreen, so no incorrect helper reuse.

Added generic screenshotDisplay preserving lazy frame reads and pairwise order,
plus standalone checks for largest overlap, equal/zero overlap, empty list and
single-display no-frame-read behavior. swiftc/controlled checks passed; source
block SHA256 pin, full static audit and diff check passed. This turn did not run
a full helper build or actual capture/input. Concrete filter creation, crop
coordinates and remaining continuation still pending production integration.

## 2026-11-08 — display inclusion filter and local crop coordinates

Decoded fb8ff4 selector as initWithDisplay:excludingWindows: (no-ID route
passes empty windows), fb9394 as initWithDisplay:includingWindows:.
The inclusion branch fb9324 subtracts selected display.frame origin using
CGRectOffset, preserving region size without intersecting display bounds or
flipping Y. Width/height are read from the original region. Added concrete
screenshotDisplayFilter and pure screenshotDisplaySourceRect with those SDK
calls and translation. This is still a component, not complete capture orchestration.

Standalone crop checks passed for a negative-origin secondary display and a
region extending outside display bounds; full helper build passed, static
source pin/audit and diff check passed. Logs /tmp/cua-display-filter-*.
No actual content-filter capture or application input; production replacement
and end-to-end native operation acceptance remain unfinished.

## 2026-11-08 — included-window crop/union region

Restored screenshotWindowRegion from fb8ca4..fb8d10 and fb9058..fb912c:
crop-to-first uses the first requested ID's mapped window frame. If that ID
is absent, it falls back to unioning resolved included windows, not cropping
to the first surviving window. No-crop also unions frames in resolved order,
starting CGRect.null; no resolved windows leaves null. Pairwise display
selection follows this computed region. Offscreen-first shortcut remains a
separate earlier branch and is not implemented by this region helper.

Standalone swiftc checks passed for crop, missing first ID, union order and
empty region. Added raw source pins; static audit and diff check passed.
No full helper build or actual capture/input this turn. Component composition
into complete backend/filter orchestration and production acceptance remain
pending; no claim of native app clicking fixed.

## 2026-11-08 — offscreen target priority and capture arguments

Read fb8898..fb895c and branch fb9274. Selected offscreen window takes priority;
otherwise crop-to-first checks only first included ID, not later surviving IDs.
Added screenshotOffscreenTarget to preserve order and nil/no-crop behavior.
Selected-window branch constructs [selected.windowID] then captures frame.
Crop-first offscreen branch enters at fb88e4, bypassing array construction:
it preserves the original included-ID array while using first window frame.
Do not replace both paths with single-ID capture. Image optional sizing and
post-capture handling fb8e60->fb5490 still need audit before orchestration.

Standalone Swift checks passed for priority, selected-onscreen then first-ID,
missing first ID without later-ID search, no crop and empty IDs. Source block
pins/static audit passed. No actual SPI call/input or full build this turn.
Production capture integration and native application acceptance incomplete.

## 2026-11-08 — screenshot CGImage resizing

Recovered fb5490..fb563c: colorSpace must exist before equal-size shortcut;
equal requested dimensions retain original image. Otherwise Swift Int(size)
truncates toward zero (nonfinite/out-of-range traps), CGContext uses image
bitsPerComponent/colorSpace/bitmapInfo with automatic row bytes, interpolation
raw3/high, draws into integer-sized zero-origin rect, returns makeImage optional.
No ceil, cap, pixel-format replacement or aspect-ratio preservation is added.

Added resizedScreenshotImage and actual in-memory CoreGraphics fixture checks:
identity for equal size, 2.9x3.8 -> 2x3, original component/bitmap format.
Standalone compilation/checks, source SHA256 audit and diff check passed.
No full build or user screenshot/input. Offscreen caller preserves original
image when optional resizing yields nil; caller's optional-size flag provenance
still needs composition audit before production use.

## 2026-11-08 — optional offscreen resize continuation

Public named captureScreenshotBuffer signature and fb381c wrapper pass imageSize
in x4/x5 plus optional discriminator w6. fb7d08 stores those to async frame
0x48/0x50/0x13a. fb8934 bypasses resize for absent size; present size loads
0x48/0x50 into fb5490. fb8e7c preserves captured image when resize returns nil,
otherwise replaces image. It does not retry capture or synthesize an empty image.
Added finishOffscreenScreenshot generic orchestration and CGImage overload.
Extended controlled checks for absent-size no-call, nil resize fallback and
successful replacement; standalone Swift checks passed. Added source pins,
static audit/diff check passed. Full production orchestration and actual app
click acceptance remain pending; no real capture/input/model call this turn.

## 2026-11-08 — offscreen ID/rectangle plan

Added ScreenshotOffscreenPlan so the selected-window and crop-first routes
retain different ID construction without relying on generic window identity.
Selected offscreen path reads visibility, builds singleton from windowID, then
reads frame. Crop-first path preserves full included IDs and duplicates and
reads first mapped window frame without fetching its windowID. The plan is
not itself a successful capture or production backend switch.

Controlled tests verify IDs, rectangle and getter order for both branches,
plus no-crop nil. Standalone checks passed; full helper build passed (16.37s),
static audit and diff check passed. /tmp/cua-offscreen-plan-*.
No real WindowServer invocation or user input. Execution/error composition,
whole screenshot pipeline and native acceptance remain incomplete.

## 2026-11-08 — composed offscreen capture execution

Added captureOffscreenScreenshot(plan:imageSize:) composing existing WindowServer
capture wrapper with recovered optional resize continuation. Generic injection
checks preserve duplicate IDs/negative-origin rect; capture nil prevents resize,
resize nil retains captured image, absent requested size skips resize. Capture
failure stays nil for outer source error construction, never implicit alternate
backend retry. Concrete overload compiles against the real wrapper.

Controlled standalone test uses reconstruction/fixtures/offscreen-capture-spi-trap.swift
in place of the SPI overload, which traps if accidentally selected; it is not a
real SPI acceptance test. Compile with ScreenshotOffscreenPlan.swift,
ScreenshotImageResize.swift, OffscreenScreenshotCapture.swift and
reconstruction/offscreen-screenshot-capture-check.swift. Checks passed, full
helper build passed (15.63s), static audit/diff check passed. No actual capture
or application input. Whole pipeline and production adoption remain pending.

## 2026-11-08 — capture-size/configuration composition

Recovered fb8874..fb895c: absent imageSize reads filter.pointPixelScale Float,
promotes to Double/CGFloat and multiplies base width/height; present size
bypasses scale getter entirely, including invalid explicit sizes. Result goes
through existing ceil/checked screenshotPixelDimensions; source invalid branch
constructs an error rather than selecting a new size. Added screenshotCaptureSize
and concrete optional screenshotStreamConfiguration(filter:baseSize:imageSize:...)
composition. Invalid dimensions stay nil for outer error handling.

Controlled standalone checks passed for explicit invalid-size passthrough/lazy
scale, fractional scale and ceil composition. Full build passed (31.56s), static
source pin/audit and diff check passed. /tmp/cua-capture-size-*.
This is configuration composition, not actual SC screenshot acquisition or
production Target adoption; no real capture/input/model call this turn.

## 2026-11-08 — ScreenCaptureKit result is not resized again

Read fb94a8..fb95a8: post-signpost completion branches on async error to fb9754;
success fb9510 releases filter/config/content/window owners and loads captured
image from frame0x28 directly. It does not call offscreen resize helper fb5490.
Therefore do not share finishOffscreenScreenshot across both backends: SC output
size is already configured before capture, whereas WindowServer image may need
explicit resize afterward. SDK async capture is already used in Capture.swift;
no custom callback shim is needed just to mimic Swift's compiled continuation.
Added source block pin/static audit; diff check passed. No production behavior
change, build or real screenshot/input. Error continuation and complete filter
orchestration remain next integration work.

## 2026-11-08 — SC capture execution and error propagation

Read fb9754..fb9820: failure continuation reloads original async error from
frame0x130 and returns it after owner/task cleanup; no alternative capture,
resize or error replacement. Added captureScreenScreenshot concrete SDK async
entry and generic configuration/capture composition. It invokes configuration
once, capture once, propagates original errors and directly returns captured
image. No custom SDK completion bridge or fallback logic introduced.

Controlled async checks passed for success/order, configuration error preventing
capture and identity-preserved capture error with no retry. Actual SDK overload
was compiled but not invoked. Full helper build passed (16.44s), static source
pin/audit and diff check passed; /tmp/cua-screen-capture-*.
Production Target screenshot routing/encoding/state adoption remains incomplete;
no actual screenshot/input/model request this turn.

## 2026-11-08 — single-window filter base-size source

Added screenshotSingleWindowFilter from fb8774..fb87f4: concrete desktop-independent
SCContentFilter, base width and height from separate SCWindow.frame reads,
sourceRect nil (leave SDK default). This is distinct from production Capture.swift,
which currently sizes from filter.contentRect. Controlled dynamic frame getter
check preserves width from first read/height from second; no frame caching or
contentRect substitution. Next composition can feed this base size through
screenshotStreamConfiguration's explicit/derived pixel sizing.

Standalone Swift check passed; actual SDK filter construction compiled but not
invoked on user windows. Full build passed (15.58s), source pin/audit and diff
check passed. /tmp/cua-single-window-filter-*. No real capture/input. Production
adoption/state consistency and native operation acceptance remain incomplete.

## 2026-11-08 — no-ID full-display filter

Added screenshotFullDisplayFilter from fb8fc4..fb9054: use supplied first
SCDisplay with excludingWindows:[], width/height from SCDisplay integer
properties promoted to CGFloat, sourceRect nil. Selectors at fb9020/fb9034
were decoded as width/height. Although SDK dimensions describe pixels, source
still rejoins absent-size pointPixelScale path; do not silently divide them
by scale. Caller first-display absence/error behavior remains to compose.
Renamed inclusion-filter tuple's size field to baseSize for consistent
configuration composition; no callers existed to migrate.

Full helper build passed (21.43s), source pin/audit and diff check passed.
/tmp/cua-full-display-filter-*. Actual SDK filter creation/capture not invoked;
no additional runtime test claim. Full production routing/state integration and
native application operation acceptance remain incomplete.

## 2026-11-08 — display inventory re-read fallback

Read fb92ac..fb9324 and fb940c..fb9480. Initially empty displays constructs
screenshot error with payload zeros/tag1 at fb944c..fb9454; invalid dimensions
previously used size payload/tag0. Exact source enum names remain unproven.
In inclusion route an initial first display is retained at fb8c94. After region
calculation, displays is queried again; if that second list is empty, fb930c
uses retained initial display. Therefore generic empty-list nil alone is not
the complete orchestration rule.

Added screenshotDisplay overload preserving initial-display fallback with a
lazy re-read. Controlled checks cover empty second inventory and replacement
by actual overlap winner; standalone Swift checks passed. Source pins/static
audit/diff check passed. No full build/actual display query or capture/input.
Concrete whole-route composition and production acceptance remain incomplete.

## 2026-11-08 — prioritize real click reproduction

After user correction, ran current scripts/test-native-indexed-click.py
--allow-owned-ui. It stopped at desktop-preflight with DESKTOP_LOCKED,
cases=[], no helper/app input. Reports local-only:
artifacts/debug/native-indexed-click-20261108T144337Z-ce372ad9.json and,
after instrumentation change, native-indexed-click-20261108T144354Z-e5318409.json.
This is a failed prerequisite, not reproduction/root cause of previous
unlocked-desktop clicking failure and not a pass.

Instrumented the owned-fixture request client with per-request ID, stage,
UTC start, elapsed milliseconds, completion/failure type and selected routing
metadata. Screenshot bytes/input text are excluded from the new trace. Python
syntax compilation and diff check passed; changed script still fails before
request execution under lock, so new live request trace remains unvalidated.
This script covers private NDJSON production helper methods, not complete
Sky/MCP/model integration. Next unlock-dependent gate is actual fixture state
change, then production Sky/MCP and finally DeepSeek. Do not continue broad
screenshot reconstruction as substitute for failure reproduction.

## 2026-11-08 — unlocked desktop actual verification

User confirmed unlocked desktop. Ran current owned fixture click script:
artifacts/debug/native-indexed-click-20261108T144740Z-5d298d9a.json.
Exit0, 4/4 foreground/background x element/image-coordinate cases observed
actual Saved marker through AX after synthetic mouse events. This covers current
private NDJSON helper, not arbitrary user apps, cursor visibility or model path.

Then ran CUA_NATIVE_DEEPSEEK_TEST=1 node --import tsx --test
reconstruction/native-deepseek-live.test.ts. Exit1, ~18 seconds. Local log
/tmp/cua-deepseek-live-verification.log. Model connected via MCP, opened owned
fixture, set text, initial combined setValue+click call errored with only app path
as error text; re-observation showed text set, subsequent click+observation showed
Saved marker and screenshot. No approval denial seen in this run. Final automated
independent assertion failed at line95: fixture not found by exact bundleId/path
in helper listApps. Thus tool-visible state change occurred, but complete test
is FAILED; inventory identity mismatch/root cause and first combined-call error
not established. Do not change matching assertions to turn red green without
capturing actual inventory/identity/process lifetime evidence. No implementation
fix or repeat model run in this verification-only turn.

## 2026-11-08 — bounded diagnosis after user authorized continuation

Added local native input log forwarding to model acceptance runtime, unique log
per verification, expected/candidate fixture identity diagnostics, canonical temp
root, independent verifier reconnect and PRIMARY_ACCEPTANCE_FAILURE logging.
Cleanup inventory errors no longer replace primary test errors. No assertion
relaxed. Diagnostic rerun confirmed inventory was stale (prior fixture returned)
and /tmp vs /private/tmp path representation differed. A speculative yielding
stdio poll change was built/tested then fully removed after follow-up timeout;
no accepted production fix is claimed for inventory freshness.

Most recent model run /tmp/cua-deepseek-verifier-reconnect.log failed with primary
120-second timeout during getApp. Local phase log stopped in bind-initial-windows.
Sample of this run's own helper PID23555 at
/tmp/cua-native-bind-hang.sample.txt shows registerAppControllerInitialWindows
loop/children decoding/cache construction. This is unlocked-desktop concrete
blocking evidence, unlike earlier lock prerequisite. Whether AX graph cycles,
repeated aliases or huge traversal is causing it is not yet proven. Do not add
arbitrary traversal cap or alter original duplicate semantics without diagnosis.

First combined setValue+click failure has a clear code-path candidate:
Target.action and SkyAppState.perform invalidate transport snapshot after action,
next perform requires snapshot or throws -10011 with only reference message.
No weakening/retry was added; source-compatible sequential action ownership
still needs correction/proof. Latest verification did not reach that action.

Current build and three Sky protocol checks passed before verifier-only edits;
full model acceptance remains FAILED. Four leaked fixture processes from this
session's exact recorded executable paths were terminated, no name-based kill.
No broad reconstruction resumed. User's original native-app failure unresolved.

## 2026-11-08 — no-model fixed reproduction and raw/provider graph diagnostic

Added --initial-window-graph-check --pid PID read-only diagnostic. Its finite
500-edge raw/100-provider limits apply only to diagnostics, not production.
Raw walk counts ancestor cycles; provider comparison records repeated AX identity
and child-array mismatches. On owned direct fixture PID58714: raw8/provider8,
0 cycles,0 repeats,0 mismatches; cannot generalize to prior bundled launch hang.
Full helper build and diff check passed. No traversal algorithm change made.

Added opt-in reconstruction/native-sequential-actions-live.test.ts using exact
Rust/MCP/Swift deployment with fixed JS, no model. CUA_NATIVE_FIXED_TEST=1 run
failed reproducibly in 7.7 seconds: getApp returned expected fixture AX tree;
setValue(1,"fixed-marker") then click(2) returned isError with app path.
Thus model-service availability/reasoning not required for sequential failure.
Local /tmp/cua-fixed-native-repro.log plus per-run artifacts/debug/fixed-native-*.jsonl.
Test preserves failing assertion and does not retry rejected input. Cleanup uses
fresh helper/unique owned bundle only. Production snapshot ownership correction
and bundled-launch traversal hang remain unresolved; no repair claimed.

## 2026-11-08 — successful Sky actions retain checked continuation

Fixed the independent Sky/private-NDJSON bridge in SkyAppState.perform. Private
Target input still invalidates transport snapshots. Sky now retains published
AX ID identities only after a successful action. Next action can freshly collect
transport data without replacing published refetchable owner; element ID must
still refer to same AX object. Incomplete refresh, missing/changed identity,
policy denial, deadline failure and failed action do not retain continuation.
Captured screenshot remains invalid after action; no automatic input replay.
This is a repository adapter fix, not a claim to have recovered an identical
vendor function body or to support arbitrary changed render-ID mappings.

Fixed MCP reproduction changed from failing setValue+click to success in 9.2s,
actual Saved fixed-marker observed. Extended regression with unknown element
rejection followed by otherwise-valid click without observation; both reject,
proving failed action does not grant success continuation. Extended fixed test
passed in8.3s. Full Swift build passed before these test-only changes; diff check
passed. Logs /tmp/cua-fixed-native-after-state-fix.log and
/tmp/cua-fixed-native-success-failure-regression.log. No model request this turn.
Intermittent initial-window traversal hang and full DeepSeek acceptance pending.

## 2026-11-08 — bounded cost stage and interruptible initialization

User asked to continue but emphasized cost/time. Committed to maximum30-minute
stage, no unrelated reconstruction/model retries, no all-project completion ETA.
Read-only desktop state now screenLocked=true/frontmostIsLoginWindow=true.
This does not establish previous unlocked bind hang's cause.

Production initial-window traversal previously checked desktop only before bind;
added host checkpoint before primary lookup and each FIFO iteration. Production
checkpoint checks Task cancellation and requireUnlockedNativeDesktop, throwing
rather than publishing partial initialization as success. Default nonthrowing
original-order wrapper retained; no visited-set, duplicate removal, depth/count
limit or retry was added. This is host interruption integration, not a recovered
vendor algorithm change, and cannot interrupt an AX syscall already blocked.

Initial compile exposed Swift throwing-default behavior; replaced default with
explicit nonthrowing overload, then recompiled. Standalone cyclic fixture proves
checkpoint interruption and duplicate FIFO order preservation; full build passed
32.72s, provider-click-self-test passed, diff check passed. Actual unlock->lock
transition during bind unverified; real operations not attempted while locked.
No model requests this turn. Binding root cause/full model acceptance incomplete.

## 2026-11-08 — unlocked regression, one model run, second-capture isolation

Desktop check frontmostIsLoginWindow=false/screenLocked=null (not explicit false).
Fixed MCP sequential-action+failed-action regression passed8.5s. One DeepSeek
run /tmp/cua-unlocked-deepseek-final.log executed combined setValue+click+AX
successfully, returned Saved marker, screenshot and summary. Full test exit1
~44.5s in independent verifier timeout, so not reported as passed.

Fixed no-model verifier checks isolated this timeout: fresh verifier bind+observe
passes; bind+observeWithScreenshot fails. Added opt-in subphase logs to existing
Capture.swift (no routing changes). Window enumeration completed65ms; trace
stops screenshot-sdk-capture. This is a separate second-process SC capture
problem, not the earlier initial-window traversal sample. No proof of root cause.

Acceptance test now uses independent AX state verification, while retaining
real MCP image PNG/header/dimension checks. It no longer duplicates capture from
a second helper. This changes verification scope; it does NOT fix or certify
second-helper screenshots. Kept failing second-capture reproduction opt-in:
CUA_NATIVE_FIXED_TEST=1 CUA_VERIFY_SECOND_CAPTURE=1 node --import tsx --test
reconstruction/native-sequential-actions-live.test.ts. Default fixed path with
independent AX and failure-invalidation checks passed8.2s. Changed model test
not rerun (one-model-request-run commitment). Full model automated pass pending.
Full helper build after phase instrumentation passed22.99s, diff check passed.
No unrelated reconstruction. Remaining failure is specifically second-process
SCScreenshotManager callback/return, plus historical intermittent binding scope.

## 2026-11-10 — dynamic-app snapshot failures and descriptive context errors

Read four actual user-run JSONLs20:36..20:45 CST and native-input.jsonl. Tool
errors5/8,1/6,2/22,12/34. First run focused-context failure5 times; later runs
stale-tree/data checks and six screenshot-postcheck errors in last run. Latest
file has no terminal record; not proof of crash. Approvals82 all accept. No
model request or user-app operation performed during this repair.

Fixed host snapshot adapter for indexed actions: require fresh complete collect,
find target by retained AX identity, compare target data excluding transport IDs,
and verify ancestor AX identity/role/frame/enabled chain. Do not require unrelated
sibling count/text equality. Target changes/replacement/geometry remain rejected;
coordinate-only path retains full snapshot validation and screenshot bounds.
Standalone checks cover unrelated sibling changes/additions and transport-ID
renumbering allowed; target text/frame/replacement and ancestor movement rejected.
This is an authored host adapter repair, not recovered vendor function parity.

Screenshot postcheck no longer discards a valid image solely for dynamic AX.
When AX changed but collection complete, revoke capturedWindow, refresh/publish
AX, return image with coordinateInputAvailable=false and explicit text explaining
AX was refreshed after the image. No coordinates authorized from such image.
Stable capture retains coordinate availability; incomplete/failed refresh still
fails. Unit checks verify stable path no refresh, changed path revocation before
refresh, and error propagation with no stale return. No claim of atomic image/AX.

FocusedUIElementContext.Error now exposes descriptive cases through SkyIPC,
instead of generic NSError error2; no automatic application activation/fallback.
Owned fixture adds opt-in CoreFixtureDynamicUpdates label every30ms, fixed MCP
test CUA_FIXED_DYNAMIC=1 checks successful indexed input and coordinate rejection
for dynamic capture. This live test attempted but FAILED at bind due locked
screen; no real dynamic-app validation or application input completed.

Final build21.72s passed, target/screenshot standalone checks passed,
provider-click-self-test passed, Sky protocol3/3 passed, Sky error projection1/1
passed, diff check passed. Initial compile error (throw inside nonthrowing RPC
handler) was corrected to return error envelope before final build.
Logs /tmp/cua-dynamic-*. Changes need unlocked dynamic fixture + actual Multica
acceptance before claiming the user-visible issue fixed. No DeepSeek requests.
