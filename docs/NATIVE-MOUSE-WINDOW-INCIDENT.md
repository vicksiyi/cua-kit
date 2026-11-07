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
