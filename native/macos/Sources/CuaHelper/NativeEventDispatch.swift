import AccessibilitySupport
import SystemSoftware
import CoreGraphics
import Dispatch

// SynthesizedEvent.send(to:delay:), 0x100753968..0x10075397c:
// obtain a fresh monotonic timestamp immediately before posting each event.
// This includes key-up/mouse-up events created before an awaited hold.
func dispatchNativeEvent(_ event: CGEvent, to pid: pid_t,
                         timestamp: () -> CGEventTimestamp = { DispatchTime.now().uptimeNanoseconds },
                         post: (CGEvent, pid_t) -> Void = { CGEventAPI.postToPid($0, pid: $1) }) {
    CGEventAPI.setTimestamp(event, timestamp: timestamp())
    post(event, pid)
}
