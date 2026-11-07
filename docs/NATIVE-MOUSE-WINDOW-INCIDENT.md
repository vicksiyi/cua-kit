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
