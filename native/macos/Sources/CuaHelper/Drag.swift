import AccessibilitySupport
import SystemSoftware
import Foundation
import ApplicationServices

struct DragEvents {
    let down: CGEvent
    let moves: [CGEvent]
    let up: CGEvent
    let window: MouseWindow?
}
func dragEvents(from: CGPoint, to: CGPoint, window: MouseWindow? = nil) throws -> DragEvents {
    guard [from.x,from.y,to.x,to.y].allSatisfy({$0.isFinite}) else {
        throw fail("INVALID_ARGUMENT", "Drag needs finite coordinates.")
    }
    let events = try SynthesizedEvent.click(at: from, andDragTo: to,
        mouseButton: .left, count: 1, flags: [], inWindow: window?.id,
        windowBounds: window?.frame, windowUsesFlippedCoordinates: window?.usesFlippedCoordinates ?? false).cgEvents
    return DragEvents(down: events[0], moves: Array(events[1...3]), up: events[4], window: window)
}
// Release at the last dispatched position even if waiting/identity checks fail.
// This handles cooperative cancellation; forced process termination cannot run defer.
@MainActor
func dispatchDrag(_ events: DragEvents, post: (CGEvent) -> Void,
                  validate: () throws -> Void,
                  wait: () async throws -> Void) async throws {
    try validate()
    post(events.down)
    var last = events.down.location
    defer {
        // Do not deliver cleanup to a reused PID or terminated application.
        if (try? validate()) != nil {
            CGEventAPI.setLocation(events.up, location: last)
            if let window = events.window { applyMouseWindow(window, to: events.up) }
            post(events.up)
        }
    }
    do {
        for event in events.moves {
            try await wait()
            try validate()
            post(event); last = event.location
        }
    } catch {
        throw fail("ACTION_OUTCOME_UNKNOWN","Drag interrupted after mouse-down; observe the application before retrying.")
    }
}
extension Target {
    func dragInput(_ params: [String: Any]) async throws -> [String: Any] {
        guard let fromX = params["fromX"] as? Double, let fromY = params["fromY"] as? Double,
              let toX = params["toX"] as? Double, let toY = params["toY"] as? Double,
              let capture = capturedWindow, capture.snapshotId == snapshot else {
            throw fail("STALE_OBSERVATION","Drag requires coordinates in the current screenshot.")
        }
        // Check both endpoints before any input, using the same capture transform.
        let to = try screenshotPoint(CGPoint(x:toX,y:toY),capture:capture)
        var start = params; start["x"] = fromX; start["y"] = fromY
        guard start["elementId"] == nil else { throw fail("INVALID_ARGUMENT","Drag takes screenshot coordinates only.") }
        let from = try await observedInputPoint(start)
        let events = try dragEvents(from: from, to: to, window: mouseWindow(params))
        try validateSnapshot(params)
        defer { invalidateInputState() }
        func checkDeadline() throws {
            if let deadline = params["deadlineUnixMilliseconds"] as? Double,
               Date().timeIntervalSince1970 * 1000 >= deadline {
                throw fail("INVALID_ARGUMENT", "Drag request deadline expired.")
            }
        }
        try checkDeadline()
        try await dispatchDrag(events,post:{dispatchNativeEvent($0, to: self.app.processIdentifier)},validate:{try self.validateIdentity()},wait:{
            try checkDeadline()
            try await Task.sleep(nanoseconds:10_000_000)
            try checkDeadline()
        })
        return ["outcome":"dispatched","eventCount":events.moves.count+2]
    }
}
