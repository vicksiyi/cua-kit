import Foundation
import ApplicationServices

// Independent page-distance policy. The installed native implementation is opaque.
// One page is the observed scroll viewport's extent along the chosen axis.
func scrollEvents(point: CGPoint, viewport: CGRect, direction: String, pages: Double) throws -> [CGEvent] {
    let vertical: Bool, sign: Double
    switch direction {
    case "up", "u": vertical = true; sign = 1
    case "down", "d": vertical = true; sign = -1
    case "left", "l": vertical = false; sign = 1
    case "right", "r": vertical = false; sign = -1
    default: throw fail("INVALID_ARGUMENT", "Unknown scroll direction.")
    }
    let extent = vertical ? viewport.height : viewport.width
    let distance = Double(extent) * pages
    guard point.x.isFinite, point.y.isFinite, extent.isFinite, extent > 0,
          pages.isFinite, pages > 0, distance.isFinite, distance >= 0.5, distance <= 100000 else {
        throw fail("INVALID_ARGUMENT", "Scroll distance must round to 1..100000 units in the observed viewport.")
    }
    guard let source = CGEventSource(stateID:.privateState) else { throw fail("PROVIDER_DISCONNECTED","Cannot create scroll source.") }
    var remaining = Int(distance.rounded()), events: [CGEvent] = []
    // Apple warns that large single-wheel values may produce unexpected results.
    while remaining > 0 {
        let amount = min(remaining,10)
        let delta = Int32(Double(amount) * sign)
        guard let event = CGEvent(scrollWheelEvent2Source:source,units:.pixel,wheelCount:2,
                                  wheel1:vertical ? delta : 0,wheel2:vertical ? 0 : delta,wheel3:0) else {
            throw fail("PROVIDER_DISCONNECTED","Cannot allocate scroll event.")
        }
        event.location = point
        events.append(event); remaining -= amount
    }
    return events
}
extension Target {
    func scrollViewport(_ params: [String: Any], point: CGPoint) throws -> CGRect {
        // For indexed input follow its observed ancestry, avoiding an unrelated
        // overlapping scroll view. Coordinate input uses the smallest containing view.
        if let id = params["elementId"] as? Int {
            var next: Int? = id
            var visited = Set<Int>()
            while let index = next, index > 0, index <= nodes.count, visited.insert(index).inserted {
                let node = nodes[index-1]
                if let role = node.data["role"] as? String, ["AXScrollArea","AXWindow"].contains(role),
                   let frame = axElementFrame(node.element), frame.contains(point) { return frame }
                next = node.data["parentId"] as? Int
            }
        } else {
            guard let capture = capturedWindow, capture.snapshotId == snapshot else {
                throw fail("STALE_OBSERVATION","Scroll requires the current screenshot.")
            }
            let areas = nodes.compactMap { node -> CGRect? in
                guard node.data["role"] as? String == "AXScrollArea", let frame = axElementFrame(node.element), frame.contains(point) else { return nil }
                var parent = node.data["parentId"] as? Int
                var visited = Set<Int>()
                while let id = parent, id > 0, id <= nodes.count, visited.insert(id).inserted {
                    let ancestor = nodes[id-1]
                    if ancestor.data["role"] as? String == "AXWindow" {
                        // A different overlapping window must not supply the page extent.
                        guard let windowFrame = axElementFrame(ancestor.element), windowFrame == capture.frame else { return nil }
                        return frame
                    }
                    parent = ancestor.data["parentId"] as? Int
                }
                return nil
            }.sorted { $0.width * $0.height < $1.width * $1.height }
            if let first = areas.first {
                guard areas.count < 2 || first.width * first.height != areas[1].width * areas[1].height else {
                    throw fail("AMBIGUOUS_TARGET","Overlapping scroll viewports require an indexed target.")
                }
                return first
            }
            if let capture = capturedWindow, capture.snapshotId == snapshot { return capture.contentRect }
        }
        throw fail("ELEMENT_NOT_INTERACTABLE","No observed scroll viewport or window contains the target.")
    }
    func scrollInput(_ params: [String: Any]) async throws -> [String: Any] {
        let point = try await observedInputPoint(params)
        let viewport = try scrollViewport(params,point:point)
        let events = try scrollEvents(point:point,viewport:viewport,direction:params["direction"] as? String ?? "",pages:params["pages"] as? Double ?? 1)
        try validateSnapshot(params)
        defer { invalidateInputState() }
        for event in events {
            try validateIdentity()
            if let deadline = params["deadlineUnixMilliseconds"] as? Double,
               Date().timeIntervalSince1970 * 1000 >= deadline {
                throw fail("INVALID_ARGUMENT", "Scroll deadline expired; earlier wheel events may have been dispatched.")
            }
            event.postToPid(app.processIdentifier)
        }
        return ["outcome":"dispatched","eventCount":events.count]
    }
}
