import Foundation
import ApplicationServices

struct DragEvents {
    let down: CGEvent
    let moves: [CGEvent]
    let up: CGEvent
}
func dragEvents(from: CGPoint, to: CGPoint) throws -> DragEvents {
    guard [from.x,from.y,to.x,to.y].allSatisfy({$0.isFinite}),
          let source = CGEventSource(stateID:.privateState) else { throw fail("INVALID_ARGUMENT","Drag needs finite coordinates and an event source.") }
    func event(_ kind: CGEventType, _ point: CGPoint) throws -> CGEvent {
        guard let value = CGEvent(mouseEventSource:source,mouseType:kind,mouseCursorPosition:point,mouseButton:.left) else {
            throw fail("PROVIDER_DISCONNECTED","Cannot allocate drag event.")
        }
        value.setIntegerValueField(.mouseEventClickState,value:1)
        return value
    }
    var moves: [CGEvent] = []
    // Independent interpolation/timing policy; vendor native implementation is unavailable.
    for step in 1...20 {
        let fraction = Double(step)/20
        moves.append(try event(.leftMouseDragged,CGPoint(x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction)))
    }
    return try DragEvents(down:event(.leftMouseDown,from),moves:moves,up:event(.leftMouseUp,to))
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
        if (try? validate()) != nil { events.up.location = last; post(events.up) }
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
        let events = try dragEvents(from:from,to:to)
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
