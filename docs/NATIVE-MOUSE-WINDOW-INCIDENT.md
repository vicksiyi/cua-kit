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
