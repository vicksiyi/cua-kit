import Foundation
import ApplicationServices
import ScreenCaptureKit

struct CapturedWindow {
    let windowId: UInt32
    let frame: CGRect
    let contentRect: CGRect
    let pixelWidth: Int
    let pixelHeight: Int
    let scale: Double
    let snapshotId: String?
    let focus: AXUIElement?
}
func screenshotPoint(_ point: CGPoint, capture: CapturedWindow) throws -> CGPoint {
    guard point.x.isFinite, point.y.isFinite, point.x >= 0, point.y >= 0,
          capture.pixelWidth > 0, capture.pixelHeight > 0,
          point.x < CGFloat(capture.pixelWidth), point.y < CGFloat(capture.pixelHeight),
          [capture.contentRect.minX,capture.contentRect.minY,capture.contentRect.width,capture.contentRect.height].allSatisfy({$0.isFinite}),
          capture.contentRect.width > 0, capture.contentRect.height > 0 else { throw fail("INVALID_ARGUMENT","Point must be inside the observed screenshot.") }
    return CGPoint(x:capture.contentRect.minX + point.x * capture.contentRect.width / CGFloat(capture.pixelWidth),
                   y:capture.contentRect.minY + point.y * capture.contentRect.height / CGFloat(capture.pixelHeight))
}
func mouseModifiers(_ chord: String?) throws -> CGEventFlags {
    var flags = CGEventFlags()
    guard let chord = chord, !chord.isEmpty else { return flags }
    for key in chord.lowercased().split(separator:"+",omittingEmptySubsequences:false) {
        guard let modifier = modifierFlag(String(key)) else { throw fail("UNSUPPORTED_CAPABILITY","Mouse key chords currently support modifiers only.") }
        flags.formUnion(modifier)
    }
    return flags
}
func mouseClickEvents(point: CGPoint, button: String, count: Int, flags: CGEventFlags) throws -> [CGEvent] {
    guard point.x.isFinite, point.y.isFinite, (1...10).contains(count) else { throw fail("INVALID_ARGUMENT","Click count must be 1..10 and coordinates finite.") }
    let mouse: CGMouseButton, down: CGEventType, up: CGEventType
    switch button {
    case "left","l": mouse = .left; down = .leftMouseDown; up = .leftMouseUp
    case "right","r": mouse = .right; down = .rightMouseDown; up = .rightMouseUp
    case "middle","m": mouse = .center; down = .otherMouseDown; up = .otherMouseUp
    default: throw fail("INVALID_ARGUMENT","Unknown mouse button.")
    }
    guard let source = CGEventSource(stateID:.privateState) else { throw fail("PROVIDER_DISCONNECTED","Cannot create mouse source.") }
    var events: [CGEvent] = []
    for click in 1...count {
        for type in [down,up] {
            guard let event = CGEvent(mouseEventSource:source,mouseType:type,mouseCursorPosition:point,mouseButton:mouse) else { throw fail("PROVIDER_DISCONNECTED","Cannot allocate mouse event.") }
            event.flags = flags
            event.setIntegerValueField(.mouseEventClickState,value:Int64(click))
            events.append(event)
        }
    }
    return events
}
extension Target {
    func observedInputPoint(_ params: [String: Any]) async throws -> CGPoint {
        try validateSnapshot(params)
        let point: CGPoint
        if let id = params["elementId"] as? Int {
            guard params["x"] == nil, params["y"] == nil, id > 0, id <= nodes.count,
                  let frame = axElementFrame(nodes[id-1].element) else { throw fail("INVALID_ARGUMENT","Indexed click requires an element with valid geometry and no coordinates.") }
            point = CGPoint(x:frame.midX,y:frame.midY)
        } else {
            guard let x = params["x"] as? Double, let y = params["y"] as? Double,
                  let capture = capturedWindow, capture.snapshotId == snapshot else { throw fail("STALE_OBSERVATION","Coordinate click requires the current app screenshot.") }
            let current = try await captureWindows()
            guard let window = current.first(where: {$0.windowID == capture.windowId}), window.frame == capture.frame else { throw fail("STALE_OBSERVATION","Captured window moved or closed before click.") }
            let filter = SCContentFilter(desktopIndependentWindow:window)
            guard filter.contentRect == capture.contentRect, Double(filter.pointPixelScale) == capture.scale else { throw fail("STALE_OBSERVATION","Capture coordinates changed before click.") }
            if let focus = capture.focus {
                guard let currentFocus = try focusedCaptureWindow(), CFEqual(focus,currentFocus.element) else { throw fail("STALE_OBSERVATION","Focused window changed before click.") }
            }
            point = try screenshotPoint(CGPoint(x:x,y:y),capture:capture)
        }
        return point
    }
    func mouseInput(_ params: [String: Any]) async throws -> [String: Any] {
        let held = try heldNanoseconds(params["duration"] as? Double ?? 0)
        let point = try await observedInputPoint(params)
        let events = try mouseClickEvents(point:point,button:params["mouseButton"] as? String ?? "left",count:params["clickCount"] as? Int ?? 1,flags:mouseModifiers(params["key"] as? String))
        // Recheck after async window enumeration and before the first event.
        try validateSnapshot(params)
        defer { invalidateInputState() }
        for index in stride(from:0,to:events.count,by:2) {
            if let deadline = params["deadlineUnixMilliseconds"] as? Double,
               Date().timeIntervalSince1970 * 1000 + Double(held) / 1_000_000 >= deadline {
                throw fail("INVALID_ARGUMENT", "Click deadline expired before the next mouse-down; earlier clicks may have been dispatched.")
            }
            try await dispatchHeldPair(events[index],events[index+1],nanoseconds:held,post:{$0.postToPid(self.app.processIdentifier)},validate:{try self.validateIdentity()},wait:{try await Task.sleep(nanoseconds:$0)})
        }
        return ["outcome":"dispatched","eventCount":events.count]
    }
}
